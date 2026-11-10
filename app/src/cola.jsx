import React from "react";
const { useState, useEffect, useCallback } = React;
import { alCambiarDisponible, disponible, enTodosLosEquipos, guardarParado, pedidosApi, ponerDisponible } from "./remoto";
import { alTimbre } from "./timbre";

/* ============================ COLA DE TRABAJO (v3.33) ============================
 * La cola compartida de pedidos (/api/pedidos): se ve igual desde el portátil, el ordenador y el móvil.
 * Arriba, los equipos de trabajo (en línea, disponible, qué hacen) y si el trabajo es individual o dual.
 * Debajo, los pedidos: los que esperan se pueden subir, bajar o cancelar; los que se hacen dicen en qué equipo y por dónde van.
 */
const ESTADO = {
  en_cola: ["En cola", "var(--text-2)"], asignado: ["Empezando", "var(--gold)"], trabajando: ["Trabajando", "var(--gold)"],
  revision: ["Te toca revisar", "#F59E0B"], por_animar: ["Preparada: espera al portátil", "#60A5FA"], hecho: ["Hecho", "var(--green)"], cancelado: ["Cancelado", "var(--text-3)"], fallido: ["Falló", "var(--red)"],
};
const ETAPA = { guion: "guion", voces: "voces y efectos", escribir: "escribir la escena", escena: "escena 3D", animatic: "animatic", render: "render", montaje: "montaje" };
const boton = { fontSize: 12, fontWeight: 700, borderRadius: 9, padding: "6px 10px", border: "1px solid var(--border)", background: "var(--card-2)", color: "var(--text)" };
const hace = (s) => { if (!s) return ""; const m = Math.round((Date.now() - new Date(s).getTime()) / 60000); return m < 1 ? "ahora" : m < 60 ? "hace " + m + " min" : "hace " + Math.round(m / 60) + " h"; };

export function useDisponible() {
  const [d, setD] = useState(disponible());
  useEffect(() => alCambiarDisponible(setD), []);
  return d;
}

/** El estado de ESTE equipo junto a «Parar / Reanudar todo» (solo escritorio).
 * Disponible: botón verde; al pulsarlo deja de coger trabajo nuevo pero termina lo que tiene (parada suave).
 * Parado: solo se informa (la acción es «Reanudar todo», al lado). */
export function BotonDisponible() {
  const d = useDisponible();
  if (!window.studioFS) return null;
  // v3.45.7: «Parado» también se pulsa (antes era solo un letrero y él no encontraba cómo volver a ponerlo disponible):
  // este equipo vuelve a coger trabajo, sin tocar los demás
  if (!d) return (
    <button onClick={() => { guardarParado(false); ponerDisponible(true); }} className="rs-btn ghost"
      title="Este equipo no coge trabajo. Pulsa para que vuelva a cogerlo (solo este equipo; «Reanudar todo» los reanuda todos).">
      <span style={{ width: 8, height: 8, borderRadius: 8, background: "var(--text-3)" }} />Parado · pulsa para seguir
    </button>);
  return (
    <button onClick={() => { guardarParado(true); ponerDisponible(false); }} className="rs-btn ok"
      title="Este equipo coge trabajo de la cola. Pulsa para que termine lo que está haciendo y no coja más.">
      <span style={{ width: 8, height: 8, borderRadius: 8, background: "var(--green)" }} />Disponible
    </button>);
}

/** v3.38.2 / v3.43.1: PARAR TODO y REANUDAR TODO, en todos los equipos a la vez (este y los demás que estén encendidos).
 * Parar: dejan de coger trabajo y paran lo que estén haciendo; lo hecho se queda. La parada se recuerda aunque se reinicien.
 * Reanudar: vuelven a coger trabajo y siguen cada historia por donde iba. */
export function BotonPararTodo({ toast }) {
  const d = useDisponible();
  const [haciendo, setHaciendo] = useState(false);
  if (!window.studioFS || !window.studioFS.historiasPararTodo) return null;
  const hacer = async (que) => {
    if (que === "reanudar_todo" && !confirm("¿Reanudar TODOS los equipos?\n\nPara reanudar solo uno, hazlo desde su tarjeta en RandomHistorias › Equipos.")) return;
    if (que === "parar_todo" && !confirm("¿Parar todo?\n\nTodos los equipos encendidos dejan de coger trabajo y paran lo que estén haciendo. Lo hecho se queda guardado.\n\nSeguirán parados (aunque se reinicien) hasta que pulses «Reanudar todo».")) return;
    setHaciendo(true);
    try {
      const otros = await enTodosLosEquipos(que);
      const y = otros ? " (y " + otros + " equipo" + (otros > 1 ? "s" : "") + " más)" : "";
      if (toast) toast(que === "parar_todo" ? "⏹ Todo parado" + y + ". No se gastan tokens hasta que reanudes." : "▶ Reanudado" + y + ": las historias siguen por donde iban.");
    } catch (e) { if (toast) toast("❌ " + e.message); }
    setHaciendo(false);
  };
  return d
    ? <button disabled={haciendo} onClick={() => hacer("parar_todo")} className="rs-btn danger"
        title="Para todos los equipos y deja de gastar tokens (lo hecho se queda; sigue al reanudar)">{haciendo ? "Parando…" : "⏹ Parar todo"}</button>
    : <button disabled={haciendo} onClick={() => hacer("reanudar_todo")} className="rs-btn primary"
        title="Todos los equipos vuelven a coger trabajo y siguen las historias por donde iban">{haciendo ? "Reanudando…" : "▶ Reanudar todo"}</button>;
}

