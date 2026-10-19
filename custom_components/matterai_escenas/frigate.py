"""Frigate: detecciones con cámaras, caras y patentes conocidas.

FrigateHub escucha «<prefijo>/events» por MQTT (una sola suscripción para todas
las reglas) y reparte cada evento. También anota qué cámaras, zonas, objetos,
caras y patentes vio, para ofrecerlos en la tarjeta.

- FDetectController («Detección con cámaras»): seguridad. Persona / auto /
  animal / paquete en ciertas cámaras y zonas, con horario, «sólo si no hay
  nadie», caras conocidas, merodeo, luces, sirena y parlantes.
- FFaceController («Caras y patentes conocidas»): bienvenida. Llega alguien
  conocido -> aviso / abrir (automático o preguntando) / desarmar / luces /
  bienvenida por parlante / escena, con historial.
Si un evento no trae la cara, se usa el sensor «*_last_recognized_face».
"""

from __future__ import annotations

import json
import logging
import re
import unicodedata
from collections.abc import Callable
from datetime import datetime, timedelta
from typing import Any

from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers.event import async_call_later, async_track_state_change_event
from homeassistant.util import dt as dt_util

from .notify import Notifier

_LOGGER = logging.getLogger(__name__)

UNAVAILABLE = ("unavailable", "unknown", "none", "None", "")
LABELS_ES = {
    "person": "Persona", "car": "Auto", "motorcycle": "Moto", "bicycle": "Bicicleta", "truck": "Camión",
    "dog": "Perro", "cat": "Gato", "bird": "Pájaro", "package": "Paquete", "face": "Cara", "license_plate": "Patente",
}
FACE_WAIT = 4  # segundos para esperar a que Frigate reconozca la cara antes de decidir
MAX_HISTORY = 30


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


def norm(text: Any) -> str:
    t = unicodedata.normalize("NFD", str(text or "").lower())
    return "".join(c for c in t if unicodedata.category(c) != "Mn").strip()


def plate_norm(text: Any) -> str:
    return re.sub(r"[^A-Z0-9]", "", str(text or "").upper())


def face_of(after: dict[str, Any]) -> str | None:
    sub = after.get("sub_label")
    if isinstance(sub, (list, tuple)) and sub:
        sub = sub[0]
    if isinstance(sub, str) and sub and sub.lower() not in ("none", "unknown"):
        return sub
    return None


def plate_of(after: dict[str, Any]) -> str | None:
    plate = after.get("recognized_license_plate")
    if isinstance(plate, (list, tuple)) and plate:
        plate = plate[0]
    return plate if isinstance(plate, str) and plate else None


class FrigateHub:
    def __init__(self, hass: HomeAssistant, manager) -> None:
        self.hass = hass
        self.manager = manager
        self.listeners: dict[str, Any] = {}
        self.connected = False
        self._unsub: Callable[[], None] | None = None
        seen = (manager.settings.get("frigate_seen") or {}) if manager else {}
        self.seen: dict[str, set[str]] = {k: set(seen.get(k) or []) for k in ("cameras", "zones", "labels", "faces", "plates")}
        self._dirty = False

    @property
    def prefix(self) -> str:
        return (self.manager.settings.get("frigate_topic") if self.manager else None) or "frigate"

    async def async_start(self) -> None:
        if "mqtt" not in self.hass.config.components:
            return
        try:
            from homeassistant.components import mqtt

            self._unsub = await mqtt.async_subscribe(self.hass, f"{self.prefix}/events", self._message)
            self.connected = True
        except Exception:  # noqa: BLE001 - sin MQTT, las reglas usan los sensores de caras
            _LOGGER.debug("No se pudo escuchar Frigate por MQTT", exc_info=True)

    @callback
    def stop(self) -> None:
        if self._unsub:
            self._unsub()
            self._unsub = None
        self.connected = False

    @callback
    def _message(self, msg) -> None:
        try:
            payload = json.loads(msg.payload)
        except (TypeError, ValueError):
            return
        kind = payload.get("type")
        after = payload.get("after") or {}
        if not after.get("camera"):
            return
        self._remember(after)
        for ctl in list(self.listeners.values()):
            try:
                ctl.on_frigate(kind, after)
            except Exception:  # noqa: BLE001
                _LOGGER.exception("Error procesando evento de Frigate")

    def _remember(self, after: dict[str, Any]) -> None:
        before = sum(len(v) for v in self.seen.values())
        self.seen["cameras"].add(after["camera"])
        if after.get("label"):
            self.seen["labels"].add(after["label"])
        self.seen["zones"].update(z for z in (after.get("entered_zones") or []) if isinstance(z, str))
        if face_of(after):
            self.seen["faces"].add(face_of(after))
        if plate_of(after):
            self.seen["plates"].add(plate_of(after))
        if sum(len(v) for v in self.seen.values()) != before and self.manager:
            self.manager.settings["frigate_seen"] = {k: sorted(v) for k, v in self.seen.items()}
            self.manager.save_settings()

    def info(self) -> dict[str, Any]:
        faces = set(self.seen["faces"])
        for st in self.hass.states.async_all("sensor") if hasattr(self.hass.states, "async_all") else []:
            if st.entity_id.endswith("_last_recognized_face") and st.state not in UNAVAILABLE:
                faces.add(st.state)
        return {
            "connected": self.connected, "mqtt": "mqtt" in self.hass.config.components, "prefix": self.prefix,
            "cameras": sorted(self.seen["cameras"]), "zones": sorted(self.seen["zones"]),
            "labels": sorted(self.seen["labels"] | {"person", "car", "dog", "cat", "package"}),
            "faces": sorted(faces), "plates": sorted(self.seen["plates"]),
        }


