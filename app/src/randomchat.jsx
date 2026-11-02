import React from "react";
const { useState, useEffect, useRef } = React;
import { boton } from "./clon";
import { YT_BACKEND, YT_TOKEN_KEY } from "./datos";
import { almacenDe } from "./perfiles";

/* ============================ RANDOMCHAT (v3.6) ============================
   Él: "implementar el RandomChat dentro de RandomStudio y poder gestionarlo todo desde mi ejecutable,
   encendiendo y apagando el servidor". RandomChat (E:\A RdeRandom\RandomChat) es su chat unificado +
   alertas para OBS: un servidor en 127.0.0.1:7470 con su panel y sus overlays. Aquí se enciende y apaga
   (el mismo arranque que su lanzador de OBS), se ve su estado y su panel, y se le pasa la sesión de
   YouTube de Studio para que lea los nuevos suscriptores sin un cliente de Google propio.
   El chat sigue funcionando aunque se cierre Studio; se apaga con el botón o solo, 3 min después de
   terminar el directo en OBS. */

const PUERTO = 7470;
const URL_CHAT = `http://localhost:${PUERTO}`;
const ls = (k, d) => { try { const v = localStorage.getItem(k); return v===null ? d : v; } catch(e){ return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch(e){} };
const COLOR = { connected:"#4ade80", waiting:"#fbbf24", searching:"#fbbf24", error:"#f87171", off:"var(--text-3)" };
const NOMBRE = { youtube:"Chat de YouTube", youtubeSubs:"Nuevos suscriptores", streamelements:"StreamElements", twitch:"Twitch", tiktok:"TikTok" };
const punto = c => <span style={{width:9,height:9,borderRadius:"50%",background:c,flex:"none",display:"inline-block"}}/>;
const desde = ms => { const s = Math.round((Date.now()-ms)/1000); const h=Math.floor(s/3600), m=Math.floor(s/60)%60; return h ? `${h} h ${m} min` : m ? `${m} min` : `${s} s`; };
const mmss = s => `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;
const tarjeta = {padding:"14px 16px",border:"1px solid var(--border)",borderRadius:12,background:"var(--bg-2)",display:"flex",flexDirection:"column",gap:10};

/* La sesión de YouTube de Studio pasa al chat (solo en su memoria) cuando el chat está encendido y no la tiene.
   Una vez por servidor (pid): si el chat la rechaza (caducada) no se insiste hasta que se reinicie. */
let sesionEnviadaA = 0;
// 2/11: la sesión de YouTube del perfil del CHAT (el de los directos, por defecto RDeRandom), abras el perfil que abras
// (antes iba la del perfil abierto: con RandomHistorias abierto, el chat leía los suscriptores de RandomHistorias)
function tokensChat(e) { try { return JSON.parse(almacenDe((e && e.perfilChat) || "rderandom").get(YT_TOKEN_KEY) || "null"); } catch(x){ return null; } }
const chatConYoutube = e => { const t = tokensChat(e); return !!(t && (t.access_token || t.refresh_token)); };
let renovadaA = 0;
function pasarSesion(e, toast) {
  if(!e || !e.encendido || !e.nuestro || sesionEnviadaA===e.pid) return;
  // la primera vez en cada arranque de Studio se vuelve a mandar aunque el chat ya tenga una (podía ser la de otro canal)
  if(e.sesionYoutube && renovadaA===e.pid) return;
  renovadaA = e.pid;
  const t = tokensChat(e);
  if(!t || !t.refresh_token) return;
  sesionEnviadaA = e.pid;
  window.studioFS.chatSesion(t.refresh_token, YT_BACKEND).then(r=>{ if(r.error) toast && toast("RandomChat: "+r.error); });
}
/* v3.8.2: se llama desde Principal (siempre montado), así el chat recibe la sesión aunque no se abra este
   apartado (antes solo se pasaba con RandomChat abierto y los suscriptores no se leían). */
export function useSesionChat(toast) {
  useEffect(()=>{
    if(!(window.studioFS && window.studioFS.chatEstado)) return;
    const mirar = () => window.studioFS.chatEstado().then(e=>pasarSesion(e, toast)).catch(()=>{});
    mirar(); const t = setInterval(mirar, 20000); return ()=>clearInterval(t);
  },[]);
}

/* v3.23, él: "reproducir la ventana del contador de suscriptores de YouTube Studio, con el contador solo, y poder
   añadir texto para poner la meta de suscriptores". La ventana la abre Studio (electron/contador.cjs) con su estilo;
   aquí se elige el texto de la meta y el tamaño, y se cambian en directo. */
function Contador({ toast }) {
  const [op, setOp] = useState(null);
  const [abierta, setAbierta] = useState(false);
  const [vivo, setVivo] = useState(null);       // { n, chat, enStudio, visible }: lo que lee la ventana ahora
  useEffect(()=>{ window.studioFS.contadorEstado().then(r=>{ setOp(r.op); setAbierta(r.abierta); setVivo(r); }).catch(()=>{}); },[]);
  // 2/11: el lector arranca solo con el chat encendido: su estado se mira siempre, no solo con la ventana abierta
  useEffect(()=>{ const t = setInterval(()=>window.studioFS.contadorEstado().then(r=>{ setAbierta(r.abierta); setVivo(r); }).catch(()=>{}), 2000); return ()=>clearInterval(t); },[]);
  const cambiar = patch => { const n = {...op, ...patch}; setOp(n); window.studioFS.contadorMeta(n).then(r=>setAbierta(r.abierta)).catch(()=>{}); };
  if(!op) return null;
  const fila = {display:"flex",alignItems:"center",gap:10,fontSize:13,flexWrap:"wrap"};
  return (
    <div style={tarjeta}>
      <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        <span style={{fontWeight:700,fontSize:14}}>Contador de suscriptores</span>
        <span style={{fontSize:12.5,color:"var(--text-3)"}}>el de YouTube Studio en tiempo real, solo el número, con tu estilo</span>
        <span style={{marginLeft:"auto",display:"flex",gap:8}}>
          {abierta && vivo && vivo.visible && window.studioFS.contadorVentana && <button onClick={()=>window.studioFS.contadorVentana(false)} style={boton(false)} title="Sigue leyendo el número escondida">Esconder la ventana</button>}
          <button onClick={async()=>{ const r = await window.studioFS.contadorAbrir(op); if(r.ok){ setAbierta(true); toast && toast("Ventana del contador abierta"); } }} style={boton(true)}>
          {abierta ? "Mostrar la ventana" : "Abrir la ventana del contador"}</button></span>
      </div>
      {vivo && <div style={{...fila,fontSize:13}}>
        <b style={{minWidth:150}}>Ahora</b>
        {vivo.estado==="leyendo" && vivo.n != null ? <>
            <span style={{fontSize:18,fontWeight:800}}>{Number(vivo.n).toLocaleString("es-ES")}</span>
            <span style={{color: vivo.chat ? "#4ade80" : "#fbbf24"}}>{vivo.chat ? "✓ en tiempo real, llega a OBS" : "leído, pero no llega al RandomChat"}</span></>
          : vivo.estado==="sin-sesion" ? <>
            <span style={{color:"#f87171"}}>Falta iniciar sesión en YouTube Studio con la cuenta del canal: sin eso el número no se mueve</span>
            <button onClick={()=>window.studioFS.contadorSesion && window.studioFS.contadorSesion()} style={{...boton(true),padding:"4px 10px",fontSize:12}}>Iniciar sesión</button></>
          : vivo.estado==="buscando" || vivo.estado==="cargando" ? <span style={{color:"#fbbf24"}}>Abriendo YouTube Studio y buscando el número…{vivo.n != null ? ` (el último: ${Number(vivo.n).toLocaleString("es-ES")})` : ""}</span>
          : <span style={{color:"var(--text-3)"}}>Se pone en marcha solo al encender el RandomChat</span>}
      </div>}
      <div style={{...fila,fontSize:13}}><b style={{minWidth:150}}>Fuente de OBS</b>
        <code style={{color:"var(--text-2)"}}>http://localhost:7470/suscriptores</code>
        <button onClick={()=>{ try { navigator.clipboard.writeText("http://localhost:7470/suscriptores"); toast && toast("Copiado"); } catch(x){} }} style={{...boton(false),padding:"4px 10px",fontSize:12}}>Copiar</button>
      </div>
      <div style={fila}><b style={{minWidth:150}}>Formato</b>
        <button onClick={()=>cambiar({formato:"fraccion"})} style={{...boton(op.formato!=="debajo"),padding:"5px 12px",fontSize:12.5}}>34.345/{Number(op.meta||100000).toLocaleString("es-ES")}</button>
        <button onClick={()=>cambiar({formato:"debajo"})} style={{...boton(op.formato==="debajo"),padding:"5px 12px",fontSize:12.5}}>Texto debajo</button>
        <label style={{display:"flex",gap:6,alignItems:"center",cursor:"pointer",marginLeft:"auto"}}><input type="checkbox" checked={op.verMeta!==false} onChange={ev=>cambiar({verMeta:ev.target.checked})}/>Mostrar la meta</label>
      </div>
      {op.formato!=="debajo" ? <label style={fila}><b style={{minWidth:150}}>Meta de suscriptores</b>
        <input type="number" min={1} step={1000} value={op.meta||""} onChange={ev=>cambiar({meta:Math.max(0, Math.round(Number(ev.target.value)||0))})}
          style={{width:160,fontSize:13.5,padding:"7px 10px",borderRadius:9,border:"1px solid var(--border)",background:"var(--bg)",color:"var(--text)"}}/>
        <span style={{color:"var(--text-3)"}}>sale pegada al número, con la misma letra y el mismo borde</span></label>
      : <label style={fila}><b style={{minWidth:150}}>Texto de la meta</b>
        <input value={op.texto||""} onChange={ev=>cambiar({texto:ev.target.value})} placeholder="META: 10.000 SUBS" maxLength={60}
          style={{flex:"1 1 240px",fontSize:13.5,padding:"7px 10px",borderRadius:9,border:"1px solid var(--border)",background:"var(--bg)",color:"var(--text)"}}/></label>}
      <label style={fila}><b style={{minWidth:150}}>Tamaño del contador</b>
        <input type="range" min={0.5} max={4} step={0.05} value={op.escala||1} onChange={ev=>cambiar({escala:Number(ev.target.value)})} style={{flex:"1 1 200px"}}/>
        <span style={{color:"var(--text-3)",minWidth:42}}>{Math.round((op.escala||1)*100)} %</span></label>
      {op.formato==="debajo" && <label style={fila}><b style={{minWidth:150}}>Tamaño de la meta</b>
        <input type="range" min={14} max={90} step={1} value={op.tamMeta||30} onChange={ev=>cambiar({tamMeta:Number(ev.target.value)})} style={{flex:"1 1 200px"}}/>
        <span style={{color:"var(--text-3)",minWidth:42}}>{op.tamMeta||30} px</span>
        <input type="color" value={op.colorMeta||"#ffffff"} onChange={ev=>cambiar({colorMeta:ev.target.value})} title="Color de la meta"/></label>}
      <div style={{fontSize:12.5,color:"var(--text-2)",lineHeight:1.5}}>
        Se pone en marcha solo con el RandomChat encendido (no hace falta abrir la ventana) y lee el canal del chat. Si sale «Falta iniciar
        sesión», pulsa «Iniciar sesión» y entra una vez con la cuenta del canal en esa ventana: se queda guardado.
        En OBS: <b>Fuente de navegador</b> con la URL de arriba (transparente, sin croma; con el RandomChat encendido). Así se actualiza
        aunque la ventana esté minimizada, escondida o detrás de otras. (La captura de ventana con croma magenta sigue valiendo, pero no
        funciona con la ventana minimizada.)
      </div>
    </div>);
}

export function RandomChatView({ toast }) {
  const enPC = !!(window.studioFS && window.studioFS.chatEstado);
  const [e, setE] = useState(null);
  const [ocupado, setOcupado] = useState("");
  const [verPanel, setVerPanel] = useState(()=>ls("rds_chat_panel","1")==="1");
  const [verLog, setVerLog] = useState(false);
  const [log, setLog] = useState("");

  const [perfiles, setPerfiles] = useState(null);     // { perfil, lista: [{id, nombre}] }: el canal del chat
  const nombrePerfil = id => ((perfiles && perfiles.lista.find(p=>p.id===id)) || {}).nombre || (id==="rderandom" || !id ? "RDeRandom" : id);
  const refrescar = async () => { const x = await window.studioFS.chatEstado(); setE(x); pasarSesion(x, toast); return x; };
  useEffect(()=>{ if(!enPC) return; refrescar(); const t = setInterval(refrescar, 3000); return ()=>clearInterval(t); },[]);
  useEffect(()=>{ if(enPC && window.studioFS.chatPerfil) window.studioFS.chatPerfil().then(r=>r && !r.error && setPerfiles(r)).catch(()=>{}); },[]);
  useEffect(()=>{ lsSet("rds_chat_panel", verPanel?"1":"0"); },[verPanel]);
  useEffect(()=>{
    if(!enPC || !verLog) return;
    const leer = ()=>window.studioFS.chatRegistro().then(r=>setLog(r.texto||""));
    leer(); const t = setInterval(leer, 3000); return ()=>clearInterval(t);
  },[verLog]);

  const accion = async (que, fn, ok) => {
    setOcupado(que);
    try { const r = await fn(); if(r && r.error) toast && toast(r.error); else if(ok) toast && toast(ok); }
    finally { await refrescar(); setOcupado(""); }
  };
  const copiar = txt => { try { navigator.clipboard.writeText(txt); toast && toast("Copiado"); } catch(x){} };

  const titulo = <h2 className="titulo-vista" style={{fontSize:20,fontWeight:700,marginBottom:4}}>RandomChat</h2>;
  if(!enPC) return <div className="fade-in">{titulo}
    <div style={{padding:"18px 20px",border:"1px dashed var(--border)",borderRadius:14,color:"var(--text-2)",fontSize:13.5}}>
      El chat de los directos funciona en el PC. Ábrelo desde RandomStudio de escritorio.
    </div></div>;

  const on = !!(e && e.encendido);
  const st = (e && e.status) || {};
  const obs = e && e.obs;
  return (
    <div className="fade-in" style={{display:"flex",flexDirection:"column",gap:14}}>
      <div>{titulo}<div style={{fontSize:13,color:"var(--text-2)"}}>Chat y alertas de los directos para OBS</div></div>

      {window.studioFS.contadorEstado && <Contador toast={toast}/>}

      <div style={tarjeta}>
        <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          {punto(!e ? "var(--text-3)" : on ? (e.nuestro ? "#4ade80" : "#fbbf24") : "var(--text-3)")}
          <span style={{fontWeight:700,fontSize:15}}>
            {!e ? "Comprobando…" : ocupado==="encender" ? "Encendiendo…" : ocupado==="apagar" ? "Apagando…" : on ? "Encendido" : "Apagado"}
          </span>
          {on && e.inicio ? <span style={{fontSize:12.5,color:"var(--text-3)"}}>desde hace {desde(e.inicio)}</span> : null}
          <span style={{marginLeft:"auto",display:"flex",gap:8,flexWrap:"wrap"}}>
            {on ? <button disabled={!!ocupado} onClick={()=>accion("apagar", window.studioFS.chatApagar, "Chat apagado")} style={boton(false,true)}>Apagar</button>
                : <button disabled={!!ocupado || (e && e.falta)} onClick={()=>accion("encender", window.studioFS.chatEncender, "Chat encendido")} style={boton(true)}>Encender</button>}
            {on && <button onClick={()=>window.studioFS.chatAbrir("panel")} style={boton(false)}>Abrir panel en el navegador</button>}
            <button onClick={()=>window.studioFS.chatAbrir("carpeta")} style={boton(false)}>Carpeta</button>
          </span>
        </div>
        {e && e.falta && <div style={{fontSize:13,color:"var(--red)"}}>No encuentro el chat en {e.falta}</div>}
        {on && !e.nuestro && <div style={{fontSize:13,color:"#fbbf24"}}>Está encendido con una versión antigua del chat: apágalo y vuelve a encenderlo desde aquí.</div>}
        {/* v3.27: cada perfil tiene sus datos del chat (carpeta «chat» de Ajustes › Carpetas) y su canal */}
        {on && e.nuestro && e.otroPerfil && <div style={{fontSize:13,color:"#fbbf24",display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
          Está encendido con los datos de otro canal, no con los de {nombrePerfil(e.perfilChat)}.
          <button disabled={!!ocupado} onClick={()=>accion("encender", async()=>{ await window.studioFS.chatApagar(); return window.studioFS.chatEncender(); }, "Chat reiniciado con " + nombrePerfil(e.perfilChat))}
            style={{...boton(true),padding:"4px 10px",fontSize:12}}>Reiniciar con {nombrePerfil(e.perfilChat)}</button></div>}
        {/* 2/11: el chat va con el canal de los directos (por defecto RDeRandom), abras el perfil que abras en Studio */}
        {perfiles && perfiles.lista.length > 1 && <div style={{display:"flex",alignItems:"center",gap:8,fontSize:13,flexWrap:"wrap"}}>
          <b>Canal del chat</b>
          <select value={perfiles.perfil} onChange={async ev=>{ const r = await window.studioFS.chatPerfil(ev.target.value); if(r && !r.error){ setPerfiles(r); refrescar(); } }}
            style={{fontSize:13,padding:"5px 8px",borderRadius:8,border:"1px solid var(--border)",background:"var(--bg)",color:"var(--text)"}}>
            {perfiles.lista.map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <span style={{color:"var(--text-3)"}}>sus overlays, alertas, contador y sesión de YouTube (no cambia al cambiar de perfil en Studio)</span>
        </div>}
        {!on && e && !e.falta && <div style={{fontSize:13,color:"var(--text-2)"}}>También se enciende solo al abrir OBS con tu lanzador. Si cierras Studio, el chat sigue funcionando.</div>}
        {on && obs && <div style={{fontSize:13,color:"var(--text-2)"}}>
          OBS: {obs.overlays ? `${obs.overlays} overlay${obs.overlays>1?"s":""} conectado${obs.overlays>1?"s":""}` : "sin overlays conectados"}
          {obs.emitiendo ? <> · <b style={{color:"#f87171"}}>● en directo</b></> : obs.overlays ? " · sin emitir" : ""}
          {obs.apagadoEn!=null && <div style={{color:"#fbbf24",marginTop:4}}>El directo ha terminado: el chat se apaga solo en {mmss(obs.apagadoEn)} (si vuelves a emitir, sigue).</div>}
        </div>}
      </div>

      {on && e.nuestro && <div style={tarjeta}>
        <div style={{fontWeight:700,fontSize:14}}>Conexiones</div>
        {Object.entries(st).filter(([k,v])=>NOMBRE[k] && !(v.state==="off" && (k==="twitch"||k==="tiktok"||k==="streamelements"))).map(([k,v])=>(
          <div key={k} style={{display:"flex",alignItems:"center",gap:10,fontSize:13}}>
            {punto(COLOR[v.state]||"var(--text-3)")}<b style={{minWidth:150}}>{NOMBRE[k]}</b><span style={{color:"var(--text-2)"}}>{v.text}</span>
          </div>))}
        {!chatConYoutube(e) ? <div style={{fontSize:12.5,color:"#fbbf24"}}>Conecta YouTube en el perfil {(e.perfilChat||"rderandom")==="rderandom" ? "RDeRandom" : e.perfilChat} de Studio (pestaña YouTube) para que el chat lea los nuevos suscriptores y puedas moderar.</div>
          : e.sesionYoutube ? <div style={{fontSize:12.5,color:"var(--text-3)"}}>✓ Usa tu sesión de YouTube de Studio (solo en memoria: no se guarda en el chat).</div> : null}
      </div>}

      {on && e.nuestro && e.perfiles && <div style={tarjeta}>
        <div style={{fontWeight:700,fontSize:14}}>Overlays para OBS <span style={{fontWeight:400,fontSize:12.5,color:"var(--text-3)"}}>(fuente de navegador a pantalla completa)</span></div>
        {Object.entries(e.perfiles).map(([id,nombre])=>(
          <div key={id} style={{display:"flex",alignItems:"center",gap:10,fontSize:13,flexWrap:"wrap"}}>
            <b style={{minWidth:190}}>{nombre}</b><code style={{color:"var(--text-2)"}}>{`${URL_CHAT}/overlay/${id}`}</code>
            <button onClick={()=>copiar(`${URL_CHAT}/overlay/${id}`)} style={{...boton(false),padding:"4px 10px",fontSize:12}}>Copiar</button>
          </div>))}
      </div>}

      {on && e.nuestro && <div style={{display:"flex",flexDirection:"column",gap:8}}>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <span style={{fontWeight:700,fontSize:14}}>Panel del chat</span>
          <button onClick={()=>setVerPanel(v=>!v)} style={{...boton(false),padding:"5px 10px",fontSize:12}}>{verPanel?"Ocultar":"Mostrar aquí"}</button>
        </div>
        {verPanel && <iframe key={e.pid} title="Panel de RandomChat" src={`${URL_CHAT}/panel`}
          style={{width:"100%",height:"78vh",border:"1px solid var(--border)",borderRadius:12,background:"#14161b"}}/>}
      </div>}

      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        <div><button onClick={()=>setVerLog(v=>!v)} style={{...boton(false),padding:"5px 10px",fontSize:12}}>{verLog?"Ocultar registro del servidor":"Ver registro del servidor"}</button></div>
        {verLog && <pre style={{fontSize:11.5,color:"var(--text-2)",whiteSpace:"pre-wrap",maxHeight:320,overflow:"auto",margin:0,padding:"10px 12px",border:"1px solid var(--border)",borderRadius:10,background:"var(--bg-2)"}}>{log || "(vacío)"}</pre>}
      </div>
    </div>
  );
}
