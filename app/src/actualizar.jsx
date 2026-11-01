import React from "react";
const { useState, useEffect } = React;
import { APP_VERSION } from "./base";
import { YT_BACKEND } from "./datos";
import { cabecerasEquipo } from "./seguridad";
import { perfilActual } from "./perfiles";

/* ============================ ACTUALIZACIONES (v3.32) ============================
 * El portátil publica su versión (Administración → «Publicar esta versión»). Los demás equipos de escritorio lo
 * ven al arrancar (y cada 30 min) con un aviso: «Hay una versión nueva · Actualizar ahora». Se baja solo el código
 * (~13 MB), se comprueba que es idéntico al publicado y la app se reinicia sola.
 */
const SF = () => window.studioFS;
const num = (v) => String(v || "0.0.0").split(".").map(Number).reduce((a, n) => a * 1000 + (n || 0), 0);

export async function actualizacionApi(metodo, cuerpo) {
  const r = await fetch(YT_BACKEND + "/api/actualizacion", {
    method: metodo,
    headers: { "Content-Type": "application/json", ...(await cabecerasEquipo(metodo, "/api/actualizacion")) },
    body: metodo === "GET" ? undefined : JSON.stringify(cuerpo || {}),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.success) throw new Error(j.error || ("Error " + r.status));
  return j;
}

/** v3.34.1: el portátil publica su versión NADA MÁS ABRIRSE (también en la pantalla de cuentas, sin entrar en ningún perfil):
 * así cada versión nueva llega al ordenador aunque se instale con la app cerrada. En los demás equipos no hace nada. */
let _publicando = false;
export async function publicarSiToca() {
  if (_publicando || !SF() || !SF().actInfo) return;
  _publicando = true;
  try {
    const [v, yo] = await Promise.all([actualizacionApi("GET"), SF().actInfo()]);
    const pend = await pendientePublicable(v);
    if (pend) await publicarVersion(pend, "", "pendiente");
    else if (yo.ok && yo.empaquetada && (!v.version || num(yo.version) > num(v.version))) await publicarVersion(yo, "");
  } catch (e) {} finally { _publicando = false; }
}
/** v3.40.3: la versión preparada en el portátil (npm run instalar con la app abierta), si es más nueva que la publicada:
 * se publica ya para todos los equipos, sin esperar a que el portátil pulse «Actualizar ahora». */
async function pendientePublicable(v) {
  if (!SF().actInfoPendiente) return null;
  try { const p = await SF().actInfoPendiente(); return p.ok && (!v.version || num(p.version) > num(v.version)) ? p : null; } catch (e) { return null; }
}

/** Aviso arriba en la app cuando hay una versión más nueva publicada por el portátil. */
export function AvisoActualizacion() {
  const [nueva, setNueva] = useState(null);
  const [estado, setEstado] = useState("");
  const [oculto, setOculto] = useState(false);
  useEffect(() => {
    if (!SF() || !SF().actInstalar) return;
    const mirar = async () => {
      // 1) el portátil: versión ya preparada al lado (npm run instalar con la app abierta); además se publica ya para los demás
      try {
        const l = await SF().actLocal();
        if (l.ok && num(l.version) > num(APP_VERSION)) { setNueva({ version: l.version, local: true }); publicarSiToca(); return; }
      } catch (e) {}
      try {
        const [v, yo] = await Promise.all([actualizacionApi("GET"), SF().actInfo()]);
        // 2) el portátil publica solo su versión si es más nueva que la publicada (el servidor solo se lo deja al dueño)
        if (yo.ok && yo.empaquetada && (!v.version || num(yo.version) > num(v.version))) { publicarVersion(yo, "").catch(() => {}); return; }
        // 3) los demás equipos: hay una más nueva publicada por el portátil
        // (y nunca si es justo el mismo código que ya lleva este equipo)
        if (v.version && num(v.version) > num(APP_VERSION) && num(v.version) > num(yo.version) && v.sha256 !== yo.sha256) setNueva({ ...v, otroElectron: v.electron && yo.electron && v.electron.split(".")[0] !== yo.electron.split(".")[0] });
        else setNueva(null);
      } catch (e) {}
    };
    mirar();
    // cada minuto, al volver a la ventana y al momento si aparece una versión preparada en el portátil
    const t = setInterval(mirar, 60 * 1000);
    const alFoco = () => mirar();
    window.addEventListener("focus", alFoco);
    const off = SF().onActCambio ? SF().onActCambio(mirar) : null;
    return () => { clearInterval(t); window.removeEventListener("focus", alFoco); off && off(); };
  }, []);
  if (!nueva || oculto) return null;
  const instalar = async () => {
    setEstado(nueva.local ? "Guardando todo y reiniciando…" : "Bajando la versión " + nueva.version + " (unos segundos)… luego se reinicia sola");
    try { if (perfilActual()) localStorage.setItem("rs_perfil_volver", localStorage.getItem("rs_perfil") || ""); } catch (e) {}
    try {
      if (nueva.local) await SF().actLocalAplicar();
      else { const v = await actualizacionApi("GET"); await SF().actInstalar(v.url, v.sha256, v.version); }   // enlace recién firmado
    } catch (e) { setEstado("❌ No se pudo: " + e.message); }
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "10px 16px", background: "linear-gradient(90deg,rgba(96,165,250,.16),rgba(212,175,55,.10))",
      borderBottom: "1px solid rgba(96,165,250,.35)", fontSize: 13 }}>
      <span style={{ fontSize: 16 }}>⬆️</span>
      <span><b>Hay una versión nueva de RandomStudio ({nueva.version})</b>{nueva.notas ? " · " + nueva.notas : ""}</span>
      <span style={{ flex: 1 }} />
      {nueva.otroElectron
        ? <span style={{ color: "#F59E0B", fontWeight: 600 }}>Esta necesita el paquete completo: pídeselo al portátil.</span>
        : estado ? <><span style={{ fontWeight: 600 }}>{estado}</span>
            {estado.startsWith("❌") && <button onClick={instalar} className="grad-gold" style={{ fontSize: 12.5, fontWeight: 700, color: "#000", borderRadius: 9, padding: "7px 14px" }}>Reintentar</button>}</>
        : <button onClick={instalar} className="grad-gold" style={{ fontSize: 12.5, fontWeight: 700, color: "#000", borderRadius: 9, padding: "7px 14px" }}>Actualizar ahora</button>}
      {!estado && <button onClick={() => setOculto(true)} style={{ fontSize: 12, color: "var(--text-3)" }}>Luego</button>}
    </div>);
}

