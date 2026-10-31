import React from "react";
const { useState, useEffect, useMemo, useCallback, useRef } = React;
import { Icons } from "./base";

/* ============================ HISTORIAS (v3.21) ============================
 * RandomHistorias dentro de RandomStudio: el mismo proceso de siempre (tools/cadena.py del portátil), visto
 * desde aquí. Cada historia con sus 10 pasos, la tarea en marcha con el render plano a plano y el tiempo que
 * falta, y elegir tú la miniatura entre las fotos de los planos. Los archivos se leen del portátil
 * (electron/historias.cjs); en la web solo se explica dónde funciona.
 */

const PASOS = {
  sincronizar: "Voz", revisar: "Revisor", fotos: "Fotos", mezclar: "Mezcla", subtitulos: "Subtítulos",
  animatic: "Animatic", render: "Render", montar: "Montaje", miniatura: "Miniatura", entregar: "Entrega",
};
const ORDEN = Object.keys(PASOS);
const SF = () => window.studioFS;

const tarjeta = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, padding: 16 };
const botonSec = { fontSize: 12.5, fontWeight: 600, color: "var(--text)", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 12px", background: "var(--card-2)" };
const botonOro = { fontSize: 12.5, fontWeight: 700, color: "#000", borderRadius: 10, padding: "8px 14px" };

function mmss(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return h ? `${h} h ${m} min` : m ? `${m} min ${String(x).padStart(2, "0")} s` : `${x} s`;
}

function Pasos({ pasos, activo }) {
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {pasos.map((p, i) => {
        const enMarcha = activo && activo.nombre === p.paso;
        const col = enMarcha ? "var(--gold)" : p.hecho ? "var(--green)" : "var(--text-3)";
        return (
          <div key={p.paso} title={p.fin ? `${PASOS[p.paso]} · terminado ${p.fin}` : PASOS[p.paso]}
            style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, color: col, padding: "4px 8px", borderRadius: 999,
              border: `1px solid ${enMarcha ? "var(--border-gold)" : "var(--border)"}`,
              background: enMarcha ? "rgba(212,175,55,0.10)" : p.hecho ? "rgba(74,222,128,0.06)" : "transparent" }}>
            <span style={{ width: 7, height: 7, borderRadius: 9, background: col, boxShadow: enMarcha ? "0 0 8px var(--gold)" : "none" }} />
            {i + 1}. {PASOS[p.paso]}
          </div>);
      })}
    </div>);
}

function Barra({ valor, oro = true }) {
  return (
    <div style={{ height: 8, borderRadius: 9, background: "var(--track)", overflow: "hidden", border: "1px solid var(--border)" }}>
      <div className={oro ? "grad-gold" : ""} style={{ height: "100%", width: `${Math.round(Math.max(0, Math.min(1, valor)) * 100)}%`,
        transition: "width .6s ease", background: oro ? undefined : "var(--green)" }} />
    </div>);
}

// ------------------------------------------------------------------ tarea en marcha
function TareaEnMarcha({ tarea, ahora, onCancelar }) {
  const [verLog, setVerLog] = useState(false);
  const r = tarea.render;
  const pasoN = tarea.paso ? tarea.paso.n : 0, pasoDe = tarea.paso ? tarea.paso.de : 10;
  const fraccionPlanos = r && r.total ? (r.total - r.quedan) / r.total : null;
  const etaMs = r ? r.minutos * 60000 - (ahora - r.en) : null;
  return (
    <div style={{ ...tarjeta, borderColor: "var(--border-gold)", background: "linear-gradient(135deg,rgba(212,175,55,0.10),rgba(212,175,55,0.02))" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span className="gold-glow" style={{ width: 10, height: 10, borderRadius: 9, background: "var(--gold)" }} />
        <div style={{ fontFamily: "'Sora'", fontWeight: 700, fontSize: 15 }}>
          Historia {tarea.id.slice(0, 2)} · {tarea.paso ? `paso ${pasoN}/${pasoDe}: ${PASOS[tarea.paso.nombre] || tarea.paso.nombre}` : "arrancando…"}
        </div>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: "var(--text-2)" }}>en marcha desde hace {mmss(ahora - tarea.inicio)}</span>
        <button onClick={onCancelar} style={{ ...botonSec, color: "var(--red)", borderColor: "rgba(248,113,113,0.35)" }}>Cancelar</button>
      </div>
      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        <Barra valor={pasoN ? (pasoN - 1 + (fraccionPlanos || 0)) / pasoDe : 0} />
        {r && (
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12.5, color: "var(--text-2)" }}>
            <span>Plano <b style={{ color: "var(--text)" }}>{r.plano}</b>{r.total ? ` · ${r.total - r.quedan} de ${r.total}` : ""}</span>
            <span>Quedan <b style={{ color: "var(--gold)" }}>{etaMs > 60000 ? "~" + Math.ceil(etaMs / 60000) + " min" : etaMs > 0 ? "menos de 1 min" : "casi listo"}</b></span>
          </div>)}
        <button onClick={() => setVerLog(v => !v)} style={{ alignSelf: "flex-start", fontSize: 11.5, color: "var(--text-3)", fontWeight: 600 }}>
          {verLog ? "Ocultar detalles" : "Ver detalles"}
        </button>
        {verLog && (
          <pre style={{ margin: 0, maxHeight: 220, overflow: "auto", fontSize: 11, lineHeight: 1.45, color: "var(--text-2)", background: "var(--bg-2)",
            border: "1px solid var(--border)", borderRadius: 10, padding: 10, whiteSpace: "pre-wrap" }}>{(tarea.lineas || []).slice(-60).join("\n")}</pre>)}
      </div>
    </div>);
}

