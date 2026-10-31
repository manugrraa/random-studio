import React from "react";
const { useState, useEffect } = React;
import { Icons, APP_VERSION, useToast } from "./base";
import { HistoriasView } from "./historias";
import { PERFILES, cambiarPerfil, fotoPerfil } from "./perfiles";

/* ============================ PERFIL RANDOMHISTORIAS (v3.25) ============================
 * El espacio del canal RandomHistorias: su propia barra lateral con las Historias como apartado principal.
 * No carga nada de RDeRandom (vídeos, tareas, sincronización): las historias se leen del portátil.
 * La subida de Shorts llegará aquí («Subir Shorts», próximamente).
 */

const SECCIONES = [
  { id: "historias", label: "Historias", icon: Icons.camera },
  { id: "subir", label: "Subir Shorts", icon: Icons.upload, pronto: true },
];

function Boton({ s, activo, onClick }) {
  return (
    <button onClick={onClick} className={"side-btn" + (activo ? " activo" : "")}
      style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", fontSize: 13.5, fontWeight: 600, padding: "9px 12px", borderRadius: 10, textAlign: "left",
        ...(activo ? { background: "linear-gradient(135deg,rgba(212,175,55,0.18),rgba(212,175,55,0.07))", color: "var(--gold)", boxShadow: "inset 3px 0 0 var(--gold)" }
          : { color: "var(--text-2)" }) }}>
      <span style={{ display: "flex", flexShrink: 0 }}>{s.icon}</span>
      <span style={{ flex: 1 }}>{s.label}</span>
      {s.pronto && <span style={{ fontSize: 9.5, fontWeight: 700, color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 5, padding: "0 5px" }}>PRONTO</span>}
    </button>);
}

function Pronto() {
  return (
    <div style={{ maxWidth: 560, margin: "60px auto", textAlign: "center", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 18, padding: 28 }}>
      <div style={{ fontSize: 34, marginBottom: 8 }}>🚀</div>
      <div style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 20 }}>Subir Shorts, muy pronto</div>
      <div style={{ fontSize: 13.5, color: "var(--text-2)", lineHeight: 1.6, marginTop: 8 }}>
        Aquí podrás subir a RandomHistorias los Shorts que ya están listos en «Historias», con su título y su miniatura, sin salir de RandomStudio.
      </div>
    </div>);
}

function Ajustes({ theme, setTheme }) {
  const p = PERFILES.find(x => x.id === "randomhistorias");
  return (
    <div style={{ maxWidth: 640, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 22 }}>Ajustes</div>
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, padding: 16, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <img src={fotoPerfil(p)} referrerPolicy="no-referrer" style={{ width: 52, height: 52, borderRadius: 14, objectFit: "cover" }} />
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>Has entrado como <span className="gold-text">RandomHistorias</span></div>
        <span style={{ flex: 1 }} />
        <button onClick={cambiarPerfil} style={{ fontSize: 12.5, fontWeight: 600, color: "var(--gold)", border: "1px solid var(--border-gold)", borderRadius: 9, padding: "9px 14px", background: "rgba(212,175,55,0.05)" }}>Cambiar de perfil</button>
      </div>
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>Tema</div>
        <span style={{ flex: 1 }} />
        <button onClick={() => setTheme(t => t === "dark" ? "light" : "dark")} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: "var(--text)", border: "1px solid var(--border)", borderRadius: 9, padding: "8px 12px" }}>
          {theme === "dark" ? Icons.sun : Icons.moon} {theme === "dark" ? "Claro" : "Oscuro"}
        </button>
      </div>
      <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>RandomStudio {APP_VERSION}</div>
    </div>);
}

export function HistoriasApp() {
  const [toast, toastNode] = useToast();
  const [vista, setVista] = useState(() => { try { return localStorage.getItem("rs_rh_vista") || "historias"; } catch (e) { return "historias"; } });
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem("rds_theme") || "dark"; } catch (e) { return "dark"; } });
  useEffect(() => { document.documentElement.setAttribute("data-theme", theme); try { localStorage.setItem("rds_theme", theme); } catch (e) {} }, [theme]);
  useEffect(() => { try { localStorage.setItem("rs_rh_vista", vista); } catch (e) {} }, [vista]);
  const p = PERFILES.find(x => x.id === "randomhistorias");

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }}>
      <aside className="side-nav" style={{ width: 236, flexShrink: 0, position: "sticky", top: 0, height: "100vh", display: "flex", flexDirection: "column",
        borderRight: "1px solid var(--border)", background: "var(--bg-2)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "18px 18px 14px" }}>
          <img src={fotoPerfil(p)} referrerPolicy="no-referrer" style={{ width: 38, height: 38, borderRadius: 11, objectFit: "cover", boxShadow: "0 0 0 1px var(--border-gold)" }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: "'Sora'", fontWeight: 700, fontSize: 15.5, letterSpacing: "-.01em" }}>Random<span className="gold-text">Historias</span></div>
            <div style={{ fontSize: 10.5, color: "var(--text-3)", letterSpacing: ".04em" }}>RandomStudio</div>
          </div>
        </div>
        <nav style={{ flex: 1, padding: "4px 12px", display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".08em", padding: "8px 12px 4px" }}>Canal</div>
          {SECCIONES.map(s => <Boton key={s.id} s={s} activo={vista === s.id} onClick={() => setVista(s.id)} />)}
        </nav>
        <div style={{ borderTop: "1px solid var(--border)", padding: "8px 12px 12px", display: "flex", flexDirection: "column", gap: 2 }}>
          <Boton s={{ id: "ajustes", label: "Ajustes", icon: Icons.gear }} activo={vista === "ajustes"} onClick={() => setVista("ajustes")} />
          <Boton s={{ id: "perfil", label: "Cambiar de perfil", icon: Icons.repeat }} activo={false} onClick={cambiarPerfil} />
        </div>
      </aside>
      <main style={{ flex: 1, minWidth: 0, padding: "24px 28px 60px" }}>
        {vista === "historias" && <HistoriasView toast={toast} />}
        {vista === "subir" && <Pronto />}
        {vista === "ajustes" && <Ajustes theme={theme} setTheme={setTheme} />}
      </main>
      {toastNode}
    </div>);
}
