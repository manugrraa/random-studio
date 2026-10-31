import React from "react";
import { valorEn, TRANS0, CURVAS, largo, vel } from "./modelo";
const { useState, useEffect, useRef } = React;

/* RandomEditor · TRANSFORMAR y animar (31/10, él: "que se puedan aumentar y reducir los clips y todo lo
   visual, moverlos en X e Y con líneas que ayuden, como en CapCut o Photoshop: si pasa por el centro o por
   las esquinas, un imán que lo acomoda perfecto"; "curvas en los cambios: aceleración, desaceleración o las
   dos, desde propiedades"; "aumentar o reducir la velocidad, con flujo óptico a cámara lenta").
   Unidades: x, y en píxeles del lienzo desde el centro; escala 1 = encajado (como al meterlo); rot en grados. */

export const PROPS = [["escala","Escala",0.05,5,0.01,v=>Math.round(v*100)+" %"],["x","Posición X",-2000,2000,1,v=>Math.round(v)+" px"],
  ["y","Posición Y",-3000,3000,1,v=>Math.round(v)+" px"],["rot","Giro",-180,180,0.5,v=>v.toFixed(1)+"°"],["opacidad","Opacidad",0,1,0.01,v=>Math.round(v*100)+" %"]];
export const NOMBRE_CURVA = { lineal:"Lineal", entrada:"Aceleración", salida:"Desaceleración", ambas:"Las dos" };

// el CSS del vídeo en ese instante (k = píxeles de pantalla por píxel del lienzo)
export const transformCss = (c, tRel, k) =>
  `translate(${valorEn(c,"x",tRel) * k}px, ${valorEn(c,"y",tRel) * k}px) rotate(${valorEn(c,"rot",tRel)}deg) scale(${valorEn(c,"escala",tRel)})`;

// poner una propiedad: con fotogramas clave, se cambia (o se añade) el del cabezal; sin ellos, el valor fijo
export function ponerProp(c, prop, v, tRel) {
  const kf = (c.kf || {})[prop];
  if(kf && kf.length){
    const i = kf.findIndex(x=>Math.abs(x[0] - tRel) < 0.02);
    const n = i >= 0 ? kf.map((x, j)=>j === i ? [x[0], v, x[2]] : x) : [...kf, [+tRel.toFixed(4), v, "lineal"]].sort((a,b)=>a[0]-b[0]);
    return {...c, kf:{...c.kf, [prop]:n}};
  }
  return {...c, transform:{...(c.transform || {}), [prop]:v}};
}
export const kfEn = (c, prop, tRel) => ((c.kf || {})[prop] || []).find(x=>Math.abs(x[0] - tRel) < 0.02);
export function alternarKf(c, prop, tRel) {
  const kf = (c.kf || {})[prop] || [];
  const ya = kfEn(c, prop, tRel);
  const n = ya ? kf.filter(x=>x !== ya) : [...kf, [+tRel.toFixed(4), valorEn(c, prop, tRel), "lineal"]].sort((a,b)=>a[0]-b[0]);
  // (al quitar el último, el valor que tenía se queda fijo)
  return {...c, kf:{...(c.kf || {}), [prop]:n}, ...(n.length ? {} : {transform:{...(c.transform || {}), [prop]:valorEn(c, prop, tRel)}})};
}
export const curvaKf = (c, prop, tRel, curva) => ({...c, kf:{...c.kf, [prop]:(c.kf[prop] || []).map(x=>Math.abs(x[0] - tRel) < 0.02 ? [x[0], x[1], curva] : x)}});

