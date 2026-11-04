/* Almacenamiento de RandomStudio (v3.34): qué ocupa cada carpeta del perfil, «Archivar en Drive y liberar» y borrar.
 *
 * Archivar = subir cada VÍDEO a Drive (RandomStudio / <perfil> / Archivo / <carpeta> / ...ruta), comprobar que la copia es
 * idéntica (MD5) y SOLO ENTONCES borrarlo del disco. Las carpetas y sus archivos pequeños (.json, .txt, miniaturas) se
 * quedan: dentro se escribe _archivado.json con lo que se fue (los módulos del clon lo leen y enseñan «en Drive»).
 * Índice general en userData/archivo.json para «Recuperar» (se baja y se vuelve a comprobar).
 *
 * Reglas acordadas con la sesión del clon (1/11/2026) para no romper el clon, el ranking ni el editor:
 *  - Clips: solo _Descartados, y _Terminados con Short ya subido y más de 14 días. Los clips activos, NO.
 *  - Shorts listos: solo los vídeos de Shorts subidos (_subidos.json) con más de 30 días, y _Eliminados. Nunca los _*.json,
 *    los no subidos (el ranking lee sus fotogramas) ni RandomEditor/. Las _Prueba*, solo borrar si él lo decide.
 *  - Vídeos en bruto y VODs: son sus grabaciones; no se archivan; borrar solo con aviso claro y confirmación.
 *  - Temporales: solo se vacían las cachés que se regeneran solas.
 *  - Protegido siempre: cualquier archivo al que apunten las ediciones del editor o las recopilaciones («anadidos»).
 *  - Nunca se quita la carpeta de un clip o de un Short: su número se reutilizaría y el ranking se cruzaría.
 *
 * Se registra solo con require("./almacen.cjs") (desde historias.cjs).
 */
const { app, ipcMain, shell } = require("electron");
const fs = require("fs");
const path = require("path");
const drive = require("./drive.cjs");
const { carpetasDe, perfilActivo } = require("./carpetas.cjs");

const indiceArchivo = () => path.join(app.getPath("userData"), "archivo.json");
const leerIndice = () => { try { return JSON.parse(fs.readFileSync(indiceArchivo(), "utf8")); } catch (e) { return []; } };
const guardarIndice = (x) => fs.writeFileSync(indiceArchivo(), JSON.stringify(x, null, 1));
const leerJson = (p, def) => { try { return JSON.parse(fs.readFileSync(p, "utf8").replace(/^\uFEFF/, "")); } catch (e) { return def; } };
const DIA = 864e5;

const CARPETAS = [
  { clave: "clips", nombre: "Clips recortados" }, { clave: "bruto", nombre: "Vídeos en bruto", aviso: "Son tus grabaciones: sin el vídeo, ese directo no se puede volver a clipear." },
  { clave: "listos", nombre: "Shorts listos" }, { clave: "vods", nombre: "Directos (VODs)", aviso: "Son tus grabaciones de los directos." },
  { clave: "trabajo", nombre: "Temporales" }, { clave: "resultados", nombre: "Resultados del clon" },
  { clave: "descargas", nombre: "Descargas del Convertidor" }, { clave: "entregas", nombre: "Shorts de historias" },
];
const VIDEO = /\.(mp4|mov|mkv|webm|avi|m4v)$/i;
const CACHES_TRABAJO = ["random_editor/proxies", "random_editor/ondas", "random_editor/tiras", "random_editor/tmp", "random_editor/luts",
  "random_editor/efectos", "random_editor/mascaras", "random_editor/textos", "temp", "ranking_tmp", "muestras17"];
const norm = (p) => path.resolve(p).toLowerCase();
const partes = (rel) => String(rel).split(/[\\/]/).filter(Boolean);

