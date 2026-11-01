import React from "react";
const { useState, useEffect, useCallback, useRef } = React;
import { Icons } from "./base";
import { borrarHistoria, pedidosApi, remotoApi } from "./remoto";
import { BotonDisponible, BotonPararTodo, ColaTrabajo, NuevaPeticion } from "./cola";
import { driveConectado, driveConectar, driveDesconectar, driveToken } from "./datos";
import { esAdmin, useRolEquipo } from "./admin";
import { UsoClaude, usoDeEquipos } from "./uso_claude";

/* ============================ HISTORIAS (v3.21; v3.30 estudio completo) ============================
 * Todo el proceso de RandomHistorias dentro del Studio, con una «carpeta» por historia:
 *   Ideas (Claude propone, tú eliges y se guardan) → Guion → Voces y efectos → Escena 3D → Animatic → Render →
 *   Montaje y entrega → miniatura (sugerida y elegible) → nota final opcional.
 * Guion, voces y escena los hace Claude Code en el portátil; el resto, la cadena de siempre (electron/historias.cjs).
 * Revisión manual de guion, voces y animatic con un interruptor cada una (Ajustes) y nota de cambios.
 * Se ve en todo momento qué se está haciendo: lo que Claude escribe, Blender, el render plano a plano con su barra.
 */

const PASOS = {
  sincronizar: "Voz", revisar: "Revisor", fotos: "Fotos", mezclar: "Mezcla", subtitulos: "Subtítulos",
  animatic: "Animatic", render: "Render", montar: "Montaje", miniatura: "Miniatura", entregar: "Entrega",
};
const ETAPA_ICONO = { guion: "📝", voces: "🎙️", escena: "🧱", animatic: "🎞️", render: "🎬", montaje: "📦" };
const ETAPA_NOMBRE = { guion: "Guion", voces: "Voces y efectos", escena: "Escena 3D", animatic: "Animatic", render: "Render", montaje: "Montaje y entrega" };
const SF = () => window.studioFS;

const tarjeta = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, padding: 16 };
const botonSec = { fontSize: 12.5, fontWeight: 600, color: "var(--text)", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 12px", background: "var(--card-2)" };
const botonOro = { fontSize: 12.5, fontWeight: 700, color: "#000", borderRadius: 10, padding: "8px 14px" };

const CSS = `
@keyframes rh-rayas { from { background-position: 0 0 } to { background-position: 40px 0 } }
@keyframes rh-ida { 0% { left: -35% } 100% { left: 100% } }
@keyframes rh-pulso { 0%,100% { box-shadow: 0 0 0 0 rgba(212,175,55,.55) } 50% { box-shadow: 0 0 0 7px rgba(212,175,55,0) } }
@keyframes rh-entra { from { transform: translateY(6px) } to { transform: none } }
.rh-rayas { background-image: linear-gradient(45deg, rgba(0,0,0,.18) 25%, transparent 25%, transparent 50%, rgba(0,0,0,.18) 50%, rgba(0,0,0,.18) 75%, transparent 75%, transparent);
  background-size: 40px 40px; animation: rh-rayas .9s linear infinite; }
.rh-tab { font-size: 13px; font-weight: 700; padding: 8px 14px; border-radius: 10px; color: var(--text-2); border: 1px solid transparent; }
.rh-tab.on { color: #000; background: linear-gradient(135deg,#FFD700,#D4AF37); }
`;

function mmss(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return h ? `${h} h ${m} min` : m ? `${m} min ${String(x).padStart(2, "0")} s` : `${x} s`;
}

/** Barra de progreso: con valor, se llena y lleva rayas en movimiento; sin valor, un tramo que va y viene (cargando). */
function Barra({ valor, alto = 10 }) {
  const fijo = typeof valor === "number";
  return (
    <div style={{ position: "relative", height: alto, borderRadius: 9, background: "var(--track)", overflow: "hidden", border: "1px solid var(--border)" }}>
      {fijo
        ? <div className="grad-gold rh-rayas" style={{ height: "100%", width: `${Math.round(Math.max(0.02, Math.min(1, valor)) * 100)}%`, transition: "width .6s ease" }} />
        : <div className="grad-gold rh-rayas" style={{ position: "absolute", top: 0, bottom: 0, width: "35%", animation: "rh-rayas .9s linear infinite, rh-ida 1.6s ease-in-out infinite" }} />}
    </div>);
}

// ------------------------------------------------------------------ las etapas de una historia
function Etapas({ etapas, onElegir, sel }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {etapas.map((e, i) => {
        const col = { hecho: "var(--green)", revisar: "#F59E0B", trabajando: "var(--gold)", pendiente: "var(--text-3)" }[e.estado];
        const txt = { hecho: "hecho", revisar: "te toca revisar", trabajando: "trabajando…", pendiente: e.bloqueada ? "en espera" : "siguiente" }[e.estado];
        return (
          <button key={e.id} onClick={() => onElegir && onElegir(e.id)}
            style={{ flex: "1 1 120px", textAlign: "left", padding: "9px 11px", borderRadius: 12, border: `1px solid ${sel === e.id ? "var(--gold)" : e.estado === "pendiente" ? "var(--border)" : col}`,
              background: e.estado === "trabajando" ? "rgba(212,175,55,.10)" : e.estado === "revisar" ? "rgba(245,158,11,.08)" : e.estado === "hecho" ? "rgba(74,222,128,.05)" : "transparent",
              animation: e.estado === "trabajando" ? "rh-pulso 1.8s infinite" : "none", opacity: e.bloqueada && e.estado === "pendiente" ? 0.55 : 1 }}>
            <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 700 }}>{i + 1} · {ETAPA_ICONO[e.id]}</div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)", marginTop: 2 }}>{e.nombre}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: col, marginTop: 2 }}>{e.estado === "hecho" ? "✓ " : ""}{txt}{e.pideRevision && e.estado === "pendiente" ? " · la revisas tú" : ""}</div>
          </button>);
      })}
    </div>);
}

// ------------------------------------------------------------------ tarea en marcha
function TareaEnMarcha({ tarea, ahora, onCancelar, titulo }) {
  const [verLog, setVerLog] = useState(false);
  const r = tarea.render;
  const esAgente = tarea.tipo === "agente";
  const fraccionPlanos = r && r.total ? (r.total - r.quedan) / r.total : null;
  const etaMs = r ? r.minutos * 60000 - (ahora - r.en) : null;
  const etapa = tarea.etapa ? ETAPA_NOMBRE[tarea.etapa] : (tarea.paso ? PASOS[tarea.paso.nombre] : "");
  const que = esAgente ? (tarea.accion || "Pensando…")
    : r ? `Renderizando el plano ${r.plano}` : tarea.paso ? `Paso ${tarea.paso.n}/${tarea.paso.de}: ${PASOS[tarea.paso.nombre] || tarea.paso.nombre}` : "Arrancando…";
  return (
    <div style={{ ...tarjeta, borderColor: "var(--border-gold)", background: "linear-gradient(135deg,rgba(212,175,55,0.10),rgba(212,175,55,0.02))", animation: "rh-entra .3s ease both" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ width: 10, height: 10, borderRadius: 9, background: "var(--gold)", animation: "rh-pulso 1.4s infinite" }} />
        <div style={{ fontFamily: "'Sora'", fontWeight: 700, fontSize: 15 }}>
          {"Historia " + tarea.id.slice(0, 2)}{titulo ? " · " + titulo : ""}{etapa ? " · " + etapa : ""}
        </div>
        {esAgente && <span style={{ fontSize: 11, fontWeight: 700, color: "var(--gold)", border: "1px solid var(--border-gold)", borderRadius: 99, padding: "2px 8px" }}>CLAUDE TRABAJANDO</span>}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: "var(--text-2)" }}>desde hace {mmss(ahora - tarea.inicio)}</span>
        <button onClick={onCancelar} style={{ ...botonSec, color: "var(--red)", borderColor: "rgba(248,113,113,0.35)" }}>Parar</button>
      </div>
      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{que}</div>
        <Barra valor={fraccionPlanos != null ? fraccionPlanos : undefined} alto={12} />
        {r && (
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12.5, color: "var(--text-2)" }}>
            <span>Plano <b style={{ color: "var(--text)" }}>{r.plano}</b>{r.total ? ` · ${r.total - r.quedan} de ${r.total}` : ""}</span>
            <span>Quedan <b style={{ color: "var(--gold)" }}>{etaMs > 60000 ? "~" + Math.ceil(etaMs / 60000) + " min" : etaMs > 0 ? "menos de 1 min" : "casi listo"}</b></span>
          </div>)}
        {esAgente && (tarea.acciones || []).length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 130, overflow: "auto" }}>
            {(tarea.acciones || []).slice(-6).reverse().map((a, i) => (
              <div key={a.t + "" + i} style={{ fontSize: 12, color: i ? "var(--text-3)" : "var(--text-2)" }}>{i ? "✓" : "›"} {a.a}</div>))}
          </div>)}
        <button onClick={() => setVerLog(v => !v)} style={{ alignSelf: "flex-start", fontSize: 11.5, color: "var(--text-3)", fontWeight: 600 }}>
          {verLog ? "Ocultar detalles" : "Ver detalles"}
        </button>
        {verLog && (
          <pre style={{ margin: 0, maxHeight: 240, overflow: "auto", fontSize: 11, lineHeight: 1.45, color: "var(--text-2)", background: "var(--bg-2)",
            border: "1px solid var(--border)", borderRadius: 10, padding: 10, whiteSpace: "pre-wrap" }}>{(tarea.lineas || []).slice(-60).join("\n")}</pre>)}
      </div>
    </div>);
}

