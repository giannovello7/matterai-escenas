"""Despertador con luz: amanecer simulado y/o luz natural con las persianas.

Antes de la hora de despertar:
- Si hay persianas y hay luz afuera (sol, o sensor de lux), se abren de a poco
  y NO se prenden luces (ahorro). Si con las persianas abiertas sigue oscuro
  (sensor de lux), se prenden las luces igual.
- Si no hay persianas o está oscuro, las luces suben de a poco de un cálido
  tenue al blanco.
La hora puede ser fija (días elegidos) o la próxima alarma del celular
(sensor «next_alarm» de la app de HA). Todo lo opcional se saltea si no está.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import datetime, timedelta
from typing import Any

from homeassistant.core import Context, Event, HomeAssistant, callback
from homeassistant.helpers.event import async_call_later, async_track_state_change_event
from homeassistant.util import dt as dt_util

_LOGGER = logging.getLogger(__name__)

UNAVAILABLE = ("unavailable", "unknown")
WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def _f(value: Any, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


class WakeController:
    def __init__(self, hass: HomeAssistant, rule: dict[str, Any], on_change: Callable[[], None], manager=None) -> None:
        self.hass = hass
        self.rule = rule
        self.u = rule.get("ui") or {}
        self.lights: list[str] = [e for e in (self.u.get("lights") or []) if isinstance(e, str)]
        self.covers: list[str] = [e for e in (self.u.get("covers") or []) if isinstance(e, str)]
        self.next_alarm: datetime | None = None
        self.mode_used: str | None = None  # «persianas» / «luces» en el último despertar
        self.running = False
        self._step = 0
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

    def _ctx(self) -> Context:
        ctx = Context()
        self._ours = [*self._ours[-60:], ctx.id]
        return ctx

    def _call(self, service: str, entity_ids: list[str], data: dict | None = None) -> None:
        if not entity_ids:
            return
        domain, _, svc = service.partition(".")
        self.hass.async_create_task(self.hass.services.async_call(
            domain, svc, {"entity_id": entity_ids, **(data or {})}, blocking=False, context=self._ctx()))

    @property
    def ramp(self) -> float:
        return max(1.0, _f(self.u.get("ramp"), 20))

    # ------------------------------------------------------------ cuándo
    def _compute_next(self) -> datetime | None:
        now = dt_util.utcnow()
        if self.u.get("time_mode") == "phone":
            st = self.hass.states.get(self.u.get("phone") or "")
            if st is None or st.state in UNAVAILABLE:
                return None
            when = dt_util.parse_datetime(st.state)
            return dt_util.as_utc(when) if when and dt_util.as_utc(when) > now else None
        try:
            h, m = (int(x) for x in str(self.u.get("time") or "07:00").split(":"))
        except ValueError:
            return None
        days = [d for d in (self.u.get("days") or WEEKDAYS) if d in WEEKDAYS] or WEEKDAYS
        local_now = dt_util.as_local(now)
        for add in range(0, 8):
            day = local_now + timedelta(days=add)
            cand = day.replace(hour=h, minute=m, second=0, microsecond=0)
            if WEEKDAYS[cand.weekday()] in days and dt_util.as_utc(cand) - timedelta(minutes=self.ramp) > now:
                return dt_util.as_utc(cand)
        return None

    def _schedule(self) -> None:
        for name in ("ramp_start", "climate", "alarm"):
            self._cancel(name)
        self.next_alarm = self._compute_next()
        if self.next_alarm:
            now = dt_util.utcnow()
            self._timer("ramp_start", (self.next_alarm - timedelta(minutes=self.ramp) - now).total_seconds(), self._begin)
            if self.u.get("climate"):
                before = _f(self.u.get("climate_before"), 30)
                self._timer("climate", (self.next_alarm - timedelta(minutes=before) - now).total_seconds(), self._climate_on)
            self._timer("alarm", (self.next_alarm - now).total_seconds(), self._at_alarm)
        self._on_change()

    # ------------------------------------------------------------ ciclo de vida
    @callback
    def start(self) -> None:
        watch = set(self.lights)
        if self.u.get("time_mode") == "phone" and self.u.get("phone"):
            watch.add(self.u["phone"])
        if watch:
            self._unsubs.append(async_track_state_change_event(self.hass, list(watch), self._event))
        self._schedule()

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
        if entity_id == self.u.get("phone"):
            if not self.running:
                self._schedule()
            return
        # alguien apagó una luz durante el amanecer: se corta el amanecer de luces
        ctx = event.context
        if ctx.id in self._ours or (ctx.parent_id and ctx.parent_id in self._ours):
            return
        new = event.data.get("new_state")
        if self.running and new is not None and new.state == "off":
            self._cancel("step")
            self.running = False
            self._on_change()

    # ------------------------------------------------------------ despertar
    def _someone_home(self) -> bool:
        if not self.u.get("only_home"):
            return True
        zone = self.hass.states.get("zone.home")
        if zone is None or zone.state in UNAVAILABLE:
            return True
        return _f(zone.state, 1) > 0

    def _daylight(self) -> bool:
        """¿Hay luz afuera como para no prender luces?"""
        sun = self.hass.states.get("sun.sun")
        if sun is None:
            return False
        # al terminar el amanecer el sol va a estar más alto: se mira la elevación actual con margen
        return _f(sun.attributes.get("elevation"), -90) > _f(self.u.get("sun_min"), -2)

    def _begin(self) -> None:
        if not self._someone_home():
            self._schedule_after()
            return
        use_covers = bool(self.covers) and self.u.get("natural", True) and self._daylight()
        self.mode_used = "persianas" if use_covers else "luces"
        self.running = True
        self._step = 0
        if self.covers and (use_covers or self.u.get("cover_mode") == "gradual"):
            self._cover_steps()
        if not use_covers and self.lights:
            self._light_step()
        self._on_change()

    def _cover_steps(self) -> None:
        steps = max(1, int(self.ramp))
        pos = min(100, round(100 * (self._step + 1) / steps))
        positional = []
        for c in self.covers:
            st = self.hass.states.get(c)
            if st is not None and int(st.attributes.get("supported_features", 0) or 0) & 4:
                positional.append(c)
        self._call("cover.set_cover_position", positional, {"position": pos})
        if self._step + 1 >= steps:
            self._call("cover.open_cover", [c for c in self.covers if c not in positional])
            return
        self._timer("cover_step", 60, self._next_cover)

    def _next_cover(self) -> None:
        self._step += 1
        self._cover_steps()

    def _light_step(self) -> None:
        if not self.running:
            return
        steps = max(1, int(self.ramp))
        frac = min(1.0, (self._step + 1) / steps)
        bmin, bmax = _f(self.u.get("start_pct"), 1), _f(self.u.get("end_pct"), 80)
        kmin, kmax = _f(self.u.get("start_k"), 2200), _f(self.u.get("end_k"), 4000)
        data = {"brightness_pct": round(bmin + (bmax - bmin) * frac), "transition": 59}
        ct = []
        for e in self.lights:
            st = self.hass.states.get(e)
            if e.startswith("light.") and st is not None and "color_temp" in (st.attributes.get("supported_color_modes") or []):
                ct.append(e)
        plain = [e for e in self.lights if e.startswith("light.") and e not in ct]
        self._call("light.turn_on", ct, {**data, "color_temp_kelvin": round(kmin + (kmax - kmin) * frac)})
        self._call("light.turn_on", plain, data)
        if self._step == 0:
            self._call("homeassistant.turn_on", [e for e in self.lights if not e.startswith("light.")])
        if self._step + 1 < steps:
            self._timer("step", 60, self._next_light)

    def _next_light(self) -> None:
        self._step += 1
        self._light_step()

    def _climate_on(self) -> None:
        if not self._someone_home():
            return
        climates = [e for e in (self.u.get("climate") or []) if isinstance(e, str)]
        data = {"temperature": _f(self.u.get("climate_temp"), 22), "hvac_mode": self.u.get("climate_mode") or "heat"}
        self._call("climate.set_temperature", climates, data)

    def _at_alarm(self) -> None:
        if self._someone_home():
            if self.covers and self.u.get("cover_mode", "gradual") == "at_time" and self.mode_used != "persianas":
                self._call("cover.open_cover", self.covers)
            # con las persianas abiertas, ¿alcanza la luz? (sólo si hay sensor de lux)
            if self.mode_used == "persianas" and self.lights and self.u.get("lux"):
                st = self.hass.states.get(self.u["lux"])
                if st is not None and st.state not in UNAVAILABLE and _f(st.state, 0) < _f(self.u.get("lux_min"), 50):
                    self._call("light.turn_on", [e for e in self.lights if e.startswith("light.")],
                               {"brightness_pct": _f(self.u.get("end_pct"), 80), "transition": 30})
                    self._call("homeassistant.turn_on", [e for e in self.lights if not e.startswith("light.")])
                    self.mode_used = "persianas + luces"
            player = self.u.get("media")
            if player:
                self._call("media_player.turn_on", [player])
                if self.u.get("volume") not in (None, ""):
                    self._call("media_player.volume_set", [player], {"volume_level": _f(self.u.get("volume"), 20) / 100})
                self._call("media_player.media_play", [player])
        self.running = False
        self._schedule_after()

    def _schedule_after(self) -> None:
        # programar el próximo despertar un poco después (evita repetir el mismo)
        self._timer("reschedule", 90, self._schedule)
        self._on_change()

    def run_now(self) -> None:
        """«Probar»: un amanecer corto de 1 minuto."""
        saved = self.u.get("ramp")
        self.u["ramp"] = 1
        self._begin()
        self.u["ramp"] = saved
        self._timer("alarm_test", 65, lambda: (setattr(self, "running", False), self._on_change()))

    def on_action(self, action: str) -> None:
        return

    def as_dict(self) -> dict[str, Any]:
        return {
            "next_alarm": self.next_alarm.isoformat() if self.next_alarm else None,
            "waking": self.running,
            "wake_mode": self.mode_used,
        }
