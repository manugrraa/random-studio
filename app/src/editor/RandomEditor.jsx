import React from "react";
import { createPortal } from "react-dom";
import { useTarea, PanelTarea } from "../clon";
import * as M from "./modelo";
import { crearReloj } from "./reloj";
import { Vista, fileUrl } from "./Vista";
import { LineaTiempo } from "./LineaTiempo";
import { Biblioteca } from "./Biblioteca";
import { I } from "./iconos";
import { Fps, Medidor, AjustesEditor, useAjuste } from "./Rendimiento";
import { InspectorTexto } from "./Textos";
import { PanelTransformar, PanelVelocidad } from "./Transformar";
import { PanelColor } from "./PanelColor";
import { PanelMascara } from "./Mascara";
import { PanelVoces, SeccionVoz } from "./Voz";
import { PanelSubtitulos, InspectorSub } from "./Subtitulos";
import { RecorteAudio } from "./RecorteAudio";
import { PanelGuion } from "./Guion";

// (5/11, él: "poder copiar atributos de un clip a otro, como la mejora de voz, el audio, etc. Como en CapCut y DaVinci")
const ATRIBUTOS = ["vol", "fade_in", "fade_out", "silencio", "voz", "velocidad", "tono", "flujo", "filtro", "color", "mascara", "transform", "kf"];
export { ATAJOS_EDITOR } from "./atajos";
const { useState, useEffect, useRef, useMemo } = React;
const { fin, largo, tc, tcLargo } = M;

/* ===================================== RandomEditor (v3.14) =====================================
   28/10, él: "quiero una copia de CapCut de PC; toma referencia de lo mejor de cada editor, que sea
   nuestro editor supremo (no un Frankenstein)... no se pueden hacer cortes precisos... al arrastrar
   selecciona lo que pasa por encima... el Alt saca un menú... que la vara se una a los bordes... como
   una ventana aparte del Studio, fluida y con buen rendimiento".
   Es su PROPIA VENTANA (proceso aparte, Electron). Lo que se tomó y de dónde:
     CapCut PC   — la distribución, la pista principal magnética, Ctrl+B / Q / W, extraer audio, fundidos
     Premiere    — J/K/L, herramientas Selección (V) y Cuchilla (B), tiempos con fotogramas
     Final Cut   — la línea del ratón con su tiempo exacto (cortar justo donde se mira)
     DaVinci     — el imán también para el cabezal, el zoom hasta el fotograma, centrado en el ratón
     Shorts      — las guías de lo que tapa la interfaz de YouTube Shorts
   Rendimiento: el tiempo vive en un reloj (no en React), la línea de tiempo se pinta en lienzos y
   solo lo visible, y dos reproductores se pasan el relevo en cada corte. */

async function consultar(args) {
  const r = await window.studioFS.clonConsultar(args);
  if (r.error) throw new Error(r.error);
  return r.eventos || [];
}

// un tiempo editable al fotograma (segundos con dos decimales; se escribe y Enter o al salir)
function NumTiempo({ v, fps, onCambiar }) {
  const [txt, setTxt] = useState(null);
  const aplicar = () => { if(txt == null) return; const x = Number(String(txt).replace(",", ".")); if(!isNaN(x)) onCambiar(Math.round(x * fps) / fps); setTxt(null); };
  return <input value={txt ?? v.toFixed(2)} onChange={e=>setTxt(e.target.value)} onBlur={aplicar} onKeyDown={e=>{ if(e.key==="Enter"){ aplicar(); e.target.blur(); } }}
    className="rd-input" style={{padding:"3px 6px",fontFamily:"ui-monospace, Consolas, monospace",fontSize:11.5,width:"100%",boxSizing:"border-box"}} title="Segundos (se ajusta al fotograma)"/>;
}

function Contador({ reloj, fps }) {
  const el = useRef(null);
  useEffect(()=>reloj.oir(t=>{ if(el.current) el.current.textContent = tcLargo(t, fps); }),[reloj, fps]);
  return <span ref={el} style={{fontFamily:"ui-monospace, Consolas, monospace",fontSize:13,color:"var(--gold)",minWidth:92,display:"inline-block"}}>{tcLargo(reloj.t, fps)}</span>;
}

