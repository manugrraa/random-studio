import React from "react";
const { useState, useEffect, useRef, useMemo, useCallback } = React;
import { PinnedCommentPanel } from "./agente";
import { FormatPill, Icon, Icons, makeVideo } from "./base";
import { ChannelHeroCard } from "./canal";
import { clasificarFormato, fechaISO, fireNotification, geminiGenerate, geminiHasKey, ytAnalyticsQuery, ytAuthHeader, ytCheckVideos, ytDeleteVideo, ytExpireAccess, ytFetchDiario, ytFetchRpmReal, ytIsConnected, ytListChannelComments, ytListUploadsFull, ytPostComment, ytReplyComment, ytTokenValid, ytViewCounts } from "./datos";
import { Field, inputStyle } from "./videos";

export const BarraProgreso = ({pct, alto=8, color}) => (
  <div style={{height:alto, background:"var(--card)", borderRadius:alto, overflow:"hidden"}}>
    <div style={{height:"100%", width:Math.min(100,Math.max(0,pct||0))+"%", borderRadius:alto, transition:"width .4s, background .4s",
      background: color || rgbaDePct(pct, 1)}}/>
  </div>
);

/* Colores de referencia del progreso: rojo → ámbar → verde, interpolados según el % */
export const REF_ROJO=[248,113,113], REF_AMBAR=[212,175,55], REF_VERDE=[74,222,128];
export function rgbDePct(pct){
  const p = Math.max(0, Math.min(100, pct==null?0:pct));
  const mix=(a,b,t)=>[0,1,2].map(i=>Math.round(a[i]+(b[i]-a[i])*t));
  return p>=50 ? mix(REF_AMBAR, REF_VERDE, (p-50)/50) : mix(REF_ROJO, REF_AMBAR, p/50);
}
export const rgbaDePct=(pct,alpha)=>{ const c=rgbDePct(pct); return `rgba(${c[0]},${c[1]},${c[2]},${alpha})`; };

// Modo de ingresos: estimados (visitas × RPM, al instante) o reales (API, ~2 días de retraso)
export function ingresosEstimadosActivos(){ try { return localStorage.getItem("rds_ingresos_reales")!=="1"; } catch(e){ return true; } }

