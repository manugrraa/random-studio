import React from "react";
const { useState, useEffect, useRef } = React;
import { PERFILES, perfilActual } from "./perfiles";

/* ============================ APARTADOS (Ajustes, v3.29; v3.33 con orden) ============================
 * Qué apartados salen en la barra de cada perfil y en qué orden. Por defecto salen todos y en el orden de siempre;
 * aquí solo se guarda lo que cambias, en el almacén del perfil (perfiles.jsx separa el localStorage por perfil).
 * Configuración, Administración y Papelera siempre están, abajo.
 */
const K = "rds_modulos_off", K_ORDEN = "rds_modulos_orden";
const EVENTO = "rs-modulos";
const leer = (k, def) => { try { return JSON.parse(localStorage.getItem(k) || "null") || def; } catch (e) { return def; } };
const avisar = () => window.dispatchEvent(new Event(EVENTO));

export const modulosOff = () => new Set(leer(K, []));
export function ponerModulo(id, encendido) {
  const off = modulosOff();
  encendido ? off.delete(id) : off.add(id);
  try { localStorage.setItem(K, JSON.stringify([...off])); } catch (e) {}
  avisar();
}
export const ordenModulos = () => leer(K_ORDEN, []);
export function ponerOrden(ids) { try { ids ? localStorage.setItem(K_ORDEN, JSON.stringify(ids)) : localStorage.removeItem(K_ORDEN); } catch (e) {} avisar(); }

function useEvento(leerFn) {
  const [v, setV] = useState(leerFn);
  useEffect(() => { const h = () => setV(leerFn()); window.addEventListener(EVENTO, h); return () => window.removeEventListener(EVENTO, h); }, []);
  return v;
}
export const useModulosOff = () => useEvento(modulosOff);
export const useOrdenModulos = () => useEvento(ordenModulos);

/** Ordena las pestañas según lo elegido (las que no están en la lista, detrás y en su orden de siempre). */
export function ordenarTabs(tabs, orden) {
  const pos = (t, i) => { const k = (orden || []).indexOf(t.id); return t.grupo === "abajo" ? 1e6 + i : k < 0 ? 1e3 + i : k; };
  return tabs.map((t, i) => ({ t, p: pos(t, i) })).sort((a, b) => a.p - b.p).map(x => x.t);
}

const GRUPOS = { plan: "Planificación", canal: "Canal", produccion: "Producción", asistente: "Asistente" };

export function ModulosPanel({ modulos, toast, Fila }) {
  const off = useModulosOff();
  const orden = useOrdenModulos();
  const [arrastrando, setArrastrando] = useState(null);
  const [sobre, setSobre] = useState(null);
  const nombre = (PERFILES.find(p => p.id === perfilActual()) || PERFILES[0] || {}).nombre;
  const lista = ordenarTabs((modulos || []).filter(m => m.grupo !== "abajo"), orden);
  const encendidos = lista.filter(m => !off.has(m.id)).length;

  const cambiar = (m) => {
    const enc = off.has(m.id);
    if (!enc && encendidos <= 1) { toast("Deja al menos un apartado encendido"); return; }
    ponerModulo(m.id, enc);
  };
  // mover dentro de su grupo (la barra va agrupada)
  const mover = (m, destinoId) => {
    const ids = lista.map(x => x.id);
    const de = ids.indexOf(m.id);
    ids.splice(de, 1);
    const a = destinoId == null ? ids.length : ids.indexOf(destinoId);
    ids.splice(a < 0 ? ids.length : a, 0, m.id);
    ponerOrden(ids);
  };
  // ↑ / ↓: cambia el sitio con el de al lado (dentro del grupo)
  const paso = (m, d) => {
    const ids = lista.map(x => x.id), mismos = lista.filter(x => x.grupo === m.grupo).map(x => x.id);
    const j = mismos.indexOf(m.id) + d;
    if (j < 0 || j >= mismos.length) return;
    const a = ids.indexOf(m.id), b = ids.indexOf(mismos[j]);
    [ids[a], ids[b]] = [ids[b], ids[a]];
    ponerOrden(ids);
  };

  const grupos = [];
  lista.forEach(m => { let g = grupos.find(x => x.id === m.grupo); if (!g) grupos.push(g = { id: m.grupo, items: [] }); g.items.push(m); });
  const flecha = { width: 28, height: 28, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-2)", color: "var(--text-2)", fontSize: 13, fontWeight: 800 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12.5, color: "var(--text-2)" }}>
          Arrastra para cambiar el orden y apaga lo que no uses en <b style={{ color: "var(--text)" }}>{nombre}</b>. No se borra nada.
          <span style={{ color: "var(--gold)", fontWeight: 700 }}> {encendidos} de {lista.length} activados.</span>
        </div>
        <span style={{ flex: 1 }} />
        {orden.length > 0 && <button onClick={() => { ponerOrden(null); toast("Orden de siempre"); }} style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", border: "1px solid var(--border)", borderRadius: 9, padding: "6px 11px" }}>Orden de siempre</button>}
      </div>
      {grupos.map(g => (
        <div key={g.id}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".08em", margin: "0 0 7px 2px" }}>{GRUPOS[g.id] || g.id}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {g.items.map((m, i) => {
              const enc = !off.has(m.id);
              return (
                <div key={m.id} draggable
                  onDragStart={(e) => { setArrastrando(m.id); e.dataTransfer.effectAllowed = "move"; }}
                  onDragOver={(e) => { const a = lista.find(x => x.id === arrastrando); if (a && a.grupo === m.grupo) { e.preventDefault(); setSobre(m.id); } }}
                  onDragLeave={() => setSobre(s => s === m.id ? null : s)}
                  onDrop={(e) => { e.preventDefault(); const a = lista.find(x => x.id === arrastrando); if (a && a.id !== m.id) mover(a, m.id); setArrastrando(null); setSobre(null); }}
                  onDragEnd={() => { setArrastrando(null); setSobre(null); }}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 12, cursor: "grab",
                    background: enc ? "var(--card-2)" : "transparent", border: "1px solid " + (sobre === m.id ? "var(--gold)" : "var(--border)"),
                    opacity: arrastrando === m.id ? 0.4 : enc ? 1 : 0.6, transition: "border-color .12s, opacity .12s" }}>
                  <span style={{ color: "var(--text-3)", fontSize: 15, letterSpacing: -2, userSelect: "none" }} title="Arrastra para mover">⋮⋮</span>
                  <span style={{ display: "flex", color: enc ? "var(--gold)" : "var(--text-3)" }}>{m.icon}</span>
                  <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700, color: enc ? "var(--text)" : "var(--text-3)" }}>{m.label}</span>
                  <button onClick={() => paso(m, -1)} disabled={i === 0} title="Subir" style={{ ...flecha, opacity: i === 0 ? .35 : 1 }}>↑</button>
                  <button onClick={() => paso(m, 1)} disabled={i === g.items.length - 1} title="Bajar" style={{ ...flecha, opacity: i === g.items.length - 1 ? .35 : 1 }}>↓</button>
                  <button onClick={() => cambiar(m)} role="switch" aria-checked={enc} title={enc ? "Ocultar" : "Mostrar"}
                    style={{ width: 40, height: 22, borderRadius: 20, position: "relative", background: enc ? "var(--gold)" : "var(--border)", flexShrink: 0, transition: "background .15s" }}>
                    <span style={{ position: "absolute", top: 3, left: enc ? 21 : 3, width: 16, height: 16, borderRadius: 20, background: "#fff", transition: "left .15s" }} />
                  </button>
                </div>);
            })}
          </div>
        </div>))}
    </div>);
}
