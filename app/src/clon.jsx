import React from "react";
import { EditorVideo } from "./editor_video";
import { fireNotification } from "./datos";
const { useState, useEffect, useMemo, useRef } = React;

/* ============================ EL CLON EN STUDIO (v3.1) ============================
   Directos: eliges la carpeta de los VODs, marcas los que quieres y el clon los
   prepara (Whisper + combates) y los clipea con Claude en Clips Recortados.
   Clips: los ves, los cribas (✓ / ✗), les pones nombre y pulsas Montar: el clon
   escribe el guion de cada uno, lo monta y lo exporta él mismo (sin CapCut) a
   Shorts Listos, con su miniatura y su nota del Ranking.
   Todo lo hace clon.py en el PC (window.studioFS.clon*). */

export const MODELOS = [["claude-opus-5-5","Opus 5.5","más preciso"],["claude-sonnet-5-5","Sonnet 5.5","gasta menos límite"]];
const fileUrl = p => p ? "file:///" + p.replace(/\\/g,"/").split("/").map(encodeURIComponent).join("/").replace(/^([A-Za-z])%3A/,"$1:") : null;
const enPC = () => !!(window.studioFS && window.studioFS.clonConsultar);
const mmss = s => { s = Math.round(s||0); const h=Math.floor(s/3600), m=Math.floor(s/60)%60, x=s%60; return (h? h+":"+String(m).padStart(2,"0") : m)+":"+String(x).padStart(2,"0"); };
const ls = (k, d) => { try { const v = localStorage.getItem(k); return v===null ? d : v; } catch(e){ return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch(e){} };

export const boton = (activo, peligro) => ({fontSize:13,fontWeight:600,padding:"9px 14px",borderRadius:10,border:"1px solid "+(peligro?"rgba(248,113,113,0.45)":"var(--border)"),
  color: activo?"#000":(peligro?"var(--red)":"var(--text-2)"), background: activo?"var(--gold)":"transparent", cursor:"pointer"});
const chip = (ok, txt, key) => <span key={key||txt} style={{fontSize:11,padding:"2px 8px",borderRadius:999,
  background: ok?"rgba(74,222,128,0.12)":"var(--border)", color: ok?"#4ade80":"var(--text-3)"}}>{ok?"✓ ":""}{txt}</span>;

async function consultar(args) {
  const r = await window.studioFS.clonConsultar(args);
  if (r.error) throw new Error(r.error);
  return r.eventos || [];
}

export function SelectorModelo({ clave }) {
  const [m, setM] = useState(()=>ls(clave, "claude-opus-5-5"));
  useEffect(()=>lsSet(clave, m),[m]);
  return (
    <div role="group" aria-label="Modelo" title="Con qué modelo de Claude trabaja el clon" style={{display:"flex",border:"1px solid var(--border)",borderRadius:10,overflow:"hidden"}}>
      {MODELOS.map(([id,nom,desc])=>(
        <button key={id} onClick={()=>setM(id)} title={desc} style={{fontSize:12.5,fontWeight:600,padding:"8px 12px",
          color: m===id?"var(--gold)":"var(--text-3)", background: m===id?"rgba(212,175,55,0.12)":"transparent"}}>{nom}</button>
      ))}
    </div>
  );
}

/* --- la tarea en marcha (una a la vez): preparar, clipear o montar --- */
export function useTarea(onFin) {
  const [tarea, setTarea] = useState(null);   // {args, eventos, inicio}
  const fin = useRef(onFin); fin.current = onFin;
  useEffect(()=>{
    if(!enPC()) return;
    window.studioFS.clonTareaEstado().then(r=>{ if(r.activa) setTarea({args:r.args, eventos:r.eventos, inicio:r.inicio}); });
    return window.studioFS.onClonProgreso(ev=>{
      setTarea(t=>{
        const base = t || {args:[ev.tarea||"?"], eventos:[], inicio:Date.now()};
        return {...base, eventos:[...base.eventos.slice(-399), ev], cerrada: ev.evento==="cerrado"};
      });
      if(ev.evento==="cerrado"){
        fin.current && fin.current(ev);
        // v3.11: si estás en otra ventana, aviso del sistema al acabar una tarea larga del clon
        if(document.hidden || !document.hasFocus()){
          try { fireNotification(ev.codigo ? "⚠️ El clon ha parado" : "✅ El clon ha terminado",
            ({preparar:"La preparación del directo", clipear:"El clipeo", montar:"El montaje", mejorar:"La mejora", criba:"La criba", revoz:"Las voces", retitular:"El cambio de título"}[ev.tarea]||"La tarea")
              + (ev.codigo ? " no ha podido acabar: míralo en RandomStudio" : " ha terminado")); } catch(e){}
        }
      }
    });
  },[]);
  const lanzar = async (args) => {
    const r = await window.studioFS.clonTarea(args);
    if(r.error) throw new Error(r.error);
    setTarea({args, eventos:[], inicio:Date.now()});
  };
  return [tarea, lanzar, ()=>setTarea(null)];
}

const NOMBRE_TAREA = { preparar:"Preparando", clipear:"Clipeando", montar:"Montando", mejorar:"Mejorando", criba:"Puntuando los clips", revoz:"Poniendo las voces" };

/* 24/10: la voz del título es la de CapCut DE VERDAD ("Vivo Paladín"), por tandas:
   los Shorts salen esperando su voz; aquí se prepara la tanda, él (o el clon) la genera en
   CapCut y se recoge y se rehacen los Shorts */
function VocesCapcut({ toast, lanzar, ocupado, tarea }) {
  const [v, setV] = useState(null);
  const [trabajando, setTrabajando] = useState(false);
  const leer = async () => { try { const ev = await consultar(["voces"]); setV(ev.find(e=>e.evento==="voces")); } catch(e){} };
  useEffect(()=>{ leer(); },[]);
  // el montaje por fases se para a esperar las voces: el panel se pone al día solo
  const esperando = !!(tarea && !tarea.cerrada && tarea.eventos.some(e=>e.evento==="esperando_voces"));
  useEffect(()=>{ if(esperando) leer(); },[esperando]);
  if(!v || !v.pendientes || !v.pendientes.length) return null;
  const orden = async (que) => {
    setTrabajando(true);
    try {
      const ev = await consultar(["voces", que]);
      const h = ev.find(e=>e.evento==="hecho") || {};
      if(que==="preparar") toast && toast(`Timeline «VOCES IA» listo en CapCut con ${h.titulos} título(s)`);
      else {
        toast && toast(`${h.recogidas} voz(es) recogidas${h.aviso ? " · "+h.aviso : ""}`);
        // si el montaje está esperando, él sigue solo; si no, se rehacen los Shorts que la esperaban
        if(h.recogidas && !ocupado) await lanzar(["revoz"]);
      }
      leer();
    } catch(e){ toast && toast(e.message); }
    finally { setTrabajando(false); }
  };
  return (
    <div style={{border:"1px solid var(--gold)",borderRadius:12,padding:"12px 14px",background:"var(--bg-2)",display:"flex",flexDirection:"column",gap:8}}>
      <div style={{fontWeight:700,fontSize:14}}>🎙️ {v.pendientes.length} título{v.pendientes.length!==1?"s":""} esperando la voz de CapCut (Vivo Paladín){esperando ? " · el montaje está esperando" : ""}</div>
      <div style={{fontSize:12.5,color:"var(--text-2)"}}>{v.pendientes.slice(0,6).map(t=>"«"+t+"»").join(" · ")}{v.pendientes.length>6?" …":""}</div>
      <ol style={{fontSize:12.5,color:"var(--text-2)",margin:"0 0 0 18px",padding:0,lineHeight:1.6}}>
        <li>Cierra CapCut y pulsa <b>Preparar en CapCut</b>.</li>
        <li>Abre CapCut → proyecto <b>Clips RIVALS</b> → pestaña <b>VOCES IA</b> → selecciona todos los textos → <b>Texto a voz</b> → <b>Vivo Paladín</b>.</li>
        <li>Cierra CapCut y pulsa <b>Recoger y rehacer los Shorts</b>.</li>
      </ol>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <button disabled={trabajando||(ocupado&&!esperando)} onClick={()=>orden("preparar")} style={boton(false)}>{v.capcut_abierto ? "Preparar en CapCut (ciérralo antes)" : "Preparar en CapCut"}</button>
        <button disabled={trabajando||(ocupado&&!esperando)} onClick={()=>orden("recoger")} style={boton(true)}>{esperando ? "Recoger (el montaje sigue solo)" : "Recoger y rehacer los Shorts"}</button>
        <button onClick={leer} style={boton(false)}>Actualizar</button>
      </div>
    </div>);
}

export function PanelTarea({ tarea, onCerrar }) {
  const [verLog, setVerLog] = useState(false);
  if(!tarea) return null;
  const evs = tarea.eventos;
  const pasos = evs.filter(e=>e.evento==="paso");
  const ultimo = pasos[pasos.length-1];
  const prog = [...evs].reverse().find(e=>e.evento==="progreso" || e.evento==="inicio");
  const errores = evs.filter(e=>e.evento==="error");
  const avisos = evs.filter(e=>e.evento==="aviso");
  const hechos = evs.filter(e=>e.evento==="hecho_clip" || (e.evento==="hecho" && e.directo));
  const logs = evs.filter(e=>e.evento==="log").slice(-12);
  const cerrada = tarea.cerrada;
  const cerr = evs.find(e=>e.evento==="cerrado");
  const total = prog && prog.total, hechosN = prog && prog.hechos || 0;
  const seg = Math.round((Date.now() - (tarea.inicio||Date.now()))/1000);
  return (
    <div style={{padding:"14px 16px",border:"1px solid var(--border)",borderRadius:12,background:"var(--bg-2)",display:"flex",flexDirection:"column",gap:8}}>
      <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        <span style={{fontWeight:700,fontSize:14}}>{cerrada ? "Terminado" : (NOMBRE_TAREA[tarea.args[0]]||"Trabajando")+"…"}</span>
        {total ? <span style={{fontSize:12.5,color:"var(--text-2)"}}>{hechosN} de {total}</span> : null}
        {!cerrada && <span style={{fontSize:12,color:"var(--text-3)"}}>· {mmss(seg)}</span>}
        <span style={{marginLeft:"auto",display:"flex",gap:8}}>
          {logs.length>0 && <button onClick={()=>setVerLog(v=>!v)} style={{...boton(false),padding:"5px 10px",fontSize:12}}>{verLog?"Ocultar detalle":"Ver detalle"}</button>}
          {cerrada ? <button onClick={onCerrar} style={{...boton(false),padding:"5px 10px",fontSize:12}}>Cerrar</button>
                   : <button onClick={()=>window.studioFS.clonCancelar()} style={{...boton(false,true),padding:"5px 10px",fontSize:12}}>Detener</button>}
        </span>
      </div>
      {!cerrada && ultimo && <div style={{fontSize:13,color:"var(--text-2)"}}>{ultimo.carpeta||ultimo.directo ? <b style={{color:"var(--text)"}}>{ultimo.carpeta||ultimo.directo}: </b> : null}{ultimo.detalle}</div>}
      {total ? <div style={{height:5,borderRadius:3,background:"var(--border)",overflow:"hidden"}}><div style={{height:"100%",width:(hechosN/total*100)+"%",background:"var(--gold)"}}/></div> : null}
      {verLog && <pre style={{fontSize:11,color:"var(--text-3)",whiteSpace:"pre-wrap",maxHeight:180,overflow:"auto",margin:0}}>{logs.map(l=>"["+l.fuente+"] "+l.linea).join("\n")}</pre>}
      {hechos.map((h,i)=>(
        <div key={i} style={{fontSize:12.5,color:"var(--text-2)",borderTop:"1px solid var(--border)",paddingTop:8}}>
          {h.short ? <>✓ <b style={{color:"var(--text)"}}>{h.n ? (String(h.short).startsWith(h.n+" ") ? h.short : h.n+" · "+h.short) : h.short}</b> · {h.duracion} s{h.antes && h.antes.dur ? ` (antes ${Math.round(h.antes.dur)} s)` : ""}{h.nota!=null && <> · nota <b style={{color:"var(--gold)"}}>{Number(h.nota).toFixed(1)}</b></>}
              {(h.cambios||[]).length>0 && <ul style={{margin:"4px 0 0 18px",padding:0,color:"var(--text-2)"}}>{h.cambios.slice(0,8).map((x,k)=><li key={k}>{x}</li>)}</ul>}
              {h.titulo_youtube && <div style={{color:"var(--text-3)"}}>Título para YouTube: {h.titulo_youtube}</div>}
              {h.por_que && <div style={{color:"var(--text-3)"}}>{h.por_que}</div>}
              {(h.nombres_dudosos||[]).length>0 && <div style={{color:"#fbbf24"}}>Revisa estos nombres: {h.nombres_dudosos.join(", ")}</div>}
              {(h.avisos||[]).slice(0,4).map((a,k)=><div key={k} style={{color:"#fbbf24"}}>⚠ {String(a).replace(/^\s*AVISO\s*/,"")}</div>)}
              {h.mp4 && <button onClick={()=>window.studioFS.clonAbrir(h.mp4.replace(/[\\/][^\\/]+$/,""))} style={{marginTop:4,fontSize:12,fontWeight:600,color:"var(--gold)"}}>Abrir carpeta</button>}
            </>
          : h.directo ? <>✓ <b style={{color:"var(--text)"}}>{h.directo}</b>{h.clips ? <> · {h.clips.length} clips nuevos en Clips Recortados{h.saltados?` (${h.saltados} tramos saltados)`:""}</> : " preparado"}
              {(h.nombres_dudosos||[]).length>0 && <div style={{color:"#fbbf24"}}>Nombres por confirmar: {h.nombres_dudosos.join(", ")}</div>}
              {(h.no_usar||[]).length>0 && <div style={{color:"var(--text-3)"}}>Fuera por datos personales o insultos: {h.no_usar.map(x=>`${x.desde}-${x.hasta} (${x.motivo})`).join("; ")}</div>}
            </> : null}
        </div>
      ))}
      {avisos.slice(-3).map((a,i)=><div key={"a"+i} style={{fontSize:12,color:"#fbbf24"}}>⚠ {a.carpeta||a.directo ? (a.carpeta||a.directo)+": " : ""}{a.mensaje}</div>)}
      {errores.map((e,i)=><div key={"e"+i} style={{fontSize:12.5,color:"var(--red)"}}>✗ {e.carpeta||e.directo ? (e.carpeta||e.directo)+": " : ""}{e.mensaje}{e.pista && <div style={{color:"var(--text-2)"}}>→ {e.pista}</div>}</div>)}
      {cerrada && cerr && cerr.codigo && !errores.length ? <div style={{fontSize:12.5,color:"var(--red)"}}>Se detuvo: {(cerr.error||"").slice(-200) || "cancelado"}</div> : null}
    </div>
  );
}

function SinPC({ que }) {
  return <div style={{padding:"18px 20px",border:"1px dashed var(--border)",borderRadius:14,color:"var(--text-2)",fontSize:13.5}}>
    {que} se hace en el PC, que es donde están los vídeos y tu Claude. Ábrelo desde RandomStudio de escritorio.
  </div>;
}

function Estado() {
  const [e, setE] = useState(null);
  useEffect(()=>{ if(enPC()) consultar(["estado"]).then(ev=>setE(ev.find(x=>x.evento==="estado"))).catch(()=>{}); },[]);
  if(!e) return null;
  return <div style={{display:"flex",gap:8,flexWrap:"wrap",fontSize:12}}>
    {chip(!!e.claude && e.token, e.claude ? (e.token ? "Claude listo · "+e.claude.replace(" (Claude Code)","") : "Claude sin sesión") : "Claude no encontrado")}
    {chip(e.disco_libre_gb>20, Math.round(e.disco_libre_gb)+" GB libres")}
    {e.capcut_abierto && chip(false, "CapCut abierto: no se copiarán los timelines a CapCut")}
  </div>;
}

/* =================================== DIRECTOS =================================== */
export function DirectosView({ toast }) {
  const [carpeta, setCarpeta] = useState(()=>ls("rds_clon_vods", ""));
  const [vods, setVods] = useState(null);
  const [sel, setSel] = useState({});
  const [error, setError] = useState("");
  const cargar = async () => {
    try {
      const ev = await consultar(carpeta ? ["vods","--carpeta",carpeta] : ["vods"]);
      const x = ev.find(e=>e.evento==="vods"); setVods(x.vods); if(!carpeta) setCarpeta(x.carpeta); setError("");
    } catch(e){ setError(e.message); }
  };
  const [tarea, lanzar, cerrarTarea] = useTarea(ev=>{ cargar(); if(!ev.codigo) toast && toast("El clon ha terminado"); });
  useEffect(()=>{ if(enPC()) cargar(); },[carpeta]);
  useEffect(()=>{ if(carpeta) lsSet("rds_clon_vods", carpeta); },[carpeta]);
  if(!enPC()) return <div className="fade-in"><h2 className="titulo-vista" style={{fontSize:20,fontWeight:700,marginBottom:12}}>Directos</h2><SinPC que="El clipeo"/></div>;
  const elegidos = (vods||[]).filter(v=>sel[v.ruta]);
  const ocupado = tarea && !tarea.cerrada;
  const lanzarCon = async (orden) => {
    try { await lanzar([orden, ...elegidos.map(v=>v.ruta), ...(orden==="clipear" ? ["--modelo", ls("rds_clon_modelo_clip","claude-opus-5-5")] : [])]); setSel({}); }
    catch(e){ toast && toast(e.message); }
  };
  return (
    <div className="fade-in" style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",flexWrap:"wrap",gap:12}}>
        <div style={{maxWidth:680}}>
          <h2 className="titulo-vista" style={{fontSize:20,fontWeight:700}}>Directos</h2>
          <details className="ayuda"><summary>¿Cómo funciona?</summary><p style={{fontSize:12.5,color:"var(--text-2)",marginTop:2}}>
            Marca los VODs y pulsa Clipear: el clon los transcribe, detecta los combates y Claude lee el directo entero para cortar
            todos los clips con algo dentro (combates enteros, historias, recopilatorios de graciosos y fails) en Clips Recortados. Luego los cribas tú.
          </p></details>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <SelectorModelo clave="rds_clon_modelo_clip"/>
          <button disabled={!elegidos.length||ocupado} onClick={()=>lanzarCon("clipear")} style={{...boton(!!elegidos.length&&!ocupado),opacity:elegidos.length&&!ocupado?1:.5}}>
            {elegidos.length ? `Clipear ${elegidos.length}` : "Clipear"}
          </button>
          <button disabled={!elegidos.length||ocupado} onClick={()=>lanzarCon("preparar")} title="Solo transcribir y detectar combates, sin clipear todavía" style={{...boton(false),opacity:elegidos.length&&!ocupado?1:.5}}>Solo preparar</button>
        </div>
      </div>
      <Estado/>
      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
        <span style={{fontSize:12.5,color:"var(--text-3)",overflowWrap:"anywhere"}}>Carpeta: <b style={{color:"var(--text-2)"}}>{carpeta||"…"}</b></span>
        <button onClick={async()=>{ const c = await window.studioFS.clonElegirCarpeta(); if(c) setCarpeta(c); }} style={{...boton(false),padding:"6px 11px",fontSize:12}}>Cambiar carpeta</button>
        <button onClick={cargar} style={{...boton(false),padding:"6px 11px",fontSize:12}}>Actualizar</button>
      </div>
      <PanelTarea tarea={tarea} onCerrar={cerrarTarea}/>
      {error && <div style={{padding:"14px 16px",border:"1px solid rgba(248,113,113,0.35)",borderRadius:12,color:"var(--red)",fontSize:13}}>{error}</div>}
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {(vods||[]).map(v=>(
          <label key={v.ruta} style={{display:"grid",gridTemplateColumns:"22px minmax(0,1fr) auto",gap:12,alignItems:"center",padding:"12px 14px",
            border:"1px solid "+(sel[v.ruta]?"var(--gold)":"var(--border)"),borderRadius:12,background:"var(--bg-2)",cursor:"pointer"}}>
            <input type="checkbox" checked={!!sel[v.ruta]} onChange={e=>setSel(s=>({...s,[v.ruta]:e.target.checked}))}/>
            <span style={{minWidth:0}}>
              <span style={{display:"block",fontWeight:650,fontSize:14,overflowWrap:"anywhere"}}>{v.nombre}</span>
              <span style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:5}}>
                {chip(v.transcrito,"transcrito")}{chip(v.combates,"combates")}{chip(v.clipeado, v.clipeado ? `clipeado${v.n_clips?" · "+v.n_clips+" clips":""}` : "sin clipear")}
              </span>
            </span>
            <span style={{fontSize:12,color:"var(--text-3)",textAlign:"right"}}>{mmss(v.duracion)}<br/>{v.gb} GB · {v.fecha.slice(0,10)}</span>
          </label>
        ))}
        {vods && !vods.length && <div style={{padding:"40px 20px",textAlign:"center",color:"var(--text-3)",border:"1px dashed var(--border)",borderRadius:14,fontSize:13}}>
          No hay vídeos (.mp4, .mov, .mkv) en esta carpeta.</div>}
      </div>
      <p style={{fontSize:12,color:"var(--text-3)"}}>Un directo de 3 h tarda 20-40 min en transcribirse y unos minutos más en clipearse. Si un VOD aún se está copiando, el clon espera a que termine. Los que ya estén clipeados se vuelven a clipear (el plan anterior se guarda). Al acabar, el clon puntúa cada clip nuevo (criba previa) para que en Clips veas primero lo de más potencial.</p>
    </div>
  );
}

