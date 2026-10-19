"""Entidades por regla: switch (activar/pausar) y button (escenas de un toque)."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity import Entity

from .const import DOMAIN, SIGNAL_CHANGED
from .manager import RuleManager


class RuleEntity(Entity):
    _attr_should_poll = False
    suffix = ""  # para tener más de una entidad por regla en la misma plataforma

    def __init__(self, manager: RuleManager, rule_id: str) -> None:
        self.manager = manager
        self.rule_id = rule_id
        self._attr_unique_id = f"{rule_id}{self.suffix}"

    @property
    def rule(self) -> dict[str, Any]:
        return self.manager.rules.get(self.rule_id, {})

    @property
    def name(self) -> str:
        return self.rule.get("name", self.rule_id)

    @property
    def icon(self) -> str | None:
        return self.rule.get("icon")

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        rule = self.rule
        return {
            "rule_id": self.rule_id,
            "kind": rule.get("kind"),
            "last_run": rule.get("last_run"),
            "runs": rule.get("runs", 0),
            "created_by": rule.get("created_by"),
        }


def setup_rule_platform(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities,
    wants: Callable[[dict[str, Any]], bool],
    factory: Callable[[RuleManager, str], RuleEntity],
    platform_domain: str,
    suffix: str = "",
) -> None:
    """Agrega/quita entidades a medida que se crean/borran reglas."""
    manager: RuleManager = hass.data[DOMAIN]
    known: dict[str, RuleEntity] = {}
    registry = er.async_get(hass)

    @callback
    def sync() -> None:
        wanted = {rid for rid, rule in manager.rules.items() if wants(rule)}
        new = [factory(manager, rid) for rid in wanted - known.keys()]
        for ent in new:
            known[ent.rule_id] = ent
        if new:
            async_add_entities(new)
        for rid in list(known.keys() - wanted):
            ent = known.pop(rid)
            if ent.entity_id and registry.async_get(ent.entity_id):
                registry.async_remove(ent.entity_id)
        for ent in known.values():
            if ent.hass and ent.entity_id:
                ent.async_write_ha_state()
        # restos de reglas borradas con HA apagado
        for reg in er.async_entries_for_config_entry(registry, entry.entry_id):
            uid = str(reg.unique_id)
            mine = uid.endswith(suffix) if suffix else "_" not in uid
            if reg.domain == platform_domain and mine and uid.removesuffix(suffix) not in wanted:
                registry.async_remove(reg.entity_id)

    sync()
    entry.async_on_unload(async_dispatcher_connect(hass, SIGNAL_CHANGED, sync))