// ------------------------------------------------------------------ revisar una etapa
function Revision({ etapa, mat, onAprobar, onCambios, ocupado, cambiosOcupado }) {
  const [nota, setNota] = useState("");
  const [verGuion, setVerGuion] = useState(false);
  const textos = { guion: "Lee el guion. Si está bien, apruébalo y Claude sigue con las voces.",
    voces: "Escucha la voz con los efectos. Si está bien, apruébalo y Claude monta la escena 3D.",
    animatic: "Mira el animatic (fotos + voz + subtítulos). Si está bien, apruébalo y empieza el render." };
  const inf = mat.informes && mat.informes[etapa === "animatic" ? "escena" : etapa];
  return (
    <div style={{ ...tarjeta, borderColor: "rgba(245,158,11,.55)", background: "linear-gradient(135deg,rgba(245,158,11,0.10),rgba(245,158,11,0.02))", animation: "rh-entra .3s ease both" }}>
      <div style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 16 }}>Te toca revisar: {ETAPA_NOMBRE[etapa]}</div>
      <div style={{ fontSize: 12.5, color: "var(--text-2)", margin: "4px 0 12px" }}>{textos[etapa]}</div>
      {etapa === "guion" && (
        <div>
          <div style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 15, marginBottom: 8 }}>{mat.titulo}</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.7, whiteSpace: "pre-wrap", background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 14, maxHeight: 360, overflow: "auto" }}>{mat.narracion}</div>
          {mat.guion && <button onClick={() => setVerGuion(v => !v)} style={{ fontSize: 12, color: "var(--gold)", fontWeight: 700, marginTop: 8 }}>{verGuion ? "Ocultar el guion completo" : "Ver el guion completo (planos, modelos nuevos…)"}</button>}
          {verGuion && <pre style={{ fontSize: 12, lineHeight: 1.55, whiteSpace: "pre-wrap", background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 12, maxHeight: 360, overflow: "auto", marginTop: 8 }}>{mat.guion}</pre>}
        </div>)}
      {etapa === "voces" && (mat.audio ? <audio controls src={mat.audio} style={{ width: "100%" }} /> : <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>Aún no hay mezcla.</div>)}
      {etapa === "animatic" && (mat.animatic
        ? <video controls src={mat.animatic} style={{ width: "100%", maxWidth: 340, borderRadius: 12, border: "1px solid var(--border)", display: "block", background: "#000" }} />
        : <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>Aún no hay animatic.</div>)}
      {inf && inf.texto && <details style={{ marginTop: 10 }}><summary style={{ fontSize: 12, color: "var(--text-3)", cursor: "pointer" }}>Lo que dice Claude de su trabajo</summary>
        <div style={{ fontSize: 12.5, color: "var(--text-2)", whiteSpace: "pre-wrap", marginTop: 6, lineHeight: 1.55 }}>{inf.texto}</div></details>}
      <textarea value={nota} onChange={e => setNota(e.target.value)} rows={3} placeholder="Si quieres cambios, escríbelos aquí (qué cambiar y cómo). Si está bien, deja esto vacío y aprueba."
        style={{ width: "100%", marginTop: 12, fontSize: 13, lineHeight: 1.5, padding: 10, borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-2)", color: "var(--text)", resize: "vertical" }} />
      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <button disabled={ocupado || !!nota.trim()} onClick={onAprobar} className="grad-gold" style={{ ...botonOro, opacity: (ocupado || nota.trim()) ? 0.5 : 1 }}>✓ Está bien, seguir</button>
        <button disabled={ocupado || cambiosOcupado || !nota.trim()} title={cambiosOcupado ? "Espera a que termine lo que está en marcha" : ""} onClick={() => onCambios(nota.trim())} style={{ ...botonSec, color: "#F59E0B", borderColor: "rgba(245,158,11,.45)", opacity: (ocupado || cambiosOcupado || !nota.trim()) ? 0.5 : 1 }}>Pedir estos cambios</button>
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
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <span style={{ display: "flex", color: "var(--gold)" }}>{Icons.camera}</span>
        <div style={{ fontFamily: "'Sora'", fontWeight: 700, fontSize: 14.5 }}>Miniatura</div>
        <span style={{ fontSize: 12, color: "var(--text-3)" }}>la sugerida sale sola al montar; si prefieres otra, elige el plano y el momento</span>
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ width: 150, flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 6 }}>{sel ? "Actual" : "Sugerida / actual"}</div>
          {vista ? <img src={vista} style={{ width: 150, borderRadius: 12, border: "1px solid var(--border-gold)", display: "block" }} />
            : <div style={{ width: 150, height: 266, borderRadius: 12, border: "1px dashed var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11.5, color: "var(--text-3)", textAlign: "center", padding: 8 }}>Sale sola al montar el Short</div>}
        </div>
        <div style={{ flex: 1, minWidth: 260 }}>
          {conFoto.length === 0
            ? <div style={{ fontSize: 12.5, color: "var(--text-2)" }}>Las fotos de los planos aparecen tras la escena 3D.</div>
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

// ------------------------------------------------------------------ Short terminado + nota
function Terminado({ det, mat, toast, onGuardada }) {
  const [nota, setNota] = useState(mat.nota_final ? mat.nota_final.texto : "");
  const guardar = async () => {
    await SF().estudioNotaFinal(det.id, nota);
    toast(nota.trim() ? "Nota guardada: Claude la tendrá en cuenta en las próximas" : "Sin nota: perfecto");
    onGuardada && onGuardada();
  };
  return (
    <div style={{ ...tarjeta, borderColor: "rgba(74,222,128,.4)" }}>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
        {mat.video && <video controls src={mat.video} style={{ width: 260, borderRadius: 12, border: "1px solid var(--border)", background: "#000", display: "block" }} />}
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 16, color: "var(--green)" }}>✓ Short listo</div>
          <div style={{ fontSize: 12.5, color: "var(--text-2)", margin: "4px 0 12px", lineHeight: 1.55 }}>
            Míralo entero. Si ves algún fallo, apúntalo aquí para mejorarlo en las próximas historias. Si no escribes nada, es que está perfecto.</div>
          <textarea value={nota} onChange={e => setNota(e.target.value)} rows={4} placeholder="(opcional) Qué fallo has visto…"
            style={{ width: "100%", fontSize: 13, lineHeight: 1.5, padding: 10, borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-2)", color: "var(--text)", resize: "vertical" }} />
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button onClick={guardar} className="grad-gold" style={botonOro}>{nota.trim() ? "Guardar la nota" : "Está perfecto"}</button>
            {det.entregada && <button onClick={() => SF().historiasAbrir(det.id, "entrega")} style={botonSec}>Abrir la carpeta del Short</button>}
          </div>
          {mat.nota_final && <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 8 }}>Nota guardada el {new Date(mat.nota_final.fecha).toLocaleDateString("es-ES")}</div>}
        </div>
      </div>
    </div>);
}

// ------------------------------------------------------------------ ideas
function Ideas({ toast, onCreada }) {
  const [ideas, setIdeas] = useState(null);
  const [generando, setGenerando] = useState(false);
  const [pista, setPista] = useState("");
  const [filtro, setFiltro] = useState("todas");
  const cargar = useCallback(async () => { const r = await SF().estudioIdeas(); setIdeas(r.ideas); setGenerando(r.generando); }, []);
  useEffect(() => {
    cargar();
    const off = SF().onEstudioIdeas(d => { setGenerando(false); toast(d.ok ? `💡 ${d.n} ideas nuevas` : "No se pudieron generar: " + d.error); cargar(); });
    return () => off && off();
  }, [cargar, toast]);
  const generar = async () => {
    const r = await SF().estudioIdeasGenerar(5, pista.trim());
    if (!r.ok) return toast(r.error);
    setGenerando(true);
  };
  const poner = async (i, estado) => { await SF().estudioIdeaPoner(i.id, { estado }); cargar(); };
  // v3.33: las historias nuevas van a la cola compartida; la coge el primer equipo disponible (el portátil, si está libre)
  // v3.37.5: un solo envío por idea (el botón se bloquea al momento; el servidor además rechaza las repetidas)
  const [enviando, setEnviando] = useState({});
  const crear = async (i) => {
    if (enviando[i.id]) return;
    setEnviando(x => ({ ...x, [i.id]: true }));
    const { id, estado, historia, fecha, ...idea } = i;
    try {
      await pedidosApi("POST", { accion: "crear", tipo: "historia", titulo: i.titulo, args: { idea } });
      await SF().estudioIdeaPoner(i.id, { estado: "en_cola" });
      toast("📋 «" + i.titulo + "» añadida a la cola");
      cargar(); onCreada && onCreada();
    } catch (e) {
      if (/ya está/.test(e.message)) { await SF().estudioIdeaPoner(i.id, { estado: "en_cola" }).catch(() => {}); cargar(); }
      toast((/ya está/.test(e.message) ? "📋 " : "❌ ") + e.message);
    }
    setEnviando(x => { const y = { ...x }; delete y[i.id]; return y; });
  };
  const vis = (ideas || []).filter(i => filtro === "todas" ? !["descartada", "usada"].includes(i.estado) : i.estado === filtro);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ ...tarjeta, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input value={pista} onChange={e => setPista(e.target.value)} placeholder="(opcional) Una pista: tema, fiesta, algo que quieras probar…"
          style={{ flex: "1 1 280px", fontSize: 13, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-2)", color: "var(--text)" }} />
        <button onClick={generar} disabled={generando} className="grad-gold" style={{ ...botonOro, opacity: generando ? 0.6 : 1 }}>{generando ? "Claude está pensando…" : "💡 Generar 5 ideas"}</button>
        {generando && <div style={{ flexBasis: "100%" }}><Barra /></div>}
        <div style={{ flexBasis: "100%", fontSize: 11.5, color: "var(--text-3)" }}>Con nuestro criterio de siempre: lo que te gustó, lo que funciona en Gelo y Custerk, fechas de temporada y tus notas de los Shorts anteriores. Se quedan guardadas.</div>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {[["todas", "Por mirar"], ["guardada", "⭐ Guardadas"], ["usada", "Ya creadas"], ["descartada", "Descartadas"]].map(([k, t]) => (
          <button key={k} onClick={() => setFiltro(k)} className={"rh-tab" + (filtro === k ? " on" : "")} style={{ fontSize: 12 }}>{t}</button>))}
      </div>
      {!ideas && <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>Cargando…</div>}
      {ideas && !vis.length && <div style={{ fontSize: 13, color: "var(--text-3)" }}>Nada por aquí todavía.</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 12 }}>
        {vis.map(i => (
          <div key={i.id} style={{ ...tarjeta, display: "flex", flexDirection: "column", gap: 8, borderColor: i.estado === "guardada" ? "var(--border-gold)" : "var(--border)", animation: "rh-entra .3s ease both" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <div style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 14.5, lineHeight: 1.3, flex: 1 }}>{i.titulo}</div>
              {i.temporada && <span style={{ fontSize: 10.5, fontWeight: 700, color: "#F59E0B", border: "1px solid rgba(245,158,11,.5)", borderRadius: 99, padding: "2px 8px", whiteSpace: "nowrap" }}>{i.temporada}</span>}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--gold)", fontWeight: 600 }}>{i.regla}</div>
            <div style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.55 }}>{i.resumen}</div>
            {i.visual && <div style={{ fontSize: 12, color: "var(--text-3)" }}>👀 {i.visual}</div>}
            {i.fundamento && <div style={{ fontSize: 12, color: "var(--text-3)" }}>📈 {i.fundamento}</div>}
            {i.historia && <div style={{ fontSize: 12, color: "var(--green)", fontWeight: 700 }}>Creada: historia {i.historia.slice(0, 2)}</div>}
            {i.estado !== "usada" && (
              <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                {i.estado === "en_cola" ? <span style={{ fontSize: 12, fontWeight: 700, color: "var(--gold)", padding: "8px 4px" }}>📋 En la cola</span>
                  : <button disabled={!!enviando[i.id]} onClick={() => crear(i)} className="grad-gold" style={{ ...botonOro, opacity: enviando[i.id] ? .6 : 1 }}>{enviando[i.id] ? "Añadiendo…" : "📋 Añadir a la cola"}</button>}
                <button onClick={() => poner(i, i.estado === "guardada" ? "nueva" : "guardada")} style={botonSec}>{i.estado === "guardada" ? "Quitar ⭐" : "⭐ Guardar"}</button>
                {i.estado !== "descartada" ? <button onClick={() => poner(i, "descartada")} style={{ ...botonSec, color: "var(--text-3)" }}>Descartar</button>
                  : <button onClick={() => poner(i, "nueva")} style={botonSec}>Recuperar</button>}
              </div>)}
          </div>))}
      </div>
    </div>);
}

