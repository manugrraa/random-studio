/* Copia la build (un solo archivo) al index.html del repo, que GitHub Pages sirve al móvil. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const origen = path.join(raiz, "dist", "index.html");
const destino = path.join(raiz, "..", "index.html");
if (!fs.existsSync(origen)) { console.error("Primero ejecuta la build (npm run build)"); process.exit(1); }
fs.copyFileSync(origen, destino);
console.log("OK: build copiada a " + destino);
