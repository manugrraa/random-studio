import React from "react";
import { YT_BACKEND, cloudToken, ytAddToPlaylist, ytEnsureToken, ytGetTokens, ytGetVideoDetails, ytIsConnected, ytListMyVideos, ytListPlaylists, ytSetThumbnail } from "./datos";
import { cabecerasEquipo } from "./seguridad";
const { useState, useEffect, useMemo, useCallback } = React;

/* ============================ REDES (5/11/2026) ============================
   Él: "que se puedan programar los Shorts en mi Instagram y TikTok… elijo el de los carriles, pero cada vídeo lo voy
   a subir a cada red social; me gustaría personalizar la programación de cada red individualmente".
   - CarrilesView: una fila por red (YouTube, Instagram, TikTok) y una columna por día. A la izquierda, la bandeja con
     los vídeos exportados del perfil. Se arrastra uno a un día de Instagram o TikTok: hora (la de esa red por defecto)
     y texto; y, si quieres, también en la otra red con su propia hora.
   - Lo publica el servidor a su hora (/api/social, cada 5 min), con los equipos apagados.
   - RedStats: las estadísticas de Instagram y TikTok (seguidores y cada publicación con sus números). */

export const RED = {
  youtube: { nombre: "YouTube", icono: "▶", color: "#FF3B3B" },
  instagram: { nombre: "Instagram", icono: "◉", color: "#E1306C" },
  tiktok: { nombre: "TikTok", icono: "♪", color: "#25F4EE" },
};
const HORA_DEF = { youtube: "18:00", instagram: "19:00", tiktok: "20:00" };
const ls = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
const fileUrl = p => p ? "file:///" + p.replace(/\\/g, "/").split("/").map(encodeURIComponent).join("/").replace(/^([A-Za-z])%3A/, "$1:") : null;
const isoDia = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");

export async function socialApi(accion, datos) {
  const token = await cloudToken();
  const r = await fetch(YT_BACKEND + "/api/social", { method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token, ...(await cabecerasEquipo("POST", "/api/social")) },
    body: JSON.stringify({ accion, ...(datos || {}) }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.success) throw new Error(j.error || ("Error " + r.status));
  return j;
}

function useSocial() {
  const [est, setEst] = useState(null);
  const [error, setError] = useState("");
  const leer = useCallback(async () => { try { setEst(await socialApi("estado")); setError(""); } catch (e) { setError(e.message); } }, []);
  useEffect(() => { leer(); const t = setInterval(leer, 30000); return () => clearInterval(t); }, [leer]);
  return [est, leer, error];
}

function Cuentas({ est, leer, toast }) {
  const conectar = async red => {
    try { const r = await socialApi("conectar", { red }); window.open(r.url); toast && toast("Se ha abierto " + RED[red].nombre + ": acepta los permisos y vuelve aquí");
      setTimeout(leer, 20000); }
    catch (e) { toast && toast("✕ " + e.message); }
  };
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      {["instagram", "tiktok"].map(red => {
        const c = est && (est.cuentas || []).find(x => x.red === red), app = est && est.apps && est.apps[red];
        return (
          <span key={red} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, padding: "5px 10px", borderRadius: 99, border: "1px solid var(--border)", background: "var(--card)" }}>
            <b style={{ color: RED[red].color }}>{RED[red].icono}</b>
            {c ? <span style={{ color: "#4ade80", fontWeight: 700 }}>{c.usuario ? (red === "instagram" ? "@" : "") + c.usuario : "Conectado"}</span>
              : !est ? "…" : !app ? <span style={{ color: "var(--text-3)" }} title="Falta crear la app de desarrollador y poner sus claves en Vercel (te lo explico en el chat)">{RED[red].nombre}: sin configurar</span>
              : <button onClick={() => conectar(red)} style={{ fontSize: 12, fontWeight: 700, color: "var(--gold)" }}>Conectar {RED[red].nombre}</button>}
            {c && <button onClick={async () => { if (!confirm("¿Desconectar " + RED[red].nombre + " de este perfil?")) return; await socialApi("desconectar", { red }).catch(() => {}); leer(); }}
              style={{ fontSize: 11, color: "var(--text-3)" }} title="Desconectar">✕</button>}
          </span>);
      })}
    </div>);
}

/* ---------- portada / miniatura (6/11, él: «poder subir las miniaturas desde RandomStudio, en YouTube y en Instagram»)
   Sale sola la «<TÍTULO> - miniatura.png» que está junto al vídeo (la de las historias); si no, se elige un fotograma
   del vídeo o una imagen del PC. */
