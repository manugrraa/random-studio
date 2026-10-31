/* Perfiles y carpetas de RandomStudio (v3.26).
 *
 * Cada perfil es una cuenta (canal) con las MISMAS opciones; cambian sus datos, su sesión de Google y sus carpetas.
 * - perfilActivo(): lo fija la app al elegir perfil (llamada «perfil-poner»); por defecto «rderandom».
 * - dirDatos(perfil): datos.json, copias y errores.log del perfil (rderandom: userData de siempre;
 *   otros: userData/perfiles/<id>).
 * - carpetasDe(perfil): {clave: ruta} con TODAS las carpetas resueltas (lo elegido o el valor por defecto).
 * - archivoCarpetas(perfil): ruta de perfiles/<id>/carpetas.json, que se mantiene siempre completo; los procesos
 *   del clon, el convertidor y el RandomChat lo reciben en RS_CARPETAS.
 * El RandomEditor no tiene carpetas aquí: es un módulo aparte.
 */
const { app, ipcMain, dialog, shell, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

// v3.30: en el ordenador de sobremesa la base la pone su instalador (RANDOMSTUDIO_BASE); en el portátil, la de siempre
const BASE = process.env.RANDOMSTUDIO_BASE || "E:\\A RdeRandom";
const PERFILES = {
  rderandom: { nombre: "RDeRandom", canal: "UCF-3SarqM5bvy3sBT_avssQ" },
  randomhistorias: { nombre: "RandomHistorias", canal: "UCt7hr6bzAxETC8y961WmH4g" },
};

// grupo, clave, nombre, para qué, valor por defecto de RDeRandom; el resto de perfiles: E:\A RdeRandom\Perfiles\<id>\<Nombre>
const DEFS = [
  { grupo: "Directos, Clips y Ranking", clave: "vods", nombre: "Directos (VODs)", ayuda: "Los directos de los que se sacan clips", def: path.join(BASE, "RandomClon", "VODs"), otro: "VODs" },
  { grupo: "Directos, Clips y Ranking", clave: "clips", nombre: "Clips recortados", ayuda: "Los clips cortados (dentro van _Descartados y _Terminados)", def: path.join(BASE, "RandomClon", "Clips Recortados"), otro: "Clips Recortados" },
  { grupo: "Directos, Clips y Ranking", clave: "listos", nombre: "Shorts listos", ayuda: "Los Shorts montados y exportados (los que ve el Ranking)", def: path.join(BASE, "RandomClon", "Shorts Listos"), otro: "Shorts Listos" },
  { grupo: "Directos, Clips y Ranking", clave: "resultados", nombre: "Resultados del clon", ayuda: "Transcripciones, guiones y timelines del montaje", def: path.join(BASE, "RandomClon", "Resultados"), otro: "Resultados" },
  { grupo: "Directos, Clips y Ranking", clave: "bruto", nombre: "Vídeos en bruto", ayuda: "Grabaciones sin editar", def: path.join(BASE, "RandomClon", "Vídeos en bruto"), otro: "Vídeos en bruto" },
  { grupo: "Directos, Clips y Ranking", clave: "biblioteca", nombre: "Biblioteca", ayuda: "Música, SFX y VFX del montaje (por defecto, la misma en todos los perfiles)", def: path.join(BASE, "RandomClon", "Biblioteca"), otro: null },
  { grupo: "Directos, Clips y Ranking", clave: "trabajo", nombre: "Temporales", ayuda: "Caché: proxies, voces, efectos y proyectos del editor", def: path.join(BASE, "RandomClon", "_trabajo"), otro: "_trabajo" },
  { grupo: "Convertidor", clave: "descargas", nombre: "Descargas", ayuda: "Destino por defecto de lo que descargas", def: path.join(BASE, "Convertidor YT", "Descargas"), otro: "Descargas" },
  { grupo: "RandomChat", clave: "chat", nombre: "Datos del chat", ayuda: "Configuración, registro y apodos del chat de este canal", def: path.join(BASE, "RandomChat"), otro: (id) => path.join(BASE, "RandomChat", "perfiles", id) },
  { grupo: "Historias", clave: "historias", nombre: "Proyecto de historias", ayuda: "La carpeta de RandomHistorias (guiones, planos, render)", def: path.join(BASE, "RandomHistorias"), otro: null },
  { grupo: "Historias", clave: "entregas", nombre: "Shorts entregados", ayuda: "Donde se deja cada Short terminado con su miniatura", def: path.join(BASE, "RandomHistorias", ".historiaslistas"), otro: null },
];

const userData = () => app.getPath("userData");
// v3.30: las cuentas las decide el servidor; aquí se apuntan las que se van abriendo (nombre y canal)
try { Object.assign(PERFILES, JSON.parse(fs.readFileSync(path.join(userData(), "perfiles.json"), "utf8"))); } catch (e) {}
const valido = (id) => /^[a-z0-9][a-z0-9-]{1,39}$/.test(String(id));
const dirPerfil = (id) => path.join(userData(), "perfiles", id);

let activo = "rderandom";
try { const j = JSON.parse(fs.readFileSync(path.join(userData(), "perfil.json"), "utf8")); if (valido(j.perfil)) activo = j.perfil; } catch (e) {}

function perfilActivo() { return activo; }
function canalDe(id) { return (PERFILES[id] || PERFILES.rderandom).canal; }
function dirDatos(id = activo) { return id === "rderandom" ? userData() : dirPerfil(id); }

function defecto(d, id) {
  if (id === "rderandom" || d.otro === null) return d.def;
  if (typeof d.otro === "function") return d.otro(id);
  return path.join(BASE, "Perfiles", id, d.otro);
}

function archivoCarpetas(id = activo) {
  const f = path.join(dirPerfil(id), "carpetas.json");
  if (!fs.existsSync(f)) escribir(id, {});
  return f;
}
function resolver(id, elegidas) {
  const out = {};
  for (const d of DEFS) out[d.clave] = (elegidas[d.clave] && String(elegidas[d.clave]).trim()) || defecto(d, id);
  return out;
}
function escribir(id, elegidas) {
  fs.mkdirSync(dirPerfil(id), { recursive: true });
  // el archivo va siempre COMPLETO (lo leen procesos de Python que no conocen los valores por defecto)
  const todo = resolver(id, elegidas);
  fs.writeFileSync(path.join(dirPerfil(id), "carpetas.json"), JSON.stringify(todo, null, 1));
  // y aparte, qué eligió él (para saber qué es «por defecto» y poder restablecer)
  fs.writeFileSync(path.join(dirPerfil(id), "carpetas_elegidas.json"), JSON.stringify(elegidas, null, 1));
  return todo;
}
function elegidasDe(id) {
  try { return JSON.parse(fs.readFileSync(path.join(dirPerfil(id), "carpetas_elegidas.json"), "utf8")) || {}; } catch (e) { return {}; }
}
function carpetasDe(id = activo) { return resolver(id, elegidasDe(id)); }

// ------------------------------------------------------------------ llamadas
ipcMain.handle("perfil-poner", async (e, id, info) => {
  if (!valido(id)) throw new Error("perfil no válido");
  if (info && info.canal && (!PERFILES[id] || PERFILES[id].canal !== info.canal)) {
    PERFILES[id] = { nombre: String(info.nombre || id).slice(0, 80), canal: String(info.canal).slice(0, 40) };
    try { fs.writeFileSync(path.join(userData(), "perfiles.json"), JSON.stringify(PERFILES, null, 1)); } catch (x) {}
  }
  activo = id;
  try { fs.writeFileSync(path.join(userData(), "perfil.json"), JSON.stringify({ perfil: id })); } catch (x) {}
  archivoCarpetas(id);
  return { ok: true, perfil: id, canal: canalDe(id) };
});

ipcMain.handle("carpetas-leer", async (e, id) => {
  id = valido(id) ? id : activo;
  const elegidas = elegidasDe(id);
  return { ok: true, perfil: id, archivo: archivoCarpetas(id),
    carpetas: DEFS.map(d => ({ grupo: d.grupo, clave: d.clave, nombre: d.nombre, ayuda: d.ayuda, defecto: defecto(d, id),
      valor: (elegidas[d.clave] || "") || defecto(d, id), propia: !!elegidas[d.clave],
      existe: fs.existsSync((elegidas[d.clave] || "") || defecto(d, id)) })) };
});

ipcMain.handle("carpetas-guardar", async (e, id, clave, ruta) => {
  if (!valido(id)) throw new Error("perfil no válido");
  if (!DEFS.some(d => d.clave === clave)) throw new Error("carpeta no válida");
  const elegidas = elegidasDe(id);
  if (ruta && String(ruta).trim()) {
    if (!path.isAbsolute(String(ruta))) throw new Error("la ruta tiene que ser completa");
    elegidas[clave] = String(ruta).trim();
  } else delete elegidas[clave];                 // vacía = volver a la de por defecto
  escribir(id, elegidas);
  return { ok: true };
});

ipcMain.handle("carpetas-elegir", async (e, actual) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showOpenDialog(w, { properties: ["openDirectory", "createDirectory"], defaultPath: actual || BASE });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle("carpetas-abrir", async (e, ruta) => {
  if (!ruta) return { ok: false };
  try { fs.mkdirSync(ruta, { recursive: true }); } catch (x) {}
  const err = await shell.openPath(ruta);
  return { ok: !err, error: err || null };
});

module.exports = { PERFILES, perfilActivo, canalDe, dirDatos, carpetasDe, archivoCarpetas };
