import React from "react";
const { useState, useEffect, useRef, useMemo, useCallback } = React;
import { createClient } from "@supabase/supabase-js";
import { asegurarEquipo, cabecerasEquipo, cabecerasUrgentes } from "./seguridad";
import { perfilEnUso } from "./perfil_estado";
import { DEFAULT_FORMATS, Icons, STATUSES, clone, getIdBase, setIdBase } from "./base";

export function StatStrip({videos}) {
  // v3.43: una sola línea de cifras (antes seis cajas grandes que se repetían en Calendario, Tablero y YouTube)
  const count = st => videos.filter(v=>v.status===st).length;
  const items = [
    {label:"vídeos", value:videos.length, color:"var(--text-2)"},
    {label:"ideas", value:count("idea"), color:STATUSES.idea.color},
    {label:"grabados", value:count("grabacion"), color:STATUSES.grabacion.color},
    {label:"editados", value:count("edicion"), color:STATUSES.edicion.color},
    {label:"programados", value:count("programado"), color:STATUSES.programado.color},
    {label:"publicados", value:count("publicado"), color:STATUSES.publicado.color},
  ];
  return (
    <div className="rs-kpis" style={{marginBottom:18}}>
      {items.map((it,i)=>(
        <span key={i} className="kpi"><span className="punto" style={{background:it.color}}/><b>{it.value}</b>{it.label}</span>
      ))}
    </div>
  );
}

/* ============================ APP ============================ */
/* ============================ PERSISTENCIA (localStorage) ============================ */
export const STORE_KEY = "rivals_studio_v1";
export function loadStore() {
  try {
    const raw = (typeof window !== "undefined" && window.studioFS) ? window.studioFS.load() : localStorage.getItem(STORE_KEY);
    if(!raw) return null;
    const data = JSON.parse(raw);
    if(!data || !Array.isArray(data.videos) || typeof data.formats!=="object") return null;
    // Reajustar el contador de ids para no colisionar con los guardados
    let maxId = 100;
    data.videos.forEach(v=>{ const n = parseInt(String(v.id).replace(/\D/g,"")); if(!isNaN(n) && n>maxId) maxId=n; });
    setIdBase(maxId);
    return data;
  } catch(e) { return null; }
}
export function saveStore(videos, formats, trash, taskLists, tombstones, dailyArchive, tagTemplates, subHistory, promptTemplates, goals) {
  try {
    const txt = JSON.stringify({ videos, formats, trash: trash||[], taskLists: taskLists||[], tombstones: tombstones||[], dailyArchive: dailyArchive||{}, tagTemplates: tagTemplates||[], subHistory: subHistory||[], promptTemplates: promptTemplates||[], goals: goals||null, savedAt: Date.now() });
    if(window.studioFS) window.studioFS.save(txt); else localStorage.setItem(STORE_KEY, txt);
    return true;
  }
  catch(e) { return false; }
}
export function clearStore() { try { if(window.studioFS) window.studioFS.clear(); localStorage.removeItem(STORE_KEY); } catch(e){} }

/* ============================ TAREAS: datos y notificaciones ============================ */
export let _tid = 0;
export const tid = () => "t" + Date.now().toString(36) + (++_tid);
export const DEFAULT_TASK_LISTS = [
  { id:"lst_daily", name:"Tareas diarias", fixed:true, tasks:[], updatedAt:0 },
  { id:"lst_default", name:"Mis tareas", tasks:[], updatedAt:0 }
];
// Pide permiso de notificaciones (devuelve el estado final)
export async function askNotifPermission() {
  if(typeof Notification === "undefined") return "unsupported";
  if(Notification.permission === "granted") return "granted";
  if(Notification.permission === "denied") return "denied";
  try { return await Notification.requestPermission(); } catch(e){ return "denied"; }
}
// Lanza una notificación si hay permiso; si no, devuelve false para avisar por toast
export function fireNotification(title, body) {
  try {
    if(typeof Notification !== "undefined" && Notification.permission === "granted") {
      // Preferir el Service Worker (funciona con la pestaña en segundo plano)
      if(!window.studioFS && navigator.serviceWorker && navigator.serviceWorker.controller){
        navigator.serviceWorker.ready.then(reg=>{
          reg.showNotification(title, { body, icon:NOTIF_ICON, badge:NOTIF_ICON, tag:"rderandom-"+Date.now(), requireInteraction:true, vibrate:[120,60,120] });
        }).catch(()=>{ try { new Notification(title, { body }); } catch(e){} });
        return true;
      }
      new Notification(title, { body, tag:"rderandom-"+Date.now() });
      return true;
    }
  } catch(e){}
  return false;
}
// Icono para las notificaciones (data URI dorado)
export const NOTIF_ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='22' fill='%23D4AF37'/%3E%3Ctext x='50' y='68' font-size='58' text-anchor='middle' fill='%23000' font-family='sans-serif' font-weight='bold'%3ER%3C/text%3E%3C/svg%3E";

// Registrar un Service Worker mínimo (permite notificaciones con la pestaña en segundo plano)
export function registerNotifSW(){
  if(!("serviceWorker" in navigator)) return;
  // v3.34: en la web, el service worker de verdad (sw.js, junto a index.html): también recibe los avisos push
  if(location.protocol === "https:"){ navigator.serviceWorker.register("sw.js").catch(()=>{}); return; }
  try {
    const swCode = `
      self.addEventListener("install", e=>self.skipWaiting());
      self.addEventListener("activate", e=>e.waitUntil(self.clients.claim()));
      self.addEventListener("notificationclick", e=>{
        e.notification.close();
        e.waitUntil(clients.matchAll({type:"window"}).then(cs=>{
          for(const c of cs){ if("focus" in c) return c.focus(); }
          if(clients.openWindow) return clients.openWindow("/");
        }));
      });
    `;
    const blob = new Blob([swCode], {type:"text/javascript"});
    const url = URL.createObjectURL(blob);
    navigator.serviceWorker.register(url).catch(()=>{});
  } catch(e){}
}

/* ============================ SINCRONIZACIÓN (Supabase) ============================ */
export const SUPABASE_URL = "https://krzuellhsakbwavlahxg.supabase.co";
export const SUPABASE_KEY = "sb_publishable_FWzHwkpMr4bOQYjakGGmpg_ZqEFFYCO";
export const SYNC_CODE_KEY = "rivals_sync_code";

/* ——— Migración v2.0 (23/8/2026): unificar dispositivos en un solo código ———
   Los dispositivos que quedaron con un código antiguo adoptan el principal y
   bajan los datos buenos de la nube; su copia local queda guardada aparte. */
export const MAIN_SYNC_CODE = "a4c23831-be67-4c4c-92d9-f6743acc101e";
export const OLD_SYNC_CODES = [
  "c0d7db98-8d11-4dd6-96ad-48c0cd1597a3","afcec6ff-45e7-4f13-8941-21a39a1bbb9b",
  "9de107ab-dac9-4057-85fe-ffdddad4d3d1","43385365-0958-4969-9630-51fab07ec984",
  "89716416-07ef-490c-8c9a-fc277a76ba8b","d48a6235-ea9c-4bd3-9353-91ea23415704",
  "a2f14e77-94fe-4aab-a3f0-eda8f32e6b80","51333649-f1d3-4a15-bdf6-519f2d13538e",
  "1756ebd4-725c-4827-bbf1-9d280b94204c","6d532724-d6ec-4cd2-90db-db08b8e10d1f",
  "3f7de999-095c-43f9-8797-eae1216ce7c6","bed89e86-a315-41a3-b00a-ba2899e2c807"
];
(function migrarCodigoSync(){
  try {
    const c = localStorage.getItem(SYNC_CODE_KEY);
    if(c && OLD_SYNC_CODES.includes(c)){
      const prev = localStorage.getItem("rivals_studio_v1");
      if(prev) localStorage.setItem("rivals_studio_v1_backup_migracion", prev);
      localStorage.removeItem("rivals_studio_v1");
      localStorage.setItem(SYNC_CODE_KEY, MAIN_SYNC_CODE);
    }
  } catch(e){}
})();

