import React from "react";
import { fileUrl } from "./Vista";
import { tc } from "./modelo";
const { useRef, useEffect, useState } = React;

/* RandomEditor · RECORTE VISUAL del sonido (5/11, él: "que se pueda editar donde empieza cada música y cada SFX, para
   que sea añadirlo y ya está, no añadirlo, recortarlo y ajustarlo… que no tenga que calcular la milésima exacta… hazlo
   visual y bonito, pero sobre todo útil").
   Se ve la onda del archivo ENTERO y, encima, el trozo que suena (en dorado):
     - arrastrar el trozo = elegir otro momento de la canción con la misma duración
     - arrastrar sus bordes = dónde empieza y dónde acaba
     - clic fuera del trozo = que empiece ahí
     - ▶ Escuchar: suena el trozo tal cual quedará (y la raya blanca sigue lo que oyes)
   Con el imán, los bordes caen en los golpes de la onda (los picos), que es donde suele estar el ritmo. */
export function RecorteAudio({ c, onda, fps, alGesto, cambiarClip }) {
  const lienzo = useRef(null), audio = useRef(null), raf = useRef(0);
  const [ancho, setAncho] = useState(280);
  const [oyendo, setOyendo] = useState(false);
  const [cabeza, setCabeza] = useState(null);           // el segundo del archivo que se oye
  const [iman, setIman] = useState(true);
  const picos = onda && (Array.isArray(onda) ? onda : onda.p);
  const dt = onda && onda.dt;
  const dur = Math.max(0.1, c.dur_src || (picos && dt ? picos.length * dt : c.hasta));
  const ALTO = 74;

  useEffect(()=>{ const el = lienzo.current && lienzo.current.parentElement; if(!el) return;
    const ro = new ResizeObserver(()=>setAncho(Math.max(160, el.clientWidth))); ro.observe(el); return ()=>ro.disconnect(); },[]);
  useEffect(()=>()=>{ cancelAnimationFrame(raf.current); try { audio.current && audio.current.pause(); } catch(e){} },[]);

  // ---- dibujo: la onda entera, el trozo elegido y lo que suena
  useEffect(()=>{
    const cv = lienzo.current; if(!cv) return;
    const dpr = window.devicePixelRatio || 1; cv.width = ancho * dpr; cv.height = ALTO * dpr;
    const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, ancho, ALTO);
    g.fillStyle = "#111"; g.fillRect(0, 0, ancho, ALTO);
    const xa = c.desde / dur * ancho, xb = c.hasta / dur * ancho;
    if(picos && picos.length){
      for(let x = 0; x < ancho; x++){
        const i0 = Math.floor(x / ancho * picos.length), i1 = Math.max(i0 + 1, Math.floor((x + 1) / ancho * picos.length));
        let m = 0; for(let i = i0; i < i1 && i < picos.length; i++) if(picos[i] > m) m = picos[i];
        const h = Math.max(1, m * (ALTO - 10)), dentro = x >= xa && x <= xb;
        g.fillStyle = dentro ? "rgba(212,175,55,0.95)" : "rgba(160,160,160,0.35)";
        g.fillRect(x, (ALTO - h) / 2, 1, h);
      }
    } else { g.fillStyle = "#555"; g.font = "11px system-ui"; g.fillText("Calculando la onda…", 8, ALTO / 2 + 4); }
    g.fillStyle = "rgba(212,175,55,0.13)"; g.fillRect(xa, 0, xb - xa, ALTO);
    g.fillStyle = "#D4AF37"; g.fillRect(xa - 1, 0, 3, ALTO); g.fillRect(xb - 2, 0, 3, ALTO);
    g.beginPath(); g.moveTo(xa - 1, 0); g.lineTo(xa + 7, 0); g.lineTo(xa - 1, 8); g.fill();
    g.beginPath(); g.moveTo(xb + 1, ALTO); g.lineTo(xb - 7, ALTO); g.lineTo(xb + 1, ALTO - 8); g.fill();
    if(cabeza != null){ const xc = cabeza / dur * ancho; g.fillStyle = "#fff"; g.fillRect(xc, 0, 1.5, ALTO); }
  },[picos, ancho, c.desde, c.hasta, dur, cabeza]);

  // el pico más fuerte cerca (±0,15 s) para que el borde caiga en el golpe
  const pegar = s => {
    if(!iman || !picos || !dt) return s;
    const i0 = Math.max(0, Math.floor((s - 0.15) / dt)), i1 = Math.min(picos.length - 1, Math.ceil((s + 0.15) / dt));
    let mejor = -1, im = -1;
    for(let i = i0; i <= i1; i++){ const sube = picos[i] - (picos[i - 1] || 0); if(sube > mejor){ mejor = sube; im = i; } }
    return im >= 0 && mejor > 0.12 ? im * dt : s;
  };
  const q = s => Math.round(s * fps) / fps;

  const alPulsar = e => {
    const r = lienzo.current.getBoundingClientRect(), s0 = (e.clientX - r.left) / r.width * dur;
    const xa = c.desde / dur * r.width, xb = c.hasta / dur * r.width, x = e.clientX - r.left;
    const L = c.hasta - c.desde;
    const modo = Math.abs(x - xa) < 8 ? "ini" : Math.abs(x - xb) < 8 ? "fin" : (x > xa && x < xb) ? "mover" : "saltar";
    alGesto("inicio");
    const aplicar = ev => {
      const s = Math.max(0, Math.min(dur, (ev.clientX - r.left) / r.width * dur));
      let desde = c.desde, hasta = c.hasta;
      if(modo === "ini") desde = Math.min(hasta - 1 / fps, q(pegar(s)));
      else if(modo === "fin") hasta = Math.max(desde + 1 / fps, q(pegar(s)));
      else if(modo === "mover"){ desde = Math.max(0, Math.min(dur - L, q(c.desde + (s - s0)))); if(ev.altKey === false) desde = q(Math.max(0, Math.min(dur - L, pegar(desde)))); hasta = desde + L; }
      else { desde = Math.max(0, Math.min(dur - L, q(pegar(s)))); hasta = desde + L; }
      cambiarClip({ ...c, desde: Math.max(0, desde), hasta: Math.min(dur, hasta) }, true);
    };
    aplicar(e);
    const soltar = () => { window.removeEventListener("pointermove", aplicar); window.removeEventListener("pointerup", soltar); alGesto("fin"); };
    window.addEventListener("pointermove", aplicar); window.addEventListener("pointerup", soltar);
  };

  const escuchar = () => {
    if(oyendo){ try { audio.current.pause(); } catch(e){} cancelAnimationFrame(raf.current); setOyendo(false); setCabeza(null); return; }
    const a = audio.current || (audio.current = new Audio());
    a.src = fileUrl(c.ruta); a.volume = Math.min(1, c.vol ?? 1);
    const fin = c.hasta;
    a.currentTime = c.desde;
    a.play().then(()=>{
      setOyendo(true);
      const paso = () => { if(a.currentTime >= fin || a.paused){ a.pause(); setOyendo(false); setCabeza(null); return; } setCabeza(a.currentTime); raf.current = requestAnimationFrame(paso); };
      raf.current = requestAnimationFrame(paso);
    }).catch(()=>setOyendo(false));
  };

  const mini = { padding:"3px 9px", fontSize:11.5, borderRadius:7, border:"1px solid #333", background:"#1a1a1a", color:"#ddd", cursor:"pointer" };
  return (
    <div style={{display:"flex",flexDirection:"column",gap:6}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",fontSize:12,color:"#ccc"}}>
        <span>✂️ Qué trozo suena</span>
        <span style={{display:"flex",gap:4}}>
          <button onClick={()=>setIman(v=>!v)} style={{...mini, color: iman ? "#D4AF37" : "#888"}} title="Los bordes caen en los golpes de la onda">🧲 {iman ? "Golpes" : "Libre"}</button>
          <button onClick={escuchar} style={{...mini, color:"#fff"}}>{oyendo ? "■ Parar" : "▶ Escuchar"}</button>
        </span>
      </div>
      <div style={{width:"100%"}}>
        <canvas ref={lienzo} onPointerDown={alPulsar} style={{width:ancho,height:ALTO,borderRadius:6,cursor:"ew-resize",display:"block",touchAction:"none"}}
          title="Arrastra el trozo dorado para elegir otro momento · arrastra sus bordes para el principio y el final · clic fuera: que empiece ahí"/>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#999",fontFamily:"ui-monospace, Consolas, monospace"}}>
        <span>Empieza {tc(c.desde, fps)}</span><span>dura {tc(c.hasta - c.desde, fps)}</span><span>Acaba {tc(c.hasta, fps)}</span>
      </div>
    </div>);
}
