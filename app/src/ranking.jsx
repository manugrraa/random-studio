import React from "react";
const { useState, useEffect, useMemo } = React;
import { Icons } from "./base";

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

function Fila({ x, abierto, onToggle, onSubido }) {
  const sub = x.subido;
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
          <span style={{display:"block",fontSize:12.5,color:"var(--text-2)",marginTop:3,overflowWrap:"anywhere"}}>{x.por_que}</span>
          {x.modelo && <span style={{display:"block",fontSize:11,color:"var(--text-3)",marginTop:3}}>{x.modelo==="claude-opus-5-5"?"Analizado con Opus 5.5":x.modelo==="claude-sonnet-5-5"?"Analizado con Sonnet 5.5":x.modelo}</span>}
          {x.aviso && <span style={{display:"block",fontSize:12,color:"var(--red)",marginTop:4}}>⚠ {x.aviso}</span>}
        </span>
        <span style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,fontSize:11.5,color:"var(--text-3)"}}>
          {x.nota!=null && <span>{Math.round(x.medido?.dur||0)} s</span>}
          {x.nota!=null && <span style={{color: x.formato_nuevo?"#4ade80":"#fbbf24"}}>{x.formato_nuevo?"nuevo":"antiguo"}</span>}
        </span>
      </button>
      {abierto && (
        <div style={{padding:"4px 14px 14px 110px",display:"flex",flexDirection:"column",gap:10}}>
          {x.nota!=null && <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:"8px 16px"}}>
            {PARTES.map(([k,l])=>(
              <div key={k} style={{fontSize:12,color:"var(--text-2)"}}>{l} · {(x.partes?.[k]??0).toFixed(1)}<Barra v={x.partes?.[k]||0}/></div>
            ))}
          </div>}
          <div style={{display:"flex",flexWrap:"wrap",gap:6,alignItems:"center"}}>
            {x.nota!=null && ((x.temas||[]).length ? x.temas.map(t=><span key={t} style={{fontSize:11.5,padding:"2px 9px",borderRadius:999,background:"var(--border)",color:"var(--text-2)"}}>{TEMA[t]||t}</span>)
              : <span style={{fontSize:11.5,color:"var(--text-3)"}}>tema neutro</span>)}
            {x.nota!=null && <span style={{fontSize:11.5,color:"var(--text-3)"}}>· tema ×{(x.multiplicador||1).toFixed(2)}</span>}
            <span style={{marginLeft:"auto",display:"flex",gap:6,flexWrap:"wrap"}}>
              {sub && sub.id && <a href={"https://www.youtube.com/shorts/"+sub.id} target="_blank" rel="noreferrer" style={{fontSize:12,fontWeight:600,color:"var(--text-2)",border:"1px solid var(--border)",borderRadius:8,padding:"5px 10px"}}>Ver en YouTube</a>}
              {window.studioFS?.rankingSubido && <button onClick={()=>onSubido(x, !sub)} style={{fontSize:12,fontWeight:600,color:sub?"var(--text-2)":"#4ade80",border:"1px solid var(--border)",borderRadius:8,padding:"5px 10px"}}>{sub?"No está subido":"✓ Marcar como subido"}</button>}
              {window.studioFS?.rankingAbrir && <button onClick={()=>window.studioFS.rankingAbrir(x.carpeta)} style={{fontSize:12,fontWeight:600,color:"var(--gold)",border:"1px solid var(--border)",borderRadius:8,padding:"5px 10px"}}>Abrir carpeta</button>}
            </span>
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
          <span style={{width:1,height:24,background:"var(--border)"}}/>
          {[["todos","Todos"],["nuevo","Formato nuevo"],["antiguo","Antiguo"]].map(([k,l])=>(
            <button key={k} onClick={()=>setFiltro(k)} style={boton(filtro===k)}>{l}</button>
          ))}
          {enPC && <button onClick={()=>verificar(false)} disabled={verificando} title="Busca en tu canal los Shorts ya subidos comparando las miniaturas" style={{...boton(false),opacity:verificando?.6:1}}>{verificando?"Comprobando YouTube…":"Comprobar subidos"}</button>}
          <span style={{fontSize:12,color:"var(--text-3)"}}>{datos.ranking.filter(x=>x.nota!=null).length} con nota · {pendientes} sin analizar</span>
        </div>
      )}

      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {lista.map(x=><Fila key={x.carpeta} x={x} abierto={abierto===x.carpeta} onToggle={()=>setAbierto(a=>a===x.carpeta?null:x.carpeta)} onSubido={marcarSubido}/>)}
        {datos && !lista.length && !prog && (
          <div style={{padding:"40px 20px",textAlign:"center",color:"var(--text-3)",border:"1px dashed var(--border)",borderRadius:14,fontSize:13}}>
            {datos.ranking.length ? "Ningún Short coincide con la búsqueda." : "Todavía no hay ningún Short analizado: pulsa «Analizar» para empezar."}
          </div>
        )}
      </div>
    </div>
  );
}
