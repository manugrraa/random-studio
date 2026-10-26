import React from "react";
const { useState, useEffect, useMemo } = React;
import { Icons } from "./base";
import { useTarea, PanelTarea } from "./clon";
import { ytAnalyticsQuery } from "./datos";

/* ============================ RANKING DE SHORTS (v3) ============================
   Los Shorts de "Shorts Listos" ordenados por posibilidad de hacerse virales.
   Lo calcula el clon en el PC (ranking_studio.py): mide cada mp4 y Claude Opus
   5.5 pone la parte editorial. Aquí se ve, se lanza y se sigue el progreso. */

const TEMA = { famoso:"youtuber conocido", torneo:"torneo", pregunta:"pregunta", caja:"cajas",
  baile:"baile", sub:"suscriptor", serie:"serie", hacker:"hackers", derrota:"derrota" };
// v3.0.1: él decide con qué modelo se analiza (Opus por defecto)
const MODELOS = [["claude-opus-5-5","Opus 5.5","más preciso"],["claude-sonnet-5-5","Sonnet 5.5","gasta menos límite"]];
const PARTES = [["historia","Historia"],["emocion","Emoción"],["arranque","Arranque"],["duracion","Duración"],["ritmo","Ritmo"],["formato","Formato"]];

const colorNota = n => n>=8.5 ? "var(--gold)" : n>=7 ? "var(--text)" : "var(--text-3)";
const fileUrl = p => p ? "file:///" + p.replace(/\\/g,"/").split("/").map(encodeURIComponent).join("/").replace(/^([A-Za-z])%3A/,"$1:") : null;

function Barra({ v }) {
  return <div style={{height:5,borderRadius:3,background:"var(--border)",overflow:"hidden",marginTop:4}}>
    <div style={{height:"100%",width:(v*10)+"%",background:"var(--gold)"}}/>
  </div>;
}

// v3.3: diferencia del mejorado con el original (mismo juez: el ranking re-puntúa el original)
const delta = (a, b) => { const d = Math.round((a-b)*10)/10; return (d>0?"+":"")+d.toFixed(1); };
const colorDelta = d => d>0.05 ? "#4ade80" : d<-0.05 ? "var(--red)" : "var(--text-3)";

// v3.4: la previsualización del Short dentro de la fila (original y mejorado)
function Vista({ x }) {
  const [cual, setCual] = useState("original");
  const ruta = cual==="mejorado" && x.mp4_mejorado ? x.mp4_mejorado : x.carpeta+"\\"+x.titulo+".mp4";
  return (
    <div style={{width:210,flexShrink:0}}>
      <video key={ruta} src={fileUrl(ruta)} controls autoPlay style={{width:"100%",aspectRatio:"9/16",background:"#000",borderRadius:10,display:"block"}}/>
      {x.mp4_mejorado && <div style={{display:"flex",gap:6,marginTop:6}}>
        {[["original","Original"],["mejorado","Mejorado"]].map(([k,l])=>(
          <button key={k} onClick={()=>setCual(k)} style={{flex:1,fontSize:12,fontWeight:700,padding:"5px 0",borderRadius:8,border:"1px solid var(--border)",
            color:cual===k?"#000":"var(--text-2)",background:cual===k?(k==="mejorado"?"#4ade80":"var(--gold)"):"transparent"}}>{l}</button>
        ))}
      </div>}
    </div>
  );
}

// v3.4: RETENCIÓN de un Short subido (él: "analizar las bajadas de retención, encontrar los
// fallos y proponer soluciones de cara a futuro"). La curva sale de YouTube Analytics con su
// sesión de Google; el clon mira qué pasa en cada caída y Opus propone; las lecciones solo
// pasan al cerebro si él las aprueba
function Curva({ puntos, dur, caidas }) {
  if(!puntos || !puntos.length) return null;
  const W = 420, H = 110, max = Math.max(1, ...puntos.map(p=>p[1]));
  const xy = puntos.map(p=>[p[0]*W, H - (p[1]/max)*H]);
  return (
    <svg viewBox={`0 0 ${W} ${H+16}`} style={{width:"100%",maxWidth:W,height:"auto",display:"block"}}>
      <path d={"M"+xy.map(p=>p[0].toFixed(1)+","+p[1].toFixed(1)).join(" L")} fill="none" stroke="var(--gold)" strokeWidth="2"/>
      {(caidas||[]).map((c,i)=>{ const x = dur ? c.t/dur*W : 0; return <g key={i}><line x1={x} x2={x} y1={0} y2={H} stroke="var(--red)" strokeDasharray="3 3"/>
        <text x={x+3} y={H+13} fontSize="10" fill="var(--red)">{c.t.toFixed(1)}s</text></g>; })}
      <text x={2} y={H+13} fontSize="10" fill="var(--text-3)">0 s</text>
    </svg>
  );
}

// la curva de retención de YouTube -> el clon la analiza (caídas, por qué, lecciones)
export async function analizarRetencion(x, modelo) {
  const hoy = new Date(); const p=n=>String(n).padStart(2,"0");
  const fin = `${hoy.getFullYear()}-${p(hoy.getMonth()+1)}-${p(hoy.getDate())}`;
  const d = await ytAnalyticsQuery({ startDate:"2025-01-01", endDate:fin, dimensions:"elapsedVideoTimeRatio",
    metrics:"audienceWatchRatio,relativeRetentionPerformance", filters:"video=="+x.subido.id });
  const filas = (d.rows||[]).map(f=>[Number(f[0]), Number(f[1])]);
  if(filas.length<5) throw new Error("YouTube aún no tiene la curva de este Short (tarda 1-2 días en aparecer)");
  const ev = await window.studioFS.clonConsultar(["retencion", String(x.n), JSON.stringify(filas), "--modelo", modelo,
    ...(x.subido.visitas!=null ? ["--visitas", String(x.subido.visitas)] : [])]);
  if(ev.error) throw new Error(ev.error);
}

