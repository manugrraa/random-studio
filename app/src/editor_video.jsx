import React from "react";
import { createPortal } from "react-dom";
const { useState, useEffect, useRef, useMemo } = React;

/* ============================ MINI EDITOR DE CLIPS (v3.11) ============================
   26/10, él: "que haya una manera de recortar el clip seleccionado, para que luego al editar ya
   sea más fácil de seleccionar todo... para todos los clips, incluso que se puedan hacer cortes.
   Para ello tendrás que crear un mini editor de vídeo".
   La línea de tiempo son los fotogramas del clip con la onda del audio encima. Se corta en el
   cabezal (S), se quita o se recupera el tramo elegido (Supr), se marca dónde empieza (I) y
   dónde acaba (O), y el clon propone quitar el aire (los silencios largos). Al reproducir se
   salta lo quitado, para verlo como quedará. Guardar rehace el mp4 con lo que queda (el
   original se guarda en _originales/ del clip y se puede restaurar). */

const fileUrl = (p, v) => p ? "file:///" + p.replace(/\\/g,"/").split("/").map(encodeURIComponent).join("/").replace(/^([A-Za-z])%3A/,"$1:") + (v ? "?v="+v : "") : null;
const t2s = t => { t = Math.max(0, t||0); const m = Math.floor(t/60); return m + ":" + (t%60).toFixed(1).padStart(4,"0"); };
const boton = (activo, peligro) => ({fontSize:12.5,fontWeight:600,padding:"7px 12px",borderRadius:9,border:"1px solid "+(peligro?"rgba(248,113,113,0.45)":"var(--border)"),
  color: activo?"#000":(peligro?"var(--red)":"var(--text-2)"), background: activo?"var(--gold)":"transparent", cursor:"pointer", whiteSpace:"nowrap"});

async function consultar(args) {
  const r = await window.studioFS.clonConsultar(args);
  if (r.error) throw new Error(r.error);
  return r.eventos || [];
}

// los tramos: [{a, b, fuera, propuesto}] contiguos de 0 a dur
const partir = (ts, t) => ts.flatMap(x => (t > x.a + 0.05 && t < x.b - 0.05) ? [{...x, b:t}, {...x, a:t}] : [x]);

