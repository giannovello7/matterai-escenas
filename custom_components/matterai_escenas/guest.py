"""Invitados: links temporales para abrir el portón / la puerta sin depender de vos.

Cada regla «guest» tiene los equipos que pueden manejar los invitados y una lista
de invitaciones. Cada invitación es un link secreto con su propio vencimiento,
días y horarios, cantidad de usos y equipos permitidos.

El invitado abre el link y ve una página simple (servida por Home Assistant, sin
usuario ni contraseña) con un botón por equipo. Abrir el link no hace nada: sólo
el botón (POST) actúa, así la vista previa de WhatsApp no abre el portón.
"""

from __future__ import annotations

import hmac
import json
import logging
import secrets
import time
import uuid
from collections.abc import Callable
from datetime import datetime, timedelta
from html import escape
from typing import Any

from aiohttp import web

from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.network import NoURLAvailableError, get_url
from homeassistant.util import dt as dt_util

from .const import DOMAIN, KIND_GUEST
from .notify import Notifier

_LOGGER = logging.getLogger(__name__)

GUEST_PATH = f"/api/{DOMAIN}/invitado"
DOMAINS = {"cover", "lock", "switch", "light", "input_boolean", "button", "input_button", "script"}
CAN_CLOSE = {"cover", "lock", "switch", "light", "input_boolean"}
WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
MAX_HISTORY = 40
MAX_INVITES = 60
COOLDOWN = 4  # segundos entre dos toques al mismo equipo (un pulso de más cierra el portón)
KEEP_EXPIRED = timedelta(days=7)  # las vencidas se ven una semana y después se borran
FAIL_WINDOW = 600
FAIL_MAX = 15


def _hm(t: Any) -> int | None:
    try:
        h, m = str(t).split(":")[:2]
        return int(h) * 60 + int(m)
    except (TypeError, ValueError):
        return None


def _dt(value: Any) -> datetime | None:
    if not value:
        return None
    parsed = dt_util.parse_datetime(str(value))
    if parsed is None:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt_util.get_default_time_zone())
    return dt_util.as_utc(parsed)


def _int(value: Any, default: int = 0) -> int:
    try:
        return max(0, int(value))
    except (TypeError, ValueError):
        return default


def mkey(entity_id: str) -> str:
    return entity_id.replace(".", "__")


def clean_invite(raw: dict[str, Any], old: dict[str, Any] | None, devices: list[str]) -> dict[str, Any]:
    """Valida lo que manda la tarjeta. El token lo genera siempre el servidor."""
    name = str(raw.get("name") or "").strip()[:40]
    if not name:
        raise ValueError("Poné el nombre del invitado")
    start = _dt(raw.get("from"))
    until = _dt(raw.get("until"))
    if until is not None and start is not None and until <= start:
        raise ValueError("La invitación tiene que terminar después de empezar")
    days = [d for d in raw.get("days") or [] if d in WEEK]
    h_from, h_to = _hm(raw.get("h_from")), _hm(raw.get("h_to"))
    if raw.get("hours") and (h_from is None or h_to is None or h_from == h_to):
        raise ValueError("Revisá el horario permitido")
    allowed = [e for e in raw.get("devices") or [] if e in devices] or list(devices)
    inv = {
        "id": (old or {}).get("id") or uuid.uuid4().hex[:10],
        "token": (old or {}).get("token") or secrets.token_urlsafe(18),
        "name": name,
        "from": start.isoformat() if start else None,
        "until": until.isoformat() if until else None,
        "days": days if raw.get("weekly") else [],
        "hours": bool(raw.get("hours")),
        "h_from": raw.get("h_from") if raw.get("hours") else None,
        "h_to": raw.get("h_to") if raw.get("hours") else None,
        "max_uses": _int(raw.get("max_uses")),
        "uses": (old or {}).get("uses", 0),
        "devices": allowed,
        "created": (old or {}).get("created") or dt_util.utcnow().isoformat(),
        "created_by": (old or {}).get("created_by") or raw.get("created_by"),
        "last_used": (old or {}).get("last_used"),
        "paused": bool(raw.get("paused")),
    }
    return inv


