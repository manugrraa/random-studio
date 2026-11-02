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
    emitir({ tipo: "fin", ok: code === 0, codigo: code, etapa: t && t.etapa, cancelada: !!(t && t.cancelada) });
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
  if (!tarea && empaquetando) return { activa: true, id: empaquetando, tipo: "relevo", etapa: "copia de relevo", inicio: Date.now(), accion: "Guardando la copia de relevo", acciones: [], lineas: [] };
  if (!tarea) return { activa: false };
  tarea.sender = e.sender;        // la ventana que pregunta recibe el progreso a partir de ahora
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
  if (nombre === "Bash" || nombre === "PowerShell") {
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
    "--allowedTools", "Bash", "PowerShell", "Read", "Write", "Edit", "MultiEdit", "Glob", "Grep", "TodoWrite"];
  // v3.41: en un equipo sin Git Bash, Claude solo tiene PowerShell; sin estas pautas fallaban muchos comandos (&&, rutas
  // sin comillas...) y los repetía, y por eso el ordenador tardaba tanto. v3.41.3: con Git Bash, PowerShell se quita
  // (Claude lo elegía igual y las instrucciones están escritas para Bash): trabaja exactamente como en el portátil
  if (!claude.rutaBash()) args.push("--append-system-prompt", claude.GUIA_POWERSHELL);
  else { args.splice(args.indexOf("PowerShell"), 1); args.push("--disallowedTools", "PowerShell"); }
  const env = claude.entornoClaude({ PYTHONIOENCODING: "utf-8", RH_ENTREGAS: listasDir(), ELEVENLABS_API_KEY: claveEleven(), BLENDER: blenderExe() || "" });
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
    // v3.40.4: si se paró por el límite de Claude, se dice a qué hora reintentar (la app la retoma sola entonces)
    const limite = ok ? 0 : claude.limiteDe(final + "\n" + err);
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
async function instantanea(sender, id, etapa) {
  try {
    if (!existe(path.join(histDir(), id))) return;
    fs.mkdirSync(relevoDir(), { recursive: true });
    const out = path.join(relevoDir(), id + ".tgz");
    let guion = null; try { guion = fs.readdirSync(path.join(raiz(), "guiones")).find(n => n.startsWith("historia-" + id.slice(0, 2) + "-")); } catch (x) {}
    const fuera = ["__pycache__", "planos_final", "planos_revisar", "_animatic", "historia*_final*.mp4"].flatMap(x => ["--exclude", "*/" + x]);
    empaquetando = id;
    const r = await tar(["-czf", out + ".tmp", ...fuera, "-C", raiz(), "historias/" + id, ...(guion ? ["guiones/" + guion] : [])]);
    if (!r.ok) { try { fs.unlinkSync(out + ".tmp"); } catch (x) {} return; }
    fs.renameSync(out + ".tmp", out);
    try { if (sender && !sender.isDestroyed()) sender.send("historias-progreso", { id, tipo: "relevo", etapa }); } catch (x) {}
  } catch (e) {} finally { empaquetando = null; }
}
/** Tras una etapa: la copia de relevo (si toca) y luego lo de siempre (la siguiente etapa y la cola). */
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
  if (ok && RELEVABLES.includes(etapa)) instantanea(t && t.sender, id, etapa).finally(seguir);
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
ipcMain.handle("estudio-relevo-preparar", async (e, id) => {
  if (!/^\d{2}_[\w-]+$/.test(String(id))) return { ok: false, error: "historia no válida" };
  if (tarea || empaquetando) return { ok: false, error: "Hay una tarea en marcha" };
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
    apartar(id);
    const r = await tar(["-xzf", f, "-C", raiz()]);
    try { fs.unlinkSync(f); } catch (x) {}
    if (!r.ok) return { ok: false, error: "No se pudo abrir la copia: " + r.error };
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
const BASE_PARTES = ["assets/fuentes", "assets/textures", "assets/roblox", "assets/musica", "assets/sfx", "library", "historias/01_bostezo/fuentes"];
const baseDir = () => path.join(estudioDir(), "_base");
function huellaBase() {
  const crypto = require("crypto"), h = crypto.createHash("sha1");
  const ver = (d) => { let ns = []; try { ns = fs.readdirSync(d).sort(); } catch (e) { return; }
    for (const n of ns) { const f = path.join(d, n), st = fs.statSync(f); if (st.isDirectory()) ver(f); else h.update(path.relative(raiz(), f).replace(/\\/g, "/") + "|" + st.size + "\n"); } };
  for (const p of BASE_PARTES) ver(path.join(raiz(), p));
  return h.digest("hex").slice(0, 16);
}
const esOrigen = () => existe(path.join(raiz(), ".origen_kit"));
ipcMain.handle("base-estado", async () => {
  try { return { ok: true, origen: esOrigen(), huella: esOrigen() ? huellaBase() : null,
    subida: leerJson(path.join(baseDir(), "subida.json"), null), instalada: leerJson(path.join(baseDir(), "instalada.json"), null) }; }
  catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle("base-subir", async (e, token) => {
  if (!esOrigen()) return { ok: false, error: "Solo la sube el portátil" };
  try {
    fs.mkdirSync(baseDir(), { recursive: true });
    const f = path.join(baseDir(), "base.tgz"), huella = huellaBase();
    const r = await tar(["-czf", f, "-C", raiz(), ...BASE_PARTES.filter(p => existe(path.join(raiz(), p)))]);
    if (!r.ok) return r;
    const up = await drive.subir(token, f, ["RandomStudio", "RandomHistorias", "_Base"]);
    const info = { archivo: up.id, md5: up.md5, tam: up.tam, huella, fecha: new Date().toISOString() };
    escribirJson(path.join(baseDir(), "subida.json"), info);
    try { fs.unlinkSync(f); } catch (x) {}
    return { ok: true, ...info };
  } catch (x) { return { ok: false, error: x.message }; }
});
ipcMain.handle("base-instalar", async (e, token, info) => {
  if (esOrigen()) return { ok: false, error: "El portátil es el origen" };
  if (!info || !info.archivo) return { ok: false, error: "Sin base" };
  if (tarea || empaquetando) return { ok: false, error: "Hay una tarea en marcha" };
  try {
    fs.mkdirSync(baseDir(), { recursive: true });
    const f = path.join(baseDir(), "base.tgz");
    await drive.bajar(token, String(info.archivo), f, info.md5 || null);
    const r = await tar(["-xzf", f, "-C", raiz()]);
    try { fs.unlinkSync(f); } catch (x) {}
    if (!r.ok) return r;
    escribirJson(path.join(baseDir(), "instalada.json"), { huella: info.huella, fecha: new Date().toISOString() });
    return { ok: true };
  } catch (x) { return { ok: false, error: x.message }; }
});

function discoLibre() {
  try { const st = fs.statfsSync(raiz()); return Math.round(st.bavail * st.bsize / 1e9 * 10) / 10; } catch (e) { return null; }
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
  const cl = claude.estadoClaude();
  return { ok: true, ajustes: ajustes(), eleven: !!claveEleven(), claude: !!claude.exeClaude() && cl.ok !== false, claudeInstalado: !!claude.exeClaude(),
    claudeOk: cl.ok, claudeError: cl.error, blender: !!blenderExe(), proyecto: existe(histDir()),
    // v3.41: la salud del equipo (Git Bash, espacio libre en el disco del proyecto y fecha del kit)
    bash: !!claude.rutaBash(), disco: discoLibre(), kit: (leerJson(path.join(__dirname, "..", "proyecto", "manifiesto.json"), {}) || {}).fecha || null };
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
    return { ok: true, puestos, guardados };
  } catch (e) { return { ok: false, error: e.message }; }
}
app.whenReady().then(() => setTimeout(() => { const r = sincronizarKit(); if (r.puestos) console.log("kit actualizado:", r); }, 8000));
ipcMain.handle("kit-sincronizar", async () => sincronizarKit());

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

