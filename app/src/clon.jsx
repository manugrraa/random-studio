import React from "react";
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
      if(ev.evento==="cerrado") fin.current && fin.current(ev);
    });
  },[]);
  const lanzar = async (args) => {
    const r = await window.studioFS.clonTarea(args);
    if(r.error) throw new Error(r.error);
    setTarea({args, eventos:[], inicio:Date.now()});
  };
  return [tarea, lanzar, ()=>setTarea(null)];
}

const NOMBRE_TAREA = { preparar:"Preparando", clipear:"Clipeando", montar:"Montando", mejorar:"Mejorando" };

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
    {que} se hace en el PC, que es donde están los vídeos y tu Claude. Ábrelo desde RDeRandom Studio de escritorio.
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
  if(!enPC()) return <div className="fade-in"><h2 style={{fontSize:20,fontWeight:700,marginBottom:12}}>Directos</h2><SinPC que="El clipeo"/></div>;
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
          <h2 style={{fontSize:20,fontWeight:700}}>Directos</h2>
          <p style={{fontSize:12.5,color:"var(--text-2)",marginTop:2}}>
            Marca los VODs y pulsa Clipear: el clon los transcribe, detecta los combates y Claude lee el directo entero para cortar
            todos los clips con algo dentro (combates enteros, historias, recopilatorios de graciosos y fails) en Clips Recortados. Luego los cribas tú.
          </p>
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
      <p style={{fontSize:12,color:"var(--text-3)"}}>Un directo de 3 h tarda 20-40 min en transcribirse y unos minutos más en clipearse. Si un VOD aún se está copiando, el clon espera a que termine. Los que ya estén clipeados se vuelven a clipear (el plan anterior se guarda).</p>
    </div>
  );
}

/* =================================== CLIPS =================================== */
const ESTADOS = [["nuevo","Por cribar"],["aprobado","Aprobados"],["montado","Montados"],["descartado","Descartados"],["todos","Todos"]];
const COLOR_EST = { nuevo:"var(--text-3)", aprobado:"#4ade80", montado:"var(--gold)", descartado:"var(--red)" };

