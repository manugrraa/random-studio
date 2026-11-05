/* (5-11-2026, Manu) RECOPILACIONES: vídeos largos de 12 historias (ver tools/estudio/recopilacion.md).
 *
 * Cada recopilación vive en <entregas>\.Recopilaciones\NN\: las carpetas de sus historias (se MUEVEN ahí al hacer el
 * grupo, con su vídeo y su miniatura), _INTRO Y OUTRO\, .Recopilación NN\ (el vídeo entero, su miniatura y los
 * capítulos) y recopilacion.json (el estado). Pasos: grupo → ideas de intro y outro → elegir una → intro y outro
 * (Claude + Roblox Studio, por turnos con las historias) → miniatura → montaje (sin CapCut, tools/recopilacion/montar.py).
 */
const { ipcMain, nativeImage } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const claude = require("./claude.cjs");
const registro = require("./registro.cjs");

const carpetas = () => require("./carpetas.cjs").carpetasHistorias();
const raiz = () => process.env.RANDOMHISTORIAS_DIR || carpetas().historias;
const entregas = () => carpetas().entregas;
const recDir = () => path.join(entregas(), ".Recopilaciones");
const histDir = () => path.join(raiz(), "historias");
const POR_GRUPO = 12;
const MIN_SEG = 20 * 60;

const existe = (p) => { try { return fs.existsSync(p); } catch (e) { return false; } };
const leerJson = (p, d) => { try { return JSON.parse(fs.readFileSync(p, "utf-8").replace(/^﻿/, "")); } catch (e) { return d; } };
const escribirJson = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(v, null, 1), "utf-8"); };
const tituloArchivo = (t) => String(t || "").trim().replace(/!+$/, "!");
const nnValido = (nn) => { if (!/^\d{2}$/.test(String(nn))) throw new Error("recopilación no válida"); return String(nn); };
const carpetaRec = (nn) => path.join(recDir(), nnValido(nn));
const jsonRec = (nn) => path.join(carpetaRec(nn), "recopilacion.json");
const nombreSeguro = (t) => { const n = path.basename(String(t || "")); if (!n || n.startsWith(".") || n.startsWith("_")) throw new Error("historia no válida"); return n; };

function miniUrl(p, ancho) {
  try { const im = nativeImage.createFromPath(p); return im.isEmpty() ? null : im.resize({ width: ancho, quality: "good" }).toDataURL(); } catch (e) { return null; }
}
const urlArchivo = (f) => require("./historias.cjs").urlArchivo(f);

// duración de cada Short (ffprobe una vez; se guarda en .Recopilaciones\_duraciones.json)
function duraciones() { return leerJson(path.join(recDir(), "_duraciones.json"), {}); }
function duracion(f) {
  const d = duraciones(), k = f + "|" + (() => { try { return fs.statSync(f).size; } catch (e) { return 0; } })();
  if (d[k]) return d[k];
  const r = require("child_process").spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { encoding: "utf-8", windowsHide: true, timeout: 20000 });
  const v = parseFloat(r.stdout) || 0;
  if (v) { d[k] = v; try { escribirJson(path.join(recDir(), "_duraciones.json"), d); } catch (e) {} }
  return v;
}

// el orden de creación: el número de la historia (historias\NN_x\titulo.txt); si no está en este equipo, la fecha del vídeo
function ordenes() {
  const o = {};
  try {
    for (const id of fs.readdirSync(histDir())) {
      if (!/^\d{2}_/.test(id)) continue;
      let t = ""; try { t = fs.readFileSync(path.join(histDir(), id, "titulo.txt"), "utf-8").trim(); } catch (e) {}
      if (t) o[tituloArchivo(t)] = { n: parseInt(id, 10), id };
    }
  } catch (e) {}
  return o;
}

function fichaHistoria(dir, ord) {
  const t = path.basename(dir), mp4 = path.join(dir, t + ".mp4"), png = path.join(dir, t + " - miniatura.png");
  if (!existe(mp4)) return null;
  const o = ord[t] || {};
  let fecha = 0; try { fecha = fs.statSync(mp4).mtimeMs; } catch (e) {}
  return { titulo: t, numero: o.n || null, id: o.id || null, fecha, duracion: duracion(mp4), miniatura: existe(png) ? miniUrl(png, 160) : null };
}

