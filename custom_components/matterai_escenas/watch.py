"""Avisar si algo quedó abierto o prendido (puertas, ventanas, aires, luces…).

Cada equipo vigilado tiene un «estado a vigilar» según su tipo (abierta,
prendido, desbloqueada…) y un tiempo. Si queda así ese tiempo y se cumple el
contexto elegido (siempre / sólo si no hay nadie / sólo de noche), avisa al
celular con botones. Opcionalmente repite el aviso y, si nadie hace nada,
lo apaga / cierra solo. Todo lo opcional se saltea si no está configurado.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import datetime, timedelta
from typing import Any

from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers.event import async_call_later, async_track_state_change_event
from homeassistant.util import dt as dt_util

from .notify import Notifier

_LOGGER = logging.getLogger(__name__)

UNAVAILABLE = ("unavailable", "unknown")

# dominio -> (estados «a vigilar», palabra para el aviso, servicio para arreglarlo)
WATCH_DOMAINS: dict[str, tuple[tuple[str, ...], str, str | None]] = {
    "binary_sensor": (("on",), "abierta", None),
    "cover": (("open", "opening"), "abierta", "cover.close_cover"),
    "lock": (("unlocked", "open", "opening"), "sin llave", "lock.lock"),
    "valve": (("open", "opening"), "abierta", "valve.close_valve"),
    "climate": (("heat", "cool", "heat_cool", "auto", "dry", "fan_only"), "prendido", "climate.turn_off"),
    "water_heater": (("on", "eco", "electric", "performance", "high_demand", "heat_pump", "gas"), "prendido", "water_heater.turn_off"),
    "light": (("on",), "prendida", "homeassistant.turn_off"),
    "switch": (("on",), "prendido", "homeassistant.turn_off"),
    "input_boolean": (("on",), "prendido", "homeassistant.turn_off"),
    "fan": (("on",), "prendido", "homeassistant.turn_off"),
    "humidifier": (("on",), "prendido", "homeassistant.turn_off"),
    "media_player": (("on", "playing", "paused", "idle"), "prendido", "media_player.turn_off"),
}
BS_WORDS = {
    "door": "abierta", "window": "abierta", "garage_door": "abierto", "opening": "abierto",
    "lock": "sin llave", "moisture": "con agua", "smoke": "con humo", "gas": "con gas",
}


def _f(value: Any, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _fmt_min(minutes: float) -> str:
    m = int(round(minutes))
    if m < 60:
        return f"{m} min"
    h, r = divmod(m, 60)
    return f"{h} h {r} min" if r else f"{h} h"


class WatchController:
    def __init__(self, hass: HomeAssistant, rule: dict[str, Any], on_change: Callable[[], None], manager=None) -> None:
        self.hass = hass
        self.rule = rule
        self.rule_id = rule["id"]
        u = rule.get("ui") or {}
        self.u = u
        self.items: list[dict[str, Any]] = [
            i for i in (u.get("items") or []) if isinstance(i, dict) and isinstance(i.get("entity"), str)
        ]
        self.notifier = Notifier(hass, self.rule_id, u.get("recipients"))
        self._since: dict[str, datetime] = {}
        self._ignored: set[str] = set()
        self._snooze_until: datetime | None = None
        self._alerting: list[str] = []
        self._repeats = 0
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

    def _bad(self, entity_id: str) -> bool:
        state = self.hass.states.get(entity_id)
        if state is None or state.state in UNAVAILABLE:
            return False
        bad_states = WATCH_DOMAINS.get(entity_id.split(".")[0], (("on",), "", None))[0]
        return state.state in bad_states

    def _word(self, entity_id: str) -> str:
        domain = entity_id.split(".")[0]
        state = self.hass.states.get(entity_id)
        dc = state.attributes.get("device_class") if state else None
        if domain == "binary_sensor":
            return BS_WORDS.get(dc, "activo")
        if domain == "cover" and dc in ("garage", "gate"):
            return "abierto"
        return WATCH_DOMAINS.get(domain, ((), "prendido", None))[1]

    def _name(self, entity_id: str) -> str:
        state = self.hass.states.get(entity_id)
        return (state.attributes.get("friendly_name") if state else None) or entity_id

    def _wait(self, entity_id: str) -> float:
        for item in self.items:
            if item["entity"] == entity_id:
                return _f(item.get("for_min"), 10) * 60
        return 600

    def _fixable(self, entity_ids: list[str]) -> list[str]:
        return [e for e in entity_ids if WATCH_DOMAINS.get(e.split(".")[0], ((), "", None))[2]]

    def _context_ok(self) -> bool:
        if self.u.get("only_away"):
            zone = self.hass.states.get("zone.home")
            people = (
                [self.hass.states.get(e) for e in self.hass.states.async_entity_ids("person")]
                if hasattr(self.hass.states, "async_entity_ids") else []
            )
            if zone is not None and zone.state not in UNAVAILABLE:
                if _f(zone.state, 0) > 0:
                    return False
            elif people:
                if any(p.state == "home" for p in people):
                    return False
            # sin personas configuradas: no se puede saber, se avisa igual
        if self.u.get("only_night"):
            sun = self.hass.states.get("sun.sun")
            if sun is not None and sun.state == "above_horizon":
                return False
        return True

    # ------------------------------------------------------------ ciclo de vida
    @callback
    def start(self) -> None:
        watch = {i["entity"] for i in self.items}
        if self.u.get("only_away"):
            watch.add("zone.home")
            if hasattr(self.hass.states, "async_entity_ids"):
                watch.update(self.hass.states.async_entity_ids("person"))
        if self.u.get("only_night"):
            watch.add("sun.sun")
        if watch:
            self._unsubs.append(async_track_state_change_event(self.hass, list(watch), self._event))
        now = dt_util.utcnow()
        for item in self.items:
            eid = item["entity"]
            if self._bad(eid):
                state = self.hass.states.get(eid)
                since = getattr(state, "last_changed", None) or now
                self._since[eid] = since
                self._timer(f"wait:{eid}", self._wait(eid) - (now - since).total_seconds(), self._check)

    @callback
    def stop(self) -> None:
        for unsub in self._unsubs:
            unsub()
        self._unsubs.clear()
        for name in list(self._timers):
            self._cancel(name)

    # ------------------------------------------------------------ eventos
    @callback
    def _event(self, event: Event) -> None:
        entity_id = event.data["entity_id"]
        if entity_id in ("zone.home", "sun.sun") or entity_id.startswith("person."):
            self._check()
            return
        if self._bad(entity_id):
            if entity_id not in self._since:
                self._since[entity_id] = dt_util.utcnow()
                self._timer(f"wait:{entity_id}", self._wait(entity_id), self._check)
        else:
            self._since.pop(entity_id, None)
            self._ignored.discard(entity_id)
            self._cancel(f"wait:{entity_id}")
            self._check()

    def _due(self) -> list[str]:
        now = dt_util.utcnow()
        return [
            e for e, since in self._since.items()
            if e not in self._ignored and (now - since).total_seconds() >= self._wait(e) - 1 and self._bad(e)
        ]

    def _check(self) -> None:
        due = self._due() if self._context_ok() else []
        if not due:
            if self._alerting:
                self._resolve()
            return
        if self._snooze_until and dt_util.utcnow() < self._snooze_until:
            return
        new = sorted(due) != sorted(self._alerting)
        self._alerting = due
        if new:
            self._repeats = 0
            self._alert()
            if self.u.get("auto_fix") and self._fixable(due):
                self._timer("autofix", _f(self.u.get("auto_fix_min"), 15) * 60, self._autofix)
        self._on_change()

    def _message(self, entities: list[str]) -> str:
        now = dt_util.utcnow()
        parts = []
        for e in entities:
            mins = (now - self._since.get(e, now)).total_seconds() / 60
            parts.append(f"• {self._name(e)}: {self._word(e)} hace {_fmt_min(mins)}")
        head = "Quedó así:" if len(entities) == 1 else "Quedaron así:"
        tail = ""
        if self.u.get("auto_fix") and self._fixable(entities):
            tail = f"\nSi no hacés nada, en {_fmt_min(_f(self.u.get('auto_fix_min'), 15))} lo apago / cierro."
        return head + "\n" + "\n".join(parts) + tail

    def _alert(self) -> None:
        entities = self._alerting
        actions: list[tuple[str, str]] = []
        if self._fixable(entities):
            actions.append(("fix", "Apagar / cerrar"))
        actions.append(("snooze", "Recordar en 30 min"))
        actions.append(("ignore", "Ignorar"))
        title = f"⚠ {self.rule.get('name') or 'Aviso'}"
        self.hass.async_create_task(
            self.notifier.send(title, self._message(entities), actions=actions, critical=bool(self.u.get("critical")))
        )
        repeat = _f(self.u.get("repeat_min"), 0)
        if repeat > 0 and self._repeats < int(_f(self.u.get("max_repeats"), 5)):
            self._timer("repeat", repeat * 60, self._repeat)

    def _repeat(self) -> None:
        if not self._alerting:
            return
        if self._snooze_until and dt_util.utcnow() < self._snooze_until:
            return
        self._alerting = [e for e in self._alerting if self._bad(e) and e not in self._ignored]
        if not self._alerting:
            self._resolve()
            return
        self._repeats += 1
        self._alert()

    def _fix(self, entities: list[str]) -> list[str]:
        fixed = []
        for e in self._fixable(entities):
            service = WATCH_DOMAINS[e.split(".")[0]][2]
            domain, _, svc = service.partition(".")
            self.hass.async_create_task(
                self.hass.services.async_call(domain, svc, {"entity_id": e}, blocking=False)
            )
            fixed.append(e)
        return fixed

    def _autofix(self) -> None:
        targets = [e for e in self._alerting if self._bad(e)]
        fixed = self._fix(targets)
        if fixed and self.u.get("notify_fixed", True):
            names = ", ".join(self._name(e) for e in fixed)
            self.hass.async_create_task(
                self.notifier.send(f"✅ {self.rule.get('name') or 'Aviso'}", f"Nadie respondió: apagué / cerré {names}.", tag="fixed")
            )

    def _resolve(self) -> None:
        self._alerting = []
        self._repeats = 0
        self._snooze_until = None
        self._cancel("repeat")
        self._cancel("autofix")
        self.hass.async_create_task(self.notifier.clear())
        self._on_change()

    # ------------------------------------------------------------ botones
    def on_action(self, action: str) -> None:
        if action == "fix":
            self._fix(self._alerting)
            self._cancel("autofix")
        elif action == "snooze":
            self._snooze_until = dt_util.utcnow() + timedelta(minutes=30)
            self._cancel("repeat")
            self._timer("snooze", 30 * 60, self._unsnooze)
        elif action == "ignore":
            self._ignored.update(self._alerting)
            self._cancel("autofix")
            self._resolve()

    def _unsnooze(self) -> None:
        self._snooze_until = None
        self._alerting = []  # se vuelve a avisar si sigue igual
        self._check()

    def as_dict(self) -> dict[str, Any]:
        return {"alerting": list(self._alerting)}