/** Sube el código de esta versión y la deja publicada (solo lo acepta el servidor si este equipo es el portátil). */
async function publicarVersion(info, notas, cual) {
  const datos = { version: info.version, sha256: info.sha256, tam: info.tam, electron: info.electron, notas: notas || "" };
  const p = await actualizacionApi("POST", { accion: "preparar", ...datos });
  await SF().actSubir(p.url, cual);
  await actualizacionApi("POST", { accion: "confirmar", ...datos });
}

/** Administración (solo el portátil): publicar la versión instalada para que los demás se actualicen. */
export function PublicarVersion({ toast }) {
  const [info, setInfo] = useState(null);
  const [publicada, setPublicada] = useState(null);
  const [notas, setNotas] = useState("");
  const [haciendo, setHaciendo] = useState(false);
  const cargar = async () => {
    try { setInfo(await SF().actInfo()); } catch (e) {}
    try { setPublicada(await actualizacionApi("GET")); } catch (e) { setPublicada({ error: e.message }); }
  };
  useEffect(() => { if (SF() && SF().actInfo) cargar(); }, []);
  if (!SF() || !SF().actInfo) return null;
  const yaEsta = publicada && publicada.version && info && publicada.sha256 === info.sha256;
  const publicar = async () => {
    if (!info || !info.sha256) return;
    setHaciendo(true);
    try {
      await publicarVersion(info, notas.trim());
      toast("⬆️ Versión " + info.version + " publicada: los demás equipos verán el aviso");
      setNotas(""); cargar();
    } catch (e) { toast("❌ " + e.message); }
    setHaciendo(false);
  };
  return (
    <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 14, padding: 18 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--gold)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>Actualizar los demás equipos</div>
      <div style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.55 }}>
        Este portátil tiene la <b style={{ color: "var(--text)" }}>{info ? info.version : "…"}</b>. Publicada para los demás: <b style={{ color: "var(--text)" }}>{publicada && publicada.version ? publicada.version : "ninguna"}</b>
        {yaEsta && <span style={{ color: "var(--green)", fontWeight: 700 }}> · al día</span>}
      </div>
      {!yaEsta && info && info.empaquetada && (
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <input value={notas} onChange={e => setNotas(e.target.value)} placeholder="(opcional) Qué trae de nuevo"
            style={{ flex: "1 1 240px", fontSize: 12.5, padding: "8px 10px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--card-2)", color: "var(--text)" }} />
          <button disabled={haciendo} onClick={publicar} className="grad-gold" style={{ fontSize: 12.5, fontWeight: 700, color: "#000", borderRadius: 9, padding: "8px 14px", opacity: haciendo ? .6 : 1 }}>
            {haciendo ? "Publicando…" : "Publicar esta versión"}</button>
        </div>)}
      <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 8 }}>Los demás equipos aprobados verán «Hay una versión nueva · Actualizar ahora» y se reiniciarán solos. El archivo se comprueba antes de instalarlo.</div>
    </div>);
}