// las entregadas que no están en ninguna recopilación, por orden de creación
function disponibles() {
  const ord = ordenes(), out = [];
  let ls = []; try { ls = fs.readdirSync(entregas()); } catch (e) {}
  for (const n of ls) {
    if (n.startsWith(".") || n.startsWith("_")) continue;
    const f = fichaHistoria(path.join(entregas(), n), ord);
    if (f) out.push(f);
  }
  return enOrden(out);
}
// las de este equipo van por su número; las que hizo otro equipo (sin carpeta aquí) se meten por la fecha de su vídeo
function enOrden(hs) {
  const con = hs.filter(h => h.numero).sort((a, b) => a.numero - b.numero || a.fecha - b.fecha);
  for (const h of hs.filter(h => !h.numero).sort((a, b) => a.fecha - b.fecha)) {
    let i = con.findIndex(x => x.numero && x.fecha > h.fecha);
    if (i < 0) i = con.length;
    con.splice(i, 0, h);
  }
  return con;
}

// lo que hay en una recopilación (si no tiene recopilacion.json, se detecta por sus carpetas: así salió la 01)
function leerRec(nn) {
  const c = carpetaRec(nn), ord = ordenes();
  let r = leerJson(jsonRec(nn), null);
  if (!r) {
    const hs = fs.readdirSync(c).filter(n => !n.startsWith(".") && !n.startsWith("_") && existe(path.join(c, n, n + ".mp4")));
    r = { numero: nn, detectada: true, historias: hs.map(t => ({ titulo: t })).sort((a, b) => ((ord[a.titulo] || {}).n || 999) - ((ord[b.titulo] || {}).n || 999)) };
  }
  const nombre = "Recopilación " + nn, fin = path.join(c, "." + nombre);
  const intro = path.join(c, "_INTRO Y OUTRO", "INTRO - " + nombre + ".mp4"), outro = path.join(c, "_INTRO Y OUTRO", "OUTRO - " + nombre + ".mp4");
  const video = path.join(fin, nombre + ".mp4"), mini = path.join(fin, nombre + " - miniatura.png");
  const hist = (r.historias || []).map(h => fichaHistoria(path.join(c, h.titulo), ord) || { titulo: h.titulo, falta: true });
  const total = hist.reduce((s, h) => s + (h.duracion || 0), 0);
  const leer = (f) => { try { return fs.readFileSync(f, "utf-8"); } catch (e) { return null; } };
  const hecho = { grupo: hist.length > 0, idea: !!r.idea || existe(intro), introoutro: existe(intro) && existe(outro), miniatura: existe(mini), montaje: existe(video) };
  return {
    ...r, numero: nn, carpeta: c, historias: hist, total, hecho,
    estado: r.estado === "publicada" ? "publicada" : hecho.montaje ? "montada" : hecho.introoutro ? "intro y outro" : hecho.idea ? "idea elegida" : (r.ideas || []).length ? "ideas" : "grupo",
    intro: existe(intro) ? urlArchivo(intro) : null, outro: existe(outro) ? urlArchivo(outro) : null,
    video: existe(video) ? urlArchivo(video) : null, miniatura: existe(mini) ? miniUrl(mini, 480) : null,
    capitulos: leer(path.join(fin, "capitulos.txt")), textos: leer(path.join(fin, "subida.txt")),
    tarea: tareas.get(nn) ? { etapa: tareas.get(nn).etapa, accion: tareas.get(nn).accion, inicio: tareas.get(nn).inicio } : null,
  };
}

// las carpetas NN con algo dentro (una vacía, p. ej. la 02 creada a mano antes de tiempo, no cuenta)
const usadas = () => { try { return fs.readdirSync(recDir()).filter(n => /^\d{2}$/.test(n) && fs.readdirSync(path.join(recDir(), n)).length > 0).sort(); } catch (e) { return []; } };
function lista() {
  if (!existe(recDir())) return [];
  return usadas().map(nn => { try { return leerRec(nn); } catch (e) { return { numero: nn, error: e.message }; } });
}