/** v3.43.1: en la barra lateral (cualquier apartado), el estado de las historias en este equipo y el atajo para parar o
 * reanudar todo sin tener que ir a RandomHistorias (p. ej. antes de dormir). */
export function EstadoHistoriasLateral({ plegada, toast }) {
  const d = useDisponible();
  const [haciendo, setHaciendo] = useState(false);
  if (!window.studioFS || !window.studioFS.historiasPararTodo) return null;
  const que = d ? "parar_todo" : "reanudar_todo";
  const pulsar = async () => {
    if (!d && !confirm("¿Reanudar TODOS los equipos?\n\nPara reanudar solo uno, hazlo desde su tarjeta en RandomHistorias › Equipos.")) return;
    if (d && !confirm("¿Parar todo?\n\nTodos los equipos encendidos dejan de coger trabajo y paran lo que estén haciendo. Lo hecho se queda guardado.\n\nSeguirán parados hasta que pulses «Reanudar todo».")) return;
    setHaciendo(true);
    try { const otros = await enTodosLosEquipos(que); if (toast) toast((d ? "⏹ Todo parado" : "▶ Reanudado") + (otros ? " (y " + otros + " equipo" + (otros > 1 ? "s" : "") + " más)" : "")); }
    catch (e) { if (toast) toast("❌ " + e.message); }
    setHaciendo(false);
  };
  return (
    <div className="fila">
      <button onClick={pulsar} disabled={haciendo} title={d ? "Historias en marcha · pulsa para PARAR todo (todos los equipos)" : "Historias paradas · pulsa para REANUDAR todo"}>
        <span className="sync-dot" style={{ background: d ? "var(--green)" : "var(--text-3)" }} />
        {!plegada && <span className="txt">{d ? "Historias en marcha" : "Historias paradas"}</span>}
        {!plegada && <span style={{ fontSize: 11, fontWeight: 700, color: d ? "var(--red)" : "var(--gold)" }}>{haciendo ? "…" : d ? "Parar" : "Reanudar"}</span>}
      </button>
    </div>);
}

/** Pedir trabajo a la cola desde cualquier equipo (también el móvil): una historia con tu propia idea, o que piensen ideas.
 * No depende de que el portátil esté publicando: el pedido se queda en la cola y lo coge el primer equipo disponible. */
export function NuevaPeticion({ toast, alHacer }) {
  const [abierto, setAbierto] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [idea, setIdea] = useState("");
  const [enviando, setEnviando] = useState(false);
  const pedir = async (cuerpo, ok) => {
    setEnviando(true);
    try { await pedidosApi("POST", cuerpo); toast(ok); setTitulo(""); setIdea(""); setAbierto(false); alHacer && alHacer(); }
    catch (e) { toast("❌ " + e.message); }
    setEnviando(false);
  };
  const t = titulo.trim().toUpperCase();
  const listo = t.length >= 6 && idea.trim().length >= 10;
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border-gold)", borderRadius: 16, padding: 16 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 15, marginRight: "auto" }}>Pedir trabajo</div>
        <button onClick={() => setAbierto(a => !a)} className={abierto ? "" : "grad-gold"} style={{ ...boton, color: abierto ? "var(--text)" : "#000", border: abierto ? boton.border : "none", background: abierto ? boton.background : undefined, padding: "8px 13px" }}>
          {abierto ? "Cerrar" : "✍️ Nueva historia con mi idea"}</button>
        <button disabled={enviando} onClick={() => pedir({ accion: "crear", tipo: "ideas", titulo: "Pensar 5 ideas", args: { n: 5 } }, "💡 Pedido: pensar 5 ideas (salen en Ideas)")}
          style={{ ...boton, padding: "8px 13px" }}>💡 Pedir 5 ideas</button>
      </div>
      {abierto && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
          <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Título (p. ej. EN ESTE PUEBLO TODOS VUELAN!!!)"
            style={{ fontSize: 16, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-2)", color: "var(--text)", textTransform: "uppercase" }} />
          <textarea value={idea} onChange={e => setIdea(e.target.value)} rows={4} placeholder="¿Cuál es la regla del pueblo y qué pasa? (lo que tengas: Claude escribe el guion con nuestro criterio)"
            style={{ fontSize: 16, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-2)", color: "var(--text)", resize: "vertical", lineHeight: 1.5 }} />
          <button disabled={!listo || enviando} className="grad-gold"
            onClick={() => pedir({ accion: "crear", tipo: "historia", titulo: t, args: { idea: { titulo: t, regla: idea.trim().split(/[.\n]/)[0], resumen: idea.trim(), fundamento: "idea del usuario" } } }, "📋 «" + t + "» añadida a la cola")}
            style={{ ...boton, color: "#000", border: "none", background: undefined, alignSelf: "flex-start", padding: "9px 15px", opacity: (!listo || enviando) ? .5 : 1 }}>
            {enviando ? "Añadiendo…" : "📋 Añadir a la cola"}</button>
          <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>La prepara el primer equipo libre (guion y voces) y la anima el portátil; la ves avanzar aquí mismo.</div>
        </div>)}
    </div>);
}

