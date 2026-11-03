/* RandomHistorias dentro de RandomStudio (v3.21): el mismo proceso de siempre (tools/cadena.py), pero visto y
 * lanzado desde aquí: estado de cada historia, progreso del render plano a plano con el tiempo que falta, y elegir
 * la miniatura entre las fotos de los planos. Los archivos se leen siempre del portátil (Ajustes → Carpetas).
 *
 * Se registra solo con require("./historias.cjs") desde main.cjs.
 */
const { app, ipcMain, nativeImage, shell, safeStorage } = require("electron");
const claude = require("./claude.cjs");   // v3.30: la IA del Studio (Claude Code)
const drive = require("./drive.cjs");     // v3.30: Google Drive como almacén (sin perder calidad)
require("./actualizar.cjs");
require("./almacen.cjs");                 // v3.34: almacenamiento: medir, archivar en Drive, recuperar y borrar               // v3.32: actualizar los demás equipos desde el portátil
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

// v3.26: el proyecto y la carpeta de entregas salen de Ajustes → Carpetas del perfil (carpetas.cjs)
const carpetas = () => require("./carpetas.cjs").carpetasHistorias();
const raiz = () => process.env.RANDOMHISTORIAS_DIR || carpetas().historias;
const histDir = () => path.join(raiz(), "historias");
const listasDir = () => carpetas().entregas;
const PASOS = ["sincronizar", "revisar", "fotos", "mezclar", "subtitulos", "animatic", "render", "montar", "miniatura", "entregar"];

const leer = (p, def) => { try { return fs.readFileSync(p, "utf-8"); } catch (e) { return def; } };
const leerJson = (p, def) => { try { return JSON.parse(leer(p, "").replace(/^\uFEFF/, "")); } catch (e) { return def; } };
const existe = (p) => { try { return fs.existsSync(p); } catch (e) { return false; } };

function carpetaDe(id) {
  if (!/^\d{2}_[\w-]+$/.test(String(id))) throw new Error("historia no válida");
  const c = path.join(histDir(), id);
  if (!existe(c)) throw new Error("no existe la historia " + id);
  return c;
}

// el nombre con el que se entrega (como tools/cadena.py: un solo «!» al final)
function titulo(c) {
  return leer(path.join(c, "titulo.txt"), "").trim();
}
function tituloArchivo(t) { return t.replace(/!+$/, "!"); }

function miniDataUrl(p, ancho) {
  try {
    const img = nativeImage.createFromPath(p);
    if (img.isEmpty()) return null;
    return img.resize({ width: ancho, quality: "good" }).toDataURL();
  } catch (e) { return null; }
}

function planos(c) {
  // planos.py: ("s01", "texto", "set"), ... (sin ejecutar Python: se lee con una expresión regular)
  const src = leer(path.join(c, "planos.py"), "");
  const out = [];
  const re = /\(\s*"(s\d+)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*,\s*"([^"]*)"\s*\)/g;
  let m;
  while ((m = re.exec(src))) out.push({ id: m[1], texto: m[2], set: m[3] });
  return out;
}

function resumen(id) {
  const c = carpetaDe(id);
  const estado = leerJson(path.join(c, "cadena_estado.json"), {});
  // los pasos que se hicieron a mano (fuera de la cadena) cuentan como hechos si existe lo que crean
  const fecha = (p) => { try { return new Date(fs.statSync(p).mtimeMs).toISOString().slice(0, 16).replace("T", " "); } catch (e) { return null; } };
  const hechoA = { sincronizar: "duraciones.json", revisar: "eventos.json", fotos: path.join("planos_fotos", "s01.png") };
  for (const [p, f] of Object.entries(hechoA))
    if (!estado[p] && existe(path.join(c, f))) estado[p] = { fin: fecha(path.join(c, f)), aMano: true };
  const t = titulo(c);
  const entrega = path.join(listasDir(), tituloArchivo(t));
  const hechos = PASOS.filter(p => estado[p]);
  const mini = existe(path.join(c, "miniatura.png")) ? path.join(c, "miniatura.png") : null;
  return {
    // v3.37.5: mientras se escribe el guion aún no hay titulo.txt: se enseña el de la idea (solo para verlo; la entrega usa el real)
    id, titulo: t || (() => { try { return ((estudioDe(c).idea || {}).titulo || "").trim(); } catch (e) { return ""; } })(), provisional: !t, carpeta: c, pasos: PASOS.map(p => ({ paso: p, hecho: !!estado[p], fin: estado[p] && estado[p].fin, s: estado[p] && estado[p].s })),
    hechos: hechos.length, entregada: existe(path.join(entrega, tituloArchivo(t) + ".mp4")) || !!estudioDe(c).drive, carpetaEntrega: entrega,
    final: existe(path.join(c, `historia${id.slice(0, 2)}_final.mp4`)) ? path.join(c, `historia${id.slice(0, 2)}_final.mp4`) : null,
    miniatura: mini ? miniDataUrl(mini, 220) : null,
    nPlanos: planos(c).length,
    modificada: (() => { try { return fs.statSync(c).mtimeMs; } catch (e) { return 0; } })(),
  };
}

// ------------------------------------------------------------------ tarea en marcha (una a la vez)
let tarea = null;     // { proc, id, args, inicio, lineas[], paso, planos{hechos,total,quedan,eta}, sender }

function emitir(ev) {
  if (!tarea) return;
  const d = { ...ev, id: tarea.id };
  try { if (tarea.sender && !tarea.sender.isDestroyed()) tarea.sender.send("historias-progreso", d); } catch (e) {}
}

function analizarLinea(l) {
  const t = tarea;
  if (!t) return;
  t.actividad = Date.now();
  t.lineas.push(l);
  if (t.lineas.length > 400) t.lineas.shift();
  let m = l.match(/== PASO (\d+)\/(\d+): (\w+) ==/);
  if (m) { t.paso = { n: +m[1], de: +m[2], nombre: m[3], inicio: Date.now() }; t.render = null; emitir({ tipo: "paso", paso: t.paso }); return; }
  // render / fotos: "[s58] 107 fotogramas en 178.7s, ... — quedan 2 (~1 min) — texto"
  m = l.match(/\[(s\d+)\][^\n]*?quedan (\d+) \(~(\d+) min\)/);
  if (m) {
    const total = t.nPlanos || 0;
    t.render = { plano: m[1], quedan: +m[2], minutos: +m[3], total, hechos: total ? total - +m[2] : null, en: Date.now() };
    emitir({ tipo: "plano", render: t.render });
    return;
  }
  m = l.match(/ok en ([\d.]+) s/);
  if (m) { emitir({ tipo: "pasoOk", segundos: +m[1], paso: t.paso }); return; }
  emitir({ tipo: "linea", linea: l });
}

/* v3.45.6 REPARAR EL RENDER: si el render falla porque un plano no se puede montar (un error de Python: un módulo del kit
 * rescatado sin sus últimos cambios, una función que falta…), Claude lo arregla en este equipo sin cambiar la escena y el
 * render se repite (solo los planos que faltan). Como mucho 2 veces por historia. Igual en el portátil y en el ordenador. */
function erroresDelRender(log) {
  const ls = log.split(/\r?\n/), grupos = new Map();
  for (let i = 0; i < ls.length; i++) {
    const m = ls[i].match(/^\s*\[(s\d+)\] ERROR/);
    if (!m) continue;
    const bloque = [ls[i]];
    for (let j = i + 1; j < ls.length && j < i + 40 && !/^\s*\[s\d+\]/.test(ls[j]); j++) bloque.push(ls[j]);
    const ultima = bloque.filter(x => x.trim()).pop() || "";
    const g = grupos.get(ultima) || { planos: [], bloque: bloque.join("\n") };
    g.planos.push(m[1]); grupos.set(ultima, g);
  }
  if (!grupos.size) return ls.slice(-45).join("\n");          // (falló antes de ningún plano: p. ej. un import)
  return [...grupos.values()].slice(0, 8).map(g => "Planos " + g.planos.join(", ") + ":\n" + g.bloque).join("\n\n").slice(0, 9000);
}
function repararRender(t, id) {
  try {
    const c = carpetaDe(id);
    const log = leer(path.join(c, "cadena_log", "render.log"), "");
    if (!/Traceback|ERROR montando el plano/.test(log)) return false;
    const est = estudioDe(c);
    if ((est.reparaciones || 0) >= 2) return false;
    est.reparaciones = (est.reparaciones || 0) + 1; guardarEstudio(c, est);
    const rel = path.relative(raiz(), c).replace(/\\/g, "/");
    const rk = leerJson(path.join(estudioDir(), "_rescate_kit.json"), null);
    const prompt = instrucciones("reglas") + `\n\n---\nREPARAR EL RENDER de la historia ${rel} (intento ${est.reparaciones} de 2).

El guion, las voces, la escena y el animatic ya están APROBADOS. El render final (rodar.py final) ha fallado en algunos planos
porque el código no se puede ejecutar. Lo más probable: un módulo del kit (kit/*.py) creado en este equipo se perdió y se
recuperó del historial de Claude sin sus últimos cambios${rk && rk.restaurados && rk.restaurados.length ? " (recuperados: " + rk.restaurados.map(r => "kit/" + r.nombre + ".py" + (r.aviso ? " — " + r.aviso : "")).join(", ") + ")" : ""}.

QUÉ HACER
1. Lee los errores de abajo y el código que falla (rodar.py, escena.py y los módulos del kit que usan).
2. Arréglalo con el cambio MÍNIMO para que esos planos se monten como en las fotos aprobadas (planos_fotos/sNN.png): añade
   el parámetro, la función o el objeto que falte, con el comportamiento que se deduce de cómo se usa. NO cambies encuadres,
   personajes, textos ni la historia, y no toques los planos que ya funcionan.
3. Comprueba los planos que fallaban: "$BLENDER" -b --factory-startup -P ${rel}/rodar.py -- revisar <planos separados por comas>
   Repite hasta que ninguno dé ERROR ni Traceback.
4. NO renderices el vídeo final: en cuanto termines, la cadena lo repite sola.

ERRORES DEL RENDER (de ${rel}/cadena_log/render.log):
${erroresDelRender(log)}
`;
    tarea = null;
    try {
      emitir2(t, { tipo: "linea", linea: "🔧 Algunos planos no se pueden montar: Claude arregla el kit y se repite el render" });
      lanzarAgente(t.sender, id, "render", prompt, (ok, snd) => { if (ok) { try { lanzar(snd, id, t.args, "render", t.alTerminar); } catch (e) {} } else if (t.alTerminar) t.alTerminar(false, snd); });
      return true;
    } catch (e) { tarea = t; return false; }
  } catch (e) { return false; }
}
// (emitir de una tarea que ya no es la actual)
function emitir2(t, ev) { try { if (t.sender && !t.sender.isDestroyed()) t.sender.send("historias-progreso", { ...ev, id: t.id }); } catch (e) {} }

function lanzar(sender, id, args, etapa, alTerminar) {
  if (tarea) throw new Error("Ya hay una tarea en marcha (" + tarea.id + ")");
  const c = carpetaDe(id);
  const proc = spawn("python", [path.join(raiz(), "tools", "cadena.py"), path.relative(raiz(), c), ...args], {
    cwd: raiz(), env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUNBUFFERED: "1", RH_ENTREGAS: listasDir() }, windowsHide: true,
  });
  tarea = { proc, id, args, tipo: "cadena", etapa: etapa || null, inicio: Date.now(), lineas: [], paso: null, render: null, sender, nPlanos: planos(c).length, alTerminar };
  let resto = "";
  const trozo = (b) => {
    resto += b.toString("utf-8");
    const partes = resto.split(/\r?\n/);
    resto = partes.pop();
    partes.forEach(p => p.trim() && analizarLinea(p.trimEnd()));
  };
  proc.stdout.on("data", trozo);
  proc.stderr.on("data", trozo);
  proc.on("close", (code) => {
    if (resto.trim()) analizarLinea(resto.trim());
    const t = tarea;
    if (code !== 0 && t && t.etapa === "render" && !t.cancelada && repararRender(t, id)) return;
    // v3.45.2: el final de la salida va en el informe, así «Equipos» dice POR QUÉ falló (el render del ordenador fallaba sin texto)
    const informe = code === 0 || !t ? "" : t.lineas.slice(-30).join("\n").slice(-1500);
    emitir({ tipo: "fin", ok: code === 0, codigo: code, etapa: t && t.etapa, cancelada: !!(t && t.cancelada), ...(informe ? { informe } : {}) });
    tarea = null;
    trasEtapa(t, id, code === 0, t && t.etapa);
  });
  return { ok: true };
}

const OK_ARGS = new Set(["--desde", "--solo", "--hasta", "--sin-parar"]);
function argsSeguros(a) {
  const out = [];
  for (let i = 0; i < (a || []).length; i++) {
    const x = String(a[i]);
    if (!OK_ARGS.has(x)) throw new Error("argumento no permitido: " + x);
    out.push(x);
    if (x !== "--sin-parar") {
      const p = String(a[++i] || "");
      if (!PASOS.includes(p)) throw new Error("paso no válido: " + p);
      out.push(p);
    }
  }
  return out;
}

// ------------------------------------------------------------------ llamadas
// v3.43.3: cuándo cambió lo que se ve desde fuera (voz y animatic): si es más nuevo que la copia de Drive, se vuelve a subir
const revMs = (c) => {
  const ms = (f) => { try { return Math.round(fs.statSync(f).mtimeMs); } catch (e) { return 0; } };
  return { voces: ms(path.join(c, "audio", "mezcla.wav")), animatic: ms(path.join(c, "animatic.mp4")) };
};
ipcMain.handle("historias-lista", async () => {
  if (!existe(histDir())) return { ok: false, error: "No encuentro " + histDir() + " (Ajustes → Carpetas)" };
  const ids = fs.readdirSync(histDir()).filter(n => /^\d{2}_[\w-]+$/.test(n)).sort().reverse();
  return { ok: true, raiz: raiz(), historias: ids.map(id => {
    try {
      const est = estudioDe(carpetaDe(id));
      return { ...resumen(id), etapas: etapasDe(id).map(x => ({ id: x.id, estado: x.estado })), legado: !est.creado,
        drive: est.drive || null, driveRevision: est.driveRevision || {}, revMs: revMs(carpetaDe(id)) };
    } catch (e) { return { id, error: e.message }; }
  }) };
});

ipcMain.handle("historias-detalle", async (e, id) => {
  const c = carpetaDe(id);
  const fotos = path.join(c, "planos_fotos");
  const ps = planos(c).map(p => ({ ...p, foto: existe(path.join(fotos, p.id + ".png")) ? miniDataUrl(path.join(fotos, p.id + ".png"), 150) : null }));
  return { ok: true, ...resumen(id), planos: ps };
});

ipcMain.handle("historias-tarea", async (e, id, args) => lanzar(e.sender, id, argsSeguros(args)));

ipcMain.handle("historias-tarea-estado", async (e) => {
  if (!tarea && empaquetando) return { activa: true, id: empaquetando, tipo: "relevo", etapa: "copia de relevo", inicio: Date.now(), accion: "Guardando la copia de relevo", acciones: [], lineas: [] };
  if (!tarea) return { activa: false };
  if (!tarea.sender || tarea.sender.isDestroyed()) tarea.sender = e.sender;   // (v3.41.9) sin robarle el progreso a la ventana principal
  return { activa: true, id: tarea.id, args: tarea.args, tipo: tarea.tipo, etapa: tarea.etapa, inicio: tarea.inicio, paso: tarea.paso,
    render: tarea.render, accion: tarea.accion, acciones: (tarea.acciones || []).slice(-30), lineas: tarea.lineas.slice(-60) };
});

ipcMain.handle("historias-cancelar", async (e, soloId) => {
  // soloId: cancelar solo si lo que está en marcha es esa historia (lo pide la cola compartida); y sacarla de la cola local
  if (soloId) { const i = cola.indexOf(soloId); if (i >= 0) cola.splice(i, 1); if (!tarea || tarea.id !== soloId) return { ok: true }; }
  if (tarea) { tarea.alTerminar = null; tarea.cancelada = true; }   // cancelar también para el avance automático (y no se reintenta)
  if (tarea && tarea.proc) { try { spawn("taskkill", ["/PID", String(tarea.proc.pid), "/T", "/F"], { windowsHide: true }); } catch (x) {} }
  return { ok: true };
});

// v3.41.9: al cerrar la app (o reiniciarla para actualizar) se mata el árbol de la tarea en marcha: antes Blender o Claude
// seguían huérfanos y la app nueva, al no verlos, lanzaba otra tarea sobre la misma historia
app.on("before-quit", () => {
  if (tarea && tarea.proc) { try { require("child_process").spawnSync("taskkill", ["/PID", String(tarea.proc.pid), "/T", "/F"], { windowsHide: true, timeout: 8000 }); } catch (e) {} }
});

// v3.38.2: PARAR TODO (p. ej. antes de apagar el equipo): vacía la cola local y para lo que esté en marcha.
// Lo hecho se queda guardado; al volver a estar disponible, la historia sigue sola por donde iba.
ipcMain.handle("historias-parar-todo", async () => {
  const habia = (tarea ? 1 : 0) + cola.length;
  cola.length = 0;
  if (tarea) { tarea.alTerminar = null; tarea.cancelada = true; }
  if (tarea && tarea.proc) { try { spawn("taskkill", ["/PID", String(tarea.proc.pid), "/T", "/F"], { windowsHide: true }); } catch (x) {} }
  return { ok: true, parados: habia };
});

// Elegir la miniatura: plano + momento (0..1) -> tools/miniatura.py y vuelve a entregar
ipcMain.handle("historias-miniatura", async (e, id, plano, t) => {
  const c = carpetaDe(id);
  if (!/^s\d+$/.test(String(plano))) throw new Error("plano no válido");
  const tt = Math.max(0.05, Math.min(0.95, Number(t) || 0.8));
  const correr = (args) => new Promise((ok, ko) => {
    const p = spawn("python", args, { cwd: raiz(), env: { ...process.env, PYTHONIOENCODING: "utf-8", RH_ENTREGAS: listasDir() }, windowsHide: true });
    let out = "";
    p.stdout.on("data", d => out += d); p.stderr.on("data", d => out += d);
    p.on("close", code => code === 0 ? ok(out) : ko(new Error(out.split("\n").filter(Boolean).slice(-3).join(" | ") || ("código " + code))));
  });
  await correr([path.join(raiz(), "tools", "miniatura.py"), path.relative(raiz(), c), "--plano", plano, "--t", String(tt)]);
  if (existe(path.join(c, `historia${id.slice(0, 2)}_final.mp4`)))
    await correr([path.join(raiz(), "tools", "cadena.py"), path.relative(raiz(), c), "--solo", "entregar"]);
  return { ok: true, miniatura: miniDataUrl(path.join(c, "miniatura.png"), 360) };
});

ipcMain.handle("historias-abrir", async (e, id, que) => {
  const r = resumen(id);
  const ruta = que === "entrega" ? r.carpetaEntrega : que === "video" ? r.final : r.carpeta;
  if (!ruta || !existe(ruta)) return { ok: false, error: "Todavía no existe" };
  const err = await shell.openPath(ruta);
  return { ok: !err, error: err || null };
});

/* ============================ ESTUDIO (v3.30) ============================
 * Todo el proceso dentro del Studio, una «carpeta» por historia:
 *   Idea → Guion → Voces y efectos → Escena 3D → Animatic → Render → Montaje y entrega (+ miniatura y nota final).
 * Guion, voces y escena los hace Claude Code (claude -p en RandomHistorias, con la memoria del proyecto y las instrucciones
 * de tools/estudio/*.md); el resto, tools/cadena.py. Revisión manual opcional (guion, voces, animatic) con nota de cambios.
 * Los datos van en el disco del portátil: estudio/ajustes.json, estudio/ideas.json, estudio/notas_mejora.md y
 * historias/NN/estudio.json (revisiones y nota final).
 */
const estudioDir = () => path.join(raiz(), "estudio");
const AJ_DEF = { revisar: { guion: true, voces: true, animatic: true }, avanzarSolo: true, driveAuto: true, equipoDePaso: false };
const escribirJson = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(v, null, 1)); };
function ajustes() {
  const a = leerJson(path.join(estudioDir(), "ajustes.json"), {});
  return { ...AJ_DEF, ...a, revisar: { ...AJ_DEF.revisar, ...(a.revisar || {}) } };
}
const estudioDe = (c) => leerJson(path.join(c, "estudio.json"), {});
const guardarEstudio = (c, e) => escribirJson(path.join(c, "estudio.json"), e);
const urlArchivo = (p) => { try { return "file:///" + encodeURI(p.replace(/\\/g, "/")) + "?t=" + Math.round(fs.statSync(p).mtimeMs); } catch (e) { return null; } };

