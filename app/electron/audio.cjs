/* RandomEditor · el AUDIO del visor (16/11/2026, fase 1 del motor nuevo).
 * Él: "es imposible saber si los audios y los efectos de sonido van bien sincronizados… la vara se para con retraso".
 * Antes cada pista sonaba con un reproductor del navegador que se corregía solo si se desviaba más de 0,25 s. Ahora el
 * visor programa TODO el sonido en un único reloj (Web Audio) y para eso necesita las muestras: aquí se sacan con ffmpeg
 * en TROZOS de 30 s (así un directo de horas no se carga entero en memoria: solo los trozos que usa el proyecto), en WAV
 * 48 kHz estéreo, guardados en caché en _trabajo/random_editor/audio/<huella del archivo>/.
 *
 *   red-audio-trozo (ruta, k, L, tempo) → { ok, datos: Uint8Array (WAV) } | { sin: true } (sin pista de audio) | { error }
 *     k: número de trozo (empieza en k·L segundos del archivo); tempo ≠ 1: el trozo ya acelerado/ralentizado SIN cambiar
 *     el tono (atempo), para los clips con velocidad y el tono conservado. */
const { ipcMain } = require("electron");
const { spawn } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const CLON_DIR = process.env.RANDOMCLON_DIR || "E:\\A RdeRandom\\RandomClon";
const CACHE = () => path.join(CLON_DIR, "_trabajo", "random_editor", "audio");

// huella del archivo: ruta + tamaño + fecha (si cambia el archivo, la caché ya no vale)
function huella(ruta) {
  const st = fs.statSync(ruta);
  return crypto.createHash("sha1").update(ruta.toLowerCase() + "|" + st.size + "|" + Math.round(st.mtimeMs)).digest("hex").slice(0, 16);
}
// atempo admite 0,5-2: se encadena para el resto (0,1x-10x)
function cadenaTempo(t) {
  const fs_ = [];
  while (t > 2) { fs_.push("atempo=2"); t /= 2; }
  while (t < 0.5) { fs_.push("atempo=0.5"); t /= 0.5; }
  fs_.push("atempo=" + t.toFixed(6));
  return fs_.join(",");
}

// como mucho 3 ffmpeg a la vez (al abrir un proyecto se piden muchos trozos)
let activos = 0; const cola = [];
const turno = () => new Promise(ok => { if (activos < 3) { activos++; ok(); } else cola.push(ok); });
const libre = () => { const s = cola.shift(); if (s) s(); else activos--; };
const enCurso = new Map();          // (el mismo trozo pedido dos veces a la vez: un solo ffmpeg)

async function prepararTrozo(ruta, k, L, tempo) {
  const dir = path.join(CACHE(), huella(ruta)); fs.mkdirSync(dir, { recursive: true });
  const base = path.join(dir, `${k}_${L}_${tempo.toFixed(4)}`);
  if (fs.existsSync(base + ".wav")) return { archivo: base + ".wav" };
  if (fs.existsSync(base + ".sin")) return { sin: true };
  if (enCurso.has(base)) return enCurso.get(base);
  const p = (async () => {
    await turno();
    try {
      const tmp = base + ".tmp.wav";
      const args = ["-v", "error", "-y", "-ss", String(k * L), "-t", String(L), "-i", ruta, "-map", "0:a:0?", "-vn", "-ac", "2", "-ar", "48000"];
      if (Math.abs(tempo - 1) > 1e-4) args.push("-filter:a", cadenaTempo(tempo));
      args.push("-c:a", "pcm_s16le", tmp);
      const r = await new Promise(ok => {
        const pr = spawn("ffmpeg", args, { windowsHide: true });
        let err = ""; pr.stderr.on("data", d => err += d);
        pr.on("close", code => ok({ code, err })); pr.on("error", x => ok({ code: -1, err: x.message }));
      });
      // sin pista de audio (o el trozo cae después del final): no hay nada que sonar
      if (r.code !== 0 || !fs.existsSync(tmp) || fs.statSync(tmp).size < 1024) {      // (solo cabecera: más allá del final)
        try { fs.unlinkSync(tmp); } catch (x) {}
        if (r.code === 0 || /does not contain any stream|Output file is empty|matches no streams/i.test(r.err)) { fs.writeFileSync(base + ".sin", ""); return { sin: true }; }
        return { error: "ffmpeg: " + r.err.slice(-200) };
      }
      fs.renameSync(tmp, base + ".wav");
      return { archivo: base + ".wav" };
    } finally { libre(); enCurso.delete(base); }
  })();
  enCurso.set(base, p);
  return p;
}

ipcMain.handle("red-audio-trozo", async (e, ruta, k, L, tempo) => {
  try {
    if (!ruta || !fs.existsSync(ruta)) return { error: "No encuentro " + ruta };
    const r = await prepararTrozo(ruta, Math.max(0, k | 0), L || 30, Number(tempo) || 1);
    if (!r.archivo) return r;
    return { ok: true, datos: fs.readFileSync(r.archivo) };
  } catch (x) { return { error: x.message }; }
});