// mover carpetas de historias: dentro de la recopilación (al hacer el grupo) o de vuelta a las entregas (al quitarlas)
function mover(t, de, a) {
  const n = nombreSeguro(t), o = path.join(de, n), d = path.join(a, n);
  if (!existe(o)) throw new Error("No encuentro la carpeta de «" + n + "»");
  if (existe(d)) throw new Error("Ya hay una carpeta «" + n + "» en el destino");
  fs.renameSync(o, d);
}

function guardarGrupo(nn, titulos) {
  const c = carpetaRec(nn), r = leerJson(jsonRec(nn), { numero: nn }), antes = (r.historias || []).map(h => h.titulo);
  if (existe(path.join(c, ".Recopilación " + nn, "Recopilación " + nn + ".mp4")) || r.estado === "publicada")
    throw new Error("Esta recopilación ya está montada: el grupo no se cambia");
  const nuevos = titulos.map(nombreSeguro);
  for (const t of antes.filter(t => !nuevos.includes(t))) if (existe(path.join(c, t))) mover(t, c, entregas());
  for (const t of nuevos.filter(t => !antes.includes(t) || !existe(path.join(c, t)))) if (!existe(path.join(c, t))) mover(t, entregas(), c);
  r.historias = nuevos.map(t => ({ titulo: t }));
  r.intro = r.intro || "_INTRO Y OUTRO/INTRO - Recopilación " + nn + ".mp4";
  r.outro = r.outro || "_INTRO Y OUTRO/OUTRO - Recopilación " + nn + ".mp4";
  escribirJson(jsonRec(nn), r);
  registro.anotar("recopilaciones", "grupo de la " + nn + ": " + nuevos.length + " historias", { titulos: nuevos });
}

// ------------------------------------------------------------------ Claude: ideas e intro/outro
const instrucciones = (n) => { try { return fs.readFileSync(path.join(raiz(), "tools", "estudio", n + ".md"), "utf-8"); } catch (e) { return ""; } };
const guia = () => { try { return fs.readFileSync(path.join(raiz(), "guiones", "recopilaciones.md"), "utf-8"); } catch (e) { return ""; } };
function datosPara(r) {
  return `Recopilación ${r.numero}: ${r.historias.length} historias (${Math.round(r.total / 60)} min), en este orden:\n`
    + r.historias.map((h, i) => `${String(i + 1).padStart(2, "0")}. ${h.titulo}${h.id ? " (historias/" + h.id + ")" : ""}`).join("\n");
}
function extraerLista(txt) {
  const s = String(txt);
  for (let i = s.indexOf("["); i >= 0; i = s.indexOf("[", i + 1))
    for (let k = s.lastIndexOf("]"); k > i; k = s.lastIndexOf("]", k - 1)) { try { const v = JSON.parse(s.slice(i, k + 1)); if (Array.isArray(v) && v.length) return v; } catch (e) {} }
  throw new Error("Claude no devolvió las ideas en el formato esperado");
}
const pensando = new Set();
async function pedirIdeas(nn, pista, sender) {
  if (pensando.has(nn)) throw new Error("Ya está pensando ideas para esta recopilación");
  const r = leerRec(nn);
  const prompt = instrucciones("reglas") + "\n\n---\n\n" + guia() + "\n\n---\n\n" + datosPara(r)
    + `\n\nPropón 4 ideas DISTINTAS para la intro y el outro de esta recopilación, siguiendo las decisiones de Manu de la guía
(en el papel de Random, la maleta como hilo, intro de 8-15 s SIN preguntas al espectador y diciendo qué recopilación es;
outro sencillo: «hasta aquí estas N historias», suscríbete y comenta a qué pueblo me mudo, + 20 s de pantalla final; un sitio
nuevo que no se haya usado; luz acogedora). Lee los guiones de las historias si te ayuda a elegir los destellos.
Responde SOLO con un array JSON: [{"titulo": "nombre corto de la idea", "sitio": "dónde y con qué luz",
"intro": "texto exacto de la voz", "outro": "texto exacto de la voz", "destellos": ["título de historia", "título"],
"planos": "los planos en una o dos frases", "porque": "por qué engancha"}]` + (pista ? `\n\nPista de Manu: ${String(pista).slice(0, 500)}` : "");
  pensando.add(nn);
  claude.generar(prompt, { cwd: raiz(), herramientas: "lectura", segundos: 900 })
    .then(txt => {
      const ideas = extraerLista(txt).slice(0, 6).map((x, i) => ({ ...x, id: "r" + Date.now().toString(36) + i, fecha: new Date().toISOString() }));
      const j = leerJson(jsonRec(nn), { numero: nn });
      j.ideas = [...ideas, ...(j.ideas || [])];
      escribirJson(jsonRec(nn), j);
      registro.anotar("recopilaciones", ideas.length + " ideas de intro y outro para la " + nn);
      try { sender.send("recop-progreso", { nn, tipo: "ideas", ok: true }); } catch (e) {}
    })
    .catch(err => { try { sender.send("recop-progreso", { nn, tipo: "ideas", ok: false, error: err.message }); } catch (e) {} })
    .finally(() => pensando.delete(nn));
}

