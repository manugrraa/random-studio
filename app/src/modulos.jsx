import React from "react";
const { useState, useEffect } = React;
import { PERFILES, perfilActual } from "./perfiles";

/* ============================ MÓDULOS (Ajustes, v3.29) ============================
 * Qué apartados salen en la barra de cada perfil. Por defecto salen todos; aquí solo se guardan los que
 * se han apagado, en el almacén del perfil (perfiles.jsx separa el localStorage por perfil).
 * Configuración y Papelera siempre están.
 */
const K = "rds_modulos_off";
const EVENTO = "rs-modulos";

export function modulosOff() {
  try { return new Set(JSON.parse(localStorage.getItem(K) || "[]")); } catch (e) { return new Set(); }
}

export function ponerModulo(id, encendido) {
  const off = modulosOff();
  encendido ? off.delete(id) : off.add(id);
  try { localStorage.setItem(K, JSON.stringify([...off])); } catch (e) {}
  window.dispatchEvent(new Event(EVENTO));
}

export function useModulosOff() {
  const [off, setOff] = useState(modulosOff);
  useEffect(() => {
    const h = () => setOff(modulosOff());
    window.addEventListener(EVENTO, h);
    return () => window.removeEventListener(EVENTO, h);
  }, []);
  return off;
}

const GRUPOS = { plan: "Planificación", canal: "Canal", produccion: "Producción", asistente: "Asistente" };

export function ModulosPanel({ caja, tituloZona, modulos, toast }) {
  const off = useModulosOff();
  const nombre = (PERFILES.find(p => p.id === perfilActual()) || PERFILES[0]).nombre;
  const lista = (modulos || []).filter(m => m.grupo !== "abajo");
  const encendidos = lista.filter(m => !off.has(m.id)).length;

  const cambiar = (m) => {
    const enc = off.has(m.id);
    if (!enc && encendidos <= 1) { toast("Deja al menos un apartado encendido"); return; }
    ponerModulo(m.id, enc);
    toast(`${m.label}: ${enc ? "activado" : "desactivado"} en ${nombre}`);
  };

  const grupos = [];
  lista.forEach(m => {
    let g = grupos.find(x => x.id === m.grupo);
    if (!g) grupos.push(g = { id: m.grupo, items: [] });
    g.items.push(m);
  });

  return (
    <div style={caja}>
      <div style={tituloZona}>Apartados de {nombre}</div>
      <div style={{ fontSize: 11.5, color: "var(--text-3)", lineHeight: 1.5, marginBottom: 10 }}>
        Elige qué sale en la barra de este perfil. Lo que apagues aquí solo desaparece en {nombre}; no se borra nada.
        <span style={{ color: "var(--text-2)", fontWeight: 600 }}> {encendidos} de {lista.length} activados.</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {grupos.map(g => (
          <div key={g.id}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--gold)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 6 }}>{GRUPOS[g.id] || g.id}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 6 }}>
              {g.items.map(m => {
                const enc = !off.has(m.id);
                return (
                  <button key={m.id} onClick={() => cambiar(m)} role="switch" aria-checked={enc}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", borderRadius: 10, textAlign: "left",
                      background: enc ? "rgba(212,175,55,0.06)" : "var(--card-2)", border: "1px solid " + (enc ? "var(--border-gold)" : "var(--border)"),
                      color: enc ? "var(--text)" : "var(--text-3)", transition: "all .15s" }}>
                    <span style={{ display: "flex", opacity: enc ? 1 : 0.5 }}>{m.icon}</span>
                    <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700 }}>{m.label}</span>
                    <span style={{ width: 34, height: 19, borderRadius: 20, flexShrink: 0, position: "relative", transition: "background .15s",
                      background: enc ? "var(--gold)" : "var(--border)" }}>
                      <span style={{ position: "absolute", top: 2, left: enc ? 17 : 2, width: 15, height: 15, borderRadius: 20, background: "#fff", transition: "left .15s" }} />
                    </span>
                  </button>);
              })}
            </div>
          </div>))}
      </div>
    </div>);
}