async function medir(ruta) {
  let tam = 0, archivos = 0;
  const pila = [ruta];
  while (pila.length) {
    const d = pila.pop();
    let ents; try { ents = await fs.promises.readdir(d, { withFileTypes: true }); } catch (e) { continue; }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) pila.push(p);
      else if (e.isFile()) { try { tam += (await fs.promises.stat(p)).size; archivos++; } catch (x) {} }
    }
  }
  return { tam, archivos };
}

// ------------------------------------------------------------------ lo que está en uso (no se toca)
let _prot = null;
function protegidos() {
  if (_prot && _prot.caduca > Date.now()) return _prot.set;
  const set = new Set(), cs = carpetasDe();
  const recoger = (v) => {
    if (typeof v === "string") { if (/^[a-z]:[\\/]/i.test(v)) set.add(norm(v)); }
    else if (Array.isArray(v)) v.forEach(recoger);
    else if (v && typeof v === "object") Object.values(v).forEach(recoger);
  };
  try { const d = path.join(cs.trabajo, "random_editor", "clips"); for (const f of fs.readdirSync(d)) if (f.endsWith(".json")) recoger(leerJson(path.join(d, f), null)); } catch (e) {}
  try {
    for (const c of fs.readdirSync(cs.clips)) {
      const est = leerJson(path.join(cs.clips, c, "_estado.json"), null);
      if (est && est.anadidos) recoger(est.anadidos);
    }
  } catch (e) {}
  _prot = { set, caduca: Date.now() + 60000 };
  return set;
}
// (4/11) los datos de los Shorts viven en <Resultados del clon>\Datos de Shorts (antes dentro de Shorts listos)
const subidos = () => { const c = carpetasDe(); return leerJson(path.join(c.resultados || "", "Datos de Shorts", "_subidos.json"), null)
  || leerJson(path.join(c.listos || "", "_subidos.json"), {}) || {}; };
const tituloDe = (carpeta) => String(carpeta).replace(/^\d+\s*-\s*/, "").trim().toLowerCase();
const edad = (p) => { try { return Date.now() - fs.statSync(p).mtimeMs; } catch (e) { return 0; } };

/** ¿Se puede ARCHIVAR este archivo? -> { ok, motivo } */
function puedeArchivar(clave, abs, base) {
  const rel = path.relative(base, abs), pp = partes(rel), nombre = path.basename(abs);
  if (clave === "entregas" || clave === "descargas") return { ok: true };
  if (!VIDEO.test(nombre)) return { ok: false, motivo: "solo se archivan los vídeos" };
  if (protegidos().has(norm(abs))) return { ok: false, motivo: "lo usa una edición o una recopilación" };
  if (clave === "clips") {
    if (pp[0] === "_Descartados") return { ok: true };
    if (pp[0] === "_Terminados" && pp[1]) {
      const sub = subidos(), titulos = new Set(Object.keys(sub).map(tituloDe));
      if (!titulos.has(tituloDe(pp[1]))) return { ok: false, motivo: "su Short aún no consta como subido" };
      if (edad(path.join(base, pp[0], pp[1])) < 14 * DIA) return { ok: false, motivo: "terminado hace menos de 14 días" };
      return { ok: true };
    }
    return { ok: false, motivo: "es un clip activo" };
  }
  if (clave === "listos") {
    if (pp[0] === "_Eliminados") return { ok: true };
    if (pp[0] === "RandomEditor" || /^_Prueba/i.test(pp[0] || "")) return { ok: false, motivo: "esta carpeta no se archiva" };
    if (!subidos()[pp[0]]) return { ok: false, motivo: "este Short aún no está subido (el ranking lo usa)" };
    if (edad(path.join(base, pp[0])) < 30 * DIA) return { ok: false, motivo: "subido hace menos de 30 días" };
    return { ok: true };
  }
  return { ok: false, motivo: "esta carpeta no se archiva" };
}

