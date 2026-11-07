import React from "react";
import { ACCIONES, combo, comboBonito, leerPropios, ponerPropios } from "./atajos";
import { createPortal } from "react-dom";
import { fin } from "./modelo";
const { useState, useEffect, useRef } = React;

/* RandomEditor · lo que mide cómo va: el contador de FPS, el medidor de volumen y los ajustes de
   rendimiento (28/10, él: "un contador de FPS en la esquina izquierda del reproductor; si va a
   empeorar el rendimiento, no lo hagas"). Ni el contador ni el medidor pasan por React: escriben en
   su elemento directamente, el contador una vez por segundo. */

const leerLS = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch(e){ return d; } };
const ponerLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} };
export function useAjuste(k, d) {
  const [v, setV] = useState(()=>leerLS(k, d));
  return [v, x => { const n = typeof x === "function" ? x(v) : x; ponerLS(k, n); setV(n); }];
}

// FPS de la interfaz (lo fluida que va la ventana) y, reproduciendo, los del vídeo y los que pierde
export function Fps({ vista, jugando }) {
  const el = useRef(null);
  const jRef = useRef(jugando); jRef.current = jugando;
  useEffect(()=>{
    let n = 0, raf, t0 = performance.now(), antes = null;
    const paso = ahora => {
      n++;
      if(ahora - t0 >= 1000){
        const fps = Math.round(n * 1000 / (ahora - t0)); n = 0; t0 = ahora;
        let txt = `${fps} FPS`, malo = fps < 45;
        const v = vista.current && vista.current.activoV && vista.current.activoV();
        const q = v && v.getVideoPlaybackQuality ? v.getVideoPlaybackQuality() : null;
        if(q && jRef.current && antes && antes.v === v){
          const vid = q.totalVideoFrames - antes.total, perd = q.droppedVideoFrames - antes.perd;
          txt += `  ·  vídeo ${Math.max(0, vid)}${perd > 0 ? `  ·  ${perd} perdidos` : ""}`;
          if(perd > 2) malo = true;
        }
        antes = q ? { v, total: q.totalVideoFrames, perd: q.droppedVideoFrames } : null;
        if(el.current){ el.current.textContent = txt; el.current.style.color = malo ? "#fca5a5" : fps < 55 ? "#fde68a" : "#86efac"; }
      }
      raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);
    return ()=>cancelAnimationFrame(raf);
  },[vista]);
  return <div ref={el} style={{position:"absolute",left:10,top:8,zIndex:2,fontFamily:"ui-monospace, Consolas, monospace",fontSize:11,fontWeight:700,
    padding:"2px 7px",borderRadius:5,background:"rgba(0,0,0,0.6)",color:"#86efac",pointerEvents:"none",whiteSpace:"nowrap"}}>— FPS</div>;
}

// el medidor de volumen (como el de CapCut, a la derecha del reproductor): sale de las ondas ya
// calculadas, así que no cuesta nada (no hay que analizar el audio en vivo)
export function Medidor({ reloj, proyecto, ondas }) {
  const barra = useRef(null), pico = useRef(null);
  const pRef = useRef(proyecto); pRef.current = proyecto;
  const oRef = useRef(ondas); oRef.current = ondas;
  useEffect(()=>{
    let max = 0, maxT = 0;
    return reloj.oir(t=>{
      let s = 0;
      pRef.current.pistas.forEach(pi=>{
        if(pi.muda) return;
        const c = pi.clips.find(x=>t >= x.en && t < fin(x)); if(!c || c.silencio) return;
        // (8/11, fallo: el medidor no se movía desde que las ondas llevan su paso) {p, dt, inicio} o la lista vieja
        const o = oRef.current[c.ruta], od = o && (Array.isArray(o) ? o : o.p); if(!od || !od.length) return;
        const dt = (!Array.isArray(o) && o.dt) || (c.dur_src || 1) / od.length, ini = (!Array.isArray(o) && o.inicio) || 0;
        const i = Math.floor((c.desde + (t - c.en) * (c.velocidad || 1) - ini) / dt);
        const v = (od[Math.max(0, Math.min(od.length - 1, i))] || 0) * (c.vol ?? 1);
        s += v * v;
      });
      const nivel = Math.min(1, Math.sqrt(s));
      const ahora = performance.now();
      if(nivel >= max || ahora - maxT > 1200){ max = nivel; maxT = ahora; }
      if(barra.current) barra.current.style.transform = `scaleY(${nivel})`;
      if(pico.current) pico.current.style.bottom = `${max * 100}%`;
    });
  },[reloj]);
  return (
    <div title="Volumen de la mezcla" style={{position:"relative",width:8,alignSelf:"stretch",margin:"14px 4px",borderRadius:3,background:"#1a1a1a",overflow:"hidden",flexShrink:0}}>
      <div style={{position:"absolute",inset:0,background:"linear-gradient(to top,#22c55e 0%,#22c55e 62%,#eab308 82%,#ef4444 100%)",opacity:0.18}}/>
      <div ref={barra} style={{position:"absolute",inset:0,transformOrigin:"bottom",transform:"scaleY(0)",background:"linear-gradient(to top,#22c55e 0%,#22c55e 62%,#eab308 82%,#ef4444 100%)",willChange:"transform"}}/>
      <div ref={pico} style={{position:"absolute",left:0,right:0,height:2,bottom:0,background:"#fff",opacity:0.8}}/>
    </div>);
}

