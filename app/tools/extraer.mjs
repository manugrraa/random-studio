/* Extrae el CSS y el código React del HTML original (v1.4.1) y los adapta
   al proyecto Vite/Electron. Cada sustitución exige exactamente 1 coincidencia:
   si el original cambia, el script avisa en vez de romper en silencio. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const HTML = path.join(raiz, "..", "index.html"); // el index.html del repo (v1.4.1)
const src = fs.readFileSync(HTML, "utf8").replace(/\r\n/g, "\n");

const fallos = [];
function reemplazar(texto, busca, pon, nombre) {
  const n = texto.split(busca).length - 1;
  if (n !== 1) { fallos.push(`${nombre}: ${n} coincidencias (se esperaba 1)`); return texto; }
  return texto.replace(busca, pon);
}

/* ---------- 1. CSS ---------- */
const css = src.split("<style>")[1].split("</style>")[0];
fs.mkdirSync(path.join(raiz, "src"), { recursive: true });
fs.writeFileSync(path.join(raiz, "src", "styles.css"), css.trim() + "\n");

/* ---------- 2. Código de la app ---------- */
const ini = src.indexOf('<script type="text/babel">');
const fin = src.lastIndexOf("</script>");
if (ini < 0 || fin < 0) { console.error("No encuentro el bloque babel"); process.exit(1); }
let js = src.slice(ini + '<script type="text/babel">'.length, fin);

/* Cabecera de imports (sustituye a los CDNs) */
const cabecera = `import React from "react";
import ReactDOM from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import "./styles.css";
`;

/* Versión */
js = reemplazar(js, `const APP_VERSION = "1.4.1";`, `const APP_VERSION = "2.0.0";`, "version");

/* Supabase por import en vez de window.supabase */
js = reemplazar(js,
`  if(_sb) return _sb;
  if(typeof window === "undefined" || !window.supabase || !window.supabase.createClient) return null;`,
`  if(_sb) return _sb;`, "supabase-check");
js = reemplazar(js,
`    _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {`,
`    _sb = createClient(SUPABASE_URL, SUPABASE_KEY, {`, "supabase-create");

/* Persistencia: en escritorio manda el archivo local (studioFS) */
js = reemplazar(js,
`    const raw = localStorage.getItem(STORE_KEY);`,
`    const raw = (typeof window !== "undefined" && window.studioFS) ? window.studioFS.load() : localStorage.getItem(STORE_KEY);`, "load");
js = reemplazar(js,
`  try { localStorage.setItem(STORE_KEY, JSON.stringify({ videos, formats, trash: trash||[], taskLists: taskLists||[], tombstones: tombstones||[], dailyArchive: dailyArchive||{}, tagTemplates: tagTemplates||[], subHistory: subHistory||[], promptTemplates: promptTemplates||[], savedAt: Date.now() })); return true; }
  catch(e) { return false; }`,
`  try {
    const txt = JSON.stringify({ videos, formats, trash: trash||[], taskLists: taskLists||[], tombstones: tombstones||[], dailyArchive: dailyArchive||{}, tagTemplates: tagTemplates||[], subHistory: subHistory||[], promptTemplates: promptTemplates||[], savedAt: Date.now() });
    if(window.studioFS) window.studioFS.save(txt); else localStorage.setItem(STORE_KEY, txt);
    return true;
  }
  catch(e) { return false; }`, "save");
js = reemplazar(js,
`function clearStore() { try { localStorage.removeItem(STORE_KEY); } catch(e){} }`,
`function clearStore() { try { if(window.studioFS) window.studioFS.clear(); localStorage.removeItem(STORE_KEY); } catch(e){} }`, "clear");

/* Nuevos usuarios/dispositivos arrancan vacíos (sin datos de demostración) */
js = reemplazar(js,
`    const base = _initial ? _initial.videos : SEED;`,
`    const base = _initial ? _initial.videos : [];`, "seed");

/* Migración v2.0: unificar todos los dispositivos en un único código de sincronización */
js = reemplazar(js,
`const SYNC_CODE_KEY = "rivals_sync_code";`,
`const SYNC_CODE_KEY = "rivals_sync_code";

/* ——— Migración v2.0 (23/8/2026): unificar dispositivos en un solo código ———
   Los dispositivos que quedaron con un código antiguo adoptan el principal y
   bajan los datos buenos de la nube; su copia local queda guardada aparte. */
const MAIN_SYNC_CODE = "a4c23831-be67-4c4c-92d9-f6743acc101e";
const OLD_SYNC_CODES = [
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
})();`, "migracion");

/* En escritorio, el primer arranque usa directamente el código principal */
js = reemplazar(js,
`    c = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : ("code-"+Math.random().toString(36).slice(2)+Date.now().toString(36));`,
`    c = window.studioFS ? MAIN_SYNC_CODE : ((window.crypto && crypto.randomUUID) ? crypto.randomUUID() : ("code-"+Math.random().toString(36).slice(2)+Date.now().toString(36)));`, "sync-code-escritorio");

/* Login de Google: en escritorio se abre en ventana propia (el token vuelve por IPC) */
js = reemplazar(js,
`  window.location.href = "https://accounts.google.com/o/oauth2/v2/auth?" + params.toString();
}`,
`  const authUrl = "https://accounts.google.com/o/oauth2/v2/auth?" + params.toString();
  if(window.studioFS && window.studioFS.oauth){
    window.studioFS.oauth(authUrl, YT_REDIRECT, {}).then(hash=>{
      const h = new URLSearchParams(String(hash||"").replace(/^#/,""));
      const at = h.get("access_token");
      if(at){
        ytSaveTokens({ access_token: at, expires_at: Date.now() + (parseInt(h.get("expires_in")||"3600",10))*1000 });
        window.location.reload();
      }
    });
    return;
  }
  window.location.href = authUrl;
}`, "oauth-interactivo");

/* Renovación silenciosa: en escritorio, ventana oculta interceptada (sin iframes) */
js = reemplazar(js,
`function ytSilentRefresh(){
  if(_ytSilentInFlight) return _ytSilentInFlight;`,
`function ytSilentRefresh(){
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
  }`, "oauth-silencioso");

/* Notificaciones: en escritorio no hay Service Worker; se usa Notification directa */
js = reemplazar(js,
`      if(navigator.serviceWorker && navigator.serviceWorker.ready){`,
`      if(!window.studioFS && navigator.serviceWorker && navigator.serviceWorker.controller){`, "notificaciones");

if (fallos.length) {
  console.error("SUSTITUCIONES FALLIDAS:\n - " + fallos.join("\n - "));
  process.exit(1);
}

fs.writeFileSync(path.join(raiz, "src", "app.jsx"), cabecera + js.trim() + "\n");
console.log("OK: src/styles.css y src/app.jsx generados");
