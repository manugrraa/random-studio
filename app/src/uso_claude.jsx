/* v3.40.6: el marcador del uso de Claude (lo gastado del plan en la ventana de 5 h y en la semana), para ir dosificando
 * cuántas historias pedir. En el escritorio lo lee de su Claude (cada 10 min, o al pulsarlo); en el móvil, del estado
 * que publican los equipos (UsoClaude con «uso»). Verde: vas bien · ámbar: con calma · rojo: casi en el límite. */
import React from "react";
const { useState, useEffect } = React;

const color = (p) => p >= 85 ? "var(--red)" : p >= 60 ? "#F59E0B" : "var(--green)";
function cuando(ms) {
  if (!ms) return "";
  const d = new Date(ms), hoy = new Date();
  const h = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === hoy.toDateString()) return "hoy a las " + h;
  return d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric" }) + " a las " + h;
}
/** Lo que conviene hacer según lo que queda (para el título al pasar el ratón). */
function consejo(u) {
  const s = (u.semana && u.semana.pct) || 0, c = (u.cinco && u.cinco.pct) || 0;
  if (s >= 90 || c >= 95) return "Casi sin margen: mejor no pedir historias nuevas hasta que se restablezca.";
  if (s >= 70) return "Queda poco de la semana: pide solo las historias que más te importen.";
  if (c >= 80) return "La ventana de 5 h va alta: lo que pidas ahora puede pararse un rato (sigue solo después).";
  return "Hay margen: puedes pedir historias con tranquilidad.";
}

function Barra({ nombre, v }) {
  if (!v) return null;
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-3)" }}>{nombre}</span>
      <span style={{ width: 34, height: 6, borderRadius: 4, background: "var(--border)", overflow: "hidden", display: "block" }}>
        <span style={{ display: "block", height: "100%", width: v.pct + "%", background: color(v.pct), borderRadius: 4 }} />
      </span>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: color(v.pct), fontVariantNumeric: "tabular-nums" }}>{v.pct}%</span>
    </span>);
}

/** El marcador. Sin «uso», lo lee él solo de este equipo (escritorio). */
export function UsoClaude({ uso, compacto }) {
  const propio = uso === undefined;
  const [u, setU] = useState(null);
  const [leyendo, setLeyendo] = useState(false);
  const leer = async (forzar) => {
    if (!window.studioFS || !window.studioFS.claudeUso) return;
    setLeyendo(true);
    try { setU(await window.studioFS.claudeUso(forzar)); } catch (e) {} finally { setLeyendo(false); }
  };
  useEffect(() => {
    if (!propio) return;
    leer(false);
    const t = setInterval(() => leer(false), 10 * 60000);
    return () => clearInterval(t);
  }, [propio]);
  const d = propio ? u : uso;
  if (!d || (!d.ok && propio && !d.error)) return null;
  const titulo = d.ok
    ? "Uso de Claude\n· 5 horas: " + (d.cinco ? d.cinco.pct + "% (se restablece " + cuando(d.cinco.reinicio) + ")" : "—")
      + "\n· Semana: " + (d.semana ? d.semana.pct + "% (se restablece " + cuando(d.semana.reinicio) + ")" : "—")
      + "\n\n" + consejo(d) + (propio ? "\n\nPulsa para actualizar." : "")
    : "Uso de Claude: " + (d.error || "no disponible");
  return (
    <button onClick={() => propio && leer(true)} title={titulo} className="uso-claude"
      style={{ display: "flex", alignItems: "center", gap: 9, background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 11,
        padding: "6px 10px", opacity: leyendo ? 0.6 : 1, cursor: propio ? "pointer" : "default", whiteSpace: "nowrap" }}>
      <span style={{ fontSize: 12, fontWeight: 800, color: "var(--gold)" }}>Claude</span>
      {d.ok ? <><Barra nombre="5h" v={d.cinco} />{!compacto && <Barra nombre="Semana" v={d.semana} />}</>
        : <span style={{ fontSize: 11, color: "var(--text-3)" }}>sin datos</span>}
    </button>);
}

/** Del estado de los equipos, el uso más reciente (todos usan la misma cuenta de Claude). */
export function usoDeEquipos(equipos) {
  return (equipos || []).map(e => e.datos && e.datos.claudeUso).filter(u => u && u.ok).sort((a, b) => b.cuando - a.cuando)[0] || null;
}