function blenderExe() {
  if (process.env.BLENDER && existe(process.env.BLENDER)) return process.env.BLENDER;
  const base = "C:\\Program Files\\Blender Foundation";
  try { const d = fs.readdirSync(base).filter(n => /^Blender 4\.5/.test(n)).sort().pop(); if (d && existe(path.join(base, d, "blender.exe"))) return path.join(base, d, "blender.exe"); } catch (e) {}
  return null;
}

// ------------------------------------------------------------------ clave de ElevenLabs (cifrada en este equipo)
const claveArchivo = () => path.join(app.getPath("userData"), "elevenlabs.key");
function claveEleven() {
  // (sin espacios ni saltos: al pegarla se colaban y ElevenLabs la rechazaba, como pasó con el permiso de Claude)
  try { const b = fs.readFileSync(claveArchivo()); return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(b).replace(/\s+/g, "") : ""; } catch (e) { return ""; }
}
/* v3.41.5: ¿la clave de ElevenLabs funciona DE VERDAD? Se prueba exactamente lo que hace la etapa de voces (la voz de
 * Random, el modelo flash) con un texto de 2 letras (~1 crédito), al arrancar y al guardar la clave. Si falla, se ve el
 * motivo en «Equipos» y la etapa de voces no empieza (antes Claude se ponía a buscar la clave por el disco). */
let elevenPrueba = { ok: null, error: "", cuando: 0 };
async function probarEleven(forzar) {
  if (!forzar && elevenPrueba.cuando && Date.now() - elevenPrueba.cuando < 6 * 3600000) return elevenPrueba;
  const k = claveEleven();
  if (!k) return (elevenPrueba = { ok: false, error: "Falta la clave de ElevenLabs", cuando: Date.now() });
  let voz = "kIyh6OkdYnM02DNUILKo";
  try { const m = leer(path.join(raiz(), "historias", "_plantilla", "planos.py"), "").match(/"random"\s*:\s*"([A-Za-z0-9]+)"/); if (m) voz = m[1]; } catch (e) {}
  try {
    const r = await fetch("https://api.elevenlabs.io/v1/text-to-speech/" + voz + "?output_format=mp3_22050_32", { method: "POST",
      headers: { "xi-api-key": k, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text: "ok", model_id: "eleven_flash_v2_5", language_code: "es" }) });
    if (r.ok) { await r.arrayBuffer(); return (elevenPrueba = { ok: true, error: "", cuando: Date.now() }); }
    let det = ""; try { const j = await r.json(); det = (j.detail && (j.detail.message || j.detail.status)) || JSON.stringify(j).slice(0, 200); } catch (x) {}
    const error = r.status === 401 ? "ElevenLabs rechaza la clave (" + det + "): vuelve a pegarla en Ajustes, y que tenga permiso de «Text to Speech»"
      : r.status === 404 ? "Esta cuenta de ElevenLabs no tiene la voz de Random (" + det + "): añádela a «My Voices» o usa la clave de la cuenta del portátil"
      : /quota|credit/i.test(det) ? "Sin créditos en ElevenLabs (" + det + ")"
      : "ElevenLabs " + r.status + ": " + det;
    return (elevenPrueba = { ok: false, error, cuando: Date.now() });
  } catch (e) { return (elevenPrueba = { ok: false, error: "No se pudo conectar con ElevenLabs: " + e.message, cuando: Date.now() }); }
}
app.whenReady().then(() => setTimeout(() => probarEleven(false), 12000));
// v3.43.4: clave de fish.audio (voz del narrador «esqueleto», tools/voz_fish.py), cifrada igual que la de ElevenLabs
const claveFishArchivo = () => path.join(app.getPath("userData"), "fishaudio.key");
function claveFish() {
  try { const b = fs.readFileSync(claveFishArchivo()); return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(b).replace(/\s+/g, "") : ""; } catch (e) { return ""; }
}

