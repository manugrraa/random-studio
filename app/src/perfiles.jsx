import React from "react";
const { useState, useEffect } = React;
import { AVATAR_HISTORIAS, AVATAR_RDR } from "./perfiles_img";
import { YT_BACKEND } from "./datos";
import { fijarPerfilEnUso } from "./perfil_estado";

/* ============================ PERFILES (v3.21) ============================
 * Pantalla de inicio: eliges con qué perfil (canal) entras. RDeRandom (la app de siempre) o RandomHistorias
 * (v3.25: su propio espacio con las Historias; después, la subida de Shorts).
 * «Entrar siempre con este perfil» la salta en los siguientes arranques (se vuelve con Ajustes → Cambiar de perfil).
 * v3.24: la foto de cada perfil es la del canal de YouTube (el servidor la lee de la página pública del canal,
 * /api/avatar); se puede subir otra con el lápiz y volver a la del canal. El logo incrustado es solo el respaldo.
 */

export const PERFILES = [
  { id: "rderandom", nombre: "RDeRandom", lema: "Canal principal", activo: true, avatar: AVATAR_RDR },
  { id: "randomhistorias", nombre: "RandomHistorias", lema: "Historias animadas", activo: true, avatar: AVATAR_HISTORIAS },
];

const K_PERFIL = "rs_perfil", K_SIEMPRE = "rs_perfil_siempre";
let _sesion = null;                       // perfil elegido en esta ejecución

export function perfilActual() { return _sesion; }

/* v3.26: cada perfil es una cuenta con las mismas opciones. Sus datos guardados (vídeos, tareas, sesión de
 * Google, código de sincronización, ajustes de cada apartado...) van aparte: en cualquier perfil que no sea
 * RDeRandom, las claves de localStorage llevan delante «perfil:<id>:». RDeRandom usa las de siempre (no se
 * mueve nada). Son comunes a todos los perfiles: el propio perfil, la llave del equipo, el tema, la barra
 * plegada, la clave de Gemini y las preferencias del RandomEditor (módulo aparte). */
const GLOBALES = /^(rs_perfil|rs_disp_id|rds_theme|rds_barra_plegada|rds_gemini_|red_)/;
let _almacen = false;
function separarAlmacen(id) {
  if (_almacen || id === "rderandom") return;
  _almacen = true;
  const ls = window.localStorage, proto = Object.getPrototypeOf(ls), pre = "perfil:" + id + ":";
  const get = proto.getItem, set = proto.setItem, quitar = proto.removeItem;
  const k = (s, key) => (s === ls && !GLOBALES.test(String(key))) ? pre + key : key;
  proto.getItem = function (key) { return get.call(this, k(this, key)); };
  proto.setItem = function (key, v) { return set.call(this, k(this, key), v); };
  proto.removeItem = function (key) { return quitar.call(this, k(this, key)); };
}

/** Prepara el perfil ANTES de montar la app: almacén aparte y, en el escritorio, datos y carpetas del perfil. */
export async function entrarEnPerfil(id) {
  _sesion = id;
  fijarPerfilEnUso(id);
  separarAlmacen(id);
  try { if (window.studioFS && window.studioFS.perfilPoner) await window.studioFS.perfilPoner(id); } catch (e) {}
}

// ------------------------------------------------------------------ fotos de perfil
const kFoto = (id) => "rs_perfil_foto_" + id;          // la que subiste tú (data URL)
const kCanal = (id) => "rs_perfil_canal_" + id;        // la del canal de YouTube (URL, se refresca al abrir)
const leer = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const guardar = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} };

export function fotoPerfil(p) { return leer(kFoto(p.id)) || leer(kCanal(p.id)) || p.avatar; }

