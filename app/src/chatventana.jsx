import React from "react";
const { useState, useEffect, useRef } = React;
import { useToast } from "./base";
import { boton } from "./clon";
import { RandomChatView } from "./randomchat";

/* ======================= VENTANA DEL RANDOMCHAT (2/11/2026) =======================
   Él: "que el apartado de RandomChat se haga ventana como RandomEditor y poder ponerme el chat en directo en la
   parte que yo quiera de la pantalla", y "si puedes, borrar mensajes, silenciar y banear desde el apartado".
   Ventana propia (electron/main.cjs: abrirChat) que se mueve y se encoge donde quiera, con «siempre encima» y
   opacidad. Pestaña «Chat en directo»: los mensajes tal cual llegan al overlay, con Borrar / Silenciar / Banear
   (en YouTube, con la API oficial y la sesión de Studio: RandomChat/src/moderacion.js) y «Quitar del overlay».
   Pestaña «Ajustes»: el apartado RandomChat de siempre (encender, contador, overlays, panel). */

const PUERTO = Number(new URLSearchParams(location.search).get("puerto")) || 7470;     // (otro solo en las pruebas)
const URL_CHAT = `http://localhost:${PUERTO}`;
const WS_CHAT = `ws://127.0.0.1:${PUERTO}`;
const MAX = 400;
const PALETA = ["#ff5a5a", "#ff9f1c", "#ffd23f", "#7bd389", "#3ddbd9", "#4ea8ff", "#a78bfa", "#f472b6", "#ff7aa2", "#9be564", "#5ce1e6", "#ffb3c6"];
const ROL = { owner: "#ffd600", moderator: "#5e84f1", member: "#2ba640" };
const TIEMPO = { 60: "1 min", 300: "5 min", 600: "10 min", 1800: "30 min", 3600: "1 hora", 86400: "24 horas" };
const ls = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
const abs = u => !u ? null : /^(https?:|data:)/.test(u) ? u : `${URL_CHAT}/${String(u).replace(/^\//, "")}`;
function colorDe(a) {
  if (a.color) return a.color;
  for (const r of ["owner", "moderator", "member"]) if ((a.roles || []).includes(r)) return ROL[r];
  let h = 0; for (const c of String(a.id || a.name)) h = (h * 31 + c.codePointAt(0)) >>> 0;
  return PALETA[h % PALETA.length];
}
const hora = t => { const d = new Date(Number(t) || Date.now()); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`; };
const quedan = ms => { const s = Math.max(0, Math.round(ms / 1000)); return s >= 3600 ? `${Math.round(s / 3600)} h` : s >= 60 ? `${Math.round(s / 60)} min` : `${s} s`; };

function Partes({ parts, alto }) {
  return (parts || []).map((p, i) => p.type === "text" ? <span key={i}>{p.text}</span>
    : p.url ? <img key={i} src={abs(p.url)} alt={p.alt || p.text || ""} title={p.alt || ""} style={{ height: alto, verticalAlign: "-0.25em", margin: "0 1px" }}
        onError={ev => { ev.currentTarget.replaceWith(document.createTextNode(p.text || p.alt || "")); }}/>
    : <span key={i}>{p.text || p.alt}</span>);
}

/* Los mensajes del chat por el mismo WebSocket que los overlays (solo los lee: la moderación va por Studio) */
function useMensajes() {
  const [msgs, setMsgs] = useState([]);
  const [conectado, setConectado] = useState(false);
  useEffect(() => {
    let ws = null, vivo = true, t = null;
    const abrir = () => {
      if (!vivo) return;
      try { ws = new WebSocket(WS_CHAT); } catch (e) { t = setTimeout(abrir, 3000); return; }
      ws.onopen = () => setConectado(true);
      ws.onclose = () => { setConectado(false); if (vivo) t = setTimeout(abrir, 3000); };
      ws.onerror = () => {};
      ws.onmessage = ev => {
        let d; try { d = JSON.parse(ev.data); } catch (e) { return; }
        if (d.type === "history") setMsgs((d.messages || []).slice(-MAX));
        else if (d.type === "message") setMsgs(l => [...l, d.message].slice(-MAX));
        else if (d.type === "delete") setMsgs(l => l.filter(m => !(m.platform === d.platform && m.platformId === d.platformId)));
        else if (d.type === "deleteByAuthor") setMsgs(l => l.filter(m => !(m.platform === d.platform && m.author.id === d.authorId)));
        else if (d.type === "clear") setMsgs(l => d.platform ? l.filter(m => m.platform !== d.platform) : []);
      };
    };
    abrir();
    return () => { vivo = false; clearTimeout(t); try { ws && ws.close(); } catch (e) {} };
  }, []);
  return [msgs, conectado];
}

function Mensaje({ m, tam, puede, onAccion, ocupado }) {
  const [hover, setHover] = useState(false);
  const [menu, setMenu] = useState("");          // "" | "silenciar" | "banear"
  const a = m.author || {};
  const roles = a.roles || [];
  const intocable = roles.includes("owner") || roles.includes("moderator") || roles.includes("bot");
  const mini = { padding: "3px 7px", fontSize: 11.5, borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-2)", cursor: "pointer", whiteSpace: "nowrap" };
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => { setHover(false); setMenu(""); }}
      style={{ position: "relative", display: "flex", gap: 8, padding: "5px 10px", alignItems: "flex-start", background: hover ? "rgba(255,255,255,0.04)" : "transparent", opacity: ocupado ? 0.5 : 1 }}>
      {a.avatar ? <img src={abs(a.avatar)} alt="" style={{ width: tam * 1.7, height: tam * 1.7, borderRadius: "50%", flex: "none", marginTop: 1 }} onError={ev => { ev.currentTarget.style.visibility = "hidden"; }}/>
        : <span style={{ width: tam * 1.7, height: tam * 1.7, borderRadius: "50%", flex: "none", background: colorDe(a), opacity: 0.6 }}/>}
      <div style={{ fontSize: tam, lineHeight: 1.35, minWidth: 0, overflowWrap: "anywhere" }}>
        <span style={{ fontSize: tam * 0.75, color: "var(--text-3)", marginRight: 6 }}>{hora(m.timestamp)}</span>
        <b style={{ color: colorDe(a), marginRight: 6 }}>
          {roles.includes("owner") ? "👑 " : roles.includes("moderator") ? "🔧 " : ""}<Partes parts={a.nameParts || [{ type: "text", text: a.name }]} alto={tam * 1.1}/>
          {/* (4/11) el verificado de YouTube, como en YouTube: un ✓ gris en un círculo detrás del nombre */}
          {roles.includes("verified") && <span title="Canal verificado" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: tam * 0.95, height: tam * 0.95, borderRadius: "50%", background: "#AAAAAA", color: "#0F0F0F", fontSize: tam * 0.62,
            fontWeight: 900, marginLeft: 4, verticalAlign: "-0.12em" }}>✓</span>}
          {a.memberBadge && a.memberBadge.url && <img src={abs(a.memberBadge.url)} alt="" title={a.memberBadge.label || "Miembro"} style={{ height: tam, verticalAlign: "-0.15em", marginLeft: 4 }}/>}
        </b>
        {m.superchat && <span style={{ fontSize: tam * 0.8, padding: "1px 6px", borderRadius: 6, background: "#f59e0b", color: "#000", fontWeight: 700, marginRight: 6 }}>{m.superchat.amount}</span>}
        <span style={{ color: "var(--text)" }}><Partes parts={m.parts} alto={tam * 1.25}/></span>
      </div>
      {hover && !ocupado && <div style={{ position: "absolute", right: 8, top: 2, display: "flex", gap: 4, background: "var(--bg-2)", padding: 3, borderRadius: 9, border: "1px solid var(--border)", zIndex: 2, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: "92%" }}>
        {!menu && <>
          {!roles.includes("bot") && <button style={mini} disabled={!puede} title={puede ? "Lo borra en YouTube (y del overlay)" : "Hace falta el directo conectado y la sesión de YouTube de Studio"} onClick={() => onAccion({ accion: "borrar", m })}>🗑 Borrar</button>}
          {!intocable && <button style={mini} disabled={!puede} onClick={() => setMenu("silenciar")}>🔇 Silenciar</button>}
          {!intocable && <button style={{ ...mini, color: "var(--red)", borderColor: "rgba(248,113,113,0.45)" }} disabled={!puede} onClick={() => setMenu("banear")}>⛔ Banear</button>}
          <button style={mini} title="Solo lo quita del overlay de OBS: en YouTube sigue" onClick={() => onAccion({ accion: "ocultar", m })}>👁 Quitar del overlay</button>
        </>}
        {menu === "silenciar" && <>
          <span style={{ ...mini, border: "none", cursor: "default" }}>Silenciar a {a.name}:</span>
          {[60, 300, 600, 1800, 3600, 86400].map(s => <button key={s} style={mini} onClick={() => { setMenu(""); onAccion({ accion: "silenciar", m, segundos: s }); }}>{TIEMPO[s]}</button>)}
          <button style={mini} onClick={() => setMenu("")}>✕</button>
        </>}
        {menu === "banear" && <>
          <span style={{ ...mini, border: "none", cursor: "default" }}>¿Banear a {a.name} de tu chat para siempre?</span>
          <button style={{ ...mini, background: "var(--red)", color: "#fff", borderColor: "var(--red)" }} onClick={() => { setMenu(""); onAccion({ accion: "banear", m }); }}>Sí, banear</button>
          <button style={mini} onClick={() => setMenu("")}>Cancelar</button>
        </>}
      </div>}
    </div>);
}

function ChatEnDirecto({ toast, compacto }) {
  const [msgs, conectado] = useMensajes();
  const [mod, setMod] = useState(null);          // { sesion, directo, baneos }
  const [ocupados, setOcupados] = useState({});
  const [tam, setTam] = useState(() => Number(ls("rds_chatwin_tam", "15")) || 15);
  const [abajo, setAbajo] = useState(true);
  const [verBaneos, setVerBaneos] = useState(false);
  const [encendiendo, setEncendiendo] = useState(false);
  const caja = useRef(null);
  useEffect(() => { lsSet("rds_chatwin_tam", String(tam)); }, [tam]);
  const leerMod = () => window.studioFS.chatModeracion().then(r => setMod(r && !r.error ? r : null)).catch(() => setMod(null));
  useEffect(() => { leerMod(); const t = setInterval(leerMod, 5000); return () => clearInterval(t); }, []);
  // Pegado abajo mientras no subas a leer; al subir, se queda donde estás y sale «↓ mensajes nuevos»
  useEffect(() => { const c = caja.current; if (c && abajo) c.scrollTop = c.scrollHeight; }, [msgs, abajo, tam]);
  const alMover = () => { const c = caja.current; if (c) setAbajo(c.scrollHeight - c.scrollTop - c.clientHeight < 40); };

  const puede = !!(mod && mod.sesion && mod.directo);
  const accion = async ({ accion, m, segundos, banId }) => {
    const k = m ? m.id : banId;
    setOcupados(o => ({ ...o, [k]: true }));
    try {
      const r = await window.studioFS.chatModerar({ accion, id: m && m.id, autor: m && { id: m.author.id, name: m.author.name }, platform: m && m.platform, segundos, banId });
      toast && toast(r.error ? "✕ " + r.error : r.texto || "Hecho", r.error ? "red" : "gold");
      if (!r.error && (accion === "silenciar" || accion === "banear" || accion === "quitar")) leerMod();
    } catch (e) { toast && toast("✕ " + e.message, "red"); }
    finally { setOcupados(o => { const n = { ...o }; delete n[k]; return n; }); }
  };

  const baneos = (mod && mod.baneos) || [];
  const aviso = !conectado ? ""
    : !mod ? "" : !mod.sesion ? "Para moderar: conecta YouTube en Studio con la cuenta del canal (pestaña YouTube)"
    : !mod.directo ? "Sin directo conectado: borrar, silenciar y banear funcionan cuando empiece el directo" : "";
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {!compacto && <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderBottom: "1px solid var(--border)", fontSize: 12.5, flexWrap: "wrap" }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: !conectado ? "var(--text-3)" : puede ? "#4ade80" : "#fbbf24" }}/>
        <span style={{ color: "var(--text-2)" }}>{!conectado ? "Apagado" : puede ? "En directo · puedes moderar" : "Conectado"}</span>
        {aviso && <span style={{ color: "#fbbf24" }}>{aviso}</span>}
        <span style={{ marginLeft: "auto", display: "flex", gap: 4, alignItems: "center" }}>
          {baneos.length > 0 && <button onClick={() => setVerBaneos(v => !v)} style={{ ...boton(verBaneos), padding: "3px 9px", fontSize: 12 }}>🔇 {baneos.length}</button>}
          <button onClick={() => setTam(t => Math.max(10, t - 1))} style={{ ...boton(false), padding: "3px 9px", fontSize: 12 }} title="Letra más pequeña">A−</button>
          <button onClick={() => setTam(t => Math.min(30, t + 1))} style={{ ...boton(false), padding: "3px 9px", fontSize: 12 }} title="Letra más grande">A+</button>
        </span>
      </div>}
      {verBaneos && !compacto && <div style={{ padding: "6px 10px", borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 4, maxHeight: 180, overflow: "auto" }}>
        {baneos.map(b => <div key={b.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5 }}>
          <b>{b.nombre}</b><span style={{ color: "var(--text-3)" }}>{b.tipo === "permanent" ? "baneado" : `silenciado · le quedan ${quedan(b.hasta - Date.now())}`}</span>
          <button disabled={!!ocupados[b.id]} onClick={() => accion({ accion: "quitar", banId: b.id })} style={{ ...boton(false), padding: "2px 8px", fontSize: 11.5, marginLeft: "auto" }}>Quitar</button>
        </div>)}
      </div>}
      <div ref={caja} onScroll={alMover} style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", padding: "4px 0" }}>
        {msgs.length === 0 && <div style={{ padding: 20, color: "var(--text-3)", fontSize: 13, textAlign: "center", display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
          {conectado ? "Aún no hay mensajes" : <>El RandomChat está apagado
            <button disabled={encendiendo} onClick={async () => { setEncendiendo(true); try { const r = await window.studioFS.chatEncender(); if (r && r.error) toast && toast("✕ " + r.error, "red"); } finally { setEncendiendo(false); } }}
              style={{ ...boton(true), padding: "6px 16px" }}>{encendiendo ? "Encendiendo…" : "Encender el chat"}</button></>}
        </div>}
        {msgs.map(m => <Mensaje key={m.id} m={m} tam={tam} puede={puede || /^(sim-|test)/.test(String(m.platformId))} ocupado={!!ocupados[m.id]} onAccion={accion}/>)}
      </div>
      {!abajo && <button onClick={() => setAbajo(true)} style={{ position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)", ...boton(true), padding: "5px 14px", fontSize: 12.5, boxShadow: "0 4px 14px rgba(0,0,0,0.5)" }}>↓ Mensajes nuevos</button>}
    </div>);
}

export function ChatApp() {
  const [toast, toastNode] = useToast();
  const [pestana, setPestana] = useState(() => ls("rds_chatwin_pestana", "chat"));
  const [compacto, setCompacto] = useState(() => ls("rds_chatwin_compacto", "0") === "1");
  const [encima, setEncima] = useState(false);
  const [opacidad, setOpacidad] = useState(1);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "dark"); document.body.style.background = "#0e0e0e"; document.title = "RandomChat";
    window.studioFS.chatVentanaEstado().then(r => { setEncima(!!r.encima); setOpacidad(r.opacidad || 1); }).catch(() => {});
  }, []);
  useEffect(() => { lsSet("rds_chatwin_pestana", pestana); }, [pestana]);
  useEffect(() => { lsSet("rds_chatwin_compacto", compacto ? "1" : "0"); }, [compacto]);
  const ajustar = op => window.studioFS.chatVentanaAjustes(op).then(r => { if (r && !r.error) { if ("encima" in r) setEncima(r.encima); if ("opacidad" in r) setOpacidad(r.opacidad); } });
  const tab = (id, txt) => <button onClick={() => setPestana(id)} style={{ ...boton(pestana === id), padding: "5px 12px", fontSize: 12.5 }}>{txt}</button>;
  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)", color: "var(--text)", position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: compacto ? "3px 6px" : "7px 10px", borderBottom: "1px solid var(--border)", background: "var(--bg-2)", flexWrap: "wrap" }}>
        {!compacto && <>{tab("chat", "💬 Chat en directo")}{tab("ajustes", "⚙️ Ajustes")}</>}
        <span style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
          {!compacto && <label title="Transparencia de la ventana" style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--text-3)" }}>
            ◐<input type="range" min={0.3} max={1} step={0.05} value={opacidad} onChange={ev => ajustar({ opacidad: Number(ev.target.value) })} style={{ width: 80 }}/></label>}
          <button onClick={() => ajustar({ encima: !encima })} title="La ventana se queda por encima de todo (también del juego)"
            style={{ ...boton(encima), padding: compacto ? "2px 7px" : "5px 10px", fontSize: 12 }}>📌{compacto ? "" : " Siempre encima"}</button>
          <button onClick={() => { setCompacto(c => !c); setPestana("chat"); }} title={compacto ? "Ver los controles" : "Solo el chat, sin controles"}
            style={{ ...boton(false), padding: compacto ? "2px 7px" : "5px 10px", fontSize: 12 }}>{compacto ? "⤢" : "⤡ Solo el chat"}</button>
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: pestana === "ajustes" && !compacto ? "auto" : "hidden", padding: pestana === "ajustes" && !compacto ? "16px 20px" : 0, position: "relative" }}>
        {pestana === "ajustes" && !compacto ? <RandomChatView toast={toast} enVentana/> : <ChatEnDirecto toast={toast} compacto={compacto}/>}
      </div>
      {toastNode}
    </div>);
}
