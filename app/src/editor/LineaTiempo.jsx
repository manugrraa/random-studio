import React from "react";
import { fin, largo, tc, corto, puntosDeCorte, cuantiza, solapa } from "./modelo";
const { useEffect, useRef, useState, useMemo, memo } = React;

/* RandomEditor · la línea de tiempo, al estilo de CapCut de PC.
   - cada pista es un LIENZO que pinta solo lo que se ve: el fotograma real de cada punto del clip
     (no una miniatura repetida) y la onda del sonido de abajo hacia arriba
   - encima, los clips como cajas (borde, nombre, asas para recortar); solo los visibles
   - el cabezal y la línea del ratón se mueven solos (el reloj), sin repintar el resto
   - imán: el cabezal, los recortes y los movimientos se pegan a los cortes y marcadores
   - Ctrl+rueda acerca/aleja donde está el ratón; la rueda sola desplaza */
export const PAD = 16, ALTO_REGLA = 30;
export const ALTO = { video: 100, audio: 58 };
const ALTO_FOTO = 58;
const COL = { video:"#1d3557", audio:"#183a2b", sel:"#D4AF37", borde:"rgba(255,255,255,0.16)" };

function pasoRegla(zoom, fps) {
  const opciones = [1/fps, 2/fps, 5/fps, 10/fps, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  return opciones.find(s => s * zoom >= 80) || 600;
}

const Clip = memo(function Clip({ c, pista, zoom, elegido, cuchilla, onDown, onMenu }) {
  const w = Math.max(3, largo(c) * zoom), h = ALTO[pista.tipo];
  return (
    <div onMouseDown={e=>onDown(e, c, pista, "mover")} onContextMenu={e=>onMenu(e, c, pista)}
      style={{position:"absolute",left:PAD + c.en*zoom,top:0,width:w,height:h,borderRadius:5,boxSizing:"border-box",
        border:`2px solid ${elegido ? COL.sel : COL.borde}`, boxShadow: elegido ? "0 0 0 1px rgba(212,175,55,0.35), 0 0 12px rgba(212,175,55,0.25)" : "none",
        cursor: cuchilla ? "crosshair" : "grab"}}>
      {w > 30 && <div style={{position:"absolute",left:5,top:3,right:5,fontSize:10.5,fontWeight:700,color:"#fff",textShadow:"0 1px 3px #000",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",pointerEvents:"none"}}>
        {c.silencio ? "🔇 " : ""}{c.nombre}</div>}
      {w > 60 && pista.tipo==="video" && <div style={{position:"absolute",right:6,top:ALTO_FOTO-15,fontSize:9.5,fontWeight:700,color:"#eee",textShadow:"0 1px 3px #000",pointerEvents:"none"}}>{corto(largo(c))}</div>}
      {!cuchilla && <>
        <div onMouseDown={e=>onDown(e, c, pista, "izq")} title="Recortar el principio"
          style={{position:"absolute",left:-2,top:-2,bottom:-2,width:9,cursor:"ew-resize",borderRadius:"5px 0 0 5px",background:elegido?COL.sel:"transparent"}}/>
        <div onMouseDown={e=>onDown(e, c, pista, "der")} title="Recortar el final"
          style={{position:"absolute",right:-2,top:-2,bottom:-2,width:9,cursor:"ew-resize",borderRadius:"0 5px 5px 0",background:elegido?COL.sel:"transparent"}}/>
      </>}
    </div>);
});

export function LineaTiempo({ proyecto, zoom, setZoom, sel, setSel, herramienta, iman, reloj, jugando, tiras, ondas,
                              onIr, onGesto, onDividirEn, onSoltarMedio, onMenu, onPista }) {
  const caja = useRef(null), regla = useRef(null), cabezal = useRef(null), hover = useRef(null), hoverTxt = useRef(null), aviso = useRef(null);
  const lienzos = useRef({});
  const [scroll, setScroll] = useState(0);
  const [ancho, setAncho] = useState(1000);
  const fps = proyecto.fps || 30;
  const dur = useMemo(()=>Math.max(0, ...proyecto.pistas.flatMap(pi=>pi.clips.map(fin))),[proyecto]);
  const puntos = useMemo(()=>puntosDeCorte(proyecto),[proyecto]);
  const anchoTotal = Math.max(ancho, (dur + 20) * zoom + PAD * 2);
  const pRef = useRef(proyecto); pRef.current = proyecto;
  const zRef = useRef(zoom); zRef.current = zoom;

  // el tamaño visible
  useEffect(()=>{
    const el = caja.current; if(!el) return;
    const ro = new ResizeObserver(()=>setAncho(el.clientWidth)); ro.observe(el); setAncho(el.clientWidth);
    return ()=>ro.disconnect();
  },[]);
  const alDesplazar = () => { const el = caja.current; if(el) requestAnimationFrame(()=>setScroll(el.scrollLeft)); };

  // el cabezal sigue al reloj (sin pasar por React)
  useEffect(()=>reloj.oir(t=>{
    const x = PAD + t * zRef.current;
    if(cabezal.current) cabezal.current.style.transform = `translateX(${x}px)`;
    const el = caja.current;
    if(el && jugando.current){ if(x > el.scrollLeft + el.clientWidth - 80 || x < el.scrollLeft) el.scrollLeft = Math.max(0, x - 120); }
  }),[reloj]);
  useEffect(()=>{ if(cabezal.current) cabezal.current.style.transform = `translateX(${PAD + reloj.t * zoom}px)`; },[zoom]);

  // ---- pintar: la regla y cada pista (solo lo visible)
  useEffect(()=>{
    const cv = regla.current; if(!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = ancho * dpr; cv.height = ALTO_REGLA * dpr;
    const g = cv.getContext("2d"); g.scale(dpr, dpr); g.clearRect(0, 0, ancho, ALTO_REGLA);
    const paso = pasoRegla(zoom, fps), sub = paso / 5;
    const t0 = Math.max(0, (scroll - PAD) / zoom), t1 = (scroll + ancho) / zoom;
    g.fillStyle = "rgba(255,255,255,0.18)";
    for(let t = Math.floor(t0 / sub) * sub; t <= t1; t += sub){ const x = PAD + t*zoom - scroll; g.fillRect(Math.round(x), ALTO_REGLA-6, 1, 6); }
    g.fillStyle = "rgba(255,255,255,0.55)"; g.font = "10px system-ui, sans-serif";
    for(let t = Math.floor(t0 / paso) * paso; t <= t1; t += paso){
      const x = PAD + t*zoom - scroll; g.fillRect(Math.round(x), ALTO_REGLA-13, 1, 13);
      g.fillText(paso < 1 ? tc(t, fps) : corto(t), x + 4, 12);
    }
    (proyecto.marcadores||[]).forEach(m=>{ const x = PAD + m*zoom - scroll; g.fillStyle = "#60a5fa";
      g.beginPath(); g.moveTo(x-5, 16); g.lineTo(x+5, 16); g.lineTo(x+5, 24); g.lineTo(x, 29); g.lineTo(x-5, 24); g.closePath(); g.fill(); });
  },[zoom, scroll, ancho, proyecto.marcadores, fps]);

  useEffect(()=>{
    const dpr = window.devicePixelRatio || 1;
    const t0 = Math.max(0, (scroll - PAD) / zoom) - 1, t1 = (scroll + ancho) / zoom + 1;
    proyecto.pistas.forEach(pi=>{
      const cv = lienzos.current[pi.id]; if(!cv) return;
      const H = ALTO[pi.tipo];
      cv.width = ancho * dpr; cv.height = H * dpr;
      const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, ancho, H);
      pi.clips.forEach(c=>{
        if(fin(c) < t0 || c.en > t1) return;
        const x0 = PAD + c.en*zoom - scroll, x1 = PAD + fin(c)*zoom - scroll;
        const a = Math.max(0, x0), b = Math.min(ancho, x1);
        if(b <= a) return;
        g.save(); g.beginPath(); g.rect(a, 0, b - a, H); g.clip();
        g.fillStyle = pi.tipo==="video" ? COL.video : COL.audio; g.fillRect(a, 0, b - a, H);
        const gris = c.silencio || pi.muda;
        const tsrc = x => c.desde + ((x + scroll - PAD) / zoom - c.en);       // el segundo del archivo en esa x
        if(pi.tipo==="video"){
          const tr = tiras[c.ruta];
          if(tr && tr.img && tr.img.complete && tr.img.naturalWidth){
            const tw = tr.fw * ALTO_FOTO / tr.fh;
            let x = x0 + Math.floor((a - x0) / tw) * tw;
            for(; x < b; x += tw){
              const i = Math.max(0, Math.min(tr.n - 1, Math.floor(tsrc(x + tw/2) / tr.dur * tr.n)));
              g.drawImage(tr.img, i * tr.fw, 0, tr.fw, tr.fh, x, 0, tw, ALTO_FOTO);
            }
          }
          g.fillStyle = "rgba(5,10,18,0.92)"; g.fillRect(a, ALTO_FOTO, b - a, H - ALTO_FOTO);
        }
        // la onda: de abajo hacia arriba, un pico por píxel
        const od = ondas[c.ruta];
        if(od && od.length){
          const ytop = pi.tipo==="video" ? ALTO_FOTO + 3 : 16, hW = H - ytop - 3, base = H - 3, n = od.length, ds = c.dur_src || 1;
          g.fillStyle = gris ? "rgba(150,150,150,0.55)" : (pi.tipo==="video" ? "rgba(96,165,250,0.95)" : "rgba(74,222,128,0.95)");
          for(let x = Math.floor(a); x < b; x++){
            const s0 = tsrc(x), s1 = tsrc(x + 1);
            let i0 = Math.floor(s0 / ds * n), i1 = Math.max(i0 + 1, Math.ceil(s1 / ds * n)), m = 0;
            for(let i = Math.max(0, i0); i < Math.min(n, i1); i++) if(od[i] > m) m = od[i];
            const vf = (c.vol ?? 1);
            const hh = Math.max(1, m * Math.min(1.25, vf) * hW);
            g.fillRect(x, base - hh, 1, hh);
          }
        }
        // los fundidos, como una cuña oscura
        const fi = (c.fade_in||0) * zoom, fo = (c.fade_out||0) * zoom;
        g.fillStyle = "rgba(0,0,0,0.45)";
        if(fi > 0){ g.beginPath(); g.moveTo(x0, 0); g.lineTo(x0 + fi, 0); g.lineTo(x0, H); g.closePath(); g.fill(); }
        if(fo > 0){ g.beginPath(); g.moveTo(x1, 0); g.lineTo(x1 - fo, 0); g.lineTo(x1, H); g.closePath(); g.fill(); }
        g.restore();
      });
    });
  },[proyecto, zoom, scroll, ancho, tiras, ondas]);

  // ---- encajar (imán)
  const encaje = (t, ignorar) => {
    if(!iman) return t;
    const u = 9 / zRef.current;
    const ps = [reloj.t, ...(pRef.current.marcadores||[]), ...pRef.current.pistas.flatMap(pi=>pi.clips.filter(c=>c.id!==ignorar).flatMap(c=>[c.en, fin(c)]))];
    let mejor = t, d = u;
    ps.forEach(q=>{ if(Math.abs(q - t) < d){ d = Math.abs(q - t); mejor = q; } });
    return mejor;
  };
  const tDeX = clientX => { const r = caja.current.getBoundingClientRect(); return Math.max(0, (clientX - r.left + caja.current.scrollLeft - PAD) / zRef.current); };
  const avisar = (txt, clientX) => {
    const el = aviso.current; if(!el) return;
    if(!txt){ el.style.display = "none"; return; }
    const r = caja.current.parentElement.getBoundingClientRect();
    el.style.display = "block"; el.textContent = txt; el.style.left = (clientX - r.left + 12) + "px";
  };

  // ---- el cabezal (arrastrar en la regla o en un hueco): se pega a los bordes de los trozos
  const arrastrarCabezal = e => {
    if(e.button !== 0) return;
    e.preventDefault();
    if(!e.shiftKey) setSel(new Set());
    const mover = ev => {
      let t = tDeX(ev.clientX);
      if(iman && !ev.altKey){ const u = 9 / zRef.current; const q = puntos.find(p=>Math.abs(p - t) < u); if(q != null) t = q; }
      onIr(cuantiza(t, fps));
    };
    mover(e);
    const soltar = () => { window.removeEventListener("mousemove", mover); window.removeEventListener("mouseup", soltar); };
    window.addEventListener("mousemove", mover); window.addEventListener("mouseup", soltar);
  };

  // ---- los clips: elegir, mover, recortar, o cortar con la cuchilla
  const filas = useRef({});
  const pistaBajo = clientY => Object.entries(filas.current).find(([id, el])=>{ if(!el) return false; const r = el.getBoundingClientRect(); return clientY >= r.top && clientY <= r.bottom; });
  const onDown = (e, c, pista, modo) => {
    if(e.button !== 0) return;
    e.stopPropagation(); e.preventDefault();
    if(pista.bloqueada) return;
    if(herramienta === "cuchilla"){ onDividirEn(c.id, cuantiza(encaje(tDeX(e.clientX), null), fps)); return; }
    if(e.shiftKey || e.ctrlKey){ setSel(s=>{ const n = new Set(s); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; }); return; }
    if(!sel.has(c.id)) setSel(new Set([c.id]));
    const x0 = e.clientX, inicial = pRef.current;
    let movido = false;
    onGesto("inicio");
    const mover = ev => {
      if(!movido && Math.abs(ev.clientX - x0) < 3 && modo === "mover") return;
      movido = true;
      const dt = (ev.clientX - x0) / zRef.current;
      let destino = pista.id;
      if(modo === "mover" && pista.tipo === "audio"){ const f = pistaBajo(ev.clientY); if(f){ const pd = inicial.pistas.find(x=>x.id===f[0]); if(pd && pd.tipo==="audio" && !pd.bloqueada) destino = pd.id; } }
      let txt = "";
      const ps = inicial.pistas.map(pi=>{
        if(pi.id !== pista.id && pi.id !== destino) return pi;
        let clips = pi.clips;
        if(pi.id === pista.id) clips = clips.filter(y=>!(y.id===c.id && destino!==pista.id));
        if(pi.id === pista.id && destino === pista.id) clips = clips.map(y=>{
          if(y.id !== c.id) return y;
          if(modo === "izq"){
            let desde = Math.max(0, Math.min(y.hasta - 1/fps, y.desde + dt));
            if(pi.id !== "v1"){ const en = encaje(y.en + (desde - y.desde), y.id); desde = Math.max(0, Math.min(y.hasta - 1/fps, y.desde + (en - y.en))); }
            else { const g = encaje(y.en + (desde - y.desde), y.id); desde = Math.max(0, Math.min(y.hasta - 1/fps, y.desde + (g - y.en))); }
            desde = cuantiza(desde, fps);
            txt = `${desde - y.desde >= 0 ? "−" : "+"}${tc(Math.abs(desde - y.desde), fps)}  ·  dura ${tc(y.hasta - desde, fps)}`;
            return {...y, desde, en: pi.id==="v1" ? y.en : y.en + (desde - y.desde)};
          }
          if(modo === "der"){
            let hasta = Math.max(y.desde + 1/fps, Math.min(y.dur_src ?? 1e9, y.hasta + dt));
            const f2 = encaje(y.en + (hasta - y.desde), y.id); hasta = Math.max(y.desde + 1/fps, Math.min(y.dur_src ?? 1e9, y.desde + (f2 - y.en)));
            hasta = cuantiza(hasta, fps);
            txt = `${hasta - y.hasta >= 0 ? "+" : "−"}${tc(Math.abs(hasta - y.hasta), fps)}  ·  dura ${tc(hasta - y.desde, fps)}`;
            return {...y, hasta};
          }
          if(pi.id === "v1"){ txt = ""; return {...y, en: y.en + dt + (dt > 0 ? 0.0005 : -0.0005)}; }
          let en = Math.max(0, encaje(y.en + dt, y.id));
          const f2 = encaje(en + largo(y), y.id); if(f2 !== en + largo(y)) en = Math.max(0, f2 - largo(y));
          txt = tc(en, fps);
          return {...y, en};
        });
        if(pi.id === destino && destino !== pista.id){
          const en = Math.max(0, encaje(c.en + dt, c.id));
          if(!solapa(pi, en, largo(c), c.id)) clips = [...clips, {...c, en}];
          else return pi;
        }
        return {...pi, clips};
      });
      if(destino !== pista.id && !ps.find(x=>x.id===destino).clips.some(y=>y.id===c.id)) return;
      onGesto("durante", {...inicial, pistas: ps});
      avisar(txt, ev.clientX);
    };
    const soltar = () => { window.removeEventListener("mousemove", mover); window.removeEventListener("mouseup", soltar); avisar(null); onGesto("fin"); };
    window.addEventListener("mousemove", mover); window.addEventListener("mouseup", soltar);
  };

  // ---- ratón por encima: una línea fina y su tiempo exacto (para cortar justo donde se quiere)
  const alMover = e => {
    const el = hover.current; if(!el || !caja.current) return;
    const r = caja.current.getBoundingClientRect();
    if(e.clientY < r.top) { el.style.display = "none"; return; }
    let t = tDeX(e.clientX);
    if(herramienta === "cuchilla") t = cuantiza(encaje(t, null), fps);
    el.style.display = "block"; el.style.transform = `translateX(${PAD + t * zRef.current}px)`;
    if(hoverTxt.current) hoverTxt.current.textContent = tc(t, fps);
    el.style.background = herramienta === "cuchilla" ? "rgba(248,113,113,0.95)" : "rgba(255,255,255,0.35)";
  };
  const rueda = e => {
    const el = caja.current; if(!el) return;
    if(e.ctrlKey){
      e.preventDefault();
      const r = el.getBoundingClientRect(), mx = e.clientX - r.left, t = (mx + el.scrollLeft - PAD) / zRef.current;
      const nz = Math.max(0.5, Math.min(2000, zRef.current * (e.deltaY < 0 ? 1.18 : 1/1.18)));
      setZoom(nz);
      requestAnimationFrame(()=>{ el.scrollLeft = Math.max(0, t * nz + PAD - mx); setScroll(el.scrollLeft); });    // el punto bajo el ratón no se mueve
    } else if(!e.shiftKey && Math.abs(e.deltaY) > Math.abs(e.deltaX)){
      el.scrollLeft += e.deltaY; alDesplazar();
    }
  };
  useEffect(()=>{ const el = caja.current; if(!el) return; el.addEventListener("wheel", rueda, {passive:false}); return ()=>el.removeEventListener("wheel", rueda); });

  const t0v = Math.max(0, (scroll - PAD) / zoom) - 2, t1v = (scroll + ancho) / zoom + 2;
  const cuchilla = herramienta === "cuchilla";
  return (
    <div style={{position:"relative",display:"flex",minHeight:0,flex:1,userSelect:"none"}} onDragStart={e=>{ if(!e.target.closest || !e.target.closest("[data-medio]")) e.preventDefault(); }}>
      {/* cabeceras de pista */}
      <div style={{width:96,flexShrink:0,borderRight:"1px solid #2a2a2a",background:"#141414"}}>
        <div style={{height:ALTO_REGLA,borderBottom:"1px solid #2a2a2a"}}/>
        {proyecto.pistas.map(pi=>(
          <div key={pi.id} style={{height:ALTO[pi.tipo],marginTop:6,display:"flex",alignItems:"center",gap:4,padding:"0 6px"}}>
            <span style={{fontSize:10.5,fontWeight:800,color:"#888",width:22}}>{pi.tipo==="video" ? "V1" : "A"+(proyecto.pistas.filter(x=>x.tipo==="audio").indexOf(pi)+1)}</span>
            <button onClick={()=>onPista("muda", pi.id)} title={pi.muda ? "Pista silenciada" : "Silenciar la pista"} className={"rd-ico"+(pi.muda?" on":"")} style={{width:24,height:24}}>{pi.muda ? "🔇" : "🔊"}</button>
            <button onClick={()=>onPista("bloqueada", pi.id)} title={pi.bloqueada ? "Pista bloqueada" : "Bloquear la pista"} className={"rd-ico"+(pi.bloqueada?" on":"")} style={{width:24,height:24}}>{pi.bloqueada ? "🔒" : "🔓"}</button>
            {pi.tipo==="audio" && !pi.clips.length && proyecto.pistas.filter(x=>x.tipo==="audio").length>1 &&
              <button onClick={()=>onPista("quitar", pi.id)} title="Quitar la pista vacía" className="rd-ico" style={{width:20,height:24}}>×</button>}
          </div>))}
      </div>
      <div ref={caja} onScroll={alDesplazar} onMouseMove={alMover} onMouseLeave={()=>{ if(hover.current) hover.current.style.display = "none"; }}
        style={{position:"relative",overflowX:"auto",overflowY:"hidden",flex:1,background:"#101010"}}>
        <div style={{position:"relative",width:anchoTotal,minHeight:"100%"}}>
          {/* regla */}
          <div onMouseDown={arrastrarCabezal} style={{position:"relative",height:ALTO_REGLA,borderBottom:"1px solid #2a2a2a",cursor:"pointer",background:"#151515"}}>
            <canvas ref={regla} style={{position:"sticky",left:0,display:"block",width:ancho,height:ALTO_REGLA}}/>
          </div>
          {/* pistas */}
          {proyecto.pistas.map(pi=>(
            <div key={pi.id} ref={el=>{ filas.current[pi.id] = el; }} onMouseDown={arrastrarCabezal}
              onDragOver={e=>{ e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
              onDrop={e=>{ e.preventDefault(); try { onSoltarMedio(JSON.parse(e.dataTransfer.getData("application/x-randomeditor")), pi, cuantiza(encaje(tDeX(e.clientX), null), fps)); } catch(x){} }}
              style={{position:"relative",height:ALTO[pi.tipo],marginTop:6,background:pi.bloqueada?"repeating-linear-gradient(135deg,#151515 0 8px,#1a1a1a 8px 16px)":"#161616",opacity:pi.muda?0.6:1}}>
              <canvas ref={el=>{ lienzos.current[pi.id] = el; }} style={{position:"sticky",left:0,display:"block",width:ancho,height:ALTO[pi.tipo],pointerEvents:"none"}}/>
              <div style={{position:"absolute",inset:0}}>
                {pi.clips.filter(c=>fin(c) >= t0v && c.en <= t1v).map(c=>
                  <Clip key={c.id} c={c} pista={pi} zoom={zoom} elegido={sel.has(c.id)} cuchilla={cuchilla} onDown={onDown} onMenu={onMenu}/>)}
              </div>
              {pi.id==="v1" && !pi.clips.length && <div style={{position:"absolute",left:PAD+8,top:38,fontSize:12,color:"#777",pointerEvents:"none"}}>Arrastra aquí clips de la biblioteca (o pulsa ＋)</div>}
            </div>))}
          {/* el ratón y el cabezal */}
          <div ref={hover} style={{position:"absolute",left:0,top:0,bottom:0,width:1,display:"none",pointerEvents:"none",zIndex:3}}>
            <span ref={hoverTxt} style={{position:"absolute",top:2,left:5,fontSize:10,fontWeight:700,color:"#fff",background:"rgba(0,0,0,0.75)",padding:"1px 4px",borderRadius:3,whiteSpace:"nowrap"}}/>
          </div>
          <div ref={cabezal} style={{position:"absolute",left:0,top:0,bottom:0,width:0,pointerEvents:"none",zIndex:4,transform:`translateX(${PAD}px)`}}>
            <div style={{position:"absolute",left:-1,top:0,bottom:0,width:2,background:"#fff",boxShadow:"0 0 4px rgba(0,0,0,0.8)"}}/>
            <div style={{position:"absolute",left:-7,top:0,width:14,height:16,background:"#fff",clipPath:"polygon(0 0,100% 0,100% 60%,50% 100%,0 60%)"}}/>
          </div>
        </div>
      </div>
      <div ref={aviso} style={{position:"absolute",top:ALTO_REGLA+4,display:"none",fontSize:11,fontWeight:700,color:"#000",background:"var(--gold)",padding:"3px 7px",borderRadius:5,pointerEvents:"none",zIndex:5,whiteSpace:"nowrap"}}/>
    </div>);
}
