import React from "react";
import { I } from "./iconos";
import { fileUrl } from "./Vista";
import { corto } from "./modelo";
import { familiaCss } from "./Textos";
const { useState, useRef, useEffect, memo } = React;

/* RandomEditor · la biblioteca: sus Clips Recortados (las recopilaciones arriba, como carpetas),
   la Música por género, los SFX por categoría, los TEXTOS (normal y el de los títulos) y, preparados
   para lo que venga, Stickers y Efectos. Lo de audio se escucha antes de meterlo; todo se mete con ＋
   o arrastrándolo a la línea de tiempo, justo donde se suelta. */
const PESTANAS = [["clips","Clips",I.archivo],["musica","Música",I.oir],["sfx","SFX",I.sonido],["texto","Texto",I.texto],["stickers","Stickers",I.sticker],["efectos","Efectos",I.efecto]];

const Fila = memo(function Fila({ m, pestana, oyendo, onOir, onMeter, cat }) {
  return (
    <div data-medio draggable onDragStart={e=>{ e.dataTransfer.setData("application/x-randomeditor", JSON.stringify(m)); e.dataTransfer.effectAllowed = "copy"; }}
      className="rd-medio" title="Arrástralo a la línea de tiempo o pulsa ＋">
      {pestana==="clips" ? <div style={{width:30,height:52,borderRadius:4,background:m.mini?`#111 url("${fileUrl(m.mini)}") center/cover`:"#111",flexShrink:0}}/>
        : <button onClick={()=>onOir(m)} className={"rd-ico"+(oyendo?" on":"")} style={{width:26,height:26}} title="Escuchar">{oyendo ? I.parar : I.oir}</button>}
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:12,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.nombre}</div>
        <div style={{fontSize:10.5,color:"#8a8a8a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
          {m.dur!=null ? corto(m.dur) : ""}{m.bpm ? ` · ${Math.round(m.bpm)} bpm` : ""}{m.animo ? ` · ${m.animo}` : ""}{pestana==="musica" && m.segura ? " · sin copyright" : ""}{pestana==="sfx" && !cat ? ` · ${m.categoria}` : ""}</div>
      </div>
      <button onClick={()=>onMeter(m, pestana==="clips"?"video":"audio")} className="rd-ico" style={{width:28,height:28}} title={pestana==="clips"?"Al final de la pista principal":"En el cabezal"}>{I.mas}</button>
    </div>);
});

// una recopilación: una carpeta (como en el explorador); se abre para ver sus clips
function Carpeta({ r, onAbrir }) {
  return (
    <button onClick={()=>onAbrir(r)} className="rd-medio" style={{textAlign:"left",cursor:"pointer",width:"100%"}} title="Abrir la recopilación">
      <div style={{width:30,height:30,display:"flex",alignItems:"center",justifyContent:"center",color:"var(--gold)",flexShrink:0}}>{I.carpeta}</div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:12,fontWeight:650,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:"#eee"}}>{r.n} · {r.nombre}</div>
        <div style={{fontSize:10.5,color:"#8a8a8a"}}>{r.clips.length} clip{r.clips.length!==1?"s":""} · {corto(r.clips.reduce((a,c)=>a+(c.dur||0),0))}</div>
      </div>
      <span style={{color:"#777",fontSize:16,paddingRight:4}}>›</span>
    </button>);
}

// los textos que se pueden meter: el normal y el de los títulos de los Shorts
function Textos({ presets, onTexto }) {
  if(!presets) return <div style={{fontSize:12.5,color:"#888",padding:8}}>Cargando…</div>;
  const items = [
    { id:"titulo", nombre:"Título", ayuda:"Como los títulos de los Shorts: en la línea cámara/juego, una línea, contorno y sombra", estilo:presets.titulo, muestra:"Título del Short 😭" },
    { id:"normal", nombre:"Texto", ayuda:"Un texto normal en el centro (cámbiale lo que quieras)", estilo:presets.normal, muestra:"Texto" },
  ];
  return items.map(it=>(
    <div key={it.id} data-medio draggable onDragStart={e=>{ e.dataTransfer.setData("application/x-randomeditor", JSON.stringify({texto:it.id, nombre:it.nombre})); e.dataTransfer.effectAllowed = "copy"; }}
      className="rd-medio" title={it.ayuda} style={{flexDirection:"column",alignItems:"stretch",padding:8,gap:6}}>
      <div style={{height:58,borderRadius:6,background:"repeating-linear-gradient(45deg,#1b1b1b 0 10px,#202020 10px 20px)",display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"}}>
        <span style={{fontFamily:familiaCss(it.estilo.fuente),fontSize:it.id==="titulo"?22:24,color:it.estilo.color,whiteSpace:"nowrap",
          WebkitTextStroke:`${Math.max(2, it.estilo.borde/4)}px ${it.estilo.color_borde}`,paintOrder:"stroke fill",filter:it.estilo.sombra?"drop-shadow(1px 2px 0 rgba(0,0,0,.6))":undefined}}>{it.muestra}</span>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:6}}>
        <div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:650}}>{it.nombre}</div><div style={{fontSize:10.5,color:"#8a8a8a",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{it.ayuda}</div></div>
        <button onClick={()=>onTexto(it.id)} className="rd-ico" style={{width:28,height:28}} title="En el cabezal (Ctrl+T: texto normal)">{I.mas}</button>
      </div>
    </div>));
}

