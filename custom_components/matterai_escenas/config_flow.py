"""Alta de la integración y opciones (barra lateral)."""

from __future__ import annotations

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import callback

from .const import (
    CONF_SIDEBAR,
    CONF_SIDEBAR_ICON,
    CONF_SIDEBAR_TITLE,
    DEFAULT_SIDEBAR_ICON,
    DEFAULT_SIDEBAR_TITLE,
    DOMAIN,
)


class EscenasConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input=None):
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")
        if user_input is not None:
            return self.async_create_entry(title="MatterAI Escenas", data={})
        return self.async_show_form(step_id="user")

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        return EscenasOptionsFlow()


class EscenasOptionsFlow(config_entries.OptionsFlow):
    async def async_step_init(self, user_input=None):
        if user_input is not None:
            return self.async_create_entry(data=user_input)
        opts = self.config_entry.options
        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_SIDEBAR, default=opts.get(CONF_SIDEBAR, True)): bool,
                    vol.Optional(
                        CONF_SIDEBAR_TITLE,
                        default=opts.get(CONF_SIDEBAR_TITLE, DEFAULT_SIDEBAR_TITLE),
                    ): str,
                    vol.Optional(
                        CONF_SIDEBAR_ICON,
                        default=opts.get(CONF_SIDEBAR_ICON, DEFAULT_SIDEBAR_ICON),
                    ): str,
                }
            ),
        )