// ------------------------------------------------------------------ elegir miniatura
function ElegirMiniatura({ det, toast, onHecha }) {
  const [sel, setSel] = useState(null);
  const [t, setT] = useState(0.8);
  const [haciendo, setHaciendo] = useState(false);
  const [vista, setVista] = useState(det.miniatura);
  const conFoto = det.planos.filter(p => p.foto);
  const usar = async () => {
    if (!sel) return;
    setHaciendo(true);
    try {
      const r = await SF().historiasMiniatura(det.id, sel, t);
      setVista(r.miniatura);
      toast(det.entregada ? "Miniatura cambiada y entregada de nuevo" : "Miniatura cambiada");
      onHecha && onHecha();
    } catch (e) { toast("No se pudo: " + (e.message || e)); }
    setHaciendo(false);
  };
  return (
    <div style={{ ...tarjeta }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ display: "flex", color: "var(--gold)" }}>{Icons.camera}</span>
        <div style={{ fontFamily: "'Sora'", fontWeight: 700, fontSize: 14.5 }}>Miniatura</div>
        <span style={{ fontSize: 12, color: "var(--text-3)" }}>elige el plano; la imagen sale del vídeo final en el momento que marques</span>
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ width: 150, flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 6 }}>Actual</div>
          {vista ? <img src={vista} style={{ width: 150, borderRadius: 12, border: "1px solid var(--border-gold)", display: "block" }} />
            : <div style={{ width: 150, height: 266, borderRadius: 12, border: "1px dashed var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11.5, color: "var(--text-3)" }}>Aún no hay</div>}
        </div>
        <div style={{ flex: 1, minWidth: 260 }}>
          {conFoto.length === 0
            ? <div style={{ fontSize: 12.5, color: "var(--text-2)" }}>Las fotos de los planos aparecen tras el paso «Fotos».</div>
            : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(74px,1fr))", gap: 8, maxHeight: 330, overflowY: "auto", paddingRight: 4 }}>
                {conFoto.map(p => (
                  <button key={p.id} onClick={() => setSel(p.id)} title={p.texto}
                    style={{ position: "relative", padding: 0, borderRadius: 10, overflow: "hidden", aspectRatio: "9/16",
                      border: sel === p.id ? "2px solid var(--gold)" : "1px solid var(--border)",
                      boxShadow: sel === p.id ? "0 0 0 3px rgba(212,175,55,0.25)" : "none", transition: "transform .12s",
                      transform: sel === p.id ? "scale(1.03)" : "none" }}>
                    <img src={p.foto} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    <span style={{ position: "absolute", left: 4, top: 4, fontSize: 10, fontWeight: 700, color: "#fff", background: "rgba(0,0,0,0.55)", borderRadius: 6, padding: "1px 5px" }}>{p.id}</span>
                  </button>))}
              </div>}
          {sel && (
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 12.5, color: "var(--text-2)" }}>«{(det.planos.find(p => p.id === sel) || {}).texto}»</div>
              <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "var(--text-2)" }}>
                Momento del plano
                <input type="range" min="0.1" max="0.9" step="0.05" value={t} onChange={e => setT(+e.target.value)} style={{ flex: 1, accentColor: "#D4AF37" }} />
                <b style={{ color: "var(--text)", width: 36, textAlign: "right" }}>{Math.round(t * 100)}%</b>
              </label>
              <button onClick={usar} disabled={haciendo || !det.final} className="grad-gold" style={{ ...botonOro, alignSelf: "flex-start", opacity: (haciendo || !det.final) ? 0.6 : 1 }}>
                {haciendo ? "Haciendo la miniatura…" : det.final ? `Usar ${sel} como miniatura` : "Hace falta el vídeo final"}
              </button>
            </div>)}
        </div>
      </div>
    </div>);
}

