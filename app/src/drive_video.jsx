import React from "react";
const { useState, useEffect } = React;
import { driveTokenTrabajo, tokenTrabajo } from "./sesion_historias";

/* v3.43.3 (pedido del 2-11): el animatic (y la voz) se ven DENTRO de RandomStudio desde cualquier sitio: escritorio de
 * cualquier equipo y web del móvil. El equipo que lo hace lo sube a Drive; aquí se baja con la sesión de Google de este
 * equipo (primero Drive «drive.file», si no la de YouTube, que lleva «drive.readonly») y se reproduce en la app.
 * Se guarda en memoria mientras la app está abierta: abrir y cerrar la tarjeta no lo vuelve a bajar. */
const cache = new Map();                                   // "id@fecha" -> url del vídeo en memoria

export const idDeDrive = (l) => (l && (l.id || (String(l.ver || "").match(/\/d\/([\w-]+)/) || [])[1])) || null;

async function bajarDeDrive(id, alProgreso) {
  let ultimo = "No hay sesión de Google en este equipo";
  for (const tk of [driveTokenTrabajo, tokenTrabajo]) {
    let token; try { token = await tk(); } catch (e) { continue; }
    if (!token) continue;
    const r = await fetch("https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(id) + "?alt=media", { headers: { Authorization: "Bearer " + token } });
    if (!r.ok) { ultimo = "Drive " + r.status; continue; }
    const total = Number(r.headers.get("content-length") || 0), trozos = [];
    let n = 0;
    const lector = r.body.getReader();
    for (;;) { const { done, value } = await lector.read(); if (done) break; trozos.push(value); n += value.length; if (total) alProgreso(n / total); }
    return URL.createObjectURL(new Blob(trozos, { type: r.headers.get("content-type") || "video/mp4" }));
  }
  throw new Error(ultimo);
}

/** Reproductor de un archivo de Drive (enlace de driveRevision: { id?, ver, fecha }). audio: true para la voz. */
export function VideoDrive({ link, audio, ancho = 340 }) {
  const id = idDeDrive(link), clave = id + "@" + (link && link.fecha);
  const [url, setUrl] = useState(() => cache.get(clave) || null);
  const [prog, setProg] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!id || cache.has(clave)) { setUrl(cache.get(clave) || null); return; }
    let vivo = true;
    setUrl(null); setError(""); setProg(0);
    bajarDeDrive(id, (f) => vivo && setProg(f))
      .then(u => { cache.set(clave, u); if (vivo) setUrl(u); })
      .catch(e => vivo && setError(e.message || String(e)));
    return () => { vivo = false; };
  }, [clave]);
  if (!id) return null;
  const estilo = { width: "100%", maxWidth: ancho, borderRadius: 12, border: "1px solid var(--border)", display: "block", background: "#000" };
  if (url) return audio ? <audio controls src={url} style={{ width: "100%" }} /> : <video controls playsInline src={url} style={estilo} />;
  if (error) return (
    <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>No pude traerlo de Drive ({error}).{" "}
      {link.ver && <a href={link.ver} target="_blank" rel="noopener" style={{ color: "var(--gold)" }}>Abrirlo en Drive</a>}</div>);
  return <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>Trayéndolo de Drive… {prog ? Math.round(prog * 100) + " %" : ""}</div>;
}