// ------------------------------------------------------------------ Claude: estado real y permiso de larga duración
function ClaudeEstado({ a, toast, recargar }) {
  const [token, setToken] = useState("");
  const [probando, setProbando] = useState(false);
  const probar = async (t) => {
    setProbando(true);
    try {
      const r = t !== undefined ? await SF().claudeToken(t) : await SF().claudeComprobar(true);
      toast(r.ok ? "✅ Claude funciona en este equipo" : "❌ " + r.error);
      setToken(""); recargar();
    } catch (e) { toast("❌ " + e.message); }
    setProbando(false);
  };
  const color = !a.claudeInstalado ? "var(--red)" : a.claudeOk === false ? "var(--red)" : a.claudeOk ? "var(--green)" : "var(--text-2)";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color }}>
          {!a.claudeInstalado ? "● No encuentro Claude Code en este equipo" : a.claudeOk === false ? "● Claude Code no puede trabajar: " + a.claudeError : a.claudeOk ? "● Claude Code funciona en este equipo" : "○ Comprobando Claude Code…"}</span>
        <span style={{ flex: 1 }} />
        <button disabled={probando} onClick={() => probar()} style={{ ...botonSec, padding: "6px 11px", fontSize: 12 }}>{probando ? "Probando…" : "Probar"}</button>
      </div>
      {a.claudeInstalado && a.claudeOk !== true && (
        <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.6, background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 10, padding: 10 }}>
          Para que Claude trabaje aquí sin caducar: abre una terminal, escribe <code style={{ color: "var(--gold)" }}>claude setup-token</code>, entra con tu cuenta
          de Claude en el navegador y pega aquí el permiso que te da (empieza por <code>sk-ant-</code>). Se guarda cifrado en este equipo.
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <input type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="sk-ant-…" autoComplete="off"
              style={{ flex: 1, fontSize: 13, padding: "8px 10px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--card-2)", color: "var(--text)" }} />
            <button disabled={!token.trim() || probando} onClick={() => probar(token)} className="grad-gold" style={{ ...botonOro, opacity: (!token.trim() || probando) ? .5 : 1 }}>Guardar y probar</button>
          </div>
        </div>)}
    </div>);
}