// ------------------------------------------------------------------ vista
export function HistoriasView({ toast }) {
  const escritorio = !!(SF() && SF().historiasLista);
  const [lista, setLista] = useState(null);
  const [error, setError] = useState("");
  const [selId, setSelId] = useState(null);
  const [det, setDet] = useState(null);
  const [tarea, setTarea] = useState(null);
  const [ahora, setAhora] = useState(Date.now());
  const [desde, setDesde] = useState("render");
  const tareaRef = useRef(null);
  tareaRef.current = tarea;

  const cargar = useCallback(async () => {
    try {
      const r = await SF().historiasLista();
      if (!r.ok) { setError(r.error); return; }
      setLista(r.historias);
      setSelId(s => s || (r.historias[0] && r.historias[0].id));
    } catch (e) { setError(e.message || String(e)); }
  }, []);

  const cargarDet = useCallback(async (id) => {
    if (!id) return;
    try { setDet(await SF().historiasDetalle(id)); } catch (e) { setDet(null); toast("No se pudo abrir: " + (e.message || e)); }
  }, [toast]);

  useEffect(() => {
    if (!escritorio) return;
    cargar();
    SF().historiasTareaEstado().then(st => st.activa && setTarea({ ...st })).catch(() => {});
    const off = SF().onHistoriasProgreso((d) => {
      setTarea(prev => {
        const t = prev && prev.id === d.id ? { ...prev } : { id: d.id, inicio: Date.now(), lineas: [] };
        if (d.tipo === "paso") { t.paso = d.paso; t.render = null; }
        else if (d.tipo === "plano") t.render = d.render;
        else if (d.tipo === "linea") t.lineas = [...(t.lineas || []).slice(-200), d.linea];
        else if (d.tipo === "fin") {
          toast(d.ok ? `Historia ${d.id.slice(0, 2)}: terminado` : `Historia ${d.id.slice(0, 2)}: se paró (mira los detalles)`);
          setTimeout(() => { cargar(); cargarDet(d.id); }, 300);
          return d.ok ? null : { ...t, terminado: true, fallo: true };
        }
        return t;
      });
    });
    const tic = setInterval(() => setAhora(Date.now()), 1000);
    return () => { off && off(); clearInterval(tic); };
  }, [escritorio, cargar, cargarDet, toast]);

  useEffect(() => { if (escritorio) cargarDet(selId); }, [selId, escritorio, cargarDet]);

  const lanzar = async (args) => {
    try {
      await SF().historiasTarea(det.id, args);
      setTarea({ id: det.id, inicio: Date.now(), lineas: [], paso: null, render: null });
      toast("En marcha");
    } catch (e) { toast(e.message || String(e)); }
  };

  if (!escritorio) {
    return (
      <div style={{ ...tarjeta, maxWidth: 560, margin: "40px auto", textAlign: "center" }}>
        <div style={{ fontFamily: "'Sora'", fontWeight: 700, fontSize: 18, marginBottom: 6 }}>Historias</div>
        <div style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.6 }}>
          Las historias se hacen en el portátil: abre este apartado desde RandomStudio de escritorio.
        </div>
      </div>);
  }

  const enMarcha = tarea && !tarea.terminado;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 1180, margin: "0 auto", width: "100%" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 24, letterSpacing: "-.02em" }}>Random<span className="gold-text">Historias</span></div>
          <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>El proceso de siempre, con el render a la vista y la miniatura en tu mano</div>
        </div>
        <span style={{ flex: 1 }} />
        <button onClick={() => { cargar(); cargarDet(selId); }} style={{ ...botonSec, display: "flex", alignItems: "center", gap: 6 }}>{Icons.refresh} Actualizar</button>
      </div>

      {error && <div style={{ ...tarjeta, color: "var(--red)", fontSize: 13 }}>{error}</div>}
      {tarea && <TareaEnMarcha tarea={tarea} ahora={ahora} onCancelar={() => SF().historiasCancelar().then(() => toast("Cancelando…"))} />}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(250px,320px) 1fr", gap: 16, alignItems: "start" }} className="historias-grid">
        {/* lista */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {!lista && !error && <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>Cargando…</div>}
          {(lista || []).map(h => {
            const activa = h.id === selId;
            return (
              <button key={h.id} onClick={() => setSelId(h.id)}
                style={{ display: "flex", gap: 10, alignItems: "center", textAlign: "left", padding: 8, borderRadius: 14,
                  border: `1px solid ${activa ? "var(--border-gold)" : "var(--border)"}`,
                  background: activa ? "linear-gradient(135deg,rgba(212,175,55,0.14),rgba(212,175,55,0.03))" : "var(--card)" }}>
                <div style={{ width: 44, height: 78, borderRadius: 8, overflow: "hidden", flexShrink: 0, background: "var(--card-2)", border: "1px solid var(--border)" }}>
                  {h.miniatura && <img src={h.miniatura} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-3)", letterSpacing: ".06em" }}>HISTORIA {h.id.slice(0, 2)}</div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: activa ? "var(--gold)" : "var(--text)", lineHeight: 1.3, margin: "2px 0 6px",
                    overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{h.titulo || h.id}</div>
                  {h.entregada
                    ? <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--green)" }}>● Entregada</span>
                    : <div style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ flex: 1 }}><Barra valor={(h.hechos || 0) / 10} /></div>
                        <span style={{ fontSize: 10.5, color: "var(--text-3)" }}>{h.hechos || 0}/10</span></div>}
                </div>
              </button>);
          })}
        </div>

        {/* detalle */}
        {det && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
            <div style={{ ...tarjeta }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", letterSpacing: ".06em" }}>HISTORIA {det.id.slice(0, 2)} · {det.nPlanos} PLANOS</div>
                  <div style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 19, margin: "4px 0 12px", lineHeight: 1.25 }}>{det.titulo}</div>
                </div>
                {det.entregada && <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--green)", border: "1px solid rgba(74,222,128,0.3)", borderRadius: 999, padding: "4px 10px" }}>Entregada</span>}
              </div>
              <Pasos pasos={det.pasos} activo={enMarcha && tarea.id === det.id ? tarea.paso : null} />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14, alignItems: "center" }}>
                <select value={desde} onChange={e => setDesde(e.target.value)} disabled={!!enMarcha}
                  style={{ ...botonSec, appearance: "auto", paddingRight: 8 }}>
                  {ORDEN.map(p => <option key={p} value={p}>Desde {PASOS[p].toLowerCase()}</option>)}
                </select>
                <button disabled={!!enMarcha} onClick={() => lanzar(["--desde", desde, "--sin-parar"])} className="grad-gold"
                  style={{ ...botonOro, opacity: enMarcha ? 0.5 : 1, display: "flex", alignItems: "center", gap: 6 }}>▶ Lanzar la cadena</button>
                <button disabled={!!enMarcha} onClick={() => lanzar(["--solo", "entregar"])} style={{ ...botonSec, opacity: enMarcha ? 0.5 : 1 }}>Solo entregar</button>
                <span style={{ flex: 1 }} />
                <button onClick={() => SF().historiasAbrir(det.id, "carpeta")} style={botonSec}>Carpeta</button>
                {det.final && <button onClick={() => SF().historiasAbrir(det.id, "video")} style={botonSec}>Ver vídeo</button>}
                {det.entregada && <button onClick={() => SF().historiasAbrir(det.id, "entrega")} style={botonSec}>Entrega</button>}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 10, lineHeight: 1.5 }}>
                Las ideas, el guion y la revisión de las fotos siguen en el chat con Claude; desde aquí se lanzan los pasos automáticos y se sigue el render.
              </div>
            </div>
            <ElegirMiniatura key={det.id} det={det} toast={toast} onHecha={() => { cargar(); cargarDet(det.id); }} />
          </div>)}
      </div>
    </div>);
}