def invite_state(inv: dict[str, Any], now: datetime | None = None) -> tuple[str, str]:
    """(código, texto) — «ok» si ahora puede abrir."""
    now = now or dt_util.utcnow()
    if inv.get("paused"):
        return "paused", "La invitación está pausada"
    start, until = _dt(inv.get("from")), _dt(inv.get("until"))
    if start and now < start:
        local = dt_util.as_local(start)
        return "early", f"Tu invitación empieza el {local.day}/{local.month} a las {local:%H:%M}"
    if until and now > until:
        return "expired", "Tu invitación venció"
    if inv.get("max_uses") and inv.get("uses", 0) >= inv["max_uses"]:
        return "used", "Ya usaste todas las aperturas de tu invitación"
    local = dt_util.as_local(now)
    if inv.get("days") and WEEK[local.weekday()] not in inv["days"]:
        return "day", "Hoy no está habilitado tu acceso"
    if inv.get("hours"):
        a, b, m = _hm(inv.get("h_from")), _hm(inv.get("h_to")), local.hour * 60 + local.minute
        if a is not None and b is not None:
            inside = a <= m < b if a < b else (m >= a or m < b)
            if not inside:
                return "hours", f"Tu acceso es de {inv['h_from']} a {inv['h_to']}"
    return "ok", ""