// ------------------------------------------------------------------ etapas
const todasFotos = (c) => { const ps = planos(c); return ps.length > 0 && ps.every(p => existe(path.join(c, "planos_fotos", p.id + ".png"))); };
const todosFinal = (c) => { const ps = planos(c); return ps.length > 0 && ps.every(p => existe(path.join(c, "planos_final", p.id + ".mp4"))); };
const ETAPAS = [
  { id: "guion", nombre: "Guion", tipo: "agente", hecho: c => ["titulo.txt", "narracion.txt", "planos.py"].every(f => existe(path.join(c, f))) },
  { id: "voces", nombre: "Voces y efectos", tipo: "agente", hecho: c => ["duraciones.json", "audio/voz_final.wav", "audio/mezcla.wav"].every(f => existe(path.join(c, f))) },
  { id: "escena", nombre: "Escena 3D", tipo: "agente", hecho: c => existe(path.join(c, "escena.py")) && existe(path.join(c, "rodar.py")) && todasFotos(c) },
  { id: "animatic", nombre: "Animatic", tipo: "cadena", args: ["--desde", "subtitulos", "--hasta", "animatic"], hecho: c => existe(path.join(c, "animatic.mp4")) },
  { id: "render", nombre: "Render", tipo: "cadena", args: ["--solo", "render"], hecho: todosFinal },
  { id: "montaje", nombre: "Montaje y entrega", tipo: "cadena", args: ["--desde", "montar", "--sin-parar"],
    // (v3.41.9) o ya subido a Drive: el equipo de paso borra la entrega local y la historia volvía a «montaje pendiente»
    hecho: c => { const t = titulo(c); return (!!t && existe(path.join(listasDir(), tituloArchivo(t), tituloArchivo(t) + ".mp4"))) || !!estudioDe(c).drive; } },
];
const REVISABLES = ["guion", "voces", "animatic"];

function etapasDe(id) {
  const c = carpetaDe(id), est = estudioDe(c), aj = ajustes();
  let antesHecho = true;
  return ETAPAS.map(e => {
    const hecho = e.hecho(c), rev = (est.revisiones || {})[e.id] || null;
    // las historias hechas antes del estudio (sin estudio.json) ya se revisaron en el chat
    const pideRevision = REVISABLES.includes(e.id) && aj.revisar[e.id] && !!est.creado;
    let estado = hecho ? "hecho" : "pendiente";
    if (hecho && pideRevision && !(rev && rev.estado === "aprobado")) estado = "revisar";
    if (tarea && tarea.id === id && (tarea.etapa === e.id || (e.id === "animatic" && tarea.etapa === "escena" && hecho))) estado = "trabajando";
    const r = { id: e.id, nombre: e.nombre, estado, revision: rev, pideRevision, bloqueada: !antesHecho };
    antesHecho = antesHecho && hecho && estado !== "revisar";
    return r;
  });
}

/** La siguiente etapa que toca, o la que espera revisión. */
function siguiente(id) {
  for (const e of etapasDe(id)) {
    if (e.estado === "revisar") return { espera: e };
    if (e.estado !== "hecho") return { etapa: e };
  }
  return { terminado: true };
}