const tareas = new Map();   // nn → tarea en marcha (una por recopilación)
function promptIntroOutro(r) {
  const idea = r.idea || {};
  return instrucciones("reglas") + "\n\n---\n\n" + instrucciones("recopilacion") + "\n\n---\n\n" + datosPara(r)
    + `\n\nIDEA ELEGIDA POR MANU (síguela; puedes pulir el texto para que suene natural, sin cambiar la idea):\n${JSON.stringify(idea, null, 1)}

TU TRABAJO: los pasos 1 a 5 de la guía para esta recopilación, con recopilaciones/01/ como plantilla, en
recopilaciones/${r.numero}/. La voz del narrador con fish.audio: la clave ya está en FISH_API_KEY
(\`from tools.voz_fish import tts\`). Rueda en horizontal (Roblox Studio ya está reservado para ti), revisa las fotos de
TODOS los planos y monta. Al terminar deja EXACTAMENTE estos dos archivos (1920x1080):
  ${path.join(r.carpeta, "_INTRO Y OUTRO", "INTRO - Recopilación " + r.numero + ".mp4")}
  ${path.join(r.carpeta, "_INTRO Y OUTRO", "OUTRO - Recopilación " + r.numero + ".mp4")}
No toques las carpetas de las historias ni el vídeo entero (lo monta la app después). Termina con un resumen corto; si no
puedes acabarlo, empieza tu respuesta con «ERROR:» y explica qué falta.`;
}

