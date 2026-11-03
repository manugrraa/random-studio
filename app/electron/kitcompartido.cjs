/* KIT COMPARTIDO entre equipos (3-11-2026, él: «deben estar totalmente conectados los equipos que vayan a crear las
 * historias… si uno de los dos equipos hace mejoras en el escenario o en los modelos, se debe compartir esa información
 * inmediatamente con el otro equipo»).
 *
 * Hasta la 3.45 solo viajaban los kit/*.py creados en el ordenador («kit propio»), cada 3 minutos y sin borrados. Ahora:
 *   · viaja TODO el árbol del kit (kit/, tools/, roblox/ —el pueblo y los modelos de Roblox—, la plantilla y las guías):
 *     lo que este equipo ha cambiado o creado respecto a lo que ya es común, y también lo que ha borrado;
 *   · al momento: un vigilante de carpetas avisa en cuanto se guarda un archivo (historias.cjs lo manda a la interfaz,
 *     que sube el paquete y toca el timbre; el otro equipo lo baja en segundos);
 *   · sin pisar nada: si los dos equipos cambiaron el mismo archivo, se queda el más reciente y el otro se aparta a
 *     _kit_local/<fecha>/ (y queda anotado en el registro);
 *   · nunca mientras se renderiza: si el equipo está ocupado, se aplica en cuanto queda libre.
 *
 * El portátil (origen del kit) es el punto de unión: adopta lo que llega de los demás y, al cambiar su kit, el kit vivo
 * (historias.cjs, base-subir) lleva el conjunto a todos. Por eso el portátil no publica paquetes de cambios: solo recibe.
 *
 * Estado en <proyecto>/estudio/_base/kit_compartido.json: { "kit/x.py": { sha, ts } } = lo que este equipo da por común.
 *   · en los demás equipos se junta con kit_lista.json (lo instalado del kit vivo): esa lista manda;
 *   · en el portátil se crea con lo que hay la primera vez (nada pendiente) y va apuntando lo que adopta.
 * Sin Electron: todas las funciones reciben la raíz del proyecto. */
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const TEXTO = /\.(py|luau|md|json|txt|cfg|ini|toml|ya?ml|ass|csv|lua)$/i;
const MAX = 3 * 1024 * 1024;
const FUERA = /(^|\/)(__pycache__|\.git|node_modules)(\/|$)|\.pyc$/;

const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const shaArchivo = (f) => { try { return sha(fs.readFileSync(f)); } catch (e) { return null; } };
const leerJson = (p, def) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { return def; } };
const escribirJson = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(v, null, 1)); };
const sello = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

const estadoF = (R) => path.join(R, "estudio", "_base", "kit_compartido.json");
const listaF = (R) => path.join(R, "estudio", "_base", "kit_lista.json");
const esOrigen = (R) => fs.existsSync(path.join(R, ".origen_kit"));

/** Todos los archivos de texto del alcance: { rel: { sha, ts } } (ts = última modificación, ms). */
function listar(R, alcance) {
  const out = {};
  const ver = (f, rel) => {
    let st; try { st = fs.statSync(f); } catch (e) { return; }
    if (st.isDirectory()) { for (const n of fs.readdirSync(f).sort()) { const r = rel + "/" + n; if (!FUERA.test(r)) ver(path.join(f, n), r); } return; }
    if (!TEXTO.test(rel) || st.size > MAX) return;
    const h = shaArchivo(f); if (h) out[rel] = { sha: h, ts: Math.round(st.mtimeMs) };
  };
  for (const p of alcance) ver(path.join(R, p), p.replace(/\\/g, "/"));
  return out;
}

