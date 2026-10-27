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
  const poner = nuevo => { if(nuevo === pRef.current) return; pasado.current = [...pasado.current.slice(-150), pRef.current]; futuro.current = []; pRef.current = nuevo; sucio.current = true; repintar(x=>x+1); };
  const cambiar = f => poner(M.ordenar(f(pRef.current)));
  const deshacer = () => { if(!pasado.current.length) return; futuro.current = [pRef.current, ...futuro.current]; pRef.current = pasado.current.pop(); sucio.current = true; repintar(x=>x+1); };
  const rehacer = () => { if(!futuro.current.length) return; pasado.current = [...pasado.current, pRef.current]; pRef.current = futuro.current.shift(); sucio.current = true; repintar(x=>x+1); };
  const alGesto = (fase, nuevo) => {
    if(fase === "inicio") gesto.current = pRef.current;
    else if(fase === "durante"){ pRef.current = M.ordenar(nuevo); sucio.current = true; repintar(x=>x+1); }
    else { const g = gesto.current; gesto.current = null; if(g && g !== pRef.current){ pasado.current = [...pasado.current.slice(-150), g]; futuro.current = []; repintar(x=>x+1); } }
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
  const colaProxy = useRef({ pedidos:new Set(), cola:[], activos:0 });
  const pedidos = useRef(new Set());
  const est = useRef({}); est.current = { sel, porta, zoom, iman, herramienta };
  const guardandoClip = useRef(false);
  // las tareas del clon se oyen en las dos ventanas: aquí solo cuentan las del editor
  const [tareaClon, lanzar, cerrarTarea] = useTarea(ev=>{
    if(!["exportar","guardarclip"].includes(ev.tarea)) return;
    if(guardandoClip.current){
      guardandoClip.current = false;
      if(!ev.codigo){ sucio.current = false; repintar(x=>x+1); toast("Cambios guardados en el clip: el montaje del clon ya usa esta versión"); }
      vista.current && vista.current.sincronizar(reloj.t, 0);
      return;
    }
    if(!ev.codigo) toast("Exportado: lo tienes en Shorts Listos/RandomEditor (o en Clips, si lo mandaste como clip nuevo)");
  });

  const tarea = tareaClon && ["exportar","guardarclip"].includes(tareaClon.args[0]) ? tareaClon : null;
  const dur = M.total(p);
  const v1 = p.pistas.find(x=>x.id==="v1");
  const todos = useMemo(()=>M.todos(p),[p]);
  const fps = p.fps || 30;

  // ---- al abrir: biblioteca, proyectos y lo que pida el Studio («Editar el clip»)
  useEffect(()=>{
    consultar(["redmedios"]).then(ev=>setMedios(ev.find(e=>e.evento==="hecho"))).catch(e=>toast(e.message));
    consultar(["redbiblio"]).then(ev=>setBiblio(ev.find(e=>e.evento==="hecho"))).catch(e=>toast(e.message));
    window.studioFS.redLista().then(r=>setProyectos(r.lista||[]));
    const quitar = window.studioFS.onEditorPeticion && window.studioFS.onEditorPeticion(req=>{ if(req && req.carpeta) abrirClip(req.carpeta, req.archivo); });
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
      if(pedidos.current.has(c.ruta)) return;
      pedidos.current.add(c.ruta);
      consultar(["redonda", c.ruta]).then(ev=>{ const h = ev.find(e=>e.evento==="hecho"); setOndas(o=>({...o, [c.ruta]: h ? h.picos : []})); }).catch(()=>{});
      if(pi.tipo==="video") consultar(["redtira", c.ruta]).then(ev=>{
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
      if(m != null && Math.abs(m - t) < 0.25 && m >= reloj.t - 0.002) t = m;     // manda el vídeo (sin volver atrás)
      reloj.poner(t);
      raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);
    return ()=>cancelAnimationFrame(raf);
  },[jugando]);
  const jugar = () => setJugando(j=>j ? 0 : 1);

  // ---- meter medios
  const durDe = async m => {
    if(m.dur != null) return {dur:m.dur, video:m.video};
    const ev = await consultar(["redinfo", m.ruta]); const a = (ev.find(e=>e.evento==="hecho")||{}).archivos[0];
    return {dur:a.dur, video:a.video};
  };
  const meter = async (m, tipo, en, pistaId) => {
    let info; try { info = await durDe(m); } catch(e){ toast(e.message); return; }
    if(info.video === false) tipo = "audio";
    const c = { id:M.uid(), ruta:m.ruta, nombre:m.nombre, mini:m.mini, desde:0, hasta:info.dur, dur_src:info.dur, en:0, vol:1, silencio:false };
    if(tipo === "video"){
      cambiar(prev=>({...prev, pistas: prev.pistas.map(pi=>pi.id!=="v1" ? pi : {...pi, clips:[...pi.clips, {...c, en: en==null ? Math.max(0,...pi.clips.map(fin)) : en - 0.0005}]})}));
    } else {
      cambiar(prev=>({...prev, pistas: M.colocarAudio(prev.pistas, {...c, en: en==null ? reloj.t : Math.max(0, en)}, pistaId)}));
    }
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
    if(izq && c0) setTimeout(()=>ir(c0.en), 0);
  };
  const eliminar = () => { const s = est.current.sel; if(!s.size) return; cambiar(q=>M.eliminar(q, s)); setSel(new Set()); };
  const copiar = cortar => { const s = est.current.sel; if(!s.size) return; setPorta(todos.filter(c=>s.has(c.id)).sort((a,b)=>a.en-b.en)); if(cortar) eliminar(); };
  const pegar = (cs, tras) => { cs = cs || est.current.porta; if(!cs.length) return; let nuevos = []; cambiar(q=>{ const [r, n] = M.pegar(q, cs, reloj.t, tras); nuevos = n; return r; }); setSel(new Set(nuevos)); };
  const duplicar = () => { const s = est.current.sel; if(s.size) pegar(todos.filter(c=>s.has(c.id)).sort((a,b)=>a.en-b.en), true); };
  const silenciar = () => { const s = est.current.sel; if(!s.size) return; const m = todos.filter(c=>s.has(c.id)).every(c=>c.silencio);
    cambiar(q=>({...q, pistas: q.pistas.map(pi=>({...pi, clips: pi.clips.map(c=>s.has(c.id) ? {...c, silencio:!m} : c)}))})); };
  const extraer = () => { const s = est.current.sel; if(s.size) { cambiar(q=>M.extraerAudio(q, s)); toast("Audio extraído a una pista (el vídeo se queda mudo)"); } };
  // v3.14.1: Alt+← / Alt+→ empujan lo elegido de las pistas de audio un fotograma (Shift: 10), para cuadrar un SFX
  const empujar = d => {
    const s = est.current.sel; if(!s.size) return;
    const q0 = pRef.current;
    const nuevo = {...q0, pistas: q0.pistas.map(pi=>pi.id==="v1" || pi.bloqueada ? pi : {...pi, clips: pi.clips.map(c=>{
      if(!s.has(c.id)) return c;
      const en = Math.max(0, M.cuantiza(c.en + d, fps));
      return M.solapa(pi, en, largo(c), c.id) ? c : {...c, en};
    })})};
    if(JSON.stringify(nuevo.pistas) === JSON.stringify(q0.pistas)) return;
    cambiar(()=>nuevo);
  };
  const marcador = () => { const t = M.cuantiza(reloj.t, fps), ms = pRef.current.marcadores||[], cerca = ms.find(m=>Math.abs(m-t) < 0.05);
    cambiar(q=>({...q, marcadores: cerca!=null ? ms.filter(m=>m!==cerca) : [...ms, t].sort((a,b)=>a-b)})); };
  const accionPista = (que, id) => cambiar(q=>({...q, pistas: que==="quitar" ? q.pistas.filter(x=>x.id!==id) : q.pistas.map(x=>x.id===id ? {...x, [que]:!x[que]} : x)}));
  const anadirPista = () => cambiar(q=>({...q, pistas:[...q.pistas, M.nuevaPistaAudio(q.pistas)]}));
  const quitarAire = async () => {
    const cs = v1 ? v1.clips : []; if(!cs.length) return;
    const aires = {};
    try { for(const r of [...new Set(cs.map(c=>c.ruta))]){ const ev = await consultar(["redaire", r]); aires[r] = (ev.find(e=>e.evento==="hecho")||{}).aire || []; } }
    catch(e){ toast(e.message); return; }
    let n = 0; cambiar(q=>{ const [r, k] = M.quitarAire(q, aires); n = k; return r; });
    toast(n ? `Aire quitado en ${n} sitio${n!==1?"s":""} (Ctrl+Z para deshacer)` : "No hay silencios largos que quitar");
  };
  const ponerEnElegidos = (campo, v) => { const s = est.current.sel;
    alGesto("durante", {...pRef.current, pistas: pRef.current.pistas.map(pi=>({...pi, clips: pi.clips.map(c=>s.has(c.id) ? {...c, [campo]:v} : c)}))}); };

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
  const cargarProyecto = pr => { pRef.current = M.ordenar({...M.nuevoProyecto(), ...pr}); pasado.current = []; futuro.current = []; sucio.current = false; setSel(new Set()); repintar(x=>x+1); setTimeout(()=>{ ir(0); ajustar(); }, 60); };
  const abrir = async nombre => {
    if(sucio.current && !window.confirm("Hay cambios sin guardar. ¿Abrir otro proyecto igualmente?")) return;
    const r = await window.studioFS.redAbrir(nombre); if(r.error){ toast(r.error); return; } cargarProyecto(r.proyecto);
  };
  const nuevo = () => { if(sucio.current && !window.confirm("Hay cambios sin guardar. ¿Empezar uno nuevo?")) return; cargarProyecto(M.nuevoProyecto()); };
  const exportar = async como => {
    if(!v1 || !v1.clips.length){ toast("La pista principal está vacía"); return; }
    const ruta = await guardar(); if(!ruta) return;
    try { await lanzar(["exportar", ruta, como, ...(como==="clip" ? [pRef.current.nombre] : [])]); } catch(e){ toast(e.message); }
  };
  const abrirClip = async (carpeta, archivo) => {
    if(sucio.current && !window.confirm("Hay cambios sin guardar. ¿Abrir el clip igualmente?")) return;
    try { const ev = await consultar(["redabrirclip", carpeta, archivo]); cargarProyecto(ev.find(e=>e.evento==="hecho").proyecto); }
    catch(e){ toast(e.message); }
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
      const k = e.key, ctrl = e.ctrlKey || e.metaKey, t = reloj.t, K = k.length===1 ? k.toLowerCase() : k;
      const ok = () => { e.preventDefault(); e.stopImmediatePropagation(); };
      const puntos = M.puntosDeCorte(pRef.current);
      if(k===" "){ ok(); jugar(); }
      else if(ctrl && e.shiftKey && K==="z"){ ok(); rehacer(); }
      else if(ctrl && K==="y"){ ok(); rehacer(); }
      else if(ctrl && K==="z"){ ok(); deshacer(); }
      else if(ctrl && e.shiftKey && K==="s"){ ok(); extraer(); }
      else if(ctrl && e.shiftKey && K==="f"){ ok(); setCompleta(x=>!x); }
      else if(ctrl && K==="b"){ ok(); dividir(); }
      else if(ctrl && K==="c"){ ok(); copiar(false); }
      else if(ctrl && K==="x"){ ok(); copiar(true); }
      else if(ctrl && K==="v"){ ok(); pegar(); }
      else if(ctrl && K==="d"){ ok(); duplicar(); }
      else if(ctrl && K==="a"){ ok(); setSel(new Set(todos.map(c=>c.id))); }
      else if(ctrl && K==="s"){ ok(); pRef.current.clip ? guardarCambios() : guardar(); }
      else if(ctrl && K==="e"){ ok(); exportar("listos"); }
      else if(ctrl && K==="i"){ ok(); meterArchivos(); }
      else if(ctrl && (k==="+"||k==="=")){ ok(); setZoom(z=>Math.min(2000, z*1.4)); }
      else if(ctrl && (k==="-"||k==="_")){ ok(); setZoom(z=>Math.max(0.5, z/1.4)); }
      else if(ctrl && k==="ArrowLeft"){ ok(); setJugando(0); ir([...puntos].reverse().find(x=>x < t - 0.01) ?? 0); }
      else if(ctrl && k==="ArrowRight"){ ok(); setJugando(0); ir(puntos.find(x=>x > t + 0.01) ?? M.total(pRef.current)); }
      else if(ctrl) return;
      else if(k==="Delete"||k==="Backspace"){ ok(); eliminar(); }
      else if(e.shiftKey && K==="z"){ ok(); ajustar(); }
      else if(e.shiftKey && K==="m"){ ok(); silenciar(); }
      else if(K==="q"){ ok(); borrarLado(true); }
      else if(K==="w"){ ok(); borrarLado(false); }
      else if(K==="m"){ ok(); marcador(); }
      else if(K==="n"){ ok(); setIman(x=>!x); }
      else if(K==="g"){ ok(); setGuias(x=>!x); }
      else if(K==="v"){ ok(); setHerramienta("sel"); }
      else if(K==="b"){ ok(); setHerramienta("cuchilla"); }
      else if(K==="k"){ ok(); setJugando(0); }
      else if(K==="l"){ ok(); setJugando(j=>j>0 ? Math.min(4, j*2) : 1); }
      else if(K==="j"){ ok(); setJugando(j=>j<0 ? Math.max(-4, j*2) : -1); }
      else if(k==="Escape"){ ok(); if(menu) setMenu(null); else if(completa) setCompleta(false); else { setSel(new Set()); setHerramienta("sel"); } }
      else if(e.altKey && (k==="ArrowLeft" || k==="ArrowRight")){ ok(); empujar((k==="ArrowLeft" ? -1 : 1) * (e.shiftKey ? 10 : 1) / fps); }
      else if(k==="ArrowLeft"){ ok(); setJugando(0); ir(M.cuantiza(t, fps) - (e.shiftKey ? 1 : 1/fps)); }
      else if(k==="ArrowRight"){ ok(); setJugando(0); ir(M.cuantiza(t, fps) + (e.shiftKey ? 1 : 1/fps)); }
      else if(k==="ArrowUp"){ ok(); setJugando(0); ir([...puntos].reverse().find(x=>x < t - 0.01) ?? 0); }
      else if(k==="ArrowDown"){ ok(); setJugando(0); ir(puntos.find(x=>x > t + 0.01) ?? M.total(pRef.current)); }
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
  const vistaEl = <Vista ref={vista} proyecto={p} guias={guias} proxies={proxiesVista}/>;
  const menuEl = menu && createPortal(
    <div onMouseDown={()=>setMenu(null)} style={{position:"fixed",inset:0,zIndex:2000}}>
      <div className="rd-menu" onMouseDown={e=>e.stopPropagation()} style={{left:Math.min(menu.x, window.innerWidth-230), top:Math.min(menu.y, window.innerHeight-300)}}>
        {[["Dividir en el cabezal","Ctrl+B",dividir],["Copiar","Ctrl+C",()=>copiar(false)],["Cortar","Ctrl+X",()=>copiar(true)],["Duplicar","Ctrl+D",duplicar],
          ...(elegidos.some(c=>c.pista==="v1") ? [["Extraer audio","Ctrl+Shift+S",extraer]] : []),
          [elegidos.every(c=>c.silencio) ? "Devolver el sonido" : "Silenciar","Shift+M",silenciar],["Eliminar","Supr",eliminar]].map(([n,k,f])=>
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
        {p.clip ? <>
          <button onClick={volverAlOriginal} disabled={ocupado} className="rd-btn">Volver al original</button>
          <button onClick={guardarCambios} disabled={ocupado} className="rd-btn primario" title="Ctrl+S · rehace el clip con estos cambios, en su sitio">Guardar cambios</button>
        </> : <>
          <button onClick={()=>exportar("clip")} disabled={ocupado} className="rd-btn" title="Como clip recortado NUEVO para montarlo con el clon">Exportar como clip nuevo</button>
          <button onClick={()=>exportar("listos")} disabled={ocupado} className="rd-btn primario" title="Ctrl+E · a Shorts Listos/RandomEditor">Exportar</button>
        </>}
      </div>
      {tarea && <div style={{padding:"0 10px"}}><PanelTarea tarea={tarea} onCerrar={cerrarTarea}/></div>}
      {/* biblioteca · previsualización · propiedades */}
      <div className="rd-medio-fila">
        <Biblioteca medios={medios} biblio={biblio} onMeter={(m,tipo)=>meter(m,tipo)} onArchivos={meterArchivos}/>
        <div className="rd-panel" style={{display:"flex",flexDirection:"column",minWidth:0,background:"#0b0b0b"}}>
          <div style={{position:"relative",flex:1,minHeight:0,display:"flex",alignItems:"stretch",justifyContent:"center",padding:10,gap:6}}>
            {verFps && <Fps vista={vista} jugando={jugando}/>}
            {usarProxies && rutasVideo.length > proxiesListos && <div style={{position:"absolute",right:10,top:8,zIndex:2,fontSize:11,fontWeight:700,padding:"2px 7px",borderRadius:5,background:"rgba(0,0,0,0.6)",color:"#bbb"}}
              title="Copias ligeras para previsualizar: mientras se hacen, se ve el original">Preparando la previsualización fluida… {proxiesListos}/{rutasVideo.length}</div>}
            <div onClick={jugar} onDoubleClick={()=>{ setJugando(0); setCompleta(true); }} title="Clic: reproducir / pausar · doble clic: pantalla completa"
              style={{flex:1,minWidth:0,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
              {completa ? createPortal(<div style={{position:"fixed",inset:0,zIndex:1500,background:"#000",display:"flex",alignItems:"center",justifyContent:"center"}} onDoubleClick={()=>setCompleta(false)}>{vistaEl}</div>, document.body) : vistaEl}
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
        <div className="rd-panel" style={{padding:12,display:"flex",flexDirection:"column",gap:10,fontSize:12.5,overflowY:"auto"}}>
          <b style={{fontSize:13}}>{elegidos.length ? (uno ? uno.nombre : `${elegidos.length} elegidos`) : "Propiedades"}</b>
          {!elegidos.length && <div style={{color:"#888",lineHeight:1.6}}>Elige un clip para ver y cambiar sus propiedades.<br/>Todos los atajos, en Configuración del Studio.</div>}
          {uno && <div style={{color:"#aaa",lineHeight:1.7,fontFamily:"ui-monospace, Consolas, monospace",fontSize:11.5}}>
            <div>Archivo · {tc(uno.desde, fps)} → {tc(uno.hasta, fps)}</div>
            <div>Línea · {tc(uno.en, fps)} → {tc(fin(uno), fps)}</div>
            <div>Dura · {tc(largo(uno), fps)}</div>
          </div>}
          {elegidos.length>0 && <>
            {[["Volumen","vol",0,2,0.01,v=>Math.round(v*100)+"%"],["Fundido de entrada","fade_in",0,3,0.05,v=>v.toFixed(2)+" s"],["Fundido de salida","fade_out",0,3,0.05,v=>v.toFixed(2)+" s"]].map(([n,campo,a,b,st,fmt])=>{
              const v = elegidos[0][campo] ?? (campo==="vol" ? 1 : 0);
              return <label key={campo} style={{display:"flex",flexDirection:"column",gap:4}}><span style={{display:"flex",justifyContent:"space-between"}}>{n}<span style={{color:"#999"}}>{fmt(v)}</span></span>
                <input type="range" min={a} max={b} step={st} value={v} onPointerDown={()=>alGesto("inicio")} onPointerUp={()=>alGesto("fin")}
                  onChange={e=>ponerEnElegidos(campo, Math.min(Number(e.target.value), campo==="vol" ? 2 : (uno ? largo(uno)/2 : 3)))}/></label>;
            })}
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              <button onClick={silenciar} className={"rd-ico"+(elegidos.every(c=>c.silencio)?" on":"")} title="Silenciar (Shift+M)">{elegidos.every(c=>c.silencio) ? I.mudo : I.sonido}</button>
              {elegidos.some(c=>c.pista==="v1") && <button onClick={extraer} className="rd-ico" title="Extraer el audio a una pista (Ctrl+Shift+S)">{I.extraer}</button>}
              <button onClick={dividir} className="rd-ico" title="Dividir (Ctrl+B)">{I.dividir}</button>
              <button onClick={duplicar} className="rd-ico" title="Duplicar (Ctrl+D)">{I.duplicar}</button>
              <button onClick={eliminar} className="rd-ico peligro" title="Eliminar (Supr)">{I.borrar}</button>
            </div>
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
        <button onClick={()=>setIman(x=>!x)} className={"rd-ico"+(iman?" on":"")} title="Imán (N)">{I.iman}</button>
        <button onClick={anadirPista} className="rd-ico" title="Pista de audio nueva">{I.pista}</button>
        <span style={{flex:1}}/>
        <button onClick={()=>setZoom(z=>Math.max(0.5,z/1.4))} className="rd-ico" title="Alejar (Ctrl+-)">{I.menos}</button>
        <input type="range" min={0} max={1} step={0.001} value={Math.log(zoom/0.5)/Math.log(4000)} onChange={e=>setZoom(0.5*Math.pow(4000, Number(e.target.value)))} style={{width:150}}/>
        <button onClick={()=>setZoom(z=>Math.min(2000,z*1.4))} className="rd-ico" title="Acercar (Ctrl++)">{I.mas}</button>
        <button onClick={ajustar} className="rd-ico" title="Ver todo (Shift+Z)">{I.ajustar}</button>
      </div>
      <div className="rd-linea">
        <LineaTiempo proyecto={p} zoom={zoom} setZoom={setZoom} sel={sel} setSel={setSel} herramienta={herramienta} iman={iman}
          reloj={reloj} jugando={jugandoRef} tiras={tiras} ondas={ondas}
          onIr={t=>{ setJugando(0); ir(t); }} onGesto={alGesto} onDividirEn={dividirEn}
          onSoltarMedio={(m, pi, t)=>meter(m, pi.tipo==="video" ? "video" : "audio", t, pi.id)}
          onMenu={(e, c, pi)=>{ e.preventDefault(); if(!sel.has(c.id)) setSel(new Set([c.id])); setMenu({x:e.clientX, y:e.clientY}); }}
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
.rd-app input[type=range] { accent-color: var(--gold); }
`;
