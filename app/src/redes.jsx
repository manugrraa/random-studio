import React from "react";
import { YT_BACKEND, cloudToken } from "./datos";
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
const HORA_DEF = { instagram: "19:00", tiktok: "20:00" };
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

/* ---------- programar (el cuadro que sale al soltar un vídeo en un día) ---------- */
function Programar({ video, dia, red, cuentas, onCerrar, onHecho, toast }) {
  const otra = red === "instagram" ? "tiktok" : "instagram";
  const conectada = r => (cuentas || []).some(x => x.red === r);
  const [hora, setHora] = useState(() => ls("rds_redes_hora_" + red, HORA_DEF[red]));
  const [tambien, setTambien] = useState(() => conectada(otra) && ls("rds_redes_tambien", "1") === "1");
  const [horaOtra, setHoraOtra] = useState(() => ls("rds_redes_hora_" + otra, HORA_DEF[otra]));
  const [texto, setTexto] = useState(() => (video.nombre || "").replace(/^\d+\s*-\s*/, "") + (ls("rds_redes_coletilla", "") ? "\n\n" + ls("rds_redes_coletilla", "") : ""));
  const [paso, setPaso] = useState("");
  const hecho = async () => {
    try {
      lsSet("rds_redes_hora_" + red, hora); lsSet("rds_redes_tambien", tambien ? "1" : "0"); if (tambien) lsSet("rds_redes_hora_" + otra, horaOtra);
      setPaso("Preparando el vídeo…");
      const pr = await window.studioFS.redesPreparar(video.video);
      if (pr.error) throw new Error(pr.error);
      setPaso("Subiéndolo (" + Math.round(pr.tam / 1e6) + " MB)…");
      const sb = await socialApi("subida", { nombre: video.nombre + ".mp4", tam: pr.tam });
      const up = await window.studioFS.redesSubir(pr.ruta, sb.url, !!pr.temporal);
      if (up.error) throw new Error(up.error);
      setPaso("Programando…");
      const redes = [[red, hora], ...(tambien ? [[otra, horaOtra]] : [])];
      for (const [r, h] of redes) {
        const cuando = new Date(dia + "T" + h + ":00");
        await socialApi("programar", { red: r, hora: cuando.toISOString(), titulo: video.nombre, caption: texto, archivo: sb.archivo, tam: pr.tam, video_ref: video.video });
      }
      toast && toast("📅 «" + video.nombre + "» programado en " + redes.map(([r, h]) => RED[r].nombre + " a las " + h).join(" y "));
      onHecho();
    } catch (e) { toast && toast("✕ " + e.message); setPaso(""); }
  };
  const campo = { fontSize: 13, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" };
  return (
    <div onClick={onCerrar} style={{ position: "fixed", inset: 0, zIndex: 900, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 440, maxWidth: "92vw", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 16 }}><span style={{ color: RED[red].color }}>{RED[red].icono}</span> Programar en {RED[red].nombre}</div>
        <div style={{ fontSize: 13, color: "var(--text-2)" }}>«{video.nombre}» · {new Date(dia + "T12:00:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}</div>
        <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>Hora <input type="time" value={hora} onChange={e => setHora(e.target.value)} style={campo} /></label>
        {conectada(otra) && <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
          <input type="checkbox" checked={tambien} onChange={e => setTambien(e.target.checked)} /> También en {RED[otra].nombre}
          {tambien && <input type="time" value={horaOtra} onChange={e => setHoraOtra(e.target.value)} style={campo} />}</label>}
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>Texto (descripción)
          <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={4} maxLength={2200} style={{ ...campo, resize: "vertical" }} /></label>
        {red === "tiktok" && <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>Mientras TikTok no apruebe la app, sale en privado (solo tú lo ves); cuando la apruebe, en público.</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
          {paso && <span style={{ fontSize: 12, color: "var(--gold)", marginRight: "auto" }}>{paso}</span>}
          <button onClick={onCerrar} disabled={!!paso} style={{ fontSize: 13, padding: "8px 14px", borderRadius: 9, border: "1px solid var(--border)" }}>Cancelar</button>
          <button onClick={hecho} disabled={!!paso || !hora} className="grad-gold" style={{ fontSize: 13, fontWeight: 700, padding: "8px 16px", borderRadius: 9, color: "#000" }}>📅 Programar</button>
        </div>
      </div>
    </div>);
}

/* ---------- la vista de carriles ---------- */
export function CarrilesView({ videos, weekOffset, setWeekOffset, setCalView, onOpen, toast }) {
  const [est, leer, error] = useSocial();
  const [bandeja, setBandeja] = useState(null);
  const [arrastrado, setArrastrado] = useState(null);
  const [soltando, setSoltando] = useState(null);       // { video, dia, red }
  const [encima, setEncima] = useState(null);
  const [chip, setChip] = useState(null);               // programado elegido (menú)
  useEffect(() => { window.studioFS && window.studioFS.terminadosLista && window.studioFS.terminadosLista().then(r => setBandeja((r && r.lista) || [])); }, []);
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
    if (red === "youtube") { toast && toast("YouTube: súbelo en YouTube Studio programado y aparece aquí solo"); return; }
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
          <p style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 2 }}>Arrastra un vídeo de la bandeja a un día de Instagram o TikTok · cada red con su hora</p>
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
              <div key={v.id} draggable onDragStart={() => setArrastrado(v)} onDragEnd={() => setArrastrado(null)}
                style={{ display: "flex", gap: 8, alignItems: "center", padding: 6, borderRadius: 10, background: "var(--card)", border: "1px solid var(--border)", cursor: "grab" }}>
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
  return (
    <div onClick={onCerrar} style={{ position: "fixed", inset: 0, zIndex: 900, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 400, maxWidth: "92vw", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontWeight: 800 }}><span style={{ color: RED[p.red].color }}>{RED[p.red].icono}</span> {p.titulo}</div>
        <div style={{ fontSize: 12.5, color: "var(--text-2)" }}>{{ programado: "Programado", publicando: "Publicándose…", publicado: "Publicado", fallido: "No se pudo publicar" }[p.estado]}
          {r.privacidad === "SELF_ONLY" ? " · en privado (TikTok aún no ha aprobado la app)" : ""}</div>
        {r.error && <div style={{ fontSize: 12, color: "var(--red)" }}>⚠️ {r.error}</div>}
        {r.enlace && <a href={r.enlace} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: "var(--gold)" }}>Ver la publicación</a>}
        {p.estado === "programado" && <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>Cuándo
          <input type="datetime-local" value={hora} onChange={e => setHora(e.target.value)} style={{ fontSize: 13, padding: "6px 8px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }} />
          <button onClick={() => accion("reprogramar", { hora: new Date(hora).toISOString() })} style={{ fontSize: 12.5, fontWeight: 700, color: "var(--gold)" }}>Cambiar</button></label>}
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
