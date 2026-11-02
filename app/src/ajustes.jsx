import React from "react";
import { ATAJOS_EDITOR } from "./random_editor";
const { useState, useEffect, useRef, useMemo, useCallback } = React;
import { Icons, STATUSES } from "./base";
import { driveConectado, driveConectar, driveDesconectar, ytClearTokens, ytIsConnected } from "./datos";
import { Field, inputStyle } from "./videos";
import { ingresosEstimadosActivos } from "./youtube";
import { SeguridadPanel } from "./acceso";
import { PERFILES, cambiarPerfil, perfilActual } from "./perfiles";
import { CarpetasPanel } from "./carpetas";
import { ModulosPanel } from "./modulos";
import { AlmacenPanel } from "./almacen";
import { activarAvisos, avisosPosibles, desactivarAvisos, enPantallaInicio, esIphone, estadoAvisos, probarAviso } from "./avisos";

const GUIA_ATAJOS = [
  ["En todo RandomStudio", [["Ctrl+1 … Ctrl+9", "Ir a cada apartado (en el orden de la barra)"], ["Ctrl+K", "Buscar vídeos y apartados"],
    ["Ctrl+Z / Ctrl+Y", "Deshacer / rehacer (planificación)"]]],
  ["RandomEditor", ATAJOS_EDITOR],
  ["Clips (con un clip abierto)", [["← / →", "Clip anterior / siguiente"], ["A", "Aprobar / quitar el aprobado"], ["E", "Editar el clip en el RandomEditor"], ["Esc", "Cerrar el clip"]]],
];

/* ============================ CONFIGURACIÓN (v3.33, rehecha) ============================
 * Como cualquier app bien hecha: un menú de secciones a la izquierda (arriba en el móvil) y, a la derecha, solo lo de
 * esa sección, en filas claras «qué es · para qué · control». Recuerda la última sección abierta.
 */
const SECCIONES = [
  { id: "cuenta", icono: Icons.link, titulo: "Cuenta y conexiones", ayuda: "Con qué perfil estás, Google y Drive" },
  { id: "apartados", icono: Icons.kanban, titulo: "Apartados", ayuda: "Qué sale en la barra y en qué orden" },
  { id: "apariencia", icono: Icons.sun, titulo: "Apariencia", ayuda: "Tema y cómo se ven las tarjetas" },
  { id: "objetivos", icono: Icons.chart, titulo: "Objetivos e ingresos", ayuda: "Meta mensual, Shorts al día y RPM" },
  { id: "carpetas", icono: Icons.inbox, titulo: "Carpetas", ayuda: "De dónde se coge y a dónde va todo", escritorio: true },
  { id: "almacen", icono: Icons.cloud, titulo: "Almacenamiento", ayuda: "Qué ocupa cada cosa, archivar en Drive y borrar", escritorio: true },
  { id: "seguridad", icono: Icons.shield, titulo: "Seguridad", ayuda: "Este equipo y sus permisos" },
  { id: "datos", icono: Icons.download, titulo: "Datos y copias", ayuda: "Exportar, importar y restablecer" },
  { id: "atajos", icono: Icons.tasks, titulo: "Atajos de teclado", ayuda: "Todas las teclas rápidas" },
];

const Interruptor = ({ on, onClick }) => (
  <button onClick={onClick} role="switch" aria-checked={on}
    style={{ width: 42, height: 24, borderRadius: 20, position: "relative", flexShrink: 0, background: on ? "var(--gold)" : "var(--border)", transition: "background .15s" }}>
    <span style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 18, height: 18, borderRadius: 20, background: "#fff", transition: "left .15s", boxShadow: "0 1px 3px rgba(0,0,0,.3)" }} />
  </button>);

/** Una fila de ajustes: título y explicación a la izquierda, el control a la derecha. */
const Fila = ({ titulo, ayuda, children, ultima }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 0", borderBottom: ultima ? "none" : "1px solid var(--border)", flexWrap: "wrap" }}>
    <div style={{ flex: "1 1 240px", minWidth: 0 }}>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)" }}>{titulo}</div>
      {ayuda && <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 3, lineHeight: 1.5 }}>{ayuda}</div>}
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>{children}</div>
  </div>);

