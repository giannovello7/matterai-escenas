"""Una entidad de portón por cada «Portón inteligente»."""

from __future__ import annotations

from typing import Any

from homeassistant.components.cover import CoverDeviceClass, CoverEntity, CoverEntityFeature
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import KIND_GATE
from .entity import RuleEntity, setup_rule_platform


class SmartGate(RuleEntity, CoverEntity):
    _attr_supported_features = CoverEntityFeature.OPEN | CoverEntityFeature.CLOSE

    @property
    def _gate(self):
        runner = self.manager.runners.get(self.rule_id)
        return runner.room if runner else None

    @property
    def device_class(self) -> CoverDeviceClass:
        return CoverDeviceClass.GARAGE if self.rule.get("ui", {}).get("gate_type") == "garage" else CoverDeviceClass.GATE

    @property
    def icon(self) -> str | None:
        return None  # el de HA según el estado (abierto, cerrado, moviéndose)

    @property
    def available(self) -> bool:
        return self._gate is not None

    @property
    def is_closed(self) -> bool | None:
        g = self._gate
        return g.is_closed() if g else None

    @property
    def is_opening(self) -> bool:
        g = self._gate
        return bool(g and g.moving == "opening")

    @property
    def is_closing(self) -> bool:
        g = self._gate
        return bool(g and g.moving == "closing")

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        g = self._gate
        return {
            "rule_id": self.rule_id,
            "tiempo_de_recorrido": round(g.travel) if g else None,
            "aprendido": bool(g and g.learned and not float(self.rule.get("ui", {}).get("travel_s") or 0)),
            "ultimo_estado": g.status if g else None,
        }

    async def async_open_cover(self, **kwargs: Any) -> None:
        if self._gate:
            self._gate.open()

    async def async_close_cover(self, **kwargs: Any) -> None:
        if self._gate:
            self._gate.close()


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities) -> None:
    setup_rule_platform(hass, entry, async_add_entities, lambda rule: rule.get("kind") == KIND_GATE, SmartGate, "cover")
