/* Redes (5/11/2026): Instagram y TikTok desde el Calendario. Aquí, lo que se hace en el equipo antes de programar:
 *  - redes-preparar: la copia del vídeo para subir, de menos de 48 MB (el almacén del servidor admite 50 MB por archivo):
 *    si ya pesa menos, el mismo archivo; si no, se recomprime con ffmpeg a la tasa justa (Instagram y TikTok vuelven a
 *    comprimir igualmente, no se nota).
 *  - redes-subir: la sube a la URL firmada que da el servidor (/api/social, «subida»).
 * El resto (conectar las cuentas, programar y publicar a su hora) es del servidor.
 * Se registra solo con require("./redes.cjs") desde main.cjs. */
const { app, ipcMain } = require("electron");
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const carpetas = require("./carpetas.cjs");

const MAX = 48 * 1024 * 1024;
const temporal = () => {
  const t = (carpetas.carpetasDe() || {}).trabajo || path.join(app.getPath("userData"), "trabajo");
  const d = path.join(t, "redes"); fs.mkdirSync(d, { recursive: true }); return d;
};
function duracion(ruta) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", ruta], { encoding: "utf8", windowsHide: true });
  return parseFloat(r.stdout) || 0;
}

ipcMain.handle("redes-preparar", async (e, ruta) => {
  try {
    if (!ruta || !fs.existsSync(ruta)) return { error: "No encuentro el vídeo" };
    const tam = fs.statSync(ruta).size;
    if (tam <= MAX) return { ok: true, ruta, tam, igual: true };
    const dur = duracion(ruta);
    if (!dur) return { error: "No se pudo leer la duración del vídeo" };
    const kbps = Math.max(1500, Math.floor((MAX * 0.93 * 8) / dur / 1000) - 160);
    const salida = path.join(temporal(), Date.now().toString(36) + "_" + path.basename(ruta).replace(/[^\w.-]+/g, "_"));
    const r = await new Promise((ok) => {
      const p = spawn("ffmpeg", ["-v", "error", "-y", "-i", ruta, "-c:v", "libx264", "-preset", "veryfast", "-b:v", kbps + "k", "-maxrate", Math.round(kbps * 1.25) + "k",
        "-bufsize", kbps * 2 + "k", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", salida], { windowsHide: true });
      let err = ""; p.stderr.on("data", d => err += d);
      p.on("close", code => ok(code === 0 ? { ok: true } : { error: "ffmpeg: " + err.slice(-300) }));
      p.on("error", x => ok({ error: x.message }));
    });
    if (r.error) return r;
    const t2 = fs.statSync(salida).size;
    if (t2 > 50 * 1024 * 1024) return { error: "La copia sigue pesando más de 50 MB" };
    return { ok: true, ruta: salida, tam: t2, temporal: true };
  } catch (x) { return { error: x.message }; }
});

/* (5/11, él: "hacer una copia de seguridad de esta versión con todo lo que tenemos"): el CÓDIGO de todo (sin vídeos,
 * modelos ni claves) con Copias de seguridad\hacer_copia.py, y se sube a Drive a RandomStudio/Copias de seguridad.
 * Solo en el equipo que tiene el script (el portátil). */
const COPIAS = "E:\\A RdeRandom\\Copias de seguridad";
ipcMain.handle("copia-posible", async () => ({ ok: fs.existsSync(path.join(COPIAS, "hacer_copia.py")), carpeta: COPIAS }));
ipcMain.handle("copia-hacer", async (e, token) => {
  try {
    const script = path.join(COPIAS, "hacer_copia.py");
    if (!fs.existsSync(script)) return { error: "Este equipo no tiene el script de copias (está en el portátil)" };
    // (sin bloquear la app mientras se hace: ~20 s)
    const r = await new Promise((ok) => {
      const p = spawn("python", ["-I", script, require("../package.json").version], { windowsHide: true, env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
      let stdout = "", stderr = ""; p.stdout.on("data", d => stdout += d); p.stderr.on("data", d => stderr += d);
      p.on("close", () => ok({ stdout, stderr })); p.on("error", x => ok({ stdout: "", stderr: x.message }));
    });
    let info; try { info = JSON.parse(r.stdout); } catch (x) { return { error: "La copia falló: " + (r.stderr || r.stdout || "").slice(-300) }; }
    if (!token) return { ok: true, ...info };
    const up = await require("./drive.cjs").subir(token, info.zip, ["RandomStudio", "Copias de seguridad"]);
    return { ok: true, ...info, drive: { ver: up.ver, carpeta: "https://drive.google.com/drive/folders/" + up.carpeta, verificado: up.verificado } };
  } catch (x) { return { error: x.message }; }
});

/* (8/11, él: "un MEGA análisis de todos los Shorts de RandomHistorias") la exportación de estadísticas del canal, a
 * <Resultados del perfil>/Estadísticas YouTube/estadisticas_<fecha>.json (solo números; ninguna clave) */
ipcMain.handle("estadisticas-guardar", async (e, datos) => {
  try {
    const c = carpetas.carpetasDe() || {};
    const base = c.resultados || c.trabajo || path.join(app.getPath("userData"), "trabajo");
    const dir = path.join(base, "Estadísticas YouTube"); fs.mkdirSync(dir, { recursive: true });
    const f = path.join(dir, "estadisticas_" + new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-") + ".json");
    fs.writeFileSync(f, JSON.stringify(datos, null, 1));
    try { require("electron").shell.showItemInFolder(f); } catch (x) {}
    return { ok: true, ruta: f };
  } catch (x) { return { error: x.message }; }
});

ipcMain.handle("redes-subir", async (e, ruta, url, borrarDespues) => {
  try {
    const datos = fs.readFileSync(ruta);
    const tipo = /\.png$/i.test(ruta) ? "image/png" : /\.jpe?g$/i.test(ruta) ? "image/jpeg" : "video/mp4";   // (6/11) también portadas
    const r = await fetch(url, { method: "PUT", headers: { "Content-Type": tipo, "x-upsert": "true" }, body: datos });
    if (!r.ok) return { error: "El servidor no aceptó el vídeo (" + r.status + "): " + (await r.text()).slice(0, 200) };
    if (borrarDespues) { try { fs.unlinkSync(ruta); } catch (x) {} }
    return { ok: true, tam: datos.length };
  } catch (x) { return { error: x.message }; }
});

/* (6/11, él: «poder subir las miniaturas desde RandomStudio, en YouTube y en Instagram») PORTADAS.
 *  - redes-portada-junto: la miniatura que ya está junto al vídeo («<TÍTULO> - miniatura.png», la de las historias).
 *  - redes-portada: una imagen JPG lista para subir, de un fotograma del vídeo ({ video, segundo }), de una imagen
 *    elegida ({ dataUrl }) o de un archivo ({ ruta }). Sale a 1080 de ancho como mucho y de menos de 2 MB (lo que admite
 *    YouTube para las miniaturas); devuelve la ruta, el tamaño y una vista previa. */
const vistaPrevia = (ruta) => "data:image/jpeg;base64," + fs.readFileSync(ruta).toString("base64");
ipcMain.handle("redes-portada-junto", async (e, video) => {
  try {
    if (!video || !fs.existsSync(video)) return { ok: true, ruta: null };
    const dir = path.dirname(video), base = path.basename(video).replace(/\.[^.]+$/, "");
    const ls = fs.readdirSync(dir);
    const n = ls.find(x => x.toLowerCase() === (base + " - miniatura.png").toLowerCase()) || ls.find(x => / - miniatura\.(png|jpe?g)$/i.test(x)) || ls.find(x => /^miniatura\.(png|jpe?g)$/i.test(x));
    return { ok: true, ruta: n ? path.join(dir, n) : null };
  } catch (x) { return { error: x.message }; }
});
ipcMain.handle("redes-portada", async (e, o) => {
  try {
    const salida = path.join(temporal(), "portada_" + Date.now().toString(36) + ".jpg");
    let entrada = null, pre = [];
    if (o && o.dataUrl) {
      const m = String(o.dataUrl).match(/^data:image\/(\w+);base64,(.+)$/);
      if (!m) return { error: "Imagen no válida" };
      entrada = path.join(temporal(), "elegida_" + Date.now().toString(36) + "." + (m[1] === "jpeg" ? "jpg" : m[1]));
      fs.writeFileSync(entrada, Buffer.from(m[2], "base64"));
    } else if (o && o.ruta) entrada = o.ruta;
    else if (o && o.video) { entrada = o.video; pre = ["-ss", String(Math.max(0, Number(o.segundo) || 0))]; }
    if (!entrada || !fs.existsSync(entrada)) return { error: "No encuentro la imagen" };
    for (const q of [2, 4, 7]) {
      const r = spawnSync("ffmpeg", ["-v", "error", "-y", ...pre, "-i", entrada, "-frames:v", "1", "-vf", "scale='min(1080,iw)':-2", "-q:v", String(q), salida], { windowsHide: true });
      if (r.status !== 0) return { error: "ffmpeg: " + String(r.stderr || "").slice(-200) };
      if (fs.statSync(salida).size < 1.9 * 1024 * 1024) break;
    }
    if (o && o.dataUrl) { try { fs.unlinkSync(entrada); } catch (x) {} }
    return { ok: true, ruta: salida, tam: fs.statSync(salida).size, vista: vistaPrevia(salida) };
  } catch (x) { return { error: x.message }; }
});