class _Base:
    uses_face_sensors = False

    def __init__(self, hass: HomeAssistant, rule: dict[str, Any], on_change: Callable[[], None], manager=None) -> None:
        self.hass = hass
        self.rule = rule
        self.rule_id = rule["id"]
        self.u = rule.get("ui") or {}
        self.manager = manager
        self.notifier = Notifier(hass, self.rule_id, self.u.get("recipients"))
        self.history: list[dict[str, Any]] = list(rule.get("history") or [])
        self._timers: dict[str, Callable[[], None]] = {}
        self._unsubs: list[Callable[[], None]] = []
        self._on_change = on_change
        self._cooldown: dict[str, datetime] = {}

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

    def _call(self, service: str, data: dict) -> None:
        domain, _, svc = service.partition(".")
        self.hass.async_create_task(self.hass.services.async_call(domain, svc, data, blocking=False))

    def _state(self, entity_id: str | None) -> str | None:
        st = self.hass.states.get(entity_id) if entity_id else None
        return st.state if st else None

    def _hub(self) -> FrigateHub | None:
        return getattr(self.manager, "frigate", None)

    @callback
    def start(self) -> None:
        hub = self._hub()
        if hub:
            hub.listeners[self.rule_id] = self
        sensors = self._face_sensors() if self.uses_face_sensors else []
        if sensors:
            self._unsubs.append(async_track_state_change_event(self.hass, sensors, self._face_sensor_event))

    @callback
    def stop(self) -> None:
        hub = self._hub()
        if hub:
            hub.listeners.pop(self.rule_id, None)
        for unsub in self._unsubs:
            unsub()
        self._unsubs.clear()
        for name in list(self._timers):
            self._cancel(name)

    # -- filtros comunes
    def _camera_ok(self, camera: str) -> bool:
        cams = [c for c in (self.u.get("cameras") or []) if c]
        return not cams or camera in cams

    def _zone_ok(self, after: dict[str, Any]) -> bool:
        zones = [z for z in (self.u.get("zones") or []) if z]
        if not zones:
            return True
        entered = set(after.get("entered_zones") or []) | set(after.get("current_zones") or [])
        return bool(entered & set(zones))

    def _when_ok(self) -> bool:
        when = self.u.get("when", "always")
        if when == "night":
            sun = self.hass.states.get("sun.sun")
            return sun is None or _f(sun.attributes.get("elevation"), 0) < 0
        if when == "hours":
            now = dt_util.now()
            m = now.hour * 60 + now.minute
            a, b = _hm(self.u.get("from"), 22 * 60), _hm(self.u.get("to"), 7 * 60)
            return a <= m < b if a < b else (m >= a or m < b)
        return True

    def _cool(self, key: str) -> bool:
        """True si todavía está en el tiempo de espera entre avisos."""
        now = dt_util.utcnow()
        last = self._cooldown.get(key)
        if last and (now - last).total_seconds() < _f(self.u.get("cooldown_min"), 3) * 60:
            return True
        self._cooldown[key] = now
        return False

    def _snapshot(self, event_id: str | None) -> str | None:
        return f"/api/frigate/notifications/{event_id}/snapshot.jpg" if event_id else None

    def _links(self, event_id: str | None) -> list[tuple[str, str]]:
        return [("📹 Ver clip", f"/api/frigate/notifications/{event_id}/clip.mp4")] if event_id else []

    def _record(self, entry: dict[str, Any]) -> None:
        self.history.insert(0, entry)
        del self.history[MAX_HISTORY:]
        if self.manager:
            self.manager.set_rule_extra(self.rule_id, "history", self.history)
        self._on_change()

    def _face_sensors(self) -> list[str]:
        sensors = [s for s in (self.u.get("face_sensors") or []) if isinstance(s, str)]
        if sensors:
            return sensors
        if hasattr(self.hass.states, "async_entity_ids"):
            return [e for e in self.hass.states.async_entity_ids("sensor") if e.endswith("_last_recognized_face")]
        return []

    @callback
    def _face_sensor_event(self, event: Event) -> None:
        return

    def as_dict(self) -> dict[str, Any]:
        return {"history": self.history[:MAX_HISTORY]}


