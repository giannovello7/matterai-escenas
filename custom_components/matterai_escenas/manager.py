"""Motor de reglas: guarda, valida y ejecuta lo que se arma desde la tarjeta.

Cada regla guarda dos cosas:
- `ui`: el modelo que usa la tarjeta para volver a editarla (opaco para el backend).
- `triggers` / `conditions` / `actions` / `on_stop`: configuración nativa de Home
  Assistant ya compilada por la tarjeta. Acá se valida con los mismos esquemas que
  usan las automatizaciones de HA y se ejecuta con los helpers oficiales
  (trigger + script), sin tocar automations.yaml.
"""

from __future__ import annotations

import copy
import logging
import re
import uuid
from datetime import timedelta
from typing import Any

import voluptuous as vol

from homeassistant.core import CALLBACK_TYPE, Context, HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.event import async_track_point_in_utc_time
from homeassistant.helpers.script import Script, async_validate_actions_config
from homeassistant.helpers.storage import Store
from homeassistant.helpers.trigger import (
    async_initialize_triggers,
    async_validate_trigger_config,
)
from homeassistant.util import dt as dt_util

from .away import AwayController
from .clima import ClimaController
from .doorbell import DoorbellController
from .frigate import FDetectController, FFaceController, FrigateHub
from .gate import GateController
from .guest import DOMAINS as GUEST_DOMAINS, GUEST_PATH as GUEST_LINK, MAX_INVITES, GuestController, base_url, clean_invite
from .night import NightController
from .reminder import CalAlertController, ReminderController
from .tv import TvController
from .wake import WakeController
from .room import FAN_DOMAINS, LIGHT_DOMAINS, RoomController
from .watch import WATCH_DOMAINS, WatchController

from .const import (
    ALLOWED_HA_SERVICES,
    ALLOWED_SERVICE_DOMAINS,
    ALLOWED_TRIGGER_PLATFORMS,
    DOMAIN,
    KIND_CIRCADIAN,
    KIND_IRRIGATION,
    KIND_AWAY,
    KIND_CLIMA,
    KIND_NIGHT,
    KIND_WAKE,
    KIND_REMINDER,
    KIND_CALALERT,
    KIND_DOORBELL,
    KIND_FDETECT,
    KIND_FFACE,
    KIND_TV,
    KIND_GUEST,
    KIND_GATE,
    INSTALLER_KINDS,
    DEFAULT_CLIENT_OFF,
    RUNNABLE_CONTROLLERS,
    KIND_PERIOD,
    KIND_ROOM,
    KIND_SCENE,
    KIND_WATCH,
    CONTROLLER_KINDS,
    KIND_TIMER,
    KINDS,
    LOOP_KINDS,
    MODES,
    SIGNAL_CHANGED,
    STORAGE_KEY,
    STORAGE_VERSION,
    TRIGGERED_KINDS,
    Z2M_TONE_TOPIC,
)

_LOGGER = logging.getLogger(__name__)

# tipos de regla que maneja una máquina de estados en Python
CONTROLLERS = {
    KIND_ROOM: RoomController,
    KIND_WATCH: WatchController,
    KIND_AWAY: AwayController,
    KIND_NIGHT: NightController,
    KIND_CLIMA: ClimaController,
    KIND_WAKE: WakeController,
    KIND_REMINDER: ReminderController,
    KIND_CALALERT: CalAlertController,
    KIND_DOORBELL: DoorbellController,
    KIND_FDETECT: FDetectController,
    KIND_FFACE: FFaceController,
    KIND_TV: TvController,
    KIND_GUEST: GuestController,
    KIND_GATE: GateController,
}

# Si HA estuvo apagado cuando vencía un temporizador, se ejecuta igual
# siempre que no haya pasado más que esto.
TIMER_GRACE = timedelta(minutes=10)


class InvalidRule(HomeAssistantError):
    """La regla no se puede guardar (mensaje pensado para el usuario final)."""


def installer_only(rule: dict[str, Any]) -> bool:
    """Reglas que arman «equipos» (portón, sensor de ocupación): sólo el instalador las toca."""
    return rule.get("kind") in INSTALLER_KINDS or (rule.get("kind") == KIND_ROOM and bool((rule.get("ui") or {}).get("only_sensor")))


def _rule_opts(rule: dict[str, Any] | None) -> set[str]:
    """Las opciones que usa una regla armada a mano: «t:time», «c:sun», «a:notify»…"""
    ui = (rule or {}).get("ui") or {}
    out: set[str] = set()
    for key, pre in (("triggers", "t"), ("conditions", "c"), ("actions", "a")):
        for item in ui.get(key) or []:
            if isinstance(item, dict) and item.get("type"):
                out.add(f"{pre}:{item['type']}")
    return out


def _is_admin(user) -> bool:
    return user is None or bool(getattr(user, "is_admin", False))


# lo propio de cada casa: no viaja en las plantillas
TEMPLATE_DROP = ("history", "invites", "learned_s", "runs", "last_run", "created", "created_by", "updated", "fire_at")
# Lo que nunca sale de la casa en las copias que van al panel central: los links de invitado (abren portones)
# y los historiales (quién usó cada link, desde qué IP, quién tocó el timbre).
PRIVATE_DROP = ("invites", "history")
_ENTITY_RE = re.compile(r"^[a-z_]+\.[a-z0-9_]+$")
_ENTITY_DOMAINS = {
    "light", "switch", "binary_sensor", "sensor", "cover", "climate", "fan", "lock", "media_player", "camera", "alarm_control_panel",
    "input_boolean", "input_button", "input_number", "input_select", "button", "scene", "script", "valve", "vacuum", "siren",
    "humidifier", "water_heater", "remote", "event", "calendar", "weather", "person", "device_tracker", "number", "select", "update",
}


