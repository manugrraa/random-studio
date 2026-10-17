import React from "react";
const { useState, useEffect, useRef, useMemo, useCallback } = React;
import { FormatPill, Icons, STATUSES, StatusDot, clone, dnd, sortedFormats, touchDrag } from "./base";
import { YT_CATEGORIES, fechaISO, geminiGenerate, geminiGetKey, geminiHasKey, geminiSaveKey, ytAddToPlaylist, ytEnsureToken, ytGetTokens, ytGetVideoDetails, ytIsConnected, ytListMyVideos, ytListPlaylists, ytPostComment, ytSearchDrive, ytStartAuth, ytUpdateVideoMeta, ytUploadViaBackend, ytVideoDiario, ytVideoStats } from "./datos";
import { BarraProgreso, ingresosEstimadosActivos } from "./youtube";

export const ExpandCtx = React.createContext(false);

export function VideoCardBase({v, onOpen, onDragStart, onDragEnd, compact, formats}) {
  const f = formats[v.format] || { color:"#6B6B6B", label:"Sin formato" };
  const done = v.checklist.filter(c=>c.done).length;
  const pct = Math.round(done/v.checklist.length*100);
  const ref = useRef(null);
  const globalExp = React.useContext(ExpandCtx);
  const [ajuste, setAjuste] = useState(null); // ajuste manual de ESTA tarjeta
  useEffect(()=>{ setAjuste(null); }, [globalExp]); // el botón global resetea los ajustes
  const expanded = ajuste===null ? globalExp : ajuste;
  const esDirecto = v.type==="directo";
  const isLargo = v.type !== "short"; // vídeos largos Y directos van en blanco; solo los Shorts en oscuro
  const iconoTipo = esDirecto ? Icons.live : (v.type==="short" ? Icons.short : Icons.largo);
  const tipoLabel = esDirecto ? "Directo" : (v.type==="short" ? "Short" : "Vídeo largo");
  const th = isLargo
    ? { bg:"#F4F4F2", bgHover:"#FFFFFF", text:"#141414", text2:"#555", text3:"#8a8a8a", track:"#e2e2e0", border:"#d8d8d4" }
    : { bg:"#141414", bgHover:"#1F1F1F", text:"#F5F5F5", text2:"#A3A3A3", text3:"#8a8a8a", track:"#0a0a0a", border:"#2e2e2e" };
  const handleClick = () => {
    if(Date.now() < dnd.suppressClickUntil) return; // veníamos de arrastrar: no abrir
    onOpen(v);
  };
  const toggle = (
    <button onClick={e=>{e.stopPropagation(); setAjuste(expanded?false:true);}} title={expanded?"Contraer":"Expandir"}
      style={{display:"flex",color:th.text3,padding:2,flexShrink:0,transform:expanded?"rotate(180deg)":"none",transition:"transform .18s",background:"none",border:"none",cursor:"pointer"}}>
      {Icons.chevron}
    </button>
  );
  return (
    <div draggable ref={ref}
      data-drop="card" data-dropval={v.id}
      onDragStart={e=>onDragStart(e,v)} onDragEnd={onDragEnd}
      onDragOver={e=>{e.preventDefault(); e.stopPropagation();}}
      onDrop={e=>{e.preventDefault(); e.stopPropagation(); if(dnd.moveBefore && dnd.dragId && dnd.dragId!==v.id) dnd.moveBefore(dnd.dragId, v.id);}}
      onTouchStart={e=>touchDrag.onStart(e, v, ref.current)}
      onTouchMove={e=>touchDrag.onMovePre(e)}
      onTouchEnd={()=>touchDrag.onEndPre()}
      onClick={handleClick}
      className="fade-in"
      style={{
        background:th.bg, border:`1px solid ${th.border}`, borderLeft:`3px solid ${f.color}`,
        borderRadius:10, padding: expanded ? (compact?"9px 11px":"12px 13px") : (compact?"7px 9px":"8px 11px"),
        cursor:"pointer", position:"relative",
        transition:"background .15s, border-color .15s"
      }}
      onMouseEnter={e=>{e.currentTarget.style.background=th.bgHover;e.currentTarget.style.borderColor= isLargo?"#c8b46a":"var(--border-gold)";e.currentTarget.style.borderLeftColor=f.color;}}
      onMouseLeave={e=>{e.currentTarget.style.background=th.bg;e.currentTarget.style.borderColor=th.border;e.currentTarget.style.borderLeftColor=f.color;}}
    >
      {!expanded ? (
        <div className="fade-in" style={{minWidth:0}}>
          {/* ——— CONTRAÍDA: título en una línea + formato + hora ——— */}
          <div style={{display:"flex",alignItems:"center",gap:7,minWidth:0}}>
            <span style={{color:f.color, display:"flex", flexShrink:0}}>{iconoTipo}</span>
            <span style={{fontSize: compact?12:12.5, fontWeight:600, color:th.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1, minWidth:0}}>{v.title}</span>
            {toggle}
          </div>
          <div style={{display:"flex", flexWrap:"wrap", gap:6, alignItems:"center", marginTop:5, minWidth:0}}>
            <FormatPill fmt={f} small/>
            {v.date && <span style={{fontSize:10.5,color:th.text3,display:"inline-flex",alignItems:"center",gap:4,flexShrink:0}}>{Icons.clock}{v.time}</span>}
            {v.youtubeId && (
              <span style={{display:"inline-flex",alignItems:"center",gap:3,fontSize:9.5,fontWeight:700,color:"#FF0000",background:"rgba(255,0,0,0.1)",padding:"1px 6px",borderRadius:20,flexShrink:0}}>
                <span style={{display:"flex",width:11,height:11}}>{Icons.youtube}</span>{v.youtubeStatus==="scheduled"?"Prog.":"YT"}
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="fade-in" style={{minWidth:0}}>
          {/* ——— EXPANDIDA: todos los datos ——— */}
          <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8}}>
            <div style={{display:"flex",alignItems:"center",gap:7, color:th.text3}}>
              <span style={{color:f.color, display:"flex"}}>{iconoTipo}</span>
              {!compact && <span style={{fontSize:10.5, textTransform:"uppercase", letterSpacing:".06em", color:th.text3}}>{tipoLabel}</span>}
            </div>
            <div style={{display:"flex",alignItems:"center",gap:5}}>
              <span style={{color:th.text3, display:"flex"}}>{Icons.drag}</span>
              {toggle}
            </div>
          </div>
          <div style={{fontSize: compact?12.5:13.5, fontWeight:600, color:th.text, margin:"7px 0 8px", lineHeight:1.35}}>{v.title}</div>
          <div style={{display:"flex", flexWrap:"wrap", gap:6, alignItems:"center"}}>
            <FormatPill fmt={f} small/>
            {v.date && <span style={{fontSize:10.5,color:th.text3,display:"inline-flex",alignItems:"center",gap:4}}>{Icons.clock}{v.time}</span>}
            {v.youtubeId && (
              <span title={v.youtubeStatus==="scheduled"?"Programado en YouTube":"Subido a YouTube"} style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:10,fontWeight:700,color:"#FF0000",background:"rgba(255,0,0,0.1)",padding:"2px 7px",borderRadius:20}}>
                <span style={{display:"flex",width:12,height:12}}>{Icons.youtube}</span>{v.youtubeStatus==="scheduled"?"Prog.":"YT"}
              </span>
            )}
          </div>
          <div style={{marginTop:10}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:th.text3,marginBottom:4}}>
              <StatusDot status={v.status}/><span>{done}/{v.checklist.length}</span>
            </div>
            <div style={{height:4, background:th.track, borderRadius:4, overflow:"hidden"}}>
              <div style={{height:"100%", width:`${pct}%`, background: pct===100?"var(--green)":"linear-gradient(90deg,#D4AF37,#FFD700)", transition:"width .3s", borderRadius:4}}/>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================ MODAL EDITOR ============================ */
// Botoncito de copiar con confirmación visual (para título y notas)
// VideoCard memoizada: si los datos del vídeo no cambian, NO se vuelve a renderizar
// (evita que la animación de entrada se repita al sincronizar → sin parpadeo).
export const VideoCard = React.memo(VideoCardBase, (prev, next) => {
  return prev.compact === next.compact
    && prev.onOpen === next.onOpen
    && prev.onDragStart === next.onDragStart
    && prev.onDragEnd === next.onDragEnd
    && prev.formats === next.formats
    && JSON.stringify(prev.v) === JSON.stringify(next.v);
});

export function CopyMini({ text, what }) {
  const [ok, setOk] = useState(false);
  const doCopy = async () => {
    if(!text){ return; }
    try { await navigator.clipboard.writeText(text); }
    catch(e){
      // Alternativa para navegadores/webviews sin permiso de portapapeles
      try {
        const ta = document.createElement("textarea");
        ta.value = text; ta.style.position="fixed"; ta.style.opacity="0";
        document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
      } catch(_){ return; }
    }
    setOk(true); setTimeout(()=>setOk(false), 1500);
  };
  return (
    <button onClick={doCopy} title={`Copiar ${what}`} style={{
      display:"flex",alignItems:"center",gap:5,fontSize:11.5,padding:"4px 9px",borderRadius:7,transition:"all .15s",
      color: ok?"var(--green)":"var(--text-2)",
      border:`1px solid ${ok?"rgba(74,222,128,0.3)":"var(--border)"}`,
      background: ok?"rgba(74,222,128,0.08)":"transparent"
    }} onMouseEnter={e=>{ if(!ok){e.currentTarget.style.color="var(--gold)";e.currentTarget.style.borderColor="var(--border-gold)";} }}
       onMouseLeave={e=>{ if(!ok){e.currentTarget.style.color="var(--text-2)";e.currentTarget.style.borderColor="var(--border)";} }}>
      {ok?Icons.check:Icons.copy}{ok?"Copiado":"Copiar"}
    </button>
  );
}

export function VideoModal({v, allVideos, goals, onClose, onSave, onDelete, onDuplicate, onUploadYouTube, promptTemplates, toast, formats}) {
  const [draft, setDraft] = useState(clone(v));
  const [notesBig, setNotesBig] = useState(false);
  // Estadísticas del vídeo (si ya está publicado en YouTube)
  const [ytStats, setYtStats] = useState(null);
  const [ytSerie, setYtSerie] = useState(null);
  const [aplicando, setAplicando] = useState(false);
  useEffect(()=>{
    let vivo = true;
    setYtStats(null); setYtSerie(null);
    if(v.youtubeId && ytIsConnected() && v.youtubeStatus==="published"){
      ytVideoStats(v.youtubeId).then(s=>{ if(vivo) setYtStats(s); }).catch(()=>{});
      const hoyD = new Date(); const ini = new Date(); ini.setDate(ini.getDate()-28);
      ytVideoDiario(v.youtubeId, fechaISO(ini), fechaISO(hoyD)).then(rows=>{ if(vivo) setYtSerie(rows); }).catch(()=>{});
    }
    return ()=>{ vivo=false; };
  },[v]);
  // RPM efectivo (manual o el real de SHORTS) y objetivo de visitas por Short
  const rpmModal = (()=>{
    const cfgG = goals && goals.cfg; if(!cfgG) return null;
    const r = cfgG.rpmManual!=null ? cfgG.rpmManual : ((goals.rpm && goals.rpm.shorts && goals.rpm.shorts.rpm) || null);
    return (r && r>0) ? r : null;
  })();
  const objetivoShortModal = (()=>{
    const cfgG = goals && goals.cfg; if(!cfgG || !rpmModal) return null;
    const hoyD = new Date();
    const diasM = new Date(hoyD.getFullYear(), hoyD.getMonth()+1, 0).getDate();
    return Math.round(cfgG.targetEur / rpmModal * 1000 / diasM / (cfgG.shortsPerDay||3));
  })();
  // Aplica título y descripción EN YouTube (conservando etiquetas/categoría) y guarda
  const aplicarEnYT = async () => {
    setAplicando(true);
    try {
      await ytUpdateVideoMeta(draft.youtubeId, { title: draft.title, description: draft.description||"" });
      toast && toast("✅ Título y descripción aplicados en YouTube");
      onSave(draft); onClose();
    } catch(e){ toast && toast("❌ "+e.message); }
    finally { setAplicando(false); }
  };
  // Copiar la descripción de otro vídeo (local o, si está en YouTube, desde la API)
  const [copiandoDesc, setCopiandoDesc] = useState(false);
  const fuentesDesc = (allVideos||[])
    .filter(x=>x.id!==v.id && ((x.description||"").trim() || x.youtubeId))
    .sort((a,b)=> (b.date||"").localeCompare(a.date||""));
  const copiarDescDe = async (id) => {
    const src = (allVideos||[]).find(x=>x.id===id);
    if(!src) return;
    if((src.description||"").trim()){
      setDraft(d=>({...d, description: src.description}));
      toast && toast("Descripción copiada de «"+(src.title||"").slice(0,40)+"»");
      return;
    }
    if(src.youtubeId && ytIsConnected()){
      setCopiandoDesc(true);
      try {
        const det = await ytGetVideoDetails(src.youtubeId);
        if(det && det.description){ setDraft(d=>({...d, description: det.description})); toast && toast("Descripción copiada desde YouTube"); }
        else toast && toast("Ese vídeo no tiene descripción en YouTube");
      } catch(e){ toast && toast("❌ "+e.message); }
      finally { setCopiandoDesc(false); }
    } else {
      toast && toast(src.youtubeId ? "Conecta con Google para leerla de YouTube" : "Ese vídeo no tiene descripción guardada");
    }
  };
  const [selectedPrompt, setSelectedPrompt] = useState("");
  const [promptDraft, setPromptDraft] = useState(""); // prompt adaptado a este vídeo
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  useEffect(()=>{ setDraft(clone(v)); setNotesBig(false); setSelectedPrompt(""); setPromptDraft(""); setShowPromptEditor(false); },[v]);
  const f = formats[draft.format] || { color:"#6B6B6B" };
  const set = (k,val)=>setDraft(d=>({...d,[k]:val}));

  // Al elegir una plantilla, carga su prompt en el editor (para adaptarlo a este vídeo)
  const pickPrompt = (id) => {
    setSelectedPrompt(id);
    const tpl = (promptTemplates||[]).find(t=>t.id===id);
    if(tpl){
      // Sustituimos las variables con los datos de ESTE vídeo, dejándolo editable
      const filled = tpl.prompt
        .replace(/\{titulo\}/gi, draft.title||"")
        .replace(/\{juego\}/gi, draft.game||"")
        .replace(/\{etiquetas\}/gi, "");
      setPromptDraft(filled);
      setShowPromptEditor(true);
    } else {
      setPromptDraft(""); setShowPromptEditor(false);
    }
  };

  // Generar la descripción con IA usando el prompt (ya adaptado) de la tarjeta
  const genDesc = async () => {
    if(!geminiHasKey()){ toast && toast("Configura la IA en el apartado Agente"); return; }
    const finalPrompt = (promptDraft||"").trim();
    if(!finalPrompt){ toast && toast("Elige una plantilla o escribe un prompt"); return; }
    setAiBusy(true);
    try {
      const out = await geminiGenerate(finalPrompt);
      set("description", out);
      toast && toast("Descripción generada con IA");
    } catch(e){ toast && toast("❌ "+e.message); }
    finally { setAiBusy(false); }
  };
  const toggleCheck = id => setDraft(d=>({...d, checklist: d.checklist.map(c=>c.id===id?{...c,done:!c.done}:c)}));
  const done = draft.checklist.filter(c=>c.done).length;
  const pct = Math.round(done/draft.checklist.length*100);

  // Guarda los cambios y cierra (se usa al pulsar Escape o la cruz)
  const closeWithSave = () => { onSave(draft); onClose(); };

  // Cerrar con ESC (guardando), guardar con Ctrl+Enter, mover a papelera con Supr/Backspace
  useEffect(()=>{
    const h = e => {
      if(e.key==="Escape") closeWithSave();
      if(e.key==="Enter" && (e.ctrlKey||e.metaKey)) { closeWithSave(); }
      // Supr (o Backspace) mueve a papelera, salvo que estés escribiendo en un campo
      if(e.key==="Delete" || e.key==="Backspace"){
        const tag = (e.target.tagName||"").toLowerCase();
        const editable = tag==="input" || tag==="textarea" || tag==="select" || e.target.isContentEditable;
        if(!editable){ e.preventDefault(); onDelete(draft.id); onClose(); }
      }
    };
    window.addEventListener("keydown",h);
    return ()=>window.removeEventListener("keydown",h);
  },[draft]);

  return (
    <div className="modal-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.78)",zIndex:1000,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"5vh 16px",overflowY:"auto",backdropFilter:"blur(3px)"}}>
      <div className="pop vm-panel" style={{
        background:"var(--bg-2)", border:`1px solid var(--border-gold)`, borderRadius:18, width:"100%", maxWidth: notesBig?720:560,
        boxShadow:"0 20px 70px rgba(0,0,0,0.7)", transition:"max-width .25s"
      }}>
        <div style={{padding:"18px 22px", borderBottom:"1px solid var(--border)", display:"flex",justifyContent:"space-between",alignItems:"center", background:`linear-gradient(180deg, ${f.color}10, transparent)`}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{color:f.color,display:"flex"}}>{draft.type==="short"?Icons.short:(draft.type==="directo"?Icons.live:Icons.largo)}</span>
            <span style={{fontSize:12.5,color:"var(--text-2)",fontWeight:600,textTransform:"uppercase",letterSpacing:".05em"}}>Editar vídeo</span>
          </div>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            <button onClick={()=>{onDuplicate(draft);}} title="Duplicar vídeo" style={{color:"var(--text-2)",display:"flex",padding:6,borderRadius:7}}
              onMouseEnter={e=>e.currentTarget.style.color="var(--gold)"} onMouseLeave={e=>e.currentTarget.style.color="var(--text-2)"}>{Icons.copy}</button>
            <button onClick={closeWithSave} title="Guardar y cerrar (Esc)" style={{color:"var(--text-2)",display:"flex",padding:6,borderRadius:7}}
              onMouseEnter={e=>e.currentTarget.style.color="var(--text)"} onMouseLeave={e=>e.currentTarget.style.color="var(--text-2)"}>{Icons.x}</button>
          </div>
        </div>

        <div style={{padding:22, maxHeight:"74vh", overflowY:"auto"}}>
          {/* ——— Rendimiento del vídeo en YouTube (mejor que Studio: comparado con TU objetivo) ——— */}
          {ytStats && (()=>{
            const nfm = new Intl.NumberFormat("es-ES");
            const estimando = ingresosEstimadosActivos() && rpmModal;
            const revTotal = estimando
              ? ytStats.vistas * rpmModal / 1000  // estimación de TODO el vídeo, al momento
              : (ytSerie ? ytSerie.reduce((a,r)=>a+(r.rev||0),0) : null);
            const pctObj = (draft.type==="short" && objetivoShortModal) ? ytStats.vistas/objetivoShortModal*100 : null;
            const maxSerie = ytSerie && ytSerie.length ? Math.max(...ytSerie.map(r=>r.views),1) : 1;
            return (
              <div className="fade-in" style={{marginBottom:18,padding:"12px 14px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:11}}>
                <div style={{display:"flex",gap:16,alignItems:"center",flexWrap:"wrap",fontSize:12.5}}>
                  <span style={{fontWeight:700,color:"var(--text)"}}>👁 {nfm.format(ytStats.vistas)}</span>
                  <span style={{color:"var(--text-2)"}}>👍 {nfm.format(ytStats.likes)}</span>
                  <span style={{color:"var(--text-2)"}}>💬 {nfm.format(ytStats.comentarios)}</span>
                  {revTotal!=null && <span style={{color:"var(--text-2)"}}>≈ {revTotal.toLocaleString("es-ES",{minimumFractionDigits:2,maximumFractionDigits:2})} € {(ingresosEstimadosActivos() && rpmModal)?"(estimado)":"(real · 28 días)"}</span>}
                  {pctObj!=null && (
                    <span style={{fontWeight:700,color: pctObj>=100?"var(--green)":"var(--gold)"}}>
                      {Math.round(pctObj)}% de tu objetivo por Short ({nfm.format(objetivoShortModal)})
                    </span>
                  )}
                </div>
                {pctObj!=null && <div style={{marginTop:8}}><BarraProgreso pct={pctObj} alto={6}/></div>}
                {ytSerie && ytSerie.length>1 && (
                  <div style={{display:"flex",gap:2,alignItems:"flex-end",height:34,marginTop:10}} title="Visitas por día · últimos 28 días">
                    {ytSerie.map(r=>(
                      <div key={r.dia} title={r.dia+" · "+nfm.format(r.views)+" visitas"} style={{flex:1,minWidth:2,height:Math.max(2,r.views/maxSerie*32),borderRadius:2,background:"linear-gradient(180deg,#FFD700,#D4AF37)",opacity:.85}}/>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
          <div style={{marginBottom:18}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
              <span style={labelStyle}>Título del vídeo</span>
              <CopyMini text={draft.title} what="el título"/>
            </div>
            <input value={draft.title} onChange={e=>set("title",e.target.value)} style={inputStyle} autoFocus
              onFocus={e=>{ if(draft.title==="Nueva idea") e.target.select(); }}/>
          </div>

          {/* Dos columnas en pantallas anchas: datos+checklist+notas | descripción+comentario */}
          <div className="vm-cols" style={{display:"flex", flexDirection:"column", gap:18}}>
          <div style={{display:"flex", flexDirection:"column", gap:18, minWidth:0}}>
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:14}}>
            <Field label="Formato">
              <select value={draft.format} onChange={e=>set("format",e.target.value)} style={inputStyle}>
                {sortedFormats(formats).map(([k,val])=><option key={k} value={k}>{val.label}</option>)}
              </select>
            </Field>
            <Field label="Tipo">
              <select value={draft.type==="largo"?"video":draft.type} onChange={e=>set("type",e.target.value)} style={inputStyle}>
                <option value="short">Short</option>
                <option value="video">Vídeo largo</option>
                <option value="directo">Directo</option>
              </select>
            </Field>
          </div>

          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:14}}>
            <Field label="Estado">
              <select value={draft.status} onChange={e=>set("status",e.target.value)} style={inputStyle}>
                {Object.entries(STATUSES).map(([k,val])=><option key={k} value={k}>{val.label}</option>)}
              </select>
            </Field>
            <Field label="Hora">
              <input type="time" value={draft.time} onChange={e=>set("time",e.target.value)} style={inputStyle}/>
            </Field>
          </div>

          <Field label="Fecha de publicación">
            <input type="date" value={draft.date||""} onChange={e=>set("date",e.target.value||null)} style={inputStyle}/>
          </Field>

          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <span style={labelStyle}>Checklist de producción</span>
              <span style={{fontSize:11.5,color: pct===100?"var(--green)":"var(--gold)",fontWeight:600}}>{pct}% completo</span>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:7}}>
              {draft.checklist.map(c=>(
                <button key={c.id} onClick={()=>toggleCheck(c.id)} style={{
                  display:"flex",alignItems:"center",gap:11, padding:"9px 12px", borderRadius:9,
                  background: c.done?"rgba(74,222,128,0.07)":"var(--card)", border:`1px solid ${c.done?"rgba(74,222,128,0.25)":"var(--border)"}`,
                  textAlign:"left", transition:"all .15s"
                }}>
                  <span style={{
                    width:19,height:19,borderRadius:6, display:"flex",alignItems:"center",justifyContent:"center", flexShrink:0,
                    background: c.done?"var(--green)":"transparent", border:`1.5px solid ${c.done?"var(--green)":"var(--text-3)"}`, color:"#000"
                  }}>{c.done && Icons.check}</span>
                  <span style={{fontSize:13, color: c.done?"var(--text-2)":"var(--text)", textDecoration: c.done?"line-through":"none"}}>{c.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
              <span style={labelStyle}>Notas internas</span>
              <CopyMini text={draft.notes||""} what="las notas"/>
            </div>
            <textarea value={draft.notes||""} onChange={e=>set("notes",e.target.value)}
              placeholder="Notas privadas (guion, ideas de miniatura, recordatorios). No se suben a YouTube."
              style={{...inputStyle, minHeight:70, lineHeight:1.6}}/>
          </div>
          </div>

          <div style={{display:"flex", flexDirection:"column", gap:18, minWidth:0}}>
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
              <span style={labelStyle}>Descripción</span>
              <div style={{display:"flex",gap:7}}>
                <CopyMini text={draft.description||""} what="la descripción"/>
                <button onClick={()=>setNotesBig(b=>!b)} style={{
                display:"flex",alignItems:"center",gap:6,fontSize:11.5,color:"var(--text-2)",padding:"4px 9px",
                border:"1px solid var(--border)",borderRadius:7,transition:"all .15s"
              }} onMouseEnter={e=>{e.currentTarget.style.color="var(--gold)";e.currentTarget.style.borderColor="var(--border-gold)";}}
                 onMouseLeave={e=>{e.currentTarget.style.color="var(--text-2)";e.currentTarget.style.borderColor="var(--border)";}}>
                {notesBig?Icons.collapse:Icons.expand}{notesBig?"Reducir":"Ampliar"}
              </button>
              </div>
            </div>
            {fuentesDesc.length>0 && (
              <div style={{display:"flex",gap:7,marginBottom:9,alignItems:"center"}}>
                <select value="" onChange={e=>{ if(e.target.value) copiarDescDe(e.target.value); }} disabled={copiandoDesc}
                  style={{...inputStyle,flex:1,padding:"8px 10px",fontSize:12.5,opacity:copiandoDesc?0.6:1}}>
                  <option value="">{copiandoDesc?"Leyendo descripción…":"📋 Copiar descripción de otro vídeo…"}</option>
                  {fuentesDesc.map(x=>(
                    <option key={x.id} value={x.id}>{(x.title||"").slice(0,60)}{(x.description||"").trim()?"":" · (desde YouTube)"}</option>
                  ))}
                </select>
              </div>
            )}
            <div style={{display:"flex",gap:7,marginBottom:9,flexWrap:"wrap",alignItems:"center"}}>
              <select value={selectedPrompt} onChange={e=>pickPrompt(e.target.value)} style={{...inputStyle,flex:1,minWidth:160,padding:"8px 10px",fontSize:12.5}}>
                <option value="">{(promptTemplates||[]).length?"Elige una plantilla de prompt…":"Sin plantillas (créalas en Agente)"}</option>
                {(promptTemplates||[]).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <button onClick={genDesc} disabled={aiBusy || !promptDraft.trim()} title="Generar descripción con IA" style={{
                display:"flex",alignItems:"center",gap:7,fontSize:12.5,fontWeight:700,color:"#000",padding:"9px 14px",borderRadius:9,
                background:"linear-gradient(135deg,var(--gold),#e8c860)",opacity:(aiBusy||!promptDraft.trim())?0.55:1,flexShrink:0
              }}>
                <span className={aiBusy?"spinning":""} style={{display:"flex"}}>{aiBusy?Icons.refresh:Icons.sparkles}</span>
                {aiBusy?"Generando…":"Generar descripción"}
              </button>
            </div>
            {/* Editor del prompt adaptado a ESTE vídeo */}
            {showPromptEditor && (
              <div className="fade-in" style={{marginBottom:10,padding:12,background:"var(--card)",borderRadius:10,border:"1px solid var(--border-gold)"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
                  <span style={{fontSize:11.5,fontWeight:600,color:"var(--gold)"}}>Prompt para este vídeo (edítalo para afinarlo)</span>
                  <button onClick={()=>{ const tpl=(promptTemplates||[]).find(t=>t.id===selectedPrompt); if(tpl) pickPrompt(selectedPrompt); }} title="Restaurar el prompt de la plantilla" style={{fontSize:11,color:"var(--text-3)",display:"flex",alignItems:"center",gap:5,padding:"3px 8px",border:"1px solid var(--border)",borderRadius:7}}>
                    {Icons.refresh} Restaurar
                  </button>
                </div>
                <textarea value={promptDraft} onChange={e=>setPromptDraft(e.target.value)} rows={4}
                  placeholder="Adapta aquí el prompt al contexto de este vídeo…"
                  style={{...inputStyle,resize:"vertical",fontSize:12.5,lineHeight:1.55}}/>
                <div style={{fontSize:10.5,color:"var(--text-3)",marginTop:5}}>
                  Este prompt es solo para este vídeo. La plantilla original no se modifica.
                </div>
              </div>
            )}
            <textarea value={draft.description||""} onChange={e=>set("description",e.target.value)}
              onFocus={e=>{ if(!notesBig && (draft.description||"").length>40) setNotesBig(true); }}
              placeholder="Descripción que aparecerá en YouTube: hook, enlaces, hashtags, redes... Pulsa «Ampliar» para más espacio."
              style={{...inputStyle, minHeight: notesBig?280:90, lineHeight:1.6, transition:"min-height .25s"}}/>
            <div style={{textAlign:"right",fontSize:10.5,color:"var(--text-3)",marginTop:5}}>{(draft.description||"").length} caracteres</div>
          </div>

          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
              <span style={labelStyle}>Comentario fijado</span>
              <CopyMini text={draft.pinnedComment||""} what="el comentario"/>
            </div>
            <textarea value={draft.pinnedComment||""} onChange={e=>set("pinnedComment",e.target.value)}
              placeholder="Comentario que se publicará y fijará automáticamente cuando el vídeo se suba."
              style={{...inputStyle, minHeight:70, lineHeight:1.6}}/>
            <div style={{textAlign:"right",fontSize:10.5,color:"var(--text-3)",marginTop:5}}>{(draft.pinnedComment||"").length} caracteres</div>
          </div>

          </div>
          </div>
        </div>

        <div style={{padding:"16px 22px", borderTop:"1px solid var(--border)", display:"flex", flexDirection:"column", gap:12}}>
          {/* Fila 1: papelera + guardar */}
          <div style={{display:"flex", justifyContent:"space-between", gap:10, alignItems:"center", flexWrap:"wrap"}}>
            <button onClick={()=>{onDelete(draft.id); onClose();}} title="Mover a la papelera (tecla Supr)" style={{
              display:"flex",alignItems:"center",gap:7, color:"var(--red)", fontSize:13, fontWeight:600, padding:"10px 14px",
              border:"1px solid rgba(248,113,113,0.25)", borderRadius:10
            }}>{Icons.trash} Mover a papelera <span style={{fontSize:10.5,opacity:.7,marginLeft:2}} className="modal-hint"><kbd style={{borderColor:"rgba(248,113,113,0.3)"}}>Supr</kbd></span></button>
            <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
              {draft.youtubeId && ytIsConnected() && (
                <button onClick={aplicarEnYT} disabled={aplicando} title="Guarda aquí Y actualiza el título y la descripción del vídeo en YouTube" style={{
                  display:"flex",alignItems:"center",gap:7, color:"#FF0000", fontWeight:700, fontSize:13, padding:"10px 16px",
                  border:"1px solid rgba(255,0,0,0.4)", borderRadius:10, background:"rgba(255,0,0,0.06)", opacity:aplicando?0.6:1
                }}>
                  <span className={aplicando?"spinning":""} style={{display:"flex"}}>{aplicando?Icons.refresh:Icons.youtube}</span>
                  {aplicando?"Aplicando…":"Guardar y aplicar en YouTube"}
                </button>
              )}
              <button onClick={closeWithSave} className="grad-gold gold-glow" style={{
                color:"#000", fontWeight:700, fontSize:13.5, padding:"10px 26px", borderRadius:10, display:"flex", alignItems:"center", gap:8
              }}>{Icons.check} Guardar cambios</button>
            </div>
          </div>
          {/* Fila 2: subir a YouTube (solo, abajo, en rojo) o estado si ya está subido */}
          {draft.youtubeId ? (
            <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
              <a href={draft.youtubeUrl || ("https://youtu.be/"+draft.youtubeId)} target="_blank" rel="noopener" style={{
                flex:1,minWidth:180,display:"flex",alignItems:"center",justifyContent:"center",gap:8,fontSize:13.5,fontWeight:700,color:"var(--green)",padding:"12px 16px",
                border:"1px solid rgba(74,222,128,0.35)",borderRadius:11
              }}>{Icons.youtube} {draft.youtubeStatus==="scheduled"?"Programado · ver":"Ver en YouTube"}</a>
              <a href={"https://studio.youtube.com/video/"+draft.youtubeId+"/edit"} target="_blank" rel="noopener"
                title="Abre este vídeo en YouTube Studio: un clic para fijar el juego o el comentario" style={{
                flex:1,minWidth:180,display:"flex",alignItems:"center",justifyContent:"center",gap:8,fontSize:13.5,fontWeight:700,color:"var(--gold)",padding:"12px 16px",
                border:"1px solid var(--border-gold)",borderRadius:11
              }}>{Icons.edit} Fijar juego · YT Studio</a>
            </div>
          ) : (
            <button onClick={()=>{ onSave(draft); onUploadYouTube && onUploadYouTube(draft); }} title="Subir este vídeo a YouTube" style={{
              display:"flex",alignItems:"center",justifyContent:"center",gap:8,fontSize:14,fontWeight:700,color:"#fff",padding:"13px 16px",
              borderRadius:11,width:"100%",background:"#FF0000",transition:"filter .15s"
            }} onMouseEnter={e=>e.currentTarget.style.filter="brightness(1.1)"} onMouseLeave={e=>e.currentTarget.style.filter="none"}>
              {Icons.youtube} Subir a YouTube
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
export const inputStyle = {
  width:"100%", background:"var(--card)", border:"1px solid var(--border)", borderRadius:9,
  padding:"10px 12px", color:"var(--text)", fontSize:13.5, transition:"border-color .15s"
};
export const labelStyle = { fontSize:11.5, fontWeight:600, color:"var(--text-2)", textTransform:"uppercase", letterSpacing:".05em" };
export const Field = ({label, children}) => (
  <label style={{display:"flex",flexDirection:"column",gap:7}}>
    <span style={labelStyle}>{label}</span>{children}
  </label>
);

/* ============================ SUBIR A YOUTUBE ============================ */
/* ============================ SUBIR A YOUTUBE ============================ */
export function YouTubeUploadModal({ video, allVideos, tagTemplates, setTagTemplates, onClose, onDone, toast }) {
  const [connected, setConnected] = useState(ytIsConnected());
  const [searching, setSearching] = useState(false);
  const [driveFiles, setDriveFiles] = useState([]);
  const [selected, setSelected] = useState(null);
  const [searchError, setSearchError] = useState(null);
  // Búsqueda en Drive editable: por defecto el título del vídeo de la app
  const [driveQuery, setDriveQuery] = useState(video.title || "");

  const [title, setTitle] = useState(video.title || "");
  const [desc, setDesc] = useState(video.description || "");
  const [tags, setTags] = useState("");
  const [visibility, setVisibility] = useState("private");
  const [categoryId, setCategoryId] = useState("20");
  const [gameTitle, setGameTitle] = useState("");
  const [playlistId, setPlaylistId] = useState("");
  const [pinnedComment, setPinnedComment] = useState(video.pinnedComment || "");
  const initSched = video.date ? (video.date + "T" + (video.time||"22:00")) : "";
  const [scheduledAt, setScheduledAt] = useState(initSched);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");

  // ——— Vídeo desde el PC (solo en la app de escritorio) ———
  const esEscritorio = !!(typeof window!=="undefined" && window.studioFS && window.studioFS.ytUpload);
  const [carpetaLocal, setCarpetaLocal] = useState(()=>{ try { return localStorage.getItem("rds_video_folder")||""; } catch(e){ return ""; } });
  const [archivosLocales, setArchivosLocales] = useState([]); // candidatos que casan con el título
  const [selectedLocal, setSelectedLocal] = useState(null);   // {path,name,size}
  const [uploadPct, setUploadPct] = useState(null);

  // Buscar en la carpeta local archivos que se parezcan al título
  const buscarLocal = async (carpeta, titulo) => {
    if(!esEscritorio || !carpeta) return;
    try {
      const todos = await window.studioFS.scanVideos(carpeta);
      const norm = s => (s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9ñ ]+/g," ");
      const tokens = norm(titulo).split(/\s+/).filter(t=>t.length>2);
      const puntuados = todos.map(a=>{
        const n = norm(a.name.replace(/\.[^.]+$/,""));
        let puntos = 0;
        tokens.forEach(t=>{ if(n.includes(t)) puntos++; });
        return { ...a, puntos };
      }).filter(a=>a.puntos>0).sort((a,b)=> b.puntos-a.puntos || b.mtime-a.mtime).slice(0,8);
      // Si nada casa, ofrecer los 8 más recientes de la carpeta
      const lista = puntuados.length ? puntuados : todos.sort((a,b)=>b.mtime-a.mtime).slice(0,8);
      setArchivosLocales(lista);
      setSelectedLocal(puntuados.length ? puntuados[0] : null);
    } catch(e){ setArchivosLocales([]); }
  };
  const elegirCarpeta = async () => {
    const dir = await window.studioFS.pickFolder();
    if(dir){ setCarpetaLocal(dir); try { localStorage.setItem("rds_video_folder", dir); } catch(e){} buscarLocal(dir, title); }
  };
  const elegirArchivo = async () => {
    const p = await window.studioFS.pickVideo();
    if(p){ const nombre = p.split(/[\\/]/).pop(); setSelectedLocal({ path:p, name:nombre, size:0 }); }
  };
  useEffect(()=>{ if(esEscritorio && carpetaLocal) buscarLocal(carpetaLocal, video.title); // eslint-disable-next-line
  },[]);

  // Playlists y "copiar de otro vídeo"
  const [playlists, setPlaylists] = useState([]);
  const [myVideos, setMyVideos] = useState([]);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [copyFrom, setCopyFrom] = useState("");
  const [copyData, setCopyData] = useState(null); // datos del vídeo elegido para copiar
  const [copyFields, setCopyFields] = useState({ description:true, tags:true, category:true });
  const [showTagMgr, setShowTagMgr] = useState(false);
  const [newTplName, setNewTplName] = useState("");
  // IA (Gemini)
  const [aiKey, setAiKey] = useState(geminiGetKey());
  const [showAiKey, setShowAiKey] = useState(false);
  const [aiBusy, setAiBusy] = useState(null); // "desc" | "comment" | null

  // Buscar en Drive (usa el término editable)
  const runDriveSearch = async (term) => {
    setSearching(true); setSearchError(null);
    try {
      const files = await ytSearchDrive(term);
      setDriveFiles(files);
      const exact = files.find(f=> f.name === term || f.name.replace(/\.[^.]+$/,"") === term);
      setSelected(exact || files[0] || null);
    } catch(e){
      setSearchError(e.message); if(/caducada|conectar/i.test(e.message)) setConnected(false);
    } finally { setSearching(false); }
  };

  // Al abrir (si conectado): buscar en Drive + cargar playlists y mis vídeos
  useEffect(()=>{
    if(!connected) return;
    runDriveSearch(video.title);
    (async ()=>{
      setLoadingMeta(true);
      try {
        const [pls, vids] = await Promise.all([
          ytListPlaylists().catch(()=>[]),
          ytListMyVideos(15).catch(()=>[])
        ]);
        setPlaylists(pls); setMyVideos(vids);
      } finally { setLoadingMeta(false); }
    })();
  },[connected]);

  const handleConnect = () => {
    try { sessionStorage.setItem("rds_yt_pending", video.id); } catch(e){}
    ytStartAuth();
  };

  // Copiar datos (descripción, etiquetas, categoría) de un vídeo ya subido
  // Al elegir un vídeo, solo cargamos sus datos (no copiamos aún)
  const handleCopyFrom = async (vid) => {
    setCopyFrom(vid);
    setCopyData(null);
    if(!vid) return;
    setLoadingMeta(true);
    try {
      const d = await ytGetVideoDetails(vid);
      if(d) setCopyData(d);
    } catch(e){ toast("No se pudieron leer los datos: "+e.message); }
    finally { setLoadingMeta(false); }
  };
  // Copiar solo los campos marcados
  const applyCopy = () => {
    if(!copyData) return;
    let n = 0;
    if(copyFields.description && copyData.description){ setDesc(copyData.description); n++; }
    if(copyFields.tags && copyData.tags?.length){ setTags(copyData.tags.join(", ")); n++; }
    if(copyFields.category && copyData.categoryId){ setCategoryId(copyData.categoryId); n++; }
    toast(n>0 ? "Datos copiados ("+n+")" : "No marcaste ningún campo");
  };

  // Aplicar una plantilla de etiquetas (añade sin duplicar)
  const applyTagTemplate = (tpl) => {
    const current = tags.split(",").map(s=>s.trim()).filter(Boolean);
    const merged = [...current];
    tpl.tags.forEach(t=>{ if(!merged.some(x=>x.toLowerCase()===t.toLowerCase())) merged.push(t); });
    setTags(merged.join(", "));
  };
  // Guardar las etiquetas actuales como plantilla nueva
  const saveTagTemplate = () => {
    const name = newTplName.trim();
    const list = tags.split(",").map(s=>s.trim()).filter(Boolean);
    if(!name){ toast("Ponle un nombre a la plantilla"); return; }
    if(list.length===0){ toast("No hay etiquetas que guardar"); return; }
    setTagTemplates(prev=>[...(prev||[]).filter(t=>t.name!==name), { id:"tpl_"+Date.now(), name, tags:list }]);
    setNewTplName(""); toast("Plantilla «"+name+"» guardada");
  };
  const deleteTagTemplate = (id) => setTagTemplates(prev=>(prev||[]).filter(t=>t.id!==id));

  // ——— Generación con IA (Gemini) ———
  const saveAiKey = () => { geminiSaveKey(aiKey.trim()); toast(aiKey.trim()?"Clave de Gemini guardada":"Clave borrada"); setShowAiKey(false); };
  const genDescription = async () => {
    if(!geminiHasKey()){ setShowAiKey(true); toast("Añade tu clave gratuita de Gemini"); return; }
    setAiBusy("desc");
    try {
      const prompt = `Eres un experto en YouTube. Escribe una descripción atractiva y optimizada para SEO en español para un vídeo de YouTube titulado "${title}".`
        + (gameTitle?` El vídeo trata sobre el juego ${gameTitle}.`:"")
        + (tags?` Palabras clave relacionadas: ${tags}.`:"")
        + ` La descripción debe tener 2-3 párrafos cortos, un gancho al principio, y terminar con 3-5 hashtags relevantes. No uses markdown ni asteriscos. Devuelve solo la descripción, sin explicaciones.`;
      const out = await geminiGenerate(prompt);
      setDesc(out);
      toast("Descripción generada con IA");
    } catch(e){ toast("❌ "+e.message); if(/clave/i.test(e.message)) setShowAiKey(true); }
    finally { setAiBusy(null); }
  };
  const genComment = async () => {
    if(!geminiHasKey()){ setShowAiKey(true); toast("Añade tu clave gratuita de Gemini"); return; }
    setAiBusy("comment");
    try {
      const prompt = `Eres un creador de YouTube. Escribe un comentario fijado breve, cercano y que invite a la interacción (preguntar algo o pedir opinión) en español para tu vídeo titulado "${title}".`
        + (gameTitle?` Es un vídeo de ${gameTitle}.`:"")
        + ` Máximo 2 frases. Puedes usar 1-2 emojis. Devuelve solo el comentario.`;
      const out = await geminiGenerate(prompt);
      setPinnedComment(out);
      toast("Comentario generado con IA");
    } catch(e){ toast("❌ "+e.message); if(/clave/i.test(e.message)) setShowAiKey(true); }
    finally { setAiBusy(null); }
  };

  const handleUpload = async () => {
    const usaLocal = esEscritorio && selectedLocal;
    if(!usaLocal && !selected){ toast("Selecciona un archivo (del PC o de Drive)"); return; }
    if(!title.trim()){ toast("El título no puede estar vacío"); return; }
    await ytEnsureToken();
    const tok = ytGetTokens();
    if(!tok || !tok.access_token){ toast("Conecta con Google primero"); setConnected(false); return; }
    setUploading(true);
    try {
      // La descripción final incluye el título del juego si se indicó
      let finalDesc = desc;
      const schedIso = scheduledAt ? new Date(scheduledAt).toISOString() : null;

      if(usaLocal){
        // ——— SUBIDA DIRECTA DESDE EL PC (sin Drive y sin servidor) ———
        const juego = gameTitle.trim() || null;
        let tagsFinal = tags.split(",").map(s=>s.trim()).filter(Boolean);
        if(juego){
          if(!tagsFinal.some(t=>t.toLowerCase()===juego.toLowerCase())) tagsFinal.unshift(juego);
          if(!finalDesc.toLowerCase().includes(juego.toLowerCase())) finalDesc = (finalDesc?finalDesc+"\n\n":"")+"🎮 "+juego;
        }
        const status = { selfDeclaredMadeForKids:false };
        if(schedIso){ status.privacyStatus = "private"; status.publishAt = schedIso; }
        else status.privacyStatus = visibility;
        setUploadPct(0); setProgress("Subiendo desde tu PC a YouTube…");
        const off = window.studioFS.onUploadProgress(d=>setUploadPct(d.pct));
        let resultado;
        try {
          resultado = await window.studioFS.ytUpload({
            filePath: selectedLocal.path,
            token: tok.access_token,
            meta: { snippet: { title: title.trim(), description: finalDesc, tags: tagsFinal, categoryId }, status }
          });
        } finally { if(off) off(); setUploadPct(null); }
        const videoId = resultado.videoId;
        // Lista de reproducción y comentario (lo que antes hacía el servidor)
        let commentOk = false;
        if(playlistId){ try { await ytAddToPlaylist(playlistId, videoId); } catch(e){ toast("⚠ Subido, pero no se pudo añadir a la lista: "+e.message); } }
        if(pinnedComment.trim() && !schedIso && visibility==="public"){
          try { await ytPostComment(videoId, pinnedComment.trim()); commentOk = true; } catch(e){}
        }
        toast("✅ Vídeo " + (schedIso?"programado":"subido") + " en YouTube");
        onDone && onDone({
          youtubeId: videoId,
          youtubeStatus: schedIso ? "scheduled" : "uploaded",
          youtubeUrl: "https://youtu.be/"+videoId,
          status: schedIso ? "programado" : (visibility==="public" ? "publicado" : "programado"),
          description: desc,
          pinnedComment: pinnedComment,
          pinnedCommentPosted: commentOk
        });
        onClose();
        return;
      }

      // ——— VÍA DRIVE + SERVIDOR (web, o si no elegiste archivo del PC) ———
      setProgress("Enviando al servidor…");
      const payload = {
        accessToken: tok.access_token,
        driveFileId: selected.id,
        videoTitle: title.trim(),
        videoDesc: finalDesc,
        tags: tags.split(",").map(s=>s.trim()).filter(Boolean),
        visibility,
        categoryId,
        gameTitle: gameTitle.trim() || null,
        playlistId: playlistId || null,
        pinnedComment: pinnedComment.trim() || null,
        scheduledAt: schedIso
      };
      setProgress("Descargando de Drive y subiendo a YouTube… (puede tardar)");
      const result = await ytUploadViaBackend(payload);
      toast("✅ Vídeo " + (scheduledAt?"programado":"subido") + " en YouTube");
      onDone && onDone({
        youtubeId: result.videoId,
        youtubeStatus: scheduledAt ? "scheduled" : "uploaded",
        youtubeUrl: result.youtubeUrl || ("https://youtu.be/"+result.videoId),
        status: scheduledAt ? "programado" : (visibility==="public" ? "publicado" : "programado"),
        description: desc,
        pinnedComment: pinnedComment,
        // Si el backend ya publicó el comentario (vídeo público al subir), no repetirlo después.
        // Si es programado, el backend no puede comentarlo aún → la app lo hará al publicarse.
        pinnedCommentPosted: !!result.commentOk
      });
      onClose();
    } catch(e){
      toast("❌ " + e.message);
      setProgress("");
    } finally {
      setUploading(false); setUploadPct(null);
    }
  };

  const overlay = { position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",backdropFilter:"blur(3px)",display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"4vh 16px",zIndex:200,overflowY:"auto" };
  const panel = { background:"var(--bg-2)",border:"1px solid var(--border)",borderRadius:16,width:"100%",maxWidth:560,padding:22 };

  return (
    <div style={overlay}>
      <div className="yt-modal-panel" style={panel} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
          <span style={{color:"#FF0000",display:"flex"}}>{Icons.youtube}</span>
          <h3 style={{fontSize:17,fontWeight:700,flex:1}}>Subir a YouTube</h3>
          <button onClick={onClose} style={{color:"var(--text-3)",display:"flex",padding:4}}>{Icons.x}</button>
        </div>

        {!connected ? (
          <div style={{textAlign:"center",padding:"20px 0"}}>
            <p style={{fontSize:13.5,color:"var(--text-2)",marginBottom:16,lineHeight:1.5}}>
              Conecta tu cuenta de Google para buscar el vídeo en Drive y subirlo a YouTube.
            </p>
            <button onClick={handleConnect} className="grad-gold" style={{display:"inline-flex",alignItems:"center",gap:9,color:"#000",fontWeight:700,fontSize:14,padding:"12px 20px",borderRadius:11}}>
              {Icons.link} Conectar con Google
            </button>
          </div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            {/* ——— Vídeo desde tu PC (app de escritorio): subida directa, sin Drive ——— */}
            {esEscritorio && (
              <div style={{padding:13,background:"var(--card)",borderRadius:11,border:"1px solid var(--border-gold)"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginBottom:8,flexWrap:"wrap"}}>
                  <span style={{...labelStyle, color:"var(--gold)"}}>Vídeo desde tu PC (recomendado)</span>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={elegirCarpeta} style={{fontSize:11,fontWeight:600,color:"var(--text-2)",border:"1px solid var(--border)",borderRadius:7,padding:"4px 9px"}}>
                      {carpetaLocal?"Cambiar carpeta":"Elegir carpeta"}
                    </button>
                    <button onClick={elegirArchivo} style={{fontSize:11,fontWeight:600,color:"var(--text-2)",border:"1px solid var(--border)",borderRadius:7,padding:"4px 9px"}}>Elegir archivo…</button>
                  </div>
                </div>
                {!carpetaLocal && !selectedLocal && (
                  <div style={{fontSize:11.5,color:"var(--text-3)",lineHeight:1.5}}>Elige tu carpeta de vídeos y la app encontrará sola el archivo que corresponde a cada título. La subida va directa de tu PC a YouTube, sin pasar por Drive.</div>
                )}
                {carpetaLocal && (
                  <div style={{fontSize:10.5,color:"var(--text-3)",marginBottom:7,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={carpetaLocal}>📁 {carpetaLocal}</div>
                )}
                {archivosLocales.length>0 && (
                  <select value={selectedLocal?.path||""} onChange={e=>setSelectedLocal(archivosLocales.find(a=>a.path===e.target.value)||null)} style={{...inputStyle,fontSize:12.5,padding:"8px 10px"}}>
                    <option value="">— No usar archivo del PC —</option>
                    {archivosLocales.map(a=>(
                      <option key={a.path} value={a.path}>{a.name}{a.size?` · ${(a.size/1048576).toFixed(0)} MB`:""}</option>
                    ))}
                  </select>
                )}
                {selectedLocal && <div style={{marginTop:6,fontSize:11.5,color:"var(--green)"}}>✅ {selectedLocal.name} — se subirá directo desde tu PC</div>}
              </div>
            )}

            {/* Búsqueda en Drive (editable) */}
            <div style={{opacity: selectedLocal?0.55:1}}>
              <span style={labelStyle}>{esEscritorio?"O buscar en Drive (alternativa)":"Buscar vídeo en Drive"}</span>
              <div style={{display:"flex",gap:7,marginTop:7}}>
                <input value={driveQuery} onChange={e=>setDriveQuery(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")runDriveSearch(driveQuery);}}
                  placeholder="Nombre del archivo en Drive" style={{...inputStyle,flex:1}}/>
                <button onClick={()=>runDriveSearch(driveQuery)} title="Buscar" style={{flexShrink:0,padding:"0 14px",borderRadius:9,border:"1px solid var(--border-gold)",color:"var(--gold)",background:"rgba(212,175,55,0.05)"}}>{Icons.search||"Buscar"}</button>
              </div>
              {searching ? (
                <div style={{marginTop:7,padding:"10px 13px",background:"var(--card)",borderRadius:9,fontSize:12.5,color:"var(--text-3)",display:"flex",alignItems:"center",gap:9}}>
                  <span className="spinning" style={{display:"flex"}}>{Icons.refresh}</span> Buscando en tu Drive…
                </div>
              ) : searchError ? (
                <div style={{marginTop:7,padding:"10px 13px",background:"rgba(248,113,113,0.1)",borderRadius:9,fontSize:12.5,color:"var(--red)"}}>
                  {searchError}
                  <button onClick={handleConnect} style={{display:"block",marginTop:8,color:"var(--gold)",fontWeight:600,fontSize:12.5}}>Reconectar con Google</button>
                </div>
              ) : driveFiles.length === 0 ? (
                <div style={{marginTop:7,padding:"10px 13px",background:"rgba(248,113,113,0.08)",borderRadius:9,fontSize:12.5,color:"var(--text-2)"}}>
                  No encontré «{driveQuery}» en tu Drive. Prueba a cambiar el término de búsqueda.
                </div>
              ) : (
                <>
                  <select value={selected?.id||""} onChange={e=>setSelected(driveFiles.find(f=>f.id===e.target.value))} style={{...inputStyle, marginTop:7}}>
                    {driveFiles.map(f=>(
                      <option key={f.id} value={f.id}>{f.name}{f.size?` · ${(f.size/1048576).toFixed(0)} MB`:""}</option>
                    ))}
                  </select>
                  {selected && <div style={{marginTop:6,fontSize:11.5,color:"var(--green)"}}>✅ {selected.name}</div>}
                </>
              )}
            </div>

            {/* Copiar datos de otro vídeo ya subido */}
            <div>
              <span style={labelStyle}>Copiar datos de otro vídeo (opcional)</span>
              <select value={copyFrom} onChange={e=>handleCopyFrom(e.target.value)} style={{...inputStyle, marginTop:7}} disabled={loadingMeta}>
                <option value="">— Rellenar manualmente —</option>
                {myVideos.map(v=><option key={v.id} value={v.id}>{v.title}</option>)}
              </select>
              {copyFrom && copyData && (
                <div className="fade-in" style={{marginTop:9,padding:12,background:"var(--card)",borderRadius:10,border:"1px solid var(--border)"}}>
                  <div style={{fontSize:11.5,color:"var(--text-2)",marginBottom:9,fontWeight:600}}>Elige qué copiar:</div>
                  <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:11}}>
                    {[
                      {k:"description", label:"Descripción", preview:(copyData.description||"").slice(0,50)||"(vacía)"},
                      {k:"tags", label:"Etiquetas", preview:copyData.tags?.length?copyData.tags.slice(0,4).join(", ")+(copyData.tags.length>4?"…":""):"(ninguna)"},
                      {k:"category", label:"Categoría", preview:(YT_CATEGORIES.find(c=>c.id===copyData.categoryId)?.label)||copyData.categoryId}
                    ].map(row=>(
                      <label key={row.k} style={{display:"flex",alignItems:"flex-start",gap:9,cursor:"pointer"}}>
                        <input type="checkbox" checked={copyFields[row.k]} onChange={e=>setCopyFields(f=>({...f,[row.k]:e.target.checked}))} style={{marginTop:2,accentColor:"var(--gold)"}}/>
                        <div style={{minWidth:0}}>
                          <div style={{fontSize:12.5,color:"var(--text)",fontWeight:600}}>{row.label}</div>
                          <div style={{fontSize:11,color:"var(--text-3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{row.preview}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                  <button onClick={applyCopy} className="grad-gold" style={{color:"#000",fontWeight:700,fontSize:12.5,padding:"8px 14px",borderRadius:8,width:"100%"}}>Copiar lo seleccionado</button>
                </div>
              )}
              {copyFrom && loadingMeta && <div style={{fontSize:11.5,color:"var(--text-3)",marginTop:7,display:"flex",alignItems:"center",gap:7}}><span className="spinning" style={{display:"flex"}}>{Icons.refresh}</span> Leyendo datos del vídeo…</div>}
              {!copyFrom && <div style={{fontSize:11,color:"var(--text-3)",marginTop:5}}>Copia por separado la descripción, etiquetas o categoría de un vídeo tuyo ya publicado.</div>}
            </div>

            <Field label="Título en YouTube">
              <input value={title} onChange={e=>setTitle(e.target.value)} style={inputStyle}/>
            </Field>

            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
                <span style={labelStyle}>Descripción</span>
                <button onClick={genDescription} disabled={aiBusy==="desc"} title="Generar con IA (Gemini)" style={{
                  display:"flex",alignItems:"center",gap:6,fontSize:11.5,fontWeight:600,color:"var(--gold)",padding:"4px 10px",
                  border:"1px solid var(--border-gold)",borderRadius:7,background:"rgba(212,175,55,0.05)",opacity:aiBusy==="desc"?0.6:1
                }}>
                  <span className={aiBusy==="desc"?"spinning":""} style={{display:"flex"}}>{Icons.sparkles}</span>
                  {aiBusy==="desc"?"Generando…":"Generar con IA"}
                </button>
              </div>
              <textarea value={desc} onChange={e=>setDesc(e.target.value)} rows={4} style={{...inputStyle, resize:"vertical"}}/>
            </div>

            {/* Etiquetas + plantillas */}
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
                <span style={labelStyle}>Etiquetas (separadas por comas)</span>
                <button onClick={()=>setShowTagMgr(s=>!s)} style={{fontSize:11.5,color:"var(--gold)",fontWeight:600,display:"flex",alignItems:"center",gap:5}}>
                  {Icons.tag||null} Plantillas
                </button>
              </div>
              <input value={tags} onChange={e=>setTags(e.target.value)} placeholder="gaming, tutorial, shorts" style={inputStyle}/>
              {(tagTemplates||[]).length>0 && (
                <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:8}}>
                  {(tagTemplates||[]).map(tpl=>(
                    <button key={tpl.id} onClick={()=>applyTagTemplate(tpl)} title={tpl.tags.join(", ")} style={{
                      fontSize:11.5,padding:"5px 10px",borderRadius:20,border:"1px solid var(--border-gold)",
                      color:"var(--gold)",background:"rgba(212,175,55,0.05)"
                    }}>+ {tpl.name}</button>
                  ))}
                </div>
              )}
              {showTagMgr && (
                <div className="fade-in" style={{marginTop:10,padding:12,background:"var(--card)",borderRadius:10,border:"1px solid var(--border)"}}>
                  <div style={{fontSize:12,color:"var(--text-2)",marginBottom:8,fontWeight:600}}>Gestionar plantillas de etiquetas</div>
                  <div style={{display:"flex",gap:7,marginBottom:10}}>
                    <input value={newTplName} onChange={e=>setNewTplName(e.target.value)} placeholder="Nombre (p.ej. Roblox)" style={{...inputStyle,flex:1,fontSize:12.5,padding:"8px 10px"}}/>
                    <button onClick={saveTagTemplate} className="grad-gold" style={{flexShrink:0,color:"#000",fontWeight:700,fontSize:12,padding:"8px 12px",borderRadius:8}}>Guardar actuales</button>
                  </div>
                  {(tagTemplates||[]).length===0 ? (
                    <div style={{fontSize:11.5,color:"var(--text-3)"}}>Aún no tienes plantillas. Escribe etiquetas arriba y pulsa «Guardar actuales».</div>
                  ) : (
                    <div style={{display:"flex",flexDirection:"column",gap:6}}>
                      {(tagTemplates||[]).map(tpl=>(
                        <div key={tpl.id} style={{display:"flex",alignItems:"center",gap:8,fontSize:12}}>
                          <span style={{fontWeight:600,color:"var(--text)"}}>{tpl.name}</span>
                          <span style={{flex:1,color:"var(--text-3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tpl.tags.join(", ")}</span>
                          <button onClick={()=>deleteTagTemplate(tpl.id)} style={{color:"var(--text-3)",display:"flex",padding:3}} onMouseEnter={e=>e.currentTarget.style.color="var(--red)"} onMouseLeave={e=>e.currentTarget.style.color="var(--text-3)"}>{Icons.trash}</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Categoría + juego */}
            <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:150}}>
                <Field label="Categoría">
                  <select value={categoryId} onChange={e=>setCategoryId(e.target.value)} style={inputStyle}>
                    {YT_CATEGORIES.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </Field>
              </div>
              {categoryId==="20" && (
                <div style={{flex:1,minWidth:150}}>
                  <Field label="Título del juego">
                    <input value={gameTitle} onChange={e=>setGameTitle(e.target.value)} placeholder="p.ej. Roblox" style={inputStyle}/>
                  </Field>
                </div>
              )}
            </div>
            {categoryId==="20" && gameTitle && (
              <div style={{fontSize:11,color:"var(--text-3)",marginTop:-6,lineHeight:1.5}}>
                YouTube no permite fijar el juego por API como en Studio, así que lo añadimos como etiqueta y a la descripción para que YouTube lo detecte y lo asocie automáticamente. Si no aparece, podrás fijarlo en un segundo desde YouTube Studio.
              </div>
            )}

            {/* Lista de reproducción */}
            <Field label="Lista de reproducción (opcional)">
              <select value={playlistId} onChange={e=>setPlaylistId(e.target.value)} style={inputStyle} disabled={loadingMeta}>
                <option value="">— Ninguna —</option>
                {playlists.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </Field>

            {/* Comentario fijado */}
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
                <span style={labelStyle}>Comentario fijado (opcional)</span>
                <button onClick={genComment} disabled={aiBusy==="comment"} title="Generar con IA (Gemini)" style={{
                  display:"flex",alignItems:"center",gap:6,fontSize:11.5,fontWeight:600,color:"var(--gold)",padding:"4px 10px",
                  border:"1px solid var(--border-gold)",borderRadius:7,background:"rgba(212,175,55,0.05)",opacity:aiBusy==="comment"?0.6:1
                }}>
                  <span className={aiBusy==="comment"?"spinning":""} style={{display:"flex"}}>{Icons.sparkles}</span>
                  {aiBusy==="comment"?"Generando…":"Generar con IA"}
                </button>
              </div>
              <textarea value={pinnedComment} onChange={e=>setPinnedComment(e.target.value)} rows={2} placeholder="Se publicará y fijará al subir el vídeo" style={{...inputStyle, resize:"vertical"}}/>
            </div>

            {/* Gestor de clave de Gemini */}
            {showAiKey && (
              <div className="fade-in" style={{padding:14,background:"var(--card)",borderRadius:11,border:"1px solid var(--border-gold)"}}>
                <div style={{fontSize:12.5,fontWeight:600,color:"var(--text)",marginBottom:6}}>Clave de Gemini (IA gratuita)</div>
                <div style={{fontSize:11.5,color:"var(--text-3)",marginBottom:10,lineHeight:1.5}}>
                  Consíguela gratis en <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" style={{color:"var(--gold)"}}>aistudio.google.com/apikey</a> (sin tarjeta). Se guarda solo en este dispositivo.
                </div>
                <div style={{display:"flex",gap:7}}>
                  <input type="password" value={aiKey} onChange={e=>setAiKey(e.target.value)} placeholder="AIza…" style={{...inputStyle,flex:1,fontSize:12.5,padding:"8px 10px"}}/>
                  <button onClick={saveAiKey} className="grad-gold" style={{flexShrink:0,color:"#000",fontWeight:700,fontSize:12.5,padding:"8px 14px",borderRadius:8}}>Guardar</button>
                </div>
              </div>
            )}
            {!showAiKey && (
              <button onClick={()=>setShowAiKey(true)} style={{alignSelf:"flex-start",fontSize:11.5,color:"var(--text-3)",display:"flex",alignItems:"center",gap:5,marginTop:-6}}>
                {Icons.sparkles} {geminiHasKey()?"Cambiar clave de IA":"Configurar IA (Gemini gratis)"}
              </button>
            )}

            {/* Visibilidad + programación */}
            <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:150}}>
                <Field label="Visibilidad">
                  <select value={visibility} onChange={e=>setVisibility(e.target.value)} style={inputStyle}>
                    <option value="private">Privado</option>
                    <option value="unlisted">No listado</option>
                    <option value="public">Público</option>
                  </select>
                </Field>
              </div>
              <div style={{flex:1,minWidth:170}}>
                <Field label="Programar publicación">
                  <input type="datetime-local" value={scheduledAt} onChange={e=>setScheduledAt(e.target.value)} style={inputStyle}/>
                </Field>
              </div>
            </div>
            {scheduledAt && (
              <div style={{fontSize:11.5,color:"var(--text-3)",marginTop:-6}}>
                Para programar, YouTube sube el vídeo como privado y lo publica automáticamente a la hora indicada.
              </div>
            )}

            {progress && (
              <div style={{padding:"10px 12px",background:"var(--card)",borderRadius:9,fontSize:12.5,color:"var(--gold)"}}>
                <div style={{display:"flex",alignItems:"center",gap:9}}>
                  <span className="spinning" style={{display:"flex"}}>{Icons.refresh}</span> {progress}{uploadPct!=null?` ${uploadPct}%`:""}
                </div>
                {uploadPct!=null && (
                  <div style={{height:6,background:"var(--bg-2)",borderRadius:6,overflow:"hidden",marginTop:8}}>
                    <div style={{height:"100%",width:uploadPct+"%",background:"linear-gradient(90deg,#D4AF37,#FFD700)",transition:"width .3s",borderRadius:6}}/>
                  </div>
                )}
              </div>
            )}

            <div style={{display:"flex",gap:10,marginTop:4}}>
              <button onClick={onClose} style={{flex:"0 0 auto",padding:"11px 16px",borderRadius:10,border:"1px solid var(--border)",color:"var(--text-2)",fontSize:13.5,fontWeight:600}}>Cancelar</button>
              <button onClick={handleUpload} disabled={uploading || (!selected && !selectedLocal)} style={{flex:1,padding:"11px 16px",borderRadius:10,color:"#fff",fontWeight:700,fontSize:14,background:"#FF0000",opacity:(uploading||(!selected&&!selectedLocal))?0.6:1}}>
                {uploading ? "Subiendo…" : (scheduledAt ? "Subir y programar" : "Subir ahora")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


/* ============================ GESTOR DE FORMATOS ============================ */