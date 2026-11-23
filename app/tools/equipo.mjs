/* (4.11.0) PUBLICAR DESDE CUALQUIER EQUIPO: dónde está RandomStudio instalado en ESTE equipo y qué código lleva.
 *  - carpetaApp(): RANDOMSTUDIO_APP (la carpeta del .exe) · RANDOMSTUDIO_CARPETA\App · la del RandomStudio abierto ahora ·
 *    E:\A RdeRandom\RandomStudio\App (el portátil).
 *  - asarEnUso(carpeta): el código que de verdad ejecuta (versiones/actual.json si vale; si no, resources/app.asar).
 * En el Ordenador la app está en D:\RDeRandom\RandomHistorias\RandomStudio (el .exe suelto, sin «App»). */
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const num = (v) => String(v || "0.0.0").split(".").map(Number).reduce((a, n) => a * 1000 + (n || 0), 0);

export function carpetaApp() {
  if (process.env.RANDOMSTUDIO_APP) return process.env.RANDOMSTUDIO_APP;
  if (process.env.RANDOMSTUDIO_CARPETA) return path.join(process.env.RANDOMSTUDIO_CARPETA, "App");
  try {
    const p = execSync(`powershell -NoProfile -Command "(Get-Process RandomStudio -ErrorAction SilentlyContinue | Where-Object { $_.Path } | Select-Object -First 1).Path"`,
      { encoding: "utf8" }).trim();
    if (p && fs.existsSync(p)) return path.dirname(p);
  } catch (e) {}
  // con la app cerrada: la del portátil, o la del Ordenador; nunca una carpeta sin RandomStudio (sería una segunda copia)
  const c = ["E:\\A RdeRandom\\RandomStudio\\App", "D:\\RDeRandom\\RandomHistorias\\RandomStudio"].find(d => fs.existsSync(path.join(d, "RandomStudio.exe")));
  if (c) return c;
  throw new Error("No sé dónde está RandomStudio en este equipo: ábrelo o pon RANDOMSTUDIO_APP=<carpeta del .exe>");
}

export function asarEnUso(carpeta) {
  const instalada = path.join(carpeta, "resources", "app.asar");
  try {
    const act = JSON.parse(fs.readFileSync(path.join(carpeta, "versiones", "actual.json"), "utf8"));
    const a = path.join(carpeta, "versiones", path.basename(String(act.archivo || "")));
    if (act.version && !act.fallida && fs.existsSync(a)) return a;
  } catch (e) {}
  return fs.existsSync(instalada) ? instalada : null;
}

/** Copia la carpeta <prefijo>/ de la versión instalada aquí dentro de la app (app/<prefijo>/). Devuelve { n, asar }. */
export async function sacarDeInstalada(prefijo, APP) {
  const asarF = asarEnUso(carpetaApp());
  if (!asarF) throw new Error("no encuentro la versión instalada");
  const asar = (await import("@electron/asar")).default;
  const lista = asar.listPackage(asarF).map(x => x.replace(/\\/g, "/").replace(/^\//, "")).filter(x => x.startsWith(prefijo + "/"));
  fs.rmSync(path.join(APP, prefijo), { recursive: true, force: true });
  let n = 0;
  for (const rel of lista) {
    let datos; try { datos = asar.extractFile(asarF, rel.replace(/\//g, path.sep)); } catch (e) { continue; }   // (las carpetas no se extraen)
    if (!datos) continue;
    const a = path.join(APP, rel);
    fs.mkdirSync(path.dirname(a), { recursive: true });
    fs.writeFileSync(a, datos); n++;
  }
  if (!fs.existsSync(path.join(APP, prefijo, "manifiesto.json"))) throw new Error("la versión instalada (" + asarF + ") no lleva " + prefijo + "/");
  return { n, asar: asarF };
}

export { num };
