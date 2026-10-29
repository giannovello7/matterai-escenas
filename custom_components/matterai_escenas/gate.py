"""Portón inteligente: estado real con «Abriendo» y «Cerrando» aunque haya un solo sensor.

Lo arma el instalador desde la tarjeta: el relé (o botón) que da el pulso y el sensor de
cerrado. El portón aprende solo cuánto tarda: mide desde que se manda cerrar hasta que el
sensor marca cerrado, y usa ese tiempo para mostrar «Abriendo».

Seguros (un solo pulso abre, frena y cierra):
- «Abrir» sólo actúa si está cerrado, o cerrándose (para revertir si viene alguien).
- «Cerrar» sólo actúa si está abierto y quieto: un pulso mientras abre lo frenaría.
- Si lo abren con el control remoto, también muestra «Abriendo».
- Si el cierre no termina (se trabó, volvió por la fotocélula), deja de decir «Cerrando».
"""

from __future__ import annotations

import logging
import time
from collections.abc import Callable
from typing import Any

from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers.event import async_call_later, async_track_state_change_event, async_track_time_change

from .notify import Notifier

_LOGGER = logging.getLogger(__name__)

UNAVAILABLE = ("unavailable", "unknown")
DEFAULT_TRAVEL = 20
MIN_TRAVEL, MAX_TRAVEL = 3, 180