function lanzarIntroOutro(nn, sender) {
  if (tareas.get(nn)) throw new Error("Ya hay algo en marcha en esta recopilación");
  const r = leerRec(nn);
  if (!r.idea) throw new Error("Primero elige una idea");
  const h = require("./historias.cjs");
  const exe = claude.exeClaude();
  if (!exe) throw new Error("No encuentro Claude Code en este equipo");
  const t = h.reservarStudio({ id: "R" + nn, etapa: "recopilacion", accion: "Pensando…", sender });
  if (!t) throw new Error("Roblox Studio está ocupado con una historia: prueba cuando termine");
  const args = ["-p", "--model", claude.MODELO, "--output-format", "stream-json", "--verbose", "--permission-mode", "acceptEdits",
    "--allowedTools", "Bash", "Read", "Write", "Edit", "MultiEdit", "Glob", "Grep", "TodoWrite"];
  if (!claude.rutaBash()) { args.splice(args.indexOf("Read"), 0, "PowerShell"); args.push("--append-system-prompt", claude.GUIA_POWERSHELL); }
  const fish = h.claveFish();
  const env = claude.entornoClaude({ PYTHONIOENCODING: "utf-8", RH_ENTREGAS: entregas(), ...(fish ? { FISH_API_KEY: fish } : {}) });
  const proc = spawn(exe, args, { cwd: raiz(), env, windowsHide: true });
  t.proc = proc;
  const yo = { etapa: "introoutro", inicio: Date.now(), accion: "Pensando…", t };
  tareas.set(nn, yo);
  registro.anotar("recopilaciones", "empieza la intro y el outro de la " + nn + " (Claude + Roblox Studio)");
  const avisar = (d) => { try { sender.send("recop-progreso", { nn, ...d }); } catch (e) {} };
  let resto = "", final = "", fallo = false;
  const linea = (l) => {
    t.actividad = Date.now();
    let j; try { j = JSON.parse(l); } catch (e) { return; }
    if (j.type === "assistant" && j.message && Array.isArray(j.message.content)) {
      for (const c of j.message.content) if (c.type === "tool_use") {
        const a = c.name + (c.input && (c.input.description || c.input.file_path || c.input.pattern) ? ": " + String(c.input.description || c.input.file_path || c.input.pattern).slice(0, 90) : "");
        yo.accion = t.accion = a; t.acciones.push({ t: Date.now(), a }); if (t.acciones.length > 200) t.acciones.shift();
        avisar({ tipo: "accion", accion: a }); h.emitir({ tipo: "agente", accion: a }, t);
      }
    } else if (j.type === "result") { final = String(j.result || ""); fallo = !!j.is_error; }
  };
  proc.stdout.on("data", (b) => { resto += b.toString("utf-8"); const ps = resto.split(/\r?\n/); resto = ps.pop(); ps.forEach(p => p.trim() && linea(p)); });
  let err = ""; proc.stderr.on("data", d => err += d);
  proc.on("close", (code) => {
    if (resto.trim()) linea(resto.trim());
    const r2 = leerRec(nn), ok = code === 0 && !fallo && !/^\s*\**ERROR:/.test(final) && r2.hecho.introoutro;
    tareas.delete(nn);
    const j = leerJson(jsonRec(nn), { numero: nn });
    j.informes = { ...(j.informes || {}), introoutro: { fecha: new Date().toISOString(), ok, texto: (final || err).slice(0, 4000) } };
    escribirJson(jsonRec(nn), j);
    registro.anotar("recopilaciones", (ok ? "termina" : t.cancelada ? "cancelada" : "FALLA") + " la intro y el outro de la " + nn, { respuesta: (final || err).slice(-400) });
    h.emitir({ tipo: "fin", ok, etapa: "recopilacion", informe: (final || err).slice(0, 1500), cancelada: !!t.cancelada }, t);
    h.liberarStudio(t, sender);
    avisar({ tipo: "fin", etapa: "introoutro", ok, informe: (final || err).slice(0, 1500) });
  });
  proc.stdin.end(promptIntroOutro(r));
  return { ok: true };
}

// ------------------------------------------------------------------ pasos con Python (miniatura y montaje)
function python(nn, etapa, args, sender, alAcabar) {
  if (tareas.get(nn)) throw new Error("Ya hay algo en marcha en esta recopilación");
  const yo = { etapa, inicio: Date.now(), accion: "Empezando…" };
  tareas.set(nn, yo);
  const p = spawn("python", args, { cwd: raiz(), env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUNBUFFERED: "1" }, windowsHide: true });
  yo.proc = p;
  let out = "";
  const trozo = (b) => { out += b; const ls = String(b).split(/\r?\n/).filter(Boolean); if (ls.length) { yo.accion = ls[ls.length - 1].slice(0, 160); try { sender.send("recop-progreso", { nn, tipo: "accion", accion: yo.accion }); } catch (e) {} } };
  p.stdout.on("data", trozo); p.stderr.on("data", trozo);
  p.on("close", (code) => {
    tareas.delete(nn);
    const ok = code === 0;
    registro.anotar("recopilaciones", (ok ? "termina " : "FALLA ") + etapa + " de la " + nn, ok ? {} : { salida: out.slice(-600) });
    try { if (ok && alAcabar) alAcabar(); } catch (e) {}
    try { sender.send("recop-progreso", { nn, tipo: "fin", etapa, ok, informe: ok ? "" : out.split("\n").filter(Boolean).slice(-6).join("\n") }); } catch (e) {}
  });
  return { ok: true };
}

