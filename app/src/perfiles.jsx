import React from "react";
const { useState, useEffect } = React;
import { AVATAR_HISTORIAS, AVATAR_RDR } from "./perfiles_img";

/* ============================ PERFILES (v3.21) ============================
 * Pantalla de inicio: eliges con qué perfil (canal) entras. Por ahora solo RDeRandom; RandomHistorias
 * llegará para subir los Shorts desde el mismo sitio en que se hacen.
 * «Entrar siempre con este perfil» la salta en los siguientes arranques (se vuelve con Ajustes → Cambiar de perfil).
 */

export const PERFILES = [
  { id: "rderandom", nombre: "RDeRandom", lema: "Canal principal", activo: true, avatar: AVATAR_RDR },
  { id: "randomhistorias", nombre: "RandomHistorias", lema: "Próximamente", activo: false, avatar: AVATAR_HISTORIAS },
];

const K_PERFIL = "rs_perfil", K_SIEMPRE = "rs_perfil_siempre";
let _sesion = null;                       // perfil elegido en esta ejecución

export function perfilActual() { return _sesion; }
export function perfilAlArrancar() {
  try {
    if (localStorage.getItem(K_SIEMPRE) === "1") {
      const p = PERFILES.find(x => x.id === localStorage.getItem(K_PERFIL) && x.activo);
      if (p) { _sesion = p.id; return p.id; }
    }
  } catch (e) {}
  return null;
}
export function cambiarPerfil() {
  try { localStorage.removeItem(K_SIEMPRE); } catch (e) {}
  location.reload();
}

const CSS = `
@keyframes rsp-entra { from { opacity: 0; transform: translateY(18px) scale(.97) } to { opacity: 1; transform: none } }
@keyframes rsp-brillo { 0%,100% { opacity: .55; transform: translate(-50%,-50%) scale(1) } 50% { opacity: .85; transform: translate(-50%,-50%) scale(1.08) } }
@keyframes rsp-flota { 0% { transform: translateY(0); opacity: 0 } 15% { opacity: .9 } 100% { transform: translateY(-110vh); opacity: 0 } }
@keyframes rsp-sale { to { opacity: 0; transform: scale(1.04); filter: blur(6px) } }
.rsp-carta { transition: transform .22s cubic-bezier(.2,.8,.2,1), filter .22s; }
.rsp-carta:hover .rsp-avatar, .rsp-carta:focus-visible .rsp-avatar { transform: translateY(-8px) scale(1.04);
  box-shadow: 0 0 0 3px #D4AF37, 0 18px 60px -10px rgba(212,175,55,.55); }
.rsp-carta:hover .rsp-nombre, .rsp-carta:focus-visible .rsp-nombre { color: #FFD700; }
.rsp-avatar { transition: transform .22s cubic-bezier(.2,.8,.2,1), box-shadow .22s; }
.rsp-carta.bloq:hover .rsp-avatar { transform: none; box-shadow: 0 0 0 1px #2a2a2a; }
.rsp-carta.bloq:hover .rsp-nombre { color: #8a8a8a; }
`;

function Particulas() {
  const ps = Array.from({ length: 22 }, (_, i) => ({
    left: (i * 37) % 100, delay: (i * 1.7) % 12, dur: 10 + (i * 3) % 9, size: 2 + (i % 3),
  }));
  return ps.map((p, i) => (
    <span key={i} style={{ position: "absolute", bottom: -10, left: p.left + "%", width: p.size, height: p.size, borderRadius: 9,
      background: "#D4AF37", boxShadow: "0 0 8px #D4AF37", animation: `rsp-flota ${p.dur}s linear ${p.delay}s infinite`, opacity: 0 }} />));
}

function AvatarRDR({ size }) {
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.2, display: "flex", alignItems: "center", justifyContent: "center",
      background: "radial-gradient(120% 120% at 30% 20%, #2a2410 0%, #0d0b05 60%, #000 100%)", border: "1px solid #3a3119", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, background: "conic-gradient(from 210deg, transparent 0 70%, rgba(255,215,0,.16) 80%, transparent 90%)" }} />
      <span style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: size * 0.56, lineHeight: 1, letterSpacing: "-.04em",
        background: "linear-gradient(160deg,#FFF1B0 0%,#FFD700 30%,#D4AF37 60%,#8a7320 100%)", WebkitBackgroundClip: "text", color: "transparent",
        filter: "drop-shadow(0 4px 14px rgba(212,175,55,.45))" }}>R</span>
    </div>);
}

