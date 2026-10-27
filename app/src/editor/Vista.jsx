import React from "react";
import { fin, volumenEn } from "./modelo";
const { useEffect, useRef, forwardRef, useImperativeHandle } = React;

/* RandomEditor · la previsualización. Dos reproductores de vídeo que se pasan el relevo: mientras
   suena un clip, el siguiente ya está cargado en el otro y en su fotograma, así el corte no da tirón
   (antes, en cada corte había que cargar el vídeo de cero). Los audios, uno por pista. */
export const fileUrl = p => p ? "file:///" + p.replace(/\\/g,"/").split("/").map(encodeURIComponent).join("/").replace(/^([A-Za-z])%3A/,"$1:") : null;

export const Vista = forwardRef(function Vista({ proyecto, guias, proxies }, ref) {
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
    return c.desde + (t - c.en);
  };
  // saltar sin encolar: si el vídeo aún está buscando el anterior, se apunta solo el último destino
  // (arrastrando la vara se pedían decenas de saltos seguidos y se quedaba atrás)
  const saltar = (v, t) => {
    if(v.seeking){ v._pend = t; return; }
    try { v.currentTime = t; } catch(e){}
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
      if(Math.abs(v.currentTime - local) > (adelante ? 0.2 : 0.01) || (!adelante && v._pend != null)) saltar(v, local);
      v.playbackRate = adelante ? vel : 1;
      v.volume = volumenEn(c, t, v1.muda);
      v.style.opacity = 1; o.style.opacity = 0;
      if(adelante && v.paused) v.play().catch(()=>{});
      if(!adelante && !v.paused) v.pause();
      if(!o.paused) o.pause();
      // reproduciendo, el reloj lo marca el vídeo (como en los editores de verdad): así no se desfasan
      if(adelante && vel === 1 && !v.paused && v.readyState >= 3) medido = c.en + (v.currentTime - c.desde);
      // el siguiente, preparado en el otro (en pausa y en su primer fotograma)
      const sig = cs.find(x=>x.en >= fin(c) - 1e-3 && x.id !== c.id);
      if(sig && (o.dataset.clip !== sig.id || o.dataset.src !== fuente(sig))){ cargar(o, sig, sig.en); saltar(o, sig.desde); }
    }
    pr.pistas.filter(pi=>pi.tipo==="audio").forEach(pi=>{
      let a = auds.current[pi.id]; if(!a){ a = new Audio(); auds.current[pi.id] = a; }
      const c2 = clipEn(pi.clips, t);
      if(!c2 || pi.muda){ if(!a.paused) a.pause(); return; }
      if(a.dataset.ruta !== c2.ruta){ a.dataset.ruta = c2.ruta; a.src = fileUrl(c2.ruta); }
      const local = c2.desde + (t - c2.en);
      if(Math.abs(a.currentTime - local) > (adelante ? 0.25 : 0.03)) { try { a.currentTime = local; } catch(e){} }
      a.playbackRate = adelante ? vel : 1;
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
  useImperativeHandle(ref, ()=>({ sincronizar, soltar, activoV }));
  useEffect(()=>()=>{ Object.values(auds.current).forEach(a=>{ try { a.pause(); a.src=""; } catch(e){} }); },[]);
  const [W, H] = [proyecto.ancho, proyecto.alto];
  const estiloV = {position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"contain",opacity:0,transition:"none"};
  return (
    <div style={{position:"relative",height:"100%",aspectRatio:`${W}/${H}`,maxWidth:"100%",maxHeight:"100%",background:"#000",boxShadow:"0 0 0 1px rgba(255,255,255,0.06)"}}>
      <video ref={A} playsInline preload="auto" style={estiloV} onSeeked={alBuscar}/>
      <video ref={B} playsInline preload="auto" style={estiloV} onSeeked={alBuscar}/>
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