export function EditorVideo({ carpeta, archivo, ruta, onCerrar, onGuardado, toast }) {
  const [info, setInfo] = useState(null);
  const [ts, setTs] = useState([]);
  const [hist, setHist] = useState([]);
  const [t, setT] = useState(0);
  const [sel, setSel] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [ocupado, setOcupado] = useState("");
  const [version, setVersion] = useState(0);
  const vid = useRef(null);
  const pista = useRef(null);

  const cargar = async () => {
    setOcupado("Preparando la línea de tiempo…");
    try {
      const ev = await consultar(["tira", carpeta, archivo]);
      const h = ev.find(e=>e.evento==="hecho");
      setInfo(h); setTs([{a:0, b:h.dur, fuera:false}]); setHist([]); setSel(null);
    } catch(e){ toast && toast(e.message); onCerrar(); }
    setOcupado("");
  };
  useEffect(()=>{ cargar(); },[carpeta, archivo]);

  const cambiar = nuevo => { setHist(hs=>[...hs.slice(-30), ts]); setTs(nuevo); };
  const deshacer = () => setHist(hs=>{ if(!hs.length) return hs; setTs(hs[hs.length-1]); return hs.slice(0,-1); });
  const dur = info ? info.dur : 0;
  const quedan = useMemo(()=>ts.filter(x=>!x.fuera).reduce((s,x)=>s+(x.b-x.a),0),[ts]);
  const idxEn = tt => ts.findIndex(x=>tt>=x.a && tt<x.b+1e-6);

  const cortar = () => { const n = partir(ts, t); if(n.length!==ts.length){ cambiar(n); setSel(idxEn(t+0.01)); } };
  const alternar = i => { if(i==null||i<0) return; cambiar(ts.map((x,k)=>k===i?{...x,fuera:!x.fuera,propuesto:false}:x)); };
  const inicioAqui = () => cambiar(partir(ts, t).map(x=>x.b<=t+1e-6?{...x,fuera:true}:x));
  const finalAqui = () => cambiar(partir(ts, t).map(x=>x.a>=t-1e-6?{...x,fuera:true}:x));
  const proponerAire = async () => {
    setOcupado("Buscando el aire…");
    try {
      const ev = await consultar(["aire", carpeta, archivo]);
      const aire = (ev.find(e=>e.evento==="hecho")||{}).aire || [];
      if(!aire.length){ toast && toast("No hay silencios largos que quitar"); }
      else {
        let n = ts;
        aire.forEach(([a,b])=>{ n = partir(partir(n, a), b); });
        n = n.map(x=>aire.some(([a,b])=>x.a>=a-0.02 && x.b<=b+0.02) ? {...x, fuera:true, propuesto:true} : x);
        cambiar(n);
        toast && toast(`${aire.length} silencio${aire.length!==1?"s":""} quitado${aire.length!==1?"s":""}: revísalos (clic en uno para recuperarlo)`);
      }
    } catch(e){ toast && toast(e.message); }
    setOcupado("");
  };

  // al reproducir, lo quitado se salta: se ve como quedará
  useEffect(()=>{
    const v = vid.current; if(!v) return;
    const h = () => {
      const tt = v.currentTime; setT(tt);
      const x = ts.find(s=>tt>=s.a && tt<s.b);
      if(x && x.fuera && !v.paused){
        const sig = ts.find(s=>s.a>=x.b-1e-6 && !s.fuera);
        if(sig) v.currentTime = sig.a; else v.pause();
      }
    };
    v.addEventListener("timeupdate", h);
    const iv = setInterval(()=>{ if(!v.paused) h(); }, 40);
    return ()=>{ v.removeEventListener("timeupdate", h); clearInterval(iv); };
  },[ts, info]);

  const ir = tt => { const v = vid.current; if(v){ v.currentTime = Math.max(0, Math.min(dur, tt)); setT(v.currentTime); } };
  const tiempoDe = e => { const r = pista.current.getBoundingClientRect(); return Math.max(0, Math.min(dur, (e.clientX - r.left) / r.width * dur)); };
  const arrastrar = e => {
    const tt = tiempoDe(e); ir(tt); setSel(idxEn(tt));
    const mover = ev => ir(tiempoDe(ev));
    const soltar = () => { window.removeEventListener("mousemove", mover); window.removeEventListener("mouseup", soltar); };
    window.addEventListener("mousemove", mover); window.addEventListener("mouseup", soltar);
  };

  // atajos
  useEffect(()=>{
    const h = e => {
      if(/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||"")) return;
      const v = vid.current;
      if(e.key===" "){ e.preventDefault(); if(v) v.paused ? v.play() : v.pause(); }
      else if(e.key==="s"||e.key==="S"){ e.preventDefault(); cortar(); }
      else if(e.key==="Delete"||e.key==="Backspace"){ e.preventDefault(); alternar(sel!=null?sel:idxEn(t)); }
      else if(e.key==="i"||e.key==="I"){ e.preventDefault(); inicioAqui(); }
      else if(e.key==="o"||e.key==="O"){ e.preventDefault(); finalAqui(); }
      else if(e.key==="ArrowLeft"){ e.preventDefault(); ir(t - (e.shiftKey?1:1/30)); }
      else if(e.key==="ArrowRight"){ e.preventDefault(); ir(t + (e.shiftKey?1:1/30)); }
      else if((e.ctrlKey||e.metaKey) && (e.key==="z"||e.key==="Z")){ e.preventDefault(); e.stopImmediatePropagation(); deshacer(); }
      else if(e.key==="Escape"){ e.preventDefault(); salir(); }
    };
    window.addEventListener("keydown", h, true);
    return ()=>window.removeEventListener("keydown", h, true);
  });

  const soltarVideo = async () => {
    const v = vid.current;
    if(v){ try { v.pause(); v.removeAttribute("src"); v.load(); } catch(x){} }
    document.querySelectorAll("video").forEach(x=>{ try { x.pause(); x.removeAttribute("src"); x.load(); } catch(y){} });
    await new Promise(r=>setTimeout(r,450));   // Windows no deja reemplazar un vídeo abierto
  };
  const cambiado = ts.some(x=>x.fuera);
  const salir = () => { if(cambiado && !window.confirm("Tienes cortes sin guardar. ¿Salir sin guardarlos?")) return; onCerrar(); };
  const guardar = async () => {
    const quedanT = ts.filter(x=>!x.fuera).map(x=>`${x.a.toFixed(3)}-${x.b.toFixed(3)}`);
    if(!quedanT.length){ toast && toast("No puedes quitarlo todo: para eso, descarta el clip"); return; }
    setOcupado("Guardando el clip cortado…");
    await soltarVideo();
    try {
      const ev = await consultar(["editar", carpeta, archivo, quedanT.join(",")]);
      const h = ev.find(e=>e.evento==="hecho") || {};
      toast && toast(`Guardado: ${t2s(h.dur)} (el original queda guardado por si quieres volver)`);
      setVersion(Date.now()); onGuardado && onGuardado(); await cargar();
    } catch(e){ toast && toast(e.message); setVersion(Date.now()); }
    setOcupado("");
  };
  const restaurar = async () => {
    if(!window.confirm("¿Volver al clip original? Se pierden los cortes guardados de este momento.")) return;
    setOcupado("Restaurando el original…");
    await soltarVideo();
    try { await consultar(["original", carpeta, archivo]); toast && toast("Original restaurado"); setVersion(Date.now()); onGuardado && onGuardado(); await cargar(); }
    catch(e){ toast && toast(e.message); setVersion(Date.now()); }
    setOcupado("");
  };

  const pct = x => (x / (dur||1) * 100) + "%";
  const picos = info ? info.picos : [];
  // en el <body>: dentro de la vista (que se anima con transform) el "fixed" se descolocaba
  return createPortal(
    <div className="modal-overlay" onClick={salir} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.78)",zIndex:1200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div onClick={e=>e.stopPropagation()} style={{width:"min(1180px,100%)",maxHeight:"100%",overflow:"auto",background:"var(--bg-2)",border:"1px solid var(--border)",borderRadius:16,padding:18,display:"flex",flexDirection:"column",gap:12}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <b style={{fontSize:15}}>✂ Editar clip</b>
          <span style={{fontSize:12.5,color:"var(--text-3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0,flex:1}}>{carpeta} · {archivo.replace(/\.mp4$/i,"")}</span>
          <button onClick={salir} style={{fontSize:12.5,color:"var(--text-3)"}}>Cerrar ✕</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"minmax(0,260px) minmax(0,1fr)",gap:16,alignItems:"start"}}>
          <video ref={vid} key={version} src={fileUrl(ruta, version)} style={{width:"100%",aspectRatio:"9/16",background:"#000",borderRadius:10}} onClick={()=>{ const v=vid.current; v && (v.paused?v.play():v.pause()); }}/>
          <div style={{display:"flex",flexDirection:"column",gap:12,minWidth:0}}>
            <div style={{display:"flex",gap:14,flexWrap:"wrap",fontSize:13}}>
              <span>Cabezal <b style={{color:"var(--gold)"}}>{t2s(t)}</b></span>
              <span style={{color:"var(--text-2)"}}>Dura {t2s(dur)} → queda <b style={{color:cambiado?"#4ade80":"var(--text)"}}>{t2s(quedan)}</b></span>
              {info && info.editado && <span style={{color:"var(--text-3)"}}>ya editado antes ({info.editado.tramos.length} tramo{info.editado.tramos.length!==1?"s":""})</span>}
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              <button onClick={()=>{ const v=vid.current; v && (v.paused?v.play():v.pause()); }} style={boton(false)} title="Espacio">▶ / ❚❚</button>
              <button onClick={cortar} style={boton(false)} title="S">✂ Cortar aquí</button>
              <button onClick={()=>alternar(sel!=null?sel:idxEn(t))} style={boton(false)} title="Supr">{(ts[sel!=null?sel:idxEn(t)]||{}).fuera ? "↺ Recuperar tramo" : "🗑 Quitar tramo"}</button>
              <button onClick={inicioAqui} style={boton(false)} title="I: quita todo lo de antes del cabezal">⇤ Empieza aquí</button>
              <button onClick={finalAqui} style={boton(false)} title="O: quita todo lo de después del cabezal">Acaba aquí ⇥</button>
              <button onClick={proponerAire} disabled={!!ocupado} style={boton(false)} title="El clon quita los silencios largos (regla de oro: el aire se corta); tú decides">✨ Quitar el aire</button>
              <button onClick={deshacer} disabled={!hist.length} style={{...boton(false),opacity:hist.length?1:.4}} title="Ctrl+Z">↶ Deshacer</button>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:"var(--text-3)"}}>
              Zoom <input type="range" min={1} max={8} step={0.5} value={zoom} onChange={e=>setZoom(Number(e.target.value))} style={{width:140}}/> ×{zoom}
            </div>
            <div style={{overflowX:"auto",border:"1px solid var(--border)",borderRadius:10,background:"#0b0b0b"}}>
              <div ref={pista} onMouseDown={arrastrar} style={{position:"relative",width:(100*zoom)+"%",height:118,cursor:"pointer",userSelect:"none",
                backgroundImage: info && info.tira ? `url("${fileUrl(info.tira, version)}")` : "none", backgroundSize:"100% 78px", backgroundRepeat:"no-repeat"}}>
                {/* la onda del audio */}
                <svg viewBox={`0 0 ${picos.length||1} 40`} preserveAspectRatio="none" style={{position:"absolute",left:0,right:0,bottom:0,height:40,width:"100%"}}>
                  <path d={picos.map((p,i)=>`M${i},${40-Math.pow(p,1.8)*34}V40`).join("")} stroke="rgba(212,175,55,0.6)" strokeWidth="0.8" fill="none"/>
                </svg>
                {/* los tramos */}
                {ts.map((x,i)=>(
                  <div key={i} onMouseDown={e=>{ e.stopPropagation(); setSel(i); ir(tiempoDe(e)); }}
                    onDoubleClick={()=>alternar(i)} title={x.fuera ? "Quitado (doble clic para recuperarlo)" : "Se queda (doble clic para quitarlo)"}
                    style={{position:"absolute",top:0,bottom:0,left:pct(x.a),width:pct(x.b-x.a),
                      background: x.fuera ? (x.propuesto ? "repeating-linear-gradient(135deg,rgba(96,165,250,0.55) 0 6px,rgba(0,0,0,0.6) 6px 12px)"
                                                         : "repeating-linear-gradient(135deg,rgba(248,113,113,0.55) 0 6px,rgba(0,0,0,0.65) 6px 12px)") : "transparent",
                      outline: sel===i ? "2px solid var(--gold)" : "none", outlineOffset:-2, borderLeft:"1px solid rgba(255,255,255,0.65)"}}/>
                ))}
                {/* el cabezal */}
                <div style={{position:"absolute",top:-2,bottom:-2,left:pct(t),width:2,background:"var(--gold)",boxShadow:"0 0 6px var(--gold)",pointerEvents:"none"}}/>
              </div>
            </div>
            <div style={{fontSize:11.5,color:"var(--text-3)",lineHeight:1.5}}>
              Clic o arrastra en la línea para moverte · <b>Espacio</b> reproducir · <b>S</b> cortar · <b>Supr</b> quitar/recuperar el tramo elegido (o doble clic) ·
              <b> I</b>/<b>O</b> empieza/acaba aquí · <b>←/→</b> fotograma (Mayús: 1 s) · <b>Ctrl+Z</b> deshacer. En rojo lo que quitas, en azul el aire que propone el clon.
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
              <button onClick={guardar} disabled={!cambiado||!!ocupado} style={{...boton(cambiado&&!ocupado),padding:"9px 16px",opacity:cambiado&&!ocupado?1:.5}}>Guardar cortes</button>
              {info && info.hay_original && <button onClick={restaurar} disabled={!!ocupado} style={boton(false,true)}>Volver al original</button>}
              {ocupado && <span style={{fontSize:12.5,color:"var(--gold)"}}>{ocupado}</span>}
            </div>
          </div>
        </div>
      </div>
    </div>, document.body);
}
