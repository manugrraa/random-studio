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
const carpetas = () => require("./carpetas.cjs").carpetasDe();
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
    id, titulo: t, carpeta: c, pasos: PASOS.map(p => ({ paso: p, hecho: !!estado[p], fin: estado[p] && estado[p].fin, s: estado[p] && estado[p].s })),
    hechos: hechos.length, entregada: existe(path.join(entrega, tituloArchivo(t) + ".mp4")), carpetaEntrega: entrega,
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
    emitir({ tipo: "fin", ok: code === 0, codigo: code, etapa: t && t.etapa });
    tarea = null;
    if (t && t.alTerminar) setTimeout(() => t.alTerminar(code === 0, t.sender), 200);
    setTimeout(() => sacarDeCola(t && t.sender), 1500);
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
ipcMain.handle("historias-lista", async () => {
  if (!existe(histDir())) return { ok: false, error: "No encuentro " + histDir() + " (Ajustes → Carpetas)" };
  const ids = fs.readdirSync(histDir()).filter(n => /^\d{2}_[\w-]+$/.test(n)).sort().reverse();
  return { ok: true, raiz: raiz(), historias: ids.map(id => {
    try {
      const est = estudioDe(carpetaDe(id));
      return { ...resumen(id), etapas: etapasDe(id).map(x => ({ id: x.id, estado: x.estado })), legado: !est.creado,
        drive: est.drive || null, driveRevision: est.driveRevision || {} };
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
  if (!tarea) return { activa: false };
  tarea.sender = e.sender;        // la ventana que pregunta recibe el progreso a partir de ahora
  return { activa: true, id: tarea.id, args: tarea.args, tipo: tarea.tipo, etapa: tarea.etapa, inicio: tarea.inicio, paso: tarea.paso,
    render: tarea.render, accion: tarea.accion, acciones: (tarea.acciones || []).slice(-30), lineas: tarea.lineas.slice(-60) };
});

ipcMain.handle("historias-cancelar", async (e, soloId) => {
  // soloId: cancelar solo si lo que está en marcha es esa historia (lo pide la cola compartida); y sacarla de la cola local
  if (soloId) { const i = cola.indexOf(soloId); if (i >= 0) cola.splice(i, 1); if (!tarea || tarea.id !== soloId) return { ok: true }; }
  if (tarea) tarea.alTerminar = null;            // cancelar también para el avance automático
  if (tarea && tarea.proc) { try { spawn("taskkill", ["/PID", String(tarea.proc.pid), "/T", "/F"], { windowsHide: true }); } catch (x) {} }
  return { ok: true };
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
  try { const b = fs.readFileSync(claveArchivo()); return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(b) : ""; } catch (e) { return ""; }
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
    hecho: c => { const t = titulo(c); return !!t && existe(path.join(listasDir(), tituloArchivo(t), tituloArchivo(t) + ".mp4")); } },
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
  if (nombre === "Bash") {
    const cmd = String((input || {}).command || "");
    if (/rodar\.py.*fotos/.test(cmd)) return "Blender: haciendo las fotos de los planos (Animatic)";
    if (/rodar\.py.*revisar/.test(cmd)) return "Blender: revisando la escena 3D";
    if (/rodar\.py.*final/.test(cmd)) return "Blender: renderizando";
    if (/test_|blender/i.test(cmd)) return "Blender: probando modelos nuevos";
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
    "--allowedTools", "Bash", "Read", "Write", "Edit", "MultiEdit", "Glob", "Grep", "TodoWrite"];
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_AGENT_SDK|ANTHROPIC_BASE_URL)/.test(k)));
  Object.assign(env, { PYTHONIOENCODING: "utf-8", RH_ENTREGAS: listasDir(), ELEVENLABS_API_KEY: claveEleven(), BLENDER: blenderExe() || "" });
  const proc = spawn(exe, args, { cwd: raiz(), env, windowsHide: true });
  tarea = { proc, id, tipo: "agente", etapa, inicio: Date.now(), lineas: [], acciones: [], accion: "Pensando…", sender, alTerminar, nPlanos: 0 };
  let resto = "", final = "", fallo = false;
  const linea = (l) => {
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
    emitir({ tipo: "fin", ok, codigo: code, etapa, informe: (final || err).slice(0, 1500) });
    tarea = null;
    if (t && t.alTerminar) setTimeout(() => t.alTerminar(ok, t.sender), 200);
    setTimeout(() => sacarDeCola(t && t.sender), 1500);
  });
  proc.stdin.end(prompt);
  return { ok: true };
}