// ------------------------------------------------------------------ ajustes del estudio
function AjustesEstudio({ toast }) {
  const [a, setA] = useState(null);
  const [clave, setClave] = useState("");
  const [drive, setDrive] = useState(null);
  const cargar = useCallback(async () => setA(await SF().estudioAjustes()), []);
  const mirarDrive = useCallback(() => {
    if (!driveConectado()) return setDrive({ ok: false, sin: true });
    driveToken().then(t => SF().driveEspacio(t)).then(setDrive).catch(e => setDrive({ ok: false, error: e.message }));
  }, []);
  useEffect(() => { cargar(); mirarDrive(); }, [cargar, mirarDrive]);
  if (!a) return <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>Cargando…</div>;
  const poner = async (nuevos, txt) => { setA(await SF().estudioAjustes(nuevos)); toast(txt); };
  const Interruptor = ({ on, onClick, titulo, ayuda }) => (
    <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 12, textAlign: "left", padding: "12px 14px", borderRadius: 12, border: "1px solid " + (on ? "var(--border-gold)" : "var(--border)"), background: on ? "rgba(212,175,55,.06)" : "var(--card-2)" }}>
      <div style={{ flex: 1 }}><div style={{ fontSize: 13.5, fontWeight: 700 }}>{titulo}</div><div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>{ayuda}</div></div>
      <span style={{ width: 40, height: 22, borderRadius: 20, position: "relative", background: on ? "var(--gold)" : "var(--border)", flexShrink: 0 }}>
        <span style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 16, height: 16, borderRadius: 20, background: "#fff", transition: "left .15s" }} /></span>
    </button>);
  const r = a.ajustes.revisar;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 760 }}>
      <div style={{ ...tarjeta, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--gold)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 4 }}>Revisión manual</div>
        <Interruptor on={r.guion} titulo="Revisar los guiones" ayuda="Se para tras el guion hasta que lo apruebes o pidas cambios." onClick={() => poner({ revisar: { guion: !r.guion } }, r.guion ? "Los guiones ya no se paran" : "Revisarás los guiones")} />
        <Interruptor on={r.voces} titulo="Revisar las voces y efectos" ayuda="Se para tras la mezcla de voz y efectos." onClick={() => poner({ revisar: { voces: !r.voces } }, r.voces ? "Las voces ya no se paran" : "Revisarás las voces")} />
        <Interruptor on={r.animatic} titulo="Revisar el animatic" ayuda="Se para antes del render largo." onClick={() => poner({ revisar: { animatic: !r.animatic } }, r.animatic ? "El animatic ya no se para" : "Revisarás el animatic")} />
        <Interruptor on={a.ajustes.driveAuto} titulo="Subir cada Short a Drive" ayuda="Al entregarlo, se sube entero (vídeo, miniatura y texto) y se comprueba que la copia es idéntica." onClick={() => poner({ driveAuto: !a.ajustes.driveAuto }, "Hecho")} />
        <Interruptor on={a.ajustes.equipoDePaso} titulo="Este equipo no guarda los Shorts" ayuda="Para el ordenador: cuando un Short ya está en Drive (y la copia es idéntica), borra de aquí los vídeos pesados. Los guiones y el audio se quedan." onClick={() => poner({ equipoDePaso: !a.ajustes.equipoDePaso }, a.ajustes.equipoDePaso ? "Este equipo guardará los Shorts" : "Este equipo borrará lo pesado al subirlo a Drive")} />
        <Interruptor on={a.ajustes.avanzarSolo} titulo="Seguir solo" ayuda="Al terminar una etapa empieza la siguiente sin esperar (salvo las que revisas)." onClick={() => poner({ avanzarSolo: !a.ajustes.avanzarSolo }, "Hecho")} />
      </div>
      <div style={{ ...tarjeta }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--gold)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 8 }}>Herramientas</div>
        <ClaudeEstado a={a} toast={toast} recargar={cargar} />
        <div style={{ fontSize: 13, fontWeight: 600, marginTop: 8, color: a.blender ? "var(--green)" : "var(--red)" }}>{a.blender ? "● Blender 4.5 está listo" : "● Falta Blender 4.5 (sin él no se hacen escenas ni render)"}</div>
        <div style={{ fontSize: 13, fontWeight: 600, marginTop: 8, color: a.proyecto ? "var(--green)" : "var(--red)" }}>{a.proyecto ? "● El proyecto de historias está en este equipo" : "● Falta el proyecto de historias (Configuración → Carpetas)"}</div>
        <div style={{ fontSize: 13, fontWeight: 600, marginTop: 8, color: a.eleven ? "var(--green)" : "#F59E0B" }}>{a.eleven ? "● Clave de ElevenLabs guardada (cifrada en este equipo)" : "● Falta la clave de ElevenLabs para las voces"}</div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input type="password" value={clave} onChange={e => setClave(e.target.value)} placeholder={a.eleven ? "Cambiar la clave…" : "Pega aquí tu clave de ElevenLabs"} autoComplete="off"
            style={{ flex: 1, fontSize: 13, padding: "9px 11px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-2)", color: "var(--text)" }} />
          <button onClick={async () => { const x = await SF().estudioClaveEleven(clave); setClave(""); toast(x.eleven ? "Clave guardada" : "Clave borrada"); cargar(); }} className="grad-gold" style={botonOro}>{clave ? "Guardar" : a.eleven ? "Borrar" : "Guardar"}</button>
        </div>
        <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 6 }}>La sacas de elevenlabs.io → Developers → API Keys. Se guarda cifrada en este portátil y no sale de él.</div>
      </div>
      <div style={{ ...tarjeta }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--gold)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 8 }}>Google Drive</div>
        {!drive && <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>Mirando tu espacio…</div>}
        {drive && !drive.ok && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12.5, color: "#F59E0B" }}>{drive.sin ? "Drive sin conectar: los Shorts no se suben todavía." : "No se pudo leer Drive: " + drive.error}</span>
            <button onClick={async () => { try { await driveConectar(); toast("☁️ Drive conectado"); mirarDrive(); } catch (e) { toast(e.message); } }} className="grad-gold" style={botonOro}>Conectar Drive</button>
          </div>)}
        {drive && drive.ok && (<>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{(drive.usado / 1e9).toFixed(1)} GB usados de {drive.limite ? (drive.limite / 1e9).toFixed(0) + " GB" : "sin límite"}</div>
          {drive.limite > 0 && <div style={{ marginTop: 6 }}><Barra valor={drive.usado / drive.limite} alto={8} /></div>}
          <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 6, lineHeight: 1.5 }}>Todo va a «RandomStudio / {"<perfil>"} / Historias». Desde el móvil se descarga desde ahí aunque el portátil esté apagado.
            {" "}<button onClick={() => { driveDesconectar(); mirarDrive(); toast("Drive desconectado"); }} style={{ fontSize: 11.5, color: "var(--text-3)", textDecoration: "underline" }}>Desconectar</button></div>
        </>)}
      </div>
    </div>);
}

