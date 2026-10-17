import React from "react";
const { useState, useEffect, useRef, useMemo, useCallback } = React;
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_FORMATS, Icons, STATUSES, clone, getIdBase, setIdBase } from "./base";

export function StatStrip({videos}) {
  const count = st => videos.filter(v=>v.status===st).length;
  const items = [
    {label:"Total vídeos", value:videos.length, icon:Icons.calendar, color:"var(--text)"},
    {label:"Ideas en bruto", value:count("idea"), icon:Icons.sparkle, color:STATUSES.idea.color},
    {label:"Grabados", value:count("grabacion"), icon:Icons.camera, color:STATUSES.grabacion.color},
    {label:"Editados", value:count("edicion"), icon:Icons.scissors, color:STATUSES.edicion.color},
    {label:"Programados", value:count("programado"), icon:Icons.clock, color:STATUSES.programado.color},
    {label:"Publicados", value:count("publicado"), icon:Icons.check, color:STATUSES.publicado.color},
  ];
  return (
    <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:10,marginBottom:22}} className="stat-grid">
      {items.map((it,i)=>(
        <div key={i} style={{background:"var(--bg-2)",border:"1px solid var(--border)",borderRadius:13,padding:"13px 14px",display:"flex",alignItems:"center",gap:11}}>
          <div style={{width:36,height:36,borderRadius:10,flexShrink:0,background:"var(--card)",display:"flex",alignItems:"center",justifyContent:"center",color:it.color||"var(--text-2)"}}>{it.icon}</div>
          <div style={{minWidth:0}}>
            <div style={{fontSize:21,fontWeight:700,fontFamily:"'Sora'",color:it.color||"var(--text)",lineHeight:1.1}}>{it.value}</div>
            <div style={{fontSize:10,color:"var(--text-3)",textTransform:"uppercase",letterSpacing:".03em",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{it.label}</div>
          </div>
        </div>
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
  // Analíticas (visitas e ingresos) para el panel de Objetivos
  "https://www.googleapis.com/auth/yt-analytics.readonly",
  "https://www.googleapis.com/auth/yt-analytics-monetary.readonly"
].join(" ");

/* ============================ GEMINI (IA gratuita, opcional) ============================ */
// La clave la genera el usuario gratis en https://aistudio.google.com/apikey y se guarda local.
export const GEMINI_KEY_STORE = "rds_gemini_key";
export const GEMINI_MODEL_STORE = "rds_gemini_model"; // modelo que el usuario prefiere / que funcionó
export const GEMINI_SYSTEM_STORE = "rds_gemini_system"; // instrucciones de sistema (tipo "Gem")
// Modelos gratuitos a probar, del mejor al más compatible. gemini-flash-latest es un alias
// estable que apunta siempre al Flash vigente (evita errores 404 por nombres caducados).
// Modelos gratuitos ESTABLES y vigentes (jul 2026), del mejor al de respaldo.
// Notas: gemini-2.0-flash se discontinuó (jun 2026); gemini-2.5-flash-lite pasó a ser
// SOLO de pago para cuentas nuevas; gemini-flash-latest es experimental (límites muy bajos).
export const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-3.5-flash"];

export function geminiGetKey(){ try { return localStorage.getItem(GEMINI_KEY_STORE) || ""; } catch(e){ return ""; } }
export function geminiSaveKey(k){ try { localStorage.setItem(GEMINI_KEY_STORE, k||""); } catch(e){} }
export function geminiHasKey(){ return !!geminiGetKey(); }
export function geminiGetModel(){
  try {
    const m = localStorage.getItem(GEMINI_MODEL_STORE) || "";
    // Ignorar modelos ya retirados o experimentales que guardaron versiones anteriores,
    // para que no se usen como preferidos y provoquen 404/429.
    const obsoletos = ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-2.5-flash-lite", "gemini-flash-latest", "gemini-1.5-flash", "gemini-1.5-pro"];
    if(obsoletos.includes(m)){ localStorage.removeItem(GEMINI_MODEL_STORE); return ""; }
    return m;
  } catch(e){ return ""; }
}
export function geminiSaveModel(m){ try { if(m) localStorage.setItem(GEMINI_MODEL_STORE, m); } catch(e){} }
export function geminiGetSystem(){ try { return localStorage.getItem(GEMINI_SYSTEM_STORE) || ""; } catch(e){ return ""; } }
export function geminiSaveSystem(s){ try { localStorage.setItem(GEMINI_SYSTEM_STORE, s||""); } catch(e){} }

// Llama a un modelo concreto de Gemini. Devuelve {ok, text, status, error}.
export async function geminiCall(model, prompt, system){
  const key = geminiGetKey();
  const url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + encodeURIComponent(key);
  const build = (maxTok) => {
    const b = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.9,
        maxOutputTokens: maxTok
      }
    };
    // El "thinking" consume tokens de la salida y puede dejar la respuesta vacía.
    // Los modelos 2.5 aceptan thinkingBudget (número); los de la serie 3 usan
    // thinkingLevel (texto). Enviar el campo equivocado da error 400, así que adaptamos.
    if(/^gemini-2\.5/.test(model)){
      b.generationConfig.thinkingConfig = { thinkingBudget: 0 };
    } else if(/^gemini-3/.test(model)){
      b.generationConfig.thinkingConfig = { thinkingLevel: "minimal" };
    }
    if(system && system.trim()) b.systemInstruction = { parts: [{ text: system.trim() }] };
    return b;
  };
  const doPost = async (maxTok, sinThinking) => {
    try {
      const b = build(maxTok);
      if(sinThinking && b.generationConfig.thinkingConfig) delete b.generationConfig.thinkingConfig;
      const res = await fetch(url, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(b) });
      const data = await res.json().catch(()=>({}));
      return { res, data };
    } catch(e){ return { res:{ok:false,status:0}, data:{} }; }
  };

  let { res, data } = await doPost(2048);

  // Si el modelo rechaza el campo de thinking (400 con mención a thinking), reintentar sin él
  if(!res.ok && res.status===400 && /think/i.test(data?.error?.message||"")){
    const retry = await doPost(8192, true);
    res = retry.res; data = retry.data;
  }

  // Si la respuesta salió vacía por MAX_TOKENS (thinking), reintentar UNA vez con más espacio.
  const emptyByMaxTokens = (rr, dd) => rr.ok && !(dd?.candidates?.[0]?.content?.parts?.some(p=>p.text))
    && dd?.candidates?.[0]?.finishReason==="MAX_TOKENS";
  if(emptyByMaxTokens(res, data)){
    const retry = await doPost(8192);
    res = retry.res; data = retry.data;
  }

  if(res.ok){
    const cand = data?.candidates?.[0];
    const text = cand?.content?.parts?.map(p=>p.text).filter(Boolean).join("") || "";
    if(text) return { ok:true, text: text.trim() };
    // Respuesta vacía: distinguir la causa real
    const reason = cand?.finishReason;
    if(reason==="MAX_TOKENS"){
      return { ok:false, status:200, error:"La respuesta se quedó sin espacio. Prueba un prompt más corto." };
    }
    if(reason==="SAFETY" || reason==="PROHIBITED_CONTENT"){
      return { ok:false, status:200, error:"Gemini bloqueó la respuesta por seguridad. Reformula el prompt." };
    }
    if(!data?.candidates || data.candidates.length===0){
      const block = data?.promptFeedback?.blockReason;
      if(block) return { ok:false, status:200, error:"Gemini bloqueó la petición ("+block+"). Reformula el prompt." };
    }
    return { ok:false, status:200, error: reason ? ("Gemini no generó texto ("+reason+")") : "Gemini no devolvió texto" };
  }
  const msg = data?.error?.message || "";
  return { ok:false, status:res.status, error: msg || ("Error "+res.status), notFound: res.status===404 };
}

// Genera texto probando modelos hasta que uno funcione. Recuerda el que funcionó.
export async function geminiGenerate(prompt, systemOverride){
  const key = geminiGetKey();
  if(!key) throw new Error("Falta la clave de Gemini. Configúrala en el apartado Agente.");
  const system = (systemOverride!=null ? systemOverride : geminiGetSystem());

  // Orden de modelos: primero el que el usuario haya fijado, luego los estables por defecto.
  const preferred = geminiGetModel();
  const models = [preferred, ...GEMINI_MODELS].filter((m,i,arr)=> m && arr.indexOf(m)===i);

  let lastErr = "No se pudo generar la descripción";
  for(const model of models){
    const r = await geminiCall(model, prompt, system);
    if(r.ok){ geminiSaveModel(model); return r.text; }

    // Errores DEFINITIVOS → parar de inmediato (no malgastar más peticiones ni cuota):
    if(r.status===400 && /API[ _]?key/i.test(r.error))
      throw new Error("La clave de Gemini no es válida. Revísala en el apartado Agente.");
    if(r.status===403)
      throw new Error("Gemini rechazó la clave (403). Habilita la API «Generative Language» para tu clave en Google AI Studio.");
    if(r.status===429)
      // MUY IMPORTANTE: no seguimos probando otros modelos, porque cada intento consume
      // más cuota del minuto y agrava el bloqueo. Paramos y avisamos.
      throw new Error("Límite gratuito de Gemini alcanzado (máx. ~15 por minuto). Espera un minuto y vuelve a intentarlo.");
    if(r.status===200 && /seguridad|bloqueó/i.test(r.error))
      throw new Error(r.error); // bloqueo de contenido: cambiar de modelo no ayuda

    // Modelo retirado para esta cuenta → olvidarlo como preferido y probar el siguiente
    if(/no longer available|not available/i.test(r.error||"")){
      try { if(model === localStorage.getItem(GEMINI_MODEL_STORE)) localStorage.removeItem(GEMINI_MODEL_STORE); } catch(e){}
    }

    // Errores recuperables (404 modelo no disponible, 5xx puntual, sin texto) → probar el siguiente
    lastErr = r.error || lastErr;
  }
  throw new Error(lastErr + ". Prueba de nuevo en un momento o elige otro modelo en el apartado Agente.");
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
export async function ytExchangeCode(code){
  try {
    const res = await fetch(YT_BACKEND + "/api/auth/exchange", {
      method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ code, redirectUri: YT_REDIRECT })
    });
    const data = await res.json().catch(()=>({}));
    if(!res.ok || !data.success || !data.access_token) return false;
    const prev = ytGetTokens() || {};
    ytSaveTokens({
      access_token: data.access_token,
      refresh_token: data.refresh_token || prev.refresh_token || null,
      expires_at: Date.now() + (data.expires_in||3600)*1000
    });
    return true;
  } catch(e){ return false; }
}
export async function ytRefreshWithToken(){
  const t = ytGetTokens();
  if(!t || !t.refresh_token) return false;
  try {
    const res = await fetch(YT_BACKEND + "/api/auth/refresh", {
      method:"POST", headers:{ "Content-Type":"application/json" },
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
  const limite = Math.min(max||150, 200);
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
    c = window.studioFS ? MAIN_SYNC_CODE : ((window.crypto && crypto.randomUUID) ? crypto.randomUUID() : ("code-"+Math.random().toString(36).slice(2)+Date.now().toString(36)));
    try { localStorage.setItem(SYNC_CODE_KEY, c); } catch(e){}
  }
  return c;
}
export function storeSyncCode(code) { try { localStorage.setItem(SYNC_CODE_KEY, code); } catch(e){} }

export async function cloudLoad(code) {
  const sb = await ensureAuth();
  const { data, error } = await sb.from("rivals_data").select("data, updated_at").eq("user_id", code).maybeSingle();
  if(error) throw error;
  return data;
}
export async function cloudSave(code, payload) {
  const sb = await ensureAuth();
  const { error } = await sb.from("rivals_data").upsert(
    { user_id: code, data: payload, updated_at: new Date().toISOString() },
    { onConflict: "user_id" }
  );
  if(error) throw error;
}

/* ============================ CONFIGURACIÓN ============================ */