/* ============================ YOUTUBE + DRIVE (integración) ============================ */
// URL del backend en Vercel y el Client ID de Google (OAuth). Rellena YT_CLIENT_ID con tu ID real.
export const YT_BACKEND = "https://rderandom-backend.vercel.app";
export const YT_CLIENT_ID = "376576989643-7hidirnma3vjqru2uppjfl5upg94n6vs.apps.googleusercontent.com";
export const YT_REDIRECT = "https://manugrraa.github.io/random-studio/"; // debe coincidir con Google Cloud
export const YT_TOKEN_KEY = "rds_yt_tokens";
export const YT_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube",
  "https://www.googleapis.com/auth/youtube.force-ssl",
  "https://www.googleapis.com/auth/drive.readonly",
  // OJO: drive.file NO puede ir aquí: Google no deja pedirlo junto a drive.readonly («cannot be requested together»)
  // y bloquea el inicio de sesión entero. Drive para subir se conecta aparte (driveConectar, más abajo).
  // Analíticas (visitas e ingresos) para el panel de Objetivos
  "https://www.googleapis.com/auth/yt-analytics.readonly",
  "https://www.googleapis.com/auth/yt-analytics-monetary.readonly"
].join(" ");

/* ============================ IA: CLAUDE (v3.30) ============================
 * La IA del Studio es Claude Code del portátil (`claude -p`, plan Max), sustituye a Gemini.
 * Las «instrucciones del agente» (lo que antes era el Gem) se guardan por perfil. */
export const IA_SISTEMA_STORE = "rds_ia_sistema";
export function iaDisponible(){ return !!(window.studioFS && window.studioFS.claude); }
export function iaGetSistema(){ try { return localStorage.getItem(IA_SISTEMA_STORE) || ""; } catch(e){ return ""; } }
// Gemini ya no se usa: se pasan sus instrucciones a Claude y se borran su clave y su modelo de este equipo
try {
  const viejo = localStorage.getItem("rds_gemini_system");
  if(viejo && !localStorage.getItem(IA_SISTEMA_STORE)) localStorage.setItem(IA_SISTEMA_STORE, viejo);
  Object.keys(localStorage).filter(k=>/rds_gemini_/.test(k)).forEach(k=>localStorage.removeItem(k));
} catch(e){}
export function iaSaveSistema(s){ try { localStorage.setItem(IA_SISTEMA_STORE, s||""); } catch(e){} }
export async function iaGenerar(prompt, sistema){
  if(!iaDisponible()) throw new Error("La IA (Claude) funciona en el portátil: abre RandomStudio allí.");
  const r = await window.studioFS.claude(prompt, { sistema: sistema!=null ? sistema : iaGetSistema() });
  if(!r || !r.ok) throw new Error((r && r.error) || "Claude no respondió");
  return r.texto;
}

// Lee/guarda los tokens de Google en localStorage
export function ytGetTokens(){
  try { return JSON.parse(localStorage.getItem(YT_TOKEN_KEY) || "null"); } catch(e){ return null; }
}
export function ytSaveTokens(tok){
  try { localStorage.setItem(YT_TOKEN_KEY, JSON.stringify(tok)); } catch(e){}
}
export function ytClearTokens(){
  try { localStorage.removeItem(YT_TOKEN_KEY); } catch(e){}
}
// Caduca solo el access token pero CONSERVA el refresh token: la sesión no se pierde,
// simplemente se renovará en la siguiente llamada
export function ytExpireAccess(){
  const t = ytGetTokens();
  if(t && t.refresh_token){ ytSaveTokens({ ...t, expires_at: 0 }); }
  else ytClearTokens();
}
export function ytIsConnected(){
  const t = ytGetTokens();
  return !!(t && (t.access_token || t.refresh_token));
}
// ¿El accessToken sigue vigente? (con margen de 2 min)
export function ytTokenValid(){
  const t = ytGetTokens();
  return !!(t && t.access_token && t.expires_at && Date.now() < t.expires_at - 120000);
}

/* ——— Sesión PERMANENTE: flujo con código + refresh token ———
   Te logueas UNA vez; el backend guarda el client_secret y canjea/renueva.
   El refresh token vive en este dispositivo hasta que pulses Desconectar. */
// v3.30: canjea el código y DEVUELVE los tokens (la pantalla de perfiles los guarda en el perfil que toque)
export async function ytCanjear(code){
  try {
    const res = await fetch(YT_BACKEND + "/api/auth/exchange", {
      method:"POST", headers:{ "Content-Type":"application/json", ...(await cabecerasEquipo("POST", "/api/auth/exchange")) },
      body: JSON.stringify({ code, redirectUri: YT_REDIRECT })
    });
    const data = await res.json().catch(()=>({}));
    if(data.baneado) return { baneado: true };
    if(!res.ok || !data.success || !data.access_token) return null;
    return { access_token: data.access_token, refresh_token: data.refresh_token || null, expires_at: Date.now() + (data.expires_in||3600)*1000 };
  } catch(e){ return null; }
}
export async function ytExchangeCode(code){
  const t = await ytCanjear(code);
  if(!t || !t.access_token) return false;
  const prev = ytGetTokens() || {};
  ytSaveTokens({ ...t, refresh_token: t.refresh_token || prev.refresh_token || null });
  return true;
}

/* v3.31.1: Drive para SUBIR va con su propia sesión (solo «drive.file»: la app solo ve lo que ella sube), separada
 * de la de YouTube. Solo en el escritorio, que es quien sube. */