def _replace_entities(node: Any, mapping: dict[str, str]) -> Any:
    """Reemplaza ids de entidades en toda la regla, también como clave «dominio__objeto» (la usa la tarjeta)."""
    keyed = {k.replace(".", "__"): v.replace(".", "__") for k, v in mapping.items()}
    if isinstance(node, dict):
        return {keyed.get(k, mapping.get(k, k)) if isinstance(k, str) else k: _replace_entities(v, mapping) for k, v in node.items()}
    if isinstance(node, list):
        return [_replace_entities(v, mapping) for v in node]
    if isinstance(node, str):
        return mapping.get(node, node)
    return node


def _entity_refs(node: Any) -> set[str]:
    """Entidades que nombra una regla (para avisar cuáles no existen en otra casa)."""
    out: set[str] = set()
    if isinstance(node, dict):
        for value in node.values():
            out |= _entity_refs(value)
    elif isinstance(node, list):
        for value in node:
            out |= _entity_refs(value)
    elif isinstance(node, str) and _ENTITY_RE.match(node) and node.split(".")[0] in _ENTITY_DOMAINS:
        out.add(node)
    return out


def build_sequence(rule: dict[str, Any]) -> list[dict[str, Any]]:
    """Condiciones + acciones como una única secuencia de script.

    Las condiciones se saltean cuando la regla se ejecuta a mano (`is_manual`).
    """
    seq: list[dict[str, Any]] = []
    if rule.get("conditions"):
        seq.append(
            {
                "condition": "or",
                "conditions": [
                    {
                        "condition": "template",
                        "value_template": "{{ is_manual | default(false) }}",
                    },
                    {"condition": "and", "conditions": rule["conditions"]},
                ],
            }
        )
    seq.extend(rule.get("actions") or [])
    return seq


def _walk(node: Any):
    if isinstance(node, dict):
        yield node
        for value in node.values():
            yield from _walk(value)
    elif isinstance(node, list):
        for value in node:
            yield from _walk(value)


def check_permissions(rule: dict[str, Any]) -> None:
    """Limita lo que puede guardar un usuario que no es administrador."""
    for trig in rule["triggers"]:
        platform = trig.get("platform") or trig.get("trigger")
        if platform not in ALLOWED_TRIGGER_PLATFORMS:
            raise InvalidRule(f"Disparador no permitido: {platform}")

    for node in _walk([rule["conditions"], rule["actions"], rule["on_stop"]]):
        for key in ("service", "action", "service_template"):
            svc = node.get(key)
            if not isinstance(svc, str) or (key == "action" and "." not in svc):
                continue
            if key == "service_template" or "{" in svc:
                raise InvalidRule("No se permiten servicios dinámicos")
            domain, _, service = svc.partition(".")
            if domain == "homeassistant" and service in ALLOWED_HA_SERVICES:
                continue
            if svc == "mqtt.publish":
                data = node.get("data") or {}
                topic = data.get("topic")
                if (
                    isinstance(topic, str)
                    and re.match(Z2M_TONE_TOPIC, topic)
                    and set(data) <= {"topic", "payload"}
                ):
                    continue
                raise InvalidRule("Sólo se permite enviar el tono de blanco a Zigbee2MQTT")
            if domain not in ALLOWED_SERVICE_DOMAINS:
                raise InvalidRule(
                    f"No tenés permiso para usar «{svc}». Pedíselo a tu instalador."
                )
        if "event" in node and "platform" not in node and "trigger" not in node:
            raise InvalidRule("No se permite disparar eventos")


def _validate_room(ui: dict[str, Any]) -> None:
    def ids(key: str) -> list[str]:
        value = ui.get(key) or []
        if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
            raise InvalidRule("Formato inválido")
        return value

    lights = ids("lights")
    if not lights and not ui.get("only_sensor"):
        raise InvalidRule("Elegí las luces")
    if not ids("motion") and not ids("presence"):
        raise InvalidRule("Elegí al menos un sensor de movimiento o de presencia")
    ids("doors")
    # también para no administradores: sólo se prenden/apagan luces, llaves y extractores
    if any(e.split(".")[0] not in LIGHT_DOMAINS for e in lights):
        raise InvalidRule("Sólo se pueden usar luces, llaves o ventiladores")
    fan = ui.get("fan")
    if fan and (not isinstance(fan, str) or fan.split(".")[0] not in FAN_DOMAINS):
        raise InvalidRule("El extractor tiene que ser un ventilador o una llave")


def _str_list(ui: dict[str, Any], key: str) -> list[str]:
    value = ui.get(key) or []
    if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
        raise InvalidRule("Formato inválido")
    return value


def _validate_lists(ui: dict[str, Any], allowed: dict[str, set[str]]) -> None:
    for key, domains in allowed.items():
        if any(e.split(".")[0] not in domains for e in _str_list(ui, key)):
            raise InvalidRule("Hay un equipo que no corresponde en la lista")


