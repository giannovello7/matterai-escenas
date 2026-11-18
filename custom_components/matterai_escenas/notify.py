"""Avisos al celular con botones (app MatterAI o app de Home Assistant, mismo formato) o en HA si no hay celulares."""

from __future__ import annotations

import logging
from typing import Any

from homeassistant.core import HomeAssistant

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

# Prefijo de los botones: el manager escucha mobile_app_notification_action y
# reparte la acción a la regla que corresponde.
ACTION_PREFIX = "MAE"


APP_ID = "ar.com.matterai.app"


def app_targets(hass: HomeAssistant) -> list[str]:
    """Los equipos con la app MatterAI registrados en esta casa (notify.mobile_app_<equipo>).

    Si una automatización no tiene celulares elegidos, el aviso va a todos estos: el cliente no ve Home Assistant,
    así que una notificación dentro de HA no le llegaría nunca.
    """
    from homeassistant.util import slugify  # noqa: PLC0415

    out: list[str] = []
    for entry in hass.config_entries.async_entries("mobile_app"):
        if entry.data.get("app_id") != APP_ID:
            continue
        name = f"mobile_app_{slugify(entry.data.get('device_name') or '')}"
        if name not in out and hass.services.has_service("notify", name):
            out.append(name)
    return out


def targets_for(hass: HomeAssistant, chosen: list[str] | None) -> list[str]:
    """Los elegidos que existen; si no hay ninguno, todos los equipos con la app MatterAI."""
    valid = [t for t in (chosen or []) if isinstance(t, str) and t and hass.services.has_service("notify", t)]
    return valid or app_targets(hass)


def action_id(rule_id: str, action: str) -> str:
    return f"{ACTION_PREFIX}|{rule_id}|{action}"


def parse_action(value: str) -> tuple[str, str] | None:
    parts = str(value or "").split("|")
    if len(parts) == 3 and parts[0] == ACTION_PREFIX:
        return parts[1], parts[2]
    return None


class Notifier:
    """Manda, actualiza y borra un aviso (siempre con el mismo «tag» por regla)."""

    def __init__(self, hass: HomeAssistant, rule_id: str, targets: list[str] | None) -> None:
        self.hass = hass
        self.rule_id = rule_id
        # sólo servicios notify.<x> que existan; si no hay ninguno, aviso en HA
        self.targets = [t for t in (targets or []) if isinstance(t, str) and t]

    def _valid_targets(self) -> list[str]:
        return targets_for(self.hass, self.targets)

    async def send(
        self,
        title: str,
        message: str,
        *,
        tag: str = "main",
        actions: list[tuple[str, str]] | None = None,
        critical: bool = False,
        image: str | None = None,
        links: list[tuple[str, str]] | None = None,
        silent: bool = False,
    ) -> None:
        full_tag = f"{DOMAIN}_{self.rule_id}_{tag}"
        targets = self._valid_targets()
        if not targets:
            await self.hass.services.async_call(
                "persistent_notification",
                "create",
                {"title": title, "message": message, "notification_id": full_tag},
                blocking=False,
            )
            return
        data: dict[str, Any] = {"tag": full_tag, "group": DOMAIN}
        buttons = [{"action": action_id(self.rule_id, a), "title": label} for a, label in actions or []]
        # botones que abren una dirección (ver clip, pantalla del portero…)
        buttons += [{"action": "URI", "title": label, "uri": uri} for label, uri in links or []]
        if buttons:
            data["actions"] = buttons[:3]
        if image:
            data["image"] = image
            data["attachment"] = {"url": image, "content-type": "jpeg"}
        if silent:
            data["push"] = {"interruption-level": "passive"}
            data.update({"ttl": 0, "priority": "low"})
        elif critical:
            # iOS: suena aunque esté en silencio; Android: canal de alarma, prioridad alta
            data["push"] = {
                "interruption-level": "critical",
                "sound": {"name": "default", "critical": 1, "volume": 1.0},
            }
            data.update({"ttl": 0, "priority": "high", "channel": "alarm_stream"})
        else:
            data["push"] = {"interruption-level": "time-sensitive"}
            data.update({"ttl": 0, "priority": "high"})
        for target in targets:
            try:
                await self.hass.services.async_call(
                    "notify", target, {"title": title, "message": message, "data": data}, blocking=False
                )
            except Exception:  # noqa: BLE001 - un celular caído no frena a los demás
                _LOGGER.warning("No se pudo avisar a %s", target, exc_info=True)

    async def clear(self, tag: str = "main") -> None:
        full_tag = f"{DOMAIN}_{self.rule_id}_{tag}"
        targets = self._valid_targets()
        if not targets:
            await self.hass.services.async_call(
                "persistent_notification", "dismiss", {"notification_id": full_tag}, blocking=False
            )
            return
        for target in targets:
            try:
                await self.hass.services.async_call(
                    "notify", target, {"message": "clear_notification", "data": {"tag": full_tag}}, blocking=False
                )
            except Exception:  # noqa: BLE001
                pass