export function ObjetivosPanel({ videos, goals, setGoals, onConnect, toast }) {
  const cfg = (goals && goals.cfg) || { targetEur: 100, shortsPerDay: 3, rpmManual: null };
  const rpmInfo = (goals && goals.rpm) || null;
  const daily = (goals && goals.daily) || {};
  const [cargando, setCargando] = useState(false);
  const [errorApi, setErrorApi] = useState(null); // "off" | "permisos" | "conectar" | mensaje
  const [liveViews, setLiveViews] = useState({});
  const [liveAt, setLiveAt] = useState(0);
  const [editCfg, setEditCfg] = useState(false);
  const [fTarget, setFTarget] = useState(String(cfg.targetEur));
  const [fShorts, setFShorts] = useState(String(cfg.shortsPerDay));
  const [fRpm, setFRpm] = useState(cfg.rpmManual!=null ? String(cfg.rpmManual) : "");
  // Día y mes seleccionados (0 = hoy / mes actual)
  const [diaOff, setDiaOff] = useState(0);
  const [mesOff, setMesOff] = useState(0);
  // Interruptores del progreso visual (preferencia de este dispositivo)
  const [colorDia, setColorDia] = useState(()=>{ try { return localStorage.getItem("rds_obj_color_dia")!=="0"; } catch(e){ return true; } });
  const [colorMes, setColorMes] = useState(()=>{ try { return localStorage.getItem("rds_obj_color_mes")!=="0"; } catch(e){ return true; } });
  useEffect(()=>{ try { localStorage.setItem("rds_obj_color_dia", colorDia?"1":"0"); } catch(e){} },[colorDia]);
  useEffect(()=>{ try { localStorage.setItem("rds_obj_color_mes", colorMes?"1":"0"); } catch(e){} },[colorMes]);
  // Ingresos: estimados (visitas × RPM, disponibles al momento) o reales (API)
  const [estimado, setEstimado] = useState(ingresosEstimadosActivos());
  useEffect(()=>{ try { localStorage.setItem("rds_ingresos_reales", estimado?"0":"1"); } catch(e){} },[estimado]);

  const hoy = new Date();
  const hoyKey = fechaISO(hoy);
  const nf = new Intl.NumberFormat("es-ES");
  const nfc = new Intl.NumberFormat("es-ES", {notation:"compact", maximumFractionDigits:1});
  const eur = (x) => x==null ? "—" : x.toLocaleString("es-ES",{minimumFractionDigits:2, maximumFractionDigits:2})+" €";

  // RPM efectivo: manual > RPM real de SHORTS (solo Shorts: los directos y vídeos
  // rinden distinto y meterlos en la media falsearía el objetivo)
  const rpmShortsApi = (rpmInfo && rpmInfo.shorts && rpmInfo.shorts.rpm>0) ? rpmInfo.shorts.rpm : null;
  const rpm = cfg.rpmManual!=null ? cfg.rpmManual : rpmShortsApi;
  const rpmOrigen = cfg.rpmManual!=null ? "manual" : (rpmShortsApi ? "real de Shorts" : null);

  // ——— Día seleccionado (flechas en la zona HOY) ———
  const diaSelD = new Date(hoy); diaSelD.setDate(hoy.getDate()+diaOff);
  const diaKey = fechaISO(diaSelD);
  const esHoySel = diaOff===0;

  // ——— Mes seleccionado (flechas en la zona MES) ———
  const mesD = new Date(hoy.getFullYear(), hoy.getMonth()+mesOff, 1);
  const mesPrefix = fechaISO(mesD).slice(0,7);
  const diasMesSel = new Date(mesD.getFullYear(), mesD.getMonth()+1, 0).getDate();
  const mesFuturo = mesPrefix > hoyKey.slice(0,7);

  // ——— Objetivos derivados del € mensual y el RPM ———
  const objetivoMesVistas = (rpm && rpm>0) ? Math.round(cfg.targetEur / rpm * 1000) : null;
  const diasMesActual = new Date(hoy.getFullYear(), hoy.getMonth()+1, 0).getDate();
  const objetivoDiaVistas = objetivoMesVistas ? Math.round(objetivoMesVistas / diasMesActual) : null;
  const objetivoShort = objetivoDiaVistas ? Math.round(objetivoDiaVistas / (cfg.shortsPerDay||3)) : null;
  // Para el día/mes seleccionados (por si el mes tiene otros días)
  const diasMesDelDia = new Date(diaSelD.getFullYear(), diaSelD.getMonth()+1, 0).getDate();
  const objetivoDiaSel = objetivoMesVistas ? Math.round(objetivoMesVistas / diasMesDelDia) : null;
  const objetivoShortSel = objetivoDiaSel ? Math.round(objetivoDiaSel / (cfg.shortsPerDay||3)) : null;
  const objetivoDiaMesSel = objetivoMesVistas ? Math.round(objetivoMesVistas / diasMesSel) : null;

  const guardarCfg = () => {
    const t = parseFloat(String(fTarget).replace(",","."));
    const s = parseInt(fShorts,10);
    const rm = String(fRpm).trim()==="" ? null : parseFloat(String(fRpm).replace(",","."));
    if(!(t>0)){ toast("Pon un objetivo de € válido"); return; }
    if(!(s>0)){ toast("Los Shorts diarios deben ser al menos 1"); return; }
    setGoals(g=>({ ...(g||{}), daily:(g&&g.daily)||{}, rpm:(g&&g.rpm)||null,
      cfg:{ targetEur:t, shortsPerDay:s, rpmManual:(rm && rm>0)?rm:null, updatedAt:Date.now() } }));
    setEditCfg(false);
    toast("Objetivo guardado");
  };

  // Refrescar analíticas: RPM real (1 vez al día) + visitas/ingresos por día del mes actual
  const refrescar = async (fuerza) => {
    if(!ytIsConnected()){ setErrorApi("conectar"); return; }
    setCargando(true); setErrorApi(null);
    try {
      let rpmNuevo = rpmInfo;
      if(fuerza || !rpmInfo || rpmInfo.ventana!==30 || (Date.now()-(rpmInfo.at||0)) > 24*3600*1000){
        rpmNuevo = await ytFetchRpmReal();
      }
      const ini = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      ini.setDate(ini.getDate()-7); // también la semana previa, para la vista semanal
      const dias = await ytFetchDiario(fechaISO(ini), hoyKey);
      setGoals(g=>{
        const base = g||{};
        const nuevoDaily = { ...(base.daily||{}) };
        Object.entries(dias).forEach(([k,v])=>{
          const p = nuevoDaily[k];
          if(!p || (v.views||0) >= (p.views||0)) nuevoDaily[k]=v;
        });
        return { ...base, cfg: base.cfg || {...cfg, updatedAt:Date.now()}, rpm: rpmNuevo, daily: nuevoDaily, dailyAt: Date.now() };
      });
    } catch(e){
      if(e.message==="ANALYTICS_API_OFF") setErrorApi("off");
      else if(e.message==="ANALYTICS_PERMISOS") setErrorApi("permisos");
      else setErrorApi(e.message);
    } finally { setCargando(false); }
  };

  // Al navegar a otro mes, bajar sus días de la API (una vez por mes)
  const mesesCargadosRef = useRef(new Set());
  const cargarMes = async (prefix) => {
    if(!ytIsConnected() || mesesCargadosRef.current.has(prefix)) return;
    if(prefix+"-01" > hoyKey) return; // mes futuro: nada que leer
    mesesCargadosRef.current.add(prefix);
    try {
      const [y,m] = prefix.split("-").map(Number);
      const finD = fechaISO(new Date(y, m, 0));
      const dias = await ytFetchDiario(prefix+"-01", finD > hoyKey ? hoyKey : finD);
      setGoals(g=>{
        const base = g||{};
        const nuevoDaily = { ...(base.daily||{}) };
        Object.entries(dias).forEach(([k,v])=>{
          const p = nuevoDaily[k];
          if(!p || (v.views||0) >= (p.views||0)) nuevoDaily[k]=v;
        });
        return { ...base, daily: nuevoDaily, dailyAt: Date.now() };
      });
    } catch(e){ mesesCargadosRef.current.delete(prefix); }
  };
  useEffect(()=>{ if(mesOff!==0 && ytTokenValid()) cargarMes(mesPrefix); // eslint-disable-next-line
  },[mesOff]);

  // Shorts del día seleccionado (cuentan para el objetivo) y vídeos/directos del día (informativos)
  const shortsDia = videos.filter(v=> v.type==="short" && v.date===diaKey && v.youtubeId);
  const otrosDia = videos.filter(v=> v.type!=="short" && v.date===diaKey && v.youtubeId);
  const refrescarLive = async () => {
    const ids = [...shortsDia, ...otrosDia].filter(v=>v.youtubeStatus==="published").map(v=>v.youtubeId);
    if(!ids.length) return;
    try { const m = await ytViewCounts(ids); setLiveViews(prev=>({...prev, ...m})); setLiveAt(Date.now()); } catch(e){}
  };
  // Desglose real de € del día por tipo de contenido (Shorts / Directos / Vídeos)
  const [tipoDia, setTipoDia] = useState({});
  useEffect(()=>{
    let vivo = true;
    if(!ytTokenValid() || diaKey > hoyKey || tipoDia[diaKey]) return;
    (async ()=>{
      try {
        const data = await ytAnalyticsQuery({ startDate:diaKey, endDate:diaKey, metrics:"views,estimatedRevenue", dimensions:"creatorContentType" });
        const out = {};
        (data.rows||[]).forEach(f=>{
          const t = String(f[0]||"").toUpperCase();
          const val = { views:Number(f[1])||0, rev:Number(f[2])||0 };
          if(t.includes("SHORT")) out.shorts = val;
          else if(t.includes("LIVE")) out.directos = val;
          else if(t.includes("DEMAND") || t.includes("VIDEO")) out.videos = val;
        });
        if(vivo) setTipoDia(m=>({...m, [diaKey]: out}));
      } catch(e){ if(vivo) setTipoDia(m=>({...m, [diaKey]: {}})); }
    })();
    return ()=>{ vivo = false; };
  // eslint-disable-next-line
  },[diaKey]);
  const refrescarLiveRef = useRef(refrescarLive); useEffect(()=>{ refrescarLiveRef.current = refrescarLive; });
  const refrescarRef = useRef(refrescar); useEffect(()=>{ refrescarRef.current = refrescar; });

  useEffect(()=>{
    if(ytTokenValid()){ refrescar(false); refrescarLive(); }
    else if(!ytIsConnected()) setErrorApi("conectar");
  // eslint-disable-next-line
  },[]);
  useEffect(()=>{ if(ytTokenValid()) refrescarLiveRef.current(); // eslint-disable-next-line
  },[diaOff]);
  // Actualización automática mientras el panel está abierto:
  // visitas en vivo cada 2 min · analíticas (ingresos/días) cada 10 min
  useEffect(()=>{
    const a = setInterval(()=>{ if(document.visibilityState==="visible" && ytTokenValid()) refrescarLiveRef.current(); }, 2*60*1000);
    const b = setInterval(()=>{ if(document.visibilityState==="visible" && ytTokenValid()) refrescarRef.current(false); }, 10*60*1000);
    return ()=>{ clearInterval(a); clearInterval(b); };
  },[]);

  const vistasDia = shortsDia.reduce((a,v)=>a+(liveViews[v.youtubeId]||0),0);

  // Semana: últimos 7 días (hoy incluido), con dinero por día
  const semana = Array.from({length:7},(_,i)=>{
    const d = new Date(hoy); d.setDate(d.getDate()-(6-i));
    const k = fechaISO(d);
    return { k, dia: d.toLocaleDateString("es-ES",{weekday:"short"}), num: d.getDate(),
      views: daily[k]?.views ?? null, rev: daily[k]?.revenue ?? null, esHoy: k===hoyKey };
  });
  const maxSemana = Math.max(objetivoDiaVistas||0, ...semana.map(s=>s.views||0), 1);

  // Mes seleccionado: totales y porcentajes (en modo estimado, € = visitas × RPM)
  const entradasMes = Object.entries(daily).filter(([k])=>k.startsWith(mesPrefix));
  const vistasMes = entradasMes.reduce((a,[,v])=>a+(v.views||0),0);
  const ingresosMesReal = entradasMes.reduce((a,[,v])=>a+(v.revenue||0),0);
  const ingresosMes = (estimado && rpm) ? vistasMes*rpm/1000 : ingresosMesReal;
  const pctEurMes = cfg.targetEur ? ingresosMes/cfg.targetEur*100 : null;
  const pctVistasMes = objetivoMesVistas ? vistasMes/objetivoMesVistas*100 : null;
  // Dinero de un día concreto según el modo activo
  const euroDia = (k) => {
    const d = daily[k];
    if(!d) return null;
    if(estimado && rpm && d.views!=null) return d.views*rpm/1000;
    return d.revenue!=null ? d.revenue : null;
  };
  const pref = estimado ? "≈ " : "";

  // Calendario del mes seleccionado
  const offsetLunes = (mesD.getDay()+6)%7;
  const celdas = [];
  for(let i=0;i<offsetLunes;i++) celdas.push(null);
  for(let d=1; d<=diasMesSel; d++){
    const k = `${mesPrefix}-${String(d).padStart(2,"0")}`;
    const views = daily[k]?.views ?? null;
    const pct = (views!=null && objetivoDiaMesSel) ? views/objetivoDiaMesSel*100 : null;
    celdas.push({ d, k, views, pct, futuro: k>hoyKey, esHoy: k===hoyKey });
  }

  const caja = { background:"var(--bg-2)", border:"1px solid var(--border)", borderRadius:14, padding:16 };
  const tituloZona = { fontSize:11.5, fontWeight:700, color:"var(--text-3)", textTransform:"uppercase", letterSpacing:".07em", marginBottom:11 };
  const btnNav = { width:26, height:26, borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", color:"var(--text-2)", border:"1px solid var(--border)", fontSize:13, flexShrink:0 };
  const Interruptor = ({activo, onToggle, etiqueta}) => (
    <button onClick={onToggle} title={(activo?"Desactivar":"Activar")+" "+etiqueta} style={{
      display:"inline-flex", alignItems:"center", gap:5, fontSize:10, fontWeight:600,
      color: activo?"var(--gold)":"var(--text-3)", border:"1px solid "+(activo?"var(--border-gold)":"var(--border)"),
      borderRadius:20, padding:"3px 9px", background: activo?"rgba(212,175,55,0.07)":"transparent", transition:"all .15s"
    }}>
      <span style={{width:6,height:6,borderRadius:"50%",background:activo?"var(--gold)":"var(--text-3)",transition:"background .15s"}}/>
      {etiqueta}
    </button>
  );

  return (
    <div className="fade-in" style={{display:"flex",flexDirection:"column",gap:14}}>
      {/* ——— Configuración / resumen del objetivo ——— */}
      <div style={caja}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,flexWrap:"wrap"}}>
          <div>
            <div style={tituloZona}>Objetivo económico</div>
            <div style={{display:"flex",alignItems:"baseline",gap:10,flexWrap:"wrap"}}>
              <span style={{fontSize:26,fontWeight:800,fontFamily:"'Sora'",color:"var(--gold)"}}>{eur(cfg.targetEur)}</span>
              <span style={{fontSize:12.5,color:"var(--text-2)"}}>al mes · {cfg.shortsPerDay} Shorts/día</span>
            </div>
            <div style={{fontSize:12,color:"var(--text-3)",marginTop:6,lineHeight:1.6}}>
              {rpm ? <>
                Con tu RPM {rpmOrigen} de <b style={{color:"var(--text-2)"}}>{rpm.toLocaleString("es-ES",{maximumFractionDigits:3})} €/1.000</b> necesitas{" "}
                <b style={{color:"var(--text-2)"}}>{nfc.format(objetivoMesVistas)}</b> visitas/mes · <b style={{color:"var(--text-2)"}}>{nf.format(objetivoDiaVistas)}</b>/día · <b style={{color:"var(--text-2)"}}>{nf.format(objetivoShort)}</b> por Short
                {cfg.rpmManual==null && rpmInfo && rpmInfo.at ? <span> · RPM calculado con la API ({new Date(rpmInfo.at).toLocaleDateString("es-ES",{day:"numeric",month:"short"})})</span> : null}
              </> : "Refresca las analíticas para calcular tu RPM real, o fija un RPM manual."}
            </div>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <button onClick={()=>setEstimado(x=>!x)} title={estimado?"Mostrando ingresos ESTIMADOS (visitas × tu RPM, al momento). Pulsa para ver los reales de la API":"Mostrando ingresos REALES de la API (~2 días de retraso). Pulsa para ver estimaciones al momento"} style={{
              fontSize:12,fontWeight:700,color: estimado?"var(--gold)":"var(--green)",
              border:"1px solid "+(estimado?"var(--border-gold)":"rgba(74,222,128,0.4)"),borderRadius:9,padding:"8px 12px",
              background: estimado?"rgba(212,175,55,0.05)":"rgba(74,222,128,0.06)", transition:"all .15s"
            }}>{estimado?"≈ Estimado":"Real"}</button>
            <button onClick={()=>{ setFTarget(String(cfg.targetEur)); setFShorts(String(cfg.shortsPerDay)); setFRpm(cfg.rpmManual!=null?String(cfg.rpmManual):""); setEditCfg(e=>!e); }} style={{
              fontSize:12,fontWeight:600,color:"var(--text-2)",border:"1px solid var(--border)",borderRadius:9,padding:"8px 12px"
            }}>{editCfg?"Cerrar":"Editar"}</button>
            <button onClick={()=>{ refrescar(true); refrescarLive(); }} disabled={cargando} style={{
              display:"flex",alignItems:"center",gap:6,fontSize:12,fontWeight:600,color:"var(--gold)",
              border:"1px solid var(--border-gold)",borderRadius:9,padding:"8px 12px",background:"rgba(212,175,55,0.05)",opacity:cargando?0.6:1
            }}><span className={cargando?"spinning":""} style={{display:"flex"}}>{Icons.refresh}</span>{cargando?"Leyendo…":"Refrescar"}</button>
          </div>
        </div>

        {editCfg && (
          <div className="fade-in" style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:14,alignItems:"flex-end"}}>
            <div style={{flex:"1 1 120px"}}><Field label="Objetivo € / mes"><input value={fTarget} onChange={e=>setFTarget(e.target.value)} inputMode="decimal" style={inputStyle}/></Field></div>
            <div style={{flex:"1 1 120px"}}><Field label="Shorts al día"><input value={fShorts} onChange={e=>setFShorts(e.target.value)} inputMode="numeric" style={inputStyle}/></Field></div>
            <div style={{flex:"1 1 160px"}}><Field label="RPM manual (vacío = usar el real)"><input value={fRpm} onChange={e=>setFRpm(e.target.value)} placeholder={rpmInfo?.shorts?.rpm ? rpmInfo.shorts.rpm.toLocaleString("es-ES",{maximumFractionDigits:3}) : "p. ej. 0,06"} inputMode="decimal" style={inputStyle}/></Field></div>
            <button onClick={guardarCfg} className="grad-gold" style={{color:"#000",fontWeight:700,fontSize:13,padding:"10px 18px",borderRadius:9}}>Guardar</button>
          </div>
        )}

        {errorApi && (
          <div className="fade-in" style={{marginTop:12,padding:"11px 13px",background:"rgba(212,175,55,0.07)",border:"1px solid var(--border-gold)",borderRadius:10,fontSize:12.5,color:"var(--text-2)",lineHeight:1.6}}>
            {errorApi==="off" ? <>
              Falta activar <b>YouTube Analytics API</b> en tu proyecto de Google (1 clic):{" "}
              <a href="https://console.cloud.google.com/apis/library/youtubeanalytics.googleapis.com" target="_blank" rel="noopener" style={{color:"var(--gold)",fontWeight:600}}>abrir Google Cloud → pulsa «Habilitar»</a>. Después vuelve y pulsa «Refrescar».
            </> : errorApi==="permisos" ? <>
              Google necesita tu permiso para leer las analíticas.{" "}
              <button onClick={onConnect} style={{color:"var(--gold)",fontWeight:700}}>Reconectar con Google</button> y acepta los permisos nuevos.
            </> : errorApi==="conectar" ? <>
              <button onClick={onConnect} style={{color:"var(--gold)",fontWeight:700}}>Conecta con Google</button> para leer visitas e ingresos reales.
            </> : <>⚠ {errorApi}</>}
          </div>
        )}
      </div>

      {/* ——— DÍA: los Shorts del día seleccionado ——— */}
      <div style={caja}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:11,gap:10,flexWrap:"wrap"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <button style={btnNav} onClick={()=>setDiaOff(d=>d-1)} title="Día anterior">←</button>
            <div style={{...tituloZona, marginBottom:0}}>
              {esHoySel ? "Hoy · " : ""}{diaSelD.toLocaleDateString("es-ES",{weekday:"long",day:"numeric",month:"long"})}
            </div>
            <button style={btnNav} onClick={()=>setDiaOff(d=>d+1)} title="Día siguiente">→</button>
            {!esHoySel && <button onClick={()=>setDiaOff(0)} style={{fontSize:11,fontWeight:700,color:"var(--gold)",border:"1px solid var(--border-gold)",borderRadius:8,padding:"4px 10px"}}>Hoy</button>}
          </div>
          {liveAt>0 && <span style={{fontSize:10.5,color:"var(--text-3)"}}>visitas en vivo · {new Date(liveAt).toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"})}</span>}
        </div>
        {shortsDia.length===0 ? (
          <div style={{fontSize:12.5,color:"var(--text-3)",padding:"8px 0"}}>
            {esHoySel ? `Hoy todavía no hay Shorts subidos ni programados. ${cfg.shortsPerDay} al día es tu plan.` : "Ese día no tiene Shorts en el calendario."}
          </div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {shortsDia.map(v=>{
              const vistas = liveViews[v.youtubeId];
              const publicado = v.youtubeStatus==="published";
              const pct = (publicado && objetivoShortSel && vistas!=null) ? vistas/objetivoShortSel*100 : 0;
              return (
                <div key={v.id}>
                  <div style={{display:"flex",justifyContent:"space-between",gap:10,fontSize:12.5,marginBottom:5}}>
                    <span style={{color:"var(--text)",fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0}}>{v.title}</span>
                    <span style={{color: pct>=100?"var(--green)":"var(--text-2)",flexShrink:0,fontWeight:600}}>
                      {publicado
                        ? (vistas!=null ? `${nf.format(vistas)}${objetivoShortSel?` / ${nf.format(objetivoShortSel)} (${Math.round(pct)}%)`:""}${(estimado && rpm) ? ` · ≈ ${(vistas*rpm/1000).toLocaleString("es-ES",{minimumFractionDigits:2,maximumFractionDigits:2})} €` : ""}` : "…")
                        : `programado · ${v.time||""}`}
                    </span>
                  </div>
                  <BarraProgreso pct={pct}/>
                </div>
              );
            })}
            {objetivoDiaSel && (
              <div style={{marginTop:2,paddingTop:12,borderTop:"1px solid var(--border)"}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:12.5,marginBottom:5}}>
                  <span style={{fontWeight:700,color:"var(--text-2)"}}>Total del día (solo Shorts)</span>
                  <span style={{fontWeight:700,color: vistasDia>=objetivoDiaSel?"var(--green)":"var(--text-2)"}}>{nf.format(vistasDia)} / {nf.format(objetivoDiaSel)} ({Math.round(vistasDia/objetivoDiaSel*100)}%)</span>
                </div>
                <BarraProgreso pct={vistasDia/objetivoDiaSel*100} alto={10}/>
              </div>
            )}
          </div>
        )}

        {/* Vídeos y directos del día: se ven, pero no cuentan en el objetivo de Shorts */}
        {otrosDia.length>0 && (
          <div style={{marginTop:14,paddingTop:12,borderTop:"1px dashed var(--border)"}}>
            <div style={{fontSize:10.5,fontWeight:700,color:"var(--text-3)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:8}}>Vídeos y directos del día (fuera del objetivo)</div>
            <div style={{display:"flex",flexDirection:"column",gap:7}}>
              {otrosDia.map(v=>{
                const vistas = liveViews[v.youtubeId];
                const esDir = v.type==="directo";
                return (
                  <div key={v.id} style={{display:"flex",alignItems:"center",gap:9,fontSize:12.5}}>
                    <span style={{display:"flex",color: esDir?"var(--gold)":"var(--text-3)",flexShrink:0}}>{esDir?Icons.live:Icons.largo}</span>
                    <span style={{fontSize:9.5,fontWeight:700,color:esDir?"var(--gold)":"var(--text-3)",border:"1px solid "+(esDir?"var(--border-gold)":"var(--border)"),borderRadius:20,padding:"1px 7px",flexShrink:0}}>{esDir?"DIRECTO":"VÍDEO"}</span>
                    <span style={{color:"var(--text)",fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1,minWidth:0}}>{v.title}</span>
                    <span style={{color:"var(--text-2)",flexShrink:0,fontWeight:600}}>
                      {v.youtubeStatus==="published" ? (vistas!=null ? nf.format(vistas)+" visitas" : "…") : ("programado · "+(v.time||""))}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Dinero del día por tipo de contenido */}
        {diaKey<=hoyKey && (()=>{
          const td = tipoDia[diaKey];
          const fmE = (x)=> x==null ? "—" : x.toLocaleString("es-ES",{minimumFractionDigits:2, maximumFractionDigits:2})+" €";
          // Shorts: real del día si la API ya lo tiene; si no, estimación con las vistas en vivo
          const eShortsReal = td && td.shorts ? td.shorts.rev : null;
          const eShorts = eShortsReal!=null ? eShortsReal : ((estimado && rpm && vistasDia>0) ? vistasDia*rpm/1000 : null);
          const marcaShorts = eShortsReal!=null ? "" : "≈ ";
          const eDirectos = td && td.directos ? td.directos.rev : null;
          const eVideos = td && td.videos ? td.videos.rev : null;
          return (
            <div style={{display:"flex",gap:16,flexWrap:"wrap",alignItems:"center",fontSize:11.5,color:"var(--text-3)",marginTop:14,paddingTop:11,borderTop:"1px solid var(--border)"}}>
              <span style={{fontWeight:700,color:"var(--text-2)"}}>💰 Dinero del día:</span>
              <span>Shorts <b style={{color:"var(--gold)"}}>{eShorts!=null ? marcaShorts+fmE(eShorts) : "—"}</b></span>
              <span>Directos <b style={{color:"var(--text-2)"}}>{fmE(eDirectos)}</b></span>
              <span>Vídeos <b style={{color:"var(--text-2)"}}>{fmE(eVideos)}</b></span>
              {(!td || (!td.shorts && !td.directos && !td.videos)) && <span style={{fontSize:10}}>(la API reparte el € por tipo con ~2 días de retraso)</span>}
            </div>
          );
        })()}
      </div>

      {/* ——— SEMANA: visitas y dinero por día ——— */}
      <div style={caja}>
        <div style={tituloZona}>Última semana · visitas y € del canal por día{objetivoDiaVistas?` (línea = objetivo ${nfc.format(objetivoDiaVistas)})`:""}</div>
        <div style={{display:"flex",gap:8,alignItems:"flex-end",height:118,position:"relative"}}>
          {objetivoDiaVistas && <div style={{position:"absolute",left:0,right:0,bottom:(Math.min(1,objetivoDiaVistas/maxSemana)*80)+"px",borderTop:"1.5px dashed var(--border-gold)",opacity:.7}}/>}
          {semana.map(s=>{
            const h = s.views!=null ? Math.max(3, s.views/maxSemana*80) : 3;
            const pctDia = (objetivoDiaVistas && s.views!=null) ? s.views/objetivoDiaVistas*100 : null;
            const cumple = pctDia!=null && pctDia>=100;
            const dinero = euroDia(s.k);
            return (
              <div key={s.k} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}} title={(s.views!=null?nf.format(s.views)+" visitas":"sin datos aún")+(pctDia!=null?` · ${Math.round(pctDia)}%`:"")+(dinero!=null?" · "+pref+eur(dinero):"")}>
                <span style={{fontSize:10,color: cumple?"var(--green)":"var(--text-3)",fontWeight:600}}>{s.views!=null?nfc.format(s.views):"—"}</span>
                <div style={{width:"100%",maxWidth:34,height:h,borderRadius:5,transition:"background .4s",
                  background: pctDia!=null ? rgbaDePct(pctDia, .9) : "var(--card-2)",
                  border:"1px solid "+(s.esHoy?"var(--border-gold)":(pctDia!=null?"transparent":"var(--border)"))}}/>
                <span style={{fontSize:10,color:s.esHoy?"var(--gold)":"var(--text-3)",fontWeight:s.esHoy?700:400}}>{s.dia} {s.num}</span>
                <span style={{fontSize:9,color:"var(--text-3)"}}>{dinero!=null ? pref+eur(dinero) : "—"}</span>
              </div>
            );
          })}
        </div>
        <div style={{fontSize:10.5,color:"var(--text-3)",marginTop:8}}>Las visitas y los ingresos de la API cierran con ~2 días de retraso: los últimos días pueden crecer todavía.</div>
      </div>

      {/* ——— MES seleccionado + calendario con progreso visual ——— */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(280px, 1fr))",gap:14}}>
        <div style={caja}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:11}}>
            <button style={btnNav} onClick={()=>setMesOff(m=>m-1)} title="Mes anterior">←</button>
            <div style={{...tituloZona, marginBottom:0, flex:1, textAlign:"center"}}>{mesD.toLocaleDateString("es-ES",{month:"long",year:"numeric"})}</div>
            <button style={btnNav} onClick={()=>setMesOff(m=>m+1)} title="Mes siguiente">→</button>
            {mesOff!==0 && <button onClick={()=>setMesOff(0)} style={{fontSize:11,fontWeight:700,color:"var(--gold)",border:"1px solid var(--border-gold)",borderRadius:8,padding:"4px 10px"}}>Actual</button>}
          </div>
          {mesFuturo ? (
            <div style={{fontSize:12.5,color:"var(--text-3)",padding:"14px 0"}}>Este mes aún no ha empezado.</div>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:12.5,marginBottom:5}}>
                  <span style={{fontWeight:600,color:"var(--text-2)"}}>{estimado?"Ingresos estimados":"Ingresos reales"}</span>
                  <span style={{fontWeight:700,color: ingresosMes>=cfg.targetEur?"var(--green)":"var(--text)"}}>{pref}{eur(ingresosMes)} / {eur(cfg.targetEur)}{pctEurMes!=null?` (${Math.round(pctEurMes)}%)`:""}</span>
                </div>
                <BarraProgreso pct={pctEurMes||0} alto={10}/>
                <div style={{fontSize:10.5,color:"var(--text-3)",marginTop:5}}>
                  {estimado
                    ? "Estimación al vuelo: visitas × tu RPM. Pulsa «Real» arriba para ver lo que reporta YouTube."
                    : (mesOff===0 ? "Lo que reporta YouTube: llega con ~2 días de retraso y se ajusta a final de mes." : "Lo que reportó YouTube ese mes.")}
                </div>
              </div>
              {objetivoMesVistas && (
                <div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:12.5,marginBottom:5}}>
                    <span style={{fontWeight:600,color:"var(--text-2)"}}>Visitas del mes</span>
                    <span style={{fontWeight:700,color: vistasMes>=objetivoMesVistas?"var(--green)":"var(--text)"}}>{nfc.format(vistasMes)} / {nfc.format(objetivoMesVistas)}{pctVistasMes!=null?` (${Math.round(pctVistasMes)}%)`:""}</span>
                  </div>
                  <BarraProgreso pct={pctVistasMes||0} alto={10}/>
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{...caja, position:"relative", overflow:"hidden"}}>
          {/* Progreso del MES por detrás de los días: sube de abajo hacia arriba según el % del objetivo económico */}
          {colorMes && !mesFuturo && pctEurMes!=null && (
            <div style={{
              position:"absolute", inset:0, pointerEvents:"none",
              background:`linear-gradient(to top, ${rgbaDePct(pctEurMes, .2)} 0%, ${rgbaDePct(pctEurMes, .2)} ${Math.min(100,pctEurMes)}%, transparent ${Math.min(100,Math.max(0,pctEurMes)+7)}%)`,
              transition:"background 1s ease"
            }}/>
          )}
          <div style={{position:"relative"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginBottom:11,flexWrap:"wrap"}}>
              <div style={{...tituloZona, marginBottom:0}}>Calendario del mes{colorMes && !mesFuturo && pctEurMes!=null ? ` · ${Math.round(pctEurMes)}% del objetivo €` : ""}</div>
              <div style={{display:"flex",gap:5}}>
                <Interruptor activo={colorDia} onToggle={()=>setColorDia(x=>!x)} etiqueta="color diario"/>
                <Interruptor activo={colorMes} onToggle={()=>setColorMes(x=>!x)} etiqueta="color mensual"/>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(7,minmax(0,1fr))",gap:4}}>
              {["L","M","X","J","V","S","D"].map(dl=><div key={dl} style={{fontSize:9.5,color:"var(--text-3)",textAlign:"center",fontWeight:700}}>{dl}</div>)}
              {celdas.map((c,i)=>{
                const p = c && c.pct!=null ? Math.min(100, Math.max(0, c.pct)) : null;
                const rev = c ? euroDia(c.k) : null;
                return (
                  <div key={i}
                    onClick={()=>{
                      if(!c) return;
                      // Ir a ese día en la vista diaria de arriba
                      const hoy0 = new Date(); hoy0.setHours(0,0,0,0);
                      const destino = new Date(c.k+"T00:00");
                      setDiaOff(Math.round((destino-hoy0)/86400000));
                    }}
                    style={{
                    minHeight:48, borderRadius:7, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:2,
                    cursor: c ? "pointer" : "default",
                    // Fondo OPACO (el degradado del mes no se ve a través de los días) + relleno del día encima
                    backgroundColor: c ? "var(--card)" : "transparent",
                    backgroundImage: (colorDia && c && !c.futuro && p!=null)
                      ? `linear-gradient(to top, ${rgbaDePct(c.pct, .45)} ${p}%, transparent ${p}%)`
                      : "none",
                    transition:"background .4s, border-color .15s",
                    border: c&&c.esHoy ? "1.5px solid var(--gold)" : "1px solid "+(c&&!c.futuro?"var(--border)":(c?"rgba(255,255,255,0.05)":"transparent"))
                  }}
                    onMouseEnter={e=>{ if(c) e.currentTarget.style.borderColor="var(--border-gold)"; }}
                    onMouseLeave={e=>{ if(c) e.currentTarget.style.borderColor = c.esHoy?"var(--gold)":(!c.futuro?"var(--border)":"rgba(255,255,255,0.05)"); }}
                    title={(c&&c.views!=null?nf.format(c.views)+" visitas"+(c.pct!=null?` · ${Math.round(c.pct)}%`:"")+(rev!=null?` · ${pref}${eur(rev)}`:"")+" · ":"")+(c?"clic para ver el día":"")}>
                    <span style={{fontSize:10.5, fontWeight: c&&c.esHoy?800:600, color: c ? (c.futuro?"var(--text-3)":"var(--text)") : "transparent", lineHeight:1}}>{c?c.d:""}</span>
                    {c && !c.futuro && (
                      <span style={{fontSize:8.5, fontWeight:700, lineHeight:1, color: c.pct==null?"var(--text-3)":(c.pct>=100?"var(--green)":"var(--text-2)")}}>
                        {c.pct==null ? "—" : Math.round(c.pct)+"%"}
                      </span>
                    )}
                    {c && !c.futuro && (
                      <span style={{fontSize:8, fontWeight:600, lineHeight:1, color:"var(--text-3)"}}>
                        {rev!=null ? pref+rev.toLocaleString("es-ES",{minimumFractionDigits:2, maximumFractionDigits:2})+"€" : ""}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{display:"flex",gap:12,marginTop:10,fontSize:10,color:"var(--text-3)",flexWrap:"wrap"}}>
              <span><span style={{display:"inline-block",width:9,height:9,borderRadius:3,background:"rgba(248,113,113,0.5)",marginRight:4}}/>0–50%</span>
              <span><span style={{display:"inline-block",width:9,height:9,borderRadius:3,background:"rgba(212,175,55,0.5)",marginRight:4}}/>50–100%</span>
              <span><span style={{display:"inline-block",width:9,height:9,borderRadius:3,background:"rgba(74,222,128,0.5)",marginRight:4}}/>≥100%</span>
              <span style={{opacity:.8}}>el relleno de cada día sube con su %; el fondo del bloque avanza con el mes</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================ COMENTARIOS: gestor con filtros y respuesta con IA ============================ */
export function ComentariosPanel({ videos, onConnect, toast }) {
  const [hilos, setHilos] = useState([]);
  const [nextPage, setNextPage] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const [filtro, setFiltro] = useState("todos"); // todos | sinresponder | preguntas
  const [busca, setBusca] = useState("");
  const [abierto, setAbierto] = useState(null); // hilo con la caja de respuesta abierta
  const [respuesta, setRespuesta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  const tituloDe = (videoId) => (videos.find(v=>v.youtubeId===videoId)?.title) || "";

  const cargar = async (token) => {
    if(!ytIsConnected()){ setError("conectar"); return; }
    setCargando(true); setError(null);
    try {
      const r = await ytListChannelComments(token||undefined);
      setHilos(h=> token ? [...h, ...r.items] : r.items);
      setNextPage(r.nextPageToken);
    } catch(e){ setError(e.message); }
    finally { setCargando(false); }
  };
  useEffect(()=>{ if(ytTokenValid()) cargar(); else if(!ytIsConnected()) setError("conectar"); // eslint-disable-next-line
  },[]);

  const visibles = hilos
    .filter(h=> filtro==="sinresponder" ? !h.yaRespondido : (filtro==="preguntas" ? h.texto.includes("?") : true))
    .filter(h=> !busca || h.texto.toLowerCase().includes(busca.toLowerCase()) || h.autor.toLowerCase().includes(busca.toLowerCase()));
  const sinResponder = hilos.filter(h=>!h.yaRespondido).length;

  const generarIA = async (h) => {
    if(!geminiHasKey()){ toast("Configura la IA (Gemini) en el apartado Agente"); return; }
    setAiBusy(true);
    try {
      const prompt = `Eres RDeRandom, youtuber español de RIVALS (Roblox), cercano y con humor. Responde BREVE (1-2 frases, puedes usar 1 emoji) a este comentario de ${h.autor} en tu vídeo «${tituloDe(h.videoId)||"un vídeo"}»: "${h.texto}". Devuelve solo la respuesta, sin comillas.`;
      const out = await geminiGenerate(prompt);
      setRespuesta((out||"").trim());
    } catch(e){ toast("❌ "+e.message); }
    finally { setAiBusy(false); }
  };

  const enviar = async (h) => {
    const txt = respuesta.trim();
    if(!txt){ toast("Escribe la respuesta"); return; }
    setEnviando(true);
    try {
      await ytReplyComment(h.id, txt);
      setHilos(hs=>hs.map(x=>x.id===h.id?{...x, yaRespondido:true, totalRespuestas:x.totalRespuestas+1}:x));
      setAbierto(null); setRespuesta("");
      toast("💬 Respuesta publicada en YouTube");
    } catch(e){ toast("❌ "+e.message); }
    finally { setEnviando(false); }
  };

  const chip = (id, etiqueta, n) => (
    <button key={id} onClick={()=>setFiltro(id)} style={{
      fontSize:11.5, fontWeight:700, padding:"6px 13px", borderRadius:20,
      border:"1px solid "+(filtro===id?"var(--border-gold)":"var(--border)"),
      color: filtro===id?"var(--gold)":"var(--text-2)", background: filtro===id?"rgba(212,175,55,0.08)":"transparent"
    }}>{etiqueta}{n!=null?` · ${n}`:""}</button>
  );

  return (
    <div className="fade-in">
      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginBottom:14}}>
        {chip("todos","Todos", hilos.length)}
        {chip("sinresponder","Sin responder", sinResponder)}
        {chip("preguntas","Preguntas")}
        <input value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Buscar comentario o autor…" style={{...inputStyle, maxWidth:230, padding:"7px 11px", fontSize:12}}/>
        <button onClick={()=>cargar()} disabled={cargando} style={{display:"flex",alignItems:"center",gap:6,fontSize:12,fontWeight:600,color:"var(--gold)",border:"1px solid var(--border-gold)",borderRadius:9,padding:"7px 11px",background:"rgba(212,175,55,0.05)",opacity:cargando?0.6:1,marginLeft:"auto"}}>
          <span className={cargando?"spinning":""} style={{display:"flex"}}>{Icons.refresh}</span>{cargando?"Leyendo…":"Refrescar"}
        </button>
      </div>

      {error==="conectar" ? (
        <div style={{textAlign:"center",padding:"40px 16px",border:"1px dashed var(--border)",borderRadius:14,fontSize:13,color:"var(--text-2)"}}>
          <button onClick={onConnect} style={{color:"var(--gold)",fontWeight:700}}>Conecta con Google</button> para leer y responder los comentarios de tu canal.
        </div>
      ) : error ? (
        <div style={{padding:"12px 14px",background:"rgba(248,113,113,0.08)",border:"1px solid rgba(248,113,113,0.3)",borderRadius:11,fontSize:12.5,color:"var(--red)"}}>⚠ {error}</div>
      ) : hilos.length===0 && !cargando ? (
        <div style={{textAlign:"center",padding:"40px 16px",border:"1px dashed var(--border)",borderRadius:14,fontSize:13,color:"var(--text-3)"}}>Sin comentarios todavía.</div>
      ) : (
        <div style={{display:"flex",flexDirection:"column",gap:9}}>
          {visibles.map(h=>{
            const titulo = tituloDe(h.videoId);
            return (
              <div key={h.id} style={{padding:"12px 14px",background:"var(--bg-2)",border:"1px solid "+(h.yaRespondido?"var(--border)":"rgba(212,175,55,0.35)"),borderRadius:12}}>
                <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                  {h.autorImg ? <img src={h.autorImg} alt="" style={{width:32,height:32,borderRadius:"50%",flexShrink:0}}/> : <div style={{width:32,height:32,borderRadius:"50%",background:"var(--card)",flexShrink:0}}/>}
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",gap:9,alignItems:"baseline",flexWrap:"wrap"}}>
                      <span style={{fontSize:12.5,fontWeight:700,color:"var(--text)"}}>{h.autor}</span>
                      {h.fecha && <span style={{fontSize:10.5,color:"var(--text-3)"}}>{new Date(h.fecha).toLocaleDateString("es-ES",{day:"numeric",month:"short"})} · {new Date(h.fecha).toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"})}</span>}
                      {h.likes>0 && <span style={{fontSize:10.5,color:"var(--text-3)"}}>👍 {h.likes}</span>}
                      {h.yaRespondido
                        ? <span style={{fontSize:10.5,fontWeight:700,color:"var(--green)"}}>✓ respondido</span>
                        : <span style={{fontSize:10.5,fontWeight:700,color:"var(--gold)"}}>● sin responder</span>}
                    </div>
                    {titulo && <div style={{fontSize:10.5,color:"var(--text-3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginTop:1}}>en: {titulo}</div>}
                    <div style={{fontSize:13,color:"var(--text-2)",marginTop:5,lineHeight:1.5,overflowWrap:"anywhere"}}>{h.texto}</div>
                    <div style={{display:"flex",gap:8,marginTop:8,flexWrap:"wrap"}}>
                      <button onClick={()=>{ setAbierto(abierto===h.id?null:h.id); setRespuesta(""); }} style={{fontSize:11.5,fontWeight:600,color:"var(--gold)",border:"1px solid var(--border-gold)",borderRadius:8,padding:"5px 11px",background:"rgba(212,175,55,0.05)"}}>
                        {abierto===h.id?"Cerrar":"Responder"}
                      </button>
                      <a href={"https://www.youtube.com/watch?v="+h.videoId+"&lc="+h.id} target="_blank" rel="noopener" style={{fontSize:11.5,fontWeight:600,color:"var(--text-3)",border:"1px solid var(--border)",borderRadius:8,padding:"5px 11px"}}>Ver en YouTube</a>
                    </div>
                    {abierto===h.id && (
                      <div className="fade-in" style={{marginTop:10}}>
                        <textarea value={respuesta} onChange={e=>setRespuesta(e.target.value)} rows={2} placeholder="Tu respuesta…" style={{...inputStyle,fontSize:12.5,lineHeight:1.5}}/>
                        <div style={{display:"flex",gap:8,marginTop:7,justifyContent:"flex-end"}}>
                          <button onClick={()=>generarIA(h)} disabled={aiBusy} style={{display:"flex",alignItems:"center",gap:6,fontSize:11.5,fontWeight:600,color:"var(--gold)",border:"1px solid var(--border-gold)",borderRadius:8,padding:"6px 12px",background:"rgba(212,175,55,0.05)",opacity:aiBusy?0.6:1}}>
                            <span className={aiBusy?"spinning":""} style={{display:"flex"}}>{Icons.sparkles}</span>{aiBusy?"Pensando…":"Borrador con IA"}
                          </button>
                          <button onClick={()=>enviar(h)} disabled={enviando || !respuesta.trim()} className="grad-gold" style={{fontSize:12,fontWeight:700,color:"#000",borderRadius:8,padding:"6px 16px",opacity:(enviando||!respuesta.trim())?0.6:1}}>
                            {enviando?"Enviando…":"Responder"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {nextPage && (
            <button onClick={()=>cargar(nextPage)} disabled={cargando} style={{fontSize:12.5,fontWeight:600,color:"var(--text-2)",border:"1px solid var(--border)",borderRadius:10,padding:"10px 16px",opacity:cargando?0.6:1}}>
              {cargando?"Cargando…":"Cargar más comentarios"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function ScheduledView({ videos, trashYtIds, onOpen, onUpdateVideo, onAddVideos, subHistory, onRecordSubs, onConnect, formats, toast, goals, setGoals }) {
  const [checking, setChecking] = useState(false);
  const [statusMap, setStatusMap] = useState({}); // videoId -> {exists, privacyStatus, publishAt}
  const [deleting, setDeleting] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [downloadFor, setDownloadFor] = useState(null); // vídeo a descargar (modal de calidad)

  // Sub-pestañas: Objetivos / Shorts / Directos / Vídeos
  const [ytTab, setYtTab] = useState(()=>{ try { return localStorage.getItem("rds_yt_tab")||"objetivos"; } catch(e){ return "objetivos"; } });
  useEffect(()=>{ try { localStorage.setItem("rds_yt_tab", ytTab); } catch(e){} },[ytTab]);
  const [busca, setBusca] = useState("");
  const [fmtFiltro, setFmtFiltro] = useState("");
  const [abiertos, setAbiertos] = useState({}); // filas expandidas (id → true)

  // Vídeos que tienen relación con YouTube
  const ytVideos = videos.filter(v=>v.youtubeId);
  const vTipo = (v) => v.type==="directo" ? "directo" : (v.type==="short" ? "short" : "video");

  const refresh = async () => {
    if(!ytIsConnected()){ toast("Conecta con Google desde un vídeo para comprobar el estado"); return; }
    setChecking(true);
    try {
      // ——— A) Estado de los vídeos ya vinculados ———
      const ids = ytVideos.map(v=>v.youtubeId);
      let cleared = 0;
      let justPublished = [];
      if(ids.length>0){
        const map = await ytCheckVideos(ids);
        setStatusMap(map);
        ytVideos.forEach(v=>{
          const st = map[v.youtubeId];
          if(st && st.exists===false){ onUpdateVideo(v.id, { youtubeId:null, youtubeStatus:null, youtubeUrl:null }); cleared++; }
          else if(st && st.exists){
            // youtubeStatus interno: published (público) | scheduled (programado) | uploaded (subido/privado)
            const ns = st.privacyStatus==="public" ? "published" : (st.publishAt ? "scheduled" : "uploaded");
            // status del tablero: se mueve automáticamente a Publicado o Programado
            const boardStatus = st.privacyStatus==="public" ? "publicado" : (st.publishAt ? "programado" : null);
            const patch = {};
            if(ns!==v.youtubeStatus) patch.youtubeStatus = ns;
            if(boardStatus && boardStatus!==v.status) patch.status = boardStatus;
            // Corregir el tipo real (los directos importados antes figuraban como "vídeo")
            const tipoReal = st.live ? "directo" : (st.durationSec>0 && st.durationSec<=183 ? "short" : "video");
            if(tipoReal !== v.type){
              patch.type = tipoReal;
              patch.durationSec = st.durationSec||0;
              if(tipoReal==="directo") patch.format = "directos";
            }
            // Fecha y hora REALES de YouTube (programación o publicación):
            // si las cambias en YouTube, el calendario se actualiza solo
            const cuando = st.publishAt || st.publishedAt;
            if(cuando){
              const wd = new Date(cuando);
              const p2 = n=>String(n).padStart(2,"0");
              const nd = `${wd.getFullYear()}-${p2(wd.getMonth()+1)}-${p2(wd.getDate())}`;
              const nt = `${p2(wd.getHours())}:${p2(wd.getMinutes())}`;
              if(nd!==v.date || nt!==v.time){ patch.date = nd; patch.time = nt; }
            }
            // Está en YouTube → checklist completa
            if(Array.isArray(v.checklist) && v.checklist.some(c=>!c.done)){
              patch.checklist = v.checklist.map(c=>({...c, done:true}));
            }
            // ¿Se acaba de publicar un vídeo que estaba programado? → avisar
            if(ns==="published" && v.youtubeStatus==="scheduled"){
              justPublished.push({...v, ...patch});
              patch.notifiedPublished = true;
            }
            if(Object.keys(patch).length) onUpdateVideo(v.id, patch);
          }
        });
        // Notificaciones + comentario fijado pendiente de los recién publicados
        for(const v of justPublished){
          fireNotification("🎉 ¡Vídeo publicado!", "«"+(v.title||"Tu vídeo")+"» ya está disponible en YouTube");
          if(v.pinnedComment && !v.pinnedCommentPosted){
            try {
              await ytPostComment(v.youtubeId, v.pinnedComment);
              onUpdateVideo(v.id, { pinnedCommentPosted: true });
              toast("💬 Comentario publicado en «"+(v.title||"el vídeo")+"»");
            } catch(e){ toast("⚠ Comentario pendiente en «"+(v.title||"el vídeo")+"»: "+e.message); }
          }
        }
      }

      // ——— B) IMPORTAR vídeos subidos directamente en YouTube (no desde la app) ———
      let imported = 0;
      try {
        // v3: la primera vez se trae TODO el historial del canal (antes solo los 150
        // últimos: el Studio conocía 160 de sus 537 Shorts); luego, los 150 últimos
        let completo = false;
        try { completo = localStorage.getItem("rds_import_completo")==="1"; } catch(e){}
        const uploads = await ytListUploadsFull(completo ? 150 : Infinity);
        if(!completo){ try { localStorage.setItem("rds_import_completo","1"); } catch(e){} }
        const known = new Set([
          ...videos.map(v=>v.youtubeId).filter(Boolean),
          ...(trashYtIds||[])
        ]);
        const nuevos = uploads.filter(u=>!known.has(u.id)).map(u=>{
          // Fecha y hora locales: si está programado usamos publishAt; si no, publishedAt
          const when = new Date(u.publishAt || u.publishedAt || Date.now());
          const p = n=>String(n).padStart(2,"0");
          const date = `${when.getFullYear()}-${p(when.getMonth()+1)}-${p(when.getDate())}`;
          const time = `${p(when.getHours())}:${p(when.getMinutes())}`;
          const esPublico = u.privacyStatus==="public";
          const tipo = u.live ? "directo" : ((u.durationSec>0 && u.durationSec<=183) ? "short" : "video");
          const base = makeVideo({ title:u.title, date, time }, formats);
          return {
            ...base,
            format: clasificarFormato(u.title, tipo), // "" si no se detecta
            type: tipo,
            durationSec: u.durationSec||0,
            // Ya está en YouTube → el trabajo de producción está hecho
            checklist: base.checklist.map(c=>({...c, done:true})),
            status: esPublico ? "publicado" : (u.publishAt ? "programado" : "edicion"),
            youtubeId: u.id,
            youtubeUrl: "https://youtu.be/"+u.id,
            youtubeStatus: esPublico ? "published" : (u.publishAt ? "scheduled" : "uploaded"),
            importedFromYT: true
          };
        });
        if(nuevos.length>0){ onAddVideos(nuevos); imported = nuevos.length; }
      } catch(e){ /* la importación no debe romper la comprobación de estado */ }

      if(imported>0) toast("📥 "+imported+" vídeo(s) de YouTube añadidos al calendario");
      else if(justPublished.length>0) toast("🎉 "+justPublished.length+" vídeo(s) recién publicado(s)");
      else if(cleared>0) toast(cleared+" vídeo(s) ya no estaban en YouTube · actualizado");
      else toast("Estado actualizado");
    } catch(e){
      toast("❌ "+e.message);
      if(/caducada|conectado/i.test(e.message)) ytExpireAccess();
    } finally { setChecking(false); }
  };

  // Comprobar al entrar (si hay conexión válida; también importa los subidos desde YouTube)
  useEffect(()=>{
    if(ytTokenValid()){ refresh(); }
  // eslint-disable-next-line
  },[]);

  const doDelete = async (v) => {
    setConfirmDel(null);
    if(!ytIsConnected()){ toast("Conecta con Google primero"); return; }
    setDeleting(v.id);
    try {
      await ytDeleteVideo(v.youtubeId);
      onUpdateVideo(v.id, { youtubeId:null, youtubeStatus:null, youtubeUrl:null });
      toast("Vídeo eliminado de YouTube");
    } catch(e){ toast("❌ "+e.message); }
    finally { setDeleting(null); }
  };

  const fmtDate = (v) => {
    const st = statusMap[v.youtubeId];
    if(st && st.publishAt) return new Date(st.publishAt).toLocaleString("es-ES",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
    if(v.date) return new Date(v.date+"T"+(v.time||"00:00")).toLocaleString("es-ES",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
    return "—";
  };
  const statusInfo = (v) => {
    const st = statusMap[v.youtubeId];
    if(st && st.exists===false) return { label:"No está en YouTube", color:"var(--red)" };
    if(st && st.privacyStatus==="public") return { label:"Publicado", color:"var(--green)" };
    if(v.youtubeStatus==="scheduled" || (st&&st.publishAt)) return { label:"Programado", color:"var(--gold)" };
    if(st && st.privacyStatus==="private") return { label:"Privado", color:"var(--text-2)" };
    if(st && st.privacyStatus==="unlisted") return { label:"No listado", color:"var(--blue)" };
    return { label:"Subido", color:"var(--text-2)" };
  };

  return (
    <div className="fade-in">
      <ChannelHeroCard subHistory={subHistory} onRecordSubs={onRecordSubs} onConnect={onConnect} toast={toast}/>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16,flexWrap:"wrap",gap:12}}>
        <div>
          <h2 className="titulo-vista" style={{fontSize:20,fontWeight:700}}>Vídeos en YouTube</h2>
          <p style={{fontSize:12.5,color:"var(--text-2)",marginTop:2}}>Controla los vídeos que has subido o programado y gestiónalos sin salir de la app</p>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {!ytIsConnected() && (
            <button onClick={onConnect} className="grad-gold" style={{
              display:"flex",alignItems:"center",gap:7,fontSize:12.5,fontWeight:700,color:"#000",
              borderRadius:10,padding:"9px 14px"
            }}>{Icons.link} Conectar Google</button>
          )}
          <button onClick={refresh} disabled={checking} style={{
            display:"flex",alignItems:"center",gap:7,fontSize:12.5,fontWeight:600,color:"var(--gold)",
            border:"1px solid var(--border-gold)",borderRadius:10,padding:"9px 13px",background:"rgba(212,175,55,0.05)",opacity:checking?0.6:1
          }}>
            <span className={checking?"spinning":""} style={{display:"flex"}}>{Icons.refresh}</span>
            {checking?"Comprobando…":"Comprobar estado"}
          </button>
        </div>
      </div>

      {/* ——— Sub-pestañas del apartado ——— */}
      <div style={{display:"flex",gap:7,marginBottom:16,flexWrap:"wrap"}}>
        {[
          {id:"objetivos", label:"Objetivos"},
          {id:"short",   label:"Shorts",   n: ytVideos.filter(v=>vTipo(v)==="short").length},
          {id:"directo", label:"Directos", n: ytVideos.filter(v=>vTipo(v)==="directo").length},
          {id:"video",   label:"Vídeos",   n: ytVideos.filter(v=>vTipo(v)==="video").length},
          {id:"comentarios", label:"Comentarios"},
        ].map(t=>(
          <button key={t.id} onClick={()=>setYtTab(t.id)} style={{
            fontSize:12.5, fontWeight:700, padding:"8px 15px", borderRadius:20,
            border:"1px solid "+(ytTab===t.id?"var(--border-gold)":"var(--border)"),
            color: ytTab===t.id?"var(--gold)":"var(--text-2)",
            background: ytTab===t.id?"rgba(212,175,55,0.08)":"transparent"
          }}>{t.label}{t.n!=null?` · ${t.n}`:""}</button>
        ))}
      </div>

      {/* ——— COMENTARIO FIJADO al publicarse un vídeo programado ——— */}
      {ytTab!=="objetivos" && ytTab!=="comentarios" && (()=>{
        const programados = ytVideos.filter(v=>v.youtubeStatus==="scheduled");
        if(programados.length===0) return null;
        return <PinnedCommentPanel programados={programados} onUpdateVideo={onUpdateVideo} toast={toast}/>;
      })()}

      {ytTab==="objetivos" && <ObjetivosPanel videos={videos} goals={goals} setGoals={setGoals} onConnect={onConnect} toast={toast}/>}
      {ytTab==="comentarios" && <ComentariosPanel videos={videos} onConnect={onConnect} toast={toast}/>}

      {ytTab!=="objetivos" && ytTab!=="comentarios" && (()=>{
        const delTipo = ytVideos.filter(v=>vTipo(v)===ytTab);
        const propios = delTipo
          .filter(v=>!busca || (v.title||"").toLowerCase().includes(busca.toLowerCase()))
          .filter(v=>!fmtFiltro || v.format===fmtFiltro);
        const fmtsUsados = [...new Set(delTipo.map(v=>v.format).filter(Boolean))];
        const clave = v => (v.date||"9999-99-99")+"T"+(v.time||"00:00");
        const programados = propios.filter(v=>v.youtubeStatus==="scheduled").sort((a,b)=>clave(a).localeCompare(clave(b)));
        const publicados = propios.filter(v=>v.youtubeStatus==="published").sort((a,b)=>clave(b).localeCompare(clave(a)));
        const otros = propios.filter(v=>v.youtubeStatus!=="scheduled" && v.youtubeStatus!=="published");

        const iconoTipo = (v) => v.type==="directo" ? Icons.live : (v.type==="short" ? Icons.short : Icons.largo);
        const Fila = (v) => {
          const f = formats[v.format] || { color:"#6B6B6B", label:"Sin formato" };
          const si = statusInfo(v);
          const gone = statusMap[v.youtubeId]?.exists===false;
          const abierto = !!abiertos[v.id];
          return (
            <div key={v.id} className="yt-row" onClick={()=>setAbiertos(a=>({...a,[v.id]:!abierto}))} style={{
              padding: abierto?"13px 15px":"9px 14px", background:"var(--bg-2)", cursor:"pointer",
              border:`1px solid ${gone?"rgba(248,113,113,0.35)":"var(--border)"}`, borderLeft:`3px solid ${f.color}`, borderRadius:12,
              transition:"padding .15s"
            }}>
              {/* Fila contraída: icono + título + formato + fecha + estado + flecha */}
              <div style={{display:"flex",alignItems:"center",gap:9,minWidth:0}}>
                <span style={{color:f.color,display:"flex",flexShrink:0}}>{iconoTipo(v)}</span>
                <span style={{fontSize:13,fontWeight:600,color:"var(--text)",overflow:abierto?"visible":"hidden",textOverflow:"ellipsis",whiteSpace:abierto?"normal":"nowrap",flex:1,minWidth:0,overflowWrap:"anywhere"}}>{v.title}</span>
                <span className="yt-fila-meta" style={{display:"flex",alignItems:"center",gap:9,flexShrink:0}}>
                  <FormatPill fmt={f} small/>
                  <span style={{fontSize:11,color:"var(--text-3)",display:"inline-flex",alignItems:"center",gap:4}}>{Icons.clock}{fmtDate(v)}</span>
                  <span style={{fontSize:11,color:si.color,fontWeight:600,whiteSpace:"nowrap"}}>● {si.label}</span>
                </span>
                <span style={{display:"flex",color:"var(--text-3)",transform:abierto?"rotate(180deg)":"none",transition:"transform .18s",flexShrink:0}}>{Icons.chevron}</span>
              </div>
              {/* Expandida: acciones */}
              {abierto && (
                <div className="fade-in" onClick={e=>e.stopPropagation()} style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginTop:12}}>
                  {!gone && (
                    <a href={v.youtubeUrl||("https://youtu.be/"+v.youtubeId)} target="_blank" rel="noopener" title="Ver en YouTube" style={{
                      display:"flex",alignItems:"center",gap:6,fontSize:12,fontWeight:600,color:"#FF0000",padding:"7px 11px",
                      border:"1px solid rgba(255,0,0,0.3)",borderRadius:9
                    }}>{Icons.youtube} Ver</a>
                  )}
                  {!gone && (
                    <button onClick={()=>setDownloadFor(v)} title="Descargar el vídeo" style={{
                      display:"flex",alignItems:"center",gap:6,fontSize:12,fontWeight:600,color:"var(--gold)",padding:"7px 11px",
                      border:"1px solid var(--border-gold)",borderRadius:9,background:"rgba(212,175,55,0.05)"
                    }}>{Icons.download} Descargar</button>
                  )}
                  <button onClick={()=>onOpen(v)} title="Editar en la app" style={{
                    display:"flex",alignItems:"center",gap:6,fontSize:12,fontWeight:600,color:"var(--text-2)",padding:"7px 11px",
                    border:"1px solid var(--border)",borderRadius:9
                  }}>{Icons.edit} Editar</button>
                  {gone ? (
                    <button onClick={()=>onUpdateVideo(v.id,{youtubeId:null,youtubeStatus:null,youtubeUrl:null})} title="Quitar la marca de YouTube" style={{
                      fontSize:12,fontWeight:600,color:"var(--text-2)",padding:"7px 11px",border:"1px solid var(--border)",borderRadius:9
                    }}>Quitar marca</button>
                  ) : (
                    <button onClick={()=>setConfirmDel(v)} disabled={deleting===v.id} title="Eliminar de YouTube" style={{
                      display:"flex",alignItems:"center",gap:6,fontSize:12,fontWeight:600,color:"var(--red)",padding:"7px 11px",
                      border:"1px solid rgba(248,113,113,0.3)",borderRadius:9,opacity:deleting===v.id?0.5:1
                    }}>{Icons.trash} {deleting===v.id?"Borrando…":"Borrar"}</button>
                  )}
                  {v.pinnedComment && <span style={{fontSize:11,color:v.pinnedCommentPosted?"var(--green)":"var(--text-3)"}}>💬 {v.pinnedCommentPosted?"comentario publicado":"comentario pendiente"}</span>}
                </div>
              )}
            </div>
          );
        };
        const Seccion = ({titulo, items, color}) => items.length===0 ? null : (
          <div style={{marginBottom:20}}>
            <div style={{fontSize:11.5,fontWeight:700,color:color||"var(--text-3)",textTransform:"uppercase",letterSpacing:".07em",marginBottom:9}}>{titulo} · {items.length}</div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>{items.map(Fila)}</div>
          </div>
        );

        return (
          <div className="fade-in">
            {delTipo.length>0 && (
              <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
                <input value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Buscar por título…" style={{...inputStyle, maxWidth:260, padding:"8px 12px", fontSize:12.5}}/>
                {fmtsUsados.length>1 && (
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {fmtsUsados.map(k=>{
                      const f = formats[k]; if(!f) return null;
                      const activo = fmtFiltro===k;
                      return (
                        <button key={k} onClick={()=>setFmtFiltro(activo?"":k)} style={{
                          fontSize:11,fontWeight:600,padding:"5px 11px",borderRadius:20,
                          border:"1px solid "+(activo?f.color:"var(--border)"),
                          color: activo?f.color:"var(--text-3)", background: activo?f.color+"18":"transparent"
                        }}>{f.label}</button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {propios.length===0 ? (
              <div style={{textAlign:"center",color:"var(--text-3)",fontSize:13.5,padding:"50px 20px",border:"1px dashed var(--border)",borderRadius:14}}>
                <div style={{color:"#FF0000",display:"flex",justifyContent:"center",marginBottom:12,opacity:.6}}>{Icons.youtube}</div>
                {delTipo.length===0
                  ? (ytTab==="directo" ? "Aún no hay directos detectados. Pulsa «Comprobar estado» para que la app identifique cuáles de tus vídeos fueron emisiones." : "No hay contenido de este tipo todavía.")
                  : "Nada coincide con la búsqueda o el filtro."}
              </div>
            ) : (
              <>
                <Seccion titulo="Programados" items={programados} color="var(--gold)"/>
                <Seccion titulo="Publicados" items={publicados} color="var(--green)"/>
                <Seccion titulo="Subidos sin publicar" items={otros}/>
              </>
            )}
          </div>
        );
      })()}

      {downloadFor && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",backdropFilter:"blur(3px)",display:"flex",alignItems:"center",justifyContent:"center",padding:16,zIndex:300}}>
          <div style={{background:"var(--bg-2)",border:"1px solid var(--border-gold)",borderRadius:14,padding:22,maxWidth:440,width:"100%"}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,marginBottom:6}}>
              <h3 style={{fontSize:16,fontWeight:700,display:"flex",alignItems:"center",gap:8}}>{Icons.download} Descargar vídeo</h3>
              <button onClick={()=>setDownloadFor(null)} style={{color:"var(--text-3)",fontSize:18,lineHeight:1,padding:"2px 6px"}}>✕</button>
            </div>
            <p style={{fontSize:12.5,color:"var(--text-2)",lineHeight:1.5,marginBottom:16,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>«{downloadFor.title}»</p>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {/* Opción 1: Studio (720p, directo) */}
              <a href={"https://studio.youtube.com/video/"+downloadFor.youtubeId+"/edit"} target="_blank" rel="noopener"
                 onClick={()=>{ toast("En Studio: menú Opciones (⋮) → Descargar"); setDownloadFor(null); }}
                 style={{display:"block",padding:"13px 15px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:11,textDecoration:"none"}}>
                <div style={{fontSize:13.5,fontWeight:700,color:"var(--text)",marginBottom:3}}>MP4 hasta 720p · YouTube Studio</div>
                <div style={{fontSize:11.5,color:"var(--text-3)",lineHeight:1.5}}>Descarga oficial en un clic. Se abre la página del vídeo en Studio: pulsa el menú Opciones (⋮) → «Descargar». Vale también para directos archivados.</div>
              </a>
              {/* Opción 2: Takeout (calidad original / 1080p) */}
              <a href="https://takeout.google.com/settings/takeout/custom/youtube" target="_blank" rel="noopener"
                 onClick={()=>{ setDownloadFor(null); }}
                 style={{display:"block",padding:"13px 15px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:11,textDecoration:"none"}}>
                <div style={{fontSize:13.5,fontWeight:700,color:"var(--text)",marginBottom:3}}>Calidad original (1080p o superior) · Google Takeout</div>
                <div style={{fontSize:11.5,color:"var(--text-3)",lineHeight:1.5}}>Exporta tus vídeos tal y como los subiste, en su resolución original. Elige «YouTube y YouTube Music» → contenido «videos». Google prepara el archivo y te avisa por correo.</div>
              </a>
            </div>
            <p style={{fontSize:11,color:"var(--text-3)",lineHeight:1.5,marginTop:14}}>
              La API de YouTube no permite descargar el archivo directamente desde la app, así que estas son las dos vías oficiales para tus propios vídeos.
            </p>
          </div>
        </div>
      )}

      {confirmDel && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",backdropFilter:"blur(3px)",display:"flex",alignItems:"center",justifyContent:"center",padding:16,zIndex:300}} onClick={()=>setConfirmDel(null)}>
          <div style={{background:"var(--bg-2)",border:"1px solid var(--border)",borderRadius:14,padding:22,maxWidth:400}} onClick={e=>e.stopPropagation()}>
            <h3 style={{fontSize:16,fontWeight:700,marginBottom:10}}>¿Eliminar de YouTube?</h3>
            <p style={{fontSize:13,color:"var(--text-2)",lineHeight:1.5,marginBottom:18}}>
              El vídeo «{confirmDel.title}» se borrará permanentemente de tu canal de YouTube. Esta acción no se puede deshacer.
            </p>
            <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
              <button onClick={()=>setConfirmDel(null)} style={{padding:"9px 16px",borderRadius:9,border:"1px solid var(--border)",color:"var(--text-2)",fontSize:13,fontWeight:600}}>Cancelar</button>
              <button onClick={()=>doDelete(confirmDel)} style={{padding:"9px 16px",borderRadius:9,background:"var(--red)",color:"#fff",fontSize:13,fontWeight:700}}>Sí, eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function StatsView({ videos, goals, onConnect }) {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);

  const nf = new Intl.NumberFormat("es-ES");
  const nfc = new Intl.NumberFormat("es-ES", {notation:"compact", maximumFractionDigits:1});
  const eur = (x) => x==null ? "—" : x.toLocaleString("es-ES",{minimumFractionDigits:2, maximumFractionDigits:2})+" €";

  const cargar = async () => {
    if(!ytIsConnected()){ setError("conectar"); return; }
    setCargando(true); setError(null);
    try {
      const fin = new Date(); fin.setDate(fin.getDate()-2); // últimos datos cerrados
      const ini28 = new Date(fin); ini28.setDate(ini28.getDate()-27);
      const finPrev = new Date(ini28); finPrev.setDate(finPrev.getDate()-1);
      const iniPrev = new Date(finPrev); iniPrev.setDate(iniPrev.getDate()-27);
      const ini84 = new Date(fin); ini84.setDate(ini84.getDate()-83);
      const METRICAS = "views,estimatedMinutesWatched,subscribersGained,subscribersLost,likes,comments,estimatedRevenue,averageViewDuration,averageViewPercentage";
      const [act, prev, topRes, porDia, tipos] = await Promise.all([
        ytAnalyticsQuery({ startDate:fechaISO(ini28), endDate:fechaISO(fin), metrics:METRICAS }),
        ytAnalyticsQuery({ startDate:fechaISO(iniPrev), endDate:fechaISO(finPrev), metrics:METRICAS }),
        ytAnalyticsQuery({ startDate:fechaISO(ini28), endDate:fechaISO(fin), metrics:"views,estimatedRevenue,likes", dimensions:"video", sort:"-views", maxResults:"8" }),
        ytAnalyticsQuery({ startDate:fechaISO(ini84), endDate:fechaISO(fin), metrics:"views", dimensions:"day", sort:"day" }),
        ytAnalyticsQuery({ startDate:fechaISO(ini28), endDate:fechaISO(fin), metrics:"views,estimatedMinutesWatched,estimatedRevenue", dimensions:"creatorContentType" }).catch(()=>({rows:[]}))
      ]);
      const fila = (r)=>{ const f=(r.rows||[])[0]||[]; return {
        views:+f[0]||0, min:+f[1]||0, subsUp:+f[2]||0, subsDown:+f[3]||0,
        likes:+f[4]||0, comments:+f[5]||0, rev:+f[6]||0, dur:+f[7]||0, pct:+f[8]||0
      }; };
      // Top vídeos con título (del Studio o pedido a la API)
      const top = (topRes.rows||[]).map(r=>({ id:r[0], views:+r[1]||0, rev:+r[2]||0, likes:+r[3]||0 }));
      const sinTitulo = top.filter(t=>!videos.find(v=>v.youtubeId===t.id));
      const titulosApi = {};
      if(sinTitulo.length){
        try {
          const res = await fetch("https://www.googleapis.com/youtube/v3/videos?"+new URLSearchParams({ part:"snippet", id:sinTitulo.map(t=>t.id).join(",") }), { headers: ytAuthHeader() });
          if(res.ok){ ((await res.json()).items||[]).forEach(it=>{ titulosApi[it.id] = it.snippet?.title || it.id; }); }
        } catch(e){}
      }
      top.forEach(t=>{ t.titulo = (videos.find(v=>v.youtubeId===t.id)?.title) || titulosApi[t.id] || t.id; });
      // Semana tipo: media de visitas por día de la semana (últimas 12 semanas)
      const porSemana = Array.from({length:7},()=>({sum:0,n:0}));
      (porDia.rows||[]).forEach(r=>{ const d=new Date(r[0]+"T00:00"); const i=(d.getDay()+6)%7; porSemana[i].sum += (+r[1]||0); porSemana[i].n++; });
      const semanaTipo = porSemana.map((x,i)=>({ dia:["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"][i], media: x.n ? Math.round(x.sum/x.n) : 0 }));
      // Motores: reparto por tipo de contenido
      const motores = { shorts:null, directos:null, videos:null };
      (tipos.rows||[]).forEach(f=>{
        const t = String(f[0]||"").toUpperCase();
        const val = { views:+f[1]||0, min:+f[2]||0, rev:+f[3]||0 };
        if(t.includes("SHORT")) motores.shorts = val;
        else if(t.includes("LIVE")) motores.directos = val;
        else if(t.includes("DEMAND") || t.includes("VIDEO")) motores.videos = val;
      });
      setDatos({ act: fila(act), prev: fila(prev), top, semanaTipo, motores, desde: fechaISO(ini28), hasta: fechaISO(fin) });
    } catch(e){
      if(e.message==="ANALYTICS_API_OFF") setError("off");
      else if(e.message==="ANALYTICS_PERMISOS") setError("permisos");
      else setError(e.message);
    } finally { setCargando(false); }
  };
  useEffect(()=>{ if(ytTokenValid()) cargar(); else if(!ytIsConnected()) setError("conectar"); // eslint-disable-next-line
  },[]);

  // Huecos sin Short en los últimos 28 días (los valles cuestan visitas)
  const hoyKey2 = fechaISO(new Date());
  const dias28 = Array.from({length:28},(_,i)=>{
    const d = new Date(); d.setDate(d.getDate()-(27-i));
    const k = fechaISO(d);
    const n = videos.filter(v=>v.type==="short" && v.status==="publicado" && v.date===k).length;
    return { k, d: d.getDate(), n };
  });
  const huecos = dias28.filter(x=>x.n===0 && x.k<hoyKey2).length;

  // Ritmo de publicación (últimas 8 semanas) — se mantiene de la versión anterior
  const monday = (d) => { const x=new Date(d); x.setHours(0,0,0,0); x.setDate(x.getDate()-((x.getDay()+6)%7)); return x; };
  const thisMonday = monday(new Date());
  const weeks = Array.from({length:8},(_,i)=>{
    const start = new Date(thisMonday); start.setDate(start.getDate()+(i-7)*7);
    const end = new Date(start); end.setDate(end.getDate()+7);
    const count = videos.filter(v=>v.status==="publicado" && v.date && (()=>{ const t=new Date(v.date+"T00:00"); return t>=start && t<end; })()).length;
    return { label: start.toLocaleDateString("es-ES",{day:"numeric",month:"short"}), count, isThis: i===7 };
  });
  const maxWeek = Math.max(1, ...weeks.map(w=>w.count));

  const caja = { background:"var(--bg-2)", border:"1px solid var(--border)", borderRadius:14, padding:16 };
  const tituloZona = { fontSize:11.5, fontWeight:700, color:"var(--text-3)", textTransform:"uppercase", letterSpacing:".07em", marginBottom:12 };

  const Delta = ({ahora, antes, invertir}) => {
    if(antes==null || antes===0 || ahora==null) return null;
    const d = (ahora-antes)/Math.abs(antes)*100;
    if(!isFinite(d) || Math.abs(d)<0.5) return <span style={{fontSize:10,color:"var(--text-3)"}}>=</span>;
    const bueno = invertir ? d<0 : d>0;
    return <span style={{fontSize:10.5,fontWeight:700,color:bueno?"var(--green)":"var(--red)"}}>{d>0?"▲":"▼"} {Math.abs(d).toFixed(0)}%</span>;
  };
  const KPI = ({label, valor, sub, ahora, antes}) => (
    <div style={{background:"var(--bg-2)",border:"1px solid var(--border)",borderRadius:13,padding:"13px 15px"}}>
      <div style={{fontSize:10,color:"var(--text-3)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:5}}>{label}</div>
      <div style={{display:"flex",alignItems:"baseline",gap:8,flexWrap:"wrap"}}>
        <span style={{fontSize:20,fontWeight:800,fontFamily:"'Sora'",color:"var(--text)"}}>{valor}</span>
        <Delta ahora={ahora} antes={antes}/>
      </div>
      {sub && <div style={{fontSize:10,color:"var(--text-3)",marginTop:3}}>{sub}</div>}
    </div>
  );

  const a = datos ? datos.act : null;
  const p = datos ? datos.prev : null;
  const mejorDia = datos ? [...datos.semanaTipo].sort((x,y)=>y.media-x.media)[0] : null;
  const maxSem = datos ? Math.max(1, ...datos.semanaTipo.map(s=>s.media)) : 1;
  const mot = datos ? datos.motores : null;
  const totV = mot ? ((mot.shorts?.views||0)+(mot.directos?.views||0)+(mot.videos?.views||0)) : 0;
  const totM = mot ? ((mot.shorts?.min||0)+(mot.directos?.min||0)+(mot.videos?.min||0)) : 0;
  const totR = mot ? ((mot.shorts?.rev||0)+(mot.directos?.rev||0)+(mot.videos?.rev||0)) : 0;

  return (
    <div className="fade-in">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,flexWrap:"wrap",marginBottom:16}}>
        <div>
          <h2 className="titulo-vista" style={{fontSize:20,fontWeight:700}}>Estadísticas del canal</h2>
          <p style={{fontSize:12.5,color:"var(--text-2)",marginTop:2}}>
            {datos ? `Últimos 28 días cerrados (${new Date(datos.desde+"T00:00").toLocaleDateString("es-ES",{day:"numeric",month:"short"})} – ${new Date(datos.hasta+"T00:00").toLocaleDateString("es-ES",{day:"numeric",month:"short"})}) comparados con los 28 anteriores` : "Análisis real de tu canal con la API de YouTube"}
          </p>
        </div>
        <button onClick={cargar} disabled={cargando} style={{display:"flex",alignItems:"center",gap:7,fontSize:12.5,fontWeight:600,color:"var(--gold)",border:"1px solid var(--border-gold)",borderRadius:10,padding:"9px 13px",background:"rgba(212,175,55,0.05)",opacity:cargando?0.6:1}}>
          <span className={cargando?"spinning":""} style={{display:"flex"}}>{Icons.refresh}</span>{cargando?"Analizando…":"Refrescar"}
        </button>
      </div>

      {error && (
        <div style={{marginBottom:14,padding:"12px 14px",background:"rgba(212,175,55,0.07)",border:"1px solid var(--border-gold)",borderRadius:11,fontSize:12.5,color:"var(--text-2)",lineHeight:1.6}}>
          {error==="conectar" ? <><button onClick={onConnect} style={{color:"var(--gold)",fontWeight:700}}>Conecta con Google</button> para analizar tu canal con datos reales.</>
          : error==="off" ? <>Falta activar YouTube Analytics API: <a href="https://console.cloud.google.com/apis/library/youtubeanalytics.googleapis.com" target="_blank" rel="noopener" style={{color:"var(--gold)",fontWeight:600}}>habilitar</a> y refresca.</>
          : error==="permisos" ? <><button onClick={onConnect} style={{color:"var(--gold)",fontWeight:700}}>Reconecta con Google</button> y acepta los permisos de analíticas.</>
          : <>⚠ {error}</>}
        </div>
      )}

      {datos && (
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {/* ——— KPIs comparados ——— */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10}}>
            <KPI label="Visitas" valor={nfc.format(a.views)} ahora={a.views} antes={p.views}/>
            <KPI label="Horas vistas" valor={nfc.format(Math.round(a.min/60))} ahora={a.min} antes={p.min}/>
            <KPI label="Suscriptores netos" valor={"+"+nf.format(a.subsUp-a.subsDown)} sub={`+${nf.format(a.subsUp)} · −${nf.format(a.subsDown)}`} ahora={a.subsUp-a.subsDown} antes={p.subsUp-p.subsDown}/>
            <KPI label="Ingresos (reales)" valor={eur(a.rev)} ahora={a.rev} antes={p.rev}/>
            <KPI label="Me gusta" valor={nfc.format(a.likes)} ahora={a.likes} antes={p.likes}/>
            <KPI label="Comentarios" valor={nfc.format(a.comments)} ahora={a.comments} antes={p.comments}/>
            <KPI label="Duración media" valor={`${Math.floor(a.dur/60)}:${String(Math.round(a.dur%60)).padStart(2,"0")}`} sub={a.pct?`${a.pct.toFixed(0)}% del vídeo visto`:null} ahora={a.dur} antes={p.dur}/>
            <KPI label="Subs por 1.000 vistas" valor={a.views? ((a.subsUp-a.subsDown)/a.views*1000).toFixed(1) : "—"} sub="conversión a suscriptor" ahora={a.views?(a.subsUp-a.subsDown)/a.views:null} antes={p.views?(p.subsUp-p.subsDown)/p.views:null}/>
          </div>

          {/* ——— Los dos motores: qué aporta cada tipo de contenido ——— */}
          {mot && totV>0 && (
            <div style={caja}>
              <div style={tituloZona}>Tus motores · qué aporta cada tipo de contenido (28 días)</div>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {[["Visitas", v=>v.views, totV, nfc.format(totV)], ["Horas vistas", v=>v.min, totM, nfc.format(Math.round(totM/60))+" h"], ["Ingresos", v=>v.rev, totR, eur(totR)]].map(([lbl, fn, tot, totTxt])=>(
                  <div key={lbl}>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:11.5,marginBottom:4}}>
                      <span style={{fontWeight:600,color:"var(--text-2)"}}>{lbl}</span>
                      <span style={{color:"var(--text-3)"}}>{totTxt}</span>
                    </div>
                    <div style={{display:"flex",height:12,borderRadius:8,overflow:"hidden",background:"var(--card)"}}>
                      {[["shorts","#60a5fa","Shorts"],["directos","#D4AF37","Directos"],["videos","#a78bfa","Vídeos"]].map(([k,color,nombre])=>{
                        const val = mot[k] ? fn(mot[k]) : 0;
                        const w = tot ? val/tot*100 : 0;
                        return w>0 ? <div key={k} title={`${nombre}: ${lbl==="Ingresos"?eur(val):nfc.format(lbl==="Horas vistas"?Math.round(val/60):val)} (${w.toFixed(0)}%)`} style={{width:w+"%",background:color,opacity:.85}}/> : null;
                      })}
                    </div>
                  </div>
                ))}
                <div style={{display:"flex",gap:14,fontSize:10.5,color:"var(--text-3)",flexWrap:"wrap"}}>
                  <span><span style={{display:"inline-block",width:9,height:9,borderRadius:3,background:"#60a5fa",marginRight:4}}/>Shorts</span>
                  <span><span style={{display:"inline-block",width:9,height:9,borderRadius:3,background:"#D4AF37",marginRight:4}}/>Directos</span>
                  <span><span style={{display:"inline-block",width:9,height:9,borderRadius:3,background:"#a78bfa",marginRight:4}}/>Vídeos</span>
                  <span style={{opacity:.85}}>Los Shorts traen el alcance; los directos, las horas y los suscriptores. Dos motores, no rivales.</span>
                </div>
              </div>
            </div>
          )}

          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:14,alignItems:"start"}}>
            {/* ——— Top vídeos ——— */}
            <div style={caja}>
              <div style={tituloZona}>Top del mes · por visitas</div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {datos.top.map((t,i)=>(
                  <div key={t.id} style={{display:"flex",alignItems:"center",gap:9,fontSize:12}}>
                    <span style={{width:18,fontWeight:800,color: i<3?"var(--gold)":"var(--text-3)",flexShrink:0,fontFamily:"'Sora'"}}>{i+1}</span>
                    <span style={{color:"var(--text)",fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1,minWidth:0}} title={t.titulo}>{t.titulo}</span>
                    <span style={{color:"var(--text-2)",flexShrink:0,fontWeight:700}}>{nfc.format(t.views)}</span>
                    <span style={{color:"var(--text-3)",flexShrink:0,fontSize:10.5,minWidth:52,textAlign:"right"}}>{t.rev>0?eur(t.rev):"—"}</span>
                  </div>
                ))}
                {datos.top.length===0 && <div style={{fontSize:12,color:"var(--text-3)"}}>Sin datos todavía.</div>}
              </div>
            </div>

            {/* ——— Semana tipo ——— */}
            <div style={caja}>
              <div style={tituloZona}>Tu semana tipo · visitas medias por día (12 semanas)</div>
              <div style={{display:"flex",gap:8,alignItems:"flex-end",height:110}}>
                {datos.semanaTipo.map(s=>{
                  const esMejor = mejorDia && s.dia===mejorDia.dia;
                  return (
                    <div key={s.dia} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}} title={nf.format(s.media)+" visitas de media"}>
                      <span style={{fontSize:9.5,color:esMejor?"var(--gold)":"var(--text-3)",fontWeight:600}}>{nfc.format(s.media)}</span>
                      <div style={{width:"100%",maxWidth:32,height:Math.max(3, s.media/maxSem*78),borderRadius:5,background: esMejor?"linear-gradient(180deg,#FFD700,#D4AF37)":"var(--card-2)",border:"1px solid "+(esMejor?"transparent":"var(--border)")}}/>
                      <span style={{fontSize:10,color:esMejor?"var(--gold)":"var(--text-3)",fontWeight:esMejor?700:400}}>{s.dia}</span>
                    </div>
                  );
                })}
              </div>
              {mejorDia && <div style={{fontSize:11,color:"var(--text-3)",marginTop:8}}>Tu público está más activo los <b style={{color:"var(--gold)"}}>{mejorDia.dia}</b>: guarda tus mejores Shorts para ese día.</div>}
            </div>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:14,alignItems:"start"}}>
            {/* ——— Huecos sin Short ——— */}
            <div style={caja}>
              <div style={tituloZona}>Constancia · Shorts publicados por día (28 días)</div>
              <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                {dias28.map(x=>(
                  <div key={x.k} title={x.k+" · "+x.n+" Short(s)"} style={{
                    width:20,height:20,borderRadius:5,display:"flex",alignItems:"center",justifyContent:"center",
                    fontSize:8.5,fontWeight:700,
                    background: x.n>0 ? `rgba(74,222,128,${Math.min(0.18+x.n*0.18,0.75)})` : (x.k<hoyKey2?"rgba(248,113,113,0.25)":"var(--card)"),
                    color: x.n>0?"var(--text)":"var(--text-3)",
                    border:"1px solid var(--border)"
                  }}>{x.n>0?x.n:""}</div>
                ))}
              </div>
              <div style={{fontSize:11,color: huecos>3?"var(--red)":"var(--text-3)",marginTop:9,lineHeight:1.5}}>
                {huecos===0
                  ? "✅ Sin días en blanco: el feed no te olvida."
                  : `${huecos} día${huecos!==1?"s":""} sin Short en 28 días. Cada hueco enfría el feed: guarda Shorts de reserva para no fallar ninguno.`}
              </div>
            </div>

            {/* ——— Ritmo de publicación (8 semanas) ——— */}
            <div style={caja}>
              <div style={tituloZona}>Ritmo de publicación · vídeos por semana</div>
              <div style={{display:"flex",gap:8,alignItems:"flex-end",height:110}}>
                {weeks.map((w,i)=>(
                  <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}} title={w.count+" publicados"}>
                    <span style={{fontSize:9.5,color:w.isThis?"var(--gold)":"var(--text-3)",fontWeight:600}}>{w.count}</span>
                    <div style={{width:"100%",maxWidth:30,height:Math.max(3, w.count/maxWeek*78),borderRadius:5,background: w.isThis?"linear-gradient(180deg,#FFD700,#D4AF37)":"var(--card-2)",border:"1px solid "+(w.isThis?"transparent":"var(--border)")}}/>
                    <span style={{fontSize:9,color:w.isThis?"var(--gold)":"var(--text-3)"}}>{w.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{fontSize:10.5,color:"var(--text-3)"}}>Los ingresos de estas estadísticas son los reales que reporta YouTube para periodos cerrados. RPM de Shorts del periodo: {a.views && mot && mot.shorts && mot.shorts.views ? (mot.shorts.rev/mot.shorts.views*1000).toLocaleString("es-ES",{maximumFractionDigits:3})+" €/1.000" : "—"}.</div>
        </div>
      )}

      {!datos && !error && cargando && (
        <div style={{textAlign:"center",padding:"60px 0",color:"var(--text-3)",fontSize:13}}>Analizando tu canal…</div>
      )}
    </div>
  );
}

export function TrashView({trash, onRestore, onDeleteForever, onEmpty, formats}) {
  const fmtDate = ts => {
    if(!ts) return "";
    const d = new Date(ts);
    return d.toLocaleDateString("es-ES",{day:"numeric",month:"short"}) + " · " + d.toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"});
  };
  return (
    <div className="fade-in">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18,flexWrap:"wrap",gap:12}}>
        <div>
          <h2 className="titulo-vista" style={{fontSize:20,fontWeight:700}}>Papelera</h2>
          <p style={{fontSize:12.5,color:"var(--text-2)",marginTop:2}}>
            {trash.length===0 ? "No hay vídeos en la papelera" : `${trash.length} vídeo${trash.length!==1?"s":""} · restaura los que necesites o vacíala para borrarlos definitivamente`}
          </p>
        </div>
        <button onClick={onEmpty} disabled={trash.length===0} style={{
          display:"flex",alignItems:"center",gap:7,fontSize:13,fontWeight:600,
          color: trash.length===0?"var(--text-3)":"var(--red)",
          border:`1px solid ${trash.length===0?"var(--border)":"rgba(248,113,113,0.3)"}`,
          borderRadius:10, padding:"9px 14px", background: trash.length===0?"transparent":"rgba(248,113,113,0.05)",
          cursor: trash.length===0?"not-allowed":"pointer", opacity: trash.length===0?.5:1
        }}>{Icons.trashBig} Vaciar papelera</button>
      </div>

      {trash.length===0 ? (
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"70px 20px",color:"var(--text-3)",border:"1px dashed var(--border)",borderRadius:14,gap:14}}>
          <span style={{color:"#2a2a2a"}}><Icon d={Icons.trashBig.props.d} size={48} sw={1.3}/></span>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:14,color:"var(--text-2)",fontWeight:600,marginBottom:4}}>La papelera está vacía</div>
            <div style={{fontSize:12.5}}>Los vídeos que elimines aparecerán aquí antes de borrarse del todo</div>
          </div>
        </div>
      ) : (
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(280px, 1fr))",gap:12}}>
          {trash.map(v=>{
            const f = formats[v.format] || { color:"#6B6B6B", label:"Sin formato" };
            return (
              <div key={v.id} className="fade-in" style={{
                background:"var(--card)", border:"1px solid var(--border)", borderLeft:`3px solid ${f.color}`,
                borderRadius:10, padding:"13px 14px", opacity:.92
              }}>
                <div style={{display:"flex",alignItems:"center",gap:7,color:"var(--text-3)",marginBottom:7}}>
                  <span style={{color:f.color,display:"flex"}}>{v.type==="short"?Icons.short:(v.type==="directo"?Icons.live:Icons.largo)}</span>
                  <span style={{fontSize:10.5,textTransform:"uppercase",letterSpacing:".06em"}}>{v.type==="short"?"Short":"Vídeo largo"}</span>
                  <span style={{marginLeft:"auto",fontSize:10.5,color:"var(--text-3)"}}>Eliminado {fmtDate(v.deletedAt)}</span>
                </div>
                <div style={{fontSize:13.5,fontWeight:600,color:"var(--text-2)",marginBottom:10,lineHeight:1.35,textDecoration:"line-through",textDecorationColor:"var(--text-3)"}}>{v.title}</div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>onRestore(v.id)} style={{
                    flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:7,fontSize:12.5,fontWeight:600,
                    color:"var(--green)",border:"1px solid rgba(74,222,128,0.3)",borderRadius:8,padding:"8px 10px",
                    background:"rgba(74,222,128,0.05)",transition:"all .15s"
                  }} onMouseEnter={e=>e.currentTarget.style.background="rgba(74,222,128,0.12)"}
                     onMouseLeave={e=>e.currentTarget.style.background="rgba(74,222,128,0.05)"}>
                    {Icons.restore} Restaurar
                  </button>
                  <button onClick={()=>onDeleteForever(v.id)} title="Eliminar para siempre" style={{
                    display:"flex",alignItems:"center",justifyContent:"center",color:"var(--text-3)",
                    border:"1px solid var(--border)",borderRadius:8,padding:"8px 11px",transition:"all .15s"
                  }} onMouseEnter={e=>{e.currentTarget.style.color="var(--red)";e.currentTarget.style.borderColor="rgba(248,113,113,0.3)";}}
                     onMouseLeave={e=>{e.currentTarget.style.color="var(--text-3)";e.currentTarget.style.borderColor="var(--border)";}}>
                    {Icons.trash}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ============================ STAT STRIP ============================ */
