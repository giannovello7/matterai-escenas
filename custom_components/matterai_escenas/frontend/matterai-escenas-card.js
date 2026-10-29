/*
 * MatterAI Escenas — tarjeta para que usuarios NO administradores creen
 * escenas y automatizaciones (estilo Tuya / eWeLink, con todo el poder de HA).
 * Se sirve automáticamente desde la integración matterai_escenas.
 */
(() => {
const VERSION = '2.10.0';
const D = 'matterai_escenas';

// ----------------------------------------------------------------- utilidades
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dom = (eid) => String(eid || '').split('.')[0];
const clone = (o) => JSON.parse(JSON.stringify(o));
const pad = (n) => String(n).padStart(2, '0');
const DAYS = [['mon', 'L', 'lun'], ['tue', 'M', 'mar'], ['wed', 'X', 'mié'], ['thu', 'J', 'jue'], ['fri', 'V', 'vie'], ['sat', 'S', 'sáb'], ['sun', 'D', 'dom']];
const ALL_DAYS = DAYS.map((d) => d[0]);
const COLORS = ['#4F8EF7', '#F7B84F', '#F76F6F', '#3DBE8B', '#9B6CF7', '#F78FCF', '#3FB8E0', '#F78F4F', '#7A8699'];
const ICONS = ['mdi:creation', 'mdi:home', 'mdi:home-export-outline', 'mdi:home-import-outline', 'mdi:weather-night', 'mdi:white-balance-sunny', 'mdi:weather-sunset', 'mdi:sofa', 'mdi:movie-open', 'mdi:silverware-fork-knife', 'mdi:bed', 'mdi:shower', 'mdi:lightbulb-group', 'mdi:lightbulb-off', 'mdi:lamp', 'mdi:ceiling-light', 'mdi:led-strip-variant', 'mdi:blinds', 'mdi:garage', 'mdi:gate', 'mdi:door', 'mdi:fan', 'mdi:air-conditioner', 'mdi:thermometer', 'mdi:snowflake', 'mdi:fire', 'mdi:water', 'mdi:sprinkler', 'mdi:pool', 'mdi:television', 'mdi:speaker', 'mdi:music', 'mdi:party-popper', 'mdi:pine-tree', 'mdi:shield-home', 'mdi:cctv', 'mdi:bell-ring', 'mdi:alarm', 'mdi:timer-outline', 'mdi:repeat', 'mdi:robot-vacuum', 'mdi:car', 'mdi:paw', 'mdi:baby-face-outline', 'mdi:briefcase', 'mdi:coffee', 'mdi:power-plug', 'mdi:flash'];

const DOMAIN_ICON = { light: 'mdi:lightbulb', switch: 'mdi:toggle-switch', input_boolean: 'mdi:toggle-switch-outline', fan: 'mdi:fan', cover: 'mdi:blinds', valve: 'mdi:valve', lock: 'mdi:lock', climate: 'mdi:thermostat', water_heater: 'mdi:water-boiler', humidifier: 'mdi:air-humidifier', media_player: 'mdi:speaker', vacuum: 'mdi:robot-vacuum', alarm_control_panel: 'mdi:shield-home', input_number: 'mdi:ray-vertex', number: 'mdi:ray-vertex', input_select: 'mdi:format-list-bulleted', select: 'mdi:format-list-bulleted', button: 'mdi:gesture-tap-button', input_button: 'mdi:gesture-tap-button', scene: 'mdi:palette', script: 'mdi:script-text', siren: 'mdi:bullhorn', remote: 'mdi:remote', binary_sensor: 'mdi:radiobox-marked', sensor: 'mdi:eye', person: 'mdi:account', device_tracker: 'mdi:cellphone', weather: 'mdi:weather-partly-cloudy', event: 'mdi:gesture-double-tap', calendar: 'mdi:calendar', tts: 'mdi:account-voice', zone: 'mdi:map-marker' };
const BS_ICON = { door: 'mdi:door', window: 'mdi:window-closed-variant', garage_door: 'mdi:garage', opening: 'mdi:door', motion: 'mdi:motion-sensor', occupancy: 'mdi:home-account', presence: 'mdi:home-account', moisture: 'mdi:water-alert', smoke: 'mdi:smoke-detector', gas: 'mdi:gas-cylinder', carbon_monoxide: 'mdi:molecule-co', vibration: 'mdi:vibrate', battery: 'mdi:battery-alert', connectivity: 'mdi:wifi', problem: 'mdi:alert-circle', safety: 'mdi:shield-alert', sound: 'mdi:music-note', tamper: 'mdi:shield-alert', plug: 'mdi:power-plug', power: 'mdi:flash' };
const SENSOR_ICON = { temperature: 'mdi:thermometer', humidity: 'mdi:water-percent', power: 'mdi:flash', energy: 'mdi:lightning-bolt', illuminance: 'mdi:brightness-5', battery: 'mdi:battery', carbon_dioxide: 'mdi:molecule-co2', pm25: 'mdi:air-filter', voltage: 'mdi:sine-wave', current: 'mdi:current-ac' };

// on-trigger | off-trigger | on-condición | off-condición
const BS = {
  _: 'Se activa|Se desactiva|Activo|Inactivo',
  door: 'Se abre|Se cierra|Abierta|Cerrada', window: 'Se abre|Se cierra|Abierta|Cerrada', garage_door: 'Se abre|Se cierra|Abierto|Cerrado', opening: 'Se abre|Se cierra|Abierto|Cerrado',
  motion: 'Detecta movimiento|Deja de detectar movimiento|Hay movimiento|Sin movimiento', occupancy: 'Detecta presencia|Deja de detectar presencia|Hay alguien|No hay nadie', presence: 'Detecta presencia|Deja de detectar presencia|Hay alguien|No hay nadie',
  moisture: 'Detecta agua|Se seca|Mojado|Seco', smoke: 'Detecta humo|Sin humo|Hay humo|Sin humo', gas: 'Detecta gas|Sin gas|Hay gas|Sin gas', carbon_monoxide: 'Detecta monóxido|Sin monóxido|Hay monóxido|Sin monóxido',
  vibration: 'Detecta vibración|Sin vibración|Vibrando|Quieto', battery: 'Batería baja|Batería normal|Batería baja|Batería normal', connectivity: 'Se conecta|Se desconecta|Conectado|Desconectado',
  plug: 'Se enchufa|Se desenchufa|Enchufado|Desenchufado', power: 'Recibe energía|Se corta la energía|Con energía|Sin energía', problem: 'Detecta un problema|Problema resuelto|Con problema|Normal',
  sound: 'Detecta sonido|Silencio|Con sonido|Silencio', light: 'Detecta luz|Sin luz|Con luz|Oscuro', lock: 'Se desbloquea|Se bloquea|Desbloqueado|Bloqueado', tamper: 'Detecta manipulación|Normal|Manipulado|Normal',
  running: 'Empieza a funcionar|Se detiene|Funcionando|Detenido', cold: 'Detecta frío|Normal|Frío|Normal', heat: 'Detecta calor|Normal|Calor|Normal', safety: 'Inseguro|Seguro|Inseguro|Seguro', moving: 'Se mueve|Se detiene|En movimiento|Quieto',
};
const HVAC = { off: 'Apagado', heat: 'Calor', cool: 'Frío', auto: 'Automático', heat_cool: 'Frío/calor', dry: 'Deshumidificar', fan_only: 'Ventilación' };
const ALARM = { disarmed: 'Desarmada', armed_home: 'Armada (en casa)', armed_away: 'Armada (ausente)', armed_night: 'Armada (noche)', armed_vacation: 'Armada (vacaciones)', armed_custom_bypass: 'Armada (personalizada)', triggered: 'Disparada 🚨', pending: 'Por dispararse', arming: 'Armándose' };
const WEATHER = { sunny: 'Soleado', 'clear-night': 'Noche despejada', partlycloudy: 'Parcialmente nublado', cloudy: 'Nublado', rainy: 'Lluvia', pouring: 'Lluvia intensa', 'lightning-rainy': 'Tormenta', lightning: 'Tormenta eléctrica', hail: 'Granizo', snowy: 'Nieve', 'snowy-rainy': 'Aguanieve', fog: 'Niebla', windy: 'Viento', 'windy-variant': 'Viento y nubes', exceptional: 'Excepcional' };
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const STATE_DOMAINS = ['binary_sensor', 'sensor', 'light', 'switch', 'input_boolean', 'fan', 'cover', 'valve', 'lock', 'climate', 'media_player', 'vacuum', 'alarm_control_panel', 'input_select', 'select', 'input_number', 'number', 'siren', 'humidifier', 'water_heater', 'person', 'device_tracker'];
const ACTION_DOMAINS = ['light', 'switch', 'input_boolean', 'fan', 'cover', 'valve', 'lock', 'climate', 'media_player', 'vacuum', 'alarm_control_panel', 'input_number', 'number', 'input_select', 'select', 'button', 'input_button', 'scene', 'script', 'siren', 'humidifier', 'water_heater', 'remote'];
const ONOFF_DOMAINS = ['light', 'switch', 'input_boolean', 'fan', 'siren', 'humidifier', 'remote', 'media_player'];

const DOMAIN_LABEL = { light: 'Luces', switch: 'Llaves y enchufes', input_boolean: 'Interruptores virtuales', fan: 'Ventiladores', cover: 'Persianas y cortinas', valve: 'Válvulas', lock: 'Cerraduras', climate: 'Climatización', water_heater: 'Termotanques', humidifier: 'Humidificadores', media_player: 'Multimedia y TV', vacuum: 'Aspiradoras', alarm_control_panel: 'Alarmas', input_number: 'Números', number: 'Números', input_select: 'Listas', select: 'Listas', button: 'Botones', input_button: 'Botones', scene: 'Escenas', script: 'Scripts', siren: 'Sirenas', remote: 'Controles remotos', binary_sensor: 'Sensores (abierto, movimiento, agua…)', sensor: 'Sensores (temperatura, consumo…)', person: 'Personas', device_tracker: 'Rastreadores', weather: 'Pronóstico del clima', event: 'Botones y controles', calendar: 'Calendarios', tts: 'Voces' };
const dlabel = (d) => DOMAIN_LABEL[d] || d;

const fname = (h, eid) => h.states[eid]?.attributes?.friendly_name || h.entities?.[eid]?.name || eid || '—';
function areaId(h, eid) {
  const e = h.entities?.[eid];
  return e?.area_id || (e?.device_id && h.devices?.[e.device_id]?.area_id) || '';
}
const areaName = (h, eid) => { const a = areaId(h, eid); return a ? (h.areas?.[a]?.name || '') : ''; };
function entIcon(h, eid) {
  const st = h.states[eid]; const a = st?.attributes || {};
  if (a.icon) return a.icon;
  const d = dom(eid);
  if (d === 'binary_sensor' && BS_ICON[a.device_class]) return BS_ICON[a.device_class];
  if (d === 'sensor' && SENSOR_ICON[a.device_class]) return SENSOR_ICON[a.device_class];
  return DOMAIN_ICON[d] || 'mdi:devices';
}
const has = (h, d) => Object.keys(h.states).some((e) => dom(e) === d);
const listOf = (h, d) => Object.keys(h.states).filter((e) => dom(e) === d);
function isNumeric(h, eid) {
  const d = dom(eid); const st = h.states[eid];
  if (['input_number', 'number'].includes(d)) return true;
  if (d !== 'sensor' || !st) return false;
  return st.attributes.unit_of_measurement !== undefined || st.attributes.state_class !== undefined || (!isNaN(parseFloat(st.state)) && isFinite(st.state));
}
const unitOf = (h, eid) => h.states[eid]?.attributes?.unit_of_measurement || '';

function daysText(days) {
  if (!days || days.length === 0 || days.length === 7) return 'todos los días';
  const k = [...days].sort((a, b) => ALL_DAYS.indexOf(a) - ALL_DAYS.indexOf(b)).join(',');
  if (k === 'mon,tue,wed,thu,fri') return 'de lunes a viernes';
  if (k === 'sat,sun') return 'fines de semana';
  return DAYS.filter((d) => days.includes(d[0])).map((d) => d[2]).join(', ');
}
function durText(min) {
  if (+min > 0 && +min < 1) return `${Math.round(+min * 60)} s`;
  min = Math.round(+min || 0);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
function fmtOffset(min) {
  const a = Math.abs(Math.round(+min || 0));
  return `${min < 0 ? '-' : ''}${pad(Math.floor(a / 60))}:${pad(a % 60)}:00`;
}
const sunWord = (ev) => (ev === 'sunrise' ? 'amanecer' : 'atardecer');
function sunText(ev, off) {
  off = +off || 0;
  if (!off) return `Al ${sunWord(ev)}`;
  return `${durText(Math.abs(off))} ${off < 0 ? 'antes del' : 'después del'} ${sunWord(ev)}`;
}
function momentText(m) {
  if (!m) return '';
  return m.type === 'time' ? `a las ${m.at}` : sunText(m.type, m.offset).toLowerCase();
}
const hexToRgb = (hex) => { const n = parseInt(String(hex).replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const weekdayCond = (days) => ({ condition: 'time', weekday: days });
const allDays = (days) => !days || days.length === 0 || days.length === 7;

// --------------------------------------------------- opciones de estado / ops
function stateOptions(h, eid, cond) {
  const d = dom(eid); const st = h.states[eid]; const a = st?.attributes || {};
  const pick = (t, c) => (cond ? c : t);
  const L = (pairs) => pairs.map(([v, t, c]) => ({ v, l: pick(t, c ?? t) }));
  switch (d) {
    case 'binary_sensor': { const [on, off, son, soff] = (BS[a.device_class] || BS._).split('|'); return L([['on', on, son], ['off', off, soff]]); }
    case 'light': case 'switch': case 'input_boolean': case 'fan': case 'siren': case 'humidifier': case 'remote':
      return L([['on', 'Se enciende', 'Encendido'], ['off', 'Se apaga', 'Apagado']]);
    case 'cover': return L([['open', 'Se abre', 'Abierta'], ['closed', 'Se cierra', 'Cerrada'], ['opening', 'Empieza a abrirse', 'Abriéndose'], ['closing', 'Empieza a cerrarse', 'Cerrándose']]);
    case 'valve': return L([['open', 'Se abre', 'Abierta'], ['closed', 'Se cierra', 'Cerrada']]);
    case 'lock': return L([['locked', 'Se bloquea', 'Bloqueada'], ['unlocked', 'Se desbloquea', 'Desbloqueada'], ['jammed', 'Se traba', 'Trabada']]);
    case 'person': case 'device_tracker': return L([['home', 'Llega a casa', 'En casa'], ['not_home', 'Sale de casa', 'Fuera de casa']]);
    case 'alarm_control_panel': return Object.entries(ALARM).map(([v, l]) => ({ v, l: cond ? l : `Pasa a: ${l}` }));
    case 'media_player': return L([['playing', 'Empieza a reproducir', 'Reproduciendo'], ['paused', 'Se pausa', 'En pausa'], ['idle', 'Queda inactivo', 'Inactivo'], ['off', 'Se apaga', 'Apagado'], ['on', 'Se enciende', 'Encendido']]);
    case 'climate': return (a.hvac_modes || Object.keys(HVAC)).map((v) => ({ v, l: cond ? HVAC[v] || v : `Pasa a modo ${HVAC[v] || v}` }));
    case 'vacuum': return L([['cleaning', 'Empieza a limpiar', 'Limpiando'], ['docked', 'Vuelve a la base', 'En la base'], ['returning', 'Vuelve a la base', 'Volviendo'], ['error', 'Tiene un error', 'Con error']]);
    case 'input_select': case 'select': return (a.options || []).map((v) => ({ v, l: v }));
    case 'water_heater': return (a.operation_list || []).map((v) => ({ v, l: v }));
    default: return st ? [{ v: st.state, l: `Estado actual: ${st.state}` }] : [];
  }
}
const stateLabel = (h, eid, v, cond) => stateOptions(h, eid, cond).find((o) => o.v === v)?.l || v;

function opsFor(h, eid) {
  const d = dom(eid); const a = h.states[eid]?.attributes || {}; const sf = a.supported_features || 0;
  const AUTO = { key: '_off_after', type: 'number', label: 'Volver a apagar después de', unit: 'min', min: 1, max: 1440, def: 5, opt: true };
  const ON = { id: 'on', label: 'Encender', icon: 'mdi:power', svc: `${d}.turn_on`, params: [AUTO] };
  const OFF = { id: 'off', label: 'Apagar', icon: 'mdi:power-off', svc: `${d}.turn_off` };
  const TG = { id: 'toggle', label: 'Invertir (prender/apagar)', icon: 'mdi:swap-horizontal', svc: `${d}.toggle` };
  const op = (id, label, icon, svc, params) => ({ id, label, icon, svc, params });
  switch (d) {
    case 'light': {
      const modes = a.supported_color_modes || [];
      const p = [];
      if (!(modes.length === 1 && modes[0] === 'onoff')) p.push({ key: 'brightness_pct', type: 'range', label: 'Brillo', min: 1, max: 100, unit: '%', def: 80, opt: true });
      if (modes.includes('color_temp')) p.push({ key: 'color_temp_kelvin', type: 'range', label: 'Tono de blanco', min: a.min_color_temp_kelvin || 2200, max: a.max_color_temp_kelvin || 6500, step: 100, unit: 'K', def: 3000, opt: true, excl: 'rgb_color' });
      if (modes.some((m) => ['hs', 'rgb', 'rgbw', 'rgbww', 'xy'].includes(m))) p.push({ key: 'rgb_color', type: 'color', label: 'Color', def: '#ff9900', opt: true, excl: 'color_temp_kelvin' });
      return [{ ...ON, params: [...p, AUTO] }, OFF, TG];
    }
    case 'switch': case 'input_boolean': case 'siren': case 'remote': return [ON, OFF, TG];
    case 'fan': return [{ ...ON, params: [{ key: 'percentage', type: 'range', label: 'Velocidad', min: 1, max: 100, unit: '%', def: 50, opt: true }, AUTO] }, OFF, TG];
    case 'humidifier': return [ON, OFF, op('hum', 'Ajustar humedad', 'mdi:water-percent', 'humidifier.set_humidity', [{ key: 'humidity', type: 'range', label: 'Humedad', min: a.min_humidity || 0, max: a.max_humidity || 100, unit: '%', def: 50 }])];
    case 'cover': {
      const r = [op('open', 'Abrir', 'mdi:arrow-up-box', 'cover.open_cover'), op('close', 'Cerrar', 'mdi:arrow-down-box', 'cover.close_cover'), op('stop', 'Detener', 'mdi:stop', 'cover.stop_cover')];
      if (sf & 4) r.push(op('pos', 'Llevar a una posición', 'mdi:percent', 'cover.set_cover_position', [{ key: 'position', type: 'range', label: 'Apertura', min: 0, max: 100, unit: '%', def: 50 }]));
      return r;
    }
    case 'valve': return [op('open', 'Abrir', 'mdi:valve-open', 'valve.open_valve'), op('close', 'Cerrar', 'mdi:valve-closed', 'valve.close_valve')];
    case 'lock': return [op('lock', 'Bloquear', 'mdi:lock', 'lock.lock'), op('unlock', 'Desbloquear', 'mdi:lock-open', 'lock.unlock')];
    case 'climate': {
      const modes = (a.hvac_modes || ['cool', 'heat', 'auto']).filter((m) => m !== 'off');
      return [
        op('mode', 'Encender en modo…', 'mdi:thermostat', 'climate.set_hvac_mode', [{ key: 'hvac_mode', type: 'select', label: 'Modo', options: modes.map((m) => [m, HVAC[m] || m]), def: modes[0] }]),
        op('temp', 'Ajustar temperatura', 'mdi:thermometer', 'climate.set_temperature', [{ key: 'temperature', type: 'number', label: 'Temperatura', min: a.min_temp ?? 16, max: a.max_temp ?? 30, step: a.target_temp_step || 0.5, unit: '°', def: 24 }]),
        op('off', 'Apagar', 'mdi:power-off', 'climate.turn_off'),
      ];
    }
    case 'water_heater': return [op('temp', 'Ajustar temperatura', 'mdi:thermometer', 'water_heater.set_temperature', [{ key: 'temperature', type: 'number', label: 'Temperatura', min: a.min_temp ?? 30, max: a.max_temp ?? 70, step: 1, unit: '°', def: 45 }])];
    case 'media_player': return [
      op('on', 'Encender', 'mdi:power', 'media_player.turn_on'), op('off', 'Apagar', 'mdi:power-off', 'media_player.turn_off'),
      op('play', 'Reproducir', 'mdi:play', 'media_player.media_play'), op('pause', 'Pausar', 'mdi:pause', 'media_player.media_pause'),
      op('vol', 'Ajustar volumen', 'mdi:volume-high', 'media_player.volume_set', [{ key: 'volume_level', type: 'range', label: 'Volumen', min: 0, max: 100, unit: '%', def: 30 }]),
    ];
    case 'vacuum': return [op('start', 'Empezar a limpiar', 'mdi:play', 'vacuum.start'), op('pause', 'Pausar', 'mdi:pause', 'vacuum.pause'), op('dock', 'Volver a la base', 'mdi:home-import-outline', 'vacuum.return_to_base')];
    case 'alarm_control_panel': {
      const code = { key: 'code', type: 'text', label: 'Código (si tu alarma lo pide)', opt: true, def: '' };
      return [op('home', 'Armar en casa', 'mdi:shield-home', 'alarm_control_panel.alarm_arm_home', [code]), op('away', 'Armar ausente', 'mdi:shield-lock', 'alarm_control_panel.alarm_arm_away', [code]), op('night', 'Armar noche', 'mdi:shield-moon', 'alarm_control_panel.alarm_arm_night', [code]), op('disarm', 'Desarmar', 'mdi:shield-off', 'alarm_control_panel.alarm_disarm', [code])];
    }
    case 'input_number': case 'number': return [op('set', 'Fijar valor', 'mdi:numeric', `${d}.set_value`, [{ key: 'value', type: 'number', label: 'Valor', min: a.min, max: a.max, step: a.step || 1, unit: a.unit_of_measurement || '', def: a.min ?? 0 }])];
    case 'input_select': case 'select': return [op('opt', 'Elegir opción', 'mdi:format-list-bulleted', `${d}.select_option`, [{ key: 'option', type: 'select', label: 'Opción', options: (a.options || []).map((o) => [o, o]), def: (a.options || [])[0] }])];
    case 'button': case 'input_button': return [op('press', 'Presionar', 'mdi:gesture-tap-button', `${d}.press`)];
    case 'scene': return [op('on', 'Activar', 'mdi:palette', 'scene.turn_on')];
    case 'script': return [op('on', 'Ejecutar', 'mdi:play', 'script.turn_on')];
    default: return [{ ...ON, svc: 'homeassistant.turn_on' }, { ...OFF, svc: 'homeassistant.turn_off' }, { ...TG, svc: 'homeassistant.toggle' }];
  }
}

// ------------------------------------------------------------- catálogos UI
const TRIGGER_TYPES = [
  { id: 'device', icon: 'mdi:lightbulb-on-outline', color: '#F7B84F', label: 'Cuando un dispositivo cambia', hint: 'Se abre una puerta, hay movimiento, la temperatura pasa de 28°…' },
  { id: 'time', icon: 'mdi:clock-outline', color: '#4F8EF7', label: 'Horario programado', hint: 'A las 7:00 de lunes a viernes' },
  { id: 'sun', icon: 'mdi:weather-sunset', color: '#F78F4F', label: 'Amanecer o atardecer', hint: '30 minutos antes de que oscurezca' },
  { id: 'weather', icon: 'mdi:weather-partly-cloudy', color: '#3FB8E0', label: 'Cuando el clima cambia', hint: 'Llueve, hace más de 30° afuera…', need: (h) => has(h, 'weather') },
  { id: 'presence', icon: 'mdi:map-marker-radius', color: '#F76F6F', label: 'Cuando alguien llega o se va', hint: 'Llega el primero, se va el último', need: (h) => has(h, 'person') },
  { id: 'alarm', icon: 'mdi:shield-home', color: '#3DBE8B', label: 'Cuando cambia la alarma', hint: 'Se arma, se desarma o se dispara', need: (h) => has(h, 'alarm_control_panel') },
  { id: 'button', icon: 'mdi:gesture-double-tap', color: '#9B6CF7', label: 'Botón o control remoto', hint: 'Doble toque del botón del pasillo', need: (h) => has(h, 'event') },
  { id: 'interval', icon: 'mdi:timer-sync-outline', color: '#7A8699', label: 'Cada cierto tiempo', hint: 'Cada 15 minutos, cada 2 horas' },
  { id: 'calendar', icon: 'mdi:calendar-clock', color: '#F78FCF', label: 'Evento del calendario', hint: 'Cuando empieza un evento de tu agenda', need: (h) => has(h, 'calendar') },
];
const COND_TYPES = [
  { id: 'time', icon: 'mdi:clock-outline', color: '#4F8EF7', label: 'Horario o días', hint: 'Sólo entre 20:00 y 6:00, sólo fines de semana' },
  { id: 'sun', icon: 'mdi:theme-light-dark', color: '#F78F4F', label: 'De día o de noche', hint: 'Sólo cuando ya oscureció' },
  { id: 'device', icon: 'mdi:lightbulb-on-outline', color: '#F7B84F', label: 'Estado de un dispositivo', hint: 'Sólo si la puerta está cerrada, si hace más de 25°…' },
  { id: 'presence', icon: 'mdi:home-account', color: '#F76F6F', label: 'Quién está en casa', hint: 'Sólo si no hay nadie', need: (h) => has(h, 'person') },
  { id: 'alarm', icon: 'mdi:shield-home', color: '#3DBE8B', label: 'Modo de la alarma', hint: 'Sólo si está armada', need: (h) => has(h, 'alarm_control_panel') },
  { id: 'dates', icon: 'mdi:calendar-range', color: '#F78FCF', label: 'Época del año', hint: 'Del 1/12 al 6/1 (luces de Navidad)' },
];
const ACTION_TYPES = [
  { id: 'device', icon: 'mdi:devices', color: '#4F8EF7', label: 'Controlar un dispositivo', hint: 'Prender, apagar, brillo, color, persianas, aire…' },
  { id: 'area', icon: 'mdi:home-group', color: '#3DBE8B', label: 'Controlar un ambiente o toda la casa', hint: 'Apagar todas las luces del living' },
  { id: 'scene', icon: 'mdi:palette', color: '#9B6CF7', label: 'Activar una escena de Home Assistant', need: (h) => has(h, 'scene') || has(h, 'script') },
  { id: 'rule', icon: 'mdi:creation', color: '#F78FCF', label: 'Ejecutar o pausar otra automatización' },
  { id: 'notify', icon: 'mdi:cellphone-message', color: '#F76F6F', label: 'Enviar una notificación', hint: 'Al celular o en Home Assistant' },
  { id: 'speak', icon: 'mdi:account-voice', color: '#3FB8E0', label: 'Decir algo por un parlante', need: (h) => has(h, 'tts') && has(h, 'media_player') },
  { id: 'delay', icon: 'mdi:timer-sand', color: '#7A8699', label: 'Esperar un tiempo', hint: 'Antes de seguir con la próxima acción' },
  { id: 'wait', icon: 'mdi:timer-pause-outline', color: '#F7B84F', label: 'Esperar hasta que algo pase', hint: 'Que se cierre el portón (máximo 10 min)' },
];
const typeOf = (list, id) => ({ triggers: TRIGGER_TYPES, conditions: COND_TYPES, actions: ACTION_TYPES }[list].find((t) => t.id === id)) || { icon: 'mdi:help', label: id, color: '#7A8699' };

const AREA_DOMAINS = [
  ['light', 'Luces', 'mdi:lightbulb-group', [['on', 'Encender'], ['off', 'Apagar']]],
  ['switch', 'Llaves y enchufes', 'mdi:power-socket', [['on', 'Encender'], ['off', 'Apagar']]],
  ['cover', 'Persianas y cortinas', 'mdi:blinds', [['open', 'Abrir'], ['close', 'Cerrar']]],
  ['climate', 'Aires acondicionados', 'mdi:air-conditioner', [['off', 'Apagar']]],
  ['fan', 'Ventiladores', 'mdi:fan', [['on', 'Encender'], ['off', 'Apagar']]],
  ['media_player', 'Reproductores / TV', 'mdi:television', [['off', 'Apagar'], ['pause', 'Pausar']]],
];
const AREA_SVC = { on: 'turn_on', off: 'turn_off', open: 'open_cover', close: 'close_cover', pause: 'media_pause' };

// -------------------------------------------------------------- descripciones
function describe(h, list, it, rules) {
  const n = (e) => (e ? fname(h, e) : '⚠ Elegí un dispositivo');
  if (list === 'triggers') {
    switch (it.type) {
      case 'device':
        if (it.dir) return `${n(it.entity)} ${it.dir === 'above' ? 'supera' : 'baja de'} ${it.value ?? '?'}${unitOf(h, it.entity)}${it.for_min ? ` durante ${durText(it.for_min)}` : ''}`;
        return `${n(it.entity)} · ${it.to ? stateLabel(h, it.entity, it.to) : 'cualquier cambio'}${it.for_min ? ` durante ${durText(it.for_min)}` : ''}`;
      case 'time': return `A las ${it.at} · ${daysText(it.days)}`;
      case 'sun': return `${sunText(it.event, it.offset)} · ${daysText(it.days)}`;
      case 'weather': {
        const what = { temp: 'la temperatura', humidity: 'la humedad', wind: 'el viento' }[it.what];
        if (it.what === 'condition') return `El clima pasa a: ${(it.conds || []).map((c) => WEATHER[c] || c).join(', ') || '?'}`;
        return `Afuera ${what} ${it.dir === 'below' ? 'baja de' : 'supera'} ${it.value ?? '?'}`;
      }
      case 'presence':
        if (it.who === 'first') return 'Llega la primera persona a casa';
        if (it.who === 'last') return 'Se va la última persona de casa';
        return `${n(it.who)} ${it.event === 'leave' ? 'sale de' : 'llega a'} ${it.zone && it.zone !== 'zone.home' ? fname(h, it.zone) : 'casa'}`;
      case 'alarm': return `${n(it.entity)} · ${ALARM[it.to] || it.to || '?'}`;
      case 'button': return `${n(it.entity)} · ${it.event_type || 'cualquier pulsación'}`;
      case 'interval': return `Cada ${it.every} ${it.unit === 'h' ? (it.every == 1 ? 'hora' : 'horas') : 'min'}`;
      case 'calendar': return `${it.event === 'end' ? 'Termina' : 'Empieza'} un evento de ${n(it.entity)}${it.offset ? ` (${durText(Math.abs(it.offset))} antes)` : ''}`;
    }
  }
  if (list === 'conditions') {
    switch (it.type) {
      case 'time': {
        const hrs = it.allday ? '' : `entre ${it.after} y ${it.before}`;
        return [hrs, allDays(it.days) ? '' : daysText(it.days)].filter(Boolean).join(' · ') || 'Siempre';
      }
      case 'sun': return it.when === 'day' ? 'Sólo de día' : 'Sólo de noche';
      case 'device':
        if (it.dir) return `${n(it.entity)} ${it.dir === 'above' ? 'mayor a' : 'menor a'} ${it.value ?? '?'}${unitOf(h, it.entity)}`;
        return `${n(it.entity)} está ${it.state ? stateLabel(h, it.entity, it.state, true).toLowerCase() : '?'}`;
      case 'presence':
        if (it.who === 'anyone') return 'Hay alguien en casa';
        if (it.who === 'nobody') return 'No hay nadie en casa';
        return `${n(it.who)} ${it.where === 'away' ? 'está fuera' : 'está en casa'}`;
      case 'alarm': return `${n(it.entity)} está ${(ALARM[it.state] || it.state || '?').toLowerCase()}`;
      case 'dates': return `Del ${it.from_d}/${it.from_m} al ${it.to_d}/${it.to_m}`;
    }
  }
  if (list === 'actions') {
    switch (it.type) {
      case 'device': {
        const p = it.params || {}; const extra = [];
        if (p.brightness_pct != null) extra.push(`brillo ${p.brightness_pct}%`);
        if (p.color_temp_kelvin != null) extra.push(`${p.color_temp_kelvin}K`);
        if (p.rgb_color) extra.push('color');
        if (p.percentage != null) extra.push(`${p.percentage}%`);
        if (p.position != null) extra.push(`${p.position}%`);
        if (p.temperature != null) extra.push(`${p.temperature}°`);
        if (p.hvac_mode) extra.push(HVAC[p.hvac_mode] || p.hvac_mode);
        if (p.volume_level != null) extra.push(`${p.volume_level}%`);
        if (p.value != null) extra.push(`${p.value}`);
        if (p.option) extra.push(p.option);
        if (p.humidity != null) extra.push(`${p.humidity}%`);
        let s = `${it.label || it.op || '?'} ${n(it.entity)}`;
        if (extra.length) s += ` · ${extra.join(', ')}`;
        if (p._off_after) s += ` · se apaga a los ${durText(p._off_after)}`;
        return s;
      }
      case 'area': {
        const ad = AREA_DOMAINS.find((x) => x[0] === it.domain);
        const opl = ad?.[3].find((o) => o[0] === it.op)?.[1] || it.op;
        return `${opl} ${(ad?.[1] || '').toLowerCase()} ${it.area === 'all' ? 'de toda la casa' : `de ${h.areas?.[it.area]?.name || '?'}`}`;
      }
      case 'scene': return `${dom(it.entity) === 'script' ? 'Ejecutar' : 'Activar'} ${n(it.entity)}`;
      case 'rule': {
        const r = (rules || []).find((x) => x.id === it.rule_id);
        return `${{ run: 'Ejecutar', enable: 'Activar', disable: 'Pausar' }[it.op]} «${r ? r.name : '?'}»`;
      }
      case 'notify': return `Avisar${it.target === 'persistent' ? ' en Home Assistant' : ` a ${notifyLabel(it.target)}`}: «${it.message || ''}»`;
      case 'speak': return `Decir en ${n(it.player)}: «${it.message || ''}»`;
      case 'delay': return `Esperar ${[it.h ? `${it.h} h` : '', it.m ? `${it.m} min` : '', it.s ? `${it.s} s` : ''].filter(Boolean).join(' ') || '0 s'}`;
      case 'wait': return `Esperar a que ${n(it.entity)} ${it.to ? stateLabel(h, it.entity, it.to).toLowerCase() : '?'}${it.timeout ? ` (máx. ${durText(it.timeout)})` : ''}`;
    }
  }
  return '?';
}
function notifyLabel(svc) {
  if (!svc) return '?';
  if (svc.startsWith('mobile_app_')) return `celular ${svc.slice(11).replace(/_/g, ' ')}`;
  return svc.replace(/_/g, ' ');
}

function ruleSummary(h, r, rules) {
  const u = r.ui || {};
  switch (r.kind) {
    case 'scene': return `${(u.actions || []).length} acciones`;
    case 'period': return `Encender ${momentText(u.on)} · apagar ${momentText(u.off)} · ${daysText(u.days)}`;
    case 'loop': return `${durText(u.on_min)} encendido / ${durText(u.off_min)} apagado${u.window === 'times' ? ` · de ${u.from} a ${u.to}` : ''}`;
    case 'presence': return `${u.start === 'sunset' ? 'Desde que oscurece' : `Desde las ${u.from}`} hasta las ${u.to} · ${(u.entities || []).length} luces`;
    case 'timer': return r.fire_at ? '' : `${durText(Math.round((r.duration || 0) / 60))} · tocá ▶ para iniciar`;
    case 'circadian': {
      const c = normCirc(clone(u));
      const what = { ct: `${c.kmin}K a ${c.kmax}K`, bri: `brillo ${c.bmin}% a ${c.bmax}%`, both: `${c.kmin}K a ${c.kmax}K y brillo` }[c.adjust];
      return `${(c.entities || []).length} luces · ${what} · ${c.curve === 'sun' ? 'según el sol' : `${c.up_start} a ${c.down_end}`}${briOwn(c) ? ` · intensidad baja desde las ${c.b_down}` : ''}`;
    }
    case 'tv': return [u.cine ? 'modo cine' : '', (u.companions || []).length ? 'barra de sonido' : '', (u.presence || []).length || (u.empty_motion || []).length ? 'se apaga sin nadie' : '', u.bedtime ? `hora de dormir ${u.bed_at}` : '', u.night_vol ? `volumen máx. ${u.vol_max}%` : '', (u.pause_on || []).length ? 'pausa con el timbre' : ''].filter(Boolean).join(' · ');
    case 'fdetect': return `${(u.labels || []).map((l) => FLABELS[l] || l).join(', ')} en ${(u.zones || []).length ? u.zones.join(', ') : (u.cameras || []).length ? u.cameras.join(', ') : 'todas las cámaras'}${u.when === 'night' ? ' · de noche' : u.when === 'hours' ? ` · ${u.from}-${u.to}` : ''}${u.only_away ? ' · sin nadie en casa' : ''}`;
    case 'fface': return `${u.any_known ? 'Cualquier conocido' : [...(u.people || []), ...(u.plates || []).map((p) => p.split('=')[0].trim())].join(', ')}${u.unlock ? (u.unlock_mode === 'auto' ? ' · abre solo' : ' · abrir con un botón') : ''}`;
    case 'gate': {
      const now = r.gate_moving === 'opening' ? 'abriendo' : r.gate_moving === 'closing' ? 'cerrando' : r.gate_closed === true ? 'cerrado' : r.gate_closed === false ? 'abierto' : '';
      return [now, r.gate_travel ? `tarda ${r.gate_travel} s${r.gate_learned && !+u.travel_s ? ' (aprendido)' : ''}` : '', +u.open_alert_min ? `avisa a los ${u.open_alert_min} min` : '', u.night_close ? `cierra solo a las ${u.night_at}` : ''].filter(Boolean).join(' · ');
    }
    case 'guest': {
      const act = (r.invites || []).filter((i) => invState(i)[0] === 'ok' || invState(i)[0] === 'early').length;
      return `${(u.devices || []).map((e) => u.cfg?.[mkey(e)]?.label || fname(h, e)).join(', ')} · ${act ? `${act} invitaci${act === 1 ? 'ón activa' : 'ones activas'}` : 'sin invitaciones activas'}`;
    }
    case 'doorbell': return [u.camera ? 'con cámara' : 'sin cámara', u.unlock ? 'abre la puerta' : '', u.unlock2 ? 'y el portón' : '', (u.speakers || []).length ? 'anuncia en parlantes' : ''].filter(Boolean).join(' · ');
    case 'reminder': return [r.next_at ? whenText(r.next_at) : u.done ? 'hecho' : '', u.repeat !== 'none' ? remRepeat(u) : ''].filter(Boolean).join(' · ');
    case 'calalert': return `${(u.calendars || []).length} calendarios · ${+u.before_min ? `${durText(u.before_min)} antes` : 'en el momento'}`;
    case 'night': return `${u.auto ? `Sola entre ${u.from} y ${u.to} si no hay movimiento ${durText(u.quiet_min)}${u.ask ? ' (pregunta antes)' : ''}` : 'Con el botón o por voz'}`;
    case 'clima': {
      const b = (u.blocks || []).slice().sort((a, c) => hm(a.from) - hm(c.from)).map((x) => `${x.from} ${x.on ? `${u.mode === 'heat' ? x.heat : x.cool}°` : 'apagado'}`).join(' · ');
      return `${(u.entities || []).length} aires · ${b}${(u.windows || []).length ? ' · ventanas' : ''}${u.away_off ? ' · si no hay nadie' : ''}`;
    }
    case 'wake': return `${u.time_mode === 'phone' ? 'Con la alarma del celular' : `${u.time} ${daysText(u.days)}`} · ${durText(u.ramp)} antes${(u.covers || []).length ? ' · persianas' : ''}`;
    case 'watch': return `${(u.ents || []).length} equipos · avisa a los ${durText(u.default_min)}${u.only_away ? ' si no hay nadie' : ''}${u.only_night ? ' de noche' : ''}${u.auto_fix ? ' · apaga / cierra solo' : ''}`;
    case 'away': {
      const p = [u.lights !== 'none' ? 'luces' : '', u.climate !== 'none' ? 'aires' : '', u.covers !== 'none' ? 'persianas' : '', u.arm ? 'alarma' : ''].filter(Boolean);
      return `${u.detect === 'alarm' ? 'Al armar la alarma' : 'Cuando se va el último'}${p.length ? ` · ${p.join(', ')}` : ''}${(u.welcome || []).length || u.disarm || (u.arrive_climate || []).length ? ' · bienvenida al volver' : ''}`;
    }
    case 'room': {
      const sens = [`${(u.motion || []).length ? 'movimiento' : ''}`, (u.doors || []).length ? 'puerta' : '', (u.presence || []).length ? 'presencia' : ''].filter(Boolean).join(' + ');
      if (u.only_sensor) return `Sensor de ocupación · ${sens}`;
      return `${(u.lights || []).length} luces · ${sens} · se apaga tras ${durText(u.timeout)} sin movimiento${u.fan ? ' · con extractor' : ''}`;
    }
    case 'irrigation': {
      const z = (u.zones || []).length;
      const when = (u.starts || []).map((m) => (m.type === 'time' ? m.at : sunText(m.type, m.offset).toLowerCase())).join(', ');
      const days = u.days_mode === 'every' ? `cada ${u.every} días` : daysText(u.days);
      return `${z} ${z === 1 ? 'zona' : 'zonas'} · ${when} · ${days}${+u.adjust !== 100 ? ` · ${u.adjust}%` : ''}`;
    }
    default: {
      const t = (u.triggers || [])[0]; const a = (u.actions || [])[0];
      const more = (u.triggers || []).length > 1 ? ` (+${u.triggers.length - 1})` : '';
      return `${t ? describe(h, 'triggers', t, rules) : '?'}${more} → ${a ? describe(h, 'actions', a, rules) : '?'}`;
    }
  }
}

// ----------------------------------------------------------------- compilar
function compileTrigger(h, t, id) {
  const sOff = (o) => ({ ...o, id });
  switch (t.type) {
    case 'device': {
      if (t.dir) {
        const tr = { platform: 'numeric_state', entity_id: t.entity, [t.dir]: +t.value };
        if (t.for_min) tr.for = { minutes: +t.for_min };
        return { trigger: sOff(tr) };
      }
      const tr = { platform: 'state', entity_id: t.entity, not_from: ['unavailable', 'unknown'] };
      if (t.to) tr.to = t.to; else tr.not_to = ['unavailable', 'unknown'];
      if (t.for_min && t.to) tr.for = { minutes: +t.for_min };
      return { trigger: sOff(tr) };
    }
    case 'time': return { trigger: sOff({ platform: 'time', at: `${t.at}:00` }), cond: allDays(t.days) ? null : weekdayCond(t.days) };
    case 'sun': return { trigger: sOff({ platform: 'sun', event: t.event, offset: fmtOffset(t.offset) }), cond: allDays(t.days) ? null : weekdayCond(t.days) };
    case 'weather':
      if (t.what === 'condition') return { trigger: sOff({ platform: 'state', entity_id: t.entity, to: t.conds }) };
      return { trigger: sOff({ platform: 'numeric_state', entity_id: t.entity, attribute: { temp: 'temperature', humidity: 'humidity', wind: 'wind_speed' }[t.what], [t.dir]: +t.value }) };
    case 'presence':
      if (t.who === 'first') return { trigger: sOff({ platform: 'numeric_state', entity_id: 'zone.home', above: 0 }) };
      if (t.who === 'last') return { trigger: sOff({ platform: 'numeric_state', entity_id: 'zone.home', below: 1 }) };
      if (!t.zone || t.zone === 'zone.home') return { trigger: sOff({ platform: 'state', entity_id: t.who, ...(t.event === 'leave' ? { from: 'home' } : { to: 'home' }) }) };
      return { trigger: sOff({ platform: 'zone', entity_id: t.who, zone: t.zone, event: t.event === 'leave' ? 'leave' : 'enter' }) };
    case 'alarm': return { trigger: sOff({ platform: 'state', entity_id: t.entity, to: t.to }) };
    case 'button':
      return {
        trigger: sOff({ platform: 'state', entity_id: t.entity, not_from: ['unavailable', 'unknown'], not_to: ['unavailable', 'unknown'] }),
        cond: t.event_type ? { condition: 'state', entity_id: t.entity, attribute: 'event_type', state: t.event_type } : null,
      };
    case 'interval':
      return { trigger: sOff(t.unit === 'h' ? { platform: 'time_pattern', hours: `/${+t.every}`, minutes: 0 } : { platform: 'time_pattern', minutes: `/${+t.every}` }) };
    case 'calendar': return { trigger: sOff({ platform: 'calendar', event: t.event === 'end' ? 'end' : 'start', entity_id: t.entity, offset: fmtOffset(-(+t.offset || 0)) }) };
  }
  throw new Error(`Disparador desconocido: ${t.type}`);
}
function compileCond(h, c) {
  switch (c.type) {
    case 'time': {
      const o = { condition: 'time' };
      if (!c.allday) { o.after = `${c.after}:00`; o.before = `${c.before}:00`; }
      if (!allDays(c.days)) o.weekday = c.days;
      return o;
    }
    case 'sun': return { condition: 'state', entity_id: 'sun.sun', state: c.when === 'day' ? 'above_horizon' : 'below_horizon' };
    case 'device':
      if (c.dir) return { condition: 'numeric_state', entity_id: c.entity, [c.dir]: +c.value };
      return { condition: 'state', entity_id: c.entity, state: c.state };
    case 'presence':
      if (c.who === 'anyone') return { condition: 'numeric_state', entity_id: 'zone.home', above: 0 };
      if (c.who === 'nobody') return { condition: 'state', entity_id: 'zone.home', state: '0' };
      if (c.where === 'away') return { condition: 'not', conditions: [{ condition: 'state', entity_id: c.who, state: 'home' }] };
      return { condition: 'state', entity_id: c.who, state: 'home' };
    case 'alarm': return { condition: 'state', entity_id: c.entity, state: c.state };
    case 'dates': {
      const a = `${pad(c.from_m)}-${pad(c.from_d)}`, b = `${pad(c.to_m)}-${pad(c.to_d)}`;
      return { condition: 'template', value_template: `{% set d = now().strftime('%m-%d') %}{{ ('${a}' <= d <= '${b}') if '${a}' <= '${b}' else (d >= '${a}' or d <= '${b}') }}` };
    }
  }
  throw new Error(`Condición desconocida: ${c.type}`);
}
function compileAction(h, a) {
  switch (a.type) {
    case 'device': {
      const data = {};
      for (const [k, v] of Object.entries(a.params || {})) {
        if (k.startsWith('_') || v === null || v === undefined || v === '') continue;
        data[k] = k === 'rgb_color' ? hexToRgb(v) : k === 'volume_level' ? +v / 100 : v;
      }
      const r = [{ service: a.svc, target: { entity_id: a.entity }, ...(Object.keys(data).length ? { data } : {}) }];
      const off = +(a.params?._off_after || 0);
      if (off > 0 && /\.turn_on$/.test(a.svc)) r.push({ delay: { minutes: off } }, { service: a.svc.replace(/turn_on$/, 'turn_off'), target: { entity_id: a.entity } });
      return r;
    }
    case 'area': return [{ service: `${a.domain}.${AREA_SVC[a.op]}`, target: a.area === 'all' ? { entity_id: 'all' } : { area_id: a.area } }];
    case 'scene': return [{ service: dom(a.entity) === 'script' ? 'script.turn_on' : 'scene.turn_on', target: { entity_id: a.entity } }];
    case 'rule':
      if (a.op === 'run') return [{ service: `${D}.run`, data: { rule_id: a.rule_id } }];
      return [{ service: `${D}.set_enabled`, data: { rule_id: a.rule_id, enabled: a.op === 'enable' } }];
    case 'notify':
      if (a.target === 'persistent') return [{ service: 'persistent_notification.create', data: { title: a.title || 'Aviso', message: a.message } }];
      return [{ service: `notify.${a.target}`, data: { message: a.message, ...(a.title ? { title: a.title } : {}) } }];
    case 'speak': return [{ service: 'tts.speak', target: { entity_id: a.tts }, data: { media_player_entity_id: a.player, message: a.message } }];
    case 'delay': return [{ delay: { hours: +a.h || 0, minutes: +a.m || 0, seconds: +a.s || 0 } }];
    case 'wait': {
      const w = { wait_for_trigger: [{ platform: 'state', entity_id: a.entity, to: a.to }], continue_on_timeout: true };
      if (+a.timeout) w.timeout = { minutes: +a.timeout };
      return [w];
    }
  }
  throw new Error(`Acción desconocida: ${a.type}`);
}

function compileRule(h, d) {
  const u = d.ui;
  const out = { id: d.id, name: (d.name || '').trim(), icon: d.icon, color: d.color, kind: d.kind, enabled: d.enabled !== false, locked: !!d.locked, mode: d.mode || 'restart', ui: u, triggers: [], conditions: [], actions: [], on_stop: [] };
  const turn = (svc, ents) => ({ service: `homeassistant.${svc}`, target: { entity_id: ents } });
  switch (d.kind) {
    case 'scene': out.actions = u.actions.flatMap((a) => compileAction(h, a)); break;
    case 'auto': {
      const tc = [];
      u.triggers.forEach((t, i) => {
        const r = compileTrigger(h, t, `t${i}`);
        out.triggers.push(r.trigger);
        if (r.cond) tc.push({ condition: 'or', conditions: [{ condition: 'not', conditions: [{ condition: 'trigger', id: `t${i}` }] }, r.cond] });
      });
      const uc = u.conditions.map((c) => compileCond(h, c));
      out.conditions = [...tc, ...(u.cond_mode === 'any' && uc.length > 1 ? [{ condition: 'or', conditions: uc }] : uc)];
      out.actions = u.actions.flatMap((a) => compileAction(h, a));
      break;
    }
    case 'period': {
      const mom = (m, id) => (m.type === 'time' ? { platform: 'time', at: `${m.at}:00`, id } : { platform: 'sun', event: m.type, offset: fmtOffset(m.offset), id });
      out.triggers = [mom(u.on, 'on'), mom(u.off, 'off')];
      if (!allDays(u.days)) out.conditions = [weekdayCond(u.days)];
      out.actions = [{ choose: [
        { conditions: [{ condition: 'trigger', id: 'on' }], sequence: [turn('turn_on', u.entities)] },
        { conditions: [{ condition: 'trigger', id: 'off' }], sequence: [turn('turn_off', u.entities)] },
      ] }];
      if (u.catch_up) {
        // si se guarda o se reinicia HA cuando ya debería estar prendido, prender (nunca apaga)
        const lt = (v) => `(as_local(as_datetime(state_attr('sun.sun', '${v}'))).hour * 60 + as_local(as_datetime(state_attr('sun.sun', '${v}'))).minute)`;
        const mins = (m) => (m.type === 'time' ? `${hm(m.at)}` : `(${lt(m.type === 'sunrise' ? 'next_rising' : 'next_setting')} + ${+m.offset || 0}) % 1440`);
        out.actions[0].choose.push({
          conditions: [{ condition: 'template', value_template: `{% set m = now().hour * 60 + now().minute %}{% set a = ${mins(u.on)} %}{% set b = ${mins(u.off)} %}{{ (is_manual | default(false)) and ((a <= m < b) if a < b else (m >= a or m < b)) }}` }],
          sequence: [turn('turn_on', u.entities)],
        });
      }
      break;
    }
    case 'timer': {
      const op = opsFor(h, u.entity).find((o) => o.id === u.op) || opsFor(h, u.entity)[0];
      out.actions = compileAction(h, { type: 'device', entity: u.entity, svc: op.svc, params: {} });
      out.duration = ((+u.h || 0) * 60 + (+u.m || 0)) * 60;
      out.keep = !!u.keep;
      out.fire_at = !u.keep || u.start_now ? new Date(Date.now() + out.duration * 1000).toISOString() : null;
      break;
    }
    case 'irrigation': Object.assign(out, compileIrrigation(u)); out.mode = 'restart'; break;
    case 'circadian': Object.assign(out, compileCircadian(normCirc(u))); out.mode = 'parallel'; break;
    case 'room': break; // la maneja el motor de la integración (sensores + puerta + presencia)
    case 'clima': u.blocks.sort((a, b) => hm(a.from) - hm(b.from)); break;
    case 'night': case 'wake': case 'reminder': case 'calalert': break;
    case 'fdetect': case 'fface': case 'tv': break;
    case 'doorbell': if (typeof u.ring_states === 'string') u.ring_states = u.ring_states.split(',').map((x) => x.trim()).filter(Boolean); break;
    case 'watch': u.items = u.ents.map((e) => ({ entity: e, for_min: +(u.mins?.[mkey(e)] ?? u.default_min) })); break;
    case 'away': break;
    case 'loop': {
      const cycle = [turn('turn_on', u.entity), { delay: { minutes: +u.on_min } }, turn('turn_off', u.entity), { delay: { minutes: +u.off_min } }];
      const win = [];
      if (u.window === 'times') win.push({ condition: 'time', after: `${u.from}:00`, before: `${u.to}:00`, ...(allDays(u.days) ? {} : { weekday: u.days }) });
      else if (!allDays(u.days)) win.push(weekdayCond(u.days));
      out.actions = [{ repeat: { while: [{ condition: 'template', value_template: '{{ true }}' }], sequence: win.length ? [{ if: win, then: cycle, else: [{ delay: { minutes: 1 } }] }] : cycle } }];
      out.on_stop = [turn('turn_off', u.entity)];
      break;
    }
    case 'presence': {
      const list = JSON.stringify(u.entities);
      const rnd = (a, b) => `{% set m = range(${a}, ${b} + 1) | random %}{{ '%02d:%02d:00' % (m // 60, m % 60) }}`;
      const win = u.start === 'sunset'
        ? [{ condition: 'state', entity_id: 'sun.sun', state: 'below_horizon' }, { condition: 'time', after: '12:00:00', before: `${u.to}:00` }]
        : [{ condition: 'time', after: `${u.from}:00`, before: `${u.to}:00` }];
      out.actions = [{ repeat: { while: [{ condition: 'template', value_template: '{{ true }}' }], sequence: [{
        if: win,
        then: [
          { variables: { target: `{{ ${list} | random }}` } },
          turn('turn_on', '{{ target }}'),
          { delay: rnd(+u.min, Math.max(+u.min, +u.max)) },
          turn('turn_off', '{{ target }}'),
          { delay: rnd(1, 8) },
        ],
        else: [{ delay: { minutes: 5 } }],
      }] } }];
      out.on_stop = [turn('turn_off', u.entities)];
      break;
    }
  }
  return out;
}

// ---------------------------------------------------------------- circadiana
// Curva de 4 puntos (minutos del día): A empieza a subir, B máximo, C empieza a bajar, D mínimo.
// factor f: 0 = noche (cálido / tenue) … 1 = día (frío / brillante).
const COLORED_MODES = ['hs', 'xy', 'rgb', 'rgbw', 'rgbww'];
const hm = (t) => { const [a, b] = String(t || '0:0').split(':').map(Number); return a * 60 + b; };
const mh = (m) => { m = ((Math.round(m) % 1440) + 1440) % 1440; return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; };
const offTxt = (min) => (+min ? `${+min > 0 ? '+' : '−'}${durText(Math.abs(min))}` : 'como el sol');
const minsOf = (iso, def) => { const d = iso ? new Date(iso) : null; return d && !isNaN(d) ? d.getHours() * 60 + d.getMinutes() : def; };

function normCirc(u) {
  // reglas guardadas con la versión anterior (despertar / atardecer / dormir)
  if (!u.adjust) u.adjust = u.bri ? 'both' : 'ct';
  if (u.up_start === undefined) {
    u.up_start = u.wake || '06:30'; u.up_end = mh(hm(u.up_start) + 60);
    u.down_start = u.evening || '20:00'; u.down_end = u.sleep || '22:30';
  }
  for (const [k, v] of Object.entries({ mshift: 0, eshift: 0, ramp_up: 120, night_at: '23:00', b_sep: false, b_down: '23:30', b_night: '00:30', b_up: '', b_full: '08:30', respect: true, resume: 120, transition: 'auto', bmin: 30, bmax: 100, kmin: 2200, kmax: 5000, every: 5 })) if (u[k] === undefined || u[k] === null) u[k] = v;
  return u;
}
// El tono «según el sol» sigue la altura real del sol (la misma que calcula HA en sun.sun):
// cálido con el sol por debajo de -6° (antes del alba / después del anochecer civil),
// frío pleno con el sol por encima de 25°, y en el medio va pasando de a poco.
const SUN_LOW = -6, SUN_HIGH = 25;
const sunF = (e) => Math.min(1, Math.max(0, (e - SUN_LOW) / (SUN_HIGH - SUN_LOW)));
function sunElev(lat, lon, date) {
  // fórmula de la NOAA; sólo para mostrar la curva y los horarios en pantalla
  const n = Math.floor((date - new Date(Date.UTC(date.getUTCFullYear(), 0, 0))) / 864e5);
  const hr = date.getUTCHours() + date.getUTCMinutes() / 60;
  const g = (2 * Math.PI / 365) * (n - 1 + (hr - 12) / 24);
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const ha = ((hr * 60 + eqt + 4 * lon) / 4 - 180) * Math.PI / 180;
  const la = lat * Math.PI / 180;
  return Math.asin(Math.sin(la) * Math.sin(decl) + Math.cos(la) * Math.cos(decl) * Math.cos(ha)) * 180 / Math.PI;
}
function sunDay(h) {
  const lat = +(h?.config?.latitude ?? -34.6), lon = +(h?.config?.longitude ?? -58.4);
  const base = new Date(); base.setHours(0, 0, 0, 0);
  const el = []; for (let m = 0; m <= 1440; m += 5) el.push(sunElev(lat, lon, new Date(base.getTime() + m * 6e4)));
  const cross = (th, up) => { for (let i = 1; i < el.length; i++) if (up ? el[i - 1] < th && el[i] >= th : el[i - 1] >= th && el[i] < th) return i * 5; return null; };
  return { el, dawn: cross(SUN_LOW, true), full: cross(SUN_HIGH, true), warm: cross(SUN_HIGH, false), dusk: cross(SUN_LOW, false), sr: cross(-0.833, true), ss: cross(-0.833, false) };
}
const elevAt = (day, m) => day.el[Math.round((((m % 1440) + 1440) % 1440) / 5)];

// horario fijo: A empieza a subir, B pleno, C empieza a bajar, D mínimo (minutos del día)
function circTimes(h, u) {
  const A = hm(u.up_start), B = hm(u.up_end); let C = hm(u.down_start), D = hm(u.down_end);
  if (C < A) C += 1440;
  if (D <= C) D += 1440;
  return { A, B, C, D };
}
const clockLate = (t) => { const m = hm(t); return m < 720 ? m + 1440 : m; };
const briSep = (u) => u.adjust === 'both' && u.b_sep;
// la intensidad tiene horario propio de noche: «por separado», o dimmers según el sol
const briOwn = (u) => (u.adjust === 'bri' ? u.curve === 'sun' : briSep(u));
const briClock = (u) => { const C = clockLate(u.b_down); return { C, D: Math.max(clockLate(u.b_night), C + 15) }; };
function circF(t, m) {
  if (m < t.A) m += 1440;
  return Math.min(1, Math.max(0, Math.min((m - t.A) / Math.max(1, t.B - t.A), (t.D - m) / Math.max(1, t.D - t.C))));
}
const briUp = (u) => (u.b_up ? { U: hm(u.b_up), F: Math.max(hm(u.b_full || '08:30'), hm(u.b_up) + 15) } : null);
const descF = (bc, m) => { const mm = m < 720 ? m + 1440 : m; return Math.min(1, Math.max(0, (bc.D - mm) / (bc.D - bc.C))); };
function toneFAt(u, day, m) { return u.curve === 'sun' ? sunF(elevAt(day, m)) : circF(circTimes(null, u), m); }
function briFAt(u, day, m) {
  if (!briOwn(u)) return toneFAt(u, day, m);
  const bc = briClock(u);
  const up = briUp(u);
  if (u.curve === 'sun') {
    if (up) return m < 720 ? Math.max(descF(bc, m), Math.min(1, Math.max(0, (m - up.U) / (up.F - up.U)))) : descF(bc, m);
    const sr = day.sr ?? 390, ss = day.ss ?? 1170;
    return m >= sr - 60 && m < (sr + ss) / 2 ? sunF(elevAt(day, m)) : descF(bc, m);
  }
  const t = { ...circTimes(null, u), ...(up ? { A: up.U, B: up.F } : {}) }; const C = Math.max(bc.C, t.B);
  return circF({ ...t, C, D: Math.max(bc.D, C + 15) }, m);
}
function circadianNow(h, u) {
  const day = sunDay(h); const d = new Date(); const m = d.getHours() * 60 + d.getMinutes();
  const f = toneFAt(u, day, m), g = briFAt(u, day, m);
  return { k: Math.round(+u.kmin + (u.kmax - u.kmin) * f), b: Math.round(+u.bmin + (u.bmax - u.bmin) * g), f };
}
function kelvinColor(k) {
  // aproximación del color de un blanco de k grados, para la vista previa
  const t = k / 100; let r, g, b;
  if (t <= 66) { r = 255; g = 99.47 * Math.log(t) - 161.12; b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04; }
  else { r = 329.7 * Math.pow(t - 60, -0.1332); g = 288.12 * Math.pow(t - 60, -0.0755); b = 255; }
  const c = (v) => Math.round(Math.min(255, Math.max(0, v)));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}
// plantillas de HA para el factor del tono (f) y de la intensidad (g), ahora y en la actualización anterior
function circVarsTpl(u, every) {
  const head = `{% set m0 = now().hour * 60 + now().minute %}{% set p0 = (m0 - ${every}) % 1440 %}`;
  const sunE = `{% set e = state_attr('sun.sun', 'elevation') | float(0) %}{% set fs = [[(e - (${SUN_LOW})) / ${SUN_HIGH - SUN_LOW}, 0] | max, 1] | min %}`;
  const fixedT = (C, D, A, B) => { const t = circTimes(null, u); return `{% set A = ${A ?? t.A} %}{% set B = ${B ?? t.B} %}{% set C = ${C ?? t.C} %}{% set D = ${D ?? t.D} %}`; };
  const fJ = (x) => `{% set mm = ${x} + 1440 if ${x} < A else ${x} %}{{ ([[ [ (mm - A) / ([B - A, 1] | max), (D - mm) / ([D - C, 1] | max) ] | min, 0] | max, 1] | min) }}`;
  const tone = u.curve === 'sun' ? [`${head}${sunE}{{ fs }}`, `${head}${sunE}{{ fs }}`] : [`${head}${fixedT()}${fJ('m0')}`, `${head}${fixedT()}${fJ('p0')}`];
  let bri = null;
  if (briOwn(u)) {
    const bc = briClock(u);
    if (u.curve === 'sun') {
      const lt = (v) => `(as_local(as_datetime(${v})).hour * 60 + as_local(as_datetime(${v})).minute)`;
      const st = `{% set r = state_attr('sun.sun', 'next_rising') %}{% set s = state_attr('sun.sun', 'next_setting') %}{% set sr = ${lt('r')} if r else 390 %}{% set ss = ${lt('s')} if s else 1170 %}`;
      // a la mañana sube con el sol; desde el mediodía, la bajada de la noche a las horas elegidas
      const up = briUp(u);
      const desc = `[[(${bc.D} - mm) / ${bc.D - bc.C}, 0] | max, 1] | min`;
      const hyb = up
        // subida a la hora elegida (hasta el mediodía), bajada a la noche
        ? (x) => `{% set mm = ${x} + 1440 if ${x} < 720 else ${x} %}{% set d1 = ${desc} %}{{ ([d1, [[(${x} - ${up.U}) / ${up.F - up.U}, 0] | max, 1] | min] | max) if ${x} < 720 else d1 }}`
        : (x) => `{% set mm = ${x} + 1440 if ${x} < 720 else ${x} %}{% if ${x} >= sr - 60 and ${x} < (sr + ss) / 2 %}{{ fs }}{% else %}{{ ${desc} }}{% endif %}`;
      bri = [`${head}${sunE}${st}${hyb('m0')}`, `${head}${sunE}${st}${hyb('p0')}`];
    } else {
      const up = briUp(u);
      const t = { ...circTimes(null, u), ...(up ? { A: up.U, B: up.F } : {}) }; const C = Math.max(bc.C, t.B); const D = Math.max(bc.D, C + 15);
      bri = [`${head}${fixedT(C, D, t.A, t.B)}${fJ('m0')}`, `${head}${fixedT(C, D, t.A, t.B)}${fJ('p0')}`];
    }
  }
  return { tone, bri };
}
function compileCircadian(u) {
  const L = JSON.stringify(u.entities);
  const ct = u.adjust !== 'bri', bri = u.adjust !== 'ct';
  const every = +u.every || 5;
  const T = circVarsTpl(u, every);
  const vars = { f: T.tone[0], fp: T.tone[1] };
  let g = 'f', gp = 'fp';
  if (T.bri) { vars.g = T.bri[0]; vars.gp = T.bri[1]; g = 'g'; gp = 'gp'; }
  if (ct) { vars.k = `{{ (${+u.kmin} + ${u.kmax - u.kmin} * f) | round(0) | int }}`; vars.kp = `{{ (${+u.kmin} + ${u.kmax - u.kmin} * fp) | round(0) | int }}`; }
  if (bri) { vars.b = `{{ (${+u.bmin} + ${u.bmax - u.bmin} * ${g}) | round(0) | int }}`; vars.bp = `{{ (${+u.bmin} + ${u.bmax - u.bmin} * ${gp}) | round(0) | int }}`; }
  // transición continua: cada ajuste dura lo mismo que el intervalo, así baja/sube parejo
  const tickTr = u.transition === 'auto' ? Math.max(0, every * 60 - 5) : +u.transition || 0;
  const data = (tr) => ({ ...(ct ? { color_temp_kelvin: '{{ k }}' } : {}), ...(bri ? { brightness_pct: '{{ b }}' } : {}), transition: tr });
  const col = JSON.stringify(COLORED_MODES);
  // en blanco = no está en modo color; las RGB sin blanco propio siempre se ajustan
  const white = (e) => `(state_attr(${e}, 'color_mode') not in ${col} or 'color_temp' not in (state_attr(${e}, 'supported_color_modes') or []))`;
  // cambio manual: el valor actual no está entre lo que puso la automatización antes y ahora
  const kNow = (e) => `(state_attr(${e}, 'color_temp_kelvin') | int(0))`;
  const kClamp = (x, e) => `([[${x}, state_attr(${e}, 'min_color_temp_kelvin') | int(0)] | max, state_attr(${e}, 'max_color_temp_kelvin') | int(99999)] | min)`;
  const ctOk = (e) => `(state_attr(${e}, 'color_temp_kelvin') is none or (${kNow(e)} >= ${kClamp('[kp, k] | min', e)} - 200 - (k - kp) | abs and ${kNow(e)} <= ${kClamp('[kp, k] | max', e)} + 200 + (k - kp) | abs))`;
  const bNow = (e) => `((state_attr(${e}, 'brightness') | int(0)) * 100 / 255)`;
  const briOk = (e) => `(state_attr(${e}, 'brightness') is none or (${bNow(e)} >= ([bp, b] | min) - 6 - (b - bp) | abs and ${bNow(e)} <= ([bp, b] | max) + 6 + (b - bp) | abs))`;
  const manualOk = (e) => {
    if (!u.respect) return '';
    // al arrancar / «Probar ahora» (is_manual) se ajustan todas; si no, sólo las que nadie tocó
    const ok = [ct ? ctOk(e) : '', bri ? briOk(e) : ''].filter(Boolean).join(' and ');
    // la automatización no vuelve a tocar una luz «manual», así que su último cambio marca desde cuándo lo está
    const back = +u.resume > 0 ? ` or (as_timestamp(now()) - as_timestamp(states[${e}].last_updated)) > ${+u.resume * 60}` : '';
    return ` and ((is_manual | default(false)) or (${ok})${back})`;
  };

  const triggers = [
    // al encenderse una luz: llevarla en el acto a lo que corresponde (y se olvida el ajuste manual)
    { platform: 'state', entity_id: u.entities, from: 'off', to: 'on', id: 'on' },
    { platform: 'time_pattern', minutes: `/${every}`, id: 'tick' },
  ];
  const actions = [
    { variables: vars },
    { choose: [{
      conditions: [{ condition: 'trigger', id: 'on' }],
      sequence: [
        { condition: 'template', value_template: `{{ ${white('trigger.entity_id')} }}` },
        { service: 'light.turn_on', target: { entity_id: '{{ trigger.entity_id }}' }, data: data(0) },
      ],
    }],
    default: [
      { variables: { targets: `{% set ns = namespace(l=[]) %}{% for e in ${L} if is_state(e, 'on') and ${white('e')}${manualOk('e')} %}{% set ns.l = ns.l + [e] %}{% endfor %}{{ ns.l }}` } },
      { if: [{ condition: 'template', value_template: '{{ targets | count > 0 }}' }], then: [{ service: 'light.turn_on', target: { entity_id: '{{ targets }}' }, data: data(tickTr) }] },
      // Zigbee2MQTT: a las apagadas se les deja el tono listo sin prenderlas (execute_if_off)
      ...(u.z2m && ct ? u.entities.filter((e) => u.z2m_map?.[e]).map((e) => ({
        if: [{ condition: 'state', entity_id: e, state: 'off' }],
        then: [{ service: 'mqtt.publish', data: { topic: `${(u.z2m_base || 'zigbee2mqtt').replace(/\/+$/, '')}/${u.z2m_map[e]}/set/color_temp`, payload: '{{ (1000000 / k) | round(0) | int }}' }, continue_on_error: true }],
      })) : []),
    ] },
  ];
  return { triggers, conditions: [], actions, on_stop: [] };
}

// -------------------------------------------------------------------- riego
const RAINY = ['rainy', 'pouring', 'lightning-rainy', 'snowy-rainy', 'hail', 'snowy'];
function compileIrrigation(u) {
  const isValve = (e) => dom(e) === 'valve';
  const on = (e) => (isValve(e) ? { service: 'valve.open_valve', target: { entity_id: e } } : { service: 'homeassistant.turn_on', target: { entity_id: e } });
  const off = (e) => (isValve(e) ? { service: 'valve.close_valve', target: { entity_id: e } } : { service: 'homeassistant.turn_off', target: { entity_id: e } });
  const wait = (sec) => ({ delay: { seconds: +sec || 0 } });
  const manual = '(is_manual | default(false))';
  const valves = [...new Set(u.zones.map((z) => z.valve).filter(Boolean))];
  // apagar todo: primero la bomba, después las válvulas (nunca bomba contra válvulas cerradas)
  const allOff = [...(u.pump ? [off(u.pump), ...(valves.length ? [wait(u.pump_delay)] : [])] : []), ...valves.map(off)];
  const notify = (msg) => (u.notify ? [{ service: `notify.${u.notify}`, data: { title: '💧 Riego', message: msg }, continue_on_error: true }] : []);

  const triggers = u.starts.map((m) => (m.type === 'time' ? { platform: 'time', at: `${m.at}:00`, id: 'start' } : { platform: 'sun', event: m.type, offset: fmtOffset(m.offset), id: 'start' }));
  if (u.rain && u.rain_stop) triggers.push({ platform: 'state', entity_id: u.rain, to: 'on', id: 'rain' });

  const main = [...allOff];
  // días y temporada (no aplican a «Regar ahora»)
  const dayConds = [];
  if (u.days_mode === 'every') dayConds.push({ condition: 'template', value_template: `{{ ((now().date() - strptime('${u.anchor}', '%Y-%m-%d').date()).days) % ${+u.every || 1} == 0 }}` });
  else if (!allDays(u.days)) dayConds.push(weekdayCond(u.days));
  if ((u.months || []).length < 12) dayConds.push({ condition: 'template', value_template: `{{ now().month in ${JSON.stringify(u.months.map(Number))} }}` });
  if (dayConds.length) main.push({ condition: 'or', conditions: [{ condition: 'template', value_template: `{{ ${manual} }}` }, { condition: 'and', conditions: dayConds }] });

  // motivos para no regar: cada uno se evalúa sólo si está configurado
  const W = u.weather; const checks = [];
  if (u.rain) checks.push(`{% if is_state('${u.rain}', 'on') %}{% set r.v = 'el sensor detecta lluvia' %}{% endif %}`);
  if (W && u.w_raining) checks.push(`{% if states('${W}') in ${JSON.stringify(RAINY)} %}{% set r.v = 'está lloviendo' %}{% endif %}`);
  if (W && (u.w_prob != null || u.w_mm != null)) {
    main.push({ service: 'weather.get_forecasts', target: { entity_id: W }, data: { type: 'daily' }, response_variable: 'fc', continue_on_error: true });
    const day = `{% set f = fc['${W}'].forecast if (fc is defined and fc is mapping and '${W}' in fc) else [] %}{% set d = f[0] if f | length > 0 else {} %}`;
    if (u.w_prob != null) checks.push(`${day}{% set p = d.precipitation_probability | default(0) | float(0) %}{% if p >= ${+u.w_prob} %}{% set r.v = 'el pronóstico da ' ~ (p | round(0) | int) ~ '% de lluvia' %}{% endif %}`);
    if (u.w_mm != null) checks.push(`${day}{% set mm = d.precipitation | default(0) | float(0) %}{% if mm >= ${+u.w_mm} %}{% set r.v = 'se esperan ' ~ mm ~ ' mm de lluvia' %}{% endif %}`);
  }
  if (W && u.w_frost != null) checks.push(`{% set t = state_attr('${W}', 'temperature') | float(99) %}{% if t < ${+u.w_frost} %}{% set r.v = 'hace ' ~ t ~ '°, riesgo de helada' %}{% endif %}`);
  if (W && u.w_wind != null) checks.push(`{% set w = state_attr('${W}', 'wind_speed') | float(0) %}{% if w > ${+u.w_wind} %}{% set r.v = 'hay mucho viento (' ~ w ~ ')' %}{% endif %}`);
  if (checks.length) {
    main.push({ variables: { skip: `{% set r = namespace(v='') %}${checks.join('')}{{ r.v }}` } });
    main.push({ if: [{ condition: 'template', value_template: `{{ skip != '' and not ${manual} }}` }], then: [...(u.n_skip ? notify('Hoy no se riega: {{ skip }}') : []), { stop: 'Riego salteado' }] });
  }

  const adj = (+u.adjust || 100) / 100;
  const active = u.zones.length;
  if (u.n_start) main.push(...notify(`Empieza el riego (${active} ${active === 1 ? 'zona' : 'zonas'})`));
  u.zones.forEach((z, i) => {
    const minutes = Math.max(1, Math.round(+z.min * adj));
    let seq;
    if (z.valve && u.pump) seq = [on(z.valve), wait(u.pump_delay), on(u.pump), { delay: { minutes } }, off(u.pump), wait(u.pump_delay), off(z.valve)];
    else if (z.valve) seq = [on(z.valve), { delay: { minutes } }, off(z.valve)];
    else seq = [on(u.pump), { delay: { minutes } }, off(u.pump)];
    // humedad del suelo: si el sensor no existe o no responde, se riega igual
    if (z.soil) seq = [{ if: [{ condition: 'template', value_template: `{{ ${manual} or states('${z.soil}') | float(-1) < ${+z.soil_max} }}` }], then: seq }];
    main.push(...seq);
    if (i < u.zones.length - 1 && +u.gap > 0) main.push(wait(u.gap));
  });
  if (u.n_end) main.push(...notify('Terminó el riego'));

  const actions = [{ choose: [{ conditions: [{ condition: 'trigger', id: 'rain' }], sequence: [...allOff, ...notify('Se cortó el riego: empezó a llover')] }], default: main }];
  return { triggers, conditions: [], actions, on_stop: allOff };
}

// ---------------------------------------------------------- validaciones UI
function missing(list, it) {
  const need = (v, msg) => (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length) ? msg : '');
  if (list === 'triggers') {
    switch (it.type) {
      case 'device': return need(it.entity, 'Elegí el dispositivo') || (it.dir ? need(it.value, 'Poné un valor') : '');
      case 'time': return need(it.at, 'Elegí la hora');
      case 'weather': return need(it.entity, 'Elegí el pronóstico') || (it.what === 'condition' ? need(it.conds, 'Elegí al menos un clima') : need(it.value, 'Poné un valor'));
      case 'presence': return need(it.who, 'Elegí quién');
      case 'alarm': return need(it.entity, 'Elegí la alarma') || need(it.to, 'Elegí el estado');
      case 'button': return need(it.entity, 'Elegí el botón');
      case 'interval': return +it.every >= 1 && +it.every <= (it.unit === 'h' ? 23 : 59) ? '' : `Elegí entre 1 y ${it.unit === 'h' ? 23 : 59}`;
      case 'calendar': return need(it.entity, 'Elegí el calendario');
    }
  }
  if (list === 'conditions') {
    switch (it.type) {
      case 'time': return it.allday && allDays(it.days) ? 'Elegí un horario o algunos días' : '';
      case 'device': return need(it.entity, 'Elegí el dispositivo') || (it.dir ? need(it.value, 'Poné un valor') : need(it.state, 'Elegí el estado'));
      case 'presence': return need(it.who, 'Elegí quién');
      case 'alarm': return need(it.entity, 'Elegí la alarma') || need(it.state, 'Elegí el estado');
    }
  }
  if (list === 'actions') {
    switch (it.type) {
      case 'device': return need(it.entity, 'Elegí el dispositivo') || need(it.svc, 'Elegí qué hacer');
      case 'area': return need(it.area, 'Elegí el ambiente') || need(it.domain, 'Elegí qué equipos') || need(it.op, 'Elegí qué hacer');
      case 'scene': return need(it.entity, 'Elegí la escena');
      case 'rule': return need(it.rule_id, 'Elegí la automatización');
      case 'notify': return need(it.target, 'Elegí a quién avisar') || need(it.message, 'Escribí el mensaje');
      case 'speak': return need(it.tts, 'Elegí la voz') || need(it.player, 'Elegí el parlante') || need(it.message, 'Escribí el mensaje');
      case 'delay': return (+it.h || 0) + (+it.m || 0) + (+it.s || 0) > 0 ? '' : 'Poné cuánto esperar';
      case 'wait': return need(it.entity, 'Elegí el dispositivo') || need(it.to, 'Elegí el estado');
    }
  }
  return '';
}
function draftError(d) {
  const u = d.ui;
  if (!(d.name || '').trim() && !['timer', 'reminder'].includes(d.kind)) return 'Ponele un nombre';
  switch (d.kind) {
    case 'scene': case 'auto': {
      if (d.kind === 'auto' && !u.triggers.length) return 'Agregá al menos un «Si…»';
      if (!u.actions.length) return 'Agregá al menos una acción';
      for (const l of ['triggers', 'conditions', 'actions']) for (const it of u[l] || []) { const m = missing(l, it); if (m) return m; }
      return '';
    }
    case 'period': return !u.entities.length ? 'Elegí al menos un dispositivo' : '';
    case 'timer': return !u.entity ? 'Elegí el dispositivo' : (+u.h || 0) * 60 + (+u.m || 0) < 1 ? 'Poné el tiempo' : '';
    case 'loop': return !u.entity ? 'Elegí el dispositivo' : +u.on_min < 1 || +u.off_min < 1 ? 'Los tiempos tienen que ser de 1 minuto o más' : '';
    case 'presence': return !u.entities.length ? 'Elegí al menos una luz' : +u.min < 1 ? 'Poné los minutos' : '';
    case 'circadian': {
      normCirc(u);
      if (!u.entities.length) return 'Elegí al menos una luz';
      if (u.adjust !== 'bri' && +u.kmin >= +u.kmax) return 'El blanco de la noche tiene que ser más cálido que el del día';
      if (u.adjust !== 'ct' && +u.bmin > +u.bmax) return 'El brillo de la noche tiene que ser menor que el del día';
      if (u.curve === 'fixed') {
        const A = hm(u.up_start), B = hm(u.up_end), t = circTimes(null, u);
        if (!(B > A)) return 'La luz plena tiene que ser después del amanecer en casa';
        if (!(t.C >= B)) return 'El atardecer en casa tiene que ser después de la luz plena';
        if (t.D - A >= 1440 || (t.D > 1440 && t.D - 1440 > 300)) return 'La luz de noche puede ser como máximo a las 05:00';
      }
      return '';
    }
    case 'tv':
      if (!u.tv) return 'Elegí la tele';
      if (u.cine && !u.cine_lights.length && !u.cine_covers.length && !u.cine_scene) return 'Modo cine: elegí luces, persianas o una escena';
      if (!u.cine && !u.companions.length && !u.presence.length && !(u.empty_motion || []).length && !u.bedtime && !u.night_vol && !u.pause_on.length) return 'Activá al menos una función';
      if ((u.empty_doors || []).length && !(u.empty_motion || []).length && !u.presence.length) return 'Tele sin nadie: el sensor de puerta necesita uno de movimiento o de presencia';
      return '';
    case 'fdetect':
      if (!u.labels.length) return 'Elegí qué detectar';
      return '';
    case 'fface':
      if (!u.any_known && !u.people.length && !u.plates.length) return 'Elegí las personas o patentes (o «cualquier persona conocida»)';
      if (u.disarm && !u.alarm) return 'Elegí la alarma';
      return '';
    case 'gate':
      if (u.relays === 'two' ? !(u.open_relay && u.close_relay) : !u.relay) return u.relays === 'two' ? 'Elegí el relé de abrir y el de cerrar' : 'Elegí el relé que da el pulso';
      if (!u.closed_sensor && !u.open_sensor) return 'Elegí el sensor de cerrado';
      return '';
    case 'guest':
      if (!u.devices.length) return 'Elegí qué pueden abrir tus invitados';
      if (u.base_url && !/^https?:\/\/\S+/.test(u.base_url)) return 'La dirección de tu casa tiene que empezar con https://';
      return '';
    case 'doorbell':
      if (!u.ring) return 'Elegí el sensor del timbre';
      return '';
    case 'reminder':
      if (!(u.text || '').trim()) return 'Escribí qué te recuerdo';
      if (!u.date || !u.time) return 'Elegí el día y la hora';
      if (u.repeat === 'weekly' && !u.days.length) return 'Elegí los días';
      return '';
    case 'calalert':
      if (!u.calendars.length) return 'Elegí los calendarios';
      return '';
    case 'night':
      if (u.auto && !u.common.length) return 'Elegí los sensores de movimiento de las áreas comunes (o desactivá «Que se active sola»)';
      if (u.arm && !u.alarm) return 'Elegí la alarma';
      return '';
    case 'clima':
      if (!u.entities.length) return 'Elegí los aires';
      if (!u.blocks.length) return 'Agregá al menos un horario';
      return '';
    case 'wake':
      if (!u.lights.length && !u.covers.length) return 'Elegí luces o persianas';
      if (u.time_mode === 'phone' && !u.phone) return 'Elegí el celular';
      if (u.time_mode === 'fixed' && !u.days.length) return 'Elegí los días';
      return '';
    case 'watch':
      if (!u.ents.length) return 'Elegí qué vigilar';
      return '';
    case 'away':
      if (u.detect === 'alarm' && !u.alarm) return 'Elegí la alarma';
      if (u.arm && !u.alarm) return 'Elegí la alarma que querés armar';
      return '';
    case 'room':
      if (!u.only_sensor && !u.lights.length) return 'Elegí las luces';
      if (!u.motion.length && !u.presence.length) return 'Elegí al menos un sensor de movimiento o de presencia';
      if (u.when === 'lux' && !u.lux) return 'Elegí el sensor de luz';
      return '';
    case 'irrigation': {
      if (!u.zones.length) return 'Agregá al menos una zona';
      const withValve = u.zones.filter((z) => z.valve).length;
      if (!u.pump && !withValve) return 'Elegí la bomba o las electroválvulas';
      if (!withValve && u.zones.length > 1) return 'Sin electroválvulas sólo puede haber una zona (riega con la bomba sola)';
      if (withValve && withValve < u.zones.length) return 'Cada zona necesita su electroválvula';
      if (u.zones.some((z) => !(+z.min >= 1))) return 'Cada zona tiene que regar 1 minuto o más';
      if (u.zones.some((z) => z.soil && !(+z.soil_max > 0))) return 'Poné el límite de humedad del suelo';
      if (!u.starts.length) return 'Agregá al menos un horario de inicio';
      if (u.days_mode === 'week' && !u.days.length) return 'Elegí los días';
      if (u.days_mode === 'every' && !(+u.every >= 1)) return 'Poné cada cuántos días';
      if (!u.months.length) return 'Elegí al menos un mes';
      return '';
    }
  }
  return '';
}

// ------------------------------------------------------------ nuevos / ideas
const KIND_META = {
  scene: { icon: 'mdi:gesture-tap', title: 'Escena (tocar para ejecutar)' },
  auto: { icon: 'mdi:creation', title: 'Automatización' },
  period: { icon: 'mdi:clock-time-eight-outline', title: 'Encender en un horario' },
  timer: { icon: 'mdi:timer-outline', title: 'Temporizador' },
  loop: { icon: 'mdi:repeat', title: 'Ciclo' },
  presence: { icon: 'mdi:home-lightbulb-outline', title: 'Simular presencia' },
  irrigation: { icon: 'mdi:sprinkler-variant', title: 'Riego por zonas' },
  circadian: { icon: 'mdi:sun-clock-outline', title: 'Luz circadiana' },
  room: { icon: 'mdi:motion-sensor', title: 'Luz por presencia' },
  watch: { icon: 'mdi:alert-circle-outline', title: 'Avisar si algo quedó abierto' },
  away: { icon: 'mdi:home-export-outline', title: 'Me voy / Llego' },
  night: { icon: 'mdi:weather-night', title: 'Buenas noches' },
  clima: { icon: 'mdi:thermostat-auto', title: 'Clima inteligente' },
  wake: { icon: 'mdi:alarm-light-outline', title: 'Despertador con luz' },
  reminder: { icon: 'mdi:bell-ring-outline', title: 'Recordatorio' },
  calalert: { icon: 'mdi:calendar-alert', title: 'Avisos del calendario' },
  doorbell: { icon: 'mdi:doorbell-video', title: 'Portero' },
  fdetect: { icon: 'mdi:cctv', title: 'Detección con cámaras' },
  fface: { icon: 'mdi:face-recognition', title: 'Caras y patentes conocidas' },
  tv: { icon: 'mdi:television-classic', title: 'Tele inteligente' },
  guest: { icon: 'mdi:account-key', title: 'Invitados' },
  gate: { icon: 'mdi:gate', title: 'Portón inteligente' },
};
// «equipos» que arma sólo el instalador: el cliente no los ve ni los toca
const installerOnly = (r) => !!r && (r.installer_only || r.kind === 'gate' || (r.kind === 'room' && !!r.ui?.only_sensor));
const CLIENT_KINDS = [['scene', 'Escenas'], ['auto', 'Automáticas («Si… entonces…»)'], ['timer', 'Temporizadores'], ['reminder', 'Recordatorios'], ['calalert', 'Avisos del calendario'],
  ['period', 'Encender en un horario'], ['loop', 'Ciclos'], ['presence', 'Simular presencia'], ['wake', 'Despertador con luz'], ['night', 'Buenas noches'], ['away', 'Me voy / Llego'],
  ['room', 'Luz por presencia'], ['circadian', 'Luz circadiana y brillo'], ['clima', 'Clima inteligente'], ['tv', 'Tele inteligente'], ['watch', 'Avisar si algo quedó abierto'],
  ['guest', 'Invitados'], ['doorbell', 'Portero'], ['fdetect', 'Detección con cámaras'], ['fface', 'Caras y patentes'], ['irrigation', 'Riego']];
const TV_APPS = ['Netflix', 'Prime Video', 'Disney+', 'Max', 'YouTube', 'Paramount+', 'Apple TV', 'Plex', 'Kodi', 'Flow', 'Star+', 'Crunchyroll'];
const FLABELS = { person: 'Persona', car: 'Auto', motorcycle: 'Moto', bicycle: 'Bicicleta', truck: 'Camión', dog: 'Perro', cat: 'Gato', bird: 'Pájaro', package: 'Paquete' };
const REM_KINDS = ['reminder', 'calalert'];
const DIAS_L = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function whenText(at) {
  const d = new Date(at); if (isNaN(d)) return '';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = new Date(d); day.setHours(0, 0, 0, 0);
  const diff = Math.round((day - today) / 864e5);
  const hhmm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (diff === 0) return `hoy ${hhmm}`;
  if (diff === 1) return `mañana ${hhmm}`;
  if (diff > 1 && diff < 7) return `el ${DIAS_L[d.getDay()]} ${hhmm}`;
  return `${DIAS_L[d.getDay()].slice(0, 3)} ${d.getDate()}/${d.getMonth() + 1} ${hhmm}`;
}
function remRepeat(u) {
  switch (u.repeat) {
    case 'daily': return 'todos los días';
    case 'weekly': return daysText(u.days);
    case 'monthly': { const d = (u.date || '').split('-')[2]; return d ? `el ${+d} de cada mes` : 'cada mes'; }
    case 'yearly': { const p = (u.date || '').split('-'); return p.length === 3 ? `cada ${+p[2]}/${+p[1]}` : 'cada año'; }
    default: return '';
  }
}
const SMART_KINDS = ['period', 'loop', 'presence', 'irrigation', 'circadian', 'room', 'watch', 'away', 'night', 'clima', 'wake', 'doorbell', 'fdetect', 'fface', 'tv', 'guest', 'gate'];
const GUEST_PATH = '/api/matterai_escenas/invitado/';
function invState(i) {
  const now = Date.now();
  if (i.paused) return ['paused', 'Pausada'];
  if (i.from && now < Date.parse(i.from)) return ['early', `Empieza ${whenText(i.from)}`];
  if (i.until && now > Date.parse(i.until)) return ['expired', 'Vencida'];
  if (i.max_uses && (i.uses || 0) >= i.max_uses) return ['used', 'Sin aperturas'];
  return ['ok', i.until ? `Hasta ${whenText(i.until)}` : 'Sin vencimiento'];
}
function invRules(i) {
  return [i.days?.length ? daysText(i.days) : '', i.hours ? `de ${i.h_from} a ${i.h_to}` : '', i.max_uses ? `${i.uses || 0}/${i.max_uses} aperturas` : (i.uses ? `${i.uses} aperturas` : '')].filter(Boolean).join(' · ');
}
const localInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const INV_PRESETS = [['1h', '1 hora'], ['3h', '3 horas'], ['today', 'Hasta las 23:59'], ['24h', '24 horas'], ['3d', '3 días'], ['7d', '1 semana'], ['30d', '1 mes'], ['custom', 'Elegir fechas'], ['never', 'Sin vencimiento']];
function invWindow(x) {
  const now = new Date();
  const add = (ms) => new Date(now.getTime() + ms);
  switch (x.preset) {
    case '1h': return [now, add(36e5)];
    case '3h': return [now, add(3 * 36e5)];
    case 'today': { const e = new Date(now); e.setHours(23, 59, 0, 0); return [now, e]; }
    case '24h': return [now, add(864e5)];
    case '3d': return [now, add(3 * 864e5)];
    case '7d': return [now, add(7 * 864e5)];
    case '30d': return [now, add(30 * 864e5)];
    case 'never': return [now, null];
    default: return [x.from ? new Date(x.from) : now, x.until ? new Date(x.until) : null];
  }
}
// Marca MatterAI (ver NOTICE.md)
const LOGO = '<svg viewBox="0 0 100 100" aria-hidden="true"><defs><mask id="maeiso"><polygon points="50.0,4.0 89.8,27.0 89.8,73.0 50.0,96.0 10.2,73.0 10.2,27.0" fill="#fff" stroke="#fff" stroke-width="6" stroke-linejoin="round"/><circle cx="50" cy="50" r="39" fill="#000"/><g stroke="#000" stroke-width="7"><line x1="50" y1="50" x2="80.0" y2="-2.0"/><line x1="50" y1="50" x2="110.0" y2="50.0"/><line x1="50" y1="50" x2="80.0" y2="102.0"/><line x1="50" y1="50" x2="20.0" y2="102.0"/><line x1="50" y1="50" x2="-10.0" y2="50.0"/><line x1="50" y1="50" x2="20.0" y2="-2.0"/></g></mask></defs><rect width="100" height="100" fill="currentColor" mask="url(#maeiso)"/></svg>';
const BRAND = `<a class="brand" href="https://matterai.com.ar" target="_blank" rel="noopener" title="MatterAI · Domótica & Automatismo">${LOGO}<span>Hecho por <b>MatterAI</b></span></a>`;
const mkey = (eid) => String(eid).replace(/\./g, '__'); // claves con punto rompen las rutas del editor
const newZone = (n) => ({ name: `Zona ${n}`, valve: null, min: 10, soil: null, soil_max: 60 });
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
function newDraft(kind, extra = {}) {
  const base = { kind, name: '', icon: KIND_META[kind].icon, color: COLORS[Math.floor(Math.random() * COLORS.length)], enabled: true, mode: 'restart' };
  const ui = {
    scene: { triggers: [], conditions: [], cond_mode: 'all', actions: [] },
    auto: { triggers: [], conditions: [], cond_mode: 'all', actions: [] },
    period: { entities: [], on: { type: 'time', at: '08:00', offset: 0 }, off: { type: 'time', at: '20:00', offset: 0 }, days: [...ALL_DAYS] },
    timer: { entity: null, op: 'off', h: 0, m: 30, keep: false, start_now: true },
    loop: { entity: null, on_min: 15, off_min: 45, window: 'always', from: '08:00', to: '20:00', days: [...ALL_DAYS] },
    presence: { entities: [], start: 'sunset', from: '19:00', to: '23:30', min: 10, max: 40 },
    circadian: { entities: [], adjust: 'ct', curve: 'sun', kmin: 2200, kmax: 5000, bmin: 30, bmax: 100, mshift: 0, ramp_up: 120, eshift: 0, night_at: '23:00', up_start: '06:30', up_end: '08:30', down_start: '20:30', down_end: '21:15', every: 5, transition: 'auto', respect: true, z2m: false, z2m_base: 'zigbee2mqtt', z2m_map: {} },
    night: {
      auto: true, common: [], from: '22:00', to: '02:00', quiet_min: 20, ask: true, ask_wait: 5, ask_default: true, retry_min: 30,
      lights: 'all', lights_list: [], keep: [], media: 'all', media_list: [], switches: [], night_lights: [], night_pct: 5,
      climate: [], climate_action: 'temp', climate_temp: 25, covers: 'none', covers_list: [], locks: [], alarm: null, arm: false, code: '',
      rules_on: [], check_open: true, notify: true, recipients: [],
    },
    clima: {
      entities: [], mode: 'cool', blocks: [{ from: '07:00', on: true, cool: 24, heat: 21 }, { from: '23:00', on: true, cool: 26, heat: 19 }],
      windows: [], window_delay: 60, away_off: false, away_delay: 10, room_motion: [], room_empty_min: 30, room_action: 'eco',
      outdoor: null, cool_min_out: '', heat_max_out: '', manual_hold: true, notify_window: false, recipients: [],
    },
    wake: {
      time_mode: 'fixed', time: '07:00', days: ['mon', 'tue', 'wed', 'thu', 'fri'], phone: null, ramp: 20,
      lights: [], start_pct: 1, end_pct: 80, start_k: 2200, end_k: 4000,
      covers: [], natural: true, cover_mode: 'gradual', lux: null, lux_min: 50,
      media: null, volume: 20, climate: [], climate_before: 30, climate_mode: 'heat', climate_temp: 22, only_home: false,
    },
    tv: {
      tv: null, cine: true, cine_mode: 'both', cine_cfg: {}, cine_apps: [], cine_dark: true, cine_lights: [], cine_pct: 10, pause_pct: 30, cine_covers: [], cine_scene: null, restore: true, restore_delay: 10, cine_switch: false, cine_switch_name: 'Modo cine',
      companions: [], companion_delay: 30, presence: [], empty_motion: [], empty_doors: [], empty_min: 20, empty_pause: true, empty_wait: 3,
      bedtime: false, bed_at: '22:00', bed_until: '07:00', bed_days: ['sun', 'mon', 'tue', 'wed', 'thu'], bed_block: true,
      night_vol: false, vol_from: '23:00', vol_to: '07:00', vol_max: 25, pause_on: [],
    },
    fdetect: {
      labels: ['person'], min_score: 0.7, cameras: [], zones: [], when: 'night', from: '22:00', to: '07:00', only_away: false, only_armed: null,
      known: 'ignore', people_ok: [], faces_on: true, loiter_s: 0, recipients: [], critical: false, cooldown_min: 3,
      lights: [], lights_auto: true, lights_dark: true, light_min: 5, siren: null, siren_auto: false, siren_s: 30, speakers: [], tts: null, message: '',
    },
    fface: {
      any_known: false, people: [], plates: [], cameras: [], zones: [], when: 'always', from: '07:00', to: '23:00', cooldown_min: 30,
      notify: true, recipients: [], message: 'Llegó {nombre}', silent: false, unlock: null, unlock_mode: 'ask', unlock_name: 'Abrir', code: '',
      disarm: false, alarm: null, lights: [], lights_dark: true, speakers: [], tts: null, welcome: 'Bienvenido, {nombre}', rules_run: [],
    },
    doorbell: {
      face_sensor: null,
      ring: null, ring_states: '', camera: null, unlock: null, unlock_name: 'Abrir puerta', unlock2: null, unlock2_name: 'Abrir portón', code: '', pulse: 1,
      recipients: [], ring_style: 'call', ring_repeat: true, ring_secs: 40, speakers: [], tts: null, message: 'Están tocando el timbre',
      light: null, light_min: 3, light_dark: true, quiet: false, quiet_from: '23:00', quiet_to: '07:00', snapshots: true, stream: '',
    },
    gate: { relays: 'one', relay: null, open_relay: null, close_relay: null, pulse_s: 0, closed_sensor: null, closed_when: 'off', open_sensor: null, open_when: 'on',
      travel_s: 0, gate_type: 'gate', open_alert_min: 0, night_close: false, night_at: '23:00', recipients: [] },
    guest: { devices: [], cfg: {}, recipients: [], notify_use: true, notify_denied: true, title: '', welcome: '', base_url: '', code: '' },
    reminder: { text: '', date: '', time: '', repeat: 'none', days: [], recipients: [], critical: false, nag_min: 0 },
    calalert: { calendars: [], before_min: 15, all_day: true, all_day_time: '08:00', recipients: [], critical: false },
    watch: {
      ents: [], mins: {}, default_min: 10, only_away: false, only_night: false,
      recipients: [], critical: false, repeat_min: 30, max_repeats: 5, auto_fix: false, auto_fix_min: 15, notify_fixed: true,
    },
    away: {
      detect: 'people', leave_delay: 5, alarm: null, code: '', cancel_motion: [], cancel_motion_min: 10,
      lights: 'all', lights_list: [], climate: 'all', climate_list: [], covers: 'none', covers_list: [], switches: [], locks: [], arm: false,
      rules_on: [], check_open: 'auto', check_list: [],
      welcome: [], welcome_dark: true, disarm: false, arrive_climate: [], arrive_mode: 'cool', arrive_temp: 24,
      recipients: [], notify_leave: true, notify_arrive: false, open_critical: false,
    },
    room: {
      only_sensor: false, lights: [], motion: [], doors: [], presence: [],
      when: 'always', elev: 2, lux: null, lux_max: 30, on_door: true,
      day_pct: '', night: false, night_from: '23:00', night_to: '06:30', night_pct: 10,
      timeout: 5, door_timeout: 1, seal_window: 30, sealed_max: 60, manual_block: -1, warn_s: 20,
      fan: null, fan_delay: 2, fan_after: 5, humidity: null, hum_max: 70,
    },
    irrigation: {
      pump: null, pump_delay: 3, gap: 10,
      zones: [newZone(1), newZone(2)],
      starts: [{ type: 'time', at: '06:00', offset: 0 }],
      days_mode: 'week', days: [...ALL_DAYS], every: 2, anchor: todayStr(), months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      adjust: 100,
      rain: null, rain_stop: true,
      weather: null, w_raining: true, w_prob: null, w_mm: null, w_frost: null, w_wind: null,
      notify: null, n_start: false, n_end: false, n_skip: true,
    },
  }[kind];
  return { ...base, ui: clone(ui), ...extra };
}
const IDEAS = [
  { icon: 'mdi:motion-sensor', color: '#F7B84F', name: 'Luz con movimiento de noche', hint: 'Prende la luz al detectar movimiento y la apaga sola', make: () => newDraft('auto', { icon: 'mdi:motion-sensor', mode: 'restart', ui: { triggers: [{ type: 'device', entity: null, to: 'on', _need: { domains: ['binary_sensor'], dc: ['motion', 'occupancy', 'presence'] } }], conditions: [{ type: 'sun', when: 'night' }], cond_mode: 'all', actions: [{ type: 'device', entity: null, op: 'on', svc: null, label: 'Encender', params: { _off_after: 2 }, _need: { domains: ['light', 'switch'] } }] } }) },
  { icon: 'mdi:home-import-outline', color: '#3DBE8B', name: 'Bienvenida a casa', hint: 'Cuando llega el primero y ya es de noche, prende luces', need: (h) => has(h, 'person'), make: () => newDraft('auto', { icon: 'mdi:home-import-outline', ui: { triggers: [{ type: 'presence', who: 'first' }], conditions: [{ type: 'sun', when: 'night' }], cond_mode: 'all', actions: [{ type: 'device', entity: null, op: 'on', svc: null, label: 'Encender', params: {}, _need: { domains: ['light', 'switch'] } }] } }) },
  { icon: 'mdi:home-export-outline', color: '#F76F6F', name: 'Apagar todo al salir', hint: 'Cuando se va el último, apaga luces y aires', need: (h) => has(h, 'person'), make: () => newDraft('auto', { icon: 'mdi:home-export-outline', ui: { triggers: [{ type: 'presence', who: 'last' }], conditions: [], cond_mode: 'all', actions: [{ type: 'area', area: 'all', domain: 'light', op: 'off' }, { type: 'area', area: 'all', domain: 'climate', op: 'off' }] } }) },
  { icon: 'mdi:door-open', color: '#9B6CF7', name: 'Aviso de puerta abierta', hint: 'Si la puerta queda abierta 5 minutos, te avisa', make: () => newDraft('auto', { icon: 'mdi:door-open', ui: { triggers: [{ type: 'device', entity: null, to: 'on', for_min: 5, _need: { domains: ['binary_sensor', 'cover'], dc: ['door', 'garage_door', 'window', 'opening'] } }], conditions: [], cond_mode: 'all', actions: [{ type: 'notify', target: null, title: 'Puerta abierta', message: 'Quedó abierta hace 5 minutos' }] } }) },
  { icon: 'mdi:water-alert', color: '#3FB8E0', name: 'Alerta de agua o humo', hint: 'Avisa al instante si un sensor detecta una fuga o humo', make: () => newDraft('auto', { icon: 'mdi:water-alert', mode: 'single', ui: { triggers: [{ type: 'device', entity: null, to: 'on', _need: { domains: ['binary_sensor'], dc: ['moisture', 'smoke', 'gas', 'carbon_monoxide'] } }], conditions: [], cond_mode: 'all', actions: [{ type: 'notify', target: null, title: '⚠ Alerta', message: '¡Se detectó una fuga o humo!' }] } }) },
  { icon: 'mdi:blinds', color: '#F78F4F', name: 'Cerrar persianas al atardecer', hint: 'Todos los días cuando oscurece', make: () => newDraft('auto', { icon: 'mdi:blinds', ui: { triggers: [{ type: 'sun', event: 'sunset', offset: 0, days: [...ALL_DAYS] }], conditions: [], cond_mode: 'all', actions: [{ type: 'area', area: 'all', domain: 'cover', op: 'close' }] } }) },
  { icon: 'mdi:white-balance-sunny', color: '#F7B84F', name: 'Buenos días', hint: 'A las 7:00 de lunes a viernes, abre y prende', make: () => newDraft('auto', { icon: 'mdi:white-balance-sunny', ui: { triggers: [{ type: 'time', at: '07:00', days: ['mon', 'tue', 'wed', 'thu', 'fri'] }], conditions: [], cond_mode: 'all', actions: [{ type: 'device', entity: null, op: 'on', svc: null, label: 'Encender', params: { brightness_pct: 60 }, _need: { domains: ['light'] } }] } }) },
  { icon: 'mdi:air-conditioner', color: '#4F8EF7', name: 'Aire si hace calor', hint: 'Si la temperatura pasa de 28° y hay alguien en casa', make: () => newDraft('auto', { icon: 'mdi:air-conditioner', ui: { triggers: [{ type: 'device', entity: null, dir: 'above', value: 28, _need: { domains: ['sensor'], dc: ['temperature'] } }], conditions: has(window.__maeHass || { states: {} }, 'person') ? [{ type: 'presence', who: 'anyone' }] : [], cond_mode: 'all', actions: [{ type: 'device', entity: null, op: 'mode', svc: null, label: 'Encender en modo…', params: { hvac_mode: 'cool' }, _need: { domains: ['climate'] } }] } }) },
  { icon: 'mdi:power-sleep', color: '#7A8699', name: 'Apagado automático', hint: 'Si algo queda prendido 30 min, se apaga solo', make: () => newDraft('auto', { icon: 'mdi:power-sleep', ui: { triggers: [{ type: 'device', entity: null, to: 'on', for_min: 30, _link: 'x', _need: { domains: ONOFF_DOMAINS } }], conditions: [], cond_mode: 'all', actions: [{ type: 'device', entity: null, op: 'off', svc: null, label: 'Apagar', params: {}, _link: 'x', _need: { domains: ONOFF_DOMAINS } }] } }) },
  { icon: 'mdi:sprinkler-variant', color: '#3FB8E0', name: 'Riego automático por zonas', hint: 'Bomba y/o electroválvulas, horarios, días, lluvia, humedad del suelo y pronóstico', make: () => { const d = newDraft('irrigation', { icon: 'mdi:sprinkler-variant', name: 'Riego' }); const h = window.__maeHass; if (h) d.ui.weather = listOf(h, 'weather')[0] || null; return d; } },
  { icon: 'mdi:movie-open', color: '#9B6CF7', name: 'Modo cine (escena)', hint: 'Un toque: luces bajas y persianas cerradas', make: () => newDraft('scene', { icon: 'mdi:movie-open', name: 'Modo cine', ui: { triggers: [], conditions: [], cond_mode: 'all', actions: [{ type: 'device', entity: null, op: 'on', svc: null, label: 'Encender', params: { brightness_pct: 10 }, _need: { domains: ['light'] } }, { type: 'area', area: 'all', domain: 'cover', op: 'close' }] } }) },
];

// --------------------------------------------------------------------- CSS
const CSS = `
.brand{display:inline-flex;align-items:center;gap:6px;color:var(--mae-sub);font-size:11px;text-decoration:none;opacity:.75}
.brand:hover{opacity:1}.brand b{color:#0040FF;font-weight:700;letter-spacing:.3px}
.brand svg{width:14px;height:14px;color:#0040FF}
.brandrow{display:flex;justify-content:center;padding:6px 0 10px}
:host{--mae-bg:var(--primary-background-color,#f3f5f9);--mae-card:var(--card-background-color,#fff);--mae-text:var(--primary-text-color,#1c1c1e);--mae-sub:var(--secondary-text-color,#8a8f98);--mae-accent:var(--primary-color,#3b82f6);--mae-soft:color-mix(in srgb,var(--mae-accent) 14%,transparent);--mae-line:var(--divider-color,rgba(0,0,0,.08));--mae-r:16px;font-family:var(--paper-font-body1_-_font-family,inherit)}
*{box-sizing:border-box}
button{font:inherit;color:inherit;background:none;border:0;cursor:pointer;padding:0;-webkit-tap-highlight-color:transparent}
ha-icon{--mdc-icon-size:22px;display:inline-flex}
.muted{color:var(--mae-sub)}
/* ---------- tarjeta ---------- */
ha-card{padding:16px;overflow:hidden}
.head{display:flex;align-items:center;gap:8px;margin-bottom:12px}
.head .title{flex:1;font-size:20px;font-weight:600}
.pill{display:inline-flex;align-items:center;gap:6px;background:var(--mae-accent);color:#fff;border-radius:999px;padding:8px 14px;font-weight:600;font-size:14px}
.pill ha-icon{--mdc-icon-size:18px}
.tabs{display:flex;gap:6px;margin-bottom:12px;overflow-x:auto;scrollbar-width:none}
@media (hover:hover) and (pointer:fine){.tabs{flex-wrap:wrap;overflow:visible}}
.tab{padding:7px 14px;border-radius:999px;background:var(--mae-bg);font-size:14px;white-space:nowrap;color:var(--mae-sub);font-weight:500}
.tab.on{background:var(--mae-soft);color:var(--mae-accent);font-weight:600}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px}
.tile{position:relative;border-radius:var(--mae-r);padding:14px;min-height:96px;color:#fff;text-align:left;display:flex;flex-direction:column;justify-content:space-between;overflow:hidden;transition:transform .15s}
.tile:active{transform:scale(.97)}
.tile .nm{font-weight:600;font-size:15px;line-height:1.2;margin-top:10px;padding-right:22px}
.tile .ed{position:absolute;top:6px;right:6px;width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,.22);display:flex;align-items:center;justify-content:center}
.tile .ed ha-icon{--mdc-icon-size:24px}
.tile .nm{padding-right:34px}
.tile.done::after{content:'✓ Listo';position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.35);font-weight:700;font-size:16px;animation:fade 1.2s forwards}
@keyframes fade{0%{opacity:0}15%{opacity:1}80%{opacity:1}100%{opacity:0}}
.rows{display:flex;flex-direction:column;gap:8px}
.row{display:flex;align-items:center;gap:12px;padding:12px;border-radius:var(--mae-r);background:var(--mae-bg);text-align:left;width:100%}
.row .ic{width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;color:#fff;flex:none}
.row .tx{flex:1;min-width:0}
.row .t1{font-weight:600;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.row .t2{font-size:12.5px;color:var(--mae-sub);margin-top:2px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.row.off .ic{filter:grayscale(1);opacity:.5}
.badge{font-size:11px;padding:2px 7px;border-radius:999px;background:var(--mae-soft);color:var(--mae-accent);font-weight:600;margin-left:6px;vertical-align:middle}
.sw{position:relative;width:46px;height:28px;border-radius:999px;background:var(--mae-line);flex:none;transition:background .2s}
.sw::after{content:'';position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:left .2s}
.sw.on{background:var(--mae-accent)}
.sw.on::after{left:21px}
.empty{text-align:center;padding:24px 8px;color:var(--mae-sub)}
.empty ha-icon{--mdc-icon-size:44px;opacity:.5;margin-bottom:8px}
.err{padding:14px;border-radius:12px;background:rgba(247,111,111,.12);color:#d64545;font-size:14px}
.cd{font-variant-numeric:tabular-nums;font-weight:700;color:var(--mae-accent);font-size:15px}
/* ---------- overlay ---------- */
.ov{position:fixed;left:0;right:0;top:var(--mae-vvt,0px);height:var(--mae-vvh,100%);z-index:2147483000;background:var(--mae-bg);color:var(--mae-text);display:flex;flex-direction:column}
.ov.open{animation:fadein .18s ease-out}
.ov.enter .body{animation:slide .2s ease-out}
@keyframes slide{from{transform:translateY(14px);opacity:.4}to{transform:none;opacity:1}}
.bar{display:flex;align-items:center;gap:8px;padding:calc(env(safe-area-inset-top,0px) + 10px) 12px 10px;background:var(--mae-card);border-bottom:1px solid var(--mae-line)}
.bar h1{flex:1;text-align:center;font-size:18px;margin:0;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bar .ib{width:40px;height:40px;display:flex;align-items:center;justify-content:center;border-radius:50%}
.bar .save{font-weight:700;padding:8px 12px;color:var(--mae-accent)}
.bar .save.dis{color:var(--mae-sub)}
.body{flex:1;overflow-y:auto;padding:16px 16px calc(env(safe-area-inset-bottom,0px) + 32px);-webkit-overflow-scrolling:touch}
.wrap{max-width:640px;margin:0 auto}
.sec{margin:22px 0 8px;display:flex;align-items:flex-end;gap:8px}
.sec .h{font-size:17px;font-weight:600}
.sec .s{font-size:13px;color:var(--mae-sub);margin-top:2px}
.sec>div{flex:1}
.card{background:var(--mae-card);border-radius:var(--mae-r);padding:4px 0;box-shadow:0 1px 2px rgba(0,0,0,.04)}
.item{display:flex;align-items:center;gap:12px;padding:12px 14px;width:100%;text-align:left}
.item+.item{border-top:1px solid var(--mae-line)}
.item .ic{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;flex:none}
.item .ic ha-icon{--mdc-icon-size:20px}
.item .tx{flex:1;min-width:0}
.item .t1{font-size:15px;font-weight:500}
.item .t2{font-size:12.5px;color:var(--mae-sub);margin-top:2px}
.item .warn{color:#e0832b}
.item .mini{display:flex;gap:2px}
.item .mini button{width:32px;height:32px;display:flex;align-items:center;justify-content:center;border-radius:50%;color:var(--mae-sub)}
.item .mini ha-icon{--mdc-icon-size:18px}
.item .chev{color:var(--mae-sub)}
.add{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:18px;border-radius:var(--mae-r);background:var(--mae-soft);color:var(--mae-accent);font-weight:600;font-size:16px}
.add .plus{width:30px;height:30px;border-radius:50%;background:var(--mae-accent);color:#fff;display:flex;align-items:center;justify-content:center}
.add .plus ha-icon{--mdc-icon-size:20px}
.addsm{margin-top:8px;padding:12px;font-size:14px}
.addsm .plus{width:24px;height:24px}
.field{background:var(--mae-card);border-radius:var(--mae-r);padding:14px}
.field+.field{margin-top:10px}
.lbl{font-size:13px;color:var(--mae-sub);margin-bottom:8px;font-weight:500}
input[type=text],input[type=number],input[type=time],textarea,select{width:100%;font:inherit;font-size:16px;color:var(--mae-text);background:var(--mae-bg);border:1px solid var(--mae-line);border-radius:12px;padding:11px 12px;outline:none}
input:focus,textarea:focus,select:focus{border-color:var(--mae-accent)}
textarea{min-height:80px;resize:vertical}
input[type=range]{width:100%;accent-color:var(--mae-accent)}
input[type=color]{width:56px;height:40px;border:0;background:none;padding:0}
.nameRow{display:flex;gap:12px;align-items:center}
.bigic{width:52px;height:52px;border-radius:16px;display:flex;align-items:center;justify-content:center;color:#fff;flex:none}
.bigic ha-icon{--mdc-icon-size:28px}
.colors{display:flex;gap:10px;margin-top:12px;flex-wrap:wrap}
.dot{width:28px;height:28px;border-radius:50%;border:3px solid transparent}
.dot.on{border-color:var(--mae-text)}
.chips{display:flex;flex-wrap:wrap;gap:8px}
.chip{display:inline-flex;align-items:center;gap:6px;padding:9px 14px;border-radius:999px;background:var(--mae-bg);border:1px solid var(--mae-line);font-size:14px}
.chip ha-icon{--mdc-icon-size:18px}
.chip.on{background:var(--mae-accent);border-color:var(--mae-accent);color:#fff}
.days{display:flex;gap:6px;justify-content:space-between}
.day{flex:1;max-width:44px;aspect-ratio:1;border-radius:50%;background:var(--mae-bg);border:1px solid var(--mae-line);font-weight:600;font-size:14px}
.day.on{background:var(--mae-accent);border-color:var(--mae-accent);color:#fff}
.seg{display:flex;background:var(--mae-bg);border-radius:12px;padding:3px;gap:3px}
.seg button{flex:1;padding:9px 6px;border-radius:9px;font-size:14px;color:var(--mae-sub);font-weight:500}
.seg button.on{background:var(--mae-card);color:var(--mae-text);box-shadow:0 1px 3px rgba(0,0,0,.12);font-weight:600}
.inl{display:flex;gap:10px;align-items:center}
.inl>*{flex:1}
.unit{flex:none;color:var(--mae-sub)}
.picker-btn{display:flex;align-items:center;gap:12px;width:100%;padding:12px;border-radius:12px;background:var(--mae-bg);border:1px solid var(--mae-line);text-align:left}
.picker-btn .tx{flex:1;min-width:0}
.picker-btn .t1{font-weight:500}
.picker-btn .t2{font-size:12.5px;color:var(--mae-sub)}
.picker-btn.empty-p{color:var(--mae-accent);border-style:dashed}
.rangev{font-weight:700;color:var(--mae-accent);float:right}
.opt{display:flex;align-items:center;gap:10px;font-size:14px;margin-bottom:8px}
.btn{display:block;width:100%;padding:14px;border-radius:14px;font-weight:600;font-size:16px;text-align:center;margin-top:12px}
.btn.pri{background:var(--mae-accent);color:#fff}
.btn.sec2{background:var(--mae-card);color:var(--mae-accent)}
.btn.danger{background:var(--mae-card);color:#e04848}
.hint{font-size:12.5px;color:var(--mae-sub);margin-top:8px;line-height:1.4}
.note{font-size:13px;color:var(--mae-sub);background:var(--mae-card);border-radius:12px;padding:12px;line-height:1.45;margin-top:10px}
/* ---------- hoja inferior ---------- */
.scrim{position:fixed;left:0;right:0;top:var(--mae-vvt,0px);height:var(--mae-vvh,100%);z-index:2147483001;background:rgba(0,0,0,.4);display:flex;align-items:flex-end;justify-content:center}
.scrim.enter{animation:fadein .15s}
@keyframes fadein{from{opacity:0}}
.sheet{width:100%;max-width:640px;max-height:88vh;background:var(--mae-bg);border-radius:20px 20px 0 0;display:flex;flex-direction:column}
.scrim.enter .sheet{animation:up .2s ease-out}
@keyframes up{from{transform:translateY(40px)}}
.sh-h{display:flex;align-items:center;gap:6px;padding:12px 12px 8px}
.sh-h h2{flex:1;font-size:17px;margin:0;font-weight:600;text-align:center}
.sh-h .ib{width:40px;height:40px;display:flex;align-items:center;justify-content:center;border-radius:50%}
.sh-b{overflow-y:auto;padding:4px 16px 16px;flex:1}
.sh-f{padding:10px 16px calc(env(safe-area-inset-bottom,0px) + 14px)}
.search{margin-bottom:10px}
.grp{font-size:12.5px;font-weight:600;color:var(--mae-sub);text-transform:uppercase;letter-spacing:.04em;margin:14px 4px 6px}
.ent .st{font-size:12.5px;color:var(--mae-sub)}
.check{width:24px;height:24px;border-radius:50%;border:2px solid var(--mae-line);display:flex;align-items:center;justify-content:center;flex:none}
.check.on{background:var(--mae-accent);border-color:var(--mae-accent);color:#fff}
.check ha-icon{--mdc-icon-size:16px}
.icgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(52px,1fr));gap:8px}
.icgrid button{aspect-ratio:1;border-radius:14px;background:var(--mae-card);display:flex;align-items:center;justify-content:center}
.icgrid button.on{background:var(--mae-accent);color:#fff}
.toast{position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 24px);transform:translateX(-50%);z-index:2147483002;background:#323232;color:#fff;padding:12px 18px;border-radius:12px;font-size:14px;max-width:90vw;box-shadow:0 4px 16px rgba(0,0,0,.25);animation:fadein .2s}
.toast.bad{background:#c43c3c}
.head .ib,.tabs .ib{width:40px;height:40px;display:flex;align-items:center;justify-content:center;border-radius:50%;color:var(--mae-sub);flex:none}
.tabs{align-items:center}
.tabs .sp{flex:1}
.rbtn{width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--mae-soft);color:var(--mae-accent);flex:none}
.rbtn.stop{background:rgba(247,111,111,.15);color:#e04848}
/* hoja a pantalla completa (selector de equipos): el buscador queda arriba y el teclado no lo tapa */
.scrim.top{align-items:stretch}
.sheet.full{max-height:none;height:100%;border-radius:0;padding-top:env(safe-area-inset-top,0px)}
.sh-top{padding:0 16px 6px}
.tchips{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding-bottom:4px}
.tchips .chip{white-space:nowrap;padding:7px 12px;font-size:13px}
/* modo panel / botón */
.pwrap{padding:16px;max-width:1100px;margin:0 auto;padding-bottom:96px}
.fab{position:fixed;right:max(16px,env(safe-area-inset-right,0px));bottom:calc(env(safe-area-inset-bottom,0px) + 16px);display:flex;align-items:center;gap:8px;background:var(--mae-accent);color:#fff;border-radius:16px;padding:16px 20px;font-weight:600;font-size:15px;box-shadow:0 4px 14px rgba(0,0,0,.25);z-index:5}
.fab ha-icon{--mdc-icon-size:22px}
.btncard{display:flex;align-items:center;gap:14px;padding:14px 16px;cursor:pointer}
.btncard .ic{width:44px;height:44px;border-radius:50%;background:var(--mae-soft);color:var(--mae-accent);display:flex;align-items:center;justify-content:center;flex:none}
.btncard .t1{font-weight:600;font-size:16px}
.btncard .t2{font-size:13px;color:var(--mae-sub);margin-top:2px}
.btncard .tx{flex:1;min-width:0}
/* riego */
.zone{background:var(--mae-card);border-radius:var(--mae-r);padding:14px}
.zone+.zone{margin-top:10px}
.zone .zh{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.zone .zh input{flex:1}
.zone .zn{width:30px;height:30px;border-radius:50%;background:#3FB8E0;color:#fff;font-weight:700;display:flex;align-items:center;justify-content:center;flex:none}
.zone .del{width:36px;height:36px;display:flex;align-items:center;justify-content:center;border-radius:50%;color:var(--mae-sub)}
.zone .lbl{margin-top:12px}
.srow{display:flex;gap:8px;align-items:flex-start}
.srow>div{flex:1}
.srow+.srow{margin-top:10px;padding-top:10px;border-top:1px solid var(--mae-line)}
.optrow{display:flex;align-items:center;gap:10px;padding:10px 0}
.optrow+.optrow{border-top:1px solid var(--mae-line)}
.optrow .tx{flex:1;font-size:14.5px}
.optrow input{width:90px;flex:none;padding:8px 10px}
.mode{display:flex;gap:10px;align-items:flex-start;font-size:13.5px;line-height:1.45;color:var(--mae-sub);margin-top:12px}
.mode ha-icon{color:var(--mae-accent);flex:none}
.subh{font-weight:600;font-size:15px;margin:18px 0 2px;display:flex;align-items:center;gap:6px}
.subbox{border:1px solid var(--mae-line);border-radius:12px;padding:4px 12px 12px;margin-top:10px}
.subbox .subh{margin-top:10px}
.sec .num{display:inline-flex;width:22px;height:22px;border-radius:50%;background:var(--mae-accent);color:#fff;font-size:12.5px;font-weight:700;align-items:center;justify-content:center;margin-right:8px;vertical-align:2px}
.advh{display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:14px;background:var(--mae-card);border-radius:var(--mae-r);margin-top:22px}
.advh .tx{flex:1}
.advh .t1{font-weight:600}
.advh .t2{font-size:12.5px;color:var(--mae-sub);margin-top:2px}
.today{background:var(--mae-card);border-radius:var(--mae-r);padding:14px}
.today .now{display:flex;align-items:center;gap:14px}
.today .sw2{width:48px;height:48px;border-radius:50%;flex:none}
.live{width:100%;aspect-ratio:16/9;background:#000;border-radius:var(--mae-r);overflow:hidden;display:flex;align-items:center;justify-content:center;color:#888}
.live img{width:100%;height:100%;object-fit:contain}
.doorbtns{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}
.doorbtns .big{display:flex;flex-direction:column;align-items:center;gap:6px;padding:16px 8px;border-radius:var(--mae-r);background:var(--mae-card);font-weight:600}
.doorbtns .big ha-icon{--mdc-icon-size:30px;color:var(--mae-accent)}
.doorbtns .big.open ha-icon{color:#3DBE8B}
.hist{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px}
.hist .h1{background:var(--mae-card);border-radius:12px;overflow:hidden;font-size:12.5px}
.hist .h1 .ph{aspect-ratio:16/9;background:#222;display:flex;align-items:center;justify-content:center;color:#777}
.hist .h1 img{width:100%;height:100%;object-fit:cover}
.hist .h1 .cap{padding:6px 8px}
`;

let SHARED_SHEET = null;
function cssFor(root) {
  try {
    if ('adoptedStyleSheets' in root && 'replaceSync' in CSSStyleSheet.prototype) {
      if (!SHARED_SHEET) { SHARED_SHEET = new CSSStyleSheet(); SHARED_SHEET.replaceSync(CSS); }
      if (!root.adoptedStyleSheets.includes(SHARED_SHEET)) root.adoptedStyleSheets = [...root.adoptedStyleSheets, SHARED_SHEET];
      return '';
    }
  } catch (e) { /* navegador viejo: se usa <style> */ }
  return `<style>${CSS}</style>`;
}

class MaeOverlay extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: 'open' }); }
}
if (!customElements.get('matterai-escenas-overlay')) customElements.define('matterai-escenas-overlay', MaeOverlay);

// =================================================================== TARJETA
class MatterAIEscenasCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._rules = null;
    this._isAdmin = false;
    this._settings = { hidden: [] };
    this._tab = null;
    this._ov = null; // { page, draft, sheet, dirty }
    this._done = {};
    this._onEvent = this._onEvent.bind(this);
    this.shadowRoot.addEventListener('click', this._onEvent);
    this.shadowRoot.addEventListener('change', this._onEvent);
  }

  static getStubConfig() { return { title: 'Automatizaciones' }; }
  setConfig(config) { this._config = { title: 'Automatizaciones', ...config }; if (this._hass) this._render(); }
  getCardSize() { return 4; }

  set hass(h) {
    const first = !this._hass;
    this._hass = h; window.__maeHass = h;
    if (first) { this._subscribe(); this._render(); }
  }

  connectedCallback() { if (this._hass && !this._unsub) this._subscribe(); this._tick(); }
  disconnectedCallback() {
    if (this._unsub) { this._unsub.then((u) => u && u()).catch(() => {}); this._unsub = null; }
    clearInterval(this._timer); this._timer = null;
  }

  _subscribe() {
    this._err = null;
    this._unsub = this._hass.connection.subscribeMessage((msg) => {
      this._rules = msg.rules; this._isAdmin = msg.is_admin; this._settings = msg.settings || { hidden: [] };
      try {
        const pid = new URLSearchParams(window.location.search).get('portero');
        if (pid && this._rules.some((r) => r.id === pid) && !window.__maeDoorOpened) {
          window.__maeDoorOpened = true;
          window.history.replaceState(window.history.state, '', window.location.pathname);
          setTimeout(() => { window.__maeDoorOpened = false; }, 3000);
          this._openOv({ page: 'door', id: pid });
        }
      } catch (e) { /* sin URL: nada */ }
      if (this._ov?.page === 'door') {
        const root = this._ovEl?.shadowRoot; const r = this._rules.find((x) => x.id === this._ov.id);
        // sólo actualizar el aviso «sonando» y el historial, sin cortar el video
        const sig = r ? `${!!r.ringing}|${(r.history || []).length}|${(r.history || [])[0]?.opened}` : '';
        if (root && r && sig !== this._doorSig) { this._doorSig = sig; this._renderOv(); }
      }
      if (this._ov?.page === 'editor' && this._ov.draft?.kind === 'guest') {
        // invitaciones nuevas / usadas: refrescar la lista del editor
        const r = this._rules.find((x) => x.id === this._ov.draft.id);
        const sig = r ? JSON.stringify([(r.invites || []).map((i) => [i.id, i.paused, i.uses, i.until, i.name]), (r.history || []).length, r.guest_base]) : '';
        if (sig !== this._guestSig) { const first = this._guestSig === undefined; this._guestSig = sig; if (!first) this._renderOv(); }
      }
      this._render(); this._tick();
    }, { type: `${D}/subscribe` }).catch((e) => {
      this._unsub = null;
      this._err = e?.code === 'unknown_command' ? 'La integración «MatterAI Escenas» no está instalada o no se reinició Home Assistant.' : (e?.message || 'Error de conexión');
      this._render();
    });
  }

  _ws(type, data = {}) { return this._hass.callWS({ type: `${D}/${type}`, ...data }); }

  _tick() {
    const hasTimers = (this._rules || []).some((r) => r.kind === 'timer' && r.fire_at);
    if (hasTimers && !this._timer) this._timer = setInterval(() => this._updateCountdowns(), 1000);
    if (!hasTimers && this._timer) { clearInterval(this._timer); this._timer = null; }
  }
  _updateCountdowns() {
    [this.shadowRoot, this._ovEl?.shadowRoot].filter(Boolean).flatMap((r) => [...r.querySelectorAll('[data-cd]')]).forEach((el) => {
      const ms = Math.max(0, new Date(el.dataset.cd) - Date.now());
      const s = Math.floor(ms / 1000);
      el.textContent = `${s >= 3600 ? `${Math.floor(s / 3600)}:` : ''}${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
    });
  }

  _toast(msg, bad) {
    const host = this._ovEl?.shadowRoot || this.shadowRoot;
    host.querySelector('.toast')?.remove();
    const t = document.createElement('div');
    t.className = `toast${bad ? ' bad' : ''}`; t.textContent = msg;
    host.appendChild(t);
    setTimeout(() => t.remove(), bad ? 4500 : 2500);
  }

  // ---------------------------------------------------------- vista tarjeta
  _counts() {
    const rules = (this._rules || []).filter((r) => this._isAdmin || !installerOnly(r));
    return {
      scenes: rules.filter((r) => r.kind === 'scene'),
      cines: rules.filter((r) => r.kind === 'tv' && r.enabled && r.ui?.cine && ['manual', 'both'].includes(r.ui?.cine_mode || 'auto')),
      autos: rules.filter((r) => r.kind === 'auto'),
      smart: rules.filter((r) => SMART_KINDS.includes(r.kind)),
      rems: rules.filter((r) => REM_KINDS.includes(r.kind)),
      timers: rules.filter((r) => r.kind === 'timer'),
    };
  }

  _listHtml(inOverlay) {
    const h = this._hass; const rules = this._rules || [];
    if (this._err) return `<div class="err">${esc(this._err)}</div>`;
    if (!this._rules) return '<div class="empty muted">Cargando…</div>';
    const { scenes, autos, smart, timers, rems, cines } = this._counts();
    const tabs = [['scene', 'Escenas', scenes.length], ['auto', 'Automáticas', autos.length], ['smart', 'Inteligentes', smart.length]];
    if (this._config.reminders !== false) tabs.push(['rem', '🔔 Recordatorios', rems.filter((r) => r.kind === 'reminder' && (r.pending || r.next_at)).length]);
    if (timers.length) tabs.push(['timer', 'Temporizadores', timers.length]);
    let tab = this._tab || this._config.default_tab || (scenes.length ? 'scene' : smart.length ? 'smart' : 'auto');
    if (tab === 'timer' && !timers.length) tab = 'scene';
    const gear = this._isAdmin && !inOverlay && this._config.panel ? '<span class="sp"></span><button class="ib" data-a="settings" title="Equipos visibles"><ha-icon icon="mdi:cog-outline"></ha-icon></button>' : '';
    const tabsHtml = `<div class="tabs">${tabs.map(([id, l, n]) => `<button class="tab ${tab === id ? 'on' : ''}" data-a="tab" data-v="${id}">${l}${n ? ` · ${n}` : ''}</button>`).join('')}${gear}</div>`;
    let content = '';
    if (tab === 'scene') {
      const cineTiles = cines.map((r) => `
        <button class="tile" style="background:${esc(r.color)};${r.cine ? 'box-shadow:0 0 0 3px var(--mae-accent) inset' : ''}" data-a="cinetoggle" data-id="${r.id}">
          <ha-icon icon="${r.cine ? 'mdi:movie-open' : 'mdi:movie-open-outline'}"></ha-icon>
          <span class="ed" data-a="edit" data-id="${r.id}" aria-label="Editar"><ha-icon icon="mdi:dots-horizontal"></ha-icon></span>
          <div class="nm">${esc(r.ui?.cine_switch_name || 'Modo cine')}<br><small>${r.cine ? 'activo · tocá para terminar' : esc(r.name)}</small></div>
        </button>`).join('');
      content = scenes.length || cines.length ? `<div class="grid">${cineTiles}${scenes.map((r) => `
        <button class="tile ${this._done[r.id] ? 'done' : ''}" style="background:${esc(r.color)}" data-a="runscene" data-id="${r.id}">
          <ha-icon icon="${esc(r.icon)}"></ha-icon>
          <span class="ed" data-a="edit" data-id="${r.id}" aria-label="Editar"><ha-icon icon="mdi:dots-horizontal"></ha-icon></span>
          <div class="nm">${esc(r.name)}</div>
        </button>`).join('')}</div>`
        : `<div class="empty"><ha-icon icon="mdi:gesture-tap"></ha-icon><div>Todavía no hay escenas.<br>Una escena hace varias cosas con un solo toque.</div></div>`;
    } else if (tab === 'auto' || tab === 'smart') {
      const list = tab === 'auto' ? autos : smart;
      content = list.length ? `<div class="rows">${list.map((r) => {
        const busy = r.running && r.enabled && ['loop', 'presence', 'irrigation'].includes(r.kind);
        const play = r.kind === 'irrigation'
          ? (r.running ? `<button class="rbtn stop" data-a="irstop" data-id="${r.id}" title="Detener"><ha-icon icon="mdi:stop"></ha-icon></button>` : `<button class="rbtn" data-a="runscene" data-id="${r.id}" title="Regar ahora"><ha-icon icon="mdi:play"></ha-icon></button>`)
          : r.kind === 'night' && r.enabled ? `<button class="rbtn" data-a="runscene" data-id="${r.id}" title="Buenas noches ahora"><ha-icon icon="mdi:weather-night"></ha-icon></button>`
          : r.kind === 'guest' && r.enabled ? `<button class="rbtn" data-a="invquick" data-id="${r.id}" title="Nueva invitación"><ha-icon icon="mdi:account-plus"></ha-icon></button>`
          : r.kind === 'doorbell' && r.enabled ? `<button class="rbtn ${r.ringing ? 'stop' : ''}" data-a="door" data-id="${r.id}" title="Atender"><ha-icon icon="${r.ringing ? 'mdi:phone-ring' : 'mdi:doorbell-video'}"></ha-icon></button>`
          : '';
        const badge2 = !r.enabled ? ''
          : r.kind === 'night' ? (r.asking ? '<span class="badge">preguntando…</span>' : r.done_tonight ? '<span class="badge" style="background:var(--mae-bg);color:var(--mae-sub)">hecho hoy</span>' : '')
          : r.kind === 'clima' ? `<span class="badge" ${r.clima === 'on' ? '' : 'style="background:var(--mae-bg);color:var(--mae-sub)"'} title="${esc(r.clima_reason || '')}">${r.clima === 'manual' ? 'a mano' : r.clima === 'on' ? `${r.clima_temp}°` : `apagado${r.clima_reason && r.clima_reason !== 'horario apagado' ? ` · ${esc(r.clima_reason)}` : ''}`}</span>`
          : (r.kind === 'fdetect' || r.kind === 'fface') && (r.history || [])[0] ? `<span class="badge" style="background:var(--mae-bg);color:var(--mae-sub)">${esc(r.kind === 'fface' ? r.history[0].who : (FLABELS[r.history[0].label] || r.history[0].label))} · ${whenText(r.history[0].at)}</span>`
          : r.kind === 'tv' ? (r.cine ? '<span class="badge">🎬 cine</span>' : '')
          : r.kind === 'doorbell' ? (r.ringing ? '<span class="badge" style="background:rgba(247,111,111,.15);color:#e04848">🔔 sonando</span>' : '')
          : r.kind === 'wake' ? (r.waking ? '<span class="badge">despertando</span>' : r.next_alarm ? `<span class="badge" style="background:var(--mae-bg);color:var(--mae-sub)">⏰ ${new Date(r.next_alarm).toLocaleString('es-AR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span>` : '')
          : '';
        return `
        <div class="row ${r.enabled ? '' : 'off'}">
          <button class="ic" style="background:${esc(r.color)}" data-a="edit" data-id="${r.id}"><ha-icon icon="${esc(r.icon)}"></ha-icon></button>
          <button class="tx" style="text-align:left" data-a="edit" data-id="${r.id}">
            <div class="t1">${esc(r.name)}${r.locked ? '<span class="badge" style="background:var(--mae-bg);color:var(--mae-sub)" title="La armó tu instalador">🔒</span>' : ''}${this._isAdmin && installerOnly(r) ? '<span class="badge" style="background:var(--mae-bg);color:var(--mae-sub)">instalador</span>' : ''}${busy ? `<span class="badge">${r.kind === 'irrigation' ? 'regando' : 'en curso'}</span>` : ''}${r.kind === 'room' && r.enabled ? `<span class="badge" ${r.occupied ? '' : 'style="background:var(--mae-bg);color:var(--mae-sub)"'}>${r.occupied ? (r.sealed ? 'ocupado 🔒' : 'ocupado') : 'libre'}</span>` : ''}${r.kind === 'watch' && r.enabled && (r.alerting || []).length ? `<span class="badge" style="background:rgba(247,111,111,.15);color:#e04848">⚠ ${r.alerting.length}</span>` : ''}${r.kind === 'away' && r.enabled ? `<span class="badge" ${r.away ? '' : 'style="background:var(--mae-bg);color:var(--mae-sub)"'}>${r.away ? 'ausentes' : 'en casa'}</span>` : ''}${badge2}</div>
            <div class="t2">${esc(ruleSummary(h, r, rules))}</div>
          </button>
          ${play}
          <button class="sw ${r.enabled ? 'on' : ''}" data-a="toggle" data-id="${r.id}" aria-label="Activar"></button>
        </div>`;
      }).join('')}</div>`
        : tab === 'auto'
          ? `<div class="empty"><ha-icon icon="mdi:robot-happy-outline"></ha-icon><div>Todavía no hay automatizaciones propias.<br>Armá la tuya: «si pasa esto, entonces hacé aquello».</div></div>`
          : `<div class="empty"><ha-icon icon="mdi:lightbulb-auto-outline"></ha-icon><div>Todavía no hay automatizaciones inteligentes.<br>Están listas para usar: luz por presencia, luces de noche, circadiana, riego…</div></div>`;
    } else if (tab === 'rem') {
      content = this._remHtml(rems);
    } else {
      content = `<div class="rows">${timers.map((r) => `
        <div class="row">
          <button class="ic" style="background:${esc(r.color)}" data-a="edit" data-id="${r.id}"><ha-icon icon="${esc(r.icon || 'mdi:timer-outline')}"></ha-icon></button>
          <button class="tx" style="text-align:left" data-a="edit" data-id="${r.id}"><div class="t1">${esc(r.name)}</div>
            <div class="t2">${r.fire_at ? `Falta <span class="cd" data-cd="${esc(r.fire_at)}"></span>` : esc(ruleSummary(h, r, rules))}</div></button>
          ${r.fire_at
            ? `<button class="rbtn stop" data-a="cancel" data-id="${r.id}" title="Cancelar"><ha-icon icon="mdi:stop"></ha-icon></button>`
            : `<button class="rbtn" data-a="runscene" data-id="${r.id}" title="Iniciar"><ha-icon icon="mdi:play"></ha-icon></button>`}
        </div>`).join('')}</div>`;
    }
    return tabsHtml + content;
  }

  _remHtml(rems) {
    const h = this._hass;
    const list = rems.filter((r) => r.kind === 'reminder');
    const pending = list.filter((r) => r.pending);
    const next = list.filter((r) => !r.pending && r.next_at && r.enabled).sort((a, b) => a.next_at.localeCompare(b.next_at));
    const done = list.filter((r) => r.ui?.done).sort((a, b) => (b.ui.done_at || '').localeCompare(a.ui.done_at || '')).slice(0, 5);
    const cal = rems.find((r) => r.kind === 'calalert');
    const row = (r, btn) => `<div class="row">
        <button class="ic" style="background:${r.pending ? '#F76F6F' : esc(r.color || '#F7B84F')}" data-a="edit" data-id="${r.id}"><ha-icon icon="${r.pending ? 'mdi:bell-ring' : 'mdi:bell-outline'}"></ha-icon></button>
        <button class="tx" style="text-align:left" data-a="edit" data-id="${r.id}"><div class="t1">${esc(r.ui?.text || r.name)}</div>
          <div class="t2">${esc([r.pending ? 'Ahora' : '', ruleSummary(h, r, rems)].filter(Boolean).join(' · '))}</div></button>${btn}</div>`;
    const check = (r) => `<button class="rbtn" data-a="runscene" data-id="${r.id}" title="Hecho"><ha-icon icon="mdi:check"></ha-icon></button>`;
    let html = `<div class="chips" style="margin-bottom:12px"><button class="pill" data-a="newrem"><ha-icon icon="mdi:plus"></ha-icon>Recordatorio</button>
      <button class="chip" data-a="calalert"><ha-icon icon="mdi:calendar-alert"></ha-icon>${cal ? 'Avisos del calendario ✓' : 'Avisos del calendario'}</button></div>`;
    if (pending.length) html += `<div class="grp">Pendientes</div><div class="rows">${pending.map((r) => row(r, check(r))).join('')}</div>`;
    html += `<div class="grp">Próximos</div>${next.length ? `<div class="rows">${next.map((r) => row(r, '')).join('')}</div>` : '<div class="hint" style="margin:4px">No hay recordatorios próximos.</div>'}`;
    html += this._agendaHtml();
    if (done.length) html += `<div class="grp">Hechos</div><div class="rows">${done.map((r) => `<div class="row" style="opacity:.6"><div class="tx" style="text-decoration:line-through">${esc(r.ui.text || r.name)}</div>
      <button class="ib" data-a="remdel" data-id="${r.id}" title="Borrar"><ha-icon icon="mdi:delete-outline"></ha-icon></button></div>`).join('')}</div>`;
    html += `<div class="note">🎙 También por voz con el asistente: «recordame sacar la basura mañana a las 9», «avisame en 20 minutos que saque la pizza», «¿qué recordatorios tengo?».</div>`;
    return html;
  }

  _agendaHtml() {
    const h = this._hass;
    const hidden = new Set(this._settings?.hidden || []);
    const cals = Object.keys(h.states).filter((e) => dom(e) === 'calendar' && !hidden.has(e));
    if (!cals.length) return '';
    const a = this._agenda;
    if (!a || Date.now() - a.at > 5 * 60000) this._loadAgenda(cals);
    if (!a) return '<div class="grp">Agenda · próximos 7 días</div><div class="hint" style="margin:4px">Cargando…</div>';
    if (!a.events.length) return '<div class="grp">Agenda · próximos 7 días</div><div class="hint" style="margin:4px">Sin eventos.</div>';
    const groups = {};
    for (const ev of a.events) (groups[ev.day] ||= []).push(ev);
    const today = isoDay(new Date()); const tomorrow = isoDay(new Date(Date.now() + 864e5));
    const label = (d) => (d === today ? 'Hoy' : d === tomorrow ? 'Mañana' : (() => { const x = new Date(`${d}T12:00:00`); return `${DIAS_L[x.getDay()]} ${x.getDate()}/${x.getMonth() + 1}`; })());
    return `<div class="grp">Agenda · próximos 7 días</div><div class="card">${Object.keys(groups).sort().map((d) => `
      <div class="item" style="align-items:flex-start"><div style="width:74px;flex:none;font-weight:600;font-size:13px;padding-top:2px">${esc(label(d))}</div>
        <div class="tx">${groups[d].map((ev) => `<div style="margin-bottom:6px"><div class="t1" style="font-size:14px">${ev.time ? `<b>${ev.time}</b> ` : ''}${esc(ev.summary)}</div>${ev.location ? `<div class="t2">📍 ${esc(ev.location)}</div>` : ''}</div>`).join('')}</div></div>`).join('')}</div>`;
  }

  async _loadAgenda(cals) {
    if (this._agendaBusy) return;
    this._agendaBusy = true;
    const start = new Date(); const end = new Date(Date.now() + 7 * 864e5);
    const events = [];
    await Promise.all(cals.map(async (cal) => {
      try {
        const list = await this._hass.callApi('GET', `calendars/${cal}?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`);
        for (const ev of list || []) {
          const st = ev.start?.dateTime || ev.start?.date;
          if (!st) continue;
          const allDay = !ev.start?.dateTime;
          const d = allDay ? null : new Date(st);
          events.push({ day: allDay ? st : isoDay(d), time: allDay ? '' : `${pad(d.getHours())}:${pad(d.getMinutes())}`, summary: ev.summary || 'Evento', location: ev.location || '', sort: allDay ? `${st}T00:00` : d.toISOString() });
        }
      } catch (e) { /* calendario sin permiso o caído: se saltea */ }
    }));
    events.sort((x, y) => x.sort.localeCompare(y.sort));
    const seen = new Set();
    this._agenda = { at: Date.now(), events: events.filter((e) => { const k = `${e.sort}|${e.summary}`; if (seen.has(k)) return false; seen.add(k); return true; }) };
    this._agendaBusy = false;
    this._render();
  }

  _render() {
    if (!this._hass || !this._config) return;
    const c = this._config;
    const canCreate = this._rules && c.allow_create !== false;
    const gear = this._isAdmin ? '<button class="ib" data-a="settings" title="Equipos visibles"><ha-icon icon="mdi:cog-outline"></ha-icon></button>' : '';
    let html;
    if (c.mode === 'button') {
      const { scenes, autos, timers } = this._counts();
      const on = autos.filter((r) => r.enabled).length;
      const run = timers.filter((r) => r.fire_at).length;
      const sub = this._err ? this._err : !this._rules ? 'Cargando…' : [`${on} ${on === 1 ? 'automatización activa' : 'automatizaciones activas'}`, scenes.length ? `${scenes.length} ${scenes.length === 1 ? 'escena' : 'escenas'}` : '', run ? `${run} temporizador${run > 1 ? 'es' : ''} en marcha` : ''].filter(Boolean).join(' · ');
      html = `<ha-card class="btncard" data-a="openhome"><div class="ic"><ha-icon icon="${esc(c.icon || 'mdi:robot-happy-outline')}"></ha-icon></div><div class="tx"><div class="t1">${esc(c.title)}</div><div class="t2">${esc(sub)}</div></div><ha-icon icon="mdi:chevron-right" class="muted"></ha-icon></ha-card>`;
    } else if (c.panel) {
      html = `<div class="pwrap">${this._listHtml(false)}<div class="brandrow">${BRAND}</div></div>${canCreate ? '<button class="fab" data-a="create"><ha-icon icon="mdi:plus"></ha-icon>Crear</button>' : ''}`;
    } else {
      html = `<ha-card>
        <div class="head"><div class="title">${esc(c.title)}</div>${gear}
        ${canCreate ? '<button class="pill" data-a="create"><ha-icon icon="mdi:plus"></ha-icon>Crear</button>' : ''}</div>
        ${this._listHtml(false)}<div class="brandrow">${BRAND}</div></ha-card>`;
    }
    this.shadowRoot.innerHTML = `${cssFor(this.shadowRoot)}${html}`;
    this._updateCountdowns();
    if (this._ov?.page === 'home') this._renderOv();
  }

  // ------------------------------------------------------------- overlay
  // Navegación: _nav() abre una página encima de la actual (◀ vuelve), _exit() sale del editor.
  _nav(state) {
    if (!this._ov) return this._openOv(state);
    const { stack = [], sheet, dirty, ...cur } = this._ov;
    this._ov = { dirty: false, sheet: null, ...state, stack: [...stack, cur], _resetScroll: true };
    this._renderOv();
  }
  _back() {
    const o = this._ov;
    if (o?.stack?.length) {
      const prev = o.stack[o.stack.length - 1];
      this._ov = { dirty: false, sheet: null, ...prev, stack: o.stack.slice(0, -1), _resetScroll: true };
      this._renderOv();
    } else this._closeOv();
  }
  _exit() {
    // después de guardar/eliminar: volver a la lista (si se entró desde ella) o cerrar
    const o = this._ov;
    const stack = (o?.stack || []).filter((p) => !['create', 'editor'].includes(p.page));
    if (stack.length) { const prev = stack[stack.length - 1]; this._ov = { dirty: false, sheet: null, ...prev, stack: stack.slice(0, -1), _resetScroll: true }; this._renderOv(); }
    else this._closeOv();
  }
  _openOv(state) {
    this._ov = { dirty: false, sheet: null, stack: [], ...state };
    if (!this._ovEl) {
      this._ovEl = document.createElement('matterai-escenas-overlay');
      this._ovEl.shadowRoot.addEventListener('click', this._onEvent);
      this._ovEl.shadowRoot.addEventListener('change', this._onEvent);
      this._ovEl.shadowRoot.addEventListener('input', this._onEvent);
      document.body.appendChild(this._ovEl);
      this._popHandler = () => { if (this._ov) { this._ov = null; this._closeOvEl(); } };
      window.addEventListener('popstate', this._popHandler);
      history.pushState({ mae: true }, '');
      // con el teclado abierto el alto visible cambia: la pantalla se ajusta para que no tape lo que se escribe
      const vv = window.visualViewport;
      if (vv) {
        this._vvHandler = () => {
          if (!this._ovEl) return;
          this._ovEl.style.setProperty('--mae-vvh', `${vv.height}px`);
          this._ovEl.style.setProperty('--mae-vvt', `${vv.offsetTop}px`);
        };
        vv.addEventListener('resize', this._vvHandler); vv.addEventListener('scroll', this._vvHandler);
        this._vvHandler();
      }
    }
    this._renderOv();
  }
  _closeOv() {
    this._ov = null;
    if (history.state?.mae) history.back();
    this._closeOvEl();
  }
  _closeOvEl() {
    if (this._popHandler) window.removeEventListener('popstate', this._popHandler);
    this._popHandler = null;
    const vv = window.visualViewport;
    if (vv && this._vvHandler) { vv.removeEventListener('resize', this._vvHandler); vv.removeEventListener('scroll', this._vvHandler); }
    this._vvHandler = null;
    this._ovEl?.remove(); this._ovEl = null; this._lastKey = null; this._lastSheet = null;
  }

  _renderOv() {
    if (!this._ovEl || !this._ov) return;
    const root = this._ovEl.shadowRoot;
    const keep = [...root.querySelectorAll('.body,.sh-b')].map((e) => e.scrollTop);
    const o = this._ov;
    let page = { create: () => this._pageCreate(), home: () => this._pageHome(), settings: () => this._pageSettings(), door: () => this._pageDoor() }[o.page]?.() ?? this._pageEditor();
    let sheet = o.sheet ? this._sheetHtml() : '';
    // animar sólo cuando se entra a una pantalla u hoja nueva, no en cada toque
    const key = `${o.page}:${(o.stack || []).length}`;
    const cls = !this._lastKey ? 'open enter' : key !== this._lastKey ? 'enter' : '';
    if (cls) page = page.replace('class="ov"', `class="ov ${cls}"`);
    if (sheet && this._lastSheet !== o.sheet) sheet = sheet.replace('class="scrim', 'class="scrim enter');
    this._lastKey = key; this._lastSheet = o.sheet;
    root.innerHTML = `${cssFor(root)}${page}${sheet}`;
    if (o.page === 'door') this._mountDoor(root);
    const els = [...root.querySelectorAll('.body,.sh-b')];
    els.forEach((e, i) => { if (keep[i] != null && !o._resetScroll) e.scrollTop = keep[i]; });
    o._resetScroll = false;
    this._updateCountdowns();
  }

  // ---------- página "inicio" (cuando la tarjeta está en modo botón)
  _pageHome() {
    const c = this._config;
    return `<div class="ov"><div class="bar"><button class="ib" data-a="close"><ha-icon icon="mdi:arrow-left"></ha-icon></button><h1>${esc(c.title)}</h1>
      ${this._isAdmin ? '<button class="ib" data-a="settings"><ha-icon icon="mdi:cog-outline"></ha-icon></button>' : '<span style="width:40px"></span>'}</div>
      <div class="body"><div class="wrap" style="max-width:900px">${this._listHtml(true)}</div></div>
      ${c.allow_create !== false ? '<button class="fab" data-a="create"><ha-icon icon="mdi:plus"></ha-icon>Crear</button>' : ''}</div>`;
  }

  // ---------- pantalla del portero: video, abrir, hablar e historial
  _pageDoor() {
    const o = this._ov; const h = this._hass;
    const r = (this._rules || []).find((x) => x.id === o.id);
    if (!r) return `<div class="ov"><div class="bar"><button class="ib" data-a="back"><ha-icon icon="mdi:arrow-left"></ha-icon></button><h1>Portero</h1><span style="width:40px"></span></div><div class="body"><div class="empty">No existe</div></div></div>`;
    const u = r.ui || {};
    const hist = (r.history || []).filter((e) => !e.test).slice(0, 12);
    const fmt = (iso) => { const d = new Date(iso); return `${whenText(iso)}`.replace(/^hoy /, 'Hoy ') + (isNaN(d) ? '' : ''); };
    return `<div class="ov"><div class="bar"><button class="ib" data-a="back"><ha-icon icon="mdi:arrow-left"></ha-icon></button><h1>${esc(r.name)}</h1>
        <button class="ib" data-a="edit" data-id="${r.id}"><ha-icon icon="mdi:cog-outline"></ha-icon></button></div>
      <div class="body"><div class="wrap">
        ${r.ringing ? '<div class="note" style="margin:0 0 10px;color:#e04848;font-weight:600">🔔 Están tocando el timbre</div>' : ''}
        <div class="live" data-live="1">${u.camera ? '' : 'Sin cámara'}</div>
        <div class="doorbtns">
          ${u.unlock ? `<button class="big open" data-a="dooract" data-v="open"><ha-icon icon="mdi:lock-open-variant"></ha-icon>${esc(u.unlock_name || 'Abrir puerta')}</button>` : ''}
          ${u.unlock2 ? `<button class="big open" data-a="dooract" data-v="open2"><ha-icon icon="mdi:gate-open"></ha-icon>${esc(u.unlock2_name || 'Abrir portón')}</button>` : ''}
        </div>
        ${u.stream && !customElements.get('webrtc-camera') ? '<div class="note">Para hablar por el portero falta instalar «WebRTC Camera» (HACS). Mientras tanto se ve el video sin audio.</div>' : ''}
        ${!u.stream && u.camera ? '<div class="hint" style="margin-top:10px">Para hablar por el portero, configurá go2rtc y poné el nombre del stream en los ajustes del portero.</div>' : ''}
        <div class="grp" style="margin-top:18px">Quién tocó</div>
        ${hist.length ? `<div class="hist">${hist.map((e, i) => `<div class="h1"><div class="ph" data-media="${esc(e.media || '')}" data-i="${i}">${e.media ? '…' : '<ha-icon icon="mdi:bell-outline"></ha-icon>'}</div>
          <div class="cap">${esc(fmt(e.at))}${e.opened ? ' · 🔓 abrieron' : ''}</div></div>`).join('')}</div>` : '<div class="hint" style="margin:4px">Todavía no tocaron el timbre.</div>'}
        <button class="btn sec2" data-a="dooract" data-v="test"><ha-icon icon="mdi:bell-ring-outline"></ha-icon> Probar el aviso</button>
      </div></div></div>`;
  }

  _mountDoor(root) {
    const o = this._ov; const h = this._hass;
    const r = (this._rules || []).find((x) => x.id === o.id); if (!r) return;
    const u = r.ui || {};
    const box = root.querySelector('[data-live]');
    if (box && u.camera) {
      // con go2rtc + WebRTC Camera: video, audio y micrófono (hablar). Si no, video MJPEG.
      if (u.stream && customElements.get('webrtc-camera')) {
        if (!this._talkEl || this._talkFor !== r.id) {
          try {
            this._talkEl = document.createElement('webrtc-camera');
            this._talkEl.setConfig({ url: u.stream, entity: u.camera, media: 'video,audio,microphone', mode: 'webrtc,mse,hls,mjpeg', muted: false });
            this._talkFor = r.id;
          } catch (e) { this._talkEl = null; }
        }
        if (this._talkEl) { this._talkEl.hass = h; box.textContent = ''; box.appendChild(this._talkEl); return; }
      }
      const token = h.states[u.camera]?.attributes?.access_token;
      box.innerHTML = token ? `<img src="${window.__maeBase || ''}/api/camera_proxy_stream/${esc(u.camera)}?token=${esc(token)}" alt="">` : 'Cámara no disponible';
    }
    // fotos del historial (URL firmada por media_source)
    root.querySelectorAll('[data-media]').forEach(async (el) => {
      const id = el.dataset.media; if (!id) return;
      this._mediaUrls ||= {};
      try {
        if (!this._mediaUrls[id]) this._mediaUrls[id] = (await h.callWS({ type: 'media_source/resolve_media', media_content_id: id })).url;
        el.innerHTML = `<img src="${esc(this._mediaUrls[id])}" alt="" loading="lazy">`;
      } catch (e) { el.innerHTML = '<ha-icon icon="mdi:image-off-outline"></ha-icon>'; }
    });
  }

  // ---------- página de ajustes del instalador
  _settingsCandidates() {
    const h = this._hass;
    const doms = new Set([...STATE_DOMAINS, ...ACTION_DOMAINS, 'event', 'weather', 'calendar', 'tts']);
    return Object.keys(h.states).filter((eid) => {
      if (!doms.has(dom(eid))) return false;
      const reg = h.entities?.[eid];
      return !(reg && (reg.hidden || reg.entity_category));
    });
  }
  _settingsListHtml() {
    const h = this._hass; const o = this._ov; const hidden = new Set(o.hidden);
    const q = (o.ssearch || '').toLowerCase();
    const groups = {};
    for (const eid of this._settingsCandidates()) {
      const n = fname(h, eid); const a = areaName(h, eid);
      if (q && !`${n} ${a} ${eid} ${dlabel(dom(eid))}`.toLowerCase().includes(q)) continue;
      (groups[dom(eid)] ||= []).push({ eid, n, a });
    }
    const keys = Object.keys(groups).sort((x, y) => dlabel(x).localeCompare(dlabel(y)));
    if (!keys.length) return '<div class="slist"><div class="empty">No se encontraron equipos</div></div>';
    return `<div class="slist">${keys.map((d) => {
      const list = groups[d].sort((x, y) => x.n.localeCompare(y.n));
      const vis = list.filter((x) => !hidden.has(x.eid)).length;
      return `<div class="grp" style="display:flex;align-items:center;gap:8px"><span style="flex:1">${esc(dlabel(d))} · ${vis}/${list.length}</span>
        <button class="chip" style="padding:5px 10px;font-size:12px" data-a="sgrp" data-v="${d}" data-on="1">Todos</button><button class="chip" style="padding:5px 10px;font-size:12px" data-a="sgrp" data-v="${d}" data-on="0">Ninguno</button></div>
        <div class="card">${list.map(({ eid, n, a }) => {
          const on = !hidden.has(eid);
          return `<button class="item" data-a="stoggle" data-v="${esc(eid)}"><ha-icon icon="${entIcon(h, eid)}" style="color:var(--mae-sub)"></ha-icon><div class="tx"><div class="t1">${esc(n)}</div><div class="t2">${esc(a || eid)}</div></div><span class="check ${on ? 'on' : ''}">${on ? '<ha-icon icon="mdi:check"></ha-icon>' : ''}</span></button>`;
        }).join('')}</div>`;
    }).join('')}</div>`;
  }
  _pageSettings() {
    return `<div class="ov"><div class="bar"><button class="ib" data-a="back"><ha-icon icon="mdi:arrow-left"></ha-icon></button><h1>Ajustes del instalador</h1><button class="save" data-a="ssave">Guardar</button></div>
      <div class="body"><div class="wrap">
        <div class="sec" style="margin-top:0"><div><div class="h">Qué puede crear el cliente</div><div class="s">Lo que ya está armado sigue funcionando y el cliente lo puede activar o pausar</div></div></div>
        <div class="chips">${CLIENT_KINDS.map(([k, l]) => { const on = !(this._ov.clientOff || []).includes(k); return `<button class="chip ${on ? 'on' : ''}" data-a="coff" data-v="${k}">${on ? '✓ ' : ''}${esc(l)}</button>`; }).join('')}</div>
        <div class="sec"><div><div class="h">Equipos visibles</div></div></div>
        <div class="note" style="margin-top:6px">Elegí qué equipos puede usar el cliente al armar escenas y automatizaciones. Los desmarcados no aparecen en las listas (lo que ya está creado sigue funcionando). Sólo vos, como administrador, ves esta pantalla.</div>
        <div class="search" style="margin-top:12px"><input type="text" placeholder="Buscar por nombre, ambiente o tipo…" value="${esc(this._ov.ssearch || '')}" data-a="ssearch"></div>
        ${this._settingsListHtml()}
      </div></div></div>`;
  }

  // ---------- página "Crear"
  _pageCreate() {
    const h = this._hass;
    let it = (a, attrs, icon, color, t1, t2) => `<button class="item" data-a="${a}" ${attrs}><div class="ic" style="background:${color}"><ha-icon icon="${icon}"></ha-icon></div><div class="tx"><div class="t1">${esc(t1)}</div>${t2 ? `<div class="t2">${esc(t2)}</div>` : ''}</div><ha-icon class="chev" icon="mdi:chevron-right"></ha-icon></button>`;
    const trig = TRIGGER_TYPES.filter((t) => !t.need || t.need(h));
    const ideas = IDEAS.filter((i) => !i.need || i.need(h));
    const tab = this._ctab || 'smart';
    const riego = IDEAS.findIndex((i) => i.make && i.name.startsWith('Riego'));
    // qué tipos puede crear este usuario (el instalador los elige por casa)
    const off = new Set(this._settings?.client_off || []);
    const kindOf = (a, attrs) => {
      const v = (attrs.match(/data-v="([^"]*)"/) || [])[1];
      if (a === 'newkind') return v;
      if (a === 'idea') { try { return IDEAS[+v].make().kind; } catch (_) { return 'auto'; } }
      return { newscene: 'scene', newauto: 'auto', newrem: 'reminder', calalert: 'calalert', newnight: 'period', newdim: 'circadian', newocc: 'occ' }[a] || '';
    };
    const itAll = it;
    const itOk = (a, attrs, ...rest) => {
      const k = kindOf(a, attrs);
      if (k === 'occ' || k === 'gate') return this._isAdmin ? itAll(a, attrs, ...rest) : '';
      return this._isAdmin || !off.has(k) ? itAll(a, attrs, ...rest) : '';
    };
    it = itOk;
    let body = tab === 'smart' ? `
      <div class="hint" style="margin:2px 4px 0">Automatizaciones completas, listas para usar: elegís tus equipos y ajustás lo que quieras.</div>
      ${this._isAdmin ? `<div class="sec"><div><div class="h">🛠 Equipos del instalador</div><div class="s">Se configuran una vez al instalar. El cliente no los ve: usa lo que crean (el portón, el sensor)</div></div></div>
      <div class="card">
        ${it('newkind', 'data-v="gate"', 'mdi:gate', '#4F8EF7', 'Portón inteligente', 'Abriendo / Cerrando con un solo sensor, aprende cuánto tarda, seguros del pulso y avisos')}
        ${it('newocc', '', 'mdi:account-check-outline', '#7A8699', 'Sensor de ocupación de un ambiente', 'Movimiento + puerta (+ mmWave): sabe si hay alguien aunque no se mueva. Para usar en otras automatizaciones')}
      </div>` : ''}
      <div class="sec"><div><div class="h">💡 Luces</div></div></div>
      <div class="card">
        ${it('newkind', 'data-v="room"', 'mdi:motion-sensor', '#3DBE8B', 'Luz por presencia', 'Baños y ambientes: movimiento, puerta y presencia. No se apaga si hay alguien adentro')}
        ${it('newnight', '', 'mdi:weather-night', '#5B6CD9', 'Luces de noche', 'Se prenden al atardecer y se apagan al amanecer, solas todo el año')}
        ${it('newkind', 'data-v="circadian"', 'mdi:sun-clock-outline', '#F7B84F', 'Luz circadiana', 'El blanco de las luces sigue el ritmo del día: fresco de día, cálido de noche')}
        ${it('newdim', '', 'mdi:brightness-6', '#7A8699', 'Brillo según la hora (dimmers)', 'La intensidad sube de mañana y baja de a poco a la noche')}
        ${it('newkind', 'data-v="presence"', 'mdi:home-lightbulb-outline', '#F76F6F', 'Simular presencia', 'Prende y apaga luces al azar de noche cuando estás de viaje')}
      </div>
      <div class="sec"><div><div class="h">🕗 Horarios y tiempos</div></div></div>
      <div class="card">
        ${it('newkind', 'data-v="period"', 'mdi:clock-time-eight-outline', '#4F8EF7', 'Encender y apagar en un horario', 'De 8:00 a 20:00, o del atardecer a las 23:00')}
        ${it('newkind', 'data-v="timer"', 'mdi:timer-outline', '#F7B84F', 'Temporizador', 'Apagar (o prender) dentro de un rato')}
        ${it('newkind', 'data-v="loop"', 'mdi:repeat', '#9B6CF7', 'Ciclo', 'Ej: bomba 15 min prendida / 45 min apagada, todo el día')}
      </div>
      <div class="sec"><div><div class="h">🔔 Recordatorios</div></div></div>
      <div class="card">
        ${it('newrem', '', 'mdi:bell-ring-outline', '#F7B84F', 'Recordatorio', 'Una vez o que se repite, con botones Hecho / En 1 hora')}
        ${it('calalert', '', 'mdi:calendar-alert', '#F78FCF', 'Avisos del calendario', 'Te avisa antes de cada evento de tu agenda')}
      </div>
      <div class="sec"><div><div class="h">📺 Tele</div></div></div>
      <div class="card">${it('newkind', 'data-v="tv"', 'mdi:television-classic', '#9B6CF7', 'Tele inteligente', 'Modo cine al darle play, barra de sonido, se apaga si no hay nadie, hora de dormir de los chicos')}</div>
      <div class="sec"><div><div class="h">🌅 Rutinas del día</div></div></div>
      <div class="card">
        ${it('newkind', 'data-v="wake"', 'mdi:alarm-light-outline', '#F7B84F', 'Despertador con luz', 'Amanecer simulado con las luces o luz natural con las persianas')}
        ${it('newkind', 'data-v="night"', 'mdi:weather-night', '#5B6CD9', 'Buenas noches', 'Apaga todo y deja la luz de noche; se activa sola cuando la casa se va a dormir')}
      </div>
      <div class="sec"><div><div class="h">❄️ Clima</div></div></div>
      <div class="card">${it('newkind', 'data-v="clima"', 'mdi:thermostat-auto', '#3FB8E0', 'Clima inteligente', 'Horarios con temperatura; apaga con ventanas abiertas o si no hay nadie')}</div>
      <div class="sec"><div><div class="h">🔒 Casa y seguridad</div></div></div>
      <div class="card">
        ${it('newkind', 'data-v="away"', 'mdi:home-export-outline', '#F76F6F', 'Me voy / Llego', 'Cuando se va el último apaga todo y avisa qué quedó abierto; al volver, bienvenida')}
        ${it('newkind', 'data-v="guest"', 'mdi:account-key', '#4F8EF7', 'Invitados', 'Un link para que cada invitado abra el portón o la puerta, sólo el tiempo que vos quieras')}
        ${it('newkind', 'data-v="doorbell"', 'mdi:doorbell-video', '#3DBE8B', 'Portero', 'Te avisa con la foto, abrís desde el celular y ves quién tocó')}
        ${it('newkind', 'data-v="watch"', 'mdi:alert-circle-outline', '#F78F4F', 'Avisar si algo quedó abierto o prendido', 'Puertas, ventanas, portón, aires, calefacción… con botones para apagar desde el aviso')}
      </div>
      <div class="sec"><div><div class="h">📹 Cámaras (Frigate)</div></div></div>
      <div class="card">
        ${it('newkind', 'data-v="fdetect"', 'mdi:cctv', '#F76F6F', 'Detección con cámaras', 'Personas, autos, animales o paquetes en una zona: aviso con foto, luces y sirena')}
        ${it('newkind', 'data-v="fface"', 'mdi:face-recognition', '#3DBE8B', 'Caras y patentes conocidas', 'Llega alguien de la familia o su auto: aviso, abrir, luces y bienvenida')}
      </div>
      <div class="sec"><div><div class="h">🌱 Jardín</div></div></div>
      <div class="card">${it('idea', `data-v="${riego}"`, 'mdi:sprinkler-variant', '#3FB8E0', 'Riego por zonas', 'Bomba y electroválvulas, horarios, lluvia y humedad del suelo')}</div>`
    : `
      <div class="sec" style="margin-top:4px"><div><div class="h">Elegí cómo se activa</div></div></div>
      <div class="card">${it('newscene', '', 'mdi:gesture-tap', '#3DBE8B', 'Tocar para ejecutar', 'Una escena: varias cosas con un solo toque (también por voz)')}</div>
      <div class="card" style="margin-top:10px">${trig.map((t) => it('newauto', `data-v="${t.id}"`, t.icon, t.color, t.label, `Ej: ${t.hint || ''}`)).join('')}</div>
      <div class="sec"><div><div class="h">Ideas para empezar</div><div class="s">Elegí una y completá tus dispositivos</div></div></div>
      <div class="card">${ideas.map((i) => it('idea', `data-v="${IDEAS.indexOf(i)}"`, i.icon, i.color, i.name, i.hint)).join('')}</div>`;
    // secciones que quedaron vacías (tipos que el instalador no habilitó)
    body = body.replace(/<div class="sec"[^>]*><div><div class="h">[^<]*<\/div>(?:<div class="s">[^<]*<\/div>)?<\/div><\/div>\s*<div class="card"[^>]*>\s*<\/div>/g, '');
    if (!/class="item"/.test(body)) body = '<div class="empty"><ha-icon icon="mdi:lock-outline"></ha-icon><div>Tu instalador todavía no habilitó automatizaciones para crear.</div></div>';
    return `<div class="ov"><div class="bar"><button class="ib" data-a="close"><ha-icon icon="mdi:close"></ha-icon></button><h1>Crear</h1><span style="width:40px"></span></div>
    <div class="body"><div class="wrap">
      <div class="seg" style="margin-bottom:6px"><button class="${tab === 'smart' ? 'on' : ''}" data-a="ctab" data-v="smart">✨ Inteligentes</button><button class="${tab === 'mine' ? 'on' : ''}" data-a="ctab" data-v="mine">🛠 Armar la mía</button></div>
      ${body}
      <div class="brandrow" style="margin-top:14px">${BRAND}</div>
    </div></div></div>`;
  }

  // ---------- página editor
  _pageEditor() {
    const o = this._ov; const d = o.draft; const h = this._hass;
    const err = draftError(d);
    const title = d.id ? 'Editar' : d.kind === 'circadian' && d.ui.adjust === 'bri' ? 'Brillo según la hora' : d.kind === 'period' && d.ui.on?.type === 'sunset' && d.ui.off?.type === 'sunrise' ? 'Luces de noche' : d.kind === 'room' && d.ui.only_sensor ? 'Sensor de ocupación' : KIND_META[d.kind].title;
    let main = '';
    if (d.kind === 'scene' || d.kind === 'auto') main = this._editorGeneric(d);
    else main = this[`_editor_${d.kind}`](d);
    const canRun = d.id && ['scene', 'auto', 'irrigation', 'night', 'wake', 'doorbell'].includes(d.kind);
    const advanced = d.kind === 'auto' ? `
      <div class="sec"><div><div class="h">Si se vuelve a activar mientras está en curso</div></div></div>
      <div class="field"><select data-o="d" data-k="mode">
        ${[['restart', 'Empezar de nuevo (ideal para sensores de movimiento)'], ['single', 'Ignorar la nueva activación'], ['queued', 'Hacerla después, en orden'], ['parallel', 'Hacer las dos a la vez']].map(([v, l]) => `<option value="${v}" ${d.mode === v ? 'selected' : ''}>${l}</option>`).join('')}
      </select></div>` : '';
    const enabledRow = !['scene', 'timer', 'reminder'].includes(d.kind) ? `
      <div class="field" style="display:flex;align-items:center;gap:12px;margin-top:16px"><div style="flex:1"><div class="t1" style="font-weight:600">Activa</div><div class="hint" style="margin:2px 0 0">Si la pausás, queda guardada pero no se ejecuta</div></div>
      <button class="sw ${d.enabled !== false ? 'on' : ''}" data-a="denabled"></button></div>` : '';
    const lockRow = this._isAdmin && !installerOnly(d) ? `
      <div class="field" style="display:flex;align-items:center;gap:12px;margin-top:10px"><div style="flex:1"><div class="t1" style="font-weight:600">🔒 Bloquear para el cliente</div><div class="hint" style="margin:2px 0 0">La puede activar o pausar, pero no cambiarla ni borrarla</div></div>
      <button class="sw ${d.locked ? 'on' : ''}" data-a="dlock"></button></div>` : '';
    return `<div class="ov"><div class="bar"><button class="ib" data-a="back"><ha-icon icon="mdi:arrow-left"></ha-icon></button><h1>${esc(title)}</h1><button class="save ${err ? 'dis' : ''}" data-a="save">${d.kind === 'timer' && !d.ui.keep ? 'Iniciar' : 'Guardar'}</button></div>
    <div class="body"><div class="wrap">
      ${d.kind === 'reminder' ? '' : `<div class="field"><div class="nameRow">
        <button class="bigic" style="background:${esc(d.color)}" data-a="iconsheet"><ha-icon icon="${esc(d.icon)}"></ha-icon></button>
        <input type="text" placeholder="${d.kind === 'scene' ? 'Nombre (ej: Modo cine)' : 'Nombre (ej: Luz del pasillo)'}" value="${esc(d.name)}" data-o="d" data-k="name" maxlength="80">
      </div>
      <div class="colors">${COLORS.map((c) => `<button class="dot ${d.color === c ? 'on' : ''}" style="background:${c}" data-a="set" data-o="d" data-k="color" data-v="${c}"></button>`).join('')}</div></div>`}
      ${main}
      ${advanced}
      ${enabledRow}${lockRow}
      ${err ? `<div class="note">⚠ ${esc(err)}</div>` : ''}
      ${canRun ? `<button class="btn sec2" data-a="testrun"><ha-icon icon="mdi:play"></ha-icon> ${d.kind === 'irrigation' ? 'Regar ahora (ignora lluvia y días)' : d.kind === 'night' ? 'Buenas noches ahora' : d.kind === 'wake' ? 'Probar (amanecer de 1 minuto)' : d.kind === 'doorbell' ? 'Probar el aviso' : 'Probar ahora'}</button>` : ''}
      ${d.id ? `<button class="btn danger" data-a="delete">Eliminar</button>` : ''}
      ${d.id && d.created_by ? `<div class="hint" style="text-align:center">Creada por ${esc(d.created_by)}${d.runs ? ` · se ejecutó ${d.runs} ${d.runs == 1 ? 'vez' : 'veces'}` : ''}${d.last_run ? ` · última: ${new Date(d.last_run).toLocaleString()}` : ''}</div>` : ''}
    </div></div></div>`;
  }

  _itemsHtml(list, items) {
    const h = this._hass;
    return items.map((it, i) => {
      const t = typeOf(list, it.type);
      const miss = missing(list, it);
      const icon = it.entity && h.states[it.entity] ? entIcon(h, it.entity) : t.icon;
      const move = list === 'actions' && items.length > 1 ? `
        ${i > 0 ? `<button data-a="move" data-l="${list}" data-i="${i}" data-v="-1"><ha-icon icon="mdi:arrow-up"></ha-icon></button>` : ''}
        ${i < items.length - 1 ? `<button data-a="move" data-l="${list}" data-i="${i}" data-v="1"><ha-icon icon="mdi:arrow-down"></ha-icon></button>` : ''}` : '';
      return `<div class="item"><div class="ic" style="background:${t.color}"><ha-icon icon="${icon}"></ha-icon></div>
        <button class="tx" style="text-align:left" data-a="edititem" data-l="${list}" data-i="${i}">
          <div class="t1">${esc(describe(h, list, it, this._rules))}</div>
          <div class="t2 ${miss ? 'warn' : ''}">${miss ? `⚠ ${esc(miss)} — tocá para completar` : esc(t.label)}</div>
        </button>
        <div class="mini">${move}<button data-a="delitem" data-l="${list}" data-i="${i}"><ha-icon icon="mdi:close"></ha-icon></button></div></div>`;
    }).join('');
  }
  _listBlock(list, items, big) {
    return `${items.length ? `<div class="card">${this._itemsHtml(list, items)}</div>` : ''}
      <button class="add ${items.length || !big ? 'addsm' : ''}" data-a="additem" data-l="${list}"><span class="plus"><ha-icon icon="mdi:plus"></ha-icon></span>Agregar</button>`;
  }
  _editorGeneric(d) {
    const u = d.ui;
    let s = '';
    if (d.kind === 'auto') {
      s += `<div class="sec"><div><div class="h">Si</div><div class="s">${u.triggers.length > 1 ? 'pasa cualquiera de estas cosas' : 'pasa esto'}</div></div></div>${this._listBlock('triggers', u.triggers, true)}`;
      s += `<div class="sec"><div><div class="h">Sólo si <span class="muted" style="font-weight:400;font-size:13px">(opcional)</span></div><div class="s">se cumple${u.conditions.length > 1 ? (u.cond_mode === 'any' ? ' alguna' : 'n todas') : ''}</div></div>
        ${u.conditions.length > 1 ? `<div class="seg" style="flex:none;width:180px"><button class="${u.cond_mode !== 'any' ? 'on' : ''}" data-a="set" data-o="d" data-k="ui.cond_mode" data-v="all">Todas</button><button class="${u.cond_mode === 'any' ? 'on' : ''}" data-a="set" data-o="d" data-k="ui.cond_mode" data-v="any">Alguna</button></div>` : ''}</div>
        ${this._listBlock('conditions', u.conditions, false)}`;
      s += `<div class="sec"><div><div class="h">Entonces</div><div class="s">hacer esto, en orden</div></div></div>${this._listBlock('actions', u.actions, true)}`;
    } else {
      s += `<div class="sec"><div><div class="h">Al tocar la escena</div><div class="s">hacer esto, en orden</div></div></div>${this._listBlock('actions', u.actions, true)}`;
      s += `<div class="field" style="margin-top:16px">${this._sw('voice', '🗣 Interruptor para Alexa / Google (Matter)', u.voice)}
        <div class="hint">Crea un interruptor «${esc(d.name || 'la escena')}» que, al prenderlo, ejecuta la escena y vuelve a apagarse solo. Exponelo con el add-on «Home Assistant Matter Hub» y decile «Alexa, prendé ${esc((d.name || 'la escena').toLowerCase())}». Con una rutina de Alexa alcanza con decir el nombre.</div></div>`;
      s += `<div class="note">💡 Cada escena crea también un botón en Home Assistant para ponerlo en el panel.</div>`;
    }
    return s;
  }

  _entBtn(o, k, eid, domains, placeholder, multi, dc, flt) {
    const h = this._hass;
    const attrs = `data-a="pick" data-o="${o}" data-k="${k}" data-dom="${domains.join(',')}" ${multi ? 'data-multi="1"' : ''} ${dc ? `data-dc="${dc.join(',')}"` : ''} ${flt ? `data-flt="${flt}"` : ''}`;
    if (multi) {
      const list = eid || [];
      return `<button class="picker-btn ${list.length ? '' : 'empty-p'}" ${attrs}><ha-icon icon="${list.length ? 'mdi:checkbox-multiple-marked-circle' : 'mdi:plus-circle'}"></ha-icon><div class="tx"><div class="t1">${list.length ? `${list.length} elegidos` : esc(placeholder)}</div>${list.length ? `<div class="t2">${esc(list.map((e) => fname(h, e)).join(', '))}</div>` : ''}</div><ha-icon icon="mdi:chevron-right"></ha-icon></button>`;
    }
    if (!eid) return `<button class="picker-btn empty-p" ${attrs}><ha-icon icon="mdi:plus-circle"></ha-icon><div class="tx"><div class="t1">${esc(placeholder)}</div></div><ha-icon icon="mdi:chevron-right"></ha-icon></button>`;
    const st = h.states[eid];
    return `<button class="picker-btn" ${attrs}><ha-icon icon="${entIcon(h, eid)}"></ha-icon><div class="tx"><div class="t1">${esc(fname(h, eid))}</div><div class="t2">${esc([areaName(h, eid), st ? `${st.state}${unitOf(h, eid) ? ` ${unitOf(h, eid)}` : ''}` : 'no disponible'].filter(Boolean).join(' · '))}</div></div><ha-icon icon="mdi:chevron-right"></ha-icon></button>`;
  }
  _days(o, k, days) {
    return `<div class="days">${DAYS.map(([v, l]) => `<button class="day ${(days || []).includes(v) ? 'on' : ''}" data-a="day" data-o="${o}" data-k="${k}" data-v="${v}">${l}</button>`).join('')}</div>
      <div class="chips" style="margin-top:10px">${[['all', 'Todos'], ['week', 'Lun a vie'], ['wkend', 'Fin de semana']].map(([v, l]) => `<button class="chip" data-a="dayset" data-o="${o}" data-k="${k}" data-v="${v}">${l}</button>`).join('')}</div>`;
  }
  _seg(o, k, cur, opts) {
    return `<div class="seg">${opts.map(([v, l]) => `<button class="${String(cur) === String(v) ? 'on' : ''}" data-a="set" data-o="${o}" data-k="${k}" data-v="${esc(v)}">${esc(l)}</button>`).join('')}</div>`;
  }
  _chips(o, k, cur, opts, multi) {
    return `<div class="chips">${opts.map(([v, l, ic]) => {
      const on = multi ? (cur || []).includes(v) : String(cur) === String(v);
      return `<button class="chip ${on ? 'on' : ''}" data-a="${multi ? 'mset' : 'set'}" data-o="${o}" data-k="${k}" data-v="${esc(v)}">${ic ? `<ha-icon icon="${ic}"></ha-icon>` : ''}${esc(l)}</button>`;
    }).join('')}</div>`;
  }
  _num(o, k, v, attrs = '', unit = '') {
    return `<div class="inl"><input type="number" inputmode="decimal" value="${esc(v ?? '')}" data-o="${o}" data-k="${k}" data-t="num" ${attrs}>${unit ? `<span class="unit">${esc(unit)}</span>` : ''}</div>`;
  }
  _moment(k, m) {
    return `${this._seg('d', `${k}.type`, m.type, [['time', 'Hora'], ['sunrise', 'Amanecer'], ['sunset', 'Atardecer']])}
      <div style="margin-top:10px">${m.type === 'time'
        ? `<input type="time" value="${esc(m.at)}" data-o="d" data-k="${k}.at">`
        : `<div class="inl"><select data-o="d" data-k="${k}.offset" data-t="num">${[-180, -150, -120, -90, -60, -45, -30, -20, -15, -10, -5, 0, 5, 10, 15, 20, 30, 45, 60, 90, 120, 150, 180].map((v) => `<option value="${v}" ${+m.offset === v ? 'selected' : ''}>${v === 0 ? `Justo ${m.type === 'sunrise' ? 'al amanecer' : 'al atardecer'}` : `${durText(Math.abs(v))} ${v < 0 ? 'antes' : 'después'} ${m.type === 'sunrise' ? 'del amanecer' : 'del atardecer'}`}</option>`).join('')}</select></div>`}</div>`;
  }

  _recipients(k, cur) {
    const h = this._hass;
    const svcs = Object.keys(h.services?.notify || {}).filter((x) => x.startsWith('mobile_app_'));
    if (!svcs.length) return '<div class="hint">No hay celulares con la app de Home Assistant: los avisos van a aparecer en Home Assistant.</div>';
    return `${this._chips('d', k, cur, svcs.map((x) => [x, notifyLabel(x), 'mdi:cellphone']), true)}
      <div class="hint">${(cur || []).length ? 'Les llega el aviso con botones para responder desde el celular.' : 'Si no elegís ninguno, el aviso aparece en Home Assistant.'}</div>`;
  }
  _num2(sec, n, title, sub) { return `<div class="sec"><div><div class="h"><span class="num">${n}</span>${title}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div></div>`; }
  _sw(k, label, on) { return `<div class="opt" style="margin:0"><button class="sw ${on ? 'on' : ''}" data-a="set" data-o="d" data-k="ui.${k}" data-v="${on ? '' : '1'}" data-t="bool"></button><div style="font-weight:600">${label}</div></div>`; }

  _mode3(u, k, list, label, domains, ph) {
    return `<div class="lbl" style="margin-top:14px">${label}</div>${this._seg('d', `ui.${k}`, u[k], [['none', 'Nada'], ['all', 'Todo'], ['list', 'Elegir']])}
      ${u[k] === 'list' ? `<div style="margin-top:8px">${this._entBtn('d', `ui.${list}`, u[list], domains, ph, true)}</div>` : ''}`;
  }

  _editor_night(d) {
    const u = d.ui; const h = this._hass;
    const sec = (n, t, s2) => this._num2(null, n, t, s2);
    const rules = (this._rules || []).filter((r) => r.id !== d.id && !['timer', 'scene', 'night'].includes(r.kind));
    const does = [u.lights !== 'none' ? 'apaga las luces' : '', u.media !== 'none' ? 'apaga teles y equipos' : '', u.night_lights.length ? `deja ${u.night_lights.length === 1 ? 'una luz' : 'luces'} de noche al ${u.night_pct}%` : '',
      u.climate.length ? (u.climate_action === 'off' ? 'apaga los aires' : `pone los aires a ${u.climate_temp}°`) : '', u.covers !== 'none' ? 'cierra las persianas' : '', u.locks.length ? 'echa llave' : '', u.arm ? 'arma la alarma en modo noche' : '', u.check_open ? 'te avisa si quedó algo abierto' : ''].filter(Boolean);
    let n = 0;
    return `<div class="today"><div class="mode" style="margin:0"><ha-icon icon="mdi:information-outline"></ha-icon><div><b>Cómo funciona</b><br>
        ${does.length ? `Al activarse: ${does.join(', ')}.` : 'Elegí qué hace al activarse.'}<br>
        ${u.auto ? `Se activa sola entre las ${u.from} y las ${u.to} cuando no hay movimiento en las áreas comunes durante ${durText(u.quiet_min)}${u.ask ? `; antes te pregunta${u.ask_default ? ' y si no respondés en ' + durText(u.ask_wait) + ' la activa' : ''}` : ''}. Una vez por noche.` : 'Se activa con el botón de la tarjeta, el botón de Home Assistant o por voz.'}</div></div></div>

      ${sec(++n, 'Qué hace')}
      <div class="field">${this._mode3(u, 'lights', 'lights_list', '💡 Apagar luces', ['light', 'switch'], 'Elegir luces')}
        ${u.lights === 'all' ? `<div class="lbl" style="margin-top:10px">Menos estas (opcional)</div>${this._entBtn('d', 'ui.keep', u.keep, ['light', 'switch'], 'Ninguna', true)}` : ''}
        ${this._mode3(u, 'media', 'media_list', '📺 Apagar teles y equipos', ['media_player'], 'Elegir')}
        <div class="lbl" style="margin-top:14px">🔌 Apagar también (opcional)</div>${this._entBtn('d', 'ui.switches', u.switches, ['switch', 'input_boolean', 'fan', 'light'], 'Enchufes, estufas, ventiladores…', true)}
        <div class="lbl" style="margin-top:14px">🌙 Luz de noche (opcional)</div>${this._entBtn('d', 'ui.night_lights', u.night_lights, ['light', 'switch'], 'Sin luz de noche', true)}
        ${u.night_lights.length ? `<div style="margin-top:8px">${this._chips('d', 'ui.night_pct', u.night_pct, [[1, '1%'], [5, '5%'], [10, '10%'], [20, '20%']])}</div><div class="hint">Por ejemplo el pasillo o el baño, tenue para no encandilar.</div>` : ''}
        <div class="lbl" style="margin-top:14px">❄️ Aires (opcional)</div>${this._entBtn('d', 'ui.climate', u.climate, ['climate'], 'Sin aires', true)}
        ${u.climate.length ? `<div style="margin-top:8px">${this._seg('d', 'ui.climate_action', u.climate_action, [['temp', 'Temperatura para dormir'], ['off', 'Apagarlos']])}</div>
          ${u.climate_action === 'temp' ? `<div class="inl" style="margin-top:8px"><span class="unit">a</span>${this._num('d', 'ui.climate_temp', u.climate_temp, 'min="16" max="30" step="0.5"', '°')}</div><div class="hint">Sólo cambia los que están prendidos.</div>` : ''}` : ''}
        ${has(h, 'cover') ? this._mode3(u, 'covers', 'covers_list', '🪟 Cerrar persianas', ['cover'], 'Elegir persianas') : ''}
        ${has(h, 'lock') ? `<div class="lbl" style="margin-top:14px">🔐 Echar llave (opcional)</div>${this._entBtn('d', 'ui.locks', u.locks, ['lock'], 'Sin cerraduras', true)}` : ''}
        ${has(h, 'alarm_control_panel') ? `<div style="margin-top:14px">${this._sw('arm', '🛡 Armar la alarma en modo noche', u.arm)}</div>
          ${u.arm ? `<div style="margin-top:8px">${this._entBtn('d', 'ui.alarm', u.alarm, ['alarm_control_panel'], 'Elegir alarma')}</div>
            <div class="lbl" style="margin-top:10px">Código (si lo pide)</div><input type="text" inputmode="numeric" value="${esc(u.code)}" data-o="d" data-k="ui.code" autocomplete="off">` : ''}` : ''}
        ${rules.length ? `<div class="lbl" style="margin-top:14px">Activar automatizaciones (opcional)</div>${this._chips('d', 'ui.rules_on', u.rules_on, rules.map((r) => [r.id, r.name, r.icon]), true)}` : ''}
        <div style="margin-top:14px">${this._sw('check_open', '⚠ Avisar si quedó algo abierto', u.check_open)}</div><div class="hint">Revisa los sensores de puertas y ventanas.</div></div>

      ${sec(++n, 'Que se active sola')}
      <div class="field">${this._sw('auto', 'Detectar cuando la casa se va a dormir', u.auto)}
        <div class="hint">Si en las áreas comunes (living, cocina, pasillo) no hay movimiento durante un rato, dentro del horario, entiende que se fueron a dormir. El movimiento en los dormitorios no cuenta.</div>
        ${u.auto ? `<div class="lbl" style="margin-top:14px">Sensores de las áreas comunes</div>${this._entBtn('d', 'ui.common', u.common, ['binary_sensor'], 'Elegir sensores de movimiento', true, ['motion', 'occupancy', 'presence'])}
          <div class="lbl" style="margin-top:14px">Entre</div><div class="inl"><input type="time" value="${esc(u.from)}" data-o="d" data-k="ui.from"><span class="unit">y</span><input type="time" value="${esc(u.to)}" data-o="d" data-k="ui.to"></div>
          <div class="lbl" style="margin-top:14px">Sin movimiento durante</div>${this._chips('d', 'ui.quiet_min', u.quiet_min, [[10, '10 min'], [15, '15 min'], [20, '20 min'], [30, '30 min'], [45, '45 min'], [60, '1 h']])}
          <div style="margin-top:14px">${this._sw('ask', 'Preguntar antes', u.ask)}</div>
          ${u.ask ? `<div class="hint">Llega un aviso «¿Buenas noches?» con los botones Sí / Todavía no.</div>
            <div class="lbl" style="margin-top:10px">Si nadie responde en</div>${this._chips('d', 'ui.ask_wait', u.ask_wait, [[2, '2 min'], [5, '5 min'], [10, '10 min'], [15, '15 min']])}
            <div style="margin-top:10px">${this._seg('d', 'ui.ask_default', u.ask_default ? '1' : '', [['1', 'Activarla igual'], ['', 'No hacer nada']])}</div>
            <div class="lbl" style="margin-top:10px">Con «Todavía no», volver a preguntar en</div>${this._chips('d', 'ui.retry_min', u.retry_min, [[15, '15 min'], [30, '30 min'], [60, '1 h']])}` : ''}` : ''}</div>

      ${sec(++n, 'Avisos')}
      <div class="field">${this._recipients('ui.recipients', u.recipients)}
        <div style="margin-top:12px">${this._sw('notify', 'Avisar qué hizo', u.notify)}</div><div class="hint">«Listo: apagué 6 luces y la tele, dejé la luz de noche. ⚠ Quedó abierta la ventana de la cocina.»</div></div>
      <div class="note">Crea un botón «${esc(d.name || 'Buenas noches')}» en Home Assistant: lo podés poner en el panel o pedírselo a Alexa / Google.</div>`;
  }

  _editor_clima(d) {
    const u = d.ui; const h = this._hass;
    const sec = (n, t, s2) => this._num2(null, n, t, s2);
    const season = u.mode === 'season', heat = u.mode === 'heat';
    const blocks = u.blocks.map((b, i) => `<div class="srow" style="align-items:center">
        <div style="flex:none;width:110px"><input type="time" value="${esc(b.from)}" data-o="d" data-k="ui.blocks.${i}.from"></div>
        <div style="flex:none"><button class="sw ${b.on ? 'on' : ''}" data-a="set" data-o="d" data-k="ui.blocks.${i}.on" data-v="${b.on ? '' : '1'}" data-t="bool"></button></div>
        <div>${b.on
          ? `<div class="inl">${!heat ? `${season ? '<span class="unit">❄️</span>' : ''}${this._num('d', `ui.blocks.${i}.cool`, b.cool, 'min="16" max="30" step="0.5"', '°')}` : ''}${heat || season ? `${season ? '<span class="unit">🔥</span>' : ''}${this._num('d', `ui.blocks.${i}.heat`, b.heat, 'min="10" max="30" step="0.5"', '°')}` : ''}</div>`
          : '<span class="muted">apagado</span>'}</div>
        ${u.blocks.length > 1 ? `<button class="ib" style="width:36px;height:36px;color:var(--mae-sub);flex:none" data-a="arrdel" data-k="ui.blocks" data-i="${i}"><ha-icon icon="mdi:close"></ha-icon></button>` : ''}</div>`).join('');
    let n = 0;
    return `<div class="today"><div class="mode" style="margin:0"><ha-icon icon="mdi:information-outline"></ha-icon><div><b>Cómo funciona</b><br>
        Cada horario empieza a la hora indicada y dura hasta el siguiente. ${season ? 'En verano enfría y en invierno calienta, solo.' : ''}
        ${u.windows.length ? 'Si se abre una ventana, apaga, y al cerrarla vuelve. ' : ''}${u.away_off ? 'Si no hay nadie en casa, apaga. ' : ''}${u.room_motion.length ? `Si la habitación queda vacía, ${u.room_action === 'off' ? 'apaga' : 'pasa a modo ahorro (2° menos de esfuerzo)'}. ` : ''}
        ${u.manual_hold ? 'Si alguien lo cambia a mano, lo respeta hasta el próximo horario.' : ''}</div></div></div>

      ${sec(++n, 'Aires')}
      <div class="field">${this._entBtn('d', 'ui.entities', u.entities, ['climate'], 'Elegir aires', true)}
        <div class="lbl" style="margin-top:14px">Modo</div>${this._seg('d', 'ui.mode', u.mode, [['cool', '❄️ Frío'], ['heat', '🔥 Calor'], ['season', '🔄 Según la estación']])}
        ${season ? '<div class="hint">De octubre a abril enfría y de mayo a septiembre calienta (se invierte en el hemisferio norte).</div>' : ''}</div>

      ${sec(++n, 'Horarios', 'Hora · prendido · temperatura')}
      <div class="field">${blocks}
        <button class="chip" style="margin-top:10px" data-a="arradd" data-k="ui.blocks" data-v="block"><ha-icon icon="mdi:plus"></ha-icon>Otro horario</button>
        <div class="hint">Ejemplo: 07:00 24° · 09:00 apagado · 18:00 24° · 23:00 26° (para dormir).</div></div>

      ${sec(++n, 'Ahorro y seguridad', 'Todo opcional')}
      <div class="field"><div class="lbl">🪟 Apagar si se abre una ventana</div>${this._entBtn('d', 'ui.windows', u.windows, ['binary_sensor'], 'Sin sensores de ventana', true, ['window', 'door', 'opening'])}
        ${u.windows.length ? `<div class="lbl" style="margin-top:10px">Si queda abierta más de</div>${this._chips('d', 'ui.window_delay', u.window_delay, [[30, '30 s'], [60, '1 min'], [120, '2 min'], [300, '5 min']])}` : ''}
        ${has(h, 'person') ? `<div style="margin-top:14px">${this._sw('away_off', '🏠 Apagar si no hay nadie en casa', u.away_off)}</div>
          ${u.away_off ? `<div class="lbl" style="margin-top:10px">Después de</div>${this._chips('d', 'ui.away_delay', u.away_delay, [[5, '5 min'], [10, '10 min'], [30, '30 min']])}<div class="hint">Cuando vuelve alguien, sigue con el horario.</div>` : ''}` : ''}
        <div class="lbl" style="margin-top:14px">🚶 Habitación vacía (opcional)</div>${this._entBtn('d', 'ui.room_motion', u.room_motion, ['binary_sensor'], 'Sin sensor de movimiento', true, ['motion', 'occupancy', 'presence'])}
        ${u.room_motion.length ? `<div class="lbl" style="margin-top:10px">Sin movimiento durante</div>${this._chips('d', 'ui.room_empty_min', u.room_empty_min, [[15, '15 min'], [30, '30 min'], [60, '1 h'], [120, '2 h']])}
          <div style="margin-top:10px">${this._seg('d', 'ui.room_action', u.room_action, [['eco', 'Modo ahorro'], ['off', 'Apagar']])}</div>` : ''}
        <div class="lbl" style="margin-top:14px">🌡 Temperatura de afuera (opcional)</div>${this._entBtn('d', 'ui.outdoor', u.outdoor, ['weather', 'sensor'], 'Sin temperatura exterior', false, ['temperature'])}
        ${u.outdoor ? `<button class="chip" style="margin-top:6px" data-a="set" data-o="d" data-k="ui.outdoor" data-v="" data-t="null">Quitar</button>
          ${!heat ? `<div class="inl" style="margin-top:10px"><span class="unit">No enfriar si afuera hay menos de</span>${this._num('d', 'ui.cool_min_out', u.cool_min_out, 'step="0.5"', '°')}</div>` : ''}
          ${heat || season ? `<div class="inl" style="margin-top:10px"><span class="unit">No calentar si afuera hay más de</span>${this._num('d', 'ui.heat_max_out', u.heat_max_out, 'step="0.5"', '°')}</div>` : ''}
          <div class="hint">Dejalo vacío para no usarlo.</div>` : ''}</div>

      ${sec(++n, 'Si alguien lo toca')}
      <div class="field">${this._sw('manual_hold', 'Respetar los cambios a mano hasta el próximo horario', u.manual_hold)}
        <div class="hint">${u.manual_hold ? 'Si alguien sube o baja la temperatura, la automatización no lo pisa; en el próximo horario vuelve a lo programado. Las ventanas abiertas y «no hay nadie» apagan igual.' : 'El horario manda siempre: si alguien lo cambia, en un minuto vuelve a lo programado.'}</div></div>

      ${sec(++n, 'Avisos')}
      <div class="field">${this._sw('notify_window', 'Avisar cuando lo apague por una ventana o porque no hay nadie', u.notify_window)}
        ${u.notify_window ? `<div style="margin-top:10px">${this._recipients('ui.recipients', u.recipients)}</div>` : ''}</div>`;
  }

  _editor_wake(d) {
    const u = d.ui; const h = this._hass;
    const sec = (n, t, s2) => this._num2(null, n, t, s2);
    const cov = u.covers.length > 0;
    const ct = u.lights.some((e) => (h.states[e]?.attributes?.supported_color_modes || []).includes('color_temp'));
    let n = 0;
    return `<div class="today"><div class="mode" style="margin:0"><ha-icon icon="mdi:information-outline"></ha-icon><div><b>Cómo funciona</b><br>
        ${durText(u.ramp)} antes de la hora${u.time_mode === 'phone' ? ' de la alarma del celular' : ''}:
        ${cov && u.natural ? 'si ya hay luz afuera, abre las persianas de a poco y <b>no prende luces</b> (ahorra energía)' + (u.lux ? '; si con las persianas abiertas sigue oscuro, prende las luces' : '') + '. Si todavía es de noche, ' : ''}${u.lights.length ? `las luces suben de a poco del ${u.start_pct}% al ${u.end_pct}%${ct ? `, de ${u.start_k}K cálido a ${u.end_k}K` : ''}.` : ''}
        ${cov && (!u.natural || u.cover_mode === 'at_time') ? ' Las persianas se abren a la hora.' : ''}${u.climate.length ? ` La calefacción / aire se prende ${durText(u.climate_before)} antes.` : ''}${u.media ? ' A la hora prende la música.' : ''}
        ${u.lights.length ? '<br>Si apagás una luz mientras sube, se corta el amanecer.' : ''}</div></div></div>

      ${sec(++n, 'Cuándo')}
      <div class="field">${this._seg('d', 'ui.time_mode', u.time_mode, [['fixed', '🕗 Hora fija'], ['phone', '📱 Alarma del celular']])}
        ${u.time_mode === 'phone'
          ? `<div class="hint">Usa la próxima alarma del celular (la app de Home Assistant la informa en Android). Si cambiás la alarma, se adapta sola.</div><div style="margin-top:8px">${this._entBtn('d', 'ui.phone', u.phone, ['sensor'], 'Elegir celular', false, null, 'alarm')}</div>`
          : `<div class="lbl" style="margin-top:12px">Hora de despertar</div><input type="time" value="${esc(u.time)}" data-o="d" data-k="ui.time"><div style="margin-top:12px">${this._days('d', 'ui.days', u.days)}</div>`}
        <div class="lbl" style="margin-top:14px">Empezar antes</div>${this._chips('d', 'ui.ramp', u.ramp, [[10, '10 min'], [15, '15 min'], [20, '20 min'], [30, '30 min'], [45, '45 min']])}
        ${has(h, 'person') ? `<div style="margin-top:14px">${this._sw('only_home', 'Sólo si hay alguien en casa', u.only_home)}</div>` : ''}</div>

      ${sec(++n, 'Luces')}
      <div class="field">${this._entBtn('d', 'ui.lights', u.lights, ['light', 'switch'], 'Elegir luces (opcional si hay persianas)', true)}
        ${u.lights.length ? `<div class="lbl" style="margin-top:12px">Intensidad: de</div><div class="inl">${this._num('d', 'ui.start_pct', u.start_pct, 'min="1" max="100"', '%')}<span class="unit">a</span>${this._num('d', 'ui.end_pct', u.end_pct, 'min="1" max="100"', '%')}</div>
          ${ct ? `<div class="lbl" style="margin-top:12px">Tono: de</div><div class="inl">${this._num('d', 'ui.start_k', u.start_k, 'min="2000" max="6500" step="100"', 'K')}<span class="unit">a</span>${this._num('d', 'ui.end_k', u.end_k, 'min="2000" max="6500" step="100"', 'K')}</div><div class="hint">Empieza como un amanecer cálido y termina en blanco.</div>` : ''}` : ''}</div>

      ${sec(++n, 'Persianas', 'Opcional')}
      <div class="field">${this._entBtn('d', 'ui.covers', u.covers, ['cover'], 'Sin persianas', true)}
        ${cov ? `<div style="margin-top:14px">${this._sw('natural', 'Usar la luz natural si ya es de día', u.natural)}</div>
          <div class="hint">Si a esa hora ya hay sol, abre las persianas en lugar de prender las luces.</div>
          <div class="lbl" style="margin-top:12px">Cómo abrirlas</div>${this._seg('d', 'ui.cover_mode', u.cover_mode, [['gradual', 'De a poco'], ['at_time', 'A la hora']])}
          ${u.natural ? `<div class="lbl" style="margin-top:14px">☀️ Sensor de luz (opcional)</div>${this._entBtn('d', 'ui.lux', u.lux, ['sensor'], 'Sin sensor de lux', false, ['illuminance'])}
            ${u.lux ? `<div class="inl" style="margin-top:8px"><span class="unit">Si hay menos de</span>${this._num('d', 'ui.lux_min', u.lux_min, 'min="0"', 'lux')}<span class="unit">prender las luces igual</span></div>` : '<div class="hint">Sin sensor, decide por la altura del sol.</div>'}` : ''}` : ''}</div>

      ${sec(++n, 'Extras', 'Opcional')}
      <div class="field"><div class="lbl">❄️🔥 Aire / calefacción</div>${this._entBtn('d', 'ui.climate', u.climate, ['climate'], 'Sin aire', true)}
        ${u.climate.length ? `<div style="margin-top:8px">${this._seg('d', 'ui.climate_mode', u.climate_mode, [['heat', '🔥 Calor'], ['cool', '❄️ Frío'], ['auto', 'Auto']])}</div>
          <div class="inl" style="margin-top:8px"><span class="unit">a</span>${this._num('d', 'ui.climate_temp', u.climate_temp, 'min="16" max="30" step="0.5"', '°')}<span class="unit">prender</span>${this._num('d', 'ui.climate_before', u.climate_before, 'min="5" max="120"', 'min antes')}</div>` : ''}
        <div class="lbl" style="margin-top:14px">🎵 Música / radio</div>${this._entBtn('d', 'ui.media', u.media, ['media_player'], 'Sin música', false)}
        ${u.media ? `<button class="chip" style="margin-top:6px" data-a="set" data-o="d" data-k="ui.media" data-v="" data-t="null">Quitar</button><div class="inl" style="margin-top:8px"><span class="unit">Volumen</span>${this._num('d', 'ui.volume', u.volume, 'min="1" max="100"', '%')}</div><div class="hint">A la hora de despertar le da «play» a lo último que estaba sonando.</div>` : ''}</div>`;
  }

  _frigateInfo() {
    if (!this._finfo && !this._finfoBusy) {
      this._finfoBusy = true;
      this._ws('frigate_info').then((r) => { this._finfo = r; }).catch(() => { this._finfo = { connected: false, cameras: [], zones: [], labels: [], faces: [], plates: [] }; })
        .finally(() => { this._finfoBusy = false; if (this._ov && ['fdetect', 'fface'].includes(this._ov.draft?.kind)) this._renderOv(); });
    }
    const h = this._hass; const i = this._finfo || { cameras: [], zones: [], labels: [], faces: [], plates: [] };
    const plat = (e) => h.entities?.[e]?.platform === 'frigate';
    const cams = new Set(i.cameras);
    Object.keys(h.states).filter((e) => dom(e) === 'camera' && plat(e)).forEach((e) => cams.add(e.split('.')[1]));
    const zones = new Set(i.zones);
    Object.keys(h.states).filter((e) => dom(e) === 'binary_sensor' && plat(e) && /_person_occupancy$/.test(e)).forEach((e) => {
      const z = e.split('.')[1].replace(/_person_occupancy$/, '');
      if (!cams.has(z) && z !== 'all') zones.add(z);
    });
    const faces = new Set(i.faces);
    Object.keys(h.states).filter((e) => /_last_recognized_face$/.test(e)).forEach((e) => { const v = h.states[e].state; if (v && !['unknown', 'unavailable', 'None', 'none'].includes(v)) faces.add(v); });
    return { ...i, cameras: [...cams].sort(), zones: [...zones].sort(), faces: [...faces].sort(), loaded: !!this._finfo };
  }
  _addTxt(key, ph) {
    const src = `ui._new_${key}`;
    return `<div class="inl" style="margin-top:8px"><input type="text" placeholder="${esc(ph)}" value="${esc(getPath(this._ov.draft, src) || '')}" data-o="d" data-k="${src}" autocomplete="off"><button class="chip" style="flex:none" data-a="addtxt" data-k="ui.${key}" data-src="${src}"><ha-icon icon="mdi:plus"></ha-icon>Agregar</button></div>`;
  }
  _histBox(d, fmt) {
    const hist = (this._rules || []).find((r) => r.id === d.id)?.history || [];
    if (!hist.length) return '';
    return `<div class="field" style="margin-top:10px"><div class="lbl">Últimas</div>${hist.slice(0, 6).map((e) => `<div class="hint" style="margin:3px 0">${fmt(e)}</div>`).join('')}</div>`;
  }

  _editor_fdetect(d) {
    const u = d.ui; const h = this._hass; const fi = this._frigateInfo();
    const sec = (n, t, s2) => this._num2(null, n, t, s2);
    const tts = listOf(h, 'tts');
    const labels = [...new Set([...Object.keys(FLABELS), ...fi.labels, ...u.labels])];
    const zones = [...new Set([...fi.zones, ...u.zones])];
    const cams = [...new Set([...fi.cameras, ...u.cameras])];
    const people = [...new Set([...fi.faces, ...u.people_ok])];
    let n = 0;
    return `<div class="today"><div class="mode" style="margin:0"><ha-icon icon="mdi:information-outline"></ha-icon><div><b>Cómo funciona</b><br>
        Si Frigate detecta ${u.labels.map((l) => (FLABELS[l] || l).toLowerCase()).join(' / ') || '…'} en ${u.zones.length ? `la zona ${u.zones.join(', ')}` : u.cameras.length ? u.cameras.join(', ') : 'cualquier cámara'}${u.when === 'night' ? ', de noche' : u.when === 'hours' ? `, de ${u.from} a ${u.to}` : ''}${u.only_away ? ', sin nadie en casa' : ''}${u.only_armed ? ', con la alarma armada' : ''}${+u.loiter_s ? ` y se queda más de ${u.loiter_s} s` : ''}, te avisa con la foto${u.lights.length && u.lights_auto ? ', prende las luces' : ''}${u.siren && u.siren_auto ? ', hace sonar la sirena' : ''}${u.speakers.length ? ' y lo anuncia en los parlantes' : ''}.
        ${{ ignore: 'A las personas conocidas las ignora.', silent: 'Si es alguien conocido, avisa sin sonido.', alert: 'Avisa aunque sea alguien conocido.' }[u.known]}</div></div></div>
      ${fi.loaded && !fi.connected ? '<div class="note" style="color:#e0832b">No llegan eventos de Frigate por MQTT. Revisá que esté la integración MQTT y que Frigate publique en «frigate/events». Sin eso, esta automatización no detecta.</div>' : ''}
      ${this._histBox(d, (e) => `${esc(FLABELS[e.label] || e.label)} en ${esc(e.zone || e.camera)} · ${whenText(e.at)}${e.face ? ` · ${esc(e.face)}` : ''}`)}

      ${sec(++n, 'Qué detectar')}
      <div class="field">${this._chips('d', 'ui.labels', u.labels, labels.map((l) => [l, FLABELS[l] || l]), true)}
        <div class="lbl" style="margin-top:12px">Seguridad mínima de la detección</div>${this._chips('d', 'ui.min_score', u.min_score, [[0.6, '60%'], [0.7, '70%'], [0.8, '80%'], [0.9, '90%']])}
        <div class="hint">Más alto = menos falsas alarmas (sombras, ramas).</div></div>

      ${sec(++n, 'Dónde')}
      <div class="field"><div class="lbl">Cámaras</div>${cams.length ? this._chips('d', 'ui.cameras', u.cameras, cams.map((c) => [c, c]), true) : '<div class="hint">Todavía no se vio ninguna cámara de Frigate.</div>'}
        <div class="hint">Sin elegir = todas.</div>
        <div class="lbl" style="margin-top:14px">Zonas de Frigate</div>${zones.length ? this._chips('d', 'ui.zones', u.zones, zones.map((z) => [z, z]), true) : ''}
        ${this._addTxt('zones', 'Nombre de la zona (como en Frigate)')}
        <div class="hint">Sin elegir = en cualquier lugar de la imagen. Conviene usar zonas para no avisar por la vereda.</div></div>

      ${sec(++n, 'Cuándo')}
      <div class="field">${this._seg('d', 'ui.when', u.when, [['always', 'Siempre'], ['night', 'De noche'], ['hours', 'Horario']])}
        ${u.when === 'hours' ? `<div class="inl" style="margin-top:10px"><input type="time" value="${esc(u.from)}" data-o="d" data-k="ui.from"><span class="unit">a</span><input type="time" value="${esc(u.to)}" data-o="d" data-k="ui.to"></div>` : ''}
        ${has(h, 'person') ? `<div style="margin-top:14px">${this._sw('only_away', 'Sólo si no hay nadie en casa', u.only_away)}</div>` : ''}
        ${has(h, 'alarm_control_panel') ? `<div class="lbl" style="margin-top:14px">Sólo con la alarma armada (opcional)</div>${this._entBtn('d', 'ui.only_armed', u.only_armed, ['alarm_control_panel'], 'No depende de la alarma')}${u.only_armed ? `<button class="chip" style="margin-top:6px" data-a="set" data-o="d" data-k="ui.only_armed" data-v="" data-t="null">Quitar</button>` : ''}` : ''}
        <div class="lbl" style="margin-top:14px">Merodeo</div>${this._chips('d', 'ui.loiter_s', u.loiter_s, [[0, 'Avisar enseguida'], [10, 'Si se queda 10 s'], [20, '20 s'], [30, '30 s'], [60, '1 min']])}
        <div class="hint">Para no avisar por alguien que sólo pasa caminando.</div></div>

      ${sec(++n, 'Personas conocidas')}
      <div class="field">${this._seg('d', 'ui.known', u.known, [['ignore', 'No avisar'], ['silent', 'Avisar sin sonido'], ['alert', 'Avisar igual']])}
        <div class="lbl" style="margin-top:12px">Quiénes cuentan como conocidos</div>${people.length ? this._chips('d', 'ui.people_ok', u.people_ok, people.map((p) => [p, p]), true) : ''}
        ${this._addTxt('people_ok', 'Nombre como está en Frigate')}
        <div class="hint">Sin elegir = cualquier cara que Frigate reconozca. Usa el reconocimiento facial de Frigate (si no reconoce, el aviso dice «desconocida»).</div></div>

      ${sec(++n, 'Qué hacer')}
      <div class="field">${this._recipients('ui.recipients', u.recipients)}
        <div style="margin-top:12px">${this._sw('critical', 'Aviso urgente (suena aunque esté en silencio)', u.critical)}</div>
        <div class="hint">El aviso trae la foto y botones: Ver clip, Prender luces / Sirena, Silenciar 1 h.</div>
        <div class="lbl" style="margin-top:14px">No repetir avisos de la misma cámara durante</div>${this._chips('d', 'ui.cooldown_min', u.cooldown_min, [[1, '1 min'], [3, '3 min'], [5, '5 min'], [10, '10 min'], [30, '30 min']])}
        <div class="lbl" style="margin-top:14px">💡 Luces (opcional)</div>${this._entBtn('d', 'ui.lights', u.lights, ['light', 'switch'], 'Sin luces', true)}
        ${u.lights.length ? `<div style="margin-top:8px">${this._sw('lights_auto', 'Prenderlas solas al detectar', u.lights_auto)}</div><div style="margin-top:8px">${this._sw('lights_dark', 'Sólo de noche', u.lights_dark)}</div>
          <div style="margin-top:8px">${this._chips('d', 'ui.light_min', u.light_min, [[2, '2 min'], [5, '5 min'], [10, '10 min'], [15, '15 min']])}</div>` : ''}
        <div class="lbl" style="margin-top:14px">🚨 Sirena (opcional)</div>${this._entBtn('d', 'ui.siren', u.siren, ['siren', 'switch'], 'Sin sirena')}
        ${u.siren ? `<button class="chip" style="margin-top:6px" data-a="set" data-o="d" data-k="ui.siren" data-v="" data-t="null">Quitar</button>
          <div style="margin-top:8px">${this._sw('siren_auto', 'Hacerla sonar sola (si no, botón en el aviso)', u.siren_auto)}</div>
          <div style="margin-top:8px">${this._chips('d', 'ui.siren_s', u.siren_s, [[10, '10 s'], [30, '30 s'], [60, '1 min'], [180, '3 min']])}</div>` : ''}
        <div class="lbl" style="margin-top:14px">🔊 Anunciar en parlantes (opcional)</div>${this._entBtn('d', 'ui.speakers', u.speakers, ['media_player'], 'Sin parlantes', true)}
        ${u.speakers.length && tts.length ? `<div style="margin-top:8px">${this._chips('d', 'ui.tts', u.tts, tts.map((e) => [e, fname(h, e)]))}</div><input type="text" style="margin-top:8px" value="${esc(u.message)}" data-o="d" data-k="ui.message" placeholder="Atención: persona en el patio">` : ''}</div>`;
  }

  _editor_fface(d) {
    const u = d.ui; const h = this._hass; const fi = this._frigateInfo();
    const sec = (n, t, s2) => this._num2(null, n, t, s2);
    const tts = listOf(h, 'tts');
    const people = [...new Set([...fi.faces, ...u.people])];
    const zones = [...new Set([...fi.zones, ...u.zones])];
    const cams = [...new Set([...fi.cameras, ...u.cameras])];
    const rules = (this._rules || []).filter((r) => r.id !== d.id && ['scene', 'auto'].includes(r.kind));
    const who = u.any_known ? 'alguien conocido' : [...u.people, ...u.plates.map((p) => `el auto ${p.split('=')[0].trim()}`)].join(', ') || '…';
    const does = [u.notify ? 'te avisa' : '', u.unlock ? (u.unlock_mode === 'auto' ? `abre (${u.unlock_name})` : `te ofrece un botón «${u.unlock_name}»`) : '', u.disarm ? 'desarma la alarma' : '', u.lights.length ? `prende luces${u.lights_dark ? ' si es de noche' : ''}` : '', u.speakers.length ? 'le da la bienvenida por el parlante' : '', u.rules_run.length ? 'ejecuta escenas' : ''].filter(Boolean);
    let n = 0;
    return `<div class="today"><div class="mode" style="margin:0"><ha-icon icon="mdi:information-outline"></ha-icon><div><b>Cómo funciona</b><br>
        Cuando una cámara reconoce a ${esc(who)}${u.when === 'hours' ? ` (de ${u.from} a ${u.to})` : ''}: ${does.join(', ') || '…'}. No se repite por la misma persona durante ${durText(u.cooldown_min)}. Queda el registro de quién llegó y a qué hora.</div></div></div>
      ${fi.loaded && !fi.connected ? '<div class="hint" style="color:#e0832b;margin:8px 4px">No llegan eventos de Frigate por MQTT: se usarán sólo los sensores «último rostro reconocido» (sin patentes ni foto).</div>' : ''}
      ${this._histBox(d, (e) => `${e.kind === 'plate' ? '🚗' : '👤'} ${esc(e.who)} · ${whenText(e.at)}${e.camera ? ` · ${esc(e.camera)}` : ''}${e.opened ? ' · 🔓' : ''}`)}

      ${sec(++n, 'Quién')}
      <div class="field">${this._sw('any_known', 'Cualquier persona conocida', u.any_known)}
        ${u.any_known ? '<div class="hint">Sirve como registro de quién llega (familia, la persona de limpieza, el jardinero…).</div>' : `
          <div class="lbl" style="margin-top:12px">👤 Personas</div>${people.length ? this._chips('d', 'ui.people', u.people, people.map((p) => [p, p]), true) : ''}${this._addTxt('people', 'Nombre como está en Frigate')}
          <div class="lbl" style="margin-top:14px">🚗 Patentes (Frigate 0.16+)</div>
          ${u.plates.length ? `<div class="chips">${u.plates.map((p, i) => `<button class="chip on" data-a="arrdel" data-k="ui.plates" data-i="${i}">${esc(p)} <ha-icon icon="mdi:close"></ha-icon></button>`).join('')}</div>` : ''}
          ${this._addTxt('plates', 'AB123CD = Auto de Juan')}
          <div class="hint">Podés ponerle nombre a la patente: «AB123CD = Auto de Juan».</div>`}</div>

      ${sec(++n, 'Dónde y cuándo')}
      <div class="field"><div class="lbl">Cámaras</div>${cams.length ? this._chips('d', 'ui.cameras', u.cameras, cams.map((c) => [c, c]), true) : ''}<div class="hint">Sin elegir = todas.</div>
        ${zones.length ? `<div class="lbl" style="margin-top:12px">Zonas</div>${this._chips('d', 'ui.zones', u.zones, zones.map((z) => [z, z]), true)}<div class="hint">Por ejemplo sólo «entrada», para no abrir si pasa por la vereda.</div>` : ''}
        <div class="lbl" style="margin-top:14px">Horario</div>${this._seg('d', 'ui.when', u.when, [['always', 'Siempre'], ['hours', 'Entre horas']])}
        ${u.when === 'hours' ? `<div class="inl" style="margin-top:10px"><input type="time" value="${esc(u.from)}" data-o="d" data-k="ui.from"><span class="unit">a</span><input type="time" value="${esc(u.to)}" data-o="d" data-k="ui.to"></div>` : ''}
        <div class="lbl" style="margin-top:14px">No repetir por la misma persona durante</div>${this._chips('d', 'ui.cooldown_min', u.cooldown_min, [[5, '5 min'], [15, '15 min'], [30, '30 min'], [60, '1 h'], [240, '4 h']])}</div>

      ${sec(++n, 'Qué hacer')}
      <div class="field">${this._sw('notify', '📲 Avisar quién llegó', u.notify)}
        ${u.notify ? `<div style="margin-top:8px">${this._recipients('ui.recipients', u.recipients)}</div><input type="text" style="margin-top:8px" value="${esc(u.message)}" data-o="d" data-k="ui.message" placeholder="Llegó {nombre}">
          <div style="margin-top:8px">${this._sw('silent', 'Sin sonido (sólo registro)', u.silent)}</div>` : ''}
        <div class="lbl" style="margin-top:14px">🔓 Abrir (opcional)</div>${this._entBtn('d', 'ui.unlock', u.unlock, ['lock', 'button', 'input_button', 'switch', 'script', 'cover'], 'No abrir')}
        ${u.unlock ? `<button class="chip" style="margin-top:6px" data-a="set" data-o="d" data-k="ui.unlock" data-v="" data-t="null">Quitar</button>
          <div style="margin-top:8px">${this._seg('d', 'ui.unlock_mode', u.unlock_mode, [['ask', 'Preguntar con un botón'], ['auto', 'Abrir solo']])}</div>
          <div class="hint">${u.unlock_mode === 'auto' ? '⚠ Abre sin preguntar: usalo sólo con zonas cercanas a la puerta y con caras bien entrenadas. Lo más seguro es «Preguntar».' : 'Llega el aviso con un botón para abrir.'}</div>
          <input type="text" style="margin-top:8px" value="${esc(u.unlock_name)}" data-o="d" data-k="ui.unlock_name" placeholder="Nombre del botón">
          ${dom(u.unlock) === 'lock' ? `<input type="text" inputmode="numeric" style="margin-top:8px" value="${esc(u.code)}" data-o="d" data-k="ui.code" placeholder="Código (si lo pide)">` : ''}` : ''}
        ${has(h, 'alarm_control_panel') ? `<div style="margin-top:14px">${this._sw('disarm', '🛡 Desarmar la alarma', u.disarm)}</div>${u.disarm ? `<div style="margin-top:8px">${this._entBtn('d', 'ui.alarm', u.alarm, ['alarm_control_panel'], 'Elegir alarma')}</div>${u.unlock && dom(u.unlock) === 'lock' ? '' : `<input type="text" inputmode="numeric" style="margin-top:8px" value="${esc(u.code)}" data-o="d" data-k="ui.code" placeholder="Código (si lo pide)">`}` : ''}` : ''}
        <div class="lbl" style="margin-top:14px">💡 Luces (opcional)</div>${this._entBtn('d', 'ui.lights', u.lights, ['light', 'switch'], 'Sin luces', true)}
        ${u.lights.length ? `<div style="margin-top:8px">${this._sw('lights_dark', 'Sólo de noche', u.lights_dark)}</div>` : ''}
        <div class="lbl" style="margin-top:14px">🔊 Bienvenida por parlante (opcional)</div>${this._entBtn('d', 'ui.speakers', u.speakers, ['media_player'], 'Sin parlantes', true)}
        ${u.speakers.length && tts.length ? `<div style="margin-top:8px">${this._chips('d', 'ui.tts', u.tts, tts.map((e) => [e, fname(h, e)]))}</div><input type="text" style="margin-top:8px" value="${esc(u.welcome)}" data-o="d" data-k="ui.welcome" placeholder="Bienvenido, {nombre}">` : ''}
        ${rules.length ? `<div class="lbl" style="margin-top:14px">▶ Ejecutar (opcional)</div>${this._chips('d', 'ui.rules_run', u.rules_run, rules.map((r) => [r.id, r.name, r.icon]), true)}` : ''}</div>`;
  }

  _editor_tv(d) {
    const u = d.ui; const h = this._hass;
    u.cine_cfg ||= {}; u.empty_motion ||= []; u.empty_doors ||= [];
    const sec = (n, t, s2) => this._num2(null, n, t, s2);
    const now = u.tv ? h.states[u.tv] : null;
    const curApp = now ? (now.attributes.app_name || now.attributes.source || '') : '';
    const apps = [...new Set([...TV_APPS, ...u.cine_apps, ...(curApp && !/launcher|home/i.test(curApp) ? [curApp] : [])])];
    const scenes = [...(this._rules || []).filter((r) => r.kind === 'scene').map((r) => [r.id, r.name]), ...listOf(h, 'scene').map((e) => [e, fname(h, e)])];
    const live = (this._rules || []).find((r) => r.id === d.id);
    const mode = u.cine_mode || 'auto';
    const auto = mode !== 'manual', manual = mode !== 'auto';
    const occ = u.presence.length || u.empty_motion.length;
    const howCine = [auto ? `al darle play${u.cine_apps.length ? ` en ${u.cine_apps.join(', ')}` : ''}${u.cine_dark ? ' (sólo de noche)' : ''}` : '', manual ? 'con un toque en la tarjeta «Modo cine» de Escenas' + (u.cine_switch ? ' o diciéndole a Alexa' : '') : ''].filter(Boolean).join(' o ');
    const parts = [
      u.cine ? `🎬 <b>Modo cine</b> se activa ${howCine}: pone cada luz como la configuraste${u.cine_covers.length ? ', cierra las persianas' : ''}. En pausa suben al ${u.pause_pct}%. Al terminar ${u.restore ? 'cada luz vuelve a como estaba' : 'no toca nada'}.` : '',
      u.companions.length ? '🔊 Prende y apaga con la tele los equipos elegidos.' : '',
      occ ? `🚶 Si no hay nadie durante ${durText(u.empty_min)}${u.empty_pause ? `, pausa y, si nadie vuelve en ${durText(u.empty_wait)}, la apaga` : ', la apaga'}.` : '',
      u.bedtime ? `🧒 A las ${u.bed_at} (${daysText(u.bed_days)}) la apaga${u.bed_block ? ` y no deja prenderla hasta las ${u.bed_until}` : ''}.` : '',
      u.night_vol ? `🔉 De ${u.vol_from} a ${u.vol_to}, volumen máximo ${u.vol_max}%.` : '',
      u.pause_on.length ? '🔔 Pausa sola cuando tocan el timbre o pasa lo que elegiste.' : '',
    ].filter(Boolean);
    // cada luz del modo cine: intensidad y color
    const lightRows = u.cine_lights.map((e) => {
      const key = mkey(e); const c = u.cine_cfg[key] || {};
      const pct = c.pct ?? u.cine_pct ?? 10; const lmode = c.mode || 'keep';
      const modes = h.states[e]?.attributes?.supported_color_modes || [];
      const hasColor = modes.some((m) => ['hs', 'xy', 'rgb', 'rgbw', 'rgbww'].includes(m)); const hasCt = modes.includes('color_temp');
      const isLight = dom(e) === 'light';
      return `<div style="padding:10px 0;border-top:1px solid var(--mae-line)">
        <div style="font-weight:600;display:flex;align-items:center;gap:8px"><ha-icon icon="${entIcon(h, e)}" style="color:var(--mae-sub)"></ha-icon>${esc(fname(h, e))}</div>
        ${isLight ? `<div class="lbl" style="margin-top:8px">Intensidad <span class="rangev" data-show="cfg_${key}">${pct}%</span></div>
          <input type="range" min="0" max="100" step="1" value="${pct}" data-o="d" data-k="ui.cine_cfg.${key}.pct" data-t="num" data-live="cfg_${key}">
          <div class="hint" style="margin-top:2px">0% = apagada</div>
          ${hasColor || hasCt ? `<div style="margin-top:8px">${this._seg('d', `ui.cine_cfg.${key}.mode`, lmode, [['keep', 'Color como esté'], ...(hasColor ? [['color', 'Color']] : []), ...(hasCt ? [['white', 'Blanco']] : [])])}</div>` : ''}
          ${lmode === 'color' ? `<div class="inl" style="margin-top:8px"><span class="unit">Elegí el color</span><input type="color" value="${esc(c.rgb || '#ff7a1a')}" data-o="d" data-k="ui.cine_cfg.${key}.rgb"></div>` : ''}
          ${lmode === 'white' ? `<div class="lbl" style="margin-top:8px">Tono <span class="rangev" data-show="k_${key}">${c.k || 2700}K</span></div><input type="range" min="2000" max="6500" step="100" value="${c.k || 2700}" data-o="d" data-k="ui.cine_cfg.${key}.k" data-t="num" data-live="k_${key}"><div class="hint" style="margin-top:2px">Cálido ← → frío</div>` : ''}`
          : `<div style="margin-top:8px">${this._seg('d', `ui.cine_cfg.${key}.pct`, pct > 0 ? 100 : 0, [[100, 'Prender'], [0, 'Apagar']])}</div>`}
      </div>`;
    }).join('');
    let n = 0;
    return `<div class="today"><div class="mode" style="margin:0"><ha-icon icon="mdi:information-outline"></ha-icon><div><b>Cómo funciona</b><br>${parts.join('<br>') || 'Activá las funciones que quieras.'}</div></div>
      ${live?.tv_status ? `<div class="mode" style="margin-top:10px"><ha-icon icon="mdi:history"></ha-icon><div><b>Última vez:</b> ${esc(live.tv_status)}</div></div>` : ''}</div>

      ${sec(++n, 'Tele')}
      <div class="field">${this._entBtn('d', 'ui.tv', u.tv, ['media_player'], 'Elegir la tele')}
        ${now ? `<div class="hint">Ahora: ${esc(now.state)}${curApp ? ` · ${esc(curApp)}` : ''}</div>` : '<div class="hint">Fire TV o Android TV integrada por ADB (Android Debug Bridge) o cualquier reproductor.</div>'}</div>

      ${sec(++n, '🎬 Modo cine')}
      <div class="field">${this._sw('cine', 'Usar el modo cine', u.cine)}
        ${u.cine ? `
          <div class="lbl" style="margin-top:14px">¿Cómo se activa?</div>
          ${this._seg('d', 'ui.cine_mode', mode, [['auto', 'Al darle play'], ['manual', 'Con un toque'], ['both', 'Las dos']])}
          <div class="hint">${{ auto: 'Se activa solo cuando la tele empieza a reproducir, y termina cuando dejás de mirar.', manual: 'Aparece como una tarjeta «Modo cine» en la pestaña Escenas: un toque lo activa y otro lo termina (también termina si apagás la tele).', both: 'Se activa solo al darle play, y además podés activarlo o terminarlo con la tarjeta «Modo cine» de la pestaña Escenas.' }[mode]}</div>
          ${auto ? `<div class="lbl" style="margin-top:14px">Activarlo al reproducir en estas apps</div>${this._chips('d', 'ui.cine_apps', u.cine_apps, apps.map((a) => [a, a]), true)}${this._addTxt('cine_apps', 'Otra app (como la muestra la tele)')}
            <div class="hint">Sin elegir = cualquier app.</div>
            <div style="margin-top:12px">${this._sw('cine_dark', 'Sólo de noche', u.cine_dark)}</div>` : ''}

          <div class="lbl" style="margin-top:16px">💡 Luces y cómo quedan</div>${this._entBtn('d', 'ui.cine_lights', u.cine_lights, ['light', 'switch'], 'Elegir luces', true)}
          ${lightRows ? `<div style="margin-top:6px">${lightRows}</div>` : ''}
          ${u.cine_lights.length ? `<div class="lbl" style="margin-top:12px">En pausa, subir las prendidas al</div>${this._chips('d', 'ui.pause_pct', u.pause_pct, [[20, '20%'], [30, '30%'], [50, '50%'], [80, '80%']])}` : ''}
          ${has(h, 'cover') ? `<div class="lbl" style="margin-top:14px">🪟 Cerrar persianas (opcional)</div>${this._entBtn('d', 'ui.cine_covers', u.cine_covers, ['cover'], 'Sin persianas', true)}` : ''}

          <div style="margin-top:14px">${this._sw('restore', 'Al terminar, cada luz vuelve a como estaba', u.restore)}</div>
          ${u.restore && auto ? `<div class="lbl" style="margin-top:10px">Esperar antes de volver</div>${this._chips('d', 'ui.restore_delay', u.restore_delay, [[5, '5 s'], [10, '10 s'], [30, '30 s'], [60, '1 min']])}<div class="hint">Así no prende las luces entre un capítulo y el siguiente.</div>` : ''}

          <div style="margin-top:14px">${this._sw('cine_switch', '🗣 Interruptor para Alexa / Google (Matter)', u.cine_switch)}</div>
          ${u.cine_switch ? `<input type="text" style="margin-top:8px" value="${esc(u.cine_switch_name || 'Modo cine')}" data-o="d" data-k="ui.cine_switch_name" placeholder="Modo cine">
            <div class="hint">Crea el interruptor «${esc(u.cine_switch_name || 'Modo cine')}»: «Alexa, prendé ${esc((u.cine_switch_name || 'modo cine').toLowerCase())}» lo activa y «apagá» lo termina. Exponelo con «Home Assistant Matter Hub».</div>` : ''}

          ${scenes.length ? `<div class="lbl" style="margin-top:16px">Además, activar otra escena tuya (opcional)</div>${this._chips('d', 'ui.cine_scene', u.cine_scene || '', [['', 'Ninguna'], ...scenes])}
            <div class="hint">Para sumar cosas que no son luces, por ejemplo una escena que prende la barra de sonido o el aire. No hace falta para las luces: ya las configuraste arriba.</div>` : ''}` : ''}</div>

      ${sec(++n, '🔊 Equipos que acompañan a la tele', 'Opcional')}
      <div class="field">${this._entBtn('d', 'ui.companions', u.companions, ['switch', 'light', 'media_player', 'input_boolean'], 'Barra de sonido, receptor, LED de fondo…', true)}
        ${u.companions.length ? `<div class="lbl" style="margin-top:10px">Al apagar la tele, apagarlos después de</div>${this._chips('d', 'ui.companion_delay', u.companion_delay, [[5, '5 s'], [30, '30 s'], [60, '1 min'], [300, '5 min']])}` : ''}</div>

      ${sec(++n, '🚶 Tele prendida sin nadie', 'Opcional · igual que el sensor del baño')}
      <div class="field"><div class="hint" style="margin-top:0">Con <b>movimiento + puerta</b> sabe si hay alguien aunque no se mueva (si se cerró la puerta y hubo movimiento adentro, hay alguien hasta que se abra). Un mmWave solo también alcanza.</div>
        <div class="lbl" style="margin-top:12px">👤 Presencia mmWave</div>${this._entBtn('d', 'ui.presence', u.presence, ['binary_sensor'], 'Sin sensor de presencia', true, ['occupancy', 'presence'])}
        <div class="lbl" style="margin-top:12px">🏃 Movimiento</div>${this._entBtn('d', 'ui.empty_motion', u.empty_motion, ['binary_sensor'], 'Sin sensor de movimiento', true, ['motion', 'occupancy', 'presence'])}
        <div class="lbl" style="margin-top:12px">🚪 Puerta del ambiente</div>${this._entBtn('d', 'ui.empty_doors', u.empty_doors, ['binary_sensor'], 'Sin sensor de puerta', true, ['door', 'opening'])}
        ${occ ? `<div class="lbl" style="margin-top:14px">Si no hay nadie durante</div>${this._chips('d', 'ui.empty_min', u.empty_min, [[10, '10 min'], [20, '20 min'], [30, '30 min'], [60, '1 h']])}
          <div style="margin-top:10px">${this._sw('empty_pause', 'Primero pausar (si alguien vuelve, sigue)', u.empty_pause)}</div>
          ${u.empty_pause ? `<div class="lbl" style="margin-top:10px">Y si nadie vuelve, apagarla a los</div>${this._chips('d', 'ui.empty_wait', u.empty_wait, [[1, '1 min'], [3, '3 min'], [5, '5 min'], [10, '10 min']])}` : ''}` : ''}</div>

      ${sec(++n, '🧒 Hora de dormir', 'Opcional')}
      <div class="field">${this._sw('bedtime', 'Apagar la tele a una hora', u.bedtime)}
        ${u.bedtime ? `<div class="inl" style="margin-top:10px"><span class="unit">A las</span><input type="time" value="${esc(u.bed_at)}" data-o="d" data-k="ui.bed_at"></div>
          <div style="margin-top:10px">${this._days('d', 'ui.bed_days', u.bed_days)}</div><div class="hint">Las noches en que aplica (por ejemplo, domingo a jueves si al otro día hay colegio).</div>
          <div style="margin-top:12px">${this._sw('bed_block', 'Si la vuelven a prender, apagarla otra vez', u.bed_block)}</div>
          ${u.bed_block ? `<div class="inl" style="margin-top:8px"><span class="unit">hasta las</span><input type="time" value="${esc(u.bed_until)}" data-o="d" data-k="ui.bed_until"></div>` : ''}` : ''}</div>

      ${sec(++n, '🔉 Volumen de noche', 'Opcional')}
      <div class="field">${this._sw('night_vol', 'Limitar el volumen en un horario', u.night_vol)}
        ${u.night_vol ? `<div class="inl" style="margin-top:10px"><input type="time" value="${esc(u.vol_from)}" data-o="d" data-k="ui.vol_from"><span class="unit">a</span><input type="time" value="${esc(u.vol_to)}" data-o="d" data-k="ui.vol_to"></div>
          <div class="lbl" style="margin-top:10px">Máximo</div>${this._chips('d', 'ui.vol_max', u.vol_max, [[15, '15%'], [25, '25%'], [35, '35%'], [50, '50%']])}
          <div class="hint">Depende de que la tele informe el volumen por ADB (en algunos modelos no lo hace).</div>` : ''}</div>

      ${sec(++n, '🔔 Pausar cuando pasa algo', 'Opcional')}
      <div class="field">${this._entBtn('d', 'ui.pause_on', u.pause_on, ['binary_sensor', 'sensor', 'event', 'alarm_control_panel'], 'Timbre / portero, alarma, sensor de puerta…', true)}
        <div class="hint">Pausa lo que se está viendo cuando tocan el timbre, se dispara la alarma, etc.</div></div>`;
  }

  _editor_gate(d) {
    const u = d.ui; const h = this._hass;
    const sec = (n, t, s2) => this._num2(null, n, t, s2);
    const live = (this._rules || []).find((r) => r.id === d.id);
    const RELAYS = ['switch', 'button', 'input_button', 'script', 'light', 'input_boolean', 'lock'];
    const sensorNow = (e) => (e && h.states[e] ? `Ahora marca: <b>${esc(h.states[e].state === 'on' ? 'encendido / abierto' : h.states[e].state === 'off' ? 'apagado / cerrado' : h.states[e].state)}</b>` : '');
    const isSwitch = (e) => e && ['switch', 'light', 'input_boolean'].includes(dom(e));
    const travel = +u.travel_s || live?.gate_learned || 0;
    let n = 0;
    return `<div class="today"><div class="mode" style="margin:0"><ha-icon icon="mdi:information-outline"></ha-icon><div><b>Cómo funciona</b><br>
        Crea el portón «${esc(d.name || 'Portón')}» con su estado real: <b>Abierto, Abriendo, Cerrando y Cerrado</b>. Al tocar «Cerrar» mide cuánto tarda hasta que el sensor marca cerrado, y usa ese tiempo para mostrar «Abriendo».<br>
        🛡 «Cerrar» no manda el pulso mientras abre (lo frenaría); «Abrir» sí, mientras cierra, para revertirlo. Si lo abren con el control remoto también lo muestra.</div></div>
      ${live ? `<div class="mode" style="margin-top:10px"><ha-icon icon="mdi:history"></ha-icon><div><b>Ahora:</b> ${esc(ruleSummary(h, live, this._rules) || '—')}${live.gate_status ? `<br><b>Último:</b> ${esc(live.gate_status)}` : ''}</div></div>` : ''}</div>

      ${sec(++n, 'Motor')}
      <div class="field">${this._seg('d', 'ui.relays', u.relays, [['one', 'Un pulso abre y cierra'], ['two', 'Relé de abrir y de cerrar']])}
        ${u.relays === 'two' ? `<div class="lbl" style="margin-top:12px">Relé de abrir</div>${this._entBtn('d', 'ui.open_relay', u.open_relay, RELAYS, 'Elegir')}
          <div class="lbl" style="margin-top:12px">Relé de cerrar</div>${this._entBtn('d', 'ui.close_relay', u.close_relay, RELAYS, 'Elegir')}`
        : `<div class="lbl" style="margin-top:12px">Relé o botón que da el pulso</div>${this._entBtn('d', 'ui.relay', u.relay, RELAYS, 'Elegir (Shelly, Sonoff, botón…)')}`}
        ${[u.relay, u.open_relay, u.close_relay].some(isSwitch) ? `<div class="lbl" style="margin-top:12px">Después del pulso</div>${this._chips('d', 'ui.pulse_s', u.pulse_s, [[0, 'El relé se apaga solo'], [1, 'Apagarlo a 1 s'], [2, 'Apagarlo a 2 s']])}
          <div class="hint">Si en el Shelly configuraste el apagado automático, dejá «se apaga solo».</div>` : ''}
        <div class="lbl" style="margin-top:12px">Tipo</div>${this._seg('d', 'ui.gate_type', u.gate_type, [['gate', 'Portón'], ['garage', 'Puerta de garage']])}</div>

      ${sec(++n, 'Sensores')}
      <div class="field"><div class="lbl" style="margin-top:0">Sensor de cerrado</div>${this._entBtn('d', 'ui.closed_sensor', u.closed_sensor, ['binary_sensor'], 'Elegir el sensor')}
        ${u.closed_sensor ? `<div class="lbl" style="margin-top:10px">Con el portón cerrado, el sensor marca</div>${this._seg('d', 'ui.closed_when', u.closed_when, [['off', 'Apagado / Cerrado'], ['on', 'Encendido / Abierto']])}
          <div class="hint">${sensorNow(u.closed_sensor)}. Cerrá el portón, fijate qué marca y elegí eso.</div>` : ''}
        <div class="lbl" style="margin-top:14px">Sensor de abierto (opcional)</div>${this._entBtn('d', 'ui.open_sensor', u.open_sensor, ['binary_sensor'], 'Sin sensor de abierto')}
        ${u.open_sensor ? `<button class="chip" style="margin-top:6px" data-a="set" data-o="d" data-k="ui.open_sensor" data-v="" data-t="null">Quitar</button>
          <div class="lbl" style="margin-top:10px">Con el portón abierto del todo, marca</div>${this._seg('d', 'ui.open_when', u.open_when, [['on', 'Encendido'], ['off', 'Apagado']])}
          <div class="hint">${sensorNow(u.open_sensor)}. Con este sensor sabe exacto cuándo terminó de abrir.</div>` : '<div class="hint">Si el portón tiene un fin de carrera de abierto, ponelo: «Abriendo» termina justo cuando llega.</div>'}</div>

      ${sec(++n, 'Tiempo de recorrido')}
      <div class="field">${this._chips('d', 'ui.travel_s', +u.travel_s || 0, [[0, 'Aprenderlo solo'], [10, '10 s'], [15, '15 s'], [20, '20 s'], [30, '30 s'], [45, '45 s'], [60, '1 min']])}
        <div class="hint">${+u.travel_s ? `Usa ${u.travel_s} s fijos.` : travel ? `Aprendido: tarda <b>${travel} s</b>. Se ajusta solo con cada cierre.` : 'Todavía no lo aprendió: abrilo y cerralo una vez desde la tarjeta.'}</div></div>

      ${sec(++n, 'Avisos', 'Opcional')}
      <div class="field"><div class="lbl" style="margin-top:0">Avisar si queda abierto más de</div>${this._chips('d', 'ui.open_alert_min', +u.open_alert_min || 0, [[0, 'No avisar'], [5, '5 min'], [10, '10 min'], [15, '15 min'], [30, '30 min'], [60, '1 h']])}
        <div class="hint">El aviso trae un botón «Cerrar» y se repite mientras siga abierto.</div>
        <div style="margin-top:12px">${this._sw('night_close', '🌙 Si quedó abierto de noche, cerrarlo solo', u.night_close)}</div>
        ${u.night_close ? `<div class="inl" style="margin-top:8px"><span class="unit">a las</span><input type="time" value="${esc(u.night_at)}" data-o="d" data-k="ui.night_at"></div><div class="hint">Avisa cuando lo cierra. Ojo con autos estacionados en el medio: usalo si el portón tiene fotocélula.</div>` : ''}
        ${+u.open_alert_min || u.night_close ? `<div style="margin-top:12px">${this._recipients('ui.recipients', u.recipients)}</div>` : ''}</div>`;
  }

  _editor_guest(d) {
    const u = d.ui; const h = this._hass; const o = this._ov;
    u.cfg ||= {};
    const sec = (n, t, s2) => this._num2(null, n, t, s2);
    const live = (this._rules || []).find((r) => r.id === d.id);
    const invites = live?.invites || [];
    const base = (u.base_url || '').trim().replace(/\/$/, '') || live?.guest_base;
    const lbl = (e) => u.cfg[mkey(e)]?.label || fname(h, e);
    const devRows = u.devices.map((e) => {
      const key = mkey(e); const c = u.cfg[key] || {}; const dm = dom(e);
      const canClose = ['cover', 'lock', 'switch', 'light', 'input_boolean'].includes(dm);
      const closeOn = c.close ?? dm === 'cover';
      return `<div style="padding:10px 0;border-top:1px solid var(--mae-line)">
        <div style="font-weight:600;display:flex;align-items:center;gap:8px"><ha-icon icon="${entIcon(h, e)}" style="color:var(--mae-sub)"></ha-icon>${esc(fname(h, e))}</div>
        <div class="lbl" style="margin-top:8px">Cómo lo ve el invitado</div><input type="text" value="${esc(c.label || '')}" placeholder="${esc(fname(h, e))}" data-o="d" data-k="ui.cfg.${key}.label" maxlength="40">
        ${canClose ? `<div class="opt" style="margin:10px 0 0"><button class="sw ${closeOn ? 'on' : ''}" data-a="set" data-o="d" data-k="ui.cfg.${key}.close" data-v="${closeOn ? '' : '1'}" data-t="bool"></button><div style="font-weight:600">${dm === 'lock' ? 'También puede cerrar con llave' : dm === 'cover' ? 'También puede cerrar' : 'También puede apagar'}</div></div>` : ''}
      </div>`;
    }).join('');
    const invRows = invites.map((i) => {
      const [st, txt] = invState(i);
      const ok = st === 'ok' || st === 'early';
      return `<div class="row ${ok ? '' : 'off'}" style="margin:0 0 8px">
        <div class="ic" style="background:${ok ? '#3DBE8B' : '#9aa3b0'}"><ha-icon icon="${st === 'paused' ? 'mdi:account-cancel' : 'mdi:account-key'}"></ha-icon></div>
        <button class="tx" style="text-align:left" data-a="invedit" data-v="${i.id}"><div class="t1">${esc(i.name)} <span class="badge" ${ok ? '' : 'style="background:var(--mae-bg);color:var(--mae-sub)"'}>${esc(txt)}</span></div>
          <div class="t2">${esc([invRules(i), (i.devices || []).length < u.devices.length ? (i.devices || []).map(lbl).join(', ') : '', i.last_used ? `usó ${whenText(i.last_used)}` : ''].filter(Boolean).join(' · ') || 'Tocá para ver o cambiar')}</div></button>
        ${ok && base ? `<button class="rbtn" data-a="invshare" data-v="${i.id}" title="Compartir"><ha-icon icon="mdi:share-variant"></ha-icon></button>` : ''}
      </div>`;
    }).join('');
    const hist = (live?.history || []).slice(0, 8).map((x) => `<div class="hint" style="margin:4px 0">${x.action === 'denied' ? '⛔' : x.action === 'close' ? '🔒' : '🔓'} ${whenText(x.at)} · ${esc(x.action === 'denied' ? (x.text || `${x.who}: rechazado`) : `${x.who} ${x.action === 'close' ? 'cerró' : 'abrió'} ${x.device}`)}</div>`).join('');
    const canInvite = d.id && live && !o.dirty;
    let n = 0;
    return `<div class="today"><div class="mode" style="margin:0"><ha-icon icon="mdi:information-outline"></ha-icon><div><b>Cómo funciona</b><br>
        Creás una invitación para cada persona y le mandás el link por WhatsApp. Al abrirlo ve un botón para ${u.devices.length ? u.devices.map((e) => `«${esc(lbl(e))}»`).join(', ') : 'lo que elijas'}, y sólo funciona en el tiempo que le diste.
        ${u.notify_use ? 'Cada vez que alguien abre te llega un aviso (con un botón para bloquearlo).' : ''} Abrir el link no hace nada solo: hay que tocar el botón.</div></div></div>

      ${sec(++n, '🚪 Qué pueden abrir')}
      <div class="field">${this._entBtn('d', 'ui.devices', u.devices, ['cover', 'lock', 'switch', 'button', 'input_button', 'input_boolean', 'script', 'light'], 'Portón, cerradura, relé…', true)}
        ${devRows ? `<div style="margin-top:6px">${devRows}</div>` : ''}
        ${u.devices.some((e) => dom(e) === 'cover') ? '<div class="hint">Portones: «Abrir» no hace nada si ya está abierto (y «Cerrar» si ya está cerrado), así un pulso de más no lo cierra con el auto pasando.</div>' : ''}
        ${u.devices.some((e) => dom(e) === 'lock') ? `<div class="lbl" style="margin-top:12px">Código de la cerradura (si lo pide)</div><input type="text" inputmode="numeric" value="${esc(u.code)}" data-o="d" data-k="ui.code" autocomplete="off">` : ''}</div>

      ${sec(++n, '🎟 Invitaciones')}
      <div class="field">${!d.id || !live ? '<div class="hint" style="margin-top:0">Guardá primero y después creás las invitaciones.</div>'
        : o.dirty ? '<div class="hint" style="margin-top:0">Guardá los cambios para crear invitaciones.</div>'
        : `${invRows || '<div class="hint" style="margin-top:0">Todavía no hay invitaciones.</div>'}
          <button class="btn sec2" style="margin-top:8px" data-a="invnew" ${canInvite ? '' : 'disabled'}><ha-icon icon="mdi:account-plus"></ha-icon> Nueva invitación</button>
          ${!base ? '<div class="note">⚠ Home Assistant no tiene una dirección para entrar desde afuera (Ajustes → Sistema → Red, o Nabu Casa). Sin eso el link no funciona fuera de tu casa. También la podés escribir abajo, en «Página del invitado».</div>' : ''}`}</div>

      ${sec(++n, '🔔 Avisos')}
      <div class="field">${this._recipients('ui.recipients', u.recipients)}
        <div style="margin-top:12px">${this._sw('notify_use', 'Avisarme cuando un invitado abre', u.notify_use)}</div>
        <div style="margin-top:10px">${this._sw('notify_denied', 'Avisarme si alguien prueba fuera de su horario o con un link vencido', u.notify_denied)}</div></div>

      ${sec(++n, '📱 Página del invitado', 'Opcional')}
      <div class="field"><div class="lbl" style="margin-top:0">Título</div><input type="text" value="${esc(u.title)}" data-o="d" data-k="ui.title" placeholder="${esc(d.name || 'Casa')}" maxlength="40">
        <div class="lbl" style="margin-top:12px">Mensaje de bienvenida</div><input type="text" value="${esc(u.welcome)}" data-o="d" data-k="ui.welcome" placeholder="Desde acá podés abrir cuando llegues." maxlength="140">
        <div class="lbl" style="margin-top:12px">Dirección de tu casa desde afuera</div><input type="text" value="${esc(u.base_url)}" data-o="d" data-k="ui.base_url" placeholder="${esc(live?.guest_base || 'https://micasa.duckdns.org')}" autocomplete="off" inputmode="url">
        <div class="hint">Vacío = la que tiene configurada Home Assistant${live?.guest_base ? ` (${esc(live.guest_base)})` : ''}.</div></div>
      ${hist ? `${sec(++n, '🕘 Últimos movimientos')}<div class="field">${hist}</div>` : ''}`;
  }

  _inviteSheet(s) {
    const x = s.data; const d = this._ov.draft; const h = this._hass;
    const devs = d.ui.devices || [];
    const lbl = (e) => d.ui.cfg?.[mkey(e)]?.label || fname(h, e);
    const [a, b] = invWindow(x);
    const fmt = (t) => t ? `${DIAS_L[t.getDay()]} ${t.getDate()}/${t.getMonth() + 1} ${pad(t.getHours())}:${pad(t.getMinutes())}` : '';
    const body = `<div class="field" style="margin-top:0"><div class="lbl" style="margin-top:0">Nombre del invitado</div><input type="text" value="${esc(x.name)}" data-o="s" data-k="name" placeholder="Juan, la señora de limpieza, el paseador…" maxlength="40" autocomplete="off"></div>
      <div class="field"><div class="lbl">¿Por cuánto tiempo?</div>${this._chips('s', 'preset', x.preset, INV_PRESETS)}
        ${x.preset === 'custom' ? `<div class="lbl" style="margin-top:12px">Desde</div><input type="datetime-local" value="${esc(x.from)}" data-o="s" data-k="from">
          <div class="lbl" style="margin-top:10px">Hasta</div><input type="datetime-local" value="${esc(x.until)}" data-o="s" data-k="until">` : ''}
        <div class="hint">${x.preset === 'never' ? 'No vence: sirve para alguien que viene seguido (combinalo con días y horario).' : x.preset === 'custom' ? 'Elegí cuándo empieza y cuándo termina.' : `Desde ahora hasta el ${fmt(b)}.`}</div></div>
      <div class="field"><div class="opt" style="margin:0"><button class="sw ${x.weekly ? 'on' : ''}" data-a="set" data-o="s" data-k="weekly" data-v="${x.weekly ? '' : '1'}" data-t="bool"></button><div style="font-weight:600">Sólo algunos días</div></div>
        ${x.weekly ? `<div style="margin-top:10px">${this._days('s', 'days', x.days)}</div>` : ''}
        <div class="opt" style="margin:12px 0 0"><button class="sw ${x.hours ? 'on' : ''}" data-a="set" data-o="s" data-k="hours" data-v="${x.hours ? '' : '1'}" data-t="bool"></button><div style="font-weight:600">Sólo en un horario</div></div>
        ${x.hours ? `<div class="inl" style="margin-top:10px"><span class="unit">de</span><input type="time" value="${esc(x.h_from)}" data-o="s" data-k="h_from"><span class="unit">a</span><input type="time" value="${esc(x.h_to)}" data-o="s" data-k="h_to"></div>` : ''}
        <div class="hint">Ej: la señora de limpieza martes y jueves de 8 a 13.</div></div>
      <div class="field"><div class="lbl">¿Cuántas veces puede abrir?</div>${this._chips('s', 'max_uses', x.max_uses, [[0, 'Sin límite'], [1, '1 vez'], [2, '2 veces'], [5, '5 veces'], [10, '10 veces']])}
        ${x.id && x.uses ? `<div class="hint">Ya usó ${x.uses}. <button class="chip" style="margin-left:6px" data-a="set" data-o="s" data-k="reset_uses" data-v="1" data-t="bool">${x.reset_uses ? '✓ Se reinicia al guardar' : 'Reiniciar'}</button></div>` : ''}</div>
      ${devs.length > 1 ? `<div class="field"><div class="lbl">Qué puede abrir</div>${this._chips('s', 'devices', x.devices, devs.map((e) => [e, lbl(e)]), true)}</div>` : ''}
      ${x.id ? `<div class="field"><div class="opt" style="margin:0"><button class="sw ${x.paused ? '' : 'on'}" data-a="set" data-o="s" data-k="paused" data-v="${x.paused ? '' : '1'}" data-t="bool"></button><div style="font-weight:600">Activa</div></div><div class="hint">Pausala para bloquearla sin borrarla.</div></div>
        <div class="chips" style="margin-top:12px">${s.link ? `<button class="chip" data-a="invshare" data-v="${x.id}"><ha-icon icon="mdi:whatsapp"></ha-icon>Compartir</button><button class="chip" data-a="invcopy" data-v="${x.id}"><ha-icon icon="mdi:content-copy"></ha-icon>Copiar link</button>` : ''}<button class="chip" style="color:#e04848" data-a="invdel" data-v="${x.id}"><ha-icon icon="mdi:delete-outline"></ha-icon>Borrar</button></div>` : ''}`;
    const err = !String(x.name || '').trim() ? 'Poné el nombre' : (x.preset === 'custom' && (!x.until || (x.from && x.until <= x.from))) ? 'Revisá las fechas' : (x.weekly && !x.days.length) ? 'Elegí los días' : (x.hours && (!x.h_from || !x.h_to || x.h_from === x.h_to)) ? 'Revisá el horario' : (devs.length > 1 && !x.devices.length) ? 'Elegí qué puede abrir' : '';
    const foot = `<button class="btn pri" style="margin-top:0;${err ? 'opacity:.5' : ''}" data-a="invsave">${err ? esc(err) : x.id ? 'Guardar' : 'Crear y compartir'}</button>`;
    return [x.id ? x.name : 'Nueva invitación', body, foot];
  }

  _invLink(rule, inv) {
    const base = String(rule?.ui?.base_url || '').trim().replace(/\/$/, '') || rule?.guest_base;
    return base && inv?.token ? `${base}${GUEST_PATH}${inv.token}` : null;
  }

  async _invShare(rule, inv) {
    const link = this._invLink(rule, inv);
    if (!link) { this._toast('Falta la dirección de tu casa desde afuera', true); return; }
    const labels = (inv.devices || []).map((e) => rule.ui.cfg?.[mkey(e)]?.label || fname(this._hass, e)).join(' y ');
    const until = inv.until ? `Vale hasta ${whenText(inv.until)}.` : '';
    const rules = [inv.days?.length ? daysText(inv.days) : '', inv.hours ? `de ${inv.h_from} a ${inv.h_to}` : ''].filter(Boolean).join(', ');
    const text = [`¡Hola ${inv.name}! Con este link podés abrir ${labels || 'la entrada'} cuando llegues:`, link, [until, rules ? `Funciona ${rules}.` : ''].filter(Boolean).join(' ')].filter(Boolean).join('\n');
    try {
      if (navigator.share) { await navigator.share({ text }); return; }
    } catch (err) { if (err?.name === 'AbortError') return; }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  }

  _editor_doorbell(d) {
    const u = d.ui; const h = this._hass;
    const sec = (n, t, s2) => this._num2(null, n, t, s2);
    const clear = (k, label) => `<button class="chip" style="margin-top:6px" data-a="set" data-o="d" data-k="ui.${k}" data-v="" data-t="null">${label}</button>`;
    const tts = listOf(h, 'tts');
    let n = 0;
    return `<div class="today"><div class="mode" style="margin:0"><ha-icon icon="mdi:information-outline"></ha-icon><div><b>Cómo funciona</b><br>
        Cuando tocan el timbre llega un aviso ${u.ring_style === 'call' ? '<b>que suena como una llamada</b>' : ''}${u.camera ? ' con la foto' : ''}${u.ring_repeat ? ' (se repite mientras suena)' : ''}, con botones ${[u.unlock ? `«${esc(u.unlock_name)}»` : '', u.unlock2 ? `«${esc(u.unlock2_name)}»` : '', '«Atender»'].filter(Boolean).join(', ')}.
        «Atender» abre la pantalla del portero: video${u.stream ? ', hablar' : ''}, abrir e historial de quién tocó.
        ${u.speakers.length ? 'Además lo anuncia en los parlantes. ' : ''}${u.light ? 'De noche prende la luz de entrada. ' : ''}${u.quiet ? `De ${u.quiet_from} a ${u.quiet_to} no suena fuerte.` : ''}</div></div></div>

      <div class="note" style="margin-top:10px">📘 <b>Hikvision DS-KV6113 y similares:</b> instalá el add-on «Hikvision Doorbell» (crea el estado de la llamada y los botones para abrir) y la cámara por RTSP. Para hablar: go2rtc con <code>rtsp://…/Streaming/Channels/101</code> + <code>isapi://usuario:clave@IP:80/</code> y la tarjeta «WebRTC Camera».</div>

      ${sec(++n, 'Timbre')}
      <div class="field">${this._entBtn('d', 'ui.ring', u.ring, ['binary_sensor', 'sensor', 'event'], 'Elegir el sensor del timbre')}
        <div class="hint">El estado de la llamada del portero (por ej. «ringing»), un sensor de timbre o una entidad «event».</div>
        ${u.ring && dom(u.ring) === 'sensor' ? `<div class="lbl" style="margin-top:10px">Estados que significan «tocaron» (opcional)</div><input type="text" value="${esc(Array.isArray(u.ring_states) ? u.ring_states.join(', ') : u.ring_states)}" data-o="d" data-k="ui.ring_states" placeholder="ringing, calling (vacío = automático)"><div class="hint">Ahora está en: ${esc(h.states[u.ring]?.state || '—')}</div>` : ''}</div>

      ${sec(++n, 'Cámara', 'Opcional')}
      <div class="field">${this._entBtn('d', 'ui.camera', u.camera, ['camera'], 'Sin cámara')}${u.camera ? clear('camera', 'Quitar') : ''}
        ${u.camera ? `<div style="margin-top:12px">${this._sw('snapshots', 'Guardar una foto de cada timbre (historial)', u.snapshots)}</div><div class="hint">Se guardan las últimas 30 en la carpeta media.</div>
          <div class="lbl" style="margin-top:12px">Hablar: nombre del stream de go2rtc (opcional)</div><input type="text" value="${esc(u.stream)}" data-o="d" data-k="ui.stream" placeholder="portero" autocomplete="off">
          <div class="hint">${customElements.get('webrtc-camera') ? 'Con la tarjeta WebRTC Camera instalada se puede ver, escuchar y hablar.' : 'Para hablar falta la tarjeta «WebRTC Camera» (HACS). El micrófono necesita HTTPS.'}</div>` : ''}
        <div class="lbl" style="margin-top:14px">👤 Reconocer quién tocó (Frigate, opcional)</div>${this._entBtn('d', 'ui.face_sensor', u.face_sensor, ['sensor'], 'Sin reconocimiento de caras', false, null, 'face')}
        ${u.face_sensor ? `${clear('face_sensor', 'Quitar')}<div class="hint">El aviso dice «Tocó el timbre: María» si la cámara la reconoció en el último minuto y medio.</div>` : ''}</div>

      ${sec(++n, 'Abrir', 'Opcional')}
      <div class="field"><div class="lbl">🔓 Puerta</div>${this._entBtn('d', 'ui.unlock', u.unlock, ['lock', 'button', 'input_button', 'switch', 'script'], 'Sin apertura')}${u.unlock ? clear('unlock', 'Quitar') : ''}
        ${u.unlock ? `<input type="text" style="margin-top:8px" value="${esc(u.unlock_name)}" data-o="d" data-k="ui.unlock_name" placeholder="Nombre del botón">` : ''}
        <div class="lbl" style="margin-top:14px">🚗 Portón (opcional)</div>${this._entBtn('d', 'ui.unlock2', u.unlock2, ['lock', 'button', 'input_button', 'switch', 'script', 'cover'], 'Sin portón')}${u.unlock2 ? clear('unlock2', 'Quitar') : ''}
        ${u.unlock2 ? `<input type="text" style="margin-top:8px" value="${esc(u.unlock2_name)}" data-o="d" data-k="ui.unlock2_name" placeholder="Nombre del botón">` : ''}
        ${[u.unlock, u.unlock2].some((e) => e && ['switch', 'input_boolean'].includes(dom(e))) ? `<div class="lbl" style="margin-top:12px">Pulso del relé</div>${this._chips('d', 'ui.pulse', u.pulse, [[1, '1 s'], [2, '2 s'], [3, '3 s'], [5, '5 s']])}` : ''}
        ${[u.unlock, u.unlock2].some((e) => e && dom(e) === 'lock') ? `<div class="lbl" style="margin-top:12px">Código de la cerradura (si lo pide)</div><input type="text" inputmode="numeric" value="${esc(u.code)}" data-o="d" data-k="ui.code" autocomplete="off">` : ''}</div>

      ${sec(++n, 'Aviso al celular')}
      <div class="field">${this._recipients('ui.recipients', u.recipients)}
        <div class="lbl" style="margin-top:14px">Cómo suena</div>${this._seg('d', 'ui.ring_style', u.ring_style, [['call', '📞 Como llamada'], ['normal', '🔔 Notificación']])}
        <div class="hint">${u.ring_style === 'call' ? 'Suena fuerte aunque el celular esté en silencio (en Android, en el canal «portero»; podés elegirle un ringtone en los ajustes de la app).' : 'Aviso normal, prioridad alta.'}</div>
        <div style="margin-top:12px">${this._sw('ring_repeat', 'Repetir mientras suena', u.ring_repeat)}</div></div>

      ${sec(++n, 'En la casa', 'Opcional')}
      <div class="field"><div class="lbl">🔊 Anunciar en parlantes</div>${this._entBtn('d', 'ui.speakers', u.speakers, ['media_player'], 'Sin parlantes', true)}
        ${u.speakers.length ? (tts.length ? `<div class="lbl" style="margin-top:10px">Voz</div>${this._chips('d', 'ui.tts', u.tts, tts.map((e) => [e, fname(h, e)]))}
          <div class="lbl" style="margin-top:10px">Qué dice</div><input type="text" value="${esc(u.message)}" data-o="d" data-k="ui.message">` : '<div class="hint">No hay un servicio de voz (TTS) configurado en Home Assistant.</div>') : ''}
        <div class="lbl" style="margin-top:14px">💡 Luz de entrada</div>${this._entBtn('d', 'ui.light', u.light, ['light', 'switch'], 'Sin luz')}${u.light ? clear('light', 'Quitar') : ''}
        ${u.light ? `<div style="margin-top:8px">${this._chips('d', 'ui.light_min', u.light_min, [[1, '1 min'], [3, '3 min'], [5, '5 min'], [10, '10 min']])}</div><div style="margin-top:8px">${this._sw('light_dark', 'Sólo de noche', u.light_dark)}</div>` : ''}
        <div style="margin-top:14px">${this._sw('quiet', '🌙 No molestar', u.quiet)}</div>
        ${u.quiet ? `<div class="inl" style="margin-top:8px"><input type="time" value="${esc(u.quiet_from)}" data-o="d" data-k="ui.quiet_from"><span class="unit">a</span><input type="time" value="${esc(u.quiet_to)}" data-o="d" data-k="ui.quiet_to"></div><div class="hint">En ese horario no anuncia en parlantes y el aviso llega sin sonido fuerte.</div>` : ''}</div>`;
  }

  _editor_reminder(d) {
    const u = d.ui;
    const at = u.date && u.time ? new Date(`${u.date}T${u.time}:00`) : null;
    const repeats = u.repeat !== 'none';
    return `<div class="today"><div class="mode" style="margin:0"><ha-icon icon="mdi:bell-ring-outline"></ha-icon><div>
        ${u.text ? `Te aviso «<b>${esc(u.text)}</b>»` : 'Te aviso'} ${at ? (repeats ? `${remRepeat(u)} a las ${u.time}` : whenText(at)) : ''}, con botones <b>✓ Hecho</b>, <b>En 1 hora</b> y <b>Mañana</b>.${+u.nag_min ? ` Si no lo marcás, insiste cada ${durText(u.nag_min)}.` : ''}</div></div></div>
      <div class="sec"><div><div class="h">¿Qué te recuerdo?</div></div></div>
      <div class="field"><textarea data-o="d" data-k="ui.text" placeholder="Ej: Sacar la basura, tomar la pastilla, pagar la luz…" style="min-height:64px">${esc(u.text)}</textarea></div>
      <div class="sec"><div><div class="h">¿Cuándo?</div></div></div>
      <div class="field"><div class="chips"><button class="chip" data-a="remwhen" data-v="1h">En 1 hora</button><button class="chip" data-a="remwhen" data-v="tonight">Esta noche 20:00</button><button class="chip" data-a="remwhen" data-v="tomorrow">Mañana 9:00</button></div>
        <div class="inl" style="margin-top:12px"><input type="date" value="${esc(u.date)}" data-o="d" data-k="ui.date"><input type="time" value="${esc(u.time)}" data-o="d" data-k="ui.time"></div>
        <div class="lbl" style="margin-top:14px">Repetir</div>${this._chips('d', 'ui.repeat', u.repeat, [['none', 'Una vez'], ['daily', 'Todos los días'], ['weekly', 'Algunos días'], ['monthly', 'Cada mes'], ['yearly', 'Cada año']])}
        ${u.repeat === 'weekly' ? `<div style="margin-top:12px">${this._days('d', 'ui.days', u.days)}</div>` : ''}
        ${u.repeat === 'monthly' ? `<div class="hint">El día ${(u.date || '').split('-')[2] ? +(u.date.split('-')[2]) : '…'} de cada mes (si el mes no tiene ese día, el último).</div>` : ''}
        ${repeats ? '<div class="hint">La fecha marca desde cuándo empieza.</div>' : ''}</div>
      <div class="sec"><div><div class="h">Aviso</div></div></div>
      <div class="field">${this._recipients('ui.recipients', u.recipients)}
        <div class="lbl" style="margin-top:14px">Si no lo marco como hecho</div>${this._chips('d', 'ui.nag_min', u.nag_min, [[0, 'No insistir'], [5, 'Insistir cada 5 min'], [10, 'Cada 10 min'], [30, 'Cada 30 min']])}
        <div class="hint">Insiste hasta 3 veces.</div>
        <div style="margin-top:14px">${this._sw('critical', 'Aviso urgente', u.critical)}</div><div class="hint">Suena aunque el celular esté en silencio (medicación, cosas importantes).</div></div>`;
  }

  _editor_calalert(d) {
    const u = d.ui;
    return `<div class="today"><div class="mode" style="margin:0"><ha-icon icon="mdi:calendar-alert"></ha-icon><div>Te aviso ${+u.before_min ? `<b>${durText(u.before_min)} antes</b>` : '<b>al empezar</b>'} de cada evento de los calendarios elegidos${u.all_day ? `, y los de día completo a las ${u.all_day_time}` : ''}. Sirve con Google Calendar, el calendario local de Home Assistant y otros.</div></div></div>
      <div class="sec"><div><div class="h">Calendarios</div></div></div>
      <div class="field">${this._entBtn('d', 'ui.calendars', u.calendars, ['calendar'], 'Elegir calendarios', true)}</div>
      <div class="sec"><div><div class="h">Cuándo avisar</div></div></div>
      <div class="field">${this._chips('d', 'ui.before_min', u.before_min, [[0, 'Al empezar'], [5, '5 min antes'], [10, '10 min'], [15, '15 min'], [30, '30 min'], [60, '1 h'], [120, '2 h']])}
        <div style="margin-top:14px">${this._sw('all_day', 'Avisar los eventos de día completo', u.all_day)}</div>
        ${u.all_day ? `<div class="inl" style="margin-top:8px"><span class="unit">a las</span><input type="time" value="${esc(u.all_day_time)}" data-o="d" data-k="ui.all_day_time"></div><div class="hint">Cumpleaños, feriados, vencimientos…</div>` : ''}</div>
      <div class="sec"><div><div class="h">A quién</div></div></div>
      <div class="field">${this._recipients('ui.recipients', u.recipients)}
        <div style="margin-top:14px">${this._sw('critical', 'Aviso urgente', u.critical)}</div></div>`;
  }

  _editor_watch(d) {
    const u = d.ui; const h = this._hass;
    const sec = (n, t, s2) => this._num2(null, n, t, s2);
    const word = (e) => {
      const dd = dom(e), dc = h.states[e]?.attributes?.device_class;
      if (dd === 'binary_sensor') return { door: 'abierta', window: 'abierta', garage_door: 'abierto', opening: 'abierto', lock: 'sin llave' }[dc] || 'activo';
      if (dd === 'cover') return ['garage', 'gate'].includes(dc) ? 'abierto' : 'abierta';
      if (dd === 'lock') return 'sin llave';
      if (dd === 'light') return 'prendida';
      return 'prendido';
    };
    const fix = (e) => ['cover', 'lock', 'valve', 'climate', 'water_heater', 'light', 'switch', 'input_boolean', 'fan', 'humidifier', 'media_player'].includes(dom(e));
    const mins = [[1, '1 min'], [2, '2 min'], [5, '5 min'], [10, '10 min'], [15, '15 min'], [30, '30 min'], [60, '1 h'], [120, '2 h'], [240, '4 h']];
    const people = has(h, 'person');
    const rows = u.ents.map((e, i) => {
      const cur = u.mins?.[mkey(e)] ?? u.default_min;
      return `<div class="item"><ha-icon icon="${entIcon(h, e)}" style="color:var(--mae-sub)"></ha-icon><div class="tx"><div class="t1">${esc(fname(h, e))}</div>
        <div class="t2">si queda ${word(e)} más de <select style="width:auto;padding:4px 8px;font-size:13px;display:inline-block" data-o="d" data-k="ui.mins.${mkey(e)}" data-t="num">${mins.map(([v, l]) => `<option value="${v}" ${+cur === v ? 'selected' : ''}>${l}</option>`).join('')}</select>${fix(e) ? '' : ' · sólo aviso'}</div></div>
        <div class="mini"><button data-a="arrdel" data-k="ui.ents" data-i="${i}"><ha-icon icon="mdi:close"></ha-icon></button></div></div>`;
    }).join('');
    let n = 0;
    return `<div class="today"><div class="mode" style="margin:0"><ha-icon icon="mdi:information-outline"></ha-icon><div><b>Cómo funciona</b><br>
        Si algo de la lista queda abierto o prendido más del tiempo elegido${u.only_away ? ' y no hay nadie en casa' : ''}${u.only_night ? ', de noche,' : ''} te llega un aviso con botones: <b>Apagar / cerrar</b>, <b>Recordar en 30 min</b> o <b>Ignorar</b>.${+u.repeat_min ? ` Si sigue igual, repite el aviso cada ${durText(u.repeat_min)}.` : ''}${u.auto_fix ? ` Si nadie responde, a los ${durText(u.auto_fix_min)} lo apaga / cierra solo.` : ''} Cuando se resuelve, el aviso se borra.</div></div></div>

      ${sec(++n, 'Qué vigilar')}
      <div class="field"><div class="lbl">Agregar rápido</div>
        <div class="chips"><button class="chip" data-a="wpreset" data-v="open"><ha-icon icon="mdi:door-open"></ha-icon>Puertas y ventanas</button><button class="chip" data-a="wpreset" data-v="climate"><ha-icon icon="mdi:air-conditioner"></ha-icon>Aires y calefacción</button><button class="chip" data-a="wpreset" data-v="lights"><ha-icon icon="mdi:lightbulb"></ha-icon>Luces</button></div>
        <div style="margin-top:12px">${this._entBtn('d', 'ui.ents', u.ents, ['binary_sensor', 'cover', 'lock', 'valve', 'climate', 'water_heater', 'light', 'switch', 'input_boolean', 'fan', 'humidifier', 'media_player'], 'Elegir equipos uno por uno', true, ['door', 'window', 'garage_door', 'opening', 'garage', 'gate'])}</div>
        ${u.ents.length ? `<div class="card" style="margin-top:12px">${rows}</div>` : ''}
        <div class="lbl" style="margin-top:14px">Tiempo para los nuevos que agregues</div>${this._chips('d', 'ui.default_min', u.default_min, [[5, '5 min'], [10, '10 min'], [15, '15 min'], [30, '30 min'], [60, '1 h']])}</div>

      ${sec(++n, 'Cuándo avisar')}
      <div class="field">${people ? `${this._sw('only_away', 'Sólo si no hay nadie en casa', u.only_away)}<div class="hint">Ideal para seguridad y para no gastar luz ni aire de más. Usa la ubicación de la app de cada persona.</div>` : '<div class="hint">Para avisar sólo cuando no hay nadie, cada persona tiene que tener la app de Home Assistant con ubicación.</div>'}
        <div style="margin-top:14px">${this._sw('only_night', 'Sólo de noche', u.only_night)}</div><div class="hint">Por ejemplo, para la puerta del frente o el portón.</div></div>

      ${sec(++n, 'A quién avisar')}
      <div class="field">${this._recipients('ui.recipients', u.recipients)}
        <div style="margin-top:14px">${this._sw('critical', 'Aviso urgente', u.critical)}</div><div class="hint">Suena aunque el celular esté en silencio. Usalo para lo importante (puerta del frente abierta de noche, portón).</div></div>

      ${sec(++n, 'Si sigue así')}
      <div class="field"><div class="lbl">Repetir el aviso</div>${this._chips('d', 'ui.repeat_min', u.repeat_min, [[0, 'No repetir'], [10, 'Cada 10 min'], [15, 'Cada 15 min'], [30, 'Cada 30 min'], [60, 'Cada 1 h']])}
        <div class="hint">Repite hasta 5 veces o hasta que se resuelva.</div>
        <div style="margin-top:14px">${this._sw('auto_fix', 'Apagar / cerrar solo si nadie responde', u.auto_fix)}</div>
        <div class="hint">Funciona con aires, calefacción, luces, enchufes, portones, persianas y cerraduras. Los sensores de puertas y ventanas sólo avisan (no se pueden cerrar solos).</div>
        ${u.auto_fix ? `<div class="lbl" style="margin-top:12px">Después del aviso, esperar</div>${this._chips('d', 'ui.auto_fix_min', u.auto_fix_min, [[5, '5 min'], [10, '10 min'], [15, '15 min'], [30, '30 min'], [60, '1 h']])}
          <div style="margin-top:12px">${this._sw('notify_fixed', 'Avisar cuando lo apague / cierre', u.notify_fixed)}</div>` : ''}</div>`;
  }

  _editor_away(d) {
    const u = d.ui; const h = this._hass;
    const sec = (n, t, s2) => this._num2(null, n, t, s2);
    const people = has(h, 'person'), alarms = has(h, 'alarm_control_panel'), covers = has(h, 'cover'), locks = has(h, 'lock');
    const mode3 = (k, list, label, domains, ph) => `<div class="lbl" style="margin-top:14px">${label}</div>${this._seg('d', `ui.${k}`, u[k], [['none', 'Nada'], ['all', 'Todo'], ['list', 'Elegir']])}
      ${u[k] === 'list' ? `<div style="margin-top:8px">${this._entBtn('d', `ui.${list}`, u[list], domains, ph, true)}</div>` : ''}`;
    const rules = (this._rules || []).filter((r) => r.id !== d.id && r.kind !== 'timer' && r.kind !== 'scene' && r.kind !== 'away');
    const pres = rules.filter((r) => r.kind === 'presence');
    const leave = [u.lights !== 'none' ? 'apaga las luces' : '', u.climate !== 'none' ? 'apaga los aires' : '', u.covers !== 'none' ? 'cierra las persianas' : '', u.switches.length ? 'apaga enchufes' : '', u.locks.length ? 'le echa llave a las puertas' : '', u.arm ? 'arma la alarma' : '', u.rules_on.length ? 'activa automatizaciones' : ''].filter(Boolean);
    const back = [u.disarm ? 'desarma la alarma' : '', u.welcome.length ? `prende luces${u.welcome_dark ? ' (si es de noche)' : ''}` : '', u.arrive_climate.length ? 'prende el aire' : '', u.rules_on.length ? 'desactiva lo que activó' : ''].filter(Boolean);
    let n = 0;
    return `<div class="today"><div class="mode" style="margin:0"><ha-icon icon="mdi:information-outline"></ha-icon><div><b>Cómo funciona</b><br>
        ${u.detect === 'alarm' ? 'Cuando se arma la alarma en modo ausente' : `Cuando se va el último de la casa (y sigue afuera ${durText(u.leave_delay)})`}: ${leave.length ? leave.join(', ') : 'no hace nada todavía'}${u.check_open !== 'none' ? ' y te avisa si quedó algo abierto' : ''}.
        ${back.length ? `<br>Al volver el primero: ${back.join(', ')}.` : ''}${u.cancel_motion.length ? '<br>Si hubo movimiento en casa (alguien sin celular), espera y vuelve a fijarse.' : ''}</div></div></div>

      ${sec(++n, 'Cómo saber que se fueron')}
      <div class="field">${this._seg('d', 'ui.detect', u.detect, [['people', '📱 Por las personas'], ['alarm', '🛡 Por la alarma']])}
        ${u.detect === 'people'
          ? (people ? `<div class="hint">Usa la ubicación de la app de Home Assistant de cada persona.</div>
              <div class="lbl" style="margin-top:12px">Confirmar que se fueron durante</div>${this._chips('d', 'ui.leave_delay', u.leave_delay, [[2, '2 min'], [5, '5 min'], [10, '10 min'], [15, '15 min']])}
              <div class="hint">Evita falsas salidas por un salto del GPS.</div>`
            : '<div class="note" style="color:#e0832b">No hay personas con la app configuradas. Usá «Por la alarma» o configurá la app en cada celular.</div>')
          : `<div class="hint">Se activa cuando arman la alarma en modo ausente, y la bienvenida cuando la desarman.</div><div style="margin-top:8px">${this._entBtn('d', 'ui.alarm', u.alarm, ['alarm_control_panel'], 'Elegir alarma')}</div>`}
        <div class="lbl" style="margin-top:14px">Si queda alguien sin celular (opcional)</div>${this._entBtn('d', 'ui.cancel_motion', u.cancel_motion, ['binary_sensor'], 'Sin sensores de movimiento', true, ['motion', 'occupancy', 'presence'])}
        <div class="hint">Si alguno detectó movimiento hace poco, no apaga nada y vuelve a fijarse más tarde (chicos, abuelos, la persona que limpia).</div></div>

      ${sec(++n, 'Al irse')}
      <div class="field">${mode3('lights', 'lights_list', '💡 Luces', ['light', 'switch'], 'Elegir luces')}
        ${mode3('climate', 'climate_list', '❄️ Aires y calefacción', ['climate'], 'Elegir aires')}
        ${covers ? mode3('covers', 'covers_list', '🪟 Persianas y cortinas', ['cover'], 'Elegir persianas') : ''}
        <div class="lbl" style="margin-top:14px">🔌 Apagar también (opcional)</div>${this._entBtn('d', 'ui.switches', u.switches, ['switch', 'input_boolean', 'fan', 'light'], 'Enchufes, termotanque, ventiladores…', true)}
        ${locks ? `<div class="lbl" style="margin-top:14px">🔐 Echar llave (opcional)</div>${this._entBtn('d', 'ui.locks', u.locks, ['lock'], 'Elegir cerraduras', true)}` : ''}
        ${alarms ? `<div style="margin-top:14px">${this._sw('arm', '🛡 Armar la alarma', u.arm)}</div>
          ${u.arm && u.detect !== 'alarm' ? `<div style="margin-top:8px">${this._entBtn('d', 'ui.alarm', u.alarm, ['alarm_control_panel'], 'Elegir alarma')}</div>` : ''}
          ${u.arm || u.disarm ? `<div class="lbl" style="margin-top:10px">Código de la alarma (si lo pide)</div><input type="text" inputmode="numeric" value="${esc(u.code)}" data-o="d" data-k="ui.code" autocomplete="off">` : ''}` : ''}
        ${rules.length ? `<div class="lbl" style="margin-top:14px">Activar automatizaciones (opcional)</div>${this._chips('d', 'ui.rules_on', u.rules_on, rules.map((r) => [r.id, r.name, r.icon]), true)}
          <div class="hint">${pres.length ? 'Por ejemplo «Simular presencia».' : 'Por ejemplo una de simular presencia.'} Al volver se desactivan solas.</div>` : ''}
        <div class="lbl" style="margin-top:14px">⚠ Avisar qué quedó abierto</div>${this._seg('d', 'ui.check_open', u.check_open, [['auto', 'Puertas y ventanas'], ['list', 'Elegir'], ['none', 'No']])}
        ${u.check_open === 'list' ? `<div style="margin-top:8px">${this._entBtn('d', 'ui.check_list', u.check_list, ['binary_sensor'], 'Elegir sensores', true, ['door', 'window', 'garage_door', 'opening'])}</div>` : ''}</div>

      ${sec(++n, 'Al volver')}
      <div class="field"><div class="lbl">💡 Luces de bienvenida (opcional)</div>${this._entBtn('d', 'ui.welcome', u.welcome, ['light', 'switch'], 'Sin luces de bienvenida', true)}
        ${u.welcome.length ? `<div style="margin-top:10px">${this._sw('welcome_dark', 'Sólo si es de noche', u.welcome_dark)}</div>` : ''}
        ${alarms ? `<div style="margin-top:14px">${this._sw('disarm', '🛡 Desarmar la alarma', u.disarm)}</div><div class="hint">Por seguridad, conviene que la alarma la desarmen a mano; usalo sólo si confiás en la ubicación de los celulares.</div>
          ${u.disarm && !u.alarm ? `<div style="margin-top:8px">${this._entBtn('d', 'ui.alarm', u.alarm, ['alarm_control_panel'], 'Elegir alarma')}</div>` : ''}` : ''}
        <div class="lbl" style="margin-top:14px">❄️ Prender el aire (opcional)</div>${this._entBtn('d', 'ui.arrive_climate', u.arrive_climate, ['climate'], 'Sin aire', true)}
        ${u.arrive_climate.length ? `<div style="margin-top:10px">${this._seg('d', 'ui.arrive_mode', u.arrive_mode, [['cool', '❄️ Frío'], ['heat', '🔥 Calor'], ['auto', 'Auto']])}</div>
          <div class="inl" style="margin-top:10px"><span class="unit">a</span>${this._num('d', 'ui.arrive_temp', u.arrive_temp, 'min="16" max="30" step="0.5"', '°')}</div>` : ''}</div>

      ${sec(++n, 'Avisos')}
      <div class="field">${this._recipients('ui.recipients', u.recipients)}
        <div style="margin-top:14px">${this._sw('notify_leave', 'Avisar qué hizo al irse', u.notify_leave)}</div><div class="hint">«Listo: apagué 4 luces y 1 aire, armé la alarma. ⚠ Quedó abierta la ventana de la cocina.» Si quedó algo abierto, avisa siempre.</div>
        <div style="margin-top:12px">${this._sw('open_critical', 'Si quedó algo abierto, aviso urgente', u.open_critical)}</div>
        <div style="margin-top:12px">${this._sw('notify_arrive', 'Avisar al volver', u.notify_arrive)}</div></div>`;
  }

  _editor_room(d) {
    const u = d.ui; const h = this._hass;
    const sec = (n, title, sub) => `<div class="sec"><div><div class="h"><span class="num">${n}</span>${title}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div></div>`;
    const sw = (k, label) => `<div class="opt" style="margin:0"><button class="sw ${u[k] ? 'on' : ''}" data-a="set" data-o="d" data-k="ui.${k}" data-v="${u[k] ? '' : '1'}" data-t="bool"></button><div style="font-weight:600">${label}</div></div>`;
    const sel = (k, opts) => `<select data-o="d" data-k="ui.${k}" data-t="num">${opts.map(([v, l]) => `<option value="${v}" ${+u[k] === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    const clear = (k, label) => `<button class="chip" style="margin-top:6px" data-a="set" data-o="d" data-k="ui.${k}" data-v="" data-t="null">${label}</button>`;
    const BS = ['binary_sensor'];
    const door = u.doors.length > 0, pres = u.presence.length > 0, only = !!u.only_sensor;
    const how = only ? [
      `El sensor marca <b>Detectado</b> cuando ${[u.motion.length ? 'hay movimiento' : '', pres ? 'el mmWave detecta a alguien' : ''].filter(Boolean).join(' o ') || '…'}${door && u.on_door ? ' o se abre la puerta' : ''}.`,
      door ? '🔒 Si se cierra la puerta y hay movimiento adentro, sigue Detectado aunque la persona se quede quieta, hasta que se abra la puerta.' : '',
      `Pasa a <b>Despejado</b> ${durText(u.timeout)} después de que deja de detectar a alguien${door ? `; al salir, ${+u.door_timeout ? `a ${durText(u.door_timeout)}` : 'al instante'}` : ''}.`,
      'Usalo en otras automatizaciones: tele sin nadie, clima con la habitación vacía, avisos…',
    ].filter(Boolean) : [
      `Se prende al detectar ${[u.motion.length ? 'movimiento' : '', pres ? 'presencia' : ''].filter(Boolean).join(' o ') || 'a alguien'}${door && u.on_door ? ' o al abrir la puerta' : ''}${u.when === 'sun' ? ', sólo de noche' : u.when === 'lux' ? ', sólo si hay poca luz' : ''}.`,
      door ? '🔒 Si se cierra la puerta y hay movimiento adentro, queda ocupado: no se apaga aunque la persona se quede quieta, hasta que se abra la puerta.' : '',
      pres ? '👤 Mientras el sensor de presencia detecte a alguien, no se apaga.' : '',
      `${pres && !u.motion.length ? 'Cuando el sensor deja de detectar a alguien, se apaga' : 'Sin movimiento se apaga'} después de ${durText(u.timeout)}${door ? `; al salir, ${+u.door_timeout ? `después de ${durText(u.door_timeout)}` : 'al instante'}` : ''}.`,
      +(u.warn_s ?? 20) ? `🔅 Antes de apagarse baja la luz ${u.warn_s ?? 20} s: si te quedaste quieto, movete y vuelve a subir.` : '',
      u.when === 'lux' ? '💡 El sensor de luz no se confunde con la lámpara: mientras está prendida (y 3 min después de apagarla) usa la luz que había antes de prenderla.' : '',
      u.fan ? `🌀 El extractor se prende ${+u.fan_delay ? `${durText(u.fan_delay)} después de entrar` : 'al entrar'} y sigue ${durText(u.fan_after)} después de salir${u.humidity ? `, o si la humedad pasa del ${u.hum_max}%` : ''}.` : '',
    ].filter(Boolean);
    let n = 0;
    const live = (this._rules || []).find((r) => r.id === d.id);
    const dec = live?.last_decision;
    return `<div class="today"><div class="mode" style="margin:0"><ha-icon icon="mdi:information-outline"></ha-icon><div><b>Cómo funciona</b><br>${how.join('<br>')}</div></div>
      ${live ? `<div class="mode" style="margin-top:10px"><ha-icon icon="mdi:history"></ha-icon><div><b>Ahora:</b> ${live.occupied ? (live.sealed ? 'ocupado 🔒' : 'ocupado') : 'libre'}${dec ? `<br><b>Última decisión</b> (${whenText(dec.at)}): ${esc(dec.text)}` : ''}
        ${(live.decisions || []).length > 1 ? `<details style="margin-top:6px"><summary style="cursor:pointer;color:var(--mae-sub)">Ver las últimas ${live.decisions.length}</summary>${live.decisions.map((x) => `<div class="hint" style="margin:3px 0">${whenText(x.at)} · ${esc(x.text)}</div>`).join('')}</details>` : ''}</div></div>` : ''}</div>

      ${only ? '' : `
      ${sec(++n, 'Luces')}
      <div class="field">${this._entBtn('d', 'ui.lights', u.lights, ['light', 'switch', 'input_boolean'], 'Elegir luces', true)}</div>

      `}
      ${sec(++n, 'Sensores', 'Hace falta al menos uno: de movimiento o de presencia')}
      <div class="field"><div class="lbl">👤 Presencia mmWave</div>${this._entBtn('d', 'ui.presence', u.presence, BS, 'Sin sensor de presencia', true, ['occupancy', 'presence'])}
        <div class="hint">Detectan personas quietas (sentadas, leyendo, en la ducha). Mientras detecten a alguien, la luz no se apaga. <b>Con uno de estos solo alcanza.</b></div>
        <div class="lbl" style="margin-top:14px">🏃 Movimiento (PIR)</div>${this._entBtn('d', 'ui.motion', u.motion, BS, 'Sin sensor de movimiento', true, ['motion', 'occupancy', 'presence'])}
        <div class="hint">Los comunes de movimiento: detectan cuando alguien se mueve. Si tenés los dos tipos, poné los dos: el de movimiento reacciona más rápido al entrar.</div>
        <div class="lbl" style="margin-top:14px">🚪 Puerta (opcional)</div>${this._entBtn('d', 'ui.doors', u.doors, BS, 'Sin sensor de puerta', true, ['door', 'opening', 'window', 'garage_door'])}
        <div class="hint">Con la puerta cerrada y alguien adentro, la luz no se apaga aunque no se detecte movimiento. Útil sobre todo si usás sólo un sensor de movimiento (con mmWave no hace tanta falta).</div></div>

      ${only ? '' : `
      ${sec(++n, 'Cuándo prender')}
      <div class="field">${this._seg('d', 'ui.when', u.when, [['always', 'Siempre'], ['sun', 'Sólo de noche'], ['lux', 'Con poca luz']])}
        <div class="hint">${u.when === 'always' ? 'Para ambientes sin ventanas, como muchos baños.' : u.when === 'sun' ? 'Desde un rato antes del atardecer hasta un rato después del amanecer.' : 'Usa un sensor de luz: sólo prende si el ambiente está oscuro.'}</div>
        ${u.when === 'lux' ? `<div class="lbl" style="margin-top:12px">Sensor de luz</div>${this._entBtn('d', 'ui.lux', u.lux, ['sensor'], 'Elegir sensor', false, ['illuminance'])}
          <div class="inl" style="margin-top:10px"><span class="unit">Prender si hay menos de</span>${this._num('d', 'ui.lux_max', u.lux_max, 'min="0"', 'lux')}</div>` : ''}
        ${door ? `<div style="margin-top:14px">${sw('on_door', 'Prender apenas se abre la puerta')}</div><div class="hint">Así no entrás a oscuras mientras el sensor de movimiento reacciona.</div>` : ''}</div>

      ${sec(++n, 'Intensidad')}
      <div class="field"><div class="lbl">Al prenderse</div>${this._chips('d', 'ui.day_pct', u.day_pct, [['', 'Como estaba'], [30, '30%'], [50, '50%'], [80, '80%'], [100, '100%']])}
        <div style="margin-top:14px">${sw('night', 'Luz tenue de madrugada')}</div>
        <div class="hint">Para no encandilar si alguien se levanta a la noche.</div>
        ${u.night ? `<div class="inl" style="margin-top:10px"><input type="time" value="${esc(u.night_from)}" data-o="d" data-k="ui.night_from"><span class="unit">a</span><input type="time" value="${esc(u.night_to)}" data-o="d" data-k="ui.night_to"></div>
          <div class="lbl" style="margin-top:10px">Intensidad de madrugada</div>${this._chips('d', 'ui.night_pct', u.night_pct, [[1, '1%'], [5, '5%'], [10, '10%'], [20, '20%'], [30, '30%']])}` : ''}</div>

      `}
      ${sec(++n, only ? 'Cuándo queda vacío' : 'Cuándo apagar')}
      <div class="field"><div class="lbl">${only ? 'Pasar a «Despejado» a los' : u.presence.length && !u.motion.length ? 'Cuando deja de detectar a alguien, apagar a los' : 'Sin movimiento, apagar a los'}</div>${this._chips('d', 'ui.timeout', u.timeout, [[0.5, '30 s'], [1, '1 min'], [2, '2 min'], [3, '3 min'], [5, '5 min'], [10, '10 min'], [15, '15 min'], [30, '30 min']])}
        <div class="hint">Cada movimiento vuelve a empezar la cuenta.${pres ? ' El sensor mmWave también tiene su propio tiempo antes de pasar a «despejado» (en Zigbee2MQTT suele llamarse «fading time»): se suman los dos.' : ''}</div>
        ${only ? '' : `<div class="lbl" style="margin-top:14px">Antes de apagar, bajar la luz</div>${this._chips('d', 'ui.warn_s', u.warn_s ?? 20, [[0, 'No'], [10, '10 s'], [20, '20 s'], [30, '30 s']])}
          <div class="hint">Como aviso: si te quedaste quieto y la luz baja, con moverte vuelve a como estaba.</div>`}
        ${door ? `<div class="lbl" style="margin-top:14px">Al salir, apagar</div>${this._chips('d', 'ui.door_timeout', u.door_timeout, [[0, 'Al instante'], [1, 'A 1 min'], [2, 'A 2 min'], [5, 'A 5 min']])}
          <div class="hint">Cuando se abre la puerta y deja de haber movimiento, o se cierra y no queda nadie adentro.</div>
          <div class="lbl" style="margin-top:14px">Al cerrar la puerta, esperar movimiento durante</div>${this._chips('d', 'ui.seal_window', u.seal_window, [[15, '15 s'], [30, '30 s'], [60, '1 min'], [90, '1 min 30 s'], [120, '2 min']])}
          <div class="hint">Si en ese tiempo se detecta movimiento, hay alguien adentro y el ambiente queda ocupado. Si tu sensor tarda en volver a «sin movimiento», poné un tiempo un poco mayor.</div>
          <div class="lbl" style="margin-top:14px">Con la puerta cerrada, si nadie se mueve en</div>${sel('sealed_max', [[15, '15 minutos, apagar igual'], [30, '30 minutos, apagar igual'], [60, '1 hora, apagar igual'], [120, '2 horas, apagar igual'], [240, '4 horas, apagar igual'], [0, 'Nunca: esperar a que se abra la puerta']])}
          <div class="hint">Por si alguien salió sin que el sensor lo vea o la puerta quedó mal cerrada.</div>` : ''}</div>

      ${only ? '' : `
      ${sec(++n, 'Si alguien la apaga a mano')}
      <div class="field">${sel('manual_block', [[0, 'La vuelve a prender con el próximo movimiento'], [5, 'No la prende durante 5 minutos'], [10, 'No la prende durante 10 minutos'], [30, 'No la prende durante 30 minutos'], [60, 'No la prende durante 1 hora'], [-1, 'No la prende hasta que el ambiente quede vacío']])}
        <div class="hint">Útil si alguien quiere quedarse a oscuras (dormir la siesta, ver una película).</div></div>

      ${sec(++n, 'Extractor', 'Opcional, para baños')}
      <div class="field">${this._entBtn('d', 'ui.fan', u.fan, ['fan', 'switch', 'input_boolean'], 'Sin extractor')}
        ${u.fan ? `${clear('fan', 'Quitar extractor')}
          <div class="lbl" style="margin-top:14px">Prenderlo</div>${this._chips('d', 'ui.fan_delay', u.fan_delay, [[0, 'Al entrar'], [1, 'Al minuto'], [2, 'A los 2 min'], [5, 'A los 5 min'], [10, 'A los 10 min']])}
          <div class="hint">Esperar un poco evita que se prenda por una entrada rápida.</div>
          <div class="lbl" style="margin-top:14px">Seguir funcionando después de salir</div>${this._chips('d', 'ui.fan_after', u.fan_after, [[2, '2 min'], [5, '5 min'], [10, '10 min'], [15, '15 min'], [30, '30 min']])}
          <div class="lbl" style="margin-top:14px">Sensor de humedad (opcional)</div>${this._entBtn('d', 'ui.humidity', u.humidity, ['sensor'], 'Sin sensor de humedad', false, ['humidity'])}
          ${u.humidity ? `${clear('humidity', 'Quitar sensor')}<div class="inl" style="margin-top:10px"><span class="unit">Prender también si supera</span>${this._num('d', 'ui.hum_max', u.hum_max, 'min="30" max="100"', '%')}</div>
            <div class="hint">Después de una ducha sigue funcionando hasta que baje la humedad.</div>` : ''}` : ''}</div>

      `}
      <div class="note">📟 Crea el sensor «${esc(d.name || 'Ambiente')}» (Detectado / Despejado)${only ? ', que podés elegir en «Tele prendida sin nadie», en «Habitación vacía» del clima o en cualquier automatización' : ' para ver en el panel si el ambiente está ocupado'}. 🔒 = puerta cerrada con alguien adentro.</div>`;
  }

  _editor_period(d) {
    const u = d.ui;
    return `<div class="sec"><div><div class="h">Dispositivos</div></div></div>
      <div class="field">${this._entBtn('d', 'ui.entities', u.entities, ['light', 'switch', 'input_boolean', 'fan', 'siren', 'humidifier'], 'Elegir luces o enchufes', true)}</div>
      <div class="sec"><div><div class="h">Encender</div></div></div><div class="field">${this._moment('ui.on', u.on)}</div>
      <div class="sec"><div><div class="h">Apagar</div></div></div><div class="field">${this._moment('ui.off', u.off)}</div>
      <div class="sec"><div><div class="h">Días</div></div></div><div class="field">${this._days('d', 'ui.days', u.days)}</div>
      ${(() => {
        const day = sunDay(this._hass);
        const at = (m) => (m.type === 'time' ? m.at : (m.type === 'sunrise' ? day.sr : day.ss) == null ? '—' : mh((m.type === 'sunrise' ? day.sr : day.ss) + (+m.offset || 0)));
        return `<div class="field" style="margin-top:12px"><div class="mode" style="margin:0"><ha-icon icon="mdi:clock-outline"></ha-icon><div>Hoy se prenden a las <b>${at(u.on)}</b> y se apagan a las <b>${at(u.off)}</b>.${u.on.type !== 'time' || u.off.type !== 'time' ? ' Los horarios del sol se corren solos con las estaciones.' : ''}</div></div>
          <div class="opt" style="margin:14px 0 0"><button class="sw ${u.catch_up ? 'on' : ''}" data-a="set" data-o="d" data-k="ui.catch_up" data-v="${u.catch_up ? '' : '1'}" data-t="bool"></button><div style="font-weight:600">Prenderlas si se perdió el encendido</div></div>
          <div class="hint">Si guardás la automatización o se reinicia Home Assistant cuando ya tendrían que estar prendidas, las prende en ese momento. Nunca las apaga fuera de hora.</div></div>`;
      })()}`;
  }
  _editor_timer(d) {
    const u = d.ui; const h = this._hass;
    const ops = u.entity ? opsFor(h, u.entity).filter((o) => !o.params || !o.params.some((p) => !p.opt)) : [];
    return `<div class="sec"><div><div class="h">Dispositivo</div></div></div>
      <div class="field">${this._entBtn('d', 'ui.entity', u.entity, ACTION_DOMAINS, 'Elegir dispositivo')}</div>
      ${u.entity ? `<div class="sec"><div><div class="h">Cuando termine el tiempo</div></div></div><div class="field">${this._chips('d', 'ui.op', u.op, ops.map((o) => [o.id, o.label, o.icon]))}</div>` : ''}
      <div class="sec"><div><div class="h">Dentro de</div></div></div>
      <div class="field"><div class="inl">${this._num('d', 'ui.h', u.h, 'min="0" max="72"', 'h')}${this._num('d', 'ui.m', u.m, 'min="0" max="59"', 'min')}</div>
      <div class="chips" style="margin-top:10px">${[[0, 5], [0, 15], [0, 30], [1, 0], [2, 0]].map(([hh, mm]) => `<button class="chip" data-a="timerq" data-h="${hh}" data-m="${mm}">${durText(hh * 60 + mm)}</button>`).join('')}</div></div>
      <div class="field" style="margin-top:16px"><div class="opt" style="margin:0"><button class="sw ${u.keep ? 'on' : ''}" data-a="set" data-o="d" data-k="ui.keep" data-v="${u.keep ? '' : '1'}" data-t="bool"></button><div><div style="font-weight:600">Guardarlo para usarlo de nuevo</div><div class="hint" style="margin-top:2px">Queda en «Temporizadores» con un botón ▶ para arrancarlo cuando quieras (también crea un botón en Home Assistant).</div></div></div>
      ${u.keep ? `<div class="opt" style="margin:12px 0 0"><button class="sw ${u.start_now ? 'on' : ''}" data-a="set" data-o="d" data-k="ui.start_now" data-v="${u.start_now ? '' : '1'}" data-t="bool"></button>Arrancarlo ahora al guardar</div>` : ''}</div>
      ${u.keep ? '' : '<div class="note">Se ejecuta una sola vez y después desaparece.</div>'}`;
  }
  _editor_loop(d) {
    const u = d.ui;
    return `<div class="sec"><div><div class="h">Dispositivo</div></div></div>
      <div class="field">${this._entBtn('d', 'ui.entity', u.entity, ['light', 'switch', 'input_boolean', 'fan', 'siren', 'humidifier'], 'Elegir dispositivo')}</div>
      <div class="sec"><div><div class="h">Tiempos</div></div></div>
      <div class="field"><div class="lbl">Encendido durante</div>${this._num('d', 'ui.on_min', u.on_min, 'min="1"', 'min')}<div class="lbl" style="margin-top:12px">Apagado durante</div>${this._num('d', 'ui.off_min', u.off_min, 'min="1"', 'min')}</div>
      <div class="sec"><div><div class="h">Cuándo</div></div></div>
      <div class="field">${this._seg('d', 'ui.window', u.window, [['always', 'Todo el día'], ['times', 'Entre horarios']])}
      ${u.window === 'times' ? `<div class="inl" style="margin-top:10px"><input type="time" value="${esc(u.from)}" data-o="d" data-k="ui.from"><span class="unit">a</span><input type="time" value="${esc(u.to)}" data-o="d" data-k="ui.to"></div>` : ''}
      <div style="margin-top:12px">${this._days('d', 'ui.days', u.days)}</div></div>
      <div class="note">Mientras esté activa, repite el ciclo sin parar. Al pausarla o eliminarla, el equipo se apaga.</div>`;
  }
  _editor_circadian(d) {
    const u = normCirc(d.ui); const h = this._hass;
    const ct = u.adjust !== 'bri', bri = u.adjust !== 'ct', sep = briSep(u), own = briOwn(u), sun = u.curve === 'sun';
    const day = sunDay(h); const now = circadianNow(h, u);
    const slider = (k, label, min, max, step, unit) => `<div class="lbl">${label}<span class="rangev" data-show="${k}">${esc(u[k])}${unit}</span></div><input type="range" min="${min}" max="${max}" step="${step}" value="${esc(u[k])}" data-o="d" data-k="ui.${k}" data-t="num" data-live="${k}">`;
    const clockOpts = (from, n, cur) => Array.from({ length: n }, (_, i) => mh(from + i * 30)).map((v) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${v}${v === '00:00' ? ' (medianoche)' : hm(v) < 720 ? ' (de madrugada)' : ''}</option>`).join('');
    const tm = (m) => (m == null ? '—' : mh(m));
    const pair = (l1, k1, l2, k2) => `<div class="inl" style="margin-top:10px"><div><div class="lbl">${l1}</div><input type="time" value="${esc(u[k1])}" data-o="d" data-k="ui.${k1}"></div><div><div class="lbl">${l2}</div><input type="time" value="${esc(u[k2])}" data-o="d" data-k="ui.${k2}"></div></div>`;
    const autoUp = sun ? `Con el sol (hoy ${tm(day.dawn)})` : `Junto con el tono (${u.up_start})`;
    const fullOpts = () => { const from = hm(u.b_up) + 30; return clockOpts(from, Math.max(1, Math.floor((720 - from) / 30) + 1), u.b_full); };
    const briBox = (title) => `<div class="subbox">${title ? `<div class="subh">${title}</div>` : ''}
        <div class="lbl" style="margin-top:8px">☀️ Empieza a subir la intensidad</div>
        <select data-o="d" data-k="ui.b_up"><option value="" ${u.b_up ? '' : 'selected'}>${esc(autoUp)}</option>${clockOpts(4 * 60, 15, u.b_up)}</select>
        ${u.b_up ? `<div class="lbl" style="margin-top:12px">Intensidad plena desde las</div><select data-o="d" data-k="ui.b_full">${fullOpts()}</select>` : ''}
        <div class="hint">${u.b_up ? 'Sube de a poco entre esas dos horas.' : sun ? 'Sube de a poco junto con el sol, igual que el tono.' : 'Sube junto con el tono.'}</div>
        <div class="lbl" style="margin-top:14px">🌙 Empieza a bajar la intensidad de la luz desde las</div><select data-o="d" data-k="ui.b_down">${clockOpts(18 * 60, 19, u.b_down)}</select>
        <div class="lbl" style="margin-top:12px">Luz mínima desde las</div><select data-o="d" data-k="ui.b_night">${clockOpts(18 * 60 + 30, 22, u.b_night)}</select></div>`;

    // ---- cuándo pasa cada cosa hoy
    const bc = briClock(u);
    let lines = [];
    if (sun) {
      if (own && ct) lines.push(`🎨 Tono: se aclara de ${tm(day.dawn)} a ${tm(day.full)} · se entibia de ${tm(day.warm)} a ${tm(day.dusk)}`);
      else {
        lines.push(`☀️ Se aclara de ${tm(day.dawn)} a ${tm(day.full)}${day.full == null ? ' (hoy el sol no sube tanto)' : ''}`);
        if (ct) lines.push(`🎨 ${!bri ? 'Tono: se' : 'Se'} entibia de ${tm(day.warm)} a ${tm(day.dusk)} (queda cálido hasta el alba)`);
      }
      if (own) { const up = briUp(u); lines.push(`💡 Intensidad: sube de ${up ? `${u.b_up} a ${mh(up.F)}` : `${tm(day.dawn)} a ${tm(day.full)}`} · baja de ${u.b_down} a ${mh(bc.D)}`); }
      else if (bri && !ct) lines.push(`💡 Intensidad: baja de ${tm(day.warm)} a ${tm(day.dusk)}`);
    } else {
      const t = circTimes(null, u);
      if (!own) lines.push(`☀️ Se aclara de ${mh(t.A)} a ${mh(t.B)}`);
      if (own) { const up = briUp(u); lines.push(`🎨 Tono: se aclara de ${mh(t.A)} a ${mh(t.B)} · se entibia de ${mh(t.C)} a ${mh(t.D)}`); lines.push(`💡 Intensidad: sube de ${up ? `${u.b_up} a ${mh(up.F)}` : `${mh(t.A)} a ${mh(t.B)}`} · baja de ${u.b_down} a ${mh(bc.D)}`); }
      else lines.push(`🌙 ${ct && bri ? 'Tono e intensidad bajan' : ct ? 'Se entibia' : 'La intensidad baja'} de ${mh(t.C)} a ${mh(t.D)}`);
    }
    const times = `<div class="mode" style="margin-top:12px"><ha-icon icon="mdi:clock-outline"></ha-icon><div>${lines.join('<br>')}</div></div>`;
    const lane = (label, fn) => `${label ? `<div class="hint" style="margin:8px 0 4px">${label}</div>` : ''}<div style="display:flex;height:14px;border-radius:7px;overflow:hidden">${Array.from({ length: 48 }, (_, i) => fn(i * 30 + 15)).join('')}</div>`;
    const toneLane = (m) => `<div style="flex:1;background:${kelvinColor(Math.round(+u.kmin + (u.kmax - u.kmin) * toneFAt(u, day, m)))}"></div>`;
    const briLane = (m) => `<div style="flex:1;background:rgba(247,184,79,${(0.12 + 0.88 * (+u.bmin + (u.bmax - u.bmin) * briFAt(u, day, m)) / 100).toFixed(2)})"></div>`;
    const strips = (ct ? lane(bri ? 'Tono' : '', toneLane) : '') + (bri ? lane(ct ? 'Intensidad' : '', briLane) : '');

    // ---- horarios
    let sched;
    if (sun) {
      sched = `<div class="mode" style="margin-top:12px"><ha-icon icon="mdi:weather-sunset"></ha-icon><div>${ct
        ? `El tono sigue al sol: se aclara con el alba hasta que el sol está alto, y se entibia a la tarde hasta que oscurece del todo (unos 25 min después de la puesta). Se ajusta solo con las estaciones.${bri && !sep ? ' La intensidad hace lo mismo.' : ''}`
        : 'A la mañana la intensidad sube con el sol.'}</div></div>
        ${own ? briBox(ct ? '💡 Intensidad' : '') : ''}`;
    } else {
      const evening = sep
        ? `<div class="subbox"><div class="subh">🎨 Tono</div>${pair('Empieza a entibiar', 'down_start', 'Totalmente cálido a las', 'down_end')}</div>${briBox('💡 Intensidad')}`
        : ct && bri ? pair('🌇 Atardecer en casa', 'down_start', '🌙 Luz de noche desde', 'down_end')
        : ct ? pair('🌇 Empieza a entibiar', 'down_start', '🌙 Totalmente cálido a las', 'down_end')
        : pair('🌇 Empieza a bajar la intensidad de la luz desde', 'down_start', '🌙 Luz mínima desde', 'down_end');
      sched = `<div class="subh">☀️ Mañana</div>${pair('🌅 Amanecer en casa', 'up_start', 'Luz plena desde', 'up_end')}
        <div class="subh">🌙 Noche</div>${evening}
        <div class="hint">Las horas de la noche pueden pasar la medianoche (hasta las 05:00).</div>`;
    }

    const swatch = ct ? kelvinColor(now.k) : `rgba(247,184,79,${(0.15 + 0.85 * now.b / 100).toFixed(2)})`;
    const nowTxt = [ct ? `${now.k}K` : '', bri ? `${now.b}%` : ''].filter(Boolean).join(' · ');
    const sec = (n, title, sub) => `<div class="sec"><div><div class="h"><span class="num">${n}</span>${title}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div></div>`;
    const preset = (k1, v1, k2, v2, label) => `<button class="chip ${+u[k1] === v1 && +u[k2] === v2 ? 'on' : ''}" data-a="preset" data-k1="${k1}" data-v1="${v1}" data-k2="${k2}" data-v2="${v2}">${label}</button>`;
    const resumeOpts = [[0, 'Cuando se apague y se vuelva a prender'], [15, 'Después de 15 minutos'], [30, 'Después de 30 minutos'], [60, 'Después de 1 hora'], [120, 'Después de 2 horas'], [180, 'Después de 3 horas'], [240, 'Después de 4 horas'], [360, 'Después de 6 horas'], [480, 'Después de 8 horas'], [720, 'Después de 12 horas']];
    const adv = !!this._ov.adv;
    const advSummary = [`cada ${u.every} min`, u.transition === 'auto' ? 'transición continua' : +u.transition ? `transición ${u.transition} s` : 'cambio al instante', ct && u.z2m ? 'Zigbee2MQTT' : ''].filter(Boolean).join(' · ');
    let n = 0;
    return `<div class="today">
        <div class="now"><div class="sw2" style="background:${swatch};box-shadow:0 0 18px ${swatch}"></div>
          <div><div style="font-weight:600">Ahora: ${nowTxt}</div><div class="hint" style="margin:2px 0 0">Así se prenderían las luces en este momento</div></div></div>
        ${times}
        <div style="margin-top:12px">${strips}</div>
        <div class="hint" style="display:flex;justify-content:space-between;margin-top:4px"><span>0 h</span><span>6 h</span><span>12 h</span><span>18 h</span><span>24 h</span></div></div>

      ${sec(++n, 'Qué querés ajustar')}
      <div class="field">${this._seg('d', 'ui.adjust', u.adjust, [['both', 'Tono e intensidad'], ['ct', 'Sólo tono'], ['bri', 'Sólo intensidad']])}
        <div class="hint">${u.adjust === 'bri' ? 'Para dimmers y luces que no cambian de tono.' : u.adjust === 'ct' ? 'Sólo el color del blanco: la intensidad la manejás vos.' : 'El color del blanco y qué tan fuerte está la luz.'}</div></div>

      ${sec(++n, 'Luces')}
      <div class="field">${this._entBtn('d', 'ui.entities', u.entities, ['light'], 'Elegir luces', true, null, ct ? 'ct' : 'dim')}
        <div class="hint">${ct ? 'Sólo aparecen las luces que pueden cambiar el tono de blanco.' : 'Aparecen las luces que se pueden atenuar.'}</div></div>

      ${sec(++n, 'De cuánto a cuánto', 'El valor de la noche y el del día; en el medio va pasando de a poco')}
      ${ct ? `<div class="field"><div class="lbl">🎨 Tono de blanco</div>
        <div class="chips">${preset('kmin', 2200, 'kmax', 4000, 'Muy cálido')}${preset('kmin', 2200, 'kmax', 5000, 'Natural (recomendado)')}${preset('kmin', 2700, 'kmax', 6500, 'Más frío, tipo oficina')}</div>
        <div style="height:14px"></div>${slider('kmin', 'De noche (cálido)', 2000, 4000, 100, 'K')}<div style="height:12px"></div>${slider('kmax', 'De día (frío)', 3000, 6500, 100, 'K')}</div>` : ''}
      ${bri ? `<div class="field"><div class="lbl">💡 Intensidad</div>
        <div class="chips">${preset('bmin', 10, 'bmax', 100, 'Muy tenue de noche')}${preset('bmin', 30, 'bmax', 100, 'Suave de noche')}${preset('bmin', 60, 'bmax', 100, 'Apenas más baja')}</div>
        <div style="height:14px"></div>${slider('bmin', 'De noche', 1, 100, 1, '%')}<div style="height:12px"></div>${slider('bmax', 'De día', 1, 100, 1, '%')}</div>` : ''}

      ${sec(++n, 'Cuándo')}
      <div class="field">${this._seg('d', 'ui.curve', u.curve, [['sun', '☀️ Según el sol'], ['fixed', '🕗 Horario fijo']])}
        <div class="hint">${sun ? 'Se mueve sola con el amanecer y el atardecer de cada día.' : 'Las mismas horas todos los días.'}</div>
        ${ct && bri ? `<div class="seg" style="margin-top:12px"><button class="${sep ? '' : 'on'}" data-a="set" data-o="d" data-k="ui.b_sep" data-v="" data-t="bool">Tono e intensidad juntos</button><button class="${sep ? 'on' : ''}" data-a="set" data-o="d" data-k="ui.b_sep" data-v="1" data-t="bool">Por separado</button></div>
          <div class="hint">${sep ? 'Por separado: la luz se pone cálida a su hora, pero sigue fuerte hasta la hora que elijas.' : 'Juntos: el tono y la intensidad bajan al mismo tiempo.'}</div>` : ''}
        ${sched}</div>

      ${sec(++n, 'Si alguien toca una luz')}
      <div class="field"><div class="opt" style="margin:0"><button class="sw ${u.respect ? 'on' : ''}" data-a="set" data-o="d" data-k="ui.respect" data-v="${u.respect ? '' : '1'}" data-t="bool"></button><div style="font-weight:600">Respetar cambios manuales</div></div>
        <div class="hint">${u.respect
          ? 'Si alguien sube, baja o cambia el tono de una luz a mano, la automatización no se la pisa. Las demás luces siguen su horario normal.'
          : 'Las luces siempre siguen el horario: si alguien las cambia a mano, en la próxima actualización vuelven a lo que corresponde.'}</div>
        ${u.respect ? `<div class="lbl" style="margin-top:14px">Volver al horario</div>
          <select data-o="d" data-k="ui.resume" data-t="num">${resumeOpts.map(([v, l]) => `<option value="${v}" ${+u.resume === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <div class="hint">${+u.resume > 0
            ? `La luz que tocaste queda como la dejaste durante ${durText(+u.resume)} y después vuelve sola al horario, con transición suave. Apagarla y prenderla también la devuelve al horario.`
            : 'La luz que tocaste queda como la dejaste hasta que la apagues y la vuelvas a prender.'}</div>` : ''}</div>

      <button class="advh" data-a="adv"><ha-icon icon="mdi:tune-variant"></ha-icon><div class="tx"><div class="t1">Opciones avanzadas</div><div class="t2">${esc(advSummary)}</div></div><ha-icon icon="${adv ? 'mdi:chevron-up' : 'mdi:chevron-down'}"></ha-icon></button>
      ${adv ? `<div class="field" style="margin-top:8px"><div class="lbl">Actualizar cada</div>${this._chips('d', 'ui.every', u.every, [[1, '1 min'], [2, '2 min'], [5, '5 min'], [10, '10 min']])}
        <div class="hint">Cada cuánto se recalculan las luces prendidas. 5 minutos alcanza para que el cambio no se note.</div>
        <div class="lbl" style="margin-top:14px">Transición</div>${this._chips('d', 'ui.transition', u.transition, [['auto', 'Continua (recomendada)'], [0, 'Al instante'], [30, '30 s']])}
        <div class="hint">Continua: cada cambio dura hasta la próxima actualización, así la luz sube y baja de forma pareja, sin escalones. Al instante: salta de un valor al otro.</div>
        ${ct ? `<div class="opt" style="margin:16px 0 0"><button class="sw ${u.z2m ? 'on' : ''}" data-a="set" data-o="d" data-k="ui.z2m" data-v="${u.z2m ? '' : '1'}" data-t="bool"></button><div style="font-weight:600">Philips Hue y otras por Zigbee2MQTT</div></div>
          <div class="hint">Deja el tono listo con la luz apagada: al prenderla ya sale con el tono correcto, sin destello.</div>
          ${u.z2m ? this._z2mStatusHtml(u) : ''}` : ''}</div>` : ''}

      <div class="note">💡 Al prender una luz, se lleva al instante a lo que corresponde para esa hora. Las prendidas se van ajustando solas. Las luces puestas en un color con una escena no se tocan. Para que deje de ajustar, pausala con el interruptor de abajo.</div>`;
  }

  _z2mFetch(ents) {
    const missing = ents.filter((e) => !(e in (this._z2m || {})));
    if (!missing.length || this._z2mBusy) return this._z2mBusy || Promise.resolve();
    this._z2mBusy = this._ws('z2m_info', { entity_ids: missing }).then((r) => {
      this._z2m = { ...(this._z2m || {}), ...r.lights }; this._z2mMqtt = r.mqtt;
    }).catch(() => {}).finally(() => { this._z2mBusy = null; if (this._ov?.draft?.kind === 'circadian') this._renderOv(); });
    return this._z2mBusy;
  }
  _z2mStatusHtml(u) {
    const h = this._hass; const info = this._z2m || {};
    if (u.entities.some((e) => !(e in info))) { this._z2mFetch(u.entities); return '<div class="hint">Buscando las luces en Zigbee2MQTT…</div>'; }
    const rows = u.entities.map((e) => `<div class="optrow"><ha-icon icon="${info[e] ? 'mdi:check-circle' : 'mdi:minus-circle-outline'}" style="color:${info[e] ? '#3DBE8B' : 'var(--mae-sub)'}"></ha-icon><div class="tx">${esc(fname(h, e))}<div class="hint" style="margin:0">${info[e] ? `Zigbee2MQTT · ${esc(info[e])}` : 'No es de Zigbee2MQTT: se corrige al prenderla'}</div></div></div>`).join('');
    const warn = this._z2mMqtt === false ? '<div class="note" style="color:#e0832b">⚠ La integración MQTT no está configurada en Home Assistant.</div>' : '';
    return `<div style="margin-top:10px">${rows}</div>${warn}
      <div class="lbl" style="margin-top:12px">Tema base de Zigbee2MQTT</div><input type="text" value="${esc(u.z2m_base)}" data-o="d" data-k="ui.z2m_base" autocomplete="off">
      <div class="hint">Al guardar se activa sola la opción «execute_if_off» de cada lámpara en Zigbee2MQTT. Las Hue la soportan; otras marcas puede que no.</div>`;
  }

  _editor_irrigation(d) {
    const u = d.ui; const h = this._hass;
    const SW = ['switch', 'input_boolean', 'valve'];
    const withValve = u.zones.some((z) => z.valve);
    const mode = u.pump && withValve ? ['mdi:shield-check', `Bomba + electroválvulas: abre la válvula, espera ${u.pump_delay} s, prende la bomba; al terminar apaga la bomba, espera y cierra la válvula. Nunca empuja agua contra válvulas cerradas.`]
      : withValve ? ['mdi:pipe-valve', 'Sólo electroválvulas (presión de red): abre y cierra una zona por vez.']
      : u.pump ? ['mdi:pump', 'Sólo bomba: una sola zona, sin válvulas.'] : ['mdi:alert', 'Elegí la bomba y/o las electroválvulas de cada zona.'];
    const opt = (k, label, unit, def, attrs = '') => {
      const v = u[k]; const on = v !== null && v !== undefined;
      return `<div class="optrow"><button class="sw ${on ? 'on' : ''}" data-a="set" data-o="d" data-k="ui.${k}" data-v="${on ? '' : def}" ${on ? 'data-t="null"' : ''}></button><div class="tx">${label}</div>${on ? `<input type="number" inputmode="decimal" value="${esc(v)}" data-o="d" data-k="ui.${k}" data-t="num" ${attrs}><span class="unit">${unit}</span>` : ''}</div>`;
    };
    const svcs = Object.keys(h.services?.notify || {}).filter((s) => !['send_message', 'notify', 'persistent_notification'].includes(s));
    const zones = u.zones.map((z, i) => `<div class="zone">
      <div class="zh"><span class="zn">${i + 1}</span><input type="text" value="${esc(z.name)}" data-o="d" data-k="ui.zones.${i}.name" placeholder="Nombre de la zona">${u.zones.length > 1 ? `<button class="del" data-a="arrdel" data-k="ui.zones" data-i="${i}"><ha-icon icon="mdi:delete-outline"></ha-icon></button>` : ''}</div>
      <div class="lbl" style="margin-top:0">Electroválvula ${u.pump && !withValve && u.zones.length === 1 ? '(opcional)' : ''}</div>${this._entBtn('d', `ui.zones.${i}.valve`, z.valve, SW, 'Elegir electroválvula')}
      ${z.valve ? `<button class="chip" style="margin-top:6px" data-a="set" data-o="d" data-k="ui.zones.${i}.valve" data-v="" data-t="null">Quitar válvula</button>` : ''}
      <div class="lbl">Tiempo de riego</div>${this._num('d', `ui.zones.${i}.min`, z.min, 'min="1"', 'min')}
      ${+u.adjust !== 100 ? `<div class="hint">Con el ajuste del ${u.adjust}%: ${durText(Math.max(1, Math.round(+z.min * u.adjust / 100)))}</div>` : ''}
      <div class="lbl">Sensor de humedad del suelo (opcional)</div>${this._entBtn('d', `ui.zones.${i}.soil`, z.soil, ['sensor'], 'Sin sensor', false, ['moisture', 'humidity'])}
      ${z.soil ? `<div class="inl" style="margin-top:8px"><span class="unit">No regar si supera</span>${this._num('d', `ui.zones.${i}.soil_max`, z.soil_max, 'min="1"', '%')}</div>
        <button class="chip" style="margin-top:6px" data-a="set" data-o="d" data-k="ui.zones.${i}.soil" data-v="" data-t="null">Quitar sensor</button>` : ''}
    </div>`).join('');
    const starts = u.starts.map((m, i) => `<div class="srow"><div>${this._moment(`ui.starts.${i}`, m)}</div>${u.starts.length > 1 ? `<button class="del ib" style="width:36px;height:36px;color:var(--mae-sub)" data-a="arrdel" data-k="ui.starts" data-i="${i}"><ha-icon icon="mdi:close"></ha-icon></button>` : ''}</div>`).join('');
    return `<div class="sec"><div><div class="h">Bomba</div><div class="s">Opcional si tenés presión de red</div></div></div>
      <div class="field">${this._entBtn('d', 'ui.pump', u.pump, SW, 'Sin bomba')}
        ${u.pump ? '<button class="chip" style="margin-top:6px" data-a="set" data-o="d" data-k="ui.pump" data-v="" data-t="null">Quitar bomba</button>' : ''}
        <div class="mode"><ha-icon icon="${mode[0]}"></ha-icon><div>${esc(mode[1])}</div></div></div>
      <div class="sec"><div><div class="h">Zonas</div><div class="s">Se riegan una por vez, en orden</div></div></div>
      ${zones}
      ${withValve || !u.pump ? `<button class="add addsm" data-a="arradd" data-k="ui.zones" data-v="zone"><span class="plus"><ha-icon icon="mdi:plus"></ha-icon></span>Agregar zona</button>` : ''}
      <div class="sec"><div><div class="h">Horario de inicio</div></div></div>
      <div class="field">${starts}<button class="chip" style="margin-top:10px" data-a="arradd" data-k="ui.starts" data-v="start"><ha-icon icon="mdi:plus"></ha-icon>Otro horario</button></div>
      <div class="sec"><div><div class="h">Días</div></div></div>
      <div class="field">${this._seg('d', 'ui.days_mode', u.days_mode, [['week', 'Días de la semana'], ['every', 'Cada X días']])}
        <div style="margin-top:12px">${u.days_mode === 'every' ? `<div class="inl"><span class="unit">Cada</span>${this._num('d', 'ui.every', u.every, 'min="1" max="30"')}<span class="unit">días, desde el ${esc(u.anchor.split('-').reverse().join('/'))}</span></div>` : this._days('d', 'ui.days', u.days)}</div></div>
      <div class="sec"><div><div class="h">Temporada</div><div class="s">Meses en los que riega</div></div></div>
      <div class="field">${this._chips('d', 'ui.months', u.months, MONTHS.map((m, i) => [i + 1, m]), true)}
        <div class="chips" style="margin-top:10px"><button class="chip" data-a="months" data-v="all">Todo el año</button><button class="chip" data-a="months" data-v="warm">Sep a abr</button><button class="chip" data-a="months" data-v="none">Ninguno</button></div></div>
      <div class="sec"><div><div class="h">Ajuste de tiempos</div><div class="s">Subilo en verano, bajalo en invierno</div></div></div>
      <div class="field"><div class="lbl">Regar al <span class="rangev" data-show="adjust">${esc(u.adjust)}%</span></div><input type="range" min="10" max="200" step="10" value="${esc(u.adjust)}" data-o="d" data-k="ui.adjust" data-t="num" data-live="adjust"></div>
      <div class="sec"><div><div class="h">No regar si…</div><div class="s">Todo opcional: si no tenés el sensor, se ignora</div></div></div>
      <div class="field"><div class="lbl">Sensor de lluvia</div>${this._entBtn('d', 'ui.rain', u.rain, ['binary_sensor'], 'Sin sensor de lluvia', false, ['moisture'])}
        ${u.rain ? `<button class="chip" style="margin-top:6px" data-a="set" data-o="d" data-k="ui.rain" data-v="" data-t="null">Quitar sensor</button>
        <div class="opt" style="margin:12px 0 0"><button class="sw ${u.rain_stop ? 'on' : ''}" data-a="set" data-o="d" data-k="ui.rain_stop" data-v="${u.rain_stop ? '' : '1'}" data-t="bool"></button>Cortar el riego si empieza a llover</div>` : ''}</div>
      ${has(h, 'weather') ? `<div class="field"><div class="lbl">Pronóstico</div>${this._entBtn('d', 'ui.weather', u.weather, ['weather'], 'Sin pronóstico')}
        ${u.weather ? `<button class="chip" style="margin-top:6px" data-a="set" data-o="d" data-k="ui.weather" data-v="" data-t="null">No usar pronóstico</button>
        <div style="margin-top:8px">
          <div class="optrow"><button class="sw ${u.w_raining ? 'on' : ''}" data-a="set" data-o="d" data-k="ui.w_raining" data-v="${u.w_raining ? '' : '1'}" data-t="bool"></button><div class="tx">Está lloviendo ahora</div></div>
          ${opt('w_prob', 'Probabilidad de lluvia hoy de', '%', 60, 'min="1" max="100"')}
          ${opt('w_mm', 'Lluvia prevista hoy de', 'mm', 3, 'min="0" step="0.5"')}
          ${opt('w_frost', 'Temperatura menor a', '°', 4, 'step="0.5"')}
          ${opt('w_wind', 'Viento mayor a', esc(h.states[u.weather]?.attributes?.wind_speed_unit || 'km/h'), 30, 'min="1"')}
        </div>` : ''}</div>` : ''}
      <div class="sec"><div><div class="h">Avisos</div></div></div>
      <div class="field">${this._chips('d', 'ui.notify', u.notify || '', [['', 'Sin avisos', 'mdi:bell-off-outline'], ...svcs.map((s) => [s, notifyLabel(s), 'mdi:cellphone'])])}
        ${u.notify ? `<div style="margin-top:8px">
          <div class="optrow"><button class="sw ${u.n_skip ? 'on' : ''}" data-a="set" data-o="d" data-k="ui.n_skip" data-v="${u.n_skip ? '' : '1'}" data-t="bool"></button><div class="tx">Cuando no riega (y por qué)</div></div>
          <div class="optrow"><button class="sw ${u.n_start ? 'on' : ''}" data-a="set" data-o="d" data-k="ui.n_start" data-v="${u.n_start ? '' : '1'}" data-t="bool"></button><div class="tx">Cuando empieza</div></div>
          <div class="optrow"><button class="sw ${u.n_end ? 'on' : ''}" data-a="set" data-o="d" data-k="ui.n_end" data-v="${u.n_end ? '' : '1'}" data-t="bool"></button><div class="tx">Cuando termina</div></div></div>` : ''}</div>
      <div class="sec"><div><div class="h">Seguridad</div></div></div>
      <div class="field">
        ${u.pump && withValve ? `<div class="lbl">Espera entre válvula y bomba</div>${this._num('d', 'ui.pump_delay', u.pump_delay, 'min="1" max="60"', 's')}` : ''}
        ${u.zones.length > 1 ? `<div class="lbl" style="margin-top:12px">Pausa entre zonas</div>${this._num('d', 'ui.gap', u.gap, 'min="0" max="600"', 's')}` : ''}
        <div class="hint">Si se pausa, se edita, se borra o se reinicia Home Assistant en medio de un riego, apaga la bomba y cierra todas las válvulas.</div></div>`;
  }

  _editor_presence(d) {
    const u = d.ui;
    return `<div class="sec"><div><div class="h">Luces que se van a usar</div></div></div>
      <div class="field">${this._entBtn('d', 'ui.entities', u.entities, ['light', 'switch'], 'Elegir luces', true)}</div>
      <div class="sec"><div><div class="h">Desde</div></div></div>
      <div class="field">${this._seg('d', 'ui.start', u.start, [['sunset', 'Cuando oscurece'], ['time', 'Una hora']])}
      ${u.start === 'time' ? `<input type="time" style="margin-top:10px" value="${esc(u.from)}" data-o="d" data-k="ui.from">` : ''}</div>
      <div class="sec"><div><div class="h">Hasta</div></div></div><div class="field"><input type="time" value="${esc(u.to)}" data-o="d" data-k="ui.to"></div>
      <div class="sec"><div><div class="h">Cada luz queda prendida</div></div></div>
      <div class="field"><div class="inl"><span class="unit">entre</span>${this._num('d', 'ui.min', u.min, 'min="1"')}<span class="unit">y</span>${this._num('d', 'ui.max', u.max, 'min="1"')}<span class="unit">min</span></div></div>
      <div class="note">Activala cuando te vayas de viaje: elige una luz al azar, la prende un rato y la apaga, así parece que hay gente. Al pausarla se apagan todas.</div>`;
  }

  // ---------------------------------------------------------------- hoja
  _sheetHtml() {
    const s = this._ov.sheet; const h = this._hass;
    let title = '', body = '', foot = '', top = '';
    if (s.picker) { [title, body, foot, top] = this._pickerHtml(s); }
    else if (s.kind === 'invite') { [title, body, foot] = this._inviteSheet(s); }
    else if (s.kind === 'icon') {
      title = 'Ícono';
      body = `<div class="icgrid">${ICONS.map((i) => `<button class="${this._ov.draft.icon === i ? 'on' : ''}" data-a="seticon" data-v="${i}"><ha-icon icon="${i}"></ha-icon></button>`).join('')}</div>`;
    } else if (s.kind === 'confirm') {
      title = s.title; body = `<div class="note" style="margin-top:0">${esc(s.text)}</div>`;
      foot = `<button class="btn danger" style="margin-top:0" data-a="confirmok">${esc(s.ok)}</button>`;
    } else if (s.step === 'type') {
      const types = { triggers: TRIGGER_TYPES, conditions: COND_TYPES, actions: ACTION_TYPES }[s.list].filter((t) => !t.need || t.need(h));
      title = { triggers: 'Si…', conditions: 'Sólo si…', actions: 'Entonces…' }[s.list];
      body = `<div class="card">${types.map((t) => `<button class="item" data-a="picktype" data-v="${t.id}"><div class="ic" style="background:${t.color}"><ha-icon icon="${t.icon}"></ha-icon></div><div class="tx"><div class="t1">${esc(t.label)}</div>${t.hint ? `<div class="t2">Ej: ${esc(t.hint)}</div>` : ''}</div><ha-icon class="chev" icon="mdi:chevron-right"></ha-icon></button>`).join('')}</div>`;
    } else {
      title = typeOf(s.list, s.data.type).label;
      body = this[`_f_${s.list}_${s.data.type}`](s.data);
      const m = missing(s.list, s.data);
      foot = `<button class="btn pri" style="margin-top:0;${m ? 'opacity:.5' : ''}" data-a="sheetok">${m ? esc(m) : 'Listo'}</button>`;
    }
    const back = s.picker ? 'pickback' : (s.step === 'form' && s.index < 0 && !s.fixedType ? 'sheetback' : 'sheetclose');
    return `<div class="scrim ${s.picker ? 'top' : ''}" data-a="scrim"><div class="sheet ${s.picker ? 'full' : ''}" data-stop="1">
      <div class="sh-h"><button class="ib" data-a="${back}"><ha-icon icon="${back === 'sheetclose' ? 'mdi:close' : 'mdi:arrow-left'}"></ha-icon></button><h2>${esc(title)}</h2><span style="width:40px"></span></div>
      ${top ? `<div class="sh-top">${top}</div>` : ''}
      <div class="sh-b">${body}</div>${foot ? `<div class="sh-f">${foot}</div>` : ''}</div></div>`;
  }

  _pickerCandidates(p, ignoreType) {
    const h = this._hass; const hidden = new Set(this._settings?.hidden || []);
    const q = (p.search || '').toLowerCase();
    const out = [];
    for (const eid of Object.keys(h.states)) {
      const d = dom(eid);
      if (!p.domains.includes(d)) continue;
      if (hidden.has(eid)) continue;
      const scm = h.states[eid].attributes.supported_color_modes || [];
      if (p.flt === 'ct' && !scm.some((m) => ['color_temp', ...COLORED_MODES].includes(m))) continue;
      if (p.flt === 'dim' && (!scm.length || (scm.length === 1 && scm[0] === 'onoff'))) continue;
      if (p.flt === 'alarm' && !/next_alarm/.test(eid)) continue;
      if (p.flt === 'face' && !/_last_recognized_face$/.test(eid)) continue;
      const reg = h.entities?.[eid];
      if (reg && (reg.hidden || reg.entity_category)) continue;
      if (!ignoreType && p.type && d !== p.type) continue;
      const n = fname(h, eid); const a = areaName(h, eid);
      if (q && !`${n} ${a} ${eid} ${dlabel(d)}`.toLowerCase().includes(q)) continue;
      out.push({ eid, n, a, d });
    }
    return out;
  }
  _pickerListHtml(s) {
    const h = this._hass; const p = s.picker;
    const cur = p.o === 'd' ? getPath(this._ov.draft, p.k) : getPath(s.data, p.k);
    const dc = p.dc || [];
    const groups = {};
    for (const x of this._pickerCandidates(p)) (groups[x.a || ''] ||= []).push({ ...x, pref: dc.length && dc.includes(h.states[x.eid].attributes.device_class) });
    const keys = Object.keys(groups).sort((a, b) => (!a) - (!b) || a.localeCompare(b));
    const rows = keys.map((k) => `<div class="grp">${esc(k || 'Sin ambiente')}</div><div class="card">${groups[k].sort((a, b) => b.pref - a.pref || a.n.localeCompare(b.n)).map(({ eid, n, d }) => {
      const on = p.multi ? (cur || []).includes(eid) : cur === eid;
      const st = h.states[eid];
      return `<button class="item ent" data-a="pickset" data-v="${esc(eid)}"><ha-icon icon="${entIcon(h, eid)}" style="color:${on ? 'var(--mae-accent)' : 'var(--mae-sub)'}"></ha-icon><div class="tx"><div class="t1">${esc(n)}</div><div class="st">${esc(dlabel(d))} · ${esc(st.state)}${unitOf(h, eid) ? ` ${esc(unitOf(h, eid))}` : ''}</div></div>${p.multi ? `<span class="check ${on ? 'on' : ''}">${on ? '<ha-icon icon="mdi:check"></ha-icon>' : ''}</span>` : on ? '<ha-icon icon="mdi:check" style="color:var(--mae-accent)"></ha-icon>' : ''}</button>`;
    }).join('')}</div>`).join('');
    return `<div class="plist">${rows || '<div class="empty">No se encontraron dispositivos</div>'}</div>`;
  }
  _pickerChipsHtml(s) {
    const p = s.picker;
    const counts = {};
    for (const x of this._pickerCandidates(p, true)) counts[x.d] = (counts[x.d] || 0) + 1;
    const ds = Object.keys(counts).sort((a, b) => dlabel(a).localeCompare(dlabel(b)));
    if (ds.length < 2) return '<div class="tchips"></div>';
    return `<div class="tchips">${[['', 'Todos']].concat(ds.map((d) => [d, `${dlabel(d).replace(/ \(.*\)$/, '')} · ${counts[d]}`])).map(([v, l]) => `<button class="chip ${(p.type || '') === v ? 'on' : ''}" data-a="ptype" data-v="${v}">${esc(l)}</button>`).join('')}</div>`;
  }
  _pickerHtml(s) {
    const p = s.picker;
    const top = `<div class="search"><input type="text" placeholder="Buscar por nombre, ambiente o tipo…" value="${esc(p.search || '')}" data-a="search" autocomplete="off"></div>${this._pickerChipsHtml(s)}`;
    return [p.multi ? 'Elegí dispositivos' : 'Elegí un dispositivo', this._pickerListHtml(s), p.multi ? `<button class="btn pri" style="margin-top:0" data-a="pickback">Listo</button>` : '', top];
  }

  // ---------- formularios de disparadores
  _f_triggers_device(t) {
    const h = this._hass; let s = `<div class="field"><div class="lbl">Dispositivo</div>${this._entBtn('s', 'entity', t.entity, t._need?.domains || STATE_DOMAINS, 'Elegir dispositivo o sensor')}</div>`;
    if (!t.entity) return s;
    if (isNumeric(h, t.entity)) {
      s += `<div class="field"><div class="lbl">Cuando el valor</div>${this._seg('s', 'dir', t.dir || 'above', [['above', 'Supera'], ['below', 'Baja de']])}
        <div style="margin-top:10px">${this._num('s', 'value', t.value, 'step="any"', unitOf(h, t.entity))}</div>
        <div class="hint">Valor actual: ${esc(h.states[t.entity]?.state)} ${esc(unitOf(h, t.entity))}</div></div>`;
    } else {
      const opts = stateOptions(h, t.entity, false).map((o) => [o.v, o.l]);
      s += `<div class="field"><div class="lbl">Cuando</div>${this._chips('s', 'to', t.to || '', [...opts, ['', 'Cualquier cambio']])}</div>`;
    }
    if (t.dir || t.to) {
      s += `<div class="field"><div class="lbl">Durante al menos</div>${this._chips('s', 'for_min', t.for_min || 0, [[0, 'Al instante'], [1, '1 min'], [5, '5 min'], [10, '10 min'], [30, '30 min'], [60, '1 h']])}
        <div style="margin-top:10px">${this._num('s', 'for_min', t.for_min || 0, 'min="0"', 'min')}</div>
        <div class="hint">Ej: «la puerta queda abierta durante 5 minutos» o «no hay movimiento durante 10 minutos».</div></div>`;
    }
    return s;
  }
  _f_triggers_time(t) {
    return `<div class="field"><div class="lbl">Hora</div><input type="time" value="${esc(t.at)}" data-o="s" data-k="at"></div>
      <div class="field"><div class="lbl">Días</div>${this._days('s', 'days', t.days)}</div>`;
  }
  _f_triggers_sun(t) {
    return `<div class="field"><div class="lbl">Momento</div>${this._seg('s', 'event', t.event, [['sunrise', '🌅 Amanecer'], ['sunset', '🌇 Atardecer']])}</div>
      <div class="field"><div class="lbl">Cuándo</div><select data-o="s" data-k="offset" data-t="num">${[-120, -90, -60, -45, -30, -15, 0, 15, 30, 45, 60, 90, 120].map((v) => `<option value="${v}" ${+t.offset === v ? 'selected' : ''}>${v === 0 ? 'Justo en el momento' : `${durText(Math.abs(v))} ${v < 0 ? 'antes' : 'después'}`}</option>`).join('')}</select>
      <div class="hint">Se ajusta solo cada día según la estación del año.</div></div>
      <div class="field"><div class="lbl">Días</div>${this._days('s', 'days', t.days)}</div>`;
  }
  _f_triggers_weather(t) {
    const h = this._hass; const ws = listOf(h, 'weather');
    let s = ws.length > 1 ? `<div class="field"><div class="lbl">Pronóstico</div>${this._entBtn('s', 'entity', t.entity, ['weather'], 'Elegir')}</div>` : '';
    s += `<div class="field"><div class="lbl">Qué mirar</div>${this._chips('s', 'what', t.what, [['temp', 'Temperatura', 'mdi:thermometer'], ['humidity', 'Humedad', 'mdi:water-percent'], ['wind', 'Viento', 'mdi:weather-windy'], ['condition', 'Estado del cielo', 'mdi:weather-cloudy']])}</div>`;
    if (t.what === 'condition') {
      s += `<div class="field"><div class="lbl">Cuando pase a</div>${this._chips('s', 'conds', t.conds, Object.entries(WEATHER).map(([v, l]) => [v, l]), true)}</div>`;
    } else {
      const a = h.states[t.entity]?.attributes || {};
      const unit = { temp: a.temperature_unit || '°', humidity: '%', wind: a.wind_speed_unit || 'km/h' }[t.what];
      const cur = { temp: a.temperature, humidity: a.humidity, wind: a.wind_speed }[t.what];
      s += `<div class="field"><div class="lbl">Cuando</div>${this._seg('s', 'dir', t.dir, [['above', 'Supera'], ['below', 'Baja de']])}<div style="margin-top:10px">${this._num('s', 'value', t.value, 'step="any"', unit)}</div>${cur != null ? `<div class="hint">Ahora: ${esc(cur)} ${esc(unit)}</div>` : ''}</div>`;
    }
    return s;
  }
  _f_triggers_presence(t) {
    const h = this._hass; const people = listOf(h, 'person');
    let s = `<div class="field"><div class="lbl">Quién</div>${this._chips('s', 'who', t.who, [['first', 'Llega el primero', 'mdi:home-import-outline'], ['last', 'Se va el último', 'mdi:home-export-outline'], ...people.map((p) => [p, fname(h, p), 'mdi:account'])])}</div>`;
    if (t.who && !['first', 'last'].includes(t.who)) {
      const zones = listOf(h, 'zone');
      s += `<div class="field"><div class="lbl">Cuando</div>${this._seg('s', 'event', t.event || 'arrive', [['arrive', 'Llega'], ['leave', 'Se va']])}</div>`;
      if (zones.length > 1) s += `<div class="field"><div class="lbl">Lugar</div>${this._chips('s', 'zone', t.zone || 'zone.home', zones.map((z) => [z, z === 'zone.home' ? 'Casa' : fname(h, z)]))}</div>`;
    }
    return s + '<div class="note">Usa la ubicación de la app de Home Assistant en el celular de cada persona.</div>';
  }
  _f_triggers_alarm(t) {
    return `<div class="field"><div class="lbl">Alarma</div>${this._entBtn('s', 'entity', t.entity, ['alarm_control_panel'], 'Elegir alarma')}</div>
      <div class="field"><div class="lbl">Cuando pase a</div>${this._chips('s', 'to', t.to, Object.entries(ALARM))}</div>`;
  }
  _f_triggers_button(t) {
    const h = this._hass;
    let s = `<div class="field"><div class="lbl">Botón</div>${this._entBtn('s', 'entity', t.entity, ['event'], 'Elegir botón o control')}</div>`;
    if (t.entity) {
      const types = h.states[t.entity]?.attributes?.event_types || [];
      const lbl = { single: 'Una pulsación', double: 'Doble pulsación', long: 'Mantener', long_press: 'Mantener', press: 'Pulsación', initial_press: 'Al presionar', hold: 'Mantener', triple: 'Triple', short_release: 'Pulsación corta', long_release: 'Al soltar (largo)' };
      s += `<div class="field"><div class="lbl">Tipo de pulsación</div>${this._chips('s', 'event_type', t.event_type || '', [['', 'Cualquiera'], ...types.map((v) => [v, lbl[v] || v])])}</div>`;
    }
    return s;
  }
  _f_triggers_interval(t) {
    return `<div class="field"><div class="lbl">Repetir cada</div><div class="inl">${this._num('s', 'every', t.every, 'min="1"')}</div><div style="margin-top:10px">${this._seg('s', 'unit', t.unit, [['min', 'Minutos'], ['h', 'Horas']])}</div>
      <div class="hint">Combinalo con «Sólo si…» para limitarlo a un horario.</div></div>`;
  }
  _f_triggers_calendar(t) {
    return `<div class="field"><div class="lbl">Calendario</div>${this._entBtn('s', 'entity', t.entity, ['calendar'], 'Elegir calendario')}</div>
      <div class="field"><div class="lbl">Cuando el evento</div>${this._seg('s', 'event', t.event, [['start', 'Empieza'], ['end', 'Termina']])}</div>
      <div class="field"><div class="lbl">Anticipación</div>${this._chips('s', 'offset', t.offset || 0, [[0, 'En el momento'], [5, '5 min antes'], [15, '15 min antes'], [30, '30 min antes'], [60, '1 h antes']])}</div>`;
  }

  // ---------- formularios de condiciones
  _f_conditions_time(c) {
    return `<div class="field"><div class="opt"><button class="sw ${c.allday ? '' : 'on'}" data-a="set" data-o="s" data-k="allday" data-v="${c.allday ? '' : '1'}" data-t="bool"></button>Limitar a un horario</div>
      ${c.allday ? '' : `<div class="inl"><input type="time" value="${esc(c.after)}" data-o="s" data-k="after"><span class="unit">a</span><input type="time" value="${esc(c.before)}" data-o="s" data-k="before"></div><div class="hint">Puede pasar la medianoche (ej: 22:00 a 06:00).</div>`}</div>
      <div class="field"><div class="lbl">Días</div>${this._days('s', 'days', c.days)}</div>`;
  }
  _f_conditions_sun(c) {
    return `<div class="field">${this._seg('s', 'when', c.when, [['night', '🌙 De noche'], ['day', '☀️ De día']])}<div class="hint">Según la salida y puesta del sol en tu ubicación.</div></div>`;
  }
  _f_conditions_device(c) {
    const h = this._hass; let s = `<div class="field"><div class="lbl">Dispositivo</div>${this._entBtn('s', 'entity', c.entity, STATE_DOMAINS, 'Elegir dispositivo o sensor')}</div>`;
    if (!c.entity) return s;
    if (isNumeric(h, c.entity)) {
      s += `<div class="field"><div class="lbl">El valor es</div>${this._seg('s', 'dir', c.dir || 'above', [['above', 'Mayor a'], ['below', 'Menor a']])}<div style="margin-top:10px">${this._num('s', 'value', c.value, 'step="any"', unitOf(h, c.entity))}</div><div class="hint">Valor actual: ${esc(h.states[c.entity]?.state)} ${esc(unitOf(h, c.entity))}</div></div>`;
    } else {
      s += `<div class="field"><div class="lbl">Está</div>${this._chips('s', 'state', c.state, stateOptions(h, c.entity, true).map((o) => [o.v, o.l]))}</div>`;
    }
    return s;
  }
  _f_conditions_presence(c) {
    const h = this._hass; const people = listOf(h, 'person');
    let s = `<div class="field">${this._chips('s', 'who', c.who, [['anyone', 'Hay alguien en casa', 'mdi:home-account'], ['nobody', 'No hay nadie', 'mdi:home-outline'], ...people.map((p) => [p, fname(h, p), 'mdi:account'])])}</div>`;
    if (c.who && !['anyone', 'nobody'].includes(c.who)) s += `<div class="field">${this._seg('s', 'where', c.where || 'home', [['home', 'Está en casa'], ['away', 'Está fuera']])}</div>`;
    return s;
  }
  _f_conditions_alarm(c) {
    return `<div class="field"><div class="lbl">Alarma</div>${this._entBtn('s', 'entity', c.entity, ['alarm_control_panel'], 'Elegir alarma')}</div>
      <div class="field"><div class="lbl">Está</div>${this._chips('s', 'state', c.state, Object.entries(ALARM).filter(([v]) => !['pending', 'arming'].includes(v)))}</div>`;
  }
  _f_conditions_dates(c) {
    const dd = (k, v) => `<select data-o="s" data-k="${k}" data-t="num">${Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}" ${+v === i + 1 ? 'selected' : ''}>${i + 1}</option>`).join('')}</select>`;
    const mm = (k, v) => `<select data-o="s" data-k="${k}" data-t="num">${MONTHS.map((m, i) => `<option value="${i + 1}" ${+v === i + 1 ? 'selected' : ''}>${m}</option>`).join('')}</select>`;
    return `<div class="field"><div class="lbl">Desde</div><div class="inl">${dd('from_d', c.from_d)}${mm('from_m', c.from_m)}</div></div>
      <div class="field"><div class="lbl">Hasta</div><div class="inl">${dd('to_d', c.to_d)}${mm('to_m', c.to_m)}</div><div class="hint">Se repite todos los años. Puede cruzar el año nuevo.</div></div>`;
  }

  // ---------- formularios de acciones
  _f_actions_device(a) {
    const h = this._hass;
    let s = `<div class="field"><div class="lbl">Dispositivo</div>${this._entBtn('s', 'entity', a.entity, a._need?.domains || ACTION_DOMAINS, 'Elegir dispositivo')}</div>`;
    if (!a.entity) return s;
    const ops = opsFor(h, a.entity);
    s += `<div class="field"><div class="lbl">Qué hacer</div><div class="chips">${ops.map((o) => `<button class="chip ${a.op === o.id ? 'on' : ''}" data-a="setop" data-v="${o.id}"><ha-icon icon="${o.icon}"></ha-icon>${esc(o.label)}</button>`).join('')}</div></div>`;
    const op = ops.find((o) => o.id === a.op);
    for (const p of op?.params || []) {
      const v = a.params?.[p.key];
      const on = v !== undefined && v !== null;
      let ctl = '';
      if (on || !p.opt) {
        const val = on ? v : p.def;
        if (p.type === 'range') ctl = `<input type="range" min="${p.min}" max="${p.max}" step="${p.step || 1}" value="${esc(val)}" data-o="s" data-k="params.${p.key}" data-t="num" data-live="${p.key}">`;
        else if (p.type === 'number') ctl = this._num('s', `params.${p.key}`, val, `min="${p.min ?? ''}" max="${p.max ?? ''}" step="${p.step || 'any'}"`, p.unit);
        else if (p.type === 'select') ctl = this._chips('s', `params.${p.key}`, val, p.options);
        else if (p.type === 'color') ctl = `<input type="color" value="${esc(val)}" data-o="s" data-k="params.${p.key}">`;
        else ctl = `<input type="text" value="${esc(val)}" data-o="s" data-k="params.${p.key}">`;
      }
      const head = p.opt
        ? `<div class="opt"><button class="sw ${on ? 'on' : ''}" data-a="ptoggle" data-k="${p.key}"></button>${esc(p.label)}${on && p.type === 'range' ? `<span class="rangev" style="margin-left:auto" data-show="${p.key}">${esc(v)}${p.unit || ''}</span>` : ''}</div>`
        : `<div class="lbl">${esc(p.label)}${p.type === 'range' ? `<span class="rangev" data-show="${p.key}">${esc(on ? v : p.def)}${p.unit || ''}</span>` : ''}</div>`;
      s += `<div class="field">${head}${ctl}</div>`;
    }
    return s;
  }
  _f_actions_area(a) {
    const h = this._hass;
    const areas = Object.values(h.areas || {}).sort((x, y) => x.name.localeCompare(y.name));
    const ad = AREA_DOMAINS.find((x) => x[0] === a.domain);
    return `<div class="field"><div class="lbl">Dónde</div>${this._chips('s', 'area', a.area, [['all', 'Toda la casa', 'mdi:home'], ...areas.map((x) => [x.area_id, x.name])])}</div>
      <div class="field"><div class="lbl">Qué equipos</div>${this._chips('s', 'domain', a.domain, AREA_DOMAINS.map(([v, l, ic]) => [v, l, ic]))}</div>
      ${ad ? `<div class="field"><div class="lbl">Qué hacer</div>${this._chips('s', 'op', a.op, ad[3])}</div>` : ''}`;
  }
  _f_actions_scene(a) { return `<div class="field">${this._entBtn('s', 'entity', a.entity, ['scene', 'script'], 'Elegir escena')}</div>`; }
  _f_actions_rule(a) {
    const others = (this._rules || []).filter((r) => r.id !== this._ov.draft.id && r.kind !== 'timer');
    if (!others.length) return '<div class="note">Todavía no hay otras escenas o automatizaciones.</div>';
    return `<div class="field"><div class="lbl">Cuál</div><div class="card">${others.map((r) => `<button class="item" data-a="set" data-o="s" data-k="rule_id" data-v="${r.id}"><div class="ic" style="background:${esc(r.color)}"><ha-icon icon="${esc(r.icon)}"></ha-icon></div><div class="tx"><div class="t1">${esc(r.name)}</div></div>${a.rule_id === r.id ? '<ha-icon icon="mdi:check" style="color:var(--mae-accent)"></ha-icon>' : ''}</button>`).join('')}</div></div>
      <div class="field"><div class="lbl">Qué hacer</div>${this._seg('s', 'op', a.op, [['run', 'Ejecutar'], ['enable', 'Activar'], ['disable', 'Pausar']])}</div>`;
  }
  _f_actions_notify(a) {
    const h = this._hass;
    const svcs = Object.keys(h.services?.notify || {}).filter((s) => !['send_message', 'notify', 'persistent_notification'].includes(s));
    return `<div class="field"><div class="lbl">A quién</div>${this._chips('s', 'target', a.target, [['persistent', 'En Home Assistant', 'mdi:bell'], ...svcs.map((s) => [s, notifyLabel(s), s.startsWith('mobile_app_') ? 'mdi:cellphone' : 'mdi:message'])])}
      ${svcs.length ? '' : '<div class="hint">Para recibir avisos en el celular instalá la app de Home Assistant e iniciá sesión.</div>'}</div>
      <div class="field"><div class="lbl">Título (opcional)</div><input type="text" value="${esc(a.title)}" data-o="s" data-k="title"></div>
      <div class="field"><div class="lbl">Mensaje</div><textarea data-o="s" data-k="message">${esc(a.message)}</textarea></div>`;
  }
  _f_actions_speak(a) {
    const h = this._hass;
    return `<div class="field"><div class="lbl">Voz</div>${this._chips('s', 'tts', a.tts, listOf(h, 'tts').map((e) => [e, fname(h, e)]))}</div>
      <div class="field"><div class="lbl">Parlante</div>${this._entBtn('s', 'player', a.player, ['media_player'], 'Elegir parlante')}</div>
      <div class="field"><div class="lbl">Qué decir</div><textarea data-o="s" data-k="message">${esc(a.message)}</textarea></div>`;
  }
  _f_actions_delay(a) {
    return `<div class="field"><div class="inl">${this._num('s', 'h', a.h, 'min="0"', 'h')}${this._num('s', 'm', a.m, 'min="0"', 'min')}${this._num('s', 's', a.s, 'min="0"', 's')}</div>
      <div class="chips" style="margin-top:10px">${[[0, 0, 30], [0, 1, 0], [0, 5, 0], [0, 15, 0], [1, 0, 0]].map(([hh, mm, ss]) => `<button class="chip" data-a="delayq" data-h="${hh}" data-m="${mm}" data-s="${ss}">${ss ? `${ss} s` : durText(hh * 60 + mm)}</button>`).join('')}</div></div>`;
  }
  _f_actions_wait(a) {
    const h = this._hass;
    let s = `<div class="field"><div class="lbl">Dispositivo</div>${this._entBtn('s', 'entity', a.entity, STATE_DOMAINS.filter((d) => !['sensor', 'number', 'input_number'].includes(d)), 'Elegir dispositivo')}</div>`;
    if (a.entity) s += `<div class="field"><div class="lbl">Esperar hasta que</div>${this._chips('s', 'to', a.to, stateOptions(h, a.entity, false).map((o) => [o.v, o.l]))}</div>`;
    s += `<div class="field"><div class="lbl">Esperar como máximo</div>${this._num('s', 'timeout', a.timeout, 'min="0"', 'min')}<div class="hint">0 = sin límite. Si se cumple el tiempo, sigue igual con las próximas acciones.</div></div>`;
    return s;
  }

  // ------------------------------------------------------------ eventos
  _onEvent(e) {
    const type = e.type;
    if (type === 'input') {
      const t = e.target;
      if (t.dataset.a === 'search') { this._ov.sheet.picker.search = t.value; this._refreshPicker(); return; }
      if (t.dataset.a === 'ssearch') {
        this._ov.ssearch = t.value;
        const tmp = document.createElement('div'); tmp.innerHTML = this._settingsListHtml();
        this._ovEl.shadowRoot.querySelector('.slist')?.replaceWith(tmp.querySelector('.slist'));
        return;
      }
      if (t.dataset.live) { const lbl = t.closest('.field')?.querySelector(`[data-show="${t.dataset.live}"]`); if (lbl) lbl.textContent = lbl.textContent.replace(/^[\d.]+/, t.value); }
    }
    if (type === 'input' || type === 'change') {
      // se guarda sin volver a dibujar: si no, en el celular se pierde el toque
      // en «Listo» que viene justo después de escribir
      const t = e.target;
      if (!t.dataset || !t.dataset.k || t.dataset.a || !this._ov) return;
      let v = t.value;
      if (t.dataset.t === 'num') v = v === '' ? null : +v;
      this._setVal(t.dataset.o, t.dataset.k, v, type === 'change' && (t.tagName === 'SELECT' || t.type === 'time'));
      return;
    }
    // click
    const el = e.composedPath().find((n) => n.dataset && n.dataset.a);
    if (!el) return;
    if (el.dataset.a === 'scrim' && e.composedPath().some((n) => n.dataset?.stop)) return;
    const ds = el.dataset;
    e.stopPropagation();
    this._act(ds.a, ds, el);
  }

  _target(o) { return o === 'd' ? this._ov.draft : this._ov.sheet.data; }
  _setVal(o, k, v, render = true) {
    const obj = this._target(o);
    setPath(obj, k, v);
    if (o === 'd') this._ov.dirty = true;
    if (render) this._renderOv();
  }

  async _act(a, ds) {
    const h = this._hass; const o = this._ov;
    switch (a) {
      // ----- tarjeta
      case 'tab': this._tab = ds.v; this._render(); return;
      case 'create': this._nav({ page: 'create' }); return;
      case 'openhome': if (this._rules) this._openOv({ page: 'home' }); return;
      case 'settings': this._nav({ page: 'settings', hidden: [...(this._settings?.hidden || [])], clientOff: [...(this._settings?.client_off || [])], ssearch: '' }); return;
      case 'coff': { const i = o.clientOff.indexOf(ds.v); if (i >= 0) o.clientOff.splice(i, 1); else o.clientOff.push(ds.v); this._renderOv(); return; }
      case 'stoggle': { const i = o.hidden.indexOf(ds.v); if (i >= 0) o.hidden.splice(i, 1); else o.hidden.push(ds.v); this._renderOv(); return; }
      case 'sgrp': {
        const ents = this._settingsCandidates().filter((e) => dom(e) === ds.v);
        const set = new Set(o.hidden);
        ents.forEach((e) => (ds.on === '1' ? set.delete(e) : set.add(e)));
        o.hidden = [...set]; this._renderOv(); return;
      }
      case 'ssave':
        try { await this._ws('set_settings', { settings: { hidden: o.hidden, client_off: o.clientOff || [] } }); this._toast('Guardado ✓'); this._back(); } catch (err) { this._toast(err.message, true); }
        return;
      case 'edit': {
        const r = (this._rules || []).find((x) => x.id === ds.id); if (!r) return;
        if (!this._isAdmin && (r.locked || installerOnly(r))) { this._toast('La armó tu instalador: la podés activar o pausar, pero no cambiarla'); return; }
        const draft = clone(r);
        if (draft.kind === 'timer') draft.ui.start_now = false;
        if (draft.kind === 'circadian') normCirc(draft.ui);
        this._nav({ page: 'editor', draft }); return;
      }
      case 'cancel': try { await this._ws('cancel', { rule_id: ds.id }); } catch (err) { this._toast(err.message, true); } return;
      case 'irstop': try { await this._ws('set_enabled', { rule_id: ds.id, enabled: false }); await this._ws('set_enabled', { rule_id: ds.id, enabled: true }); this._toast('Riego detenido'); } catch (err) { this._toast(err.message, true); } return;
      case 'runscene': {
        try { await this._ws('run', { rule_id: ds.id }); this._done[ds.id] = 1; this._render(); setTimeout(() => { delete this._done[ds.id]; this._render(); }, 1300); } catch (err) { this._toast(err.message || 'Error', true); }
        return;
      }
      case 'toggle': {
        const r = this._rules.find((x) => x.id === ds.id);
        try { await this._ws('set_enabled', { rule_id: ds.id, enabled: !r.enabled }); } catch (err) { this._toast(err.message, true); }
        return;
      }
      // ----- overlay: crear
      case 'close': this._closeOv(); return;
      case 'newscene': this._nav({ page: 'editor', draft: newDraft('scene') }); this._ov.sheet = { list: 'actions', step: 'type', index: -1 }; this._renderOv(); return;
      case 'newauto': this._nav({ page: 'editor', draft: newDraft('auto') }); this._openItem('triggers', -1, this._defaults('triggers', ds.v), true); return;
      case 'newkind': this._nav({ page: 'editor', draft: newDraft(ds.v) }); return;
      case 'newnight': {
        const draft = newDraft('period', { icon: 'mdi:weather-night', color: '#5B6CD9', name: 'Luces de noche' });
        Object.assign(draft.ui, { on: { type: 'sunset', at: '19:00', offset: 0 }, off: { type: 'sunrise', at: '07:00', offset: 0 }, catch_up: true });
        this._nav({ page: 'editor', draft }); return;
      }
      case 'newocc': {
        const draft = newDraft('room', { icon: 'mdi:account-check-outline', color: '#7A8699' });
        Object.assign(draft.ui, { only_sensor: true, timeout: 2, door_timeout: 0, on_door: true });
        this._nav({ page: 'editor', draft }); return;
      }
      case 'newdim': { const draft = newDraft('circadian', { icon: 'mdi:brightness-6' }); draft.ui.adjust = 'bri'; this._nav({ page: 'editor', draft }); return; }
      case 'idea': { const idea = IDEAS[+ds.v]; const draft = idea.make(); if (!draft.name) draft.name = idea.name; draft.color = idea.color; this._nav({ page: 'editor', draft }); return; }
      // ----- editor
      case 'back': this._back(); return;
      case 'arradd': {
        const arr = getPath(o.draft, ds.k);
        arr.push(ds.v === 'zone' ? newZone(arr.length + 1) : ds.v === 'block' ? { from: '12:00', on: true, cool: 24, heat: 21 } : { type: 'time', at: '20:00', offset: 0 });
        o.dirty = true; this._renderOv(); return;
      }
      case 'arrdel': getPath(o.draft, ds.k).splice(+ds.i, 1); o.dirty = true; this._renderOv(); return;
      case 'months': o.draft.ui.months = { all: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], warm: [1, 2, 3, 4, 9, 10, 11, 12], none: [] }[ds.v]; this._renderOv(); return;
      case 'ptype': o.sheet.picker.type = ds.v; this._refreshPicker(); return;
      case 'ctab': this._ctab = ds.v; o._resetScroll = true; this._renderOv(); return;
      case 'invquick': {
        const r = (this._rules || []).find((x) => x.id === ds.id); if (!r) return;
        await this._act('edit', { id: ds.id }); await this._act('invnew', {}); return;
      }
      case 'invnew': {
        const devs = o.draft.ui.devices || [];
        o.sheet = { kind: 'invite', data: { name: '', preset: 'today', from: localInput(new Date()), until: localInput(new Date(Date.now() + 864e5)), weekly: false, days: [], hours: false, h_from: '08:00', h_to: '18:00', max_uses: 0, devices: [...devs] } };
        this._renderOv(); return;
      }
      case 'invedit': {
        const live = (this._rules || []).find((x) => x.id === o.draft.id); const i = (live?.invites || []).find((x) => x.id === ds.v); if (!i) return;
        o.sheet = { kind: 'invite', link: !!this._invLink(live, i), data: { ...clone(i), preset: i.until ? 'custom' : 'never', from: i.from ? localInput(new Date(i.from)) : '', until: i.until ? localInput(new Date(i.until)) : '', weekly: !!(i.days || []).length, days: i.days || [], h_from: i.h_from || '08:00', h_to: i.h_to || '18:00', reset_uses: false } };
        this._renderOv(); return;
      }
      case 'invsave': {
        const x = o.sheet.data; const [a, b] = invWindow(x);
        if (!String(x.name || '').trim()) { this._toast('Poné el nombre', true); return; }
        if (b && b <= a) { this._toast('Revisá las fechas', true); return; }
        const isNew = !x.id;
        const inv = { id: x.id, name: x.name.trim(), from: a.toISOString(), until: b ? b.toISOString() : null, weekly: x.weekly, days: x.days, hours: x.hours, h_from: x.h_from, h_to: x.h_to, max_uses: +x.max_uses || 0, devices: x.devices, paused: !!x.paused, reset_uses: !!x.reset_uses };
        try {
          const res = await this._ws('guest_invite', { rule_id: o.draft.id, invite: inv });
          o.sheet = null; this._renderOv();
          this._toast(isNew ? 'Invitación creada ✓' : 'Guardado ✓');
          const live = (this._rules || []).find((r) => r.id === o.draft.id) || o.draft;
          if (isNew) await this._invShare(live, res);
        } catch (err) { this._toast(err.message, true); }
        return;
      }
      case 'invshare': {
        const live = (this._rules || []).find((x) => x.id === o.draft.id); const i = (live?.invites || []).find((x) => x.id === ds.v);
        if (live && i) await this._invShare(live, i); return;
      }
      case 'invcopy': {
        const live = (this._rules || []).find((x) => x.id === o.draft.id); const i = (live?.invites || []).find((x) => x.id === ds.v);
        const link = this._invLink(live, i); if (!link) return;
        try { await navigator.clipboard.writeText(link); this._toast('Link copiado ✓'); } catch (_) { window.prompt('Copiá el link', link); }
        return;
      }
      case 'invdel': {
        const id = ds.v; const nm = o.sheet?.data?.name || '';
        o.sheet = { kind: 'confirm', title: 'Borrar invitación', text: `¿Borrar la invitación de ${nm}? El link deja de funcionar.`, ok: 'Borrar', run: async () => { await this._ws('guest_delete', { rule_id: o.draft.id, invite_id: id }); o.sheet = null; this._renderOv(); this._toast('Borrada'); } };
        this._renderOv(); return;
      }
      case 'cinetoggle': try { await this._ws('action', { rule_id: ds.id, action: 'cine_toggle' }); } catch (err) { this._toast(err.message, true); } return;
      case 'addtxt': {
        const val = String(getPath(o.draft, ds.src) || '').trim();
        if (!val) return;
        const arr = getPath(o.draft, ds.k);
        if (!arr.includes(val)) arr.push(val);
        setPath(o.draft, ds.src, ''); o.dirty = true; this._renderOv(); return;
      }
      case 'door': this._nav({ page: 'door', id: ds.id }); return;
      case 'dooract':
        try {
          await this._ws('action', { rule_id: o.id, action: ds.v });
          this._toast({ open: '🔓 Abriendo…', open2: '🚗 Abriendo…', test: 'Aviso de prueba enviado' }[ds.v] || 'Listo');
        } catch (err) { this._toast(err.message, true); }
        return;
      case 'newrem': {
        const draft = newDraft('reminder', { icon: 'mdi:bell-ring-outline', color: '#F7B84F' });
        const t = new Date(Date.now() + 3600e3);
        Object.assign(draft.ui, { date: isoDay(t), time: `${pad(t.getHours())}:00`, recipients: Object.keys(h.services?.notify || {}).filter((x) => x.startsWith('mobile_app_')) });
        this._nav({ page: 'editor', draft }); return;
      }
      case 'calalert': {
        const ex = (this._rules || []).find((r) => r.kind === 'calalert');
        if (ex) { this._nav({ page: 'editor', draft: clone(ex) }); return; }
        const draft = newDraft('calalert', { icon: 'mdi:calendar-alert', color: '#F78FCF', name: 'Avisos del calendario' });
        draft.ui.calendars = Object.keys(h.states).filter((e) => dom(e) === 'calendar');
        draft.ui.recipients = Object.keys(h.services?.notify || {}).filter((x) => x.startsWith('mobile_app_'));
        this._nav({ page: 'editor', draft }); return;
      }
      case 'remwhen': {
        const t = new Date(); const u = o.draft.ui;
        if (ds.v === '1h') { t.setTime(Date.now() + 3600e3); u.time = `${pad(t.getHours())}:${pad(t.getMinutes())}`; }
        else if (ds.v === 'tonight') { u.time = '20:00'; if (t.getHours() >= 20) t.setDate(t.getDate() + 1); }
        else if (ds.v === 'tomorrow') { t.setDate(t.getDate() + 1); u.time = '09:00'; }
        u.date = isoDay(t); o.dirty = true; this._renderOv(); return;
      }
      case 'remdel': try { await this._ws('delete', { rule_id: ds.id }); } catch (err) { this._toast(err.message, true); } return;
      case 'wpreset': {
        const hidden = new Set(this._settings?.hidden || []);
        const st = h.states; const dc = (e) => st[e]?.attributes?.device_class;
        const pick = {
          open: (e) => (dom(e) === 'binary_sensor' && ['door', 'window', 'garage_door', 'opening'].includes(dc(e))) || (dom(e) === 'cover' && ['garage', 'gate', 'door'].includes(dc(e))) || dom(e) === 'lock',
          climate: (e) => ['climate', 'water_heater'].includes(dom(e)),
          lights: (e) => dom(e) === 'light',
        }[ds.v];
        const found = Object.keys(st).filter((e) => pick(e) && !hidden.has(e) && !(h.entities?.[e]?.hidden || h.entities?.[e]?.entity_category));
        o.draft.ui.ents = [...new Set([...o.draft.ui.ents, ...found])];
        o.dirty = true; this._toast(found.length ? `Agregué ${found.length}` : 'No encontré equipos de ese tipo'); this._renderOv(); return;
      }
      case 'preset': o.draft.ui[ds.k1] = +ds.v1; o.draft.ui[ds.k2] = +ds.v2; o.dirty = true; this._renderOv(); return;
      case 'adv': o.adv = !o.adv; this._renderOv(); return;
      case 'set': {
        let v = ds.v;
        if (ds.t === 'bool') v = !!v;
        else if (ds.t === 'null') v = v === '' ? null : v;
        else if (v !== '' && !isNaN(v) && !['rule_id', 'to', 'state', 'option', 'event_type', 'area', 'target', 'tts', 'who', 'zone', 'color', 'transition'].includes(ds.k.split('.').pop()) && !/^#/.test(v)) v = +v;
        // un dispositivo nuevo o un tipo nuevo invalidan las opciones dependientes
        this._setVal(ds.o, ds.k, v);
        return;
      }
      case 'mset': {
        const obj = this._target(ds.o); const arr = [...(getPath(obj, ds.k) || [])];
        const val = /months$/.test(ds.k) ? +ds.v : ds.v;
        const i = arr.indexOf(val); if (i >= 0) arr.splice(i, 1); else arr.push(val);
        if (typeof val === 'number') arr.sort((a, b) => a - b);
        this._setVal(ds.o, ds.k, arr); return;
      }
      case 'day': {
        const obj = this._target(ds.o); let arr = [...(getPath(obj, ds.k) || [])];
        arr = arr.includes(ds.v) ? arr.filter((x) => x !== ds.v) : [...arr, ds.v];
        this._setVal(ds.o, ds.k, ALL_DAYS.filter((x) => arr.includes(x))); return;
      }
      case 'dayset': this._setVal(ds.o, ds.k, { all: [...ALL_DAYS], week: ['mon', 'tue', 'wed', 'thu', 'fri'], wkend: ['sat', 'sun'] }[ds.v]); return;
      case 'denabled': o.draft.enabled = o.draft.enabled === false; o.dirty = true; this._renderOv(); return;
      case 'dlock': o.draft.locked = !o.draft.locked; o.dirty = true; this._renderOv(); return;
      case 'iconsheet': o.sheet = { kind: 'icon' }; this._renderOv(); return;
      case 'seticon': o.draft.icon = ds.v; o.dirty = true; o.sheet = null; this._renderOv(); return;
      case 'timerq': o.draft.ui.h = +ds.h; o.draft.ui.m = +ds.m; this._renderOv(); return;
      case 'additem': o.sheet = { list: ds.l, step: 'type', index: -1 }; this._renderOv(); return;
      case 'edititem': this._openItem(ds.l, +ds.i, clone(o.draft.ui[ds.l][+ds.i]), true); return;
      case 'delitem': o.draft.ui[ds.l].splice(+ds.i, 1); o.dirty = true; this._renderOv(); return;
      case 'move': { const arr = o.draft.ui[ds.l]; const i = +ds.i; const j = i + +ds.v; [arr[i], arr[j]] = [arr[j], arr[i]]; o.dirty = true; this._renderOv(); return; }
      case 'save': return this._save();
      case 'testrun': try { await this._ws('run', { rule_id: o.draft.id }); this._toast(o.draft.kind === 'irrigation' ? 'Regando…' : 'Ejecutando…'); } catch (err) { this._toast(err.message, true); } return;
      case 'delete': o.sheet = { kind: 'confirm', title: 'Eliminar', text: `¿Seguro que querés eliminar «${o.draft.name}»?`, ok: 'Eliminar', run: async () => { await this._ws('delete', { rule_id: o.draft.id }); this._exit(); this._toast('Eliminada'); } }; this._renderOv(); return;
      case 'confirmok': try { await o.sheet.run(); } catch (err) { this._toast(err.message, true); } return;
      // ----- hoja
      case 'scrim': o.sheet = null; this._renderOv(); return;
      case 'sheetclose': o.sheet = null; this._renderOv(); return;
      case 'sheetback': o.sheet.step = 'type'; this._renderOv(); return;
      case 'picktype': this._openItem(o.sheet.list, o.sheet.index, this._defaults(o.sheet.list, ds.v), false); return;
      case 'sheetok': {
        const s = o.sheet; const m = missing(s.list, s.data);
        if (m) { this._toast(m, true); return; }
        const arr = o.draft.ui[s.list];
        if (s.index < 0) arr.push(s.data); else arr[s.index] = s.data;
        if (s.data._link && s.data.entity) for (const l of ['triggers', 'actions']) for (const it of o.draft.ui[l]) if (it._link === s.data._link && !it.entity) { it.entity = s.data.entity; if (it.type === 'device' && l === 'actions') this._fixOp(it); }
        o.dirty = true; o.sheet = null; this._renderOv(); return;
      }
      case 'setop': {
        const d = o.sheet.data; const op = opsFor(h, d.entity).find((x) => x.id === ds.v);
        d.op = op.id; d.svc = op.svc; d.label = op.label;
        const keep = d.params || {}; d.params = {};
        for (const p of op.params || []) { if (keep[p.key] !== undefined) d.params[p.key] = keep[p.key]; else if (!p.opt) d.params[p.key] = p.def; }
        this._renderOv(); return;
      }
      case 'ptoggle': {
        const d = o.sheet.data; d.params ||= {};
        const op = opsFor(h, d.entity).find((x) => x.id === d.op); const p = op.params.find((x) => x.key === ds.k);
        if (d.params[ds.k] !== undefined && d.params[ds.k] !== null) delete d.params[ds.k];
        else { d.params[ds.k] = p.def; if (p.excl) delete d.params[p.excl]; }
        this._renderOv(); return;
      }
      case 'delayq': Object.assign(o.sheet.data, { h: +ds.h, m: +ds.m, s: +ds.s }); this._renderOv(); return;
      case 'pick': {
        const domains = ds.dom.split(',');
        const holder = ds.o === 'd' ? o.draft : o.sheet.data;
        const need = holder._need || {};
        const picker = { o: ds.o, k: ds.k, domains, multi: !!ds.multi, search: '', type: '', dc: ds.dc ? ds.dc.split(',') : need.dc, flt: ds.flt };
        if (ds.o === 'd') o.sheet = { picker, standalone: true };
        else o.sheet.picker = picker;
        this._renderOv(); return;
      }
      case 'pickset': {
        const p = o.sheet.picker; const tgt = p.o === 'd' ? o.draft : o.sheet.data;
        if (p.multi) {
          const arr = [...(getPath(tgt, p.k) || [])]; const i = arr.indexOf(ds.v);
          if (i >= 0) arr.splice(i, 1); else arr.push(ds.v);
          setPath(tgt, p.k, arr); if (p.o === 'd') o.dirty = true; this._refreshPicker(); return;
        }
        const changed = getPath(tgt, p.k) !== ds.v;
        setPath(tgt, p.k, ds.v);
        if (changed) this._onEntityChanged(p.o, tgt);
        if (p.o === 'd') { o.dirty = true; o.sheet = null; } else o.sheet.picker = null;
        this._renderOv(); return;
      }
      case 'pickback': if (o.sheet.standalone) o.sheet = null; else o.sheet.picker = null; this._renderOv(); return;
    }
  }

  _refreshPicker() {
    const root = this._ovEl.shadowRoot; const s = this._ov.sheet;
    const tmp = document.createElement('div');
    tmp.innerHTML = this._pickerListHtml(s) + this._pickerChipsHtml(s);
    root.querySelector('.plist')?.replaceWith(tmp.querySelector('.plist'));
    root.querySelector('.tchips')?.replaceWith(tmp.querySelector('.tchips'));
  }

  _onEntityChanged(o, tgt) {
    const h = this._hass;
    if (o === 'd') {
      if (this._ov.draft.kind === 'timer') { const ops = opsFor(h, tgt.ui.entity).map((x) => x.id); if (!ops.includes(tgt.ui.op)) tgt.ui.op = ops.includes('off') ? 'off' : ops[0]; }
      return;
    }
    const s = this._ov.sheet; const d = s.data;
    if (s.list === 'actions' && d.type === 'device') this._fixOp(d);
    if ((s.list === 'triggers' || s.list === 'conditions') && d.type === 'device') {
      if (isNumeric(h, d.entity)) { d.dir ||= 'above'; delete d.to; delete d.state; }
      else {
        delete d.dir; delete d.value;
        const opts = stateOptions(h, d.entity, s.list === 'conditions').map((x) => x.v);
        if (s.list === 'triggers' && d.to && !opts.includes(d.to)) d.to = opts[0] || '';
        if (s.list === 'conditions' && !opts.includes(d.state)) d.state = opts[0];
      }
    }
    if (d.type === 'button') d.event_type = '';
    if (d.type === 'wait') d.to = stateOptions(h, d.entity, false)[0]?.v;
  }
  _fixOp(d) {
    const ops = opsFor(this._hass, d.entity);
    let op = ops.find((x) => x.id === d.op) || ops[0];
    d.op = op.id; d.svc = op.svc; d.label = op.label;
    const keep = d.params || {}; d.params = {};
    for (const p of op.params || []) { if (keep[p.key] !== undefined) d.params[p.key] = keep[p.key]; else if (!p.opt) d.params[p.key] = p.def; }
  }

  _openItem(list, index, data, fixedType) {
    this._ov.sheet = { list, index, step: 'form', data, fixedType };
    this._renderOv();
  }

  _defaults(list, type) {
    const h = this._hass;
    const first = (d) => listOf(h, d)[0] || null;
    const now = new Date();
    const at = `${pad(now.getHours())}:${pad(Math.floor(now.getMinutes() / 5) * 5)}`;
    if (list === 'triggers') return {
      device: { type, entity: null, to: '', for_min: 0 },
      time: { type, at: '07:00', days: [...ALL_DAYS] },
      sun: { type, event: 'sunset', offset: 0, days: [...ALL_DAYS] },
      weather: { type, entity: first('weather'), what: 'temp', dir: 'above', value: 30, conds: [] },
      presence: { type, who: 'first', event: 'arrive', zone: 'zone.home' },
      alarm: { type, entity: first('alarm_control_panel'), to: 'triggered' },
      button: { type, entity: null, event_type: '' },
      interval: { type, every: 15, unit: 'min' },
      calendar: { type, entity: first('calendar'), event: 'start', offset: 0 },
    }[type];
    if (list === 'conditions') return {
      time: { type, allday: false, after: '20:00', before: '06:00', days: [...ALL_DAYS] },
      sun: { type, when: 'night' },
      device: { type, entity: null },
      presence: { type, who: 'anyone', where: 'home' },
      alarm: { type, entity: first('alarm_control_panel'), state: 'disarmed' },
      dates: { type, from_d: 1, from_m: 12, to_d: 6, to_m: 1 },
    }[type];
    return {
      device: { type, entity: null, op: null, svc: null, params: {} },
      area: { type, area: 'all', domain: 'light', op: 'off' },
      scene: { type, entity: null },
      rule: { type, rule_id: null, op: 'run' },
      notify: { type, target: Object.keys(h.services?.notify || {}).find((s) => s.startsWith('mobile_app_')) || 'persistent', title: '', message: '' },
      speak: { type, tts: first('tts'), player: null, message: '' },
      delay: { type, h: 0, m: 1, s: 0 },
      wait: { type, entity: null, to: null, timeout: 10 },
    }[type] || { type, at };
  }

  async _save() {
    const o = this._ov; const d = o.draft;
    const err = draftError(d);
    if (err) { this._toast(err, true); return; }
    if (d.kind === 'reminder') { d.name = (d.ui.text || '').trim().slice(0, 80); if (d.ui.done) { d.ui.done = false; d.enabled = true; } }
    if (d.kind === 'timer' && !d.name) d.name = `${fname(this._hass, d.ui.entity)}: ${(opsFor(this._hass, d.ui.entity).find((x) => x.id === d.ui.op) || {}).label || ''}`.trim();
    let z2mIeee = [];
    if (d.kind === 'circadian') {
      d.ui.z2m_map = {};
      if (d.ui.z2m) {
        await this._z2mFetch(d.ui.entities);
        for (const e of d.ui.entities) if (this._z2m?.[e]) d.ui.z2m_map[e] = this._z2m[e];
        z2mIeee = Object.values(d.ui.z2m_map);
      }
    }
    let payload;
    try { payload = compileRule(this._hass, d); } catch (e) { this._toast(e.message, true); return; }
    try {
      await this._ws('save', { rule: payload });
      if (d.kind === 'timer') this._tab = 'timer';
      else this._tab = d.kind === 'scene' ? 'scene' : d.kind === 'auto' ? 'auto' : REM_KINDS.includes(d.kind) ? 'rem' : 'smart';
      if (z2mIeee.length) {
        try { await this._ws('z2m_setup', { ieee: z2mIeee, base: d.ui.z2m_base || 'zigbee2mqtt' }); }
        catch (e) { this._toast(`Guardado, pero no se pudo configurar Zigbee2MQTT: ${e.message}`, true); }
      }
      this._exit();
      this._render();
      this._toast(d.kind === 'timer' && payload.fire_at ? 'Temporizador iniciado' : 'Guardado ✓');
    } catch (e) { this._toast(e.message || 'No se pudo guardar', true); }
  }
}

function getPath(obj, path) { return path.split('.').reduce((a, k) => (a == null ? a : a[k]), obj); }
function setPath(obj, path, v) {
  const ks = path.split('.'); let cur = obj;
  for (let i = 0; i < ks.length - 1; i++) { cur[ks[i]] ??= {}; cur = cur[ks[i]]; }
  cur[ks[ks.length - 1]] = v;
}

if (!customElements.get('matterai-escenas-card')) customElements.define('matterai-escenas-card', MatterAIEscenasCard);

// Panel propio en la barra lateral ("menú Automatizaciones", como en Tuya / eWeLink)
class MatterAIEscenasPanel extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: 'open' }); }
  set hass(h) { this._hass = h; this._build(); this._card.hass = h; this._mb.hass = h; }
  set narrow(n) { this._narrow = n; if (this._mb) this._mb.narrow = n; }
  set panel(p) { this._panel = p; this._title(); }
  _title() { const t = this.shadowRoot.querySelector('.t'); if (t) t.textContent = this._panel?.title || 'Automatizaciones'; }
  _build() {
    if (this._card) return;
    this.shadowRoot.innerHTML = `<style>
      :host{display:block;min-height:100vh;background:var(--primary-background-color)}
      .tb{position:sticky;top:0;z-index:4;display:flex;align-items:center;gap:8px;height:var(--header-height,56px);box-sizing:content-box;padding:env(safe-area-inset-top,0px) 12px 0 4px;background:var(--app-header-background-color,var(--primary-color));color:var(--app-header-text-color,#fff);border-bottom:var(--app-header-border-bottom,none)}
      .t{font-size:20px;font-weight:400;margin-left:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    </style><div class="tb"><span class="mb"></span><div class="t"></div></div><div class="ct"></div>`;
    this._mb = document.createElement('ha-menu-button');
    this._mb.hass = this._hass; this._mb.narrow = this._narrow;
    this.shadowRoot.querySelector('.mb').appendChild(this._mb);
    this._card = document.createElement('matterai-escenas-card');
    this._card.setConfig({ panel: true, title: 'Automatizaciones' });
    this.shadowRoot.querySelector('.ct').appendChild(this._card);
    this._title();
  }
}
if (!customElements.get('matterai-escenas-panel')) customElements.define('matterai-escenas-panel', MatterAIEscenasPanel);
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === 'matterai-escenas-card')) {
  window.customCards.push({ type: 'matterai-escenas-card', name: 'MatterAI Escenas', description: 'Escenas y automatizaciones fáciles, para cualquier usuario (sin ser administrador).', preview: false });
}
console.info(`%c MATTERAI-ESCENAS %c v${VERSION} `, 'background:#4F8EF7;color:#fff;border-radius:3px 0 0 3px', 'background:#333;color:#fff;border-radius:0 3px 3px 0');
})();
