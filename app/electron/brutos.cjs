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
    else est.carpetas.unshift({ estado: "nuevo", creada: new Date().toISOString(), clips: [], nota: "", titulo_modo: "ninguno", ...c });   // (7/11) el título lo pone él
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
    // (5/11) al mismo sitio que los demás terminados: RandomStudio/<perfil> - .Terminados/<nombre del vídeo>/
    const partes = ["RandomStudio", (perfilNombre || "Perfil") + " - .Terminados", path.basename(c.resultado.mp4).replace(/\.(mp4|mov)$/i, "")];
    const hechos = [];
    for (let i = 0; i < archivos.length; i++) {
      hechos.push(await drive.subir(token, archivos[i], partes, fr => { try { sender.send("brutos-progreso", { id, fraccion: (i + fr) / archivos.length }); } catch (x) {} }));
    }
    // se apunta en su carpeta (releyendo: el clon pudo escribir mientras subía)
    const est2 = { ...estadoVacio(), ...leerJson(f, {}) };
    const c2 = est2.carpetas.find(x => x.id === id);
    if (c2) { c2.drive = { fecha: new Date().toISOString(), carpeta: "https://drive.google.com/drive/folders/" + hechos[0].carpeta, ver: hechos[0].ver, verificado: hechos.every(h => h.verificado), mp4: c.resultado.mp4 }; escribirJson(f, est2); }
    // y en la lista de Terminados queda como subido (no se vuelve a subir)
    try { const base = (carpetas.carpetasDe() || {}).listos, rel = base && path.relative(base, c.resultado.mp4);
      if (rel && !rel.startsWith("..")) { const reg = leerJson(terminadosRegistro(), {}) || {}; reg[rel] = { fecha: new Date().toISOString(), tam: fs.statSync(c.resultado.mp4).size, carpeta: "https://drive.google.com/drive/folders/" + hechos[0].carpeta, ver: hechos[0].ver }; escribirJson(terminadosRegistro(), reg); } } catch (x) {}
    return { ok: true, drive: c2 && c2.drive };
  } catch (x) { return { error: x.message || String(x) }; }
});

/* (5/11, él: "un apartado que detecte los vídeos exportados en el perfil de Carental, para poder subirlos al Drive más
 * fácilmente… en mi Drive, dentro de RandomStudio, una carpeta «Carental - .Terminados» y ahí todos los exportados con
 * sus carpetas y sus miniaturas; la carpeta, simplemente con el nombre del vídeo").
 * Los TERMINADOS son los vídeos de la carpeta de salida del perfil (Configuración → Carpetas → «Shorts listos», p. ej.
 * Vídeos RDR\Editados\Carental), sueltos o en su carpeta con su «… - Miniatura.jpg». Se suben a
 * RandomStudio/<perfil> - .Terminados/<nombre del vídeo>/ y se apunta cuál está subido (si cambia, vuelve a «sin subir»). */
const terminadosRegistro = () => path.join(carpetas.dirDatos(), "terminados_drive.json");
function terminadosLista() {
  const base = (carpetas.carpetasDe() || {}).listos;
  if (!base || !fs.existsSync(base)) return { base, lista: [] };
  const reg = leerJson(terminadosRegistro(), {}) || {};
  const lista = [];
  const ver = (d, nivel) => {
    let ns = []; try { ns = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
    for (const n of ns) {
      if (n.name.startsWith("_") || n.name.startsWith(".")) continue;
      const x = path.join(d, n.name);
      if (n.isDirectory()) { if (nivel < 2) ver(x, nivel + 1); continue; }
      if (!/\.(mp4|mov)$/i.test(n.name) || /_proxy|\.tmp\./i.test(n.name)) continue;
      const st = fs.statSync(x), nombre = n.name.replace(/\.(mp4|mov)$/i, "");
      const mini = (() => { try { return fs.readdirSync(d).filter(f => /miniatura\.(jpe?g|png)$/i.test(f)).sort((a, b) => (b.startsWith(nombre) ? 1 : 0) - (a.startsWith(nombre) ? 1 : 0)).map(f => path.join(d, f))[0] || null; } catch (e) { return null; } })();
      const rel = path.relative(base, x), r = reg[rel];
      lista.push({ id: rel, nombre, video: x, miniatura: mini && path.dirname(mini) === d && (mini.includes(nombre) || nivel > 0) ? mini : null, tam: st.size, fecha: st.mtimeMs,
        drive: r && r.tam === st.size ? r : null });
    }
  };
  ver(base, 0);
  lista.sort((a, b) => b.fecha - a.fecha);
  return { base, lista };
}
ipcMain.handle("terminados-lista", async () => { try { return { ok: true, ...terminadosLista() }; } catch (x) { return { error: x.message }; } });
ipcMain.handle("terminados-subir", async (e, id, token, perfilNombre) => {
  const sender = e.sender;
  try {
    const { lista } = terminadosLista();
    const t = lista.find(x => x.id === id);
    if (!t) return { error: "Ese vídeo ya no está" };
    const archivos = [t.video, t.miniatura].filter(Boolean);
    // (la carpeta, solo con el nombre del vídeo: sin el «Carental - » de delante si lo tiene)
    const pre = (perfilNombre || "") + " - ", limpio = perfilNombre && t.nombre.toLowerCase().startsWith(pre.toLowerCase()) ? t.nombre.slice(pre.length).trim() : t.nombre;
    const partes = ["RandomStudio", (perfilNombre || "Perfil") + " - .Terminados", limpio || t.nombre];
    const hechos = [];
    for (let i = 0; i < archivos.length; i++)
      hechos.push(await drive.subir(token, archivos[i], partes, fr => { try { sender.send("terminados-progreso", { id, fraccion: (i + fr) / archivos.length }); } catch (x) {} }));
    const reg = leerJson(terminadosRegistro(), {}) || {};
    reg[id] = { fecha: new Date().toISOString(), tam: t.tam, carpeta: "https://drive.google.com/drive/folders/" + hechos[0].carpeta, ver: hechos[0].ver, verificado: hechos.every(h => h.verificado) };
    escribirJson(terminadosRegistro(), reg);
    return { ok: true, drive: reg[id] };
  } catch (x) { return { error: x.message || String(x) }; }
});
ipcMain.handle("terminados-carpeta", async (e, token, perfilNombre) => {
  try { return { ok: true, url: "https://drive.google.com/drive/folders/" + (await drive.rutaCarpetas(token, ["RandomStudio", (perfilNombre || "Perfil") + " - .Terminados"])) }; }
  catch (x) { return { error: x.message || String(x) }; }
});

// v3.40.2: la carpeta del perfil en Drive (RandomStudio/<perfil>), para abrirla y compartirla con los compañeros
ipcMain.handle("brutos-drive-carpeta", async (e, token, perfilNombre) => {
  try { return { ok: true, url: "https://drive.google.com/drive/folders/" + (await drive.rutaCarpetas(token, ["RandomStudio", perfilNombre || "Perfil"])) }; }
  catch (x) { return { error: x.message || String(x) }; }
});

module.exports = { locales };
