"""Un sensor por «Luz por presencia»: ocupado / libre."""

from __future__ import annotations

from typing import Any

from homeassistant.components.binary_sensor import BinarySensorDeviceClass, BinarySensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import KIND_ROOM
from .entity import RuleEntity, setup_rule_platform


class RoomOccupancy(RuleEntity, BinarySensorEntity):
    _attr_device_class = BinarySensorDeviceClass.OCCUPANCY

    @property
    def _room(self):
        runner = self.manager.runners.get(self.rule_id)
        return runner.room if runner else None

    @property
    def is_on(self) -> bool:
        return bool(self._room and self._room.occupied)

    @property
    def icon(self) -> str | None:
        return None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        room = self._room
        return {
            "rule_id": self.rule_id,
            "puerta_cerrada_con_alguien": bool(room and room.sealed),
            "ultimo_movimiento": room.last_motion.isoformat() if room and room.last_motion else None,
            "ultima_decision": (getattr(room, "last_decision", None) or {}).get("text") if room else None,
        }


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities) -> None:
    setup_rule_platform(
        hass,
        entry,
        async_add_entities,
        lambda rule: rule.get("kind") == KIND_ROOM,
        RoomOccupancy,
        "binary_sensor",
    )