// ------------------------------------------------------------------ vista
export function HistoriasView({ toast }) {
  const escritorio = !!(SF() && SF().historiasLista && SF().estudioEtapas);
  const [pestana, setPestana] = useState("proyectos");
  const admin = esAdmin(useRolEquipo());
  const [lista, setLista] = useState(null);
  const [error, setError] = useState("");
  const [selId, setSelId] = useState(null);
  const [det, setDet] = useState(null);
  const [etapas, setEtapas] = useState(null);
  const [mat, setMat] = useState(null);
  const [tarea, setTarea] = useState(null);
  const [ahora, setAhora] = useState(Date.now());
  const [informe, setInforme] = useState(null);
  const listaRef = useRef([]);
  // «Historia 07 · TÍTULO» (mientras no hay guion, el título de la idea)
  const nombreDe = (id) => { const h = (listaRef.current || []).find(x => x.id === id); return "Historia " + id.slice(0, 2) + (h && h.titulo ? " · «" + h.titulo + "»" : ""); };

  const cargar = useCallback(async () => {
    try {
      const r = await SF().historiasLista();
      if (!r.ok) { setError(r.error); return; }
      setLista(r.historias); listaRef.current = r.historias; setError("");
      // (si la elegida se borró o se renumeró, se elige otra)
      setSelId(s => (s && r.historias.some(h => h.id === s)) ? s : (r.historias[0] && r.historias[0].id));
    } catch (e) { setError(e.message || String(e)); }
  }, []);

  const cargarDet = useCallback(async (id) => {
    if (!id) return;
    try {
      const [d, et, m] = await Promise.all([SF().historiasDetalle(id), SF().estudioEtapas(id), SF().estudioMaterial(id)]);
      setDet(d); setEtapas(et.etapas); setMat(m);
    } catch (e) { setDet(null); toast("No se pudo abrir: " + (e.message || e)); }
  }, [toast]);

  const selRef = useRef(selId); selRef.current = selId;
  useEffect(() => {
    if (!escritorio) return;
    cargar();
    SF().historiasTareaEstado().then(st => st.activa && setTarea({ ...st })).catch(() => {});
    const off = SF().onHistoriasProgreso((d) => {
      if (d.tipo === "espera") { toast(`📋 ${nombreDe(d.id)}: te toca revisar ${ETAPA_NOMBRE[d.etapa] || ""}`); cargar(); if (d.id === selRef.current) cargarDet(d.id); return; }
      if (d.tipo === "terminado") { toast(`🎉 ${nombreDe(d.id)} terminada`); cargar(); if (d.id === selRef.current) cargarDet(d.id); return; }
      setTarea(prev => {
        const t = prev && prev.id === d.id ? { ...prev } : { id: d.id, inicio: Date.now(), lineas: [], acciones: [] };
        if (d.tipo === "paso") { t.tipo = t.tipo || "cadena"; t.paso = d.paso; t.render = null; }
        else if (d.tipo === "plano") t.render = d.render;
        else if (d.tipo === "linea") t.lineas = [...(t.lineas || []).slice(-200), d.linea];
        else if (d.tipo === "agente") { t.tipo = "agente"; t.accion = d.accion; t.acciones = [...(t.acciones || []).slice(-60), { t: Date.now(), a: d.accion }]; }
        else if (d.tipo === "agenteTexto") { t.tipo = "agente"; t.lineas = [...(t.lineas || []).slice(-200), d.texto]; }
        else if (d.tipo === "fin") {
          // v3.40.4: si fue el límite de Claude no es un fallo: sigue sola cuando se restablezca (lo lleva remoto.js)
          if (!d.ok && d.limite) toast(`⏸ ${nombreDe(d.id)}: se acabó el límite de Claude. Sigue sola a las ${new Date(d.limite).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`);
          else if (!d.ok) { toast(`${nombreDe(d.id)}: se paró (mira los detalles)`); setInforme({ id: d.id, etapa: d.etapa, texto: d.informe, titulo: ((listaRef.current || []).find(x => x.id === d.id) || {}).titulo }); }
          setTimeout(() => { cargar(); if (d.id === selRef.current) cargarDet(d.id); }, 400);
          return d.ok ? null : { ...t, terminado: true, fallo: true };
        }
        return t;
      });
    });
    const tic = setInterval(() => setAhora(Date.now()), 1000);
    return () => { off && off(); clearInterval(tic); };
  }, [escritorio, cargar, cargarDet, toast]);

  useEffect(() => { if (escritorio) cargarDet(selId); }, [selId, escritorio, cargarDet]);
  // con algo en marcha en la historia abierta, sus etapas se refrescan cada 5 s
  useEffect(() => {
    if (!escritorio || !tarea || tarea.terminado) return;
    const t = setInterval(() => { if (tarea.id === selRef.current) SF().estudioEtapas(tarea.id).then(r => setEtapas(r.etapas)).catch(() => {}); }, 5000);
    return () => clearInterval(t);
  }, [escritorio, tarea && tarea.id, tarea && tarea.terminado]);

  if (!escritorio) return <HistoriasRemoto toast={toast} />;

  const enMarcha = tarea && !tarea.terminado;
  const accion = async (fn, ok) => {
    try { const r = await fn(); if (r && r.ok === false) return toast(r.error); if (r && r.cola) toast("⏳ " + r.mensaje); else if (ok) toast(ok); setTimeout(() => { cargar(); cargarDet(selId); }, 300); }
    catch (e) { toast(e.message || String(e)); }
  };
  const espera = etapas && etapas.find(e => e.estado === "revisar");
  const siguiente = etapas && etapas.find(e => e.estado === "pendiente");
  const terminada = etapas && etapas.every(e => e.estado === "hecho");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 1180, margin: "0 auto", width: "100%" }}>
      <style>{CSS}</style>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 24, letterSpacing: "-.02em" }}>Random<span className="gold-text">Historias</span></div>
          <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>De la idea al Short, con Claude, y tú decides en cada paso</div>
        </div>
        <span style={{ flex: 1 }} />
        <BotonPararTodo toast={toast} />
        <BotonDisponible />
        <div style={{ display: "flex", gap: 4, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 4 }}>
          {[...(admin ? [["todo", "🌐 Todos los equipos"]] : []), ["proyectos", "📁 Historias"], ["cola", "📋 Cola"], ["ideas", "💡 Ideas"], ["ajustes", "⚙️ Ajustes"]].map(([k, t]) => (
            <button key={k} onClick={() => setPestana(k)} className={"rh-tab" + (pestana === k ? " on" : "")}>{t}</button>))}
        </div>
      </div>

      {error && <div style={{ ...tarjeta, color: "var(--red)", fontSize: 13 }}>{error}</div>}
      {tarea && <TareaEnMarcha tarea={tarea} ahora={ahora} titulo={(lista || []).find(h => h.id === tarea.id)?.titulo}
        onCancelar={() => { if (tarea.terminado) setTarea(null); else SF().historiasCancelar().then(() => toast("Parando…")); }} />}
      {informe && (
        <div style={{ ...tarjeta, borderColor: "rgba(248,113,113,.4)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <b style={{ color: "var(--red)" }}>Historia {informe.id.slice(0, 2)}{informe.titulo ? " · " + informe.titulo : ""} · {ETAPA_NOMBRE[informe.etapa] || "tarea"}: se paró</b>
            <span style={{ flex: 1 }} /><button onClick={() => { setInforme(null); setTarea(null); }} style={botonSec}>Cerrar</button>
          </div>
          {informe.texto && <div style={{ fontSize: 12.5, color: "var(--text-2)", whiteSpace: "pre-wrap", marginTop: 8, lineHeight: 1.55 }}>{informe.texto}</div>}
        </div>)}

      {/* v3.40.1: el panel unificado del móvil también en los equipos administradores (organizar desde cualquier lado) */}
      {pestana === "todo" && admin && <HistoriasRemoto toast={toast} incrustado />}
      {pestana === "ideas" && <Ideas toast={toast} onCreada={() => cargar()} />}
      {pestana === "cola" && <ColaTrabajo toast={toast} />}
      {pestana === "ajustes" && <AjustesEstudio toast={toast} />}

      {pestana === "proyectos" && (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(250px,320px) 1fr", gap: 16, alignItems: "start" }} className="historias-grid">
          {/* carpetas */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button onClick={() => setPestana("ideas")} style={{ ...botonSec, borderStyle: "dashed", padding: 12, color: "var(--gold)" }}>+ Nueva historia desde una idea</button>
            {!lista && !error && <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>Cargando…</div>}
            {(lista || []).map(h => {
              const activa = h.id === selId, et = h.etapas || [];
              const hechas = et.filter(x => x.estado === "hecho").length, rev = et.find(x => x.estado === "revisar"), trab = enMarcha && tarea.id === h.id;
              return (
                <button key={h.id} onClick={() => setSelId(h.id)}
                  style={{ display: "flex", gap: 10, alignItems: "center", textAlign: "left", padding: 8, borderRadius: 14,
                    border: `1px solid ${activa ? "var(--border-gold)" : rev ? "rgba(245,158,11,.5)" : "var(--border)"}`,
                    background: activa ? "linear-gradient(135deg,rgba(212,175,55,0.14),rgba(212,175,55,0.03))" : "var(--card)" }}>
                  <div style={{ width: 44, height: 78, borderRadius: 8, overflow: "hidden", flexShrink: 0, background: "var(--card-2)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
                    {h.miniatura ? <img src={h.miniatura} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : "📁"}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-3)", letterSpacing: ".06em" }}>HISTORIA {h.id.slice(0, 2)}</div>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: activa ? "var(--gold)" : "var(--text)", lineHeight: 1.3, margin: "2px 0 6px",
                      overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{h.titulo || "(escribiendo el guion…)"}</div>
                    {h.entregada ? <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--green)" }}>● Entregada</span>
                      : trab ? <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--gold)" }}>● Trabajando…</span>
                      : rev ? <span style={{ fontSize: 10.5, fontWeight: 700, color: "#F59E0B" }}>● Revisa: {ETAPA_NOMBRE[rev.id]}</span>
                      : <div style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ flex: 1 }}><Barra valor={hechas / 6} alto={6} /></div>
                          <span style={{ fontSize: 10.5, color: "var(--text-3)" }}>{hechas}/6</span></div>}
                  </div>
                </button>);
            })}
          </div>

          {/* detalle */}
          {det && etapas && mat && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
              <div style={{ ...tarjeta }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", letterSpacing: ".06em" }}>HISTORIA {det.id.slice(0, 2)}{det.nPlanos ? " · " + det.nPlanos + " PLANOS" : ""}</div>
                    <div style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 19, margin: "4px 0 4px", lineHeight: 1.25 }}>{det.titulo || (mat.idea && mat.idea.titulo) || det.id}</div>
                    {mat.idea && <div style={{ fontSize: 12.5, color: "var(--text-3)", marginBottom: 10 }}>{mat.idea.regla}</div>}
                  </div>
                  {det.entregada && <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--green)", border: "1px solid rgba(74,222,128,0.3)", borderRadius: 999, padding: "4px 10px" }}>Entregada</span>}
                </div>
                <Etapas etapas={etapas} />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14, alignItems: "center" }}>
                  {mat.legado && <span style={{ fontSize: 12, color: "var(--text-3)" }}>Hecha antes del estudio: aquí se ve, se elige la miniatura y se apunta la nota.</span>}
                  {!mat.legado && !(enMarcha && tarea.id === det.id) && siguiente && !espera && (
                    <button onClick={() => accion(() => SF().estudioAvanzar(det.id), enMarcha ? "En cola: empezará al terminar lo que está en marcha" : "En marcha: " + ETAPA_NOMBRE[siguiente.id])} className="grad-gold"
                      style={{ ...botonOro, display: "flex", alignItems: "center", gap: 6 }}>▶ {siguiente.estado === "pendiente" && etapas.some(e => e.estado === "hecho") ? "Seguir" : "Empezar"}: {ETAPA_NOMBRE[siguiente.id]}</button>)}
                  {!mat.legado && <select disabled={!!enMarcha} value="" onChange={e => { const v = e.target.value; if (!v) return; const nota = prompt("¿Qué quieres que cambie al rehacer «" + ETAPA_NOMBRE[v] + "»? (puedes dejarlo vacío)", ""); if (nota === null) return; accion(() => SF().estudioRehacer(det.id, v, nota), "Rehaciendo " + ETAPA_NOMBRE[v]); }}
                    style={{ ...botonSec, appearance: "auto", paddingRight: 8, opacity: enMarcha ? 0.5 : 1 }}>
                    <option value="">Rehacer una etapa…</option>
                    {etapas.filter(e => e.estado !== "pendiente").map(e => <option key={e.id} value={e.id}>{ETAPA_NOMBRE[e.id]}</option>)}
                  </select>}
                  <span style={{ flex: 1 }} />
                  <button onClick={() => SF().historiasAbrir(det.id, "carpeta")} style={botonSec}>Carpeta</button>
                  {det.final && <button onClick={() => SF().historiasAbrir(det.id, "video")} style={botonSec}>Abrir vídeo</button>}
                  {!mat.legado && !(enMarcha && tarea.id === det.id) && (
                    <button onClick={async () => {
                      if (!confirm("¿Borrar «" + (det.titulo || det.id) + "»?\n\nSe mueve a la papelera de este equipo (se puede recuperar desde ahí). Si ya tiene un Short entregado, ese vídeo no se toca. Las historias de detrás se renumeran solas.")) return;
                      try { const r = await borrarHistoria(det.id); if (!r.ok) return toast("❌ " + r.error); toast("🗑 Historia borrada (está en la papelera)"); setSelId(null); cargar(); }
                      catch (e) { toast("❌ " + e.message); }
                    }} style={{ ...botonSec, color: "var(--red)" }}>🗑 Borrar</button>)}
                </div>
              </div>

              {espera && !(enMarcha && tarea.id === det.id) && <Revision key={det.id + espera.id} etapa={espera.id} mat={mat} ocupado={false} cambiosOcupado={!!enMarcha}
                onAprobar={() => accion(() => SF().estudioRevisar(det.id, espera.id, true, ""), "✓ Aprobado: seguimos")}
                onCambios={(nota) => accion(() => SF().estudioRevisar(det.id, espera.id, false, nota), "Claude está aplicando tus cambios")} />}

              {(terminada || (mat.legado && det.final)) && <Terminado key={det.id} det={det} mat={mat} toast={toast} onGuardada={() => cargarDet(det.id)} />}
              {etapas.find(e => e.id === "escena" && e.estado === "hecho") && <ElegirMiniatura key={"m" + det.id} det={det} toast={toast} onHecha={() => { cargar(); cargarDet(det.id); }} />}
            </div>)}
        </div>)}
    </div>);
}

