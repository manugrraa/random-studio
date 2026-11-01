/* Arranque de RandomStudio (v3.35): elige qué versión del código cargar. Es lo primero que se ejecuta (package.json "main").
 *
 * Cómo se actualiza ahora (sin scripts externos ni cierres a la fuerza, que hacían perder sesiones):
 *  - Cada versión nueva se guarda como un archivo aparte: <carpeta del programa>/versiones/RandomStudio-<v>.asar
 *    (comprobado con SHA-256 antes de guardarlo). La app instalada (resources/app.asar) NUNCA se sobrescribe.
 *  - versiones/actual.json dice cuál usar. Al pulsar «Actualizar ahora», la app guarda todo en disco, se cierra de forma
 *    normal (app.quit) y Electron la vuelve a abrir (app.relaunch); este archivo carga entonces la versión nueva.
 *  - Si una versión nueva no llega a arrancar bien (3 intentos sin confirmarse), se vuelve sola a la instalada.
 *  - Si la instalada es igual o más nueva que la descargada (p. ej. tras reinstalar), se usa la instalada.
 */
const { app } = require("electron");
const fs = require("original-fs");          // los .asar se tratan como archivos, no como carpetas
const path = require("path");

const num = (v) => String(v || "0.0.0").split(".").map(Number).reduce((a, n) => a * 1000 + (n || 0), 0);
// junto al programa (no en AppData: Windows desvía AppData para algunos programas que lanzan otros y no lo verían igual)
const dirVersiones = path.join(path.dirname(process.execPath), "versiones");
const actualJson = path.join(dirVersiones, "actual.json");
const base = require("../package.json").version;

let destino = null;
try {
  const act = JSON.parse(fs.readFileSync(actualJson, "utf8"));
  const asar = path.join(dirVersiones, path.basename(String(act.archivo || "")));
  if (act.version && !act.fallida && num(act.version) > num(base) && fs.existsSync(asar)) {
    if (!act.ok) {                           // aún sin confirmar que arranca: se cuentan los intentos
      act.intentos = (act.intentos || 0) + 1;
      if (act.intentos > 3) act.fallida = true;
      fs.writeFileSync(actualJson, JSON.stringify(act, null, 1));
    }
    if (!act.fallida) destino = asar;
  }
} catch (e) {}

global.RS_VERSIONES = dirVersiones;
global.RS_ASAR = destino || path.resolve(__dirname, "..");     // el código que de verdad se está ejecutando
global.RS_BASE = base;

if (destino) require(path.join(destino, "electron", "main.cjs"));
else require("./main.cjs");
