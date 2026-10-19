"""Recordatorios por voz con el asistente de Home Assistant (Assist).

Instala frases en castellano en /config/custom_sentences/es/ y registra los
intents que crean recordatorios: «recordame sacar la basura mañana a las 9»,
«avisame en 20 minutos que saque la pizza», «¿qué recordatorios tengo?».
"""

from __future__ import annotations

import logging
import os
import re
import unicodedata
from datetime import datetime, timedelta
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers import intent
from homeassistant.util import dt as dt_util

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

SENTENCES = """# Generado por MatterAI Escenas: recordatorios por voz. Se reescribe al iniciar.
language: "es"
intents:
  MaeAddReminder:
    data:
      - sentences:
          - "(recordame|recuérdame|recordáme|recordarme|haceme acordar|hacéme acordar|avisame|avisáme) [que|de] {texto} (a la|a las) {hora}"
  MaeAddReminderIn:
    data:
      - sentences:
          - "(recordame|recuérdame|recordáme|recordarme|haceme acordar|hacéme acordar|avisame|avisáme) [que|de] {texto} (en|dentro de) {cantidad} {unidad}"
          - "(recordame|recuérdame|recordáme|recordarme|haceme acordar|hacéme acordar|avisame|avisáme) (en|dentro de) {cantidad} {unidad} [que|de] {texto}"
  MaeListReminders:
    data:
      - sentences:
          - "qué recordatorios tengo"
          - "(cuáles son|decime|leeme) [mis] recordatorios"
lists:
  texto:
    wildcard: true
  hora:
    wildcard: true
  cantidad:
    range:
      from: 1
      to: 600
  unidad:
    values:
      - "minuto"
      - "minutos"
      - "hora"
      - "horas"
"""

NUM_WORDS = {
    "una": 1, "uno": 1, "un": 1, "dos": 2, "tres": 3, "cuatro": 4, "cinco": 5, "seis": 6, "siete": 7, "ocho": 8,
    "nueve": 9, "diez": 10, "once": 11, "doce": 12, "trece": 13, "catorce": 14, "quince": 15, "dieciseis": 16,
    "diecisiete": 17, "dieciocho": 18, "diecinueve": 19, "veinte": 20, "veintiuno": 21, "veintiuna": 21,
    "veintidos": 22, "veintitres": 23, "veinticuatro": 24, "treinta": 30, "cuarenta": 40, "cuarenta y cinco": 45,
    "cincuenta": 50,
}
WEEKDAY_WORDS = {"lunes": 0, "martes": 1, "miercoles": 2, "jueves": 3, "viernes": 4, "sabado": 5, "domingo": 6}


def _plain(text: str) -> str:
    text = unicodedata.normalize("NFD", text.lower())
    return "".join(c for c in text if unicodedata.category(c) != "Mn").strip(" .,¿?¡!")


def _num(word: str) -> int | None:
    word = word.strip()
    if word.isdigit():
        return int(word)
    return NUM_WORDS.get(word)


def parse_hour(raw: str) -> tuple[int, int, str | None] | None:
    """«8», «8:30», «8 y media», «nueve menos cuarto», «20 30», «9 de la noche» -> (h, m, momento)."""
    t = _plain(raw)
    t = t.replace(" hs", "").replace(" horas", "").replace("las ", "")
    moment = None
    for word, key in (("de la manana", "am"), ("de la madrugada", "am"), ("de la tarde", "pm"), ("de la noche", "pm"), ("del mediodia", "pm")):
        if word in t:
            moment = key
            t = t.replace(word, "").strip()
    if t in ("mediodia", "el mediodia"):
        return 12, 0, "fixed"
    if t in ("medianoche", "la medianoche"):
        return 0, 0, "fixed"
    m = re.fullmatch(r"(\d{1,2})[:.h ](\d{2})", t)
    if m:
        return int(m.group(1)) % 24, int(m.group(2)) % 60, moment
    m = re.fullmatch(r"(.+?) y (media|cuarto|\d{1,2}|[a-z ]+)", t)
    if m:
        h = _num(m.group(1))
        mins = {"media": 30, "cuarto": 15}.get(m.group(2), _num(m.group(2)))
        if h is not None and mins is not None:
            return h % 24, mins % 60, moment
    m = re.fullmatch(r"(.+?) menos (cuarto|\d{1,2}|[a-z]+)", t)
    if m:
        h = _num(m.group(1))
        mins = 15 if m.group(2) == "cuarto" else _num(m.group(2))
        if h is not None and mins is not None:
            return (h - 1) % 24, (60 - mins) % 60, moment
    h = _num(t)
    if h is not None and 0 <= h <= 24:
        return h % 24, 0, moment
    return None


def split_day(texto: str) -> tuple[str, int | None]:
    """Saca «mañana», «pasado mañana», «hoy», «el jueves» del final del texto. Devuelve (texto, días a sumar)."""
    plain = _plain(texto)
    words = texto.strip().split()
    if plain.endswith("pasado manana"):
        return " ".join(words[:-2]), 2
    if plain.endswith("manana"):
        return " ".join(words[:-1]), 1
    if plain.endswith("hoy"):
        return " ".join(words[:-1]), 0
    for name, wd in WEEKDAY_WORDS.items():
        if plain.endswith(name):
            cut = 2 if plain.endswith(f"el {name}") else 1
            today = dt_util.now().weekday()
            return " ".join(words[:-cut]), (wd - today) % 7 or 7
    return texto, None


