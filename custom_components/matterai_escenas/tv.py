"""Tele inteligente (Fire TV / Android TV por ADB, o cualquier media_player).

Partes independientes y opcionales:
- Modo cine: al reproducir (en ciertas apps), de noche, baja luces / cierra
  persianas / ejecuta una escena; en pausa sube un poco; al terminar restaura.
- Equipos que acompañan a la tele (barra de sonido, receptor, LED de fondo).
- Tele prendida sin nadie: pausa y, si nadie vuelve, apaga.
- Hora de dormir: apaga a una hora y no deja prenderla hasta la mañana.
- Volumen de noche: no deja pasar de un máximo en un horario.
- Pausar cuando pasa algo (timbre, alarma…).
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

from homeassistant.core import Context, Event, HomeAssistant, callback
from homeassistant.helpers.event import async_call_later, async_track_state_change_event
from homeassistant.util import dt as dt_util

from .room import RoomController

_LOGGER = logging.getLogger(__name__)

OFF_STATES = ("off", "standby", "unavailable", "unknown")
TRIGGER_STATES = ("on", "ringing", "calling", "triggered", "detected", "open")
WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


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


def _in_window(a: int, b: int, m: int) -> bool:
    return a <= m < b if a < b else (m >= a or m < b)


class TvController:
    def __init__(self, hass: HomeAssistant, rule: dict[str, Any], on_change: Callable[[], None], manager=None) -> None:
        self.hass = hass
        self.rule = rule
        self.u = rule.get("ui") or {}
        self.manager = manager
        self.tv: str | None = self.u.get("tv") or None
        self.cine = False
        self.status = ""
        self._snapshot: dict[str, dict[str, Any]] = {}
        self._empty_paused = False
        self._forced = False
        self._occ: RoomController | None = None  # «hay alguien» con movimiento + puerta + mmWave
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

    def _ctx(self) -> Context:
        ctx = Context()
        self._ours = [*self._ours[-40:], ctx.id]
        return ctx

    def _call(self, service: str, data: dict) -> None:
        domain, _, svc = service.partition(".")
        self.hass.async_create_task(self.hass.services.async_call(domain, svc, data, blocking=False, context=self._ctx()))

    def _st(self, entity_id: str | None):
        return self.hass.states.get(entity_id) if entity_id else None

    def _tv_state(self) -> str:
        st = self._st(self.tv)
        return st.state if st else "unavailable"

    def _tv_on(self) -> bool:
        return self._tv_state() not in OFF_STATES

    def _app(self) -> str:
        st = self._st(self.tv)
        if st is None:
            return ""
        a = st.attributes
        return str(a.get("app_name") or a.get("source") or a.get("app_id") or "")

    def _list(self, key: str) -> list[str]:
        return [e for e in (self.u.get(key) or []) if isinstance(e, str)]

    def _now_min(self) -> int:
        now = dt_util.now()
        return now.hour * 60 + now.minute

    def _dark(self) -> bool:
        sun = self._st("sun.sun")
        return sun is None or _f(sun.attributes.get("elevation"), 0) < 3

    def _set_status(self, text: str) -> None:
        self.status = text
        self._on_change()

    # ------------------------------------------------------------ ciclo de vida
    @callback
    def start(self) -> None:
        if not self.tv:
            return
        watch = {self.tv, *self._list("pause_on")}
        self._unsubs.append(async_track_state_change_event(self.hass, list(watch), self._event))
        if self._list("presence") or self._list("empty_motion"):
            self._occ = RoomController(self.hass, {"name": self.rule.get("name"), "ui": {
                "only_sensor": True, "lights": [], "presence": self._list("presence"), "motion": self._list("empty_motion"),
                "doors": self._list("empty_doors"), "timeout": 1, "door_timeout": 0, "seal_window": 30, "sealed_max": 240, "on_door": True,
            }}, self._check_empty)
            self._occ.start()
        if self.u.get("bedtime"):
            self._schedule_bedtime()
        self._evaluate(None, None)

    @callback
    def stop(self) -> None:
        if self._occ:
            self._occ.stop()
            self._occ = None
        for unsub in self._unsubs:
            unsub()
        self._unsubs.clear()
        for name in list(self._timers):
            self._cancel(name)

    @callback
    def _event(self, event: Event) -> None:
        entity_id = event.data["entity_id"]
        old, new = event.data.get("old_state"), event.data.get("new_state")
        try:
            if entity_id == self.tv:
                self._evaluate(old, new)
            elif entity_id in self._list("pause_on"):
                if new is not None and str(new.state).lower() in TRIGGER_STATES and (old is None or str(old.state).lower() not in TRIGGER_STATES):
                    if self._tv_state() == "playing":
                        self._call("media_player.media_pause", {"entity_id": self.tv})
                        self._set_status("Pausé la tele: pasó algo (timbre / alarma)")
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Error en «%s»", self.rule.get("name"))

    # ------------------------------------------------------------ cambios de la tele
    def _evaluate(self, old, new) -> None:
        state = self._tv_state()
        was = old.state if old is not None else None

        # equipos que acompañan a la tele
        companions = self._list("companions")
        if companions:
            if self._tv_on():
                self._cancel("companions_off")
                off = [e for e in companions if (self._st(e) and self._st(e).state == "off")]
                if off:
                    self._call("homeassistant.turn_on", {"entity_id": off})
            elif was is not None and was not in OFF_STATES:
                self._timer("companions_off", _f(self.u.get("companion_delay"), 30),
                            lambda: self._call("homeassistant.turn_off", {"entity_id": companions}))

        # hora de dormir: si la prenden dentro del horario, se apaga
        if self.u.get("bedtime") and self.u.get("bed_block", True) and self._tv_on() and (was in OFF_STATES or was is None):
            if self._bed_window() and old is not None:
                self._timer("bed_block", 30, self._bed_off)

        # volumen de noche
        if self.u.get("night_vol") and new is not None and self._tv_on():
            vol = new.attributes.get("volume_level")
            vmax = _f(self.u.get("vol_max"), 30) / 100
            if vol is not None and _f(vol, 0) > vmax + 0.01 and _in_window(_hm(self.u.get("vol_from"), 23 * 60), _hm(self.u.get("vol_to"), 7 * 60), self._now_min()):
                self._call("media_player.volume_set", {"entity_id": self.tv, "volume_level": vmax})

        # tele sin nadie
        if self._occ:
            self._check_empty()

        # modo cine
        if self.u.get("cine"):
            self._cine(state)

    # ------------------------------------------------------------ modo cine
    def _app_ok(self) -> bool:
        apps = [a.lower() for a in self._list("cine_apps")]
        if not apps:
            return True
        app = self._app().lower()
        return any(a in app for a in apps)

    def force_cine(self, on: bool) -> None:
        """Desde la tarjeta / el interruptor «Modo cine» (Alexa): activa o termina el modo cine ya."""
        if on and not self.cine:
            self._forced = True
            self._enter_cine()
        elif not on and self.cine:
            self._cancel("cine_restore")
            self._exit_cine()

    def _cine(self, state: str) -> None:
        mode = self.u.get("cine_mode", "auto")
        if self._forced:
            if state in OFF_STATES:
                # lo activaron a mano y apagaron la tele: se termina
                self._timer("cine_restore", _f(self.u.get("restore_delay"), 10), self._exit_cine)
                return
            self._cancel("cine_restore")
            if state == "paused" and self.cine:
                self._timer("cine_pause", 2, lambda: self._pause_lights())
                return
            if state == "playing" and self.cine:
                self._cancel("cine_pause")
                self._apply_lights()
            if mode == "manual" or state != "playing":
                return
            self._forced = False  # desde acá sigue el modo automático
        if mode == "manual":
            return
        if state == "playing" and self._app_ok():
            self._cancel("cine_restore")
            self._cancel("cine_pause")
            if not self.cine:
                if self.u.get("cine_dark", True) and not self._dark():
                    return
                self._enter_cine()
            else:
                self._apply_lights()
                self._set_status("Modo cine")
        elif state == "paused" and self.cine:
            self._timer("cine_pause", 2, lambda: self._pause_lights())
        elif self.cine:
            self._cancel("cine_pause")
            self._timer("cine_restore", _f(self.u.get("restore_delay"), 10), self._exit_cine)

    def _cfg(self, entity_id: str) -> dict[str, Any]:
        """Cómo quiere el cliente esta luz en el modo cine: intensidad y color."""
        cfg = (self.u.get("cine_cfg") or {}).get(entity_id.replace(".", "__")) or {}
        return {"pct": _f(cfg.get("pct", self.u.get("cine_pct", 10)), 10), "mode": cfg.get("mode", "keep"),
                "rgb": cfg.get("rgb"), "k": cfg.get("k")}

    def _apply_lights(self) -> None:
        for e in self._list("cine_lights"):
            cfg = self._cfg(e)
            if cfg["pct"] <= 0:
                if self._st(e) is not None and self._st(e).state == "on":
                    self._call("homeassistant.turn_off", {"entity_id": e})
                continue
            if not e.startswith("light."):
                self._call("homeassistant.turn_on", {"entity_id": e})
                continue
            data: dict[str, Any] = {"entity_id": e, "brightness_pct": cfg["pct"], "transition": 2}
            if cfg["mode"] == "color" and cfg["rgb"]:
                try:
                    n = int(str(cfg["rgb"]).lstrip("#"), 16)
                    data["rgb_color"] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
                except ValueError:
                    pass
            elif cfg["mode"] == "white" and cfg["k"]:
                data["color_temp_kelvin"] = int(_f(cfg["k"], 2700))
            self._call("light.turn_on", data)

    def _pause_lights(self) -> None:
        pct = _f(self.u.get("pause_pct"), 30)
        for e in self._list("cine_lights"):
            st = self._st(e)
            if e.startswith("light.") and st is not None and st.state == "on":
                self._call("light.turn_on", {"entity_id": e, "brightness_pct": pct, "transition": 2})
        self._set_status("Modo cine en pausa")

    def _enter_cine(self) -> None:
        self.cine = True
        self._snapshot = {}
        for e in self._list("cine_lights"):
            st = self._st(e)
            if st is not None:
                a = st.attributes
                self._snapshot[e] = {"state": st.state, "brightness": a.get("brightness"), "color_mode": a.get("color_mode"),
                                     "rgb_color": a.get("rgb_color"), "color_temp_kelvin": a.get("color_temp_kelvin")}
        self._apply_lights()
        covers = [c for c in self._list("cine_covers") if self._st(c) and self._st(c).state in ("open", "opening")]
        if covers:
            self._call("cover.close_cover", {"entity_id": covers})
        scene = self.u.get("cine_scene")
        if scene:
            if scene.startswith("scene.") or scene.startswith("script."):
                self._call(f"{scene.split('.')[0]}.turn_on", {"entity_id": scene})
            elif self.manager and scene in self.manager.rules:
                self.hass.async_create_task(self.manager.async_run(scene))
        self._set_status("Modo cine")

    def _exit_cine(self) -> None:
        if not self.cine:
            return
        self.cine = False
        self._forced = False
        self._cancel("cine_pause")
        if self.u.get("restore", True):
            for e, prev in self._snapshot.items():
                if prev["state"] == "on":
                    if e.startswith("light."):
                        data: dict[str, Any] = {"entity_id": e, "transition": 3}
                        if prev.get("brightness"):
                            data["brightness"] = prev["brightness"]
                        if prev.get("color_mode") in ("hs", "xy", "rgb", "rgbw", "rgbww") and prev.get("rgb_color"):
                            data["rgb_color"] = list(prev["rgb_color"])
                        elif prev.get("color_mode") == "color_temp" and prev.get("color_temp_kelvin"):
                            data["color_temp_kelvin"] = prev["color_temp_kelvin"]
                        self._call("light.turn_on", data)
                    else:
                        self._call("homeassistant.turn_on", {"entity_id": e})
                elif prev["state"] == "off" and self._st(e) is not None and self._st(e).state != "off":
                    self._call("homeassistant.turn_off", {"entity_id": e})
        self._snapshot = {}
        self._set_status("Terminó el modo cine: luces como estaban")

    # ------------------------------------------------------------ tele sin nadie
    def _someone(self) -> bool:
        return bool(self._occ and self._occ.occupied)

    def _check_empty(self) -> None:
        if not self._occ:
            return
        if not self._tv_on() or self._someone():
            self._cancel("empty")
            self._cancel("empty_off")
            if self._empty_paused and self._someone() and self._tv_state() == "paused":
                self._call("media_player.media_play", {"entity_id": self.tv})
                self._set_status("Volvió alguien: sigo reproduciendo")
            self._empty_paused = False
            return
        if "empty" not in self._timers and "empty_off" not in self._timers:
            self._timer("empty", _f(self.u.get("empty_min"), 20) * 60, self._empty)

    def _empty(self) -> None:
        if not self._tv_on() or self._someone():
            return
        if self.u.get("empty_pause", True) and self._tv_state() == "playing":
            self._call("media_player.media_pause", {"entity_id": self.tv})
            self._empty_paused = True
            self._set_status("No hay nadie: pausé la tele")
            self._timer("empty_off", _f(self.u.get("empty_wait"), 3) * 60, self._empty_off)
        else:
            self._empty_off()

    def _empty_off(self) -> None:
        if self._tv_on() and not self._someone():
            self._call("media_player.turn_off", {"entity_id": self.tv})
            self._set_status("No había nadie: apagué la tele")
        self._empty_paused = False

    # ------------------------------------------------------------ hora de dormir
    def _bed_days_ok(self) -> bool:
        days = [d for d in (self.u.get("bed_days") or WEEKDAYS) if d in WEEKDAYS] or WEEKDAYS
        now = dt_util.now()
        # pasada la medianoche cuenta el día anterior (la noche del domingo sigue siendo «domingo»)
        m = now.hour * 60 + now.minute
        weekday = now.weekday() if m >= _hm(self.u.get("bed_at"), 22 * 60) else (now.weekday() - 1) % 7
        return WEEKDAYS[weekday] in days

    def _bed_window(self) -> bool:
        return _in_window(_hm(self.u.get("bed_at"), 22 * 60), _hm(self.u.get("bed_until"), 7 * 60), self._now_min()) and self._bed_days_ok()

    def _schedule_bedtime(self) -> None:
        now = dt_util.now()
        m = now.hour * 60 + now.minute + now.second / 60
        target = _hm(self.u.get("bed_at"), 22 * 60)
        wait = (target - m) % 1440 or 1440
        self._timer("bedtime", wait * 60, self._bedtime)

    def _bedtime(self) -> None:
        if self._bed_days_ok() and self._tv_on():
            self._bed_off()
        self._schedule_bedtime()

    def _bed_off(self) -> None:
        if self._tv_on() and self._bed_window():
            self._call("media_player.turn_off", {"entity_id": self.tv})
            self._set_status("Hora de dormir: apagué la tele")

    def on_action(self, action: str) -> None:
        if action == "cine_toggle":
            self.force_cine(not self.cine)
        elif action == "cine_on":
            self.force_cine(True)
        elif action == "cine_off":
            self.force_cine(False)

    def as_dict(self) -> dict[str, Any]:
        return {"cine": self.cine, "tv_status": self.status, "tv_app": self._app(), "tv_state": self._tv_state()}
