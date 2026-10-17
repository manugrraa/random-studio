import React from "react";
const { useState, useEffect, useMemo } = React;
import { Icons } from "./base";

/* ============================ RANKING DE SHORTS (v3) ============================
   Los Shorts de "Shorts Listos" ordenados por posibilidad de hacerse virales.
   Lo calcula el clon en el PC (ranking_studio.py): mide cada mp4 y Claude Opus
   5.5 pone la parte editorial. Aquí se ve, se lanza y se sigue el progreso. */

const TEMA = { famoso:"youtuber conocido", torneo:"torneo", pregunta:"pregunta", caja:"cajas",
  baile:"baile", sub:"suscriptor", serie:"serie", hacker:"hackers", derrota:"derrota" };
const PARTES = [["historia","Historia"],["emocion","Emoción"],["arranque","Arranque"],["duracion","Duración"],["ritmo","Ritmo"],["formato","Formato"]];

const colorNota = n => n>=8.5 ? "var(--gold)" : n>=7 ? "var(--text)" : "var(--text-3)";
const fileUrl = p => p ? "file:///" + p.replace(/\\/g,"/").split("/").map(encodeURIComponent).join("/").replace(/^([A-Za-z])%3A/,"$1:") : null;

function Barra({ v }) {
  return <div style={{height:5,borderRadius:3,background:"var(--border)",overflow:"hidden",marginTop:4}}>
    <div style={{height:"100%",width:(v*10)+"%",background:"var(--gold)"}}/>
  </div>;
}