def resolve_time(h: int, m: int, moment: str | None, add_days: int | None) -> datetime:
    """Elige el día y si es a la mañana o a la tarde (la próxima que tenga sentido)."""
    now = dt_util.now()
    base = now.replace(second=0, microsecond=0)
    candidates = []
    hours = [h]
    if moment == "pm" and h < 12:
        hours = [h + 12]
    elif moment is None and 1 <= h <= 11:
        hours = [h, h + 12]  # «a las 8» puede ser 8 o 20: la que venga primero
    days = [add_days] if add_days is not None else [0, 1]
    for d in days:
        for hh in hours:
            cand = (base + timedelta(days=d)).replace(hour=hh % 24, minute=m)
            if add_days is not None or cand > now:
                candidates.append(cand)
    candidates.sort()
    if add_days is not None and moment is None and len(candidates) == 2 and hours[0] <= 6:
        # «mañana a las 3» -> 15:00 es más probable que 03:00
        return candidates[1]
    return candidates[0] if candidates else base + timedelta(days=1)


def clean_text(texto: str) -> str:
    t = texto.strip().strip(".")
    t = re.sub(r"^(que|de)\s+", "", t, flags=re.IGNORECASE)
    return t[:1].upper() + t[1:] if t else "Recordatorio"


def _recipients(hass: HomeAssistant) -> list[str]:
    services = hass.services.async_services().get("notify", {})
    return [s for s in services if s.startswith("mobile_app_")]


class _Base(intent.IntentHandler):
    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass

    def _manager(self):
        return self.hass.data.get(DOMAIN)

    async def _create(self, text: str, when: datetime) -> dict[str, Any]:
        local = dt_util.as_local(when)
        raw = {
            "name": text[:80], "icon": "mdi:bell-ring-outline", "color": "#F7B84F", "kind": "reminder", "enabled": True,
            "ui": {"text": text, "date": local.date().isoformat(), "time": f"{local.hour:02d}:{local.minute:02d}",
                   "repeat": "none", "days": [], "recipients": _recipients(self.hass), "critical": False, "nag_min": 0,
                   "voice": True},
        }
        return await self._manager().async_save(raw, None)


class AddReminder(_Base):
    intent_type = "MaeAddReminder"

    async def async_handle(self, intent_obj: intent.Intent) -> intent.IntentResponse:
        from .reminder import when_text

        slots = intent_obj.slots
        response = intent_obj.create_response()
        texto, add_days = split_day(str(slots.get("texto", {}).get("value", "")))
        parsed = parse_hour(str(slots.get("hora", {}).get("value", "")))
        if parsed is None:
            response.async_set_speech("No entendí la hora. Probá con «recordame tal cosa mañana a las 9».")
            return response
        h, m, moment = parsed
        when = resolve_time(h, m, None if moment == "fixed" else moment, add_days)
        text = clean_text(texto)
        await self._create(text, when)
        response.async_set_speech(f"Listo, te recuerdo «{text}» {when_text(when)}.")
        return response


class AddReminderIn(_Base):
    intent_type = "MaeAddReminderIn"

    async def async_handle(self, intent_obj: intent.Intent) -> intent.IntentResponse:

        slots = intent_obj.slots
        response = intent_obj.create_response()
        try:
            amount = int(slots.get("cantidad", {}).get("value"))
        except (TypeError, ValueError):
            response.async_set_speech("No entendí en cuánto tiempo.")
            return response
        unit = _plain(str(slots.get("unidad", {}).get("value", "minutos")))
        when = dt_util.now() + (timedelta(hours=amount) if unit.startswith("hora") else timedelta(minutes=amount))
        text = clean_text(str(slots.get("texto", {}).get("value", "")))
        await self._create(text, when)
        response.async_set_speech(f"Listo, en {amount} {unit} te aviso: «{text}».")
        return response


class ListReminders(_Base):
    intent_type = "MaeListReminders"

    async def async_handle(self, intent_obj: intent.Intent) -> intent.IntentResponse:
        from .reminder import when_text

        response = intent_obj.create_response()
        manager = self._manager()
        items = []
        for rule in manager.as_list():
            if rule.get("kind") == "reminder" and rule.get("enabled") and rule.get("next_at"):
                items.append((rule["next_at"], rule.get("ui", {}).get("text") or rule.get("name")))
        items.sort()
        if not items:
            response.async_set_speech("No tenés recordatorios pendientes.")
            return response
        parts = [f"{text}, {when_text(dt_util.parse_datetime(at))}" for at, text in items[:3]]
        more = f" Y {len(items) - 3} más." if len(items) > 3 else ""
        response.async_set_speech("Tenés: " + "; ".join(parts) + "." + more)
        return response


def _write_sentences(path: str) -> bool:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if os.path.exists(path):
        with open(path, encoding="utf-8") as fh:
            if fh.read() == SENTENCES:
                return False
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(SENTENCES)
    return True


async def async_setup_voice(hass: HomeAssistant) -> None:
    """Registra los intents y deja las frases en castellano para Assist."""
    for handler in (AddReminder(hass), AddReminderIn(hass), ListReminders(hass)):
        try:
            intent.async_register(hass, handler)
        except Exception:  # noqa: BLE001 - ya registrado (recarga de la integración)
            pass
    path = hass.config.path("custom_sentences", "es", f"{DOMAIN}.yaml")
    try:
        changed = await hass.async_add_executor_job(_write_sentences, path)
    except OSError:
        _LOGGER.warning("No se pudieron escribir las frases de voz en %s", path)
        return
    if changed and hass.services.has_service("conversation", "reload"):
        await hass.services.async_call("conversation", "reload", {}, blocking=False)