/* =================================== CLIPS =================================== */
const ESTADOS = [["nuevo","Por cribar"],["aprobado","Aprobados"],["montado","Montados"],["descartado","Descartados"],["todos","Todos"]];
const COLOR_EST = { nuevo:"var(--text-3)", aprobado:"#4ade80", montado:"var(--gold)", descartado:"var(--red)" };

const archivoDe = x => x.split(/[\\/]/).pop();

// 24/10: los edits de recopilación (él elige uno por clip; si no, el que recomienda la criba)
const EDITS = [["clasico","Clásico de humor"],["core_negro","Core · empieza en negro"],["core_clip","Core · empieza en el clip"],
  ["pov","Tendencia · POV con rótulo-meme"],["ahora_vs_antes","Tendencia · Ahora vs antes"],["top3","Tendencia · Top 3 de broma"]];
const nombreEdit = k => (EDITS.find(e=>e[0]===k)||[0,k||"—"])[1];
const colorPot = p => p>=8 ? "#4ade80" : p>=7 ? "var(--gold)" : p>=5 ? "var(--text-2)" : "var(--red)";

function Criba({ c, onRecribir, ocupado }) {
  const k = c.criba;
  if(!k) return (
    <div style={{fontSize:12.5,color:"var(--text-3)",display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
      El clon aún no lo ha puntuado.
      {onRecribir && <button onClick={()=>onRecribir([c])} disabled={ocupado} style={{...boton(false),padding:"4px 10px",fontSize:12}}>Puntuarlo</button>}
    </div>);
  return (
    <div style={{border:"1px solid var(--border)",borderRadius:10,padding:"9px 11px",background:"var(--bg)"}}>
      <div style={{display:"flex",gap:10,alignItems:"baseline",flexWrap:"wrap"}}>
        <span style={{fontSize:22,fontWeight:800,color:colorPot(k.potencial)}}>{Number(k.potencial).toFixed(1)}</span>
        <span style={{fontSize:12,color:"var(--text-2)"}}>potencial · {k.tipo==="recopilacion" ? "recopilación · "+nombreEdit(k.edit) : "historia"}</span>
        {k.recomendado && <span style={{fontSize:11,fontWeight:800,color:"#4ade80"}}>★ RECOMENDADO</span>}
        {onRecribir && <button onClick={()=>onRecribir([c])} disabled={ocupado} style={{marginLeft:"auto",fontSize:11.5,color:"var(--text-3)"}}>Volver a puntuar</button>}
      </div>
      <div style={{fontSize:13,color:"var(--text-2)",marginTop:4,overflowWrap:"anywhere"}}>{k.por_que}</div>
      {(k.inicio||k.desenlace) && <div style={{fontSize:12,color:"var(--text-3)",marginTop:6,display:"grid",gap:2}}>
        {[["Inicio",k.inicio],["Nudo",k.nudo],["Desenlace",k.desenlace]].filter(x=>x[1]).map(([a,b])=><div key={a}><b style={{color:"var(--text-2)"}}>{a}:</b> {b}</div>)}
      </div>}
      {k.titulo && <div style={{fontSize:12,color:"var(--text-3)",marginTop:6}}>Título que le pondría: <b style={{color:"var(--text-2)"}}>{k.titulo}</b></div>}
      {k.aviso && <div style={{fontSize:12,color:"var(--red)",marginTop:6}}>⚠ {k.aviso}</div>}
    </div>);
}

// v3.12 (27/10), él: "quiero poder crear una carpeta donde añadir los clips y que cada carpeta sea una
// recopilación... en la pestaña de cada clip debe poner «Añadir a recopilación» con un desplegable de las
// recopilaciones, y la primera opción, crear una nueva". El momento: el escrito aquí, si no el de su
// nota, y si no tiene tiempos, el clip entero (el original no se toca)
const TIENE_TIEMPO = /\d+:\d{1,2}|\d+\s*(a|al|-|hasta)\s*\d+/;
const momentoDeNota = n => TIENE_TIEMPO.test(n||"") ? ((n.match(/[\d:.,]+\s*(?:-|a|al|hasta)\s*[\d:.,]+/)||[""])[0]) : "";
function AnadirARecopilacion({ c, recops, onAnadir, onCrear, ocupado }) {
  const [destino, setDestino] = useState("");
  const [nombre, setNombre] = useState("");
  const [archivo, setArchivo] = useState(c.videos.length===1 ? archivoDe(c.videos[0]) : "");
  const [momento, setMomento] = useState(momentoDeNota(c.nota_suya));
  useEffect(()=>{ setDestino(""); setNombre(""); setArchivo(c.videos.length===1 ? archivoDe(c.videos[0]) : ""); setMomento(momentoDeNota(c.nota_suya)); },[c.carpeta]);
  const crear = destino==="__nueva";
  const listo = destino && archivo && !ocupado && (!crear || nombre.trim());
  const ya = (c.en_recopilaciones||[]).filter(r=>recops.some(x=>x.carpeta===r));
  const inp = {fontSize:12.5,padding:"6px 8px",borderRadius:8,border:"1px solid var(--border)",background:"var(--bg)",color:"var(--text)",minWidth:0};
  return (
    <div style={{marginTop:12,padding:"10px 10px 12px",border:"1px dashed var(--border)",borderRadius:10,display:"flex",flexDirection:"column",gap:6}}>
      <div style={{fontSize:11,color:"var(--text-3)",textTransform:"uppercase",letterSpacing:.4}}>Añadir a recopilación</div>
      {ya.length>0 && <div style={{fontSize:11.5,color:"#4ade80"}}>Ya está en: {ya.map(r=>r.replace(/^\d+ - /,"")).join(", ")}</div>}
      <select value={destino} onChange={e=>setDestino(e.target.value)} disabled={ocupado} style={inp}>
        <option value="">Elige la recopilación…</option>
        <option value="__nueva">＋ Crear recopilación nueva</option>
        {recops.map(r=><option key={r.carpeta} value={r.carpeta}>{r.nombre} · {r.videos.length} momento{r.videos.length!==1?"s":""}</option>)}
      </select>
      {crear && <input value={nombre} onChange={e=>setNombre(e.target.value)} placeholder="Nombre de la recopilación (será el título)" maxLength={60} style={inp}/>}
      {destino && c.videos.length>1 && <select value={archivo} onChange={e=>setArchivo(e.target.value)} style={inp}>
        <option value="">¿Qué momento de este clip?</option>
        {c.videos.map(v=><option key={v} value={archivoDe(v)}>{archivoDe(v).replace(/\.mp4$/i,"")}</option>)}
      </select>}
      {destino && <input value={momento} onChange={e=>setMomento(e.target.value)} placeholder="Trozo (opcional): 0:12-0:25 · vacío = el clip entero" style={inp}/>}
      {destino && <button disabled={!listo} onClick={()=>{ crear ? onCrear(c, nombre.trim(), archivo, momento) : onAnadir(destino, c, archivo, momento); setDestino(""); }}
        style={{...boton(true),padding:"6px 11px",fontSize:12,opacity:listo?1:.5}}>{crear ? "Crear y añadir" : "Añadir"}</button>}
    </div>);
}

function Detalle({ c, recops, onEditar, onCribar, onRenombrar, onCerrar, onNota, onExcluir, onMontar, onEdit, onRecribir, onTitulo, onOrden, onAnadir, onCrearRecop, ocupado }) {
  const [v, setV] = useState(0);
  const [nombre, setNombre] = useState(c.nombre);
  const [tit, setTit] = useState(c.titulo_suyo||"");
  useEffect(()=>{ setTit(c.titulo_suyo||""); },[c.carpeta, c.titulo_suyo]);
  const [nota, setNota] = useState(c.nota_suya||"");
  useEffect(()=>{ setNombre(c.nombre); setNota(c.nota_suya||""); setV(0); },[c.carpeta]);
  useEffect(()=>{ setNota(c.nota_suya||""); },[c.nota_suya]);
  const editable = c.estado!=="montado" && c.estado!=="descartado";
  const fuera = new Set(c.fuera||[]);
  // 25/10: el orden de los momentos que elige él (si no, el de la carpeta)
  const ordenados = (c.orden && c.orden.length)
    ? [...c.orden.map(a=>c.videos.find(x=>archivoDe(x)===a)).filter(Boolean), ...c.videos.filter(x=>!c.orden.includes(archivoDe(x)))]
    : c.videos;
  const mover = (i, d) => { const l = ordenados.map(archivoDe); const j = i + d; if(j<0||j>=l.length) return; [l[i], l[j]] = [l[j], l[i]]; onOrden(c, l); };
  return (
    <div style={{border:"1px solid var(--gold)",borderRadius:14,background:"var(--bg-2)",padding:14,display:"grid",gridTemplateColumns:"minmax(0,300px) minmax(0,1fr)",gap:16}}>
      <div>
        {!c.videos.length && <div style={{aspectRatio:"9/16",borderRadius:10,border:"1px dashed var(--border)",display:"flex",alignItems:"center",justifyContent:"center",
          textAlign:"center",padding:20,color:"var(--text-3)",fontSize:13}}>📁 Recopilación vacía<br/>Añádele clips desde cada clip: «Añadir a recopilación»</div>}
        {c.videos.length>0 && <video key={c.videos[v]+(c.editados&&c.editados[archivoDe(c.videos[v])]?"e":"")} src={fileUrl(c.videos[v])} controls autoPlay style={{width:"100%",aspectRatio:"9/16",background:"#000",borderRadius:10,opacity:fuera.has(archivoDe(c.videos[v]))?.45:1}}/>}
        {c.estado!=="montado" && onEditar && c.videos.length>0 && <button onClick={()=>onEditar(c, c.videos[v])} disabled={ocupado} title="Recórtalo o quítale trozos (E)"
          style={{...boton(false),width:"100%",marginTop:8,padding:"8px 0",fontSize:12.5}}>✂ Editar {c.videos.length>1?"este momento":"el clip"}{c.editados&&c.editados[archivoDe(c.videos[v])]?" · ya editado":""}</button>}
        {(c.videos.length>1 || (c.recopilacion_suya && c.videos.length>0)) && <>
          <div style={{fontSize:11,color:"var(--text-3)",textTransform:"uppercase",letterSpacing:.4,marginTop:10}}>Momentos de la recopilación · {c.videos.length-fuera.size} de {c.videos.length} entran{c.orden && c.orden.length ? " · orden tuyo" : ""}</div>
          <div style={{display:"flex",flexDirection:"column",gap:5,marginTop:6}}>
            {ordenados.map((x,k)=>{ const a = archivoDe(x), dentro = !fuera.has(a), i = c.videos.indexOf(x); return (
              <div key={x} style={{display:"flex",gap:6,alignItems:"center"}}>
                {editable && <span style={{display:"flex",gap:3}}>
                  <button onClick={()=>mover(k,-1)} disabled={ocupado||k===0} title="Subirlo (sale antes)"
                    style={{...boton(false),padding:"3px 7px",fontSize:12,opacity:k===0?.3:1}}>↑</button>
                  <button onClick={()=>mover(k,1)} disabled={ocupado||k===ordenados.length-1} title="Bajarlo (sale después)"
                    style={{...boton(false),padding:"3px 7px",fontSize:12,opacity:k===ordenados.length-1?.3:1}}>↓</button>
                </span>}
                <button onClick={()=>setV(i)} style={{...boton(i===v),flex:1,minWidth:0,padding:"4px 9px",fontSize:11.5,textAlign:"left",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textDecoration:dentro?"none":"line-through"}}>{a.replace(/\.mp4$/i,"")}</button>
                {editable && <button onClick={()=>onExcluir(c, a, dentro)} disabled={ocupado} title={dentro?"Quitarlo de la recopilación (el archivo no se borra)":"Volver a meterlo en la recopilación"}
                  style={{...boton(false,dentro),padding:"4px 8px",fontSize:11.5,whiteSpace:"nowrap"}}>{dentro?"Quitar":"Meter"}</button>}
              </div>); })}
          </div>
        </>}
        {editable && onAnadir && !c.recopilacion_suya && c.videos.length>0 && <AnadirARecopilacion c={c} recops={recops||[]} onAnadir={onAnadir} onCrear={onCrearRecop} ocupado={ocupado}/>}
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:10,minWidth:0}}>
        <div style={{display:"flex",justifyContent:"space-between",gap:8}}>
          <span style={{fontSize:12,color:COLOR_EST[c.estado],fontWeight:700,textTransform:"uppercase"}}>{(ESTADOS.find(e=>e[0]===c.estado)||[0,c.estado])[1]}{c.short ? " · "+c.short : ""}</span>
          <button onClick={onCerrar} style={{fontSize:12,color:"var(--text-3)"}}>Cerrar ✕</button>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <span style={{fontSize:13,color:"var(--text-3)"}}>{c.n} -</span>
          <input value={nombre} onChange={e=>setNombre(e.target.value)} disabled={c.estado==="montado"||c.estado==="descartado"}
            title="El nombre de la carpeta es el título del Short" style={{flex:1,minWidth:0,fontSize:14,fontWeight:650,padding:"7px 10px",borderRadius:9,border:"1px solid var(--border)",background:"var(--bg)",color:"var(--text)"}}/>
          {nombre.trim() && nombre!==c.nombre && <button onClick={()=>onRenombrar(c, nombre)} style={{...boton(true),padding:"6px 11px",fontSize:12}}>Guardar nombre</button>}
        </div>
        <Criba c={c} onRecribir={editable ? onRecribir : null} ocupado={ocupado}/>
        <div>
          <div style={{fontSize:11,color:"var(--text-3)",textTransform:"uppercase",letterSpacing:.4}}>Título en pantalla del Short</div>
          <div style={{display:"flex",gap:8,marginTop:4,flexWrap:"wrap"}}>
            <input value={tit} onChange={e=>setTit(e.target.value)} disabled={!editable} maxLength={60}
              placeholder="Vacío = lo elige el clon"
              style={{flex:"1 1 220px",minWidth:0,fontSize:13.5,padding:"7px 10px",borderRadius:9,border:"1px solid var(--border)",background:"var(--bg)",color:"var(--text)"}}/>
            {editable && tit.trim()!==(c.titulo_suyo||"") && <button onClick={()=>onTitulo(c, tit)} disabled={ocupado} style={{...boton(true),padding:"6px 11px",fontSize:12}}>{tit.trim()?"Usar este título":"Que lo elija el clon"}</button>}
          </div>
          {editable && c.criba && c.criba.titulo && c.criba.titulo!==tit && <div style={{fontSize:12,color:"var(--text-3)",marginTop:4}}>
            Propuesta del clon: <button onClick={()=>setTit(c.criba.titulo)} style={{color:"var(--gold)",fontWeight:600,fontSize:12}}>«{c.criba.titulo}»</button></div>}
        </div>
        {(c.videos.length>1 || (c.criba && c.criba.tipo==="recopilacion")) && <div>
          <div style={{fontSize:11,color:"var(--text-3)",textTransform:"uppercase",letterSpacing:.4}}>Edit de la recopilación</div>
          <select value={c.edit||"auto"} disabled={!editable||ocupado} onChange={e=>onEdit(c, e.target.value)}
            style={{marginTop:4,fontSize:13,padding:"7px 10px",borderRadius:9,border:"1px solid var(--border)",background:"var(--bg)",color:"var(--text)",maxWidth:"100%"}}>
            <option value="auto">Automático{c.criba && c.criba.edit ? " (recomienda: "+nombreEdit(c.criba.edit)+")" : " (lo decide el clon)"}</option>
            {EDITS.map(([k,l])=><option key={k} value={k}>{l}</option>)}
          </select>
        </div>}
        {[["Título propuesto",c.titulo],["De qué va",c.de_que_va],["Por qué",c.por_que],["Con quién",c.con_quien],["Directo",c.directo && c.directo+(c.tramo?" · "+c.tramo:"")]].filter(x=>x[1]).map(([k,t])=>(
          <div key={k}><div style={{fontSize:11,color:"var(--text-3)",textTransform:"uppercase",letterSpacing:.4}}>{k}</div><div style={{fontSize:13,color:"var(--text-2)",overflowWrap:"anywhere"}}>{t}</div></div>
        ))}
        <div>
          <div style={{fontSize:11,color:"var(--text-3)",textTransform:"uppercase",letterSpacing:.4}}>Tu nota para el montaje</div>
          <textarea value={nota} onChange={e=>setNota(e.target.value)} disabled={!editable} rows={3} maxLength={2000}
            placeholder="Lo que quieras que el clon tenga en cuenta al montarlo: «empieza en la kill de la sniper», «música más tranquila», «el final es cuando se ríe»…"
            style={{width:"100%",marginTop:4,fontSize:13,padding:"8px 10px",borderRadius:9,border:"1px solid var(--border)",background:"var(--bg)",color:"var(--text)",resize:"vertical",fontFamily:"inherit"}}/>
          {editable && nota.trim()!==(c.nota_suya||"") && <button onClick={()=>onNota(c, nota)} disabled={ocupado} style={{...boton(true),padding:"5px 11px",fontSize:12,marginTop:4}}>{nota.trim()?"Guardar nota":"Quitar nota"}</button>}
          {editable && <div style={{fontSize:11.5,color:"var(--text-3)",marginTop:4}}>Manda sobre el criterio del clon (salvo las reglas del canal: si choca, te avisa).</div>}
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:"auto"}}>
          {c.estado==="descartado" ? <button onClick={()=>onCribar(c,"restaurar")} style={boton(false)}>Recuperar</button> : c.estado!=="montado" && <>
            {c.estado==="aprobado" && <button onClick={()=>onMontar([c])} disabled={ocupado} style={{...boton(true),opacity:ocupado?.5:1}}>Montar este clip</button>}
            <button onClick={()=>onCribar(c, c.estado==="aprobado"?"nuevo":"aprobar")} style={boton(c.estado!=="aprobado")}>{c.estado==="aprobado"?"Quitar aprobado":"✓ Aprobar"}</button>
            <button onClick={()=>onCribar(c,"descartar")} style={boton(false,true)}>✗ Descartar</button>
          </>}
          <button onClick={()=>window.studioFS.clonAbrir(c.videos[0].replace(/[\\/][^\\/]+$/,""))} style={boton(false)}>Abrir carpeta</button>
        </div>
      </div>
    </div>
  );
}

