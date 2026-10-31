/* RandomHistorias dentro de RandomStudio (v3.21): el mismo proceso de siempre (tools/cadena.py), pero visto y
 * lanzado desde aquí: estado de cada historia, progreso del render plano a plano con el tiempo que falta, y elegir
 * la miniatura entre las fotos de los planos. Los archivos se leen siempre del portátil (RAIZ).
 *
 * Se registra solo con require("./historias.cjs") desde main.cjs.
 */
const { ipcMain, nativeImage, shell } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const RAIZ = process.env.RANDOMHISTORIAS_DIR || "E:\\A RdeRandom\\RandomHistorias";
const HIST = path.join(RAIZ, "historias");
const LISTAS = path.join(RAIZ, ".historiaslistas");
const PASOS = ["sincronizar", "revisar", "fotos", "mezclar", "subtitulos", "animatic", "render", "montar", "miniatura", "entregar"];

const leer = (p, def) => { try { return fs.readFileSync(p, "utf-8"); } catch (e) { return def; } };
const leerJson = (p, def) => { try { return JSON.parse(leer(p, "").replace(/^\uFEFF/, "")); } catch (e) { return def; } };
const existe = (p) => { try { return fs.existsSync(p); } catch (e) { return false; } };

function carpetaDe(id) {
  if (!/^\d{2}_[\w-]+$/.test(String(id))) throw new Error("historia no válida");
  const c = path.join(HIST, id);
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
  const entrega = path.join(LISTAS, tituloArchivo(t));
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

function lanzar(sender, id, args) {
  if (tarea) throw new Error("Ya hay una tarea en marcha (" + tarea.id + ")");
  const c = carpetaDe(id);
  const proc = spawn("python", [path.join(RAIZ, "tools", "cadena.py"), path.relative(RAIZ, c), ...args], {
    cwd: RAIZ, env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUNBUFFERED: "1" }, windowsHide: true,
  });
  tarea = { proc, id, args, inicio: Date.now(), lineas: [], paso: null, render: null, sender, nPlanos: planos(c).length };
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
    emitir({ tipo: "fin", ok: code === 0, codigo: code });
    tarea = null;
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
  if (!existe(HIST)) return { ok: false, error: "No encuentro " + HIST };
  const ids = fs.readdirSync(HIST).filter(n => /^\d{2}_[\w-]+$/.test(n)).sort().reverse();
  return { ok: true, raiz: RAIZ, historias: ids.map(id => { try { return resumen(id); } catch (e) { return { id, error: e.message }; } }) };
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
  return { activa: true, id: tarea.id, args: tarea.args, inicio: tarea.inicio, paso: tarea.paso, render: tarea.render,
    lineas: tarea.lineas.slice(-60) };
});

ipcMain.handle("historias-cancelar", async () => {
  if (tarea && tarea.proc) { try { spawn("taskkill", ["/PID", String(tarea.proc.pid), "/T", "/F"], { windowsHide: true }); } catch (x) {} }
  return { ok: true };
});

// Elegir la miniatura: plano + momento (0..1) -> tools/miniatura.py y vuelve a entregar
ipcMain.handle("historias-miniatura", async (e, id, plano, t) => {
  const c = carpetaDe(id);
  if (!/^s\d+$/.test(String(plano))) throw new Error("plano no válido");
  const tt = Math.max(0.05, Math.min(0.95, Number(t) || 0.8));
  const correr = (args) => new Promise((ok, ko) => {
    const p = spawn("python", args, { cwd: RAIZ, env: { ...process.env, PYTHONIOENCODING: "utf-8" }, windowsHide: true });
    let out = "";
    p.stdout.on("data", d => out += d); p.stderr.on("data", d => out += d);
    p.on("close", code => code === 0 ? ok(out) : ko(new Error(out.split("\n").filter(Boolean).slice(-3).join(" | ") || ("código " + code))));
  });
  await correr([path.join(RAIZ, "tools", "miniatura.py"), path.relative(RAIZ, c), "--plano", plano, "--t", String(tt)]);
  if (existe(path.join(c, `historia${id.slice(0, 2)}_final.mp4`)))
    await correr([path.join(RAIZ, "tools", "cadena.py"), path.relative(RAIZ, c), "--solo", "entregar"]);
  return { ok: true, miniatura: miniDataUrl(path.join(c, "miniatura.png"), 360) };
});

ipcMain.handle("historias-abrir", async (e, id, que) => {
  const r = resumen(id);
  const ruta = que === "entrega" ? r.carpetaEntrega : que === "video" ? r.final : r.carpeta;
  if (!ruta || !existe(ruta)) return { ok: false, error: "Todavía no existe" };
  const err = await shell.openPath(ruta);
  return { ok: !err, error: err || null };
});

module.exports = { RAIZ };
