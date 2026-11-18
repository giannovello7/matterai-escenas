"""MatterAI Automatizaciones (sola): escenas y automatizaciones fáciles, para clientes que usan sólo Home Assistant.

Este paquete lo ARMA tools/escenas_sola.py del repo de la integración MatterAI: no se edita a mano.
"""

from __future__ import annotations

import logging

from homeassistant.components import frontend, panel_custom
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType

from .const import (
    CONF_SIDEBAR,
    CONF_SIDEBAR_ICON,
    CONF_SIDEBAR_TITLE,
    DEFAULT_SIDEBAR_ICON,
    DEFAULT_SIDEBAR_TITLE,
    DOMAIN,
    PANEL_ELEMENT,
    PANEL_URL_PATH,
)
from .core import PLATFORMS, async_setup_escenas, async_setup_escenas_entry, async_unload_escenas

_LOGGER = logging.getLogger(__name__)
CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    if hass.config_entries.async_entries("matterai"):
        # en una casa con MatterAI las automatizaciones ya vienen adentro: no se arranca dos veces
        _LOGGER.warning("MatterAI ya trae las automatizaciones: desinstalá «MatterAI Automatizaciones»")
        return True
    await async_setup_escenas(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    if hass.config_entries.async_entries("matterai"):
        return False
    await async_setup_escenas_entry(hass, entry)
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    await _async_register_panel(hass, entry)
    entry.async_on_unload(entry.add_update_listener(_async_options_updated))
    return True


async def _async_register_panel(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """«Automatizaciones» en la barra lateral, también para los usuarios que no son administradores."""
    if not entry.options.get(CONF_SIDEBAR, True):
        return
    await panel_custom.async_register_panel(
        hass,
        frontend_url_path=PANEL_URL_PATH,
        webcomponent_name=PANEL_ELEMENT,
        sidebar_title=entry.options.get(CONF_SIDEBAR_TITLE) or DEFAULT_SIDEBAR_TITLE,
        sidebar_icon=entry.options.get(CONF_SIDEBAR_ICON) or DEFAULT_SIDEBAR_ICON,
        module_url=hass.data[f"{DOMAIN}_js"],
        require_admin=False,
        config={},
    )
    hass.data[f"{DOMAIN}_panel"] = True


@callback
def _remove_panel(hass: HomeAssistant) -> None:
    if hass.data.pop(f"{DOMAIN}_panel", False):
        frontend.async_remove_panel(hass, PANEL_URL_PATH)


async def _async_options_updated(hass: HomeAssistant, entry: ConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    _remove_panel(hass)
    if ok:
        await async_unload_escenas(hass)
    return ok
