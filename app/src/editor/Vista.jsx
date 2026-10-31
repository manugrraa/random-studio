import React from "react";
import { fin, volumenEn, local, vel, valorEn } from "./modelo";
import { Transformador, transformCss } from "./Transformar";
import { svgFiltro, conColor } from "./color";
import { CapaTextos } from "./Textos";
import { CapaSubtitulos } from "./Subtitulos";
const { useEffect, useRef, useState, forwardRef, useImperativeHandle } = React;

/* RandomEditor · la previsualización. Dos reproductores de vídeo que se pasan el relevo: mientras
   suena un clip, el siguiente ya está cargado en el otro y en su fotograma, así el corte no da tirón
   (antes, en cada corte había que cargar el vídeo de cero). Los audios, uno por pista. */
export const fileUrl = p => p ? "file:///" + p.replace(/\\/g,"/").split("/").map(encodeURIComponent).join("/").replace(/^([A-Za-z])%3A/,"$1:") : null;

export const Vista = forwardRef(function Vista({ proyecto, guias, proxies, reloj, sel, onElegirTexto, onGesto, subs, cambiarClip }, ref) {
  // 31/10 (v3.18): escala de la pantalla (px de pantalla por px del lienzo), para mover/escalar el vídeo
  const lienzo = useRef(null), kRef = useRef(0.3);
  const [k, setK] = useState(0.3);
  useEffect(()=>{ const el = lienzo.current; if(!el) return; const ro = new ResizeObserver(()=>{ kRef.current = el.clientWidth / (pRef.current.ancho || 1080); setK(kRef.current); }); ro.observe(el); return ()=>ro.disconnect(); },[]);
  // el instante (para el recuadro del clip elegido, que se anima con sus fotogramas clave)
  const [tv, setTv] = useState(0);
  useEffect(()=>reloj ? reloj.oir(t=>setTv(x=>Math.abs(x - t) > 1/120 ? t : x)) : undefined,[reloj]);
  const [natural, setNatural] = useState(null);
  const A = useRef(null), B = useRef(null), activo = useRef(0);
  const auds = useRef({});
  const pRef = useRef(proyecto); pRef.current = proyecto;
  const xRef = useRef(proxies); xRef.current = proxies || {};
  const clipEn = (cs, t) => cs.find(x=>t >= x.en && t < fin(x));
  // v3.14.1: se previsualiza con el PROXY si ya está (mismo tiempo, saltos inmediatos); si no, el original
  const fuente = c => xRef.current[c.ruta] || c.ruta;
  const cargar = (v, c, t) => {
    const f = fuente(c);
    if(v.dataset.src !== f){ v.src = fileUrl(f); v.dataset.src = f; v.dataset.ruta = c.ruta; v._pend = null; }
    v.dataset.clip = c.id;
    return local(c, t);
  };
  // saltar sin encolar: si el vídeo aún está buscando el anterior, se apunta solo el último destino
  // (arrastrando la vara se pedían decenas de saltos seguidos y se quedaba atrás)
  // (+1 ms: con el tiempo justo del fotograma, Chromium a veces enseña el anterior por redondeo)
  const saltar = (v, t) => {
    t += 0.001;
    if(v.seeking){ v._pend = t; return; }
    try { v.currentTime = t; } catch(e){}
  };
  /* 28/10, él: "la vara no se para precisa cuando le doy al espacio". El reloj iba por su cuenta y el
     vídeo, a su ritmo: al pausar, la vara (y la imagen) saltaban hasta 200 ms. Ahora cada reproductor
     apunta el instante EXACTO del fotograma que acaba de pintar en pantalla, y la vara va con él. */
  useEffect(()=>{
    const ids = [];
    [A.current, B.current].forEach(v=>{
      if(!v || !v.requestVideoFrameCallback) return;
      const cb = (ahora, md) => { v._visto = { t: md.mediaTime, at: performance.now(), clip: v.dataset.clip }; ids.push([v, v.requestVideoFrameCallback(cb)]); };
      ids.push([v, v.requestVideoFrameCallback(cb)]);
    });
    return ()=>ids.forEach(([v, id])=>{ try { v.cancelVideoFrameCallback(id); } catch(e){} });
  },[]);
  // el tiempo (de la línea) del fotograma que se está viendo, o null si no se sabe
  const mostrado = () => {
    const v = [A.current, B.current][activo.current]; if(!v || !v._visto) return null;
    const pr = pRef.current, v1 = pr.pistas.find(x=>x.id==="v1");
    const c = v1 && v1.clips.find(x=>x.id === v._visto.clip); if(!c) return null;
    return c.en + (v._visto.t - c.desde) / vel(c);
  };
  const alBuscar = e => { const v = e.target; if(v._pend != null){ const t = v._pend; v._pend = null; try { v.currentTime = t; } catch(x){} } };
  const sincronizar = (t, vel) => {
    const pr = pRef.current, adelante = vel > 0;
    const v1 = pr.pistas.find(x=>x.id==="v1"), cs = v1 ? v1.clips : [];
    const c = clipEn(cs, t);
    const vs = [A.current, B.current];
    let medido = null;
    if(!vs[0] || !vs[1]) return null;
    if(!c){ vs.forEach(v=>{ if(!v.paused) v.pause(); v.style.opacity = 0; }); }
    else {
      // ¿lo tiene ya el otro reproductor preparado? relevo
      let i = activo.current;
      if(vs[i].dataset.clip !== c.id && vs[1-i].dataset.clip === c.id) i = activo.current = 1 - i;
      const v = vs[i], o = vs[1-i];
      const local = cargar(v, c, t);
      if(Math.abs(v.currentTime - local) > (adelante ? 0.2 : 0.005) || (!adelante && v._pend != null)) saltar(v, local);
      v.playbackRate = Math.max(0.0625, Math.min(16, (adelante ? vel : 1) * (c.velocidad || 1)));
      v.preservesPitch = !c.tono;
      v.volume = volumenEn(c, t, v1.muda);
      // (mover, escalar, girar y opacidad, con sus fotogramas clave)
      v.style.transform = transformCss(c, t - c.en, kRef.current);
      v.style.opacity = valorEn(c, "opacidad", t - c.en); o.style.opacity = 0;
      v.style.filter = conColor(c) ? `url(#rfc_${c.id})` : "none";
      if(adelante && v.paused) v.play().catch(()=>{});
      if(!adelante && !v.paused) v.pause();
      if(!o.paused) o.pause();
      // reproduciendo, la vara la marca el fotograma que se ve (como en los editores de verdad)
      if(adelante && vel === 1 && !v.paused && v.readyState >= 2){
        const vi = v._visto;
        medido = vi && vi.clip === c.id && performance.now() - vi.at < 150 ? c.en + (vi.t - c.desde) / (c.velocidad || 1) : c.en + (v.currentTime - c.desde) / (c.velocidad || 1);
      }
      // el siguiente, preparado en el otro (en pausa y en su primer fotograma)
      const sig = cs.find(x=>x.en >= fin(c) - 1e-3 && x.id !== c.id);
      if(sig && (o.dataset.clip !== sig.id || o.dataset.src !== fuente(sig))){ cargar(o, sig, sig.en); saltar(o, sig.desde); o.style.transform = transformCss(sig, 0, kRef.current); }
    }
    pr.pistas.filter(pi=>pi.tipo==="audio").forEach(pi=>{
      let a = auds.current[pi.id]; if(!a){ a = new Audio(); auds.current[pi.id] = a; }
      const c2 = clipEn(pi.clips, t);
      if(!c2 || pi.muda){ if(!a.paused) a.pause(); return; }
      if(a.dataset.ruta !== c2.ruta){ a.dataset.ruta = c2.ruta; a.src = fileUrl(c2.ruta); }
      const lc = local(c2, t);
      if(Math.abs(a.currentTime - lc) > (adelante ? 0.25 : 0.03)) { try { a.currentTime = lc; } catch(e){} }
      a.playbackRate = Math.max(0.0625, Math.min(16, (adelante ? vel : 1) * (c2.velocidad || 1)));
      a.preservesPitch = !c2.tono;
      a.volume = volumenEn(c2, t, false);
      if(adelante && a.paused) a.play().catch(()=>{});
      if(!adelante && !a.paused) a.pause();
    });
    return medido;
  };
  const soltar = async () => {
    if(!A.current) return;
    [A.current, B.current, ...Object.values(auds.current)].forEach(v=>{ try { if(v){ v.pause(); v.removeAttribute("src"); v.dataset.ruta = ""; v.dataset.src = ""; v.dataset.clip = ""; v.load && v.load(); } } catch(x){} });
    await new Promise(r=>setTimeout(r, 400));     // Windows no deja reemplazar un vídeo abierto
  };
  // el reproductor que se ve (para contar sus fotogramas: el contador de FPS)
  const activoV = () => [A.current, B.current][activo.current];
  // 31/10: al cambiar el clip (moverlo, escalarlo...) con la reproducción parada, su vídeo se coloca YA
  useEffect(()=>{
    if(!reloj) return;
    const t = reloj.t, v1 = proyecto.pistas.find(x=>x.id==="v1"), c = v1 && v1.clips.find(x=>t >= x.en && t < fin(x));
    const v = [A.current, B.current][activo.current];
    if(c && v && v.dataset.clip === c.id){ v.style.transform = transformCss(c, t - c.en, kRef.current); v.style.opacity = valorEn(c, "opacidad", t - c.en); v.style.filter = conColor(c) ? `url(#rfc_${c.id})` : "none"; }
  },[proyecto, k]);
  useImperativeHandle(ref, ()=>({ sincronizar, soltar, activoV, mostrado }));
  useEffect(()=>()=>{ Object.values(auds.current).forEach(a=>{ try { a.pause(); a.src=""; } catch(e){} }); },[]);
  const [W, H] = [proyecto.ancho, proyecto.alto];
  const estiloV = {position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"contain",opacity:0,transition:"none"};
  return (
    <div ref={lienzo} data-lienzo style={{position:"relative",height:"100%",aspectRatio:`${W}/${H}`,maxWidth:"100%",maxHeight:"100%",background:"#000",boxShadow:"0 0 0 1px rgba(255,255,255,0.06)",overflow:"hidden"}}>
      {/* 31/10: el color de cada clip (filtro SVG: lo pinta la gráfica, mismas fórmulas que al exportar) */}
      <svg width="0" height="0" style={{position:"absolute"}} dangerouslySetInnerHTML={{__html: ((proyecto.pistas.find(x=>x.id==="v1") || {clips:[]}).clips.filter(conColor).map(c=>svgFiltro("rfc_" + c.id, c)).join(""))}}/>
      <video ref={A} playsInline preload="auto" style={estiloV} onSeeked={alBuscar} onLoadedMetadata={e=>setNatural([e.target.videoWidth, e.target.videoHeight])}/>
      <video ref={B} playsInline preload="auto" style={estiloV} onSeeked={alBuscar} onLoadedMetadata={e=>setNatural([e.target.videoWidth, e.target.videoHeight])}/>
      {reloj && <CapaSubtitulos proyecto={proyecto} reloj={reloj} info={subs}/>}
      {reloj && <CapaTextos proyecto={proyecto} reloj={reloj} sel={sel} onElegir={onElegirTexto} onGesto={onGesto}/>}
      {reloj && cambiarClip && (()=>{
        // el clip ELEGIDO de la principal que se ve ahora: su recuadro para moverlo/escalarlo/girarlo
        const v1 = proyecto.pistas.find(x=>x.id==="v1"), c = v1 && v1.clips.find(x=>sel && sel.has(x.id) && tv >= x.en && tv < fin(x));
        const va = [A.current, B.current][activo.current];
        const nat = va && va.videoWidth ? [va.videoWidth, va.videoHeight] : natural;
        return c ? <Transformador c={c} tRel={tv - c.en} W={W} H={H} k={k} natural={nat} onGesto={onGesto} cambiarClip={cambiarClip}/> : null;
      })()}
      {guias && <div style={{position:"absolute",inset:0,pointerEvents:"none"}}>
        {/* el centro y lo que tapa la interfaz de YouTube Shorts (título abajo, botones a la derecha) */}
        <div style={{position:"absolute",left:"50%",top:0,bottom:0,borderLeft:"1px dashed rgba(255,255,255,0.35)"}}/>
        <div style={{position:"absolute",top:"50%",left:0,right:0,borderTop:"1px dashed rgba(255,255,255,0.35)"}}/>
        {proyecto.formato==="vertical" && <>
          <div style={{position:"absolute",left:0,right:0,bottom:0,height:"22%",background:"rgba(248,113,113,0.16)",borderTop:"1px solid rgba(248,113,113,0.6)"}}/>
          <div style={{position:"absolute",right:0,top:"38%",bottom:"22%",width:"14%",background:"rgba(248,113,113,0.16)",borderLeft:"1px solid rgba(248,113,113,0.6)"}}/>
          <div style={{position:"absolute",left:0,right:0,top:0,height:"8%",background:"rgba(248,113,113,0.12)"}}/>
        </>}
      </div>}
    </div>);
});
