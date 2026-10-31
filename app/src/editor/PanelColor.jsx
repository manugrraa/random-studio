import React from "react";
import { AJUSTES, COLOR0, FILTROS, colorDe } from "./color";

/* RandomEditor · la pestaña COLOR de propiedades: los filtros (con su intensidad) y todos los ajustes */
export function PanelColor({ c, alGesto, cambiarClip }) {
  const e = {...COLOR0, ...(c.color || {})}, f = c.filtro || null;
  const fila = { display:"flex", alignItems:"center", justifyContent:"space-between", gap:6 };
  return (
    <div style={{display:"flex",flexDirection:"column",gap:9}}>
      <div style={{fontSize:10.5,fontWeight:700,color:"#888",letterSpacing:0.4}}>FILTROS</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3, 1fr)",gap:5}}>
        <button onClick={()=>cambiarClip({...c, filtro:null})} className={"rd-chip"+(!f ? " on" : "")} style={{padding:"6px 2px"}}>Ninguno</button>
        {Object.entries(FILTROS).map(([id, x])=><button key={id} onClick={()=>cambiarClip({...c, filtro:{id, intensidad:(f && f.intensidad) ?? 1}})}
          className={"rd-chip"+(f && f.id===id ? " on" : "")} style={{padding:"6px 2px"}}>{x.nombre}</button>)}
      </div>
      {f && <label style={{display:"flex",flexDirection:"column",gap:3,fontSize:12}}><span style={fila}>Intensidad<span style={{color:"#999"}}>{Math.round((f.intensidad ?? 1) * 100)} %</span></span>
        <input type="range" min={0} max={2} step={0.01} value={f.intensidad ?? 1} onPointerDown={()=>alGesto("inicio")} onPointerUp={()=>alGesto("fin")}
          onChange={ev=>cambiarClip({...c, filtro:{...f, intensidad:Number(ev.target.value)}}, true)}/></label>}
      <div style={{fontSize:10.5,fontWeight:700,color:"#888",letterSpacing:0.4,marginTop:4}}>AJUSTES</div>
      {AJUSTES.map(([k, n, a, b, st, fmt])=>(
        <label key={k} style={{display:"flex",flexDirection:"column",gap:3,fontSize:12}}>
          <span style={fila}>{n}<span style={{color:"#999"}}>{fmt ? fmt(e[k]) : Math.round(e[k])}</span></span>
          <input type="range" min={a} max={b} step={st} value={e[k]} onPointerDown={()=>alGesto("inicio")} onPointerUp={()=>alGesto("fin")}
            onChange={ev=>cambiarClip({...c, color:{...(c.color || {}), [k]:Number(ev.target.value)}}, true)}
            onDoubleClick={()=>cambiarClip({...c, color:{...(c.color || {}), [k]:COLOR0[k]}})} title="Doble clic: a cero"/>
        </label>))}
      <button onClick={()=>cambiarClip({...c, color:{}, filtro:null})} className="rd-btn" style={{justifyContent:"center"}}>Restablecer el color</button>
    </div>);
}