class GuestController:
    """Lleva el historial, los avisos y las aperturas de una regla de invitados."""

    def __init__(self, hass: HomeAssistant, rule: dict[str, Any], on_change: Callable[[], None], manager=None) -> None:
        self.hass = hass
        self.rule = rule
        self.rule_id = rule["id"]
        self.u = rule.get("ui") or {}
        self.manager = manager
        self._on_change = on_change
        self._last: dict[str, float] = {}
        self._denied: dict[str, float] = {}
        self.notifier = Notifier(hass, self.rule_id, self.u.get("recipients"))

    @callback
    def start(self) -> None:
        self.prune()

    @callback
    def stop(self) -> None:
        return

    def as_dict(self) -> dict[str, Any]:
        return {"guest_base": base_url(self.hass, self.u)}

    # ------------------------------------------------------------ invitaciones
    @property
    def invites(self) -> list[dict[str, Any]]:
        return self.rule.setdefault("invites", [])

    @callback
    def prune(self) -> None:
        now = dt_util.utcnow()
        keep = [i for i in self.invites if not (_dt(i.get("until")) and now - _dt(i["until"]) > KEEP_EXPIRED)]
        if len(keep) != len(self.invites):
            self.rule["invites"] = keep
            if self.manager:
                self.manager.set_rule_extra(self.rule_id, "invites", keep)

    def _label(self, entity_id: str) -> str:
        label = ((self.u.get("cfg") or {}).get(mkey(entity_id)) or {}).get("label")
        if label:
            return str(label)
        st = self.hass.states.get(entity_id)
        return st.attributes.get("friendly_name", entity_id) if st else entity_id

    def _can_close(self, entity_id: str) -> bool:
        dom = entity_id.split(".")[0]
        cfg = (self.u.get("cfg") or {}).get(mkey(entity_id)) or {}
        return dom in CAN_CLOSE and bool(cfg.get("close", dom == "cover"))

    def devices_for(self, inv: dict[str, Any]) -> list[dict[str, Any]]:
        out = []
        for i, e in enumerate(self.u.get("devices") or []):
            if e not in (inv.get("devices") or []):
                continue
            st = self.hass.states.get(e)
            dom = e.split(".")[0]
            state = st.state if st else "unavailable"
            out.append({
                "i": i, "label": self._label(e), "dom": dom, "state": state,
                "text": {"open": "Abierto", "opening": "Abriendo…", "closed": "Cerrado", "closing": "Cerrando…",
                         "locked": "Cerrada con llave", "unlocked": "Abierta", "unlocking": "Abriendo…", "locking": "Cerrando…",
                         "on": "Prendido", "off": "Apagado", "unavailable": "Sin conexión"}.get(state, "") if dom not in ("button", "input_button", "script") else "",
                "open": {"cover": "Abrir", "lock": "Abrir"}.get(dom, "Prender" if dom in ("light", "input_boolean") else "Abrir"),
                "close": ({"cover": "Cerrar", "lock": "Cerrar con llave"}.get(dom, "Apagar")) if self._can_close(e) else None,
            })
        return out

    async def async_use(self, inv: dict[str, Any], index: int, action: str, ip: str | None) -> tuple[bool, str]:
        devices = self.u.get("devices") or []
        if index < 0 or index >= len(devices) or devices[index] not in (inv.get("devices") or []):
            return False, "Ese equipo no está en tu invitación"
        code, text = invite_state(inv)
        name = inv.get("name", "Invitado")
        entity_id = devices[index]
        label = self._label(entity_id)
        if code != "ok":
            await self._notify_denied(inv, f"{name} intentó usar «{label}»: {text.lower()}")
            return False, text
        if action == "close" and not self._can_close(entity_id):
            return False, "No podés cerrar este equipo"
        now = time.monotonic()
        if now - self._last.get(entity_id, 0) < COOLDOWN:
            return False, "Esperá unos segundos y volvé a probar"
        st = self.hass.states.get(entity_id)
        if st is None or st.state == "unavailable":
            return False, f"«{label}» no responde ahora"
        dom = entity_id.split(".")[0]
        # seguro: con un solo pulso, «abrir» con el portón abierto lo cerraría
        if dom == "cover":
            if action == "open" and st.state in ("open", "opening"):
                return True, f"«{label}» ya está abierto"
            if action == "close" and st.state in ("closed", "closing"):
                return True, f"«{label}» ya está cerrado"
        service = {
            ("cover", "open"): "cover.open_cover", ("cover", "close"): "cover.close_cover",
            ("lock", "open"): "lock.unlock", ("lock", "close"): "lock.lock",
            ("button", "open"): "button.press", ("input_button", "open"): "input_button.press",
            ("script", "open"): "script.turn_on",
        }.get((dom, action)) or (f"homeassistant.turn_{'on' if action == 'open' else 'off'}")
        data: dict[str, Any] = {"entity_id": entity_id}
        if dom == "lock" and self.u.get("code"):
            data["code"] = str(self.u["code"])
        self._last[entity_id] = now
        svc_domain, _, svc = service.partition(".")
        try:
            await self.hass.services.async_call(svc_domain, svc, data, blocking=True)
        except Exception as err:  # noqa: BLE001 - el invitado ve un mensaje simple
            _LOGGER.warning("Invitado %s no pudo usar %s: %s", name, entity_id, err)
            return False, f"No se pudo usar «{label}». Avisale al dueño de casa."
        verb = {"open": "abrió", "close": "cerró"}[action]
        if action == "open":
            inv["uses"] = inv.get("uses", 0) + 1
        inv["last_used"] = dt_util.utcnow().isoformat()
        self._history({"at": inv["last_used"], "who": name, "invite": inv["id"], "device": label, "action": action, "ip": ip})
        if self.u.get("notify_use", True):
            left = ""
            if inv.get("max_uses"):
                rest = inv["max_uses"] - inv["uses"]
                left = f" (le quedan {rest})" if rest > 0 else " (era su último uso)"
            self.hass.async_create_task(self.notifier.send(
                "🎟 Invitados", f"{name} {verb} {label}{left}", tag=f"use_{inv['id']}",
                actions=[(f"revoke:{inv['id']}", f"🚫 Bloquear a {name}")],
            ))
        if action == "open":
            return True, f"¡Listo! {label}: {'abriendo' if dom == 'cover' else 'abierto'}"
        return True, f"¡Listo! {label}: {'cerrando' if dom == 'cover' else 'cerrado'}"

    async def _notify_denied(self, inv: dict[str, Any], text: str) -> None:
        if not self.u.get("notify_denied", True):
            return
        now = time.monotonic()
        if now - self._denied.get(inv["id"], 0) < 600:  # un aviso cada 10 minutos por invitación
            return
        self._denied[inv["id"]] = now
        self._history({"at": dt_util.utcnow().isoformat(), "who": inv.get("name"), "invite": inv["id"], "device": "", "action": "denied", "text": text})
        await self.notifier.send("🎟 Invitados", text, tag=f"deny_{inv['id']}")

    @callback
    def _history(self, entry: dict[str, Any]) -> None:
        hist = [entry, *(self.rule.get("history") or [])][:MAX_HISTORY]
        self.rule["history"] = hist
        if self.manager:
            self.manager.set_rule_extra(self.rule_id, "history", hist)
            self.manager.set_rule_extra(self.rule_id, "invites", self.invites)
        self._on_change()

    def on_action(self, action: str) -> None:
        if action.startswith("revoke:"):
            inv_id = action.split(":", 1)[1]
            for inv in self.invites:
                if inv["id"] == inv_id:
                    inv["paused"] = True
                    if self.manager:
                        self.manager.set_rule_extra(self.rule_id, "invites", self.invites)
                    self.hass.async_create_task(self.notifier.send("🎟 Invitados", f"Listo: {inv['name']} ya no puede entrar. Podés reactivarlo desde la tarjeta.", tag=f"use_{inv_id}"))
                    self._on_change()


