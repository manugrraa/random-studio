import React from "react";
const { useState, useEffect, useCallback, useRef } = React;
import { YT_BACKEND, cloudToken, fireNotification } from "./datos";
import { estadoEquipo, idEquipo, seguridadApi } from "./seguridad";
import { PublicarVersion } from "./actualizar";

/* ============================ ADMINISTRACIÓN (v3.30) ============================
 * Solo para el portátil (rol «dueno») y los equipos a los que el portátil dé ese poder («admin»).
 * Todo en vivo (cada 4 s con la pestaña a la vista): solicitudes de acceso, equipos y a qué cuentas entran,
 * cuentas (perfiles), IPs bloqueadas y el registro de accesos. El servidor es quien manda: aquí solo se pide.
 */

export function useRolEquipo() {
  const [rol, setRol] = useState(estadoEquipo.estado === "aprobado" ? estadoEquipo.rol : null);
  useEffect(() => {
    const f = (e) => { const d = e.detail || {}; setRol(d.estado === "aprobado" ? d.rol : null); };
    window.addEventListener("rs-seguridad", f);
    return () => window.removeEventListener("rs-seguridad", f);
  }, []);
  return rol;
}
export const esAdmin = (rol) => rol === "dueno" || rol === "admin";

const hace = (s, ahora) => {
  if (!s) return "nunca";
  const m = Math.round((ahora - new Date(s).getTime()) / 60000);
  if (m < 1) return "ahora mismo";
  if (m < 60) return "hace " + m + " min";
  if (m < 1440) return "hace " + Math.round(m / 60) + " h";
  return new Date(s).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};
