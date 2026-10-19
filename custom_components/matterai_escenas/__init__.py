"""MatterAI Escenas: automatizaciones fáciles para usuarios no administradores."""

from __future__ import annotations

import json
import logging
import os
import re

import voluptuous as vol

from homeassistant.components import frontend, panel_custom, websocket_api
from homeassistant.components.frontend import add_extra_js_url
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant, ServiceCall, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.start import async_at_started
from homeassistant.helpers.typing import ConfigType

from .const import (
    CARD_FILENAME,
    CARD_URL,
    CONF_SIDEBAR,
    CONF_SIDEBAR_ICON,
    CONF_SIDEBAR_TITLE,
    DEFAULT_SIDEBAR_ICON,
    DEFAULT_SIDEBAR_TITLE,
    DOMAIN,
    PANEL_ELEMENT,
    PANEL_URL_PATH,
    SIGNAL_CHANGED,
    VERSION,
    Z2M_BASE,
    Z2M_IEEE,
)
from .guest import GuestView
from .manager import InvalidRule, RuleManager
from .notify import parse_action
from .voice import async_setup_voice

_LOGGER = logging.getLogger(__name__)

PLATFORMS = [Platform.SWITCH, Platform.BUTTON, Platform.BINARY_SENSOR]
CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)


def _manager(hass: HomeAssistant) -> RuleManager:
    manager = hass.data.get(DOMAIN)
    if manager is None:
        raise InvalidRule("La integración MatterAI Escenas no está configurada")
    return manager


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    await _async_register_frontend(hass)
    # página pública de los invitados (sin usuario: la protege el link secreto)
    hass.http.register_view(GuestView(hass))

    for command in (
        ws_subscribe,
        ws_save,
        ws_delete,
        ws_run,
        ws_cancel,
        ws_set_enabled,
        ws_set_settings,
        ws_z2m_info,
        ws_z2m_setup,
        ws_action,
        ws_frigate_info,
        ws_guest_invite,
        ws_guest_delete,
    ):
        websocket_api.async_register_command(hass, command)

    async def _resolve(call: ServiceCall) -> list[str]:
        ids = list(cv.ensure_list(call.data.get("rule_id") or []))
        if call.data.get("entity_id"):
            reg = er.async_get(hass)
            for entity_id in cv.ensure_list(call.data["entity_id"]):
                entry = reg.async_get(entity_id)
                if entry and entry.platform == DOMAIN:
                    ids.append(entry.unique_id)
        return ids

    async def svc_run(call: ServiceCall) -> None:
        for rule_id in await _resolve(call):
            try:
                await _manager(hass).async_run(rule_id, call.context)
            except InvalidRule as err:
                raise HomeAssistantError(str(err)) from err

    async def svc_set_enabled(call: ServiceCall) -> None:
        for rule_id in await _resolve(call):
            await _manager(hass).async_set_enabled(rule_id, call.data["enabled"])

    target = {
        vol.Optional("rule_id"): vol.Any(cv.string, [cv.string]),
        vol.Optional("entity_id"): cv.entity_ids,
    }
    hass.services.async_register(DOMAIN, "run", svc_run, schema=vol.Schema(target))
    hass.services.async_register(
        DOMAIN,
        "set_enabled",
        svc_set_enabled,
        schema=vol.Schema({**target, vol.Required("enabled"): cv.boolean}),
    )
    return True


async def _async_register_frontend(hass: HomeAssistant) -> None:
    """Sirve la tarjeta desde la propia integración: no hace falta instalarla aparte."""
    path = os.path.join(os.path.dirname(__file__), "frontend", CARD_FILENAME)
    try:
        from homeassistant.components.http import StaticPathConfig

        await hass.http.async_register_static_paths(
            [StaticPathConfig(CARD_URL, path, False)]
        )
    except ImportError:  # HA < 2024.7
        hass.http.register_static_path(CARD_URL, path, False)
    mtime = await hass.async_add_executor_job(os.path.getmtime, path)
    hass.data[f"{DOMAIN}_js"] = f"{CARD_URL}?v={VERSION}-{int(mtime)}"
    add_extra_js_url(hass, hass.data[f"{DOMAIN}_js"])

    async def _resource(_hass=None) -> None:
        await _async_register_resource(hass)

    async_at_started(hass, _resource)