class FDetectController(_Base):
    """Seguridad: alguien / algo en una zona."""

    def __init__(self, *args, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        self._events: dict[str, dict[str, Any]] = {}
        self._snooze_until: datetime | None = None

    def _match(self, after: dict[str, Any]) -> bool:
        if after.get("false_positive"):
            return False
        labels = [l for l in (self.u.get("labels") or ["person"]) if l]
        if after.get("label") not in labels:
            return False
        if not self._camera_ok(after.get("camera", "")) or not self._zone_ok(after):
            return False
        score = _f(after.get("top_score") or after.get("score"), 1)
        return score >= _f(self.u.get("min_score"), 0.7)

    def _context_ok(self) -> bool:
        if not self._when_ok():
            return False
        if self.u.get("only_away"):
            zone = self.hass.states.get("zone.home")
            if zone is not None and zone.state not in UNAVAILABLE and _f(zone.state, 0) > 0:
                return False
        alarm = self.u.get("only_armed")
        if alarm and not str(self._state(alarm) or "").startswith("armed"):
            return False
        return True

    def on_frigate(self, kind: str, after: dict[str, Any]) -> None:
        event_id = after.get("id")
        if not event_id:
            return
        if kind == "end":
            self._events.pop(event_id, None)
            self._cancel(f"decide:{event_id}")
            return
        if not self._match(after):
            return
        info = self._events.get(event_id)
        if info is None:
            info = {"start": dt_util.utcnow(), "done": False}
            self._events[event_id] = info
        info["after"] = after
        if info["done"]:
            return
        loiter = _f(self.u.get("loiter_s"), 0)
        wait = FACE_WAIT if after.get("label") == "person" else 0
        if face_of(after) and not loiter:
            wait = 0  # ya se sabe quién es
        delay = max(wait, loiter - (dt_util.utcnow() - info["start"]).total_seconds())
        if f"decide:{event_id}" not in self._timers or delay == 0:
            self._timer(f"decide:{event_id}", delay, lambda: self._decide(event_id))

    def _known(self, after: dict[str, Any]) -> str | None:
        face = face_of(after)
        if not face:
            st = self.hass.states.get(f"sensor.{after.get('camera', '')}_last_recognized_face")
            if st is not None and st.state not in UNAVAILABLE and (dt_util.utcnow() - st.last_changed).total_seconds() < 20:
                face = st.state
        if not face:
            return None
        people = [norm(p) for p in (self.u.get("people_ok") or []) if p]
        return face if (not people or norm(face) in people) else None

    def _decide(self, event_id: str) -> None:
        info = self._events.get(event_id)
        if not info or info["done"]:
            return
        after = info["after"]
        info["done"] = True
        if not self._context_ok():
            return
        if self._snooze_until and dt_util.utcnow() < self._snooze_until:
            return
        known = self._known(after)
        mode = self.u.get("known", "ignore")
        if known and mode == "ignore":
            return
        camera = after.get("camera", "")
        if self._cool(camera):
            return
        label = LABELS_ES.get(after.get("label"), after.get("label") or "Algo")
        where = ", ".join(after.get("entered_zones") or []) or camera
        local = dt_util.as_local(dt_util.utcnow())
        who = f" — {known}" if known else (" — desconocida" if after.get("label") == "person" and self.u.get("faces_on", True) else "")
        message = f"{label} en {where} ({local.hour:02d}:{local.minute:02d}){who}"
        silent = bool(known and mode == "silent")
        actions = []
        if self.u.get("lights"):
            actions.append(("lights", "💡 Prender luces"))
        if self.u.get("siren") and not self.u.get("siren_auto"):
            actions.append(("siren", "🚨 Sirena"))
        actions.append(("snooze", "🔕 Silenciar 1 h"))
        self.hass.async_create_task(self.notifier.send(
            f"📹 {self.rule.get('name') or 'Cámaras'}", message, tag=f"ev{event_id[-6:]}",
            actions=actions[:2], links=self._links(event_id), image=self._snapshot(event_id),
            critical=bool(self.u.get("critical")) and not silent, silent=silent))
        if not silent:
            if self.u.get("lights_auto", True) and self.u.get("lights"):
                self._lights()
            if self.u.get("siren") and self.u.get("siren_auto"):
                self._siren()
            players = [p for p in (self.u.get("speakers") or []) if isinstance(p, str)]
            if players and self.u.get("tts"):
                self._call("tts.speak", {"entity_id": self.u["tts"], "media_player_entity_id": players,
                                         "message": self.u.get("message") or f"Atención: {label.lower()} en {where}"})
        self._record({"at": dt_util.utcnow().isoformat(), "id": event_id, "camera": camera, "label": after.get("label"),
                      "zone": where, "face": known or face_of(after)})

    def _lights(self) -> None:
        lights = [e for e in (self.u.get("lights") or []) if isinstance(e, str)]
        if not lights:
            return
        sun = self.hass.states.get("sun.sun")
        if self.u.get("lights_dark", True) and sun is not None and _f(sun.attributes.get("elevation"), 0) >= 0:
            return
        self._call("homeassistant.turn_on", {"entity_id": lights})
        self._timer("lights_off", _f(self.u.get("light_min"), 5) * 60, lambda: self._call("homeassistant.turn_off", {"entity_id": lights}))

    def _siren(self) -> None:
        siren = self.u.get("siren")
        if not siren:
            return
        self._call("homeassistant.turn_on", {"entity_id": siren})
        self._timer("siren_off", _f(self.u.get("siren_s"), 30), lambda: self._call("homeassistant.turn_off", {"entity_id": siren}))

    def on_action(self, action: str) -> None:
        if action == "lights":
            lights = [e for e in (self.u.get("lights") or []) if isinstance(e, str)]
            self._call("homeassistant.turn_on", {"entity_id": lights}) if lights else None
            self._timer("lights_off", _f(self.u.get("light_min"), 5) * 60, lambda: self._call("homeassistant.turn_off", {"entity_id": lights}))
        elif action == "siren":
            self._siren()
        elif action == "snooze":
            self._snooze_until = dt_util.utcnow() + timedelta(hours=1)


class FFaceController(_Base):
    """Bienvenida: llega una persona (cara) o un auto (patente) conocido."""

    uses_face_sensors = True

    def _people(self) -> list[str]:
        if self.u.get("any_known"):
            return []
        return [norm(p) for p in (self.u.get("people") or []) if p]

    def _display(self, face: str) -> str:
        """El nombre como lo cargó el instalador («María», aunque Frigate mande «maria»)."""
        for p in self.u.get("people") or []:
            if norm(p) == norm(face):
                return p
        return face[:1].upper() + face[1:]

    def _plates(self) -> dict[str, str]:
        """«AB123CD = Auto de Juan» -> {"AB123CD": "Auto de Juan"}."""
        out = {}
        for item in self.u.get("plates") or []:
            plate, _, name = str(item).partition("=")
            if plate_norm(plate):
                out[plate_norm(plate)] = name.strip()
        return out

    def on_frigate(self, kind: str, after: dict[str, Any]) -> None:
        if kind == "end" or not self._camera_ok(after.get("camera", "")) or not self._zone_ok(after):
            return
        face = face_of(after)
        if face and (not self._people() or norm(face) in self._people()):
            self._arrived(self._display(face), after.get("camera", ""), "face", after.get("id"))
        plate = plate_of(after)
        if plate and plate_norm(plate) in self._plates():
            self._arrived(plate_norm(plate), after.get("camera", ""), "plate", after.get("id"))

    @callback
    def _face_sensor_event(self, event: Event) -> None:
        new = event.data.get("new_state")
        if new is None or new.state in UNAVAILABLE:
            return
        camera = event.data["entity_id"].split(".")[1].removesuffix("_last_recognized_face")
        if not self._camera_ok(camera):
            return
        if not self._people() or norm(new.state) in self._people():
            self._arrived(self._display(new.state), camera, "face", None)

    def _arrived(self, who: str, camera: str, kind: str, event_id: str | None) -> None:
        if not self._when_ok() or self._cool(norm(who)):
            return
        dark = True
        sun = self.hass.states.get("sun.sun")
        if sun is not None:
            dark = _f(sun.attributes.get("elevation"), 0) < 3
        alias = self._plates().get(who, "") if kind == "plate" else ""
        name = who if kind == "face" else (alias or f"el auto {who}")
        spoken = who if kind == "face" else alias.split(" de ")[-1] if alias else None
        done: list[str] = []
        unlock = self.u.get("unlock")
        mode = self.u.get("unlock_mode", "ask")
        if unlock and mode == "auto":
            self._unlock(unlock)
            done.append("abrí")
        if self.u.get("disarm") and self.u.get("alarm") and self._state(self.u["alarm"]) not in ("disarmed", None):
            data = {"entity_id": self.u["alarm"]}
            if self.u.get("code"):
                data["code"] = self.u["code"]
            self._call("alarm_control_panel.alarm_disarm", data)
            done.append("desarmé la alarma")
        lights = [e for e in (self.u.get("lights") or []) if isinstance(e, str)]
        if lights and (not self.u.get("lights_dark", True) or dark):
            self._call("homeassistant.turn_on", {"entity_id": lights})
            done.append("prendí las luces")
        players = [p for p in (self.u.get("speakers") or []) if isinstance(p, str)]
        if players and self.u.get("tts") and spoken:
            msg = (self.u.get("welcome") or "Bienvenido, {nombre}").replace("{nombre}", spoken)
            self._call("tts.speak", {"entity_id": self.u["tts"], "media_player_entity_id": players, "message": msg})
        for rid in self.u.get("rules_run") or []:
            if self.manager and rid in self.manager.rules:
                self.hass.async_create_task(self.manager.async_run(rid))
        if self.u.get("notify", True):
            msg = (self.u.get("message") or "Llegó {nombre}").replace("{nombre}", name)
            local = dt_util.as_local(dt_util.utcnow())
            msg += f" ({local.hour:02d}:{local.minute:02d})"
            if done:
                msg += ": " + ", ".join(done) + "."
            actions = [("open", f"🔓 {self.u.get('unlock_name') or 'Abrir'}")] if unlock and mode == "ask" else []
            self.hass.async_create_task(self.notifier.send(
                f"👤 {self.rule.get('name') or 'Llegó alguien'}", msg, tag="arrive", actions=actions,
                image=self._snapshot(event_id), silent=bool(self.u.get("silent"))))
        self._record({"at": dt_util.utcnow().isoformat(), "who": who, "kind": kind, "camera": camera, "id": event_id,
                      "opened": bool(unlock and mode == "auto")})

    def _unlock(self, entity_id: str) -> None:
        domain = entity_id.split(".")[0]
        if domain == "lock":
            data = {"entity_id": entity_id}
            if self.u.get("code"):
                data["code"] = self.u["code"]
            self._call("lock.unlock", data)
        elif domain in ("button", "input_button"):
            self._call(f"{domain}.press", {"entity_id": entity_id})
        elif domain == "cover":
            self._call("cover.open_cover", {"entity_id": entity_id})
        elif domain == "script":
            self._call("script.turn_on", {"entity_id": entity_id})
        else:
            self._call("homeassistant.turn_on", {"entity_id": entity_id})
            self._timer("pulse", 1, lambda: self._call("homeassistant.turn_off", {"entity_id": entity_id}))

    def on_action(self, action: str) -> None:
        if action == "open" and self.u.get("unlock"):
            self._unlock(self.u["unlock"])
            if self.history:
                self.history[0]["opened"] = True
                if self.manager:
                    self.manager.set_rule_extra(self.rule_id, "history", self.history)
            self._on_change()
