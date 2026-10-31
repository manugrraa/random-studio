/* Google Drive como almacén de RandomStudio (v3.30).
 *
 * Sube archivos ENTEROS, tal cual (Drive guarda el original byte a byte: el Short y la miniatura no pierden calidad;
 * lo comprobamos comparando el MD5 de Drive con el del archivo del disco). Permiso «drive.file»: la app solo ve y toca
 * lo que ella misma ha subido, nunca el resto de tu Drive.
 * Estructura: RandomStudio / <perfil> / <apartado> / <carpeta> / archivo
 *
 * Se registra solo con require("./drive.cjs") (desde historias.cjs).
 */
const { ipcMain } = require("electron");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const API = "https://www.googleapis.com/drive/v3";
const SUBIDA = "https://www.googleapis.com/upload/drive/v3/files";
const CARPETA = "application/vnd.google-apps.folder";
const TIPOS = { ".mp4": "video/mp4", ".png": "image/png", ".jpg": "image/jpeg", ".wav": "audio/wav", ".mp3": "audio/mpeg", ".txt": "text/plain", ".json": "application/json", ".zip": "application/zip" };

async function g(token, url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { Authorization: "Bearer " + token, ...(opts.headers || {}) } });
  if (!r.ok) {
    const t = await r.text();
    if (r.status === 403 && /insufficient|scope/i.test(t)) throw new Error("Falta el permiso de Drive: vuelve a conectar Google (Ajustes → Google)");
    throw new Error("Drive " + r.status + ": " + t.slice(0, 200));
  }
  return r;
}

const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
async function carpeta(token, nombre, padre) {
  const q = `name='${esc(nombre)}' and mimeType='${CARPETA}' and trashed=false and '${padre || "root"}' in parents`;
  const j = await (await g(token, API + "/files?fields=files(id)&q=" + encodeURIComponent(q))).json();
  if (j.files && j.files[0]) return j.files[0].id;
  const c = await (await g(token, API + "/files?fields=id", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: nombre, mimeType: CARPETA, parents: [padre || "root"] }) })).json();
  return c.id;
}
async function rutaCarpetas(token, partes) {
  let id = null;
  for (const p of partes) id = await carpeta(token, String(p).slice(0, 120), id);
  return id;
}

function md5(ruta) {
  return new Promise((ok, ko) => {
    const h = crypto.createHash("md5");
    fs.createReadStream(ruta).on("data", d => h.update(d)).on("end", () => ok(h.digest("hex"))).on("error", ko);
  });
}

/** Sube (o sustituye, si ya existe con el mismo nombre en esa carpeta) un archivo. Subida reanudable por trozos. */
async function subir(token, ruta, partes, alProgreso) {
  const tam = fs.statSync(ruta).size, nombre = path.basename(ruta);
  const padre = await rutaCarpetas(token, partes);
  const q = `name='${esc(nombre)}' and '${padre}' in parents and trashed=false`;
  const prev = ((await (await g(token, API + "/files?fields=files(id)&q=" + encodeURIComponent(q))).json()).files || [])[0];
  const tipo = TIPOS[path.extname(ruta).toLowerCase()] || "application/octet-stream";
  const ini = await g(token, (prev ? SUBIDA + "/" + prev.id : SUBIDA) + "?uploadType=resumable&fields=id,md5Checksum,webViewLink,webContentLink,size", {
    method: prev ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": tipo, "X-Upload-Content-Length": String(tam) },
    body: JSON.stringify(prev ? { name: nombre } : { name: nombre, parents: [padre] }),
  });
  const sesion = ini.headers.get("location");
  const TROZO = 16 * 1024 * 1024;
  const fd = fs.openSync(ruta, "r");
  let enviado = 0, fin = null;
  try {
    while (enviado < tam || tam === 0) {
      const n = Math.min(TROZO, tam - enviado), buf = Buffer.alloc(n);
      fs.readSync(fd, buf, 0, n, enviado);
      const r = await fetch(sesion, { method: "PUT", headers: { "Content-Length": String(n), "Content-Range": tam ? `bytes ${enviado}-${enviado + n - 1}/${tam}` : "bytes */0" }, body: buf });
      if (r.status === 308) { enviado += n; alProgreso && alProgreso(enviado / tam); continue; }
      if (!r.ok) throw new Error("Drive " + r.status + ": " + (await r.text()).slice(0, 200));
      fin = await r.json(); enviado = tam; alProgreso && alProgreso(1);
      break;
    }
  } finally { fs.closeSync(fd); }
  const local = await md5(ruta);
  if (fin.md5Checksum && fin.md5Checksum !== local) throw new Error("La copia de Drive no es idéntica a la del disco (" + nombre + ")");
  return { id: fin.id, nombre, tam, md5: local, verificado: fin.md5Checksum === local, ver: fin.webViewLink, bajar: fin.webContentLink, carpeta: padre };
}

async function espacio(token) {
  const j = await (await g(token, API + "/about?fields=storageQuota")).json();
  const q = j.storageQuota || {};
  return { limite: Number(q.limit || 0), usado: Number(q.usage || 0), enDrive: Number(q.usageInDrive || 0) };
}

ipcMain.handle("drive-espacio", async (e, token) => {
  try { return { ok: true, ...(await espacio(token)) }; } catch (x) { return { ok: false, error: x.message }; }
});

module.exports = { subir, espacio, rutaCarpetas };