/** ¿Se puede BORRAR? -> { ok, motivo, soloVideos } (en clips y Shorts se borran los vídeos y se deja la carpeta) */
function puedeBorrar(clave, abs, base) {
  const rel = path.relative(base, abs), pp = partes(rel);
  if (clave === "resultados") return { ok: false, motivo: "son los datos del clon" };
  if (clave === "trabajo") {
    const r = pp.join("/");
    return CACHES_TRABAJO.some(c => r === c || r.startsWith(c + "/")) ? { ok: true } : { ok: false, motivo: "no es una caché que se regenere sola" };
  }
  if (protegidos().has(norm(abs))) return { ok: false, motivo: "lo usa una edición o una recopilación" };
  if (clave === "listos" && (pp[0] === "RandomEditor" || /^_.*\.json$/i.test(pp[0] || ""))) return { ok: false, motivo: "esto no se borra" };
  return { ok: true, soloVideos: clave === "clips" || clave === "listos" };
}

/** Apunta en el _archivado.json de la carpeta del archivo lo que se ha ido (a Drive o borrado). */
function apuntar(abs, dato) {
  const f = path.join(path.dirname(abs), "_archivado.json");
  const lista = leerJson(f, []);
  lista.push({ archivo: path.basename(abs), fecha: new Date().toISOString(), ...dato });
  try { fs.writeFileSync(f, JSON.stringify(lista, null, 1)); } catch (e) {}
}

// ------------------------------------------------------------------ medir
ipcMain.handle("alm-resumen", async () => {
  const cs = carpetasDe();
  const out = [];
  for (const c of CARPETAS) {
    const ruta = cs[c.clave];
    if (!ruta || !fs.existsSync(ruta)) { out.push({ ...c, ruta, tam: 0, archivos: 0, existe: false }); continue; }
    out.push({ ...c, ruta, existe: true, ...(await medir(ruta)) });
  }
  try {
    const h = path.join(cs.historias, "historias");
    let tam = 0, archivos = 0;
    for (const id of fs.readdirSync(h)) for (const sub of ["planos_final", "_animatic", "planos_revisar"]) {
      const m = await medir(path.join(h, id, sub)); tam += m.tam; archivos += m.archivos;
    }
    out.push({ clave: "renders", nombre: "Renders de las historias", ruta: h, tam, archivos, existe: true, nota: "se pueden rehacer con la cadena" });
  } catch (e) {}
  // los discos: C (Windows y programas) y donde estén las carpetas del perfil
  const discos = [];
  for (const raiz of [...new Set(["C:\\", ...Object.values(cs).filter(Boolean).map(r => path.parse(r).root.toUpperCase())])]) {
    try { const st = fs.statfsSync(raiz); discos.push({ raiz, libre: st.bavail * st.bsize, total: st.blocks * st.bsize }); } catch (e) {}
  }
  const idx = leerIndice();
  return { ok: true, perfil: perfilActivo(), carpetas: out, discos, archivado: { archivos: idx.length, tam: idx.reduce((a, x) => a + (x.tam || 0), 0) } };
});