def base_url(hass: HomeAssistant, ui: dict[str, Any]) -> str | None:
    custom = str(ui.get("base_url") or "").strip().rstrip("/")
    if custom.startswith("https://") or custom.startswith("http://"):
        return custom
    try:
        return get_url(hass, allow_internal=False, prefer_external=True).rstrip("/")
    except NoURLAvailableError:
        return None


# ---------------------------------------------------------------- página del invitado
class GuestView(HomeAssistantView):
    url = GUEST_PATH + "/{token}"
    name = f"api:{DOMAIN}:invitado"
    requires_auth = False
    cors_allowed = False

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self._fails: dict[str, list[float]] = {}

    def _blocked(self, ip: str) -> bool:
        now = time.monotonic()
        hits = [t for t in self._fails.get(ip, []) if now - t < FAIL_WINDOW]
        self._fails[ip] = hits
        return len(hits) >= FAIL_MAX

    def _fail(self, ip: str) -> None:
        self._fails.setdefault(ip, []).append(time.monotonic())
        if len(self._fails) > 2000:  # no crece sin límite
            self._fails.clear()

    def _find(self, token: str) -> tuple[GuestController, dict[str, Any]] | None:
        manager = self.hass.data.get(DOMAIN)
        if manager is None or not token or len(token) > 64:
            return None
        found = None
        for rule in manager.rules.values():
            if rule.get("kind") != KIND_GUEST:
                continue
            for inv in rule.get("invites") or []:
                if hmac.compare_digest(str(inv.get("token", "")), token):
                    found = (rule, inv)
        if found is None:
            return None
        runner = manager.runners.get(found[0]["id"])
        ctl = runner.room if runner else None
        if ctl is None:
            return None
        # el controlador tiene la misma lista (dict de la regla)
        return ctl, found[1]

    @staticmethod
    def _headers() -> dict[str, str]:
        return {"Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow",
                "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY"}

    async def get(self, request: web.Request, token: str) -> web.Response:
        ip = request.remote or "?"
        if self._blocked(ip):
            return web.Response(status=429, text="Demasiados intentos. Probá más tarde.", headers=self._headers())
        found = self._find(token)
        if found is None:
            self._fail(ip)
            return self._page(None, None, status=404)
        ctl, inv = found
        return self._page(ctl, inv)

    async def post(self, request: web.Request, token: str) -> web.Response:
        ip = request.remote or "?"
        if self._blocked(ip):
            return self.json({"ok": False, "msg": "Demasiados intentos. Probá más tarde."}, status_code=429, headers=self._headers())
        found = self._find(token)
        if found is None:
            self._fail(ip)
            return self.json({"ok": False, "msg": "Este link no es válido"}, status_code=404, headers=self._headers())
        ctl, inv = found
        try:
            body = await request.json()
        except (ValueError, json.JSONDecodeError):
            return self.json({"ok": False, "msg": "Pedido inválido"}, status_code=400, headers=self._headers())
        action = body.get("action") if isinstance(body, dict) else None
        if action == "status":
            code, text = invite_state(inv)
            return self.json({"ok": True, "state": code, "msg": text, "devices": ctl.devices_for(inv)}, headers=self._headers())
        if action not in ("open", "close"):
            return self.json({"ok": False, "msg": "Pedido inválido"}, status_code=400, headers=self._headers())
        try:
            index = int(body.get("device"))
        except (TypeError, ValueError):
            return self.json({"ok": False, "msg": "Pedido inválido"}, status_code=400, headers=self._headers())
        ok, msg = await ctl.async_use(inv, index, action, ip)
        code, text = invite_state(inv)
        return self.json({"ok": ok, "msg": msg, "state": code, "state_msg": text, "devices": ctl.devices_for(inv)}, headers=self._headers())

    def _page(self, ctl: GuestController | None, inv: dict[str, Any] | None, status: int = 200) -> web.Response:
        if ctl is None or inv is None:
            data = {"bad": True}
            title = "Invitación"
        else:
            code, text = invite_state(inv)
            until = _dt(inv.get("until"))
            data = {
                "name": inv.get("name"), "state": code, "msg": text, "devices": ctl.devices_for(inv),
                "until": dt_util.as_local(until).strftime("%d/%m %H:%M") if until else None,
                "welcome": str(ctl.u.get("welcome") or ""), "hours": f"{inv['h_from']} a {inv['h_to']}" if inv.get("hours") else None,
            }
            title = str(ctl.u.get("title") or ctl.rule.get("name") or "Invitación")
        payload = json.dumps(data, ensure_ascii=False).replace("<", "\\u003c")
        html = PAGE.replace("__TITLE__", escape(title)).replace("__DATA__", payload)
        return web.Response(text=html, content_type="text/html", status=status, headers=self._headers())


