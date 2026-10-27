import React from "react";
import { fin, largo } from "./modelo";
import { familiaCss } from "./Textos";
const { useState, useEffect, useLayoutEffect, useRef, useMemo } = React;

/* RandomEditor · los SUBTÍTULOS (28/10, él: "un apartado de subtítulos que use lo que tú usas para
   transcribir, con plantillas que se apliquen al seleccionarlas; la primera, la de todos los Shorts").
   Lo que se oye en la pista principal → Whisper (clon/subtitulos.py) → tarjetas en su pista.
   La previsualización convierte el estilo de la plantilla (unidades de CapCut) a píxeles con la misma
   calibración que el motor de exportación, y anima cada palabra con su muelle (o la frase con su pop). */

// estilo de la plantilla (unidades de CapCut) → píxeles del lienzo
export function estiloPx(e, info, W = 1080, H = 1920) {
  const k = Math.min(W, H) / 1080;
  const px = (e.tam || 18) * (info ? info.px_por_tam : 5.481) * k;
  const sh = info ? info.sombra : { distance: 14.948, angle: -45.267, alpha: 0.36298 };
  const d = sh.distance * (info ? info.sombra_px : 0.975) * k, ang = sh.angle * Math.PI / 180;
  return { px, borde: (e.contorno || 0) * px * (info ? info.contorno : 1.113), cx: W / 2 + (e.x || 0) * W / 2, cy: H / 2 - (e.y || 0) * H / 2 + 0.94,
    sdx: d * Math.cos(ang), sdy: -d * Math.sin(ang), salpha: sh.alpha };
}
export const plantillaDe = (info, pista) => {
  const pl = ((info && info.plantillas) || []).find(x=>x.id === (pista && pista.plantilla)) || ((info && info.plantillas) || [])[0];
  return pl ? { ...pl, estilo: { ...pl.estilo, ...((pista && pista.estilo) || {}) } } : null;
};

// lo que se ve de una tarjeta: palabra a palabra o la frase (como clon/subtitulos.items)
export function itemsDe(c, modo) {
  const dur = largo(c);
  if(modo !== "palabra") return [{ w: c.texto, a: c.en, b: c.en + dur }];
  let ws = (c.palabras || []).filter(p=>String(p[2]).trim()).map(p=>[Math.max(0, p[0]), String(p[2]).trim().replace(/[,.;:…]+$/, "")]).filter(x=>x[1] && x[0] < dur);
  const out = [];
  for(let k = 0; k < ws.length; k++){
    const [a, w] = ws[k], b = k + 1 < ws.length ? ws[k + 1][0] : dur;
    if(b - a < 1 / 30 && k + 1 < ws.length){ ws[k + 1] = [a, w + " " + ws[k + 1][1]]; continue; }
    out.push({ w, a: c.en + a, b: c.en + b });
  }
  return out;
}
const muelle = u => u <= 0 ? 0.05 : u >= 1 ? 1 : Math.max(0.05, Math.exp(-7 * u) * Math.sin((u - 0.075) * 2 * Math.PI / 0.3) + 1);
const pop = s => s < 0.0333 ? 0.62 + 0.27 * s / 0.0333 : s < 0.0667 ? 0.89 + 0.09 * (s - 0.0333) / 0.0334 : s < 0.1 ? 0.98 + 0.02 * (s - 0.0667) / 0.0333 : 1;

