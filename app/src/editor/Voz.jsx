import React from "react";
import { fileUrl } from "./Vista";
const { useState, useRef, useEffect } = React;

/* RandomEditor · VOCES y VOZ (31/10/2026).
   Él: "texto a voz con voces naturales para un público de 10 a 25 años, varias para elegir, con la velocidad y
   que el tono cambie con ella como en CapCut", "mejorar la voz como CapCut" y "aislar la voz".
   Las voces son propias (modelos abiertos en su gráfica, sin clonar a nadie): clon/locucion.py. */

const fila = { display:"flex", alignItems:"center", justifyContent:"space-between", gap:6 };
const MUESTRA = n => `Hola, soy ${n}. Así sueno en tus vídeos: ¡dale like y suscríbete!`;

// la pestaña «Voces» de la biblioteca: escribir, elegir voz, velocidad y tono, y a la línea en la vara
export function PanelVoces({ info, generar, onMeter }) {
  const [texto, setTexto] = useState(()=>{ try { return localStorage.getItem("red_tts_texto") || ""; } catch(e){ return ""; } });
  const [voz, setVoz] = useState(()=>{ try { return localStorage.getItem("red_tts_voz") || "alex"; } catch(e){ return "alex"; } });
  const [velocidad, setVelocidad] = useState(1.2);
  const [tono, setTono] = useState(false);
  const [ocupado, setOcupado] = useState("");
  const audio = useRef(null);
  useEffect(()=>{ try { localStorage.setItem("red_tts_texto", texto); localStorage.setItem("red_tts_voz", voz); } catch(e){} },[texto, voz]);
  useEffect(()=>()=>{ if(audio.current) audio.current.pause(); },[]);
  if(!info) return <div style={{fontSize:12.5,color:"#888",padding:8}}>Cargando las voces…</div>;
  if(!info.disponible) return <div style={{fontSize:12.5,color:"#888",padding:8}}>Faltan los modelos de voz en RandomClon/_modelos.</div>;
  const oir = async (v) => {
    if(ocupado) return;
    setOcupado("oir_" + v.id);
    try {
      const r = await generar(v.id, MUESTRA(v.nombre));
      if(audio.current) audio.current.pause();
      audio.current = new Audio(fileUrl(r.ruta)); audio.current.playbackRate = velocidad; audio.current.preservesPitch = !tono;
      audio.current.play().catch(()=>{});
    } finally { setOcupado(""); }
  };
  const meter = async () => {
    if(ocupado || !texto.trim()) return;
    setOcupado("meter");
    try {
      const r = await generar(voz, texto);
      const v = info.voces.find(x=>x.id===voz) || {nombre:voz};
      onMeter({ ruta:r.ruta, dur:r.dur, nombre:`🗣 ${v.nombre}: ${texto.trim().slice(0, 40)}` }, velocidad, tono, r.aviso);
    } finally { setOcupado(""); }
  };
  const lenta = !(info.voces.find(x=>x.id===voz) || {}).rapida;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:8,padding:"2px 0"}}>
      <textarea value={texto} onChange={e=>setTexto(e.target.value)} onKeyDown={e=>e.stopPropagation()} rows={4} maxLength={1500}
        placeholder="Escribe lo que tiene que decir la voz…" style={{width:"100%",resize:"vertical",fontSize:13,padding:8,borderRadius:8,border:"1px solid #333",background:"#111",color:"#eee",fontFamily:"inherit"}}/>
      <div style={{fontSize:10.5,fontWeight:700,color:"#888",letterSpacing:0.4}}>VOZ</div>
      {info.voces.map(v=><div key={v.id} onClick={()=>setVoz(v.id)} className={"rd-fila"+(voz===v.id?" on":"")}
        style={{display:"flex",alignItems:"center",gap:8,padding:"6px 8px",borderRadius:8,cursor:"pointer",border:"1px solid "+(voz===v.id?"#D4AF37":"#2a2a2a"),background:voz===v.id?"rgba(212,175,55,0.08)":"transparent"}}>
        <button onClick={e=>{ e.stopPropagation(); oir(v); }} disabled={!!ocupado} className="rd-ico" style={{width:26,height:26,fontSize:11}} title="Escuchar una muestra">{ocupado==="oir_"+v.id ? "…" : "▶"}</button>
        <div style={{minWidth:0}}><div style={{fontSize:12.5,fontWeight:650,color:"#eee"}}>{v.nombre}</div><div style={{fontSize:10.5,color:"#888"}}>{v.que}</div></div>
      </div>)}
      <span style={{...fila,fontSize:12,marginTop:4}}>Velocidad<span style={{color:"#999"}}>{velocidad.toFixed(2)}x</span></span>
      <input type="range" min={0.5} max={2} step={0.05} value={velocidad} onChange={e=>setVelocidad(Number(e.target.value))} onDoubleClick={()=>setVelocidad(1)}/>
      <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{[0.8, 1, 1.2, 1.5].map(x=><button key={x} onClick={()=>setVelocidad(x)} className={"rd-chip"+(Math.abs(velocidad - x) < 0.01 ? " on" : "")}>{x}x</button>)}</div>
      <label style={{...fila,fontSize:12,cursor:"pointer"}}><span>Cambiar el tono con la velocidad<div style={{fontSize:10.5,color:"#888"}}>Como en CapCut: más rápido, más agudo</div></span>
        <input type="checkbox" checked={tono} onChange={e=>setTono(e.target.checked)}/></label>
      <button onClick={meter} disabled={!!ocupado || !texto.trim()} className="rd-btn primario" style={{marginTop:4}}
        title="Genera la voz y la mete en una pista de audio, en el cabezal (luego se cambia como cualquier audio)">
        {ocupado==="meter" ? (lenta ? "Generando… (las animadas tardan ~10 s por frase)" : "Generando…") : "Añadir en el cabezal"}</button>
    </div>);
}

