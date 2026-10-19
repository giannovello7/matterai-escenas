"""Un botón por escena de un toque (sirve para dashboards, Alexa/Google, etc.)."""

from __future__ import annotations

from homeassistant.components.button import ButtonEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import KIND_NIGHT, KIND_SCENE, KIND_TIMER
from .entity import RuleEntity, setup_rule_platform


class RuleButton(RuleEntity, ButtonEntity):
    async def async_press(self) -> None:
        await self.manager.async_run(self.rule_id)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities) -> None:
    setup_rule_platform(
        hass,
        entry,
        async_add_entities,
        lambda rule: rule.get("kind") in (KIND_SCENE, KIND_NIGHT)
        or (rule.get("kind") == KIND_TIMER and rule.get("keep")),
        RuleButton,
        "button",
    )