function Retencion({ x, toast, modelo, onHecho }) {
  const [cargando, setCargando] = useState(false);
  const [aprobadas, setAprobadas] = useState({});
  const r = x.retencion;
  const analizar = async () => {
    setCargando(true);
    try {
      await analizarRetencion(x, modelo);
      toast && toast("Retención analizada"); onHecho && onHecho();
    } catch(e){
      const m = String(e.message||e);
      toast && toast(/ANALYTICS_PERMISOS|ytEnsure|token/i.test(m) ? "Conecta Google (arriba) para leer la retención" :
                     /ANALYTICS_API_OFF/.test(m) ? "Falta activar YouTube Analytics API en Google Cloud" : m.slice(0,160));
    }
    setCargando(false);
  };
  const aprobar = async (t) => {
    const ev = await window.studioFS.clonConsultar(["aprender", t]);
    if(ev.error) toast && toast(ev.error); else { setAprobadas(a=>({...a,[t]:true})); toast && toast("Lección añadida al cerebro: el clon la aplicará al montar"); }
  };
  return (
    <div style={{display:"flex",flexDirection:"column",gap:8,borderTop:"1px solid var(--border)",paddingTop:10}}>
      <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        <b style={{fontSize:13}}>Retención en YouTube</b>
        {r && <span style={{fontSize:12,color: r.a_los_3s>=80?"#4ade80":r.a_los_3s>=73?"#fbbf24":"var(--red)"}}>a los 3 s queda el {r.a_los_3s}%</span>}
        <button disabled={cargando} onClick={analizar} style={{marginLeft:"auto",fontSize:12,fontWeight:600,color:"var(--gold)",border:"1px solid var(--gold)",borderRadius:8,padding:"5px 10px",opacity:cargando?.5:1}}>
          {cargando ? "Analizando… (1-2 min)" : r ? "Volver a analizar" : "Analizar retención"}</button>
      </div>
      {r && <>
        <Curva puntos={r.curva} dur={r.dur} caidas={r.caidas_medidas}/>
        <div style={{fontSize:12.5,color:"var(--text-2)"}}>{r.resumen}</div>
        <div style={{fontSize:12.5,color:"var(--text-2)"}}><b style={{color:"var(--text)"}}>Arranque:</b> {r.arranque}</div>
        {(r.caidas||[]).map((c,i)=>(
          <div key={i} style={{fontSize:12.5,color:"var(--text-2)",paddingLeft:10,borderLeft:"2px solid var(--red)"}}>
            <b style={{color:"var(--red)"}}>{Number(c.t).toFixed(1)} s</b> · {c.que_pasa} — <i>{c.por_que}</i>
            <div style={{color:"#4ade80"}}>→ {c.solucion}</div>
          </div>))}
        {(r.lecciones||[]).length>0 && <div style={{display:"flex",flexDirection:"column",gap:6}}>
          <b style={{fontSize:12.5}}>Lecciones para los próximos Shorts</b>
          {r.lecciones.map((l,i)=>(
            <div key={i} style={{display:"flex",gap:8,alignItems:"flex-start",fontSize:12.5,color:"var(--text-2)"}}>
              <span style={{flex:1}}>{l}</span>
              <button disabled={aprobadas[l]} onClick={()=>aprobar(l)} title="La añade al cerebro: los agentes la aplicarán al montar"
                style={{fontSize:11.5,fontWeight:700,color:aprobadas[l]?"var(--text-3)":"#4ade80",border:"1px solid var(--border)",borderRadius:8,padding:"3px 8px",flexShrink:0}}>
                {aprobadas[l] ? "✓ En el cerebro" : "✓ Aplicar"}</button>
            </div>))}
        </div>}
      </>}
    </div>
  );
}

// 25/10, él: "que se puedan ver las estadísticas que necesitamos saber de cada Short". De YouTube
// Analytics con su Google: lo que dice si un Short funciona (visitas, cuánto se ve, interacción,
// suscriptores) y lo que se calcula de ahí. Se guarda en este equipo y se actualiza a mano.
const STATS = [
  ["views","Visualizaciones"],["engagedViews","Vistas con interacción"],["averageViewPercentage","% visto de media"],
  ["averageViewDuration","Duración media vista"],["estimatedMinutesWatched","Minutos vistos"],["likes","Me gusta"],
  ["comments","Comentarios"],["shares","Compartidos"],["subscribersGained","Suscriptores ganados"],["subscribersLost","Suscriptores perdidos"]];
