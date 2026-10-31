import React from "react";
import { fin, largo, tc, corto, puntosDeCorte, cuantiza, solapa, vel } from "./modelo";
const { useEffect, useLayoutEffect, useRef, useState, useMemo, memo, useCallback } = React;

/* RandomEditor · la línea de tiempo, al estilo de CapCut de PC.
   - cada pista es un LIENZO que pinta solo lo que se ve: el fotograma real de cada punto del clip
     (no una miniatura repetida) y la onda del sonido de abajo hacia arriba
   - encima, los clips como cajas (borde, nombre, asas para recortar); solo los visibles
   - el cabezal y la línea del ratón se mueven solos (el reloj), sin repintar el resto
   - imán: el cabezal, los recortes y los movimientos se pegan a los cortes y marcadores (línea amarilla)
   - v3.14.1, él: "necesito poder navegar por el timeline horizontalmente, con atajos o con una barra":
     barra de abajo (arrastrar = desplazar; sus bordes = acercar/alejar, como Premiere), rueda,
     Re Pág / Av Pág, botón central del ratón arrastrando, y el cabezal nunca se queda fuera de la vista */
export const PAD = 16, ALTO_REGLA = 30;
export const ALTO = { video: 100, audio: 58, texto: 34, subtitulos: 34 };
const ALTO_FOTO = 58, CABECERA = 96, ALTO_BARRA = 16;
const COL = { video:"#1d3557", audio:"#183a2b", texto:"#4c1d95", subtitulos:"#115e59", sel:"#D4AF37", borde:"rgba(255,255,255,0.16)" };
const ZMIN = 0.5, ZMAX = 2000;

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
      {w > 30 && <div style={{position:"absolute",left:5,top:pista.tipo==="texto"||pista.tipo==="subtitulos"?8:3,right:5,fontSize:10.5,fontWeight:700,color:"#fff",textShadow:"0 1px 3px #000",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",pointerEvents:"none"}}>
        {c.tipo === "texto" || c.tipo === "sub" ? (c.tipo === "texto" ? "T  " : "") + (c.texto || "").split("\n").join(" ") :(c.silencio ? "🔇 " : "") + c.nombre}</div>}
      {w > 60 && pista.tipo==="video" && <div style={{position:"absolute",right:6,top:ALTO_FOTO-15,fontSize:9.5,fontWeight:700,color:"#eee",textShadow:"0 1px 3px #000",pointerEvents:"none"}}>{corto(largo(c))}</div>}
      {!cuchilla && <>
        <div onMouseDown={e=>onDown(e, c, pista, "izq")} title="Recortar el principio"
          style={{position:"absolute",left:-2,top:-2,bottom:-2,width:9,cursor:"ew-resize",borderRadius:"5px 0 0 5px",background:elegido?COL.sel:"transparent"}}/>
        <div onMouseDown={e=>onDown(e, c, pista, "der")} title="Recortar el final"
          style={{position:"absolute",right:-2,top:-2,bottom:-2,width:9,cursor:"ew-resize",borderRadius:"0 5px 5px 0",background:elegido?COL.sel:"transparent"}}/>
      </>}
    </div>);
});

/* la barra de desplazamiento: toda la línea de tiempo en pequeño; el tramo claro es lo que se ve.
   Arrastrarlo desplaza; arrastrar sus bordes acerca o aleja; clic fuera centra la vista ahí. */