function instrucciones(n) { return leer(path.join(raiz(), "tools", "estudio", n + ".md"), ""); }

function promptEtapa(id, etapa, nota) {
  const c = carpetaDe(id), est = estudioDe(c);
  const rel = path.relative(raiz(), c).replace(/\\/g, "/");
  const base = etapa === "animatic" ? "escena" : etapa;   // los cambios del animatic se hacen en la escena
  let p = instrucciones(base) + `\n\n---\nHISTORIA: ${rel} (número ${id.slice(0, 2)}).\n`;
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
  correrEtapa(sender, id, s.etapa.id, null, true);
  return { ok: true, etapa: s.etapa.id };
}

// ------------------------------------------------------------------ ideas
const ideasArchivo = () => path.join(estudioDir(), "ideas.json");
const leerIdeas = () => leerJson(ideasArchivo(), []);
let ideasProc = null;

function extraerJson(txt) {
  const m = String(txt).match(/\[[\s\S]*\]/);
  if (!m) throw new Error("Claude no devolvió ideas en el formato esperado");
  return JSON.parse(m[0]);
}

ipcMain.handle("estudio-ideas", async () => ({ ok: true, ideas: leerIdeas(), generando: !!ideasProc }));

ipcMain.handle("estudio-ideas-generar", async (e, cuantas, pista) => {
  if (ideasProc) return { ok: false, error: "Ya está generando ideas" };
  const n = Math.max(1, Math.min(10, Number(cuantas) || 5));
  const sender = e.sender;
  const prompt = instrucciones("ideas") + `\n\nPropón ${n} ideas.` + (pista ? `\nPista del usuario: ${String(pista).slice(0, 500)}` : "")
    + `\nFecha de hoy: ${new Date().toISOString().slice(0, 10)}.`;
  ideasProc = claude.generar(prompt, { cwd: raiz(), herramientas: "lectura", segundos: 900 })
    .then(txt => {
      const nuevas = extraerJson(txt).map((x, i) => ({ id: "i" + Date.now().toString(36) + i, fecha: new Date().toISOString(), estado: "nueva", ...x }));
      escribirJson(ideasArchivo(), [...nuevas, ...leerIdeas()]);
      try { sender.send("estudio-ideas-listas", { ok: true, n: nuevas.length }); } catch (x) {}
    })
    .catch(err => { try { sender.send("estudio-ideas-listas", { ok: false, error: err.message }); } catch (x) {} })
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
  if (tarea) return { ok: false, error: "Ya hay una tarea en marcha: espera a que termine" };
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
  return { ok: true, ajustes: ajustes(), eleven: !!claveEleven(), claude: !!claude.exeClaude(), blender: !!blenderExe(), proyecto: existe(histDir()) };
});

ipcMain.handle("estudio-clave-eleven", async (e, clave) => {
  const k = String(clave || "").trim();
  if (!k) { try { fs.unlinkSync(claveArchivo()); } catch (x) {} return { ok: true, eleven: false }; }
  if (!safeStorage.isEncryptionAvailable()) throw new Error("Windows no deja cifrar la clave en este equipo");
  fs.writeFileSync(claveArchivo(), safeStorage.encryptString(k));
  return { ok: true, eleven: true };
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
    if (que === "short") est.drive = { fecha: new Date().toISOString(), carpeta: carpetaUrl, archivos: hechos.map(h => ({ nombre: h.nombre, tam: h.tam, ver: h.ver, bajar: h.bajar, verificado: h.verificado })) };
    else est.driveRevision = { ...(est.driveRevision || {}), [que]: { fecha: new Date().toISOString(), ver: hechos[0].ver, bajar: hechos[0].bajar } };
    guardarEstudio(c, est);
    // equipo de paso (el ordenador): con el Short ya en Drive y comprobado, se borra lo pesado de este equipo
    if (que === "short" && ajustes().equipoDePaso && hechos.every(h => h.verificado)) {
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

module.exports = { etapasDe };