// ---- en la previsualización: la palabra (o frase) que toca, con su animación, fotograma a fotograma
export function CapaSubtitulos({ proyecto, reloj, info }) {
  const caja = useRef(null), el = useRef(null);
  const [esc, setEsc] = useState(0.3);
  const W = proyecto.ancho || 1080, H = proyecto.alto || 1920;
  useEffect(()=>{ const c = caja.current; if(!c) return; const ro = new ResizeObserver(()=>setEsc(c.clientWidth / W)); ro.observe(c); setEsc(c.clientWidth / W); return ()=>ro.disconnect(); },[W]);
  const pista = proyecto.pistas.find(x=>x.tipo==="subtitulos" && !x.muda);
  const pl = plantillaDe(info, pista);
  const items = useMemo(()=>pista && pl ? pista.clips.flatMap(c=>itemsDe(c, pl.modo)).sort((x, y)=>x.a - y.a) : [],[pista, pl && pl.modo]);
  const ref = useRef({ items, pl }); ref.current = { items, pl };
  const pintar = t => {
    const e = el.current; if(!e) return;
    const { items, pl } = ref.current;
    const it = items.find(x=>t >= x.a && t < x.b);
    if(!it){ e.style.visibility = "hidden"; return; }
    if(e.textContent !== it.w) e.textContent = it.w;
    const s = pl.anim === "muelle" ? muelle((t - it.a) / Math.max(0.01, it.b - it.a)) : pl.anim === "pop" ? pop(t - it.a) : 1;
    e.style.transform = `translate(-50%,-50%) scale(${s})`;
    e.style.visibility = "visible";
  };
  useEffect(()=>reloj.oir(pintar),[reloj]);
  useLayoutEffect(()=>pintar(reloj.t));
  // (la capa está SIEMPRE, aunque no haya subtítulos: si no, no mide la previsualización y la palabra
  // salía con la escala de partida, fuera de sitio)
  if(!pista || !pl) return <div ref={caja} style={{position:"absolute",inset:0,pointerEvents:"none"}}/>;
  const p = estiloPx(pl.estilo, info, W, H);
  return (
    <div ref={caja} style={{position:"absolute",inset:0,pointerEvents:"none",overflow:"hidden"}}>
      <div ref={el} style={{position:"absolute",left:p.cx * esc,top:p.cy * esc,transform:"translate(-50%,-50%)",whiteSpace:"nowrap",visibility:"hidden",
        fontFamily:familiaCss(pl.estilo.fuente),fontSize:p.px * esc,lineHeight:1.15,color:pl.estilo.color,
        WebkitTextStroke: p.borde ? `${p.borde * 2 * esc}px ${pl.estilo.color_contorno || "#000"}` : undefined, paintOrder:"stroke fill",
        filter: pl.estilo.sombra ? `drop-shadow(${p.sdx * esc}px ${p.sdy * esc}px 0 rgba(0,0,0,${p.salpha}))` : undefined}}/>
    </div>);
}

// ---- el apartado de la biblioteca: plantillas, generar y el estilo de los subtítulos
function Muestra({ pl, info }) {
  const p = estiloPx(pl.estilo, info), k = 26 / p.px;
  return <span style={{fontFamily:familiaCss(pl.estilo.fuente),fontSize:26,color:pl.estilo.color,whiteSpace:"nowrap",
    WebkitTextStroke: p.borde ? `${Math.max(1.5, p.borde * 2 * k)}px ${pl.estilo.color_contorno || "#000"}` : undefined, paintOrder:"stroke fill",
    filter: pl.estilo.sombra ? `drop-shadow(${p.sdx * k}px ${p.sdy * k}px 0 rgba(0,0,0,${p.salpha}))` : undefined}}>{pl.modo === "palabra" ? "palabra" : "una frase"}</span>;
}

