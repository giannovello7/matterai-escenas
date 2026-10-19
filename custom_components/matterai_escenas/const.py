"""Constantes de MatterAI Escenas."""

DOMAIN = "matterai_escenas"
VERSION = "2.9.1"

STORAGE_KEY = f"{DOMAIN}.rules"
STORAGE_VERSION = 1

SIGNAL_CHANGED = f"{DOMAIN}_changed"

CARD_FILENAME = "matterai-escenas-card.js"
CARD_URL = f"/{DOMAIN}/{CARD_FILENAME}"

PANEL_URL_PATH = "automatizaciones"
PANEL_ELEMENT = "matterai-escenas-panel"
CONF_SIDEBAR = "sidebar"
CONF_SIDEBAR_TITLE = "sidebar_title"
CONF_SIDEBAR_ICON = "sidebar_icon"
DEFAULT_SIDEBAR_TITLE = "Automatizaciones"
DEFAULT_SIDEBAR_ICON = "mdi:robot-happy-outline"

# Tipos de regla que arma la tarjeta
KIND_SCENE = "scene"  # tocar para ejecutar
KIND_AUTO = "auto"  # si ... entonces ...
KIND_PERIOD = "period"  # encender de X a Y
KIND_LOOP = "loop"  # ciclo encendido/apagado
KIND_PRESENCE = "presence"  # simulación de presencia
KIND_TIMER = "timer"  # cuenta regresiva (de una vez o reutilizable)
KIND_IRRIGATION = "irrigation"  # riego por zonas
KIND_CIRCADIAN = "circadian"  # tono de blanco que sigue el ritmo del día
KIND_ROOM = "room"  # luz por presencia (movimiento + puerta + presencia)
KIND_WATCH = "watch"  # avisar si algo quedó abierto o prendido
KIND_AWAY = "away"  # me voy / llego (modo ausente automático)
KIND_NIGHT = "night"  # buenas noches (escena + automática)
KIND_CLIMA = "clima"  # clima inteligente
KIND_WAKE = "wake"  # despertador con luz
KIND_REMINDER = "reminder"  # recordatorio (una vez o repetido)
KIND_CALALERT = "calalert"  # avisos antes de eventos del calendario
KIND_DOORBELL = "doorbell"  # portero
KIND_FDETECT = "fdetect"  # detección con cámaras (Frigate)
KIND_FFACE = "fface"  # caras y patentes conocidas (Frigate)
KIND_TV = "tv"  # tele inteligente (modo cine, sin nadie, hora de dormir…)
KIND_GUEST = "guest"  # invitados: links temporales para abrir el portón / la puerta

KINDS = {
    KIND_SCENE,
    KIND_AUTO,
    KIND_PERIOD,
    KIND_LOOP,
    KIND_PRESENCE,
    KIND_TIMER,
    KIND_IRRIGATION,
    KIND_CIRCADIAN,
    KIND_ROOM,
    KIND_WATCH,
    KIND_AWAY,
    KIND_NIGHT,
    KIND_CLIMA,
    KIND_WAKE,
    KIND_REMINDER,
    KIND_CALALERT,
    KIND_DOORBELL,
    KIND_FDETECT,
    KIND_FFACE,
    KIND_TV,
    KIND_GUEST,
}
# reglas que maneja una máquina de estados en Python (no compilan YAML)
CONTROLLER_KINDS = {
    KIND_ROOM, KIND_WATCH, KIND_AWAY, KIND_NIGHT, KIND_CLIMA, KIND_WAKE, KIND_REMINDER, KIND_CALALERT, KIND_DOORBELL,
    KIND_FDETECT, KIND_FFACE, KIND_TV, KIND_GUEST,
}
# se pueden ejecutar a mano (botón / tarjeta / voz)
RUNNABLE_CONTROLLERS = {KIND_NIGHT, KIND_WAKE, KIND_REMINDER, KIND_DOORBELL}
TRIGGERED_KINDS = {KIND_AUTO, KIND_PERIOD, KIND_IRRIGATION, KIND_CIRCADIAN}
LOOP_KINDS = {KIND_LOOP, KIND_PRESENCE}

MODES = {"single", "restart", "queued", "parallel"}

# Lo que un usuario NO administrador puede usar al guardar una regla.
ALLOWED_SERVICE_DOMAINS = {
    "light",
    "switch",
    "input_boolean",
    "fan",
    "cover",
    "valve",
    "lock",
    "climate",
    "water_heater",
    "humidifier",
    "media_player",
    "vacuum",
    "alarm_control_panel",
    "input_number",
    "number",
    "input_select",
    "select",
    "button",
    "input_button",
    "scene",
    "script",
    "siren",
    "remote",
    "notify",
    "persistent_notification",
    "tts",
    "weather",  # weather.get_forecasts (sólo lectura) para el riego
    DOMAIN,
}
# Del dominio homeassistant sólo se permiten estos servicios
ALLOWED_HA_SERVICES = {"turn_on", "turn_off", "toggle"}

ALLOWED_TRIGGER_PLATFORMS = {
    "state",
    "numeric_state",
    "time",
    "sun",
    "zone",
    "time_pattern",
    "calendar",
    "homeassistant",
}

# Zigbee2MQTT: un no-admin sólo puede publicar el tono de blanco de una lámpara
# (<base>/<ieee>/set/color_temp), nada más.
Z2M_TONE_TOPIC = r"^[A-Za-z0-9_\-/]+/0x[0-9a-fA-F]{16}/set/color_temp$"
Z2M_BASE = r"^[A-Za-z0-9_\-/]+$"
Z2M_IEEE = r"^0x[0-9a-fA-F]{16}$"