def _f(value: Any, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


class GateController:
    def __init__(self, hass: HomeAssistant, rule: dict[str, Any], on_change: Callable[[], None], manager=None) -> None:
        self.hass = hass
        self.rule = rule
        self.rule_id = rule["id"]
        self.u = rule.get("ui") or {}
        self.manager = manager
        self._on_change = on_change
        self.moving: str | None = None  # "opening" / "closing"
        self._t0: float | None = None
        self.status = ""
        self.learned: float | None = _f(rule.get("learned_s"), 0) or None
        self._timers: dict[str, Callable[[], None]] = {}
        self._unsubs: list[Callable[[], None]] = []
        self._open_since: float | None = None
        self.notifier = Notifier(hass, self.rule_id, self.u.get("recipients"))

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

    def _call(self, service: str, entity_id: str, data: dict | None = None) -> None:
        domain, _, svc = service.partition(".")
        self.hass.async_create_task(self.hass.services.async_call(domain, svc, {"entity_id": entity_id, **(data or {})}, blocking=False))

    def _set_status(self, text: str) -> None:
        self.status = text
        self._on_change()

    @property
    def travel(self) -> float:
        manual = _f(self.u.get("travel_s"), 0)
        if manual > 0:
            return manual
        return self.learned or DEFAULT_TRAVEL

    def _sensor_says(self, entity_id: str | None) -> bool | None:
        """True si el sensor está en su posición «activa» (cerrado / abierto), None si no hay dato."""
        if not entity_id:
            return None
        st = self.hass.states.get(entity_id)
        if st is None or st.state in UNAVAILABLE:
            return None
        return st.state == "on"

    @property
    def closed_sensor_ok(self) -> bool:
        return bool(self.u.get("closed_sensor"))

    def is_closed(self) -> bool | None:
        on = self._sensor_says(self.u.get("closed_sensor"))
        if on is None:
            # sin sensor de cerrado: se infiere del de abierto
            on_open = self._sensor_says(self.u.get("open_sensor"))
            if on_open is None:
                return None
            open_active = on_open if self.u.get("open_when", "on") == "on" else not on_open
            return not open_active
        return on if self.u.get("closed_when", "off") == "on" else not on

    def is_fully_open(self) -> bool | None:
        on = self._sensor_says(self.u.get("open_sensor"))
        if on is None:
            return None
        return on if self.u.get("open_when", "on") == "on" else not on

    # ------------------------------------------------------------ ciclo de vida
    @callback
    def start(self) -> None:
        watch = [e for e in (self.u.get("closed_sensor"), self.u.get("open_sensor")) if e]
        if watch:
            self._unsubs.append(async_track_state_change_event(self.hass, watch, self._event))
        if self.u.get("night_close"):
            hh, _, mm = str(self.u.get("night_at") or "23:00").partition(":")
            self._unsubs.append(async_track_time_change(self.hass, self._night_check, hour=int(_f(hh, 23)), minute=int(_f(mm, 0)), second=0))
        if self.is_closed() is False:
            self._open_since = time.monotonic()
            self._schedule_open_alert()
        self.status = "Listo"

    @callback
    def stop(self) -> None:
        for unsub in self._unsubs:
            unsub()
        self._unsubs.clear()
        for name in list(self._timers):
            self._cancel(name)

    def as_dict(self) -> dict[str, Any]:
        return {"gate_moving": self.moving, "gate_travel": round(self.travel), "gate_learned": round(self.learned) if self.learned else None,
                "gate_status": self.status, "gate_closed": self.is_closed()}

    # ------------------------------------------------------------ acciones
    def _pulse(self, which: str) -> None:
        """Manda el pulso al relé (o a los relés de abrir / cerrar si el motor los tiene separados)."""
        entity_id = self.u.get(f"{which}_relay") if self.u.get("relays") == "two" else self.u.get("relay")
        if not entity_id:
            return
        dom = entity_id.split(".")[0]
        if dom in ("button", "input_button"):
            self._call(f"{dom}.press", entity_id)
        elif dom == "script":
            self._call("script.turn_on", entity_id)
        elif dom == "lock":
            self._call("lock.unlock", entity_id)
        else:
            self._call("homeassistant.turn_on", entity_id)
            off_after = _f(self.u.get("pulse_s"), 0)
            if off_after > 0:
                self._timer(f"pulse_{entity_id}", off_after, lambda: self._call("homeassistant.turn_off", entity_id))

    def open(self) -> bool:
        closed = self.is_closed()
        allowed = closed is True or self.moving == "closing" or (closed is None and self.moving is None)
        if not allowed:
            self._set_status("No abrí: ya está abierto o abriéndose")
            return False
        self._start("opening")
        self._pulse("open")
        self._set_status("Abriendo (desde la app)")
        return True

    def close(self) -> bool:
        if self.is_closed() is not False or self.moving is not None:
            self._set_status("No cerré: " + ("se está moviendo" if self.moving else "ya está cerrado"))
            return False
        self._start("closing")
        self._pulse("close")
        self._set_status("Cerrando (desde la app)")
        return True

    def _start(self, direction: str) -> None:
        self.moving = direction
        self._t0 = time.monotonic()
        self._cancel("open_alert")
        if direction == "opening":
            self._cancel("closing_timeout")
            self._timer("opening_done", self.travel, self._opening_done)
        else:
            self._cancel("opening_done")
            self._timer("closing_timeout", self.travel * 1.5 + 10, self._closing_timeout)
        self._on_change()

    def _opening_done(self) -> None:
        if self.moving == "opening":
            self.moving = None
            if self.is_closed() is False:
                self._open_since = time.monotonic()
                self._schedule_open_alert()
            self._set_status("Abierto")

    def _closing_timeout(self) -> None:
        if self.moving == "closing":
            self.moving = None
            self._set_status("No llegó a cerrar (¿se trabó o volvió por la fotocélula?)")
            if self.is_closed() is False:
                self._open_since = time.monotonic()
                self._schedule_open_alert()

    # ------------------------------------------------------------ sensores
    @callback
    def _event(self, event: Event) -> None:
        new = event.data.get("new_state")
        if new is None or new.state in UNAVAILABLE:
            return
        try:
            if event.data["entity_id"] == self.u.get("closed_sensor") or not self.u.get("closed_sensor"):
                closed = self.is_closed()
                if closed:
                    self._on_closed()
                elif closed is False and self.moving is None:
                    # lo abrieron con el control remoto o con el botón de la pared
                    self._start("opening")
                    self._set_status("Abriendo (control remoto o botonera)")
            if event.data["entity_id"] == self.u.get("open_sensor") and self.is_fully_open() and self.moving == "opening":
                # con sensor de abierto no hace falta adivinar: llegó
                self._cancel("opening_done")
                self._opening_done()
        except Exception:  # noqa: BLE001 - un sensor raro no tiene que romper el portón
            _LOGGER.exception("Error en el portón «%s»", self.rule.get("name"))

    def _on_closed(self) -> None:
        if self.moving == "closing" and self._t0 is not None:
            took = time.monotonic() - self._t0
            if MIN_TRAVEL <= took <= MAX_TRAVEL:
                # promedio con lo aprendido para que un cierre raro no lo desajuste
                self.learned = round(took if not self.learned else (self.learned * 2 + took) / 3, 1)
                if self.manager:
                    self.manager.set_rule_extra(self.rule_id, "learned_s", self.learned)
        self.moving = None
        self._open_since = None
        self._cancel("closing_timeout")
        self._cancel("opening_done")
        self._cancel("open_alert")
        self.hass.async_create_task(self.notifier.clear("open"))
        self._set_status("Cerrado")

    # ------------------------------------------------------------ extras
    def _schedule_open_alert(self) -> None:
        minutes = _f(self.u.get("open_alert_min"), 0)
        if minutes > 0:
            self._timer("open_alert", minutes * 60, self._open_alert)

    def _open_alert(self) -> None:
        if self.is_closed() is not False:
            return
        name = self.rule.get("name") or "El portón"
        mins = round((time.monotonic() - (self._open_since or time.monotonic())) / 60)
        self.hass.async_create_task(self.notifier.send(
            f"🚪 {name}", f"Quedó abierto hace {mins} min.", tag="open", actions=[("close", "Cerrar")],
        ))
        self._schedule_open_alert()  # vuelve a avisar si sigue abierto

    @callback
    def _night_check(self, _now) -> None:
        if self.is_closed() is False and self.moving is None:
            if self.close():
                name = self.rule.get("name") or "El portón"
                self.hass.async_create_task(self.notifier.send(f"🌙 {name}", f"Estaba abierto a las {self.u.get('night_at', '23:00')}: lo cerré.", tag="open"))

    def on_action(self, action: str) -> None:
        if action == "close":
            if not self.close():
                self.hass.async_create_task(self.notifier.send(f"🚪 {self.rule.get('name')}", self.status, tag="open"))
        elif action == "open":
            self.open()