const urlLocal = (f) => "file:///" + encodeURI(String(f || "").replace(/\\/g, "/"));
function Portada({ video, valor, onCambio, toast }) {
  const [viendo, setViendo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const ref = React.useRef(null);
  const sf = window.studioFS || {};
  const poner = async (o, origen) => {
    if (!sf.redesPortada) return;
    setOcupado(true);
    try { const r = await sf.redesPortada(o); if (r.error) throw new Error(r.error); onCambio({ ...r, origen, segundo: o.segundo != null ? o.segundo : null }); setViendo(false); }
    catch (e) { toast && toast("✕ " + e.message); } finally { setOcupado(false); }
  };
  const elegir = (e) => {
    const f = e.target.files && e.target.files[0]; e.target.value = "";
    if (!f) return;
    const rd = new FileReader(); rd.onload = () => poner({ dataUrl: rd.result }, "archivo"); rd.readAsDataURL(f);
  };
  const boton = { fontSize: 12, padding: "5px 9px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card-2)" };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
      <span>Miniatura</span>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        {valor ? <img src={valor.vista} alt="" style={{ width: 72, height: 128, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)" }} />
          : <div style={{ width: 72, height: 128, borderRadius: 8, border: "1px dashed var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "var(--text-3)", textAlign: "center" }}>Sin<br />miniatura</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
          {valor && <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>{valor.origen === "junto" ? "La de la carpeta del vídeo" : valor.origen === "fotograma" ? "Fotograma del segundo " + (valor.segundo || 0).toFixed(1) : "Imagen elegida"}</span>}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button disabled={ocupado} onClick={() => setViendo(v => !v)} style={boton}>🎞 Fotograma del vídeo</button>
            <label style={{ ...boton, cursor: "pointer" }}>🖼 Elegir imagen…<input type="file" accept="image/png,image/jpeg" onChange={elegir} style={{ display: "none" }} /></label>
            {valor && <button onClick={() => onCambio(null)} style={{ ...boton, color: "var(--text-3)" }}>Quitar</button>}
          </div>
          {ocupado && <span style={{ fontSize: 11.5, color: "var(--gold)" }}>Preparando la imagen…</span>}
        </div>
      </div>
      {viendo && (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <video ref={ref} src={urlLocal(video)} controls style={{ width: 160, borderRadius: 8, background: "#000" }} />
          <button disabled={ocupado} className="grad-gold" onClick={() => poner({ video, segundo: ref.current ? ref.current.currentTime : 0 }, "fotograma")}
            style={{ fontSize: 12, fontWeight: 700, padding: "6px 10px", borderRadius: 8, color: "#000" }}>Usar este fotograma</button>
        </div>)}
    </div>);
}

/* ---------- programar (el cuadro que sale al soltar un vídeo en un día) ---------- */
function Programar({ video, dia, red, cuentas, onCerrar, onHecho, toast }) {
  const otra = red === "instagram" ? "tiktok" : "instagram";
  const conectada = r => (cuentas || []).some(x => x.red === r);
  const [hora, setHora] = useState(() => ls("rds_redes_hora_" + red, HORA_DEF[red]));
  const [tambien, setTambien] = useState(() => conectada(otra) && ls("rds_redes_tambien", "1") === "1");
  const [horaOtra, setHoraOtra] = useState(() => ls("rds_redes_hora_" + otra, HORA_DEF[otra]));
  const [texto, setTexto] = useState(() => (video.nombre || "").replace(/^\d+\s*-\s*/, "") + (ls("rds_redes_coletilla", "") ? "\n\n" + ls("rds_redes_coletilla", "") : ""));
  const [paso, setPaso] = useState("");
  // (6/11) arreglado: la expresión no tenía las barras y no quitaba el «94 - » del principio
  const [tituloYt, setTituloYt] = useState(() => (video.nombre || "").replace(/^\d+\s*-\s*/, ""));
  const [pct, setPct] = useState(null);
  const esYt = red === "youtube";
  // (6/11, él: «las miniaturas, copiar las descripciones de otros vídeos, esos detallitos que me gustan»)
  const plantilla = (() => { try { return JSON.parse(ls("rds_yt_plantilla", "null")); } catch (e) { return null; } })();
  const [portada, setPortada] = useState(null);
  const [tags, setTags] = useState(() => esYt ? ls("rds_yt_tags", (plantilla && plantilla.tags) || "") : "");
  const [categoria, setCategoria] = useState(() => ls("rds_yt_categoria", "20"));
  const [lista, setLista] = useState(() => ls("rds_yt_lista", ""));
  const [listas, setListas] = useState([]);
  const [otros, setOtros] = useState(null);       // vídeos del canal (YouTube) o publicaciones (Instagram/TikTok) para copiar
  const [copiando, setCopiando] = useState(false);
  useEffect(() => {
    const sf = window.studioFS || {};
    if (sf.redesPortadaJunto && sf.redesPortada) sf.redesPortadaJunto(video.video).then(j => j && j.ruta ? sf.redesPortada({ ruta: j.ruta }) : null)
      .then(r => { if (r && r.ok) setPortada(p => p || { ...r, origen: "junto" }); }).catch(() => {});
    if (esYt) {
      if (plantilla && plantilla.texto) setTexto(plantilla.texto);
      ytEnsureToken().then(ok => ok && ytListPlaylists()).then(l => setListas(l || [])).catch(() => {});
    }
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const cargarOtros = async () => {
    if (otros) return;
    try {
      if (esYt) { await ytEnsureToken(); setOtros((await ytListMyVideos(30)).map(v => ({ id: v.id, titulo: v.title }))); }
      else { const e = await socialApi("estadisticas", { red }); setOtros((Array.isArray(e.pubs) ? e.pubs : []).filter(x => x.texto).map(x => ({ id: x.id, titulo: x.texto.split("\n")[0].slice(0, 70), texto: x.texto }))); }
    } catch (e) { toast && toast("✕ " + e.message); setOtros([]); }
  };
  const copiarDe = async (id) => {
    const o = (otros || []).find(x => x.id === id);
    if (!o) return;
    setCopiando(true);
    try {
      if (esYt) {
        const d = await ytGetVideoDetails(id);
        if (!d) throw new Error("No pude leer ese vídeo");
        setTexto(d.description || ""); setTags((d.tags || []).join(", ")); if (d.categoryId) setCategoria(d.categoryId);
      } else setTexto(o.texto);
      toast && toast("📋 Copiado de «" + o.titulo + "»");
    } catch (e) { toast && toast("✕ " + e.message); } finally { setCopiando(false); }
  };
  const guardarPlantilla = () => {
    lsSet("rds_yt_plantilla", JSON.stringify({ texto, tags }));
    toast && toast("💾 Plantilla guardada: los próximos vídeos empezarán con esta descripción y etiquetas");
  };
  /* (5/11, él: "en YouTube no me deja programar desde redes") YouTube: se sube YA desde el PC en privado con su fecha
     de publicación (publishAt) y YouTube lo publica solo a esa hora, como en la sección Vídeos. */
  const hechoYt = async () => {
    try {
      lsSet("rds_redes_hora_youtube", hora);
      if (!(await ytEnsureToken())) throw new Error("Conecta tu cuenta de Google (YouTube) en Configuración");
      const tok = ytGetTokens();
      const cuando = new Date(dia + "T" + hora + ":00");
      if (cuando.getTime() < Date.now() + 15 * 60000) throw new Error("Pon una hora de al menos 15 minutos desde ahora");
      setPaso("Subiendo a YouTube…"); setPct(0);
      const off = window.studioFS.onUploadProgress && window.studioFS.onUploadProgress(d => setPct(d.pct));
      let r;
      try {
        r = await window.studioFS.ytUpload({ filePath: video.video, token: tok.access_token,
          meta: { snippet: { title: tituloYt.trim().slice(0, 100), description: texto, categoryId: categoria || "20",
            tags: tags.split(",").map(t => t.trim()).filter(Boolean).slice(0, 30) },
            status: { privacyStatus: "private", publishAt: cuando.toISOString(), selfDeclaredMadeForKids: false } } });
      } finally { if (off) off(); setPct(null); }
      if (!r || r.error || !r.videoId) throw new Error((r && r.error) || "YouTube no devolvió el vídeo");
      lsSet("rds_yt_tags", tags); lsSet("rds_yt_categoria", categoria || "20"); lsSet("rds_yt_lista", lista || "");
      const avisos = [];
      if (portada && portada.vista) {
        setPaso("Poniendo la miniatura…");
        try { await ytSetThumbnail(r.videoId, await (await fetch(portada.vista)).blob()); } catch (e) { avisos.push("miniatura: " + e.message); }
      }
      if (lista) { try { await ytAddToPlaylist(lista, r.videoId); } catch (e) { avisos.push("lista: " + e.message); } }
      if (avisos.length) toast && toast("⚠️ Subido, pero " + avisos.join(" · "));
      toast && toast("📅 «" + tituloYt.trim() + "» programado en YouTube a las " + hora + (portada ? " con su miniatura" : "") + " (aparece en el carril al sincronizar)");
      onHecho();
    } catch (e) { toast && toast("✕ " + e.message); setPaso(""); }
  };
  const hecho = async () => {
    if (esYt) return hechoYt();
    try {
      lsSet("rds_redes_hora_" + red, hora); lsSet("rds_redes_tambien", tambien ? "1" : "0"); if (tambien) lsSet("rds_redes_hora_" + otra, horaOtra);
      setPaso("Preparando el vídeo…");
      const pr = await window.studioFS.redesPreparar(video.video);
      if (pr.error) throw new Error(pr.error);
      setPaso("Subiéndolo (" + Math.round(pr.tam / 1e6) + " MB)…");
      const sb = await socialApi("subida", { nombre: video.nombre + ".mp4", tam: pr.tam });
      const up = await window.studioFS.redesSubir(pr.ruta, sb.url, !!pr.temporal);
      if (up.error) throw new Error(up.error);
      let portadaArchivo = null;
      if (portada && portada.ruta) {
        setPaso("Subiendo la portada…");
        const sp = await socialApi("subida", { nombre: "portada.jpg", tam: portada.tam });
        const upP = await window.studioFS.redesSubir(portada.ruta, sp.url, false);
        if (upP.error) throw new Error(upP.error);
        portadaArchivo = sp.archivo;
      }
      const portadaMs = portada && portada.origen === "fotograma" ? Math.round((portada.segundo || 0) * 1000) : null;
      setPaso("Programando…");
      const redes = [[red, hora], ...(tambien ? [[otra, horaOtra]] : [])];
      for (const [r, h] of redes) {
        const cuando = new Date(dia + "T" + h + ":00");
        await socialApi("programar", { red: r, hora: cuando.toISOString(), titulo: video.nombre, caption: texto, archivo: sb.archivo, tam: pr.tam, video_ref: video.video,
          portada: portadaArchivo, portada_ms: portadaMs });
      }
      toast && toast("📅 «" + video.nombre + "» programado en " + redes.map(([r, h]) => RED[r].nombre + " a las " + h).join(" y "));
      onHecho();
    } catch (e) { toast && toast("✕ " + e.message); setPaso(""); }
  };
  const campo = { fontSize: 13, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" };
  return (
    <div onClick={onCerrar} style={{ position: "fixed", inset: 0, zIndex: 900, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 480, maxWidth: "92vw", maxHeight: "92vh", overflowY: "auto", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 16 }}><span style={{ color: RED[red].color }}>{RED[red].icono}</span> Programar en {RED[red].nombre}</div>
        <div style={{ fontSize: 13, color: "var(--text-2)" }}>«{video.nombre}» · {new Date(dia + "T12:00:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}</div>
        <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>Hora <input type="time" value={hora} onChange={e => setHora(e.target.value)} style={campo} /></label>
        {esYt && <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>Título
          <input value={tituloYt} onChange={e => setTituloYt(e.target.value)} maxLength={100} style={campo} /></label>}
        {!esYt && conectada(otra) && <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
          <input type="checkbox" checked={tambien} onChange={e => setTambien(e.target.checked)} /> También en {RED[otra].nombre}
          {tambien && <input type="time" value={horaOtra} onChange={e => setHoraOtra(e.target.value)} style={campo} />}</label>}
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>Texto (descripción)
            <select onFocus={cargarOtros} onMouseDown={cargarOtros} value="" disabled={copiando} onChange={e => copiarDe(e.target.value)}
              style={{ ...campo, padding: "4px 6px", fontSize: 12, marginLeft: "auto", maxWidth: 230 }}>
              <option value="">{copiando ? "Copiando…" : "📋 Copiar de otro " + (esYt ? "vídeo" : "post") + "…"}</option>
              {(otros || []).map(o => <option key={o.id} value={o.id}>{o.titulo}</option>)}
              {otros && !otros.length && <option disabled value="-">(no hay ninguno)</option>}
            </select></span>
          <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={5} maxLength={esYt ? 5000 : 2200} style={{ ...campo, resize: "vertical" }} /></label>
        {esYt && <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>Etiquetas <span style={{ fontSize: 11, color: "var(--text-3)" }}>(separadas por comas)</span>
          <input value={tags} onChange={e => setTags(e.target.value)} placeholder="roblox, historias de roblox…" style={campo} /></label>}
        {esYt && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, flex: 1 }}>Categoría
            <select value={categoria} onChange={e => setCategoria(e.target.value)} style={campo}>
              <option value="20">Videojuegos</option><option value="24">Entretenimiento</option><option value="22">Gente y blogs</option><option value="23">Comedia</option><option value="1">Cine y animación</option>
            </select></label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, flex: 1 }}>Lista de reproducción
            <select value={lista} onChange={e => setLista(e.target.value)} style={campo}>
              <option value="">(ninguna)</option>{listas.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
            </select></label>
        </div>}
        {esYt && <button onClick={guardarPlantilla} style={{ alignSelf: "flex-start", fontSize: 12, color: "var(--text-2)", padding: "4px 8px", borderRadius: 8, border: "1px solid var(--border)" }}>💾 Guardar descripción y etiquetas como plantilla</button>}
        <Portada video={video.video} valor={portada} onCambio={setPortada} toast={toast} />
        {esYt && <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>Se sube ahora en privado y YouTube lo publica solo a esa hora (con el PC apagado también).{pct != null ? " · " + pct + "%" : ""}</div>}
        {red === "tiktok" && <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>Mientras TikTok no apruebe la app, sale en privado (solo tú lo ves); cuando la apruebe, en público.</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
          {paso && <span style={{ fontSize: 12, color: "var(--gold)", marginRight: "auto" }}>{paso}</span>}
          <button onClick={onCerrar} disabled={!!paso} style={{ fontSize: 13, padding: "8px 14px", borderRadius: 9, border: "1px solid var(--border)" }}>Cancelar</button>
          <button onClick={hecho} disabled={!!paso || !hora} className="grad-gold" style={{ fontSize: 13, fontWeight: 700, padding: "8px 16px", borderRadius: 9, color: "#000" }}>📅 Programar</button>
        </div>
      </div>
    </div>);
}

/* ---------- (10-11, Manu: «programar los Shorts de las historias desde el Studio») ----------
   Desde RandomHistorias, sin ir al calendario: se elige el día y la red aquí y sale el mismo cuadro de programar. */
export function ProgramarShort({ ruta, nombre, onCerrar, toast }) {
  const [est] = useSocial();
  const [red, setRed] = useState(null);
  const [dia, setDia] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 1); return isoDia(d); });
  if (red) return <Programar video={{ video: ruta, nombre }} dia={dia} red={red} cuentas={est && est.cuentas} onCerrar={onCerrar} onHecho={onCerrar} toast={toast} />;
  const conectada = r => r === "youtube" ? ytIsConnected() : !!(est && (est.cuentas || []).some(x => x.red === r));
  const campo = { fontSize: 13, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" };
  return (
    <div onClick={onCerrar} style={{ position: "fixed", inset: 0, zIndex: 900, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 420, maxWidth: "92vw", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 16 }}>📅 Programar el Short</div>
        <div style={{ fontSize: 13, color: "var(--text-2)" }}>«{nombre}»</div>
        <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>Día
          <input type="date" value={dia} min={isoDia(new Date())} onChange={e => e.target.value && setDia(e.target.value)} style={campo} /></label>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {Object.keys(RED).map(r => {
            const ok = conectada(r);
            return (
              <button key={r} disabled={!ok || (r !== "youtube" && !est)} onClick={() => setRed(r)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--card-2)", opacity: ok ? 1 : .5, textAlign: "left" }}>
                <b style={{ color: RED[r].color, width: 16 }}>{RED[r].icono}</b>
                <span style={{ fontWeight: 700, fontSize: 13.5 }}>{RED[r].nombre}</span>
                <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--text-3)" }}>{ok ? "a las " + ls("rds_redes_hora_" + r, HORA_DEF[r]) : r === "youtube" ? "conecta YouTube en este perfil" : !est ? "…" : "conéctalo en Calendario → Redes"}</span>
              </button>);
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={onCerrar} style={{ fontSize: 13, padding: "8px 14px", borderRadius: 9, border: "1px solid var(--border)" }}>Cancelar</button>
        </div>
      </div>
    </div>);
}

/* ---------- la vista de carriles ---------- */
const mismaRuta = (a, b) => !!a && !!b && String(a).split("/").join("\\").toLowerCase() === String(b).split("/").join("\\").toLowerCase();
export function CarrilesView({ videos, weekOffset, setWeekOffset, setCalView, onOpen, toast }) {
  const [est, leer, error] = useSocial();
  const [bandeja, setBandeja] = useState(null);
  const [arrastrado, setArrastrado] = useState(null);
  const [soltando, setSoltando] = useState(null);       // { video, dia, red }
  const [encima, setEncima] = useState(null);
  const [chip, setChip] = useState(null);               // programado elegido (menú)
  const leerBandeja = () => { window.studioFS && window.studioFS.terminadosLista && window.studioFS.terminadosLista().then(r => setBandeja((r && r.lista) || [])); };
  useEffect(leerBandeja, []);
  // (8/11) el vídeo que se acaba de exportar en el RandomEditor sale resaltado (arrástralo a un día)
  const [resaltar, setResaltar] = useState(() => window.__rsResaltar || null);
  useEffect(() => { const h = e => { setResaltar(e.detail); leerBandeja(); }; window.addEventListener("rs-resaltar", h); return () => window.removeEventListener("rs-resaltar", h); }, []);
  useEffect(() => { if (!resaltar || !bandeja) return; const el = document.querySelector('[data-resaltado="1"]'); if (el) el.scrollIntoView({ block: "center" }); }, [resaltar, bandeja]);
  const base = new Date(); base.setHours(12, 0, 0, 0); base.setDate(base.getDate() - ((base.getDay() + 6) % 7) + weekOffset * 7);
  const dias = Array.from({ length: 7 }, (_, i) => { const d = new Date(base); d.setDate(base.getDate() + i); return d; });
  const hoy = isoDia(new Date());
  const progs = (est && est.programados) || [];
  const enDia = (red, d) => red === "youtube"
    ? videos.filter(v => v.date === isoDia(d)).sort((a, b) => (a.time || "99").localeCompare(b.time || "99"))
    : progs.filter(p => p.red === red && isoDia(new Date(p.hora)) === isoDia(d)).sort((a, b) => a.hora.localeCompare(b.hora));
  const redesDe = v => progs.filter(p => p.video_ref === v.video && p.estado !== "cancelado").map(p => p.red);
  const ICONO_EST = { programado: "🕒", publicando: "⏳", publicado: "✅", fallido: "⚠️" };
  const soltar = (red, d) => {
    setEncima(null);
    if (!arrastrado) return;
    if (red === "youtube") {
      if (!ytIsConnected()) { toast && toast("Conecta tu cuenta de Google (YouTube) en Configuración"); return; }
      if (isoDia(d) < hoy) { toast && toast("Ese día ya ha pasado"); return; }
      setSoltando({ video: arrastrado, dia: isoDia(d), red }); return;
    }
    if (!(est && (est.cuentas || []).some(x => x.red === red))) { toast && toast("Conecta " + RED[red].nombre + " arriba primero"); return; }
    if (isoDia(d) < hoy) { toast && toast("Ese día ya ha pasado"); return; }
    setSoltando({ video: arrastrado, dia: isoDia(d), red });
  };
  const celda = { minHeight: 74, borderRadius: 10, padding: 5, display: "flex", flexDirection: "column", gap: 4, border: "1px dashed transparent" };
  const etiqueta = d => d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric" });
  return (
    <div className="fade-in" style={{ padding: "4px 2px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>Redes · {dias[0].toLocaleDateString("es-ES", { day: "numeric", month: "short" })} – {dias[6].toLocaleDateString("es-ES", { day: "numeric", month: "short" })}</h2>
          <p style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 2 }}>Arrastra un vídeo de la bandeja a un día de YouTube, Instagram o TikTok · cada red con su hora</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Cuentas est={est} leer={leer} toast={toast} />
          <div style={{ display: "flex", gap: 3, background: "var(--card)", borderRadius: 9, padding: 3 }}>
            {[["month", "Mes"], ["week", "Semana"], ["day", "Día"], ["redes", "Redes"]].map(([k, l]) => (
              <button key={k} onClick={() => { setCalView(k); setWeekOffset(0); }} style={{ fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 6,
                background: k === "redes" ? "var(--gold)" : "transparent", color: k === "redes" ? "#000" : "var(--text-3)" }}>{l}</button>))}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {[["←", -1], ["Hoy", 0], ["→", 1]].map(([t, d]) => <button key={t} onClick={() => setWeekOffset(w => d === 0 ? 0 : w + d)}
              style={{ minWidth: 34, height: 32, padding: "0 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", fontSize: 12.5, fontWeight: 600 }}>{t}</button>)}
          </div>
        </div>
      </div>
      {error && <div style={{ fontSize: 12.5, color: "var(--red)" }}>No se pudo leer lo programado: {error}</div>}
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        {/* bandeja */}
        <div style={{ width: 210, flex: "none", display: "flex", flexDirection: "column", gap: 6, maxHeight: "70vh", overflow: "auto" }}>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".06em" }}>Bandeja · exportados</div>
          {bandeja === null && <div style={{ fontSize: 12, color: "var(--text-3)" }}>Buscando…</div>}
          {bandeja && !bandeja.length && <div style={{ fontSize: 12, color: "var(--text-3)" }}>No hay vídeos exportados en este perfil.</div>}
          {(bandeja || []).map(v => {
            const ya = redesDe(v);
            return (
              <div key={v.id} draggable onDragStart={() => setArrastrado(v)} onDragEnd={() => setArrastrado(null)} data-resaltado={mismaRuta(v.video, resaltar) ? "1" : undefined}
                title={mismaRuta(v.video, resaltar) ? "Recién exportado: arrástralo a un día" : undefined}
                style={{ display: "flex", gap: 8, alignItems: "center", padding: 6, borderRadius: 10, background: mismaRuta(v.video, resaltar) ? "rgba(212,175,55,0.16)" : "var(--card)", border: "1px solid " + (mismaRuta(v.video, resaltar) ? "var(--gold)" : "var(--border)"), cursor: "grab" }}>
                {v.miniatura ? <img src={fileUrl(v.miniatura)} alt="" style={{ width: 30, height: 46, objectFit: "cover", borderRadius: 5, flex: "none" }} />
                  : <span style={{ width: 30, height: 46, borderRadius: 5, background: "#111", flex: "none" }} />}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={v.nombre}>{v.nombre}</div>
                  <div style={{ fontSize: 11, display: "flex", gap: 4 }}>{["instagram", "tiktok"].map(r => <span key={r} style={{ color: ya.includes(r) ? RED[r].color : "var(--text-3)", opacity: ya.includes(r) ? 1 : 0.4 }}>{RED[r].icono}</span>)}</div>
                </div>
              </div>);
          })}
        </div>
        {/* carriles */}
        <div style={{ flex: 1, minWidth: 0, overflowX: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "96px repeat(7, minmax(110px, 1fr))", gap: 6 }}>
            <div />
            {dias.map(d => <div key={isoDia(d)} style={{ fontSize: 12, fontWeight: 700, textAlign: "center", color: isoDia(d) === hoy ? "var(--gold)" : "var(--text-2)", textTransform: "capitalize" }}>{etiqueta(d)}</div>)}
            {["youtube", "instagram", "tiktok"].map(red => (
              <React.Fragment key={red}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 800 }}><span style={{ color: RED[red].color, fontSize: 15 }}>{RED[red].icono}</span>{RED[red].nombre}</div>
                {dias.map(d => {
                  const k = red + isoDia(d), items = enDia(red, d);
                  return (
                    <div key={k} onDragOver={e => { e.preventDefault(); setEncima(k); }} onDragLeave={() => setEncima(x => x === k ? null : x)} onDrop={e => { e.preventDefault(); soltar(red, d); }}
                      style={{ ...celda, background: encima === k ? "rgba(212,175,55,0.14)" : "var(--card)", borderColor: encima === k ? "var(--gold)" : "transparent", opacity: isoDia(d) < hoy ? 0.6 : 1 }}>
                      {items.map(it => red === "youtube"
                        ? <button key={it.id} onClick={() => onOpen && onOpen(it)} style={{ textAlign: "left", fontSize: 11.5, padding: "4px 6px", borderRadius: 7, background: "rgba(255,59,59,0.12)", borderLeft: "3px solid " + RED.youtube.color, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            <b>{it.time || "—"}</b> {it.title}</button>
                        : <button key={it.id} onClick={() => setChip(it)} title={it.titulo + (it.resultado && it.resultado.error ? "\n⚠️ " + it.resultado.error : "")}
                            style={{ textAlign: "left", fontSize: 11.5, padding: "4px 6px", borderRadius: 7, background: RED[red].color + "1f", borderLeft: "3px solid " + RED[red].color, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {ICONO_EST[it.estado] || ""} <b>{new Date(it.hora).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</b> {it.titulo}</button>)}
                    </div>);
                })}
              </React.Fragment>))}
          </div>
        </div>
      </div>
      {soltando && <Programar {...soltando} cuentas={est && est.cuentas} toast={toast} onCerrar={() => setSoltando(null)} onHecho={() => { setSoltando(null); leer(); }} />}
      {chip && <MenuProgramado p={chip} toast={toast} onCerrar={() => setChip(null)} onCambio={() => { setChip(null); leer(); }} />}
    </div>);
}

function MenuProgramado({ p, toast, onCerrar, onCambio }) {
  const [hora, setHora] = useState(() => { const d = new Date(p.hora); return isoDia(d) + "T" + d.toTimeString().slice(0, 5); });
  const r = p.resultado || {};
  const accion = async (a, datos) => { try { await socialApi(a, { id: p.id, ...(datos || {}) }); toast && toast(a === "cancelar" ? "Cancelado" : "Hora cambiada"); onCambio(); } catch (e) { toast && toast("✕ " + e.message); } };
  // (6/11, él: «que se pueda editar un vídeo que ya está programado, para meterle la miniatura») texto y portada
  const [texto, setTexto] = useState(p.caption || "");
  const [portada, setPortada] = useState(null);
  const [guardando, setGuardando] = useState("");
  const tienePortada = !!(r.portada || r.portada_ms != null);
  const guardar = async (quitar) => {
    try {
      const datos = { caption: texto };
      if (portada && portada.ruta) {
        setGuardando("Subiendo la miniatura…");
        const sp = await socialApi("subida", { nombre: "portada.jpg", tam: portada.tam });
        const up = await window.studioFS.redesSubir(portada.ruta, sp.url, false);
        if (up.error) throw new Error(up.error);
        datos.portada = sp.archivo;
        if (portada.origen === "fotograma") datos.portada_ms = Math.round((portada.segundo || 0) * 1000);
      } else if (quitar) datos.quitar_portada = true;
      setGuardando("Guardando…");
      await socialApi("editar", { id: p.id, ...datos });
      toast && toast("✅ Cambios guardados" + (datos.portada ? " (con su miniatura)" : ""));
      onCambio();
    } catch (e) { toast && toast("✕ " + e.message); setGuardando(""); }
  };
  return (
    <div onClick={onCerrar} style={{ position: "fixed", inset: 0, zIndex: 900, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 440, maxWidth: "92vw", maxHeight: "92vh", overflowY: "auto", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontWeight: 800 }}><span style={{ color: RED[p.red].color }}>{RED[p.red].icono}</span> {p.titulo}</div>
        <div style={{ fontSize: 12.5, color: "var(--text-2)" }}>{{ programado: "Programado", publicando: "Publicándose…", publicado: "Publicado", fallido: "No se pudo publicar" }[p.estado]}
          {r.privacidad === "SELF_ONLY" ? " · en privado (TikTok aún no ha aprobado la app)" : ""}</div>
        {r.error && <div style={{ fontSize: 12, color: "var(--red)" }}>⚠️ {r.error}</div>}
        {r.enlace && <a href={r.enlace} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: "var(--gold)" }}>Ver la publicación</a>}
        {p.estado === "programado" && <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>Cuándo
          <input type="datetime-local" value={hora} onChange={e => setHora(e.target.value)} style={{ fontSize: 13, padding: "6px 8px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }} />
          <button onClick={() => accion("reprogramar", { hora: new Date(hora).toISOString() })} style={{ fontSize: 12.5, fontWeight: 700, color: "var(--gold)" }}>Cambiar</button></label>}
        {p.estado === "programado" && <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>Texto
          <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={4} maxLength={2200} style={{ fontSize: 13, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", resize: "vertical" }} /></label>}
        {p.estado === "programado" && <>
          {tienePortada && !portada && <div style={{ fontSize: 12, color: "var(--text-3)" }}>Ya tiene miniatura{r.portada_ms != null && !r.portada ? " (fotograma del segundo " + (r.portada_ms / 1000).toFixed(1) + ")" : ""}. Elige otra para cambiarla.</div>}
          <Portada video={p.video_ref} valor={portada} onCambio={setPortada} toast={toast} />
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {guardando && <span style={{ fontSize: 12, color: "var(--gold)" }}>{guardando}</span>}
            <span style={{ flex: 1 }} />
            {tienePortada && !portada && <button disabled={!!guardando} onClick={() => guardar(true)} style={{ fontSize: 12.5, color: "var(--text-3)" }}>Quitar miniatura</button>}
            <button disabled={!!guardando || (texto === (p.caption || "") && !portada)} onClick={() => guardar(false)} className="grad-gold"
              style={{ fontSize: 12.5, fontWeight: 700, padding: "6px 12px", borderRadius: 8, color: "#000", opacity: (texto === (p.caption || "") && !portada) ? .5 : 1 }}>Guardar cambios</button>
          </div></>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          {(p.estado === "programado" || p.estado === "fallido") && <button onClick={() => { if (confirm("¿Cancelar esta publicación?")) accion("cancelar"); }} style={{ fontSize: 13, color: "var(--red)", padding: "6px 12px" }}>Cancelar publicación</button>}
          <button onClick={onCerrar} style={{ fontSize: 13, padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border)" }}>Cerrar</button>
        </div>
      </div>
    </div>);
}

/* ---------- estadísticas de Instagram y TikTok ---------- */
export function RedStats({ red, toast }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState("");
  const leer = async () => { setError(""); try { setD(await socialApi("estadisticas", { red })); } catch (e) { setError(e.message); } };
  useEffect(() => { setD(null); leer(); }, [red]);
  const num = n => n == null ? "—" : n >= 1e6 ? (n / 1e6).toFixed(1) + " M" : n >= 1e4 ? Math.round(n / 1e3) + " k" : n.toLocaleString("es-ES");
  if (error) return <div style={{ fontSize: 13, color: "var(--red)" }}>{error}</div>;
  if (!d) return <div style={{ fontSize: 13, color: "var(--text-3)" }}>Cargando {RED[red].nombre}…</div>;
  if (!d.conectada) return <div style={{ fontSize: 13, color: "var(--text-2)" }}>{RED[red].nombre} no está conectado en este perfil: conéctalo en Calendario → Redes.</div>;
  const pubs = d.pubs || [], tot = k => pubs.reduce((a, p) => a + (p[k] || 0), 0);
  const tarj = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: "12px 14px" };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {[["Seguidores", d.seguidores], ["Publicaciones", d.publicaciones], ["Vistas (últimas " + pubs.length + ")", tot("vistas")], ["Me gusta (últimas)", tot("megusta")], ["Comentarios", tot("comentarios")], ["Compartidos", tot("compartidos")]].map(([t, v]) => (
          <div key={t} style={{ ...tarj, minWidth: 140 }}><div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{t}</div><div style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 22 }}>{num(v)}</div></div>))}
      </div>
      <div style={{ ...tarj, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><b>{d.usuario ? (red === "instagram" ? "@" : "") + d.usuario : RED[red].nombre} · últimas publicaciones</b>
          <button onClick={leer} style={{ fontSize: 12, color: "var(--gold)" }}>Actualizar</button></div>
        {pubs.map(p => (
          <a key={p.id} href={p.enlace} target="_blank" rel="noreferrer" style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 4px", borderTop: "1px solid var(--border)", color: "inherit", textDecoration: "none" }}>
            {p.portada ? <img src={p.portada} alt="" style={{ width: 34, height: 52, objectFit: "cover", borderRadius: 5, flex: "none" }} /> : <span style={{ width: 34, height: 52, background: "#111", borderRadius: 5, flex: "none" }} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(p.texto || "(sin texto)").split("\n")[0]}</div>
              <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{new Date(p.fecha).toLocaleDateString("es-ES")}</div>
            </div>
            <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--text-2)", whiteSpace: "nowrap" }}>
              <span title="Vistas">👁 {num(p.vistas)}</span><span title="Me gusta">❤ {num(p.megusta)}</span><span title="Comentarios">💬 {num(p.comentarios)}</span><span title="Compartidos">↗ {num(p.compartidos)}</span>
            </div>
          </a>))}
      </div>
    </div>);
}