function Detalle({ c, onCribar, onRenombrar, onCerrar }) {
  const [v, setV] = useState(0);
  const [nombre, setNombre] = useState(c.nombre);
  useEffect(()=>{ setNombre(c.nombre); setV(0); },[c.carpeta]);
  return (
    <div style={{border:"1px solid var(--gold)",borderRadius:14,background:"var(--bg-2)",padding:14,display:"grid",gridTemplateColumns:"minmax(0,300px) minmax(0,1fr)",gap:16}}>
      <div>
        <video key={c.videos[v]} src={fileUrl(c.videos[v])} controls autoPlay style={{width:"100%",aspectRatio:"9/16",background:"#000",borderRadius:10}}/>
        {c.videos.length>1 && <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:8}}>
          {c.videos.map((x,i)=><button key={x} onClick={()=>setV(i)} style={{...boton(i===v),padding:"4px 9px",fontSize:11.5}}>{x.split(/[\\/]/).pop().replace(/\.mp4$/i,"")}</button>)}
        </div>}
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
        {[["Título propuesto",c.titulo],["De qué va",c.de_que_va],["Por qué",c.por_que],["Con quién",c.con_quien],["Directo",c.directo && c.directo+(c.tramo?" · "+c.tramo:"")]].filter(x=>x[1]).map(([k,t])=>(
          <div key={k}><div style={{fontSize:11,color:"var(--text-3)",textTransform:"uppercase",letterSpacing:.4}}>{k}</div><div style={{fontSize:13,color:"var(--text-2)",overflowWrap:"anywhere"}}>{t}</div></div>
        ))}
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:"auto"}}>
          {c.estado==="descartado" ? <button onClick={()=>onCribar(c,"restaurar")} style={boton(false)}>Recuperar</button> : c.estado!=="montado" && <>
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
  useEffect(()=>lsSet("rds_clon_filtro",filtro),[filtro]);
  useEffect(()=>lsSet("rds_clon_capcut",aCapcut?"1":"0"),[aCapcut]);
  useEffect(()=>lsSet("rds_clon_nota",conNota?"1":"0"),[conNota]);
  const cargar = async () => {
    try { const ev = await consultar(["clips","--descartados"]); setClips(ev.find(e=>e.evento==="clips").clips); setError(""); }
    catch(e){ setError(e.message); }
  };
  const [tarea, lanzar, cerrarTarea] = useTarea(ev=>{ cargar(); if(!ev.codigo) toast && toast("Shorts montados: están en Shorts Listos"); });
  useEffect(()=>{ if(enPC()) cargar(); },[]);
  if(!enPC()) return <div className="fade-in"><h2 style={{fontSize:20,fontWeight:700,marginBottom:12}}>Clips</h2><SinPC que="La criba y el montaje"/></div>;

  // v3.2: un clic a la vez por clip, y el reproductor se cierra ANTES de mover la
  // carpeta (18/10: con el vídeo abierto Windows no la deja mover y se duplicaba)
  const [ocupados, setOcupados] = useState({});
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
  const lista = (clips||[]).filter(c=>(filtro==="todos"||c.estado===filtro) &&
    (!q.trim() || String(c.n)===q.trim() || (c.carpeta+" "+(c.titulo||"")+" "+(c.de_que_va||"")).toLowerCase().includes(q.trim().toLowerCase())));
  const aprobados = (clips||[]).filter(c=>c.estado==="aprobado");
  const ocupado = tarea && !tarea.cerrada;
  const montar = async () => {
    try {
      await lanzar(["montar", ...aprobados.map(c=>c.carpeta), "--modelo", ls("rds_clon_modelo_montar","claude-opus-5-5"),
        ...(aCapcut?[]:["--sin-capcut"]), ...(conNota?[]:["--sin-ranking"])]);
    } catch(e){ toast && toast(e.message); }
  };
  const det = clips && abierto && clips.find(c=>c.carpeta===abierto);
  return (
    <div className="fade-in" style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",flexWrap:"wrap",gap:12}}>
        <div style={{maxWidth:680}}>
          <h2 style={{fontSize:20,fontWeight:700}}>Clips</h2>
          <p style={{fontSize:12.5,color:"var(--text-2)",marginTop:2}}>
            Los Clips Recortados. Míralos, aprueba los que quieras como Short y descarta el resto (van a _Descartados, no se borran).
            Al pulsar Montar, el clon escribe el guion de cada aprobado, lo monta con la fórmula elixir y lo exporta él mismo, sin CapCut, a Shorts Listos con su miniatura.
          </p>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          <SelectorModelo clave="rds_clon_modelo_montar"/>
          <button disabled={!aprobados.length||ocupado} onClick={montar} style={{...boton(!!aprobados.length&&!ocupado),opacity:aprobados.length&&!ocupado?1:.5}}>
            {aprobados.length ? `Montar ${aprobados.length} aprobado${aprobados.length!==1?"s":""}` : "Montar"}
          </button>
        </div>
      </div>
      <div style={{display:"flex",gap:16,flexWrap:"wrap",fontSize:12.5,color:"var(--text-2)"}}>
        <label style={{display:"flex",gap:6,alignItems:"center",cursor:"pointer"}}><input type="checkbox" checked={aCapcut} onChange={e=>setACapcut(e.target.checked)}/> Copiar también el timeline a CapCut (para retocarlo si quieres)</label>
        <label style={{display:"flex",gap:6,alignItems:"center",cursor:"pointer"}}><input type="checkbox" checked={conNota} onChange={e=>setConNota(e.target.checked)}/> Ponerle su nota del Ranking</label>
      </div>
      <Estado/>
      <PanelTarea tarea={tarea} onCerrar={cerrarTarea}/>
      {error && <div style={{padding:"14px 16px",border:"1px solid rgba(248,113,113,0.35)",borderRadius:12,color:"var(--red)",fontSize:13}}>{error}</div>}
      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar por número, nombre o de qué va" style={{flex:"1 1 220px",minWidth:0,fontSize:13,padding:"9px 12px",borderRadius:10,border:"1px solid var(--border)",background:"var(--bg-2)",color:"var(--text)"}}/>
        {ESTADOS.map(([k,l])=><button key={k} onClick={()=>setFiltro(k)} style={boton(filtro===k)}>{l} · {cuenta(k)}</button>)}
        <button onClick={cargar} style={boton(false)}>Actualizar</button>
      </div>
      {det && <Detalle c={det} onCribar={cribar} onRenombrar={renombrar} onCerrar={()=>setAbierto(null)}/>}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))",gap:10}}>
        {lista.map(c=>(
          <div key={c.carpeta} style={{border:"1px solid "+(abierto===c.carpeta?"var(--gold)":"var(--border)"),borderRadius:12,background:"var(--bg-2)",overflow:"hidden",display:"flex",flexDirection:"column"}}>
            <button onClick={()=>setAbierto(a=>a===c.carpeta?null:c.carpeta)} style={{textAlign:"left",display:"block",width:"100%"}}>
              <div style={{position:"relative",aspectRatio:"9/16",background:"#111"}}>
                {c.miniatura && <img src={fileUrl(c.miniatura)} alt="" loading="lazy" style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>}
                <span style={{position:"absolute",right:6,bottom:6,fontSize:11,fontWeight:700,padding:"2px 6px",borderRadius:6,background:"rgba(0,0,0,0.75)",color:"#fff"}}>{mmss(c.duracion)}</span>
                {c.videos.length>1 && <span style={{position:"absolute",left:6,bottom:6,fontSize:11,fontWeight:700,padding:"2px 6px",borderRadius:6,background:"rgba(0,0,0,0.75)",color:"#fff"}}>{c.videos.length} momentos</span>}
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
