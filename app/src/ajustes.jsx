import React from "react";
import { ATAJOS_EDITOR } from "./random_editor";
const { useState, useEffect, useRef, useMemo, useCallback } = React;
import { Icons, STATUSES } from "./base";
import { geminiGetKey, geminiSaveKey, ytClearTokens, ytIsConnected } from "./datos";
import { Field, inputStyle } from "./videos";
import { ingresosEstimadosActivos } from "./youtube";
import { SeguridadPanel } from "./acceso";
import { PERFILES, cambiarPerfil, perfilActual } from "./perfiles";

const GUIA_ATAJOS = [
  ["En todo RandomStudio", [["Ctrl+1 … Ctrl+9", "Ir a cada apartado (en el orden de la barra)"], ["Ctrl+K", "Buscar vídeos y apartados"],
    ["Ctrl+Z / Ctrl+Y", "Deshacer / rehacer (planificación)"]]],
  ["RandomEditor", ATAJOS_EDITOR],
  ["Clips (con un clip abierto)", [["← / →", "Clip anterior / siguiente"], ["A", "Aprobar / quitar el aprobado"], ["E", "Editar el clip en el RandomEditor"], ["Esc", "Cerrar el clip"]]],
];

export function ConfigView({ goals, setGoals, theme, setTheme, cardsExpanded, setCardsExpanded, onConnect, onExport, onImport, onReset, toast }) {
  const cfg = (goals && goals.cfg) || { targetEur:100, shortsPerDay:3, rpmManual:null };
  const [fTarget, setFTarget] = useState(String(cfg.targetEur));
  const [fShorts, setFShorts] = useState(String(cfg.shortsPerDay));
  const [fRpm, setFRpm] = useState(cfg.rpmManual!=null?String(cfg.rpmManual):"");
  const [, setTick] = useState(0); // re-render tras conectar/desconectar Google
  const [estimado, setEstimadoCfg] = useState(ingresosEstimadosActivos());
  const [colorDia, setColorDiaCfg] = useState(()=>{ try { return localStorage.getItem("rds_obj_color_dia")!=="0"; } catch(e){ return true; } });
  const [colorMes, setColorMesCfg] = useState(()=>{ try { return localStorage.getItem("rds_obj_color_mes")!=="0"; } catch(e){ return true; } });
  const [carpeta, setCarpeta] = useState(()=>{ try { return localStorage.getItem("rds_video_folder")||""; } catch(e){ return ""; } });
  const [gemKey, setGemKey] = useState(geminiGetKey());
  const esEscritorio = !!(typeof window!=="undefined" && window.studioFS);
  const fileRef = useRef(null);
  const conectado = ytIsConnected();

  const guardarObjetivo = () => {
    const t = parseFloat(String(fTarget).replace(",","."));
    const s = parseInt(fShorts,10);
    const rm = String(fRpm).trim()==="" ? null : parseFloat(String(fRpm).replace(",","."));
    if(!(t>0) || !(s>0)){ toast("Revisa el objetivo y los Shorts diarios"); return; }
    setGoals(g=>({ ...(g||{}), daily:(g&&g.daily)||{}, rpm:(g&&g.rpm)||null, cfg:{ targetEur:t, shortsPerDay:s, rpmManual:(rm&&rm>0)?rm:null, updatedAt:Date.now() } }));
    toast("Objetivo guardado · todas las cuentas se recalculan solas");
  };

  const Toggle = ({activo, onToggle, children}) => (
    <button onClick={onToggle} style={{
      display:"flex",alignItems:"center",gap:10,width:"100%",textAlign:"left",padding:"10px 13px",borderRadius:10,
      border:"1px solid "+(activo?"var(--border-gold)":"var(--border)"),
      background: activo?"rgba(212,175,55,0.05)":"var(--card)", transition:"all .15s"
    }}>
      <span style={{width:34,height:19,borderRadius:19,flexShrink:0,background:activo?"var(--gold)":"var(--card-2)",border:"1px solid "+(activo?"var(--gold)":"var(--border)"),position:"relative",transition:"background .18s"}}>
        <span style={{position:"absolute",top:1.5,left:activo?16:2,width:14,height:14,borderRadius:"50%",background:activo?"#000":"var(--text-3)",transition:"left .18s"}}/>
      </span>
      <span style={{fontSize:12.5,color:"var(--text)",lineHeight:1.45}}>{children}</span>
    </button>
  );

  const caja = { background:"var(--bg-2)", border:"1px solid var(--border)", borderRadius:14, padding:18 };
  const tituloZona = { fontSize:11.5, fontWeight:700, color:"var(--gold)", textTransform:"uppercase", letterSpacing:".07em", marginBottom:13 };

  return (
    <div className="fade-in">
      <h2 className="titulo-vista" style={{fontSize:20,fontWeight:700,marginBottom:4}}>Configuración</h2>
      <p style={{fontSize:12.5,color:"var(--text-2)",marginBottom:18}}>Todo lo ajustable del Studio, en un solo sitio.</p>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(320px,1fr))",gap:14,alignItems:"start"}}>

        {/* v3.11, él: "que no se te olvide poner en la configuración una guía con todos los atajos" */}
        <div style={{...caja, gridColumn:"1 / -1"}}>
          <div style={tituloZona}>Atajos de teclado</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:"16px 28px"}}>
            {GUIA_ATAJOS.map(([zona, lista])=>(
              <div key={zona}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:8}}>{zona}</div>
                <div style={{display:"flex",flexDirection:"column",gap:5}}>
                  {lista.map(([k,que])=>(
                    <div key={k} style={{display:"flex",gap:10,alignItems:"baseline",fontSize:12.5}}>
                      <kbd style={{flexShrink:0,minWidth:118,fontFamily:"monospace",fontSize:11.5,padding:"2px 7px",borderRadius:6,border:"1px solid var(--border)",background:"var(--bg)",color:"var(--gold)"}}>{k}</kbd>
                      <span style={{color:"var(--text-2)"}}>{que}</span>
                    </div>))}
                </div>
              </div>))}
          </div>
        </div>

        <div style={caja}>
          <div style={tituloZona}>Objetivos e ingresos</div>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <Field label="Objetivo € / mes"><input value={fTarget} onChange={e=>setFTarget(e.target.value)} inputMode="decimal" style={inputStyle}/></Field>
              <Field label="Shorts al día"><input value={fShorts} onChange={e=>setFShorts(e.target.value)} inputMode="numeric" style={inputStyle}/></Field>
            </div>
            <Field label="RPM manual (vacío = usar el real de la API)"><input value={fRpm} onChange={e=>setFRpm(e.target.value)} placeholder="p. ej. 0,06" inputMode="decimal" style={inputStyle}/></Field>
            <button onClick={guardarObjetivo} className="grad-gold" style={{color:"#000",fontWeight:700,fontSize:13,padding:"10px 16px",borderRadius:9,alignSelf:"flex-start"}}>Guardar objetivo</button>
            <Toggle activo={estimado} onToggle={()=>{ const n=!estimado; setEstimadoCfg(n); try{localStorage.setItem("rds_ingresos_reales", n?"0":"1");}catch(e){} }}>
              <b>Ingresos estimados</b> (visitas × RPM, al momento). Apagado = solo los reales que reporta YouTube (~2 días de retraso).
            </Toggle>
          </div>
        </div>

        <div style={caja}>
          <div style={tituloZona}>Apariencia</div>
          <div style={{display:"flex",flexDirection:"column",gap:9}}>
            <Toggle activo={theme==="dark"} onToggle={()=>setTheme(t=>t==="dark"?"light":"dark")}>Tema oscuro</Toggle>
            <Toggle activo={cardsExpanded} onToggle={()=>setCardsExpanded(x=>!x)}>Tarjetas expandidas por defecto</Toggle>
            <Toggle activo={colorDia} onToggle={()=>{ const n=!colorDia; setColorDiaCfg(n); try{localStorage.setItem("rds_obj_color_dia", n?"1":"0");}catch(e){} }}>Progreso visual diario (calendario de Objetivos)</Toggle>
            <Toggle activo={colorMes} onToggle={()=>{ const n=!colorMes; setColorMesCfg(n); try{localStorage.setItem("rds_obj_color_mes", n?"1":"0");}catch(e){} }}>Progreso visual mensual (fondo del calendario)</Toggle>
          </div>
        </div>

        <div style={caja}>
          <div style={tituloZona}>Google · YouTube</div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div style={{fontSize:13,color:conectado?"var(--green)":"var(--text-2)",fontWeight:600}}>
              {conectado ? "● Conectado — subidas, analíticas, comentarios y edición activos" : "○ Sin conectar"}
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <button onClick={onConnect} className="grad-gold" style={{color:"#000",fontWeight:700,fontSize:12.5,padding:"9px 14px",borderRadius:9}}>{conectado?"Reconectar":"Conectar con Google"}</button>
              {conectado && <button onClick={()=>{ ytClearTokens(); setTick(t=>t+1); toast("Sesión de Google cerrada en este dispositivo"); }} style={{fontSize:12.5,fontWeight:600,color:"var(--red)",border:"1px solid rgba(248,113,113,0.3)",borderRadius:9,padding:"9px 14px"}}>Desconectar</button>}
            </div>
            <div style={{fontSize:11,color:"var(--text-3)",lineHeight:1.5}}>Reconecta si la app pide permisos nuevos (analíticas, comentarios).</div>
          </div>
        </div>

        <div style={caja}>
          <div style={tituloZona}>Perfil</div>
          <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
            <div style={{fontSize:13,fontWeight:600}}>Has entrado como <span className="gold-text">{(PERFILES.find(p=>p.id===perfilActual())||PERFILES[0]).nombre}</span></div>
            <span style={{flex:1}}/>
            <button onClick={cambiarPerfil} style={{fontSize:12.5,fontWeight:600,color:"var(--gold)",border:"1px solid var(--border-gold)",borderRadius:9,padding:"9px 14px",background:"rgba(212,175,55,0.05)"}}>Cambiar de perfil</button>
          </div>
        </div>

        <SeguridadPanel caja={caja} tituloZona={tituloZona} toast={toast}/>

        <div style={caja}>
          <div style={tituloZona}>IA (Gemini)</div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div style={{display:"flex",gap:8}}>
              <input type="password" value={gemKey} onChange={e=>setGemKey(e.target.value)} placeholder="AIza…" style={{...inputStyle,flex:1}}/>
              <button onClick={()=>{ geminiSaveKey(gemKey.trim()); toast(gemKey.trim()?"Clave de Gemini guardada":"Clave borrada"); }} className="grad-gold" style={{flexShrink:0,color:"#000",fontWeight:700,fontSize:12.5,padding:"9px 14px",borderRadius:9}}>Guardar</button>
            </div>
            <div style={{fontSize:11,color:"var(--text-3)",lineHeight:1.5}}>Gratis en <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" style={{color:"var(--gold)"}}>aistudio.google.com/apikey</a>. Se usa para descripciones, comentarios fijados y respuestas a comentarios.</div>
          </div>
        </div>

        {esEscritorio && (
          <div style={caja}>
            <div style={tituloZona}>Escritorio</div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <div style={{fontSize:12,color:"var(--text-2)"}}>Carpeta de vídeos para la subida directa desde el PC:</div>
              <div style={{fontSize:11.5,color:"var(--text-3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={carpeta}>📁 {carpeta||"(sin elegir)"}</div>
              <button onClick={async ()=>{ const dir = await window.studioFS.pickFolder(); if(dir){ setCarpeta(dir); try{localStorage.setItem("rds_video_folder",dir);}catch(e){} toast("Carpeta guardada"); } }} style={{alignSelf:"flex-start",fontSize:12.5,fontWeight:600,color:"var(--gold)",border:"1px solid var(--border-gold)",borderRadius:9,padding:"9px 14px",background:"rgba(212,175,55,0.05)"}}>Cambiar carpeta</button>
              <div style={{fontSize:11,color:"var(--text-3)",lineHeight:1.5}}>Tus datos viven en este PC con copia automática diaria (se guardan los últimos 30 días) y se sincronizan con la nube.</div>
            </div>
          </div>
        )}

        <div style={caja}>
          <div style={tituloZona}>Datos</div>
          <div style={{display:"flex",flexDirection:"column",gap:9}}>
            <button onClick={onExport} style={{display:"flex",alignItems:"center",gap:8,fontSize:13,fontWeight:600,color:"var(--text)",border:"1px solid var(--border)",borderRadius:10,padding:"10px 14px"}}>{Icons.download} Exportar copia de seguridad (JSON)</button>
            <button onClick={()=>fileRef.current && fileRef.current.click()} style={{display:"flex",alignItems:"center",gap:8,fontSize:13,fontWeight:600,color:"var(--text)",border:"1px solid var(--border)",borderRadius:10,padding:"10px 14px"}}>{Icons.copy} Importar desde un archivo</button>
            <input ref={fileRef} type="file" accept="application/json" style={{display:"none"}} onChange={e=>{ onImport(e.target.files && e.target.files[0]); e.target.value=""; }}/>
            <button onClick={onReset} style={{display:"flex",alignItems:"center",gap:8,fontSize:13,fontWeight:600,color:"var(--red)",border:"1px solid rgba(248,113,113,0.3)",borderRadius:10,padding:"10px 14px"}}>{Icons.trash} Restablecer datos</button>
          </div>
        </div>

      </div>
    </div>
  );
}

