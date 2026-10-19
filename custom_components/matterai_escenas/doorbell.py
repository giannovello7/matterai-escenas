"""Portero: timbre con foto, abrir desde el aviso, anuncio en parlantes e historial.

Pensado para porteros IP (Hikvision DS-KV6113 y similares) integrados en HA,
pero sirve con cualquier timbre: un sensor/evento que indique que tocaron,
una cámara y una cerradura / botón / relé para abrir. Todo lo opcional se
saltea si no está configurado.
"""

from __future__ import annotations

import logging
import os
from collections.abc import Callable
from datetime import datetime
from typing import Any

from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers.event import async_call_later, async_track_state_change_event
from homeassistant.util import dt as dt_util

from .const import DOMAIN
from .notify import action_id

_LOGGER = logging.getLogger(__name__)

UNAVAILABLE = ("unavailable", "unknown")
RING_STATES = ("on", "ringing", "calling", "ring", "incoming", "call")
MAX_HISTORY = 30
COOLDOWN = 15  # segundos: un timbre que manda varios eventos seguidos cuenta como uno


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


class DoorbellController:
    def __init__(self, hass: HomeAssistant, rule: dict[str, Any], on_change: Callable[[], None], manager=None) -> None:
        self.hass = hass
        self.rule = rule
        self.rule_id = rule["id"]
        self.u = rule.get("ui") or {}
        self.manager = manager
        self.ring_entity: str | None = self.u.get("ring") or None
        self.camera: str | None = self.u.get("camera") or None
        self.history: list[dict[str, Any]] = list(rule.get("history") or [])
        self.ringing = False
        self._last_ring: datetime | None = None
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

    def _state(self, entity_id: str | None) -> str | None:
        if not entity_id:
            return None
        st = self.hass.states.get(entity_id)
        return st.state if st else None

    def _call(self, service: str, data: dict) -> None:
        domain, _, svc = service.partition(".")
        self.hass.async_create_task(self.hass.services.async_call(domain, svc, data, blocking=False))

    def _quiet(self) -> bool:
        if not self.u.get("quiet"):
            return False
        now = dt_util.now()
        m = now.hour * 60 + now.minute
        a, b = _hm(self.u.get("quiet_from"), 23 * 60), _hm(self.u.get("quiet_to"), 7 * 60)
        return a <= m < b if a < b else (m >= a or m < b)

    def _dark(self) -> bool:
        sun = self.hass.states.get("sun.sun")
        if sun is None:
            return True
        return _f(sun.attributes.get("elevation"), 0) < 3

    def _nobody_home(self) -> bool:
        zone = self.hass.states.get("zone.home")
        return zone is not None and zone.state not in UNAVAILABLE and _f(zone.state, 1) == 0

    # ------------------------------------------------------------ ciclo de vida
    @callback
    def start(self) -> None:
        if self.ring_entity:
            self._unsubs.append(async_track_state_change_event(self.hass, [self.ring_entity], self._event))

    @callback
    def stop(self) -> None:
        for unsub in self._unsubs:
            unsub()
        self._unsubs.clear()
        for name in list(self._timers):
            self._cancel(name)

    @callback
    def _event(self, event: Event) -> None:
        new = event.data.get("new_state")
        old = event.data.get("old_state")
        if new is None or new.state in UNAVAILABLE:
            return
        domain = self.ring_entity.split(".")[0]
        if domain == "event":
            # entidades «event»: cada pulsación cambia el estado (la hora del evento)
            rang = old is not None and old.state != new.state
        else:
            wanted = [s.lower() for s in (self.u.get("ring_states") or RING_STATES)]
            rang = new.state.lower() in wanted and (old is None or old.state.lower() not in wanted)
            if old is not None and old.state.lower() in wanted and new.state.lower() not in wanted:
                self._stop_ringing()  # cortaron / atendieron desde el portero
        if rang:
            self.ring()

    # ------------------------------------------------------------ timbre
    def ring(self, test: bool = False) -> None:
        now = dt_util.utcnow()
        if not test and self._last_ring and (now - self._last_ring).total_seconds() < COOLDOWN:
            return
        self._last_ring = now
        self.ringing = True
        self._repeats = 0
        entry: dict[str, Any] = {"at": now.isoformat(), "opened": False, "test": test}

        # foto: se guarda en /media para el historial
        if self.camera and self.u.get("snapshots", True):
            media_dirs = getattr(self.hass.config, "media_dirs", {}) or {}
            base = media_dirs.get("local") or self.hass.config.path("media")
            name = f"{self.rule_id}_{dt_util.as_local(now).strftime('%Y%m%d_%H%M%S')}.jpg"
            path = os.path.join(base, "matterai_portero", name)
            self.hass.async_create_task(self._snapshot(path))
            entry["media"] = f"media-source://media_source/local/matterai_portero/{name}"

        self.history.insert(0, entry)
        del self.history[MAX_HISTORY:]
        self._persist()

        self._notify()
        if self.u.get("ring_repeat", True):
            self._timer("repeat", 8, self._repeat)
        self._timer("ring_end", _f(self.u.get("ring_secs"), 40), self._stop_ringing)

        if not self._quiet():
            players = [p for p in (self.u.get("speakers") or []) if isinstance(p, str)]
            tts = self.u.get("tts")
            if players and tts:
                self._call("tts.speak", {"entity_id": tts, "media_player_entity_id": players,
                                         "message": self.u.get("message") or "Están tocando el timbre"})
        light = self.u.get("light")
        if light and (not self.u.get("light_dark", True) or self._dark()) and self._state(light) != "on":
            self._call("homeassistant.turn_on", {"entity_id": light})
            self._timer("light_off", _f(self.u.get("light_min"), 3) * 60, lambda: self._call("homeassistant.turn_off", {"entity_id": light}))
        self._on_change()

    async def _snapshot(self, path: str) -> None:
        try:
            await self.hass.async_add_executor_job(lambda: os.makedirs(os.path.dirname(path), exist_ok=True))
            await self.hass.services.async_call("camera", "snapshot", {"entity_id": self.camera, "filename": path}, blocking=True)
            await self.hass.async_add_executor_job(self._prune, os.path.dirname(path))
        except Exception:  # noqa: BLE001 - sin foto, el aviso sale igual
            _LOGGER.debug("No se pudo guardar la foto del portero", exc_info=True)

    def _prune(self, folder: str) -> None:
        files = sorted(f for f in os.listdir(folder) if f.startswith(f"{self.rule_id}_"))
        for old in files[:-MAX_HISTORY]:
            try:
                os.remove(os.path.join(folder, old))
            except OSError:
                pass

    def _persist(self) -> None:
        if self.manager:
            self.manager.set_rule_extra(self.rule_id, "history", self.history)

    def _notify(self) -> None:
        targets = [t for t in (self.u.get("recipients") or []) if self.hass.services.has_service("notify", t)]
        title = f"🔔 {self.rule.get('name') or 'Portero'}"
        message = "Están tocando el timbre."
        face_sensor = self.u.get("face_sensor")
        if face_sensor:
            st = self.hass.states.get(face_sensor)
            if st is not None and st.state not in (*UNAVAILABLE, "none", "None", "") and (dt_util.utcnow() - st.last_changed).total_seconds() < 90:
                message = f"Tocó el timbre: {st.state}."
        if self._nobody_home():
            message += " No hay nadie en casa."
        if not targets:
            self._call("persistent_notification.create", {"title": title, "message": message, "notification_id": f"{DOMAIN}_{self.rule_id}_ring"})
            return
        actions = []
        if self.u.get("unlock"):
            actions.append({"action": action_id(self.rule_id, "open"), "title": f"🔓 {self.u.get('unlock_name') or 'Abrir puerta'}"})
        if self.u.get("unlock2"):
            actions.append({"action": action_id(self.rule_id, "open2"), "title": f"🚗 {self.u.get('unlock2_name') or 'Abrir portón'}"})
        actions.append({"action": "URI", "title": "📞 Atender", "uri": f"/automatizaciones?portero={self.rule_id}"})
        data: dict[str, Any] = {"tag": f"{DOMAIN}_{self.rule_id}_ring", "actions": actions[:3], "ttl": 0, "priority": "high",
                                "clickAction": f"/automatizaciones?portero={self.rule_id}", "url": f"/automatizaciones?portero={self.rule_id}"}
        if self.camera:
            data["image"] = f"/api/camera_proxy/{self.camera}"
            data["entity_id"] = self.camera  # iOS: vista previa en vivo al mantener apretado
        if self.u.get("ring_style", "call") == "call" and not self._quiet():
            # suena como llamada: Android canal de alarma, iOS sonido crítico
            data.update({"channel": "portero", "importance": "high", "vibrationPattern": "100, 1000, 100, 1000, 100"})
            data["push"] = {"interruption-level": "critical", "sound": {"name": "default", "critical": 1, "volume": 1.0}}
        else:
            data["push"] = {"interruption-level": "time-sensitive"}
        for target in targets:
            self._call(f"notify.{target}", {"title": title, "message": message, "data": data})

    def _repeat(self) -> None:
        if not self.ringing or self._repeats >= 2:
            return
        self._repeats += 1
        self._notify()
        self._timer("repeat", 8, self._repeat)

    def _stop_ringing(self) -> None:
        if not self.ringing:
            return
        self.ringing = False
        self._cancel("repeat")
        self._on_change()

    # ------------------------------------------------------------ acciones
    def _unlock(self, entity_id: str | None) -> bool:
        if not entity_id:
            return False
        domain = entity_id.split(".")[0]
        if domain == "lock":
            data = {"entity_id": entity_id}
            if self.u.get("code"):
                data["code"] = self.u["code"]
            self._call("lock.unlock", data)
        elif domain in ("button", "input_button"):
            self._call(f"{domain}.press", {"entity_id": entity_id})
        elif domain == "script":
            self._call("script.turn_on", {"entity_id": entity_id})
        else:
            # relé: pulso de un segundo
            self._call("homeassistant.turn_on", {"entity_id": entity_id})
            self._timer(f"pulse:{entity_id}", _f(self.u.get("pulse"), 1), lambda: self._call("homeassistant.turn_off", {"entity_id": entity_id}))
        return True

    def on_action(self, action: str) -> None:
        if action in ("open", "open2"):
            if self._unlock(self.u.get("unlock") if action == "open" else self.u.get("unlock2")):
                if self.history:
                    self.history[0]["opened"] = True
                    self._persist()
        elif action == "test":
            self.ring(test=True)
            return
        self._stop_ringing()
        # borrar el aviso de todos los celulares
        for target in self.u.get("recipients") or []:
            if self.hass.services.has_service("notify", target):
                self._call(f"notify.{target}", {"message": "clear_notification", "data": {"tag": f"{DOMAIN}_{self.rule_id}_ring"}})
        self._on_change()

    def as_dict(self) -> dict[str, Any]:
        return {"ringing": self.ringing, "history": self.history[:MAX_HISTORY]}
