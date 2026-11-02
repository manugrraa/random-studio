import React from "react";
const { useState, useEffect, useRef } = React;
import { AVATAR_HISTORIAS, AVATAR_RDR } from "./perfiles_img";
import { YT_BACKEND, googleElegirCuenta, ytCanjear } from "./datos";
import { fijarPerfilEnUso } from "./perfil_estado";
import { accesoApi, olvidarEquipo } from "./seguridad";

/* ============================ PERFILES (v3.21; v3.30 cuentas con permiso) ============================
 * Pantalla de inicio. Cada perfil es una cuenta de Google con canal de YouTube (su foto es la del canal).
 * No hay perfiles predeterminados: el servidor dice qué cuentas puede abrir ESTE equipo (/api/acceso).
 *  - Aprobada: se entra.
 *  - Pendiente: sale con candado hasta que el portátil (o un administrador) da permiso; se comprueba sola cada 4 s.
 *  - «+»: inicia sesión con Google y pide permiso para esa cuenta en este equipo (v3.40: o crea un perfil local)
 *  - Si la conexión está bloqueada, solo se ve la pantalla de acceso bloqueado.
 * «Entrar siempre con este perfil» la salta en los siguientes arranques, pero solo si el servidor sigue dando permiso.
 */

const RESPALDO = { rderandom: AVATAR_RDR, randomhistorias: AVATAR_HISTORIAS };
const LEMAS = { rderandom: "Canal principal", randomhistorias: "Historias animadas" };

/** Las cuentas que conoce este equipo (se rellena desde el servidor; los demás módulos la leen tal cual). */
export const PERFILES = [];
/* v3.40 (Carental), él: "me debes dejar crear perfiles locales, que no dependan de una cuenta de Google; se administrarán
 * dentro del equipo en el que se hayan creado". Viven en este equipo (electron/brutos.cjs) y van detrás de las cuentas.
 * El candado se respeta: solo se ven y se abren si este equipo tiene permiso (alguna cuenta aprobada). */
let LOCALES = [];
export const esLocal = (id) => /^local-/.test(String(id || ""));
async function cargarLocales() {
  try { if (window.studioFS && window.studioFS.localesLeer) LOCALES = ((await window.studioFS.localesLeer()) || {}).perfiles || []; } catch (e) {}
}
function ponerPerfiles(lista) {
  const cuentas = lista.map(p => ({ ...p, lema: LEMAS[p.id] || "Canal de YouTube",
    avatar: RESPALDO[p.id] || inicial(p.nombre), activo: p.permiso === "aprobado" }));
  const conPermiso = cuentas.some(p => p.activo);
  PERFILES.splice(0, PERFILES.length, ...cuentas, ...(conPermiso ? LOCALES.map(p => ({ ...p, local: true, lema: "Perfil local · este equipo",
    avatar: inicial(p.nombre), activo: true })) : []));
  guardar(K_CUENTAS, JSON.stringify(lista));
}

const K_PERFIL = "rs_perfil", K_SIEMPRE = "rs_perfil_siempre", K_CUENTAS = "rs_perfil_cuentas";
let _sesion = null;                       // perfil elegido en esta ejecución

export function perfilActual() { return _sesion; }

/* v3.26: cada perfil es una cuenta con las mismas opciones. Sus datos guardados (vídeos, tareas, sesión de
 * Google, código de sincronización, ajustes de cada apartado...) van aparte: en cualquier perfil que no sea
 * RDeRandom, las claves de localStorage llevan delante «perfil:<id>:». RDeRandom usa las de siempre (no se
 * mueve nada). Son comunes a todos los perfiles: el propio perfil, la llave del equipo, el tema, la barra
 * plegada y las preferencias del RandomEditor (módulo aparte). */