function tipo(ua) {
  ua = ua || "";
  if (/Electron|RandomStudio/i.test(ua)) return { icono: "💻", txt: "RandomStudio (escritorio)" };
  if (/Android/i.test(ua)) return { icono: "📱", txt: "Android" };
  if (/iPhone/i.test(ua)) return { icono: "📱", txt: "iPhone" };
  if (/iPad/i.test(ua)) return { icono: "📱", txt: "iPad" };
  if (/Edg\//i.test(ua)) return { icono: "🌐", txt: "Edge" };
  if (/Chrome\//i.test(ua)) return { icono: "🌐", txt: "Chrome" };
  if (/Firefox\//i.test(ua)) return { icono: "🌐", txt: "Firefox" };
  if (/Safari\//i.test(ua)) return { icono: "🌐", txt: "Safari" };
  return { icono: "❔", txt: ua ? ua.slice(0, 30) : "desconocido" };
}
const ROL = { dueno: ["Dueño", "var(--gold)"], admin: ["Administrador", "#60A5FA"], usuario: ["Usuario", "var(--text-3)"] };
const RES = { ok: "var(--green)", pendiente: "var(--gold)", rechazado: "var(--red)", bloqueado: "var(--red)", alerta: "#F59E0B" };

const CSS = `
@keyframes adm-pulso { 0%,100% { box-shadow: 0 0 0 0 rgba(34,197,94,.6) } 50% { box-shadow: 0 0 0 6px rgba(34,197,94,0) } }
@keyframes adm-entra { from { transform: translateY(8px) } to { transform: none } }
@keyframes adm-borde { 0%,100% { border-color: rgba(212,175,55,.35) } 50% { border-color: rgba(212,175,55,.9) } }
.adm-btn { font-size: 12px; font-weight: 700; border-radius: 9px; padding: 7px 12px; border: 1px solid var(--border); transition: all .15s; }
.adm-btn:hover { filter: brightness(1.2); transform: translateY(-1px); }
.adm-chip { font-size: 11.5px; font-weight: 700; border-radius: 99px; padding: 4px 10px; border: 1px solid var(--border); display: inline-flex; align-items: center; gap: 6px; transition: all .15s; }
`;

function Tile({ n, txt, color, onClick }) {
  return (
    <button onClick={onClick} style={{ flex: "1 1 125px", textAlign: "left", background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 14, padding: "12px 14px", cursor: onClick ? "pointer" : "default" }}>
      <div style={{ fontFamily: "'Sora'", fontSize: 28, fontWeight: 800, color: n ? color : "var(--text-3)", lineHeight: 1 }}>{n}</div>
      <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 6, fontWeight: 600 }}>{txt}</div>
    </button>);
}

const Seccion = React.forwardRef(({ titulo, extra, children }, ref) => (
  <div ref={ref} style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 14, padding: 18 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--gold)", textTransform: "uppercase", letterSpacing: ".07em" }}>{titulo}</div>
      <span style={{ flex: 1 }} />{extra}
    </div>
    {children}
  </div>));

export function AdminView({ toast }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState("");
  const [yo, setYo] = useState(null);
  const [ahora, setAhora] = useState(Date.now());
  const [ultima, setUltima] = useState(0);
  const [filtro, setFiltro] = useState("todo");
  const [ipNueva, setIpNueva] = useState("");
  const [trabajando, setTrabajando] = useState(null);
  const vistos = useRef(null);
  const refs = { sol: useRef(null), eq: useRef(null), ip: useRef(null), reg: useRef(null) };

  const recibir = useCallback((j) => {
    setD(j); setUltima(Date.now()); setError("");
    // aviso de solicitudes nuevas mientras el panel está abierto
    const pend = solicitudesDe(j).map(s => s.d.id + s.p.id);
    if (vistos.current) {
      const nuevas = pend.filter(x => !vistos.current.has(x));
      if (nuevas.length) { toast("🔐 Nueva solicitud de acceso"); try { fireNotification("RandomStudio", "Un equipo pide permiso para entrar"); } catch (e) {} }
    }
    vistos.current = new Set(pend);
  }, [toast]);

  const cargar = useCallback(async () => {
    try { recibir(await seguridadApi(YT_BACKEND, await cloudToken(), "GET")); }
    catch (e) { setError(e.message); }
  }, [recibir]);

  useEffect(() => {
    idEquipo().then(setYo).catch(() => {});
    cargar();
    const t = setInterval(() => { if (document.visibilityState === "visible") cargar(); }, 4000);
    const r = setInterval(() => setAhora(Date.now()), 1000);
    return () => { clearInterval(t); clearInterval(r); };
  }, [cargar]);

  const accion = async (cuerpo, ok, confirmar) => {
    if (confirmar && !confirm(confirmar)) return;
    setTrabajando(JSON.stringify(cuerpo));
    try { recibir(await seguridadApi(YT_BACKEND, await cloudToken(), "POST", cuerpo)); toast(ok); }
    catch (e) { toast("❌ " + e.message); }
    setTrabajando(null);
  };

  if (!d) return (
    <div style={{ padding: 24, color: error ? "var(--red)" : "var(--text-3)", fontSize: 13 }}>{error || "Cargando el panel…"}</div>);

  const soyDueno = d.rol === "dueno";
  const perfil = (id) => d.perfiles.find(p => p.id === id) || { id, nombre: id };
  const lugar = (dispId, ip) => {
    const a = d.accesos.find(x => (dispId && x.dispositivo_id === dispId) || (ip && x.ip === ip));
    return a ? [a.ciudad, a.pais].filter(Boolean).join(", ") : "";
  };
  const sols = solicitudesDe(d);
  const equipos = d.dispositivos.filter(x => x.estado !== "pendiente" || x.permisos.some(p => p.estado === "aprobado"));
  const ipsActivas = d.ips.filter(i => i.activo);
  const sinRevisar = ipsActivas.filter(i => !i.revisado).length;
  const rech24 = d.accesos.filter(a => (a.resultado === "rechazado" || a.resultado === "bloqueado") && ahora - new Date(a.fecha).getTime() < 864e5).length;
  const ir = (k) => refs[k].current && refs[k].current.scrollIntoView({ behavior: "smooth", block: "start" });
  const seg = Math.round((ahora - ultima) / 1000);
  const filtrados = d.accesos.filter(a => filtro === "todo" ? true : filtro === "rechazos" ? ["rechazado", "bloqueado", "alerta"].includes(a.resultado)
    : filtro === "solicitudes" ? /solicitud|alta/.test(a.accion) : /inicio/.test(a.accion)).slice(0, 80);
  const ocupado = (c) => trabajando === JSON.stringify(c);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 1100 }}>
      <style>{CSS}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontFamily: "'Sora'", fontSize: 22, fontWeight: 800 }}>Administración</div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, color: error ? "var(--red)" : "var(--text-2)", fontWeight: 600 }}>
          <span style={{ width: 8, height: 8, borderRadius: 9, background: error ? "var(--red)" : "var(--green)", animation: error ? "none" : "adm-pulso 2s infinite" }} />
          {error ? "Sin conexión: " + error : "En vivo · " + (seg < 2 ? "ahora" : "hace " + seg + " s")}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: "var(--text-3)" }}>Este equipo: <b style={{ color: ROL[d.rol][1] }}>{ROL[d.rol][0]}</b></span>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Tile n={sols.length} txt="Solicitudes esperando" color="var(--gold)" onClick={() => ir("sol")} />
        <Tile n={d.dispositivos.filter(x => x.estado === "aprobado").length} txt="Equipos con acceso" color="var(--green)" onClick={() => ir("eq")} />
        <Tile n={d.perfiles.filter(p => p.estado === "aprobado").length} txt="Cuentas activas" color="var(--text)" onClick={() => ir("eq")} />
        <Tile n={ipsActivas.length} txt={sinRevisar ? `IPs bloqueadas (${sinRevisar} por revisar)` : "IPs bloqueadas"} color="var(--red)" onClick={() => ir("ip")} />
        <Tile n={rech24} txt="Intentos rechazados (24 h)" color="#F59E0B" onClick={() => { setFiltro("rechazos"); ir("reg"); }} />
      </div>

      <Seccion ref={refs.sol} titulo={"Solicitudes de acceso" + (sols.length ? " · " + sols.length : "")}>
        {!sols.length && <div style={{ fontSize: 13, color: "var(--text-3)" }}>Nadie está esperando. Cuando un equipo pida entrar, saldrá aquí al momento.</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sols.map(({ d: e, p, creado }) => {
            const t = tipo(e.user_agent), pf = perfil(p.id), nueva = pf.estado === "pendiente";
            const cA = { accion: "aprobar_solicitud", dispositivo_id: e.id, perfil_id: p.id };
            return (
              <div key={e.id + p.id} style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", padding: 14, borderRadius: 12,
                background: "rgba(212,175,55,0.05)", border: "1px solid var(--border-gold)", animation: "adm-borde 2.4s ease-in-out infinite" }}>
                <div style={{ fontSize: 30 }}>{t.icono}</div>
                <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{e.nombre} <span style={{ fontWeight: 500, color: "var(--text-3)", fontSize: 12 }}>· {t.txt}</span></div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, fontSize: 13 }}>
                    <span style={{ color: "var(--text-2)" }}>quiere entrar en</span>
                    {pf.foto && <img src={pf.foto} alt="" referrerPolicy="no-referrer" style={{ width: 22, height: 22, borderRadius: 6 }} />}
                    <b>{pf.nombre}</b>
                    {nueva && <span className="adm-chip" style={{ color: "var(--gold)", borderColor: "var(--border-gold)", padding: "1px 8px" }}>CUENTA NUEVA</span>}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 5 }}>
                    IP {e.ultima_ip || "?"}{lugar(e.id, e.ultima_ip) ? " · " + lugar(e.id, e.ultima_ip) : ""} · {hace(creado, ahora)}</div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="adm-btn" disabled={ocupado(cA)} onClick={() => accion(cA, "✅ " + e.nombre + " ya puede entrar en " + pf.nombre)}
                    style={{ background: "var(--green)", color: "#000", borderColor: "transparent" }}>{ocupado(cA) ? "Aprobando…" : "Aprobar"}</button>
                  <button className="adm-btn" onClick={() => accion({ accion: "rechazar_solicitud", dispositivo_id: e.id, perfil_id: p.id }, "Solicitud rechazada")}
                    style={{ color: "var(--text)" }}>Rechazar</button>
                  <button className="adm-btn" onClick={() => accion({ accion: "rechazar_solicitud", dispositivo_id: e.id, perfil_id: p.id, bloquear_ip: true },
                    "⛔ Rechazada y con la IP bloqueada", "¿Rechazar y bloquear la IP " + (e.ultima_ip || "") + "? Nadie desde esa conexión podrá entrar hasta que la desbloquees.")}
                    style={{ color: "var(--red)", borderColor: "rgba(220,38,38,.4)" }}>Rechazar y bloquear IP</button>
                </div>
              </div>);
          })}
        </div>
      </Seccion>

      <Seccion ref={refs.eq} titulo="Equipos y a qué cuentas entran">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {equipos.map(e => {
            const t = tipo(e.user_agent), [rolTxt, rolColor] = ROL[e.rol] || ROL.usuario, esYo = e.id === (yo || d.yo);
            const tocable = e.rol !== "dueno" && (soyDueno || e.rol !== "admin");
            return (
              <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "11px 13px", borderRadius: 11,
                background: "var(--card-2)", border: "1px solid var(--border)", opacity: e.estado === "revocado" ? 0.55 : 1 }}>
                <div style={{ fontSize: 22 }}>{t.icono}</div>
                <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <b style={{ fontSize: 13.5 }}>{e.nombre}</b>
                    {esYo && <span style={{ fontSize: 11, color: "var(--text-3)" }}>(este)</span>}
                    <span className="adm-chip" style={{ color: rolColor, borderColor: rolColor, padding: "1px 8px", fontSize: 10.5 }}>{rolTxt.toUpperCase()}</span>
                    {e.estado === "revocado" && <span className="adm-chip" style={{ color: "var(--red)", borderColor: "var(--red)", padding: "1px 8px", fontSize: 10.5 }}>SIN ACCESO</span>}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 3 }}>
                    {t.txt} · {hace(e.ultimo_uso, ahora)}{e.ultima_ip ? " · IP " + e.ultima_ip : ""}{lugar(e.id) ? " · " + lugar(e.id) : ""}</div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flex: "1 1 260px" }}>
                  {d.perfiles.filter(p => p.estado === "aprobado").map(p => {
                    const pm = e.permisos.find(x => x.perfil_id === p.id), on = pm && pm.estado === "aprobado";
                    return (
                      <button key={p.id} className="adm-chip" disabled={!tocable}
                        title={!tocable ? (e.rol === "dueno" ? "El portátil entra siempre en todo" : "Solo el portátil puede cambiar a otro administrador") : on ? "Quitar el acceso a " + p.nombre : "Dar acceso a " + p.nombre}
                        onClick={() => accion({ accion: "permiso", dispositivo_id: e.id, perfil_id: p.id, estado: on ? "revocado" : "aprobado" }, (on ? "Quitado: " : "Dado: ") + e.nombre + " → " + p.nombre)}
                        style={{ color: on ? "var(--text)" : "var(--text-3)", background: on ? "rgba(34,197,94,.12)" : "transparent", borderColor: on ? "rgba(34,197,94,.5)" : "var(--border)", cursor: tocable ? "pointer" : "default" }}>
                        {p.foto && <img src={p.foto} alt="" referrerPolicy="no-referrer" style={{ width: 16, height: 16, borderRadius: 4, filter: on ? "none" : "grayscale(1)" }} />}
                        {on ? "✓ " : ""}{p.nombre}
                      </button>);
                  })}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button className="adm-btn" style={{ color: "var(--text-2)" }} onClick={() => { const n = prompt("Nombre del equipo", e.nombre); if (n && n.trim()) accion({ accion: "renombrar", id: e.id, nombre: n.trim() }, "Nombre cambiado"); }}>Renombrar</button>
                  {soyDueno && e.rol !== "dueno" && e.estado === "aprobado" && (
                    <button className="adm-btn" style={{ color: "#60A5FA" }} onClick={() => accion({ accion: "rol", id: e.id, rol: e.rol === "admin" ? "usuario" : "admin" },
                      e.rol === "admin" ? "Ya no es administrador" : "👑 " + e.nombre + " ahora es administrador",
                      e.rol === "admin" ? null : "¿Dar a «" + e.nombre + "» el poder de administrador? Podrá aprobar equipos, bloquear IPs y ver este panel.")}>
                      {e.rol === "admin" ? "Quitar admin" : "Hacer admin"}</button>)}
                  {tocable && e.estado === "aprobado" && !esYo && <button className="adm-btn" style={{ color: "var(--red)" }} onClick={() => accion({ accion: "revocar", id: e.id }, "Acceso quitado a " + e.nombre, "¿Quitar TODO el acceso a «" + e.nombre + "»?")}>Quitar acceso</button>}
                  {tocable && e.estado === "revocado" && <button className="adm-btn" style={{ color: "var(--green)" }} onClick={() => accion({ accion: "aprobar", id: e.id }, e.nombre + " vuelve a estar aprobado")}>Volver a aprobar</button>}
                  {tocable && e.estado === "revocado" && <button className="adm-btn" style={{ color: "var(--red)" }} onClick={() => accion({ accion: "borrar", id: e.id }, "Equipo borrado", "¿Borrar «" + e.nombre + "» de la lista? Si vuelve, tendrá que pedir permiso de nuevo.")}>Borrar</button>}
                </div>
              </div>);
          })}
        </div>
        {d.perfiles.some(p => p.estado === "revocado") && (
          <div style={{ marginTop: 12, fontSize: 12, color: "var(--text-3)" }}>
            Cuentas sin acceso: {d.perfiles.filter(p => p.estado === "revocado").map(p => (
              <button key={p.id} className="adm-chip" style={{ marginLeft: 6, color: "var(--text-2)" }} onClick={() => accion({ accion: "perfil", id: p.id, estado: "aprobado" }, p.nombre + " vuelve a estar activa")}>↺ {p.nombre}</button>))}
          </div>)}
      </Seccion>

      {soyDueno && <PublicarVersion toast={toast} />}

      <Seccion ref={refs.ip} titulo={"IPs bloqueadas" + (ipsActivas.length ? " · " + ipsActivas.length : "")} extra={
        <span style={{ display: "flex", gap: 6 }}>
          <input value={ipNueva} onChange={e => setIpNueva(e.target.value)} placeholder="Bloquear una IP…" style={{ fontSize: 12, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card-2)", color: "var(--text)", width: 150 }} />
          <button className="adm-btn" disabled={!ipNueva.trim()} style={{ color: "var(--red)" }} onClick={() => { accion({ accion: "ip", ip: ipNueva.trim(), que: "bloquear" }, "IP bloqueada", "¿Bloquear " + ipNueva.trim() + "?"); setIpNueva(""); }}>Bloquear</button>
        </span>}>
        {!ipsActivas.length && <div style={{ fontSize: 13, color: "var(--text-3)" }}>Ninguna. Si alguien intenta colarse (firma falsa, equipo inventado o muchos intentos seguidos), su IP se bloquea sola y aparece aquí para que la revises.</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {ipsActivas.map(i => (
            <div key={i.ip} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "10px 12px", borderRadius: 10,
              background: i.revisado ? "var(--card-2)" : "rgba(220,38,38,.07)", border: "1px solid " + (i.revisado ? "var(--border)" : "rgba(220,38,38,.45)") }}>
              <span style={{ fontSize: 18 }}>⛔</span>
              <div style={{ flex: "1 1 260px" }}>
                <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "ui-monospace,Consolas,monospace" }}>{i.ip}
                  {!i.revisado && <span className="adm-chip" style={{ marginLeft: 8, color: "var(--red)", borderColor: "var(--red)", padding: "0 8px", fontSize: 10.5, fontFamily: "inherit" }}>POR REVISAR</span>}</div>
                <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 3 }}>
                  {i.motivo}{[i.ciudad, i.pais].filter(Boolean).length ? " · " + [i.ciudad, i.pais].filter(Boolean).join(", ") : ""} · {i.automatico ? "automático" : "a mano"} · {hace(i.creado, ahora)}{i.user_agent ? " · " + tipo(i.user_agent).txt : ""}</div>
              </div>
              <button className="adm-btn" style={{ color: "var(--green)" }} onClick={() => accion({ accion: "ip", ip: i.ip, que: "desbloquear" }, "IP desbloqueada", "¿Desbloquear " + i.ip + "?")}>Desbloquear</button>
              {!i.revisado && <button className="adm-btn" style={{ color: "var(--text)" }} onClick={() => accion({ accion: "ip", ip: i.ip, que: "mantener" }, "Bloqueo revisado: se queda")}>Bien bloqueada</button>}
            </div>))}
        </div>
      </Seccion>

      <Seccion ref={refs.reg} titulo="Registro de accesos" extra={
        <span style={{ display: "flex", gap: 6 }}>
          {[["todo", "Todo"], ["rechazos", "Rechazos"], ["solicitudes", "Solicitudes"], ["inicios", "Inicios"]].map(([k, t]) => (
            <button key={k} className="adm-chip" onClick={() => setFiltro(k)} style={{ color: filtro === k ? "#000" : "var(--text-2)", background: filtro === k ? "var(--gold)" : "transparent", borderColor: filtro === k ? "var(--gold)" : "var(--border)" }}>{t}</button>))}
        </span>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 420, overflowY: "auto" }}>
          {filtrados.map(a => (
            <div key={a.id} style={{ display: "grid", gridTemplateColumns: "92px 86px 1fr", gap: 10, fontSize: 12, padding: "5px 4px", borderBottom: "1px solid var(--border)", alignItems: "baseline" }}>
              <span style={{ color: "var(--text-3)" }}>{hace(a.fecha, ahora)}</span>
              <span style={{ color: RES[a.resultado] || "var(--text-2)", fontWeight: 700 }}>{a.resultado}</span>
              <span style={{ color: "var(--text-2)", minWidth: 0 }}>
                <b style={{ color: "var(--text)" }}>{a.accion}</b>{a.nombre ? " · " + a.nombre : ""}{a.detalle ? " · " + a.detalle : ""}
                <span style={{ color: "var(--text-3)" }}>{a.ip ? " · " + a.ip : ""}{a.ciudad || a.pais ? " · " + [a.ciudad, a.pais].filter(Boolean).join(", ") : ""}</span>
              </span>
            </div>))}
          {!filtrados.length && <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>Nada que mostrar.</div>}
        </div>
      </Seccion>

      <div style={{ fontSize: 11.5, color: "var(--text-3)", lineHeight: 1.6 }}>
        Cómo funciona: cada equipo tiene una llave propia que no se puede copiar y cada cuenta de Google es un perfil. Un equipo solo entra en las cuentas que le apruebes.
        El portátil manda siempre; los administradores que tú nombres pueden aprobar y bloquear, pero no nombrar a otros. La IP de casa nunca se bloquea sola (sale como «alerta» en el registro).
      </div>
    </div>);
}

/** Las solicitudes pendientes: permisos pendientes de equipos que no están revocados. */
function solicitudesDe(d) {
  const out = [];
  (d.dispositivos || []).forEach(e => {
    if (e.estado === "revocado") return;
    e.permisos.filter(p => p.estado === "pendiente").forEach(p => {
      const pf = (d.perfiles || []).find(x => x.id === p.perfil_id);
      if (pf && pf.estado !== "revocado") out.push({ d: e, p: { id: p.perfil_id }, creado: p.creado });
    });
  });
  return out.sort((a, b) => new Date(b.creado) - new Date(a.creado));
}

/** Para la barra: cuántas solicitudes esperan (se consulta cada 20 s en los equipos administradores). */
export function useSolicitudesPendientes(activo) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    const mirar = async () => {
      if (document.visibilityState !== "visible") return;
      try { const j = await seguridadApi(YT_BACKEND, await cloudToken(), "GET"); if (vivo) setN(solicitudesDe(j).length); } catch (e) {}
    };
    mirar();
    const t = setInterval(mirar, 20000);
    return () => { vivo = false; clearInterval(t); };
  }, [activo]);
  return n;
}