// ------------------------------------------------------------------ desde el móvil (o cualquier equipo sin el proyecto)
/** Ve el portátil en vivo y le manda órdenes (api/remoto). Las descargas van por Drive: funcionan aunque el portátil esté apagado. */
/* v3.38: el panel del móvil, UNIFICADO. Todas las historias juntas (las de los dos equipos y las que esperan en la cola),
 * ordenadas por lo que necesita tu atención; el equipo es solo una etiqueta pequeña en cada tarjeta. Desde aquí se lanzan,
 * se reordenan, se revisan y se paran, sin pensar en qué equipo está cada una. Las órdenes van solas a su equipo. */
const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const icoEquipo = (e) => (e && e.rol === "dueno") ? "💻" : "🖥️";
const corto = (n) => String(n || "").replace(/\s*\(.*\)\s*$/, "");

function EtiquetaEquipo({ e }) {
  if (!e) return null;
  return <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--text-3)", whiteSpace: "nowrap" }}>{icoEquipo(e)} {corto(e.nombre)}</span>;
}

function BarraEtapas({ etapas }) {
  const n = (etapas || []).length || 6;
  return (
    <div style={{ display: "flex", gap: 3 }}>
      {Array.from({ length: n }).map((_, i) => {
        const e = (etapas || [])[i] || {};
        const c = e.estado === "hecho" ? "var(--green)" : e.estado === "revisar" ? "#F59E0B" : e.estado === "trabajando" ? "var(--gold)" : "var(--border)";
        return <span key={i} style={{ flex: 1, height: 4, borderRadius: 3, background: c }} />;
      })}
    </div>);
}