/** Lo que este equipo da por común: en los demás equipos manda el kit vivo instalado (kit_lista.json). */
function base(R) {
  const est = leerJson(estadoF(R), null);
  const comun = {};
  if (est && est.archivos) Object.assign(comun, est.archivos);
  if (!esOrigen(R)) {
    const l = leerJson(listaF(R), {}) || {};
    for (const [rel, h] of Object.entries(Array.isArray(l) ? {} : l)) if (h) comun[rel] = { sha: h, ts: (comun[rel] || {}).ts || 0 };
  }
  return comun;
}
function guardarBase(R, comun) { escribirJson(estadoF(R), { fecha: new Date().toISOString(), archivos: comun }); }
/** La primera vez, en el portátil, lo que hay ya es común (si no, lo publicaría todo como cambios). */
function asegurarBase(R, alcance) {
  if (fs.existsSync(estadoF(R))) return;
  guardarBase(R, esOrigen(R) ? listar(R, alcance) : {});
}

/** Cambios de este equipo respecto a lo común: { cambiados: [{ rel, sha, ts }], borrados: [rel] } */
function cambios(R, alcance) {
  asegurarBase(R, alcance);
  const actual = listar(R, alcance), comun = base(R);
  const cambiados = [], borrados = [];
  for (const [rel, x] of Object.entries(actual)) if (!comun[rel] || comun[rel].sha !== x.sha) cambiados.push({ rel, sha: x.sha, ts: x.ts });
  for (const rel of Object.keys(comun)) if (!actual[rel] && TEXTO.test(rel)) borrados.push(rel);
  return { cambiados, borrados };
}
function huella(c) {
  const h = crypto.createHash("sha1");
  for (const x of c.cambiados) h.update(x.rel + "|" + x.sha + "\n");
  for (const r of c.borrados) h.update("-" + r + "\n");
  return h.digest("hex").slice(0, 16);
}

/** El paquete de cambios de este equipo, listo para subir: null si no hay nada. tar(args) lo pone historias.cjs. */
async function empaquetar(R, alcance, tar, destino) {
  if (esOrigen(R)) return null;                          // (el portátil reparte por el kit vivo)
  const c = cambios(R, alcance);
  if (!c.cambiados.length && !c.borrados.length) return null;
  const h = huella(c);
  if (c.cambiados.length) {
    const r = await tar(["-czf", destino, "-C", R, ...c.cambiados.map(x => x.rel)]);
    if (!r.ok) throw new Error("tar: " + r.error);
  } else fs.writeFileSync(destino, "");                  // (solo borrados: sin archivo)
  return { huella: h, rutas: c.cambiados, borrados: c.borrados,
    // (compatibilidad con la 3.45: los kit/*.py por su nombre)
    nombres: c.cambiados.map(x => x.rel).filter(r => /^kit\/\w+\.py$/.test(r)).map(r => r.slice(4)),
    equipo: os.hostname() };
}