// los ajustes del editor: rendimiento (gráfica dedicada, etc.), proxies y el contador
// 8/11 (fase 3, Premiere): tus atajos. Pulsa la tecla nueva en el recuadro y elige qué hace (lo mismo que una del editor)
function AtajosPropios() {
  const [prop, setProp] = useState(leerPropios);
  const [nueva, setNueva] = useState("");
  const [accion, setAccion] = useState(ACCIONES[0][0]);
  const guardar = o => { ponerPropios(o); setProp(o); };
  const nombre = c => (ACCIONES.find(a=>a[0]===c) || [c, comboBonito(c)])[1];
  return <div style={{display:"flex",flexDirection:"column",gap:7}}>
    <b style={{fontSize:13.5}}>Atajos propios</b>
    <span style={{fontSize:11,color:"#888"}}>Una tecla tuya que hace lo mismo que otra del editor (la de siempre sigue funcionando).</span>
    {Object.entries(prop).map(([k, v])=><div key={k} style={{display:"flex",alignItems:"center",gap:6,fontSize:12}}>
      <kbd style={{padding:"2px 6px",border:"1px solid #444",borderRadius:4,fontFamily:"ui-monospace, Consolas, monospace"}}>{comboBonito(k)}</kbd>
      <span style={{flex:1,color:"#bbb"}}>→ {nombre(v)}</span>
      <button className="rd-ico peligro" style={{width:22,height:22}} title="Quitar" onClick={()=>{ const o = {...prop}; delete o[k]; guardar(o); }}>×</button></div>)}
    <div style={{display:"flex",gap:5}}>
      <input readOnly value={nueva ? comboBonito(nueva) : ""} placeholder="Pulsa la tecla…" className="rd-input" style={{width:96,padding:"4px 7px"}}
        onKeyDown={e=>{ e.preventDefault(); e.stopPropagation(); if(["Control","Shift","Alt","Meta"].includes(e.key)) return; setNueva(combo(e)); }}/>
      <select value={accion} onChange={e=>setAccion(e.target.value)} className="rd-input" style={{flex:1,minWidth:0,padding:"4px 5px"}}>
        {ACCIONES.map(([c, n])=><option key={c} value={c}>{n} ({comboBonito(c)})</option>)}</select>
      <button className="rd-btn" style={{padding:"4px 8px"}} disabled={!nueva || nueva === accion} onClick={()=>{ guardar({...prop, [nueva]: accion}); setNueva(""); }}>Añadir</button>
    </div>
  </div>;
}

export function AjustesEditor({ abierto, onCerrar, usarProxies, setUsarProxies, verFps, setVerFps, verMedidor, setVerMedidor, proxiesListos, proxiesTotal, toast }) {
  const [r, setR] = useState(null);
  const [cambiado, setCambiado] = useState(false);
  useEffect(()=>{ if(abierto && window.studioFS.rendimientoLeer) window.studioFS.rendimientoLeer().then(setR); },[abierto]);
  if(!abierto) return null;
  const modo = async m => { const x = await window.studioFS.rendimientoPoner(m); if(x.error){ toast(x.error); return; } setR(v=>({...v, modo:m})); setCambiado(true); };
  const fila = { display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 };
  const casilla = (v, set, txt, ayuda) => (
    <label style={{...fila, cursor:"pointer"}}><span>{txt}<div style={{fontSize:11,color:"#888",marginTop:2}}>{ayuda}</div></span>
      <input type="checkbox" checked={v} onChange={e=>set(e.target.checked)} style={{accentColor:"var(--gold)",width:16,height:16}}/></label>);
  return createPortal(
    <div onMouseDown={onCerrar} style={{position:"fixed",inset:0,zIndex:2000}}>
      <div onMouseDown={e=>e.stopPropagation()} className="rd-menu" style={{right:12,top:52,width:340,padding:14,display:"flex",flexDirection:"column",gap:14,fontSize:12.5}}>
        <b style={{fontSize:13.5}}>Rendimiento</b>
        <div style={{display:"flex",gap:6}}>
          {[["equilibrado","Equilibrado"],["alto","Alto"],["maximo","Máximo"]].map(([k,l])=>
            <button key={k} onClick={()=>modo(k)} className={"rd-btn"+(r && r.modo===k ? " on" : "")} style={{flex:1,justifyContent:"center"}}>{l}</button>)}
        </div>
        <div style={{fontSize:11.5,color:"#999",lineHeight:1.55}}>
          <b style={{color:"#ccc"}}>Equilibrado</b>: lo normal de Chromium (en tu portátil, la gráfica Intel).<br/>
          <b style={{color:"#ccc"}}>Alto</b>: la gráfica NVIDIA dibuja el editor; nada forzado. Recomendado.<br/>
          <b style={{color:"#ccc"}}>Máximo</b>: además quita los límites de seguridad de la gráfica y reserva hasta 8 GB de RAM.<br/>
          {r && <>Ahora: {r.gpu || "gráfica sin identificar"} · {r.nucleos} hilos · {r.ram} GB de RAM</>}
        </div>
        {cambiado && <button onClick={()=>window.studioFS.reiniciar()} className="rd-btn primario" style={{justifyContent:"center"}}>Reiniciar RandomStudio para aplicarlo</button>}
        <div style={{height:1,background:"#2a2a2a"}}/>
        {casilla(usarProxies, setUsarProxies, "Previsualizar con proxies",
          proxiesTotal ? `Copias ligeras para que cortar y saltar no dé tirones (${proxiesListos}/${proxiesTotal} listas). Al exportar se usa el original.` : "Copias ligeras para que cortar y saltar no dé tirones. Al exportar se usa el original.")}
        {casilla(verFps, setVerFps, "Contador de FPS", "En la esquina del reproductor. No resta rendimiento: se actualiza una vez por segundo.")}
        {casilla(verMedidor, setVerMedidor, "Medidor de volumen", "A la derecha del reproductor.")}
        <div style={{height:1,background:"#2a2a2a"}}/>
        <AtajosPropios/>
      </div>
    </div>, document.body);
}