export function Biblioteca({ medios, biblio, presets, onMeter, onArchivos, onTexto, onMeterTodos }) {
  const [pestana, setPestana] = useState(()=>{ try { return localStorage.getItem("red_pestana") || "clips"; } catch(e){ return "clips"; } });
  const [cat, setCat] = useState("");
  const [busca, setBusca] = useState("");
  const [oyendo, setOyendo] = useState(null);
  const [recop, setRecop] = useState(null);         // la recopilación abierta
  const oido = useRef(null);
  useEffect(()=>()=>{ if(oido.current) oido.current.pause(); },[]);
  useEffect(()=>{ try { localStorage.setItem("red_pestana", pestana); } catch(e){} },[pestana]);
  const oir = m => {
    if(!oido.current) oido.current = new Audio();
    const a = oido.current;
    if(oyendo===m.ruta){ a.pause(); setOyendo(null); return; }
    a.src = fileUrl(m.ruta); a.currentTime = 0; a.volume = 0.8; a.play().catch(()=>{}); setOyendo(m.ruta);
    a.onended = () => setOyendo(null);
  };
  const deAudio = pestana==="musica" || pestana==="sfx";
  const lista = pestana==="clips" ? (medios ? (recop ? recop.clips : medios.clips) : null) : deAudio ? (biblio ? (pestana==="musica" ? biblio.musica : biblio.sfx) : null) : [];
  const cats = pestana==="sfx" ? (biblio ? biblio.categorias_sfx : []) : pestana==="musica" ? (biblio ? biblio.generos : []) : [];
  const q = busca.trim().toLowerCase();
  const filtrada = (lista||[]).filter(m=>(!cat || m.categoria===cat) && (!q || m.nombre.toLowerCase().includes(q)));
  const carpetas = pestana==="clips" && !recop && medios ? (medios.recopilaciones || []).filter(r=>!q || r.nombre.toLowerCase().includes(q) || r.clips.some(c=>c.nombre.toLowerCase().includes(q))) : [];
  const vacio = (icono, txt) => <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:10,padding:"36px 12px",color:"#777",fontSize:12.5,textAlign:"center"}}>
    <div style={{transform:"scale(1.8)",opacity:0.6}}>{icono}</div>{txt}</div>;
  return (
    <div className="rd-panel" style={{display:"flex",flexDirection:"column",minHeight:0,height:"100%"}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(6, 1fr)",gap:2,padding:6,borderBottom:"1px solid #2a2a2a"}}>
        {PESTANAS.map(([k,l,ic])=><button key={k} onClick={()=>{ setPestana(k); setCat(""); setRecop(null); }} className={"rd-tab"+(pestana===k?" on":"")} title={l}
          style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,padding:"5px 0",fontSize:10.5}}>{ic}<span>{l}</span></button>)}
      </div>
      {(pestana==="clips" || deAudio) && <div style={{display:"flex",gap:6,padding:"8px 8px 4px"}}>
        <input value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Buscar…" className="rd-input" style={{flex:1,minWidth:0}}/>
        <button onClick={onArchivos} className="rd-ico" title="Meter archivos del disco (Ctrl+I)">{I.archivo}</button>
      </div>}
      {recop && <div style={{display:"flex",gap:6,margin:"4px 8px"}}>
        <button onClick={()=>setRecop(null)} className="rd-btn" style={{flex:1,minWidth:0,justifyContent:"flex-start",overflow:"hidden"}} title="Volver a todos los clips">‹ {recop.n} · {recop.nombre}</button>
        <button onClick={()=>onMeterTodos(recop)} className="rd-btn primario" title="Todos los momentos, seguidos y en tu orden, al final de la pista principal">Meter todos en orden</button>
      </div>}
      {cats.length>0 && <div style={{display:"flex",gap:4,flexWrap:"wrap",padding:"4px 8px",maxHeight:96,overflowY:"auto"}}>
        <button onClick={()=>setCat("")} className={"rd-chip"+(!cat?" on":"")}>Todo</button>
        {cats.map(x=><button key={x} onClick={()=>setCat(x)} className={"rd-chip"+(cat===x?" on":"")}>{x} · {(lista||[]).filter(m=>m.categoria===x).length}</button>)}
      </div>}
      <div style={{overflowY:"auto",flex:1,padding:"4px 8px 8px",display:"flex",flexDirection:"column",gap:4}}>
        {pestana==="texto" && <Textos presets={presets} onTexto={onTexto}/>}
        {pestana==="stickers" && vacio(I.sticker, "Aquí irán los stickers. Próximamente.")}
        {pestana==="efectos" && vacio(I.efecto, "Aquí irán los efectos. Próximamente.")}
        {(pestana==="clips" || deAudio) && lista===null && <div style={{fontSize:12.5,color:"#888",padding:8}}>{pestana==="clips" ? "Cargando los clips…" : "Ordenando la biblioteca…"}</div>}
        {carpetas.length>0 && <>
          <div style={{fontSize:10.5,fontWeight:700,color:"#888",letterSpacing:0.4,padding:"4px 2px 0"}}>RECOPILACIONES</div>
          {carpetas.map(r=><Carpeta key={r.carpeta} r={r} onAbrir={x=>{ setRecop(x); setBusca(""); }}/>)}
          <div style={{fontSize:10.5,fontWeight:700,color:"#888",letterSpacing:0.4,padding:"8px 2px 0"}}>CLIPS</div>
        </>}
        {(pestana==="clips" || deAudio) && filtrada.slice(0,400).map(m=><Fila key={m.ruta} m={m} pestana={pestana==="clips"?"clips":pestana} oyendo={oyendo===m.ruta} onOir={oir} onMeter={onMeter} cat={cat}/>)}
        {(pestana==="clips" || deAudio) && lista && !filtrada.length && !carpetas.length && <div style={{fontSize:12.5,color:"#888",padding:8}}>Nada coincide.</div>}
      </div>
    </div>);
}