export function ColaTrabajo({ toast }) {
  const [r, setR] = useState(null);
  const [error, setError] = useState("");
  const [verTodo, setVerTodo] = useState(false);
  const cargar = useCallback(async () => { try { setR(await pedidosApi("GET")); setError(""); } catch (e) { setError(e.message); } }, []);
  useEffect(() => {
    cargar();
    // (v3.42.1) con el timbre, los cambios se ven al instante; la vuelta de 15 s queda de respaldo
    let pronto = null;
    // (10-11, menos tráfico) solo los avisos de la cola, juntados 2 s; el respaldo, cada minuto
    const off = alTimbre((d) => { if (d && d.que && d.que !== "pedidos") return; clearTimeout(pronto); pronto = setTimeout(cargar, 2000); });
    const t = setInterval(() => { if (document.visibilityState === "visible") cargar(); }, 60000);
    return () => { off(); clearTimeout(pronto); clearInterval(t); };
  }, [cargar]);
  const accion = async (cuerpo, ok) => { try { await pedidosApi("POST", cuerpo); if (ok) toast(ok); cargar(); } catch (e) { toast("❌ " + e.message); } };

  if (!r) return <div style={{ fontSize: 13, color: error ? "var(--red)" : "var(--text-3)" }}>{error || "Cargando la cola…"}</div>;
  const equipos = r.equipos.filter(e => e.en_linea);
  const trabajan = equipos.filter(e => e.disponible && e.capacidad && e.capacidad.proyecto && e.capacidad.claude);
  const modo = trabajan.length >= 2 ? "dual" : trabajan.length === 1 ? "individual" : "parado";
  const esperando = r.pedidos.filter(p => p.estado === "en_cola");
  const enCurso = r.pedidos.filter(p => ["asignado", "trabajando", "revision", "por_animar"].includes(p.estado));
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
        {["en_cola", "asignado", "trabajando", "revision", "por_animar"].includes(p.estado) && (
          <button onClick={() => { if (confirm(p.estado === "en_cola" ? "¿Quitar este pedido de la cola?" : "¿Parar y cancelar este pedido? Lo hecho hasta ahora se queda en su equipo.")) accion({ accion: "cancelar", id: p.id }, "Pedido cancelado"); }}
            style={{ ...boton, color: "var(--red)", borderColor: "rgba(248,113,113,.35)" }}>Cancelar</button>)}
        {["fallido", "cancelado"].includes(p.estado) && !p.historia_id && (
          <button onClick={() => accion({ accion: "reintentar", id: p.id }, "De vuelta en la cola")} style={boton}>Reintentar</button>)}
      </div>);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <NuevaPeticion toast={toast} alHacer={cargar} />
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          <div style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 16 }}>
            {modo === "dual" ? "⚡ Trabajo dual" : modo === "individual" ? "Trabajo individual" : "Ningún equipo trabajando"}</div>
          <span style={{ fontSize: 12, color: "var(--text-3)" }}>
            {modo === "dual" ? "los pedidos nuevos los prepara el ordenador (guion y voces) y el portátil anima y renderiza" : modo === "individual" ? "todo lo hace " + trabajan[0].nombre : "abre RandomStudio en un equipo y déjalo disponible"}</span>
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
                {e.tarea && <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 4 }}>Historia {String(e.tarea.id || "").slice(0, 2)}{e.tarea.titulo ? " · «" + e.tarea.titulo + "»" : ""} · {ETAPA[e.tarea.etapa] || e.tarea.etapa || "en marcha"}{e.tarea.render ? " · plano " + e.tarea.render.plano : ""}</div>}
                {e.en_linea && !listo && <div style={{ fontSize: 11.5, color: "#F59E0B", marginTop: 4, lineHeight: 1.45 }}>
                  {!e.capacidad.proyecto ? "Le falta el proyecto de historias"
                    : e.capacidad.claudeInstalado === false ? "Le falta instalar Claude Code"
                    : "Claude Code está instalado pero sin permiso para trabajar: en ese equipo, RandomHistorias → Ajustes → pega el permiso de «claude setup-token»"}</div>}
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
