/* REGISTRO de todo lo que hace RandomStudio (3-11-2026, él: «un log para reportar todo lo que se haga y así que sea más
 * fácil encontrar fallos cuando los haya»).
 *
 * Una línea por cosa que pasa, con fecha y hora, en archivos por día:
 *   <datos de la app>\registro\2026-11-03.log           todo (arranque, versiones, chat, historias, kit, órdenes, errores)
 *   <proyecto>\estudio\_registro\2026-11-03.log         solo lo del estudio de historias y el kit (lo lee Claude Code
 *                                                       al arreglar algo: está en el proyecto, no en AppData)
 * Formato:  13:05:22 [historias] empieza render de 17_horas_sueno {"id":"17_horas_sueno"}
 * Se guardan 30 días. Nunca lleva claves ni tokens (quien anota no debe pasarlos). Si algo falla al escribir, no pasa
 * nada: el registro nunca puede romper la app.
 *
 * Desde el motor: require("./registro.cjs").anotar("historias", "texto", { datos }).
 * Desde la interfaz: window.studioFS.registro("equipo", "texto", { datos }) (IPC registro-anotar).
 * Verlo: Historias › Ajustes › «Registro de este equipo» (IPC registro-leer) y «Abrir la carpeta» (registro-abrir). */
const { app, ipcMain, shell } = require("electron");
const fs = require("fs");
const path = require("path");

const DIAS = 30;
let _proyecto = null;               // función que devuelve la raíz del proyecto de historias (o null)
let _ultimaLimpieza = 0;

const dirApp = () => path.join(app.getPath("userData"), "registro");
function dirProyecto() {
  try { const r = _proyecto && _proyecto(); return r && fs.existsSync(path.join(r, "estudio")) ? path.join(r, "estudio", "_registro") : null; } catch (e) { return null; }
}
const hoy = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const hora = () => { const d = new Date(); return [d.getHours(), d.getMinutes(), d.getSeconds()].map(x => String(x).padStart(2, "0")).join(":"); };

// lo que nunca debe acabar en el registro (por si alguien pasa un objeto con una clave dentro)
const SECRETO = /key|token|clave|secret|password|contrase/i;
function limpio(datos) {
  if (!datos || typeof datos !== "object") return datos;
  const out = Array.isArray(datos) ? [] : {};
  for (const [k, v] of Object.entries(datos)) {
    if (SECRETO.test(k)) { out[k] = "(oculto)"; continue; }
    out[k] = v && typeof v === "object" ? limpio(v) : (typeof v === "string" && v.length > 600 ? v.slice(0, 600) + "…" : v);
  }
  return out;
}

const DEL_PROYECTO = new Set(["historias", "kit", "equipo", "relevo", "claude", "error"]);
function escribir(dir, linea) {
  try { fs.mkdirSync(dir, { recursive: true }); fs.appendFileSync(path.join(dir, hoy() + ".log"), linea + "\n"); } catch (e) {}
}
/** ambito: arranque | version | historias | kit | equipo | relevo | claude | chat | error | orden */
function anotar(ambito, texto, datos) {
  try {
    let extra = "";
    if (datos !== undefined && datos !== null) { try { extra = " " + JSON.stringify(limpio(datos)); } catch (e) { extra = " " + String(datos); } }
    const linea = hora() + " [" + String(ambito || "app") + "] " + String(texto || "").replace(/\s+/g, " ").trim() + extra;
    escribir(dirApp(), linea);
    if (DEL_PROYECTO.has(ambito)) { const d = dirProyecto(); if (d) escribir(d, linea); }
    if (Date.now() - _ultimaLimpieza > 6 * 3600000) { _ultimaLimpieza = Date.now(); limpiar(); }
  } catch (e) {}
}
function limpiar() {
  for (const d of [dirApp(), dirProyecto()]) {
    if (!d) continue;
    try {
      for (const n of fs.readdirSync(d)) {
        const m = n.match(/^(\d{4}-\d{2}-\d{2})\.log$/);
        if (m && Date.now() - Date.parse(m[1]) > DIAS * 86400000) fs.unlinkSync(path.join(d, n));
      }
    } catch (e) {}
  }
}
/** Las últimas n líneas (hoy y, si hacen falta, ayer). */
function leer(n = 80, ambito) {
  const lineas = [];
  try {
    const ns = fs.readdirSync(dirApp()).filter(x => /^\d{4}-\d{2}-\d{2}\.log$/.test(x)).sort().slice(-2);
    for (const f of ns) for (const l of fs.readFileSync(path.join(dirApp(), f), "utf8").split(/\r?\n/)) if (l && (!ambito || l.includes("[" + ambito + "]"))) lineas.push(f.slice(0, 10) + " " + l);
  } catch (e) {}
  return lineas.slice(-n);
}

function iniciar(opts) {
  _proyecto = opts && opts.proyecto;
  ipcMain.handle("registro-anotar", async (e, ambito, texto, datos) => { anotar(String(ambito || "equipo").slice(0, 20), String(texto || "").slice(0, 1000), datos); return true; });
  ipcMain.handle("registro-leer", async (e, n, ambito) => ({ ok: true, lineas: leer(Math.min(400, Number(n) || 80), ambito ? String(ambito) : null), carpeta: dirApp(), proyecto: dirProyecto() }));
  ipcMain.handle("registro-abrir", async () => { try { fs.mkdirSync(dirApp(), { recursive: true }); await shell.openPath(dirApp()); return { ok: true }; } catch (x) { return { ok: false, error: x.message }; } });
  process.on("uncaughtException", (err) => anotar("error", "excepción no controlada: " + (err && err.stack || err)));
  process.on("unhandledRejection", (err) => anotar("error", "promesa rechazada sin control: " + (err && err.stack || err)));
}

module.exports = { anotar, leer, iniciar };
