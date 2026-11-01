/* Perfiles LOCALES y BRUTOS (v3.40, Carental).
 *
 * Él: "me debes dejar crear perfiles locales, que no dependan de una cuenta de Google. Estos se administrarán dentro
 * del equipo en el que se hayan creado y también podrán tener sus carpetas en el Drive".
 *  - perfiles_locales.json (userData): [{ id: "local-…", nombre, creado }]. Solo en ESTE equipo; para usarlos el
 *    equipo tiene que tener permiso (la pantalla de perfiles solo los enseña con alguna cuenta aprobada).
 *  - Brutos: el cribado y las carpetas de cada vídeo van en <trabajo del perfil>/brutos/estado.json (el mismo que
 *    lee RandomClon/clon/brutos.py). Sus brutos NUNCA se mueven ni se tocan.
 *  - Drive: el vídeo terminado (y su miniatura) a RandomStudio/<perfil>/<carpeta del mes>/, con la sesión de Drive
 *    del perfil (solo «drive.file»: la app solo ve lo que sube).
 *
 * Se registra solo con require("./brutos.cjs") al final de main.cjs.
 */
const { app, ipcMain } = require("electron");
const fs = require("fs");
const path = require("path");
const carpetas = require("./carpetas.cjs");
const drive = require("./drive.cjs");

const ARCHIVO = () => path.join(app.getPath("userData"), "perfiles_locales.json");
const leerJson = (f, def) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { return def; } };
function escribirJson(f, datos) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = f + "." + process.pid + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(datos, null, 1));
  fs.renameSync(tmp, f);
}
const locales = () => (leerJson(ARCHIVO(), []) || []).filter(p => p && /^local-[a-z0-9-]{1,30}$/.test(p.id));

function idNuevo(nombre) {
  const base = "local-" + (String(nombre).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "perfil");
  const ya = new Set(locales().map(p => p.id));
  let id = base, k = 2;
  while (ya.has(id)) id = base + "-" + k++;
  return id;
}

ipcMain.handle("locales-leer", async () => ({ ok: true, perfiles: locales() }));

ipcMain.handle("locales-crear", async (e, nombre, brutos) => {
  nombre = String(nombre || "").replace(/[<>:"/\\|?*]/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
  if (!nombre) return { error: "Ponle un nombre al perfil" };
  if (locales().some(p => p.nombre.toLowerCase() === nombre.toLowerCase())) return { error: "Ya hay un perfil con ese nombre en este equipo" };
  const p = { id: idNuevo(nombre), nombre, creado: new Date().toISOString() };
  escribirJson(ARCHIVO(), [...locales(), p]);
  carpetas.registrarLocal(p.id, p.nombre);
  if (brutos && path.isAbsolute(String(brutos))) carpetas.elegir(p.id, "bruto", String(brutos));
  return { ok: true, perfil: p };
});

ipcMain.handle("locales-renombrar", async (e, id, nombre) => {
  nombre = String(nombre || "").replace(/[<>:"/\\|?*]/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
  if (!nombre) return { error: "Ponle un nombre al perfil" };
  const lista = locales();
  const p = lista.find(x => x.id === id);
  if (!p) return { error: "No existe ese perfil" };
  p.nombre = nombre;
  escribirJson(ARCHIVO(), lista);
  carpetas.registrarLocal(id, nombre);
  return { ok: true };
});

// quitarlo de la lista de este equipo: sus datos y sus carpetas se quedan donde están (no se borra nada)
ipcMain.handle("locales-quitar", async (e, id) => {
  escribirJson(ARCHIVO(), locales().filter(p => p.id !== id));
  return { ok: true };
});

// ------------------------------------------------------------------ brutos
const estadoArchivo = () => path.join(carpetas.carpetasDe().trabajo, "brutos", "estado.json");
const estadoVacio = () => ({ descartados: [], carpetas: [] });

ipcMain.handle("brutos-estado", async () => {
  const c = carpetas.carpetasDe();
  return { ok: true, estado: { ...estadoVacio(), ...leerJson(estadoArchivo(), {}) }, raiz: c.bruto, editados: c.editados };
});

// cambios por partes (el clon también escribe en él mientras monta): se aplica sobre lo que haya en el disco
ipcMain.handle("brutos-cambiar", async (e, cambio) => {
  const f = estadoArchivo();
  const est = { ...estadoVacio(), ...leerJson(f, {}) };
  const k = cambio && cambio.tipo;
  if (k === "descartar") est.descartados = [...new Set([...est.descartados, ...(cambio.rels || [])])];
  else if (k === "restaurar") { const s = new Set(cambio.rels || []); est.descartados = est.descartados.filter(r => !s.has(r)); }
  else if (k === "carpeta") {
    const c = cambio.carpeta || {};
    const i = est.carpetas.findIndex(x => x.id === c.id);
    if (i >= 0) est.carpetas[i] = { ...est.carpetas[i], ...c };
    else est.carpetas.unshift({ estado: "nuevo", creada: new Date().toISOString(), clips: [], nota: "", titulo_modo: "ia", ...c });
  } else if (k === "quitar-carpeta") est.carpetas = est.carpetas.filter(x => x.id !== cambio.id);
  else return { error: "cambio no válido" };
  escribirJson(f, est);
  return { ok: true, estado: est };
});

ipcMain.handle("brutos-drive-subir", async (e, id, token, perfilNombre) => {
  const sender = e.sender;
  try {
    const f = estadoArchivo();
    const est = { ...estadoVacio(), ...leerJson(f, {}) };
    const c = est.carpetas.find(x => x.id === id);
    if (!c || !c.resultado || !c.resultado.mp4 || !fs.existsSync(c.resultado.mp4)) return { error: "Todavía no hay vídeo que subir" };
    const archivos = [c.resultado.mp4, c.resultado.miniatura].filter(x => x && fs.existsSync(x));
    const partes = ["RandomStudio", perfilNombre || "Perfil", path.basename(path.dirname(c.resultado.mp4))];
    const hechos = [];
    for (let i = 0; i < archivos.length; i++) {
      hechos.push(await drive.subir(token, archivos[i], partes, fr => { try { sender.send("brutos-progreso", { id, fraccion: (i + fr) / archivos.length }); } catch (x) {} }));
    }
    // se apunta en su carpeta (releyendo: el clon pudo escribir mientras subía)
    const est2 = { ...estadoVacio(), ...leerJson(f, {}) };
    const c2 = est2.carpetas.find(x => x.id === id);
    if (c2) { c2.drive = { fecha: new Date().toISOString(), carpeta: "https://drive.google.com/drive/folders/" + hechos[0].carpeta, ver: hechos[0].ver, verificado: hechos.every(h => h.verificado), mp4: c.resultado.mp4 }; escribirJson(f, est2); }
    return { ok: true, drive: c2 && c2.drive };
  } catch (x) { return { error: x.message || String(x) }; }
});

// v3.40.2: la carpeta del perfil en Drive (RandomStudio/<perfil>), para abrirla y compartirla con los compañeros
ipcMain.handle("brutos-drive-carpeta", async (e, token, perfilNombre) => {
  try { return { ok: true, url: "https://drive.google.com/drive/folders/" + (await drive.rutaCarpetas(token, ["RandomStudio", perfilNombre || "Perfil"])) }; }
  catch (x) { return { error: x.message || String(x) }; }
});

module.exports = { locales };
