import React from "react";
import { I } from "./iconos";
import { fileUrl } from "./Vista";
import { corto } from "./modelo";
const { useState, useRef, useEffect, memo } = React;

/* RandomEditor · la biblioteca: sus Clips Recortados, la Música por género y los SFX por categoría
   (clon/biblioteca.py los ordena sin moverlos). Se escuchan antes de meterlos; se meten con ＋ o
   arrastrándolos a la línea de tiempo, justo donde se sueltan. */
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

export function Biblioteca({ medios, biblio, onMeter, onArchivos }) {
  const [pestana, setPestana] = useState("clips");
  const [cat, setCat] = useState("");
  const [busca, setBusca] = useState("");
  const [oyendo, setOyendo] = useState(null);
  const oido = useRef(null);
  useEffect(()=>()=>{ if(oido.current) oido.current.pause(); },[]);
  const oir = m => {
    if(!oido.current) oido.current = new Audio();
    const a = oido.current;
    if(oyendo===m.ruta){ a.pause(); setOyendo(null); return; }
    a.src = fileUrl(m.ruta); a.currentTime = 0; a.volume = 0.8; a.play().catch(()=>{}); setOyendo(m.ruta);
    a.onended = () => setOyendo(null);
  };
  const lista = pestana==="clips" ? (medios ? medios.clips : null) : (biblio ? (pestana==="musica" ? biblio.musica : biblio.sfx) : null);
  const cats = pestana==="sfx" ? (biblio ? biblio.categorias_sfx : []) : pestana==="musica" ? (biblio ? biblio.generos : []) : [];
  const q = busca.trim().toLowerCase();
  const filtrada = (lista||[]).filter(m=>(!cat || m.categoria===cat) && (!q || m.nombre.toLowerCase().includes(q)));
  return (
    <div className="rd-panel" style={{display:"flex",flexDirection:"column",minHeight:0,height:"100%"}}>
      <div style={{display:"flex",gap:4,padding:8,borderBottom:"1px solid #2a2a2a"}}>
        {[["clips","Clips"],["musica","Música"],["sfx","SFX"]].map(([k,l])=><button key={k} onClick={()=>{ setPestana(k); setCat(""); }} className={"rd-tab"+(pestana===k?" on":"")}>{l}</button>)}
        <button onClick={onArchivos} className="rd-ico" title="Meter archivos del disco (Ctrl+I)">{I.archivo}</button>
      </div>
      <input value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Buscar…" className="rd-input" style={{margin:"8px 8px 4px"}}/>
      {cats.length>0 && <div style={{display:"flex",gap:4,flexWrap:"wrap",padding:"4px 8px",maxHeight:96,overflowY:"auto"}}>
        <button onClick={()=>setCat("")} className={"rd-chip"+(!cat?" on":"")}>Todo</button>
        {cats.map(x=><button key={x} onClick={()=>setCat(x)} className={"rd-chip"+(cat===x?" on":"")}>{x} · {(lista||[]).filter(m=>m.categoria===x).length}</button>)}
      </div>}
      <div style={{overflowY:"auto",flex:1,padding:"4px 8px 8px",display:"flex",flexDirection:"column",gap:4}}>
        {lista===null && <div style={{fontSize:12.5,color:"#888",padding:8}}>{pestana==="clips" ? "Cargando los clips…" : "Ordenando la biblioteca…"}</div>}
        {filtrada.slice(0,400).map(m=><Fila key={m.ruta} m={m} pestana={pestana} oyendo={oyendo===m.ruta} onOir={oir} onMeter={onMeter} cat={cat}/>)}
        {lista && !filtrada.length && <div style={{fontSize:12.5,color:"#888",padding:8}}>Nada coincide.</div>}
      </div>
    </div>);
}
