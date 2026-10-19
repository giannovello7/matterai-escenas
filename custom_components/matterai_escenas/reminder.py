"""Recordatorios y avisos del calendario.

ReminderController: un recordatorio (una vez o repetido). Al llegar la hora
avisa con botones «Hecho / En 1 hora / Mañana» y, si se eligió, insiste
hasta que lo marquen. Los de una sola vez quedan como «hechos».

CalAlertController: avisa X minutos antes de cada evento de los calendarios
elegidos (y los de día completo a una hora de la mañana).
"""

from __future__ import annotations

import calendar as pycal
import logging
from collections.abc import Callable
from datetime import date, datetime, timedelta
from typing import Any

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.event import async_call_later
from homeassistant.util import dt as dt_util

from .notify import Notifier

_LOGGER = logging.getLogger(__name__)

WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
MAX_NAGS = 3


def _f(value: Any, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _hm(t: Any) -> tuple[int, int]:
    try:
        h, m = str(t).split(":")
        return max(0, min(23, int(h))), max(0, min(59, int(m)))
    except (TypeError, ValueError):
        return 9, 0


def _date(value: Any) -> date | None:
    try:
        return date.fromisoformat(str(value))
    except (TypeError, ValueError):
        return None


def when_text(at: datetime) -> str:
    """«hoy a las 20:00», «mañana a las 08:00», «el jueves 16/10 a las 09:00»."""
    local = dt_util.as_local(at)
    today = dt_util.now().date()
    hhmm = f"{local.hour:02d}:{local.minute:02d}"
    if local.date() == today:
        return f"hoy a las {hhmm}"
    if local.date() == today + timedelta(days=1):
        return f"mañana a las {hhmm}"
    return f"el {DIAS[local.weekday()]} {local.day}/{local.month} a las {hhmm}"


def next_occurrence(u: dict[str, Any], after: datetime) -> datetime | None:
    """Próxima vez (en hora local, como datetime con zona) estrictamente después de «after»."""
    h, m = _hm(u.get("time"))
    start = _date(u.get("date")) or dt_util.now().date()
    repeat = u.get("repeat", "none")
    local_after = dt_util.as_local(after)

    def at(d: date) -> datetime:
        return local_after.replace(year=d.year, month=d.month, day=d.day, hour=h, minute=m, second=0, microsecond=0)

    if repeat == "none":
        if u.get("done"):
            return None
        return at(start)  # puede estar en el pasado: el controlador decide
    first = max(start, local_after.date())
    for add in range(0, 400):
        d = first + timedelta(days=add)
        if d < start:
            continue
        ok = False
        if repeat == "daily":
            ok = True
        elif repeat == "weekly":
            days = [x for x in (u.get("days") or []) if x in WEEKDAYS] or [WEEKDAYS[start.weekday()]]
            ok = WEEKDAYS[d.weekday()] in days
        elif repeat == "monthly":
            last = pycal.monthrange(d.year, d.month)[1]
            ok = d.day == min(start.day, last)
        elif repeat == "yearly":
            ok = (d.month, d.day) == (start.month, start.day)
        if ok and at(d) > local_after:
            return at(d)
    return None


def repeat_text(u: dict[str, Any]) -> str:
    repeat = u.get("repeat", "none")
    if repeat == "daily":
        return "todos los días"
    if repeat == "weekly":
        days = [x for x in (u.get("days") or []) if x in WEEKDAYS]
        if sorted(days) == sorted(WEEKDAYS[:5]):
            return "de lunes a viernes"
        return "los " + ", ".join(DIAS[WEEKDAYS.index(x)] for x in days) if days else "cada semana"
    if repeat == "monthly":
        start = _date(u.get("date"))
        return f"el {start.day} de cada mes" if start else "cada mes"
    if repeat == "yearly":
        return "cada año"
    return ""


class _Base:
    def __init__(self, hass: HomeAssistant, rule: dict[str, Any], on_change: Callable[[], None], manager=None) -> None:
        self.hass = hass
        self.rule = rule
        self.rule_id = rule["id"]
        self.u = rule.get("ui") or {}
        self.manager = manager
        self.notifier = Notifier(hass, self.rule_id, self.u.get("recipients"))
        self._timers: dict[str, Callable[[], None]] = {}
        self._on_change = on_change

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

    @callback
    def stop(self) -> None:
        for name in list(self._timers):
            self._cancel(name)


class ReminderController(_Base):
    def __init__(self, *args, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        self.next_at: datetime | None = None
        self.pending = False
        self._nags = 0
        self._override: datetime | None = None  # «en 1 hora» / «mañana»

    @callback
    def start(self) -> None:
        self._schedule(first=True)

    def _schedule(self, first: bool = False) -> None:
        self._cancel("fire")
        now = dt_util.utcnow()
        nxt = self._override or next_occurrence(self.u, now)
        if nxt is not None and self.u.get("repeat", "none") == "none" and not self._override and nxt <= now:
            # recordatorio único que venció con HA apagado: avisar ahora (si no pasó medio día)
            if first and (now - nxt) < timedelta(hours=12):
                self.next_at = nxt
                self._timer("fire", 2, self._fire)
            else:
                self.next_at = None
            self._on_change()
            return
        self.next_at = nxt
        if nxt is not None:
            self._timer("fire", (nxt - now).total_seconds(), self._fire)
        self._on_change()

    def _send(self) -> None:
        buttons = [("done", "✓ Hecho"), ("snooze", "En 1 hora")]
        if self.u.get("repeat", "none") != "daily":
            buttons.append(("tomorrow", "Mañana"))
        extra = f"\n({repeat_text(self.u)})" if self.u.get("repeat", "none") != "none" else ""
        self.hass.async_create_task(self.notifier.send(
            "⏰ Recordatorio", f"{self.u.get('text') or self.rule.get('name')}{extra}",
            actions=buttons, critical=bool(self.u.get("critical"))))

    def _fire(self) -> None:
        self._override = None
        self.pending = True
        self._nags = 0
        self._send()
        nag = _f(self.u.get("nag_min"), 0)
        if nag > 0:
            self._timer("nag", nag * 60, self._nag)
        # el próximo (si se repite) se programa desde ya
        if self.u.get("repeat", "none") != "none":
            self.next_at = next_occurrence(self.u, dt_util.utcnow() + timedelta(seconds=1))
            if self.next_at:
                self._timer("fire", (self.next_at - dt_util.utcnow()).total_seconds(), self._fire)
        else:
            self.next_at = None
        self._on_change()

    def _nag(self) -> None:
        if not self.pending or self._nags >= MAX_NAGS:
            return
        self._nags += 1
        self._send()
        self._timer("nag", _f(self.u.get("nag_min"), 10) * 60, self._nag)

    def on_action(self, action: str) -> None:
        self._cancel("nag")
        self.hass.async_create_task(self.notifier.clear())
        if action == "done":
            self.pending = False
            if self.u.get("repeat", "none") == "none" and self.manager:
                self.hass.async_create_task(self.manager.async_mark_done(self.rule_id))
        elif action in ("snooze", "tomorrow"):
            self.pending = False
            delta = timedelta(hours=1) if action == "snooze" else timedelta(days=1)
            self._override = dt_util.utcnow() + delta
            self._cancel("fire")
            self.next_at = self._override
            self._timer("fire", delta.total_seconds(), self._fire)
        self._on_change()

    def as_dict(self) -> dict[str, Any]:
        return {"next_at": self.next_at.isoformat() if self.next_at else None, "pending": self.pending}


class CalAlertController(_Base):
    """Avisa antes de los eventos de los calendarios elegidos."""

    def __init__(self, *args, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        self.calendars: list[str] = [c for c in (self.u.get("calendars") or []) if isinstance(c, str)]
        self._scheduled: set[str] = set()
        self.next_event: str | None = None

    @callback
    def start(self) -> None:
        if self.calendars:
            self._poll()

    def _poll(self) -> None:
        self.hass.async_create_task(self._async_poll())
        self._timer("poll", 15 * 60, self._poll)

    async def _async_poll(self) -> None:
        now = dt_util.now()
        before = timedelta(minutes=_f(self.u.get("before_min"), 15))
        end = now + timedelta(hours=36)
        try:
            resp = await self.hass.services.async_call(
                "calendar", "get_events",
                {"entity_id": self.calendars, "start_date_time": now.isoformat(), "end_date_time": end.isoformat()},
                blocking=True, return_response=True,
            )
        except Exception:  # noqa: BLE001 - calendario caído o versión vieja de HA
            _LOGGER.debug("No se pudieron leer los calendarios", exc_info=True)
            return
        upcoming: list[tuple[datetime, str]] = []
        for cal, data in (resp or {}).items():
            for ev in (data or {}).get("events", []):
                summary = ev.get("summary") or "Evento"
                start_raw = str(ev.get("start") or "")
                all_day = len(start_raw) == 10
                if all_day:
                    if not self.u.get("all_day", True):
                        continue
                    d = _date(start_raw)
                    if d is None:
                        continue
                    h, m = _hm(self.u.get("all_day_time") or "08:00")
                    notify_at = now.replace(year=d.year, month=d.month, day=d.day, hour=h, minute=m, second=0, microsecond=0)
                    msg = f"📅 Hoy: {summary}"
                    starts = notify_at
                else:
                    starts = dt_util.parse_datetime(start_raw)
                    if starts is None:
                        continue
                    starts = dt_util.as_local(starts)
                    notify_at = starts - before
                    msg = f"📅 {summary} {when_text(starts)}"
                if ev.get("location"):
                    msg += f"\n📍 {ev['location']}"
                key = f"{cal}|{start_raw}|{summary}"
                upcoming.append((starts, f"{summary} ({when_text(starts)})"))
                if key in self._scheduled or notify_at < now - timedelta(minutes=1):
                    continue
                self._scheduled.add(key)
                self._timer(f"ev:{key}", (notify_at - now).total_seconds(), lambda m=msg, k=key: self._notify(m, k))
        upcoming.sort(key=lambda x: x[0])
        self.next_event = upcoming[0][1] if upcoming else None
        self._on_change()

    def _notify(self, message: str, key: str) -> None:
        self.hass.async_create_task(self.notifier.send(
            "📅 Calendario", message, tag=f"ev{abs(hash(key)) % 100000}", critical=bool(self.u.get("critical"))))

    def on_action(self, action: str) -> None:
        return

    def as_dict(self) -> dict[str, Any]:
        return {"next_event": self.next_event}
