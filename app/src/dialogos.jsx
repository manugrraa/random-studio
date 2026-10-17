import React from "react";
const { useState, useEffect, useRef, useMemo, useCallback } = React;
import { Icons } from "./base";
import { inputStyle, labelStyle } from "./videos";

export function ConfirmDialog({ open, title, message, confirmLabel="Eliminar", danger=true, onConfirm, onCancel }) {
  useEffect(()=>{
    if(!open) return;
    const h = e => {
      if(e.key==="Escape") onCancel();
      if(e.key==="Enter") onConfirm();
    };
    window.addEventListener("keydown",h);
    return ()=>window.removeEventListener("keydown",h);
  },[open]);
  if(!open) return null;
  return (
    <div onClick={onCancel} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:1100,display:"flex",alignItems:"center",justifyContent:"center",padding:"16px",backdropFilter:"blur(3px)"}}>
      <div onClick={e=>e.stopPropagation()} className="pop" style={{
        background:"var(--bg-2)", border:`1px solid ${danger?"rgba(248,113,113,0.3)":"var(--border-gold)"}`, borderRadius:18, width:"100%", maxWidth:420,
        boxShadow:"0 20px 70px rgba(0,0,0,0.7)", padding:"26px 24px"
      }}>
        <div style={{display:"flex",alignItems:"center",gap:13,marginBottom:14}}>
          <div style={{width:42,height:42,borderRadius:11,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",
            background: danger?"rgba(248,113,113,0.1)":"rgba(212,175,55,0.1)", color: danger?"var(--red)":"var(--gold)"}}>
            {Icons.trashBig}
          </div>
          <h3 style={{fontSize:17,fontWeight:700,color:"var(--text)"}}>{title}</h3>
        </div>
        <p style={{fontSize:13.5,color:"var(--text-2)",lineHeight:1.6,marginBottom:22}}>{message}</p>
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <button onClick={onCancel} style={{
            fontSize:13.5,fontWeight:600,color:"var(--text-2)",padding:"10px 18px",borderRadius:10,
            border:"1px solid var(--border)",transition:"all .15s"
          }} onMouseEnter={e=>{e.currentTarget.style.color="var(--text)";e.currentTarget.style.borderColor="var(--text-3)";}}
             onMouseLeave={e=>{e.currentTarget.style.color="var(--text-2)";e.currentTarget.style.borderColor="var(--border)";}}>Cancelar</button>
          <button onClick={onConfirm} style={{
            fontSize:13.5,fontWeight:700,padding:"10px 20px",borderRadius:10,display:"flex",alignItems:"center",gap:7,
            background: danger?"var(--red)":"linear-gradient(135deg,#FFD700,#D4AF37)", color: danger?"#fff":"#000"
          }}>{Icons.trash} {confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

/* ============================ MODAL DE SINCRONIZACIÓN ============================ */
export function SyncModal({ syncCode, status, syncMode, setSyncMode, pendingChanges, onClose, onLink, onExport, onImport, onSyncNow, syncing, toast }) {
  const [copied, setCopied] = useState(false);
  const [input, setInput] = useState("");
  const [showLink, setShowLink] = useState(false);
  const fileRef = useRef(null);

  useEffect(()=>{
    const h = e => { if(e.key==="Escape") onClose(); };
    window.addEventListener("keydown",h); return ()=>window.removeEventListener("keydown",h);
  },[]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(syncCode); setCopied(true); setTimeout(()=>setCopied(false),1800); }
    catch(e){ toast("No se pudo copiar. Selecciona y copia manualmente."); }
  };

  const statusInfo = {
    connecting: { label:"Conectando…", color:"var(--text-2)" },
    online:     { label:"Sincronizado", color:"var(--green)" },
    saving:     { label:"Guardando…", color:"var(--gold)" },
    offline:    { label:"Sin conexión (se guardará localmente)", color:"var(--orange)" },
  }[status] || { label:"—", color:"var(--text-3)" };

  return (
    <div className="modal-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.78)",zIndex:1000,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"7vh 16px",overflowY:"auto",backdropFilter:"blur(3px)"}}>
      <div onClick={e=>e.stopPropagation()} className="pop" style={{background:"var(--bg-2)",border:"1px solid var(--border-gold)",borderRadius:18,width:"100%",maxWidth:480,boxShadow:"0 20px 70px rgba(0,0,0,0.7)"}}>
        <div style={{padding:"18px 22px",borderBottom:"1px solid var(--border)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{color:"var(--gold)",display:"flex"}}>{Icons.cloud}</span>
            <span style={{fontSize:14.5,fontWeight:700}}>Sincronización entre dispositivos</span>
          </div>
          <button onClick={onClose} style={{color:"var(--text-2)",display:"flex"}}>{Icons.x}</button>
        </div>

        <div style={{padding:22, display:"flex", flexDirection:"column", gap:18}}>
          {/* Estado */}
          <div style={{display:"flex",alignItems:"center",gap:9,padding:"11px 14px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:11}}>
            <span style={{width:9,height:9,borderRadius:"50%",background:statusInfo.color,boxShadow:`0 0 8px ${statusInfo.color}`,flexShrink:0}}/>
            <span style={{fontSize:13,fontWeight:600,color:statusInfo.color,flex:1}}>{statusInfo.label}</span>
            <button onClick={onSyncNow} disabled={syncing} style={{
              display:"flex",alignItems:"center",gap:6,fontSize:12,fontWeight:700,color:"var(--gold)",
              border:"1px solid var(--border-gold)",borderRadius:8,padding:"6px 11px",background:"rgba(212,175,55,0.06)",flexShrink:0
            }}>
              <span className={syncing?"spinning":""} style={{display:"flex"}}>{Icons.refresh}</span>
              {syncing?"Sincronizando…":"Sincronizar ahora"}
            </button>
          </div>

          {/* Modo de sincronización: automático vs manual */}
          <div>
            <div style={{...labelStyle,marginBottom:8}}>Modo de sincronización</div>
            <div style={{display:"flex",gap:8,background:"var(--card)",borderRadius:11,padding:4,border:"1px solid var(--border)"}}>
              <button onClick={()=>setSyncMode("auto")} style={{
                flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"10px 8px",borderRadius:8,transition:"all .15s",
                background: syncMode==="auto"?"linear-gradient(135deg,rgba(212,175,55,0.18),rgba(212,175,55,0.08))":"transparent",
                color: syncMode==="auto"?"var(--gold)":"var(--text-2)",
                boxShadow: syncMode==="auto"?"0 0 0 1px rgba(212,175,55,0.25)":"none"
              }}>
                <span style={{fontSize:13,fontWeight:700}}>Automática</span>
                <span style={{fontSize:10.5,color:"var(--text-3)",textAlign:"center",lineHeight:1.4}}>Sube y baja sola, en tiempo real</span>
              </button>
              <button onClick={()=>setSyncMode("manual")} style={{
                flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"10px 8px",borderRadius:8,transition:"all .15s",
                background: syncMode==="manual"?"linear-gradient(135deg,rgba(212,175,55,0.18),rgba(212,175,55,0.08))":"transparent",
                color: syncMode==="manual"?"var(--gold)":"var(--text-2)",
                boxShadow: syncMode==="manual"?"0 0 0 1px rgba(212,175,55,0.25)":"none"
              }}>
                <span style={{fontSize:13,fontWeight:700}}>Manual</span>
                <span style={{fontSize:10.5,color:"var(--text-3)",textAlign:"center",lineHeight:1.4}}>Solo cuando pulses «Sincronizar»</span>
              </button>
            </div>
            <p style={{fontSize:11.5,color:"var(--text-3)",lineHeight:1.5,marginTop:9}}>
              {syncMode==="manual"
                ? "Modo manual: tus cambios se guardan en este dispositivo y solo se suben a la nube cuando pulsas «Sincronizar ahora». Ideal para no sobrecargar el servidor."
                : "Modo automático: los cambios se suben y bajan solos entre tus dispositivos. Recomendado para el día a día."}
              {syncMode==="manual" && pendingChanges && <span style={{color:"var(--gold)",fontWeight:600}}> · Tienes cambios sin subir.</span>}
            </p>
          </div>

          {/* Código de sincronización */}
          <div>
            <div style={{...labelStyle,marginBottom:8}}>Tu código de sincronización</div>
            <p style={{fontSize:12.5,color:"var(--text-2)",lineHeight:1.6,marginBottom:11}}>
              Este código identifica tus datos en la nube. Para sincronizar otro dispositivo (tu iPhone), ábrelo ahí y pega este mismo código en «Vincular con otro código».
            </p>
            <div style={{display:"flex",gap:9,alignItems:"center"}}>
              <input readOnly value={syncCode} onFocus={e=>e.target.select()} style={{...inputStyle, fontFamily:"monospace", fontSize:12.5, letterSpacing:".02em"}}/>
              <button onClick={copy} className={copied?"":"grad-gold"} style={{
                flexShrink:0, display:"flex",alignItems:"center",gap:7, fontWeight:700,fontSize:13, padding:"10px 15px", borderRadius:9,
                background: copied?"rgba(74,222,128,0.12)":undefined, color: copied?"var(--green)":"#000",
                border: copied?"1px solid rgba(74,222,128,0.3)":"none"
              }}>{copied?Icons.check:Icons.copy}{copied?"Copiado":"Copiar"}</button>
            </div>
          </div>

          <div style={{height:1,background:"var(--border)"}}/>

          {/* Vincular con otro código */}
          {!showLink ? (
            <button onClick={()=>setShowLink(true)} style={{
              display:"flex",alignItems:"center",justifyContent:"center",gap:8,fontSize:13,fontWeight:600,color:"var(--gold)",
              border:"1px solid var(--border-gold)",borderRadius:10,padding:"11px",background:"rgba(212,175,55,0.05)",transition:"all .15s"
            }} onMouseEnter={e=>e.currentTarget.style.background="rgba(212,175,55,0.12)"}
               onMouseLeave={e=>e.currentTarget.style.background="rgba(212,175,55,0.05)"}>
              {Icons.link} Vincular con otro código
            </button>
          ) : (
            <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:11,padding:14}}>
              <div style={{...labelStyle,marginBottom:8}}>Vincular este dispositivo</div>
              <p style={{fontSize:12,color:"var(--text-2)",lineHeight:1.55,marginBottom:11}}>
                Pega el código del dispositivo con el que quieras sincronizar. Se descargarán esos datos y este dispositivo quedará enlazado. <span style={{color:"var(--orange)"}}>Lo que tengas ahora aquí se reemplazará por los datos de la nube.</span>
              </p>
              <div style={{display:"flex",gap:9}}>
                <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&onLink(input)}
                  placeholder="Pega aquí el código" style={{...inputStyle, fontFamily:"monospace", fontSize:12.5}} autoFocus/>
                <button onClick={()=>onLink(input)} className="grad-gold" style={{flexShrink:0,color:"#000",fontWeight:700,fontSize:13,padding:"10px 16px",borderRadius:9,display:"flex",alignItems:"center",gap:6}}>{Icons.link} Vincular</button>
              </div>
            </div>
          )}

          <div style={{height:1,background:"var(--border)"}}/>

          {/* Copia de seguridad / transferencia manual */}
          <div>
            <div style={{...labelStyle,marginBottom:8}}>Copia de seguridad y transferencia</div>
            <p style={{fontSize:12,color:"var(--text-2)",lineHeight:1.55,marginBottom:11}}>
              Exporta todos tus vídeos, formatos y papelera a un archivo, o importa un archivo exportado desde otro organizador. Al importar, los datos actuales se reemplazan y se sincronizan a la nube.
            </p>
            <div style={{display:"flex",gap:9,flexWrap:"wrap"}}>
              <button onClick={onExport} style={{
                flex:1,minWidth:150,display:"flex",alignItems:"center",justifyContent:"center",gap:8,fontSize:13,fontWeight:600,color:"var(--text)",
                border:"1px solid var(--border)",borderRadius:10,padding:"11px",transition:"all .15s"
              }} onMouseEnter={e=>{e.currentTarget.style.borderColor="var(--border-gold)";e.currentTarget.style.color="var(--gold)";}}
                 onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--border)";e.currentTarget.style.color="var(--text)";}}>
                {Icons.download} Exportar datos
              </button>
              <button onClick={()=>fileRef.current && fileRef.current.click()} style={{
                flex:1,minWidth:150,display:"flex",alignItems:"center",justifyContent:"center",gap:8,fontSize:13,fontWeight:600,color:"var(--text)",
                border:"1px solid var(--border)",borderRadius:10,padding:"11px",transition:"all .15s"
              }} onMouseEnter={e=>{e.currentTarget.style.borderColor="var(--border-gold)";e.currentTarget.style.color="var(--gold)";}}
                 onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--border)";e.currentTarget.style.color="var(--text)";}}>
                {Icons.upload} Importar datos
              </button>
              <input ref={fileRef} type="file" accept=".json,application/json" style={{display:"none"}}
                onChange={e=>{ const f=e.target.files && e.target.files[0]; if(f) onImport(f); e.target.value=""; }}/>
            </div>
          </div>

          <p style={{fontSize:11.5,color:"var(--text-3)",lineHeight:1.6}}>
            Tus datos se guardan en tu cuenta de Supabase. La app sigue funcionando sin conexión y sincroniza cuando vuelve internet.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ============================ TAREAS ============================ */