const GLOBALES = /^(rs_perfil|rs_disp_id|rds_theme|rds_barra_plegada|red_)/;
const clavePerfil = (id, key) => id === "rderandom" ? key : "perfil:" + id + ":" + key;
let _almacen = false;
// v3.40.1: los originales, guardados antes de separar el almacén, para leer lo de OTRO perfil (las historias usan siempre
// la sesión de RandomHistorias, estés en el perfil que estés)
const _proto = typeof Storage !== "undefined" ? Storage.prototype : null;
const _crudo = _proto ? { get: _proto.getItem, set: _proto.setItem } : null;
export function almacenDe(id) {
  return {
    get: (key) => { try { return _crudo.get.call(window.localStorage, clavePerfil(id, key)); } catch (e) { return null; } },
    set: (key, v) => { try { _crudo.set.call(window.localStorage, clavePerfil(id, key), v); } catch (e) {} },
  };
}
function separarAlmacen(id) {
  if (_almacen || id === "rderandom") return;
  _almacen = true;
  const ls = window.localStorage, proto = Object.getPrototypeOf(ls);
  const get = proto.getItem, set = proto.setItem, quitar = proto.removeItem;
  const k = (s, key) => (s === ls && !GLOBALES.test(String(key))) ? clavePerfil(id, key) : key;
  proto.getItem = function (key) { return get.call(this, k(this, key)); };
  proto.setItem = function (key, v) { return set.call(this, k(this, key), v); };
  proto.removeItem = function (key) { return quitar.call(this, k(this, key)); };
}

/** 2/11: las ventanas de Studio que no son la principal (la del RandomChat) usan el perfil que ya está puesto,
 *  sin volver a ponerlo: solo su almacén (sesión de Google, ajustes). */
export function usarPerfilPuesto(id) {
  if (!id) return;
  _sesion = id;
  fijarPerfilEnUso(id);
  separarAlmacen(id);
}

/** Prepara el perfil ANTES de montar la app: almacén aparte y, en el escritorio, datos y carpetas del perfil. */
export async function entrarEnPerfil(id) {
  _sesion = id;
  fijarPerfilEnUso(id);
  separarAlmacen(id);
  const p = PERFILES.find(x => x.id === id);
  try { if (window.studioFS && window.studioFS.perfilPoner) await window.studioFS.perfilPoner(id, p ? (p.local ? { nombre: p.nombre, local: true } : { nombre: p.nombre, canal: p.canal_id }) : null); } catch (e) {}
}

// ------------------------------------------------------------------ fotos de perfil
const kFoto = (id) => "rs_perfil_foto_" + id;          // la que subiste tú (data URL)
const leer = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const guardar = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} };