def _validate_watch(ui: dict[str, Any]) -> None:
    items = ui.get("items") or []
    if not isinstance(items, list) or not items:
        raise InvalidRule("Elegí qué vigilar")
    for item in items:
        if not isinstance(item, dict) or not isinstance(item.get("entity"), str):
            raise InvalidRule("Formato inválido")
        if item["entity"].split(".")[0] not in WATCH_DOMAINS:
            raise InvalidRule(f"No se puede vigilar {item['entity']}")
    _str_list(ui, "recipients")


def _validate_away(ui: dict[str, Any]) -> None:
    for key in ("lights_list", "climate_list", "covers_list", "switches", "locks", "welcome", "arrive_climate", "cancel_motion", "check_list", "recipients", "rules_on"):
        _str_list(ui, key)
    allowed = {
        "lights_list": {"light", "switch"}, "climate_list": {"climate"}, "covers_list": {"cover"},
        "switches": {"switch", "input_boolean", "fan", "light"}, "locks": {"lock"},
        "welcome": {"light", "switch"}, "arrive_climate": {"climate"},
    }
    for key, domains in allowed.items():
        if any(e.split(".")[0] not in domains for e in ui.get(key) or []):
            raise InvalidRule("Hay un equipo que no corresponde en la lista")
    if ui.get("detect", "people") == "alarm" and not ui.get("alarm"):
        raise InvalidRule("Elegí la alarma")


class RuleRunner:
    """Mantiene viva una regla: triggers, bucle o temporizador."""

    def __init__(self, manager: RuleManager, rule: dict[str, Any]) -> None:
        self.manager = manager
        self.hass = manager.hass
        self.rule = rule
        self._unsubs: list[CALLBACK_TYPE] = []
        self._script: Script | None = None
        self._stop_script: Script | None = None
        self.room = None  # máquina de estados (luz por presencia, avisos, me voy/llego)

    @property
    def is_running(self) -> bool:
        return bool(self._script and self._script.is_running)

    async def _async_make_script(self, seq: list, mode: str) -> Script:
        seq = await async_validate_actions_config(self.hass, cv.SCRIPT_SCHEMA(seq))
        return Script(
            self.hass,
            seq,
            self.rule["name"],
            DOMAIN,
            running_description="escena",
            script_mode=mode,
            max_runs=10,
            max_exceeded="SILENT",
            logger=_LOGGER,
        )

    async def async_start(self) -> None:
        rule = self.rule
        kind = rule["kind"]
        if kind in CONTROLLER_KINDS:
            # la maneja su propia máquina de estados
            if rule.get("enabled", True):
                cls = CONTROLLERS[kind]
                if kind == KIND_ROOM:
                    self.room = cls(self.hass, rule, self.manager.notify_changed)
                else:
                    self.room = cls(self.hass, rule, self.manager.notify_changed, self.manager)
                self.room.start()
            return
        try:
            mode = "single" if kind in LOOP_KINDS else rule.get("mode", "restart")
            self._script = await self._async_make_script(
                copy.deepcopy(build_sequence(rule)), mode
            )
            if rule.get("on_stop"):
                self._stop_script = await self._async_make_script(
                    copy.deepcopy(rule["on_stop"]), "parallel"
                )
        except (vol.Invalid, HomeAssistantError) as err:
            _LOGGER.error("Regla «%s» inválida: %s", rule["name"], err)
            self._script = None
            return

        if not rule.get("enabled", True) or kind == KIND_SCENE:
            return

        if kind in TRIGGERED_KINDS:
            try:
                triggers = await async_validate_trigger_config(
                    self.hass, cv.TRIGGER_SCHEMA(copy.deepcopy(rule["triggers"]))
                )
            except (vol.Invalid, HomeAssistantError) as err:
                _LOGGER.error("Disparadores inválidos en «%s»: %s", rule["name"], err)
                return
            remove = await async_initialize_triggers(
                self.hass,
                triggers,
                self._async_triggered,
                DOMAIN,
                rule["name"],
                self._log,
            )
            if remove:
                self._unsubs.append(remove)
            if kind == KIND_CIRCADIAN or (
                kind == KIND_PERIOD and rule.get("ui", {}).get("catch_up")
            ):
                # al guardar, activar o reiniciar HA: llevar ya las luces prendidas a su
                # valor (sin el filtro de «cambio manual», que todavía no tiene referencia)
                self.hass.async_create_task(self.async_run_manual())

        elif kind in LOOP_KINDS:
            self.hass.async_create_background_task(
                self._async_execute({"is_manual": False}, Context()),
                f"{DOMAIN}_loop_{rule['id']}",
            )

        elif kind == KIND_TIMER:
            when = dt_util.parse_datetime(rule.get("fire_at") or "")
            if when is None:
                return
            when = dt_util.as_utc(when)
            now = dt_util.utcnow()
            if when <= now - TIMER_GRACE:
                self.hass.async_create_task(self.manager.async_timer_done(rule["id"]))
            elif when <= now:
                self.hass.async_create_task(self._async_fire_timer())
            else:
                self._unsubs.append(
                    async_track_point_in_utc_time(
                        self.hass, self._timer_cb, when
                    )
                )

    @callback
    def _log(self, level: int, msg: str, **kwargs: Any) -> None:
        _LOGGER.log(level, "%s: %s", self.rule["name"], msg, **kwargs)

    @callback
    def _timer_cb(self, _now) -> None:
        self.hass.async_create_task(self._async_fire_timer())

    async def _async_fire_timer(self) -> None:
        await self._async_execute({"is_manual": False}, Context())
        await self.manager.async_timer_done(self.rule["id"])

    async def _async_triggered(self, run_variables: dict, context: Context | None = None):
        variables = {**(run_variables or {}), "is_manual": False}
        parent = context.id if context else None
        await self._async_execute(variables, Context(parent_id=parent))

    async def _async_execute(self, variables: dict, context: Context) -> None:
        if not self._script:
            return
        self.manager.record_run(self.rule["id"])
        try:
            await self._script.async_run(variables, context=context)
        except Exception:  # noqa: BLE001 - un error de un equipo no debe romper el motor
            _LOGGER.exception("Error ejecutando «%s»", self.rule["name"])

    async def async_run_manual(self, context: Context | None = None) -> None:
        if not self._script:
            raise InvalidRule("La regla tiene errores y no se puede ejecutar")
        self.hass.async_create_task(
            self._async_execute({"is_manual": True}, context or Context())
        )

    async def async_run_stop_actions(self) -> None:
        if self._stop_script:
            try:
                await self._stop_script.async_run({}, context=Context())
            except Exception:  # noqa: BLE001
                _LOGGER.exception("Error al apagar «%s»", self.rule["name"])

    async def async_stop(self, run_stop_actions: bool = False) -> None:
        if self.room:
            self.room.stop()
            self.room = None
        for unsub in self._unsubs:
            unsub()
        self._unsubs.clear()
        if self._script and self._script.is_running:
            await self._script.async_stop()
        if run_stop_actions and self._stop_script:
            try:
                await self._stop_script.async_run({}, context=Context())
            except Exception:  # noqa: BLE001
                _LOGGER.exception("Error al detener «%s»", self.rule["name"])