export function PanelSubtitulos({ info, pista, elegida, setElegida, maxPal, setMaxPal, onGenerar, ocupado, generando, onPlantilla, onEstilo, alGesto, onQuitar, fuentes }) {
  if(!info) return <div style={{fontSize:12.5,color:"#888",padding:8}}>Cargando las plantillas…</div>;
  const actual = plantillaDe(info, pista || { plantilla: elegida });
  const e = actual ? actual.estilo : {};
  const fila = { display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 };
  const desl = (n, campo, a, b, st, fmt) => (
    <label style={{display:"flex",flexDirection:"column",gap:4,fontSize:12}}><span style={fila}>{n}<span style={{color:"#999"}}>{fmt(e[campo] ?? 0)}</span></span>
      <input type="range" min={a} max={b} step={st} value={e[campo] ?? 0} onPointerDown={()=>alGesto("inicio")} onPointerUp={()=>alGesto("fin")}
        onChange={ev=>onEstilo({[campo]: Number(ev.target.value)}, true)}/></label>);
  const conocidas = (fuentes || []).filter(f=>/lilita|luckiest|bangers|komika|segoe ui black|impact|arial black|alfa slab|coolvetica/i.test(f.familia + " " + f.estilo));
  return (
    <div style={{display:"flex",flexDirection:"column",gap:10,paddingBottom:6}}>
      <div style={{fontSize:10.5,fontWeight:700,color:"#888",letterSpacing:0.4,padding:"4px 2px 0"}}>PLANTILLAS</div>
      {info.plantillas.map(pl=>{
        const on = (pista ? pista.plantilla : elegida) === pl.id;
        return (
          <button key={pl.id} onClick={()=>{ setElegida(pl.id); setMaxPal(pl.max_pal); if(pista) onPlantilla(pl.id); }} className="rd-medio"
            style={{flexDirection:"column",alignItems:"stretch",padding:8,gap:6,cursor:"pointer",textAlign:"left",borderColor:on?"rgba(212,175,55,0.7)":undefined,background:on?"rgba(212,175,55,0.08)":undefined}}
            title={pl.ayuda}>
            <div style={{height:50,borderRadius:6,background:"repeating-linear-gradient(45deg,#1b1b1b 0 10px,#202020 10px 20px)",display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"}}><Muestra pl={pl} info={info}/></div>
            <div style={{fontSize:12,fontWeight:650,color:on?"var(--gold)":"#eee"}}>{pl.nombre}{on ? " ✓" : ""}</div>
            <div style={{fontSize:10.5,color:"#8a8a8a",lineHeight:1.35}}>{pl.ayuda}</div>
          </button>);
      })}
      <label style={{display:"flex",flexDirection:"column",gap:4,fontSize:12}}><span style={fila}>Palabras por tarjeta<span style={{color:"#999"}}>{maxPal}</span></span>
        <input type="range" min={1} max={6} step={1} value={maxPal} onChange={ev=>setMaxPal(Number(ev.target.value))}/></label>
      <button onClick={onGenerar} disabled={ocupado} className="rd-btn primario" style={{justifyContent:"center",padding:"8px 0"}}
        title="Escucha lo que suena en la pista principal (Whisper large-v3) y lo pone en tarjetas. Cada archivo se escucha una vez: rehacerlos tras cortar es inmediato">
        {generando ? "Escuchando…" : pista ? "Volver a generar los subtítulos" : "Generar subtítulos"}</button>
      {pista && <>
        <div style={{fontSize:10.5,fontWeight:700,color:"#888",letterSpacing:0.4,padding:"6px 2px 0"}}>ESTILO · {pista.clips.length} TARJETAS</div>
        <div style={fila}><span style={{fontSize:12}}>Color</span><input type="color" value={e.color || "#ffffff"} onChange={ev=>onEstilo({color:ev.target.value})}/></div>
        {desl("Tamaño", "tam", 6, 40, 0.5, v=>Number(v).toFixed(1))}
        {desl("Altura (abajo ← → arriba)", "y", -0.9, 0.9, 0.005, v=>Number(v).toFixed(3))}
        {desl("Contorno", "contorno", 0, 0.3, 0.005, v=>Number(v).toFixed(3))}
        <div style={fila}><span style={{fontSize:12}}>Color del contorno</span><input type="color" value={e.color_contorno || "#000000"} onChange={ev=>onEstilo({color_contorno:ev.target.value})}/></div>
        <label style={{...fila,cursor:"pointer",fontSize:12}}><span>Sombra</span><input type="checkbox" checked={!!e.sombra} onChange={ev=>onEstilo({sombra:ev.target.checked})}/></label>
        {conocidas.length > 0 && <label style={{display:"flex",flexDirection:"column",gap:4,fontSize:12}}>Fuente
          <select value={e.fuente} onChange={ev=>onEstilo({fuente:ev.target.value})} className="rd-input">
            {!conocidas.some(f=>f.archivo===e.fuente) && <option value={e.fuente}>{(e.fuente||"").split(/[\\/]/).pop()}</option>}
            {conocidas.map(f=><option key={f.archivo} value={f.archivo}>{f.familia}{f.estilo !== "Regular" ? " · " + f.estilo : ""}</option>)}
          </select></label>}
        <div style={{display:"flex",gap:6}}>
          <button onClick={()=>onPlantilla(pista.plantilla)} className="rd-btn" style={{flex:1,justifyContent:"center"}} title="Vuelve al estilo de la plantilla">Restablecer estilo</button>
          <button onClick={onQuitar} className="rd-btn" style={{flex:1,justifyContent:"center"}}>Quitar subtítulos</button>
        </div>
      </>}
    </div>);
}

// ---- el inspector de una tarjeta
export function InspectorSub({ c, alGesto, cambiar }) {
  return (
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      <textarea value={c.texto} rows={2} className="rd-input" style={{resize:"vertical",fontFamily:"inherit",lineHeight:1.4}}
        onFocus={()=>alGesto("inicio")} onBlur={()=>alGesto("fin")} onChange={ev=>cambiar(ev.target.value)}/>
      <div style={{fontSize:11.5,color:"#888",lineHeight:1.5}}>Corrige lo que se oyó mal. Con las mismas palabras, cada una conserva su momento; si cambias cuántas son, se reparten por igual. El estilo de todas, en la pestaña Subtítulos.</div>
      <div style={{fontFamily:"ui-monospace, Consolas, monospace",fontSize:11,color:"#999",lineHeight:1.6}}>
        {(c.palabras||[]).map((p, k)=><div key={k}>{(c.en + p[0]).toFixed(2)} s · {p[2]}</div>)}
      </div>
    </div>);
}