function inicial(nombre) {
  const l = String(nombre || "?").trim().charAt(0).toUpperCase();
  return "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFD700"/><stop offset="1" stop-color="#B8860B"/></linearGradient></defs><rect width="100" height="100" fill="#141414"/><text x="50" y="66" font-family="Arial" font-weight="800" font-size="52" text-anchor="middle" fill="url(#g)">${l}</text></svg>`);
}
export function fotoPerfil(p) { return leer(kFoto(p.id)) || p.foto || p.avatar; }

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

/**
 * Al arrancar: pregunta al servidor qué cuentas puede abrir este equipo.
 * Devuelve { bloqueado, ip } | { auto: id } (entrar directo) | { lista }.
 */
export async function comprobarAcceso() {
  let j;
  await cargarLocales();
  try { j = await accesoApi(YT_BACKEND, "estado"); }
  catch (e) {
    // sin conexión: las que ya estaban aprobadas en este equipo (los datos de la nube siguen protegidos en el servidor)
    let cache = [];
    try { cache = JSON.parse(leer(K_CUENTAS) || "[]"); } catch (x) {}
    ponerPerfiles(cache);
    return { lista: PERFILES, sinConexion: true };
  }
  if (j.baneado) return { bloqueado: true, ip: j.ip };
  ponerPerfiles(j.perfiles || []);
  // v3.37.4: tras reiniciarse para actualizar, vuelve sola al perfil en el que estaba (si no, el equipo dejaba de trabajar)
  const volver = leer("rs_perfil_volver");
  if (volver) try { localStorage.removeItem("rs_perfil_volver"); } catch (e) {}
  const auto = (leer(K_SIEMPRE) === "1" || (volver && volver === leer(K_PERFIL))) && PERFILES.find(p => p.id === leer(K_PERFIL) && p.activo);
  return auto ? { auto: auto.id } : { lista: PERFILES, dispositivo: j.dispositivo };
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
@keyframes rsp-late { 0%,100% { transform: scale(1); opacity: .9 } 50% { transform: scale(1.08); opacity: 1 } }
@keyframes rsp-abre { 0% { transform: scale(1) rotate(0) } 40% { transform: scale(1.25) rotate(-12deg) } 100% { transform: scale(0) rotate(20deg); opacity: 0 } }
@keyframes rsp-gira { to { transform: rotate(360deg) } }
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
.rsp-nueva:hover .rsp-avatar { border-color: #D4AF37 !important; color: #FFD700 !important; transform: translateY(-8px); }
`;

const Candado = ({ s = 12 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>);

function Particulas({ color = "#D4AF37" }) {
  const ps = Array.from({ length: 22 }, (_, i) => ({
    left: (i * 37) % 100, delay: (i * 1.7) % 12, dur: 10 + (i * 3) % 9, size: 2 + (i % 3),
  }));
  return ps.map((p, i) => (
    <span key={i} style={{ position: "absolute", bottom: -10, left: p.left + "%", width: p.size, height: p.size, borderRadius: 9,
      background: color, boxShadow: "0 0 8px " + color, animation: `rsp-flota ${p.dur}s linear ${p.delay}s infinite`, opacity: 0 }} />));
}

function Fondo({ children, saliendo, rojo }) {
  const c = rojo ? "220,38,38" : "212,175,55";
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "#000", color: "#F5F5F5", overflow: "auto",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      // iPhone: la isla de la cámara y la barra de abajo (viewport-fit=cover) no tapan nada
      padding: "calc(env(safe-area-inset-top, 0px) + 92px) 16px calc(env(safe-area-inset-bottom, 0px) + 64px)",
      animation: saliendo ? "rsp-sale .42s ease forwards" : "none" }}>
      <style>{CSS}</style>
      <div style={{ position: "fixed", left: "50%", top: "38%", width: "90vmax", height: "90vmax", borderRadius: "50%",
        background: `radial-gradient(circle, rgba(${c},.20) 0%, rgba(${c},.06) 35%, transparent 65%)`, animation: "rsp-brillo 7s ease-in-out infinite", pointerEvents: "none" }} />
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none" }}><Particulas color={rojo ? "#DC2626" : "#D4AF37"} /></div>
      <div style={{ position: "fixed", top: "calc(env(safe-area-inset-top, 0px) + 24px)", left: 0, right: 0, display: "flex", justifyContent: "center", alignItems: "center", gap: 10 }}>
        <div className="grad-gold gold-glow" style={{ width: 34, height: 34, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: "#000" }}>
          <span style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 16 }}>R</span>
        </div>
        <div style={{ fontFamily: "'Sora'", fontWeight: 700, fontSize: 17, letterSpacing: "-.01em" }}>Random<span className="gold-text">Studio</span></div>
      </div>
      {children}
    </div>);
}

/** Conexión bloqueada: no se puede hacer nada hasta que el portátil lo revise. */
export function PantallaBloqueo({ ip }) {
  return (
    <Fondo rojo>
      <div style={{ position: "relative", textAlign: "center", maxWidth: 440, animation: "rsp-entra .6s ease both" }}>
        <div style={{ width: 92, height: 92, margin: "0 auto 22px", borderRadius: 26, display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(220,38,38,.12)", border: "1px solid rgba(220,38,38,.5)", color: "#F87171", animation: "rsp-late 2.4s ease-in-out infinite" }}>
          <Candado s={40} />
        </div>
        <div style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: "clamp(24px,4vw,34px)", letterSpacing: "-.02em" }}>Acceso bloqueado</div>
        <div style={{ fontSize: 14, color: "#A3A3A3", marginTop: 10, lineHeight: 1.6 }}>
          Esta conexión no tiene permiso para entrar en RandomStudio. El administrador revisará el bloqueo.
        </div>
        {ip && <div style={{ marginTop: 18, fontSize: 12, color: "#6B6B6B", fontFamily: "ui-monospace,Consolas,monospace" }}>IP {ip}</div>}
      </div>
    </Fondo>);
}

