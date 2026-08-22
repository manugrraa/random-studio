/* Genera build/icon.png (256x256) a partir del icono PNG incrustado en el HTML original. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Jimp from "jimp";

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = fs.readFileSync(path.join(raiz, "..", "index.html"), "utf8");
const m = src.match(/apple-touch-icon" href="data:image\/png;base64,([^"]+)"/);
if (!m) { console.error("No encuentro el icono base64"); process.exit(1); }
const buf = Buffer.from(m[1], "base64");
fs.mkdirSync(path.join(raiz, "build"), { recursive: true });
const img = await Jimp.read(buf);
img.resize(256, 256, Jimp.RESIZE_BICUBIC);
await img.writeAsync(path.join(raiz, "build", "icon.png"));
console.log("OK: build/icon.png (256x256)");