function Fila({ x, abierto, onToggle }) {
  return (
    <div style={{border:"1px solid var(--border)",borderRadius:12,background:"var(--bg-2)",overflow:"hidden"}}>
      <button onClick={onToggle} style={{display:"grid",gridTemplateColumns:"34px 54px 56px minmax(0,1fr) auto",gap:12,alignItems:"center",width:"100%",padding:"10px 14px",textAlign:"left"}}>
        <span style={{fontSize:12,color:"var(--text-3)",textAlign:"right",fontVariantNumeric:"tabular-nums"}}>{x.puesto}</span>
        <span style={{fontSize:22,fontWeight:800,color:colorNota(x.nota),textAlign:"center",fontVariantNumeric:"tabular-nums"}}>{x.nota.toFixed(1)}</span>
        {x.miniatura
          ? <img src={fileUrl(x.miniatura)} alt="" style={{width:56,height:100,objectFit:"cover",borderRadius:6,background:"#111"}}/>
          : <span style={{width:56,height:100,borderRadius:6,background:"var(--border)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"var(--text-3)",textAlign:"center"}}>sin miniatura</span>}
        <span style={{minWidth:0}}>
          <span style={{display:"block",fontWeight:650,fontSize:14,overflowWrap:"anywhere"}}>{x.n} · {x.titulo}</span>
          <span style={{display:"block",fontSize:12.5,color:"var(--text-2)",marginTop:3,overflowWrap:"anywhere"}}>{x.por_que}</span>
          {x.aviso && <span style={{display:"block",fontSize:12,color:"var(--red)",marginTop:4}}>⚠ {x.aviso}</span>}
        </span>
        <span style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,fontSize:11.5,color:"var(--text-3)"}}>
          <span>{Math.round(x.medido?.dur||0)} s</span>
          <span style={{color: x.formato_nuevo?"#4ade80":"#fbbf24"}}>{x.formato_nuevo?"nuevo":"antiguo"}</span>
        </span>
      </button>
      {abierto && (
        <div style={{padding:"4px 14px 14px 110px",display:"flex",flexDirection:"column",gap:10}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:"8px 16px"}}>
            {PARTES.map(([k,l])=>(
              <div key={k} style={{fontSize:12,color:"var(--text-2)"}}>{l} · {(x.partes?.[k]??0).toFixed(1)}<Barra v={x.partes?.[k]||0}/></div>
            ))}
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,alignItems:"center"}}>
            {(x.temas||[]).length ? x.temas.map(t=><span key={t} style={{fontSize:11.5,padding:"2px 9px",borderRadius:999,background:"var(--border)",color:"var(--text-2)"}}>{TEMA[t]||t}</span>)
              : <span style={{fontSize:11.5,color:"var(--text-3)"}}>tema neutro</span>}
            <span style={{fontSize:11.5,color:"var(--text-3)"}}>· tema ×{(x.multiplicador||1).toFixed(2)}</span>
            {window.studioFS?.rankingAbrir && <button onClick={()=>window.studioFS.rankingAbrir(x.carpeta)} style={{marginLeft:"auto",fontSize:12,fontWeight:600,color:"var(--gold)",border:"1px solid var(--border)",borderRadius:8,padding:"5px 10px"}}>Abrir carpeta</button>}
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

  const cargar = async () => {
    if(!enPC) return;
    const r = await window.studioFS.rankingDatos();
    if(r.error){ setError(r.error); return; }
    setError(""); setDatos(r);
    if(r.analizando && !prog) setProg({hechos:0,total:0});
  };
  useEffect(()=>{ cargar(); },[]);
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

  const analizar = async (todo) => {
    const r = await window.studioFS.rankingAnalizar({ todo });
    if(r.error) toast && toast(r.error); else setProg({hechos:0,total:0});
  };

  const pendientes = datos ? datos.lista.filter(x=>!x.analizado).length : 0;
  const lista = useMemo(()=>{
    if(!datos) return [];
    const qq = q.trim().toLowerCase();
    return datos.ranking.filter(x=>(filtro==="todos" || (filtro==="nuevo" ? x.formato_nuevo : !x.formato_nuevo)) &&
      (!qq || String(x.n)===qq || x.titulo.toLowerCase().includes(qq) || (x.por_que||"").toLowerCase().includes(qq)));
  },[datos,filtro,q]);

  const boton = (activo) => ({fontSize:13,fontWeight:600,padding:"9px 14px",borderRadius:10,border:"1px solid var(--border)",
    color: activo?"#000":"var(--text-2)", background: activo?"var(--gold)":"transparent"});

  return (
    <div className="fade-in" style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",flexWrap:"wrap",gap:12}}>
        <div style={{maxWidth:640}}>
          <h2 style={{fontSize:20,fontWeight:700}}>Ranking de Shorts</h2>
          <p style={{fontSize:12.5,color:"var(--text-2)",marginTop:2}}>
            Los Shorts Listos ordenados por su posibilidad de hacerse virales: sube primero los de arriba.
            Claude Opus 5.5 valora la historia y la emoción; lo demás se mide en cada vídeo con los datos reales de tu canal.
          </p>
        </div>
        {enPC && (
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {prog
              ? <button onClick={()=>window.studioFS.rankingCancelar()} style={boton(false)}>Detener análisis</button>
              : <>
                  <button onClick={()=>analizar(false)} disabled={!pendientes} style={{...boton(!!pendientes),opacity:pendientes?1:.5}}>
                    {pendientes ? `Analizar ${pendientes} nuevo${pendientes!==1?"s":""}` : "Todo analizado"}
                  </button>
                  <button onClick={()=>analizar(true)} style={boton(false)}>Reanalizar todos</button>
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

      {prog && (
        <div style={{padding:"12px 16px",border:"1px solid var(--border)",borderRadius:12,background:"var(--bg-2)"}}>
          <div style={{fontSize:13,color:"var(--text-2)"}}>
            Analizando con Claude Opus 5.5… {prog.total ? `${prog.hechos} de ${prog.total}` : "preparando"}
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
          {[["todos","Todos"],["nuevo","Formato nuevo"],["antiguo","Antiguo"]].map(([k,l])=>(
            <button key={k} onClick={()=>setFiltro(k)} style={boton(filtro===k)}>{l}</button>
          ))}
          <span style={{fontSize:12,color:"var(--text-3)"}}>{datos.ranking.length} con nota · {pendientes} sin analizar</span>
        </div>
      )}

      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {lista.map(x=><Fila key={x.carpeta} x={x} abierto={abierto===x.carpeta} onToggle={()=>setAbierto(a=>a===x.carpeta?null:x.carpeta)}/>)}
        {datos && !lista.length && !prog && (
          <div style={{padding:"40px 20px",textAlign:"center",color:"var(--text-3)",border:"1px dashed var(--border)",borderRadius:14,fontSize:13}}>
            {datos.ranking.length ? "Ningún Short coincide con la búsqueda." : "Todavía no hay ningún Short analizado: pulsa «Analizar» para empezar."}
          </div>
        )}
      </div>
    </div>
  );
}