export function HistoriasRemoto({ toast, incrustado }) {
  const [r, setR] = useState(null);
  const [cola, setCola] = useState(null);
  const [error, setError] = useState("");
  const [abierta, setAbierta] = useState(null);         // clave de la tarjeta abierta
  const [pestana, setPestana] = useState("historias");
  const [filtro, setFiltro] = useState("todas");
  const [enviandoIdea, setEnviandoIdea] = useState({});
  const [ahora, setAhora] = useState(Date.now());
  const cargar = useCallback(async () => {
    try { setR(await remotoApi("GET")); setError(""); } catch (e) { setError(e.message); }
    try { setCola(await pedidosApi("GET")); } catch (e) {}
  }, []);
  useEffect(() => {
    cargar();
    const t = setInterval(() => { if (document.visibilityState === "visible") cargar(); }, 4000);
    const a = setInterval(() => setAhora(Date.now()), 1000);
    return () => { clearInterval(t); clearInterval(a); };
  }, [cargar]);

  const equipos = (r && r.equipos || []).filter(e => e.datos && e.datos.historias);
  equipos.sort((a, b) => (b.en_linea - a.en_linea) || ((b.rol === "dueno") - (a.rol === "dueno")));
  const ordenA = async (para, que, args, ok) => {
    if (!para) return toast("Ese equipo no está conectado");
    try { await remotoApi("POST", { accion: "orden", para: para.id, que, args }); toast(ok || "Orden enviada"); setTimeout(cargar, 1500); }
    catch (e) { toast("❌ " + e.message); }
  };
  const pedido = async (cuerpo, ok) => { try { await pedidosApi("POST", cuerpo); if (ok) toast(ok); cargar(); } catch (e) { toast("❌ " + e.message); } };

  if (!r) return <div style={{ ...tarjeta, margin: "30px auto", maxWidth: 520, fontSize: 13, color: error ? "var(--red)" : "var(--text-3)" }}>{error || "Conectando con los equipos…"}</div>;

  // ---------------------------------------------------------------- todas las historias, juntas
  const pedidos = (cola && cola.pedidos) || [];
  const pedidoDe = (hid) => pedidos.find(p => p.historia_id === hid);
  const items = [];
  for (const e of equipos) for (const h of (e.datos.historias || [])) {
    if (h.legado) continue;
    const t = e.datos.tarea && e.datos.tarea.id === h.id ? e.datos.tarea : null;
    const rev = (h.etapas || []).find(x => x.estado === "revisar");
    const p = pedidoDe(h.id);
    const grupo = rev ? "revisar" : t ? "marcha" : h.entregada ? "hechas" : (p && p.estado === "cancelado") ? "paradas"
      : (h.etapas || []).some(x => x.estado === "fallo" || x.estado === "error") || (p && p.estado === "fallido") ? "paradas" : "marcha_pausa";
    items.push({ clave: "h" + h.id, tipo: "historia", h, e, t, rev, p, grupo, nn: h.id.slice(0, 2), titulo: h.titulo });
  }
  const enCola = pedidos.filter(p => p.tipo === "historia" && ["en_cola", "asignado"].includes(p.estado) && !p.historia_id);
  enCola.forEach((p, i) => items.push({ clave: "p" + p.id, tipo: "pedido", p, grupo: "cola", pos: i, titulo: p.titulo, nn: p.numero ? String(p.numero).padStart(2, "0") : null }));
  pedidos.filter(p => p.tipo === "historia" && p.estado === "fallido" && !p.historia_id)
    .forEach(p => items.push({ clave: "p" + p.id, tipo: "pedido", p, grupo: "paradas", titulo: p.titulo }));
  const ideasEnMarcha = pedidos.filter(p => p.tipo === "ideas" && ["en_cola", "asignado", "trabajando"].includes(p.estado));

  const GRUPOS = [
    ["revisar", "📋 Te toca revisar", "#F59E0B"],
    ["marcha", "⚡ En marcha ahora", "var(--gold)"],
    ["cola", "⏳ En la cola", "var(--text-2)"],
    ["marcha_pausa", "⏸ A medias", "var(--text-2)"],
    ["paradas", "⚠️ Paradas", "var(--red)"],
    ["hechas", "✅ Terminadas", "var(--green)"],
  ];
  const FILTROS = [["todas", "Todas"], ["revisar", "📋 Te toca"], ["marcha", "⚡ En marcha"], ["cola", "⏳ En cola"], ["hechas", "✅ Hechas"]];
  const cuenta = (g) => items.filter(x => x.grupo === g).length;
  const visibles = (g) => filtro === "todas" || filtro === g || (filtro === "marcha" && g === "marcha_pausa");

  // ---------------------------------------------------------------- ideas de todos los equipos, juntas
  const ideasVistas = new Set(), ideas = [];
  for (const e of equipos) for (const i of (e.datos.ideas || [])) {
    if (i.estado === "usada" || i.estado === "descartada" || ideasVistas.has(norm(i.titulo))) continue;
    ideasVistas.add(norm(i.titulo)); ideas.push({ ...i, e });
  }
  const pensando = equipos.some(e => e.datos.generandoIdeas) || ideasEnMarcha.length > 0;

  // (una función y no un componente: así la nota que estés escribiendo no se borra cuando se refresca cada 4 s)
  const tarjetaDe = (it) => {
    const abiertaYa = abierta === it.clave;
    const h = it.h, e = it.e;
    let estado, color;
    if (it.tipo === "pedido") {
      estado = it.grupo === "paradas" ? "No se pudo empezar" + (it.p.detalle ? ": " + it.p.detalle : "")
        : it.p.estado === "asignado" ? "Empezando en " + (it.p.equipo_nombre || "un equipo") + "…" : it.pos === 0 ? "La siguiente en empezar" : "Esperando · puesto " + (it.pos + 1);
      color = it.grupo === "paradas" ? "var(--red)" : "var(--text-3)";
    } else if (it.rev) { estado = "Revisa: " + ETAPA_NOMBRE[it.rev.id]; color = "#F59E0B"; }
    else if (it.t) {
      estado = (ETAPA_NOMBRE[it.t.etapa] || "Trabajando") + (it.t.render ? " · plano " + it.t.render.plano + (it.t.render.total ? " (" + it.t.render.hechos + "/" + it.t.render.total + ")" : "") : it.t.accion ? " · " + String(it.t.accion).slice(0, 60) : "");
      color = "var(--gold)";
    } else if (h.entregada) { estado = h.drive ? "Lista y en tu Drive" : "Lista"; color = "var(--green)"; }
    else if (it.grupo === "paradas") { estado = "Parada" + (it.p && it.p.detalle ? ": " + it.p.detalle : ""); color = "var(--red)"; }
    else { const s = (h.etapas || []).find(x => x.estado === "pendiente"); estado = s ? "Siguiente: " + ETAPA_NOMBRE[s.id] : "A medias"; color = "var(--text-2)"; }
    const siguiente = h && (h.etapas || []).find(x => x.estado === "pendiente");
    return (
      <div key={it.clave} style={{ ...tarjeta, padding: 12, borderColor: it.grupo === "revisar" ? "rgba(245,158,11,.5)" : it.grupo === "marcha" ? "var(--border-gold)" : "var(--border)" }}>
        <div role="button" onClick={() => setAbierta(abiertaYa ? null : it.clave)} style={{ display: "flex", flexDirection: "column", gap: 6, cursor: "pointer" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            {it.nn && <span style={{ fontSize: 11, fontWeight: 800, color: "var(--text-3)" }}>{it.nn}</span>}
            <b style={{ fontSize: 13.5, lineHeight: 1.3, flex: 1, minWidth: 0 }}>{it.titulo || "(escribiendo el título…)"}</b>
            <EtiquetaEquipo e={e || (it.p && it.p.equipo ? equipos.find(x => x.id === it.p.equipo) : null)} />
          </div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color }}>{it.grupo === "marcha" && <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: 9, background: "var(--gold)", marginRight: 6, animation: "rh-pulso 1.4s infinite" }} />}{estado}</div>
          {h && <BarraEtapas etapas={h.etapas} />}
        </div>
        {/* acciones rápidas sin abrir */}
        {it.tipo === "pedido" && it.grupo === "cola" && (
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            <button disabled={it.pos === 0} onClick={() => pedido({ accion: "mover", id: it.p.id, al_principio: true }, "Será la siguiente")} style={{ ...botonSec, padding: "6px 10px", opacity: it.pos === 0 ? .4 : 1 }}>⤒ Primera</button>
            <button disabled={it.pos === 0} onClick={() => pedido({ accion: "mover", id: it.p.id, antes_de: enCola[it.pos - 1].id })} style={{ ...botonSec, padding: "6px 10px", opacity: it.pos === 0 ? .4 : 1 }}>↑</button>
            <button disabled={it.pos === enCola.length - 1} onClick={() => pedido({ accion: "mover", id: it.p.id, antes_de: enCola[it.pos + 2] ? enCola[it.pos + 2].id : undefined, al_final: !enCola[it.pos + 2] })} style={{ ...botonSec, padding: "6px 10px", opacity: it.pos === enCola.length - 1 ? .4 : 1 }}>↓</button>
            <span style={{ flex: 1 }} />
            <button onClick={() => { if (confirm("¿Quitar «" + it.titulo + "» de la cola?")) pedido({ accion: "cancelar", id: it.p.id }, "Quitada de la cola"); }} style={{ ...botonSec, padding: "6px 10px", color: "var(--red)" }}>Quitar</button>
          </div>)}
        {it.tipo === "pedido" && it.grupo === "paradas" && (
          <button onClick={() => pedido({ accion: "reintentar", id: it.p.id }, "De vuelta en la cola")} style={{ ...botonSec, marginTop: 8 }}>↻ Volver a intentarlo</button>)}
        {abiertaYa && h && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
            {it.t && <TareaEnMarcha tarea={{ ...it.t, lineas: [] }} ahora={ahora} titulo={h.titulo}
              onCancelar={() => { if (confirm("¿Parar «" + (h.titulo || h.id) + "»?")) ordenA(e, "cancelar", {}, "Parando…"); }} />}
            <Etapas etapas={(h.etapas || []).map(x => ({ ...x, nombre: ETAPA_NOMBRE[x.id] }))} />
            {!it.t && !it.rev && siguiente && !h.entregada && (
              <button disabled={!e.en_linea || !!e.datos.tarea} onClick={() => ordenA(e, "avanzar", { id: h.id }, "▶ En marcha")} className="grad-gold"
                style={{ ...botonOro, alignSelf: "flex-start", opacity: (!e.en_linea || e.datos.tarea) ? .5 : 1 }}>
                ▶ Seguir: {ETAPA_NOMBRE[siguiente.id]}{e.datos.tarea ? " (cuando " + e.nombre + " acabe lo que hace)" : !e.en_linea ? " (" + e.nombre + " apagado)" : ""}</button>)}
            {it.rev && <RevisionRemota h={h} etapa={it.rev.id} onOrden={(q, a, ok) => ordenA(e, q, a, ok)} />}
            {h.drive && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontSize: 12.5, color: "var(--green)", fontWeight: 700 }}>☁️ En tu Drive{h.drive.archivos && h.drive.archivos.every(a => a.verificado) ? " · copia idéntica" : ""}</span>
                {(h.drive.archivos || []).map(a => <a key={a.nombre} href={a.ver} target="_blank" rel="noopener" style={{ ...botonSec, textDecoration: "none" }}>⬇ {/\.mp4$/i.test(a.nombre) ? "Short" : /\.png$/i.test(a.nombre) ? "Miniatura" : a.nombre}</a>)}
                <a href={h.drive.carpeta} target="_blank" rel="noopener" style={{ ...botonSec, textDecoration: "none" }}>Carpeta</a>
              </div>)}
            {h.entregada && !h.drive && <button onClick={() => ordenA(e, "drive_subir", { id: h.id, que: "short" }, "☁️ Subiendo a Drive")} style={{ ...botonSec, alignSelf: "flex-start" }}>☁️ Subir a Drive</button>}
            {h.entregada && <NotaRemota h={h} onOrden={(q, a, ok) => ordenA(e, q, a, ok)} />}
            {!it.t && (
              <button onClick={() => { if (confirm("¿Borrar «" + (h.titulo || h.id) + "»?\n\nSe mueve a la papelera de " + corto(e.nombre) + " (se puede recuperar). Las de detrás se renumeran solas.")) ordenA(e, "borrar", { id: h.id }, "🗑 Borrando en " + corto(e.nombre) + "…"); }}
                style={{ ...botonSec, alignSelf: "flex-start", color: "var(--red)" }}>🗑 Borrar historia</button>)}
            {it.p && ["asignado", "trabajando", "revision"].includes(it.p.estado) && (
              <button onClick={() => { if (confirm("¿Cancelar «" + (h.titulo || h.id) + "»? Lo hecho se queda en " + e.nombre + ".")) pedido({ accion: "cancelar", id: it.p.id }, "Cancelada"); }}
                style={{ ...botonSec, alignSelf: "flex-start", color: "var(--red)" }}>Cancelar esta historia</button>)}
          </div>)}
      </div>);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 900, margin: "0 auto", width: "100%" }}>
      <style>{CSS}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {!incrustado && <div style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 22 }}>Random<span className="gold-text">Historias</span></div>}
        {!incrustado && usoDeEquipos(equipos) && <UsoClaude uso={usoDeEquipos(equipos)} />}
        <span style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 4 }}>
          {[["historias", "📚 Historias"], ["ideas", "💡 Ideas"], ["equipos", "🖥️ Equipos"]].map(([k, t]) => <button key={k} onClick={() => setPestana(k)} className={"rh-tab" + (pestana === k ? " on" : "")}>{t}</button>)}
        </div>
      </div>

      {/* los equipos de un vistazo: una línea cada uno, y «Parar todo» para todos a la vez (p. ej. antes de dormir) */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {equipos.some(e => e.en_linea && (e.datos.tarea || e.datos.disponible !== false)) && (
          <button onClick={() => {
            if (!confirm("¿Parar todo en todos los equipos?\n\nDejan de coger trabajo y paran lo que estén haciendo. Lo hecho se queda: cuando vuelvan a estar disponibles, siguen solos.")) return;
            equipos.filter(e => e.en_linea).forEach(e => ordenA(e, "parar_todo", {}, "⏹ Parando " + corto(e.nombre) + "…"));
          }} style={{ ...botonSec, padding: "6px 10px", fontSize: 12, color: "var(--red)", borderColor: "rgba(248,113,113,.4)" }}>⏹ Parar todo</button>)}
        {equipos.length === 0 && <span style={{ fontSize: 12.5, color: "#F59E0B", fontWeight: 600 }}>Ningún equipo conectado: lo que pidas espera en la cola.</span>}
        {equipos.map(e => {
          const t = e.datos.tarea, cap = e.datos.capacidad || {};
          const [c, txt] = !e.en_linea ? ["var(--red)", "apagado"] : t ? ["var(--gold)", "trabajando"] : e.datos.disponible === false ? ["var(--text-3)", "no disponible"]
            : cap.claude === false ? ["#F59E0B", "le falta Claude"] : e.datos.generandoIdeas ? ["var(--gold)", "pensando ideas"] : ["var(--green)", "libre"];
          return <button key={e.id} onClick={() => setPestana("equipos")} style={{ ...botonSec, padding: "6px 10px", fontSize: 12 }}>{icoEquipo(e)} {corto(e.nombre)} <b style={{ color: c }}>● {txt}</b></button>;
        })}
      </div>

      {pestana === "historias" && (<>
        <NuevaPeticion toast={toast} alHacer={cargar} />
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
          {FILTROS.map(([k, t]) => {
            const n = k === "todas" ? items.length : k === "marcha" ? cuenta("marcha") + cuenta("marcha_pausa") : cuenta(k);
            return <button key={k} onClick={() => setFiltro(k)} className={"rh-tab" + (filtro === k ? " on" : "")} style={{ whiteSpace: "nowrap" }}>{t}{n ? " · " + n : ""}</button>;
          })}
        </div>
        {GRUPOS.filter(([g]) => visibles(g) && cuenta(g)).map(([g, t, c]) => (
          <div key={g} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: c, textTransform: "uppercase", letterSpacing: ".05em" }}>{t} · {cuenta(g)}</div>
            {items.filter(x => x.grupo === g).map(tarjetaDe)}
          </div>))}
        {!items.length && <div style={{ ...tarjeta, fontSize: 13, color: "var(--text-3)" }}>Aún no hay historias. Pide una arriba o lanza una idea desde 💡 Ideas.</div>}
      </>)}

      {pestana === "ideas" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button disabled={pensando} onClick={() => pedido({ accion: "crear", tipo: "ideas", titulo: "Pensar 5 ideas", args: { n: 5 } }, "💡 Pedido: pensar 5 ideas")} className="grad-gold"
            style={{ ...botonOro, alignSelf: "flex-start", opacity: pensando ? .5 : 1 }}>{pensando ? "Pensando ideas…" : "💡 Pedir 5 ideas"}</button>
          {!ideas.length && <div style={{ ...tarjeta, fontSize: 13, color: "var(--text-3)" }}>No hay ideas por mirar.</div>}
          {ideas.map(i => (
            <div key={i.e.id + i.id} style={{ ...tarjeta, display: "flex", flexDirection: "column", gap: 6 }}>
              <b style={{ fontFamily: "'Sora'" }}>{i.titulo}</b>
              <div style={{ fontSize: 12.5, color: "var(--gold)" }}>{i.regla}</div>
              <div style={{ fontSize: 12.5, color: "var(--text-2)" }}>{i.resumen}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                {i.estado === "en_cola" ? <span style={{ fontSize: 12, fontWeight: 700, color: "var(--gold)", padding: "8px 4px" }}>📋 En la cola</span>
                  : <button disabled={!!enviandoIdea[i.id]} onClick={async () => {
                      if (enviandoIdea[i.id]) return;
                      setEnviandoIdea(x => ({ ...x, [i.id]: true }));
                      try { const { id, estado, historia, e, ...idea } = i; await pedidosApi("POST", { accion: "crear", tipo: "historia", titulo: i.titulo, args: { idea } }); ordenA(i.e, "idea_poner", { id: i.id, estado: "en_cola" }, "📋 Añadida a la cola"); }
                      catch (x) { if (/ya está/.test(x.message)) ordenA(i.e, "idea_poner", { id: i.id, estado: "en_cola" }); toast((/ya está/.test(x.message) ? "📋 " : "❌ ") + x.message); setEnviandoIdea(y => { const z = { ...y }; delete z[i.id]; return z; }); }
                    }} className="grad-gold" style={{ ...botonOro, opacity: enviandoIdea[i.id] ? .6 : 1 }}>{enviandoIdea[i.id] ? "Añadiendo…" : "📋 Añadir a la cola"}</button>}
                <button onClick={() => ordenA(i.e, "idea_poner", { id: i.id, estado: i.estado === "guardada" ? "nueva" : "guardada" })} style={botonSec}>{i.estado === "guardada" ? "Quitar ⭐" : "⭐ Guardar"}</button>
                <button onClick={() => ordenA(i.e, "idea_poner", { id: i.id, estado: "descartada" })} style={{ ...botonSec, color: "var(--text-3)" }}>Descartar</button>
              </div>
            </div>))}
        </div>)}

      {pestana === "equipos" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {equipos.map(e => {
            const t = e.datos.tarea, cap = e.datos.capacidad || {};
            const falta = !cap.proyecto ? "le falta el proyecto de historias" : cap.claude === false ? (cap.claudeError || "le falta Claude Code") : cap.eleven === false ? "le falta la clave de ElevenLabs (no podrá hacer voces)" : "";
            return (
              <div key={e.id} style={{ ...tarjeta, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <b style={{ fontFamily: "'Sora'", fontSize: 15 }}>{icoEquipo(e)} {corto(e.nombre)}</b>
                  <span style={{ fontSize: 12, fontWeight: 700, color: e.en_linea ? "var(--green)" : "var(--red)" }}>● {e.en_linea ? "en línea" : "sin conexión desde " + new Date(e.actualizado).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</span>
                  {e.datos.version && <span style={{ fontSize: 11, color: "var(--text-3)" }}>v{e.datos.version}</span>}
                  <span style={{ fontSize: 12, color: e.datos.disponible === false ? "var(--text-3)" : "var(--green)" }}>{e.datos.disponible === false ? "· no disponible" : "· disponible"}</span>
                </div>
                {falta && <div style={{ fontSize: 12, color: "#F59E0B", fontWeight: 600 }}>⚠️ {falta}</div>}
                {t ? <TareaEnMarcha tarea={{ ...t, lineas: [] }} ahora={ahora} titulo={t.titulo}
                  onCancelar={() => { if (confirm("¿Parar la tarea en " + e.nombre + "?")) ordenA(e, "cancelar", {}, "Parando en " + e.nombre + "…"); }} />
                  : <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>{e.datos.generandoIdeas ? "Pensando ideas…" : "Sin tarea ahora mismo."}</div>}
              </div>);
          })}
        </div>)}
    </div>);
}

