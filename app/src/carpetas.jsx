import React from "react";
const { useState, useEffect, useCallback } = React;
import { PERFILES, perfilActual } from "./perfiles";

/* ============================ CARPETAS (Ajustes, v3.26) ============================
 * De dónde coge cada apartado la información y a dónde la manda, por perfil (cada perfil tiene las suyas).
 * Se guardan en el PC (electron/carpetas.cjs); el clon, el convertidor, el RandomChat y las Historias las leen
 * de ahí. El RandomEditor no aparece: es un módulo aparte.
 */

export function CarpetasPanel({ caja, tituloZona, toast }) {
  const sf = window.studioFS;
  const [datos, setDatos] = useState(null);
  const perfil = perfilActual() || "rderandom";
  const nombre = (PERFILES.find(p => p.id === perfil) || PERFILES[0]).nombre;

  const cargar = useCallback(async () => {
    try { setDatos(await sf.carpetasLeer(perfil)); } catch (e) { toast("No se pudieron leer las carpetas: " + (e.message || e)); }
  }, [perfil]);
  useEffect(() => { if (sf && sf.carpetasLeer) cargar(); }, [cargar]);

  if (!sf || !sf.carpetasLeer) return null;

  const cambiar = async (c) => {
    const ruta = await sf.carpetasElegir(c.valor);
    if (!ruta) return;
    await sf.carpetasGuardar(perfil, c.clave, ruta);
    toast(`${c.nombre}: carpeta cambiada`);
    cargar();
  };
  const restablecer = async (c) => {
    await sf.carpetasGuardar(perfil, c.clave, "");
    toast(`${c.nombre}: vuelve a la de por defecto`);
    cargar();
  };

  const grupos = [];
  (datos ? datos.carpetas : []).forEach(c => {
    let g = grupos.find(x => x.nombre === c.grupo);
    if (!g) grupos.push(g = { nombre: c.grupo, items: [] });
    g.items.push(c);
  });
  const boton = { fontSize: 11.5, fontWeight: 700, borderRadius: 8, padding: "5px 10px", border: "1px solid var(--border)", flexShrink: 0 };

  return (
    <div style={caja}>
      <div style={tituloZona}>Carpetas de {nombre}</div>
      <div style={{ fontSize: 11.5, color: "var(--text-3)", lineHeight: 1.5, marginBottom: 10 }}>
        De dónde coge cada apartado la información y a dónde la manda. Cada perfil tiene las suyas; el RandomEditor va aparte.
      </div>
      {!datos && <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>Cargando…</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {grupos.map(g => (
          <div key={g.nombre}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--gold)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 6 }}>{g.nombre}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {g.items.map(c => (
                <div key={c.clave} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 10, background: "var(--card-2)", border: "1px solid var(--border)", flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0, flex: "1 1 240px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700 }}>
                      <span title={c.existe ? "La carpeta existe" : "Todavía no existe: se creará al usarla"}
                        style={{ width: 7, height: 7, borderRadius: 9, background: c.existe ? "var(--green)" : "var(--text-3)", flexShrink: 0 }} />
                      {c.nombre}
                      {c.propia && <span style={{ fontSize: 9.5, fontWeight: 700, color: "var(--gold)", border: "1px solid var(--border-gold)", borderRadius: 5, padding: "0 5px" }}>ELEGIDA</span>}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 1 }}>{c.ayuda}</div>
                    <div title={c.valor} style={{ fontSize: 11, color: "var(--text-2)", fontFamily: "ui-monospace,Consolas,monospace", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📁 {c.valor}</div>
                  </div>
                  <button onClick={() => cambiar(c)} style={{ ...boton, color: "var(--gold)", borderColor: "var(--border-gold)", background: "rgba(212,175,55,0.06)" }}>Cambiar</button>
                  <button onClick={() => sf.carpetasAbrir(c.valor)} style={{ ...boton, color: "var(--text)" }}>Abrir</button>
                  {c.propia && <button onClick={() => restablecer(c)} title={"Por defecto: " + c.defecto} style={{ ...boton, color: "var(--text-2)" }}>Por defecto</button>}
                </div>))}
            </div>
          </div>))}
      </div>
    </div>);
}