/** Aplica el paquete de otro equipo (ya bajado y extraído en `tmp`; `info` es lo que publicó). Devuelve qué pasó. */
function aplicar(R, alcance, tmp, info) {
  asegurarBase(R, alcance);
  const comun = base(R), s = sello();
  const puestos = [], apartados = [], conflictos = [], iguales = [];
  const apartar = (rel) => {
    try { const bk = path.join(R, "_kit_local", s, rel); fs.mkdirSync(path.dirname(bk), { recursive: true }); fs.renameSync(path.join(R, rel), bk); return true; } catch (e) { return false; }
  };
  const rutas = Array.isArray(info.rutas) ? info.rutas : (info.nombres || []).map(n => ({ rel: "kit/" + n, sha: null, ts: 0 }));
  for (const x of rutas) {
    const rel = String(x.rel || "").replace(/\\/g, "/");
    if (!/^[\w./-]+$/.test(rel) || rel.includes("..") || !TEXTO.test(rel) || !alcance.some(p => rel === p || rel.startsWith(p.replace(/\\/g, "/") + "/"))) continue;
    const de = path.join(tmp, rel), a = path.join(R, rel);
    if (!fs.existsSync(de)) continue;
    const nuevo = x.sha || shaArchivo(de), local = fs.existsSync(a) ? shaArchivo(a) : null;
    if (local === nuevo) { comun[rel] = { sha: nuevo, ts: x.ts || Date.now() }; iguales.push(rel); continue; }
    const sinTocar = !local || (comun[rel] && comun[rel].sha === local);
    if (!sinTocar) {
      // los dos lo cambiaron: se queda el más reciente; el otro, apartado (y anotado)
      let tsLocal = 0; try { tsLocal = Math.round(fs.statSync(a).mtimeMs); } catch (e) {}
      if (!(x.ts > tsLocal)) { conflictos.push({ rel, gana: "este equipo", tsLocal, tsOtro: x.ts || 0 }); continue; }
      apartar(rel);
      conflictos.push({ rel, gana: info.equipo || "el otro equipo", tsLocal, tsOtro: x.ts, apartado: "_kit_local/" + s + "/" + rel });
    }
    fs.mkdirSync(path.dirname(a), { recursive: true });
    fs.copyFileSync(de, a);
    if (x.ts) { try { fs.utimesSync(a, new Date(), new Date(x.ts)); } catch (e) {} }
    comun[rel] = { sha: nuevo, ts: x.ts || Date.now() };
    puestos.push(rel);
  }
  for (const r0 of info.borrados || []) {
    const rel = String(r0).replace(/\\/g, "/");
    if (!/^[\w./-]+$/.test(rel) || rel.includes("..") || !alcance.some(p => rel === p || rel.startsWith(p.replace(/\\/g, "/") + "/"))) continue;
    const a = path.join(R, rel);
    if (!fs.existsSync(a)) { delete comun[rel]; continue; }
    const local = shaArchivo(a);
    if (comun[rel] && comun[rel].sha === local) { if (apartar(rel)) apartados.push(rel); delete comun[rel]; }
    else conflictos.push({ rel, gana: "este equipo", motivo: "el otro lo borró, pero aquí está cambiado: se queda" });
  }
  guardarBase(R, comun);
  return { puestos, apartados, conflictos, iguales };
}

/** Tras recibir un kit vivo nuevo (kit_lista.json recién escrita), lo común se pone al día con ella. */
function trasKitVivo(R) {
  try {
    if (esOrigen(R)) return;
    const comun = base(R);
    const l = leerJson(listaF(R), {}) || {};
    for (const rel of Object.keys(comun)) if (!(rel in l) && !fs.existsSync(path.join(R, rel))) delete comun[rel];
    guardarBase(R, comun);
  } catch (e) {}
}
/** En el portátil, lo que acaba de salir en el kit vivo ya es común (no hace falta que vuelva como cambio). */
function trasSubirKitVivo(R, alcance) {
  try { if (esOrigen(R)) guardarBase(R, listar(R, alcance)); } catch (e) {}
}

/** Vigila las carpetas del kit: cb() cuando algo de texto cambia (con 3 s de calma, para que no se dispare a mitad de
 * una escritura o por cada archivo de una tanda). Devuelve una función para parar. */
function vigilar(R, alcance, cb) {
  const vigilantes = [];
  let t = null, ultimo = 0;
  const aviso = (ev, nombre) => {
    const n = String(nombre || "").replace(/\\/g, "/");
    if (n && (!TEXTO.test(n) || FUERA.test(n))) return;
    clearTimeout(t); t = setTimeout(() => { ultimo = Date.now(); try { cb(); } catch (e) {} }, 3000);
  };
  for (const p of alcance) {
    const f = path.join(R, p);
    try {
      if (!fs.existsSync(f)) continue;
      const dir = fs.statSync(f).isDirectory();
      const w = fs.watch(f, dir ? { recursive: true } : {}, aviso);
      w.on("error", () => {});
      vigilantes.push(w);
    } catch (e) {}
  }
  return () => { clearTimeout(t); for (const w of vigilantes) { try { w.close(); } catch (e) {} } };
}

module.exports = { listar, cambios, empaquetar, aplicar, trasKitVivo, trasSubirKitVivo, vigilar, base, esOrigen };
