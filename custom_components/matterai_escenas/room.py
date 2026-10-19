"""Luz por presencia: movimiento + puerta + presencia (mmWave) en un ambiente.

Lógica «wasp in a box»: si la puerta se cierra y después se detecta movimiento
adentro, el ambiente queda ocupado («sellado») y la luz no se apaga aunque nadie
se mueva, hasta que se abra la puerta. Un sensor de presencia (mmWave) también
mantiene la luz mientras detecte a alguien.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import datetime, timedelta
from typing import Any

from homeassistant.const import STATE_ON
from homeassistant.core import Context, Event, HomeAssistant, callback
from homeassistant.helpers.event import async_call_later, async_track_state_change_event
from homeassistant.util import dt as dt_util

_LOGGER = logging.getLogger(__name__)

LIGHT_DOMAINS = {"light", "switch", "input_boolean", "fan"}
FAN_DOMAINS = {"fan", "switch", "input_boolean"}
FAR_FUTURE = timedelta(days=3650)


def _f(value: Any, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _minutes(t: str | None, default: int) -> int:
    try:
        h, m = str(t).split(":")
        return int(h) * 60 + int(m)
    except (TypeError, ValueError):
        return default


class RoomController:
    """Máquina de estados de un ambiente."""

    def __init__(self, hass: HomeAssistant, rule: dict[str, Any], on_change: Callable[[], None]) -> None:
        self.hass = hass
        self.rule = rule
        u = rule.get("ui") or {}
        self.u = u
        self.lights: list[str] = list(u.get("lights") or [])
        self.motion: list[str] = list(u.get("motion") or [])
        self.doors: list[str] = list(u.get("doors") or [])
        self.presence: list[str] = list(u.get("presence") or [])
        self.fan: str | None = u.get("fan") or None
        self.humidity: str | None = u.get("humidity") or None
        self.lux: str | None = u.get("lux") or None
        self.occupied = False
        self.sealed = False
        self.last_motion: datetime | None = None
        self._closed_at: datetime | None = None
        self._door_recent = False
        self._block_until: datetime | None = None
        self._fan_ours = False
        self._ours: list[str] = []
        # cambios de luz que hizo la automatización (por si el contexto llega perdido)
        self._expect: dict[str, tuple[str, datetime]] = {}
        # el sensor de luz mide también la lámpara: se usa la luz que había antes de prenderla
        self._ambient: float | None = None
        self._ambient_at: datetime | None = None
        self._light_off_at: datetime | None = None
        self.decisions: list[dict[str, str]] = []
        # aviso antes de apagar: la luz baja y, si nadie se mueve, se apaga
        self._warned: dict[str, int | None] = {}
        # brillo que tenía antes del aviso: la lámpara «recuerda» el 15% y hay que devolvérselo
        self._bri_before: dict[str, int] = {}
        self._timers: dict[str, Callable[[], None]] = {}
        self._unsubs: list[Callable[[], None]] = []
        self._on_change = on_change

    # ------------------------------------------------------------ ayudantes
    def _on(self, entity_id: str) -> bool:
        state = self.hass.states.get(entity_id)
        return bool(state and state.state == STATE_ON)

    def _any(self, entities: list[str]) -> bool:
        return any(self._on(e) for e in entities)

    def _activity(self) -> bool:
        return self._any(self.motion) or self._any(self.presence)

    def _doors_closed(self) -> bool:
        return bool(self.doors) and not self._any(self.doors)

    def _timer(self, name: str, seconds: float, cb: Callable[[Any], None]) -> None:
        self._cancel(name)

        @callback
        def _fire(_now) -> None:
            self._timers.pop(name, None)
            cb(_now)

        self._timers[name] = async_call_later(self.hass, max(0.0, seconds), _fire)

    def _cancel(self, name: str) -> None:
        unsub = self._timers.pop(name, None)
        if unsub:
            unsub()

    def _ctx(self) -> Context:
        ctx = Context()
        self._ours = [*self._ours[-40:], ctx.id]
        return ctx

    def _call(self, service: str, entity_id: str, data: dict | None = None) -> None:
        domain, _, svc = service.partition(".")
        if svc in ("turn_on", "turn_off") and entity_id in self.lights:
            self._expect[entity_id] = ("on" if svc == "turn_on" else "off", dt_util.utcnow() + timedelta(seconds=20))
        self.hass.async_create_task(
            self.hass.services.async_call(
                domain, svc, {"entity_id": entity_id, **(data or {})}, context=self._ctx()
            )
        )

    @property
    def timeout(self) -> float:
        return _f(self.u.get("timeout"), 5) * 60

    # ------------------------------------------------------------ ciclo de vida
    @callback
    def start(self) -> None:
        watch = {*self.motion, *self.doors, *self.presence, *self.lights}
        if self.humidity:
            watch.add(self.humidity)
        when = self.u.get("when", "always")
        if when == "lux" and self.lux:
            watch.add(self.lux)
        elif when == "sun":
            watch.add("sun.sun")
        self._was_dark = self._dark_reason()[0]
        if watch:
            self._unsubs.append(
                async_track_state_change_event(self.hass, list(watch), self._event)
            )
        if self._activity():
            self.occupied = True
            self.sealed = self._doors_closed()

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
        new = event.data.get("new_state")
        old = event.data.get("old_state")
        if new is None:
            return
        is_on = new.state == STATE_ON
        was_on = bool(old and old.state == STATE_ON)
        try:
            if entity_id in self.motion or entity_id in self.presence:
                if is_on and not was_on:
                    self._on_activity(entity_id in self.motion)
                elif was_on and not is_on:
                    self._on_quiet()
            elif entity_id in self.doors:
                if is_on and not was_on:
                    self._on_door_open()
                elif was_on and not is_on and self._doors_closed():
                    self._on_door_closed()
            elif entity_id in self.lights:
                self._on_light(event, new, old)
                if not any(self._on(e) for e in self.lights):
                    if was_on:
                        self._light_off_at = dt_util.utcnow()
            elif entity_id == self.humidity:
                self._check_humidity()
            if entity_id in (self.lux, "sun.sun"):
                self._on_light_level()
        except Exception:  # noqa: BLE001 - un sensor raro no debe romper el ambiente
            _LOGGER.exception("Error en «%s»", self.rule.get("name"))

    def _on_activity(self, is_motion: bool) -> None:
        now = dt_util.utcnow()
        if is_motion:
            self.last_motion = now
        self._door_recent = False
        self._cancel("off")
        self._cancel("release")
        if self._doors_closed():
            self.sealed = True
        self._set_occupied(True)
        if self._warned:
            self._unwarn()
            return
        self._lights_on()

    def _on_quiet(self) -> None:
        if self._activity():
            return
        if self.sealed:
            # sellado: sólo se libera si nadie se mueve durante mucho tiempo
            release = _f(self.u.get("sealed_max"), 60)
            if release > 0:
                self._timer("release", release * 60, self._release)
            return
        if self._door_recent:
            self._timer("off", _f(self.u.get("door_timeout"), 1) * 60, self._off_left)
        else:
            self._timer("off", self.timeout, self._off)

    def _release(self, _now) -> None:
        self.sealed = False
        self._changed()
        self._off(None)

    def _on_door_open(self) -> None:
        self.sealed = False
        self._door_recent = True
        self._cancel("seal_check")
        self._cancel("release")
        if self.u.get("on_door", True):
            self._set_occupied(True)
            self._lights_on("se abrió la puerta")
        if not self._activity():
            self._timer("off", max(_f(self.u.get("door_timeout"), 1) * 60, 60), self._off_left)
        self._changed()

    def _on_door_closed(self) -> None:
        self._closed_at = dt_util.utcnow()
        self._timer("seal_check", _f(self.u.get("seal_window"), 30), self._seal_check)

    def _seal_check(self, _now) -> None:
        moved_after = bool(self.last_motion and self._closed_at and self.last_motion > self._closed_at)
        if moved_after or self._activity():
            self.sealed = True
            self._cancel("off")
            self._set_occupied(True)
            if not self._activity():
                self._on_quiet()
            self._changed()
            return
        # se cerró la puerta y nadie se movió adentro: el ambiente quedó vacío
        self._timer("off", _f(self.u.get("door_timeout"), 1) * 60, self._off_left)

    def _off_left(self, _now) -> None:
        """Salió por la puerta: apagar directo, sin el aviso de luz baja."""
        self._off(_now, warn=False)

    def _off(self, _now, warn: bool = True) -> None:
        if self.sealed or self._activity():
            return
        warn = _f(self.u.get("warn_s"), 20) if warn else 0
        dim = [e for e in self.lights if e.startswith("light.") and self._on(e)]
        if warn > 0 and dim and not self._warned:
            # primero baja la luz: si te quedaste quieto, con moverte vuelve
            for e in dim:
                st = self.hass.states.get(e)
                self._warned[e] = st.attributes.get("brightness") if st else None
                self._call("light.turn_on", e, {"brightness_pct": 15, "transition": 1})
            self._decide(f"Bajé la luz: no detecto a nadie (se apaga en {warn:g} s si nadie se mueve)")
            self._timer("off", warn, self._off_now)
            return
        self._off_now(None)

    def _off_now(self, _now) -> None:
        if self.sealed or self._activity():
            if self._warned:
                self._unwarn()
            return
        if self._warned:
            self._bri_before = {e: b or 255 for e, b in self._warned.items()}
        self._warned = {}
        self._set_occupied(False)
        self._lights_off()

    def _unwarn(self) -> None:
        """Alguien se movió mientras la luz estaba baja: vuelve como estaba."""
        for e, bri in self._warned.items():
            if self._on(e):
                self._call("light.turn_on", e, {"brightness": bri} if bri else {"brightness_pct": 100})
        self._warned = {}
        self._decide("Volví a subir la luz: te moviste")

    def _on_light(self, event: Event, new, old) -> None:
        ctx = event.context
        if ctx.id in self._ours or (ctx.parent_id and ctx.parent_id in self._ours):
            return
        exp = self._expect.get(event.data["entity_id"])
        if exp and dt_util.utcnow() <= exp[1] and (new.state == STATE_ON) == (exp[0] == "on"):
            return  # lo hicimos nosotros (el contexto llegó perdido)
        if new.state in ("unavailable", "unknown") or (old and old.state in ("unavailable", "unknown")):
            return
        self._warned = {}
        if old and old.state == STATE_ON and new.state != STATE_ON:
            # la apagaron a mano: no volver a prenderla por un rato
            block = _f(self.u.get("manual_block"), 10)
            if block < 0:
                self._block_until = dt_util.utcnow() + FAR_FUTURE
            elif block > 0:
                self._block_until = dt_util.utcnow() + timedelta(minutes=block)
        elif new.state == STATE_ON and not (old and old.state == STATE_ON):
            # la prendieron a mano sin nadie detectado: que se apague sola igual
            if not self._activity() and not self.sealed:
                self._timer("off", self.timeout, self._off)

    # ------------------------------------------------------------ estado
    def _set_occupied(self, value: bool) -> None:
        if value == self.occupied:
            return
        self.occupied = value
        if value:
            self._cancel("fan_off")
            if self.fan:
                self._timer("fan_on", _f(self.u.get("fan_delay"), 2) * 60, self._fan_on)
        else:
            self._cancel("fan_on")
            self._block_until = None
            if self.fan and self._fan_ours:
                self._timer("fan_off", _f(self.u.get("fan_after"), 5) * 60, self._fan_off)
        self._changed()

    def _changed(self) -> None:
        self._on_change()

    # ------------------------------------------------------------ luces
    def _dark_reason(self) -> tuple[bool, str]:
        """¿Hace falta luz? y por qué (para «Última decisión»)."""
        when = self.u.get("when", "always")
        if when == "sun":
            sun = self.hass.states.get("sun.sun")
            if sun is None:
                return True, ""
            if _f(sun.attributes.get("elevation"), 0) < _f(self.u.get("elev"), 2):
                return True, ""
            return False, "es de día (prende sólo de noche)"
        if when == "lux" and self.lux:
            state = self.hass.states.get(self.lux)
            limit = _f(self.u.get("lux_max"), 30)
            measured = None if state is None or state.state in ("unknown", "unavailable") else _f(state.state, 0)
            if self._polluted():
                # la lámpara está prendida (o recién apagada): el sensor mide su luz, no la del ambiente
                if self._ambient is None or (self._ambient_at and dt_util.utcnow() - self._ambient_at > timedelta(minutes=20)):
                    return True, ""  # dato viejo: mejor prender que dejar a alguien a oscuras
                if self._ambient < limit:
                    return True, ""
                return False, f"antes de prender la lámpara había {self._ambient:g} lx (prende con menos de {limit:g})"
            if measured is None:
                return True, ""
            self._ambient, self._ambient_at = measured, dt_util.utcnow()
            if measured < limit:
                return True, ""
            return False, f"hay {measured:g} lx (prende con menos de {limit:g})"
        return True, ""

    def _polluted(self) -> bool:
        """¿El sensor de luz está midiendo la lámpara? (prendida o apagada hace menos de 3 min)."""
        if any(self._on(e) for e in self.lights):
            return True
        now = dt_util.utcnow()
        if any(st == "on" and now <= until for st, until in self._expect.values()):
            return True  # la mandamos a prender y todavía no informó: el sensor ya puede estar midiéndola
        settle = _f(self.u.get("lux_settle_s"), 180)
        return bool(self._light_off_at and (dt_util.utcnow() - self._light_off_at).total_seconds() < settle)

    def _dark(self) -> bool:
        return self._dark_reason()[0]

    def _decide(self, text: str) -> None:
        self.last_decision = {"at": dt_util.utcnow().isoformat(), "text": text}
        if not self.decisions or self.decisions[0]["text"] != text:
            self.decisions = [self.last_decision, *self.decisions][:15]
        self._changed()

    def _on_light_level(self) -> None:
        """Oscureció con alguien adentro (sensor de presencia sin «entrada» nueva): prender."""
        if self.u.get("when") == "lux" and self._polluted():
            return  # el cambio de luz lo hizo la lámpara, no el ambiente
        dark = self._dark_reason()[0]
        was = getattr(self, "_was_dark", dark)
        self._was_dark = dark
        if dark and not was and self.occupied and not any(self._on(e) for e in self.lights):
            self._lights_on("oscureció con alguien adentro")

    def _level(self) -> float | None:
        if self.u.get("night"):
            now = dt_util.now()
            m = now.hour * 60 + now.minute
            a = _minutes(self.u.get("night_from"), 23 * 60)
            b = _minutes(self.u.get("night_to"), 6 * 60 + 30)
            inside = a <= m < b if a < b else (m >= a or m < b)
            if inside:
                return _f(self.u.get("night_pct"), 10)
        day = self.u.get("day_pct")
        return None if day in (None, "") else _f(day, 100)

    def _lights_on(self, why: str = "detecté a alguien") -> None:
        if not self.lights:
            return  # sólo sensor de ocupación
        if self._block_until and dt_util.utcnow() < self._block_until:
            if self._block_until - dt_util.utcnow() > timedelta(days=1):
                self._decide("No la prendí: la apagaron a mano (espero a que el ambiente quede vacío)")
            else:
                until = dt_util.as_local(self._block_until)
                self._decide(f"No la prendí: la apagaron a mano (hasta las {until.hour:02d}:{until.minute:02d})")
            return
        dark, reason = self._dark_reason()
        if dark and self._light_off_at and self.u.get("when") == "lux" and self._polluted():
            why = f"{why}; uso la luz que había antes de prender la lámpara"
        if not dark:
            self._decide(f"No la prendí: {reason}")
            return
        pct = self._level()
        turned = 0
        for entity_id in self.lights:
            if self._on(entity_id):
                continue  # ya prendida: no le cambiamos nada
            turned += 1
            before = self._bri_before.pop(entity_id, None)
            if entity_id.startswith("light.") and pct is not None:
                self._call("light.turn_on", entity_id, {"brightness_pct": pct})
            elif entity_id.startswith("light.") and before:
                self._call("light.turn_on", entity_id, {"brightness": before})
            else:
                self._call("homeassistant.turn_on", entity_id)
        self._decide(f"Prendí la luz ({why}{f', al {pct:g}%' if pct is not None else ''})" if turned else "La luz ya estaba prendida")

    def _lights_off(self) -> None:
        on = [e for e in self.lights if self._on(e)]
        for entity_id in on:
            self._call("homeassistant.turn_off", entity_id)
        if on:
            self._decide("Apagué la luz: no hay nadie")

    # ------------------------------------------------------------ extractor
    def _humid(self) -> bool:
        if not self.humidity:
            return False
        state = self.hass.states.get(self.humidity)
        return bool(state) and _f(state.state, 0) >= _f(self.u.get("hum_max"), 70)

    def _fan_on(self, _now=None) -> None:
        if not self.fan or self._on(self.fan):
            return
        self._fan_ours = True
        self._call("homeassistant.turn_on", self.fan)

    def _fan_off(self, _now=None) -> None:
        if not self.fan or self.occupied:
            return
        if self._humid():
            self._timer("fan_off", 300, self._fan_off)  # sigue húmedo: probar de nuevo en 5 min
            return
        if self._fan_ours and self._on(self.fan):
            self._call("homeassistant.turn_off", self.fan)
        self._fan_ours = False

    def _check_humidity(self) -> None:
        if not self.fan or not self.humidity:
            return
        state = self.hass.states.get(self.humidity)
        if state is None:
            return
        value = _f(state.state, 0)
        limit = _f(self.u.get("hum_max"), 70)
        if value >= limit:
            self._fan_on()
        elif value < limit - 5 and not self.occupied and self._fan_ours and "fan_off" not in self._timers:
            self._fan_off()

    def as_dict(self) -> dict[str, Any]:
        return {
            "occupied": self.occupied,
            "sealed": self.sealed,
            "last_motion": self.last_motion.isoformat() if self.last_motion else None,
            "last_decision": getattr(self, "last_decision", None),
            "decisions": self.decisions,
        }