async def _async_register_resource(hass: HomeAssistant) -> None:
    """La tarjeta también como recurso del dashboard (como las de HACS).

    Así el frontend la carga antes de dibujar los paneles y no aparece
    «Error de configuración» cuando el dashboard abre antes que el script.
    Si los dashboards están en modo YAML no se puede: queda sólo add_extra_js_url.
    """
    url = hass.data[f"{DOMAIN}_js"]
    lovelace = hass.data.get("lovelace")
    resources = getattr(lovelace, "resources", None)
    if resources is None and isinstance(lovelace, dict):
        resources = lovelace.get("resources")
    if resources is None or not hasattr(resources, "async_create_item"):
        return
    try:
        if not getattr(resources, "loaded", True):
            await resources.async_load()
            resources.loaded = True
        for item in resources.async_items():
            if str(item.get("url", "")).split("?")[0] == CARD_URL:
                if item.get("url") != url:
                    await resources.async_update_item(
                        item["id"], {"res_type": "module", "url": url}
                    )
                return
        await resources.async_create_item({"res_type": "module", "url": url})
    except Exception:  # noqa: BLE001 - si falla, sigue andando con add_extra_js_url
        _LOGGER.debug("No se pudo registrar el recurso de la tarjeta", exc_info=True)


async def _async_register_panel(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Entrada propia en la barra lateral, visible también para no administradores."""
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


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    manager = RuleManager(hass)
    await manager.async_load()
    hass.data[DOMAIN] = manager
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(async_at_started(hass, manager.async_start_all))

    @callback
    def _on_notification_action(event) -> None:
        parsed = parse_action(event.data.get("action"))
        if parsed:
            manager.handle_notification_action(*parsed)

    entry.async_on_unload(
        hass.bus.async_listen("mobile_app_notification_action", _on_notification_action)
    )
    try:
        await async_setup_voice(hass)
    except Exception:  # noqa: BLE001 - la voz es un extra: si falla, el resto sigue
        _LOGGER.warning("No se pudieron activar los recordatorios por voz", exc_info=True)
    await _async_register_panel(hass, entry)
    entry.async_on_unload(entry.add_update_listener(_async_options_updated))
    return True


async def _async_options_updated(hass: HomeAssistant, entry: ConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    _remove_panel(hass)
    if ok:
        manager: RuleManager = hass.data.pop(DOMAIN)
        await manager.async_stop_all()
    return ok


# ---------------- websocket (sin require_admin: lo usan todos los usuarios) ----------------


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/subscribe"})
@callback
def ws_subscribe(hass: HomeAssistant, connection, msg: dict) -> None:
    try:
        manager = _manager(hass)
    except InvalidRule as err:
        connection.send_error(msg["id"], "not_configured", str(err))
        return

    @callback
    def forward() -> None:
        connection.send_message(
            websocket_api.event_message(
                msg["id"],
                {
                    "rules": manager.as_list(),
                    "settings": manager.settings,
                    "is_admin": connection.user.is_admin,
                },
            )
        )

    connection.subscriptions[msg["id"]] = async_dispatcher_connect(
        hass, SIGNAL_CHANGED, forward
    )
    connection.send_result(msg["id"])
    forward()


async def _guard(connection, msg: dict, factory) -> None:
    try:
        result = await factory()
    except InvalidRule as err:
        connection.send_error(msg["id"], "invalid_rule", str(err))
        return
    connection.send_result(msg["id"], result)


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/save", vol.Required("rule"): dict}
)
@websocket_api.async_response
async def ws_save(hass: HomeAssistant, connection, msg: dict) -> None:
    await _guard(
        connection, msg, lambda: _manager(hass).async_save(msg["rule"], connection.user)
    )


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/delete", vol.Required("rule_id"): str}
)
@websocket_api.async_response
async def ws_delete(hass: HomeAssistant, connection, msg: dict) -> None:
    await _guard(connection, msg, lambda: _manager(hass).async_delete(msg["rule_id"]))


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/run", vol.Required("rule_id"): str}
)
@websocket_api.async_response
async def ws_run(hass: HomeAssistant, connection, msg: dict) -> None:
    await _guard(
        connection,
        msg,
        lambda: _manager(hass).async_run(msg["rule_id"], connection.context(msg)),
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/set_enabled",
        vol.Required("rule_id"): str,
        vol.Required("enabled"): bool,
    }
)
@websocket_api.async_response
async def ws_set_enabled(hass: HomeAssistant, connection, msg: dict) -> None:
    await _guard(
        connection,
        msg,
        lambda: _manager(hass).async_set_enabled(msg["rule_id"], msg["enabled"]),
    )


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/cancel", vol.Required("rule_id"): str}
)
@websocket_api.async_response
async def ws_cancel(hass: HomeAssistant, connection, msg: dict) -> None:
    """Cancela un temporizador en marcha (si es reutilizable queda guardado)."""
    await _guard(connection, msg, lambda: _manager(hass).async_timer_done(msg["rule_id"]))


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/set_settings", vol.Required("settings"): dict}
)
@websocket_api.require_admin
@callback
def ws_set_settings(hass: HomeAssistant, connection, msg: dict) -> None:
    """Sólo el instalador decide qué equipos ve el cliente."""
    try:
        _manager(hass).set_settings(msg["settings"])
    except InvalidRule as err:
        connection.send_error(msg["id"], "invalid_rule", str(err))
        return
    connection.send_result(msg["id"])


# ---------------- Zigbee2MQTT (luz circadiana con la lámpara apagada) ----------------


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/z2m_info", vol.Required("entity_ids"): [str]}
)
@callback
def ws_z2m_info(hass: HomeAssistant, connection, msg: dict) -> None:
    """Dirección IEEE de cada luz que viene de Zigbee2MQTT (None si no lo es)."""
    ent_reg = er.async_get(hass)
    dev_reg = dr.async_get(hass)
    out: dict[str, str | None] = {}
    for entity_id in msg["entity_ids"]:
        ieee = None
        ent = ent_reg.async_get(entity_id)
        dev = dev_reg.async_get(ent.device_id) if ent and ent.device_id else None
        if ent and ent.platform == "mqtt" and dev:
            for domain, ident in dev.identifiers:
                ident = str(ident)
                if domain == "mqtt" and ident.startswith("zigbee2mqtt_0x"):
                    ieee = ident[len("zigbee2mqtt_"):]
        out[entity_id] = ieee
    connection.send_result(
        msg["id"], {"lights": out, "mqtt": "mqtt" in hass.config.components}
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/z2m_setup",
        vol.Required("ieee"): [str],
        vol.Required("base"): str,
    }
)
@websocket_api.async_response
async def ws_z2m_setup(hass: HomeAssistant, connection, msg: dict) -> None:
    """Activa execute_if_off en cada lámpara: así acepta el tono estando apagada."""
    base = msg["base"].strip("/")
    if not re.match(Z2M_BASE, base) or not all(re.match(Z2M_IEEE, i) for i in msg["ieee"]):
        connection.send_error(msg["id"], "invalid", "Datos de Zigbee2MQTT inválidos")
        return
    if "mqtt" not in hass.config.components:
        connection.send_error(msg["id"], "no_mqtt", "La integración MQTT no está configurada")
        return
    for ieee in msg["ieee"]:
        await hass.services.async_call(
            "mqtt",
            "publish",
            {
                "topic": f"{base}/bridge/request/device/options",
                "payload": json.dumps(
                    {"id": ieee, "options": {"color_options": {"execute_if_off": True}}}
                ),
            },
            blocking=True,
        )
    connection.send_result(msg["id"], {"ok": len(msg["ieee"])})


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/action", vol.Required("rule_id"): str, vol.Required("action"): vol.In(["open", "open2", "test", "ignore", "cine_toggle", "cine_on", "cine_off"])}
)
@websocket_api.async_response
async def ws_action(hass: HomeAssistant, connection, msg: dict) -> None:
    """Acciones de la tarjeta: abrir la puerta / el portón desde la pantalla del portero."""
    await _guard(connection, msg, lambda: _manager(hass).async_action(msg["rule_id"], msg["action"]))


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/frigate_info"})
@callback
def ws_frigate_info(hass: HomeAssistant, connection, msg: dict) -> None:
    """Cámaras, zonas, objetos, caras y patentes que vio Frigate (para la tarjeta)."""
    try:
        manager = _manager(hass)
    except InvalidRule as err:
        connection.send_error(msg["id"], "not_configured", str(err))
        return
    connection.send_result(msg["id"], manager.frigate.info())


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/guest_invite", vol.Required("rule_id"): str, vol.Required("invite"): dict}
)
@websocket_api.async_response
async def ws_guest_invite(hass: HomeAssistant, connection, msg: dict) -> None:
    """Crea o cambia una invitación (link para que un invitado abra sin depender de vos)."""
    await _guard(connection, msg, lambda: _manager(hass).async_guest_invite(msg["rule_id"], msg["invite"], connection.user))


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/guest_delete", vol.Required("rule_id"): str, vol.Required("invite_id"): str}
)
@websocket_api.async_response
async def ws_guest_delete(hass: HomeAssistant, connection, msg: dict) -> None:
    await _guard(connection, msg, lambda: _manager(hass).async_guest_delete(msg["rule_id"], msg["invite_id"]))
