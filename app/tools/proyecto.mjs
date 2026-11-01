// Copia el CÓDIGO del proyecto de historias (kit, herramientas e instrucciones del estudio) dentro de RandomStudio, para
// que viaje con cada versión y los demás equipos (el ordenador) rueden con el mismo kit que el portátil (1-11-2026).
// Se ejecuta solo antes de `npm run build` (prebuild). No copia vídeos, audios ni historias: solo .py y .md.
//
//   proyecto/kit/*.py, proyecto/tools/*.py, proyecto/tools/estudio/*.md
//   proyecto/manifiesto.json  -> { fecha, archivos: { "kit/camera.py": sha256, ... } }
//
// En el equipo de origen deja el archivo .origen_kit: ahí nunca se sobrescribe nada al arrancar.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ORIGEN = process.env.RH_ORIGEN || "E:\\A RdeRandom\\RandomHistorias";
const DEST = path.join(APP, "proyecto");
const QUE = [["kit", /\.py$/], ["tools", /\.py$/], [path.join("tools", "estudio"), /\.md$/]];

if (!fs.existsSync(path.join(ORIGEN, "kit"))) {
  console.log("proyecto: no encuentro " + ORIGEN + " (se deja la copia que hubiera)");
  process.exit(0);
}
fs.rmSync(DEST, { recursive: true, force: true });
const archivos = {};
for (const [dir, re] of QUE) {
  const src = path.join(ORIGEN, dir);
  if (!fs.existsSync(src)) continue;
  for (const n of fs.readdirSync(src)) {
    const f = path.join(src, n);
    if (!fs.statSync(f).isFile() || !re.test(n)) continue;
    const rel = path.join(dir, n).replace(/\\/g, "/");
    const buf = fs.readFileSync(f);
    fs.mkdirSync(path.join(DEST, dir), { recursive: true });
    fs.writeFileSync(path.join(DEST, rel), buf);
    archivos[rel] = crypto.createHash("sha256").update(buf).digest("hex");
  }
}
fs.writeFileSync(path.join(DEST, "manifiesto.json"), JSON.stringify({ fecha: new Date().toISOString(), archivos }, null, 1));
fs.writeFileSync(path.join(ORIGEN, ".origen_kit"), "Este equipo es el ORIGEN del kit: RandomStudio nunca sobrescribe aquí kit/ ni tools/.\n");
console.log(`proyecto: ${Object.keys(archivos).length} archivos del kit copiados dentro de RandomStudio`);