function fmtStat(k, v) {
  if(v==null || isNaN(v)) return "—";
  if(k==="averageViewPercentage") return Number(v).toFixed(1)+" %";
  if(k==="averageViewDuration") return Number(v).toFixed(1)+" s";
  return Number(v).toLocaleString("es-ES");
}
function Estadisticas({ x, toast }) {
  const clave = "rds_stats_"+x.subido.id;
  const [st, setSt] = useState(()=>{ try { return JSON.parse(localStorage.getItem(clave)||"null"); } catch(e){ return null; } });
  const [cargando, setCargando] = useState(false);
  const leer = async () => {
    setCargando(true);
    try {
      const hoy = new Date(); const p=n=>String(n).padStart(2,"0");
      const fin = `${hoy.getFullYear()}-${p(hoy.getMonth()+1)}-${p(hoy.getDate())}`;
      let d, metricas = STATS.map(s=>s[0]);
      try { d = await ytAnalyticsQuery({ startDate:"2025-01-01", endDate:fin, metrics:metricas.join(","), filters:"video=="+x.subido.id }); }
      catch(e){   // si la cuenta aún no tiene "engagedViews", sin ella
        metricas = metricas.filter(m=>m!=="engagedViews");
        d = await ytAnalyticsQuery({ startDate:"2025-01-01", endDate:fin, metrics:metricas.join(","), filters:"video=="+x.subido.id });
      }
      const fila = (d.rows||[])[0] || [];
      const v = {}; metricas.forEach((m,i)=>{ v[m] = fila[i]!=null ? Number(fila[i]) : null; });
      v._fecha = Date.now();
      setSt(v); try { localStorage.setItem(clave, JSON.stringify(v)); } catch(e){}
    } catch(e){
      const m = String(e.message||e);
      toast && toast(/ANALYTICS_PERMISOS|ytEnsure|token/i.test(m) ? "Conecta Google (arriba) para ver las estadísticas" : m.slice(0,160));
    }
    setCargando(false);
  };
  useEffect(()=>{ if(!st && window.studioFS) leer(); },[x.subido.id]);
  const v = st || {};
  const vistas = v.views || 0;
  const derivadas = vistas ? [
    ["Me gusta por cada 100", ((v.likes||0)/vistas*100).toFixed(2)],
    ["Suscriptores por cada 1.000", (((v.subscribersGained||0)-(v.subscribersLost||0))/vistas*1000).toFixed(2)],
    ...(x.retencion && x.retencion.a_los_3s!=null ? [["Siguen a los 3 s", x.retencion.a_los_3s+" %"]] : []),
  ] : [];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:8,borderTop:"1px solid var(--border)",paddingTop:10}}>
      <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        <b style={{fontSize:13}}>Estadísticas en YouTube</b>
        {st && st._fecha && <span style={{fontSize:11.5,color:"var(--text-3)"}}>del {new Date(st._fecha).toLocaleString("es-ES",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</span>}
        <button disabled={cargando} onClick={leer} style={{marginLeft:"auto",fontSize:12,fontWeight:600,color:"var(--gold)",border:"1px solid var(--gold)",borderRadius:8,padding:"5px 10px",opacity:cargando?.5:1}}>{cargando?"Leyendo…":"Actualizar"}</button>
      </div>
      {st && <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:"8px 14px"}}>
        {[...STATS.filter(([k])=>k in v).map(([k,l])=>[l, fmtStat(k, v[k])]), ...derivadas].map(([l,t])=>(
          <div key={l} style={{fontSize:12,color:"var(--text-3)"}}>{l}<div style={{fontSize:16,fontWeight:750,color:"var(--text)"}}>{t}</div></div>))}
      </div>}
      {!st && !cargando && <div style={{fontSize:12,color:"var(--text-3)"}}>Conecta Google y pulsa Actualizar.</div>}
    </div>);
}

// v3.9: lo que el ranking ha aprendido del canal (ranking_calibrar.py): ×1 = lo normal frente a
// los Shorts subidos a su alrededor; y cómo acertó la nota que tenían los Short ANTES de subirse
const NOMBRE_TEMA = {reto:"Retos (1 headshot = 1 caja…)", famoso:"Youtubers conocidos", caja:"Cajas, skin cases y ruletas",
  baile:"Bailes", sub:"Suscriptores", pregunta:"Pregunta en el título", derrota:"Pierde o le remontan", hacker:"Hackers y ratas",
  irl:"Fuera del juego", torneo:"Torneos", katana:"Katana", sniper:"Sniper"};
function Calibracion({ c }) {
  const temas = Object.entries(c.temas||{}).sort((a,b)=>b[1].bruto-a[1].bruto);
  const color = v => v>=1.1 ? "#4ade80" : v<=0.9 ? "var(--red)" : "var(--text-2)";
  return (
    <div style={{display:"flex",flexDirection:"column",gap:10,padding:"12px 14px",border:"1px solid var(--border)",borderRadius:12,background:"var(--bg-2)"}}>
      <div style={{fontSize:12.5,color:"var(--text-3)"}}>Calibrado el {c.fecha} con {c.shorts} Shorts de tu canal · cada uno comparado con los 10 subidos a su alrededor (×1 = lo normal)</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:"6px 16px"}}>
        {temas.map(([k,v])=>(
          <div key={k} style={{display:"flex",justifyContent:"space-between",gap:8,fontSize:12.5}}>
            <span style={{color:"var(--text-2)"}}>{NOMBRE_TEMA[k]||k} <span style={{color:"var(--text-3)"}}>({v.n})</span></span>
            <b style={{color:color(v.bruto)}}>×{v.bruto.toFixed(2)}</b>
          </div>))}
      </div>
      {(c.duracion||[]).length>0 && <div style={{display:"flex",gap:6,flexWrap:"wrap",fontSize:12}}>
        <span style={{color:"var(--text-3)"}}>Duración:</span>
        {c.duracion.map(t=><span key={t.desde} style={{padding:"2px 8px",borderRadius:8,border:"1px solid var(--border)",color:color(t.rel)}}>
          {t.hasta>=600?`+${t.desde}`:`${t.desde}-${t.hasta}`} s ×{t.rel.toFixed(2)}</span>)}
      </div>}
      <div style={{fontSize:12.5,color:"var(--text-2)"}}>
        {c.acierto!=null ? <>Acierto del ranking con lo ya subido: <b>{c.acierto>=0.5?"bueno":c.acierto>=0.2?"regular":"flojo"}</b> (correlación de puestos {c.acierto.toFixed(2)}, {c.pares.length} Shorts)</>
          : <>Para medir el acierto hacen falta al menos 4 Shorts que tuvieran nota antes de subirse (ahora {(c.pares||[]).length}): cuantos más subas desde el ranking, mejor se ajusta.</>}
      </div>
    </div>);
}

