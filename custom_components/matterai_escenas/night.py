"""Buenas noches: escena + se activa sola cuando la casa se fue a dormir.

Automática: dentro de un horario, si en las áreas comunes no hay movimiento
durante X minutos (y hay alguien en casa, si se puede saber), la casa se fue
a dormir. Opcionalmente pregunta antes con un aviso con botones; si nadie
responde, la ejecuta igual. Se ejecuta una sola vez por noche.
También se puede ejecutar a mano (botón, tarjeta, voz).
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
OPEN_CLASSES = ("door", "window", "garage_door", "opening")


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


def _plural(n: int, one: str, many: str) -> str:
    return f"{n} {one if n == 1 else many}"


class NightController:
    def __init__(self, hass: HomeAssistant, rule: dict[str, Any], on_change: Callable[[], None], manager=None) -> None:
        self.hass = hass
        self.rule = rule
        self.rule_id = rule["id"]
        self.u = rule.get("ui") or {}
        self.manager = manager
        self.notifier = Notifier(hass, self.rule_id, self.u.get("recipients"))
        self.common: list[str] = [e for e in (self.u.get("common") or []) if isinstance(e, str)]
        self.last_run: datetime | None = None
        self.asking = False
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

    def _name(self, entity_id: str) -> str:
        st = self.hass.states.get(entity_id)
        return (st.attributes.get("friendly_name") if st else None) or entity_id

    def _all(self, domain: str) -> list[str]:
        return list(self.hass.states.async_entity_ids(domain))

    def _call(self, service: str, entity_ids: list[str], data: dict | None = None) -> None:
        if not entity_ids:
            return
        domain, _, svc = service.partition(".")
        self.hass.async_create_task(
            self.hass.services.async_call(domain, svc, {"entity_id": entity_ids, **(data or {})}, blocking=False)
        )

    def _in_window(self) -> bool:
        now = dt_util.now()
        m = now.hour * 60 + now.minute
        a, b = _hm(self.u.get("from"), 22 * 60), _hm(self.u.get("to"), 2 * 60)
        return a <= m < b if a < b else (m >= a or m < b)

    def _night_key(self) -> str:
        # la «noche» empieza al mediodía: así 23:00 y 01:00 cuentan como la misma noche
        now = dt_util.now() - timedelta(hours=12)
        return now.date().isoformat()

    def _done_tonight(self) -> bool:
        if self.last_run is None:
            return False
        return (dt_util.as_local(self.last_run) - timedelta(hours=12)).date().isoformat() == self._night_key()

    def _someone_home(self) -> bool:
        zone = self.hass.states.get("zone.home")
        if zone is not None and zone.state not in UNAVAILABLE:
            return _f(zone.state, 0) > 0
        return True  # sin personas configuradas: se asume que hay gente

    def _quiet_for(self) -> float:
        """Segundos que pasaron sin movimiento en las áreas comunes."""
        now = dt_util.utcnow()
        quiet = float("inf")
        for e in self.common:
            st = self.hass.states.get(e)
            if st is None or st.state in UNAVAILABLE:
                continue
            if st.state == "on":
                return 0.0
            quiet = min(quiet, (now - st.last_changed).total_seconds())
        return quiet

    # ------------------------------------------------------------ ciclo de vida
    @callback
    def start(self) -> None:
        if self.u.get("auto") and self.common:
            self._unsubs.append(async_track_state_change_event(self.hass, self.common, self._event))
            self._schedule_check()

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
        if new is not None and new.state == "on" and self.asking:
            # alguien sigue levantado: se cancela la pregunta
            self.asking = False
            self._cancel("ask_timeout")
            self.hass.async_create_task(self.notifier.clear("ask"))
        self._schedule_check()

    def _schedule_check(self) -> None:
        """Revisa ya y vuelve a revisar en un rato (cubre también el inicio de la franja)."""
        self._check()
        self._timer("check", 120, self._schedule_check)

    def _check(self) -> None:
        if not self.u.get("auto") or self.asking or self._done_tonight():
            return
        if not self._in_window() or not self._someone_home():
            return
        if self._quiet_for() < _f(self.u.get("quiet_min"), 20) * 60:
            return
        if self.u.get("ask"):
            self.asking = True
            self.hass.async_create_task(self.notifier.send(
                "🌙 ¿Buenas noches?",
                f"No hay movimiento en la casa hace {int(self._quiet_for() // 60)} min. ¿Activo «{self.rule.get('name') or 'Buenas noches'}»?"
                + (" Si no respondés, lo activo solo." if self.u.get("ask_default", True) else ""),
                tag="ask", actions=[("yes", "Sí, buenas noches"), ("no", "Todavía no")]))
            self._timer("ask_timeout", _f(self.u.get("ask_wait"), 5) * 60, self._ask_timeout)
            self._on_change()
            return
        self.run()

    def _ask_timeout(self) -> None:
        if not self.asking:
            return
        self.asking = False
        self.hass.async_create_task(self.notifier.clear("ask"))
        if self.u.get("ask_default", True):
            self.run()
        else:
            self.last_run = dt_util.utcnow()  # no volver a preguntar esta noche
            self._on_change()

    def on_action(self, action: str) -> None:
        if action == "yes":
            self.asking = False
            self._cancel("ask_timeout")
            self.run()
        elif action == "no":
            self.asking = False
            self._cancel("ask_timeout")
            # «todavía no»: volver a preguntar más tarde
            self._timer("check", _f(self.u.get("retry_min"), 30) * 60, self._schedule_check)
            self._on_change()

    # ------------------------------------------------------------ la escena
    def _pick(self, mode_key: str, list_key: str, domain: str) -> list[str]:
        mode = self.u.get(mode_key, "none")
        if mode == "all":
            keep = set(self.u.get("keep") or []) | set(self.u.get("night_lights") or [])
            return [e for e in self._all(domain) if e not in keep]
        if mode == "list":
            return [e for e in (self.u.get(list_key) or []) if isinstance(e, str)]
        return []

    def run(self, manual: bool = False) -> None:
        self.last_run = dt_util.utcnow()
        self._cancel("ask_timeout")
        self.asking = False
        done: list[str] = []

        lights = [e for e in self._pick("lights", "lights_list", "light") if self._state(e) == "on"]
        self._call("homeassistant.turn_off", lights)
        if lights:
            done.append(f"apagué {_plural(len(lights), 'luz', 'luces')}")

        media = [e for e in self._pick("media", "media_list", "media_player") if self._state(e) not in ("off", "standby", None, *UNAVAILABLE)]
        self._call("media_player.turn_off", media)
        if media:
            done.append(f"apagué {_plural(len(media), 'tele / equipo', 'teles / equipos')}")

        plugs = [e for e in (self.u.get("switches") or []) if self._state(e) == "on"]
        self._call("homeassistant.turn_off", plugs)
        if plugs:
            done.append(f"apagué {_plural(len(plugs), 'enchufe', 'enchufes')}")

        # luz de noche tenue (pasillo, baño)
        night = [e for e in (self.u.get("night_lights") or []) if isinstance(e, str)]
        if night:
            pct = _f(self.u.get("night_pct"), 5)
            self._call("light.turn_on", [e for e in night if e.startswith("light.")], {"brightness_pct": pct})
            self._call("homeassistant.turn_on", [e for e in night if not e.startswith("light.")])
            done.append("dejé la luz de noche")

        climates = [e for e in (self.u.get("climate") or []) if isinstance(e, str)]
        if climates:
            if self.u.get("climate_action", "temp") == "off":
                self._call("climate.turn_off", [e for e in climates if self._state(e) not in ("off", None)])
                done.append("apagué los aires")
            else:
                on = [e for e in climates if self._state(e) not in ("off", None, *UNAVAILABLE)]
                self._call("climate.set_temperature", on, {"temperature": _f(self.u.get("climate_temp"), 25)})
                if on:
                    done.append(f"puse los aires a {_f(self.u.get('climate_temp'), 25):g}°")

        covers = [e for e in self._pick("covers", "covers_list", "cover") if self._state(e) in ("open", "opening")]
        self._call("cover.close_cover", covers)
        if covers:
            done.append(f"cerré {_plural(len(covers), 'persiana', 'persianas')}")

        locks = [e for e in (self.u.get("locks") or []) if self._state(e) not in ("locked", None)]
        self._call("lock.lock", locks)
        if locks:
            done.append(f"le eché llave a {_plural(len(locks), 'puerta', 'puertas')}")

        alarm = self.u.get("alarm")
        if alarm and self.u.get("arm") and self._state(alarm) == "disarmed":
            data = {"code": self.u["code"]} if self.u.get("code") else {}
            self._call("alarm_control_panel.alarm_arm_night", [alarm], data)
            done.append("armé la alarma en modo noche")

        for rid in self.u.get("rules_on") or []:
            if self.manager and rid in self.manager.rules:
                self.hass.async_create_task(self.manager.async_set_enabled(rid, True))

        open_now = []
        if self.u.get("check_open", True):
            open_now = [
                e for e in self._all("binary_sensor")
                if self._state(e) == "on" and self.hass.states.get(e).attributes.get("device_class") in OPEN_CLASSES
            ]
        if self.u.get("notify", True) or open_now:
            msg = ("Listo: " + ", ".join(done) + ".") if done else "Todo estaba apagado."
            if open_now:
                msg += "\n⚠ Quedó abierto: " + ", ".join(self._name(e) for e in open_now) + "."
            self.hass.async_create_task(self.notifier.send("🌙 Buenas noches", msg, tag="done"))
        self._on_change()

    def as_dict(self) -> dict[str, Any]:
        return {
            "asking": self.asking,
            "done_tonight": self._done_tonight(),
            "last_night": self.last_run.isoformat() if self.last_run else None,
        }