function RevisionRemota({ h, etapa, onOrden }) {
  const [nota, setNota] = useState("");
  const link = (h.driveRevision || {})[etapa];
  return (
    <div style={{ border: "1px solid rgba(245,158,11,.5)", borderRadius: 12, padding: 12, background: "rgba(245,158,11,.06)", display: "flex", flexDirection: "column", gap: 8 }}>
      <b>Te toca revisar: {ETAPA_NOMBRE[etapa]}</b>
      {etapa === "guion" && <div style={{ fontSize: 13.5, lineHeight: 1.7, whiteSpace: "pre-wrap", maxHeight: 340, overflow: "auto", background: "var(--bg-2)", borderRadius: 10, padding: 12 }}>{h.narracion || "(cargando el texto…)"}</div>}
      {etapa !== "guion" && (link ? <a href={link.ver} target="_blank" rel="noopener" className="grad-gold" style={{ ...botonOro, textDecoration: "none", alignSelf: "flex-start" }}>{etapa === "voces" ? "🎧 Escuchar en Drive" : "🎞️ Ver el animatic en Drive"}</a>
        : <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>Subiéndolo a Drive para que lo veas…</div>)}
      <textarea value={nota} onChange={e => setNota(e.target.value)} rows={3} placeholder="Cambios (vacío si está bien)"
        style={{ width: "100%", fontSize: 13, padding: 10, borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-2)", color: "var(--text)" }} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button disabled={!!nota.trim()} onClick={() => onOrden("revisar", { id: h.id, etapa, ok: true }, "✓ Aprobado")} className="grad-gold" style={{ ...botonOro, opacity: nota.trim() ? .5 : 1 }}>✓ Está bien, seguir</button>
        <button disabled={!nota.trim()} onClick={() => onOrden("revisar", { id: h.id, etapa, ok: false, nota: nota.trim() }, "Cambios enviados")} style={{ ...botonSec, color: "#F59E0B", opacity: nota.trim() ? 1 : .5 }}>Pedir estos cambios</button>
      </div>
    </div>);
}

function NotaRemota({ h, onOrden }) {
  const [nota, setNota] = useState("");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <textarea value={nota} onChange={e => setNota(e.target.value)} rows={2} placeholder="(opcional) ¿Algún fallo en este Short?"
        style={{ width: "100%", fontSize: 13, padding: 10, borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-2)", color: "var(--text)" }} />
      {nota.trim() && <button onClick={() => { onOrden("nota", { id: h.id, texto: nota.trim() }, "Nota guardada en el portátil"); setNota(""); }} style={{ ...botonSec, alignSelf: "flex-start" }}>Guardar la nota</button>}
    </div>);
}