const Tarjeta = ({ titulo, children }) => (
  <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 16, padding: "6px 20px", marginBottom: 14 }}>
    {titulo && <div style={{ fontSize: 11, fontWeight: 800, color: "var(--gold)", textTransform: "uppercase", letterSpacing: ".08em", padding: "14px 0 2px" }}>{titulo}</div>}
    {children}
  </div>);

const btnOro = { color: "#000", fontWeight: 700, fontSize: 12.5, padding: "9px 15px", borderRadius: 10 };
const btnSec = { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: "var(--text)", border: "1px solid var(--border)", borderRadius: 10, padding: "9px 14px", background: "var(--card-2)" };
const cajaPanel = { background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 16, padding: 20, marginBottom: 14 };
const tituloPanel = { fontSize: 11, fontWeight: 800, color: "var(--gold)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10 };

export function ConfigView({ modulos, goals, setGoals, theme, setTheme, cardsExpanded, setCardsExpanded, onConnect, onExport, onImport, onReset, toast }) {
  const cfg = (goals && goals.cfg) || { targetEur:100, shortsPerDay:3, rpmManual:null };
  const [fTarget, setFTarget] = useState(String(cfg.targetEur));
  const [fShorts, setFShorts] = useState(String(cfg.shortsPerDay));
  const [fRpm, setFRpm] = useState(cfg.rpmManual!=null?String(cfg.rpmManual):"");
  const [, setTick] = useState(0); // re-render tras conectar/desconectar Google o Drive
  const [estimado, setEstimadoCfg] = useState(ingresosEstimadosActivos());
  const [colorDia, setColorDiaCfg] = useState(()=>{ try { return localStorage.getItem("rds_obj_color_dia")!=="0"; } catch(e){ return true; } });
  const [colorMes, setColorMesCfg] = useState(()=>{ try { return localStorage.getItem("rds_obj_color_mes")!=="0"; } catch(e){ return true; } });
  const [carpeta, setCarpeta] = useState(()=>{ try { return localStorage.getItem("rds_video_folder")||""; } catch(e){ return ""; } });
  const esEscritorio = !!(typeof window!=="undefined" && window.studioFS);
  const secciones = SECCIONES.filter(x => !x.escritorio || esEscritorio);
  const [sec, setSec0] = useState(()=>{ try { const v = localStorage.getItem("rds_config_seccion"); return secciones.some(x=>x.id===v) ? v : "cuenta"; } catch(e){ return "cuenta"; } });
  const setSec = (v) => { setSec0(v); try { localStorage.setItem("rds_config_seccion", v); } catch(e){} };
  const fileRef = useRef(null);
  const conectado = ytIsConnected();
  const perfil = PERFILES.find(p=>p.id===perfilActual()) || PERFILES[0] || {};
  const actual = secciones.find(x=>x.id===sec) || secciones[0];
  const [avisos, setAvisos] = useState(null);
  useEffect(()=>{ if(!esEscritorio) estadoAvisos().then(setAvisos).catch(()=>setAvisos({ posible:false })); },[]);
  const ls = (k, v) => { try { localStorage.setItem(k, v); } catch(e){} };

  const guardarObjetivo = () => {
    const t = parseFloat(String(fTarget).replace(",","."));
    const n = parseInt(fShorts,10);
    const rm = String(fRpm).trim()==="" ? null : parseFloat(String(fRpm).replace(",","."));
    if(!(t>0) || !(n>0)){ toast("Revisa el objetivo y los Shorts diarios"); return; }
    setGoals(g=>({ ...(g||{}), daily:(g&&g.daily)||{}, rpm:(g&&g.rpm)||null, cfg:{ targetEur:t, shortsPerDay:n, rpmManual:(rm&&rm>0)?rm:null, updatedAt:Date.now() } }));
    toast("Objetivo guardado · todas las cuentas se recalculan solas");
  };

  return (
    <div className="fade-in">
      <style>{".cfg-nav button:hover { background: var(--card-2) !important; } @media (max-width: 820px) { .cfg-grid { grid-template-columns: 1fr !important; } .cfg-nav { flex-direction: row !important; overflow-x: auto; position: static !important; padding-bottom: 4px; } .cfg-nav .cfg-ayuda { display: none !important; } .cfg-nav button { flex: 0 0 auto; } }"}</style>
      <h2 className="titulo-vista" style={{fontSize:20,fontWeight:700,marginBottom:4}}>Configuración</h2>
      <div className="cfg-grid" style={{ display: "grid", gridTemplateColumns: "250px 1fr", gap: 22, alignItems: "start" }}>
        <nav className="cfg-nav" style={{ display: "flex", flexDirection: "column", gap: 4, position: "sticky", top: 86 }}>
          {secciones.map(x => {
            const on = x.id === actual.id;
            return (
              <button key={x.id} onClick={() => setSec(x.id)}
                style={{ display: "flex", alignItems: "center", gap: 11, textAlign: "left", padding: "9px 12px", borderRadius: 10,
                  background: on ? "var(--gold-soft)" : "transparent", color: on ? "var(--gold)" : "var(--text-2)" }}>
                <span style={{ display: "flex", width: 22, justifyContent: "center", color: "inherit" }}>{x.icono}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: on ? "var(--gold)" : "var(--text)" }}>{x.titulo}</span>
                  <span className="cfg-ayuda" style={{ display: "block", fontSize: 11, color: "var(--text-3)", marginTop: 1 }}>{x.ayuda}</span>
                </span>
              </button>);
          })}
        </nav>

        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <span className="app-titulo"><span className="ico">{actual.icono}</span></span>
            <div><div style={{ fontFamily: "'Sora'", fontSize: 19, fontWeight: 800 }}>{actual.titulo}</div><div style={{ fontSize: 12.5, color: "var(--text-3)" }}>{actual.ayuda}</div></div>
          </div>

          {actual.id === "cuenta" && (<>
            <Tarjeta titulo="Perfil">
              <Fila titulo={<span style={{ display: "flex", alignItems: "center", gap: 10 }}>{(perfil.foto || perfil.avatar) && <img src={perfil.foto || perfil.avatar} referrerPolicy="no-referrer" style={{ width: 34, height: 34, borderRadius: 10 }} />}{perfil.nombre}</span>}
                ayuda="Cada perfil es una cuenta de Google con su canal: sus vídeos, sus carpetas y sus ajustes van aparte." ultima>
                <button onClick={cambiarPerfil} style={{ ...btnSec, color: "var(--gold)", borderColor: "var(--border-gold)" }}>Cambiar de perfil</button>
              </Fila>
            </Tarjeta>
            <Tarjeta titulo="Conexiones">
              <Fila titulo="Google · YouTube" ayuda={conectado ? "Conectado: subidas, analíticas, comentarios, edición y sincronización." : "Sin conectar: no se sincroniza ni se sube nada."}>
                <span style={{ fontSize: 12, fontWeight: 700, color: conectado ? "var(--green)" : "var(--text-3)" }}>{conectado ? "● Conectado" : "○ Sin conectar"}</span>
                <button onClick={onConnect} className="grad-gold" style={btnOro}>{conectado ? "Reconectar" : "Conectar"}</button>
                {conectado && <button onClick={() => { ytClearTokens(); setTick(t=>t+1); toast("Sesión de Google cerrada en este dispositivo"); }} style={{ ...btnSec, color: "var(--red)" }}>Desconectar</button>}
              </Fila>
              {!esEscritorio && <Fila titulo="Avisos en este móvil" ayuda={
                  !avisos ? "Comprobando…"
                  : avisos.activos ? "Activados: te avisa cuando una historia espera tu revisión, cuando un Short está listo o si algo falla."
                  : esIphone() && !enPantallaInicio() ? "En iPhone: pulsa Compartir → «Añadir a pantalla de inicio», abre RandomStudio desde ese icono y vuelve aquí."
                  : !avisos.posible ? "Este navegador no admite avisos." : "Te avisa aunque tengas RandomStudio cerrado."}>
                {avisos && avisos.activos
                  ? <><button onClick={async () => { try { const r = await probarAviso(); toast(r.enviados ? "Aviso de prueba enviado" : "No llegó ningún aviso"); } catch (e) { toast(e.message); } }} style={btnSec}>Probar</button>
                      <button onClick={async () => { await desactivarAvisos(); setAvisos(await estadoAvisos()); toast("Avisos desactivados"); }} style={{ ...btnSec, color: "var(--red)" }}>Desactivar</button></>
                  : avisosPosibles() && <button onClick={async () => { try { await activarAvisos(); setAvisos(await estadoAvisos()); toast("🔔 Avisos activados"); } catch (e) { toast(e.message); } }} className="grad-gold" style={btnOro}>Activar avisos</button>}
              </Fila>}
              <Fila titulo="Google Drive" ayuda={esEscritorio ? "Donde se guardan los Shorts terminados (copia idéntica). Desde el móvil se descargan aunque el portátil esté apagado." : "Se conecta desde RandomStudio de escritorio, que es quien sube."} ultima>
                {esEscritorio && (driveConectado()
                  ? <><span style={{ fontSize: 12, fontWeight: 700, color: "var(--green)" }}>● Conectado</span>
                      <button onClick={() => { driveDesconectar(); setTick(t=>t+1); toast("Drive desconectado"); }} style={{ ...btnSec, color: "var(--red)" }}>Desconectar</button></>
                  : <button onClick={async () => { try { await driveConectar(); setTick(t=>t+1); toast("☁️ Drive conectado"); } catch (e) { toast(e.message); } }} className="grad-gold" style={btnOro}>Conectar Drive</button>)}
              </Fila>
            </Tarjeta>
          </>)}

          {actual.id === "apartados" && <Tarjeta><div style={{ padding: "14px 0" }}><ModulosPanel modulos={modulos} toast={toast} /></div></Tarjeta>}

          {actual.id === "apariencia" && (
            <Tarjeta>
              <Fila titulo="Tema oscuro" ayuda="El negro y dorado de siempre. Apagado: tema claro."><Interruptor on={theme==="dark"} onClick={()=>setTheme(t=>t==="dark"?"light":"dark")} /></Fila>
              <Fila titulo="Tarjetas abiertas" ayuda="Las tarjetas de vídeo salen expandidas por defecto."><Interruptor on={cardsExpanded} onClick={()=>setCardsExpanded(x=>!x)} /></Fila>
              <Fila titulo="Progreso del día" ayuda="Colorea cada día del calendario de Objetivos según lo que llevas."><Interruptor on={colorDia} onClick={()=>{ const n=!colorDia; setColorDiaCfg(n); ls("rds_obj_color_dia", n?"1":"0"); }} /></Fila>
              <Fila titulo="Progreso del mes" ayuda="Fondo del calendario según cómo va el mes." ultima><Interruptor on={colorMes} onClick={()=>{ const n=!colorMes; setColorMesCfg(n); ls("rds_obj_color_mes", n?"1":"0"); }} /></Fila>
            </Tarjeta>)}

          {actual.id === "objetivos" && (
            <Tarjeta>
              <Fila titulo="Objetivo al mes" ayuda="Lo que quieres ganar cada mes, en euros."><input value={fTarget} onChange={e=>setFTarget(e.target.value)} inputMode="decimal" style={{ ...inputStyle, width: 120 }}/></Fila>
              <Fila titulo="Shorts al día" ayuda="Cuántos quieres publicar cada día."><input value={fShorts} onChange={e=>setFShorts(e.target.value)} inputMode="numeric" style={{ ...inputStyle, width: 120 }}/></Fila>
              <Fila titulo="RPM manual" ayuda="Déjalo vacío para usar el real de YouTube."><input value={fRpm} onChange={e=>setFRpm(e.target.value)} placeholder="p. ej. 0,06" inputMode="decimal" style={{ ...inputStyle, width: 120 }}/></Fila>
              <Fila titulo="Guardar" ayuda="Las cuentas de Objetivos se recalculan solas."><button onClick={guardarObjetivo} className="grad-gold" style={btnOro}>Guardar objetivo</button></Fila>
              <Fila titulo="Ingresos estimados" ayuda="Visitas × RPM, al momento. Apagado: solo los reales de YouTube (llegan con unos 2 días de retraso)." ultima>
                <Interruptor on={estimado} onClick={()=>{ const n=!estimado; setEstimadoCfg(n); ls("rds_ingresos_reales", n?"0":"1"); }} /></Fila>
            </Tarjeta>)}

          {actual.id === "carpetas" && esEscritorio && (<>
            <CarpetasPanel caja={cajaPanel} tituloZona={tituloPanel} toast={toast}/>
            <Tarjeta titulo="Subida directa">
              <Fila titulo="Carpeta de vídeos" ayuda={<span title={carpeta}>📁 {carpeta || "(sin elegir)"} — de aquí se cogen los vídeos al subirlos desde el PC.</span>} ultima>
                <button onClick={async ()=>{ const dir = await window.studioFS.pickFolder(); if(dir){ setCarpeta(dir); ls("rds_video_folder",dir); toast("Carpeta guardada"); } }} style={{ ...btnSec, color: "var(--gold)", borderColor: "var(--border-gold)" }}>Cambiar</button>
              </Fila>
            </Tarjeta>
          </>)}

          {actual.id === "almacen" && esEscritorio && <AlmacenPanel toast={toast} />}

          {actual.id === "seguridad" && <SeguridadPanel caja={cajaPanel} tituloZona={tituloPanel} toast={toast}/>}

          {actual.id === "datos" && (
            <Tarjeta>
              <Fila titulo="Exportar una copia" ayuda="Descarga todos los datos de este perfil en un archivo (JSON)."><button onClick={onExport} style={btnSec}>{Icons.download} Exportar</button></Fila>
              <Fila titulo="Importar una copia" ayuda="Recupera los datos desde un archivo exportado antes.">
                <button onClick={()=>fileRef.current && fileRef.current.click()} style={btnSec}>{Icons.copy} Importar</button>
                <input ref={fileRef} type="file" accept="application/json" style={{display:"none"}} onChange={e=>{ onImport(e.target.files && e.target.files[0]); e.target.value=""; }}/>
              </Fila>
              {esEscritorio && <Fila titulo="Copias automáticas" ayuda="En este PC se guarda una copia cada día (los últimos 30 días) y todo se sincroniza con la nube."><span style={{ fontSize: 12, fontWeight: 700, color: "var(--green)" }}>● Activadas</span></Fila>}
              <Fila titulo="Restablecer datos" ayuda="Borra los datos de este perfil en este dispositivo. Pide confirmación antes." ultima>
                <button onClick={onReset} style={{ ...btnSec, color: "var(--red)", borderColor: "rgba(248,113,113,.35)" }}>{Icons.trash} Restablecer</button></Fila>
            </Tarjeta>)}

          {actual.id === "atajos" && (
            <Tarjeta>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:"18px 28px", padding: "14px 0"}}>
                {GUIA_ATAJOS.map(([zona, lista])=>(
                  <div key={zona}>
                    <div style={{fontSize:13,fontWeight:700,marginBottom:8}}>{zona}</div>
                    <div style={{display:"flex",flexDirection:"column",gap:6}}>
                      {lista.map(([k,que])=>(
                        <div key={k} style={{display:"flex",gap:10,alignItems:"baseline",fontSize:12.5}}>
                          <kbd style={{flexShrink:0,minWidth:118,fontFamily:"monospace",fontSize:11.5,padding:"2px 7px",borderRadius:6,border:"1px solid var(--border)",background:"var(--bg)",color:"var(--gold)"}}>{k}</kbd>
                          <span style={{color:"var(--text-2)"}}>{que}</span>
                        </div>))}
                    </div>
                  </div>))}
              </div>
            </Tarjeta>)}
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

