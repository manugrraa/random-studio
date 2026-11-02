// Copia el RandomChat dentro de RandomStudio para que viaje con cada versión (2-11-2026, él: "pásale al ordenador la carpeta
// con el RandomChat, que no puedo ver el chat en la otra pantalla… en forma de actualización"). En los equipos sin
// E:\A RdeRandom\RandomChat, Studio lo instala en sus datos y lo enciende en modo ESPEJO (solo lee el chat; ver
// electron/chatlocal.cjs). Se ejecuta solo antes de `npm run build` (prebuild).
//
//   chat/src/**, chat/public/** (sin media/: sonidos e imágenes de las alertas, que solo usa OBS en el portátil),
//   chat/modulos/** = su node_modules (sin fuentes TypeScript, mapas ni el bundle de navegador de youtubei.js; con otro nombre
//   porque electron-builder quita las carpetas node_modules que no son de la app), chat/package.json
//   chat/manifiesto.json -> { fecha, huella }
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ORIGEN = process.env.RANDOMCHAT_DIR || "E:\\A RdeRandom\\RandomChat";
const DEST = path.join(APP, "chat");

if (!fs.existsSync(path.join(ORIGEN, "src", "server.js"))) {
  console.log("chat: no encuentro " + ORIGEN + " (se deja la copia que hubiera)");
  process.exit(0);
}

// qué NO viaja (rutas relativas a la carpeta del chat, con /)
const fuera = (rel) =>
  /^public\/media(\/|$)/.test(rel) ||
  /^node_modules\/youtubei\.js\/(bundle|src|protos)(\/|$)/.test(rel) ||
  /\.(map|d\.ts|ts|md)$/i.test(rel) && !/^src\//.test(rel);

const h = crypto.createHash("sha256");
let n = 0, bytes = 0;
function copiar(rel) {
  const de = path.join(ORIGEN, rel);
  const st = fs.statSync(de);
  if (st.isDirectory()) {
    for (const f of fs.readdirSync(de).sort()) {
      const r = rel ? rel + "/" + f : f;
      if (!fuera(r)) copiar(r);
    }
    return;
  }
  const datos = fs.readFileSync(de);
  const a = path.join(DEST, rel.replace(/^node_modules(?=\/|$)/, "modulos"));
  fs.mkdirSync(path.dirname(a), { recursive: true });
  fs.writeFileSync(a, datos);
  h.update(rel); h.update(datos);
  n++; bytes += datos.length;
}

fs.rmSync(DEST, { recursive: true, force: true });
for (const r of ["src", "public", "node_modules", "package.json"]) copiar(r);
const manifiesto = { fecha: new Date().toISOString(), huella: h.digest("hex").slice(0, 16), archivos: n };
fs.writeFileSync(path.join(DEST, "manifiesto.json"), JSON.stringify(manifiesto, null, 1));
console.log(`chat: ${n} archivos (${(bytes / 1e6).toFixed(1)} MB) copiados a app/chat · huella ${manifiesto.huella}`);
