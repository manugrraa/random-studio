import React from "react";
import { fileUrl } from "./Vista";
import { local, fin } from "./modelo";
import { colorDe, conColor, curva, entrada, salida } from "./color";
const { useEffect, useRef, useState } = React;

/* RandomEditor · MEDIDORES DE COLOR (8/11, fase 3, como DaVinci): del fotograma del clip en el cabezal, YA con su color
   (las mismas cuentas que el filtro del visor y la exportación):
   - forma de onda: cada columna de la imagen, de negro (abajo) a blanco (arriba). Arriba del todo = quemado; abajo = negro empastado
   - histograma de rojo, verde y azul
   Se recalcula al parar el cabezal y al tocar el color. */
const AN = 220, AL_W = 110, AL_H = 56, MW = 96, MH = 170;

export function Medidores({ c, reloj }) {
  const vid = useRef(null), onda = useRef(null), histo = useRef(null);
  const [aviso, setAviso] = useState("");
  const cRef = useRef(c); cRef.current = c;
  const pintar = () => {
    const v = vid.current, c0 = cRef.current; if(!v || !v.videoWidth || !onda.current) return;
    const tmp = document.createElement("canvas"); tmp.width = MW; tmp.height = MH;
    const g = tmp.getContext("2d"); g.drawImage(v, 0, 0, MW, MH);
    let px; try { px = g.getImageData(0, 0, MW, MH).data; } catch(e){ setAviso("No se puede leer este vídeo"); return; }
    const e = colorDe(c0), hay = conColor(c0), mi = entrada(e), mo = salida(e);
    const tab = hay ? Array.from({length:256}, (_, i)=>curva(i / 255, e)) : null;
    const W = new Uint16Array(MW * 64), H = [new Uint32Array(64), new Uint32Array(64), new Uint32Array(64)];
    let quemado = 0, negro = 0;
    for(let y = 0; y < MH; y++) for(let x = 0; x < MW; x++){
      const i = (y * MW + x) * 4;
      let r = px[i] / 255, gg = px[i + 1] / 255, b = px[i + 2] / 255;
      if(hay){
        const r1 = Math.min(1, Math.max(0, mi[0]*r + mi[1]*gg + mi[2]*b)), g1 = Math.min(1, Math.max(0, mi[3]*r + mi[4]*gg + mi[5]*b)), b1 = Math.min(1, Math.max(0, mi[6]*r + mi[7]*gg + mi[8]*b));
        const r2 = tab[Math.round(r1 * 255)], g2 = tab[Math.round(g1 * 255)], b2 = tab[Math.round(b1 * 255)];
        r = Math.min(1, Math.max(0, mo[0]*r2 + mo[1]*g2 + mo[2]*b2)); gg = Math.min(1, Math.max(0, mo[3]*r2 + mo[4]*g2 + mo[5]*b2)); b = Math.min(1, Math.max(0, mo[6]*r2 + mo[7]*g2 + mo[8]*b2));
      }
      const l = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
      if(l > 0.97) quemado++; if(l < 0.03) negro++;
      W[x * 64 + Math.min(63, Math.floor(l * 64))]++;
      H[0][Math.min(63, Math.floor(r * 64))]++; H[1][Math.min(63, Math.floor(gg * 64))]++; H[2][Math.min(63, Math.floor(b * 64))]++;
    }
    // forma de onda
    const go = onda.current.getContext("2d"); go.fillStyle = "#0b0b0b"; go.fillRect(0, 0, AN, AL_W);
    go.strokeStyle = "rgba(255,255,255,0.08)"; [0.25, 0.5, 0.75].forEach(q=>{ go.beginPath(); go.moveTo(0, AL_W * q); go.lineTo(AN, AL_W * q); go.stroke(); });
    const cw = AN / MW, ch = AL_W / 64;
    for(let x = 0; x < MW; x++) for(let k = 0; k < 64; k++){ const n = W[x * 64 + k]; if(!n) continue;
      go.fillStyle = `rgba(${k > 61 ? "248,113,113" : "120,230,160"},${Math.min(1, 0.15 + n / 12)})`; go.fillRect(x * cw, AL_W - (k + 1) * ch, cw + 0.5, ch + 0.5); }
    // histograma
    const gh = histo.current.getContext("2d"); gh.fillStyle = "#0b0b0b"; gh.fillRect(0, 0, AN, AL_H);
    const max = Math.max(1, ...H.flatMap(h=>Array.from(h).slice(1, 63)));
    gh.globalCompositeOperation = "lighter";
    ["rgba(239,68,68,0.75)", "rgba(34,197,94,0.75)", "rgba(59,130,246,0.75)"].forEach((col, j)=>{ gh.fillStyle = col;
      for(let k = 0; k < 64; k++){ const hh = Math.min(1, H[j][k] / max) * (AL_H - 2); gh.fillRect(k * AN / 64, AL_H - hh, AN / 64 + 0.5, hh); } });
    gh.globalCompositeOperation = "source-over";
    const tot = MW * MH;
    setAviso(quemado / tot > 0.06 ? `${Math.round(quemado / tot * 100)} % quemado (blanco puro)` : negro / tot > 0.25 ? `${Math.round(negro / tot * 100)} % en negro puro` : "");
  };
  // el fotograma del clip en el cabezal (en un reproductor propio y callado)
  const pend = useRef(0);
  const ir = () => {
    clearTimeout(pend.current);
    pend.current = setTimeout(()=>{ const v = vid.current, c0 = cRef.current; if(!v) return;
      const t = Math.min(Math.max(reloj.t, c0.en), fin(c0) - 0.02), s = Math.max(0, local(c0, t));
      if(Math.abs(v.currentTime - s) < 0.02) pintar(); else v.currentTime = s; }, 140);
  };
  useEffect(()=>{ const v = vid.current; if(!v) return; v.onseeked = pintar; v.onloadeddata = ir; if(v.dataset.src !== c.ruta){ v.dataset.src = c.ruta; v.src = fileUrl(c.ruta); } else ir(); }, [c.ruta]);
  useEffect(()=>{ ir(); }, [c.color, c.filtro, c.desde, c.en]);
  useEffect(()=>reloj.oir(()=>ir()), [reloj]);
  useEffect(()=>()=>clearTimeout(pend.current), []);
  return <div style={{display:"flex",flexDirection:"column",gap:5,borderTop:"1px solid #222",paddingTop:8}}>
    <video ref={vid} muted preload="auto" style={{display:"none"}}/>
    <span style={{display:"flex",justifyContent:"space-between",fontSize:12}}><b>Medidores</b><span style={{color:"#f87171",fontSize:11}}>{aviso}</span></span>
    <span style={{fontSize:10.5,color:"#888"}}>Forma de onda (arriba = blanco; rojo = quemado)</span>
    <canvas ref={onda} width={AN} height={AL_W} style={{width:"100%",height:AL_W,borderRadius:5,border:"1px solid #222"}}/>
    <span style={{fontSize:10.5,color:"#888"}}>Histograma RGB</span>
    <canvas ref={histo} width={AN} height={AL_H} style={{width:"100%",height:AL_H,borderRadius:5,border:"1px solid #222"}}/>
  </div>;
}
