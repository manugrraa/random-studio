import React from "react";
import { transformCss } from "./Transformar";
import { valorEn } from "./modelo";
const { useRef } = React;

/* RandomEditor · MÁSCARAS (31/10, él: "que se puedan crear máscaras de todo tipo y muy precisas, aunque
   haya predefinidas: cuadrados, rectángulos..."). Una máscara es un contorno (lista de puntos en píxeles del
   lienzo) que sale de la MISMA función aquí y en clon/mascara.py: lo que se ve es lo que se exporta.
   Va pegada al clip (si lo mueves o lo escalas, la máscara va con él). */

export const FORMAS = [["rect","Rectángulo"],["redondeado","Redondeado"],["elipse","Elipse"],["lineal","Lineal"],["espejo","Espejo"],
  ["estrella","Estrella"],["corazon","Corazón"],["libre","Libre"]];
export const nuevaMascara = (forma, W, H) => ({ forma, x:0, y:0, w:Math.round(W*0.6), h:Math.round(H*0.35), rot:0, radio:0.25, difuminado:0, invertir:false,
  puntos: forma === "libre" ? [[-W*0.25,-H*0.12],[W*0.25,-H*0.12],[W*0.25,H*0.12],[-W*0.25,H*0.12]].map(p=>p.map(Math.round)) : undefined });

// el contorno en píxeles del lienzo (desde la esquina de arriba a la izquierda)
export function contorno(m, W, H) {
  const cx = W/2 + (m.x || 0), cy = H/2 + (m.y || 0), w = m.w || W*0.6, h = m.h || H*0.35, L = 4 * Math.max(W, H);
  let ps = [];
  if(m.forma === "elipse") ps = Array.from({length:120}, (_, i)=>{ const a = i / 120 * 2 * Math.PI; return [w/2 * Math.cos(a), h/2 * Math.sin(a)]; });
  else if(m.forma === "redondeado"){
    const r = Math.max(0, Math.min(1, m.radio ?? 0.25)) * Math.min(w, h) / 2, q = 16;
    for(const [ex, ey, a0] of [[w/2 - r, -h/2 + r, -Math.PI/2], [w/2 - r, h/2 - r, 0], [-w/2 + r, h/2 - r, Math.PI/2], [-w/2 + r, -h/2 + r, Math.PI]])
      for(let i = 0; i <= q; i++){ const a = a0 + i / q * Math.PI / 2; ps.push([ex + r * Math.cos(a), ey + r * Math.sin(a)]); }
  }
  else if(m.forma === "lineal") ps = [[-L, 0], [L, 0], [L, L], [-L, L]];                 // lo de debajo de la línea
  else if(m.forma === "espejo") ps = [[-L, -h/2], [L, -h/2], [L, h/2], [-L, h/2]];       // una franja
  else if(m.forma === "estrella") ps = Array.from({length:10}, (_, i)=>{ const a = -Math.PI/2 + i * Math.PI / 5, rr = i % 2 ? 0.4 : 1; return [w/2 * rr * Math.cos(a), h/2 * rr * Math.sin(a)]; });
  else if(m.forma === "corazon") ps = Array.from({length:120}, (_, i)=>{ const t = i / 120 * 2 * Math.PI;
    return [w/2 * Math.pow(Math.sin(t), 3), -h/2 * (13*Math.cos(t) - 5*Math.cos(2*t) - 2*Math.cos(3*t) - Math.cos(4*t)) / 16]; });
  else if(m.forma === "libre") ps = (m.puntos || []).map(p=>[p[0] - (m.x || 0), p[1] - (m.y || 0)]);
  else ps = [[-w/2, -h/2], [w/2, -h/2], [w/2, h/2], [-w/2, h/2]];
  const a = (m.rot || 0) * Math.PI / 180, co = Math.cos(a), si = Math.sin(a);
  return ps.map(([x, y])=>[cx + x*co - y*si, cy + x*si + y*co]);
}