// el vídeo de donde salen los fotogramas de la miniatura: el Short SIN subtítulos si lo hay (entregado o en su historia)
function videoLimpio(nn, t) {
  const c = carpetaRec(nn), n = nombreSeguro(t);
  const entregado = path.join(c, n, n + "_sin_subs.mp4");
  if (existe(entregado)) return { f: entregado, limpio: true };
  const o = ordenes()[n];
  if (o) { const s = path.join(histDir(), o.id, `historia${o.id.slice(0, 2)}_final_sin_subs.mp4`); if (existe(s)) return { f: s, limpio: true }; }
  return { f: path.join(c, n, n + ".mp4"), limpio: false };
}

function textosSubida(nn) {
  const r = leerRec(nn), fin = path.join(r.carpeta, ".Recopilación " + nn);
  const caps = r.capitulos || "";
  const titulo = `${r.historias.length} PUEBLOS CON REGLAS IMPOSIBLES (Recopilación ${nn})`;
  const desc = `${r.historias.length} historias seguidas de los pueblos más raros a los que me he mudado.\n\n${caps.trim()}\n\n¿A qué pueblo me mudo ahora? Déjamelo en los comentarios.`;
  const txt = `TÍTULO (propuesta, cámbialo si quieres)\n${titulo}\n\nDESCRIPCIÓN\n${desc}\n\nAJUSTES\n- Audiencia: no es para niños. Categoría: Videojuegos. Idioma: Español.\n- Miniatura: «Recopilación ${nn} - miniatura.png».\n- Pantalla final: los 20 s del outro (suscribirse + un vídeo).\n`;
  fs.mkdirSync(fin, { recursive: true });
  fs.writeFileSync(path.join(fin, "subida.txt"), txt, "utf-8");
}