export function PantallaPerfiles({ onElegir }) {
  const [siempre, setSiempre] = useState(false);
  const [saliendo, setSaliendo] = useState(null);
  const size = Math.min(170, Math.max(112, Math.round(window.innerWidth / 7)));

  const elegir = (p) => {
    if (!p.activo || saliendo) return;
    try { localStorage.setItem(K_PERFIL, p.id); localStorage.setItem(K_SIEMPRE, siempre ? "1" : "0"); } catch (e) {}
    _sesion = p.id;
    setSaliendo(p.id);
    setTimeout(() => onElegir(p.id), 420);
  };

  useEffect(() => {
    const f = (e) => { if (e.key === "Enter") elegir(PERFILES[0]); };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  });

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "#000", color: "#F5F5F5", overflow: "hidden",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 16px",
      animation: saliendo ? "rsp-sale .42s ease forwards" : "none" }}>
      <style>{CSS}</style>
      {/* luz dorada de fondo y motas */}
      <div style={{ position: "absolute", left: "50%", top: "38%", width: "90vmax", height: "90vmax", borderRadius: "50%",
        background: "radial-gradient(circle, rgba(212,175,55,.20) 0%, rgba(212,175,55,.06) 35%, transparent 65%)", animation: "rsp-brillo 7s ease-in-out infinite", pointerEvents: "none" }} />
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(120% 80% at 50% 120%, rgba(212,175,55,.10), transparent 60%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}><Particulas /></div>

      <div style={{ position: "absolute", top: 26, left: 0, right: 0, display: "flex", justifyContent: "center", alignItems: "center", gap: 10 }}>
        <div className="grad-gold gold-glow" style={{ width: 34, height: 34, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: "#000" }}>
          <span style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 16 }}>R</span>
        </div>
        <div style={{ fontFamily: "'Sora'", fontWeight: 700, fontSize: 17, letterSpacing: "-.01em" }}>Random<span className="gold-text">Studio</span></div>
      </div>

      <div style={{ position: "relative", textAlign: "center", animation: "rsp-entra .6s ease both" }}>
        <div style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: "clamp(26px,4vw,40px)", letterSpacing: "-.03em" }}>¿Con qué perfil entras?</div>
        <div style={{ fontSize: 14, color: "#A3A3A3", marginTop: 8 }}>Cada perfil es un canal, con sus vídeos y su forma de trabajar</div>
      </div>

      <div style={{ position: "relative", display: "flex", gap: "clamp(22px,5vw,56px)", marginTop: 44, flexWrap: "wrap", justifyContent: "center" }}>
        {PERFILES.map((p, i) => (
          <button key={p.id} onClick={() => elegir(p)} className={"rsp-carta" + (p.activo ? "" : " bloq")} disabled={!p.activo}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, cursor: p.activo ? "pointer" : "default",
              animation: `rsp-entra .6s ease ${0.12 + i * 0.1}s both`, outline: "none", background: "none", border: "none", color: "inherit" }}>
            <div className="rsp-avatar" style={{ position: "relative", borderRadius: size * 0.2, boxShadow: "0 0 0 1px #2a2a2a",
              transform: saliendo === p.id ? "scale(1.08)" : undefined }}>
              {p.avatar
                ? <img src={p.avatar} alt="" style={{ width: size, height: size, borderRadius: size * 0.2, display: "block", objectFit: "cover",
                    filter: p.activo ? "none" : "grayscale(.85) brightness(.45)" }} />
                : <AvatarRDR size={size} />}
              {!p.activo && (
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 800, letterSpacing: ".08em", color: "#FFD700",
                    background: "rgba(0,0,0,.72)", border: "1px solid #3a3119", borderRadius: 999, padding: "6px 12px", backdropFilter: "blur(4px)" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
                    PRÓXIMAMENTE
                  </div>
                </div>)}
            </div>
            <div style={{ textAlign: "center" }}>
              <div className="rsp-nombre" style={{ fontFamily: "'Sora'", fontWeight: 700, fontSize: 18, color: p.activo ? "#F5F5F5" : "#8a8a8a", transition: "color .2s" }}>{p.nombre}</div>
              <div style={{ fontSize: 12, color: p.activo ? "#D4AF37" : "#6B6B6B", marginTop: 3, fontWeight: 600 }}>{p.lema}</div>
            </div>
          </button>))}
      </div>

      <label style={{ position: "relative", marginTop: 44, display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#A3A3A3", cursor: "pointer",
        animation: "rsp-entra .6s ease .35s both" }}>
        <span onClick={() => setSiempre(s => !s)} style={{ width: 38, height: 22, borderRadius: 99, padding: 3, display: "flex",
          background: siempre ? "linear-gradient(135deg,#FFD700,#D4AF37)" : "#262626", transition: "background .2s" }}>
          <span style={{ width: 16, height: 16, borderRadius: 99, background: siempre ? "#000" : "#6B6B6B", transform: siempre ? "translateX(16px)" : "none", transition: "transform .2s" }} />
        </span>
        <span onClick={() => setSiempre(s => !s)}>Entrar siempre con este perfil</span>
      </label>
      <div style={{ position: "absolute", bottom: 18, fontSize: 11.5, color: "#555" }}>Pulsa Intro para entrar con RDeRandom</div>
    </div>);
}