export function RandomEditor({ toast }) {
  // ---- el proyecto y su historial (en refs: cada cambio entra UNA vez, también los arrastres)
  const pRef = useRef(M.nuevoProyecto());
  const pasado = useRef([]), futuro = useRef([]), sucio = useRef(false), gesto = useRef(null);
  const [, repintar] = useState(0);
  const p = pRef.current;
  // (8/11, fallo: escribir un texto y luego pulsar un botón desordenaba el deshacer) un gesto abierto se cierra antes
  const cerrarGesto = () => { const g = gesto.current; if(!g) return; gesto.current = null; if(g !== pRef.current){ pasado.current = [...pasado.current.slice(-150), g]; futuro.current = []; } };
  const horas = useRef(new WeakMap());      // (8/11, historial) cuándo se llegó a cada estado
  const poner = nuevo => { if(nuevo === pRef.current) return; cerrarGesto(); horas.current.set(nuevo, Date.now()); pasado.current = [...pasado.current.slice(-150), pRef.current]; futuro.current = []; pRef.current = nuevo; sucio.current = true; repintar(x=>x+1); };
  // (8/11, fase 2: clips CONECTADOS, Final Cut) lo que hay encima de un clip de la principal se mueve con él
  const conectadosRef = useRef(true);
  const conectados = (antes, despues) => conectadosRef.current ? M.conectar(antes, despues) : despues;
  const cambiar = f => poner(conectados(pRef.current, M.ordenar(f(pRef.current))));
  const deshacer = () => { cerrarGesto(); if(!pasado.current.length) return; futuro.current = [pRef.current, ...futuro.current]; pRef.current = pasado.current.pop(); sucio.current = true; repintar(x=>x+1); };
  // (8/11, fase 2: HISTORIAL visible, como DaVinci) volver de golpe a cualquier punto (y volver adelante)
  const [menuHist, setMenuHist] = useState(false);
  const irAHistorial = j => { cerrarGesto(); const todosE = [...pasado.current, pRef.current, ...futuro.current];
    if(j < 0 || j >= todosE.length) return; pasado.current = todosE.slice(0, j); pRef.current = todosE[j]; futuro.current = todosE.slice(j + 1); sucio.current = true; repintar(x=>x+1); };
  const rehacer = () => { cerrarGesto(); if(!futuro.current.length) return; pasado.current = [...pasado.current, pRef.current]; pRef.current = futuro.current.shift(); sucio.current = true; repintar(x=>x+1); };
  const alGesto = (fase, nuevo) => {
    if(fase === "inicio") gesto.current = pRef.current;
    else if(fase === "durante"){ pRef.current = gesto.current ? conectados(gesto.current, M.ordenar(nuevo)) : M.ordenar(nuevo); sucio.current = true; repintar(x=>x+1); }
    else { const g = gesto.current; gesto.current = null; if(g && g !== pRef.current){ horas.current.set(pRef.current, Date.now()); pasado.current = [...pasado.current.slice(-150), g]; futuro.current = []; repintar(x=>x+1); } }
  };

  const reloj = useRef(crearReloj()).current;
  const vista = useRef(null);
  const jugandoRef = useRef(0);
  const [jugando, setJugandoE] = useState(0);
  const [sel, setSel] = useState(()=>new Set());
  const [porta, setPorta] = useState([]);
  const [zoom, setZoom] = useState(40);
  const [iman, setIman] = useState(true);
  const [herramienta, setHerramienta] = useState("sel");
  const [skim, setSkim] = useAjuste("red_skim", false);
  const [compacta, setCompacta] = useAjuste("red_compacta", false);
  const [conectadosOn, setConectados] = useAjuste("red_conectados", true);
  conectadosRef.current = conectadosOn;
  const [guias, setGuias] = useState(false);
  const [completa, setCompleta] = useState(false);
  const [medios, setMedios] = useState(null);
  const [biblio, setBiblio] = useState(null);
  const [tiras, setTiras] = useState({});
  const [ondas, setOndas] = useState({});
  const [proyectos, setProyectos] = useState([]);
  const [menu, setMenu] = useState(null);
  // v3.14.1: proxies (copias ligeras para previsualizar), contador de FPS, medidor y ajustes
  const [proxies, setProxies] = useState({});
  const [usarProxies, setUsarProxies] = useAjuste("red_proxies", true);
  const [verFps, setVerFps] = useAjuste("red_fps", true);
  const [verMedidor, setVerMedidor] = useAjuste("red_medidor", true);
  const [ajustesAb, setAjustesAb] = useState(false);
  // 28/10: los textos (las fuentes instaladas y sus dos estilos: el de los títulos y el normal)
  const [fuentes, setFuentes] = useState(null);
  const [presets, setPresets] = useState(null);
  const [menuExp, setMenuExp] = useState(false);
  const [efectos, setEfectos] = useState(null);
  const [voces, setVoces] = useState(null);
  const [menuPortada, setMenuPortada] = useState(false);
  const [eligiendoMini, setEligiendoMini] = useState(null);
  const [yaExiste, setYaExiste] = useState(null);         // (8/11) ya hay un vídeo con ese nombre: reemplazar o copia     // (4/11) «listos», «ruta» o «destino» mientras elige la miniatura
  const [pestInsp, setPestInsp] = useAjuste("red_pest_insp", "basico");
  // 28/10: los subtítulos (las plantillas, la elegida y cuántas palabras por tarjeta)
  const [subsInfo, setSubsInfo] = useState(null);
  const [subsPid, setSubsPid] = useAjuste("red_subs_plantilla", "shorts");
  const [subsMax, setSubsMax] = useAjuste("red_subs_palabras", 3);
  // v3.40: Claude corrige lo que Whisper oye mal (acentos, nombres, marcas), con lo que le cuentes del vídeo
  const [subsIa, setSubsIa] = useAjuste("red_subs_ia", true);
  const [subsCtx, setSubsCtx] = useAjuste("red_subs_contexto", "");
  const colaProxy = useRef({ pedidos:new Set(), cola:[], activos:0 });
  const pedidos = useRef(new Set());
  const est = useRef({}); est.current = { sel, porta, zoom, iman, herramienta };
  const guardandoClip = useRef(false);
  // las tareas del clon se oyen en las dos ventanas: aquí solo cuentan las del editor
  const [tareaClon, lanzar, cerrarTarea] = useTarea(ev=>{
    if(!["exportar","guardarclip","redsubs"].includes(ev.tarea)) return;
    if(ev.tarea === "redsubs"){
      const f = (tareaClonRef.current && tareaClonRef.current.eventos || []).find(e=>e.evento==="fin");
      if(!ev.codigo && f && f.clips){ cambiar(q=>M.ponerSubtitulos(q, f.clips, f.plantilla)); /* (al rehacerlos se queda su estilo) */ toast(`${f.clips.length} tarjetas de subtítulos (${f.palabras} palabras)${f.corregidas != null ? ` · la IA corrigió ${f.corregidas} tramo(s)` : ""}`); }
      else if(ev.codigo) toast("No se pudieron generar los subtítulos");
      return;
    }
    if(guardandoClip.current){
      guardandoClip.current = false;
      if(!ev.codigo){ sucio.current = false; repintar(x=>x+1); toast("Cambios guardados en el clip: el montaje del clon ya usa esta versión"); }
      vista.current && vista.current.sincronizar(reloj.t, 0);
      return;
    }
    if(!ev.codigo){ const f = (tareaClonRef.current && tareaClonRef.current.eventos || []).find(e=>e.evento==="fin"); toast("Exportado" + (f && f.salida ? ": " + f.salida : "")); }
  });

  const tareaClonRef = useRef(null); tareaClonRef.current = tareaClon;
  const tarea = tareaClon && ["exportar","guardarclip","redsubs"].includes(tareaClon.args[0]) ? tareaClon : null;
  const dur = M.total(p);
  const v1 = p.pistas.find(x=>x.id==="v1");
  const todos = useMemo(()=>M.todos(p),[p]);
  const fps = p.fps || 30;
  const fpsRef = useRef(fps); fpsRef.current = fps;

  // ---- al abrir: biblioteca, proyectos y lo que pida el Studio («Editar el clip»)
  useEffect(()=>{
    consultar(["redmedios"]).then(ev=>setMedios(ev.find(e=>e.evento==="hecho"))).catch(e=>toast(e.message));
    consultar(["redbiblio"]).then(ev=>setBiblio(ev.find(e=>e.evento==="hecho"))).catch(e=>toast(e.message));
    consultar(["redvoces"]).then(ev=>setVoces(ev.find(e=>e.evento==="hecho") || null)).catch(()=>{});
    consultar(["redefectos"]).then(ev=>setEfectos((ev.find(e=>e.evento==="hecho") || {}).efectos || [])).catch(()=>{});
    consultar(["redsubsplant"]).then(ev=>setSubsInfo(ev.find(e=>e.evento==="hecho") || null)).catch(()=>{});
    consultar(["redfuentes"]).then(ev=>{ const h = ev.find(e=>e.evento==="hecho"); if(h){ setFuentes(h.fuentes); setPresets({titulo:h.titulo, normal:h.normal}); } }).catch(()=>{});
    window.studioFS.redLista().then(r=>setProyectos(r.lista||[]));
    const quitar = window.studioFS.onEditorPeticion && window.studioFS.onEditorPeticion(req=>{ if(req && req.recopilacion) abrirRecopilacion(req.recopilacion); else if(req && req.carpeta) abrirClip(req.carpeta, req.archivo); else if(req && req.proyecto) abrir(req.proyecto); });
    window.studioFS.editorListo && window.studioFS.editorListo();
    return ()=>{ quitar && quitar(); };
  },[]);
  // guardado automático cada 45 s (proyectos con nombre; un clip no: guardarlo rehace el vídeo)
  useEffect(()=>{ const iv = setInterval(()=>{ if(sucio.current && pRef.current.nombre.trim() && !pRef.current.clip) guardar(true); }, 45000); return ()=>clearInterval(iv); },[]);
  // el título de la ventana
  const avisado = useRef(null);
  useEffect(()=>{
    document.title = `${sucio.current ? "• " : ""}${p.nombre || "Sin título"} — RandomEditor`;
    // el cierre de la ventana pregunta si hay cambios sin guardar
    if(avisado.current !== sucio.current){ avisado.current = sucio.current; window.studioFS.editorSucio && window.studioFS.editorSucio(sucio.current); }
  });
  // fotogramas y ondas de lo que hay en la línea de tiempo
  useEffect(()=>{
    p.pistas.forEach(pi=>pi.clips.forEach(c=>{
      if(!c.ruta || pedidos.current.has(c.ruta)) return;
      pedidos.current.add(c.ruta);
      consultar(["redonda", c.ruta]).then(ev=>{ const h = ev.find(e=>e.evento==="hecho"); setOndas(o=>({...o, [c.ruta]: h ? { p: h.picos || [], dt: h.dt, inicio: h.inicio || 0 } : { p: [] } })); }).catch(()=>{});
      if(pi.tipo==="video" && !c.efecto) consultar(["redtira", c.ruta]).then(ev=>{
        const h = (ev.find(e=>e.evento==="hecho")||{}).tira; if(!h) return;
        const img = new Image(); img.onload = () => setTiras(t=>({...t, [c.ruta]:{...h, img}})); img.src = fileUrl(h.jpg);
      }).catch(()=>{});
    }));
  });

  // proxies de los vídeos de la principal, de uno en uno (la gráfica los hace en segundos) y en caché
  const rutasVideo = [...new Set((v1 ? v1.clips : []).map(c=>c.ruta))];
  useEffect(()=>{
    if(!usarProxies) return;
    const q = colaProxy.current;
    rutasVideo.forEach(r=>{ if(!q.pedidos.has(r)){ q.pedidos.add(r); q.cola.push(r); } });
    const siguiente = () => {
      if(q.activos >= 1 || !q.cola.length) return;
      const r = q.cola.shift(); q.activos++;
      consultar(["redproxy", r]).then(ev=>{ const h = ev.find(e=>e.evento==="hecho"); if(h && h.proxy) setProxies(x=>({...x, [r]: h.proxy})); })
        .catch(e=>console.log("proxy", e.message)).finally(()=>{ q.activos--; siguiente(); });
    };
    siguiente();
  });
  const proxiesVista = usarProxies ? proxies : null;
  useEffect(()=>{ if(!jugandoRef.current && vista.current) vista.current.sincronizar(reloj.t, 0); },[proxiesVista]);
  const proxiesListos = rutasVideo.filter(r=>proxies[r]).length;

  // ---- reproducción
  const ir = t => { t = Math.max(0, Math.min(M.total(pRef.current), t)); reloj.poner(t); vista.current && vista.current.sincronizar(t, 0); };
  const setJugando = v => { const n = typeof v === "function" ? v(jugandoRef.current) : v; jugandoRef.current = n; setJugandoE(n); };
  useEffect(()=>{
    if(!jugando){ vista.current && vista.current.sincronizar(reloj.t, 0); return; }
    let ant = null, raf;
    if(jugando > 0 && reloj.t >= M.total(pRef.current) - 0.05) reloj.poner(0);
    const paso = ahora => {
      const dt = ant === null ? 0 : Math.max(0, Math.min(0.1, (ahora - ant) / 1000)); ant = ahora;
      let t = reloj.t + dt * jugandoRef.current;
      const tot = M.total(pRef.current);
      if((jugandoRef.current > 0 && t >= tot) || (jugandoRef.current < 0 && t <= 0)){ ir(Math.max(0, Math.min(tot, t))); setJugando(0); return; }
      const m = vista.current ? vista.current.sincronizar(t, jugandoRef.current) : null;
      if(m != null && Math.abs(m - t) < 0.25 && m >= reloj.t - 0.02) t = m;     // manda el fotograma que se ve
      reloj.poner(t);
      raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);
    return ()=>cancelAnimationFrame(raf);
  },[jugando]);
  /* parar: la vara se queda EXACTAMENTE en el fotograma que se estaba viendo (y la imagen no se mueve),
     en la rejilla de fotogramas del vídeo. Devuelve ese tiempo (las flechas cuentan desde él). */
  const detener = () => {
    if(!jugandoRef.current) return reloj.t;
    const m = vista.current && vista.current.mostrado ? vista.current.mostrado() : null;
    const t = M.cuantiza(m != null && Math.abs(m - reloj.t) < 0.5 ? m : reloj.t, fpsRef.current);
    setJugando(0); ir(t);
    return t;
  };
  const jugar = () => { if(jugandoRef.current) detener(); else setJugando(1); };
  // 8/11 (skimming): el visor enseña otro instante sin mover el cabezal (null = vuelve al cabezal); uno por fotograma
  const skimPend = useRef(null);
  const verEn = t => { const prim = skimPend.current === null; skimPend.current = t == null ? -1 : t; if(!prim) return;
    requestAnimationFrame(()=>{ const x = skimPend.current; skimPend.current = null; if(!vista.current || jugandoRef.current) return; vista.current.sincronizar(x < 0 ? reloj.t : x, 0); }); };

  // ---- meter medios
  const durDe = async m => {
    if(m.dur != null) return {dur:m.dur, video:m.video};
    const ev = await consultar(["redinfo", m.ruta]); const a = (ev.find(e=>e.evento==="hecho")||{}).archivos[0];
    return {dur:a.dur, video:a.video};
  };
  const meter = async (m, tipo, en, pistaId) => {
    let info; try { info = await durDe(m); } catch(e){ toast(e.message); return; }
    if(info.video === false) tipo = "audio";
    const imagen = M.IMAGEN.test(m.ruta || "");
    if(imagen) tipo = "video";                    // (8/11, fallo: soltada en una pista de audio quedaba muerta)
    const c = imagen ? { id:M.uid(), ruta:m.ruta, nombre:m.nombre, mini:m.ruta, desde:M.TEXTO0, hasta:M.TEXTO0 + 3, dur_src:1e9, en:0, vol:0, silencio:true, imagen:true }
                     : { id:M.uid(), ruta:m.ruta, nombre:m.nombre, mini:m.mini, desde:0, hasta:info.dur, dur_src:info.dur, en:0, vol:1, silencio:false };
    // 31/10: las IMÁGENES y lo que se suelta en una pista de vídeo superpuesta van a una superpuesta (encima)
    const destino = pistaId && pistaId !== "v1" && (pRef.current.pistas.find(x=>x.id===pistaId) || {}).tipo === "video" ? pistaId : null;
    if(tipo === "video" && (imagen || destino)){
      cambiar(prev=>{
        let ps = prev.pistas, id = destino;
        if(!id){ const hay = ps.find(x=>x.tipo==="video" && x.id!=="v1" && x.nombre!=="Efectos" && !x.bloqueada && x.clips.every(y=>imagen ? y.imagen : !y.imagen)); if(hay) id = hay.id; else { const n = M.nuevaPistaVideo(ps); const i = ps.findIndex(x=>x.id==="v1"); ps = [...ps.slice(0, i), n, ...ps.slice(i)]; id = n.id; } }
        return {...prev, pistas: M.colocar(ps, {...c, en: Math.max(0, en == null ? reloj.t : en)}, id, "video")};
      });
      return;
    }
    // el primer vídeo de la principal fija los fotogramas por segundo del proyecto (los de verdad)
    let fpsNuevo = null;
    if(tipo === "video" && !(pRef.current.pistas.find(x=>x.id==="v1")||{clips:[]}).clips.length){
      try { const ev = await consultar(["redinfo", m.ruta]); const a = ((ev.find(e=>e.evento==="hecho")||{}).archivos||[])[0]; if(a && a.fps) fpsNuevo = a.fps; } catch(e){}
    }
    if(tipo === "video"){
      cambiar(prev=>({...prev, ...(fpsNuevo ? {fps: fpsNuevo} : {}), pistas: prev.pistas.map(pi=>pi.id!=="v1" ? pi : {...pi, clips:[...pi.clips, prev.magnetica ? {...c, en: en==null ? Math.max(0,...pi.clips.map(fin)) : en - 0.0005} : M.sinPisar(pi, {...c, en: en==null ? Math.max(0,...pi.clips.map(fin)) : Math.max(0, en)})]})}));
    } else {
      cambiar(prev=>({...prev, pistas: M.colocarAudio(prev.pistas, {...c, en: en==null ? reloj.t : Math.max(0, en)}, pistaId)}));
    }
  };
  // 28/10: meter un texto (el de los títulos dura todo lo que hay; el normal, 3 s) en el cabezal
  const meterTexto = (cual, en, pistaId) => {
    if(!presets){ toast("Cargando los estilos de texto…"); return; }
    const titulo = cual === "titulo";
    const W = pRef.current.ancho || 1080, H = pRef.current.alto || 1920;
    const estilo = {...(titulo ? presets.titulo : presets.normal), x: W / 2, ...(titulo && H > W ? {} : {y: H / 2})};
    const t0 = M.cuantiza(en == null ? reloj.t : en, fps);
    const tot = M.total(pRef.current);
    const dur = titulo && tot - t0 > 1 ? tot - t0 : 3;
    const c = M.nuevoTexto(titulo ? "Título del Short" : "Texto", estilo, t0, dur, titulo ? "titulo" : null);
    cambiar(q=>({...q, pistas: M.colocar(q.pistas, c, pistaId, "texto")}));
    setSel(new Set([c.id]));
    setTimeout(()=>{ const ta = document.querySelector(".rd-insp textarea"); if(ta){ ta.focus(); ta.select(); } }, 80);
  };
  const meterRef = useRef(null); meterRef.current = meter;
  const meterFijo = React.useCallback((m, tipo)=>meterRef.current(m, tipo),[]);
  const textosElegidos = () => todos.filter(c=>est.current.sel.has(c.id) && c.tipo === "texto");
  const cambiarEstilo = (patch, gesto) => {
    const ids = new Set(textosElegidos().map(c=>c.id)); if(!ids.size) return;
    const f = q => ({...q, pistas: q.pistas.map(pi=>pi.tipo!=="texto" || pi.bloqueada ? pi : {...pi, clips: pi.clips.map(c=>ids.has(c.id) ? {...c, estilo:{...c.estilo, ...patch}} : c)})});
    if(gesto) alGesto("durante", f(pRef.current)); else cambiar(f);
  };
  const cambiarTexto = v => {
    const ids = new Set(textosElegidos().map(c=>c.id)); if(!ids.size) return;
    if(!gesto.current) alGesto("inicio");
    alGesto("durante", {...pRef.current, pistas: pRef.current.pistas.map(pi=>pi.tipo!=="texto" ? pi : {...pi, clips: pi.clips.map(c=>ids.has(c.id) ? {...c, texto:v, nombre:v.split("\n")[0] || "Texto"} : c)})});
  };
  const pistaSubs = p.pistas.find(x=>x.tipo==="subtitulos");
  const generarSubs = async () => {
    if(!v1 || !v1.clips.length){ toast("La pista principal está vacía: no hay nada que escuchar"); return; }
    if(pistaSubs && !window.confirm("Ya hay subtítulos. ¿Volver a generarlos? (los cambios a mano en sus tarjetas se pierden; Ctrl+Z los recupera)")) return;
    const r = await window.studioFS.redGuardarTmp({...pRef.current, nombre: pRef.current.nombre || "Sin título"}); if(r.error){ toast(r.error); return; }
    try { await lanzar(["redsubs", r.ruta, (pistaSubs && pistaSubs.plantilla) || subsPid, String(subsMax), ...(subsIa ? ["--ia", ...(subsCtx.trim() ? ["--contexto", subsCtx.trim()] : [])] : [])]); } catch(e){ toast(e.message); }
  };
  const cambiarPistaSubs = (patch, gesto) => {
    const f = q => ({...q, pistas: q.pistas.map(x=>x.tipo!=="subtitulos" ? x : {...x, ...patch(x)})});
    if(gesto) alGesto("durante", f(pRef.current)); else cambiar(f);
  };
  const cambiarTarjeta = v => {
    const s = est.current.sel;
    if(!gesto.current) alGesto("inicio");
    alGesto("durante", {...pRef.current, pistas: pRef.current.pistas.map(pi=>pi.tipo!=="subtitulos" ? pi : {...pi, clips: pi.clips.map(c=>s.has(c.id) ? M.retextoTarjeta(c, v) : c)})});
  };
  const meterArchivos = async () => {
    for(const r of await window.studioFS.redElegirArchivos()){
      try { const ev = await consultar(["redinfo", r]); const a = (ev.find(e=>e.evento==="hecho")||{}).archivos[0];
            await meter({ruta:r, nombre:a.nombre, dur:a.dur, video:a.video}, a.video ? "video" : "audio"); }
      catch(e){ toast(e.message); }
    }
  };

  // ---- operaciones (sobre lo elegido; sin selección, lo que pisa el cabezal en la principal)
  const objetivos = () => {
    const t = reloj.t, bajo = todos.filter(c=>t > c.en + 0.01 && t < fin(c) - 0.01 && !pRef.current.pistas.find(x=>x.id===c.pista).bloqueada);
    const e = bajo.filter(c=>est.current.sel.has(c.id));
    return new Set((e.length ? e : bajo.filter(c=>c.pista==="v1")).map(c=>c.id));
  };
  const dividir = () => { const ids = objetivos(); if(ids.size) cambiar(q=>M.dividir(q, ids, M.cuantiza(reloj.t, fps))); };
  const dividirEn = (id, t) => cambiar(q=>M.dividir(q, new Set([id]), t));
  const borrarLado = izq => {
    const ids = objetivos(); if(!ids.size) return;
    const c0 = todos.find(c=>ids.has(c.id) && c.pista==="v1");
    cambiar(q=>M.borrarLado(q, ids, M.cuantiza(reloj.t, fps), izq));
    if(izq && c0 && pRef.current.magnetica) setTimeout(()=>ir(c0.en), 0);
  };
  const eliminar = () => { const s = est.current.sel; if(!s.size) return; cambiar(q=>M.eliminar(q, s)); setSel(new Set()); };
  // 8/11 (Premiere «Ripple Delete», CapCut): borrar y cerrar el hueco (Shift+Supr) · cerrar los huecos de una pista
  const eliminarCerrando = () => { const s = est.current.sel; if(!s.size) return; cambiar(q=>M.borrarCerrando(q, s)); setSel(new Set()); };
  const cerrarHuecos = ids => { cambiar(q=>M.cerrarHuecos(q, ids)); toast("Huecos cerrados (Ctrl+Z para deshacer)"); };
  // 8/11 (Premiere «Track Select Forward», A): todo lo que hay del cabezal a la derecha, para correrlo de golpe
  const elegirDesdeAqui = t => { const n = M.desdeAqui(pRef.current, t); setSel(n); toast(n.size + " elementos del cabezal en adelante: arrástralos o usa Alt+← →"); };
  const copiar = cortar => { const s = est.current.sel; if(!s.size) return; setPorta(todos.filter(c=>s.has(c.id)).sort((a,b)=>a.en-b.en)); if(cortar) eliminar(); };
  const pegar = (cs, tras) => { cs = cs || est.current.porta; if(!cs.length) return; let nuevos = []; cambiar(q=>{ const [r, n] = M.pegar(q, cs, reloj.t, tras); nuevos = n; return r; }); setSel(new Set(nuevos)); };
  const duplicar = () => { const s = est.current.sel; if(s.size) pegar(todos.filter(c=>s.has(c.id)).sort((a,b)=>a.en-b.en), true); };
  const silenciar = () => { const s = est.current.sel; if(!s.size) return; const m = todos.filter(c=>s.has(c.id)).every(c=>c.silencio);
    cambiar(q=>({...q, pistas: q.pistas.map(pi=>pi.bloqueada ? pi : ({...pi, clips: pi.clips.map(c=>s.has(c.id) ? {...c, silencio:!m} : c)}))})); };
  const extraer = () => { const s = est.current.sel; if(s.size) { cambiar(q=>M.extraerAudio(q, s)); toast("Audio extraído a una pista (el vídeo se queda mudo)"); } };
  // v3.14.1: Alt+← / Alt+→ empujan lo elegido de las pistas de audio un fotograma (Shift: 10), para cuadrar un SFX
  const empujar = d => {
    const s = est.current.sel; if(!s.size) return;
    const q0 = pRef.current;
    // (8/11, fallo: dos SFX elegidos y pegados se separaban) se comprueba solo contra los que NO se mueven
    let cambio = false, choca = false;
    const nuevo = {...q0, pistas: q0.pistas.map(pi=>pi.id==="v1" || pi.bloqueada ? pi : {...pi, clips: pi.clips.map(c=>{
      if(!s.has(c.id)) return c;
      const en = Math.max(0, M.cuantiza(c.en + d, fps));
      if(M.solapa({clips: pi.clips.filter(x=>!s.has(x.id))}, en, largo(c))) choca = true;
      if(en !== c.en) cambio = true;
      return {...c, en};
    })})};
    if(!cambio || choca) return;
    cambiar(()=>nuevo);
  };
  const marcador = () => { const t = M.cuantiza(reloj.t, fps), ms = pRef.current.marcadores||[], cerca = ms.find(m=>Math.abs(M.mt(m)-t) < 0.05);
    cambiar(q=>({...q, marcadores: cerca!=null ? ms.filter(m=>m!==cerca) : [...ms, {t, nombre:"", color:"#60a5fa"}].sort((a,b)=>M.mt(a)-M.mt(b))})); };
  // (8/11) el nombre y el color de un marcador (desde la lista de Propiedades)
  const cambiarMarcador = (k, patch, enGesto) => { const f = q => ({...q, marcadores:(q.marcadores||[]).map((m, j)=>j!==k ? m : {...(typeof m === "number" ? {t:m, nombre:"", color:"#60a5fa"} : m), ...patch})});
    if(enGesto){ if(!gesto.current) alGesto("inicio"); alGesto("durante", f(pRef.current)); } else cambiar(f); };
  const accionPista = (que, id) => cambiar(q=>({...q, pistas: que==="quitar" ? q.pistas.filter(x=>x.id!==id) : q.pistas.map(x=>x.id===id ? {...x, [que]:!x[que]} : x)}));
  // 31/10: un EFECTO (vídeo con transparencia) en una pista superpuesta «Efectos» de arriba; con su sonido,
  // además, su SFX en una pista de audio (cada uno por su lado: se mueven y se borran por separado)
  // 31/10: la VOZ (texto a voz) en una pista de audio, en el cabezal, con su velocidad y tono; y el sonido
  // de un clip con la voz mejorada y/o aislada (clon/locucion.py)
  const deHecho = async args => { try { return (await consultar(args)).find(e=>e.evento==="hecho") || {}; } catch(e){ toast(e.message); throw e; } };
  const generarVoz = (voz, texto) => deHecho(["redtts", voz, texto]);
  const procesarVoz = (ruta, mejorar, aislar) => deHecho(["redvozproc", ruta, String(mejorar), aislar ? "si" : "no"]);
  const meterVoz = (m, velocidad, tono, aviso) => {
    const c = { id:M.uid(), ruta:m.ruta, nombre:m.nombre, desde:0, hasta:m.dur, dur_src:m.dur, en:reloj.t, vol:1, silencio:false,
                ...(Math.abs(velocidad - 1) > 0.001 ? {velocidad} : {}), ...(tono ? {tono:true} : {}) };
    cambiar(prev=>({...prev, pistas: M.colocarAudio(prev.pistas, c, null)}));
    toast(aviso || "Voz añadida en el cabezal");
  };
  const meterEfecto = async (e, conSonido, en, pistaId) => {
    const t0 = M.cuantiza(en == null ? reloj.t : en, fps);
    let r;
    try { toast(`Preparando «${e.nombre}»…`); const ev = await consultar(["redefecto", e.id, String(pRef.current.ancho || 1080), String(pRef.current.alto || 1920)]); r = ev.find(x=>x.evento==="hecho"); }
    catch(x){ toast(x.message); return; }
    const c = { id:M.uid(), ruta:r.ruta, nombre:e.nombre, efecto:e.id, desde:0, hasta:r.dur, dur_src:r.dur, en:t0, vol:0, silencio:true };
    cambiar(q=>{
      let ps = q.pistas, id = pistaId && (ps.find(x=>x.id===pistaId) || {}).tipo === "video" && pistaId !== "v1" ? pistaId : null;
      if(!id){ const hay = ps.find(x=>x.tipo==="video" && x.nombre==="Efectos"); if(hay) id = hay.id; else { const n = {...M.nuevaPistaVideo(ps), nombre:"Efectos"}; const i = ps.findIndex(x=>x.tipo==="video"); ps = [...ps.slice(0, i), n, ...ps.slice(i)]; id = n.id; } }
      ps = M.colocar(ps, c, id, "video");
      if(conSonido && e.sfx) ps = M.colocarAudio(ps, { id:M.uid(), ruta:e.sfx, nombre:e.sfx_nombre, desde:0, hasta:e.sfx_dur || 1.5, dur_src:e.sfx_dur || 1.5, en:t0, vol:1, silencio:false }, null);
      return {...q, pistas: ps};
    });
  };
  const anadirPista = () => cambiar(q=>({...q, pistas:[...q.pistas, M.nuevaPistaAudio(q.pistas)]}));
  const anadirPistaVideo = () => cambiar(q=>{ const i = q.pistas.findIndex(x=>x.id==="v1"); return {...q, pistas:[...q.pistas.slice(0, i), M.nuevaPistaVideo(q.pistas), ...q.pistas.slice(i)]}; });
  const quitarAire = async () => {
    const cs = v1 ? v1.clips : []; if(!cs.length) return;
    const aires = {};
    try { for(const r of [...new Set(cs.map(c=>c.ruta))]){ const ev = await consultar(["redaire", r]); aires[r] = (ev.find(e=>e.evento==="hecho")||{}).aire || []; } }
    catch(e){ toast(e.message); return; }
    let n = 0; cambiar(q=>{ const [r, k] = M.quitarAire(q, aires); n = k; return r; });
    toast(n ? `Aire quitado en ${n} sitio${n!==1?"s":""} (Ctrl+Z para deshacer)` : "No hay silencios largos que quitar");
  };
  // 31/10: cambiar UN clip entero (transformar, velocidad, tiempos); con `gesto`, dentro de un arrastre
  // (8/11) cambiar tiempos desde las propiedades: tampoco puede quedar encima de otro de su pista
  const cambiarTiempos = n => { const pi = pRef.current.pistas.find(x=>x.clips.some(c=>c.id===n.id));
    if(pi && !(pi.id==="v1" && pRef.current.magnetica) && M.solapa(pi, n.en, largo(n), n.id)){ toast("Ahí se monta encima de otro clip de su pista"); repintar(x=>x+1); return; }
    cambiarClip(n); };
  const cambiarClip = (n, gesto) => {
    const f = q => ({...q, pistas: q.pistas.map(pi=>!pi.bloqueada && pi.clips.some(c=>c.id===n.id) ? {...pi, clips: pi.clips.map(c=>{ if(c.id!==n.id) return c; const x = {...n}; delete x.pista; return x; })} : pi)});
    if(gesto) alGesto("durante", f(pRef.current)); else cambiar(f);
  };
  // ---- copiar y pegar atributos (Ctrl+Alt+C / Ctrl+Alt+V)
  const portaAtrib = useRef(null);
  const copiarAtributos = () => {
    const s = est.current.sel, c = M.todos(pRef.current).find(x=>s.has(x.id) && x.ruta);
    if(!c){ toast("Elige el clip del que copiar"); return; }
    portaAtrib.current = { de: c.nombre || "el clip", a: Object.fromEntries(ATRIBUTOS.filter(k=>c[k] !== undefined).map(k=>[k, JSON.parse(JSON.stringify(c[k]))])) };
    toast("📋 Atributos copiados de «" + portaAtrib.current.de + "»: elige otros clips y pulsa «Pegar atributos» (Ctrl+Alt+V)");
  };
  const pegarAtributos = () => {
    const pa = portaAtrib.current, s = est.current.sel;
    if(!pa){ toast("Primero copia los atributos de un clip (Ctrl+Alt+C)"); return; }
    let n = 0;
    cambiar(q=>({...q, pistas: q.pistas.map(pi=>pi.bloqueada ? pi : ({...pi, clips: pi.clips.map(c=>{
      if(!s.has(c.id) || !c.ruta) return c;
      n++; const x = {...c}; for(const k of ATRIBUTOS){ if(pa.a[k] === undefined) delete x[k]; else x[k] = JSON.parse(JSON.stringify(pa.a[k])); } return x;
    })}))}));
    toast(n ? "📋 Atributos de «" + pa.de + "» pegados en " + n + " clip" + (n > 1 ? "s" : "") : "Elige los clips en los que pegarlos");
  };
  // ---- el volumen con puntos clave (◆): con puntos, mover la barra cambia el del cabezal (o pone uno)
  const tRelDe = c => Math.max(0, Math.min(M.largo(c), reloj.t - c.en));
  const ponerVol = (c, v, gesto) => {
    const kf = (c.kf || {}).vol;
    if(kf && kf.length){
      const t = +tRelDe(c).toFixed(4), i = kf.findIndex(x=>Math.abs(x[0] - t) < 0.02);
      const n = i >= 0 ? kf.map((x, j)=>j === i ? [x[0], v, x[2]] : x) : [...kf, [t, v, "lineal"]].sort((a,b)=>a[0]-b[0]);
      cambiarClip({...c, kf:{...(c.kf || {}), vol:n}}, gesto);
    } else cambiarClip({...c, vol:v}, gesto);
  };
  const alternarKfVol = c => {
    const kf = (c.kf || {}).vol || [], t = +tRelDe(c).toFixed(4), ya = kf.find(x=>Math.abs(x[0] - t) < 0.02);
    const n = ya ? kf.filter(x=>x !== ya) : [...kf, [t, M.volEn(c, t), "lineal"]].sort((a,b)=>a[0]-b[0]);
    cambiarClip({...c, kf:{...(c.kf || {}), vol:n}, ...(n.length ? {} : { vol: M.volEn(c, t) })});
  };
  const ponerEnElegidos = (campo, v, enGesto) => { const s = est.current.sel;
    const f = q => ({...q, pistas: q.pistas.map(pi=>pi.bloqueada ? pi : ({...pi, clips: pi.clips.map(c=>s.has(c.id) ? {...c, [campo]:v} : c)}))});
    if(enGesto && gesto.current) alGesto("durante", f(pRef.current)); else cambiar(f); };

  // ---- guardar / abrir / exportar / modo clip
  const guardar = async callado => {
    const pr = pRef.current;
    if(!pr.nombre.trim()){ if(!callado) toast("Ponle un nombre al proyecto (arriba)"); return null; }
    const r = await window.studioFS.redGuardar(pr);
    if(r.error){ if(!callado) toast(r.error); return null; }
    sucio.current = false; repintar(x=>x+1);
    window.studioFS.redLista().then(x=>setProyectos(x.lista||[]));
    if(!callado) toast("Proyecto guardado");
    return r.ruta;
  };
  const cargarProyecto = pr => { pRef.current = M.ordenar(M.normalizar({...M.nuevoProyecto(), ...pr})); pasado.current = []; futuro.current = []; sucio.current = false; setSel(new Set()); repintar(x=>x+1); setTimeout(()=>{ ir(0); ajustar(); }, 60); };
  const abrir = async nombre => {
    if(sucio.current && !window.confirm("Hay cambios sin guardar. ¿Abrir otro proyecto igualmente?")) return;
    const r = await window.studioFS.redAbrir(nombre); if(r.error){ toast(r.error); return; } cargarProyecto(r.proyecto);
  };
  const nuevo = () => { if(sucio.current && !window.confirm("Hay cambios sin guardar. ¿Empezar uno nuevo?")) return; cargarProyecto(M.nuevoProyecto()); };
  // 4/11, él: "que antes de exportarlo me deje seleccionar la miniatura": antes de exportar un vídeo (no un clip) se
  // elige la portada con el cabezal; se exporta en su carpeta, «Nombre\Nombre.mp4» + «Nombre - Miniatura.jpg»
  const exportar = como => {
    setMenuExp(false);
    if(!v1 || !v1.clips.length){ toast("La pista principal está vacía"); return; }
    if(como === "clip"){ exportarYa(como); return; }
    setJugando(0);
    if(pRef.current.portada != null) ir(pRef.current.portada);
    setEligiendoMini(como);
  };
  const exportarYa = async como => {
    setMenuExp(false);
    if(!v1 || !v1.clips.length){ toast("La pista principal está vacía"); return; }
    let destino = null;
    if(como === "ruta"){
      destino = await window.studioFS.redElegirDestino((pRef.current.nombre || "Sin título").replace(/^\d+ - /, ""));
      if(!destino) return;
    }
    // (con un clip abierto, o sin nombre, el proyecto va a un temporal: no se guarda en la lista)
    let ruta;
    if(pRef.current.clip || !pRef.current.nombre.trim()){
      const r = await window.studioFS.redGuardarTmp({...pRef.current, nombre: pRef.current.nombre.trim() || "Sin título"}); if(r.error){ toast(r.error); return; } ruta = r.ruta;
    } else { ruta = await guardar(); if(!ruta) return; }
    const args = ["exportar", ruta, como, ...(como==="clip" ? [pRef.current.nombre] : como==="ruta" ? [destino] : [])];
    // 8/11, él: «al exportar un vídeo con el mismo nombre que otro, que dé la opción de reemplazarlo» (en «Exportar en…»
    // ya lo pregunta Windows al elegir el archivo)
    if(como === "listos" || como === "destino"){
      try { const h = (await consultar(["redsalida", ruta, como])).find(e=>e.evento==="hecho") || {};
        if(h.existe){ setYaExiste({ salida: h.salida, args }); return; } } catch(e){}
    }
    lanzarExport(args);
  };
  const lanzarExport = async args => { try { await lanzar(args); } catch(e){ toast(e.message); } };
  const abrirClip = async (carpeta, archivo) => {
    if(sucio.current && !window.confirm("Hay cambios sin guardar. ¿Abrir el clip igualmente?")) return;
    try { const ev = await consultar(["redabrirclip", carpeta, archivo]); cargarProyecto(ev.find(e=>e.evento==="hecho").proyecto); }
    catch(e){ toast(e.message); }
  };
  // 28/10: una recopilación entera (cada momento seguido, en su orden) como proyecto nuevo, listo para
  // meterle lo que falte. Si ya hay un proyecto suyo guardado, se pregunta cuál abrir
  const abrirRecopilacion = async carpeta => {
    if(sucio.current && !window.confirm("Hay cambios sin guardar. ¿Abrir la recopilación igualmente?")) return;
    try {
      const ev = await consultar(["redrecop", carpeta]); const pr = ev.find(e=>e.evento==="hecho").proyecto;
      if(pr.existe && window.confirm(`Ya tienes un proyecto «${pr.nombre}».

Aceptar: abrir ese proyecto (con lo que ya le pusiste).
Cancelar: empezar de nuevo con los clips de la recopilación.`)){
        const r = await window.studioFS.redAbrir(pr.nombre); if(!r.error){ cargarProyecto(r.proyecto); return; }
      }
      const { existe, ...limpio } = pr;
      cargarProyecto(limpio); sucio.current = true; repintar(x=>x+1);
      toast(`${limpio.pistas[0].clips.length} momentos en la pista principal, en tu orden`);
    } catch(e){ toast(e.message); }
  };
  const guardarCambios = async () => {
    const c = pRef.current.clip; if(!c) return;
    if(!v1 || !v1.clips.length){ toast("La pista principal está vacía: para quitarlo entero, descarta el clip en Clips"); return; }
    setJugando(0); await vista.current.soltar();
    const r = await window.studioFS.redGuardarTmp(pRef.current); if(r.error){ toast(r.error); return; }
    guardandoClip.current = true;
    try { await lanzar(["guardarclip", r.ruta, c.carpeta, c.archivo]); } catch(e){ guardandoClip.current = false; toast(e.message); }
  };
  const volverAlOriginal = async () => {
    const c = pRef.current.clip; if(!c || !window.confirm("¿Volver al clip original? Se pierden los cambios guardados de este clip.")) return;
    await vista.current.soltar();
    try { await consultar(["original", c.carpeta, c.archivo]); sucio.current = false; toast("Clip original recuperado"); await abrirClip(c.carpeta, c.archivo); } catch(e){ toast(e.message); }
  };
  const formato = f => { const [w,h] = M.LIENZOS[f]; cambiar(q=>({...q, formato:f, ancho:w, alto:h})); };
  const ajustar = () => { const w = (document.querySelector(".rd-linea")||{}).clientWidth || 1000; setZoom(Math.max(0.5, Math.min(2000, (w - 140) / Math.max(5, M.total(pRef.current))))); };

  // ---- atajos (CapCut PC + lo mejor de los demás)
  useEffect(()=>{
    const h = e => {
      const ae = document.activeElement;
      if(ae && (ae.tagName==="TEXTAREA" || ae.tagName==="SELECT" || (ae.tagName==="INPUT" && !["range","checkbox","button"].includes(ae.type)))) return;
      if(ae && ae !== document.body && (ae.tagName==="INPUT" || ae.tagName==="BUTTON")) ae.blur();
      const k = e.key, ctrl = e.ctrlKey || e.metaKey, K = k.length===1 ? k.toLowerCase() : k;
      const para = ["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(k) || (K==="k" && !ctrl);
      const t = para ? detener() : reloj.t;
      const ok = () => { e.preventDefault(); e.stopImmediatePropagation(); };
      const puntos = M.puntosDeCorte(pRef.current);
      if(k===" "){ ok(); jugar(); }
      else if(ctrl && e.shiftKey && K==="z"){ ok(); rehacer(); }
      else if(ctrl && K==="y"){ ok(); rehacer(); }
      else if(ctrl && K==="z"){ ok(); deshacer(); }
      else if(ctrl && e.shiftKey && K==="s"){ ok(); extraer(); }
      else if(ctrl && e.shiftKey && K==="f"){ ok(); setCompleta(x=>!x); }
      else if(ctrl && K==="b"){ ok(); dividir(); }
      else if(ctrl && e.altKey && K==="c"){ ok(); copiarAtributos(); }
      else if(ctrl && e.altKey && K==="v"){ ok(); pegarAtributos(); }
      else if(ctrl && K==="c"){ ok(); copiar(false); }
      else if(ctrl && K==="x"){ ok(); copiar(true); }
      else if(ctrl && K==="v"){ ok(); pegar(); }
      else if(ctrl && K==="d"){ ok(); duplicar(); }
      else if(ctrl && K==="a"){ ok(); setSel(new Set(todos.filter(c=>!(pRef.current.pistas.find(x=>x.id===c.pista) || {}).bloqueada).map(c=>c.id))); }
      else if(ctrl && K==="s"){ ok(); pRef.current.clip ? guardarCambios() : guardar(); }
      else if(ctrl && e.shiftKey && K==="e"){ ok(); exportar("ruta"); }
      else if(ctrl && K==="e"){ ok(); exportar(pRef.current.destino ? "destino" : "listos"); }
      else if(ctrl && K==="i"){ ok(); meterArchivos(); }
      else if(ctrl && K==="t"){ ok(); meterTexto("normal"); }
      else if(ctrl && (k==="+"||k==="=")){ ok(); setZoom(z=>Math.min(2000, z*1.4)); }
      else if(ctrl && (k==="-"||k==="_")){ ok(); setZoom(z=>Math.max(0.5, z/1.4)); }
      else if(ctrl && k==="ArrowLeft"){ ok(); ir([...puntos].reverse().find(x=>x < t - 0.01) ?? 0); }
      else if(ctrl && k==="ArrowRight"){ ok(); ir(puntos.find(x=>x > t + 0.01) ?? M.total(pRef.current)); }
      else if(ctrl) return;
      else if(e.shiftKey && (k==="Delete"||k==="Backspace")){ ok(); eliminarCerrando(); }
      else if(k==="Delete"||k==="Backspace"){ ok(); eliminar(); }
      else if(K==="a"){ ok(); elegirDesdeAqui(t); }
      else if(K==="s"){ ok(); setSkim(x=>{ toast(x ? "Previsualizar al pasar el ratón: apagado" : "Previsualizar al pasar el ratón: encendido (S)"); return !x; }); }
      else if(K==="h"){ ok(); setCompacta(x=>!x); }
      else if(e.shiftKey && K==="z"){ ok(); ajustar(); }
      else if(e.shiftKey && K==="m"){ ok(); silenciar(); }
      else if(K==="q"){ ok(); borrarLado(true); }
      else if(K==="w"){ ok(); borrarLado(false); }
      else if(K==="m"){ ok(); marcador(); }
      else if(K==="n"){ ok(); setIman(x=>!x); }
      else if(K==="g"){ ok(); setGuias(x=>!x); }
      else if(K==="v"){ ok(); setHerramienta("sel"); }
      else if(K==="b"){ ok(); setHerramienta("cuchilla"); }
      else if(K==="k"){ ok(); }
      else if(K==="l"){ ok(); setJugando(j=>j>0 ? Math.min(4, j*2) : 1); }
      else if(K==="j"){ ok(); setJugando(j=>j<0 ? Math.max(-4, j*2) : -1); }
      else if(k==="Escape"){ ok(); if(menu) setMenu(null); else if(completa) setCompleta(false); else { setSel(new Set()); setHerramienta("sel"); } }
      else if(e.altKey && (k==="ArrowLeft" || k==="ArrowRight")){ ok(); empujar((k==="ArrowLeft" ? -1 : 1) * (e.shiftKey ? 10 : 1) / fps); }
      else if(k==="ArrowLeft"){ ok(); ir(M.cuantiza(t, fps) - (e.shiftKey ? 1 : 1/fps)); }
      else if(k==="ArrowRight"){ ok(); ir(M.cuantiza(t, fps) + (e.shiftKey ? 1 : 1/fps)); }
      else if(k==="ArrowUp"){ ok(); ir([...puntos].reverse().find(x=>x < t - 0.01) ?? 0); }
      else if(k==="ArrowDown"){ ok(); ir(puntos.find(x=>x > t + 0.01) ?? M.total(pRef.current)); }
      else if(k==="Home"){ ok(); ir(0); }
      else if(k==="End"){ ok(); ir(M.total(pRef.current)); }
    };
    const arriba = e => { if(e.key===" " && !(document.activeElement?.tagName==="INPUT" && document.activeElement.type==="text")) e.preventDefault(); };
    window.addEventListener("keydown", h, true); window.addEventListener("keyup", arriba, true);
    return ()=>{ window.removeEventListener("keydown", h, true); window.removeEventListener("keyup", arriba, true); };
  });

  const ocupado = !!(tarea && !tarea.cerrada);
  const elegidos = todos.filter(c=>sel.has(c.id));
  const uno = elegidos.length === 1 ? elegidos[0] : null;
  const esVideo = !!(uno && (p.pistas.find(x=>x.id===uno.pista) || {}).tipo === "video");
  const vistaEl = <Vista ref={vista} proyecto={p} guias={guias} proxies={proxiesVista} reloj={reloj} sel={sel}
    onElegirTexto={id=>setSel(new Set([id]))} onGesto={alGesto} subs={subsInfo} cambiarClip={cambiarClip} editarMascara={pestInsp==="mascara"} ondas={ondas}/>;
  const menuEl = menu && createPortal(
    <div onMouseDown={()=>setMenu(null)} style={{position:"fixed",inset:0,zIndex:2000}}>
      <div className="rd-menu" onMouseDown={e=>e.stopPropagation()} style={{left:Math.min(menu.x, window.innerWidth-230), top:Math.min(menu.y, window.innerHeight-300)}}>
        {[["Dividir en el cabezal","Ctrl+B",dividir],["Copiar","Ctrl+C",()=>copiar(false)],["Cortar","Ctrl+X",()=>copiar(true)],["Duplicar","Ctrl+D",duplicar],
          ...(elegidos.some(c=>c.pista==="v1") ? [["Extraer audio","Ctrl+Shift+S",extraer]] : []),
          [elegidos.every(c=>c.silencio) ? "Devolver el sonido" : "Silenciar","Shift+M",silenciar],["Eliminar","Supr",eliminar],
          ["Eliminar y cerrar el hueco","Shift+Supr",eliminarCerrando],["Cerrar los huecos de esta pista","",()=>cerrarHuecos(new Set([menu.pista]))],
          ["Elegir todo del cabezal en adelante","A",()=>elegirDesdeAqui(reloj.t)]].map(([n,k,f])=>
          <button key={n} onClick={()=>{ setMenu(null); f(); }}><span>{n}</span><kbd>{k}</kbd></button>)}
      </div>
    </div>, document.body);

  return (
    <div className="rd-app" onMouseDownCapture={e=>{ if(e.target.closest && e.target.closest("button")) e.preventDefault(); }}
      onPointerUpCapture={e=>{ if(e.target.tagName==="INPUT" && e.target.type==="range") setTimeout(()=>e.target.blur(), 0); }}>
      <style>{CSS}</style>
      {/* barra de arriba */}
      <div className="rd-barra">
        <span style={{fontFamily:"'Sora',sans-serif",fontWeight:800,fontSize:15,marginRight:6}}>Random<span style={{color:"var(--gold)"}}>Editor</span></span>
        {p.clip && <span className="rd-etiqueta">✂ Clip</span>}
        <input value={p.nombre} readOnly={!!p.clip} onChange={e=>{ pRef.current = {...pRef.current, nombre:e.target.value}; sucio.current = true; repintar(x=>x+1); }}
          placeholder="Nombre del proyecto" className="rd-input" style={{width:260,fontWeight:650}}/>
        <span style={{fontSize:11.5,color:sucio.current?"var(--gold)":"#777"}}>{sucio.current ? "sin guardar" : (p.nombre ? "guardado" : "")}</span>
        <button onClick={nuevo} className="rd-btn">Nuevo</button>
        <select value="" onChange={e=>e.target.value && abrir(e.target.value)} className="rd-btn"><option value="">Abrir…</option>{proyectos.map(x=><option key={x.nombre} value={x.nombre}>{x.nombre}</option>)}</select>
        {!p.clip && <button onClick={()=>guardar()} className="rd-btn" title="Ctrl+S">Guardar</button>}
        <span className="rd-sep"/>
        {Object.entries(M.LIENZOS).map(([k,[w,h,et]])=><button key={k} onClick={()=>formato(k)} className={"rd-btn"+(p.formato===k?" on":"")}>{et}</button>)}
        <span style={{flex:1}}/>
        <button onClick={()=>setAjustesAb(x=>!x)} className={"rd-ico"+(ajustesAb?" on":"")} title="Rendimiento, proxies y contador de FPS">{I.ajustes}</button>
        <button onClick={quitarAire} className="rd-btn" title="Quita los silencios largos de la pista principal (Ctrl+Z para deshacer)">{I.aire} Quitar el aire</button>
        {/* 31/10, él: "que se pueda seleccionar la miniatura del timeline, como en CapCut": la PORTADA */}
        <div style={{position:"relative"}}>
          <button onClick={()=>setMenuPortada(x=>!x)} className={"rd-btn"+(p.portada != null ? " on" : "")} title={p.portada != null ? `Portada en ${tc(p.portada, fps)}: al exportar se guarda como «… - Miniatura.jpg»` : "Elegir la portada (la miniatura) del vídeo"}>{I.portada} Portada</button>
          {menuPortada && createPortal(<div onMouseDown={()=>setMenuPortada(false)} style={{position:"fixed",inset:0,zIndex:2000}}>
            <div className="rd-menu" onMouseDown={e=>e.stopPropagation()} style={{right:220,top:44}}>
              <button onClick={()=>{ setMenuPortada(false); cambiar(q=>({...q, portada: M.cuantiza(reloj.t, fps)})); toast("Portada: el fotograma del cabezal (con sus textos). Sale al exportar como «… - Miniatura.jpg»"); }}><span>Usar el fotograma del cabezal</span><kbd>{tc(reloj.t, fps)}</kbd></button>
              {p.portada != null && <button onClick={()=>{ setMenuPortada(false); setJugando(0); ir(p.portada); }}><span>Ir a la portada</span><kbd>{tc(p.portada, fps)}</kbd></button>}
              {p.portada != null && <button onClick={()=>{ setMenuPortada(false); cambiar(q=>({...q, portada:null})); }}><span>Quitar la portada</span><kbd></kbd></button>}
            </div></div>, document.body)}
        </div>
        {p.clip && <button onClick={volverAlOriginal} disabled={ocupado} className="rd-btn">Volver al original</button>}
        <div style={{position:"relative",display:"flex"}}>
          <button onClick={()=>exportar(p.destino ? "destino" : "listos")} disabled={ocupado} className={"rd-btn"+(p.clip ? "" : " primario")} style={{borderTopRightRadius:0,borderBottomRightRadius:0}}
            title={p.destino ? "Ctrl+E · rehace su vídeo en su sitio: " + p.destino : "Ctrl+E · elige la miniatura y exporta a su carpeta en Editados (el vídeo y su miniatura juntos)"}>{I.exportar} Exportar vídeo</button>
          <button onClick={()=>setMenuExp(x=>!x)} disabled={ocupado} className={"rd-btn"+(p.clip ? "" : " primario")} style={{borderTopLeftRadius:0,borderBottomLeftRadius:0,borderLeft:"1px solid rgba(0,0,0,0.25)",padding:"6px 7px"}} title="Más formas de exportar">▾</button>
          {menuExp && createPortal(<div onMouseDown={()=>setMenuExp(false)} style={{position:"fixed",inset:0,zIndex:2000}}>
            <div className="rd-menu" onMouseDown={e=>e.stopPropagation()} style={{right:p.clip ? 150 : 12,top:44}}>
              {p.destino && <button onClick={()=>exportar("destino")}><span>Rehacer su vídeo (Editados)</span><kbd>Ctrl+E</kbd></button>}
              <button onClick={()=>exportar("listos")}><span>Exportar vídeo a Editados (en su carpeta)</span><kbd>{p.destino ? "" : "Ctrl+E"}</kbd></button>
              <button onClick={()=>exportar("ruta")}><span>Exportar vídeo en…</span><kbd>Ctrl+Shift+E</kbd></button>
              <button onClick={()=>exportar("clip")}><span>Exportar como clip recortado nuevo</span><kbd></kbd></button>
              <button onClick={()=>{ cambiar(q=>({...q, lufs:!q.lufs})); }} title="Toda la mezcla a −14 LUFS (lo que pide YouTube): ningún vídeo suena más flojo o más fuerte que los demás">
                <span>{p.lufs ? "✓ " : ""}Volumen de YouTube (−14 LUFS)</span><kbd>{p.lufs ? "sí" : "no"}</kbd></button>
            </div></div>, document.body)}
        </div>
        {p.clip && <button onClick={guardarCambios} disabled={ocupado} className="rd-btn primario" title="Ctrl+S · rehace el clip con estos cambios, en su sitio">Guardar cambios</button>}
      </div>
      {tarea && <div style={{padding:"0 10px"}}><PanelTarea tarea={tarea} onCerrar={cerrarTarea}/></div>}
      {/* biblioteca · previsualización · propiedades */}
      <div className="rd-medio-fila">
        <Biblioteca medios={medios} biblio={biblio} presets={presets} onMeter={meterFijo} onArchivos={meterArchivos} onTexto={cual=>meterTexto(cual)}
          efectos={efectos} onEfecto={(e, s)=>meterEfecto(e, s)}
          panelVoces={<PanelVoces info={voces} generar={generarVoz} onMeter={meterVoz}/>}
          panelGuion={<PanelGuion proyecto={p} reloj={reloj} onIr={t=>{ setJugando(0); ir(t); }}
            onQuitar={(rangos, aviso)=>{ setJugando(0); cambiar(q=>M.quitarTramos(q, rangos)); toast(aviso + " (Ctrl+Z para deshacer)"); }}/>}
          panelSubs={<PanelSubtitulos info={subsInfo} pista={pistaSubs} elegida={subsPid} setElegida={setSubsPid} maxPal={subsMax} setMaxPal={setSubsMax}
            onGenerar={generarSubs} ocupado={ocupado} generando={!!(tarea && !tarea.cerrada && tarea.args[0]==="redsubs")} alGesto={alGesto} fuentes={fuentes}
            ia={subsIa} setIa={setSubsIa} contexto={subsCtx} setContexto={setSubsCtx}
            onPlantilla={pid=>cambiarPistaSubs(()=>({plantilla:pid, estilo:{}}))} onEstilo={(patch, g)=>cambiarPistaSubs(x=>({estilo:{...(x.estilo||{}), ...patch}}), g)}
            onQuitar={()=>{ cambiar(q=>({...q, pistas: q.pistas.filter(x=>x.tipo!=="subtitulos")})); toast("Subtítulos quitados (Ctrl+Z para recuperarlos)"); }}
            onGuardarPlantilla={async nombre=>{ try { const h = await deHecho(["redsubsguardar", nombre, pistaSubs.plantilla, JSON.stringify(pistaSubs.estilo || {}), String(subsMax)]);
              setSubsInfo(h); cambiarPistaSubs(()=>({plantilla:h.id, estilo:{}})); setSubsPid(h.id); toast(`Plantilla «${nombre}» guardada`); } catch(e){} }}
            onBorrarPlantilla={async id=>{ try { setSubsInfo(await deHecho(["redsubsborrar", id])); toast("Plantilla quitada"); } catch(e){} }}/>}
          onMeterTodos={async r=>{ for(const m of r.clips) await meter(m, "video"); toast(`${r.clips.length} momentos al final de la principal, en tu orden`); }}/>
        <div className="rd-panel" style={{display:"flex",flexDirection:"column",minWidth:0,background:"#0b0b0b"}}>
          <div style={{position:"relative",flex:1,minHeight:0,display:"flex",alignItems:"stretch",justifyContent:"center",padding:10,gap:6}}>
            {verFps && <Fps vista={vista} jugando={jugando}/>}
            {usarProxies && rutasVideo.length > proxiesListos && <div style={{position:"absolute",right:10,top:8,zIndex:2,fontSize:11,fontWeight:700,padding:"2px 7px",borderRadius:5,background:"rgba(0,0,0,0.6)",color:"#bbb"}}
              title="Copias ligeras para previsualizar: mientras se hacen, se ve el original">Preparando la previsualización fluida… {proxiesListos}/{rutasVideo.length}</div>}
            <div onClick={jugar} onDoubleClick={()=>{ setJugando(0); setCompleta(true); }} title="Clic: reproducir / pausar · doble clic: pantalla completa"
              style={{flex:1,minWidth:0,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
              {completa ? createPortal(<div style={{position:"fixed",inset:0,zIndex:1500,background:"#000",display:"flex",alignItems:"center",justifyContent:"center"}} onDoubleClick={()=>setCompleta(false)}>{vistaEl}
                {/* (5/11, él: "que pueda salir de la vista ampliada con una X en la esquina, a parte de pulsando Esc") */}
                <button onClick={e=>{ e.stopPropagation(); setCompleta(false); }} onDoubleClick={e=>e.stopPropagation()} title="Salir de la vista ampliada (Esc)"
                  style={{position:"fixed",top:16,right:16,zIndex:1501,width:42,height:42,borderRadius:"50%",border:"1px solid rgba(255,255,255,0.35)",
                    background:"rgba(20,20,20,0.75)",color:"#fff",fontSize:22,lineHeight:"40px",cursor:"pointer",boxShadow:"0 4px 14px rgba(0,0,0,0.5)"}}>✕</button>
              </div>, document.body) : vistaEl}
            </div>
            {verMedidor && <Medidor reloj={reloj} proyecto={p} ondas={ondas}/>}
          </div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"6px 10px",borderTop:"1px solid #222"}}>
            <button onClick={()=>ir(0)} className="rd-ico" title="Al principio (Inicio)">{I.inicio}</button>
            <button onClick={()=>{ setJugando(0); ir([...M.puntosDeCorte(p)].reverse().find(x=>x < reloj.t - 0.01) ?? 0); }} className="rd-ico" title="Corte anterior (↑)">{I.atras}</button>
            <button onClick={jugar} className={"rd-ico grande"+(jugando?" on":"")} title="Reproducir / pausar (Espacio · J/K/L)">{jugando ? I.pausa : I.play}</button>
            <button onClick={()=>{ setJugando(0); ir(M.puntosDeCorte(p).find(x=>x > reloj.t + 0.01) ?? dur); }} className="rd-ico" title="Corte siguiente (↓)">{I.adelante}</button>
            <button onClick={()=>ir(dur)} className="rd-ico" title="Al final (Fin)">{I.final}</button>
            <span style={{width:12}}/><Contador reloj={reloj} fps={fps}/><span style={{color:"#777",fontFamily:"ui-monospace, Consolas, monospace",fontSize:13}}>/ {tcLargo(dur, fps)}</span>
            {Math.abs(jugando)>1 && <span style={{fontSize:11,color:"var(--gold)"}}>×{jugando}</span>}
            <span style={{flex:1}}/>
            <button onClick={()=>setGuias(x=>!x)} className={"rd-ico"+(guias?" on":"")} title="Guías de YouTube Shorts (G)">{I.guias}</button>
            <button onClick={()=>setCompleta(true)} className="rd-ico" title="Pantalla completa (Ctrl+Shift+F)">{I.completa}</button>
          </div>
        </div>
        <div className="rd-panel rd-insp" style={{padding:12,display:"flex",flexDirection:"column",gap:10,fontSize:12.5,overflowY:"auto"}}>
          <b style={{fontSize:13}}>{elegidos.length ? (uno ? uno.nombre : `${elegidos.length} elegidos`) : "Propiedades"}</b>
          {!elegidos.length && <div style={{color:"#888",lineHeight:1.6}}>Elige un clip para ver y cambiar sus propiedades.<br/>Todos los atajos, en Configuración del Studio.</div>}
          {!elegidos.length && <div style={{display:"flex",flexDirection:"column",gap:6,borderTop:"1px solid #222",paddingTop:8}}>
            <b style={{fontSize:12.5}}>Marcadores <span style={{color:"#777",fontWeight:400}}>· M pone uno en el cabezal</span></b>
            {!(p.marcadores||[]).length && <span style={{color:"#777",fontSize:11.5}}>Aún no hay. Úsalos para apuntar momentos («aquí va el SFX», «cortar»…).</span>}
            {(p.marcadores||[]).map((m, k)=>{ const mm = typeof m === "number" ? {t:m, nombre:"", color:"#60a5fa"} : m;
              return <div key={k} style={{display:"flex",gap:5,alignItems:"center"}}>
                <button className="rd-btn" style={{padding:"3px 6px",fontFamily:"ui-monospace, Consolas, monospace",fontSize:11}} onClick={()=>{ setJugando(0); ir(mm.t); }} title="Ir al marcador">{tc(mm.t, fps)}</button>
                <input className="rd-input" value={mm.nombre || ""} placeholder="Nombre" style={{flex:1,minWidth:0,padding:"3px 6px"}}
                  onChange={e=>cambiarMarcador(k, {nombre:e.target.value}, true)} onBlur={()=>alGesto("fin")}/>
                {["#60a5fa","#f87171","#4ade80","#facc15","#c084fc"].map(col=><span key={col} onClick={()=>cambiarMarcador(k, {color:col})}
                  style={{width:12,height:12,borderRadius:3,background:col,cursor:"pointer",outline: mm.color===col ? "2px solid #fff" : "none"}}/>)}
                <button className="rd-ico peligro" style={{width:22,height:22}} title="Quitar" onClick={()=>cambiar(q=>({...q, marcadores:(q.marcadores||[]).filter((x, j)=>j!==k)}))}>×</button>
              </div>; })}
          </div>}
          {uno && uno.tipo === "sub" && <InspectorSub c={uno} alGesto={alGesto} cambiar={cambiarTarjeta}
            onColor={(k, col)=>cambiar(q=>({...q, pistas: q.pistas.map(pi=>pi.tipo!=="subtitulos" ? pi : {...pi, clips: pi.clips.map(x=>x.id!==uno.id ? x : {...x,
              palabras: x.palabras.map((pp, j)=>j!==k ? pp : (col ? [pp[0], pp[1], pp[2], col] : [pp[0], pp[1], pp[2]]))})})}))}/>}
          {uno && uno.tipo === "texto" && <InspectorTexto c={uno} fuentes={fuentes} presets={presets} alGesto={alGesto} cambiarEstilo={cambiarEstilo} cambiarTexto={cambiarTexto} W={p.ancho} H={p.alto}/>}
          {/* 31/10 (v3.18): propiedades por pestañas, como CapCut: Básico · Transformar · Velocidad */}
          {uno && uno.ruta && <div style={{display:"flex",gap:3}}>
            {[["basico","Básico"], ...(esVideo ? [["transformar","Transformar"],["color","Color"],["mascara","Máscara"]] : []), ...(uno.imagen ? [] : [["velocidad","Velocidad"]])].map(([k2, l])=>
              <button key={k2} onClick={()=>setPestInsp(k2)} className={"rd-tab"+(pestInsp===k2 || (!["transformar","velocidad","color","mascara"].includes(pestInsp) && k2==="basico") ? " on" : "")} style={{fontSize:11.5,padding:"5px 0"}}>{l}</button>)}
          </div>}
          {uno && uno.ruta && pestInsp==="transformar" && esVideo && <PanelTransformar c={uno} reloj={reloj} alGesto={alGesto} cambiarClip={cambiarClip} ir={t=>{ setJugando(0); ir(t); }}/>}
          {uno && uno.ruta && pestInsp==="velocidad" && <PanelVelocidad c={uno} alGesto={alGesto} cambiarClip={cambiarClip}/>}
          {uno && uno.ruta && pestInsp==="color" && esVideo && <PanelColor c={uno} alGesto={alGesto} cambiarClip={cambiarClip}/>}
          {uno && uno.ruta && pestInsp==="mascara" && esVideo && <PanelMascara c={uno} W={p.ancho} H={p.alto} alGesto={alGesto} cambiarClip={cambiarClip}/>}
          {(!uno || !uno.ruta || !["transformar","velocidad","color","mascara"].includes(pestInsp) || (["transformar","color","mascara"].includes(pestInsp) && !esVideo) || (pestInsp==="velocidad" && uno.imagen)) && <>
          {uno && <div style={{color:"#aaa",lineHeight:1.7,fontFamily:"ui-monospace, Consolas, monospace",fontSize:11.5}}>
            {uno.ruta ? <div style={{display:"grid",gridTemplateColumns:"auto 1fr",gap:"4px 8px",alignItems:"center",fontFamily:"system-ui",fontSize:12,color:"#ccc"}}>
              {/* 31/10, él: "modificar los atributos de la música y los SFX, desde dónde empiezan y dónde acaban, o su volumen (como DaVinci)" */}
              <span>Empieza en la línea</span><NumTiempo v={uno.en} fps={fps} onCambiar={x=>cambiarTiempos({...uno, en:Math.max(0, x)})}/>
              <span>Desde (archivo)</span><NumTiempo v={uno.desde} fps={fps} onCambiar={x=>cambiarTiempos({...uno, desde:Math.max(0, Math.min(uno.hasta - 1/fps, x))})}/>
              <span>Hasta (archivo)</span><NumTiempo v={uno.hasta} fps={fps} onCambiar={x=>cambiarTiempos({...uno, hasta:Math.max(uno.desde + 1/fps, Math.min(uno.dur_src ?? 1e9, x))})}/>
              <span style={{color:"#888"}}>Dura</span><span style={{fontFamily:"ui-monospace, Consolas, monospace",color:"#999"}}>{tc(largo(uno), fps)}</span>
            </div> : <>
            <div>Línea · {tc(uno.en, fps)} → {tc(fin(uno), fps)}</div>
            <div>Dura · {tc(largo(uno), fps)}</div></>}
          </div>}
          {elegidos.length>0 && !elegidos.every(c=>c.tipo==="texto" || c.tipo==="sub" || c.imagen || c.efecto) && <>
            {[["Volumen","vol",0,2,0.01,v=>(v <= 0.001 ? "−∞" : (20*Math.log10(v) >= 0 ? "+" : "") + (20*Math.log10(v)).toFixed(1)) + " dB · " + Math.round(v*100)+"%"],["Fundido de entrada","fade_in",0,3,0.05,v=>v.toFixed(2)+" s"],["Fundido de salida","fade_out",0,3,0.05,v=>v.toFixed(2)+" s"]].map(([n,campo,a,b,st,fmt])=>{
              const conKf = campo==="vol" && uno && ((uno.kf || {}).vol || []).length > 0;
              const v = campo==="vol" && uno ? M.volEn(uno, tRelDe(uno)) : (elegidos[0][campo] ?? (campo==="vol" ? 1 : 0));
              const tope = x => Math.max(a, Math.min(x, campo==="vol" ? 2 : (uno ? largo(uno)/2 : 3)));
              const poner = (x, gesto) => campo==="vol" && uno ? ponerVol(uno, tope(x), gesto) : ponerEnElegidos(campo, tope(x), gesto);
              // (5/11, él: "que en las propiedades haya botones para subir o bajar las características, a parte de la barra"):
              // el volumen de 1 dB en 1 dB, los fundidos de 0,1 s en 0,1 s
              const paso = d => campo==="vol" ? (v <= 0.001 ? (d > 0 ? Math.pow(10, -40/20) : 0) : v * Math.pow(10, d/20)) : Math.round((v + d * 0.1) * 100) / 100;
              const enKf = conKf && ((uno.kf.vol || []).some(x=>Math.abs(x[0] - tRelDe(uno)) < 0.02));
              const bt = { padding:"0 8px", height:24, borderRadius:6, border:"1px solid #333", background:"#1a1a1a", color:"#ddd", cursor:"pointer", fontSize:14, lineHeight:"22px" };
              return <div key={campo} style={{display:"flex",flexDirection:"column",gap:4}}><span style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>{n}
                  <span style={{display:"flex",gap:6,alignItems:"center"}}><span style={{color:"#999"}} title={campo==="vol" && v > 1.001 ? "El visor no puede sonar por encima del 100 %: al exportar sí sale con este volumen" : undefined}>{fmt(v)}{campo==="vol" && v > 1.001 ? " ·" : ""}</span>
                    {campo==="vol" && v > 1.001 && <span style={{fontSize:10,color:"#b9a35a"}}>(visor: 100 %)</span>}
                    {campo==="vol" && uno && <button onClick={()=>alternarKfVol(uno)} title={enKf ? "Quitar el punto del cabezal" : "Poner un punto de volumen en el cabezal (para que suba o baje en un trozo)"}
                      style={{...bt, height:20, lineHeight:"18px", padding:"0 6px", color: enKf ? "#D4AF37" : conKf ? "#b9a35a" : "#888", fontSize:12}}>◆</button>}</span></span>
                <span style={{display:"flex",gap:6,alignItems:"center"}}>
                  <button style={bt} onClick={()=>poner(paso(-1))} title={campo==="vol" ? "−1 dB" : "−0,1 s"}>−</button>
                  <input type="range" min={a} max={b} step={st} value={v} style={{flex:1,minWidth:0}} onPointerDown={()=>alGesto("inicio")} onPointerUp={()=>alGesto("fin")}
                    onChange={e=>poner(Number(e.target.value), true)}/>
                  <button style={bt} onClick={()=>poner(paso(+1))} title={campo==="vol" ? "+1 dB" : "+0,1 s"}>+</button>
                </span>
                {campo==="vol" && conKf && <span style={{fontSize:11,color:"#9a8a4a"}}>◆ {uno.kf.vol.length} punto{uno.kf.vol.length > 1 ? "s" : ""}: la barra cambia el volumen en el cabezal</span>}
              </div>;
            })}
            {uno && uno.ruta && !uno.imagen && (uno.pista !== "v1") && !(todos.find(x=>x.id===uno.id) || {}).efecto &&
              p.pistas.some(pi=>pi.tipo==="audio" && pi.clips.some(x=>x.id===uno.id)) &&
              <RecorteAudio c={uno} onda={ondas[uno.ruta]} fps={fps} alGesto={alGesto} cambiarClip={cambiarClip}/>}
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              <button onClick={silenciar} className={"rd-ico"+(elegidos.every(c=>c.silencio)?" on":"")} title="Silenciar (Shift+M)">{elegidos.every(c=>c.silencio) ? I.mudo : I.sonido}</button>
              {elegidos.some(c=>c.pista==="v1") && <button onClick={extraer} className="rd-ico" title="Extraer el audio a una pista (Ctrl+Shift+S)">{I.extraer}</button>}
              <button onClick={dividir} className="rd-ico" title="Dividir (Ctrl+B)">{I.dividir}</button>
              <button onClick={duplicar} className="rd-ico" title="Duplicar (Ctrl+D)">{I.duplicar}</button>
              <button onClick={copiarAtributos} className="rd-ico" title="Copiar atributos: volumen, fundidos, mejora de voz, color, transformación… (Ctrl+Alt+C)" style={{fontSize:12,width:"auto",padding:"0 8px"}}>📋 Copiar</button>
              <button onClick={pegarAtributos} className="rd-ico" title="Pegar atributos en los clips elegidos (Ctrl+Alt+V)" style={{fontSize:12,width:"auto",padding:"0 8px",opacity: portaAtrib.current ? 1 : 0.55}}>📥 Pegar</button>
              <button onClick={eliminar} className="rd-ico peligro" title="Eliminar (Supr)">{I.borrar}</button>
            </div>
            {uno && uno.ruta && !uno.imagen && !uno.efecto && <SeccionVoz c={uno} procesar={procesarVoz} toast={toast}
              cambiarClip={n=>{ const ya = M.todos(pRef.current).find(x=>x.id===n.id); if(ya) cambiarClip({...ya, voz:n.voz}); }}/>}
          </>}
          </>}
        </div>
      </div>
      {/* barra de la línea de tiempo */}
      <div className="rd-herr">
        <button onClick={()=>setHerramienta("sel")} className={"rd-ico"+(herramienta==="sel"?" on":"")} title="Selección (V)">{I.seleccion}</button>
        <button onClick={()=>setHerramienta("cuchilla")} className={"rd-ico"+(herramienta==="cuchilla"?" on":"")} title="Cuchilla: clic en un clip = cortar ahí (B)">{I.cuchilla}</button>
        <span className="rd-sep"/>
        <button onClick={deshacer} disabled={!pasado.current.length} className="rd-ico" title="Deshacer (Ctrl+Z)">{I.deshacer}</button>
        <button onClick={rehacer} disabled={!futuro.current.length} className="rd-ico" title="Rehacer (Ctrl+Shift+Z)">{I.rehacer}</button>
        <button onClick={()=>setMenuHist(x=>!x)} disabled={!pasado.current.length && !futuro.current.length} className={"rd-ico"+(menuHist?" on":"")} title="Historial: vuelve a cualquier paso" style={{fontSize:15}}>☰</button>
        {menuHist && createPortal(<div onMouseDown={()=>setMenuHist(false)} style={{position:"fixed",inset:0,zIndex:2000}}>
          <div className="rd-menu" onMouseDown={e=>e.stopPropagation()} style={{left:120,bottom:window.innerHeight - (document.querySelector(".rd-herr") || {getBoundingClientRect:()=>({top:400})}).getBoundingClientRect().top + 4,maxHeight:"60vh",overflowY:"auto",minWidth:300}}>
            {(()=>{ const todosE = [...pasado.current, pRef.current, ...futuro.current], ahora = pasado.current.length, filas = [];
              for(let j = todosE.length - 1; j >= Math.max(0, todosE.length - 80); j--){
                const h = horas.current.get(todosE[j]);
                filas.push(<button key={j} onClick={()=>{ irAHistorial(j); }} style={{opacity: j > ahora ? 0.45 : 1, fontWeight: j === ahora ? 800 : 500, color: j === ahora ? "var(--gold)" : undefined}}>
                  <span>{j === 0 ? "Al abrir" : M.resumenCambio(todosE[j - 1], todosE[j])}</span>
                  <kbd>{j === ahora ? "ahora" : h ? new Date(h).toLocaleTimeString().slice(0, 8) : ""}</kbd></button>);
              }
              return filas; })()}
          </div></div>, document.body)}
        <span className="rd-sep"/>
        <button onClick={dividir} className="rd-ico" title="Dividir en el cabezal (Ctrl+B)">{I.dividir}</button>
        <button onClick={()=>borrarLado(true)} className="rd-ico" title="Borrar a la izquierda (Q)">{I.izq}</button>
        <button onClick={()=>borrarLado(false)} className="rd-ico" title="Borrar a la derecha (W)">{I.der}</button>
        <button onClick={eliminar} disabled={!sel.size} className="rd-ico peligro" title="Eliminar (Supr)">{I.borrar}</button>
        <span className="rd-sep"/>
        <button onClick={()=>copiar(false)} disabled={!sel.size} className="rd-ico" title="Copiar (Ctrl+C)">{I.copiar}</button>
        <button onClick={()=>pegar()} disabled={!porta.length} className="rd-ico" title="Pegar en el cabezal (Ctrl+V)">{I.pegar}</button>
        <button onClick={duplicar} disabled={!sel.size} className="rd-ico" title="Duplicar (Ctrl+D)">{I.duplicar}</button>
        <button onClick={extraer} disabled={!elegidos.some(c=>c.pista==="v1")} className="rd-ico" title="Extraer audio (Ctrl+Shift+S)">{I.extraer}</button>
        <span className="rd-sep"/>
        <button onClick={marcador} className="rd-ico" title="Marcador (M)">{I.marcador}</button>
        <button onClick={()=>setIman(x=>!x)} className={"rd-ico"+(iman?" on":"")} title="Imán: se pega a los bordes al arrastrar (N)">{I.iman}</button>
        <button onClick={()=>cambiar(q=>({...q, magnetica: !q.magnetica}))} className={"rd-ico"+(p.magnetica?" on":"")}
          title={p.magnetica ? "Pista principal magnética: los clips se juntan solos (pulsa para moverlos libres)" : "Pista principal libre: cada clip donde lo sueltes (pulsa para que se junten solos)"}>{I.magnetica}</button>
        <button onClick={anadirPistaVideo} className="rd-ico" title="Pista de vídeo encima de la principal (superposición: vídeo dentro de vídeo, imágenes, máscaras)">{I.capa}</button>
        <button onClick={anadirPista} className="rd-ico" title="Pista de audio nueva">{I.pista}</button>
        <span className="rd-sep"/>
        <button onClick={()=>setSkim(x=>!x)} className={"rd-btn"+(skim?" on":"")} style={{padding:"4px 8px",fontSize:11.5}} title="Previsualizar al pasar el ratón por la línea de tiempo, sin mover el cabezal (S)">Ver al pasar</button>
        <button onClick={()=>setConectados(x=>!x)} className={"rd-btn"+(conectadosOn?" on":"")} style={{padding:"4px 8px",fontSize:11.5}} title="Clips conectados: al mover o quitar un clip de la principal, los SFX, textos y subtítulos que tiene encima van con él">Conectados</button>
        <button onClick={()=>setCompacta(x=>!x)} className={"rd-btn"+(compacta?" on":"")} style={{padding:"4px 8px",fontSize:11.5}} title="Pistas más bajas para ver muchas a la vez (H)">Compactas</button>
        <span style={{flex:1}}/>
        <button onClick={()=>setZoom(z=>Math.max(0.5,z/1.4))} className="rd-ico" title="Alejar (Ctrl+-)">{I.menos}</button>
        <input type="range" min={0} max={1} step={0.001} value={Math.log(zoom/0.5)/Math.log(4000)} onChange={e=>setZoom(0.5*Math.pow(4000, Number(e.target.value)))} style={{width:150}}/>
        <button onClick={()=>setZoom(z=>Math.min(2000,z*1.4))} className="rd-ico" title="Acercar (Ctrl++)">{I.mas}</button>
        <button onClick={ajustar} className="rd-ico" title="Ver todo (Shift+Z)">{I.ajustar}</button>
      </div>
      {eligiendoMini && (
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",padding:"8px 12px",background:"rgba(212,175,55,0.14)",borderTop:"1px solid #D4AF37",borderBottom:"1px solid #D4AF37",fontSize:12.5}}>
          <span>📸 <b>Elige la miniatura:</b> mueve el cabezal al fotograma que quieras (se ve en el visor, con sus textos) y pulsa «Usar este fotograma».</span>
          <span style={{flex:1}}/>
          {/* (6/11, él: «el final es el final, no hay más»): sin elegir nada; se exporta lo que hay en el timeline */}
          <button className="rd-btn primario" onClick={()=>{ const c = eligiendoMini; cambiar(q=>({...q, portada: M.cuantiza(reloj.t, fps)})); setEligiendoMini(null); exportarYa(c); }}>
            Usar este fotograma y exportar <kbd>{tc(reloj.t, fps)}</kbd></button>
          <button className="rd-btn" onClick={()=>{ const c = eligiendoMini; cambiar(q=>({...q, portada: null})); setEligiendoMini(null); exportarYa(c); }}>Sin miniatura</button>
          <button className="rd-btn" onClick={()=>setEligiendoMini(null)}>Cancelar</button>
        </div>)}
      {yaExiste && (
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",padding:"8px 12px",background:"rgba(248,113,113,0.12)",borderTop:"1px solid #f87171",borderBottom:"1px solid #f87171",fontSize:12.5}}>
          <span>Ya hay un vídeo con ese nombre: <b>{yaExiste.salida.split(/[\\/]/).slice(-2).join(" / ")}</b></span>
          <span style={{flex:1}}/>
          <button className="rd-btn primario" onClick={()=>{ const a = yaExiste.args; setYaExiste(null); lanzarExport([...a, "--reemplazar"]); }}>Reemplazarlo</button>
          <button className="rd-btn" onClick={()=>{ const a = yaExiste.args; setYaExiste(null); lanzarExport([...a, "--copia"]); }}>Guardar una copia (2)</button>
          <button className="rd-btn" onClick={()=>setYaExiste(null)}>Cancelar</button>
        </div>)}
      <div className="rd-linea">
        <LineaTiempo proyecto={p} zoom={zoom} setZoom={setZoom} sel={sel} setSel={setSel} herramienta={herramienta} iman={iman}
          reloj={reloj} jugando={jugandoRef} tiras={tiras} ondas={ondas}
          onIr={t=>{ setJugando(0); ir(t); }} onGesto={alGesto} onDividirEn={dividirEn}
          onSoltarMedio={(m, pi, t)=>m.efecto ? meterEfecto((efectos || []).find(x=>x.id===m.efecto) || {id:m.efecto, nombre:m.nombre}, false, t, pi.id) : m.texto ? meterTexto(m.texto, t, pi.tipo==="texto" ? pi.id : null) : meter(m, pi.tipo==="video" ? "video" : "audio", t, pi.id)}
          onMenu={(e, c, pi)=>{ e.preventDefault(); if(!sel.has(c.id)) setSel(new Set([c.id])); setMenu({x:e.clientX, y:e.clientY, pista:pi.id}); }}
          compacta={compacta} skim={skim} onSkim={verEn}
          onDoble={(e, c, pi)=>{ setSel(new Set([c.id])); setJugando(0); if(pi.tipo==="texto" || pi.tipo==="subtitulos") setTimeout(()=>{ const ta = document.querySelector(".rd-insp textarea"); if(ta){ ta.focus(); ta.select(); } }, 60); else ir(Math.min(Math.max(reloj.t, c.en), fin(c) - 1/fps)); }}
          onPista={accionPista}/>
      </div>
      {menuEl}
      <AjustesEditor abierto={ajustesAb} onCerrar={()=>setAjustesAb(false)} usarProxies={usarProxies} setUsarProxies={setUsarProxies}
        verFps={verFps} setVerFps={setVerFps} verMedidor={verMedidor} setVerMedidor={setVerMedidor}
        proxiesListos={proxiesListos} proxiesTotal={rutasVideo.length} toast={toast}/>
    </div>);
}

const CSS = `
.rd-app { position:fixed; inset:0; display:flex; flex-direction:column; background:#0e0e0e; color:#eaeaea; font-family:system-ui,-apple-system,"Segoe UI",sans-serif; user-select:none; }
.rd-barra { display:flex; align-items:center; gap:8px; padding:8px 12px; border-bottom:1px solid #222; background:#141414; flex-wrap:wrap; }
.rd-medio-fila { display:grid; grid-template-columns: minmax(250px, 22%) minmax(0,1fr) minmax(220px, 18%); gap:6px; padding:6px; height:52vh; min-height:300px; }
.rd-panel { background:#151515; border:1px solid #232323; border-radius:8px; min-height:0; overflow:hidden; }
.rd-herr { display:flex; align-items:center; gap:4px; padding:5px 10px; border-top:1px solid #222; border-bottom:1px solid #222; background:#141414; }
.rd-linea { flex:1; min-height:0; display:flex; overflow:hidden; }
.rd-ico { display:inline-flex; align-items:center; justify-content:center; width:32px; height:30px; border-radius:6px; border:1px solid transparent; color:#cfcfcf; background:transparent; cursor:pointer; flex-shrink:0; font-size:12px; }
.rd-ico:hover:not(:disabled) { background:#252525; color:#fff; }
.rd-ico.on { background:rgba(212,175,55,0.18); color:var(--gold); border-color:rgba(212,175,55,0.45); }
.rd-ico.grande { width:40px; height:34px; }
.rd-ico.peligro:hover:not(:disabled) { color:#f87171; }
.rd-ico:disabled { opacity:.3; cursor:default; }
.rd-btn { display:inline-flex; align-items:center; gap:6px; font-size:12.5px; font-weight:600; padding:6px 11px; border-radius:7px; border:1px solid #2c2c2c; color:#d6d6d6; background:#1b1b1b; cursor:pointer; white-space:nowrap; }
.rd-btn:hover:not(:disabled) { background:#242424; }
.rd-btn.on { border-color:rgba(212,175,55,0.55); color:var(--gold); }
.rd-btn.primario { background:var(--gold); color:#000; border-color:var(--gold); }
.rd-btn:disabled { opacity:.45; cursor:default; }
.rd-input { font-size:12.5px; padding:6px 9px; border-radius:7px; border:1px solid #2c2c2c; background:#0f0f0f; color:#eee; user-select:text; }
.rd-tab { flex:1; font-size:12.5px; font-weight:600; padding:6px 0; border-radius:6px; border:1px solid #2a2a2a; color:#bbb; background:transparent; cursor:pointer; }
.rd-tab.on { background:#262626; color:#fff; border-color:#3a3a3a; }
.rd-chip { font-size:11px; padding:3px 8px; border-radius:999px; border:1px solid #2c2c2c; color:#bbb; background:transparent; cursor:pointer; }
.rd-chip.on { background:rgba(212,175,55,0.16); color:var(--gold); border-color:rgba(212,175,55,0.45); }
.rd-medio { display:flex; gap:7px; align-items:center; padding:4px 5px; border-radius:7px; border:1px solid #232323; cursor:grab; background:#181818; }
.rd-medio:hover { border-color:#3a3a3a; background:#1d1d1d; }
.rd-sep { width:1px; height:20px; background:#2c2c2c; margin:0 4px; }
.rd-etiqueta { font-size:12px; font-weight:700; padding:4px 9px; border-radius:6px; background:rgba(212,175,55,0.15); color:var(--gold); }
.rd-menu { position:fixed; min-width:220px; background:#1c1c1c; border:1px solid #333; border-radius:8px; padding:4px; box-shadow:0 12px 32px rgba(0,0,0,0.6); }
.rd-menu button { display:flex; justify-content:space-between; gap:16px; width:100%; padding:7px 10px; border-radius:5px; font-size:12.5px; color:#e5e5e5; background:transparent; border:0; cursor:pointer; text-align:left; }
.rd-menu button:hover { background:#2a2a2a; }
.rd-menu kbd { font-size:11px; color:#888; font-family:ui-monospace, Consolas, monospace; }
.rd-fuente { display:block; width:100%; text-align:left; padding:5px 9px; border:0; cursor:pointer; font-size:15px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.rd-fuente:hover { background:#1f1f1f !important; }
.rd-app input[type=range] { accent-color: var(--gold); }
`;
