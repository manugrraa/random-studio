/* Actualizaciones de RandomStudio (v3.32): una versión nueva es, casi siempre, solo un app.asar nuevo (~13 MB).
 * - El portátil publica el suyo (la versión que tiene instalada) desde Administración.
 * - Los demás equipos lo bajan, comprueban su SHA-256 y, al cerrar, un pequeño script cambia el archivo y vuelve a abrir.
 * Si cambia la versión de Electron hace falta el paquete completo (lo avisa la app).
 *
 * Se registra solo con require("./actualizar.cjs") (desde historias.cjs).
 */
const { app, ipcMain } = require("electron");
const { spawn } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const miAsar = () => path.join(process.resourcesPath, "app.asar");
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

ipcMain.handle("act-info", async () => {
  try {
    const b = fs.readFileSync(miAsar());
    return { ok: true, version: app.getVersion(), electron: process.versions.electron, sha256: sha256(b), tam: b.length, empaquetada: app.isPackaged };
  } catch (e) { return { ok: false, error: e.message, version: app.getVersion(), electron: process.versions.electron }; }
});

// el portátil sube su app.asar al enlace firmado que le da el servidor
ipcMain.handle("act-subir", async (e, url) => {
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/upload\/sign\//.test(String(url))) throw new Error("Enlace de subida no válido");
  const b = fs.readFileSync(miAsar());
  const r = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/octet-stream", "x-upsert": "true" }, body: b });
  if (!r.ok) throw new Error("No se pudo subir: " + r.status + " " + (await r.text()).slice(0, 200));
  return { ok: true };
});

// los demás equipos: bajar, comprobar y reiniciar con la versión nueva
ipcMain.handle("act-instalar", async (e, url, esperado) => {
  if (!app.isPackaged) throw new Error("Solo en la app instalada");
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/sign\//.test(String(url))) throw new Error("Enlace de descarga no válido");
  const r = await fetch(url);
  if (!r.ok) throw new Error("No se pudo bajar la versión nueva (" + r.status + ")");
  const b = Buffer.from(await r.arrayBuffer());
  if (sha256(b) !== String(esperado || "").toLowerCase()) throw new Error("La descarga no coincide con la versión publicada: no se instala");
  const nueva = miAsar() + ".nueva";
  fs.writeFileSync(nueva, b);
  const exe = process.execPath, pid = process.pid;
  const bat = path.join(os.tmpdir(), "randomstudio_actualizar.cmd");
  fs.writeFileSync(bat, [
    "@echo off",
    ":espera",
    `tasklist /FI "PID eq ${pid}" | find "${pid}" >nul && (timeout /t 1 /nobreak >nul & goto espera)`,
    "timeout /t 2 /nobreak >nul",
    `move /Y "${nueva}" "${miAsar()}" >nul`,
    `start "" "${exe}"`,
    'del "%~f0"',
  ].join("\r\n"));
  spawn("cmd.exe", ["/c", bat], { detached: true, stdio: "ignore", windowsHide: true }).unref();
  setTimeout(() => app.quit(), 300);
  setTimeout(() => app.exit(0), 6000);        // por si algo frena el cierre normal
  return { ok: true };
});

module.exports = {};
