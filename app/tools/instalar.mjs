/* Deja RandomStudio en una carpeta FIJA (1/11/2026). Él: "haz la aplicación fija, que no se quite de la barra de
   tareas cuando pasa cierto tiempo". El .exe portable se descomprimía cada vez en una carpeta temporal y Windows
   anclaba esa ruta, que luego se borra. Ahora la versión nueva (release/win-unpacked) se copia siempre a
   E:\A RdeRandom\RandomStudio\App\RandomStudio.exe (misma ruta y nombre en cada versión: lo anclado sigue valiendo),
   con un acceso directo al lado y en el menú Inicio, y se quitan los «RandomStudio X.Y.Z.exe» de antes.
   `npm run dist` lo hace solo al final; también vale desde un worktree (la ruta de destino es fija). */
import fs from "fs";
import path from "path";
import { execSync, spawnSync } from "child_process";
import { fileURLToPath } from "url";

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const origen = path.join(raiz, "release", "win-unpacked");
const CARPETA = process.env.RANDOMSTUDIO_CARPETA || "E:\\A RdeRandom\\RandomStudio";
const destino = path.join(CARPETA, "App");
const exe = path.join(destino, "RandomStudio.exe");
const version = JSON.parse(fs.readFileSync(path.join(raiz, "package.json"), "utf8")).version;
const electronVersion = JSON.parse(fs.readFileSync(path.join(raiz, "node_modules", "electron", "package.json"), "utf8")).version;

if (!fs.existsSync(path.join(origen, "RandomStudio.exe"))) { console.error("No está release/win-unpacked: ejecuta antes electron-builder"); process.exit(1); }
const ps = cmd => execSync(`powershell -NoProfile -Command "${cmd.replace(/"/g, '\\"')}"`, { encoding: "utf8" }).trim();
// abierta desde la carpeta fija: Windows no deja reemplazar sus archivos
const abiertas = ps(`@(Get-Process RandomStudio -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '${destino}\\*' }).Count`);
if (Number(abiertas) > 0) {
  // v3.33: con la app abierta, si solo cambia el código (mismo Electron), se deja preparada al lado y la propia app
  // enseña «Hay una versión nueva · Actualizar ahora» (electron/actualizar.cjs hace el cambio al reiniciarse)
  // el .exe cambia en cada build (lleva la huella del código), así que se compara la versión de Electron apuntada al instalar
  let instalado = ""; try { instalado = fs.readFileSync(path.join(destino, "electron-version.txt"), "utf8").trim(); } catch (e) {}
  if (instalado && instalado === electronVersion) {
    fs.copyFileSync(path.join(origen, "resources", "app.asar"), path.join(destino, "resources", "app.asar.nueva"));
    fs.writeFileSync(path.join(destino, "resources", "app.asar.nueva.json"), JSON.stringify({ version }));
    console.log(`OK: RandomStudio ${version} preparada; la app avisará para actualizar (sin cerrarla ahora).`);
    process.exit(0);
  }
  console.error("RandomStudio está abierto y esta versión cambia Electron: ciérralo y vuelve a ejecutar `npm run instalar`."); process.exit(1);
}

// copia espejo (lo que sobra de la versión anterior se quita)
const r = spawnSync("robocopy", [origen, destino, "/MIR", "/NFL", "/NDL", "/NJH", "/NJS", "/NP", "/R:2", "/W:1"], { encoding: "utf8" });
if (r.status >= 8) { console.error("robocopy falló:", r.stdout, r.stderr); process.exit(1); }

fs.writeFileSync(path.join(destino, "electron-version.txt"), electronVersion);
try { fs.unlinkSync(path.join(destino, "resources", "app.asar.nueva")); fs.unlinkSync(path.join(destino, "resources", "app.asar.nueva.json")); } catch (e) {}

// accesos directos: junto a la carpeta y en el menú Inicio
const atajo = (lnk) => ps(`$s=(New-Object -ComObject WScript.Shell).CreateShortcut('${lnk}'); $s.TargetPath='${exe}'; ` +
  `$s.WorkingDirectory='${destino}'; $s.IconLocation='${exe},0'; $s.Description='RandomStudio ${version}'; $s.Save()`);
atajo(path.join(CARPETA, "RandomStudio.lnk"));
const inicio = path.join(process.env.APPDATA || "", "Microsoft", "Windows", "Start Menu", "Programs", "RandomStudio.lnk");
try { atajo(inicio); } catch (e) { console.warn("Sin acceso directo en el menú Inicio:", e.message); }

// los ejecutables portables de antes (una sola versión)
for (const f of fs.readdirSync(CARPETA)) {
  if (/^RandomStudio[ -]\d+\.\d+\.\d+\.exe$/i.test(f)) { try { fs.unlinkSync(path.join(CARPETA, f)); console.log("Quitado", f); } catch (e) { console.warn("No pude quitar", f, "(¿abierto?)"); } }
}
console.log(`OK: RandomStudio ${version} en ${exe}`);