function recortar(file) {
  return new Promise((ok, ko) => {
    const img = new Image();
    img.onload = () => {
      const lado = Math.min(img.width, img.height), c = document.createElement("canvas");
      c.width = c.height = 400;
      c.getContext("2d").drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, 400, 400);
      URL.revokeObjectURL(img.src);
      ok(c.toDataURL("image/jpeg", 0.88));
    };
    img.onerror = () => ko(new Error("No es una imagen válida"));
    img.src = URL.createObjectURL(file);
  });
}
export function perfilAlArrancar() {
  try {
    if (localStorage.getItem(K_SIEMPRE) === "1") {
      const p = PERFILES.find(x => x.id === localStorage.getItem(K_PERFIL) && x.activo);
      if (p) return p.id;
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
.rsp-lapiz { opacity: 0; transition: opacity .18s, transform .18s; }
.rsp-carta:hover .rsp-lapiz, .rsp-lapiz:focus-visible { opacity: 1; }
.rsp-lapiz:hover { transform: scale(1.1); }
.rsp-op { text-align: left; font-size: 13px; font-weight: 600; color: #F5F5F5; padding: 9px 12px; border-radius: 8px; background: none; border: none; cursor: pointer; }
.rsp-op:hover:not(:disabled) { background: rgba(212,175,55,.12); color: #FFD700; }
`;

function Particulas() {
  const ps = Array.from({ length: 22 }, (_, i) => ({
    left: (i * 37) % 100, delay: (i * 1.7) % 12, dur: 10 + (i * 3) % 9, size: 2 + (i % 3),
  }));
  return ps.map((p, i) => (
    <span key={i} style={{ position: "absolute", bottom: -10, left: p.left + "%", width: p.size, height: p.size, borderRadius: 9,
      background: "#D4AF37", boxShadow: "0 0 8px #D4AF37", animation: `rsp-flota ${p.dur}s linear ${p.delay}s infinite`, opacity: 0 }} />));
}

export function PantallaPerfiles({ onElegir }) {
  const [siempre, setSiempre] = useState(false);
  const [saliendo, setSaliendo] = useState(null);
  const [, refrescar] = useState(0);
  const [menu, setMenu] = useState(null);             // perfil con el menú del lápiz abierto
  const subir = React.useRef(null);
  const size = Math.min(170, Math.max(112, Math.round(window.innerWidth / 7)));

  const elegir = (p) => {
    if (!p.activo || saliendo) return;
    try { localStorage.setItem(K_PERFIL, p.id); localStorage.setItem(K_SIEMPRE, siempre ? "1" : "0"); } catch (e) {}
    setSaliendo(p.id);
    setTimeout(() => entrarEnPerfil(p.id).then(() => onElegir(p.id)), 420);
  };

  // la foto del canal de YouTube: se pide al abrir y se guarda (la próxima vez sale al instante)
  useEffect(() => {
    PERFILES.forEach(p => fetch(YT_BACKEND + "/api/avatar?canal=" + p.id).then(r => r.json()).then(j => {
      if (j && j.success && j.url && j.url !== leer(kCanal(p.id))) { guardar(kCanal(p.id), j.url); refrescar(n => n + 1); }
    }).catch(() => {}));
    const cerrar = () => setMenu(null);
    window.addEventListener("click", cerrar);
    return () => window.removeEventListener("click", cerrar);
  }, []);

  const elegirFoto = async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f || !menu) return;
    try { guardar(kFoto(menu), await recortar(f)); refrescar(n => n + 1); } catch (x) { alert(x.message); }
    setMenu(null);
  };

  useEffect(() => {
    const f = (e) => { if (e.key === "Enter" && !menu) elegir(PERFILES[0]); };
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
          <div key={p.id} role="button" tabIndex={p.activo ? 0 : -1} onClick={() => elegir(p)} className={"rsp-carta" + (p.activo ? "" : " bloq")}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, cursor: p.activo ? "pointer" : "default", position: "relative",
              animation: `rsp-entra .6s ease ${0.12 + i * 0.1}s both`, outline: "none", background: "none", border: "none", color: "inherit" }}>
            <div className="rsp-avatar" style={{ position: "relative", borderRadius: size * 0.2, boxShadow: "0 0 0 1px #2a2a2a",
              transform: saliendo === p.id ? "scale(1.08)" : undefined }}>
              <img src={fotoPerfil(p)} alt="" referrerPolicy="no-referrer"
                onError={(e) => { if (e.currentTarget.src !== p.avatar) e.currentTarget.src = p.avatar; }}
                style={{ width: size, height: size, borderRadius: size * 0.2, display: "block", objectFit: "cover",
                  filter: p.activo ? "none" : "grayscale(.85) brightness(.45)" }} />
              {/* lápiz: subir otra foto o volver a la del canal */}
              <button className="rsp-lapiz" title="Cambiar la foto" onClick={(e) => { e.stopPropagation(); setMenu(m => m === p.id ? null : p.id); }}
                style={{ position: "absolute", right: -6, bottom: -6, width: 32, height: 32, borderRadius: 99, display: "flex", alignItems: "center",
                  justifyContent: "center", background: "#141414", border: "1px solid #3a3119", color: "#D4AF37", boxShadow: "0 4px 14px rgba(0,0,0,.6)", zIndex: 2 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
              </button>
              {menu === p.id && (
                <div onClick={(e) => e.stopPropagation()} style={{ position: "absolute", top: "calc(100% + 12px)", left: "50%", transform: "translateX(-50%)", zIndex: 5,
                  minWidth: 236, whiteSpace: "nowrap", background: "#141414", border: "1px solid #3a3119", borderRadius: 12, padding: 6, boxShadow: "0 18px 50px rgba(0,0,0,.7)",
                  display: "flex", flexDirection: "column", gap: 2, animation: "rsp-entra .18s ease both" }}>
                  <button onClick={() => subir.current && subir.current.click()} className="rsp-op">Subir una foto…</button>
                  <button disabled={!leer(kFoto(p.id))} onClick={() => { guardar(kFoto(p.id), null); refrescar(n => n + 1); setMenu(null); }}
                    className="rsp-op" style={{ opacity: leer(kFoto(p.id)) ? 1 : 0.4 }}>Usar la del canal de YouTube</button>
                </div>)}
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
          </div>))}
      </div>
      <input ref={subir} type="file" accept="image/*" style={{ display: "none" }} onChange={elegirFoto} />

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