export function ClipsView({ toast }) {
  const [clips, setClips] = useState(null);
  const [filtro, setFiltro] = useState(()=>ls("rds_clon_filtro","nuevo"));
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState(null);
  const [error, setError] = useState("");
  const [aCapcut, setACapcut] = useState(()=>ls("rds_clon_capcut","1")==="1");
  const [conNota, setConNota] = useState(()=>ls("rds_clon_nota","1")==="1");
  const [orden, setOrden] = useState(()=>ls("rds_clon_orden","numero"));     // 24/10: o por potencial
  const [soloRec, setSoloRec] = useState(false);
  useEffect(()=>lsSet("rds_clon_orden",orden),[orden]);
  useEffect(()=>lsSet("rds_clon_filtro",filtro),[filtro]);
  useEffect(()=>lsSet("rds_clon_capcut",aCapcut?"1":"0"),[aCapcut]);
  useEffect(()=>lsSet("rds_clon_nota",conNota?"1":"0"),[conNota]);
  const cargar = async () => {
    try { const ev = await consultar(["clips","--descartados"]); setClips(ev.find(e=>e.evento==="clips").clips); setError(""); }
    catch(e){ setError(e.message); }
  };
  const [tarea, lanzar, cerrarTarea] = useTarea(ev=>{ cargar(); if(!ev.codigo) toast && toast(
    ev.tarea==="criba" ? "Criba del clon hecha: ordena por potencial" : "Shorts montados: están en Shorts Listos"); });
  // v3.2: un clic a la vez por clip, y el reproductor se cierra ANTES de mover la
  // carpeta (18/10: con el vídeo abierto Windows no la deja mover y se duplicaba)
  const [ocupados, setOcupados] = useState({});
  const [sel, setSel] = useState(()=>new Set());    // 19/10: los aprobados que él elige montar
  // v3.11 (26/10): el mini editor y las recopilaciones nuevas
  const [editor, setEditor] = useState(null);       // {carpeta, archivo, ruta}
  const [nuevaRecop, setNuevaRecop] = useState(null);   // nombre de la recopilación que se está creando (vacía)
  const teclas = useRef(null);
  useEffect(()=>{ const h = e => teclas.current && teclas.current(e); window.addEventListener("keydown", h); return ()=>window.removeEventListener("keydown", h); },[]);
  useEffect(()=>{ if(enPC()) cargar(); },[]);
  // v3.11: al volver a la ventana, los clips al día (el clon puede haber cortado más mientras tanto)
  const ultimaCarga = useRef(Date.now());
  useEffect(()=>{
    const h = () => { if(enPC() && Date.now()-ultimaCarga.current > 30000){ ultimaCarga.current = Date.now(); cargar(); } };
    window.addEventListener("focus", h);
    return ()=>window.removeEventListener("focus", h);
  },[]);
  if(!enPC()) return <div className="fade-in"><h2 className="titulo-vista" style={{fontSize:20,fontWeight:700,marginBottom:12}}>Clips</h2><SinPC que="La criba y el montaje"/></div>;

  const cribar = async (c, accion) => {
    if(ocupados[c.carpeta]) return;
    setOcupados(o=>({...o,[c.carpeta]:true}));
    try {
      if(accion==="descartar" || accion==="restaurar"){
        if(abierto===c.carpeta){
          document.querySelectorAll("video").forEach(v=>{ try { v.pause(); v.removeAttribute("src"); v.load(); } catch(x){} });
          setAbierto(null);
          await new Promise(r=>setTimeout(r,400));
        }
      }
      await consultar(["cribar", c.carpeta, accion]);
      // sin volver a leer los 100 clips: se cambia solo este
      const est = {aprobar:"aprobado", nuevo:"nuevo", descartar:"descartado", restaurar:"nuevo"}[accion];
      setClips(cs=>cs.map(x=>x.carpeta===c.carpeta ? {...x, estado:est} : x));
      if(accion==="descartar" || accion==="restaurar") cargar();   // sus rutas cambian: se releen por detrás
    }
    catch(e){ toast && toast(e.message); cargar(); }
    finally { setOcupados(o=>{ const n={...o}; delete n[c.carpeta]; return n; }); }
  };
  // el reproductor tiene el vídeo abierto y Windows no deja renombrar la carpeta
  // (18/10, "[WinError 5] Acceso denegado"): se suelta antes de tocar nada
  const soltarVideo = async () => {
    document.querySelectorAll("video").forEach(v=>{ try { v.pause(); v.removeAttribute("src"); v.load(); } catch(x){} });
    setAbierto(null);
    await new Promise(r=>setTimeout(r,400));
  };
  const renombrar = async (c, nombre) => {
    if(ocupados[c.carpeta]) return;
    setOcupados(o=>({...o,[c.carpeta]:true}));
    try {
      await soltarVideo();
      const ev = await consultar(["renombrar", c.carpeta, nombre.trim()]);
      const h = ev.find(e=>e.evento==="hecho");
      await cargar();
      h && setAbierto(h.nueva);
      toast && toast("Nombre guardado");
    }
    catch(e){ toast && toast(e.message); setAbierto(c.carpeta); }
    finally { setOcupados(o=>{ const n={...o}; delete n[c.carpeta]; return n; }); }
  };
  const cuenta = k => (clips||[]).filter(c=>k==="todos"||c.estado===k).length;
  const pot = c => c.criba ? Number(c.criba.potencial) : -1;
  const lista = (clips||[]).filter(c=>(filtro==="todos"||c.estado===filtro||(filtro==="recop" && c.recopilacion_suya && c.estado!=="descartado")) && (!soloRec || (c.criba && c.criba.recomendado)) &&
    (!q.trim() || String(c.n)===q.trim() || (c.carpeta+" "+(c.titulo||"")+" "+(c.de_que_va||"")).toLowerCase().includes(q.trim().toLowerCase())))
    .sort((a,b)=> orden==="potencial" ? (pot(b)-pot(a) || a.n-b.n) : a.n-b.n);
  const sinPuntuar = (clips||[]).filter(c=>(c.estado==="nuevo"||c.estado==="aprobado") && !c.criba);
  const recomendados = (clips||[]).filter(c=>c.estado===filtro || filtro==="todos").filter(c=>c.criba && c.criba.recomendado).length;
  const aprobados = (clips||[]).filter(c=>c.estado==="aprobado");
  const elegidos = aprobados.filter(c=>sel.has(c.carpeta));
  const ocupado = tarea && !tarea.cerrada;
  const elegir = c => setSel(s=>{ const n=new Set(s); n.has(c.carpeta)?n.delete(c.carpeta):n.add(c.carpeta); return n; });
  const montar = async (cuales) => {
    if(!cuales.length) return;
    try {
      await lanzar(["montar", ...cuales.map(c=>c.carpeta), "--modelo", ls("rds_clon_modelo_montar","claude-opus-5-5"),
        "--esperar-voces", ...(aCapcut?[]:["--sin-capcut"]), ...(conNota?[]:["--sin-ranking"])]);
      setSel(new Set());
    } catch(e){ toast && toast(e.message); }
  };
  // 19/10: su nota por clip y los momentos que quita de una recopilación
  const conClip = async (c, args, cambio, aviso) => {
    if(ocupados[c.carpeta]) return;
    setOcupados(o=>({...o,[c.carpeta]:true}));
    try {
      const ev = await consultar(args);
      const h = ev.find(e=>e.evento==="hecho") || {};
      setClips(cs=>cs.map(x=>x.carpeta===c.carpeta ? {...x, ...cambio(h)} : x));
      aviso && toast && toast(aviso);
    }
    catch(e){ toast && toast(e.message); }
    finally { setOcupados(o=>{ const n={...o}; delete n[c.carpeta]; return n; }); }
  };
  const guardarNota = (c, texto) => conClip(c, ["nota", c.carpeta, texto.trim()], h=>({nota_suya:h.nota||""}),
    texto.trim() ? "Nota guardada: se tendrá en cuenta al montarlo" : "Nota quitada");
  const excluir = (c, archivo, quitar) => conClip(c, ["excluir", c.carpeta, archivo, quitar?"si":"no"], h=>({fuera:h.fuera||[]}));
  // 24/10: el tipo de edit de una recopilación, y la criba previa del clon
  const anadir = (c, origen, archivo, momento) => conClip(c, ["anadir", c.carpeta, origen, archivo||"-", (momento||"").trim()],
    h=>({videos:h.videos||c.videos, anadidos:[...(c.anadidos||[]), {archivo:h.archivo, origen, desde:h.desde, hasta:h.hasta}],
         orden:(c.orden&&c.orden.length) ? [...c.orden, h.archivo] : c.orden}),
    "Añadido a la recopilación: se montará con los demás momentos");
  const ponerOrden = (c, lista) => conClip(c, ["orden", c.carpeta, lista.join("|")], h=>({orden:h.orden||[]}));
  const ponerTitulo = (c, texto) => conClip(c, ["titulo", c.carpeta, texto.trim()], h=>({titulo_suyo:h.titulo||""}),
    texto.trim() ? "Título guardado: el Short llevará ese" : "El título lo elegirá el clon");
  const ponerEdit = (c, valor) => conClip(c, ["edit", c.carpeta, valor], h=>({edit:h.edit||null}),
    valor==="auto" ? "Edit automático (el recomendado)" : "Edit: "+nombreEdit(valor));
  const recribir = async (cuales) => {
    try { await lanzar(["criba", ...cuales.map(c=>c.carpeta), "--modelo", ls("rds_clon_modelo_montar","claude-opus-5-5")]); }
    catch(e){ toast && toast(e.message); }
  };
  const det = clips && abierto && clips.find(c=>c.carpeta===abierto);
  // v3.11: atajos con un clip abierto: ←/→ el anterior/siguiente, A aprobar, E editar el momento
  teclas.current = e => {
    if(editor || nuevaRecop!==null || !det || e.ctrlKey || e.metaKey || e.altKey) return;
    if(/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||"")) return;
    const i = lista.findIndex(c=>c.carpeta===det.carpeta);
    if(e.key==="ArrowRight" && i<lista.length-1){ e.preventDefault(); setAbierto(lista[i+1].carpeta); }
    else if(e.key==="ArrowLeft" && i>0){ e.preventDefault(); setAbierto(lista[i-1].carpeta); }
    else if((e.key==="a"||e.key==="A") && det.estado!=="montado" && det.estado!=="descartado"){ e.preventDefault(); cribar(det, det.estado==="aprobado"?"nuevo":"aprobar"); }
    else if((e.key==="e"||e.key==="E") && det.estado!=="montado"){ e.preventDefault(); const r = det.videos[0]; setEditor({carpeta:det.carpeta, archivo:archivoDe(r), ruta:r}); }
    else if(e.key==="Escape"){ setAbierto(null); }
  };
  // las recopilaciones suyas (carpetas que él va llenando)
  const recops = (clips||[]).filter(c=>c.recopilacion_suya && c.estado!=="montado" && c.estado!=="descartado");
  const anadirA = async (destino, c, archivo, momento) => {
    try {
      await consultar(["anadir", destino, c.carpeta, archivo||"-", (momento||"").trim()]);
      toast && toast(`Añadido a «${destino.replace(/^\d+ - /,"")}»`);
      await cargar();
    } catch(e){ toast && toast(e.message); }
  };
  const crearRecop = async (nombre, c, archivo, momento) => {
    try {
      const ev = await consultar(["nuevarecop", nombre, ...(c ? [c.carpeta, archivo||"-", (momento||"").trim()] : [])]);
      const h = ev.find(e=>e.evento==="hecho") || {};
      toast && toast(c ? `Recopilación «${nombre}» creada con este clip` : `Recopilación «${nombre}» creada: añádele clips desde cada clip`);
      setNuevaRecop(null); await cargar();
      if(!c){ setFiltro("recop"); setAbierto(h.carpeta); }
    } catch(e){ toast && toast(e.message); }
  };
  return (
    <div className="fade-in" style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",flexWrap:"wrap",gap:12}}>
        <div style={{maxWidth:680}}>
          <h2 className="titulo-vista" style={{fontSize:20,fontWeight:700}}>Clips</h2>
          <details className="ayuda"><summary>¿Cómo funciona?</summary><p style={{fontSize:12.5,color:"var(--text-2)",marginTop:2}}>
            Los Clips Recortados. Míralos, aprueba los que quieras como Short y descarta el resto (van a _Descartados, no se borran).
            Al pulsar Montar, el clon escribe el guion de cada aprobado, lo monta con la fórmula elixir y lo exporta él mismo, sin CapCut, a Shorts Listos con su miniatura.
            Antes de tu criba, el clon puntúa el potencial de cada clip (★ los recomendados) y propone el edit de las recopilaciones; ordena por potencial para ver lo mejor primero.
          </p></details>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          <SelectorModelo clave="rds_clon_modelo_montar"/>
          {sinPuntuar.length>0 && <button disabled={ocupado} onClick={()=>recribir(sinPuntuar)} title="El clon puntúa el potencial viral de cada clip para que tú solo elijas entre lo mejor (no descarta nada)"
            style={{...boton(false),opacity:ocupado?.5:1}}>{`Criba del clon (${sinPuntuar.length} sin puntuar)`}</button>}
          {elegidos.length>0 && <button disabled={ocupado} onClick={()=>montar(elegidos)} style={{...boton(!ocupado),opacity:ocupado?.5:1}}>
            {`Montar ${elegidos.length} elegido${elegidos.length!==1?"s":""}`}
          </button>}
          <button disabled={!aprobados.length||ocupado} onClick={()=>montar(aprobados)} style={{...boton(!!aprobados.length&&!ocupado&&!elegidos.length),opacity:aprobados.length&&!ocupado?1:.5}}>
            {aprobados.length ? `Montar todos los aprobados (${aprobados.length})` : "Montar"}
          </button>
        </div>
      </div>
      <div style={{display:"flex",gap:16,flexWrap:"wrap",fontSize:12.5,color:"var(--text-2)"}}>
        <label style={{display:"flex",gap:6,alignItems:"center",cursor:"pointer"}}><input type="checkbox" checked={aCapcut} onChange={e=>setACapcut(e.target.checked)}/> Copiar también el timeline a CapCut (para retocarlo si quieres)</label>
        <label style={{display:"flex",gap:6,alignItems:"center",cursor:"pointer"}}><input type="checkbox" checked={conNota} onChange={e=>setConNota(e.target.checked)}/> Ponerle su nota del Ranking</label>
      </div>
      <Estado/>
      <VocesCapcut toast={toast} lanzar={lanzar} ocupado={ocupado} tarea={tarea}/>
      <PanelTarea tarea={tarea} onCerrar={cerrarTarea}/>
      {error && <div style={{padding:"14px 16px",border:"1px solid rgba(248,113,113,0.35)",borderRadius:12,color:"var(--red)",fontSize:13}}>{error}</div>}
      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar por número, nombre o de qué va" style={{flex:"1 1 220px",minWidth:0,fontSize:13,padding:"9px 12px",borderRadius:10,border:"1px solid var(--border)",background:"var(--bg-2)",color:"var(--text)"}}/>
        {ESTADOS.map(([k,l])=><button key={k} onClick={()=>setFiltro(k)} style={boton(filtro===k)}>{l} · {cuenta(k)}</button>)}
        <button onClick={()=>setFiltro("recop")} title="Tus recopilaciones (las carpetas que vas llenando)" style={boton(filtro==="recop")}>📁 Recopilaciones · {(clips||[]).filter(c=>c.recopilacion_suya && c.estado!=="descartado").length}</button>
        <button onClick={()=>setSoloRec(x=>!x)} title="Los que el clon ve con más potencial (7 o más, sin avisos)" style={boton(soloRec)}>★ Recomendados · {recomendados}</button>
        <select value={orden} onChange={e=>setOrden(e.target.value)} style={{fontSize:13,padding:"8px 10px",borderRadius:10,border:"1px solid var(--border)",background:"var(--bg-2)",color:"var(--text)"}}>
          <option value="numero">Orden: número</option><option value="potencial">Orden: potencial</option>
        </select>
        <button onClick={cargar} style={boton(false)}>Actualizar</button>
        {nuevaRecop===null
          ? <button onClick={()=>setNuevaRecop("")} title="Crea una recopilación vacía y ve añadiéndole clips desde cada clip" style={boton(false)}>＋ Recopilación</button>
          : <span style={{display:"flex",gap:6}}>
              <input autoFocus value={nuevaRecop} onChange={e=>setNuevaRecop(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter" && nuevaRecop.trim()) crearRecop(nuevaRecop.trim()); if(e.key==="Escape") setNuevaRecop(null); }}
                placeholder="Nombre de la recopilación" maxLength={60} style={{fontSize:13,padding:"8px 10px",borderRadius:10,border:"1px solid var(--gold)",background:"var(--bg-2)",color:"var(--text)"}}/>
              <button onClick={()=>nuevaRecop.trim() && crearRecop(nuevaRecop.trim())} style={boton(!!nuevaRecop.trim())}>Crear</button>
              <button onClick={()=>setNuevaRecop(null)} style={boton(false)}>✕</button>
            </span>}
      </div>
      {aprobados.length>0 && <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",fontSize:12.5,color:"var(--text-2)"}}>
        <span>Marca la casilla de los aprobados que quieras montar ahora{elegidos.length ? ` · ${elegidos.length} elegido${elegidos.length!==1?"s":""}` : ""}.</span>
        {elegidos.length<aprobados.length && <button onClick={()=>setSel(new Set(aprobados.map(c=>c.carpeta)))} style={{...boton(false),padding:"4px 10px",fontSize:12}}>Elegir todos</button>}
        {elegidos.length>0 && <button onClick={()=>setSel(new Set())} style={{...boton(false),padding:"4px 10px",fontSize:12}}>Quitar selección</button>}
      </div>}
      {editor && <EditorVideo {...editor} toast={toast} onCerrar={()=>setEditor(null)} onGuardado={cargar}/>}
      {det && <Detalle c={det} onCribar={cribar} onEditar={(c, ruta)=>setEditor({carpeta:c.carpeta, archivo:archivoDe(ruta), ruta})} onRenombrar={renombrar} onCerrar={()=>setAbierto(null)}
        onNota={guardarNota} onExcluir={excluir} onMontar={montar} onEdit={ponerEdit} onRecribir={recribir} onTitulo={ponerTitulo} onOrden={ponerOrden}
        recops={recops.filter(r=>r.carpeta!==det.carpeta)} onAnadir={anadirA} onCrearRecop={(c, nombre, archivo, momento)=>crearRecop(nombre, c, archivo, momento)}
        ocupado={!!ocupados[det.carpeta] || !!ocupado}/>}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))",gap:10}}>
        {lista.map(c=>(
          <div key={c.carpeta} style={{position:"relative",border:"1px solid "+(abierto===c.carpeta?"var(--gold)":sel.has(c.carpeta)&&c.estado==="aprobado"?"#4ade80":"var(--border)"),borderRadius:12,background:"var(--bg-2)",overflow:"hidden",display:"flex",flexDirection:"column"}}>
            {c.estado==="aprobado" && <label title="Elegirlo para montar" onClick={e=>e.stopPropagation()} style={{position:"absolute",right:6,top:6,zIndex:2,width:24,height:24,borderRadius:6,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
              <input type="checkbox" checked={sel.has(c.carpeta)} onChange={()=>elegir(c)} style={{cursor:"pointer",accentColor:"#4ade80"}}/>
            </label>}
            <button onClick={()=>setAbierto(a=>a===c.carpeta?null:c.carpeta)} style={{textAlign:"left",display:"block",width:"100%"}}>
              <div style={{position:"relative",aspectRatio:"9/16",background:"#111"}}>
                {c.miniatura && <img src={fileUrl(c.miniatura)} alt="" loading="lazy" style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>}
                {!c.miniatura && c.recopilacion_suya && <span style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:44}}>📁</span>}
                {c.recopilacion_suya && <span style={{position:"absolute",right:6,bottom:30,fontSize:10.5,fontWeight:800,padding:"2px 7px",borderRadius:6,background:"rgba(212,175,55,0.9)",color:"#000"}}>RECOPILACIÓN</span>}
                {(c.en_recopilaciones||[]).length>0 && <span title={"En: "+c.en_recopilaciones.join(", ")} style={{position:"absolute",left:6,top:54,fontSize:10.5,fontWeight:800,padding:"2px 7px",borderRadius:6,background:"rgba(0,0,0,0.8)",color:"#4ade80"}}>📁 {c.en_recopilaciones.length}</span>}
                <span style={{position:"absolute",right:6,bottom:6,fontSize:11,fontWeight:700,padding:"2px 6px",borderRadius:6,background:"rgba(0,0,0,0.75)",color:"#fff"}}>{mmss(c.duracion)}</span>
                {c.videos.length>1 && <span style={{position:"absolute",left:6,bottom:6,fontSize:11,fontWeight:700,padding:"2px 6px",borderRadius:6,background:"rgba(0,0,0,0.75)",color:"#fff"}}>{(c.fuera||[]).length ? `${c.videos.length-c.fuera.length} de ${c.videos.length}` : c.videos.length} momentos</span>}
                {c.nota_suya && <span title={c.nota_suya} style={{position:"absolute",right:6,top:c.estado==="aprobado"?34:6,fontSize:10.5,fontWeight:800,padding:"2px 7px",borderRadius:6,background:"rgba(0,0,0,0.75)",color:"var(--gold)"}}>nota</span>}
                {c.criba && <span title={c.criba.por_que} style={{position:"absolute",left:6,top:30,fontSize:12,fontWeight:800,padding:"2px 7px",borderRadius:6,background:"rgba(0,0,0,0.8)",color:colorPot(c.criba.potencial)}}>{c.criba.recomendado?"★ ":""}{Number(c.criba.potencial).toFixed(1)}</span>}
                <span style={{position:"absolute",left:6,top:6,fontSize:10.5,fontWeight:800,padding:"2px 7px",borderRadius:6,background:"rgba(0,0,0,0.75)",color:COLOR_EST[c.estado]}}>{(ESTADOS.find(e=>e[0]===c.estado)||[0,c.estado])[1].replace("Por cribar","nuevo")}</span>
              </div>
              <div style={{padding:"8px 10px 4px"}}>
                <div style={{fontSize:13,fontWeight:650,overflowWrap:"anywhere"}}>{c.n} · {c.nombre}</div>
                <div style={{fontSize:11.5,color:"var(--text-3)",marginTop:2,overflowWrap:"anywhere"}}>{c.directo||""}</div>
              </div>
            </button>
            {c.estado!=="montado" && c.estado!=="descartado" && (
              <div style={{display:"flex",gap:6,padding:"4px 10px 10px",marginTop:"auto"}}>
                <button onClick={()=>cribar(c, c.estado==="aprobado"?"nuevo":"aprobar")} title={c.estado==="aprobado"?"Quitar aprobado":"Aprobar"} style={{flex:1,...boton(c.estado==="aprobado"),padding:"6px 0",fontSize:13}}>✓</button>
                <button onClick={()=>cribar(c,"descartar")} title="Descartar" style={{flex:1,...boton(false,true),padding:"6px 0",fontSize:13}}>✗</button>
              </div>
            )}
          </div>
        ))}
      </div>
      {clips && !lista.length && <div style={{padding:"40px 20px",textAlign:"center",color:"var(--text-3)",border:"1px dashed var(--border)",borderRadius:14,fontSize:13}}>No hay clips en «{(ESTADOS.find(e=>e[0]===filtro)||[0,filtro])[1]}».</div>}
    </div>
  );
}