// lo que hay dentro de una carpeta (un nivel), con su tamaño y qué se puede hacer con cada cosa
ipcMain.handle("alm-listar", async (e, clave, sub) => {
  const cs = carpetasDe(), base = cs[clave];
  if (!base) throw new Error("Carpeta no válida");
  const dir = path.resolve(base, sub || ".");
  if (!dir.startsWith(path.resolve(base))) throw new Error("Ruta no válida");
  const ents = fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : [];
  _prot = null;
  const out = [];
  for (const en of ents) {
    if (en.name === "_archivado.json") continue;
    const p = path.join(dir, en.name), rel = path.relative(base, p);
    let st; try { st = fs.statSync(p); } catch (x) { continue; }
    const m = en.isDirectory() ? await medir(p) : { tam: st.size, archivos: 1 };
    let arch;
    if (en.isDirectory()) {   // una carpeta se puede archivar si tiene algún vídeo archivable
      arch = { ok: false, motivo: "nada que archivar" };
      for (const f of archivosDe(base, [rel])) { const r = puedeArchivar(clave, f, base); if (r.ok) { arch = r; break; } else arch = r; }
    } else arch = puedeArchivar(clave, p, base);
    const bor = puedeBorrar(clave, p, base);
    out.push({ nombre: en.name, rel, carpeta: en.isDirectory(), tam: m.tam, archivos: m.archivos, fecha: st.mtimeMs,
      archivable: arch.ok, motivoArchivo: arch.ok ? "" : arch.motivo, borrable: bor.ok, motivoBorrar: bor.ok ? "" : bor.motivo, soloVideos: !!bor.soloVideos });
  }
  out.sort((a, b) => b.tam - a.tam);
  const enDrive = leerJson(path.join(dir, "_archivado.json"), []);
  return { ok: true, base, sub: sub || "", items: out, enDrive, aviso: (CARPETAS.find(c => c.clave === clave) || {}).aviso || "" };
});

function archivosDe(base, rels) {
  const lista = [];
  for (const rel of rels) {
    const p = path.resolve(base, rel);
    if (!p.startsWith(path.resolve(base))) continue;
    let st; try { st = fs.statSync(p); } catch (e) { continue; }
    if (st.isFile()) { lista.push(p); continue; }
    const pila = [p];
    while (pila.length) {
      const d = pila.pop();
      for (const en of fs.readdirSync(d, { withFileTypes: true })) {
        const q = path.join(d, en.name);
        if (en.isDirectory()) pila.push(q); else if (en.isFile() && en.name !== "_archivado.json") lista.push(q);
      }
    }
  }
  return lista;
}

// ------------------------------------------------------------------ archivar
const enviar = (s, d) => { try { if (s && !s.isDestroyed()) s.send("alm-progreso", d); } catch (e) {} };

// 1) preparar: qué archivos de lo elegido se pueden archivar (los demás se saltan y se dice por qué)
ipcMain.handle("alm-preparar", async (e, clave, rels) => {
  const cs = carpetasDe(), base = cs[clave];
  if (!base) return { ok: false, error: "Carpeta no válida" };
  _prot = null;
  const si = [], no = {};
  for (const f of archivosDe(base, rels || [])) {
    const r = puedeArchivar(clave, f, base);
    if (r.ok) { let tam = 0; try { tam = fs.statSync(f).size; } catch (x) {} si.push({ rel: path.relative(base, f), tam }); }
    else no[r.motivo] = (no[r.motivo] || 0) + 1;
  }
  return { ok: true, archivos: si, bytes: si.reduce((a, x) => a + x.tam, 0), saltados: no };
});

// 2) archivar UNO: subir, comprobar y borrar. La app lo llama archivo a archivo con el permiso de Drive recién renovado
//    (un archivado grande dura horas y cada permiso de Drive dura una hora; la app lo renueva sola).
ipcMain.handle("alm-archivar-uno", async (e, token, perfilNombre, clave, rel) => {
  const cs = carpetasDe(), base = cs[clave];
  const f = base && path.resolve(base, rel);
  if (!f || !f.startsWith(path.resolve(base)) || !fs.existsSync(f)) return { ok: false, error: "No existe" };
  const permiso = puedeArchivar(clave, f, base);
  if (!permiso.ok) return { ok: false, error: permiso.motivo };
  const nombre = (CARPETAS.find(c => c.clave === clave) || {}).nombre || clave;
  const carpetasRel = partes(path.dirname(rel)).filter(x => x !== ".");
  const tam = fs.statSync(f).size, sender = e.sender;
  try {
    const r = await drive.subir(token, f, ["RandomStudio", perfilNombre || "RandomStudio", "Archivo", nombre, ...carpetasRel],
      (fr) => enviar(sender, { tipo: "parcial", archivo: rel, fraccion: fr }));
    if (!r.verificado) throw new Error("Drive no confirmó que la copia es idéntica");
    const idx = leerIndice();
    idx.push({ id: r.id, ver: r.ver, md5: r.md5, tam, ruta: f, carpeta: clave, rel, perfil: perfilNombre, fecha: new Date().toISOString() });
    guardarIndice(idx);
    apuntar(f, { estado: "drive", drive_id: r.id, ver: r.ver, md5: r.md5, tam });
    fs.unlinkSync(f);                         // solo después de comprobar la copia (la carpeta se queda)
    return { ok: true, liberado: tam };
  } catch (x) { return { ok: false, error: x.message }; }
});