/* ============================ BUSCADOR GLOBAL (cabecera) ============================ */
// v3.11: también lleva a los apartados («clips», «ranking»…) y se abre con Ctrl+K
const normal = t => (t||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"");
export function GlobalSearch({videos, formats, onOpen, secciones=[], onIr}) {
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState(false);
  const boxRef = useRef(null);
  const inputRef = useRef(null);
  useEffect(()=>{
    const h = e => { if((e.ctrlKey||e.metaKey) && (e.key==="k"||e.key==="K")){ e.preventDefault(); inputRef.current && inputRef.current.focus(); } };
    window.addEventListener("keydown", h);
    return ()=>window.removeEventListener("keydown", h);
  },[]);
  const secs = useMemo(()=>{
    const t = normal(q.trim());
    if(t.length<2 || !onIr) return [];
    return secciones.filter(x=>normal(x.label).includes(t)).slice(0,4);
  },[q, secciones]);
  useEffect(()=>{
    const fn = (e)=>{ if(boxRef.current && !boxRef.current.contains(e.target)) setFocus(false); };
    document.addEventListener("mousedown", fn);
    return ()=>document.removeEventListener("mousedown", fn);
  },[]);
  const res = useMemo(()=>{
    const t = q.trim().toLowerCase();
    if(t.length<2) return [];
    return videos.filter(v=>(v.title||"").toLowerCase().includes(t)).slice(0,8);
  },[q, videos]);
  const abrir = (v)=>{ onOpen(v); setQ(""); setFocus(false); };
  const ir = (x)=>{ onIr(x.id); setQ(""); setFocus(false); inputRef.current && inputRef.current.blur(); };
  return (
    <div ref={boxRef} className="global-search" style={{position:"relative"}}>
      <span style={{position:"absolute",left:11,top:"50%",transform:"translateY(-50%)",color:"var(--text-3)",display:"flex",pointerEvents:"none"}}>{Icons.search}</span>
      <input ref={inputRef} value={q} onChange={e=>setQ(e.target.value)} onFocus={()=>setFocus(true)}
        onKeyDown={e=>{
          if(e.key==="Enter" && secs[0]) ir(secs[0]);
          else if(e.key==="Enter" && res[0]) abrir(res[0]);
          if(e.key==="Escape"){ setQ(""); setFocus(false); e.currentTarget.blur(); }
        }}
        placeholder="Buscar… (Ctrl+K)"
        style={{
          width: focus?250:170, transition:"width .18s ease, border-color .15s",
          background:"var(--bg-2)", border:"1px solid "+(focus?"var(--border-gold)":"var(--border)"),
          borderRadius:11, padding:"9px 12px 9px 34px", color:"var(--text)", fontSize:12.5
        }}/>
      {focus && q.trim().length>=2 && (
        <div className="fade-in" style={{position:"absolute",top:"calc(100% + 6px)",right:0,width:340,maxWidth:"90vw",background:"var(--bg-2)",border:"1px solid var(--border)",borderRadius:12,boxShadow:"0 14px 44px rgba(0,0,0,0.5)",overflow:"hidden",zIndex:300}}>
          {secs.map(x=>(
            <button key={x.id} onClick={()=>ir(x)} style={{display:"flex",alignItems:"center",gap:9,width:"100%",textAlign:"left",padding:"9px 13px",borderBottom:"1px solid var(--border)"}}
              onMouseEnter={e=>e.currentTarget.style.background="var(--card)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <span style={{color:"var(--gold)",display:"flex"}}>{x.icon}</span>
              <span style={{fontSize:12.5,fontWeight:600}}>Ir a {x.label}</span>
            </button>))}
          {res.length===0 && !secs.length ? (
            <div style={{padding:"14px 16px",fontSize:12.5,color:"var(--text-3)"}}>Nada coincide con «{q.trim()}»</div>
          ) : res.map((v,i)=>{
            const f = formats[v.format];
            const st = STATUSES[v.status];
            return (
              <button key={v.id} onClick={()=>abrir(v)} style={{
                display:"flex",alignItems:"center",gap:9,width:"100%",textAlign:"left",padding:"9px 13px",
                borderBottom: i<res.length-1?"1px solid var(--border)":"none", transition:"background .12s"
              }}
                onMouseEnter={e=>e.currentTarget.style.background="var(--card)"}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <span style={{color:f?f.color:"var(--text-3)",display:"flex",flexShrink:0}}>{v.type==="short"?Icons.short:(v.type==="directo"?Icons.live:Icons.largo)}</span>
                <span style={{flex:1,minWidth:0}}>
                  <span style={{display:"block",fontSize:12.5,fontWeight:600,color:"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v.title}</span>
                  <span style={{display:"flex",gap:8,fontSize:10.5,color:"var(--text-3)"}}>
                    {f && <span style={{color:f.color}}>{f.label}</span>}
                    {v.date && <span>{new Date(v.date+"T00:00").toLocaleDateString("es-ES",{day:"numeric",month:"short"})}{v.time?` · ${v.time}`:""}</span>}
                    {st && <span style={{color:st.color}}>{st.label}</span>}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