const cache = new Map();
export function mascaraCss(c, W, H) {
  const m = c && c.mascara; if(!m || !m.forma) return "";
  const k = JSON.stringify([m, W, H]);
  if(cache.has(k)) return cache.get(k);
  const pts = contorno(m, W, H).map(p=>p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
  const f = m.difuminado > 0 ? `<filter id='d' x='-50%' y='-50%' width='200%' height='200%'><feGaussianBlur stdDeviation='${m.difuminado / 2}'/></filter>` : "";
  const fondo = m.invertir ? "white" : "black", forma = m.invertir ? "black" : "white";
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}' viewBox='0 0 ${W} ${H}'>${f}<rect width='${W}' height='${H}' fill='${fondo}'/>`
    + `<polygon points='${pts}' fill='${forma}'${f ? " filter='url(%23d)'" : ""}/></svg>`;
  const css = `url("data:image/svg+xml;utf8,${svg.replace(/"/g, "'").replace(/</g, "%3C").replace(/>/g, "%3E")}")`;
  if(cache.size > 200) cache.clear();
  cache.set(k, css);
  return css;
}

// ---- en la previsualización: el contorno de la máscara, que se arrastra (y sus puntos, si es libre)
export function EditorMascara({ c, tRel, W, H, k, onGesto, cambiarClip }) {
  const caja = useRef(null);
  const m = c && c.mascara; if(!m || !m.forma) return null;
  const esc = valorEn(c, "escala", tRel), rot = valorEn(c, "rot", tRel) * Math.PI / 180;
  // de un movimiento en pantalla a píxeles del lienzo del clip (deshaciendo su escala y su giro)
  const aLienzo = (dx, dy) => { const u = dx / (k * esc), v = dy / (k * esc); return [u * Math.cos(-rot) - v * Math.sin(-rot), u * Math.sin(-rot) + v * Math.cos(-rot)]; };
  const arrastrar = (e, modo, i) => {
    if(e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const x0 = e.clientX, y0 = e.clientY, m0 = JSON.parse(JSON.stringify(m));
    let movido = false;
    const mover = ev => {
      if(!movido){ movido = true; onGesto("inicio"); }
      const [dx, dy] = aLienzo(ev.clientX - x0, ev.clientY - y0);
      let n = {...m0};
      if(modo === "mover"){ n.x = Math.round(m0.x + dx); n.y = Math.round(m0.y + dy); if(m0.puntos) n.puntos = m0.puntos.map(p=>[Math.round(p[0] + dx), Math.round(p[1] + dy)]); }
      else if(modo === "tam"){ n.w = Math.max(4, Math.round(m0.w + 2 * dx)); n.h = Math.max(4, Math.round(m0.h + 2 * dy)); }
      else if(modo === "punto"){ n.puntos = m0.puntos.map((p, j)=>j === i ? [Math.round(p[0] + dx), Math.round(p[1] + dy)] : p); }
      cambiarClip({...c, mascara:n}, true);
    };
    const soltar = () => { window.removeEventListener("mousemove", mover); window.removeEventListener("mouseup", soltar); if(movido) onGesto("fin"); };
    window.addEventListener("mousemove", mover); window.addEventListener("mouseup", soltar);
  };
  // libre: un clic en el lienzo (fuera de los puntos) añade un punto ahí
  const anadir = e => {
    if(m.forma !== "libre" || e.button !== 0 || e.target !== e.currentTarget) return;
    e.stopPropagation();
    const r = caja.current.getBoundingClientRect();
    const [dx, dy] = aLienzo(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
    cambiarClip({...c, mascara:{...m, puntos:[...(m.puntos || []), [Math.round(dx), Math.round(dy)]]}});
  };
  const pts = contorno(m, W, H), cx = W/2 + (m.x || 0), cy = H/2 + (m.y || 0);
  const R = 7 / (k * esc);
  return (
    <div ref={caja} style={{position:"absolute",inset:0,transform:transformCss(c, tRel, k),zIndex:5,pointerEvents:"none"}}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={{overflow:"visible",pointerEvents:m.forma === "libre" ? "auto" : "none",cursor:m.forma === "libre" ? "crosshair" : "default"}}
        onMouseDown={anadir} onClick={e=>e.stopPropagation()}>
        <polygon points={pts.map(p=>p.join(",")).join(" ")} fill="rgba(212,175,55,0.08)" stroke="#D4AF37" strokeWidth={1.5 / (k * esc)} strokeDasharray={`${6/(k*esc)} ${4/(k*esc)}`}
          style={{pointerEvents:"auto",cursor:"move"}} onMouseDown={e=>arrastrar(e, "mover")}/>
        {m.forma === "libre" ? (m.puntos || []).map((p, i)=><circle key={i} cx={W/2 + p[0]} cy={H/2 + p[1]} r={R} fill="#fff" stroke="#D4AF37" strokeWidth={2/(k*esc)}
            style={{pointerEvents:"auto",cursor:"grab"}} onMouseDown={e=>arrastrar(e, "punto", i)}
            onDoubleClick={e=>{ e.stopPropagation(); cambiarClip({...c, mascara:{...m, puntos:m.puntos.filter((_, j)=>j !== i)}}); }}/>)
          : !["lineal"].includes(m.forma) && <circle cx={cx + (m.w||0)/2} cy={cy + (m.forma === "espejo" ? 0 : (m.h||0)/2)} r={R} fill="#fff" stroke="#D4AF37" strokeWidth={2/(k*esc)}
              style={{pointerEvents:"auto",cursor:"nwse-resize"}} onMouseDown={e=>arrastrar(e, "tam")}/>}
      </svg>
    </div>);
}

// ---- en propiedades: la pestaña Máscara
export function PanelMascara({ c, W, H, alGesto, cambiarClip }) {
  const m = c.mascara || null;
  const fila = { display:"flex", alignItems:"center", justifyContent:"space-between", gap:6 };
  const desl = (n, campo, a, b, st, fmt) => (
    <label key={campo} style={{display:"flex",flexDirection:"column",gap:3,fontSize:12}}><span style={fila}>{n}<span style={{color:"#999"}}>{fmt ? fmt(m[campo] ?? 0) : Math.round(m[campo] ?? 0)}</span></span>
      <input type="range" min={a} max={b} step={st} value={m[campo] ?? 0} onPointerDown={()=>alGesto("inicio")} onPointerUp={()=>alGesto("fin")}
        onChange={ev=>cambiarClip({...c, mascara:{...m, [campo]:Number(ev.target.value)}}, true)}/></label>);
  return (
    <div style={{display:"flex",flexDirection:"column",gap:9}}>
      <div style={{fontSize:10.5,fontWeight:700,color:"#888",letterSpacing:0.4}}>MÁSCARA</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3, 1fr)",gap:5}}>
        <button onClick={()=>cambiarClip({...c, mascara:null})} className={"rd-chip"+(!m ? " on" : "")} style={{padding:"6px 2px"}}>Ninguna</button>
        {FORMAS.map(([id, n])=><button key={id} onClick={()=>cambiarClip({...c, mascara: m ? {...nuevaMascara(id, W, H), x:m.x, y:m.y, w:m.w, h:m.h, rot:m.rot, difuminado:m.difuminado, invertir:m.invertir} : nuevaMascara(id, W, H)})}
          className={"rd-chip"+(m && m.forma===id ? " on" : "")} style={{padding:"6px 2px"}}>{n}</button>)}
      </div>
      {m && <>
        <div style={{fontSize:11,color:"#888",lineHeight:1.5}}>{m.forma === "libre" ? "En la previsualización: clic para añadir un punto, arrastra los puntos para afinar y doble clic en uno para quitarlo. El contorno entero se arrastra." : "En la previsualización: arrastra el contorno para moverla y el punto blanco para cambiar su tamaño."}</div>
        {desl("Posición X","x",-W,W,1)}{desl("Posición Y","y",-H,H,1)}
        {!["libre","lineal"].includes(m.forma) && desl("Ancho","w",4,W*2,1)}
        {!["libre","lineal"].includes(m.forma) && m.forma !== "espejo" && desl("Alto","h",4,H*2,1)}
        {m.forma === "espejo" && desl("Grosor","h",4,H*2,1)}
        {desl("Giro","rot",-180,180,0.5,v=>v.toFixed(1)+"°")}
        {m.forma === "redondeado" && desl("Redondeo","radio",0,1,0.01,v=>Math.round(v*100)+" %")}
        {desl("Difuminado","difuminado",0,200,1,v=>Math.round(v)+" px")}
        <label style={{...fila,fontSize:12,cursor:"pointer"}}><span>Invertir</span><input type="checkbox" checked={!!m.invertir} onChange={e=>cambiarClip({...c, mascara:{...m, invertir:e.target.checked}})}/></label>
      </>}
    </div>);
}
