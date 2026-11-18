"""La integración de automatizaciones sola (sin MatterAI) arranca y anda en un Home Assistant real de pruebas."""
from __future__ import annotations

from types import SimpleNamespace

import pytest

from homeassistant.setup import async_setup_component

from pytest_homeassistant_custom_component.common import MockConfigEntry

import custom_components.matterai_escenas  # noqa: F401 - que HA encuentre la de este repo

DOMAIN = "matterai_escenas"


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations):
    yield


async def _setup(hass):
    await async_setup_component(hass, "http", {})
    hass.states.async_set("light.living", "off", {"friendly_name": "Living"})
    entry = MockConfigEntry(domain=DOMAIN, data={}, title="MatterAI Automatizaciones")
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry, hass.data[DOMAIN]


def _scene(rid="esc1") -> dict:
    return {"id": rid, "kind": "scene", "name": "Cine", "enabled": True, "mode": "single",
            "ui": {"triggers": [], "conditions": [], "cond_mode": "all", "actions": [{"type": "device"}]},
            "triggers": [], "conditions": [], "actions": [{"action": "light.turn_on", "target": {"entity_id": "light.living"}}]}


async def test_arranca_sola_con_servicios_tarjeta_y_barra_lateral(hass, hass_ws_client) -> None:
    entry, manager = await _setup(hass)
    # servicios propios (en MatterAI son matterai.run)
    assert hass.services.has_service(DOMAIN, "run") and hass.services.has_service(DOMAIN, "set_enabled")
    # «Automatizaciones» en la barra lateral, también para no administradores
    panels = hass.data["frontend_panels"]
    assert "automatizaciones" in panels and panels["automatizaciones"].require_admin is False
    ws = await hass_ws_client(hass)
    await ws.send_json({"id": 1, "type": f"{DOMAIN}/subscribe"})
    msg = await ws.receive_json()
    assert msg["success"]
    ev = await ws.receive_json()
    assert ev["event"]["has_app"] is False and ev["event"]["app_entities"] is None


async def test_un_cliente_guarda_y_ejecuta_una_escena(hass) -> None:
    entry, manager = await _setup(hass)
    client = SimpleNamespace(is_admin=False, name="Cliente")
    rule = await manager.async_save(_scene(), client)
    assert rule["kind"] == "scene"
    calls = []
    hass.services.async_register("light", "turn_on", lambda call: calls.append(call))
    await hass.services.async_call(DOMAIN, "run", {"rule_id": "esc1"}, blocking=True)
    await hass.async_block_till_done()
    assert calls, "la escena prendió la luz"
    # entidades del dominio propio (el botón de la escena)
    assert any(e.startswith("button.") or e.startswith("switch.") for e in hass.states.async_entity_ids() if "cine" in e)


async def test_permisos_del_instalador(hass) -> None:
    entry, manager = await _setup(hass)
    manager.set_settings({"client_off": ["scene"], "opt_off": ["a:device"], "tabs_off": ["auto"], "ents_mode": "pick", "shown": ["light.living"]})
    from custom_components.matterai_escenas.manager import InvalidRule  # noqa: PLC0415
    with pytest.raises(InvalidRule):
        await manager.async_save(_scene("x"), SimpleNamespace(is_admin=False, name="Cliente"))
    assert manager.settings["ents_mode"] == "pick"


async def test_se_descarga_y_vuelve(hass) -> None:
    entry, manager = await _setup(hass)
    assert await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()
    assert DOMAIN not in hass.data
    assert "automatizaciones" not in hass.data["frontend_panels"]
