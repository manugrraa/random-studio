import React from "react";
const { useState, useEffect, useRef } = React;
import { boton } from "./clon";

/* ============================ CONVERTIDOR YT (v3.4) ============================
   Él: "incluye el convertidor de YT a MP4 o MP3 dentro de RandomStudio". Es SU
   Convertidor YT (E:\A RdeRandom\Convertidor YT) con su mismo motor: 8 conexiones,
   enlaces frescos si YouTube corta y yt-dlp que se actualiza solo. Varios enlaces
   (uno por línea) se bajan uno detrás de otro. */

const ALTURAS = [2160, 1440, 1080, 720, 480, 360];
const KBPS = [320, 256, 192, 128];
const ls = (k, d) => { try { const v = localStorage.getItem(k); return v===null ? d : v; } catch(e){ return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch(e){} };

export function ConvertidorView({ toast }) {
  const enPC = !!(window.studioFS && window.studioFS.ytDescargar);
  const [texto, setTexto] = useState("");
  const [formato, setFormato] = useState(()=>ls("rds_yt_formato","mp4"));
  const [altura, setAltura] = useState(()=>Number(ls("rds_yt_altura","1080")));
  const [kbps, setKbps] = useState(()=>Number(ls("rds_yt_kbps","192")));
  const [destinos, setDestinos] = useState([]);
  const [destino, setDestino] = useState(()=>ls("rds_yt_destino",""));
  const [cola, setCola] = useState([]);          // [{url, estado, texto, pct, archivos, error}]
  const [activa, setActiva] = useState(false);
  const colaRef = useRef([]); colaRef.current = cola;
  useEffect(()=>{ lsSet("rds_yt_formato",formato); lsSet("rds_yt_altura",String(altura)); lsSet("rds_yt_kbps",String(kbps)); if(destino) lsSet("rds_yt_destino",destino); },[formato,altura,kbps,destino]);
  useEffect(()=>{ if(enPC) window.studioFS.ytDestinos().then(d=>{ setDestinos(d); if(!destino && d[0]) setDestino(d[0][1]); }); },[]);

  const actual = () => colaRef.current.findIndex(x=>x.estado==="bajando");
  const cambiar = (i, c) => setCola(q=>q.map((x,k)=>k===i?{...x,...c}:x));
  const siguiente = async () => {
    const q = colaRef.current;
    const i = q.findIndex(x=>x.estado==="espera");
    if(i<0){ setActiva(false); return; }
    cambiar(i, {estado:"bajando", texto:"Empezando…", pct:0});
    const r = await window.studioFS.ytDescargar({ url:q[i].url, formato:q[i].formato, altura:q[i].altura, kbps:q[i].kbps, destino:q[i].destino });
    if(r.error){ cambiar(i, {estado:"error", error:r.error}); setTimeout(siguiente, 50); }
  };
  useEffect(()=>{
    if(!enPC) return;
    return window.studioFS.onYtProgreso(ev=>{
      const i = actual(); if(i<0) return;
      if(ev.evento==="estado") cambiar(i, {texto:ev.texto});
      else if(ev.evento==="progreso") cambiar(i, {pct:ev.pct});
      else if(ev.evento==="marquesina") cambiar(i, {marquesina:ev.activa});
      else if(ev.evento==="error") cambiar(i, {error:ev.mensaje});
      else if(ev.evento==="fin") cambiar(i, {archivos:ev.archivos});
      else if(ev.evento==="cerrado"){
        const x = colaRef.current[i];
        const ok = x && (x.archivos||[]).length>0;
        cambiar(i, {estado: ok?"hecho":(ev.codigo===1 && !x.error ? "cancelado" : "error"),
                    error: ok ? null : (x && x.error) || (ev.error ? ev.error.slice(-200) : "cancelado")});
        if(ok) toast && toast("Descargado: "+(x.archivos[0]||"").split(/[\\/]/).pop());
        setTimeout(siguiente, 50);
      }
    });
  },[]);

  const anadir = () => {
    const urls = texto.split(/\s+/).map(s=>s.trim()).filter(s=>/^https?:\/\//i.test(s));
    if(!urls.length){ toast && toast("Pega uno o varios enlaces de YouTube"); return; }
    setCola(q=>[...q, ...urls.map(url=>({url, formato, altura, kbps, destino, estado:"espera", texto:"En cola", pct:0}))]);
    setTexto("");
    if(!activa){ setActiva(true); setTimeout(siguiente, 50); }
  };

  if(!enPC) return <div className="fade-in"><h2 style={{fontSize:20,fontWeight:700,marginBottom:12}}>Convertidor YT</h2>
    <div style={{padding:"18px 20px",border:"1px dashed var(--border)",borderRadius:14,color:"var(--text-2)",fontSize:13.5}}>El convertidor funciona en el PC: ábrelo desde RDeRandom Studio de escritorio.</div></div>;

  const sel = {fontSize:13,padding:"8px 10px",borderRadius:10,border:"1px solid var(--border)",background:"var(--bg-2)",color:"var(--text)"};
  return (
    <div className="fade-in" style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{maxWidth:680}}>
        <h2 style={{fontSize:20,fontWeight:700}}>Convertidor YT</h2>
        <p style={{fontSize:12.5,color:"var(--text-2)",marginTop:2}}>
          Pega enlaces de YouTube (uno por línea) y bájalos en MP4 o MP3. Es tu Convertidor YT con su mismo motor rápido.
          Para la música de los Shorts, guárdala en la Música de la biblioteca (y que sea sin copyright).
        </p>
      </div>
      <textarea value={texto} onChange={e=>setTexto(e.target.value)} rows={3} placeholder="https://www.youtube.com/watch?v=…"
        onKeyDown={e=>{ if(e.key==="Enter" && (e.ctrlKey||e.metaKey)) anadir(); }}
        style={{...sel,width:"100%",resize:"vertical",fontFamily:"inherit",padding:"10px 12px"}}/>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
        <div role="group" style={{display:"flex",border:"1px solid var(--border)",borderRadius:10,overflow:"hidden"}}>
          {[["mp4","MP4 (vídeo)"],["mp3","MP3 (audio)"]].map(([k,l])=>(
            <button key={k} onClick={()=>setFormato(k)} style={{fontSize:13,fontWeight:600,padding:"8px 14px",
              color:formato===k?"var(--gold)":"var(--text-3)",background:formato===k?"rgba(212,175,55,0.12)":"transparent"}}>{l}</button>))}
        </div>
        {formato==="mp4"
          ? <select value={altura} onChange={e=>setAltura(Number(e.target.value))} style={sel}>{ALTURAS.map(a=><option key={a} value={a}>{a}p{a===2160?" (4K)":a===1440?" (2K)":""}</option>)}</select>
          : <select value={kbps} onChange={e=>setKbps(Number(e.target.value))} style={sel}>{KBPS.map(a=><option key={a} value={a}>{a} kbps</option>)}</select>}
        <select value={destino} onChange={e=>setDestino(e.target.value)} style={{...sel,maxWidth:280}}>
          {destinos.map(([n,r])=><option key={r} value={r}>{n}</option>)}
          {destino && !destinos.some(d=>d[1]===destino) && <option value={destino}>{destino}</option>}
        </select>
        <button onClick={async()=>{ const c = await window.studioFS.ytElegirCarpeta(); if(c) setDestino(c); }} style={{...boton(false),padding:"7px 11px",fontSize:12}}>Otra carpeta…</button>
        <button onClick={()=>window.studioFS.ytAbrir(destino)} style={{...boton(false),padding:"7px 11px",fontSize:12}}>Abrir carpeta</button>
        <button onClick={anadir} style={{...boton(true),marginLeft:"auto"}}>Descargar</button>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {cola.map((x,i)=>(
          <div key={i} style={{padding:"10px 14px",border:"1px solid var(--border)",borderRadius:12,background:"var(--bg-2)",display:"flex",flexDirection:"column",gap:6}}>
            <div style={{display:"flex",gap:10,alignItems:"center"}}>
              <span style={{fontSize:11,fontWeight:800,padding:"2px 8px",borderRadius:999,background:"var(--border)",color:"var(--text-2)"}}>{x.formato.toUpperCase()}{x.formato==="mp4"?" "+x.altura+"p":" "+x.kbps}</span>
              <span style={{flex:1,minWidth:0,fontSize:12.5,color:"var(--text-2)",overflowWrap:"anywhere"}}>{x.archivos && x.archivos[0] ? x.archivos[0].split(/[\\/]/).pop() : x.url}</span>
              {x.estado==="bajando" && <button onClick={()=>window.studioFS.ytCancelar()} style={{...boton(false,true),padding:"4px 10px",fontSize:12}}>Cancelar</button>}
              {x.estado==="hecho" && <button onClick={()=>window.studioFS.ytAbrir(x.archivos[0])} style={{...boton(false),padding:"4px 10px",fontSize:12,color:"#4ade80"}}>Mostrar</button>}
              {x.estado!=="bajando" && <button onClick={()=>setCola(q=>q.filter((_,k)=>k!==i))} title="Quitar de la lista" style={{fontSize:12,color:"var(--text-3)"}}>✕</button>}
            </div>
            <div style={{fontSize:12,color:x.estado==="error"?"var(--red)":x.estado==="hecho"?"#4ade80":"var(--text-3)"}}>
              {x.estado==="error" ? "✗ "+(x.error||"no se pudo descargar") : x.estado==="cancelado" ? "Cancelado" : x.texto}
            </div>
            {x.estado==="bajando" && <div style={{height:5,borderRadius:3,background:"var(--border)",overflow:"hidden"}}>
              <div style={{height:"100%",width:(x.marquesina?100:x.pct||0)+"%",background:"var(--gold)",opacity:x.marquesina?.5:1,transition:"width .3s"}}/></div>}
          </div>
        ))}
      </div>
    </div>
  );
}
