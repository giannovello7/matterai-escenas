"""Clima inteligente: horarios con temperatura + ventanas + nadie en casa + habitación vacía.

Cada minuto (y ante cada cambio de un sensor) calcula qué debería estar
haciendo el aire: apagado o prendido a una temperatura. Sólo manda órdenes
cuando eso cambia, así no pelea con el usuario. Si alguien lo cambia a mano,
se respeta hasta el próximo horario. Las ventanas abiertas y «no hay nadie»
apagan igual (ahorro / seguridad). Todo lo opcional se saltea si no está.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import datetime
from typing import Any

from homeassistant.core import Context, Event, HomeAssistant, callback
from homeassistant.helpers.event import async_call_later, async_track_state_change_event
from homeassistant.util import dt as dt_util

from .notify import Notifier

_LOGGER = logging.getLogger(__name__)

UNAVAILABLE = ("unavailable", "unknown")


def _f(value: Any, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _hm(t: Any, default: int) -> int:
    try:
        h, m = str(t).split(":")
        return int(h) * 60 + int(m)
    except (TypeError, ValueError):
        return default


class ClimaController:
    def __init__(self, hass: HomeAssistant, rule: dict[str, Any], on_change: Callable[[], None], manager=None) -> None:
        self.hass = hass
        self.rule = rule
        self.rule_id = rule["id"]
        self.u = rule.get("ui") or {}
        self.notifier = Notifier(hass, self.rule_id, self.u.get("recipients"))
        self.entities: list[str] = [e for e in (self.u.get("entities") or []) if isinstance(e, str)]
        self.windows: list[str] = [e for e in (self.u.get("windows") or []) if isinstance(e, str)]
        self.room: list[str] = [e for e in (self.u.get("room_motion") or []) if isinstance(e, str)]
        self.outdoor: str | None = self.u.get("outdoor") or None
        blocks = [b for b in (self.u.get("blocks") or []) if isinstance(b, dict) and b.get("from")]
        self.blocks = sorted(blocks, key=lambda b: _hm(b["from"], 0))
        self.reason = ""
        self.desired: tuple | None = None
        self._applied: tuple | None = None
        self._hold_block: int | None = None  # bloque en el que el usuario tomó el control
        self._window_open_at: datetime | None = None
        self._away_since: datetime | None = None
        self._ours: list[str] = []
        self._timers: dict[str, Callable[[], None]] = {}
        self._unsubs: list[Callable[[], None]] = []
        self._on_change = on_change

    # ------------------------------------------------------------ ayudantes
    def _timer(self, name: str, seconds: float, cb: Callable[[], None]) -> None:
        self._cancel(name)

        @callback
        def _fire(_now) -> None:
            self._timers.pop(name, None)
            cb()

        self._timers[name] = async_call_later(self.hass, max(0.0, seconds), _fire)

    def _cancel(self, name: str) -> None:
        unsub = self._timers.pop(name, None)
        if unsub:
            unsub()

    def _state(self, entity_id: str) -> str | None:
        st = self.hass.states.get(entity_id)
        return st.state if st else None

    def _season_mode(self) -> str:
        mode = self.u.get("mode", "cool")
        if mode != "season":
            return mode
        month = dt_util.now().month
        south = _f(getattr(self.hass.config, "latitude", -34), -34) < 0
        summer = month in (10, 11, 12, 1, 2, 3, 4) if south else month in (4, 5, 6, 7, 8, 9, 10)
        return "cool" if summer else "heat"

    def _block_index(self) -> int | None:
        if not self.blocks:
            return None
        now = dt_util.now()
        m = now.hour * 60 + now.minute
        idx = len(self.blocks) - 1  # antes del primero rige el último del día anterior
        for i, b in enumerate(self.blocks):
            if _hm(b["from"], 0) <= m:
                idx = i
        return idx

    def _outdoor_temp(self) -> float | None:
        if not self.outdoor:
            return None
        st = self.hass.states.get(self.outdoor)
        if st is None or st.state in UNAVAILABLE:
            return None
        if self.outdoor.startswith("weather."):
            v = st.attributes.get("temperature")
            return None if v is None else _f(v, 0)
        return _f(st.state, 0)

    # ------------------------------------------------------------ cálculo
    def _compute(self) -> tuple:
        """('off', motivo) o ('on', modo, temperatura, motivo)."""
        now = dt_util.utcnow()
        idx = self._block_index()
        if idx is None:
            return ("off", "sin horarios")
        block = self.blocks[idx]
        if not block.get("on", True):
            return ("off", "horario apagado")
        mode = self._season_mode()
        temp = _f(block.get("heat" if mode == "heat" else "cool"), 21 if mode == "heat" else 24)

        if self.windows:
            if any(self._state(w) == "on" for w in self.windows):
                self._window_open_at = self._window_open_at or now
                if (now - self._window_open_at).total_seconds() >= _f(self.u.get("window_delay"), 60):
                    return ("off", "ventana abierta")
            else:
                self._window_open_at = None

        if self.u.get("away_off"):
            zone = self.hass.states.get("zone.home")
            if zone is not None and zone.state not in UNAVAILABLE and _f(zone.state, 1) == 0:
                self._away_since = self._away_since or now
                if (now - self._away_since).total_seconds() >= _f(self.u.get("away_delay"), 10) * 60:
                    return ("off", "no hay nadie")
            else:
                self._away_since = None

        if self.room:
            quiet = float("inf")
            for e in self.room:
                st = self.hass.states.get(e)
                if st is None or st.state in UNAVAILABLE:
                    continue
                quiet = 0 if st.state == "on" else min(quiet, (now - st.last_changed).total_seconds())
            if quiet != float("inf") and quiet >= _f(self.u.get("room_empty_min"), 30) * 60:
                if self.u.get("room_action", "eco") == "off":
                    return ("off", "habitación vacía")
                temp = temp + 2 if mode == "cool" else temp - 2
                return ("on", mode, temp, "habitación vacía (ahorro)")

        out = self._outdoor_temp()
        if out is not None:
            if mode == "cool" and self.u.get("cool_min_out") not in (None, "") and out < _f(self.u.get("cool_min_out"), 26):
                return ("off", "afuera está fresco")
            if mode == "heat" and self.u.get("heat_max_out") not in (None, "") and out > _f(self.u.get("heat_max_out"), 18):
                return ("off", "afuera está templado")

        return ("on", mode, temp, "horario")

    # ------------------------------------------------------------ aplicar
    def _ctx(self) -> Context:
        ctx = Context()
        self._ours = [*self._ours[-40:], ctx.id]
        return ctx

    def _apply(self, desired: tuple) -> None:
        targets = [e for e in self.entities if self._state(e) not in (None, *UNAVAILABLE)]
        if not targets:
            return
        if desired[0] == "off":
            on = [e for e in targets if self._state(e) != "off"]
            if on:
                self.hass.async_create_task(self.hass.services.async_call(
                    "climate", "turn_off", {"entity_id": on}, blocking=False, context=self._ctx()))
        else:
            _, mode, temp, _r = desired
            self.hass.async_create_task(self.hass.services.async_call(
                "climate", "set_temperature", {"entity_id": targets, "temperature": temp, "hvac_mode": mode},
                blocking=False, context=self._ctx()))

    def _evaluate(self) -> None:
        desired = self._compute()
        self.desired = desired
        self.reason = desired[-1]
        idx = self._block_index()
        safety = desired[0] == "off" and desired[1] in ("ventana abierta", "no hay nadie")
        if self._hold_block is not None and self._hold_block != idx:
            self._hold_block = None  # empezó otro horario: se vuelve a la programación
        if self._hold_block is not None and not safety:
            self._on_change()
            return
        if desired != self._applied:
            prev = self._applied
            self._applied = desired
            self._apply(desired)
            if safety and self.u.get("notify_window") and (prev is None or prev[0] == "on"):
                msg = "Apagué el aire porque se abrió una ventana." if desired[1] == "ventana abierta" else "Apagué el aire porque no hay nadie en casa."
                self.hass.async_create_task(self.notifier.send(f"❄️ {self.rule.get('name') or 'Clima'}", msg, tag="safety"))
        self._on_change()

    # ------------------------------------------------------------ ciclo de vida
    @callback
    def start(self) -> None:
        watch = {*self.entities, *self.windows, *self.room}
        if self.u.get("away_off"):
            watch.add("zone.home")
        if self.outdoor:
            watch.add(self.outdoor)
        if watch:
            self._unsubs.append(async_track_state_change_event(self.hass, list(watch), self._event))
        self._tick()

    def _tick(self) -> None:
        self._evaluate()
        self._timer("tick", 60, self._tick)

    @callback
    def stop(self) -> None:
        for unsub in self._unsubs:
            unsub()
        self._unsubs.clear()
        for name in list(self._timers):
            self._cancel(name)

    @callback
    def _event(self, event: Event) -> None:
        entity_id = event.data["entity_id"]
        if entity_id in self.entities:
            ctx = event.context
            if ctx.id in self._ours or (ctx.parent_id and ctx.parent_id in self._ours):
                return
            old, new = event.data.get("old_state"), event.data.get("new_state")
            if old is None or new is None or new.state in UNAVAILABLE or old.state in UNAVAILABLE:
                return
            if old.state != new.state or old.attributes.get("temperature") != new.attributes.get("temperature"):
                # lo cambiaron a mano: respetarlo hasta el próximo horario
                if self.u.get("manual_hold", True):
                    self._hold_block = self._block_index()
                    self._on_change()
            return
        self._evaluate()

    def as_dict(self) -> dict[str, Any]:
        d = self.desired or ("off", "")
        safety = d[0] == "off" and d[1] in ("ventana abierta", "no hay nadie")
        manual = self._hold_block is not None and not safety
        return {
            "clima": "manual" if manual else d[0],
            "clima_temp": d[2] if d[0] == "on" else None,
            "clima_reason": "cambiado a mano" if manual else self.reason,
        }