// en Propiedades › Básico de un clip con sonido: «Mejorar voz» (0-100) y «Aislar la voz»
export function SeccionVoz({ c, procesar, cambiarClip, toast }) {
  const [mejorar, setMejorar] = useState((c.voz && c.voz.mejorar) ?? 60);
  const [aislar, setAislar] = useState(!!(c.voz && c.voz.aislar));
  const [ocupado, setOcupado] = useState(false);
  useEffect(()=>{ setMejorar((c.voz && c.voz.mejorar) ?? 60); setAislar(!!(c.voz && c.voz.aislar)); },[c.id]);
  const aplicado = c.voz && c.voz.ruta;
  const cambio = aplicado && (c.voz.mejorar !== mejorar || !!c.voz.aislar !== aislar);
  const aplicar = async () => {
    if(ocupado) return;
    if(!mejorar && !aislar){ cambiarClip({...c, voz:null}); return; }
    setOcupado(true);
    try {
      const r = await procesar(c.ruta, mejorar, aislar);
      cambiarClip({...c, voz:{ mejorar, aislar, ruta:r.ruta }});
      toast && toast(aislar ? "Voz aislada" + (mejorar ? " y mejorada" : "") : "Voz mejorada");
    } catch(e){ toast && toast(e.message); }
    finally { setOcupado(false); }
  };
  return (
    <div style={{display:"flex",flexDirection:"column",gap:6,borderTop:"1px solid #222",paddingTop:8}}>
      <div style={{fontSize:10.5,fontWeight:700,color:"#888",letterSpacing:0.4}}>VOZ{aplicado ? " · aplicada" : ""}</div>
      <span style={{...fila,fontSize:12}}>Mejorar voz<span style={{color:"#999"}}>{mejorar ? mejorar : "no"}</span></span>
      <input type="range" min={0} max={100} step={5} value={mejorar} onChange={e=>setMejorar(Number(e.target.value))}
        title="Quita ruido y barro, da presencia, suaviza las eses y comprime (como «Mejorar voz» de CapCut)"/>
      <label style={{...fila,fontSize:12,cursor:"pointer"}}><span>Aislar la voz<div style={{fontSize:10.5,color:"#888"}}>Quita la música, el juego y el ruido (tarda un poco)</div></span>
        <input type="checkbox" checked={aislar} onChange={e=>setAislar(e.target.checked)}/></label>
      <div style={{display:"flex",gap:6}}>
        <button onClick={aplicar} disabled={ocupado || (aplicado && !cambio)} className="rd-btn" style={{flex:1}}>{ocupado ? "Procesando…" : aplicado ? "Aplicar cambios" : "Aplicar"}</button>
        {aplicado && <button onClick={()=>cambiarClip({...c, voz:null})} disabled={ocupado} className="rd-btn" title="Volver al sonido original">Quitar</button>}
      </div>
    </div>);
}
