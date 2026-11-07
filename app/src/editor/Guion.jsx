import React from "react";
import * as M from "./modelo";
const { useState, useEffect, useRef, useMemo } = React;

/* RandomEditor · GUION (8/11, fase 2: «editar por texto» de Descript y Premiere).
   Lo que se dice en el vídeo (las palabras de los subtítulos), como un texto:
   - clic en una palabra: el cabezal va ahí · Shift+clic: elige de la anterior a esa (o arrastra por encima)
   - «Quitar lo elegido»: esas palabras salen de la pista principal y lo de detrás se corre (con todo lo conectado)
   - «Quitar muletillas»: los «eh», «em», «mmm», «o sea» sueltos, de golpe (Ctrl+Z lo deshace)
   La palabra que suena se ilumina mientras se reproduce. */
export function PanelGuion({ proyecto, reloj, onIr, onQuitar }) {
  const ws = useMemo(()=>M.palabrasLinea(proyecto), [proyecto]);
  const mul = useMemo(()=>M.muletillas(proyecto), [proyecto]);
  const [sel, setSel] = useState(null);          // [i, j] (índices de palabras)
  const ancla = useRef(null), caja = useRef(null), arrastre = useRef(false);
  useEffect(()=>{ setSel(null); }, [ws.length]);
  // la palabra que suena, sin repintar React (como el cabezal)
  useEffect(()=>{
    let ant = -1;
    return reloj.oir(t=>{
      const el = caja.current; if(!el) return;
      let k = -1; for(let i = 0; i < ws.length; i++){ if(ws[i].a <= t + 0.01){ k = i; } else break; }
      if(k >= 0 && t > ws[k].b + 0.4) k = -1;
      if(k === ant) return;
      if(ant >= 0 && el.children[ant]) el.children[ant].classList.remove("rd-g-ya");
      if(k >= 0 && el.children[k]){ el.children[k].classList.add("rd-g-ya"); const r = el.children[k].getBoundingClientRect(), rc = el.getBoundingClientRect(); if(r.top < rc.top || r.bottom > rc.bottom) el.children[k].scrollIntoView({block:"nearest"}); }
      ant = k;
    });
  }, [reloj, ws]);
  useEffect(()=>{ const up = ()=>{ arrastre.current = false; }; window.addEventListener("mouseup", up); return ()=>window.removeEventListener("mouseup", up); }, []);
  if(!ws.length) return <div style={{padding:12,color:"#999",fontSize:12.5,lineHeight:1.6}}>
    Aquí sale todo lo que se dice en el vídeo, como un texto: borras frases y se borran del vídeo.<br/><br/>
    Primero genera los subtítulos en la pestaña <b>Subtítulos</b> (de ahí salen las palabras y sus tiempos).</div>;
  const [i0, j0] = sel ? [Math.min(...sel), Math.max(...sel)] : [-1, -1];
  const elegir = (k, e) => {
    if(e.shiftKey && ancla.current != null){ setSel([ancla.current, k]); return; }
    ancla.current = k; setSel([k, k]); onIr(ws[k].a);
  };
  const quitarElegido = () => {
    if(!sel) return;
    // (con un poco de margen, sin comerse la palabra de al lado)
    const a = Math.max(ws[i0].a - 0.04, i0 > 0 ? ws[i0 - 1].b : 0), b = Math.min(ws[j0].b + 0.04, j0 + 1 < ws.length ? ws[j0 + 1].a : 1e9);
    onQuitar([[a, b]], `${j0 - i0 + 1} palabra${j0 > i0 ? "s" : ""} quitada${j0 > i0 ? "s" : ""} del vídeo`);
    setSel(null);
  };
  return (
    <div style={{display:"flex",flexDirection:"column",minHeight:0,flex:1}}>
      <style>{`.rd-g{display:inline;padding:1px 2px;border-radius:3px;cursor:pointer}.rd-g:hover{background:#2a2a2a}.rd-g.sel{background:rgba(212,175,55,0.35);color:#fff}.rd-g.mul{color:#f87171;text-decoration:underline dotted}.rd-g-ya{background:rgba(96,165,250,0.35)}`}</style>
      <div style={{display:"flex",gap:6,padding:"8px 8px 6px",flexWrap:"wrap",alignItems:"center"}}>
        <button className="rd-btn" disabled={!sel} onClick={quitarElegido} title="Esas palabras salen del vídeo y lo de detrás se corre (Ctrl+Z lo deshace)">Quitar lo elegido</button>
        <button className="rd-btn" disabled={!mul.length} onClick={()=>onQuitar(mul, `${mul.length} muletilla${mul.length > 1 ? "s" : ""} quitada${mul.length > 1 ? "s" : ""}`)}
          title="Los «eh», «em», «mmm» y «o sea» sueltos (en rojo), fuera de golpe">Quitar muletillas ({mul.length})</button>
        {sel && <span style={{fontSize:11,color:"#aaa"}}>{j0 - i0 + 1} elegida{j0 > i0 ? "s" : ""} · {M.tc(ws[j0].b - ws[i0].a)}</span>}
      </div>
      <div style={{fontSize:11,color:"#777",padding:"0 10px 6px"}}>Clic: ir ahí · Shift+clic o arrastrar: elegir varias</div>
      <div ref={caja} style={{flex:1,minHeight:0,overflowY:"auto",padding:"4px 10px 12px",fontSize:14,lineHeight:1.9,color:"#ddd",userSelect:"none"}}>
        {ws.map((x, k)=>{
          const esMul = mul.some(([a, b])=>x.a >= a - 0.01 && x.b <= b + 0.01);
          const pausa = k > 0 && x.a - ws[k - 1].b > 0.6;
          return <span key={x.id} className={"rd-g" + (k >= i0 && k <= j0 ? " sel" : "") + (esMul ? " mul" : "")} style={pausa ? {marginLeft:10} : null}
            title={M.tc(x.a)} onMouseDown={e=>{ e.preventDefault(); arrastre.current = true; elegir(k, e); }}
            onMouseEnter={()=>{ if(arrastre.current && ancla.current != null) setSel([ancla.current, k]); }}>{x.w} </span>;
        })}
      </div>
    </div>);
}