// ------------------------------------------------------------------ Claude trabajando (stream-json)
function describir(nombre, input) {
  const f = (k) => path.basename(String((input || {})[k] || ""));
  if (nombre === "Write") return "Escribiendo " + f("file_path");
  if (nombre === "Edit" || nombre === "MultiEdit") return "Corrigiendo " + f("file_path");
  if (nombre === "Read") return "Leyendo " + f("file_path");
  if (nombre === "Glob" || nombre === "Grep") return "Buscando en el proyecto";
  if (nombre === "TodoWrite") return "Organizando el trabajo";
  if (nombre === "Bash" || nombre === "PowerShell") {
    const cmd = String((input || {}).command || "");
    if (/rodar\.py.*fotos/.test(cmd)) return "Blender: haciendo las fotos de los planos (Animatic)";
    if (/rodar\.py.*revisar/.test(cmd)) return "Blender: revisando la escena 3D";
    if (/rodar\.py.*final/.test(cmd)) return "Blender: renderizando";
    if (/blender(\.exe)?["']?\s+-b|%BLENDER%|\$BLENDER|-P\s+\S*test_\S*\.py/i.test(cmd)) return "Blender: probando modelos nuevos";
    if (/voz_eleven/.test(cmd)) return "ElevenLabs: generando las voces";
    if (/transcribir/.test(cmd)) return "Whisper: comprobando la voz";
    if (/insertar_voces/.test(cmd)) return "Metiendo las voces de los personajes";
    if (/sincronizar/.test(cmd)) return "Sincronizando la voz con los planos";
    if (/mezclar/.test(cmd)) return "Mezclando efectos y ambiente";
    return "Ejecutando: " + cmd.slice(0, 90);
  }
  return nombre;
}

function lanzarAgente(sender, id, etapa, prompt, alTerminar) {
  if (tarea) throw new Error("Ya hay una tarea en marcha (" + tarea.id + ")");
  const exe = claude.exeClaude();
  if (!exe) throw new Error("No encuentro Claude Code en este equipo");
  const args = ["-p", "--model", claude.MODELO, "--output-format", "stream-json", "--verbose", "--permission-mode", "acceptEdits",
    "--allowedTools", "Bash", "PowerShell", "Read", "Write", "Edit", "MultiEdit", "Glob", "Grep", "TodoWrite"];
  // v3.41: en un equipo sin Git Bash, Claude solo tiene PowerShell; sin estas pautas fallaban muchos comandos (&&, rutas
  // sin comillas...) y los repetía, y por eso el ordenador tardaba tanto. v3.41.3: con Git Bash, PowerShell se quita
  // (Claude lo elegía igual y las instrucciones están escritas para Bash): trabaja exactamente como en el portátil
  if (!claude.rutaBash()) args.push("--append-system-prompt", claude.GUIA_POWERSHELL);
  else { args.splice(args.indexOf("PowerShell"), 1); args.push("--disallowedTools", "PowerShell"); }
  const env = claude.entornoClaude({ PYTHONIOENCODING: "utf-8", RH_ENTREGAS: listasDir(), ELEVENLABS_API_KEY: claveEleven(), FISH_API_KEY: claveFish(), BLENDER: blenderExe() || "" });
  const proc = spawn(exe, args, { cwd: raiz(), env, windowsHide: true });
  tarea = { proc, id, tipo: "agente", etapa, inicio: Date.now(), lineas: [], acciones: [], accion: "Pensando…", sender, alTerminar, nPlanos: 0 };
  let resto = "", final = "", fallo = false;
  const linea = (l) => {
    if (tarea) tarea.actividad = Date.now();          // (v3.41.8) para el vigilante: Claude sigue dando señales
    let j; try { j = JSON.parse(l); } catch (e) { return; }
    if (j.type === "assistant" && j.message && Array.isArray(j.message.content)) {
      for (const c of j.message.content) {
        if (c.type === "tool_use") {
          const a = describir(c.name, c.input);
          tarea.accion = a; tarea.acciones.push({ t: Date.now(), a });
          if (tarea.acciones.length > 200) tarea.acciones.shift();
          emitir({ tipo: "agente", accion: a });
        } else if (c.type === "text" && c.text.trim()) {
          tarea.lineas.push(c.text.trim()); if (tarea.lineas.length > 200) tarea.lineas.shift();
          emitir({ tipo: "agenteTexto", texto: c.text.trim().slice(0, 600) });
        }
      }
    } else if (j.type === "result") { final = String(j.result || ""); fallo = !!j.is_error; }
  };
  proc.stdout.on("data", (b) => { resto += b.toString("utf-8"); const ps = resto.split(/\r?\n/); resto = ps.pop(); ps.forEach(p => p.trim() && linea(p)); });
  let err = "";
  proc.stderr.on("data", d => err += d);
  proc.on("close", (code) => {
    if (resto.trim()) linea(resto.trim());
    const t = tarea, ok = code === 0 && !fallo;
    try {
      const c = carpetaDe(id), est = estudioDe(c);
      est.informes = { ...(est.informes || {}), [etapa]: { fecha: new Date().toISOString(), ok, texto: (final || err).slice(0, 4000) } };
      guardarEstudio(c, est);
    } catch (e) {}
    // v3.40.4: si se paró por el límite de Claude, se dice a qué hora reintentar (la app la retoma sola entonces)
    const limite = ok ? 0 : claude.limiteDe(final + "\n" + err);
    if (t && t.atascada) final = "Se quedó atascada " + t.atascada + " min sin avanzar (" + (t.accion || "") + "): se cortó y se reintenta sola. " + final;
    emitir({ tipo: "fin", ok, codigo: code, etapa, informe: (final || err).slice(0, 1500), cancelada: !!(t && t.cancelada), ...(limite ? { limite } : {}) });
    tarea = null;
    trasEtapa(t, id, ok, etapa);
  });
  proc.stdin.end(prompt);
  return { ok: true };
}

function instrucciones(n) { return leer(path.join(raiz(), "tools", "estudio", n + ".md"), ""); }

function promptEtapa(id, etapa, nota) {
  const c = carpetaDe(id), est = estudioDe(c);
  const rel = path.relative(raiz(), c).replace(/\\/g, "/");
  const base = etapa === "animatic" ? "escena" : etapa;   // los cambios del animatic se hacen en la escena
  // v3.41.1: las REGLAS (todo lo que el usuario ha pedido) van delante de cada etapa, también en el ordenador, sin memoria
  let p = instrucciones("reglas") + "\n\n---\n\n" + instrucciones(base) + `\n\n---\nHISTORIA: ${rel} (número ${id.slice(0, 2)}).\n`;
  if (est.idea) p += "IDEA ELEGIDA:\n" + JSON.stringify(est.idea, null, 1) + "\n";
  if (nota) p += `\nNOTA DEL USUARIO (aplícala por encima de todo):\n${nota}\n`;
  return p;
}

/** Ejecuta una etapa (y, con «avanzar solo», las siguientes hasta una revisión o el final). */
function correrEtapa(sender, id, etapaId, nota, encadenar) {
  const e = ETAPAS.find(x => x.id === etapaId);
  if (!e) throw new Error("etapa no válida");
  const seguir = encadenar ? (ok, snd) => { if (ok) avanzar(snd, id, true); } : null;
  if (etapaId === "animatic" && nota) {
    // cambios del animatic: Claude corrige la escena y rehace las fotos; después se vuelve a montar el animatic
    return lanzarAgente(sender, id, "escena", promptEtapa(id, "animatic", nota), (ok, snd) => { if (ok) lanzar(snd, id, e.args, "animatic", seguir); });
  }
  if (etapaId === "voces" && claveEleven() && elevenPrueba.ok === false) {
    try { sender.send("historias-progreso", { id, tipo: "fin", ok: false, bloqueada: true, etapa: "voces", informe: elevenPrueba.error + ". Arréglalo y pulsa «Seguir»." }); } catch (x) {}
    probarEleven(true);       // por si ya está arreglada: la próxima vez que se intente, valdrá
    return { ok: false, error: elevenPrueba.error };
  }
  if (etapaId === "voces" && !claveEleven()) {
    try { sender.send("historias-progreso", { id, tipo: "fin", ok: false, etapa: "voces", informe: "Falta la clave de ElevenLabs para hacer las voces: ponla en RandomHistorias → Ajustes y pulsa «Seguir»." }); } catch (x) {}
    return { ok: false, error: "Falta la clave de ElevenLabs" };
  }
  if (e.tipo === "agente") return lanzarAgente(sender, id, etapaId, promptEtapa(id, etapaId, nota), seguir);
  return lanzar(sender, id, e.args, etapaId, seguir);
}

// historias que esperan a que termine lo que está en marcha (un solo trabajo pesado a la vez en cada equipo)
const cola = [];
function sacarDeCola(sender) {
  if (tarea || !cola.length || !sender || sender.isDestroyed()) return;
  avanzar(sender, cola.shift(), true);
}

function avanzar(sender, id, auto) {
  if (tarea) {
    if (tarea.id !== id && !cola.includes(id)) cola.push(id);
    return { ok: true, cola: true, mensaje: "En cola: empezará cuando termine lo que está en marcha" };
  }
  const s = siguiente(id);
  if (s.terminado || s.espera) { try { sender.send("historias-progreso", { id, tipo: s.terminado ? "terminado" : "espera", etapa: s.espera && s.espera.id }); } catch (e) {} return { ok: true, ...s }; }
  if (auto && !ajustes().avanzarSolo) return { ok: true };
  if (auto && !esOrigen() && s.etapa.id === "escena")
    return { ok: true, espera: "preparada: decide el reparto" };
  correrEtapa(sender, id, s.etapa.id, null, true);
  return { ok: true, etapa: s.etapa.id };
}

// ------------------------------------------------------------------ relevo (v3.41)
/* Al terminar bien una etapa (guion, voces, escena o animatic), copia de la historia en estudio/_relevo/<id>.tgz, sin lo
 * que se puede volver a generar (render final, cachés); la app la sube a Drive y, si este equipo se apaga, otro equipo
 * la baja y sigue desde ahí. Mientras se prepara, la tarea cuenta como activa (nadie coge otro trabajo a medias). */
const RELEVABLES = ["guion", "voces", "escena", "animatic"];
const relevoDir = () => path.join(estudioDir(), "_relevo");
const tarExe = () => path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe");
let empaquetando = null;
function tar(args) {
  return new Promise((ok) => {
    const p = spawn(tarExe(), args, { windowsHide: true });
    let err = "";
    p.stderr.on("data", d => err += d);
    p.on("error", (e) => ok({ ok: false, error: e.message }));
    p.on("close", (code) => ok(code === 0 ? { ok: true } : { ok: false, error: err.trim().slice(0, 300) || "tar terminó con " + code }));
  });
}
/* v3.45.3: los módulos del kit que usa la historia y que NO vienen del portátil (los creó Claude aquí, p. ej. kit/pasos.py):
 * viajan con el relevo, si no el otro equipo no puede rodarla (la 11 se quedó parada en el portátil por eso). */
function kitPropioDe(id) {
  try {
    const rk = require("./rescatekit.cjs");
    const man = leerJson(path.join(__dirname, "..", "proyecto", "manifiesto.json"), {}) || {};
    const delPortatil = new Set(Object.keys(man.archivos || {}));
    if (esOrigen() || !delPortatil.size) return [];
    const c = path.join(histDir(), id), usados = new Set(), pend = [];
    for (const f of fs.readdirSync(c)) if (f.endsWith(".py")) pend.push(...rk.importados(leer(path.join(c, f), "")));
    while (pend.length) { const n = pend.pop(); if (usados.has(n)) continue; usados.add(n); const k = path.join(raiz(), "kit", n + ".py"); if (existe(k)) pend.push(...rk.importados(leer(k, ""))); }
    return [...usados].map(n => "kit/" + n + ".py").filter(r => !delPortatil.has(r) && existe(path.join(raiz(), r)));
  } catch (e) { return []; }
}
async function instantanea(sender, id, etapa) {
  try {
    if (!existe(path.join(histDir(), id))) return;
    fs.mkdirSync(relevoDir(), { recursive: true });
    const out = path.join(relevoDir(), id + ".tgz");
    let guion = null; try { guion = fs.readdirSync(path.join(raiz(), "guiones")).find(n => n.startsWith("historia-" + id.slice(0, 2) + "-")); } catch (x) {}
    const fuera = ["__pycache__", "planos_final", "planos_revisar", "_animatic", "historia*_final*.mp4"].flatMap(x => ["--exclude", "*/" + x]);
    empaquetando = id;
    const r = await tar(["-czf", out + ".tmp", ...fuera, "-C", raiz(), "historias/" + id, ...(guion ? ["guiones/" + guion] : []), ...kitPropioDe(id)]);
    if (!r.ok) { try { fs.unlinkSync(out + ".tmp"); } catch (x) {} return; }
    fs.renameSync(out + ".tmp", out);
    try { if (sender && !sender.isDestroyed()) sender.send("historias-progreso", { id, tipo: "relevo", etapa }); } catch (x) {}
  } catch (e) {} finally { empaquetando = null; }
}
/** Tras una etapa: la copia de relevo (si toca) y luego lo de siempre (la siguiente etapa y la cola). */
/* v3.41.8 VIGILANTE: una etapa de Claude que pasa mucho rato sin dar ninguna señal (p. ej. esperando en un bucle a un
 * archivo que no llega) se corta y se reintenta sola a los 2 min, como cualquier fallo. Lo de Blender puede tardar
 * de verdad (fotos de 60 planos), así que con Blender se le dan 45 min; con lo demás, 15. */
function huellaCarpeta(id) {
  // (v3.41.9) algo cambia en la carpeta de la historia = la herramienta sigue trabajando aunque Claude no escriba nada
  try {
    const c = path.join(histDir(), id);
    let m = fs.statSync(c).mtimeMs;
    for (const n of fs.readdirSync(c)) { try { m = Math.max(m, fs.statSync(path.join(c, n)).mtimeMs); } catch (e) {} }
    return m;
  } catch (e) { return 0; }
}
// v3.45.9: un render que pasa 30 min sin dar NINGUNA señal (cada plano escribe al empezar y al terminar; uno normal tarda
// 1-5 min) se ha colgado: se corta y se reintenta solo a los 2 min, y los planos ya hechos se guardan
setInterval(() => {
  if (!tarea || tarea.tipo !== "cadena" || !tarea.proc || tarea.atascada || tarea.etapa !== "render") return;
  const quieto = Date.now() - (tarea.actividad || tarea.inicio);
  if (quieto < 30 * 60000) return;
  tarea.atascada = Math.round(quieto / 60000);
  tarea.lineas.push("!! Colgado: " + tarea.atascada + " min sin avanzar en el render (último plano: " + ((tarea.render || {}).plano || "ninguno") + "). Se corta y se reintenta.");
  try { spawn("taskkill", ["/PID", String(tarea.proc.pid), "/T", "/F"], { windowsHide: true }); } catch (e) {}
}, 60000);
setInterval(() => {
  if (!tarea || tarea.tipo !== "agente" || !tarea.proc || tarea.atascada) return;
  const h = huellaCarpeta(tarea.id);
  if (h !== tarea.huellaCarpeta) { tarea.huellaCarpeta = h; tarea.actividad = Date.now(); }
  const quieto = Date.now() - (tarea.actividad || tarea.inicio);
  if (quieto < (/^Blender/.test(tarea.accion || "") ? 45 : 30) * 60000) return;
  tarea.atascada = Math.round(quieto / 60000);
  try { spawn("taskkill", ["/PID", String(tarea.proc.pid), "/T", "/F"], { windowsHide: true }); } catch (e) {}
}, 60000);

// v3.41.4: con una actualización esperando, al terminar la etapa en marcha no se encadena la siguiente (la app se
// actualiza y, al volver, la historia sigue sola por donde iba)
let sinEncadenar = false;
ipcMain.handle("historias-pausar-encadenado", async (e, v) => { sinEncadenar = !!v; return { ok: true }; });
function trasEtapa(t, id, ok, etapa) {
  const seguir = () => {
    if (sinEncadenar) return;
    if (t && t.alTerminar) setTimeout(() => t.alTerminar(ok, t.sender), 200);
    setTimeout(() => sacarDeCola(t && t.sender), 1500);
  };
  let hecha = false;
  try { const e = ETAPAS.find(x => x.id === etapa); hecha = !!(e && e.hecho(carpetaDe(id))); } catch (x) {}
  if (ok && hecha && RELEVABLES.includes(etapa)) instantanea(t && t.sender, id, etapa).finally(seguir);
  else seguir();
}
/** Aparta la copia local de una historia que siguió otro equipo (no se borra: historias/_relevadas). */
function apartar(id) {
  const c = path.join(histDir(), id);
  if (!existe(c)) return { ok: true };
  const dest = path.join(histDir(), "_relevadas", id + "-" + Date.now());
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.renameSync(c, dest);
  return { ok: true, a: dest };
}
// v3.41.2: copia al momento (al pasar una historia preparada al portátil, con las revisiones ya aprobadas)
/* v3.45.10: ¿ha cambiado algo de la historia desde «fecha» (la de su copia en Drive)? Lo que no viaja en la copia o se
 * rehace solo (planos renderizados, registros, estado de la cadena, informes) no cuenta. */
ipcMain.handle("estudio-cambiado-desde", async (e, id, fecha) => {
  try {
    const c = carpetaDe(id), desde = Date.parse(fecha);
    if (!desde) return { ok: false };
    const fuera = /^(planos_final|planos_revisar|_animatic|__pycache__|cadena_log)$|^(cadena_estado|estudio)\.json$|^historia\d*_final/;
    let ultimo = 0, quien = "";
    const ver = (d, nivel) => { for (const n of fs.readdirSync(d)) { if (nivel === 0 && fuera.test(n)) continue; if (n === "__pycache__") continue;
      const x = path.join(d, n), st = fs.statSync(x);
      if (st.isDirectory()) ver(x, nivel + 1); else if (st.mtimeMs > ultimo) { ultimo = st.mtimeMs; quien = path.relative(c, x); } } };
    ver(c, 0);
    // (un minuto de margen: la copia se hace justo al acabar la etapa)
    return { ok: true, cambiado: ultimo > desde + 60000, ultimo: new Date(ultimo).toISOString(), archivo: quien };
  } catch (x) { return { ok: false, error: x.message }; }
});
ipcMain.handle("estudio-relevo-preparar", async (e, id) => {
  if (!/^\d{2}_[\w-]+$/.test(String(id))) return { ok: false, error: "historia no válida" };
  // v3.41.8: se puede con otra historia en marcha (la copia es solo leer y comprimir); con esta misma, no
  if ((tarea && tarea.id === id) || empaquetando) return { ok: false, error: "Esa historia está en marcha" };
  await instantanea(null, id, "voces");
  return existe(path.join(relevoDir(), id + ".tgz")) ? { ok: true } : { ok: false, error: "No se pudo preparar la copia" };
});
ipcMain.handle("estudio-relevo-subir", async (e, id, token) => {
  const f = path.join(relevoDir(), String(id) + ".tgz");
  if (!/^\d{2}_[\w-]+$/.test(String(id)) || !existe(f)) return { ok: false, error: "No hay copia de relevo" };
  try { const r = await drive.subir(token, f, ["RandomStudio", "RandomHistorias", "_Relevo"]); return { ok: true, archivo: r.id, md5: r.md5, tam: r.tam }; }
  catch (x) { return { ok: false, error: x.message }; }
});
ipcMain.handle("estudio-relevo-recibir", async (e, id, token, archivo, md5) => {
  if (!/^\d{2}_[\w-]+$/.test(String(id)) || !archivo) return { ok: false, error: "Relevo no válido" };
  if (tarea || empaquetando) return { ok: false, error: "Hay una tarea en marcha" };
  const f = path.join(relevoDir(), "recibido-" + id + ".tgz");
  try {
    fs.mkdirSync(relevoDir(), { recursive: true });
    await drive.bajar(token, archivo, f, md5 || null);
    // (v3.42) se abre en un temporal y solo si va bien se aparta la copia local y se mueve la nueva a su sitio
    const tmp = path.join(relevoDir(), "tmp-" + id);
    fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
    const r = await tar(["-xzf", f, "-C", tmp]);
    try { fs.unlinkSync(f); } catch (x) {}
    if (!r.ok || !existe(path.join(tmp, "historias", id))) { fs.rmSync(tmp, { recursive: true, force: true }); return { ok: false, error: "No se pudo abrir la copia: " + (r.error || "vacía") }; }
    apartar(id);
    fs.renameSync(path.join(tmp, "historias", id), path.join(histDir(), id));
    try { for (const k of fs.readdirSync(path.join(tmp, "kit"))) { const d = path.join(raiz(), "kit", k); if (k.endsWith(".py") && !existe(d)) fs.renameSync(path.join(tmp, "kit", k), d); } } catch (x) {}
    try { for (const g of fs.readdirSync(path.join(tmp, "guiones"))) { fs.mkdirSync(path.join(raiz(), "guiones"), { recursive: true }); fs.renameSync(path.join(tmp, "guiones", g), path.join(raiz(), "guiones", g)); } } catch (x) {}
    fs.rmSync(tmp, { recursive: true, force: true });
    return { ok: true };
  } catch (x) { return { ok: false, error: x.message }; }
});
ipcMain.handle("estudio-relevo-borrar", async (e, id, token, archivo) => {
  try { fs.unlinkSync(path.join(relevoDir(), String(id).replace(/[^\w-]/g, "") + ".tgz")); } catch (x) {}
  if (!archivo) return { ok: true };
  try { await drive.borrar(token, String(archivo)); return { ok: true }; } catch (x) { return { ok: false, error: x.message }; }
});
ipcMain.handle("estudio-relevada", async (e, id) => {
  if (!/^\d{2}_[\w-]+$/.test(String(id))) return { ok: false, error: "historia no válida" };
  if (tarea && tarea.id === id) return { ok: false, error: "Está en marcha aquí" };
  const i = cola.indexOf(id); if (i >= 0) cola.splice(i, 1);
  try { return apartar(id); } catch (x) { return { ok: false, error: x.message }; }
});
/* v3.41.3 BASE: los recursos del proyecto que no son código (efectos, música, fuentes, texturas, biblioteca 3D; ~45 MB).
 * El portátil (origen) los sube a Drive cuando cambian y publica su huella; los demás equipos los bajan si la suya es otra.
 * Sin ellos, el ordenador no podía mezclar el sonido ni montar, y Claude improvisaba (y se quedaba en bucle). */
/* v3.42 (tanda 2 de la revisión): DOS paquetes, para que un retoque del kit no vuelva a subir 50 MB:
 *  - «base»: los recursos fijos (efectos, música, fuentes, texturas, biblioteca 3D; ~45 MB). Cambia casi nunca.
 *  - «kit»: el KIT VIVO (kit, herramientas, plantilla, guías; ~1 MB): lo que Claude mejora en el portátil llega al ordenador
 *    en minutos sin esperar a otra versión de RandomStudio.
 * La huella es por CONTENIDO (no por fecha), así que tocar y deshacer no sube nada. */
const PARTES = {
  base: ["assets/fuentes", "assets/textures", "assets/roblox", "assets/musica", "assets/sfx", "library", "historias/01_bostezo/fuentes"],
  // roblox: el pueblo por código (Luau) y el sombrero, para grabar en Roblox Studio desde cualquier equipo
  kit: ["kit", "tools", "roblox", "historias/_plantilla", "guiones/prompt-produccion.md", "guiones/canal_nuevo.md"],
};
const baseDir = () => path.join(estudioDir(), "_base");
function huellaDe(cual) {
  const crypto = require("crypto"), h = crypto.createHash("sha1");
  const archivo = (f, rel) => { const st = fs.statSync(f);
    // el kit por contenido (es pequeño); la base por tamaño (son archivos grandes que no se editan)
    h.update(rel + "|" + (cual === "kit" ? crypto.createHash("sha1").update(fs.readFileSync(f)).digest("hex") : st.size) + "\n"); };
  const ver = (d) => { let ns = []; try { ns = fs.readdirSync(d).sort(); } catch (e) { return; }
    for (const n of ns) { if (n === "__pycache__" || n.endsWith(".pyc")) continue; const f = path.join(d, n); if (fs.statSync(f).isDirectory()) ver(f); else archivo(f, path.relative(raiz(), f).replace(/\\/g, "/")); } };
  for (const p of PARTES[cual]) { const f = path.join(raiz(), p); if (!existe(f)) continue; if (fs.statSync(f).isFile()) archivo(f, p); else ver(f); }
  return h.digest("hex").slice(0, 16);
}
const esOrigen = () => existe(path.join(raiz(), ".origen_kit"));
const jsonDe = (cual, que) => leerJson(path.join(baseDir(), (cual === "kit" ? "kit_" : "") + que + ".json"), null);
ipcMain.handle("base-estado", async () => {
  try {
    const o = esOrigen();
    return { ok: true, origen: o,
      huella: o ? huellaDe("base") : null, subida: jsonDe("base", "subida"), instalada: jsonDe("base", "instalada"),
      huellaKit: o ? huellaDe("kit") : null, subidaKit: jsonDe("kit", "subida"), instaladaKit: jsonDe("kit", "instalada") };
  } catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle("base-subir", async (e, token, cual) => {
  cual = cual === "kit" ? "kit" : "base";
  if (!esOrigen()) return { ok: false, error: "Solo la sube el portátil" };
  try {
    fs.mkdirSync(baseDir(), { recursive: true });
    const f = path.join(baseDir(), cual + ".tgz"), huella = huellaDe(cual);
    const r = await tar(["-czf", f, "--exclude", "*/__pycache__", "--exclude", "*.pyc", "-C", raiz(), ...PARTES[cual].filter(p => existe(path.join(raiz(), p)))]);
    if (!r.ok) return r;
    const up = await drive.subir(token, f, ["RandomStudio", "RandomHistorias", "_Base"]);
    const info = { archivo: up.id, md5: up.md5, tam: up.tam, huella, fecha: new Date().toISOString() };
    escribirJson(path.join(baseDir(), (cual === "kit" ? "kit_" : "") + "subida.json"), info);
    try { fs.unlinkSync(f); } catch (x) {}
    return { ok: true, ...info };
  } catch (x) { return { ok: false, error: x.message }; }
});
ipcMain.handle("base-instalar", async (e, token, info, cual) => {
  cual = cual === "kit" ? "kit" : "base";
  if (esOrigen()) return { ok: false, error: "El portátil es el origen" };
  if (!info || !info.archivo) return { ok: false, error: "Sin paquete" };
  if (tarea || empaquetando) return { ok: false, error: "Hay una tarea en marcha" };
  try {
    fs.mkdirSync(baseDir(), { recursive: true });
    const f = path.join(baseDir(), cual + ".tgz");
    await drive.bajar(token, String(info.archivo), f, info.md5 || null);
    const r = cual === "kit" ? await instalarKitVivo(f) : await tar(["-xzf", f, "-C", raiz()]);
    if (r.ok && cual === "kit") { limpiarRestos(f); rescatarKit(); }
    try { fs.unlinkSync(f); } catch (x) {}
    if (!r.ok) return r;
    escribirJson(path.join(baseDir(), (cual === "kit" ? "kit_" : "") + "instalada.json"), { huella: info.huella, fecha: new Date().toISOString(), origen: info.fecha });
    return { ok: true };
  } catch (x) { return { ok: false, error: x.message }; }
});
// v3.42.3: al instalar el kit vivo se borran los archivos del kit que ya no existen en el portátil (un módulo renombrado o
// una herramienta quitada se quedaban aquí para siempre y Claude podía seguir usándolos). Solo dentro de las carpetas del kit.
// v3.45.3: borraba TAMBIÉN lo que Claude había creado en este equipo (kit/escuela.py de la historia 13) y el ordenador ya
// no podía renderizar. Ahora solo se quita lo que vino de un kit anterior del portátil y ya no está en el nuevo, y no se
// borra: se aparta a _kit_local/<fecha>/ (de ahí lo recupera el rescate si una historia lo usa).
/* v3.45.7: lo que se instaló del kit vivo del portátil, con la huella de cada archivo: { "kit/x.py": sha256 } (antes era una
 * lista de nombres, sin huella: esos cuentan como «sin tocar aquí»). */
const kitListaF = () => path.join(baseDir(), "kit_lista.json");
function kitLista() { const l = leerJson(kitListaF(), {}) || {}; return Array.isArray(l) ? Object.fromEntries(l.map(n => [n, null])) : l; }
const shaArchivo = (p) => { try { return require("crypto").createHash("sha256").update(fs.readFileSync(p)).digest("hex"); } catch (e) { return null; } };
/* v3.45.7: el kit vivo, archivo a archivo. Si un archivo se cambió AQUÍ desde la última vez (p. ej. Claude arregló
 * kit/escuela.py para un render), no se pisa: se queda el de aquí, que viaja al portátil como kit propio y vuelve después
 * dentro del kit vivo. Antes «tar -x» lo sobrescribía todo y deshacía el arreglo. */
async function instalarKitVivo(tgz) {
  const tmp = path.join(baseDir(), "kit_vivo_tmp");
  try {
    fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
    const r = await tar(["-xzf", tgz, "-C", tmp]);
    if (!r.ok) return r;
    const lista = kitLista(), nueva = {}, guardados = [];
    const ver = (d) => { for (const n of fs.readdirSync(d)) { const x = path.join(d, n); if (fs.statSync(x).isDirectory()) { ver(x); continue; }
      const rel = path.relative(tmp, x).split(path.sep).join("/"), dst = path.join(raiz(), rel);
      const nuevo = shaArchivo(x), local = existe(dst) ? shaArchivo(dst) : null;
      nueva[rel] = nuevo;
      const cambiadoAqui = local && local !== nuevo && lista[rel] && local !== lista[rel];
      if (cambiadoAqui) { guardados.push(rel); continue; }
      if (local !== nuevo) { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(x, dst); } } };
    ver(tmp);
    escribirJson(kitListaF(), nueva);
    if (guardados.length) console.log("kit vivo: se quedan los cambiados aquí:", guardados);
    return { ok: true, guardados };
  } catch (x) { return { ok: false, error: x.message }; }
  finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (x) {} }
}
function limpiarRestos(tgz) {
  try {
    const dentro = new Set(require("child_process").execFileSync(tarExe(), ["-tzf", tgz], { encoding: "utf8", windowsHide: true, maxBuffer: 64 << 20 })
      .split(/\r?\n/).map(x => x.replace(/^\.\//, "").replace(/\/$/, "")).filter(Boolean));
    const antes = new Set(Object.keys(kitLista()));
    const sello = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const ver = (d) => { let ns = []; try { ns = fs.readdirSync(d); } catch (e) { return; }
      for (const n of ns) { if (n === "__pycache__" || n.endsWith(".pyc")) continue; const f = path.join(d, n);
        const rel = path.relative(raiz(), f).split(path.sep).join("/");
        if (fs.statSync(f).isDirectory()) { ver(f); continue; }
        if (!dentro.has(rel) && antes.has(rel)) {
          try { const bk = path.join(raiz(), "_kit_local", sello, rel); fs.mkdirSync(path.dirname(bk), { recursive: true }); fs.renameSync(f, bk); } catch (e) {}
        } } };
    for (const p of PARTES.kit) { const f = path.join(raiz(), p); if (existe(f) && fs.statSync(f).isDirectory()) ver(f); }
  } catch (e) {}
}
// v3.42: la fuente de los subtítulos (Lilita One) instalada para este usuario (sin administrador), por si el equipo no la
// tiene: los subtítulos la buscan en las fuentes de Windows y sin ella la etapa Animatic fallaba
function asegurarFuentes() {
  try {
    const src = path.join(raiz(), "assets", "fuentes");
    if (!existe(src)) return;
    const dest = path.join(process.env.LOCALAPPDATA || "", "Microsoft", "Windows", "Fonts");
    fs.mkdirSync(dest, { recursive: true });
    for (const n of fs.readdirSync(src).filter(x => /\.(ttf|otf)$/i.test(x))) {
      if (existe(path.join(process.env.SystemRoot || "C:\\Windows", "Fonts", n)) || existe(path.join(dest, n))) continue;
      fs.copyFileSync(path.join(src, n), path.join(dest, n));
      const nombre = n.replace(/\.(ttf|otf)$/i, "").replace(/-Regular$/, "").replace(/([a-z])([A-Z])/g, "$1 $2") + " (TrueType)";
      spawn("reg", ["add", "HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts", "/v", nombre, "/t", "REG_SZ", "/d", path.join(dest, n), "/f"], { windowsHide: true });
    }
  } catch (e) {}
}
app.whenReady().then(() => setTimeout(asegurarFuentes, 10000));

// v3.41.7: la gráfica de este equipo (NVIDIA), para saber si Whisper puede ir por ella
let _gpu;
function gpuNombre() {
  if (_gpu !== undefined) return _gpu;
  try { _gpu = require("child_process").execFileSync("nvidia-smi", ["--query-gpu=name,memory.total", "--format=csv,noheader"], { encoding: "utf8", windowsHide: true, timeout: 5000 }).trim().split(/\r?\n/)[0] || null; }
  catch (e) { _gpu = null; }
  return _gpu;
}
// v3.41.7: las librerías de CUDA para que Whisper use la gráfica NVIDIA (pip, solo para este usuario; ~1 GB)
let instalandoCuda = false;
ipcMain.handle("instalar-cuda", async () => instalandoCuda ? { ok: false, error: "Ya se están instalando" } : new Promise((ok0) => {
  instalandoCuda = true;
  const ok = (r) => { instalandoCuda = false; ok0(r); };
  const p = spawn("python", ["-m", "pip", "install", "--user", "nvidia-cublas-cu12", "nvidia-cudnn-cu12==9.*"], { windowsHide: true });
  let out = "";
  p.stdout.on("data", d => out += d); p.stderr.on("data", d => out += d);
  p.on("error", (e) => ok({ ok: false, error: "No encuentro Python: " + e.message }));
  p.on("close", async (code) => {
    if (code !== 0) return ok({ ok: false, error: out.trim().split(/\r?\n/).slice(-2).join(" ").slice(0, 300) });
    const g = await probarGpu();          // (v3.45.6) instaladas no basta: se prueba la gráfica de verdad
    ok(g.ok ? { ok: true, gpu: true } : { ok: false, error: "Librerías instaladas, pero Whisper no puede usar la gráfica: " + g.error });
  });
}));
/* v3.45.6: ¿Whisper puede usar la gráfica DE VERDAD? (tools/transcribir.py --probar-gpu: carga el modelo en CUDA y
 * transcribe un segundo de silencio; deja el resultado en estudio/_whisper.json, que es lo que se ve en «Equipos»).
 * Al instalar CUDA y al arrancar, si este equipo tiene una NVIDIA y Whisper iba por el procesador. */
function probarGpu() {
  return new Promise((fin) => {
    let out = "";
    const p = spawn("python", [path.join(raiz(), "tools", "transcribir.py"), "--probar-gpu"], { cwd: raiz(), env: { ...process.env, PYTHONIOENCODING: "utf-8" }, windowsHide: true });
    const t = setTimeout(() => { try { p.kill(); } catch (e) {} }, 10 * 60000);
    p.stdout.on("data", d => out += d); p.stderr.on("data", d => out += d);
    p.on("error", (e) => { clearTimeout(t); fin({ ok: false, error: e.message }); });
    p.on("close", (code) => { clearTimeout(t); fin(code === 0 ? { ok: true } : { ok: false, error: out.trim().split(/\r?\n/).slice(-1)[0].slice(0, 300) }); });
  });
}
app.whenReady().then(() => setTimeout(() => {
  try {
    const w = leerJson(path.join(estudioDir(), "_whisper.json"), null);
    if (tarea || !/nvidia/i.test(gpuNombre() || "") || (w && w.dispositivo === "cuda") || !existe(path.join(raiz(), "tools", "transcribir.py"))) return;
    probarGpu().then(r => console.log("prueba de la gráfica:", r));
  } catch (e) {}
}, 45000));

function discoLibre() {
  try { const st = fs.statfsSync(raiz()); return Math.round(st.bavail * st.bsize / 1e9 * 10) / 10; } catch (e) { return null; }
}

// ------------------------------------------------------------------ ideas
const ideasArchivo = () => path.join(estudioDir(), "ideas.json");
const leerIdeas = () => leerJson(ideasArchivo(), []);
let ideasProc = null;

function extraerJson(txt) {
  // (v3.41.9) el primer «[…]» que sea un array válido (antes, otro «[» en el texto rompía todo el pedido)
  const s = String(txt);
  let intentos = 0;
  for (let i = s.indexOf("["); i >= 0 && intentos < 40; i = s.indexOf("[", i + 1)) {
    for (let k = s.lastIndexOf("]"); k > i && intentos < 40; k = s.lastIndexOf("]", k - 1)) {
      intentos++;
      try { const v = JSON.parse(s.slice(i, k + 1)); if (Array.isArray(v) && v.length) return v; } catch (e) {}
    }
  }
  throw new Error("Claude no devolvió ideas en el formato esperado");
}

ipcMain.handle("estudio-ideas", async () => ({ ok: true, ideas: leerIdeas(), generando: !!ideasProc }));

ipcMain.handle("estudio-ideas-generar", async (e, cuantas, pista) => {
  if (ideasProc) return { ok: false, error: "Ya está generando ideas" };
  const n = Math.max(1, Math.min(10, Number(cuantas) || 5));
  const sender = e.sender;
  const prompt = instrucciones("reglas") + "\n\n---\n\n" + instrucciones("ideas") + `\n\nPropón ${n} ideas.` + (pista ? `\nPista del usuario: ${String(pista).slice(0, 500)}` : "")
    + `\nFecha de hoy: ${new Date().toISOString().slice(0, 10)}.`;
  ideasProc = claude.generar(prompt, { cwd: raiz(), herramientas: "lectura", segundos: 900 })
    .then(txt => {
      const nuevas = extraerJson(txt).map((x, i) => ({ id: "i" + Date.now().toString(36) + i, fecha: new Date().toISOString(), estado: "nueva", ...x }));
      escribirJson(ideasArchivo(), [...nuevas, ...leerIdeas()]);
      try { sender.send("estudio-ideas-listas", { ok: true, n: nuevas.length }); } catch (x) {}
    })
    .catch(err => { const limite = claude.limiteDe(err.message); try { sender.send("estudio-ideas-listas", { ok: false, error: err.message, ...(limite ? { limite } : {}) }); } catch (x) {} })
    .finally(() => { ideasProc = null; });
  return { ok: true };
});

ipcMain.handle("estudio-idea-poner", async (e, ideaId, cambios) => {
  const ideas = leerIdeas(), i = ideas.findIndex(x => x.id === ideaId);
  if (i < 0) throw new Error("idea no encontrada");
  const permitido = {};
  if (["nueva", "guardada", "descartada", "en_cola"].includes(cambios && cambios.estado)) permitido.estado = cambios.estado;
  if (cambios && typeof cambios.nota === "string") permitido.nota = cambios.nota.slice(0, 2000);
  ideas[i] = { ...ideas[i], ...permitido };
  escribirJson(ideasArchivo(), ideas);
  return { ok: true };
});
ipcMain.handle("estudio-idea-borrar", async (e, ideaId) => {
  escribirJson(ideasArchivo(), leerIdeas().filter(x => x.id !== ideaId));
  return { ok: true };
});

function slugDe(t) {
  const fuera = new Set(["en", "este", "esta", "pueblo", "aqui", "todos", "todas", "nadie", "puede", "se", "la", "el", "los", "las", "de",
    "a", "que", "tu", "tus", "su", "sus", "un", "una", "con", "por", "y", "es", "son", "al", "del", "lo", "no"]);
  const w = String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(x => x && !fuera.has(x));
  return (w.slice(-2).join("_") || "historia").slice(0, 30);
}

// opts.nn: número que toca contando las historias de TODOS los equipos (trabajo dual); opts.idea: la idea si viene de otro equipo
ipcMain.handle("estudio-crear", async (e, ideaId, opts) => {
  if (tarea || empaquetando) return { ok: false, error: "Ya hay una tarea en marcha: espera a que termine" };
  fs.mkdirSync(histDir(), { recursive: true });
  const ideas = leerIdeas();
  let idea = ideas.find(x => x.id === ideaId);
  if (!idea && opts && opts.idea && opts.idea.titulo) { idea = { ...opts.idea, id: ideaId }; ideas.unshift(idea); }
  if (!idea) throw new Error("idea no encontrada");
  const nums = fs.readdirSync(histDir()).map(n => parseInt(n, 10)).filter(n => !isNaN(n));
  const pedido = opts && Number.isInteger(opts.nn) ? opts.nn : 0;
  const nn = String(Math.max(pedido, (nums.length ? Math.max(...nums) : 0) + 1)).padStart(2, "0");
  const id = nn + "_" + slugDe(idea.titulo);
  const c = path.join(histDir(), id);
  fs.mkdirSync(c, { recursive: true });
  const { id: _i, estado: _e, ...datosIdea } = idea;
  guardarEstudio(c, { creado: new Date().toISOString(), idea: datosIdea, revisiones: {} });
  idea.estado = "usada"; idea.historia = id;
  escribirJson(ideasArchivo(), ideas);
  correrEtapa(e.sender, id, "guion", idea.nota || null, true);
  return { ok: true, id };
});

// ------------------------------------------------------------------ etapas, revisiones y notas
ipcMain.handle("estudio-etapas", async (e, id) => ({ ok: true, etapas: etapasDe(id), ajustes: ajustes() }));

ipcMain.handle("estudio-avanzar", async (e, id) => avanzar(e.sender, id, false));

ipcMain.handle("estudio-rehacer", async (e, id, etapaId, nota) => {
  if (tarea) return { ok: false, error: "Ya hay una tarea en marcha" };
  if (!ETAPAS.some(x => x.id === etapaId)) return { ok: false, error: "Esa etapa no existe: " + etapaId };
  const c = carpetaDe(id), est = estudioDe(c);
  est.revisiones = { ...(est.revisiones || {}) };
  if (est.revisiones[etapaId]) est.revisiones[etapaId] = { estado: "cambios", nota: nota || "", fecha: new Date().toISOString() };
  guardarEstudio(c, est);
  correrEtapa(e.sender, id, etapaId, nota ? String(nota).slice(0, 4000) : null, false);
  return { ok: true };
});

ipcMain.handle("estudio-revisar", async (e, id, etapaId, aprobado, nota) => {
  if (!REVISABLES.includes(etapaId)) throw new Error("esa etapa no se revisa");
  if (!aprobado && tarea) return { ok: false, error: "Ya hay una tarea en marcha" };
  const c = carpetaDe(id), est = estudioDe(c);
  est.revisiones = { ...(est.revisiones || {}), [etapaId]: { estado: aprobado ? "aprobado" : "cambios", nota: nota || "", fecha: new Date().toISOString() } };
  guardarEstudio(c, est);
  if (aprobado) return avanzar(e.sender, id, true);
  correrEtapa(e.sender, id, etapaId, String(nota || "").slice(0, 4000) || "Revísalo y mejóralo.", false);
  return { ok: true };
});

ipcMain.handle("estudio-nota-final", async (e, id, texto) => {
  const c = carpetaDe(id), est = estudioDe(c);
  const t = String(texto || "").trim().slice(0, 4000);
  est.nota_final = t ? { texto: t, fecha: new Date().toISOString() } : null;
  guardarEstudio(c, est);
  if (t) {
    fs.mkdirSync(estudioDir(), { recursive: true });
    fs.appendFileSync(path.join(estudioDir(), "notas_mejora.md"), `\n## Historia ${id.slice(0, 2)} — ${titulo(c)} (${new Date().toISOString().slice(0, 10)})\n${t}\n`);
  }
  return { ok: true };
});

ipcMain.handle("estudio-ajustes", async (e, nuevos) => {
  if (nuevos) {
    const a = ajustes();
    if (nuevos.revisar) for (const k of REVISABLES) if (typeof nuevos.revisar[k] === "boolean") a.revisar[k] = nuevos.revisar[k];
    if (typeof nuevos.avanzarSolo === "boolean") a.avanzarSolo = nuevos.avanzarSolo;
    if (typeof nuevos.driveAuto === "boolean") a.driveAuto = nuevos.driveAuto;
    if (typeof nuevos.equipoDePaso === "boolean") a.equipoDePaso = nuevos.equipoDePaso;
    escribirJson(path.join(estudioDir(), "ajustes.json"), a);
  }
  const cl = claude.estadoClaude();
  return { ok: true, ajustes: ajustes(), eleven: !!claveEleven(), fish: !!claveFish(), claude: !!claude.exeClaude() && cl.ok !== false, claudeInstalado: !!claude.exeClaude(),
    claudeOk: cl.ok, claudeError: cl.error, blender: !!blenderExe(), proyecto: existe(histDir()),
    elevenError: elevenPrueba.ok === false ? elevenPrueba.error : "", origen: esOrigen(),
    gpu: gpuNombre(), whisper: leerJson(path.join(estudioDir(), "_whisper.json"), null),
    // v3.41: la salud del equipo (Git Bash, espacio libre en el disco del proyecto y fecha del kit)
    rescateKit, bash: !!claude.rutaBash(), disco: discoLibre(), kit: (leerJson(path.join(__dirname, "..", "proyecto", "manifiesto.json"), {}) || {}).fecha || null };
});

ipcMain.handle("estudio-clave-eleven", async (e, clave) => {
  const k = String(clave || "").replace(/\s+/g, "");
  if (!k) { try { fs.unlinkSync(claveArchivo()); } catch (x) {} return { ok: true, eleven: false }; }
  if (!safeStorage.isEncryptionAvailable()) throw new Error("Windows no deja cifrar la clave en este equipo");
  fs.writeFileSync(claveArchivo(), safeStorage.encryptString(k));
  const p = await probarEleven(true);
  return { ok: true, eleven: true, probada: p.ok, error: p.error };
});

ipcMain.handle("estudio-clave-fish", async (e, clave) => {
  const k = String(clave || "").replace(/\s+/g, "");
  if (!k) { try { fs.unlinkSync(claveFishArchivo()); } catch (x) {} return { ok: true, fish: false }; }
  if (!safeStorage.isEncryptionAvailable()) throw new Error("Windows no deja cifrar la clave en este equipo");
  fs.writeFileSync(claveFishArchivo(), safeStorage.encryptString(k));
  return { ok: true, fish: true };
});

/* Prueba del narrador de fish.audio: el primer párrafo de la última historia a x1,0 / x1,2 / x1,4
 * -> historias/<última>/audio_eleven/prueba_fish_x*.mp3 (la clave no sale de la app: va en el entorno de voz_fish.py). */
ipcMain.handle("estudio-prueba-fish", async () => {
  const k = claveFish();
  if (!k) throw new Error("Falta la clave de fish.audio");
  const ultima = fs.readdirSync(histDir()).filter(n => /^\d+_/.test(n) && existe(path.join(histDir(), n, "narracion.txt"))).sort().pop();
  if (!ultima) throw new Error("No hay ninguna historia con narración");
  const correr = (v) => new Promise((ok, ko) => {
    const p = spawn("python", [path.join(raiz(), "tools", "voz_fish.py"), path.join("historias", ultima), "--prueba", "--velocidad=" + v],
      { cwd: raiz(), env: { ...process.env, PYTHONIOENCODING: "utf-8", FISH_API_KEY: k }, windowsHide: true });
    let out = "";
    p.stdout.on("data", d => out += d); p.stderr.on("data", d => out += d);
    p.on("close", code => code === 0 ? ok(out) : ko(new Error(out.split("\n").filter(Boolean).slice(-2).join(" | ") || ("código " + code))));
  });
  for (const v of ["1.0", "1.2", "1.4"]) await correr(v);
  return { ok: true, historia: ultima };
});

/** Lo que se revisa/ve de cada etapa: el texto del guion, el audio, el animatic y el Short final. */
ipcMain.handle("estudio-material", async (e, id) => {
  const c = carpetaDe(id), est = estudioDe(c);
  const guion = (() => { try { return fs.readdirSync(path.join(raiz(), "guiones")).find(n => n.startsWith("historia-" + id.slice(0, 2) + "-")); } catch (x) { return null; } })();
  const final = path.join(c, `historia${id.slice(0, 2)}_final.mp4`);
  return {
    ok: true, legado: !est.creado, drive: est.drive || null, driveRevision: est.driveRevision || {}, idea: est.idea || null, revisiones: est.revisiones || {}, informes: est.informes || {}, nota_final: est.nota_final || null,
    titulo: titulo(c), narracion: leer(path.join(c, "narracion.txt"), ""),
    guion: guion ? leer(path.join(raiz(), "guiones", guion), "") : "",
    audio: existe(path.join(c, "audio", "mezcla.wav")) ? urlArchivo(path.join(c, "audio", "mezcla.wav")) : null,
    animatic: existe(path.join(c, "animatic.mp4")) ? urlArchivo(path.join(c, "animatic.mp4")) : null,
    video: existe(final) ? urlArchivo(final) : null,
    sugerida: existe(path.join(c, "miniatura.png")) ? miniDataUrl(path.join(c, "miniatura.png"), 360) : null,
  };
});

// ------------------------------------------------------------------ Drive: el Short entregado y lo que hay que revisar
const subiendo = new Set();
ipcMain.handle("estudio-drive-subir", async (e, id, token, perfilNombre, que) => {
  const c = carpetaDe(id), t = titulo(c), sender = e.sender, clave = id + ":" + que;
  if (subiendo.has(clave)) return { ok: false, error: "Ya se está subiendo" };
  const base = ["RandomStudio", String(perfilNombre || "RandomHistorias"), "Historias"];
  let archivos, partes;
  if (que === "short") {
    const dir = path.join(listasDir(), tituloArchivo(t));
    if (!existe(dir)) return { ok: false, error: "Todavía no está entregado" };
    archivos = fs.readdirSync(dir).map(n => path.join(dir, n)).filter(f => fs.statSync(f).isFile());
    partes = [...base, tituloArchivo(t)];
  } else if (que === "voces" || que === "animatic") {
    const f = que === "voces" ? path.join(c, "audio", "mezcla.wav") : path.join(c, "animatic.mp4");
    if (!existe(f)) return { ok: false, error: "Aún no existe" };
    archivos = [f]; partes = [...base, "_Para revisar", id];
  } else return { ok: false, error: "No sé qué subir" };
  subiendo.add(clave);
  try {
    const hechos = [];
    for (let i = 0; i < archivos.length; i++) {
      const r = await drive.subir(token, archivos[i], partes, (f) => {
        try { sender.send("historias-progreso", { id, tipo: "drive", que, archivo: path.basename(archivos[i]), fraccion: (i + f) / archivos.length }); } catch (x) {}
      });
      hechos.push(r);
    }
    const est = estudioDe(c), carpetaUrl = "https://drive.google.com/drive/folders/" + hechos[0].carpeta;
    // (v3.43.3) con el id y el md5 de cada archivo: la app reproduce el animatic desde Drive y el portátil baja los Shorts
    if (que === "short") est.drive = { fecha: new Date().toISOString(), carpeta: carpetaUrl, nombreCarpeta: tituloArchivo(t), archivos: hechos.map(h => ({ id: h.id, md5: h.md5, nombre: h.nombre, tam: h.tam, ver: h.ver, bajar: h.bajar, verificado: h.verificado })) };
    else est.driveRevision = { ...(est.driveRevision || {}), [que]: { fecha: new Date().toISOString(), id: hechos[0].id, tam: hechos[0].tam, ver: hechos[0].ver, bajar: hechos[0].bajar } };
    guardarEstudio(c, est);
    // equipo de paso (el ordenador): con el Short ya en Drive y comprobado, se borra lo pesado de este equipo
    if (que === "short" && ajustes().equipoDePaso && !esOrigen() && hechos.every(h => h.verificado)) {
      for (const sub of ["planos_final", "planos_revisar", "_animatic"]) { try { fs.rmSync(path.join(c, sub), { recursive: true, force: true }); } catch (x) {} }
      for (const f of fs.readdirSync(c).filter(n => /^historia\d+_final.*\.mp4$/.test(n))) { try { fs.unlinkSync(path.join(c, f)); } catch (x) {} }
      try { fs.rmSync(path.join(listasDir(), tituloArchivo(t)), { recursive: true, force: true }); } catch (x) {}
    }
    try { sender.send("historias-progreso", { id, tipo: "driveListo", que }); } catch (x) {}
    return { ok: true, carpeta: carpetaUrl, archivos: hechos.length, verificados: hechos.every(h => h.verificado) };
  } catch (x) {
    return { ok: false, error: x.message };
  } finally { subiendo.delete(clave); }
});

/* v3.43.3 (pedido del 2-11): TODAS las historias terminadas se guardan también en el portátil, en Vídeos RDR\Editados\
 * RandomHistorias\<TÍTULO>\ (vídeo + miniatura), aunque las termine el ordenador (que, como equipo de paso, las sube a Drive y las borra). El portátil las baja de Drive; se apunta lo bajado para no volver a bajar lo que borres a mano. */
const idDeDrive = (ver) => (String(ver || "").match(/\/d\/([\w-]+)/) || [])[1] || null;
let bajandoEntrega = false;
ipcMain.handle("estudio-entrega-bajar", async (e, token, d) => {
  const archivos = ((d && d.archivos) || []).map(a => ({ ...a, id: a.id || idDeDrive(a.ver) })).filter(a => a.id && a.nombre);
  const mp4 = archivos.find(a => /\.mp4$/i.test(a.nombre));
  if (!mp4) return { ok: false, error: "Sin vídeo en Drive" };
  const nombre = path.basename(String(d.nombreCarpeta || mp4.nombre.replace(/\.mp4$/i, "")));
  const dir = path.join(listasDir(), nombre), reg = path.join(estudioDir(), "entregas_bajadas.json"), hechas = leerJson(reg, {});
  if (hechas[mp4.id]) return { ok: true, bajado: false };
  const apuntar = () => { hechas[mp4.id] = { carpeta: nombre, fecha: new Date().toISOString() }; escribirJson(reg, hechas); };
  if (existe(path.join(dir, path.basename(mp4.nombre)))) { apuntar(); return { ok: true, bajado: false }; }
  if (bajandoEntrega) return { ok: false, error: "Ya se está bajando otra" };
  bajandoEntrega = true;
  try {
    for (const a of archivos) { const f = path.join(dir, path.basename(a.nombre)); if (!existe(f)) await drive.bajar(token, a.id, f, a.md5 || null); }
    apuntar();
    return { ok: true, bajado: true, carpeta: dir };
  } catch (x) { return { ok: false, error: x.message }; }
  finally { bajandoEntrega = false; }
});

/* v3.39: el KIT viaja con RandomStudio. Cada versión lleva dentro el código del proyecto de historias del portátil
 * (proyecto/: kit/*.py, tools/*.py, tools/estudio/*.md, ver tools/proyecto.mjs). Al arrancar, los demás equipos lo
 * instalan en su proyecto para rodar con el mismo kit (cámara, escenario, revisor...). El portátil (tiene .origen_kit)
 * nunca se toca. Si este equipo cambió un archivo por su cuenta (p. ej. Claude añadió algo al kit aquí), se guarda una
 * copia en _kit_local/<fecha>/ antes de sustituirlo; los archivos nuevos de este equipo no se borran. */
function sincronizarKit() {
  const crypto = require("crypto");
  const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
  try {
    const R = raiz();
    if (!R || !existe(path.join(R, "kit")) || existe(path.join(R, ".origen_kit"))) return { ok: true, nada: true };
    const src = path.join(__dirname, "..", "proyecto");
    const man = JSON.parse(fs.readFileSync(path.join(src, "manifiesto.json"), "utf8"));
    const estF = path.join(R, ".kit_sync.json");
    const est = leerJson(estF, { archivos: {} });
    if (est.fecha === man.fecha) return { ok: true, al_dia: true };
    // (v3.42) si el kit vivo bajado de Drive es más nuevo que la copia que trae esta versión, no se pisa
    const kv = leerJson(path.join(estudioDir(), "_base", "kit_instalada.json"), null);
    if (kv && kv.origen && kv.origen > man.fecha) { escribirJson(estF, { ...est, fecha: man.fecha, saltado: "kit vivo más nuevo" }); return { ok: true, al_dia: true, kitVivo: true }; }
    const sello = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    let puestos = 0, guardados = 0;
    // v3.41.3: la memoria de las historias (_memoria/) va a la carpeta donde Claude Code la lee para este proyecto
    const memDir = path.join(require("os").homedir(), ".claude", "projects", R.replace(/[^a-zA-Z0-9]/g, "-"), "memory");
    for (const [rel, h] of Object.entries(man.archivos)) {
      const dst = rel.startsWith("_memoria/") ? path.join(memDir, rel.slice(9)) : path.join(R, rel);
      let actual = null;
      try { actual = sha(fs.readFileSync(dst)); } catch (e) {}
      if (actual === h) continue;
      // cambiado aquí (o primera vez, sin saber de dónde viene): copia de seguridad antes de sustituirlo
      if (actual && (!est.archivos[rel] || actual !== est.archivos[rel])) {
        const bk = path.join(R, "_kit_local", sello, rel);
        fs.mkdirSync(path.dirname(bk), { recursive: true });
        fs.copyFileSync(dst, bk);
        guardados++;
      }
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.writeFileSync(dst, fs.readFileSync(path.join(src, rel)));
      puestos++;
    }
    escribirJson(estF, { fecha: man.fecha, archivos: man.archivos, aplicado: new Date().toISOString(), puestos, guardados });
    if (puestos) { try { fs.unlinkSync(path.join(estudioDir(), "_base", "kit_instalada.json")); } catch (x) {} }   // (v3.41.7) que vuelva a bajar el kit vivo
    return { ok: true, puestos, guardados };
  } catch (e) { return { ok: false, error: e.message }; }
}
app.whenReady().then(() => setTimeout(() => { const r = sincronizarKit(); if (r.puestos) console.log("kit actualizado:", r); rescatarKit(); }, 8000));
/* v3.45.3: recupera los módulos del kit que usan las historias de este equipo y faltan (ver rescatekit.cjs). El resultado
 * sale en «Equipos» (capacidad.rescateKit). v3.45.4: también en el portátil (solo pone lo que falta). */
let rescateKit = null;
function rescatarKit() {
  try {
    if (!existe(path.join(raiz(), "kit"))) return null;
    const r = require("./rescatekit.cjs").rescatar(raiz());
    if (r.restaurados.length || r.faltan.length) { rescateKit = r; escribirJson(path.join(estudioDir(), "_rescate_kit.json"), r); console.log("rescate del kit:", r); }
    else if (rescateKit && (rescateKit.faltan || []).length) rescateKit = null;      // (ya no falta nada: que «Equipos» deje de avisar)
    return r;
  } catch (e) { rescateKit = { fecha: new Date().toISOString(), error: e.message, restaurados: [], faltan: [] }; return null; }
}
ipcMain.handle("kit-sincronizar", async () => sincronizarKit());

/* v3.45.4 KIT PROPIO: los módulos del kit que Claude crea en un equipo para una escena (kit/pasos.py, kit/escuela.py…) se
 * quedaban solo en ese equipo, y la historia no podía rodarse en el otro (la 11 en el portátil). Ahora cada equipo que no
 * es el portátil sube a Drive los suyos (los que no vienen del kit del portátil) y los demás equipos bajan los que les
 * faltan, sin pisar nunca uno que ya tengan. En el portátil pasan a ser parte del kit, y con el kit vivo llegan a todos. */
function kitPropioNombres() {
  if (esOrigen()) return [];
  const man = leerJson(path.join(__dirname, "..", "proyecto", "manifiesto.json"), {}) || {};
  const lista = kitLista(), delPortatil = new Set([...Object.keys(man.archivos || {}), ...Object.keys(lista)]);
  let ns = []; try { ns = fs.readdirSync(path.join(raiz(), "kit")); } catch (e) { return []; }
  // (v3.45.7) propio = creado aquí, o del kit vivo pero cambiado aquí desde que se instaló (un arreglo de Claude)
  return ns.filter(n => /^\w+\.py$/.test(n) && !n.startsWith("_") && (!delPortatil.has("kit/" + n)
    || (lista["kit/" + n] && shaArchivo(path.join(raiz(), "kit", n)) !== lista["kit/" + n]))).sort();
}
function kitPropioHuella(ns) {
  const h = require("crypto").createHash("sha1");
  for (const n of ns) { h.update(n + "|"); h.update(fs.readFileSync(path.join(raiz(), "kit", n))); }
  return h.digest("hex").slice(0, 16);
}
ipcMain.handle("kit-propio-subir", async (e, token, anterior) => {
  try {
    const ns = kitPropioNombres();
    if (!ns.length) return { ok: true, nada: true };
    const huella = kitPropioHuella(ns);
    if (anterior && anterior.huella === huella && anterior.archivo) return { ok: true, ...anterior };
    fs.mkdirSync(baseDir(), { recursive: true });
    const f = path.join(baseDir(), "kit_propio.tgz");
    const r = await tar(["-czf", f, "-C", raiz(), ...ns.map(n => "kit/" + n)]);
    if (!r.ok) return r;
    const up = await drive.subir(token, f, ["RandomStudio", "RandomHistorias", "_Base"]);
    try { fs.unlinkSync(f); } catch (x) {}
    return { ok: true, archivo: up.id, md5: up.md5, tam: up.tam, huella, nombres: ns, fecha: new Date().toISOString() };
  } catch (x) { return { ok: false, error: x.message }; }
});
ipcMain.handle("kit-propio-recibir", async (e, token, info) => {
  if (!info || !info.archivo || !Array.isArray(info.nombres)) return { ok: false, error: "Sin paquete" };
  const recF = path.join(baseDir(), "kit_propio_recibido.json"), recibidos = leerJson(recF, {}) || {};
  const faltan = info.nombres.filter(n => /^\w+\.py$/.test(n));
  if (!faltan.length) return { ok: true, puestos: [] };
  const tmp = path.join(baseDir(), "kit_propio_recibido");
  try {
    fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
    const f = path.join(tmp, "kit_propio.tgz");
    await drive.bajar(token, String(info.archivo), f, info.md5 || null);
    const r = await tar(["-xzf", f, "-C", tmp]);
    if (!r.ok) return r;
    const puestos = [];
    for (const n of faltan) {
      const de = path.join(tmp, "kit", n), a = path.join(raiz(), "kit", n);
      if (!existe(de)) continue;
      const nuevo = shaArchivo(de), local = existe(a) ? shaArchivo(a) : null;
      // falta aquí, o es la versión que mandó antes el otro equipo y aquí nadie la ha tocado: se pone la nueva
      if (!local || (local !== nuevo && recibidos["kit/" + n] === local)) { fs.copyFileSync(de, a); puestos.push(n); }
      if (!local || local === nuevo || recibidos["kit/" + n] === local) recibidos["kit/" + n] = nuevo;
    }
    escribirJson(recF, recibidos);
    if (puestos.length) rescatarKit();
    return { ok: true, puestos };
  } catch (x) { return { ok: false, error: x.message }; }
  finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (x) {} }
});

/* v3.38.1: borrar una historia del estudio. Va a la PAPELERA de este equipo (se puede recuperar), nunca se borra del todo.
 * Solo las hechas con el estudio (las 01-08 hechas a mano no se pueden borrar desde aquí) y nunca la que está trabajando.
 * El Short ya entregado (.historiaslistas) no se toca; la idea vuelve a «por mirar». */
ipcMain.handle("estudio-borrar", async (e, id) => {
  if (!/^\d{2}_[\w-]+$/.test(String(id || ""))) return { ok: false, error: "Historia no válida" };
  const c = carpetaDe(id), est = estudioDe(c);
  if (!est.creado) return { ok: false, error: "Esta historia se hizo a mano: no se borra desde el estudio" };
  if (tarea && tarea.id === id) return { ok: false, error: "Está trabajando: párala primero" };
  { const i = cola.indexOf(id); if (i >= 0) cola.splice(i, 1); }
  try { await shell.trashItem(c); } catch (x) { return { ok: false, error: "No se pudo mover a la papelera: " + x.message }; }
  try {
    const ideas = leerIdeas(), idea = ideas.find(x => x.historia === id);
    if (idea) { idea.estado = "nueva"; delete idea.historia; escribirJson(ideasArchivo(), ideas); }
  } catch (x) {}
  return { ok: true };
});

/* v3.38.1: renumerar una historia (cuando se borra otra, las de detrás se corren para que no queden huecos).
 * Nunca la que está trabajando (se hace al acabar). Cambia la carpeta, su vídeo historiaNN_final, el guion de guiones/
 * y la referencia de la idea. */
ipcMain.handle("estudio-renumerar", async (e, de, a) => {
  const ok = (x) => /^\d{2}_[\w-]+$/.test(String(x || ""));
  if (!ok(de) || !ok(a) || de.slice(2) !== a.slice(2)) return { ok: false, error: "Números no válidos" };
  if (tarea && tarea.id === de) return { ok: false, espera: true, error: "Está trabajando: se renumera al acabar" };
  const c = path.join(histDir(), de), nueva = path.join(histDir(), a);
  if (!existe(c)) return { ok: false, error: "No existe " + de };
  if (existe(nueva)) return { ok: false, espera: true, error: "Ya hay una carpeta " + a + " (se reintenta luego)" };
  if (!estudioDe(c).creado) return { ok: false, error: "Las hechas a mano no se renumeran" };
  const viejo = de.slice(0, 2), nn = a.slice(0, 2);
  fs.renameSync(c, nueva);
  for (const f of fs.readdirSync(nueva).filter(n => n.startsWith("historia" + viejo + "_final"))) {
    try { fs.renameSync(path.join(nueva, f), path.join(nueva, "historia" + nn + f.slice(("historia" + viejo).length))); } catch (x) {}
  }
  try {
    const g = path.join(raiz(), "guiones");
    for (const f of fs.readdirSync(g).filter(n => n.startsWith("historia-" + viejo + "-")))
      fs.renameSync(path.join(g, f), path.join(g, "historia-" + nn + "-" + f.slice(("historia-" + viejo + "-").length)));
  } catch (x) {}
  try { const ideas = leerIdeas(), i = ideas.find(x => x.historia === de); if (i) { i.historia = a; escribirJson(ideasArchivo(), ideas); } } catch (x) {}
  { const i = cola.indexOf(de); if (i >= 0) cola[i] = a; }
  return { ok: true };
});

module.exports = { etapasDe };

