"""Un switch por automatización: encendido = activa, apagado = pausada."""

from __future__ import annotations

from typing import Any

from homeassistant.components.switch import SwitchEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.event import async_call_later

from .const import KIND_GATE, KIND_SCENE, KIND_TIMER, KIND_TV
from .entity import RuleEntity, setup_rule_platform


class RuleSwitch(RuleEntity, SwitchEntity):
    @property
    def is_on(self) -> bool:
        return bool(self.rule.get("enabled", True))

    async def async_turn_on(self, **kwargs: Any) -> None:
        await self.manager.async_set_enabled(self.rule_id, True)

    async def async_turn_off(self, **kwargs: Any) -> None:
        await self.manager.async_set_enabled(self.rule_id, False)


class SceneVoiceSwitch(RuleEntity, SwitchEntity):
    """Pulsador para Alexa / Google (Matter): al prenderlo ejecuta la escena y vuelve a apagarse."""

    suffix = "_voz"
    _pulse = False

    @property
    def is_on(self) -> bool:
        return self._pulse

    async def async_turn_on(self, **kwargs: Any) -> None:
        await self.manager.async_run(self.rule_id)
        self._pulse = True
        self.async_write_ha_state()

        @callback
        def _back(_now) -> None:
            self._pulse = False
            self.async_write_ha_state()

        async_call_later(self.hass, 2, _back)

    async def async_turn_off(self, **kwargs: Any) -> None:
        self._pulse = False
        self.async_write_ha_state()


class CineSwitch(RuleEntity, SwitchEntity):
    """«Modo cine» de la Tele inteligente: prendido = modo cine activo."""

    suffix = "_cine"
    _attr_icon = "mdi:movie-open"

    def _ctl(self):
        runner = self.manager.runners.get(self.rule_id)
        return runner.room if runner else None

    @property
    def name(self) -> str:
        return self.rule.get("ui", {}).get("cine_switch_name") or "Modo cine"

    @property
    def is_on(self) -> bool:
        ctl = self._ctl()
        return bool(ctl and ctl.cine)

    async def async_turn_on(self, **kwargs: Any) -> None:
        ctl = self._ctl()
        if ctl:
            ctl.force_cine(True)

    async def async_turn_off(self, **kwargs: Any) -> None:
        ctl = self._ctl()
        if ctl:
            ctl.force_cine(False)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities) -> None:
    setup_rule_platform(
        hass,
        entry,
        async_add_entities,
        lambda rule: rule.get("kind") not in (KIND_SCENE, KIND_TIMER, KIND_GATE),
        RuleSwitch,
        "switch",
    )
    setup_rule_platform(
        hass, entry, async_add_entities,
        lambda rule: rule.get("kind") == KIND_SCENE and bool(rule.get("ui", {}).get("voice")),
        SceneVoiceSwitch, "switch", "_voz",
    )
    setup_rule_platform(
        hass, entry, async_add_entities,
        lambda rule: rule.get("kind") == KIND_TV and bool(rule.get("ui", {}).get("cine_switch")) and rule.get("enabled", True),
        CineSwitch, "switch", "_cine",
    )