function Barra({ ancho, zoom, scroll, dur, marcadores, puntos, reloj, onVista }) {
  const pista = useRef(null), cab = useRef(null);
  const [W0, setW0] = useState(ancho);
  useEffect(()=>{ const el = pista.current; if(!el) return; const ro = new ResizeObserver(()=>setW0(el.clientWidth)); ro.observe(el); setW0(el.clientWidth); return ()=>ro.disconnect(); },[]);
  const S = Math.max(dur + 20, 1);                                   // segundos que representa la barra
  const W = Math.max(1, W0);
  const t0 = Math.max(0, (scroll - PAD) / zoom), vis = ancho / zoom;
  const L = Math.min(W - 24, t0 / S * W), R = Math.max(L + 24, Math.min(W, (t0 + vis) / S * W));
  const zRef = useRef({zoom, t0, vis, S, W}); zRef.current = {zoom, t0, vis, S, W};
  useEffect(()=>reloj.oir(t=>{ if(cab.current) cab.current.style.transform = `translateX(${t / zRef.current.S * zRef.current.W}px)`; }),[reloj]);
  useEffect(()=>{ if(cab.current) cab.current.style.transform = `translateX(${reloj.t / S * W}px)`; },[S, W]);
  const arrastrar = (e, modo) => {
    if(e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const x0 = e.clientX, a = zRef.current;
    const tL = a.t0, tR = a.t0 + a.vis;
    const mover = ev => {
      const dts = (ev.clientX - x0) / a.W * a.S;
      if(modo === "mover") onVista(null, Math.max(0, tL + dts));
      else if(modo === "izq"){ const n = Math.max(0, Math.min(tR - 0.05, tL + dts)); onVista(ancho / (tR - n), n); }
      else { const n = Math.max(tL + 0.05, tR + dts); onVista(ancho / (n - tL), tL); }
    };
    const soltar = () => { window.removeEventListener("mousemove", mover); window.removeEventListener("mouseup", soltar); };
    window.addEventListener("mousemove", mover); window.addEventListener("mouseup", soltar);
  };
  const clicFuera = e => {
    if(e.button !== 0) return;
    const r = pista.current.getBoundingClientRect(), t = (e.clientX - r.left) / W * S;
    onVista(null, Math.max(0, t - vis / 2));
    arrastrar(e, "mover");
  };
  return (
    <div style={{display:"flex",height:ALTO_BARRA + 8,alignItems:"center",borderTop:"1px solid #222",background:"#121212",flexShrink:0}}>
      <div style={{width:CABECERA,flexShrink:0}}/>
      <div ref={pista} onMouseDown={clicFuera} title="Arrastra para moverte · sus bordes, para acercar o alejar"
        style={{position:"relative",flex:1,minWidth:0,marginRight:6,height:ALTO_BARRA,background:"#1a1a1a",borderRadius:4,cursor:"pointer",overflow:"hidden"}}>
        {puntos.map((q, k)=><div key={"p"+k} style={{position:"absolute",left:q / S * W,top:4,bottom:4,width:1,background:"rgba(255,255,255,0.13)"}}/>)}
        {(marcadores||[]).map((m, k)=><div key={"m"+k} style={{position:"absolute",left:m / S * W - 1,top:0,bottom:0,width:2,background:"#60a5fa"}}/>)}
        <div onMouseDown={e=>arrastrar(e, "mover")} style={{position:"absolute",left:L,width:R - L,top:1,bottom:1,borderRadius:4,
          background:"rgba(255,255,255,0.16)",border:"1px solid rgba(255,255,255,0.28)",boxSizing:"border-box",cursor:"grab"}}>
          <div onMouseDown={e=>arrastrar(e, "izq")} title="Acercar / alejar" style={{position:"absolute",left:-1,top:-1,bottom:-1,width:7,cursor:"ew-resize",background:"rgba(212,175,55,0.75)",borderRadius:"4px 0 0 4px"}}/>
          <div onMouseDown={e=>arrastrar(e, "der")} title="Acercar / alejar" style={{position:"absolute",right:-1,top:-1,bottom:-1,width:7,cursor:"ew-resize",background:"rgba(212,175,55,0.75)",borderRadius:"0 4px 4px 0"}}/>
        </div>
        <div ref={cab} style={{position:"absolute",left:0,top:0,bottom:0,width:2,background:"#fff",pointerEvents:"none"}}/>
      </div>
    </div>);
}

export function LineaTiempo({ proyecto, zoom, setZoom, sel, setSel, herramienta, iman, reloj, jugando, tiras, ondas,
                              onIr, onGesto, onDividirEn, onSoltarMedio, onMenu, onPista }) {
  const caja = useRef(null), vertical = useRef(null), regla = useRef(null), cabezal = useRef(null), hover = useRef(null), hoverTxt = useRef(null), aviso = useRef(null), guia = useRef(null);
  const lienzos = useRef({});
  const [scroll, setScroll] = useState(0);
  const [ancho, setAncho] = useState(1000);
  const fps = proyecto.fps || 30;
  const mag = !!proyecto.magnetica;
  const dur = useMemo(()=>Math.max(0, ...proyecto.pistas.flatMap(pi=>pi.clips.map(fin))),[proyecto]);
  const puntos = useMemo(()=>puntosDeCorte(proyecto),[proyecto]);
  const anchoTotal = Math.max(ancho, (dur + 20) * zoom + PAD * 2);
  const pRef = useRef(proyecto); pRef.current = proyecto;
  const zRef = useRef(zoom); zRef.current = zoom;
  const durRef = useRef(dur); durRef.current = dur;

  // el tamaño visible
  useEffect(()=>{
    const el = caja.current; if(!el) return;
    const ro = new ResizeObserver(()=>setAncho(el.clientWidth)); ro.observe(el); setAncho(el.clientWidth);
    return ()=>ro.disconnect();
  },[]);
  // desplazar (un solo repintado por fotograma, aunque lleguen muchos eventos)
  const pend = useRef(false);
  const alDesplazar = () => { if(pend.current) return; pend.current = true; requestAnimationFrame(()=>{ pend.current = false; if(caja.current) setScroll(caja.current.scrollLeft); }); };
  const desplazarA = x => { const el = caja.current; if(!el) return; el.scrollLeft = Math.max(0, x); alDesplazar(); };
  // poner la vista: zoom (o null = el mismo) y el segundo que queda en el borde izquierdo
  // (con zoom nuevo, el desplazamiento se aplica cuando el contenido ya tiene su ancho nuevo)
  const objetivo = useRef(null);
  const ponerVista = (z, tIzq) => {
    const nz = z == null ? zRef.current : Math.max(ZMIN, Math.min(ZMAX, z));
    if(nz !== zRef.current){ zRef.current = nz; objetivo.current = tIzq * nz + PAD; setZoom(nz); }
    else desplazarA(tIzq * nz + PAD);
  };
  // el zoom que llega de fuera (botones, Ctrl++ / Ctrl+-, la barra de zoom) acerca alrededor del cabezal
  const zAnt = useRef(zoom);
  useLayoutEffect(()=>{
    const oz = zAnt.current; zAnt.current = zoom;
    if(objetivo.current != null){ const x = objetivo.current; objetivo.current = null; desplazarA(x); return; }
    const el = caja.current; if(!el || oz === zoom) return;
    const enPantalla = reloj.t * oz + PAD - el.scrollLeft;
    desplazarA(reloj.t * zoom + PAD - (enPantalla >= 0 && enPantalla <= el.clientWidth ? enPantalla : el.clientWidth * 0.35));
  },[zoom]);

  // el cabezal sigue al reloj (sin pasar por React) y nunca se queda fuera de la vista
  useEffect(()=>reloj.oir(t=>{
    const x = PAD + t * zRef.current;
    if(cabezal.current) cabezal.current.style.transform = `translateX(${x}px)`;
    const el = caja.current; if(!el || arrastrando.current) return;
    if(jugando.current){ if(x > el.scrollLeft + el.clientWidth - 80 || x < el.scrollLeft) desplazarA(x - 120); }
    else if(x < el.scrollLeft + 4 || x > el.scrollLeft + el.clientWidth - 4) desplazarA(x - el.clientWidth * 0.35);
  }),[reloj]);
  useEffect(()=>{ if(cabezal.current) cabezal.current.style.transform = `translateX(${PAD + reloj.t * zoom}px)`; },[zoom]);

  // ---- pintar: la regla y cada pista (solo lo visible)
  const tam = (cv, w, h) => { const dpr = window.devicePixelRatio || 1; if(cv.width !== Math.round(w*dpr) || cv.height !== Math.round(h*dpr)){ cv.width = Math.round(w*dpr); cv.height = Math.round(h*dpr); } const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h); return g; };
  useEffect(()=>{
    const cv = regla.current; if(!cv) return;
    const g = tam(cv, ancho, ALTO_REGLA);
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
    const t0 = Math.max(0, (scroll - PAD) / zoom) - 1, t1 = (scroll + ancho) / zoom + 1;
    proyecto.pistas.forEach(pi=>{
      const cv = lienzos.current[pi.id]; if(!cv) return;
      const H = ALTO[pi.tipo];
      const g = tam(cv, ancho, H);
      pi.clips.forEach(c=>{
        if(fin(c) < t0 || c.en > t1) return;
        const x0 = PAD + c.en*zoom - scroll, x1 = PAD + fin(c)*zoom - scroll;
        const a = Math.max(0, x0), b = Math.min(ancho, x1);
        if(b <= a) return;
        g.save(); g.beginPath(); g.rect(a, 0, b - a, H); g.clip();
        g.fillStyle = COL[pi.tipo] || COL.audio; g.fillRect(a, 0, b - a, H);
        if(pi.tipo === "texto" || pi.tipo === "subtitulos"){ g.restore(); return; }
        const gris = c.silencio || pi.muda;
        const tsrc = x => c.desde + ((x + scroll - PAD) / zoom - c.en) * vel(c);       // el segundo del archivo en esa x
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
          const vf = Math.min(1.25, c.vol ?? 1);
          for(let x = Math.floor(a); x < b; x++){
            const s0 = tsrc(x), s1 = tsrc(x + 1);
            let i0 = Math.floor(s0 / ds * n), i1 = Math.max(i0 + 1, Math.ceil(s1 / ds * n)), m = 0;
            for(let i = Math.max(0, i0); i < Math.min(n, i1); i++) if(od[i] > m) m = od[i];
            const hh = Math.max(1, m * vf * hW);
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

  // ---- encajar (imán), con la línea amarilla donde engancha
  const encajado = useRef(null);
  // (ignorar: el id de un clip, o un Set con los de un grupo que se mueve junto)
  const encaje = (t, ignorar) => {
    if(!iman) return t;
    const u = 9 / zRef.current;
    const fuera = ignorar instanceof Set ? ignorar : new Set([ignorar]);
    const ps = [reloj.t, ...(pRef.current.marcadores||[]), ...pRef.current.pistas.flatMap(pi=>pi.clips.filter(c=>!fuera.has(c.id)).flatMap(c=>[c.en, fin(c)]))];
    let mejor = t, d = u;
    ps.forEach(q=>{ if(Math.abs(q - t) < d){ d = Math.abs(q - t); mejor = q; } });
    if(mejor !== t) encajado.current = mejor;
    return mejor;
  };
  const mostrarGuia = t => { const el = guia.current; if(!el) return; if(t == null){ el.style.display = "none"; return; } el.style.display = "block"; el.style.transform = `translateX(${PAD + t * zRef.current}px)`; };
  const tDeX = clientX => { const r = caja.current.getBoundingClientRect(); return Math.max(0, (clientX - r.left + caja.current.scrollLeft - PAD) / zRef.current); };
  const avisar = (txt, clientX) => {
    const el = aviso.current; if(!el) return;
    if(!txt){ el.style.display = "none"; return; }
    const r = el.parentElement.getBoundingClientRect();
    el.style.display = "block"; el.textContent = txt; el.style.left = (clientX - r.left + 12) + "px";
  };

  // ---- arrastrar cerca del borde: la vista se desplaza sola (y lo arrastrado sigue al ratón)
  const arrastrando = useRef(false);
  const auto = useRef({ raf:0, ev:null, mover:null });
  const autoDesplazar = (ev, mover) => {
    const a = auto.current; a.ev = ev; a.mover = mover;
    const el = caja.current; if(!el) return;
    const r = el.getBoundingClientRect(), borde = 48;
    const v = ev.clientX > r.right - borde ? (ev.clientX - (r.right - borde)) : ev.clientX < r.left + borde ? -((r.left + borde) - ev.clientX) : 0;
    if(!v){ cancelAnimationFrame(a.raf); a.raf = 0; return; }
    if(a.raf) return;
    const paso = () => {
      const r2 = el.getBoundingClientRect(), e2 = a.ev;
      const v2 = e2.clientX > r2.right - borde ? (e2.clientX - (r2.right - borde)) : e2.clientX < r2.left + borde ? -((r2.left + borde) - e2.clientX) : 0;
      if(!v2){ a.raf = 0; return; }
      el.scrollLeft = Math.max(0, el.scrollLeft + Math.sign(v2) * Math.min(40, 4 + Math.abs(v2) * 0.6)); alDesplazar();
      a.mover(e2, true);
      a.raf = requestAnimationFrame(paso);
    };
    a.raf = requestAnimationFrame(paso);
  };
  const pararAuto = () => { cancelAnimationFrame(auto.current.raf); auto.current.raf = 0; };

  // ---- el cabezal (arrastrar en la regla o en un hueco): se pega a los bordes de los trozos
  const soltarFoco = () => { const a = document.activeElement; if(a && a !== document.body && a.blur) a.blur(); };
  const arrastrarCabezal = e => {
    if(e.button !== 0) return;
    e.preventDefault(); soltarFoco();
    if(!e.shiftKey) setSel(new Set());
    arrastrando.current = true;
    const mover = (ev, desdeAuto) => {
      let t = tDeX(ev.clientX), q = null;
      if(iman && !ev.altKey){ const u = 9 / zRef.current; q = puntos.find(p=>Math.abs(p - t) < u); if(q != null) t = q; }
      mostrarGuia(q);
      onIr(cuantiza(Math.min(t, durRef.current), fps));
      if(!desdeAuto) autoDesplazar(ev, mover);
    };
    mover(e, true);
    const soltar = () => { arrastrando.current = false; pararAuto(); mostrarGuia(null); window.removeEventListener("mousemove", mover); window.removeEventListener("mouseup", soltar); };
    window.addEventListener("mousemove", mover); window.addEventListener("mouseup", soltar);
  };

  // ---- arrastrar en un hueco de las pistas = recuadro de selección (como el escritorio de Windows);
  //      un clic sin arrastrar mueve el cabezal ahí (Shift/Ctrl: se suma a lo elegido)
  const marco = useRef(null);
  const seleccionCaja = e => {
    if(e.button !== 0) return;
    e.preventDefault(); soltarFoco();
    const x0 = e.clientX, y0 = e.clientY, suma = e.shiftKey || e.ctrlKey, base = suma ? new Set(sel) : new Set();
    const fuera = marco.current.parentElement.getBoundingClientRect();
    let activo = false;
    const mover = ev => {
      if(!activo && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return;
      activo = true;
      const l = Math.min(x0, ev.clientX), r = Math.max(x0, ev.clientX), t = Math.min(y0, ev.clientY), b = Math.max(y0, ev.clientY);
      Object.assign(marco.current.style, { display:"block", left:(l - fuera.left)+"px", top:(t - fuera.top)+"px", width:(r - l)+"px", height:(b - t)+"px" });
      const cr = caja.current.getBoundingClientRect(), sc = caja.current.scrollLeft;
      const n = new Set(base);
      pRef.current.pistas.forEach(pi=>{
        const fr = filas.current[pi.id]; if(!fr || pi.bloqueada) return;
        const rr = fr.getBoundingClientRect(); if(rr.bottom < t || rr.top > b) return;
        pi.clips.forEach(c=>{ const cl = cr.left + PAD + c.en * zRef.current - sc, crr = cl + largo(c) * zRef.current; if(crr >= l && cl <= r) n.add(c.id); });
      });
      setSel(n);
    };
    const soltar = ev => {
      window.removeEventListener("mousemove", mover); window.removeEventListener("mouseup", soltar);
      marco.current.style.display = "none";
      if(!activo){ if(!suma) setSel(new Set()); onIr(cuantiza(Math.min(tDeX(ev.clientX), durRef.current), fps)); }
    };
    window.addEventListener("mousemove", mover); window.addEventListener("mouseup", soltar);
  };

  // ---- los clips: elegir, mover, recortar, o cortar con la cuchilla
  const filas = useRef({});
  const pistaBajo = clientY => Object.entries(filas.current).find(([id, el])=>{ if(!el) return false; const r = el.getBoundingClientRect(); return clientY >= r.top && clientY <= r.bottom; });
  const onDown = (e, c, pista, modo) => {
    if(e.button !== 0) return;
    e.stopPropagation(); e.preventDefault(); soltarFoco();
    if(pista.bloqueada) return;
    if(herramienta === "cuchilla"){ onDividirEn(c.id, cuantiza(encaje(tDeX(e.clientX), null), fps)); return; }
    if(e.shiftKey || e.ctrlKey){ setSel(s=>{ const n = new Set(s); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; }); return; }
    if(!sel.has(c.id)) setSel(new Set([c.id]));
    const x0 = e.clientX, s0 = caja.current.scrollLeft, inicial = pRef.current;
    // 28/10, él: "que los elementos seleccionados se muevan todos juntos cuando mueva uno": cogiendo uno
    // de los elegidos (sin las pistas bloqueadas), se mueve el grupo entero, cada uno en su pista
    const grupo = modo === "mover" && sel.has(c.id) && sel.size > 1
      ? new Set(inicial.pistas.filter(pi=>!pi.bloqueada).flatMap(pi=>pi.clips.filter(y=>sel.has(y.id)).map(y=>y.id))) : null;
    let movido = false;
    arrastrando.current = true;
    onGesto("inicio");
    const mover = (ev, desdeAuto) => {
      if(!movido && Math.abs(ev.clientX - x0) < 3 && modo === "mover") return;
      movido = true;
      if(!desdeAuto) autoDesplazar(ev, mover);
      encajado.current = null;
      const dt = (ev.clientX - x0 + caja.current.scrollLeft - s0) / zRef.current;
      if(grupo && grupo.size > 1){ moverGrupo(inicial, grupo, dt, ev.clientX, ev.altKey); return; }
      let destino = pista.id;
      if(modo === "mover" && pista.tipo !== "video"){ const f = pistaBajo(ev.clientY); if(f){ const pd = inicial.pistas.find(x=>x.id===f[0]); if(pd && pd.tipo===pista.tipo && !pd.bloqueada) destino = pd.id; } }
      let txt = "";
      const ps = inicial.pistas.map(pi=>{
        if(pi.id !== pista.id && pi.id !== destino) return pi;
        let clips = pi.clips;
        if(pi.id === pista.id) clips = clips.filter(y=>!(y.id===c.id && destino!==pista.id));
        if(pi.id === pista.id && destino === pista.id) clips = clips.map(y=>{
          if(y.id !== c.id) return y;
          if(modo === "izq"){
            const vy = vel(y);
            let desde = Math.max(0, Math.min(y.hasta - 1/fps, y.desde + dt * vy));
            const g = encaje(y.en + (desde - y.desde) / vy, y.id); desde = Math.max(0, Math.min(y.hasta - 1/fps, y.desde + (g - y.en) * vy));
            desde = cuantiza(desde, fps);
            txt = `${desde - y.desde >= 0 ? "−" : "+"}${tc(Math.abs(desde - y.desde) / vy, fps)}  ·  dura ${tc((y.hasta - desde) / vy, fps)}`;
            const n = {...y, desde, en: pi.id==="v1" && mag ? y.en : y.en + (desde - y.desde) / vy};
            return pi.id==="v1" && !mag && solapa(pi, n.en, largo(n), n.id) ? y : n;
          }
          if(modo === "der"){
            const vy = vel(y);
            let hasta = Math.max(y.desde + 1/fps, Math.min(y.dur_src ?? 1e9, y.hasta + dt * vy));
            const f2 = encaje(y.en + (hasta - y.desde) / vy, y.id); hasta = Math.max(y.desde + 1/fps, Math.min(y.dur_src ?? 1e9, y.desde + (f2 - y.en) * vy));
            hasta = cuantiza(hasta, fps);
            txt = `${hasta - y.hasta >= 0 ? "+" : "−"}${tc(Math.abs(hasta - y.hasta) / vy, fps)}  ·  dura ${tc((hasta - y.desde) / vy, fps)}`;
            return {...y, hasta};
          }
          if(pi.id === "v1" && mag){ txt = ""; return {...y, en: y.en + dt + (dt > 0 ? 0.0005 : -0.0005)}; }
          let en = Math.max(0, encaje(y.en + dt, y.id));
          const f2 = encaje(en + largo(y), y.id); if(f2 !== en + largo(y)) en = Math.max(0, f2 - largo(y));
          txt = tc(en, fps);
          if(pi.id === "v1" && solapa(pi, en, largo(y), y.id)) return y;      // (la principal libre: sin montar un clip encima de otro)
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
      mostrarGuia(encajado.current);
      onGesto("durante", {...inicial, pistas: ps});
      avisar(txt, ev.clientX);
    };
    const soltar = () => {
      arrastrando.current = false; pararAuto(); mostrarGuia(null); window.removeEventListener("mousemove", mover); window.removeEventListener("mouseup", soltar); avisar(null); onGesto("fin");
      if(grupo && !movido) setSel(new Set([c.id]));      // un clic sin arrastrar en uno del grupo: se queda solo ese (como CapCut)
    };
    window.addEventListener("mousemove", mover); window.addEventListener("mouseup", soltar);
  };
  // el grupo elegido, todos a la vez la misma distancia: el imán pega el borde (de cualquiera) que caiga más
  // cerca de algo; nadie pasa de 0, y en la principal libre ninguno se monta encima de otro que no se mueve
  const moverGrupo = (inicial, grupo, dt, clientX, sinIman) => {
    const elegidos = inicial.pistas.flatMap(pi=>pi.clips.filter(y=>grupo.has(y.id)));
    let delta = Math.max(dt, -Math.min(...elegidos.map(y=>y.en)));
    let pegado = null;
    if(iman && !sinIman){         // (Alt al arrastrar: sin imán)
      let mejor = Infinity;
      for(const y of elegidos) for(const borde of [y.en + delta, fin(y) + delta]){
        const g = encaje(borde, grupo);
        if(g !== borde && Math.abs(g - borde) < Math.abs(mejor)){ mejor = g - borde; pegado = g; }
      }
      if(pegado != null) delta = Math.max(delta + mejor, -Math.min(...elegidos.map(y=>y.en)));
    }
    const ps = inicial.pistas.map(pi=>!pi.clips.some(y=>grupo.has(y.id)) ? pi : {...pi, clips: pi.clips.map(y=>!grupo.has(y.id) ? y
      : {...y, en: Math.max(0, y.en + delta + (pi.id==="v1" && mag ? (delta > 0 ? 0.0005 : -0.0005) : 0))})});
    const v1 = ps.find(x=>x.id==="v1");
    if(v1 && !mag && v1.clips.some(y=>grupo.has(y.id) && solapa({clips: v1.clips.filter(x=>!grupo.has(x.id))}, y.en, largo(y)))) return;
    encajado.current = pegado;
    mostrarGuia(pegado);
    onGesto("durante", {...inicial, pistas: ps});
    avisar(`${elegidos.length} elementos · ${delta >= 0 ? "+" : "−"}${tc(Math.abs(delta), fps)}`, clientX);
  };
  // los clips no se repintan al desplazar ni al reproducir: sus manejadores no cambian de identidad
  const downRef = useRef(onDown); downRef.current = onDown;
  const menuRef = useRef(onMenu); menuRef.current = onMenu;
  const onDownFijo = useCallback((...a)=>downRef.current(...a),[]);
  const onMenuFijo = useCallback((...a)=>menuRef.current(...a),[]);

  // ---- ratón por encima: una línea fina y su tiempo exacto (para cortar justo donde se quiere)
  const alMover = e => {
    const el = hover.current; if(!el || !caja.current) return;
    let t = tDeX(e.clientX);
    if(herramienta === "cuchilla") t = cuantiza(encaje(t, null), fps);
    el.style.display = "block"; el.style.transform = `translateX(${PAD + t * zRef.current}px)`;
    if(hoverTxt.current) hoverTxt.current.textContent = tc(t, fps);
    el.style.background = herramienta === "cuchilla" ? "rgba(248,113,113,0.95)" : "rgba(255,255,255,0.35)";
  };
  // botón central del ratón (la rueda pulsada) arrastrando: mover la vista en las dos direcciones
  const mano = e => {
    if(e.button !== 1) return;
    e.preventDefault();
    const x0 = e.clientX, y0 = e.clientY, s0 = caja.current.scrollLeft, v0 = vertical.current.scrollTop;
    document.body.style.cursor = "grabbing";
    const mover = ev => { desplazarA(s0 - (ev.clientX - x0)); vertical.current.scrollTop = v0 - (ev.clientY - y0); };
    const soltar = () => { document.body.style.cursor = ""; window.removeEventListener("mousemove", mover); window.removeEventListener("mouseup", soltar); };
    window.addEventListener("mousemove", mover); window.addEventListener("mouseup", soltar);
  };
  // rueda: desplaza en horizontal · Shift: las pistas en vertical · Ctrl o Alt: acercar/alejar donde está el ratón
  const rueda = e => {
    const el = caja.current; if(!el) return;
    e.preventDefault();
    if(e.ctrlKey || e.altKey){
      const r = el.getBoundingClientRect(), mx = e.clientX - r.left, t = (mx + el.scrollLeft - PAD) / zRef.current;
      const d = e.deltaY || e.deltaX;
      const nz = Math.max(ZMIN, Math.min(ZMAX, zRef.current * (d < 0 ? 1.18 : 1/1.18)));
      ponerVista(nz, t - mx / nz);    // el punto bajo el ratón no se mueve
    } else if(e.shiftKey){
      vertical.current.scrollTop += e.deltaY || e.deltaX;
    } else {
      desplazarA(el.scrollLeft + (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY));
    }
  };
  useEffect(()=>{ const el = vertical.current; if(!el) return; el.addEventListener("wheel", rueda, {passive:false}); return ()=>el.removeEventListener("wheel", rueda); });
  // Re Pág / Av Pág: una pantalla a la izquierda / derecha (sin mover el cabezal)
  useEffect(()=>{
    const h = e => {
      const ae = document.activeElement;
      if(ae && (ae.tagName==="TEXTAREA" || (ae.tagName==="INPUT" && ae.type==="text"))) return;
      if(e.key==="PageDown" || e.key==="PageUp"){ e.preventDefault(); const el = caja.current; if(el) desplazarA(el.scrollLeft + (e.key==="PageDown" ? 1 : -1) * el.clientWidth * 0.85); }
    };
    window.addEventListener("keydown", h); return ()=>window.removeEventListener("keydown", h);
  },[]);

  const t0v = Math.max(0, (scroll - PAD) / zoom) - 2, t1v = (scroll + ancho) / zoom + 2;
  const cuchilla = herramienta === "cuchilla";
  return (
    <div style={{position:"relative",display:"flex",flexDirection:"column",minHeight:0,minWidth:0,flex:1,userSelect:"none"}} onDragStart={e=>{ if(!e.target.closest || !e.target.closest("[data-medio]")) e.preventDefault(); }}>
      <div ref={vertical} onMouseDown={mano} style={{display:"flex",flex:1,minHeight:0,overflowY:"auto",overflowX:"hidden"}}>
        {/* cabeceras de pista */}
        <div style={{width:CABECERA,flexShrink:0,borderRight:"1px solid #2a2a2a",background:"#141414",height:"fit-content",minHeight:"100%"}}>
          <div style={{height:ALTO_REGLA,borderBottom:"1px solid #2a2a2a"}}/>
          {proyecto.pistas.map(pi=>(
            <div key={pi.id} style={{height:ALTO[pi.tipo],marginTop:6,display:"flex",alignItems:"center",gap:4,padding:"0 6px"}}>
              <span style={{fontSize:10.5,fontWeight:800,color:pi.tipo==="texto"?"#a78bfa":pi.tipo==="subtitulos"?"#5eead4":"#888",width:22}}>{pi.tipo==="video" ? "V1" : pi.tipo==="subtitulos" ? "SUB" : pi.tipo==="texto" ? "T"+(proyecto.pistas.filter(x=>x.tipo==="texto").indexOf(pi)+1) : "A"+(proyecto.pistas.filter(x=>x.tipo==="audio").indexOf(pi)+1)}</span>
              <button onClick={()=>onPista("muda", pi.id)} title={pi.muda ? "Pista silenciada" : "Silenciar la pista"} className={"rd-ico"+(pi.muda?" on":"")} style={{width:24,height:24}}>{pi.muda ? "🔇" : "🔊"}</button>
              <button onClick={()=>onPista("bloqueada", pi.id)} title={pi.bloqueada ? "Pista bloqueada" : "Bloquear la pista"} className={"rd-ico"+(pi.bloqueada?" on":"")} style={{width:24,height:24}}>{pi.bloqueada ? "🔒" : "🔓"}</button>
              {pi.tipo!=="video" && !pi.clips.length && (pi.tipo==="texto" || pi.tipo==="subtitulos" || proyecto.pistas.filter(x=>x.tipo==="audio").length>1) &&
                <button onClick={()=>onPista("quitar", pi.id)} title="Quitar la pista vacía" className="rd-ico" style={{width:20,height:24}}>×</button>}
            </div>))}
        </div>
        <div ref={caja} onScroll={alDesplazar} onMouseMove={alMover} onMouseLeave={()=>{ if(hover.current) hover.current.style.display = "none"; }}
          style={{position:"relative",overflow:"hidden",flex:1,minWidth:0,background:"#101010",height:"fit-content",minHeight:"100%",paddingBottom:10}}>
          <div style={{position:"relative",width:anchoTotal,minHeight:"100%"}}>
            {/* regla */}
            <div onMouseDown={arrastrarCabezal} style={{position:"relative",height:ALTO_REGLA,borderBottom:"1px solid #2a2a2a",cursor:"pointer",background:"#151515"}}>
              <canvas ref={regla} style={{position:"sticky",left:0,display:"block",width:ancho,height:ALTO_REGLA}}/>
            </div>
            {/* pistas */}
            {proyecto.pistas.map(pi=>(
              <div key={pi.id} ref={el=>{ filas.current[pi.id] = el; }} onMouseDown={seleccionCaja}
                onDragOver={e=>{ e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
                onDrop={e=>{ e.preventDefault(); try { onSoltarMedio(JSON.parse(e.dataTransfer.getData("application/x-randomeditor")), pi, cuantiza(encaje(tDeX(e.clientX), null), fps)); } catch(x){} }}
                style={{position:"relative",height:ALTO[pi.tipo],marginTop:6,background:pi.bloqueada?"repeating-linear-gradient(135deg,#151515 0 8px,#1a1a1a 8px 16px)":"#161616",opacity:pi.muda?0.6:1}}>
                <canvas ref={el=>{ lienzos.current[pi.id] = el; }} style={{position:"sticky",left:0,display:"block",width:ancho,height:ALTO[pi.tipo],pointerEvents:"none"}}/>
                <div style={{position:"absolute",inset:0}}>
                  {pi.clips.filter(c=>fin(c) >= t0v && c.en <= t1v).map(c=>
                    <Clip key={c.id} c={c} pista={pi} zoom={zoom} elegido={sel.has(c.id)} cuchilla={cuchilla} onDown={onDownFijo} onMenu={onMenuFijo}/>)}
                </div>
                {pi.id==="v1" && !pi.clips.length && <div style={{position:"absolute",left:PAD+8,top:38,fontSize:12,color:"#777",pointerEvents:"none"}}>Arrastra aquí clips de la biblioteca (o pulsa ＋)</div>}
              </div>))}
            {/* el imán, el ratón y el cabezal */}
            <div ref={guia} style={{position:"absolute",left:0,top:0,bottom:0,width:0,borderLeft:"1px dashed #facc15",display:"none",pointerEvents:"none",zIndex:3}}/>
            <div ref={hover} style={{position:"absolute",left:0,top:0,bottom:0,width:1,display:"none",pointerEvents:"none",zIndex:3}}>
              <span ref={hoverTxt} style={{position:"absolute",top:2,left:5,fontSize:10,fontWeight:700,color:"#fff",background:"rgba(0,0,0,0.75)",padding:"1px 4px",borderRadius:3,whiteSpace:"nowrap"}}/>
            </div>
            <div ref={cabezal} style={{position:"absolute",left:0,top:0,bottom:0,width:0,pointerEvents:"none",zIndex:4,transform:`translateX(${PAD}px)`}}>
              <div style={{position:"absolute",left:-1,top:0,bottom:0,width:2,background:"#fff",boxShadow:"0 0 4px rgba(0,0,0,0.8)"}}/>
              <div style={{position:"absolute",left:-7,top:0,width:14,height:16,background:"#fff",clipPath:"polygon(0 0,100% 0,100% 60%,50% 100%,0 60%)"}}/>
            </div>
          </div>
        </div>
      </div>
      <div ref={marco} style={{display:"none",position:"absolute",zIndex:6,pointerEvents:"none",border:"1px solid rgba(212,175,55,0.9)",background:"rgba(212,175,55,0.12)",borderRadius:2}}/>
      <Barra ancho={ancho} zoom={zoom} scroll={scroll} dur={dur} marcadores={proyecto.marcadores} puntos={puntos} reloj={reloj} onVista={ponerVista}/>
      <div ref={aviso} style={{position:"absolute",top:ALTO_REGLA+4,display:"none",fontSize:11,fontWeight:700,color:"#000",background:"var(--gold)",padding:"3px 7px",borderRadius:5,pointerEvents:"none",zIndex:5,whiteSpace:"nowrap"}}/>
    </div>);
}