// ------------------------------------------------------------------ IPC
ipcMain.handle("recop-lista", async () => {
  try { return { ok: true, recopilaciones: lista(), disponibles: disponibles(), porGrupo: POR_GRUPO, minSeg: MIN_SEG, carpeta: recDir() }; }
  catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle("recop-crear", async (e, titulos) => {
  try {
    if (!Array.isArray(titulos) || !titulos.length) throw new Error("Elige las historias");
    fs.mkdirSync(recDir(), { recursive: true });
    const hechas = usadas().map(Number);
    const nn = String((hechas.length ? Math.max(...hechas) : 0) + 1).padStart(2, "0");
    fs.mkdirSync(carpetaRec(nn), { recursive: true });
    escribirJson(jsonRec(nn), { numero: nn, creada: new Date().toISOString() });
    guardarGrupo(nn, titulos);
    return { ok: true, numero: nn };
  } catch (x) { return { ok: false, error: x.message }; }
});
ipcMain.handle("recop-grupo", async (e, nn, titulos) => { try { guardarGrupo(nn, titulos || []); return { ok: true }; } catch (x) { return { ok: false, error: x.message }; } });
ipcMain.handle("recop-deshacer", async (e, nn) => {
  try {
    guardarGrupo(nn, []);
    const c = carpetaRec(nn);
    if (fs.readdirSync(c).every(n => n === "recopilacion.json")) fs.rmSync(c, { recursive: true, force: true });
    return { ok: true };
  } catch (x) { return { ok: false, error: x.message }; }
});
ipcMain.handle("recop-ideas", async (e, nn, pista) => { try { await pedirIdeas(nnValido(nn), pista, e.sender); return { ok: true }; } catch (x) { return { ok: false, error: x.message }; } });
ipcMain.handle("recop-elegir", async (e, nn, ideaId) => {
  try {
    const j = leerJson(jsonRec(nn), null); if (!j) throw new Error("sin recopilación");
    const idea = (j.ideas || []).find(x => x.id === ideaId); if (!idea) throw new Error("idea no encontrada");
    j.idea = idea; escribirJson(jsonRec(nn), j);
    return { ok: true };
  } catch (x) { return { ok: false, error: x.message }; }
});
ipcMain.handle("recop-introoutro", async (e, nn) => { try { return lanzarIntroOutro(nnValido(nn), e.sender); } catch (x) { return { ok: false, error: x.message }; } });
ipcMain.handle("recop-video-limpio", async (e, nn, t) => { try { const v = videoLimpio(nnValido(nn), t); return { ok: true, video: urlArchivo(v.f), limpio: v.limpio }; } catch (x) { return { ok: false, error: x.message }; } });
// paneles: [{titulo, t (s), cx, cy, zoom}] ×4; título: [[texto, color], ...]
ipcMain.handle("recop-miniatura", async (e, nn, paneles, titulo) => {
  try {
    nnValido(nn);
    if (!Array.isArray(paneles) || paneles.length !== 4) throw new Error("Elige 4 historias");
    const c = carpetaRec(nn), nombre = "Recopilación " + nn, fin = path.join(c, "." + nombre);
    fs.mkdirSync(fin, { recursive: true });
    const cfg = {
      salida: path.join(fin, nombre + " - miniatura.png"),
      paneles: paneles.map(p => ({ video: videoLimpio(nn, p.titulo).f, segundo: Math.max(0, Number(p.t) || 0), cx: Number(p.cx) || 540, cy: Number(p.cy) || 1000, zoom: Number(p.zoom) || 1 })),
      titulo: Array.isArray(titulo) && titulo.length ? titulo : [["EN ESTE ", "blanco"], ["PUEBLO", "rojo"], ["...", "blanco"]],
    };
    const f = path.join(fin, "miniatura.json");
    escribirJson(f, cfg);
    return python(nn, "miniatura", [path.join(raiz(), "tools", "recopilacion", "miniatura.py"), "hacer", f], e.sender);
  } catch (x) { return { ok: false, error: x.message }; }
});
ipcMain.handle("recop-montar", async (e, nn) => {
  try {
    const r = leerRec(nnValido(nn));
    if (!r.hecho.introoutro) throw new Error("Faltan la intro y el outro");
    if (r.historias.some(h => h.falta)) throw new Error("Falta alguna historia en la carpeta de la recopilación");
    const j = leerJson(jsonRec(nn), { numero: nn });
    j.numero = nn; j.historias = r.historias.map(h => ({ titulo: h.titulo }));
    j.intro = j.intro || "_INTRO Y OUTRO/INTRO - Recopilación " + nn + ".mp4"; j.outro = j.outro || "_INTRO Y OUTRO/OUTRO - Recopilación " + nn + ".mp4";
    escribirJson(jsonRec(nn), j);
    return python(nn, "montaje", [path.join(raiz(), "tools", "recopilacion", "montar.py"), jsonRec(nn)], e.sender, () => textosSubida(nn));
  } catch (x) { return { ok: false, error: x.message }; }
});
ipcMain.handle("recop-publicada", async (e, nn, v) => {
  try { const j = leerJson(jsonRec(nn), { numero: nn }); j.estado = v ? "publicada" : undefined; if (v) j.publicada = new Date().toISOString(); escribirJson(jsonRec(nn), j); return { ok: true }; }
  catch (x) { return { ok: false, error: x.message }; }
});
ipcMain.handle("recop-parar", async (e, nn) => {
  const t = tareas.get(nnValido(nn));
  if (!t) return { ok: true };
  if (t.t) t.t.cancelada = true;
  const p = t.proc || (t.t && t.t.proc);
  if (p) { try { spawn("taskkill", ["/PID", String(p.pid), "/T", "/F"], { windowsHide: true }); } catch (x) {} }
  return { ok: true };
});
ipcMain.handle("recop-abrir", async (e, nn) => {
  const { shell } = require("electron");
  const err = await shell.openPath(carpetaRec(nnValido(nn)));
  return { ok: !err, error: err || null };
});

module.exports = { lista, disponibles };