export function PantallaPerfiles({ onElegir, codigo, inicial: ini }) {
  const [lista, setLista] = useState(() => [...PERFILES]);
  const [disp, setDisp] = useState(ini && ini.dispositivo || null);
  const [bloqueo, setBloqueo] = useState(null);
  const [siempre, setSiempre] = useState(false);
  const [saliendo, setSaliendo] = useState(null);
  const [abriendo, setAbriendo] = useState(null);      // perfil que acaba de recibir permiso (animación del candado)
  const [ocupado, setOcupado] = useState(codigo ? "Comprobando tu cuenta de Google…" : "");
  const [error, setError] = useState(ini && ini.sinConexion ? "Sin conexión con el servidor: solo puedes entrar en las cuentas ya aprobadas." : "");
  const [, refrescar] = useState(0);
  const [menu, setMenu] = useState(null);
  const [creando, setCreando] = useState(null);        // v3.40: el perfil local que se está creando { nombre, brutos }
  const subir = useRef(null);
  const antes = useRef(new Set(PERFILES.filter(p => p.activo).map(p => p.id)));
  const size = Math.min(160, Math.max(108, Math.round(window.innerWidth / 7.5)));

  const actualizar = async () => {
    try {
      await cargarLocales();
      const j = await accesoApi(YT_BACKEND, "estado");
      if (j.baneado) { setBloqueo(j.ip || ""); return; }
      ponerPerfiles(j.perfiles || []);
      const nuevos = PERFILES.filter(p => p.activo && !antes.current.has(p.id));
      nuevos.forEach(p => antes.current.add(p.id));
      if (nuevos.length) { setAbriendo(nuevos[0].id); setTimeout(() => setAbriendo(null), 1400); }
      setLista([...PERFILES]); setDisp(j.dispositivo || null); setError("");
    } catch (e) { setError("Sin conexión con el servidor"); }
  };

  // con alguna cuenta esperando permiso, se comprueba sola cada 4 s
  const hayPendientes = lista.some(p => !p.activo);
  useEffect(() => {
    if (!hayPendientes) return;
    const t = setInterval(actualizar, 4000);
    return () => clearInterval(t);
  }, [hayPendientes]);

  // vuelta de Google en la web (?code=...&state=rs_entrar)
  useEffect(() => { if (codigo) conCodigo(codigo); }, []);

  async function conCodigo(code) {
    setOcupado("Comprobando tu cuenta de Google…"); setError("");
    try {
      const t = await ytCanjear(code);
      if (t && t.baneado) { setBloqueo(""); return; }
      if (!t || !t.access_token) throw new Error("No se pudo completar el inicio de sesión con Google");
      const j = await accesoApi(YT_BACKEND, "solicitar", t.access_token);
      if (j.baneado) { setBloqueo(j.ip || ""); return; }
      // la sesión de Google se queda guardada en ESE perfil
      guardar(clavePerfil(j.perfil.id, "rds_yt_tokens"), JSON.stringify(t));
      await actualizar();
    } catch (e) { setError(e.message || String(e)); }
    setOcupado("");
  }

  const nuevaCuenta = async () => {
    if (ocupado) return;
    setError("");
    try {
      const code = await googleElegirCuenta();     // en la web se va a Google y vuelve
      if (code) await conCodigo(code);
    } catch (e) { setError(e.message || String(e)); }
  };

  const volverAPedir = async () => {
    await olvidarEquipo();
    setDisp(null); ponerPerfiles([]); setLista([]);
    nuevaCuenta();
  };

  const elegir = (p) => {
    if (!p || !p.activo || saliendo) return;
    try { localStorage.setItem(K_PERFIL, p.id); localStorage.setItem(K_SIEMPRE, siempre ? "1" : "0"); } catch (e) {}
    setSaliendo(p.id);
    setTimeout(() => entrarEnPerfil(p.id).then(() => onElegir(p.id)), 420);
  };

  useEffect(() => {
    const cerrar = () => setMenu(null);
    window.addEventListener("click", cerrar);
    return () => window.removeEventListener("click", cerrar);
  }, []);
  useEffect(() => {
    const f = (e) => { if (e.key === "Enter" && !menu) elegir(lista.find(p => p.activo)); };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  });

  const puedeLocal = !!(window.studioFS && window.studioFS.localesCrear) && lista.some(p => p.activo && !p.local);
  const crearLocal = async () => {
    const nombre = (creando && creando.nombre || "").trim();
    if (!nombre) { setError("Ponle un nombre al perfil"); return; }
    if (creando.renombrar) {
      const r = await window.studioFS.localesRenombrar(creando.renombrar.id, nombre);
      if (r && r.error) { setError(r.error); return; }
      setCreando(null); setError(""); await actualizar(); return;
    }
    const r = await window.studioFS.localesCrear(nombre, (creando.brutos || "").trim() || null);
    if (!r || r.error) { setError((r && r.error) || "No se pudo crear el perfil"); return; }
    // de entrada, solo los apartados que tienen sentido sin canal de YouTube (se pueden encender en Configuración)
    try { localStorage.setItem("perfil:" + r.perfil.id + ":rds_modulos_off", JSON.stringify(["scheduled", "stats", "directos", "clips", "ranking", "historias", "randomchat"])); } catch (e) {}
    setCreando(null); setError("");
    await actualizar();
  };
  // v3.43.3: con el mismo formulario (window.prompt no existe en la app de escritorio: devolvía null y no hacía nada)
  const renombrarLocal = (p) => { setMenu(null); setError(""); setCreando({ nombre: p.nombre, brutos: "", renombrar: p }); };
  const quitarLocal = async (p) => {
    setMenu(null);
    if (!window.confirm(`¿Quitar el perfil «${p.nombre}» de este equipo?

No se borra nada: sus vídeos, sus brutos y sus carpetas se quedan donde están.`)) return;
    await window.studioFS.localesQuitar(p.id);
    await actualizar();
  };

  const elegirFoto = async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f || !menu) return;
    try { guardar(kFoto(menu), await recortar(f)); refrescar(n => n + 1); } catch (x) { alert(x.message); }
    setMenu(null);
  };

  if (bloqueo !== null) return <PantallaBloqueo ip={bloqueo} />;

  const rechazado = disp && disp.estado === "revocado";
  const primera = lista.find(p => p.activo);

  return (
    <Fondo saliendo={saliendo}>
      <div style={{ position: "relative", textAlign: "center", animation: "rsp-entra .6s ease both" }}>
        <div style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: "clamp(26px,4vw,40px)", letterSpacing: "-.03em" }}>
          {lista.length ? "¿Con qué cuenta entras?" : "Bienvenido a RandomStudio"}</div>
        <div style={{ fontSize: 14, color: "#A3A3A3", marginTop: 8, maxWidth: 520, lineHeight: 1.5 }}>
          {lista.length ? (lista.some(p => p.local) ? "Cada perfil es una cuenta de Google o un perfil local de este equipo" : "Cada perfil es una cuenta de Google con su canal de YouTube")
            : "Inicia sesión con tu cuenta de Google. El portátil tendrá que darte permiso antes de entrar."}</div>
      </div>

      {rechazado && (
        <div style={{ position: "relative", marginTop: 26, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", justifyContent: "center",
          background: "rgba(220,38,38,.08)", border: "1px solid rgba(220,38,38,.4)", borderRadius: 12, padding: "10px 14px", fontSize: 13 }}>
          <span style={{ color: "#F87171", fontWeight: 700 }}>El portátil rechazó este equipo.</span>
          <button onClick={volverAPedir} className="rsp-op" style={{ color: "#FFD700", border: "1px solid #3a3119" }}>Volver a pedir permiso</button>
        </div>)}

      <div style={{ position: "relative", display: "flex", gap: "clamp(22px,5vw,52px)", marginTop: 40, flexWrap: "wrap", justifyContent: "center" }}>
        {lista.map((p, i) => {
          const bloq = !p.activo;
          return (
            <div key={p.id} role="button" tabIndex={bloq ? -1 : 0} onClick={() => elegir(p)} className={"rsp-carta" + (bloq ? " bloq" : "")}
              title={bloq ? "Esperando permiso del portátil" : "Entrar como " + p.nombre}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, cursor: bloq ? "default" : "pointer", position: "relative",
                animation: `rsp-entra .6s ease ${0.12 + i * 0.1}s both`, outline: "none", width: size + 30 }}>
              <div className="rsp-avatar" style={{ position: "relative", borderRadius: size * 0.2, boxShadow: abriendo === p.id ? "0 0 0 3px #22C55E, 0 0 60px rgba(34,197,94,.5)" : "0 0 0 1px #2a2a2a",
                transform: saliendo === p.id ? "scale(1.08)" : undefined }}>
                <img src={fotoPerfil(p)} alt="" referrerPolicy="no-referrer"
                  onError={(e) => { if (e.currentTarget.src !== p.avatar) e.currentTarget.src = p.avatar; }}
                  style={{ width: size, height: size, borderRadius: size * 0.2, display: "block", objectFit: "cover",
                    filter: bloq ? "grayscale(.85) brightness(.4)" : "none", transition: "filter .6s" }} />
                {!bloq && (
                  <button className="rsp-lapiz" title="Cambiar la foto" onClick={(e) => { e.stopPropagation(); setMenu(m => m === p.id ? null : p.id); }}
                    style={{ position: "absolute", right: -6, bottom: -6, width: 32, height: 32, borderRadius: 99, display: "flex", alignItems: "center",
                      justifyContent: "center", background: "#141414", border: "1px solid #3a3119", color: "#D4AF37", boxShadow: "0 4px 14px rgba(0,0,0,.6)", zIndex: 2 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
                  </button>)}
                {menu === p.id && (
                  <div onClick={(e) => e.stopPropagation()} style={{ position: "absolute", top: "calc(100% + 12px)", left: "50%", transform: "translateX(-50%)", zIndex: 5,
                    minWidth: 236, whiteSpace: "nowrap", background: "#141414", border: "1px solid #3a3119", borderRadius: 12, padding: 6, boxShadow: "0 18px 50px rgba(0,0,0,.7)",
                    display: "flex", flexDirection: "column", gap: 2, animation: "rsp-entra .18s ease both" }}>
                    <button onClick={() => subir.current && subir.current.click()} className="rsp-op">Subir una foto…</button>
                    <button disabled={!leer(kFoto(p.id))} onClick={() => { guardar(kFoto(p.id), null); refrescar(n => n + 1); setMenu(null); }}
                      className="rsp-op" style={{ opacity: leer(kFoto(p.id)) ? 1 : 0.4 }}>{p.local ? "Quitar la foto" : "Usar la del canal de YouTube"}</button>
                    {p.local && <button onClick={() => renombrarLocal(p)} className="rsp-op">Cambiar el nombre…</button>}
                    {p.local && <button onClick={() => quitarLocal(p)} className="rsp-op" style={{ color: "#F87171" }}>Quitar de este equipo…</button>}
                  </div>)}
                {(bloq || abriendo === p.id) && (
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ width: 54, height: 54, borderRadius: 99, display: "flex", alignItems: "center", justifyContent: "center",
                      background: "rgba(0,0,0,.75)", border: "1px solid " + (abriendo === p.id ? "#22C55E" : "#3a3119"), color: abriendo === p.id ? "#22C55E" : "#FFD700",
                      backdropFilter: "blur(4px)", animation: abriendo === p.id ? "rsp-abre 1.2s ease forwards" : "rsp-late 2s ease-in-out infinite" }}>
                      <Candado s={24} />
                    </div>
                  </div>)}
              </div>
              <div style={{ textAlign: "center" }}>
                <div className="rsp-nombre" style={{ fontFamily: "'Sora'", fontWeight: 700, fontSize: 17, color: bloq ? "#8a8a8a" : "#F5F5F5", transition: "color .2s" }}>{p.nombre}</div>
                <div style={{ fontSize: 12, color: bloq ? "#D4AF37" : "#A3A3A3", marginTop: 3, fontWeight: 600, display: "flex", alignItems: "center", gap: 5, justifyContent: "center" }}>
                  {bloq ? <><span style={{ width: 10, height: 10, border: "2px solid #D4AF37", borderTopColor: "transparent", borderRadius: 99, animation: "rsp-gira 1s linear infinite" }} />Esperando permiso del portátil</> : p.lema}
                </div>
              </div>
            </div>);
        })}

        {/* añadir un perfil: con una cuenta de Google o (v3.40, solo si este equipo ya tiene permiso) uno LOCAL sin Google.
            Él: "haz que el + para crear otro perfil te dé la opción de crear un perfil con una cuenta de Google o local" */}
        <div role="button" tabIndex={0} onClick={(e) => { if (ocupado) return; if (!puedeLocal) { nuevaCuenta(); return; } e.stopPropagation(); setMenu(m => m === "+" ? null : "+"); }}
          className="rsp-carta rsp-nueva" title={puedeLocal ? "Añadir un perfil: con una cuenta de Google o local" : "Iniciar sesión con otra cuenta de Google"}
          style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, cursor: ocupado ? "wait" : "pointer", width: size + 30, position: "relative",
            animation: `rsp-entra .6s ease ${0.12 + lista.length * 0.1}s both`, outline: "none" }}>
          <div className="rsp-avatar" style={{ width: size, height: size, borderRadius: size * 0.2, border: "2px dashed #3a3a3a", color: "#8a8a8a",
            display: "flex", alignItems: "center", justifyContent: "center", transition: "all .22s" }}>
            {ocupado
              ? <span style={{ width: 34, height: 34, border: "3px solid #D4AF37", borderTopColor: "transparent", borderRadius: 99, animation: "rsp-gira .9s linear infinite" }} />
              : <svg width={size * 0.3} height={size * 0.3} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>}
          </div>
          <div style={{ textAlign: "center" }}>
            <div className="rsp-nombre" style={{ fontFamily: "'Sora'", fontWeight: 700, fontSize: 17, transition: "color .2s" }}>{!lista.length ? "Iniciar sesión" : puedeLocal ? "Añadir perfil" : "Añadir cuenta"}</div>
            <div style={{ fontSize: 12, color: "#A3A3A3", marginTop: 3, fontWeight: 600 }}>{ocupado || (puedeLocal ? "Google o local" : "con Google")}</div>
          </div>
          {menu === "+" && (
            <div onClick={(e) => e.stopPropagation()} style={{ position: "absolute", top: size + 12, left: "50%", marginLeft: -140, zIndex: 5,   // (sin transform: la animación de entrada lo pisa)
              width: 280, boxSizing: "border-box", background: "#141414", border: "1px solid #3a3119", borderRadius: 12, padding: 6, boxShadow: "0 18px 50px rgba(0,0,0,.7)",
              display: "flex", flexDirection: "column", gap: 2, animation: "rsp-entra .18s ease both", textAlign: "left" }}>
              <button className="rsp-op" onClick={() => { setMenu(null); nuevaCuenta(); }}>
                Cuenta de Google<div style={{ fontSize: 11.5, color: "#8a8a8a", fontWeight: 500, marginTop: 2 }}>Con su canal de YouTube</div></button>
              <button className="rsp-op" onClick={() => { setMenu(null); setCreando(c => c || { nombre: "", brutos: "" }); }}>
                Perfil local<div style={{ fontSize: 11.5, color: "#8a8a8a", fontWeight: 500, marginTop: 2 }}>Sin Google · solo en este equipo</div></button>
            </div>)}
        </div>
      </div>
      <input ref={subir} type="file" accept="image/*" style={{ display: "none" }} onChange={elegirFoto} />

      {creando && (
        <div onClick={(e) => e.stopPropagation()} style={{ position: "relative", marginTop: 30, width: "min(460px, 100%)", background: "#141414", border: "1px solid #3a3119",
          borderRadius: 14, padding: 18, display: "flex", flexDirection: "column", gap: 12, animation: "rsp-entra .25s ease both", textAlign: "left" }}>
          <div style={{ fontFamily: "'Sora'", fontWeight: 700, fontSize: 16 }}>{creando.renombrar ? "Cambiar el nombre del perfil" : "Nuevo perfil local"}</div>
          {!creando.renombrar && <div style={{ fontSize: 12.5, color: "#A3A3A3", lineHeight: 1.5 }}>Solo existe en este equipo y no necesita cuenta de Google. {"Sus vídeos se guardan en «Vídeos RDR\\Editados\\<nombre>» y, si conectas Drive dentro del perfil, se suben allí."}</div>}
          <input autoFocus value={creando.nombre} onChange={(e) => setCreando({ ...creando, nombre: e.target.value })} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") crearLocal(); }}
            placeholder="Nombre (p. ej. Carental)" style={{ background: "#0b0b0b", border: "1px solid #2a2a2a", borderRadius: 9, padding: "10px 12px", color: "#F5F5F5", fontSize: 14 }} />
          {!creando.renombrar && <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input value={creando.brutos} onChange={(e) => setCreando({ ...creando, brutos: e.target.value })} onKeyDown={(e) => e.stopPropagation()}
              placeholder="Carpeta de los brutos (opcional)" style={{ flex: 1, minWidth: 0, background: "#0b0b0b", border: "1px solid #2a2a2a", borderRadius: 9, padding: "10px 12px", color: "#F5F5F5", fontSize: 12.5 }} />
            <button className="rsp-op" style={{ border: "1px solid #3a3119", color: "#FFD700" }}
              onClick={async () => { const r = await window.studioFS.carpetasElegir(creando.brutos || null); if (r) setCreando(c => ({ ...c, brutos: r })); }}>Elegir…</button>
          </div>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="rsp-op" onClick={() => { setCreando(null); setError(""); }}>Cancelar</button>
            <button className="rsp-op" onClick={crearLocal} style={{ background: "linear-gradient(135deg,#FFD700,#D4AF37)", color: "#000" }}>{creando.renombrar ? "Guardar" : "Crear perfil"}</button>
          </div>
        </div>)}

      {error && <div style={{ position: "relative", marginTop: 26, fontSize: 13, color: "#F87171", textAlign: "center", maxWidth: 480 }}>{error}</div>}

      {primera && (
        <label style={{ position: "relative", marginTop: 40, display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#A3A3A3", cursor: "pointer",
          animation: "rsp-entra .6s ease .35s both" }}>
          <span onClick={() => setSiempre(s => !s)} style={{ width: 38, height: 22, borderRadius: 99, padding: 3, display: "flex",
            background: siempre ? "linear-gradient(135deg,#FFD700,#D4AF37)" : "#262626", transition: "background .2s" }}>
            <span style={{ width: 16, height: 16, borderRadius: 99, background: siempre ? "#000" : "#6B6B6B", transform: siempre ? "translateX(16px)" : "none", transition: "transform .2s" }} />
          </span>
          <span onClick={() => setSiempre(s => !s)}>Entrar siempre con este perfil</span>
        </label>)}
      <div style={{ position: "fixed", bottom: "calc(env(safe-area-inset-bottom, 0px) + 14px)", left: 0, right: 0, textAlign: "center", fontSize: 11.5, color: "#555", padding: "0 16px" }}>
        {disp ? <>Este equipo: <b style={{ color: "#8a8a8a" }}>{disp.nombre}</b>{disp.rol === "dueno" ? " · manda en todo" : disp.rol === "admin" ? " · administrador" : ""}</> : "Equipo sin registrar"}
        {primera ? " · Pulsa Intro para entrar con " + primera.nombre : ""}
      </div>
    </Fondo>);
}
