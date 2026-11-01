import React from "react";
const { useState, useEffect, useCallback } = React;
import { alCambiarDisponible, disponible, pedidosApi, ponerDisponible } from "./remoto";

/* ============================ COLA DE TRABAJO (v3.33) ============================
 * La cola compartida de pedidos (/api/pedidos): se ve igual desde el portátil, el ordenador y el móvil.
 * Arriba, los equipos de trabajo (en línea, disponible, qué hacen) y si el trabajo es individual o dual.
 * Debajo, los pedidos: los que esperan se pueden subir, bajar o cancelar; los que se hacen dicen en qué equipo y por dónde van.
 */
const ESTADO = {
  en_cola: ["En cola", "var(--text-2)"], asignado: ["Empezando", "var(--gold)"], trabajando: ["Trabajando", "var(--gold)"],
  revision: ["Te toca revisar", "#F59E0B"], hecho: ["Hecho", "var(--green)"], cancelado: ["Cancelado", "var(--text-3)"], fallido: ["Falló", "var(--red)"],
};
const ETAPA = { guion: "guion", voces: "voces y efectos", escena: "escena 3D", animatic: "animatic", render: "render", montaje: "montaje" };
const boton = { fontSize: 12, fontWeight: 700, borderRadius: 9, padding: "6px 10px", border: "1px solid var(--border)", background: "var(--card-2)", color: "var(--text)" };
const hace = (s) => { if (!s) return ""; const m = Math.round((Date.now() - new Date(s).getTime()) / 60000); return m < 1 ? "ahora" : m < 60 ? "hace " + m + " min" : "hace " + Math.round(m / 60) + " h"; };

export function useDisponible() {
  const [d, setD] = useState(disponible());
  useEffect(() => alCambiarDisponible(setD), []);
  return d;
}

/** El botón «Disponible / No disponible» de ESTE equipo (solo escritorio). */
export function BotonDisponible() {
  const d = useDisponible();
  if (!window.studioFS) return null;
  return (
    <button onClick={() => ponerDisponible(!d)} title={d ? "Este equipo coge trabajo de la cola. Pulsa para dejar de cogerlo." : "Este equipo no coge trabajo nuevo. Pulsa para ponerlo disponible."}
      style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 700, borderRadius: 99, padding: "7px 13px",
        border: "1px solid " + (d ? "rgba(74,222,128,.5)" : "var(--border)"), background: d ? "rgba(74,222,128,.10)" : "var(--card-2)", color: d ? "var(--green)" : "var(--text-3)" }}>
      <span style={{ width: 9, height: 9, borderRadius: 9, background: d ? "var(--green)" : "var(--text-3)", boxShadow: d ? "0 0 8px var(--green)" : "none" }} />
      {d ? "Disponible para trabajar" : "No disponible"}
    </button>);
}