PAGE = """<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#111418">
<title>__TITLE__</title>
<style>
:root{--bg:#f4f6f9;--card:#fff;--tx:#14171c;--sub:#69707c;--line:#e3e7ee;--ok:#2fb47c;--bad:#e04848;--acc:#2f6fe4}
@media (prefers-color-scheme:dark){:root{--bg:#111418;--card:#1b2027;--tx:#eef1f5;--sub:#9aa3b0;--line:#2a313b;--acc:#5b93ff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font:16px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;-webkit-tap-highlight-color:transparent}
.w{max-width:440px;margin:0 auto;padding:28px 16px 40px}
h1{font-size:24px;margin:0 0 4px}.s{color:var(--sub);margin:0 0 18px}
.c{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:18px;margin-bottom:14px}
.n{font-weight:700;font-size:18px}.st{color:var(--sub);font-size:14px;margin-top:2px}
.b{display:flex;gap:10px;margin-top:14px}
button{flex:1;border:0;border-radius:16px;padding:18px 10px;font:600 18px system-ui,sans-serif;background:var(--acc);color:#fff;cursor:pointer;touch-action:manipulation}
button.sec{background:transparent;color:var(--tx);border:1px solid var(--line)}button:disabled{opacity:.45}
.m{border-radius:14px;padding:12px 14px;margin-bottom:14px;font-weight:600;display:none}
.m.ok{display:block;background:rgba(47,180,124,.14);color:var(--ok)}.m.bad{display:block;background:rgba(224,72,72,.12);color:var(--bad)}
.f{color:var(--sub);font-size:13px;text-align:center;margin-top:22px}
.big{font-size:56px;text-align:center;margin:30px 0 10px}
</style></head><body><div class="w" id="app"></div>
<script>
const D=__DATA__;const app=document.getElementById('app');
const e=(s)=>String(s??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let msg='',good=true,busy=false;
function draw(){
 if(D.bad){app.innerHTML='<div class="big">🔒</div><h1 style="text-align:center">Este link no es válido</h1><p class="s" style="text-align:center">Pedile una invitación nueva a quien te invitó.</p>';return;}
 const off=D.state!=='ok';
 app.innerHTML=`<h1>Hola, ${e(D.name)} 👋</h1><p class="s">${e(D.welcome||'Desde acá podés abrir cuando llegues.')}</p>
 <div class="m ${msg?(good?'ok':'bad'):''}">${e(msg)}</div>
 ${off?`<div class="m bad">${e(D.msg)}</div>`:''}
 ${D.devices.map((d)=>`<div class="c"><div class="n">${e(d.label)}</div>${d.text?`<div class="st">${e(d.text)}</div>`:''}
  <div class="b"><button data-i="${d.i}" data-a="open" ${off||busy?'disabled':''}>${e(d.open)}</button>${d.close?`<button class="sec" data-i="${d.i}" data-a="close" ${off||busy?'disabled':''}>${e(d.close)}</button>`:''}</div></div>`).join('')}
 <div class="f">${D.until?`Válida hasta el ${e(D.until)}`:''}${D.hours?` · de ${e(D.hours)}`:''}</div>`;
}
async function send(body){
 const r=await fetch(location.pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
 return r.json();
}
app.addEventListener('click',async(ev)=>{
 const b=ev.target.closest('button[data-a]');if(!b||busy)return;
 busy=true;msg='Un momento…';good=true;draw();
 try{const r=await send({action:b.dataset.a,device:+b.dataset.i});msg=r.msg;good=r.ok;if(r.devices)D.devices=r.devices;if(r.state){D.state=r.state;D.msg=r.state_msg||D.msg;}}
 catch(_){msg='No hay conexión. Probá de nuevo.';good=false;}
 busy=false;draw();
});
let n=0;const poll=setInterval(async()=>{if(D.bad||document.hidden||busy)return;if(++n>120){clearInterval(poll);return;}
 try{const r=await send({action:'status'});if(r.devices){D.devices=r.devices;D.state=r.state;D.msg=r.msg;draw();}}catch(_){}},4000);
draw();
</script></body></html>"""