// ---- en la previsualización: el recuadro del clip elegido (mover, escalar, girar) con guías e imán
export function Transformador({ c, tRel, W, H, k, natural, onGesto, cambiarClip }) {
  const guiaV = useRef(null), guiaH = useRef(null);
  if(!c || !natural || !natural[0]) return null;
  const s0 = Math.min(W / natural[0], H / natural[1]);
  const fw = natural[0] * s0, fh = natural[1] * s0;                      // encajado (escala 1)
  const esc = valorEn(c, "escala", tRel), x = valorEn(c, "x", tRel), y = valorEn(c, "y", tRel), rot = valorEn(c, "rot", tRel);
  const w = fw * esc, h = fh * esc, cx = W / 2 + x, cy = H / 2 + y;
  const llenar = Math.max(W / fw, H / fh);
  const umbral = 8 / k;                                                  // 8 px de pantalla
  const guias = (vs, hs) => {
    if(guiaV.current){ guiaV.current.style.display = vs.length ? "block" : "none"; if(vs.length) guiaV.current.style.left = vs[0] * k + "px"; }
    if(guiaH.current){ guiaH.current.style.display = hs.length ? "block" : "none"; if(hs.length) guiaH.current.style.top = hs[0] * k + "px"; }
  };
  const arrastrar = (e, modo) => {
    if(e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const x0 = e.clientX, y0 = e.clientY, caja = e.currentTarget.closest("[data-lienzo]").getBoundingClientRect();
    const centroPant = [caja.left + cx * k, caja.top + cy * k];
    const d0 = Math.hypot(x0 - centroPant[0], y0 - centroPant[1]), a0 = Math.atan2(y0 - centroPant[1], x0 - centroPant[0]);
    let movido = false;
    const mover = ev => {
      if(!movido){ movido = true; onGesto("inicio"); }
      let n = c;
      if(modo === "mover"){
        let nx = x + (ev.clientX - x0) / k, ny = y + (ev.clientY - y0) / k;
        const vs = [], hs = [];
        // imán (Alt: sin imán): el centro al centro, y los bordes a los bordes y al centro del lienzo
        if(!ev.altKey){
          for(const [cand, ref] of [[W/2 + nx, W/2], [W/2 + nx - w/2, 0], [W/2 + nx + w/2, W], [W/2 + nx - w/2, W/2], [W/2 + nx + w/2, W/2]])
            if(Math.abs(cand - ref) < umbral){ nx += ref - cand; vs.push(ref); break; }
          for(const [cand, ref] of [[H/2 + ny, H/2], [H/2 + ny - h/2, 0], [H/2 + ny + h/2, H], [H/2 + ny - h/2, H/2], [H/2 + ny + h/2, H/2]])
            if(Math.abs(cand - ref) < umbral){ ny += ref - cand; hs.push(ref); break; }
        }
        guias(vs, hs);
        n = ponerProp(ponerProp(c, "x", Math.round(nx), tRel), "y", Math.round(ny), tRel);
      } else if(modo === "escala"){
        let ne = esc * Math.hypot(ev.clientX - centroPant[0], ev.clientY - centroPant[1]) / Math.max(1, d0);
        if(!ev.altKey) for(const ref of [1, llenar]) if(Math.abs(ne - ref) * Math.max(fw, fh) * k < 8) ne = ref;    // encajado y llenar
        n = ponerProp(c, "escala", +Math.max(0.05, ne).toFixed(4), tRel);
      } else {
        let nr = rot + (Math.atan2(ev.clientY - centroPant[1], ev.clientX - centroPant[0]) - a0) * 180 / Math.PI;
        nr = ((nr + 540) % 360) - 180;
        if(!ev.altKey) for(const ref of [-180, -90, 0, 90, 180]) if(Math.abs(nr - ref) < 4) nr = ref;
        n = ponerProp(c, "rot", +nr.toFixed(2), tRel);
      }
      cambiarClip(n, true);
    };
    const soltar = () => { window.removeEventListener("mousemove", mover); window.removeEventListener("mouseup", soltar); guias([], []); if(movido) onGesto("fin"); };
    window.addEventListener("mousemove", mover); window.addEventListener("mouseup", soltar);
  };
  const asa = (cur, st) => <div onMouseDown={e=>arrastrar(e, "escala")} style={{position:"absolute",width:12,height:12,background:"#fff",border:"1.5px solid #D4AF37",borderRadius:2,cursor:cur,...st}}/>;
  return <>
    <div ref={guiaV} style={{display:"none",position:"absolute",top:0,bottom:0,borderLeft:"1px solid #f472b6",pointerEvents:"none",zIndex:6}}/>
    <div ref={guiaH} style={{display:"none",position:"absolute",left:0,right:0,borderTop:"1px solid #f472b6",pointerEvents:"none",zIndex:6}}/>
    <div onMouseDown={e=>arrastrar(e, "mover")} onClick={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()}
      title="Arrástralo para moverlo (se pega al centro y a los bordes; Alt: sin imán) · las esquinas lo escalan · el punto de arriba lo gira"
      style={{position:"absolute",left:(cx - w/2) * k,top:(cy - h/2) * k,width:w * k,height:h * k,transform:`rotate(${rot}deg)`,
        border:"1.5px solid rgba(212,175,55,0.95)",boxSizing:"border-box",cursor:"move",zIndex:5}}>
      {asa("nwse-resize",{left:-7,top:-7})}{asa("nesw-resize",{right:-7,top:-7})}{asa("nesw-resize",{left:-7,bottom:-7})}{asa("nwse-resize",{right:-7,bottom:-7})}
      <div onMouseDown={e=>arrastrar(e, "girar")} title="Girar" style={{position:"absolute",left:"50%",top:-28,width:12,height:12,marginLeft:-6,borderRadius:"50%",background:"#D4AF37",cursor:"grab"}}/>
    </div>
  </>;
}

// ---- en propiedades: transformar (con fotogramas clave y curvas) y la velocidad
export function PanelTransformar({ c, reloj, alGesto, cambiarClip, ir }) {
  const [t, setT] = useState(reloj.t);
  useEffect(()=>{ let ult = 0; return reloj.oir(x=>{ const a = performance.now(); if(a - ult > 90){ ult = a; setT(x); } }); },[reloj]);
  const tRel = Math.max(0, Math.min(largo(c), t - c.en));
  const dentro = t >= c.en && t <= c.en + largo(c);
  const fila = { display:"flex", alignItems:"center", justifyContent:"space-between", gap:6 };
  const kfs = Object.entries(c.kf || {}).flatMap(([pr, l])=>(l || []).map(x=>x[0])).sort((a,b)=>a-b);
  const saltoKf = dir => { const xs = [...new Set(kfs.map(x=>+x.toFixed(3)))]; const d = dir > 0 ? xs.find(x=>x > tRel + 0.01) : [...xs].reverse().find(x=>x < tRel - 0.01); if(d != null) ir(c.en + d); };
  return (
    <div style={{display:"flex",flexDirection:"column",gap:9}}>
      <div style={{...fila,fontSize:10.5,fontWeight:700,color:"#888",letterSpacing:0.4}}>
        <span>TRANSFORMAR{!dentro ? " · pon el cabezal sobre el clip" : ""}</span>
        <span style={{display:"flex",gap:4}}>
          <button onClick={()=>saltoKf(-1)} className="rd-ico" style={{width:22,height:20}} title="Fotograma clave anterior">‹◆</button>
          <button onClick={()=>saltoKf(1)} className="rd-ico" style={{width:22,height:20}} title="Fotograma clave siguiente">◆›</button>
        </span>
      </div>
      {PROPS.map(([pr, n, a, b, st, fmt])=>{
        const v = valorEn(c, pr, tRel), k = kfEn(c, pr, tRel), hay = ((c.kf || {})[pr] || []).length > 0;
        return (
          <div key={pr} style={{display:"flex",flexDirection:"column",gap:3}}>
            <span style={{...fila,fontSize:12}}>
              <span style={{display:"flex",alignItems:"center",gap:6}}>
                <button onClick={()=>cambiarClip(alternarKf(c, pr, tRel))} disabled={!dentro} className="rd-ico" style={{width:20,height:20,color:k ? "var(--gold)" : hay ? "#bbb" : "#555",fontSize:13}}
                  title={k ? "Quitar el fotograma clave del cabezal" : "Fotograma clave en el cabezal (luego mueve el cabezal y cambia el valor: se anima)"}>{k ? "◆" : "◇"}</button>
                {n}
              </span>
              <span style={{color:"#999"}}>{fmt(v)}</span>
            </span>
            <input type="range" min={a} max={b} step={st} value={v} onPointerDown={()=>alGesto("inicio")} onPointerUp={()=>alGesto("fin")}
              onChange={e=>cambiarClip(ponerProp(c, pr, Number(e.target.value), tRel), true)} onDoubleClick={()=>cambiarClip(ponerProp(c, pr, TRANS0[pr], tRel))}/>
            {k && (c.kf[pr] || []).indexOf(k) > 0 && <label style={{...fila,fontSize:11,color:"#aaa"}}>Curva hasta aquí
              <select value={k[2] || "lineal"} onChange={e=>cambiarClip(curvaKf(c, pr, tRel, e.target.value))} className="rd-input" style={{padding:"2px 6px",fontSize:11}}>
                {Object.keys(CURVAS).map(x=><option key={x} value={x}>{NOMBRE_CURVA[x]}</option>)}</select></label>}
          </div>);
      })}
      <div style={{display:"flex",gap:6}}>
        <button onClick={()=>cambiarClip({...c, transform:{...TRANS0}, kf:{}})} className="rd-btn" style={{flex:1,justifyContent:"center"}}>Restablecer</button>
      </div>
    </div>);
}

export function PanelVelocidad({ c, alGesto, cambiarClip }) {
  const v = vel(c), fila = { display:"flex", alignItems:"center", justifyContent:"space-between", gap:6 };
  // deslizador logarítmico: 0,1x … 1x … 10x
  const aPos = x => Math.log10(x), dePos = p => +Math.pow(10, p).toFixed(2);
  return (
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      <div style={{fontSize:10.5,fontWeight:700,color:"#888",letterSpacing:0.4}}>VELOCIDAD</div>
      <span style={{...fila,fontSize:12}}>Velocidad<span style={{color:"#999"}}>{v.toFixed(2)}x · dura {largo(c).toFixed(2)} s</span></span>
      <input type="range" min={-1} max={1} step={0.005} value={aPos(v)} onPointerDown={()=>alGesto("inicio")} onPointerUp={()=>alGesto("fin")}
        onChange={e=>{ let x = dePos(Number(e.target.value)); if(Math.abs(x - 1) < 0.04) x = 1; cambiarClip({...c, velocidad:x}, true); }} onDoubleClick={()=>cambiarClip({...c, velocidad:1})}/>
      <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
        {[0.25, 0.5, 1, 1.5, 2, 3].map(x=><button key={x} onClick={()=>cambiarClip({...c, velocidad:x})} className={"rd-chip"+(Math.abs(v - x) < 0.01 ? " on" : "")}>{x}x</button>)}
      </div>
      <label style={{...fila,fontSize:12,cursor:"pointer"}}><span>Cambiar el tono con la velocidad<div style={{fontSize:10.5,color:"#888"}}>Como en CapCut: más rápido, más agudo</div></span>
        <input type="checkbox" checked={!!c.tono} onChange={e=>cambiarClip({...c, tono:e.target.checked})}/></label>
      <label style={{...fila,fontSize:12,cursor:"pointer",opacity:v < 1 ? 1 : 0.45}}><span>Flujo óptico (cámara lenta suave)<div style={{fontSize:10.5,color:"#888"}}>Inventa los fotogramas que faltan al exportar (tarda más)</div></span>
        <input type="checkbox" checked={!!c.flujo} disabled={v >= 1} onChange={e=>cambiarClip({...c, flujo:e.target.checked})}/></label>
    </div>);
}