// 25/10, él: "que yo pueda seleccionar el título que se ponga en cada Short": se rehace solo
function CambiarTitulo({ x, onRetitular, ocupado }) {
  const [t, setT] = useState(x.titulo_pantalla||"");
  useEffect(()=>{ setT(x.titulo_pantalla||""); },[x.titulo_pantalla]);
  if(!x.remontable || !onRetitular) return null;
  return (
    <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
      <span style={{fontSize:12,color:"var(--text-3)"}}>Título en pantalla</span>
      <input value={t} onChange={e=>setT(e.target.value)} maxLength={60}
        style={{flex:"1 1 200px",minWidth:0,fontSize:13,padding:"6px 10px",borderRadius:8,border:"1px solid var(--border)",background:"var(--bg)",color:"var(--text)"}}/>
      {t.trim() && t.trim()!==(x.titulo_pantalla||"") && <button disabled={ocupado} onClick={()=>onRetitular(x, t.trim())}
        style={{fontSize:12,fontWeight:600,color:"var(--gold)",border:"1px solid var(--gold)",borderRadius:8,padding:"5px 10px",opacity:ocupado?.5:1}}>Cambiar y rehacer</button>}
      {x.voz_pendiente && <span style={{fontSize:11.5,color:"#fbbf24"}}>🎙️ esperando su voz de CapCut</span>}
    </div>);
}

// suelta el vídeo de los reproductores antes de mover la carpeta (Windows no deja moverla abierta)
async function soltarVideos() {
  document.querySelectorAll("video").forEach(v=>{ try { v.pause(); v.removeAttribute("src"); v.load(); } catch(e){} });
  await new Promise(r=>setTimeout(r,400));
}