export function ColaTrabajo({ toast }) {
  const [r, setR] = useState(null);
  const [error, setError] = useState("");
  const [verTodo, setVerTodo] = useState(false);
  const cargar = useCallback(async () => { try { setR(await pedidosApi("GET")); setError(""); } catch (e) { setError(e.message); } }, []);
  useEffect(() => {
    cargar();
    const t = setInterval(() => { if (document.visibilityState === "visible") cargar(); }, 4000);
    return () => clearInterval(t);
  }, [cargar]);
  const accion = async (cuerpo, ok) => { try { await pedidosApi("POST", cuerpo); if (ok) toast(ok); cargar(); } catch (e) { toast("❌ " + e.message); } };

  if (!r) return <div style={{ fontSize: 13, color: error ? "var(--red)" : "var(--text-3)" }}>{error || "Cargando la cola…"}</div>;
  const equipos = r.equipos.filter(e => e.en_linea);
  const trabajan = equipos.filter(e => e.disponible && e.capacidad && e.capacidad.proyecto);
  const modo = trabajan.length >= 2 ? "dual" : trabajan.length === 1 ? "individual" : "parado";
  const esperando = r.pedidos.filter(p => p.estado === "en_cola");
  const enCurso = r.pedidos.filter(p => ["asignado", "trabajando", "revision"].includes(p.estado));
  const pasados = r.pedidos.filter(p => ["hecho", "cancelado", "fallido"].includes(p.estado)).sort((a, b) => new Date(b.terminado || b.actualizado) - new Date(a.terminado || a.actualizado));

  const Fila = ({ p, i }) => {
    const [txt, col] = ESTADO[p.estado] || [p.estado, "var(--text-2)"];
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 11, background: "var(--card-2)", border: "1px solid var(--border)", flexWrap: "wrap" }}>
        {p.estado === "en_cola" && <span style={{ width: 24, height: 24, borderRadius: 7, background: "var(--bg-2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: "var(--gold)" }}>{i + 1}</span>}
        <div style={{ flex: "1 1 220px", minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {p.tipo === "ideas" ? "💡 Pensar ideas" : "🎬 " + (p.titulo || "Historia")}
            {p.numero ? <span style={{ color: "var(--text-3)", fontWeight: 600 }}> · historia {String(p.numero).padStart(2, "0")}</span> : null}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 2 }}>
            <b style={{ color: col }}>{txt}</b>
            {p.equipo_nombre && p.estado !== "en_cola" ? " · en " + p.equipo_nombre : ""}
            {p.detalle ? " · " + (ETAPA[p.detalle] || p.detalle) : ""}
            {" · pedido " + hace(p.creado)}{p.creado_por_nombre ? " desde " + p.creado_por_nombre : ""}
          </div>
        </div>
        {p.estado === "en_cola" && (<>
          <button disabled={i === 0} onClick={() => accion({ accion: "mover", id: p.id, al_principio: true }, "Subido al primero")} title="Ponerlo el primero" style={{ ...boton, opacity: i === 0 ? .4 : 1 }}>⤒</button>
          <button disabled={i === 0} onClick={() => accion({ accion: "mover", id: p.id, antes_de: esperando[i - 1].id })} title="Subir" style={{ ...boton, opacity: i === 0 ? .4 : 1 }}>↑</button>
          <button disabled={i === esperando.length - 1} onClick={() => accion({ accion: "mover", id: p.id, antes_de: esperando[i + 2] ? esperando[i + 2].id : undefined, al_final: !esperando[i + 2] })} title="Bajar" style={{ ...boton, opacity: i === esperando.length - 1 ? .4 : 1 }}>↓</button>
        </>)}
        {["en_cola", "asignado", "trabajando", "revision"].includes(p.estado) && (
          <button onClick={() => { if (confirm(p.estado === "en_cola" ? "¿Quitar este pedido de la cola?" : "¿Parar y cancelar este pedido? Lo hecho hasta ahora se queda en su equipo.")) accion({ accion: "cancelar", id: p.id }, "Pedido cancelado"); }}
            style={{ ...boton, color: "var(--red)", borderColor: "rgba(248,113,113,.35)" }}>Cancelar</button>)}
        {["fallido", "cancelado"].includes(p.estado) && !p.historia_id && (
          <button onClick={() => accion({ accion: "reintentar", id: p.id }, "De vuelta en la cola")} style={boton}>Reintentar</button>)}
      </div>);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          <div style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 16 }}>
            {modo === "dual" ? "⚡ Trabajo dual" : modo === "individual" ? "Trabajo individual" : "Ningún equipo trabajando"}</div>
          <span style={{ fontSize: 12, color: "var(--text-3)" }}>
            {modo === "dual" ? "los pedidos se reparten entre los dos equipos; el portátil coge primero" : modo === "individual" ? "todo lo hace " + trabajan[0].nombre : "abre RandomStudio en un equipo y déjalo disponible"}</span>
          <span style={{ flex: 1 }} />
          <BotonDisponible />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 8 }}>
          {r.equipos.map(e => {
            const listo = e.capacidad && e.capacidad.proyecto && e.capacidad.claude;
            const est = !e.en_linea ? ["Apagado", "var(--text-3)"] : !e.disponible ? ["No disponible", "var(--text-3)"] : !listo ? ["Sin preparar", "#F59E0B"] : e.ocupado ? ["Trabajando", "var(--gold)"] : ["Libre", "var(--green)"];
            return (
              <div key={e.id} style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid " + (e.id === r.yo ? "var(--border-gold)" : "var(--border)"), background: "var(--card-2)", opacity: e.en_linea ? 1 : .6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 9, background: est[1] }} />
                  <b style={{ fontSize: 13 }}>{e.nombre}{e.id === r.yo ? " (este)" : ""}</b>
                  <span style={{ flex: 1 }} /><span style={{ fontSize: 11.5, fontWeight: 700, color: est[1] }}>{est[0]}</span>
                </div>
                {e.tarea && <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 4 }}>Historia {String(e.tarea.id || "").slice(0, 2)} · {ETAPA[e.tarea.etapa] || e.tarea.etapa || "en marcha"}{e.tarea.render ? " · plano " + e.tarea.render.plano : ""}</div>}
                {e.en_linea && !listo && <div style={{ fontSize: 11.5, color: "#F59E0B", marginTop: 4 }}>Le falta {!e.capacidad.proyecto ? "el proyecto de historias" : "Claude Code"}</div>}
              </div>);
          })}
          {!r.equipos.length && <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>Ningún equipo de escritorio ha dado señales todavía.</div>}
        </div>
      </div>

      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--gold)", textTransform: "uppercase", letterSpacing: ".07em" }}>En marcha · {enCurso.length}</div>
        {!enCurso.length && <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>Nada en marcha.</div>}
        {enCurso.map(p => <Fila key={p.id} p={p} />)}
        <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--gold)", textTransform: "uppercase", letterSpacing: ".07em", marginTop: 8 }}>Esperando turno · {esperando.length}</div>
        {!esperando.length && <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>La cola está vacía. Añade historias desde Ideas («Añadir a la cola»).</div>}
        {esperando.map((p, i) => <Fila key={p.id} p={p} i={i} />)}
        {pasados.length > 0 && (<>
          <button onClick={() => setVerTodo(v => !v)} style={{ alignSelf: "flex-start", fontSize: 12, color: "var(--text-3)", fontWeight: 700, marginTop: 8 }}>{verTodo ? "Ocultar el historial" : "Ver el historial (" + pasados.length + ")"}</button>
          {verTodo && pasados.slice(0, 40).map(p => <Fila key={p.id} p={p} />)}
        </>)}
      </div>
    </div>);
}