export const DRIVE_TOKEN_KEY = "rds_drive_tokens";
const driveTok = () => { try { return JSON.parse(localStorage.getItem(DRIVE_TOKEN_KEY) || "null"); } catch(e){ return null; } };
export function driveConectado(){ const t = driveTok(); return !!(t && t.refresh_token); }
// v3.40.2: con { elegirCuenta } deja escoger la cuenta (los perfiles locales suben al Drive que quieran) y apunta su correo
export async function driveConectar(opts = {}){
  if(!(window.studioFS && window.studioFS.oauth)) throw new Error("Drive se conecta desde RandomStudio de escritorio");
  const params = new URLSearchParams({
    client_id: YT_CLIENT_ID, redirect_uri: YT_REDIRECT, response_type: "code", access_type: "offline",
    scope: "https://www.googleapis.com/auth/drive.file", include_granted_scopes: "false",
    prompt: opts.elegirCuenta ? "select_account consent" : "consent", state: "rs_drive"
  });
  const ret = String(await window.studioFS.oauth("https://accounts.google.com/o/oauth2/v2/auth?" + params.toString(), YT_REDIRECT, {}) || "");
  const code = new URLSearchParams(ret.replace(/^[?#]/,"")).get("code");
  if(!code) throw new Error("No se completó la conexión con Drive");
  const t = await ytCanjear(code);
  if(!t || !t.access_token) throw new Error("Google no dio acceso a Drive");
  try {
    const j = await (await fetch("https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)", { headers: { Authorization: "Bearer " + t.access_token } })).json();
    if(j && j.user && j.user.emailAddress) t.email = j.user.emailAddress;
  } catch(e){}
  try { localStorage.setItem(DRIVE_TOKEN_KEY, JSON.stringify(t)); } catch(e){}
  try { window.dispatchEvent(new Event("rs_drive")); } catch(e){}   // quien enseñe el estado de Drive se entera
  return true;
}
export function driveCorreo(){ const t = driveTok(); return (t && t.email) || ""; }
export function driveDesconectar(){ try { localStorage.removeItem(DRIVE_TOKEN_KEY); } catch(e){} }
export async function driveToken(){
  const t = driveTok();
  if(!t) throw new Error("Conecta Drive en Historias → Ajustes");
  if(t.access_token && t.expires_at && Date.now() < t.expires_at - 120000) return t.access_token;
  if(!t.refresh_token) throw new Error("Vuelve a conectar Drive");
  const res = await fetch(YT_BACKEND + "/api/auth/refresh", { method:"POST",
    headers:{ "Content-Type":"application/json", ...(await cabecerasEquipo("POST", "/api/auth/refresh")) }, body: JSON.stringify({ refreshToken: t.refresh_token }) });
  const data = await res.json().catch(()=>({}));
  if(res.status === 401){ driveDesconectar(); throw new Error("Vuelve a conectar Drive"); }
  if(!res.ok || !data.access_token) throw new Error("No se pudo renovar Drive");
  const nuevo = { ...t, access_token: data.access_token, expires_at: Date.now() + (data.expires_in||3600)*1000 };
  try { localStorage.setItem(DRIVE_TOKEN_KEY, JSON.stringify(nuevo)); } catch(e){}
  return nuevo.access_token;
}

/** v3.30: iniciar sesión con OTRA cuenta de Google desde la pantalla de perfiles (eligiendo la cuenta).
 * En el escritorio devuelve el código; en la web se va a Google y vuelve con ?code=...&state=rs_entrar. */
export async function googleElegirCuenta(){
  const params = new URLSearchParams({
    client_id: YT_CLIENT_ID, redirect_uri: YT_REDIRECT, response_type: "code", access_type: "offline",
    scope: YT_SCOPES, include_granted_scopes: "true", prompt: "select_account consent", state: "rs_entrar"
  });
  const authUrl = "https://accounts.google.com/o/oauth2/v2/auth?" + params.toString();
  if(window.studioFS && window.studioFS.oauth){
    const ret = String(await window.studioFS.oauth(authUrl, YT_REDIRECT, {}) || "");
    return new URLSearchParams(ret.replace(/^[?#]/,"")).get("code");
  }
  window.location.href = authUrl;
  return null;
}
export async function ytRefreshWithToken(){
  const t = ytGetTokens();
  if(!t || !t.refresh_token) return false;
  try {
    const res = await fetch(YT_BACKEND + "/api/auth/refresh", {
      method:"POST", headers:{ "Content-Type":"application/json", ...(await cabecerasEquipo("POST", "/api/auth/refresh")) },
      body: JSON.stringify({ refreshToken: t.refresh_token })
    });
    const data = await res.json().catch(()=>({}));
    if(res.status===401){ ytClearTokens(); return false; } // refresh token revocado de verdad
    if(!res.ok || !data.success || !data.access_token) return false;
    ytSaveTokens({ ...t, access_token: data.access_token, expires_at: Date.now() + (data.expires_in||3600)*1000 });
    return true;
  } catch(e){ return false; }
}

// Inicia el login de Google con flujo de CÓDIGO (access_type=offline → refresh token
// permanente). El backend canjea el código; la app nunca ve el client_secret.
export function ytStartAuth(){
  const params = new URLSearchParams({
    client_id: YT_CLIENT_ID,
    redirect_uri: YT_REDIRECT,
    response_type: "code",
    access_type: "offline",
    scope: YT_SCOPES,
    include_granted_scopes: "true",
    prompt: "consent",
    state: "yt_auth"
  });
  const authUrl = "https://accounts.google.com/o/oauth2/v2/auth?" + params.toString();
  if(window.studioFS && window.studioFS.oauth){
    window.studioFS.oauth(authUrl, YT_REDIRECT, {}).then(async ret=>{
      const r = String(ret||"");
      // Flujo nuevo: vuelve con ?code=...
      const q = new URLSearchParams(r.replace(/^[?#]/,""));
      const code = q.get("code");
      if(code){
        const ok = await ytExchangeCode(code);
        if(ok) window.location.reload();
        return;
      }
      // Compatibilidad con el flujo antiguo (#access_token=...)
      const at = q.get("access_token");
      if(at){
        ytSaveTokens({ access_token: at, expires_at: Date.now() + (parseInt(q.get("expires_in")||"3600",10))*1000 });
        window.location.reload();
      }
    });
    return;
  }
  window.location.href = authUrl;
}

// Renovación SILENCIOSA del token: pide uno nuevo sin interacción usando un iframe oculto
// con prompt=none. Google renueva el token si la sesión sigue activa, sin recargar la app.
export let _ytSilentInFlight = null;
export function ytSilentRefresh(){
  if(_ytSilentInFlight) return _ytSilentInFlight;
  if(window.studioFS && window.studioFS.oauth){
    _ytSilentInFlight = (async ()=>{
      try {
        const params = new URLSearchParams({
          client_id: YT_CLIENT_ID, redirect_uri: YT_REDIRECT, response_type: "token",
          scope: YT_SCOPES, include_granted_scopes: "true", prompt: "none", state: "yt_silent"
        });
        const hash = await window.studioFS.oauth("https://accounts.google.com/o/oauth2/v2/auth?" + params.toString(), YT_REDIRECT, { silent: true });
        const h = new URLSearchParams(String(hash||"").replace(/^#/,""));
        const at = h.get("access_token");
        if(at){
          ytSaveTokens({ access_token: at, expires_at: Date.now() + (parseInt(h.get("expires_in")||"3600",10))*1000 });
          return true;
        }
        return false;
      } catch(e){ return false; }
      finally { _ytSilentInFlight = null; }
    })();
    return _ytSilentInFlight;
  }
  _ytSilentInFlight = new Promise((resolve)=>{
    try {
      const frame = document.createElement("iframe");
      frame.style.display = "none";
      const params = new URLSearchParams({
        client_id: YT_CLIENT_ID,
        redirect_uri: YT_REDIRECT,
        response_type: "token",
        scope: YT_SCOPES,
        include_granted_scopes: "true",
        prompt: "none",
        state: "yt_silent"
      });
      let done = false;
      const cleanup = (ok)=>{ if(done) return; done=true; try{ document.body.removeChild(frame); }catch(e){} window.removeEventListener("message", onMsg); _ytSilentInFlight=null; resolve(ok); };
      const onMsg = (ev)=>{
        if(ev.source !== frame.contentWindow) return;
        const data = ev.data || {};
        if(data.type === "yt_silent_token"){
          if(data.access_token){
            ytSaveTokens({ access_token: data.access_token, expires_at: Date.now() + (parseInt(data.expires_in||"3600",10))*1000 });
            cleanup(true);
          } else cleanup(false);
        }
      };
      window.addEventListener("message", onMsg);
      frame.src = "https://accounts.google.com/o/oauth2/v2/auth?" + params.toString();
      document.body.appendChild(frame);
      // Tiempo máximo de espera
      setTimeout(()=>cleanup(false), 8000);
    } catch(e){ _ytSilentInFlight=null; resolve(false); }
  });
  return _ytSilentInFlight;
}

// Asegura un token válido: si está por caducar, intenta renovarlo en silencio.
export async function ytEnsureToken(){
  if(ytTokenValid()) return true;
  if(!ytIsConnected()) return false;
  // Con refresh token la renovación es silenciosa y no caduca nunca
  if(await ytRefreshWithToken()) return true;
  // Respaldo del flujo antiguo (iframe con prompt=none)
  return await ytSilentRefresh();
}

// Al volver de Google, la URL trae #access_token=...&expires_in=... → lo capturamos
export function ytCaptureAuthFromHash(){
  if(!window.location.hash) return false;
  const h = new URLSearchParams(window.location.hash.slice(1));
  const at = h.get("access_token");
  const state = h.get("state");
  if(!at) return false;
  const expiresIn = parseInt(h.get("expires_in")||"3600",10);
  // Si venimos de una renovación silenciosa (dentro de un iframe), avisamos al padre
  if(state === "yt_silent" && window.parent !== window){
    window.parent.postMessage({ type:"yt_silent_token", access_token: at, expires_in: expiresIn }, "*");
    return false;
  }
  ytSaveTokens({ access_token: at, expires_at: Date.now() + expiresIn*1000 });
  history.replaceState(null, "", window.location.pathname + window.location.search);
  return true;
}

// Busca en Drive un vídeo cuyo nombre coincida (exacto o que empiece por) con el título
export async function ytSearchDrive(title){
  const t = ytGetTokens();
  if(!t || !t.access_token) throw new Error("No conectado a Google");
  // Escapamos comillas simples para la query de Drive
  const safe = title.replace(/'/g, "\\'");
  const q = `(name = '${safe}' or name contains '${safe}') and mimeType contains 'video/' and trashed = false`;
  const url = "https://www.googleapis.com/drive/v3/files?" + new URLSearchParams({
    q,
    spaces: "drive",
    fields: "files(id,name,size,mimeType,modifiedTime)",
    orderBy: "modifiedTime desc",
    pageSize: "10"
  });
  const res = await fetch(url, { headers: { Authorization: "Bearer " + t.access_token } });
  if(res.status === 401){ ytExpireAccess(); throw new Error("Sesión de Google caducada, vuelve a conectar"); }
  if(!res.ok) throw new Error("Error al buscar en Drive ("+res.status+")");
  const data = await res.json();
  return data.files || [];
}

// Pide al backend que descargue de Drive y suba a YouTube (programado)
export async function ytUploadViaBackend(payload){
  const res = await fetch(YT_BACKEND + "/api/youtube/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(()=>({}));
  if(!res.ok || !data.success) throw new Error(data.error || data.details || "Error al subir a YouTube");
  return data;
}

// Cabecera de autorización para llamadas directas a la API de YouTube
export function ytAuthHeader(){
  const t = ytGetTokens();
  if(!t || !t.access_token) throw new Error("No conectado a Google");
  return { Authorization: "Bearer " + t.access_token };
}

// Lista las playlists del usuario (para elegir dónde añadir el vídeo)
export async function ytListPlaylists(){
  const url = "https://www.googleapis.com/youtube/v3/playlists?" + new URLSearchParams({
    part: "snippet", mine: "true", maxResults: "50"
  });
  const res = await fetch(url, { headers: ytAuthHeader() });
  if(res.status===401){ ytExpireAccess(); throw new Error("Sesión de Google caducada"); }
  if(!res.ok) throw new Error("Error al leer playlists ("+res.status+")");
  const data = await res.json();
  return (data.items||[]).map(p=>({ id:p.id, title:p.snippet?.title||"(sin título)" }));
}

// Lee estadísticas del canal del usuario (suscriptores, vídeos, visitas)
export async function ytGetChannelStats(){
  // Asegurar token válido (renovación silenciosa si hace falta)
  await ytEnsureToken();
  const doFetch = () => fetch("https://www.googleapis.com/youtube/v3/channels?" + new URLSearchParams({
    part: "statistics,snippet", mine: "true"
  }), { headers: ytAuthHeader() });
  let res = await doFetch();
  // Si el token caducó justo ahora, intentar renovar una vez y reintentar
  if(res.status===401){
    const ok = await ytSilentRefresh();
    if(ok) res = await doFetch();
  }
  if(res.status===401){ ytExpireAccess(); throw new Error("Sesión de Google caducada"); }
  if(!res.ok) throw new Error("Error al leer el canal ("+res.status+")");
  const data = await res.json();
  const ch = data.items?.[0];
  if(!ch) return null;
  const st = ch.statistics || {};
  return {
    title: ch.snippet?.title || "",
    thumb: ch.snippet?.thumbnails?.default?.url || null,
    subscribers: st.hiddenSubscriberCount ? null : parseInt(st.subscriberCount||"0",10),
    videos: parseInt(st.videoCount||"0",10),
    views: parseInt(st.viewCount||"0",10)
  };
}

// Lista los vídeos subidos del canal (para copiar datos de uno ya existente)
export async function ytListMyVideos(max){
  // 1. Obtener el playlist de subidas del canal
  const chRes = await fetch("https://www.googleapis.com/youtube/v3/channels?" + new URLSearchParams({
    part: "contentDetails", mine: "true"
  }), { headers: ytAuthHeader() });
  if(!chRes.ok) throw new Error("Error al leer el canal ("+chRes.status+")");
  const chData = await chRes.json();
  const uploads = chData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if(!uploads) return [];
  // 2. Últimos vídeos de ese playlist
  const plRes = await fetch("https://www.googleapis.com/youtube/v3/playlistItems?" + new URLSearchParams({
    part: "snippet,contentDetails", playlistId: uploads, maxResults: String(max||15)
  }), { headers: ytAuthHeader() });
  if(!plRes.ok) throw new Error("Error al leer subidas ("+plRes.status+")");
  const plData = await plRes.json();
  return (plData.items||[]).map(it=>({
    id: it.contentDetails?.videoId,
    title: it.snippet?.title || "(sin título)"
  })).filter(v=>v.id);
}

// Convierte una duración ISO 8601 (PT1H2M30S) a segundos
export function ytParseDuration(iso){
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso||"");
  if(!m) return 0;
  return (parseInt(m[1]||"0",10)*3600) + (parseInt(m[2]||"0",10)*60) + parseInt(m[3]||"0",10);
}

// Lista COMPLETA de subidas del canal con fecha, duración y estado (para importar).
// Devuelve [{id, title, publishedAt, publishAt, privacyStatus, durationSec}]
export async function ytListUploadsFull(max){
  await ytEnsureToken();
  // 1. Playlist de subidas
  const chRes = await fetch("https://www.googleapis.com/youtube/v3/channels?" + new URLSearchParams({
    part: "contentDetails", mine: "true"
  }), { headers: ytAuthHeader() });
  if(!chRes.ok) throw new Error("Error al leer el canal ("+chRes.status+")");
  const chData = await chRes.json();
  const uploads = chData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if(!uploads) return [];
  // 2. Últimos N ids del playlist (paginado: con muchos programados, 50 se quedaba corto)
  // v3: sin tope de 200 cuando se pide todo el historial (el canal tiene >700 vídeos)
  const limite = max===Infinity ? Infinity : Math.min(max||150, 200);
  const ids = [];
  let pageToken = "";
  while(ids.length < limite){
    const params = { part: "contentDetails", playlistId: uploads, maxResults: "50" };
    if(pageToken) params.pageToken = pageToken;
    const plRes = await fetch("https://www.googleapis.com/youtube/v3/playlistItems?" + new URLSearchParams(params), { headers: ytAuthHeader() });
    if(!plRes.ok) throw new Error("Error al leer subidas ("+plRes.status+")");
    const plData = await plRes.json();
    (plData.items||[]).forEach(it=>{ const id = it.contentDetails?.videoId; if(id) ids.push(id); });
    pageToken = plData.nextPageToken || "";
    if(!pageToken) break;
  }
  // 2b. Unión con la búsqueda directa de MIS vídeos: los programados recientes a veces
  // no aparecen en la lista de subidas (peculiaridad conocida de la API). La búsqueda
  // es cara en cuota, así que solo pedimos la primera página (los 50 más nuevos).
  try {
    const sRes = await fetch("https://www.googleapis.com/youtube/v3/search?" + new URLSearchParams({
      part:"id", forMine:"true", type:"video", order:"date", maxResults:"50"
    }), { headers: ytAuthHeader() });
    if(sRes.ok){
      const sData = await sRes.json();
      (sData.items||[]).forEach(it=>{
        const id = it.id?.videoId;
        if(id && !ids.includes(id)) ids.unshift(id);
      });
    }
  } catch(e){ /* si falla la búsqueda, seguimos con el playlist */ }
  if(ids.length===0) return [];
  // 3. Detalles por lotes de 50
  const items = [];
  for(let i=0; i<Math.min(ids.length, limite); i+=50){
    const vRes = await fetch("https://www.googleapis.com/youtube/v3/videos?" + new URLSearchParams({
      part: "snippet,contentDetails,status,liveStreamingDetails", id: ids.slice(i,i+50).join(",")
    }), { headers: ytAuthHeader() });
    if(!vRes.ok) throw new Error("Error al leer detalles ("+vRes.status+")");
    const vData = await vRes.json();
    (vData.items||[]).forEach(it=>items.push({
      id: it.id,
      title: it.snippet?.title || "(sin título)",
      publishedAt: it.snippet?.publishedAt || null,
      publishAt: it.status?.publishAt || null,
      privacyStatus: it.status?.privacyStatus || "private",
      durationSec: ytParseDuration(it.contentDetails?.duration),
      live: !!(it.liveStreamingDetails && (it.liveStreamingDetails.actualStartTime || it.liveStreamingDetails.scheduledStartTime))
    }));
  }
  return items;
}

// Añade un vídeo a una lista de reproducción (para la subida directa desde el PC)
export async function ytAddToPlaylist(playlistId, videoId){
  const res = await fetch("https://www.googleapis.com/youtube/v3/playlistItems?part=snippet", {
    method: "POST",
    headers: { ...ytAuthHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ snippet: { playlistId, resourceId: { kind: "youtube#video", videoId } } })
  });
  if(!res.ok){
    const data = await res.json().catch(()=>({}));
    throw new Error(data?.error?.message || "Error al añadir a la lista ("+res.status+")");
  }
  return true;
}

/* ——— ID del canal propio (cacheado en el dispositivo) ——— */
export async function ytMyChannelId(){
  try { const c = localStorage.getItem("rds_channel_id"); if(c) return c; } catch(e){}
  const res = await fetch("https://www.googleapis.com/youtube/v3/channels?part=id&mine=true", { headers: ytAuthHeader() });
  if(!res.ok) throw new Error("Error al leer el canal ("+res.status+")");
  const data = await res.json();
  const id = data.items?.[0]?.id;
  if(id){ try { localStorage.setItem("rds_channel_id", id); } catch(e){} }
  return id;
}

/* ——— Aplicar título/descripción EN YouTube (conservando etiquetas y categoría) ——— */
export async function ytUpdateVideoMeta(videoId, cambios){
  await ytEnsureToken();
  const actual = await ytGetVideoDetails(videoId);
  if(!actual) throw new Error("No se pudo leer el vídeo en YouTube");
  const snippet = {
    title: cambios.title!=null ? cambios.title : actual.title,
    description: cambios.description!=null ? cambios.description : actual.description,
    tags: actual.tags||[],
    categoryId: actual.categoryId||"20"
  };
  const res = await fetch("https://www.googleapis.com/youtube/v3/videos?part=snippet", {
    method:"PUT", headers:{ ...ytAuthHeader(), "Content-Type":"application/json" },
    body: JSON.stringify({ id: videoId, snippet })
  });
  if(!res.ok){ const d = await res.json().catch(()=>({})); throw new Error(d?.error?.message||("Error al actualizar en YouTube ("+res.status+")")); }
  return true;
}

/* ——— Reprogramar EN YouTube (nueva fecha/hora de publicación) ——— */
export async function ytUpdateSchedule(videoId, isoFecha){
  await ytEnsureToken();
  const res = await fetch("https://www.googleapis.com/youtube/v3/videos?part=status", {
    method:"PUT", headers:{ ...ytAuthHeader(), "Content-Type":"application/json" },
    body: JSON.stringify({ id: videoId, status: { privacyStatus:"private", publishAt: isoFecha, selfDeclaredMadeForKids:false } })
  });
  if(!res.ok){ const d = await res.json().catch(()=>({})); throw new Error(d?.error?.message||("Error al reprogramar ("+res.status+")")); }
  return true;
}

/* ——— Comentarios del canal (hilos recientes de todos los vídeos) ——— */
export async function ytListChannelComments(pageToken){
  await ytEnsureToken();
  const chId = await ytMyChannelId();
  const params = { part:"snippet,replies", allThreadsRelatedToChannelId: chId, order:"time", maxResults:"50", textFormat:"plainText" };
  if(pageToken) params.pageToken = pageToken;
  const res = await fetch("https://www.googleapis.com/youtube/v3/commentThreads?" + new URLSearchParams(params), { headers: ytAuthHeader() });
  if(!res.ok){ const d = await res.json().catch(()=>({})); throw new Error(d?.error?.message||("Error al leer comentarios ("+res.status+")")); }
  const data = await res.json();
  return {
    nextPageToken: data.nextPageToken||null,
    canal: chId,
    items: (data.items||[]).map(t=>{
      const c = t.snippet?.topLevelComment?.snippet || {};
      return {
        id: t.snippet?.topLevelComment?.id || t.id,
        videoId: t.snippet?.videoId || c.videoId || "",
        autor: c.authorDisplayName||"",
        autorImg: c.authorProfileImageUrl||"",
        autorCanal: c.authorChannelId?.value||"",
        texto: c.textDisplay||"",
        likes: c.likeCount||0,
        fecha: c.publishedAt||null,
        totalRespuestas: t.snippet?.totalReplyCount||0,
        yaRespondido: (t.replies?.comments||[]).some(r=>r.snippet?.authorChannelId?.value===chId)
      };
    })
  };
}
export async function ytReplyComment(parentId, texto){
  await ytEnsureToken();
  const res = await fetch("https://www.googleapis.com/youtube/v3/comments?part=snippet", {
    method:"POST", headers:{ ...ytAuthHeader(), "Content-Type":"application/json" },
    body: JSON.stringify({ snippet: { parentId, textOriginal: texto } })
  });
  if(!res.ok){ const d = await res.json().catch(()=>({})); throw new Error(d?.error?.message||("Error al responder ("+res.status+")")); }
  return true;
}

/* ——— Estadísticas de UN vídeo: totales (Data API) y por día (Analytics) ——— */
export async function ytVideoStats(videoId){
  await ytEnsureToken();
  const res = await fetch("https://www.googleapis.com/youtube/v3/videos?" + new URLSearchParams({ part:"statistics,snippet", id: videoId }), { headers: ytAuthHeader() });
  if(!res.ok) throw new Error("Error al leer estadísticas ("+res.status+")");
  const it = (await res.json()).items?.[0];
  if(!it) return null;
  return {
    vistas: Number(it.statistics?.viewCount)||0,
    likes: Number(it.statistics?.likeCount)||0,
    comentarios: Number(it.statistics?.commentCount)||0,
    publicadoEl: it.snippet?.publishedAt||null
  };
}
export async function ytVideoDiario(videoId, desde, hasta){
  const data = await ytAnalyticsQuery({ startDate: desde, endDate: hasta, metrics:"views,estimatedRevenue", dimensions:"day", filters:"video=="+videoId, sort:"day" });
  return (data.rows||[]).map(f=>({ dia:f[0], views:Number(f[1])||0, rev:Number(f[2])||0 }));
}

// Publica un comentario del propietario en un vídeo (aparece destacado como comentario del canal)
export async function ytPostComment(videoId, text){
  await ytEnsureToken();
  const res = await fetch("https://www.googleapis.com/youtube/v3/commentThreads?part=snippet", {
    method: "POST",
    headers: { ...ytAuthHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ snippet: { videoId, topLevelComment: { snippet: { textOriginal: text } } } })
  });
  if(!res.ok){
    const data = await res.json().catch(()=>({}));
    throw new Error(data?.error?.message || "Error al publicar el comentario ("+res.status+")");
  }
  return true;
}

// Detecta el formato de un vídeo a partir del título (comparando con las etiquetas
// de los formatos del usuario). Si es un Short (≤3 min) y existe un formato "short",
// lo usa. Si no hay coincidencia, devuelve "" (sin formato, para elegirlo a mano).
export function detectFormatFromTitle(title, durationSec, formats){
  const norm = s => (s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  // v2: delega en el clasificador por glosario (la detección antigua por etiqueta no acertaba)
  const type = (durationSec>0 && durationSec<=183) ? "short" : "video";
  return clasificarFormato(title, type);
}

/* ——— Clasificador de formatos v2: glosario de palabras clave con pesos ———
   Afinado contra los 125 títulos reales del canal (23/8/2026). Cada regla suma
   su peso si el título (normalizado, sin acentos) la contiene; gana el formato
   con más puntos y los empates los resuelve el orden de PRIORIDAD_FORMATO. */
export const REGLAS_FORMATO = [
  ["directos", 6, /\bdirecto\b|\ben vivo\b|regalando \d|si me ganas te|nadie me derrota|estoy en mi prime|ultima caja que regalo/],
  ["combates", 4, /\b1\s*vs?\s*1\b|combates?|elimin|derrot|humill|spammer|hackers?|me enfrente|remont|invicto|aplast/],
  ["combates", 3, /\b(cuartos|semifinal(es)?|octavos|gran final)\b|onyx|diamante|platino|esmeralda|rankeds?|\bracha\b|subir de rango|subiendo de rango|\brango\b/],
  ["combates", 2, /\bmundial\b|\bsniper\b|punteria|goku|flash|\bvs\b|\bcontra\b|\bgan(e|o|a|amos|ador)\b|katana/],
  ["cajas", 4, /\bcajas?\b|\bskins?\b|recompensas?|\bpase\b|\bruleta\b|\bsorteo\b|\blotes?\b|\bpacks?\b|outfits?/],
  ["cajas", 2, /regal(o|e|ar|aron)|buscando (el|la|mi|una)|salio est|no me toca nada/],
  ["ropa", 5, /equipacion|equipaciones|\bropa\b|camisetas?|uniformes?/],
  ["comunidad", 4, /que preferis|que clan|necesito tu ayuda|vuestr|discord|encuesta|votad|ayudar a youtubers|os (leo|escucho)|comentarios|suscriptor|mando este mensaje|me encontre a/],
  ["comunidad", 2, /@\w+|colaboracion|invitado especial|netoblox|kdiz|nexoee|soloryee|feex|tilinfactory|choppyblox|me entendeis|\?\?/],
  ["retos", 4, /\bretos?\b|dinamicas?|desafio|armas (basicas|random)|sin usar|entren|clase de|muy pocos saben|trucos?|como (jugar|se juega)|aprended/],
  ["novedades", 4, /super ?cup|torneos?|\beventos?\b|domingos de juegos|actualizacion|novedades|ya podeis|ya esta(n)? disponible|hoy estan disponible|reiniciaron|he creado|nuevo servidor|nueva temporada|\bhoy es\b|empieza el|ultima oportunidad/],
  ["novedades", 2, /nuevo (modo|mapa|lote)|participantes?|proximamente|disponibles?/],
];
export const PRIORIDAD_FORMATO = ["directos","ropa","cajas","combates","jugadas","retos","comunidad","novedades"];

export function clasificarFormato(title, type){
  if(type==="directo") return "directos";
  const t = (title||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"");
  const pts = {};
  REGLAS_FORMATO.forEach(([fmt, peso, re])=>{ if(re.test(t)) pts[fmt]=(pts[fmt]||0)+peso; });
  delete pts.directos; // solo el TYPE directo decide ese formato
  const mejor = Object.entries(pts).sort((a,b)=> b[1]-a[1] || PRIORIDAD_FORMATO.indexOf(a[0])-PRIORIDAD_FORMATO.indexOf(b[0]))[0];
  if(mejor) return mejor[0];
  // Sin ninguna señal: un Short de gameplay sin más pistas es una jugada/momento
  return type==="short" ? "jugadas" : "";
}

/* Un vídeo que ya está en YouTube (programado allí o subido/publicado) tiene el
   trabajo hecho: su checklist se marca completa automáticamente */
export function completarChecklist(v){
  if(!v || !Array.isArray(v.checklist)) return v;
  if(!(v.youtubeId || v.status==="publicado")) return v;
  if(v.checklist.every(c=>c.done)) return v;
  return {...v, checklist: v.checklist.map(c=>c.done?c:{...c, done:true}), updatedAt:Date.now()};
}
export function normalizarDatos(d){
  if(!d) return d;
  d.videos = (d.videos||[]).map(completarChecklist);
  return d;
}

/* ——— Migración a formatos v2: sustituye la lista antigua y reclasifica todo ——— */
export function esFormatosV2(f){ return !!(f && f.jugadas && f.combates); }
export function migrarFormatosV2(d){
  if(!d || esFormatosV2(d.formats)) return d;
  const ahora = Date.now();
  d.formats = clone(DEFAULT_FORMATS);
  const arreglar = v => {
    if(!v) return v;
    const type = v.type==="largo" ? "video" : (v.type||"short");
    const fmt = clasificarFormato(v.title, type);
    if(type!==v.type || fmt!==v.format) return {...v, type, format:fmt, updatedAt:ahora};
    return v;
  };
  d.videos = (d.videos||[]).map(arreglar);
  d.trash = (d.trash||[]).map(arreglar);
  return d;
}

// Trae los datos completos de un vídeo (para copiar descripción, tags, categoría)
export async function ytGetVideoDetails(videoId){  const res = await fetch("https://www.googleapis.com/youtube/v3/videos?" + new URLSearchParams({
    part: "snippet", id: videoId
  }), { headers: ytAuthHeader() });
  if(!res.ok) throw new Error("Error al leer el vídeo ("+res.status+")");
  const data = await res.json();
  const s = data.items?.[0]?.snippet;
  if(!s) return null;
  return { title:s.title, description:s.description||"", tags:s.tags||[], categoryId:s.categoryId||"20" };
}

// Comprueba el estado de varios vídeos de golpe (existe / privacidad / fecha de publicación).
// Devuelve un mapa { videoId: {exists, privacyStatus, publishAt} }.
export async function ytCheckVideos(ids){
  const out = {};
  if(!ids || ids.length===0) return out;
  // La API admite hasta 50 ids por llamada
  for(let i=0;i<ids.length;i+=50){
    const chunk = ids.slice(i,i+50);
    const res = await fetch("https://www.googleapis.com/youtube/v3/videos?" + new URLSearchParams({
      part: "snippet,status,contentDetails,liveStreamingDetails", id: chunk.join(",")
    }), { headers: ytAuthHeader() });
    if(!res.ok){ throw new Error("Error al comprobar vídeos ("+res.status+")"); }
    const data = await res.json();
    const found = new Set();
    (data.items||[]).forEach(it=>{
      found.add(it.id);
      out[it.id] = {
        exists:true, privacyStatus: it.status?.privacyStatus, publishAt: it.status?.publishAt || null,
        publishedAt: it.snippet?.publishedAt || null,
        durationSec: ytParseDuration(it.contentDetails?.duration),
        live: !!(it.liveStreamingDetails && (it.liveStreamingDetails.actualStartTime || it.liveStreamingDetails.scheduledStartTime))
      };
    });
    // Los que no vuelven, ya no existen
    chunk.forEach(id=>{ if(!found.has(id)) out[id] = { exists:false }; });
  }
  return out;
}

/* ——— YouTube Analytics: visitas e ingresos reales del canal ——— */
export async function ytAnalyticsQuery(params){
  await ytEnsureToken();
  const res = await fetch("https://youtubeanalytics.googleapis.com/v2/reports?" + new URLSearchParams({ ids:"channel==MINE", ...params }), { headers: ytAuthHeader() });
  const data = await res.json().catch(()=>({}));
  if(!res.ok){
    const msg = data?.error?.message || "";
    if(res.status===403 && /has not been used|is disabled|accessNotConfigured/i.test(msg)) throw new Error("ANALYTICS_API_OFF");
    if(res.status===403 || res.status===401) throw new Error("ANALYTICS_PERMISOS");
    throw new Error("Error de analíticas ("+res.status+") "+msg);
  }
  return data;
}
export const fechaISO = (d) => { const p=n=>String(n).padStart(2,"0"); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; };

// RPM real por tipo de contenido, últimos 30 días cerrados (los ingresos llegan con ~2 días
// de retraso). 30 y no más: antes de junio de 2026 el canal no estaba monetizado y una
// ventana larga pillaría visitas sin ingresos, hundiendo el RPM artificialmente.
export async function ytFetchRpmReal(){
  const fin = new Date(); fin.setDate(fin.getDate()-3);
  const ini = new Date(fin); ini.setDate(ini.getDate()-30);
  const data = await ytAnalyticsQuery({
    startDate: fechaISO(ini), endDate: fechaISO(fin),
    metrics: "views,estimatedRevenue",
    dimensions: "creatorContentType"
  });
  const out = { shorts:null, directos:null, videos:null, total:{views:0,revenue:0,rpm:null}, at: Date.now(), ventana: 30 };
  (data.rows||[]).forEach(fila=>{
    // El nombre del tipo puede venir en distintas formas según la versión de la API
    const tipo = String(fila[0]||"").toUpperCase();
    const views = Number(fila[1])||0, rev = Number(fila[2])||0;
    out.total.views += views; out.total.revenue += rev;
    const rpm = views>0 ? rev/views*1000 : null;
    if(tipo.includes("SHORT")) out.shorts = {views, revenue:rev, rpm};
    else if(tipo.includes("LIVE")) out.directos = {views, revenue:rev, rpm};
    else if(tipo.includes("DEMAND") || tipo.includes("VIDEO")) out.videos = {views, revenue:rev, rpm};
  });
  out.total.rpm = out.total.views>0 ? out.total.revenue/out.total.views*1000 : null;
  return out;
}

// Visitas e ingresos por día (alimenta la semana, el mes y el calendario de objetivos)
export async function ytFetchDiario(desde, hasta){
  const data = await ytAnalyticsQuery({
    startDate: desde, endDate: hasta,
    metrics: "views,estimatedRevenue",
    dimensions: "day",
    sort: "day"
  });
  const out = {};
  (data.rows||[]).forEach(fila=>{ out[fila[0]] = { views:Number(fila[1])||0, revenue:Number(fila[2])||0 }; });
  return out;
}

// Visitas EN VIVO de vídeos concretos (Data API; se actualiza cada pocos minutos)
export async function ytViewCounts(ids){
  const out = {};
  if(!ids || !ids.length) return out;
  for(let i=0;i<ids.length;i+=50){
    const res = await fetch("https://www.googleapis.com/youtube/v3/videos?" + new URLSearchParams({
      part:"statistics", id: ids.slice(i,i+50).join(",")
    }), { headers: ytAuthHeader() });
    if(!res.ok) throw new Error("Error al leer visitas ("+res.status+")");
    const data = await res.json();
    (data.items||[]).forEach(it=>{ out[it.id] = Number(it.statistics?.viewCount)||0; });
  }
  return out;
}

// Borra un vídeo de YouTube
export async function ytDeleteVideo(videoId){
  const res = await fetch("https://www.googleapis.com/youtube/v3/videos?id="+encodeURIComponent(videoId), {
    method: "DELETE", headers: ytAuthHeader()
  });
  if(res.status===204) return true;
  if(res.status===404) return true; // ya no existía
  throw new Error("No se pudo borrar en YouTube ("+res.status+")");
}

// Categorías de YouTube más habituales (para el selector)
export const YT_CATEGORIES = [
  { id:"20", label:"Videojuegos" },
  { id:"22", label:"Gente y blogs" },
  { id:"24", label:"Entretenimiento" },
  { id:"23", label:"Comedia" },
  { id:"27", label:"Educación" },
  { id:"28", label:"Ciencia y tecnología" },
  { id:"10", label:"Música" },
  { id:"26", label:"Cómo hacer y estilo" },
  { id:"17", label:"Deportes" },
  { id:"1",  label:"Cine y animación" }
];



export let _sb = null;

export function getClient() {
  if(_sb) return _sb;
  try {
    // SIN capa de Auth: usamos solo la clave pública (anon). Antes se hacía un
    // sign-in anónimo por sesión, lo que creaba usuarios nuevos en Supabase Auth
    // constantemente (cada dispositivo/recarga/limpieza) y saturaba el servicio.
    _sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    return _sb;
  } catch(e){ return null; }
}

// Compatibilidad: antes autenticaba; ahora solo devuelve el cliente (cero carga en Auth)
export async function ensureAuth() {
  const sb = getClient(); if(!sb) throw new Error("sin cliente");
  return sb;
}
// Reajusta el contador de IDs para no colisionar con datos venidos de la nube
export function bumpIdFrom(videos) {
  let maxId = getIdBase();
  (videos||[]).forEach(v=>{ const n = parseInt(String(v.id).replace(/\D/g,"")); if(!isNaN(n) && n>maxId) maxId=n; });
  setIdBase(maxId);
}

/* ============================ FUSIÓN INTELIGENTE (merge por elementos) ============================ */
// En vez de que el dispositivo "más reciente" pise TODO lo del otro, fusionamos vídeo por vídeo
// y tarea por tarea usando la marca updatedAt de cada elemento. Las eliminaciones se registran
// como "tombstones" (id + cuándo) para no revivir lo borrado en el otro dispositivo.

export const TOMB_TTL = 45*24*60*60*1000; // olvidar tombstones tras 45 días

// Fusiona dos listas de objetos con id + updatedAt, respetando eliminaciones de ambos lados
export function mergeById(localArr, remoteArr, localTombs, remoteTombs) {
  const tombs = {}; // id -> timestamp de borrado más reciente
  [...(localTombs||[]), ...(remoteTombs||[])].forEach(t=>{
    if(!t || !t.id) return;
    tombs[t.id] = Math.max(tombs[t.id]||0, t.at||0);
  });
  const byId = {};
  const consider = (item, fromRemote) => {
    if(!item || !item.id) return;
    const prev = byId[item.id];
    const ts = item.updatedAt || item.createdAt || 0;
    if(!prev || ts > (prev.updatedAt || prev.createdAt || 0)) byId[item.id] = item;
  };
  (localArr||[]).forEach(i=>consider(i,false));
  (remoteArr||[]).forEach(i=>consider(i,true));
  // Aplicar tombstones: si algo fue borrado DESPUÉS de su última edición, se queda borrado
  const result = [];
  Object.values(byId).forEach(item=>{
    const delAt = tombs[item.id];
    const ts = item.updatedAt || item.createdAt || 0;
    if(delAt && delAt >= ts) return; // borrado gana
    result.push(item);
  });
  return result;
}

// Fusiona las listas de tareas (cada lista tiene su propio array de tareas)
export function mergeTaskLists(localLists, remoteLists, localTombs, remoteTombs) {
  const listTombs = {};
  [...(localTombs||[]), ...(remoteTombs||[])].forEach(t=>{ if(t&&t.id&&t.kind==="list") listTombs[t.id]=Math.max(listTombs[t.id]||0,t.at||0); });
  const map = {};
  const consider = (l) => {
    if(!l || !l.id) return;
    const prev = map[l.id];
    if(!prev){ map[l.id] = {...l, tasks:[...(l.tasks||[])]}; return; }
    // Fusionar tareas de ambas versiones de la misma lista
    prev.tasks = mergeById(prev.tasks, l.tasks, localTombs, remoteTombs);
    // Metadatos de la lista (nombre, plegado): el más reciente
    if((l.updatedAt||0) > (prev.updatedAt||0)){ prev.name = l.name; prev.collapsed = l.collapsed; prev.updatedAt = l.updatedAt; prev.fixed = l.fixed; }
  };
  (localLists||[]).forEach(consider);
  (remoteLists||[]).forEach(consider);
  const result = Object.values(map).filter(l=>{
    const delAt = listTombs[l.id];
    return !(delAt && delAt >= (l.updatedAt||0));
  });
  // Ordenar: la lista fija (diaria) siempre primera
  result.sort((a,b)=> (b.fixed?1:0)-(a.fixed?1:0));
  return result;
}

// Poda tombstones caducados
export function pruneTombs(tombs) {
  const now = Date.now();
  return (tombs||[]).filter(t=>t && (now-(t.at||0)) < TOMB_TTL);
}

// Fusiona dos archivos de tareas diarias por semana, sin duplicados (clave: título+día)
export function mergeDailyArchive(a, b) {
  const out = {};
  const weeks = new Set([...Object.keys(a||{}), ...Object.keys(b||{})]);
  weeks.forEach(wk=>{
    const seen = new Set();
    const merged = [];
    [...((a&&a[wk])||[]), ...((b&&b[wk])||[])].forEach(it=>{
      if(!it || !it.title) return;
      const dayK = it.doneAt ? new Date(it.doneAt).toDateString() : "";
      const k = it.title + "|" + dayK;
      if(seen.has(k)) return;
      seen.add(k); merged.push(it);
    });
    if(merged.length) out[wk] = merged;
  });
  return out;
}

export function getSyncCode() {
  let c = null;
  try { c = localStorage.getItem(SYNC_CODE_KEY); } catch(e){}
  if(!c) {
    // v3.26: cada perfil tiene su propia copia en la nube (RDeRandom, la de siempre)
    const principal = perfilEnUso() === "rderandom" ? MAIN_SYNC_CODE : MAIN_SYNC_CODE + "-" + perfilEnUso();
    c = (window.studioFS || perfilEnUso() !== "rderandom") ? principal : ((window.crypto && crypto.randomUUID) ? crypto.randomUUID() : ("code-"+Math.random().toString(36).slice(2)+Date.now().toString(36)));
    try { localStorage.setItem(SYNC_CODE_KEY, c); } catch(e){}
  }
  return c;
}
export function storeSyncCode(code) { try { localStorage.setItem(SYNC_CODE_KEY, code); } catch(e){} }

// v3: la nube va a través del backend (/api/datos) con la sesión de Google del
// canal. Supabase ya no se toca desde la app: la tabla está cerrada (RLS) y antes
// cualquiera con la web pública podía leer o borrar los datos.
export async function cloudToken() {
  if(!ytIsConnected()) throw new Error("Conecta Google para sincronizar");
  if(!(await ytEnsureToken())) throw new Error("La sesión de Google caducó");
  const t = ytGetTokens();
  const token = t && t.access_token;
  // alta del equipo + «inicio de sesión» en el registro de accesos (una vez por ejecución)
  if (token) await asegurarEquipo(YT_BACKEND, token);
  return token;
}
export async function cloudLoad(code) {
  const token = await cloudToken();
  const r = await fetch(YT_BACKEND + "/api/datos?code=" + encodeURIComponent(code), { headers: { Authorization: "Bearer " + token, ...(await cabecerasEquipo("GET", "/api/datos")) } });
  const j = await r.json().catch(()=>({}));
  if(!r.ok || !j.success) throw new Error(j.error || ("Error " + r.status));
  return j.data ? { data: j.data, updated_at: j.updated_at } : null;
}
export async function cloudFecha(code) {
  const token = await cloudToken();
  const r = await fetch(YT_BACKEND + "/api/datos?solo=fecha&code=" + encodeURIComponent(code), { headers: { Authorization: "Bearer " + token, ...(await cabecerasEquipo("GET", "/api/datos")) } });
  const j = await r.json().catch(()=>({}));
  if(!r.ok || !j.success) throw new Error(j.error || ("Error " + r.status));
  return j.updated_at ? new Date(j.updated_at).getTime() : 0;
}
export async function cloudSave(code, payload) {
  const token = await cloudToken();
  const r = await fetch(YT_BACKEND + "/api/datos", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token, ...(await cabecerasEquipo("POST", "/api/datos")) },
    body: JSON.stringify({ code, data: payload })
  });
  const j = await r.json().catch(()=>({}));
  if(!r.ok || !j.success) throw new Error(j.error || ("Error " + r.status));
}
// Guardado urgente al cerrar o pasar a segundo plano (fetch keepalive): usa el
// token que ya haya, sin renovarlo (no da tiempo)
export function cloudSaveUrgente(code, payload) {
  const t = ytGetTokens();
  if(!t || !t.access_token || !ytTokenValid()) return;
  try {
    fetch(YT_BACKEND + "/api/datos", {
      method: "POST", keepalive: true,
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + t.access_token, ...cabecerasUrgentes() },
      body: JSON.stringify({ code, data: payload })
    }).catch(()=>{});
  } catch(e){}
}

/* ============================ CONFIGURACIÓN ============================ */
