import React from "react";
import { fin } from "./modelo";
const { useState, useEffect, useLayoutEffect, useRef, useMemo } = React;

/* RandomEditor · los TEXTOS (28/10, él: "un apartado de texto: texto normal y uno predefinido con la
   configuración de los títulos, que solo haga falta añadirlo y cambiar el texto; y si quiero, cambiarle
   la fuente, el tamaño, etc.").
   La previsualización usa LAS MISMAS fuentes (los mismos archivos) que la exportación (clon/textos.py),
   con el mismo contorno, la misma sombra y el mismo "encoger para caber en una línea". */

// ---- las fuentes: cada archivo se carga con su @font-face (nombre propio = el archivo exacto)
const cargadas = new Set();
let hoja = null;
const hash = s => { let h = 0; for(let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return "rf" + (h >>> 0).toString(36); };
const urlDe = p => "file:///" + p.replace(/\\/g, "/").split("/").map(encodeURIComponent).join("/").replace(/^([A-Za-z])%3A/, "$1:");
export function familiaCss(archivo) {
  if(!archivo) return "'Segoe UI Black', 'Segoe UI', sans-serif";
  const f = hash(archivo);
  if(!cargadas.has(f)){
    cargadas.add(f);
    if(!hoja){ hoja = document.createElement("style"); document.head.appendChild(hoja); }
    hoja.appendChild(document.createTextNode(`@font-face{font-family:"${f}";src:url("${urlDe(archivo)}");font-display:block;}`));
  }
  return `"${f}", 'Segoe UI Black', sans-serif`;
}

// los emojis van con la fuente de emojis a color y SIN contorno (como en la exportación)
const esEmoji = ch => { const o = ch.codePointAt(0); return o >= 0x1F000 || (o >= 0x2600 && o <= 0x27BF) || (o >= 0x2B00 && o <= 0x2BFF) || o === 0x200D || o === 0xFE0F || o === 0x20E3 || (o >= 0x2190 && o <= 0x21FF) || (o >= 0x2300 && o <= 0x23FF) || (o >= 0x25A0 && o <= 0x25FF) || (o >= 0x2900 && o <= 0x297F); };
function trozos(linea) {
  const out = [];
  for(const ch of linea){ const e = esEmoji(ch); if(out.length && out[out.length-1][1] === e) out[out.length-1][0] += ch; else out.push([ch, e]); }
  return out;
}
const lineasDe = (c) => { const e = c.estilo || {}; const ls = String(c.texto || "").split("\n").map(l=>l.split(/\s+/).filter(Boolean).join(" ")); return e.una_linea ? [ls.join(" ").trim()] : ls; };

// ---- la capa encima del vídeo: cada texto en su sitio, visible solo en su tramo, y se arrastra
export function CapaTextos({ proyecto, reloj, sel, onElegir, onGesto }) {
  const caja = useRef(null), els = useRef({}), guiaV = useRef(null), guiaH = useRef(null);
  const [esc, setEsc] = useState(0.3);
  const W = proyecto.ancho || 1080, H = proyecto.alto || 1920;
  useEffect(()=>{ const el = caja.current; if(!el) return; const ro = new ResizeObserver(()=>setEsc(el.clientWidth / W)); ro.observe(el); setEsc(el.clientWidth / W); return ()=>ro.disconnect(); },[W]);
  // de arriba abajo en la línea de tiempo = de encima a debajo: se pintan al revés
  const textos = useMemo(()=>[...proyecto.pistas].reverse().filter(p=>p.tipo==="texto" && !p.muda).flatMap(p=>p.clips),[proyecto]);
  const tRef = useRef(textos); tRef.current = textos;
  const mostrar = t => tRef.current.forEach(c=>{ const el = els.current[c.id]; if(el) el.style.visibility = t >= c.en && t < fin(c) ? "visible" : "hidden"; });
  useEffect(()=>reloj.oir(mostrar),[reloj]);
  useLayoutEffect(()=>{
    // encoger para caber (como clon/textos.py): si una línea pasa de su ancho, la letra baja
    textos.forEach(c=>{
      const el = els.current[c.id]; if(!el) return;
      const e = c.estilo || {}, base = (e.tam || 72) * esc;
      el.style.fontSize = base + "px";
      // (como en clon/textos.py: el ancho cuenta el contorno de los dos lados; dos pasadas afinan)
      const max = (e.max_ancho || W) * esc;
      for(let k = 0; k < 2; k++){
        const fs = parseFloat(el.style.fontSize), b2 = 2 * (e.borde || 0) * esc * fs / base;
        const ancho = el.scrollWidth + b2;
        if(ancho > max) el.style.fontSize = Math.max(12 * esc, fs * max / ancho) + "px"; else break;
      }
    });
    mostrar(reloj.t);
  });
  const pRef = useRef(proyecto); pRef.current = proyecto;
  const arrastrar = (e, c) => {
    if(e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    onElegir(c.id);
    const x0 = e.clientX, y0 = e.clientY, ex = c.estilo.x, ey = c.estilo.y;
    let movido = false;
    const mover = ev => {
      const dx = (ev.clientX - x0) / esc, dy = (ev.clientY - y0) / esc;
      if(!movido && Math.hypot(dx, dy) < 3 / esc) return;
      if(!movido){ movido = true; onGesto("inicio"); }
      let x = Math.round(ex + dx), y = Math.round(ey + dy);
      // imán al centro y a la línea cámara/juego de sus Shorts (738)
      const ix = Math.abs(x - W / 2) < 10 / esc, iy = [H / 2, 738].find(v=>Math.abs(y - v) < 10 / esc);
      if(ix) x = W / 2; if(iy != null) y = iy;
      if(guiaV.current) guiaV.current.style.display = ix ? "block" : "none";
      if(guiaH.current){ guiaH.current.style.display = iy != null ? "block" : "none"; if(iy != null) guiaH.current.style.top = (iy * esc) + "px"; }
      const p = pRef.current;
      onGesto("durante", {...p, pistas: p.pistas.map(pi=>pi.tipo!=="texto" ? pi : {...pi, clips: pi.clips.map(y2=>y2.id!==c.id ? y2 : {...y2, estilo:{...y2.estilo, x, y}})})});
    };
    const soltar = () => { window.removeEventListener("mousemove", mover); window.removeEventListener("mouseup", soltar);
      if(guiaV.current) guiaV.current.style.display = "none"; if(guiaH.current) guiaH.current.style.display = "none"; if(movido) onGesto("fin"); };
    window.addEventListener("mousemove", mover); window.addEventListener("mouseup", soltar);
  };
  return (
    <div ref={caja} style={{position:"absolute",inset:0,pointerEvents:"none",overflow:"hidden"}}>
      <div ref={guiaV} style={{display:"none",position:"absolute",left:"50%",top:0,bottom:0,borderLeft:"1px solid #f472b6"}}/>
      <div ref={guiaH} style={{display:"none",position:"absolute",left:0,right:0,borderTop:"1px solid #f472b6"}}/>
      {textos.map(c=>{
        const e = c.estilo || {};
        const borde = (e.borde || 0) * esc, k = (e.tam || 72) / 96;
        return (
          <div key={c.id} ref={el=>{ els.current[c.id] = el; }} onMouseDown={ev=>arrastrar(ev, c)} onClick={ev=>ev.stopPropagation()} onDoubleClick={ev=>ev.stopPropagation()}
            title="Arrástralo para moverlo · se edita a la derecha"
            style={{position:"absolute",left:e.x * esc,top:e.y * esc,transform:"translate(-50%,-50%)",pointerEvents:"auto",cursor:"move",
              fontFamily:familiaCss(e.fuente),color:e.color || "#fff",whiteSpace:"pre",textAlign:"center",lineHeight:1.08,
              WebkitTextStroke: borde ? `${borde * 2}px ${e.color_borde || "#000"}` : undefined, paintOrder:"stroke fill",
              filter: e.sombra ? `drop-shadow(${4 * k * esc}px ${6 * k * esc}px 0 rgba(0,0,0,0.59))` : undefined,
              outline: sel.has(c.id) ? "1.5px dashed rgba(212,175,55,0.95)" : "none", outlineOffset: 4, visibility:"hidden"}}>
            {lineasDe(c).map((l, i)=><div key={i}>{trozos(l).map(([t, emo], j)=>emo
              ? <span key={j} style={{fontFamily:"'Segoe UI Emoji'",WebkitTextStroke:0,fontSize:"1.05em",letterSpacing:"0.06em"}}>{t}</span> : <span key={j}>{t}</span>)}</div>)}
          </div>);
      })}
    </div>);
}

// una fuente de la lista: se pinta con su letra SOLO cuando se ve (no se cargan 200 fuentes de golpe)
function BotonFuente({ f, elegida, onElegir }) {
  const el = useRef(null);
  const [visto, setVisto] = useState(false);
  useEffect(()=>{
    const b = el.current; if(!b || visto) return;
    const io = new IntersectionObserver(es=>{ if(es.some(x=>x.isIntersecting)){ setVisto(true); io.disconnect(); } }, { root: b.parentElement, rootMargin: "60px" });
    io.observe(b); return ()=>io.disconnect();
  },[visto]);
  return <button ref={el} onClick={onElegir} className="rd-fuente" title={f.familia + (f.estilo !== "Regular" ? " · " + f.estilo : "")}
    style={{fontFamily: visto ? familiaCss(f.archivo) : "system-ui",background:elegida?"rgba(212,175,55,0.16)":"transparent",color:elegida?"var(--gold)":"#ddd"}}>
    {f.familia}{f.estilo !== "Regular" ? <span style={{fontFamily:"system-ui",fontSize:10.5,color:"#888"}}> · {f.estilo}</span> : null}</button>;
}

// ---- el inspector de un texto
export function InspectorTexto({ c, fuentes, presets, alGesto, cambiarEstilo, cambiarTexto, W = 1080, H = 1920 }) {
  const e = c.estilo || {};
  const [busca, setBusca] = useState("");
  const fam = useMemo(()=>{
    const q = busca.trim().toLowerCase();
    return (fuentes || []).filter(f=>!q || f.familia.toLowerCase().includes(q)).slice(0, 400);
  },[fuentes, busca]);
  const actual = (fuentes || []).find(f=>f.archivo === e.fuente);
  const fila = { display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 };
  const deslizador = (n, campo, a, b, st, fmt) => (
    <label style={{display:"flex",flexDirection:"column",gap:4}}><span style={fila}>{n}<span style={{color:"#999"}}>{fmt(e[campo] ?? 0)}</span></span>
      <input type="range" min={a} max={b} step={st} value={e[campo] ?? 0} onPointerDown={()=>alGesto("inicio")} onPointerUp={()=>alGesto("fin")}
        onChange={ev=>cambiarEstilo({[campo]: Number(ev.target.value)}, true)}/></label>);
  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      <textarea value={c.texto} rows={3} className="rd-input" style={{resize:"vertical",fontFamily:"inherit",lineHeight:1.4}}
        onFocus={()=>alGesto("inicio")} onBlur={()=>alGesto("fin")} onChange={ev=>cambiarTexto(ev.target.value)} placeholder="Escribe el texto…"/>
      <div style={{display:"flex",flexDirection:"column",gap:4}}>
        <span style={fila}>Fuente<span style={{color:"#999",fontSize:11}}>{actual ? `${actual.familia}${actual.estilo !== "Regular" ? " · " + actual.estilo : ""}` : ""}</span></span>
        <input value={busca} onChange={ev=>setBusca(ev.target.value)} placeholder="Buscar fuente…" className="rd-input"/>
        <div style={{maxHeight:150,overflowY:"auto",border:"1px solid #262626",borderRadius:7,background:"#101010"}}>
          {fam.map(f=><BotonFuente key={f.archivo} f={f} elegida={f.archivo===e.fuente} onElegir={()=>cambiarEstilo({fuente:f.archivo})}/>)}
          {!fuentes && <div style={{padding:8,color:"#888",fontSize:12}}>Cargando las fuentes…</div>}
        </div>
      </div>
      {deslizador("Tamaño", "tam", 12, 300, 1, v=>Math.round(v)+" px")}
      <div style={fila}><span>Color</span><input type="color" value={e.color || "#ffffff"} onChange={ev=>cambiarEstilo({color:ev.target.value})}/></div>
      {deslizador("Contorno", "borde", 0, 40, 1, v=>Math.round(v)+" px")}
      <div style={fila}><span>Color del contorno</span><input type="color" value={e.color_borde || "#000000"} onChange={ev=>cambiarEstilo({color_borde:ev.target.value})}/></div>
      <label style={{...fila,cursor:"pointer"}}><span>Sombra (la de los títulos)</span><input type="checkbox" checked={!!e.sombra} onChange={ev=>cambiarEstilo({sombra:ev.target.checked})}/></label>
      <label style={{...fila,cursor:"pointer"}}><span>Siempre en una línea (encoge si no cabe)</span><input type="checkbox" checked={!!e.una_linea} onChange={ev=>cambiarEstilo({una_linea:ev.target.checked})}/></label>
      {deslizador("Ancho máximo", "max_ancho", 100, 1080, 10, v=>Math.round(v)+" px")}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
        <label style={{display:"flex",flexDirection:"column",gap:3,fontSize:11.5,color:"#aaa"}}>X<input type="number" value={Math.round(e.x)} className="rd-input" onChange={ev=>cambiarEstilo({x:Number(ev.target.value)})}/></label>
        <label style={{display:"flex",flexDirection:"column",gap:3,fontSize:11.5,color:"#aaa"}}>Y<input type="number" value={Math.round(e.y)} className="rd-input" onChange={ev=>cambiarEstilo({y:Number(ev.target.value)})}/></label>
      </div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        <button onClick={()=>cambiarEstilo({x:W / 2})} className="rd-btn">Centrar</button>
        {H > W && <button onClick={()=>cambiarEstilo({x:W / 2, y:738})} className="rd-btn" title="La línea entre la cámara y el juego, donde van los títulos">A la línea del título</button>}
        {presets && <button onClick={()=>cambiarEstilo({...presets.titulo})} className="rd-btn" title="Fuente, tamaño, contorno, sombra y sitio de los títulos de los Shorts">Estilo de título</button>}
      </div>
    </div>);
}