function Fila({ x, abierto, onToggle, onSubido, onMejorar, onRetitular, ocupado, onEliminar, toast, modelo, onRecargar }) {
  const sub = x.subido;
  const mej = x.mejorado;
  return (
    <div style={{border:"1px solid "+(sub?"rgba(74,222,128,0.35)":"var(--border)"),borderRadius:12,background:"var(--bg-2)",overflow:"hidden",opacity:sub?0.72:1}}>
      <button onClick={onToggle} style={{display:"grid",gridTemplateColumns:"34px 54px 56px minmax(0,1fr) auto",gap:12,alignItems:"center",width:"100%",padding:"10px 14px",textAlign:"left"}}>
        <span style={{fontSize:12,color:sub?"#4ade80":"var(--text-3)",textAlign:"right",fontVariantNumeric:"tabular-nums",fontWeight:sub?800:400}} title={sub?"Ya subido":"Puesto entre los que quedan por subir"}>{sub?"✓":x.puesto}</span>
        <span style={{fontSize:22,fontWeight:800,color:x.nota==null?"var(--text-3)":colorNota(x.nota),textAlign:"center",fontVariantNumeric:"tabular-nums"}} title={x.nota==null?"Ya estaba subido: no se analizó":""}>{x.nota==null?"—":x.nota.toFixed(1)}</span>
        {x.miniatura
          ? <img src={fileUrl(x.mini||x.miniatura)} alt="" loading="lazy" decoding="async" style={{width:56,height:100,objectFit:"cover",borderRadius:6,background:"#111"}}/>
          : <span style={{width:56,height:100,borderRadius:6,background:"var(--border)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"var(--text-3)",textAlign:"center"}}>sin miniatura</span>}
        <span style={{minWidth:0}}>
          <span style={{display:"block",fontWeight:650,fontSize:14,overflowWrap:"anywhere"}}>{x.n} · {x.titulo}
            {sub && <span style={{marginLeft:8,fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:999,background:"rgba(74,222,128,0.14)",color:"#4ade80",verticalAlign:"middle"}}>
              ✓ Subido{sub.visitas!=null ? " · "+Number(sub.visitas).toLocaleString("es-ES")+" visitas" : ""}</span>}</span>
          {sub && sub.titulo_yt && sub.titulo_yt.replace(/\s*#.*$/,"").trim()!==x.titulo && <span style={{display:"block",fontSize:11.5,color:"var(--text-3)",marginTop:2}}>En YouTube: {sub.titulo_yt.replace(/\s*#.*$/,"")}</span>}
          {mej && mej.nota!=null && x.nota!=null && <span style={{display:"inline-block",marginTop:4,fontSize:11.5,fontWeight:700,padding:"2px 8px",borderRadius:999,
            background:"rgba(212,175,55,0.12)",color:colorDelta(mej.nota-x.nota)}}>Mejorado: {mej.nota.toFixed(1)} ({delta(mej.nota,x.nota)})</span>}
          <span style={{display:"block",fontSize:12.5,color:"var(--text-2)",marginTop:3,overflowWrap:"anywhere"}}>{x.por_que}</span>
          {x.modelo && <span style={{display:"block",fontSize:11,color:"var(--text-3)",marginTop:3}}>{x.modelo==="claude-opus-5-5"?"Analizado con Opus 5.5":x.modelo==="claude-sonnet-5-5"?"Analizado con Sonnet 5.5":x.modelo}</span>}
          {x.no_subir && <span style={{display:"inline-block",marginTop:4,fontSize:11.5,fontWeight:800,padding:"2px 8px",borderRadius:999,background:"rgba(248,113,113,0.15)",color:"var(--red)"}}>⛔ No subir tal cual</span>}
          {x.aviso && <span style={{display:"block",fontSize:12,color:x.no_subir?"var(--red)":"#fbbf24",marginTop:4}}>⚠ {x.aviso}</span>}
        </span>
        <span style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,fontSize:11.5,color:"var(--text-3)"}}>
          {x.nota!=null && <span>{Math.round(x.medido?.dur||0)} s</span>}
          {x.nota!=null && <span style={{color: x.formato_nuevo?"#4ade80":"#fbbf24"}}>{x.formato_nuevo?"nuevo":"antiguo"}</span>}
        </span>
      </button>
      {abierto && (
        <div style={{padding:"4px 14px 14px 14px",display:"flex",gap:16,alignItems:"flex-start",flexWrap:"wrap"}}>
        {window.studioFS && <Vista x={x}/>}
        <div style={{flex:"1 1 300px",minWidth:0,display:"flex",flexDirection:"column",gap:10}}>
          {x.nota!=null && <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:"8px 16px"}}>
            {PARTES.map(([k,l])=>{
              const a = x.partes?.[k]??0, b = mej?.partes?.[k];
              return <div key={k} style={{fontSize:12,color:"var(--text-2)"}}>{l} · {a.toFixed(1)}
                {b!=null && <span style={{color:colorDelta(b-a),fontWeight:700}}> → {b.toFixed(1)}</span>}<Barra v={a}/>
                {b!=null && <div style={{height:5,borderRadius:3,background:"var(--border)",overflow:"hidden",marginTop:2}}><div style={{height:"100%",width:(b*10)+"%",background:"#4ade80"}}/></div>}
              </div>;
            })}
          </div>}
          {mej && <div style={{fontSize:12.5,color:"var(--text-2)"}}>
            <b style={{color:"var(--text)"}}>El mejorado</b> · {Math.round(mej.medido?.dur||0)} s (antes {Math.round(x.medido?.dur||0)} s) · {mej.por_que}
            {x.nota_anterior!=null && <span style={{color:"var(--text-3)"}}> · el original se volvió a puntuar con el mismo modelo (antes {Number(x.nota_anterior).toFixed(1)})</span>}
          </div>}
          <div style={{display:"flex",flexWrap:"wrap",gap:6,alignItems:"center"}}>
            {x.nota!=null && ((x.temas||[]).length ? x.temas.map(t=><span key={t} style={{fontSize:11.5,padding:"2px 9px",borderRadius:999,background:"var(--border)",color:"var(--text-2)"}}>{TEMA[t]||t}</span>)
              : <span style={{fontSize:11.5,color:"var(--text-3)"}}>tema neutro</span>)}
            {x.nota!=null && <span style={{fontSize:11.5,color:"var(--text-3)"}}>· tema ×{(x.multiplicador||1).toFixed(2)}</span>}
            <span style={{marginLeft:"auto",display:"flex",gap:6,flexWrap:"wrap"}}>
              {sub && sub.id && <a href={"https://www.youtube.com/shorts/"+sub.id} target="_blank" rel="noreferrer" style={{fontSize:12,fontWeight:600,color:"var(--text-2)",border:"1px solid var(--border)",borderRadius:8,padding:"5px 10px"}}>Ver en YouTube</a>}
              {window.studioFS?.rankingSubido && <button onClick={()=>onSubido(x, !sub)} style={{fontSize:12,fontWeight:600,color:sub?"var(--text-2)":"#4ade80",border:"1px solid var(--border)",borderRadius:8,padding:"5px 10px"}}>{sub?"No está subido":"✓ Marcar como subido"}</button>}
              {!sub && x.remontable && x.nota!=null && onMejorar && <button disabled={ocupado} onClick={()=>onMejorar([x.n])} title="El clon lo vuelve a montar atacando lo que flojea; el original no se toca"
                style={{fontSize:12,fontWeight:600,color:"var(--gold)",border:"1px solid var(--gold)",borderRadius:8,padding:"5px 10px",opacity:ocupado?.5:1}}>{mej?"Volver a mejorar":"✦ Mejorar"}</button>}
              {window.studioFS?.rankingAbrir && <button onClick={()=>window.studioFS.rankingAbrir(x.carpeta)} style={{fontSize:12,fontWeight:600,color:"var(--gold)",border:"1px solid var(--border)",borderRadius:8,padding:"5px 10px"}}>Abrir carpeta</button>}
              {onEliminar && <button onClick={()=>onEliminar(x)} title="Lo saca del ranking: va a Shorts Listos/_Eliminados y se puede recuperar"
                style={{fontSize:12,fontWeight:600,color:"var(--red)",border:"1px solid rgba(248,113,113,0.45)",borderRadius:8,padding:"5px 10px"}}>Eliminar</button>}
            </span>
          </div>
          {!sub && <CambiarTitulo x={x} onRetitular={onRetitular} ocupado={ocupado}/>}
          {sub && sub.id && <Estadisticas x={x} toast={toast}/>}
          {sub && sub.id && window.studioFS?.clonConsultar && <Retencion x={x} toast={toast} modelo={modelo} onHecho={onRecargar}/>}
        </div>
        </div>
      )}
    </div>
  );
}

export function RankingView({ toast }) {
  const enPC = !!(window.studioFS && window.studioFS.rankingDatos);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [prog, setProg] = useState(null);       // {hechos,total} mientras analiza
  const [fallos, setFallos] = useState([]);
  const [abierto, setAbierto] = useState(null);
  const [filtro, setFiltro] = useState("todos");
  const [q, setQ] = useState("");
  // v3.2: lo ya subido se reconoce solo (su miniatura en YouTube) y se aparta
  const [verSubidos, setVerSubidos] = useState(()=>{ try { return localStorage.getItem("rds_ranking_subidos")||"pendientes"; } catch(e){ return "pendientes"; } });
  useEffect(()=>{ try { localStorage.setItem("rds_ranking_subidos", verSubidos); } catch(e){} },[verSubidos]);
  const [verificando, setVerificando] = useState(false);
  // v3.9 (26/10), él: "mejora el método del ranking con las estadísticas de los Shorts nuevos":
  // lee el canal, mide cuánto rinde cada tema y cada duración frente a los Shorts de alrededor,
  // y vuelve a poner la nota a todos con esos pesos (sin gastar Claude)
  const [calibrando, setCalibrando] = useState(false);
  const [verCal, setVerCal] = useState(false);
  const calibrar = async () => {
    if(!window.studioFS?.rankingCalibrar || calibrando) return;
    setCalibrando(true);
    const r = await window.studioFS.rankingCalibrar();
    setCalibrando(false);
    if(r.error){ toast && toast("No se pudo recalibrar: "+r.error.slice(-140)); return; }
    toast && toast(`Recalibrado con ${r.shorts} Shorts del canal · ${r.renotados} notas actualizadas`);
    setVerCal(true); cargar();
  };
  const verificar = async (silencioso) => {
    if(!window.studioFS?.rankingVerificar || verificando) return;
    setVerificando(true);
    const r = await window.studioFS.rankingVerificar();
    setVerificando(false);
    try { localStorage.setItem("rds_ranking_verif", String(Date.now())); } catch(e){}
    if(r.error){ if(!silencioso) toast && toast("No se pudo comprobar YouTube: "+r.error.slice(-120)); return; }
    if(r.nuevos && r.nuevos.length) toast && toast("Subidos desde la última vez: "+r.nuevos.join(", "));
    else if(!silencioso) toast && toast("Comprobado: no hay subidos nuevos");
    cargar();
  };
  const marcarSubido = async (x, si) => {
    const r = await window.studioFS.rankingSubido(x.n, si);
    if(r.error) toast && toast(r.error); else cargar();
  };
  // v3.4: él criba también aquí ("los que no lleguen a mis parámetros los eliminaré")
  const eliminar = async (x) => {
    if(!window.confirm(`¿Eliminar del ranking «${x.n} · ${x.titulo}»?\n\nVa a Shorts Listos/_Eliminados (no se borra: lo puedes recuperar desde el filtro «Eliminados»).`)) return;
    await soltarVideos();
    setAbierto(null);
    const r = await window.studioFS.rankingEliminar(x.n, false);
    if(r.error) toast && toast(r.error); else { toast && toast(`${x.n} eliminado del ranking`); cargar(); }
  };
  const recuperar = async (x) => {
    const r = await window.studioFS.rankingEliminar(x.n, true);
    if(r.error) toast && toast(r.error); else { toast && toast(`${x.n} recuperado`); cargar(); }
  };
  const [modelo, setModelo] = useState(()=>{ try { return localStorage.getItem("rds_ranking_modelo")||"claude-opus-5-5"; } catch(e){ return "claude-opus-5-5"; } });
  useEffect(()=>{ try { localStorage.setItem("rds_ranking_modelo", modelo); } catch(e){} },[modelo]);
  const nombreModelo = (MODELOS.find(m=>m[0]===modelo)||MODELOS[0])[1];

  const cargar = async () => {
    if(!enPC) return;
    const r = await window.studioFS.rankingDatos();
    if(r.error){ setError(r.error); return; }
    setError(""); setDatos(r);
    if(r.analizando && !prog) setProg({hechos:0,total:0});
  };
  useEffect(()=>{
    cargar();
    // se comprueba solo al abrir, como mucho una vez cada 6 h
    let ult = 0; try { ult = Number(localStorage.getItem("rds_ranking_verif")||0); } catch(e){}
    if(enPC && Date.now()-ult > 6*3600*1000) verificar(true);
  },[]);
  useEffect(()=>{
    if(!enPC) return;
    return window.studioFS.onRankingProgreso(ev=>{
      if(ev.evento==="inicio"){ setProg({hechos:0,total:ev.total}); setFallos([]); }
      else if(ev.evento==="hecho"){ setProg({hechos:ev.hechos,total:ev.total}); cargar(); }
      else if(ev.evento==="error"){ setProg({hechos:ev.hechos,total:ev.total}); setFallos(f=>[...f,{n:ev.n,error:ev.error}]); }
      else if(ev.evento==="cerrado"){
        setProg(null); cargar();
        if(ev.error) toast && toast("El análisis se detuvo: "+ev.error.slice(-140));
        else toast && toast("Ranking actualizado");
      }
    });
  },[]);

  // v3.3: MEJORAR (él, 18/10): el clon remonta los Shorts con más potencial atacando
  // lo que flojea; el original no se toca y los dos se puntúan con el mismo juez
  const [tarea, lanzarTarea, cerrarTarea] = useTarea(ev=>{ cargar(); if(!ev.codigo) toast && toast(
    ev.tarea==="retitular" ? "Short rehecho con su título nuevo" : "Mejorados: están junto al original en su carpeta"); });
  // 25/10: la retención real de TODOS los subidos que aún no la tienen, de una vez
  const [retProg, setRetProg] = useState(null);
  const retencionTodos = async () => {
    const pend = (datos?.ranking||[]).filter(x=>x.subido && x.subido.id && !x.retencion);
    if(!pend.length){ toast && toast("Todos los subidos ya tienen su retención analizada"); return; }
    let hechos = 0, sinCurva = 0;
    for(const [i,x] of pend.entries()){
      setRetProg(`${i+1}/${pend.length}`);
      try { await analizarRetencion(x, modelo); hechos++; }
      catch(e){
        const m = String(e.message||e);
        if(/ANALYTICS_PERMISOS|ytEnsure|token/i.test(m)){ toast && toast("Conecta Google (arriba) para leer la retención"); break; }
        sinCurva++;
      }
    }
    setRetProg(null); cargar();
    toast && toast(`Retención: ${hechos} analizados${sinCurva ? `, ${sinCurva} aún sin curva en YouTube` : ""}`);
  };
  const retitular = async (x, texto) => {
    try { await soltarVideos(); await lanzarTarea(["retitular", String(x.n), texto]); }
    catch(e){ toast && toast(e.message); }
  };
  const ocupado = !!(tarea && !tarea.cerrada);
  const mejorar = async (nums) => {
    try { await lanzarTarea(["mejorar", ...nums.map(String), "--modelo", modelo]); }
    catch(e){ toast && toast(e.message); }
  };
  const candidatos = datos ? datos.ranking.filter(x=>!x.subido && x.remontable && x.nota!=null && !x.mejorado).slice(0,5) : [];

  const analizar = async (todo) => {
    const r = await window.studioFS.rankingAnalizar({ todo, modelo });
    if(r.error) toast && toast(r.error); else setProg({hechos:0,total:0});
  };

  // lo ya subido no se analiza (no hace falta decidir cuándo subirlo)
  const pendientes = datos ? datos.lista.filter(x=>!x.analizado && !x.subido).length : 0;
  const lista = useMemo(()=>{
    if(!datos) return [];
    const qq = q.trim().toLowerCase();
    return datos.ranking.filter(x=>(filtro==="todos" || (filtro==="nuevo" ? x.formato_nuevo : !x.formato_nuevo)) &&
      (verSubidos==="todos" || (verSubidos==="subidos" ? !!x.subido : !x.subido)) &&
      (!qq || String(x.n)===qq || x.titulo.toLowerCase().includes(qq) || (x.por_que||"").toLowerCase().includes(qq)));
  },[datos,filtro,q,verSubidos]);

  const boton = (activo) => ({fontSize:13,fontWeight:600,padding:"9px 14px",borderRadius:10,border:"1px solid var(--border)",
    color: activo?"#000":"var(--text-2)", background: activo?"var(--gold)":"transparent"});

  return (
    <div className="fade-in" style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",flexWrap:"wrap",gap:12}}>
        <div style={{maxWidth:640}}>
          <h2 style={{fontSize:20,fontWeight:700}}>Ranking de Shorts</h2>
          <p style={{fontSize:12.5,color:"var(--text-2)",marginTop:2}}>
            Los Shorts Listos ordenados por su posibilidad de hacerse virales: sube primero los de arriba.
            Claude (Opus o Sonnet, tú eliges) valora la historia y la emoción; lo demás se mide en cada vídeo con los datos reales de tu canal.
          </p>
        </div>
        {enPC && (
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {prog
              ? <button onClick={()=>window.studioFS.rankingCancelar()} style={boton(false)}>Detener análisis</button>
              : <>
                  <div role="group" aria-label="Modelo" title="Con qué modelo de Claude se analiza" style={{display:"flex",border:"1px solid var(--border)",borderRadius:10,overflow:"hidden"}}>
                    {MODELOS.map(([id,nom,desc])=>(
                      <button key={id} onClick={()=>setModelo(id)} title={desc} style={{fontSize:12.5,fontWeight:600,padding:"8px 12px",
                        color: modelo===id?"var(--gold)":"var(--text-3)", background: modelo===id?"rgba(212,175,55,0.12)":"transparent"}}>{nom}</button>
                    ))}
                  </div>
                  <button onClick={()=>analizar(false)} disabled={!pendientes} style={{...boton(!!pendientes),opacity:pendientes?1:.5}}>
                    {pendientes ? `Analizar ${pendientes} nuevo${pendientes!==1?"s":""}` : "Todo analizado"}
                  </button>
                  <button onClick={()=>analizar(true)} style={boton(false)}>Reanalizar todos</button>
                  {window.studioFS?.clonTarea && <button disabled={!candidatos.length||ocupado} onClick={()=>mejorar(candidatos.map(x=>x.n))}
                    title={candidatos.length ? "Mejora: "+candidatos.map(x=>x.n+" "+x.titulo).join(", ") : "No quedan Shorts por mejorar"}
                    style={{...boton(false),color:"var(--gold)",borderColor:"var(--gold)",opacity:candidatos.length&&!ocupado?1:.5}}>✦ Mejorar los {candidatos.length||5} mejores</button>}
                </>}
          </div>
        )}
      </div>

      {!enPC && (
        <div style={{padding:"18px 20px",border:"1px dashed var(--border)",borderRadius:14,color:"var(--text-2)",fontSize:13.5}}>
          El ranking se calcula en el PC, que es donde están los Shorts Listos y tu Claude. Ábrelo desde RDeRandom Studio de escritorio.
        </div>
      )}
      {error && <div style={{padding:"14px 16px",border:"1px solid rgba(248,113,113,0.35)",borderRadius:12,color:"var(--red)",fontSize:13}}>{error}</div>}

      <PanelTarea tarea={tarea} onCerrar={cerrarTarea}/>
      {prog && (
        <div style={{padding:"12px 16px",border:"1px solid var(--border)",borderRadius:12,background:"var(--bg-2)"}}>
          <div style={{fontSize:13,color:"var(--text-2)"}}>
            Analizando con Claude {nombreModelo}… {prog.total ? `${prog.hechos} de ${prog.total}` : "preparando"}
            <span style={{color:"var(--text-3)"}}> · cada Short tarda entre 30 s y 1 min</span>
          </div>
          <Barra v={prog.total ? prog.hechos/prog.total*10 : 0}/>
        </div>
      )}
      {fallos.length>0 && (
        <div style={{fontSize:12.5,color:"var(--red)"}}>
          No se pudieron analizar: {fallos.map(f=>f.n).join(", ")}. {/OAuth|authenticate|login/i.test(fallos[0].error)
            ? "Tu Claude Code no tiene la sesión iniciada: abre una terminal, escribe «claude» y luego «/login»."
            : fallos[0].error.slice(-160)}
        </div>
      )}

      {datos && (
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar por título o número" style={{flex:"1 1 220px",minWidth:0,fontSize:13,padding:"9px 12px",borderRadius:10,border:"1px solid var(--border)",background:"var(--bg-2)",color:"var(--text)"}}/>
          {[["pendientes","Por subir"],["subidos","Subidos"],["todos","Todos"]].map(([k,l])=>(
            <button key={k} onClick={()=>setVerSubidos(k)} style={boton(verSubidos===k)}>{l} · {k==="todos"?datos.ranking.length:datos.ranking.filter(x=>k==="subidos"?!!x.subido:!x.subido).length}</button>
          ))}
          {(datos.eliminados||[]).length>0 && <button onClick={()=>setVerSubidos("eliminados")} style={boton(verSubidos==="eliminados")}>Eliminados · {datos.eliminados.length}</button>}
          {verSubidos==="subidos" && window.studioFS?.clonConsultar && <button disabled={!!retProg} onClick={retencionTodos}
            title="Lee de YouTube la curva de cada Short subido y el clon analiza dónde se va la gente (las lecciones las apruebas tú)"
            style={{...boton(false),opacity:retProg?.6:1}}>{retProg ? `Analizando retención ${retProg}…` : "Analizar la retención de todos"}</button>}
          <span style={{width:1,height:24,background:"var(--border)"}}/>
          {[["todos","Todos"],["nuevo","Formato nuevo"],["antiguo","Antiguo"]].map(([k,l])=>(
            <button key={k} onClick={()=>setFiltro(k)} style={boton(filtro===k)}>{l}</button>
          ))}
          {enPC && <button onClick={()=>verificar(false)} disabled={verificando} title="Busca en tu canal los Shorts ya subidos comparando las miniaturas" style={{...boton(false),opacity:verificando?.6:1}}>{verificando?"Comprobando YouTube…":"Comprobar subidos"}</button>}
          {enPC && window.studioFS?.rankingCalibrar && <button onClick={calibrar} disabled={calibrando} title="Lee cómo han ido tus Shorts subidos y ajusta lo que vale cada tema y cada duración"
            style={{...boton(false),opacity:calibrando?.6:1}}>{calibrando?"Recalibrando… (1-2 min)":"Recalibrar con el canal"}</button>}
          {datos.calibracion && <button onClick={()=>setVerCal(v=>!v)} style={boton(verCal)}>Qué funciona</button>}
          <span style={{fontSize:12,color:"var(--text-3)"}}>{datos.ranking.filter(x=>x.nota!=null).length} con nota · {pendientes} sin analizar</span>
        </div>
      )}
      {datos && verCal && datos.calibracion && <Calibracion c={datos.calibracion}/>}

      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {verSubidos==="eliminados" ? (datos?.eliminados||[]).map(x=>(
          <div key={x.carpeta} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",border:"1px solid var(--border)",borderRadius:12,background:"var(--bg-2)",opacity:.8}}>
            <span style={{fontSize:16,fontWeight:800,color:"var(--text-3)",width:44,textAlign:"center"}}>{x.nota!=null?x.nota.toFixed(1):"—"}</span>
            <span style={{flex:1,minWidth:0,fontWeight:650,fontSize:14,overflowWrap:"anywhere"}}>{x.n} · {x.titulo}</span>
            <button onClick={()=>recuperar(x)} style={{fontSize:12,fontWeight:600,color:"#4ade80",border:"1px solid var(--border)",borderRadius:8,padding:"5px 10px"}}>Recuperar</button>
          </div>))
        : lista.map(x=><Fila key={x.carpeta} x={x} abierto={abierto===x.carpeta} onToggle={()=>setAbierto(a=>a===x.carpeta?null:x.carpeta)} onSubido={marcarSubido} onMejorar={window.studioFS?.clonTarea ? mejorar : null} onRetitular={window.studioFS?.clonTarea ? retitular : null} ocupado={ocupado} onEliminar={window.studioFS?.rankingEliminar ? eliminar : null} toast={toast} modelo={modelo} onRecargar={cargar}/>)}
        {datos && verSubidos!=="eliminados" && !lista.length && !prog && (
          <div style={{padding:"40px 20px",textAlign:"center",color:"var(--text-3)",border:"1px dashed var(--border)",borderRadius:14,fontSize:13}}>
            {datos.ranking.length ? "Ningún Short coincide con la búsqueda." : "Todavía no hay ningún Short analizado: pulsa «Analizar» para empezar."}
          </div>
        )}
      </div>
    </div>
  );
}
