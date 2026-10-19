"""Me voy / Llego: modo ausente automático.

Detecta que se fue el último (personas con la app, o la alarma armada en
ausente) y, después de un rato de confirmación, apaga / cierra / arma lo
elegido y avisa qué quedó abierto. Cuando llega el primero, hace la bienvenida.
Cada parte es opcional: si algo no está configurado, se saltea.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import timedelta
from typing import Any

from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers.event import async_call_later, async_track_state_change_event
from homeassistant.util import dt as dt_util

from .notify import Notifier

_LOGGER = logging.getLogger(__name__)

UNAVAILABLE = ("unavailable", "unknown")
OPEN_CLASSES = ("door", "window", "garage_door", "opening")


def _f(value: Any, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _plural(n: int, one: str, many: str) -> str:
    return f"{n} {one if n == 1 else many}"


class AwayController:
    def __init__(self, hass: HomeAssistant, rule: dict[str, Any], on_change: Callable[[], None], manager=None) -> None:
        self.hass = hass
        self.rule = rule
        self.rule_id = rule["id"]
        self.u = rule.get("ui") or {}
        self.manager = manager
        self.notifier = Notifier(hass, self.rule_id, self.u.get("recipients"))
        self.away = False
        self.last_event: str | None = None
        self._warned = False
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

    def _all(self, domain: str) -> list[str]:
        return list(self.hass.states.async_entity_ids(domain))

    def _state(self, entity_id: str) -> str | None:
        state = self.hass.states.get(entity_id)
        return state.state if state else None

    def _call(self, service: str, entity_ids: list[str], data: dict | None = None) -> None:
        if not entity_ids:
            return
        domain, _, svc = service.partition(".")
        self.hass.async_create_task(
            self.hass.services.async_call(domain, svc, {"entity_id": entity_ids, **(data or {})}, blocking=False)
        )

    def _pick(self, mode_key: str, list_key: str, domain: str) -> list[str]:
        mode = self.u.get(mode_key, "none")
        if mode == "all":
            return self._all(domain)
        if mode == "list":
            return [e for e in (self.u.get(list_key) or []) if isinstance(e, str)]
        return []

    def _people_home(self) -> int | None:
        zone = self.hass.states.get("zone.home")
        if zone is not None and zone.state not in UNAVAILABLE:
            return int(_f(zone.state, 0))
        people = self._all("person")
        if not people:
            return None
        return sum(1 for p in people if self._state(p) == "home")

    def _dark(self) -> bool:
        sun = self.hass.states.get("sun.sun")
        if sun is None:
            return True
        return _f(sun.attributes.get("elevation"), 0) < 3

    # ------------------------------------------------------------ ciclo de vida
    @callback
    def start(self) -> None:
        watch: set[str] = set()
        if self.u.get("detect", "people") == "people":
            watch.add("zone.home")
            watch.update(self._all("person"))
            count = self._people_home()
            self.away = count == 0
        elif self.u.get("alarm"):
            watch.add(self.u["alarm"])
            self.away = self._state(self.u["alarm"]) == "armed_away"
        if watch:
            self._unsubs.append(async_track_state_change_event(self.hass, list(watch), self._event))

    @callback
    def stop(self) -> None:
        for unsub in self._unsubs:
            unsub()
        self._unsubs.clear()
        for name in list(self._timers):
            self._cancel(name)

    @callback
    def _event(self, event: Event) -> None:
        if self.u.get("detect", "people") == "people":
            count = self._people_home()
            if count is None:
                return
            if count == 0 and not self.away and "leave" not in self._timers:
                # confirmar: evita falsas salidas por un salto del GPS
                self._timer("leave", _f(self.u.get("leave_delay"), 5) * 60, self._confirm_leave)
            elif count > 0:
                self._cancel("leave")
                if self.away:
                    self._arrive()
        else:
            state = self._state(self.u.get("alarm"))
            if state == "armed_away" and not self.away:
                self._leave(armed_by_user=True)
            elif state == "disarmed" and self.away:
                self._arrive()

    def _confirm_leave(self) -> None:
        if self._people_home() == 0:
            self._leave()

    # ------------------------------------------------------------ me voy
    def _motion_recent(self) -> list[str]:
        sensors = [e for e in (self.u.get("cancel_motion") or []) if isinstance(e, str)]
        if not sensors:
            return []
        window = timedelta(minutes=_f(self.u.get("cancel_motion_min"), 10))
        now = dt_util.utcnow()
        hits = []
        for e in sensors:
            st = self.hass.states.get(e)
            if st is None:
                continue
            if st.state == "on" or (now - st.last_changed) < window:
                hits.append(e)
        return hits

    def _name(self, entity_id: str) -> str:
        st = self.hass.states.get(entity_id)
        return (st.attributes.get("friendly_name") if st else None) or entity_id

    def _open_things(self) -> list[str]:
        mode = self.u.get("check_open", "auto")
        if mode == "none":
            return []
        if mode == "list":
            candidates = [e for e in (self.u.get("check_list") or []) if isinstance(e, str)]
        else:
            candidates = [
                e for e in self._all("binary_sensor")
                if (self.hass.states.get(e).attributes.get("device_class") in OPEN_CLASSES)
            ]
        return [e for e in candidates if self._state(e) == "on"]

    def _leave(self, armed_by_user: bool = False) -> None:
        motion = self._motion_recent()
        if motion and not armed_by_user:
            if not self._warned:
                self._warned = True
                self.hass.async_create_task(self.notifier.send(
                    "🏠 Modo ausente", f"Todavía no apagué nada: hubo movimiento en {', '.join(self._name(e) for e in motion)}. Puede haber alguien en casa; vuelvo a fijarme en un rato.", tag="away"))
            # volver a revisar: cuando la casa quede realmente vacía, se ejecuta solo
            self._timer("leave", _f(self.u.get("cancel_motion_min"), 10) * 60, self._confirm_leave)
            return
        self._warned = False
        self.away = True
        self.last_event = "leave"
        done: list[str] = []

        lights = [e for e in self._pick("lights", "lights_list", "light") if self._state(e) == "on"]
        self._call("homeassistant.turn_off", lights)
        if lights:
            done.append(f"apagué {_plural(len(lights), 'luz', 'luces')}")

        plugs = [e for e in (self.u.get("switches") or []) if self._state(e) == "on"]
        self._call("homeassistant.turn_off", plugs)
        if plugs:
            done.append(f"apagué {_plural(len(plugs), 'enchufe', 'enchufes')}")

        climates = [e for e in self._pick("climate", "climate_list", "climate") if self._state(e) not in ("off", None, *UNAVAILABLE)]
        self._call("climate.turn_off", climates)
        if climates:
            done.append(f"apagué {_plural(len(climates), 'aire', 'aires')}")

        covers = [e for e in self._pick("covers", "covers_list", "cover") if self._state(e) in ("open", "opening")]
        self._call("cover.close_cover", covers)
        if covers:
            done.append(f"cerré {_plural(len(covers), 'persiana', 'persianas')}")

        locks = [e for e in (self.u.get("locks") or []) if self._state(e) not in ("locked", None)]
        self._call("lock.lock", locks)
        if locks:
            done.append(f"le eché llave a {_plural(len(locks), 'puerta', 'puertas')}")

        alarm = self.u.get("alarm")
        if self.u.get("arm") and alarm and not armed_by_user and self._state(alarm) == "disarmed":
            data = {"code": self.u["code"]} if self.u.get("code") else {}
            self._call("alarm_control_panel.alarm_arm_away", [alarm], data)
            done.append("armé la alarma")

        for rid in self.u.get("rules_on") or []:
            if self.manager and rid in self.manager.rules:
                self.hass.async_create_task(self.manager.async_set_enabled(rid, True))
                done.append(f"activé «{self.manager.rules[rid]['name']}»")

        open_now = self._open_things()
        if self.u.get("notify_leave", True) or open_now:
            msg = ("Listo: " + ", ".join(done) + ".") if done else "Todo estaba apagado."
            if open_now:
                msg += "\n⚠ Quedó abierto: " + ", ".join(self._name(e) for e in open_now) + "."
            self.hass.async_create_task(self.notifier.send(
                "🏠 Se fueron todos", msg, tag="away", critical=bool(open_now and self.u.get("open_critical"))))
        self._on_change()

    # ------------------------------------------------------------ llego
    def _arrive(self) -> None:
        self.away = False
        self.last_event = "arrive"
        done: list[str] = []
        alarm = self.u.get("alarm")
        if self.u.get("disarm") and alarm and self._state(alarm) not in ("disarmed", None):
            data = {"code": self.u["code"]} if self.u.get("code") else {}
            self._call("alarm_control_panel.alarm_disarm", [alarm], data)
            done.append("desarmé la alarma")

        welcome = [e for e in (self.u.get("welcome") or []) if isinstance(e, str)]
        if welcome and (not self.u.get("welcome_dark", True) or self._dark()):
            self._call("homeassistant.turn_on", welcome)
            done.append(f"prendí {_plural(len(welcome), 'luz', 'luces')}")

        climates = [e for e in (self.u.get("arrive_climate") or []) if isinstance(e, str)]
        if climates:
            mode = self.u.get("arrive_mode") or "auto"
            temp = self.u.get("arrive_temp")
            if temp not in (None, ""):
                self._call("climate.set_temperature", climates, {"temperature": _f(temp, 24), "hvac_mode": mode})
            else:
                self._call("climate.set_hvac_mode", climates, {"hvac_mode": mode})
            done.append(f"prendí {_plural(len(climates), 'aire', 'aires')}")

        for rid in self.u.get("rules_off") or self.u.get("rules_on") or []:
            if self.manager and rid in self.manager.rules:
                self.hass.async_create_task(self.manager.async_set_enabled(rid, False))

        self.hass.async_create_task(self.notifier.clear("away"))
        if self.u.get("notify_arrive") and done:
            self.hass.async_create_task(self.notifier.send("👋 Bienvenidos", "Listo: " + ", ".join(done) + ".", tag="arrive"))
        self._on_change()

    def on_action(self, action: str) -> None:  # sin botones por ahora
        return

    def as_dict(self) -> dict[str, Any]:
        return {"away": self.away}
