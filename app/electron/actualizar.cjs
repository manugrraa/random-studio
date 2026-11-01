/* Actualizaciones de RandomStudio (v3.32): una versión nueva es, casi siempre, solo un app.asar nuevo (~13 MB).
 * - El portátil publica el suyo (la versión que tiene instalada) desde Administración.
 * - Los demás equipos lo bajan, comprueban su SHA-256 y, al cerrar, un pequeño script cambia el archivo y vuelve a abrir.
 * Si cambia la versión de Electron hace falta el paquete completo (lo avisa la app).
 *
 * Se registra solo con require("./actualizar.cjs") (desde historias.cjs).
 */
const { app, ipcMain } = require("electron");
const { spawn, spawnSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
// el app.asar hay que leerlo con «original-fs»: el fs de Electron lo trata como una carpeta (EISDIR)
const ofs = require("original-fs");
const os = require("os");
const path = require("path");

const miAsar = () => path.join(process.resourcesPath, "app.asar");
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

ipcMain.handle("act-info", async () => {
  try {
    const b = ofs.readFileSync(miAsar());
    return { ok: true, version: app.getVersion(), electron: process.versions.electron, sha256: sha256(b), tam: b.length, empaquetada: app.isPackaged };
  } catch (e) { return { ok: false, error: e.message, version: app.getVersion(), electron: process.versions.electron }; }
});

// el portátil sube su app.asar al enlace firmado que le da el servidor
ipcMain.handle("act-subir", async (e, url) => {
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/upload\/sign\//.test(String(url))) throw new Error("Enlace de subida no válido");
  const b = ofs.readFileSync(miAsar());
  const r = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/octet-stream", "x-upsert": "true" }, body: b });
  if (!r.ok) throw new Error("No se pudo subir: " + r.status + " " + (await r.text()).slice(0, 200));
  return { ok: true };
});

// los demás equipos: bajar, comprobar y reiniciar con la versión nueva
ipcMain.handle("act-instalar", async (e, url, esperado, version) => {
  if (!app.isPackaged) throw new Error("Solo en la app instalada");
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/sign\//.test(String(url))) throw new Error("Enlace de descarga no válido");
  const r = await fetch(url);
  if (!r.ok) throw new Error("No se pudo bajar la versión nueva (" + r.status + ")");
  const b = Buffer.from(await r.arrayBuffer());
  if (sha256(b) !== String(esperado || "").toLowerCase()) throw new Error("La descarga no coincide con la versión publicada: no se instala");
  const nueva = miAsar() + ".nueva";
  ofs.writeFileSync(nueva, b);
  // apuntada también aquí: si el cambio no llegara a hacerse, al volver a abrir la app vuelve a salir el aviso
  if (/^\d+\.\d+\.\d+$/.test(String(version || ""))) fs.writeFileSync(nueva + ".json", JSON.stringify({ version, sha256: esperado }));
  reiniciarCon(nueva);
  return { ok: true };
});

/* El cambio de archivo al cerrar (v3.33.2): un PowerShell OCULTO espera a que se cierre RandomStudio (como mucho 30 s;
 * si algo lo deja colgado, lo cierra a la fuerza), pone el app.asar nuevo y vuelve a abrir la app.
 * (Antes era un .cmd visible que, si la app no terminaba de cerrarse, se quedaba esperando para siempre.) */
function reiniciarCon(nueva) {
  const exe = process.execPath, pid = process.pid, asar = miAsar();
  const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
  const ps1 = path.join(os.tmpdir(), "randomstudio_actualizar.ps1");
  fs.writeFileSync(ps1, [
    "$fin = (Get-Date).AddSeconds(30)",
    `while ((Get-Process -Id ${pid} -ErrorAction SilentlyContinue) -and (Get-Date) -lt $fin) { Start-Sleep -Milliseconds 400 }`,
    `Get-Process -Id ${pid} -ErrorAction SilentlyContinue | Stop-Process -Force`,
    `Get-Process RandomStudio -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq ${q(exe)} } | Stop-Process -Force`,
    "Start-Sleep -Seconds 1",
    `for ($i = 0; $i -lt 10; $i++) { try { Move-Item -Force -LiteralPath ${q(nueva)} -Destination ${q(asar)} -ErrorAction Stop; break } catch { Start-Sleep -Seconds 1 } }`,
    `Remove-Item -LiteralPath ${q(nueva + ".json")} -ErrorAction SilentlyContinue`,
    `Start-Process -FilePath ${q(exe)}`,
    `Remove-Item -LiteralPath ${q(ps1)} -ErrorAction SilentlyContinue`,
  ].join("\r\n"), "utf8");
  // v3.34.2: se lanza con WMI para que NO sea hijo de RandomStudio: si la app estaba dentro de un «trabajo» de Windows
  // (p. ej. abierta desde otra herramienta), sus hijos mueren al cerrarse y la actualización se quedaba a medias.
  const linea = `powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${ps1}"`;
  const r = spawnSync("powershell.exe", ["-NoProfile", "-Command",
    `$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = '${linea.replace(/'/g, "''")}' }; exit $r.ReturnValue`],
    { windowsHide: true, timeout: 20000 });
  if (r.status !== 0) spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", ps1],
    { detached: true, stdio: "ignore", windowsHide: true }).unref();
  setTimeout(() => app.quit(), 300);
  setTimeout(() => app.exit(0), 2500);        // por si algo frena el cierre normal
}

// el portátil: versión ya preparada al lado por `npm run instalar` (sin cerrar la app)
ipcMain.handle("act-local", async () => {
  try {
    const j = JSON.parse(fs.readFileSync(miAsar() + ".nueva.json", "utf8"));
    return fs.existsSync(miAsar() + ".nueva") ? { ok: true, version: j.version } : { ok: false };
  } catch (e) { return { ok: false }; }
});
ipcMain.handle("act-local-aplicar", async () => {
  if (!fs.existsSync(miAsar() + ".nueva")) throw new Error("No hay ninguna versión preparada");
  reiniciarCon(miAsar() + ".nueva");
  return { ok: true };
});

module.exports = {};