class RuleManager:
    """Guarda todas las reglas y sus runners."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self._store: Store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self.rules: dict[str, dict[str, Any]] = {}
        # ajustes que define el instalador (admin) desde la tarjeta
        self.settings: dict[str, Any] = {"hidden": [], "client_off": list(DEFAULT_CLIENT_OFF)}
        self.runners: dict[str, RuleRunner] = {}
        self.started = False

    # ---------- persistencia ----------

    async def async_load(self) -> None:
        data = await self._store.async_load() or {}
        for rule in data.get("rules", []):
            self.rules[rule["id"]] = rule
        self.settings.update(data.get("settings") or {})
        self.frigate = FrigateHub(self.hass, self)

    @callback
    def _save(self) -> None:
        self._store.async_delay_save(lambda: {"rules": list(self.rules.values()), "settings": self.settings}, 2)

    @callback
    def _changed(self) -> None:
        async_dispatcher_send(self.hass, SIGNAL_CHANGED)

    @callback
    def as_list(self) -> list[dict[str, Any]]:
        out = []
        for rule in self.rules.values():
            runner = self.runners.get(rule["id"])
            item = {**rule, "running": bool(runner and runner.is_running), "installer_only": installer_only(rule)}
            if runner and runner.room:
                item.update(runner.room.as_dict())
            out.append(item)
        return out

    @callback
    def notify_changed(self) -> None:
        self._changed()

    @callback
    def record_run(self, rule_id: str) -> None:
        rule = self.rules.get(rule_id)
        if not rule:
            return
        rule["last_run"] = dt_util.utcnow().isoformat()
        rule["runs"] = rule.get("runs", 0) + 1
        self._save()
        self._changed()

    # ---------- ciclo de vida ----------

    @callback
    def handle_notification_action(self, rule_id: str, action: str) -> None:
        runner = self.runners.get(rule_id)
        if runner and runner.room and hasattr(runner.room, "on_action"):
            runner.room.on_action(action)

    @callback
    def save_settings(self) -> None:
        self._save()

    async def async_start_all(self, _hass=None) -> None:
        self.started = True
        await self.frigate.async_start()
        for rule_id in list(self.rules):
            await self._async_restart(rule_id)
            # si HA se reinició en medio de un riego, nada queda abierto
            if self.rules[rule_id]["kind"] == KIND_IRRIGATION and rule_id in self.runners:
                await self.runners[rule_id].async_run_stop_actions()
        self._changed()

    @callback
    def set_settings(self, settings: dict[str, Any]) -> None:
        hidden = settings.get("hidden")
        if isinstance(hidden, list):
            self.settings["hidden"] = sorted({str(e) for e in hidden})
        off = settings.get("client_off")
        if isinstance(off, list):
            # tipos que este cliente no puede crear (los decide el instalador)
            self.settings["client_off"] = sorted({str(k) for k in off if k in KINDS})
        opt = settings.get("opt_off")
        if isinstance(opt, list):
            # opciones de «Si… / Sólo si… / Entonces…» y las ideas de ejemplo que el cliente no ve (2.34)
            self.settings["opt_off"] = sorted({str(k)[:40] for k in opt if isinstance(k, str)})[:80]
        tabs = settings.get("tabs_off")
        if isinstance(tabs, list):
            # pestañas de la tarjeta que el cliente no ve (2.34)
            self.settings["tabs_off"] = sorted({k for k in tabs if k in ("scene", "auto", "smart", "rem", "timer")})
        mode = settings.get("ents_mode")
        if mode in ("app", "pick", "hide"):
            # qué equipos usa al armar: los de la app MatterAI, sólo los marcados, o todos menos los ocultos
            self.settings["ents_mode"] = mode
        shown = settings.get("shown")
        if isinstance(shown, list):
            self.settings["shown"] = sorted({str(e) for e in shown if isinstance(e, str)})[:3000]
        self._save()
        self._changed()

    # ---------- copias y plantillas ----------

    def export_rules(self, rule_ids: list[str] | None = None, template: bool = False, private: bool = True) -> list[dict[str, Any]]:
        """Reglas tal como se guardan. Como plantilla, sin lo propio de esta casa (historial, invitaciones, usos).
        Con private=False (copia para el panel central), sin los links de invitado ni los historiales."""
        out = []
        for rule in self.rules.values():
            if rule_ids is not None and rule["id"] not in rule_ids:
                continue
            item = copy.deepcopy(rule)
            if template:
                for key in TEMPLATE_DROP:
                    item.pop(key, None)
            elif not private:
                for key in PRIVATE_DROP:
                    item.pop(key, None)
            out.append(item)
        return out

    async def async_restore(self, rules: list[dict[str, Any]], settings: dict[str, Any] | None) -> int:
        """Reemplaza todas las reglas por las de una copia (las arranca de nuevo)."""
        clean = [copy.deepcopy(r) for r in rules if isinstance(r, dict) and r.get("id") and r.get("kind") in KINDS]
        # las copias del panel central no traen invitados ni historiales: se conservan los de la casa
        for r in clean:
            old = self.rules.get(r["id"])
            for key in PRIVATE_DROP:
                if key not in r and old and key in old:
                    r[key] = copy.deepcopy(old[key])
        await self.async_stop_all()
        self.rules = {r["id"]: r for r in clean}
        if isinstance(settings, dict):
            self.settings.update({k: v for k, v in settings.items() if k in ("hidden", "client_off", "opt_off", "tabs_off", "ents_mode", "shown")})
        self._save()
        await self.async_start_all()
        return len(clean)

    async def async_import(self, rules: list[dict[str, Any]]) -> dict[str, Any]:
        """Suma reglas de una plantilla: ids nuevos y pausadas hasta revisar los equipos de esta casa."""
        created, failed = [], []
        known = set(self.hass.states.async_entity_ids())
        missing: set[str] = set()
        for raw in rules:
            if not isinstance(raw, dict):
                continue
            item = copy.deepcopy(raw)
            for key in TEMPLATE_DROP:
                item.pop(key, None)
            item["id"] = uuid.uuid4().hex[:12]
            item["enabled"] = False
            for eid in _entity_refs(item.get("ui")):
                if eid not in known:
                    missing.add(eid)
            try:
                saved = await self.async_save(item, None)
                created.append({"id": saved["id"], "name": saved["name"]})
            except (InvalidRule, HomeAssistantError, vol.Invalid) as err:
                failed.append({"name": str(item.get("name") or "?"), "error": str(err)})
        return {"created": created, "failed": failed, "missing": sorted(missing)}

    async def async_remap(self, rule_ids: list[str], mapping: dict[str, str]) -> dict[str, Any]:
        """Cambia equipos en reglas importadas (plantilla de otra casa → equipos de esta casa)."""
        mapping = {str(k): str(v) for k, v in (mapping or {}).items() if k and v and k != v}
        if not mapping:
            return {"changed": 0, "missing": []}
        changed = 0
        for rid in rule_ids:
            rule = self.rules.get(rid)
            if rule is None:
                continue
            raw = _replace_entities(copy.deepcopy(rule), mapping)
            if raw != rule:
                await self.async_save(raw, None)
                changed += 1
        known = set(self.hass.states.async_entity_ids())
        missing = sorted({e for rid in rule_ids if rid in self.rules for e in _entity_refs(self.rules[rid].get("ui")) if e not in known})
        return {"changed": changed, "missing": missing}

    async def async_restore_some(self, rules: list[dict[str, Any]]) -> int:
        """Restaura sólo algunas reglas de una copia: reemplaza las que tengan el mismo id y suma las que no estén."""
        n = 0
        for raw in rules:
            if not isinstance(raw, dict) or not raw.get("id") or raw.get("kind") not in KINDS:
                continue
            item, old = copy.deepcopy(raw), self.rules.get(raw["id"])
            for key in PRIVATE_DROP:
                if key not in item and old and key in old:
                    item[key] = copy.deepcopy(old[key])
            self.rules[raw["id"]] = item
            await self._async_restart(raw["id"])
            n += 1
        self._save()
        self._changed()
        return n

    async def async_stop_all(self) -> None:
        if getattr(self, "frigate", None):
            self.frigate.stop()
        for runner in list(self.runners.values()):
            await runner.async_stop()
        self.runners.clear()
        self.started = False

    async def _async_restart(self, rule_id: str, run_stop_actions: bool = False) -> None:
        old = self.runners.pop(rule_id, None)
        if old:
            await old.async_stop(run_stop_actions)
        rule = self.rules.get(rule_id)
        if rule is None or not self.started:
            return
        runner = RuleRunner(self, rule)
        self.runners[rule_id] = runner
        await runner.async_start()

    # ---------- operaciones ----------

    async def async_validate(self, raw: dict[str, Any], is_admin: bool) -> dict[str, Any]:
        def as_list(key: str) -> list:
            value = raw.get(key) or []
            if not isinstance(value, list):
                raise InvalidRule(f"Formato inválido en {key}")
            return value

        rule: dict[str, Any] = {
            "id": str(raw.get("id") or uuid.uuid4().hex[:12]),
            "name": str(raw.get("name") or "").strip()[:80],
            "icon": str(raw.get("icon") or "mdi:creation")[:64],
            "color": str(raw.get("color") or "#4F8EF7")[:16],
            "kind": raw.get("kind"),
            "enabled": bool(raw.get("enabled", True)),
            "mode": raw.get("mode") if raw.get("mode") in MODES else "restart",
            "ui": raw.get("ui") if isinstance(raw.get("ui"), dict) else {},
            "triggers": as_list("triggers"),
            "conditions": as_list("conditions"),
            "actions": as_list("actions"),
            "on_stop": as_list("on_stop"),
        }
        kind = rule["kind"]
        if kind not in KINDS:
            raise InvalidRule("Tipo de automatización desconocido")
        if not rule["name"]:
            raise InvalidRule("Ponele un nombre")
        if kind == KIND_ROOM:
            _validate_room(rule["ui"])
        elif kind == KIND_WATCH:
            _validate_watch(rule["ui"])
        elif kind == KIND_AWAY:
            _validate_away(rule["ui"])
        elif kind == KIND_NIGHT:
            _validate_lists(rule["ui"], {
                "lights_list": {"light", "switch"}, "media_list": {"media_player"}, "switches": {"switch", "input_boolean", "fan", "light"},
                "night_lights": {"light", "switch"}, "climate": {"climate"}, "covers_list": {"cover"}, "locks": {"lock"},
            })
            if rule["ui"].get("auto") and not rule["ui"].get("common"):
                raise InvalidRule("Para que se active sola, elegí los sensores de movimiento de las áreas comunes")
        elif kind == KIND_CLIMA:
            _validate_lists(rule["ui"], {"entities": {"climate"}})
            if not rule["ui"].get("entities"):
                raise InvalidRule("Elegí los aires")
            if not rule["ui"].get("blocks"):
                raise InvalidRule("Agregá al menos un horario")
        elif kind == KIND_REMINDER:
            ui = rule["ui"]
            if not str(ui.get("text") or "").strip():
                raise InvalidRule("Escribí qué te recuerdo")
            if ui.get("repeat", "none") not in ("none", "daily", "weekly", "monthly", "yearly"):
                raise InvalidRule("Repetición inválida")
            _str_list(ui, "recipients")
        elif kind == KIND_DOORBELL:
            ui = rule["ui"]
            if not ui.get("ring"):
                raise InvalidRule("Elegí el sensor del timbre")
            for key, domains in (("camera", {"camera"}), ("unlock", {"lock", "button", "input_button", "switch", "script", "input_boolean"}),
                                 ("unlock2", {"lock", "button", "input_button", "switch", "script", "input_boolean", "cover"}), ("light", {"light", "switch"})):
                if ui.get(key) and str(ui[key]).split(".")[0] not in domains:
                    raise InvalidRule("Hay un equipo que no corresponde")
            _str_list(ui, "recipients")
            _str_list(ui, "speakers")
            old = self.rules.get(rule["id"])
            rule["history"] = (old or {}).get("history", [])
        elif kind in (KIND_FDETECT, KIND_FFACE):
            ui = rule["ui"]
            for key in ("cameras", "zones", "labels", "people", "plates", "people_ok", "recipients", "speakers", "lights", "rules_run", "face_sensors"):
                _str_list(ui, key)
            _validate_lists(ui, {"lights": {"light", "switch"}, "speakers": {"media_player"}})
            for key, domains in (("unlock", {"lock", "button", "input_button", "switch", "script", "cover"}), ("siren", {"siren", "switch", "light"})):
                if ui.get(key) and str(ui[key]).split(".")[0] not in domains:
                    raise InvalidRule("Hay un equipo que no corresponde")
            if kind == KIND_FFACE and not ui.get("people") and not ui.get("plates") and not ui.get("any_known"):
                raise InvalidRule("Elegí las personas o patentes (o «cualquier persona conocida»)")
            old = self.rules.get(rule["id"])
            rule["history"] = (old or {}).get("history", []) if old and old.get("kind") == kind else []
        elif kind == KIND_TV:
            ui = rule["ui"]
            if not ui.get("tv") or str(ui["tv"]).split(".")[0] != "media_player":
                raise InvalidRule("Elegí la tele")
            _validate_lists(ui, {"cine_lights": {"light", "switch"}, "cine_covers": {"cover"}, "companions": {"switch", "light", "media_player", "input_boolean"},
                                 "presence": {"binary_sensor"}, "empty_motion": {"binary_sensor"}, "empty_doors": {"binary_sensor"}})
            if ui.get("empty_doors") and not ui.get("empty_motion") and not ui.get("presence"):
                raise InvalidRule("Tele sin nadie: el sensor de puerta necesita uno de movimiento o de presencia")
            _str_list(ui, "cine_apps")
            _str_list(ui, "pause_on")
        elif kind == KIND_GUEST:
            ui = rule["ui"]
            _validate_lists(ui, {"devices": GUEST_DOMAINS})
            if not ui.get("devices"):
                raise InvalidRule("Elegí qué pueden abrir tus invitados")
            _str_list(ui, "recipients")
            if not isinstance(ui.get("cfg") or {}, dict):
                raise InvalidRule("Formato inválido")
            url = str(ui.get("base_url") or "").strip()
            if url and not re.match(r"^https?://[^\s/]+", url):
                raise InvalidRule("La dirección de tu casa tiene que empezar con https://")
            old = self.rules.get(rule["id"])
            same = bool(old and old.get("kind") == kind)
            rule["invites"] = old.get("invites", []) if same else []
            rule["history"] = old.get("history", []) if same else []
        elif kind == KIND_GATE:
            ui = rule["ui"]
            relays = {"switch", "button", "input_button", "script", "light", "input_boolean", "lock"}
            if ui.get("relays") == "two":
                if not ui.get("open_relay") or not ui.get("close_relay"):
                    raise InvalidRule("Elegí el relé de abrir y el de cerrar")
                keys = ("open_relay", "close_relay")
            else:
                if not ui.get("relay"):
                    raise InvalidRule("Elegí el relé o botón que da el pulso")
                keys = ("relay",)
            for key in keys:
                if str(ui[key]).split(".")[0] not in relays:
                    raise InvalidRule("El relé tiene que ser un interruptor, botón o script")
            if not ui.get("closed_sensor") and not ui.get("open_sensor"):
                raise InvalidRule("Elegí el sensor de cerrado (o el de abierto)")
            for key in ("closed_sensor", "open_sensor"):
                if ui.get(key) and str(ui[key]).split(".")[0] != "binary_sensor":
                    raise InvalidRule("Los sensores del portón tienen que ser de tipo abierto / cerrado")
            _str_list(ui, "recipients")
            old = self.rules.get(rule["id"])
            if old and old.get("kind") == kind and old.get("learned_s"):
                rule["learned_s"] = old["learned_s"]
        elif kind == KIND_CALALERT:
            _validate_lists(rule["ui"], {"calendars": {"calendar"}})
            if not rule["ui"].get("calendars"):
                raise InvalidRule("Elegí los calendarios")
        elif kind == KIND_WAKE:
            _validate_lists(rule["ui"], {"lights": {"light", "switch"}, "covers": {"cover"}, "climate": {"climate"}})
            if not rule["ui"].get("lights") and not rule["ui"].get("covers"):
                raise InvalidRule("Elegí luces o persianas")
        elif not rule["actions"]:
            raise InvalidRule("Agregá al menos una acción")
        if kind in TRIGGERED_KINDS and not rule["triggers"]:
            raise InvalidRule("Agregá al menos un disparador («Si…»)")
        if kind == KIND_TIMER:
            rule["keep"] = bool(raw.get("keep"))
            try:
                rule["duration"] = int(raw.get("duration") or 0)
            except (TypeError, ValueError):
                rule["duration"] = 0
            if rule["duration"] < 1:
                raise InvalidRule("Poné la duración del temporizador")
            when = dt_util.parse_datetime(str(raw.get("fire_at") or ""))
            if when is None and not rule["keep"]:
                raise InvalidRule("Falta la hora del temporizador")
            rule["fire_at"] = dt_util.as_utc(when).isoformat() if when else None

        if not is_admin:
            check_permissions(rule)

        try:
            if rule["triggers"]:
                await async_validate_trigger_config(
                    self.hass, cv.TRIGGER_SCHEMA(copy.deepcopy(rule["triggers"]))
                )
            await async_validate_actions_config(
                self.hass, cv.SCRIPT_SCHEMA(copy.deepcopy(build_sequence(rule)))
            )
            if rule["on_stop"]:
                await async_validate_actions_config(
                    self.hass, cv.SCRIPT_SCHEMA(copy.deepcopy(rule["on_stop"]))
                )
        except (vol.Invalid, HomeAssistantError) as err:
            raise InvalidRule(f"Configuración inválida: {err}") from err
        return rule

    async def async_save(self, raw: dict[str, Any], user) -> dict[str, Any]:
        is_admin = _is_admin(user)
        if not is_admin:
            # permisos antes que nada: el cliente no toca lo que armó el instalador
            prev = self.rules.get(str(raw.get("id") or ""))
            if prev and (prev.get("locked") or installer_only(prev)):
                raise InvalidRule("La armó tu instalador: la podés activar o pausar, pero no cambiarla")
            if installer_only(raw):
                raise InvalidRule("Esto lo configura tu instalador")
            if not prev and raw.get("kind") in self.settings.get("client_off", []):
                raise InvalidRule("Tu instalador no habilitó este tipo de automatización")
            # las opciones que el instalador apagó: no se pueden sumar (lo que ya tenía la regla sigue)
            off = set(self.settings.get("opt_off", []))
            if off:
                new = _rule_opts(raw) - (_rule_opts(prev) if prev else set())
                if new & off:
                    raise InvalidRule("Tu instalador no habilitó esa opción para las automatizaciones")
        rule = await self.async_validate(raw, is_admin)
        old = self.rules.get(rule["id"])
        rule["locked"] = bool(raw.get("locked")) if is_admin else False
        now = dt_util.utcnow().isoformat()
        if old:
            rule["created"] = old.get("created", now)
            rule["created_by"] = old.get("created_by")
            rule["last_run"] = old.get("last_run")
            rule["runs"] = old.get("runs", 0)
        else:
            rule["created"] = now
            rule["created_by"] = user.name if user else None
            rule["runs"] = 0
        rule["updated"] = now
        self.rules[rule["id"]] = rule
        self._save()
        await self._async_restart(rule["id"], run_stop_actions=bool(old))
        self._changed()
        return rule

    async def async_delete(self, rule_id: str, user=None) -> None:
        if rule_id not in self.rules:
            return
        old = self.rules[rule_id]
        if not _is_admin(user) and (old.get("locked") or installer_only(old)):
            raise InvalidRule("La armó tu instalador: no se puede borrar")
        runner = self.runners.pop(rule_id, None)
        if runner:
            await runner.async_stop(run_stop_actions=True)
        self.rules.pop(rule_id, None)
        self._save()
        self._changed()

    async def async_set_enabled(self, rule_id: str, enabled: bool, user=None) -> None:
        rule = self._get(rule_id)
        if not _is_admin(user) and installer_only(rule):
            raise InvalidRule("Esto lo configura tu instalador")
        if rule.get("enabled", True) == enabled:
            return
        rule["enabled"] = enabled
        self._save()
        await self._async_restart(rule_id, run_stop_actions=not enabled)
        self._changed()

    async def async_run(self, rule_id: str, context: Context | None = None) -> None:
        rule = self._get(rule_id)
        if rule["kind"] in RUNNABLE_CONTROLLERS:
            runner = self.runners.get(rule_id)
            if runner is None or runner.room is None:
                raise InvalidRule("Está pausada: activala para usarla")
            if rule["kind"] == KIND_NIGHT:
                runner.room.run(manual=True)
            elif rule["kind"] == KIND_REMINDER:
                runner.room.on_action("done")
            elif rule["kind"] == KIND_DOORBELL:
                runner.room.on_action("test")
            else:
                runner.room.run_now()
            return
        if rule["kind"] == KIND_TIMER:
            rule["fire_at"] = (
                dt_util.utcnow() + timedelta(seconds=rule.get("duration") or 60)
            ).isoformat()
            self._save()
            await self._async_restart(rule_id)
            self._changed()
            return
        runner = self.runners.get(rule_id)
        if runner is None:
            raise InvalidRule("Home Assistant todavía está iniciando")
        await runner.async_run_manual(context)

    @callback
    def set_rule_extra(self, rule_id: str, key: str, value: Any) -> None:
        """Datos que guarda una máquina de estados (historial del portero, etc.)."""
        rule = self.rules.get(rule_id)
        if rule is not None:
            rule[key] = value
            self._save()

    async def async_action(self, rule_id: str, action: str) -> None:
        """Acción pedida desde la tarjeta (abrir la puerta, etc.)."""
        self._get(rule_id)
        runner = self.runners.get(rule_id)
        if runner is None or runner.room is None or not hasattr(runner.room, "on_action"):
            raise InvalidRule("Está pausada: activala para usarla")
        runner.room.on_action(action)

    # ---------- invitados ----------

    async def async_guest_invite(self, rule_id: str, raw: dict[str, Any], user) -> dict[str, Any]:
        """Crea o cambia una invitación. Devuelve la invitación con su link."""
        rule = self._get(rule_id)
        if rule["kind"] != KIND_GUEST:
            raise InvalidRule("No es una regla de invitados")
        invites = rule.setdefault("invites", [])
        old = next((i for i in invites if i["id"] == raw.get("id")), None) if raw.get("id") else None
        if old is None and len(invites) >= MAX_INVITES:
            raise InvalidRule("Hay demasiadas invitaciones: borrá las que ya no uses")
        try:
            inv = clean_invite({**raw, "created_by": user.name if user else None}, old, rule["ui"].get("devices") or [])
        except ValueError as err:
            raise InvalidRule(str(err)) from err
        if old is not None:
            if raw.get("reset_uses"):
                inv["uses"] = 0
            invites[invites.index(old)] = inv
        else:
            invites.insert(0, inv)
        self._save()
        self._changed()
        base = base_url(self.hass, rule["ui"])
        return {**inv, "link": f"{base}{GUEST_LINK}/{inv['token']}" if base else None}

    async def async_guest_delete(self, rule_id: str, invite_id: str) -> None:
        rule = self._get(rule_id)
        rule["invites"] = [i for i in rule.get("invites") or [] if i["id"] != invite_id]
        self._save()
        self._changed()

    async def async_mark_done(self, rule_id: str) -> None:
        """Recordatorio de una sola vez: queda guardado como hecho."""
        rule = self.rules.get(rule_id)
        if rule is None:
            return
        rule.setdefault("ui", {})["done"] = True
        rule["ui"]["done_at"] = dt_util.utcnow().isoformat()
        rule["enabled"] = False
        self._save()
        await self._async_restart(rule_id)
        self._changed()

    async def async_timer_done(self, rule_id: str) -> None:
        """Temporizador terminado o cancelado: se borra, salvo que sea reutilizable."""
        rule = self.rules.get(rule_id)
        if rule is None:
            return
        if not rule.get("keep"):
            await self.async_delete(rule_id)
            return
        rule["fire_at"] = None
        self._save()
        await self._async_restart(rule_id)
        self._changed()

    def _get(self, rule_id: str) -> dict[str, Any]:
        rule = self.rules.get(rule_id)
        if rule is None:
            raise InvalidRule("No existe esa automatización")
        return rule