// ------------------------------------------------------------------ borrar (la criba)
// A la papelera de Windows (se puede deshacer; el espacio se libera al vaciarla) o para siempre (libera ya).
// En clips y Shorts se borran los VÍDEOS y la carpeta se queda (con su _archivado.json), para no reutilizar números.
ipcMain.handle("alm-borrar", async (e, clave, rels, definitivo) => {
  const cs = carpetasDe(), base = cs[clave];
  if (!base) return { ok: false, error: "Carpeta no válida" };
  _prot = null;
  let liberado = 0, hechos = 0; const fallos = [];
  for (const rel of rels || []) {
    const p = path.resolve(base, rel);
    if (!p.startsWith(path.resolve(base) + path.sep)) { fallos.push(rel + ": fuera de la carpeta"); continue; }
    const regla = puedeBorrar(clave, p, base);
    if (!regla.ok) { fallos.push(rel + ": " + regla.motivo); continue; }
    try {
      const st = fs.statSync(p);
      const objetivos = regla.soloVideos && st.isDirectory() ? archivosDe(base, [rel]).filter(f => VIDEO.test(f) && !protegidos().has(norm(f))) : [p];
      for (const o of objetivos) {
        const tam = fs.statSync(o).isDirectory() ? (await medir(o)).tam : fs.statSync(o).size;
        if (definitivo) fs.rmSync(o, { recursive: true, force: true }); else await shell.trashItem(o);
        if (regla.soloVideos) apuntar(o, { estado: definitivo ? "borrado" : "papelera", tam });
        liberado += tam; hechos++;
      }
    } catch (x) { fallos.push(rel + ": " + x.message); }
  }
  return { ok: true, hechos, liberado, definitivo: !!definitivo, fallos: fallos.slice(0, 20) };
});

ipcMain.handle("alm-indice", async () => {
  const idx = leerIndice();
  return { ok: true, items: idx.slice(-500).reverse().map(x => ({ id: x.id, rel: x.rel, carpeta: x.carpeta, tam: x.tam, fecha: x.fecha, ver: x.ver, existeLocal: fs.existsSync(x.ruta) })) };
});

// recuperar: se baja de Drive a su sitio de siempre y se comprueba (la copia de Drive se queda)
ipcMain.handle("alm-recuperar", async (e, token, ids) => {
  const idx = leerIndice(), out = [];
  for (const id of ids || []) {
    const x = idx.find(y => y.id === id);
    if (!x) continue;
    try {
      if (!fs.existsSync(x.ruta)) await drive.bajar(token, x.id, x.ruta, x.md5);
      const f = path.join(path.dirname(x.ruta), "_archivado.json");
      const lista = leerJson(f, []).filter(a => !(a.archivo === path.basename(x.ruta) && a.drive_id === x.id));
      try { lista.length ? fs.writeFileSync(f, JSON.stringify(lista, null, 1)) : fs.unlinkSync(f); } catch (y) {}
      out.push({ id, ok: true });
    } catch (err) { out.push({ id, ok: false, error: err.message }); }
  }
  return { ok: true, resultados: out };
});

ipcMain.handle("alm-abrir", async (e, ruta) => { if (ruta && fs.existsSync(ruta)) await shell.openPath(ruta); return { ok: true }; });

module.exports = {};
