/* Actualizaciones de RandomStudio (v3.35, rehecho).
 *
 * Una versión nueva es, casi siempre, solo el código (un .asar de ~13 MB). Antes se sobrescribía app.asar con un script
 * externo que cerraba la app a la fuerza: a veces no llegaba a hacerlo y, peor, el cierre a la fuerza no dejaba guardar
 * las sesiones (Chromium guarda el almacenamiento local al cerrarse de forma normal; app.exit() se lo salta).
 * Ahora (ver electron/arranque.cjs):
 *  - la versión nueva se guarda aparte en <carpeta del programa>/versiones/ (comprobada con SHA-256),
 *  - versiones/actual.json dice cuál cargar,
 *  - y la app se reinicia de forma NORMAL: guarda todo en disco, app.relaunch() + app.quit().
 * El portátil publica su versión (la que está ejecutando) para los demás equipos; los demás la bajan desde aquí.
 *
 * Se registra solo con require("./actualizar.cjs") (desde historias.cjs).
 */
const { app, BrowserWindow, ipcMain, session } = require("electron");
const crypto = require("crypto");
const ofs = require("original-fs");          // los .asar se leen y escriben como archivos (el fs de Electron los abre como carpetas)
const path = require("path");

const VERSION = require("../package.json").version;              // la del código que se está ejecutando
const miAsar = () => global.RS_ASAR || path.resolve(__dirname, "..");
const dirVersiones = () => global.RS_VERSIONES || path.join(path.dirname(process.execPath), "versiones");
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const num = (v) => String(v || "0.0.0").split(".").map(Number).reduce((a, n) => a * 1000 + (n || 0), 0);
const leerJson = (f) => { try { return JSON.parse(ofs.readFileSync(f, "utf8")); } catch (e) { return null; } };
const escribirJson = (f, v) => { ofs.mkdirSync(path.dirname(f), { recursive: true }); ofs.writeFileSync(f, JSON.stringify(v, null, 1)); };

ipcMain.handle("act-info", async () => {
  const a = miAsar();
  if (!app.isPackaged || !/\.asar$/i.test(a)) return { ok: false, version: VERSION, electron: process.versions.electron, empaquetada: false };
  try {
    const b = ofs.readFileSync(a);
    return { ok: true, version: VERSION, electron: process.versions.electron, sha256: sha256(b), tam: b.length, empaquetada: true };
  } catch (e) { return { ok: false, error: e.message, version: VERSION, electron: process.versions.electron }; }
});

// el portátil sube su código al enlace firmado que le da el servidor
ipcMain.handle("act-subir", async (e, url) => {
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/upload\/sign\//.test(String(url))) throw new Error("Enlace de subida no válido");
  const b = ofs.readFileSync(miAsar());
  const r = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/octet-stream", "x-upsert": "true" }, body: b });
  if (!r.ok) throw new Error("No se pudo subir: " + r.status + " " + (await r.text()).slice(0, 200));
  return { ok: true };
});

/** Reinicio NORMAL: guarda el almacenamiento y las cookies en disco y se cierra como siempre; Electron la reabre. */
let reiniciando = false;
async function reiniciar() {
  if (reiniciando) return;
  reiniciando = true;
  try { session.defaultSession.flushStorageData(); } catch (e) {}
  try { await session.defaultSession.cookies.flushStore(); } catch (e) {}
  app.relaunch();
  setTimeout(() => app.quit(), 400);
}

function dejarLista(version, archivo, sha) {
  escribirJson(path.join(dirVersiones(), "actual.json"), { version, archivo, sha256: sha, fecha: new Date().toISOString(), intentos: 0, ok: false });
  // se quedan solo la nueva y la anterior
  try {
    const actual = path.join(dirVersiones(), archivo), anterior = miAsar();
    for (const f of ofs.readdirSync(dirVersiones())) {
      const p = path.join(dirVersiones(), f);
      if (/\.asar$/i.test(f) && p !== actual && p !== anterior) ofs.unlinkSync(p);
    }
  } catch (e) {}
}

// los demás equipos: bajar, comprobar, dejarla lista y reiniciar
ipcMain.handle("act-instalar", async (e, url, esperado, version) => {
  if (!app.isPackaged) throw new Error("Solo en la app instalada");
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/sign\//.test(String(url))) throw new Error("Enlace de descarga no válido");
  if (!/^\d+\.\d+\.\d+$/.test(String(version || ""))) throw new Error("Versión no válida");
  const r = await fetch(url);
  if (!r.ok) throw new Error("No se pudo bajar la versión nueva (" + r.status + ")");
  const b = Buffer.from(await r.arrayBuffer());
  if (sha256(b) !== String(esperado || "").toLowerCase()) throw new Error("La descarga no coincide con la versión publicada: no se instala");
  const archivo = "RandomStudio-" + version + ".asar";
  ofs.mkdirSync(dirVersiones(), { recursive: true });
  ofs.writeFileSync(path.join(dirVersiones(), archivo), b);
  dejarLista(version, archivo, esperado);
  await reiniciar();
  return { ok: true };
});

// el portátil: versión preparada al lado por `npm run instalar` con la app abierta (versiones/pendiente.json)
function pendiente() {
  const f = path.join(dirVersiones(), "pendiente.json");
  let p = null, err = "";
  try { p = JSON.parse(ofs.readFileSync(f, "utf8").replace(/^﻿/, "")); } catch (e) { err = e.message; }
  if (!p || !p.version) return { ok: false, motivo: "sin pendiente.json (" + (err || "vacío") + ")", carpeta: dirVersiones() };
  const a = path.join(dirVersiones(), path.basename(p.archivo || ""));
  if (!ofs.existsSync(a)) return { ok: false, motivo: "no está el archivo " + a };
  if (num(p.version) <= num(VERSION)) return { ok: false, motivo: "no es más nueva (" + p.version + " ≤ " + VERSION + ")" };
  return { ok: true, version: p.version, archivo: path.basename(p.archivo), sha256: p.sha256 || null, f };
}
ipcMain.handle("act-local", async () => { const p = pendiente(); return p.ok ? { ok: true, version: p.version } : p; });
ipcMain.handle("act-local-aplicar", async () => {
  const p = pendiente();
  if (!p.ok) throw new Error("No hay ninguna versión preparada: " + p.motivo);
  dejarLista(p.version, p.archivo, p.sha256);
  try { ofs.unlinkSync(p.f); } catch (e) {}
  await reiniciar();
  return { ok: true };
});

// aviso al momento: si aparece una versión preparada en versiones/, se avisa a las ventanas (no hay que esperar al repaso)
app.whenReady().then(() => {
  try {
    ofs.mkdirSync(dirVersiones(), { recursive: true });
    let t = null;
    require("fs").watch(dirVersiones(), () => {
      clearTimeout(t);
      t = setTimeout(() => { for (const w of BrowserWindow.getAllWindows()) { try { w.webContents.send("act-cambio"); } catch (e) {} } }, 800);
    });
  } catch (e) {}
});

// si esta versión viene de versiones/ y ha arrancado bien un rato, queda confirmada (si no, arranque.cjs vuelve a la instalada)
app.whenReady().then(() => setTimeout(() => {
  const f = path.join(dirVersiones(), "actual.json"), a = leerJson(f);
  if (a && !a.ok && path.join(dirVersiones(), path.basename(a.archivo || "")) === miAsar()) { a.ok = true; a.intentos = 0; escribirJson(f, a); }
}, 20000));

module.exports = { VERSION };
