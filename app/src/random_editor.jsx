import React from "react";
import { createPortal } from "react-dom";
import { useTarea, PanelTarea } from "./clon";
const { useState, useEffect, useRef, useMemo } = React;

/* ================================ RandomEditor (v3.12) ================================
   26/10, él: "un apartado RandomEditor, una copia de CapCut en lo básico"; 27/10: "quiero que en un
   futuro sea como CapCut o mejor; por ahora lo básico. Yo sé lo que significan los botones: sin
   nombre. Copia todos los atajos básicos que no requieran IA (Ctrl+B, W, Q…) y que funcione BIEN
   Ctrl+Z / Ctrl+Shift+Z". Y "prepara las bibliotecas para TODOS los SFX y TODA la música ordenados".
   - la pista PRINCIPAL es magnética (los clips van seguidos); las de audio son libres
   - el historial guarda CADA cambio (también arrastres, recortes y volumen) y nada más
   - biblioteca: Clips Recortados, Música por género y SFX por categoría (clon/biblioteca.py), con
     escucha previa; se meten con ＋ o arrastrándolos a la línea de tiempo
   - exporta él mismo (clon.py exportar). Siguiente paso: textos y animaciones con Remotion */

/* 27/10, él: "cuando le dé a «Editar el clip», que me lleve al RandomEditor y pueda guardar los cambios
   del clip sin exportarlo: «Guardar cambios»". Clips llama a abrirEnEditor({carpeta, archivo}); el
   editor se abre en MODO CLIP: edita sobre el original del clip y «Guardar cambios» lo rehace en su sitio. */
let pendiente = null;
export function abrirEnEditor(req) { pendiente = req; window.dispatchEvent(new Event("rds-ir-editor")); }

export const ATAJOS_EDITOR = [
  ["Espacio", "Reproducir / pausar"],
  ["J / K / L", "Atrás / pausa / adelante (L otra vez: más rápido)"],
  ["Ctrl+B", "Dividir en el cabezal (lo elegido, o la pista principal)"],
  ["Q", "Borrar a la izquierda del cabezal"],
  ["W", "Borrar a la derecha del cabezal"],
  ["Supr / Retroceso", "Eliminar lo elegido (la principal se cierra sola)"],
  ["Ctrl+C / Ctrl+X / Ctrl+V", "Copiar / cortar / pegar en el cabezal"], ["Ctrl+D", "Duplicar"],
  ["Ctrl+A", "Elegir todo"], ["Esc", "Quitar la selección"],
  ["Ctrl+Z", "Deshacer"], ["Ctrl+Shift+Z / Ctrl+Y", "Rehacer"],
  ["← / →", "Un fotograma atrás / adelante"], ["Shift+← / →", "Un segundo atrás / adelante"],
  ["↑ / ↓  ·  Ctrl+← / →", "De trozo en trozo: al corte o marcador anterior / siguiente"], ["Inicio / Fin", "Al principio / al final"],
  ["M", "Poner (o quitar) un marcador en el cabezal"],
  ["Shift+M", "Silenciar / devolver el sonido de lo elegido"],
  ["Ctrl++ / Ctrl+-", "Acercar / alejar la línea de tiempo (o Ctrl+rueda)"], ["Shift+Z", "Ver toda la línea de tiempo"],
  ["N", "Imán (encajar con el cabezal, los cortes y los marcadores)"],
  ["Ctrl+I", "Meter archivos del disco"], ["Ctrl+S", "Guardar el proyecto (también se guarda solo) · con un clip: Guardar cambios"], ["Ctrl+E", "Exportar"],
  ["Ctrl+Shift+F", "Previsualización a pantalla completa"],
  ["Clic / Shift+clic", "Elegir un clip / añadirlo a la selección"],
  ["Arrastrar un clip", "Moverlo (en la principal cambia el orden)"],
  ["Arrastrar un borde", "Recortar el clip"],
  ["Arrastrar de la biblioteca", "Meterlo justo donde lo sueltes"],
];

const fileUrl = p => p ? "file:///" + p.replace(/\\/g,"/").split("/").map(encodeURIComponent).join("/").replace(/^([A-Za-z])%3A/,"$1:") : null;
const t2s = t => { t = Math.max(0, t||0); const m = Math.floor(t/60); return m + ":" + (t%60).toFixed(2).padStart(5,"0"); };
const corto = t => { t = Math.max(0, Math.round(t||0)); return Math.floor(t/60) + ":" + String(t%60).padStart(2,"0"); };
const uid = () => Math.random().toString(36).slice(2, 10);
const largo = c => c.hasta - c.desde;
const fin = c => c.en + largo(c);
const LIENZOS = { vertical:[1080,1920,"9:16"], horizontal:[1920,1080,"16:9"] };
const ZMIN = 0.5, ZMAX = 400;

// iconos (sin texto: él ya sabe lo que es cada uno; el nombre y el atajo van en el «title»)
const I = {
  play:<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5v14l12-7z"/></svg>,
  pausa:<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>,
  inicio:<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h2v14H6zM20 5v14L9 12z"/></svg>,
  dividir:<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12"/></svg>,
  izq:<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4v16M20 12H8M12 8l-4 4 4 4"/></svg>,
  der:<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 4v16M4 12h12M12 8l4 4-4 4"/></svg>,
  borrar:<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>,
  copiar:<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 011-1h10"/></svg>,
  pegar:<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V2h6v2"/></svg>,
  duplicar:<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="7" width="12" height="12" rx="2"/><rect x="9" y="3" width="12" height="12" rx="2"/></svg>,
  deshacer:<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/></svg>,
  rehacer:<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 000 12h3"/></svg>,
  iman:<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 3v8a6 6 0 0012 0V3"/><path d="M6 7h4M14 7h4"/></svg>,
  marcador:<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 3h12v18l-6-4-6 4z"/></svg>,
  mudo:<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 5L6 9H3v6h3l5 4z"/><path d="M22 9l-6 6M16 9l6 6"/></svg>,
  sonido:<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 010 7M19 5a10 10 0 010 14"/></svg>,
  menos:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M5 12h14"/></svg>,
  mas:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 5v14M5 12h14"/></svg>,
  ajustar:<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>,
  completa:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/></svg>,
  pista:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 8h12M3 16h18M19 4v8M15 8h8"/></svg>,
  archivo:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M14 3v6h6M12 12v6M9 15h6"/></svg>,
  oir:<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>,
  parar:<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h12v12H6z"/></svg>,
};
const bi = (activo, peligro) => ({display:"inline-flex",alignItems:"center",justifyContent:"center",width:34,height:32,borderRadius:8,
  border:"1px solid "+(peligro?"rgba(248,113,113,0.45)":"var(--border)"), color: activo?"#000":(peligro?"var(--red)":"var(--text-2)"),
  background: activo?"var(--gold)":"transparent", cursor:"pointer", flexShrink:0});
const bt = (activo) => ({fontSize:12.5,fontWeight:600,padding:"7px 11px",borderRadius:9,border:"1px solid var(--border)",
  color: activo?"#000":"var(--text-2)", background: activo?"var(--gold)":"transparent", cursor:"pointer", whiteSpace:"nowrap"});

const ALTO_V = 88, ALTO_A = 50, FOTOS_V = 50;     // pista de vídeo: fotogramas arriba y su sonido abajo
function Onda({ picos, c, anchoPx, alto, color }) {
  if(!picos || !picos.length) return null;
  const n = picos.length, a = Math.max(0, Math.floor(c.desde / (c.dur_src||1) * n)), b = Math.min(n, Math.ceil(c.hasta / (c.dur_src||1) * n));
  let seg = picos.slice(a, Math.max(a+1, b));
  const max = Math.max(8, Math.floor(anchoPx));
  if(seg.length > max){                       // menos puntos que píxeles: el pico de cada tramo
    const k = seg.length / max, r = [];
    for(let i = 0; i < max; i++){ let m = 0; for(let j = Math.floor(i*k); j < Math.floor((i+1)*k); j++) m = Math.max(m, seg[j]||0); r.push(m); }
    seg = r;
  }
  const h = alto / 2;
  return <svg viewBox={`0 0 ${seg.length} ${alto}`} preserveAspectRatio="none" style={{position:"absolute",left:0,bottom:0,width:"100%",height:alto,pointerEvents:"none"}}>
    <path d={seg.map((v,i)=>`M${i+0.5},${h - v*(h-1)}V${h + v*(h-1)}`).join("")} stroke={color} strokeWidth="1" vectorEffect="non-scaling-stroke"/></svg>;
}

const nuevoProyecto = () => ({ nombre:"", formato:"vertical", ancho:1080, alto:1920, fps:30, marcadores:[], pistas:[
  { id:"v1", tipo:"video", nombre:"Principal", clips:[] },
  { id:"a1", tipo:"audio", nombre:"Audio 1", clips:[] },
]});
// la principal, magnética: cada clip empieza donde acaba el anterior (en su orden)
const cerrar = pista => {
  if(pista.id!=="v1") return pista;
  let t = 0;
  return { ...pista, clips: [...pista.clips].sort((a,b)=>a.en-b.en).map(c=>{ const n = {...c, en:t}; t += largo(c); return n; }) };
};
const ordenar = p => ({ ...p, pistas: p.pistas.map(cerrar) });
const solapa = (pi, en, d, ignorar) => pi.clips.some(x=>x.id!==ignorar && en < fin(x) - 1e-6 && en + d > x.en + 1e-6);

async function consultar(args) {
  const r = await window.studioFS.clonConsultar(args);
  if (r.error) throw new Error(r.error);
  return r.eventos || [];
}

export function RandomEditorView({ toast }) {
  const enPC = !!(window.studioFS && window.studioFS.redGuardar);
  // ---- el proyecto y su historial (en refs: cada cambio entra UNA vez, también los arrastres)
  const pRef = useRef(nuevoProyecto());
  const pasado = useRef([]), futuro = useRef([]);
  const sucioRef = useRef(false);
  const [, repintar] = useState(0);
  const p = pRef.current;
  const poner = nuevo => {
    const ant = pRef.current;
    if(nuevo === ant) return;
    pasado.current = [...pasado.current.slice(-100), ant]; futuro.current = [];
    pRef.current = nuevo; sucioRef.current = true; repintar(x=>x+1);
  };
  const cambiar = f => poner(ordenar(f(pRef.current)));
  const deshacer = () => { if(!pasado.current.length) return; futuro.current = [pRef.current, ...futuro.current]; pRef.current = pasado.current.pop(); sucioRef.current = true; repintar(x=>x+1); };
  const rehacer = () => { if(!futuro.current.length) return; pasado.current = [...pasado.current, pRef.current]; pRef.current = futuro.current.shift(); sucioRef.current = true; repintar(x=>x+1); };
  // un gesto (arrastrar, deslizar el volumen): se apunta al empezar y entra al historial al soltar
  const gesto = useRef(null);
  const empezarGesto = () => { gesto.current = pRef.current; };
  const durante = nuevo => { pRef.current = nuevo; sucioRef.current = true; repintar(x=>x+1); };
  const acabarGesto = () => { const g = gesto.current; gesto.current = null; if(g && g !== pRef.current){ pasado.current = [...pasado.current.slice(-100), g]; futuro.current = []; repintar(x=>x+1); } };

  const [sel, setSel] = useState(()=>new Set());
  const [porta, setPorta] = useState([]);
  const [t, setT] = useState(0);
  const [jugando, setJugando] = useState(0);         // 0 parado, >0 adelante (velocidad), <0 atrás
  const [zoom, setZoom] = useState(30);
  const [iman, setIman] = useState(true);
  const [completa, setCompleta] = useState(false);
  const [medios, setMedios] = useState(null);
  const [biblio, setBiblio] = useState(null);
  const [pestana, setPestana] = useState("clips");
  const [cat, setCat] = useState("");
  const [busca, setBusca] = useState("");
  const [oyendo, setOyendo] = useState(null);
  const [ondas, setOndas] = useState({});
  const [proyectos, setProyectos] = useState([]);
  const vid = useRef(null), auds = useRef({}), linea = useRef(null), reloj = useRef(null), oido = useRef(null), nombreRef = useRef(null);
  const est = useRef({}); est.current = { t, sel, jugando, zoom, iman, porta };
  const [tarea, lanzar, cerrarTarea] = useTarea(ev=>{
    if(guardandoClip.current){
      guardandoClip.current = false;
      if(!ev.codigo){ sucioRef.current = false; repintar(x=>x+1); toast && toast("Cambios guardados en el clip: el montaje del clon ya usa esta versión"); }
      sincronizar(est.current.t, 0);
      return;
    }
    if(!ev.codigo) toast && toast("Exportado: lo tienes en Shorts Listos/RandomEditor (o en Clips, si lo mandaste como clip)");
  });

  useEffect(()=>{ if(!enPC) return;
    consultar(["redmedios"]).then(ev=>setMedios(ev.find(e=>e.evento==="hecho"))).catch(e=>toast && toast(e.message));
    consultar(["redbiblio"]).then(ev=>setBiblio(ev.find(e=>e.evento==="hecho"))).catch(e=>toast && toast(e.message));
    window.studioFS.redLista().then(r=>setProyectos(r.lista||[]));
    if(pendiente){ const req = pendiente; pendiente = null; abrirClip(req.carpeta, req.archivo); }
  },[]);
  // guardado automático cada 45 s (si tiene nombre y hay cambios), como CapCut
  useEffect(()=>{ const iv = setInterval(()=>{ if(sucioRef.current && pRef.current.nombre.trim() && !pRef.current.clip) guardar(true); }, 45000); return ()=>clearInterval(iv); },[]);
  // las ondas del sonido de todo lo que hay en la línea de tiempo (27/10, él: "me guío mucho por las marcas del sonido")
  useEffect(()=>{
    p.pistas.flatMap(pi=>pi.clips).forEach(c=>{
      if(ondas[c.ruta]!==undefined) return;
      setOndas(o=>({...o, [c.ruta]:null}));
      consultar(["redonda", c.ruta]).then(ev=>{ const h = ev.find(e=>e.evento==="hecho"); setOndas(o=>({...o, [c.ruta]:h ? h.picos : []})); }).catch(()=>{});
    });
  });

  const todos = useMemo(()=>p.pistas.flatMap(pi=>pi.clips.map(c=>({...c, pista:pi.id}))),[p]);
  const total = useMemo(()=>Math.max(0, ...p.pistas.flatMap(pi=>pi.clips.map(fin))),[p]);
  const v1 = p.pistas.find(x=>x.id==="v1");
  const puntos = useMemo(()=>[...new Set([0, ...todos.flatMap(c=>[c.en, fin(c)]), ...(p.marcadores||[])])].sort((a,b)=>a-b),[todos, p]);

  // ---- meter medios (con ＋ o soltándolos en la línea de tiempo)
  const clipDe = (m, dur) => ({ id:uid(), ruta:m.ruta, nombre:m.nombre, mini:m.mini, desde:0, hasta:dur, dur_src:dur, en:0, vol:1, silencio:false });
  const durDe = async (m) => {
    if(m.dur!=null) return {dur:m.dur, video:m.video};
    const ev = await consultar(["redinfo", m.ruta]); const a = (ev.find(e=>e.evento==="hecho")||{}).archivos[0];
    return {dur:a.dur, video:a.video};
  };
  const meter = async (m, tipo, en, pistaId) => {
    let info; try { info = await durDe(m); } catch(e){ toast && toast(e.message); return; }
    if(info.video===false) tipo = "audio";
    const c = clipDe(m, info.dur);
    if(tipo==="video"){
      cambiar(prev=>({...prev, pistas: prev.pistas.map(pi=>pi.id!=="v1" ? pi : {...pi, clips:[...pi.clips,
        {...c, en: en==null ? Math.max(0,...pi.clips.map(fin)) : en - 0.0005}]})}));
    } else {
      const pos = en==null ? est.current.t : Math.max(0, en);
      cambiar(prev=>{
        const pref = prev.pistas.find(pi=>pi.id===pistaId && pi.tipo==="audio" && !solapa(pi, pos, info.dur));
        const libre = pref || prev.pistas.find(pi=>pi.tipo==="audio" && !solapa(pi, pos, info.dur));
        const ps = libre ? prev.pistas.map(pi=>pi.id!==libre.id ? pi : {...pi, clips:[...pi.clips, {...c, en:pos}]})
                         : [...prev.pistas, { id:"a"+uid(), tipo:"audio", nombre:"Audio "+(prev.pistas.filter(x=>x.tipo==="audio").length+1), clips:[{...c, en:pos}] }];
        return {...prev, pistas: ps};
      });
    }
  };
  const meterArchivos = async () => {
    const rs = await window.studioFS.redElegirArchivos();
    for(const r of rs){
      try { const ev = await consultar(["redinfo", r]); const a = (ev.find(e=>e.evento==="hecho")||{}).archivos[0];
            await meter({ruta:r, nombre:a.nombre, dur:a.dur, video:a.video}, a.video ? "video" : "audio"); }
      catch(e){ toast && toast(e.message); }
    }
  };
  const anadirPista = () => cambiar(prev=>({...prev, pistas:[...prev.pistas, { id:"a"+uid(), tipo:"audio", nombre:"Audio "+(prev.pistas.filter(x=>x.tipo==="audio").length+1), clips:[] }]}));
  const silenciarPista = id => cambiar(prev=>({...prev, pistas: prev.pistas.map(pi=>pi.id===id ? {...pi, muda:!pi.muda} : pi)}));
  const quitarPista = id => cambiar(prev=>({...prev, pistas: prev.pistas.filter(pi=>pi.id!==id)}));

  // ---- operaciones (sobre lo elegido; si no hay nada, lo que pisa el cabezal en la principal)
  const objetivos = tt => {
    const s = est.current.sel;
    const bajo = todos.filter(c=>tt > c.en + 0.01 && tt < fin(c) - 0.01);
    const elegidos = bajo.filter(c=>s.has(c.id));
    return elegidos.length ? elegidos : bajo.filter(c=>c.pista==="v1");
  };
  const dividir = () => {
    const tt = est.current.t, ids = new Set(objetivos(tt).map(c=>c.id)); if(!ids.size) return;
    cambiar(prev=>({...prev, pistas: prev.pistas.map(pi=>({...pi, clips: pi.clips.flatMap(c=>{
      if(!ids.has(c.id)) return [c];
      const k = c.desde + (tt - c.en);
      return [{...c, hasta:k}, {...c, id:uid(), desde:k, en:tt}];
    })}))}));
  };
  const borrarLado = izq => {
    const tt = est.current.t, ob = objetivos(tt), ids = new Set(ob.map(c=>c.id)); if(!ids.size) return;
    cambiar(prev=>({...prev, pistas: prev.pistas.map(pi=>({...pi, clips: pi.clips.map(c=>{
      if(!ids.has(c.id)) return c;
      const k = c.desde + (tt - c.en);
      return izq ? {...c, desde:k, en: pi.id==="v1" ? c.en : tt} : {...c, hasta:k};
    })}))}));
    if(izq){ const c0 = ob.find(c=>c.pista==="v1"); if(c0) setTimeout(()=>ir(c0.en), 0); }   // como CapCut: el cabezal se queda en el corte
  };
  const eliminar = () => {
    const s = est.current.sel; if(!s.size) return;
    cambiar(prev=>({...prev, pistas: prev.pistas.map(pi=>({...pi, clips: pi.clips.filter(c=>!s.has(c.id))}))}));
    setSel(new Set());
  };
  const copiar = cortar => {
    const s = est.current.sel; if(!s.size) return;
    setPorta(todos.filter(c=>s.has(c.id)).sort((a,b)=>a.en-b.en));
    if(cortar) eliminar();
  };
  const pegar = (cs, trasCadaUno) => {
    cs = cs || est.current.porta; if(!cs.length) return;
    const tt = est.current.t, base = Math.min(...cs.map(c=>c.en)), nuevos = new Set();
    cambiar(prev=>{
      let ps = prev.pistas;
      cs.forEach((c, k)=>{
        const n = {...c, id:uid()}; delete n.pista; nuevos.add(n.id);
        if(c.pista==="v1"){
          const pi = ps.find(x=>x.id==="v1");
          const cubre = pi.clips.find(x=>tt > x.en && tt < fin(x));
          const pos = trasCadaUno ? fin(c) : (cubre ? fin(cubre) : tt);
          n.en = pos - 0.0005 + k * 0.00001;
          ps = ps.map(x=>x.id!=="v1" ? x : {...x, clips:[...x.clips, n]});
        } else {
          n.en = trasCadaUno ? fin(c) : tt + (c.en - base);
          const misma = ps.find(x=>x.id===c.pista && !solapa(x, n.en, largo(n)));
          const libre = misma || ps.find(x=>x.tipo==="audio" && !solapa(x, n.en, largo(n)));
          ps = libre ? ps.map(x=>x.id!==libre.id ? x : {...x, clips:[...x.clips, n]})
                     : [...ps, { id:"a"+uid(), tipo:"audio", nombre:"Audio "+(ps.filter(x=>x.tipo==="audio").length+1), clips:[n] }];
        }
      });
      return {...prev, pistas: ps};
    });
    setSel(nuevos);
  };
  const duplicar = () => { const s = est.current.sel; if(s.size) pegar(todos.filter(c=>s.has(c.id)).sort((a,b)=>a.en-b.en), true); };
  const silenciar = () => {
    const s = est.current.sel; if(!s.size) return;
    const mudos = todos.filter(c=>s.has(c.id)).every(c=>c.silencio);
    cambiar(prev=>({...prev, pistas: prev.pistas.map(pi=>({...pi, clips: pi.clips.map(c=>s.has(c.id) ? {...c, silencio:!mudos} : c)}))}));
  };
  const marcador = () => {
    const tt = est.current.t, ms = pRef.current.marcadores||[];
    const cerca = ms.find(m=>Math.abs(m-tt) < 0.05);
    cambiar(prev=>({...prev, marcadores: cerca!=null ? ms.filter(m=>m!==cerca) : [...ms, tt].sort((a,b)=>a-b)}));
  };

  // ---- reproducción: un reloj y cada elemento sigue a su clip
  const ir = tt => { tt = Math.max(0, Math.min(total || 0, tt)); setT(tt); sincronizar(tt, 0); };
  const sincronizar = (tt, vel) => {
    const pr = pRef.current, adelante = vel > 0;
    const v = vid.current, pv = pr.pistas.find(x=>x.id==="v1");
    const c = (pv ? pv.clips : []).find(x=>tt >= x.en && tt < fin(x));
    if(v){
      if(!c){ if(!v.paused) v.pause(); v.style.visibility = "hidden"; }
      else {
        v.style.visibility = "visible";
        if(v.dataset.ruta !== c.ruta){ v.dataset.ruta = c.ruta; v.src = fileUrl(c.ruta); }
        const local = c.desde + (tt - c.en);
        if(Math.abs(v.currentTime - local) > (adelante ? 0.25 : 0.02)) { try { v.currentTime = local; } catch(e){} }
        v.playbackRate = adelante ? vel : 1;
        v.volume = (c.silencio || pv.muda) ? 0 : Math.min(1, c.vol);
        if(adelante && v.paused) v.play().catch(()=>{});
        if(!adelante && !v.paused) v.pause();
      }
    }
    pr.pistas.filter(pi=>pi.tipo==="audio").forEach(pi=>{
      let a = auds.current[pi.id]; if(!a){ a = new Audio(); auds.current[pi.id] = a; }
      const c2 = pi.clips.find(x=>tt >= x.en && tt < fin(x));
      if(!c2 || pi.muda){ if(!a.paused) a.pause(); return; }
      if(a.dataset.ruta !== c2.ruta){ a.dataset.ruta = c2.ruta; a.src = fileUrl(c2.ruta); }
      const local = c2.desde + (tt - c2.en);
      if(Math.abs(a.currentTime - local) > (adelante ? 0.3 : 0.05)) { try { a.currentTime = local; } catch(e){} }
      a.playbackRate = adelante ? vel : 1;
      a.volume = c2.silencio ? 0 : Math.min(1, c2.vol);
      if(adelante && a.paused) a.play().catch(()=>{});
      if(!adelante && !a.paused) a.pause();
    });
  };
  useEffect(()=>{
    if(!jugando){ sincronizar(t, 0); cancelAnimationFrame(reloj.current); return; }
    let ant = null, tt = (jugando>0 && t >= total - 0.05) ? 0 : t;
    const paso = ahora => {
      // 28/10, él: "al poner la vara al principio y darle al play, a veces no se reproduce y se queda
      // pillado": el primer paso podía salir negativo y en 0:00 contaba como "fin". Ahora el primer
      // fotograma solo marca el tiempo, y solo se para al llegar al final (o al principio yendo atrás)
      const dt = ant===null ? 0 : Math.max(0, (ahora - ant) / 1000); ant = ahora;
      tt += dt * jugando;
      if((jugando > 0 && tt >= total) || (jugando < 0 && tt <= 0)){ tt = Math.max(0, Math.min(total, tt)); setT(tt); setJugando(0); return; }
      setT(tt); sincronizar(tt, jugando);
      const l = linea.current;          // la línea sigue al cabezal
      if(l){ const x = 20 + tt * est.current.zoom; if(x > l.scrollLeft + l.clientWidth - 60 || x < l.scrollLeft) l.scrollLeft = x - 80; }
      reloj.current = requestAnimationFrame(paso);
    };
    reloj.current = requestAnimationFrame(paso);
    return ()=>cancelAnimationFrame(reloj.current);
  },[jugando]);
  useEffect(()=>()=>{ Object.values(auds.current).forEach(a=>{ try { a.pause(); a.src=""; } catch(e){} }); if(oido.current) oido.current.pause(); },[]);
  const jugar = () => setJugando(j=>j ? 0 : 1);

  // ---- escuchar en la biblioteca
  const oir = m => {
    if(!oido.current) oido.current = new Audio();
    const a = oido.current;
    if(oyendo===m.ruta){ a.pause(); setOyendo(null); return; }
    a.src = fileUrl(m.ruta); a.currentTime = 0; a.volume = 0.8; a.play().catch(()=>{}); setOyendo(m.ruta);
    a.onended = () => setOyendo(null);
  };

  // ---- guardar / abrir / exportar
  const guardar = async (callado) => {
    const pr = pRef.current;
    if(!pr.nombre.trim()){ if(!callado){ toast && toast("Ponle un nombre al proyecto (arriba)"); nombreRef.current && nombreRef.current.focus(); } return null; }
    const r = await window.studioFS.redGuardar(pr);
    if(r.error){ if(!callado) toast && toast(r.error); return null; }
    sucioRef.current = false; repintar(x=>x+1);
    window.studioFS.redLista().then(x=>setProyectos(x.lista||[]));
    if(!callado) toast && toast("Proyecto guardado");
    return r.ruta;
  };
  const cargarProyecto = pr => { pRef.current = ordenar({...nuevoProyecto(), ...pr}); pasado.current = []; futuro.current = []; sucioRef.current = false; setSel(new Set()); setT(0); repintar(x=>x+1);
    setTimeout(()=>sincronizar(0, 0), 80); };          // que se vea el primer fotograma nada más abrir
  const abrir = async nombre => {
    if(sucioRef.current && !window.confirm("Hay cambios sin guardar. ¿Abrir otro proyecto igualmente?")) return;
    const r = await window.studioFS.redAbrir(nombre);
    if(r.error){ toast && toast(r.error); return; }
    cargarProyecto(r.proyecto);
  };
  const nuevo = () => { if(sucioRef.current && !window.confirm("Hay cambios sin guardar. ¿Empezar uno nuevo?")) return; cargarProyecto(nuevoProyecto()); };
  const exportar = async como => {
    if(!v1 || !v1.clips.length){ toast && toast("La pista principal está vacía"); return; }
    const ruta = await guardar(); if(!ruta) return;
    try { await lanzar(["exportar", ruta, como, ...(como==="clip" ? [pRef.current.nombre] : [])]); } catch(e){ toast && toast(e.message); }
  };
  // ---- modo clip
  const soltarVideos = async () => {
    [vid.current, ...Object.values(auds.current)].forEach(v=>{ try { v && v.pause(); if(v){ v.removeAttribute("src"); v.dataset.ruta = ""; v.load && v.load(); } } catch(x){} });
    await new Promise(r=>setTimeout(r, 400));
  };
  const abrirClip = async (carpeta, archivo) => {
    if(sucioRef.current && !window.confirm("Hay cambios sin guardar en lo que tienes abierto. ¿Abrir el clip igualmente?")) return;
    try {
      const ev = await consultar(["redabrirclip", carpeta, archivo]);
      const h = ev.find(e=>e.evento==="hecho");
      cargarProyecto(h.proyecto);
      setTimeout(ajustar, 50);
    } catch(e){ toast && toast(e.message); }
  };
  const guardarCambios = async () => {
    const c = pRef.current.clip; if(!c) return;
    if(!v1 || !v1.clips.length){ toast && toast("La pista principal está vacía: para quitarlo entero, descarta el clip en Clips"); return; }
    setJugando(0); await soltarVideos();
    const r = await window.studioFS.redGuardarTmp(pRef.current);
    if(r.error){ toast && toast(r.error); return; }
    guardandoClip.current = true;
    try { await lanzar(["guardarclip", r.ruta, c.carpeta, c.archivo]); } catch(e){ guardandoClip.current = false; toast && toast(e.message); }
  };
  const volverAlOriginal = async () => {
    const c = pRef.current.clip; if(!c) return;
    if(!window.confirm("¿Volver al clip original? Se pierden los cambios guardados de este clip.")) return;
    await soltarVideos();
    try { await consultar(["original", c.carpeta, c.archivo]); sucioRef.current = false; toast && toast("Clip original recuperado"); await abrirClip(c.carpeta, c.archivo); }
    catch(e){ toast && toast(e.message); }
  };
  // «Quitar el aire» (regla de oro: el aire se corta): fuera los silencios largos de la principal
  const quitarAire = async () => {
    const cs = v1 ? v1.clips : []; if(!cs.length) return;
    const aires = {};
    try { for(const r of [...new Set(cs.map(c=>c.ruta))]){ const ev = await consultar(["redaire", r]); aires[r] = (ev.find(e=>e.evento==="hecho")||{}).aire || []; } }
    catch(e){ toast && toast(e.message); return; }
    let quitados = 0;
    cambiar(prev=>({...prev, pistas: prev.pistas.map(pi=>pi.id!=="v1" ? pi : {...pi, clips: pi.clips.flatMap(c=>{
      let trozos = [[c.desde, c.hasta]];
      (aires[c.ruta]||[]).forEach(([a,b])=>{
        trozos = trozos.flatMap(([x,y])=> (b<=x || a>=y) ? [[x,y]] : [[x,Math.max(x,a)],[Math.min(y,b),y]].filter(([u,v])=>v-u>0.05));
      });
      quitados += trozos.length - 1;
      let en = c.en;
      return trozos.map(([x,y],k)=>{ const n = {...c, id:k ? uid() : c.id, desde:x, hasta:y, en}; en += y - x; return n; });
    })})}));
    toast && toast(quitados ? `Aire quitado en ${quitados} sitio${quitados!==1?"s":""} (Ctrl+Z para deshacer)` : "No hay silencios largos que quitar");
  };
  const guardandoClip = useRef(false);

  const formato = f => { const [w,h] = LIENZOS[f]; cambiar(prev=>({...prev, formato:f, ancho:w, alto:h})); };

  // ---- atajos (los de CapCut)
  useEffect(()=>{
    const h = e => {
      const ae = document.activeElement;
      const escribiendo = ae && (ae.tagName==="TEXTAREA" || ae.tagName==="SELECT" || (ae.tagName==="INPUT" && !["range","checkbox","button"].includes(ae.type)));
      if(escribiendo) return;
      if(ae && ae !== document.body && (ae.tagName==="INPUT" || ae.tagName==="BUTTON")) ae.blur();    // la barra o el botón sueltan el teclado
      const k = e.key, ctrl = e.ctrlKey || e.metaKey, tt = est.current.t, fps = pRef.current.fps || 30, K = k.length===1 ? k.toLowerCase() : k;
      const ok = () => { e.preventDefault(); e.stopImmediatePropagation(); };   // que no deshaga también la planificación
      if(k===" "){ ok(); jugar(); }
      else if(ctrl && !e.shiftKey && K==="b"){ ok(); dividir(); }
      else if(!ctrl && K==="q"){ ok(); borrarLado(true); }
      else if(!ctrl && K==="w"){ ok(); borrarLado(false); }
      else if(k==="Delete"||k==="Backspace"){ ok(); eliminar(); }
      else if(ctrl && K==="c"){ ok(); copiar(false); }
      else if(ctrl && K==="x"){ ok(); copiar(true); }
      else if(ctrl && K==="v"){ ok(); pegar(); }
      else if(ctrl && K==="d"){ ok(); duplicar(); }
      else if(ctrl && K==="a"){ ok(); setSel(new Set(todos.map(c=>c.id))); }
      else if(ctrl && e.shiftKey && K==="z"){ ok(); rehacer(); }
      else if(ctrl && K==="y"){ ok(); rehacer(); }
      else if(ctrl && K==="z"){ ok(); deshacer(); }
      else if(ctrl && K==="s"){ ok(); pRef.current.clip ? guardarCambios() : guardar(); }
      else if(ctrl && K==="e"){ ok(); exportar("listos"); }
      else if(ctrl && K==="i"){ ok(); meterArchivos(); }
      else if(ctrl && e.shiftKey && K==="f"){ ok(); setCompleta(x=>!x); }
      else if(ctrl && (k==="+"||k==="=")){ ok(); setZoom(z=>Math.min(ZMAX, z*1.4)); }
      else if(ctrl && (k==="-"||k==="_")){ ok(); setZoom(z=>Math.max(ZMIN, z/1.4)); }
      else if(!ctrl && e.shiftKey && K==="z"){ ok(); ajustar(); }
      else if(!ctrl && e.shiftKey && K==="m"){ ok(); silenciar(); }
      else if(!ctrl && K==="m"){ ok(); marcador(); }
      else if(!ctrl && K==="n"){ ok(); setIman(x=>!x); }
      else if(!ctrl && K==="k"){ ok(); setJugando(0); }
      else if(!ctrl && K==="l"){ ok(); setJugando(j=>j>0 ? Math.min(4, j*2) : 1); }
      else if(!ctrl && K==="j"){ ok(); setJugando(j=>j<0 ? Math.max(-4, j*2) : -1); }
      else if(k==="Escape"){ ok(); if(completa) setCompleta(false); else setSel(new Set()); }
      // 28/10, él: "con las flechas poder ir de trozo en trozo, como en CapCut": ↑/↓ y Ctrl+←/→ saltan al
      // corte (o marcador) anterior/siguiente; ←/→ solas, fotograma a fotograma (Shift: 1 s)
      else if(k==="ArrowUp" || (ctrl && k==="ArrowLeft")){ ok(); setJugando(0); const c = [...puntos].reverse().find(x=>x < tt - 0.01); ir(c ?? 0); }
      else if(k==="ArrowDown" || (ctrl && k==="ArrowRight")){ ok(); setJugando(0); const c = puntos.find(x=>x > tt + 0.01); ir(c ?? total); }
      else if(k==="ArrowLeft"){ ok(); setJugando(0); ir(tt - (e.shiftKey ? 1 : 1/fps)); }
      else if(k==="ArrowRight"){ ok(); setJugando(0); ir(tt + (e.shiftKey ? 1 : 1/fps)); }
      else if(k==="Home"){ ok(); ir(0); }
      else if(k==="End"){ ok(); ir(total); }
    };
    // al soltar Espacio con un botón con foco, el navegador lo pulsa: no
    const arriba = e => { if(e.key===" " && !/TEXTAREA|SELECT/.test(document.activeElement?.tagName||"") && !(document.activeElement?.tagName==="INPUT" && document.activeElement.type==="text")) e.preventDefault(); };
    window.addEventListener("keydown", h, true);
    window.addEventListener("keyup", arriba, true);
    return ()=>{ window.removeEventListener("keydown", h, true); window.removeEventListener("keyup", arriba, true); };
  });
  const ajustar = () => {
    const tot = Math.max(0, ...pRef.current.pistas.flatMap(pi=>pi.clips.map(fin)));      // (del proyecto de ahora, no del de la última pintada)
    const w = linea.current ? linea.current.clientWidth - 60 : 900; setZoom(Math.max(ZMIN, Math.min(ZMAX, w / Math.max(5, tot))));
  };

  // ---- línea de tiempo: arrastrar clips, bordes y el cabezal; soltar cosas de la biblioteca
  const encaje = (x, ignorar) => {
    if(!est.current.iman) return x;
    const umbral = 8 / est.current.zoom;
    const ps = [est.current.t, ...(pRef.current.marcadores||[]), ...todos.filter(c=>c.id!==ignorar).flatMap(c=>[c.en, fin(c)])];
    let mejor = x, d = umbral;
    ps.forEach(q=>{ if(Math.abs(q - x) < d){ d = Math.abs(q - x); mejor = q; } });
    return mejor;
  };
  const arrastrarClip = (e, c, pista, modo) => {
    e.stopPropagation(); e.preventDefault();
    if(e.shiftKey){ setSel(s=>{ const n = new Set(s); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; }); return; }
    if(!sel.has(c.id)) setSel(new Set([c.id]));
    const x0 = e.clientX, inicial = pRef.current;
    let movido = false;
    empezarGesto();
    const mover = ev => {
      const dt = (ev.clientX - x0) / est.current.zoom;
      if(!movido && Math.abs(ev.clientX - x0) < 3) return;
      movido = true;
      durante(ordenar({...inicial, pistas: inicial.pistas.map(pi=>pi.id!==pista.id ? pi : {...pi, clips: pi.clips.map(y=>{
        if(y.id!==c.id) return y;
        if(modo==="izq"){
          let desde = Math.max(0, Math.min(y.hasta - 0.1, y.desde + dt));
          if(pista.id==="v1") return {...y, desde};
          const en = encaje(y.en + (desde - y.desde), y.id);
          desde = Math.max(0, Math.min(y.hasta - 0.1, y.desde + (en - y.en)));
          return {...y, desde, en: y.en + (desde - y.desde)};
        }
        if(modo==="der"){
          let hasta = Math.max(y.desde + 0.1, Math.min(y.dur_src ?? 1e9, y.hasta + dt));
          if(pista.id!=="v1"){ const f2 = encaje(y.en + (hasta - y.desde), y.id); hasta = Math.max(y.desde + 0.1, Math.min(y.dur_src ?? 1e9, y.desde + (f2 - y.en))); }
          return {...y, hasta};
        }
        if(pista.id==="v1") return {...y, en: y.en + dt + (dt>0 ? 0.0005 : -0.0005)};
        let en = Math.max(0, encaje(y.en + dt, y.id));
        const f2 = encaje(en + largo(y), y.id); if(f2 !== en + largo(y)) en = Math.max(0, f2 - largo(y));
        return {...y, en};
      })})}));
    };
    const soltar = () => { window.removeEventListener("mousemove", mover); window.removeEventListener("mouseup", soltar); acabarGesto(); };
    window.addEventListener("mousemove", mover); window.addEventListener("mouseup", soltar);
  };
  const tDeX = clientX => { const r = linea.current.getBoundingClientRect(); return Math.max(0, (clientX - r.left + linea.current.scrollLeft - 20) / est.current.zoom); };
  const arrastrarCabezal = e => {
    if(e.button!==0) return;
    const a = ev => { setJugando(0); ir(tDeX(ev.clientX)); };
    a(e); if(!e.shiftKey) setSel(new Set());
    const soltar = () => { window.removeEventListener("mousemove", a); window.removeEventListener("mouseup", soltar); };
    window.addEventListener("mousemove", a); window.addEventListener("mouseup", soltar);
  };
  const soltarEnPista = (e, pi) => {
    e.preventDefault();
    try { const m = JSON.parse(e.dataTransfer.getData("application/x-randomeditor")); meter(m, pi.tipo==="video" ? "video" : "audio", encaje(tDeX(e.clientX)), pi.id); } catch(x){}
  };
  const rueda = e => { if(e.ctrlKey){ e.preventDefault(); setZoom(z=>Math.max(ZMIN, Math.min(ZMAX, z * (e.deltaY < 0 ? 1.15 : 1/1.15)))); } };

  if(!enPC) return <div style={{padding:"18px 20px",border:"1px dashed var(--border)",borderRadius:14,color:"var(--text-2)",fontSize:13.5}}>El RandomEditor funciona en el PC: ábrelo desde RandomStudio de escritorio.</div>;

  const ancho = Math.max(1, total + 15) * zoom + 60;
  const paso = zoom > 120 ? 1 : zoom > 40 ? 2 : zoom > 15 ? 5 : zoom > 6 ? 10 : zoom > 2 ? 30 : 60;
  const elegidos = todos.filter(c=>sel.has(c.id));
  const lista = pestana==="clips" ? (medios ? medios.clips : null) : (biblio ? (pestana==="musica" ? biblio.musica : biblio.sfx) : null);
  const cats = pestana==="sfx" ? (biblio ? biblio.categorias_sfx : []) : pestana==="musica" ? (biblio ? biblio.generos : []) : [];
  const filtrada = (lista||[]).filter(m=>(!cat || m.categoria===cat) && (!busca.trim() || m.nombre.toLowerCase().includes(busca.toLowerCase())));
  const [W, H] = [p.ancho, p.alto];
  const vista = (
    <div style={completa ? {position:"fixed",inset:0,zIndex:1300,background:"#000",display:"flex",alignItems:"center",justifyContent:"center"} :
      {position:"relative",height:p.formato==="vertical"?380:"auto",width:p.formato==="vertical"?380*W/H:"100%",aspectRatio:`${W}/${H}`,maxWidth:"100%",background:"#000"}}>
      <video ref={vid} playsInline onClick={jugar} style={{position:completa?"static":"absolute",inset:0,width:"100%",height:"100%",objectFit:"contain",maxHeight:"100vh"}}/>
      {completa && <button onClick={()=>setCompleta(false)} title="Salir (Esc)" style={{...bi(false),position:"fixed",top:16,right:16,color:"#fff"}}>{I.completa}</button>}
    </div>);
  const sep = <span style={{width:1,height:20,background:"var(--border)",margin:"0 3px"}}/>;
  return (
    <div className="fade-in" onMouseDownCapture={e=>{ if(e.target.closest && e.target.closest("button")) e.preventDefault(); }}
      onPointerUpCapture={e=>{ if(e.target.tagName==="INPUT" && e.target.type==="range") setTimeout(()=>e.target.blur(), 0); }}
      style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
        {p.clip && <span style={{fontSize:12,fontWeight:700,padding:"5px 9px",borderRadius:8,background:"rgba(212,175,55,0.15)",color:"var(--gold)",whiteSpace:"nowrap"}}>✂ Clip</span>}
        <input ref={nombreRef} readOnly={!!p.clip} title={p.clip ? "Estás editando este clip recortado" : undefined} value={p.nombre} onChange={e=>{ pRef.current = {...pRef.current, nombre:e.target.value}; sucioRef.current = true; repintar(x=>x+1); }} placeholder="Nombre del proyecto"
          style={{flex:"1 1 200px",minWidth:0,maxWidth:320,fontSize:13.5,fontWeight:650,padding:"8px 11px",borderRadius:9,border:"1px solid var(--border)",background:"var(--bg-2)",color:"var(--text)"}}/>
        <span style={{fontSize:11.5,color:sucioRef.current?"var(--gold)":"var(--text-3)"}}>{sucioRef.current ? "sin guardar" : (p.nombre ? "guardado" : "")}</span>
        <button onClick={nuevo} style={bt(false)}>Nuevo</button>
        <select value="" onChange={e=>e.target.value && abrir(e.target.value)} style={{...bt(false),background:"var(--bg-2)"}}>
          <option value="">Abrir…</option>{proyectos.map(x=><option key={x.nombre} value={x.nombre}>{x.nombre}</option>)}
        </select>
        <button onClick={()=>guardar()} style={bt(false)} title="Ctrl+S">Guardar</button>
        {sep}
        {Object.entries(LIENZOS).map(([k,[w,h,et]])=><button key={k} onClick={()=>formato(k)} style={bt(p.formato===k)}>{et}</button>)}
        <span style={{marginLeft:"auto"}}/>
        {p.clip ? <>
          <button onClick={quitarAire} style={bt(false)} title="Quita los silencios largos de la pista principal (Ctrl+Z para deshacer)">✨ Quitar el aire</button>
          <button onClick={volverAlOriginal} disabled={!!(tarea&&!tarea.cerrada)} style={bt(false)} title="Deshace todo lo guardado en este clip">Volver al original</button>
          <button onClick={guardarCambios} disabled={!!(tarea&&!tarea.cerrada)} style={bt(true)} title="Ctrl+S · rehace el clip con estos cambios, en su sitio (no exporta nada aparte)">Guardar cambios</button>
        </> : <>
          <button onClick={quitarAire} style={bt(false)} title="Quita los silencios largos de la pista principal (Ctrl+Z para deshacer)">✨ Quitar el aire</button>
          <button onClick={()=>exportar("clip")} disabled={!!(tarea&&!tarea.cerrada)} style={bt(false)} title="Como clip recortado NUEVO (aprobado) para montarlo con el clon">Exportar como clip nuevo</button>
          <button onClick={()=>exportar("listos")} disabled={!!(tarea&&!tarea.cerrada)} style={bt(true)} title="Ctrl+E · a Shorts Listos/RandomEditor">Exportar</button>
        </>}
      </div>
      <PanelTarea tarea={tarea} onCerrar={cerrarTarea}/>

      <div style={{display:"grid",gridTemplateColumns:"minmax(0,340px) minmax(0,1fr) minmax(0,220px)",gap:12,alignItems:"stretch"}}>
        {/* biblioteca */}
        <div style={{border:"1px solid var(--border)",borderRadius:12,background:"var(--bg-2)",display:"flex",flexDirection:"column",minHeight:0,height:440}}>
          <div style={{display:"flex",gap:4,padding:8,borderBottom:"1px solid var(--border)"}}>
            {[["clips","Clips"],["musica","Música"],["sfx","SFX"]].map(([k,l])=><button key={k} onClick={()=>{ setPestana(k); setCat(""); }} style={{...bt(pestana===k),flex:1}}>{l}</button>)}
            <button onClick={meterArchivos} style={bi(false)} title="Meter archivos del disco (Ctrl+I)">{I.archivo}</button>
          </div>
          <input value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Buscar…" style={{margin:"8px 8px 4px",fontSize:12.5,padding:"6px 9px",borderRadius:8,border:"1px solid var(--border)",background:"var(--bg)",color:"var(--text)"}}/>
          {cats.length>0 && <div style={{display:"flex",gap:4,flexWrap:"wrap",padding:"4px 8px",maxHeight:92,overflowY:"auto"}}>
            <button onClick={()=>setCat("")} style={{...bt(!cat),padding:"3px 8px",fontSize:11}}>Todo</button>
            {cats.map(x=><button key={x} onClick={()=>setCat(x)} style={{...bt(cat===x),padding:"3px 8px",fontSize:11}}>{x} · {(lista||[]).filter(m=>m.categoria===x).length}</button>)}
          </div>}
          <div style={{overflowY:"auto",flex:1,padding:"4px 8px 8px",display:"flex",flexDirection:"column",gap:4}}>
            {lista===null && <div style={{fontSize:12.5,color:"var(--text-3)",padding:8}}>{pestana==="clips" ? "Cargando los clips…" : "Ordenando la biblioteca (la primera vez tarda un poco)…"}</div>}
            {filtrada.slice(0,400).map(m=>(
              <div key={m.ruta} draggable onDragStart={e=>{ e.dataTransfer.setData("application/x-randomeditor", JSON.stringify(m)); e.dataTransfer.effectAllowed = "copy"; }}
                style={{display:"flex",gap:7,alignItems:"center",padding:"4px 5px",borderRadius:8,border:"1px solid var(--border)",cursor:"grab"}} title="Arrástralo a la línea de tiempo o pulsa ＋">
                {pestana==="clips" ? <div style={{width:30,height:52,borderRadius:5,background:m.mini?`#111 url("${fileUrl(m.mini)}") center/cover`:"#111",flexShrink:0}}/>
                  : <button onClick={()=>oir(m)} style={{...bi(oyendo===m.ruta),width:26,height:26}} title="Escuchar">{oyendo===m.ruta ? I.parar : I.oir}</button>}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.nombre}</div>
                  <div style={{fontSize:10.5,color:"var(--text-3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {m.dur!=null ? corto(m.dur) : ""}{m.bpm ? ` · ${Math.round(m.bpm)} bpm` : ""}{m.animo ? ` · ${m.animo}` : ""}{pestana==="musica" && m.segura ? " · sin copyright" : ""}{pestana==="sfx" && !cat ? ` · ${m.categoria}` : ""}</div>
                </div>
                <button onClick={()=>meter(m, pestana==="clips"?"video":"audio")} style={{...bi(false),width:28,height:28}} title={pestana==="clips"?"Al final de la pista principal":"En el cabezal"}>{I.mas}</button>
              </div>))}
            {lista && !filtrada.length && <div style={{fontSize:12.5,color:"var(--text-3)",padding:8}}>Nada coincide.</div>}
          </div>
        </div>
        {/* previsualización */}
        <div style={{border:"1px solid var(--border)",borderRadius:12,background:"#000",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:10,gap:8,height:440,boxSizing:"border-box"}}>
          {completa ? createPortal(vista, document.body) : vista}
          <div style={{display:"flex",gap:8,alignItems:"center",fontSize:13}}>
            <button onClick={()=>ir(0)} style={bi(false)} title="Al principio (Inicio)">{I.inicio}</button>
            <button onClick={jugar} style={bi(!!jugando)} title="Reproducir / pausar (Espacio · J/K/L)">{jugando ? I.pausa : I.play}</button>
            <span style={{fontFamily:"monospace",color:"var(--gold)"}}>{t2s(t)}</span><span style={{color:"var(--text-3)",fontFamily:"monospace"}}>/ {t2s(total)}</span>
            {Math.abs(jugando)>1 && <span style={{fontSize:11,color:"var(--gold)"}}>×{jugando}</span>}
            <button onClick={()=>setCompleta(true)} style={bi(false)} title="Pantalla completa (Ctrl+Shift+F)">{I.completa}</button>
          </div>
        </div>
        {/* inspector */}
        <div style={{border:"1px solid var(--border)",borderRadius:12,background:"var(--bg-2)",padding:12,display:"flex",flexDirection:"column",gap:10,fontSize:12.5,height:440,boxSizing:"border-box"}}>
          <b style={{fontSize:13}}>{elegidos.length ? `${elegidos.length} elegido${elegidos.length!==1?"s":""}` : "Nada elegido"}</b>
          {elegidos.length===1 && <div style={{color:"var(--text-2)",lineHeight:1.6}}>
            <div style={{overflowWrap:"anywhere"}}>{elegidos[0].nombre}</div>
            <div>Archivo: {t2s(elegidos[0].desde)} → {t2s(elegidos[0].hasta)}</div>
            <div>Línea: {t2s(elegidos[0].en)} → {t2s(fin(elegidos[0]))}</div>
          </div>}
          {elegidos.length>0 && <>
            <label style={{display:"flex",flexDirection:"column",gap:4}}>Volumen · {Math.round((elegidos[0].vol??1)*100)}%
              <input type="range" min={0} max={2} step={0.05} value={elegidos[0].vol??1}
                onPointerDown={empezarGesto} onPointerUp={acabarGesto}
                onChange={e=>{ const v = Number(e.target.value), s = sel; durante({...pRef.current, pistas: pRef.current.pistas.map(pi=>({...pi, clips: pi.clips.map(c=>s.has(c.id) ? {...c, vol:v} : c)}))}); }}/></label>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              <button onClick={silenciar} style={bi(elegidos.every(c=>c.silencio))} title="Silenciar (Shift+M)">{elegidos.every(c=>c.silencio) ? I.mudo : I.sonido}</button>
              <button onClick={dividir} style={bi(false)} title="Dividir (Ctrl+B)">{I.dividir}</button>
              <button onClick={duplicar} style={bi(false)} title="Duplicar (Ctrl+D)">{I.duplicar}</button>
              <button onClick={eliminar} style={bi(false,true)} title="Eliminar (Supr)">{I.borrar}</button>
            </div>
          </>}
          <div style={{marginTop:"auto",color:"var(--text-3)",fontSize:11.5,lineHeight:1.5}}>Todos los atajos, en Configuración.</div>
        </div>
      </div>

      {/* línea de tiempo */}
      <div style={{border:"1px solid var(--border)",borderRadius:12,background:"var(--bg-2)"}}>
        <div style={{display:"flex",gap:5,alignItems:"center",padding:"7px 10px",borderBottom:"1px solid var(--border)",flexWrap:"wrap"}}>
          <button onClick={deshacer} disabled={!pasado.current.length} style={{...bi(false),opacity:pasado.current.length?1:.35}} title="Deshacer (Ctrl+Z)">{I.deshacer}</button>
          <button onClick={rehacer} disabled={!futuro.current.length} style={{...bi(false),opacity:futuro.current.length?1:.35}} title="Rehacer (Ctrl+Shift+Z)">{I.rehacer}</button>
          {sep}
          <button onClick={dividir} style={bi(false)} title="Dividir (Ctrl+B)">{I.dividir}</button>
          <button onClick={()=>borrarLado(true)} style={bi(false)} title="Borrar a la izquierda (Q)">{I.izq}</button>
          <button onClick={()=>borrarLado(false)} style={bi(false)} title="Borrar a la derecha (W)">{I.der}</button>
          <button onClick={eliminar} disabled={!sel.size} style={{...bi(false,true),opacity:sel.size?1:.35}} title="Eliminar (Supr)">{I.borrar}</button>
          {sep}
          <button onClick={()=>copiar(false)} disabled={!sel.size} style={{...bi(false),opacity:sel.size?1:.35}} title="Copiar (Ctrl+C)">{I.copiar}</button>
          <button onClick={()=>pegar()} disabled={!porta.length} style={{...bi(false),opacity:porta.length?1:.35}} title="Pegar en el cabezal (Ctrl+V)">{I.pegar}</button>
          <button onClick={duplicar} disabled={!sel.size} style={{...bi(false),opacity:sel.size?1:.35}} title="Duplicar (Ctrl+D)">{I.duplicar}</button>
          {sep}
          <button onClick={marcador} style={bi(false)} title="Marcador en el cabezal (M)">{I.marcador}</button>
          <button onClick={()=>setIman(x=>!x)} style={bi(iman)} title="Imán (N)">{I.iman}</button>
          <button onClick={anadirPista} style={bi(false)} title="Pista de audio nueva">{I.pista}</button>
          <span style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:5}}>
            <button onClick={()=>setZoom(z=>Math.max(ZMIN,z/1.4))} style={bi(false)} title="Alejar (Ctrl+-)">{I.menos}</button>
            <input type="range" min={ZMIN} max={ZMAX} step={0.5} value={zoom} onChange={e=>setZoom(Number(e.target.value))} style={{width:120}}/>
            <button onClick={()=>setZoom(z=>Math.min(ZMAX,z*1.4))} style={bi(false)} title="Acercar (Ctrl++)">{I.mas}</button>
            <button onClick={ajustar} style={bi(false)} title="Ver todo (Shift+Z)">{I.ajustar}</button>
          </span>
        </div>
        <div style={{display:"flex"}}>
          {/* cabeceras de pista */}
          <div style={{width:70,flexShrink:0,borderRight:"1px solid var(--border)",paddingTop:24}}>
            {p.pistas.map(pi=>(
              <div key={pi.id} style={{height:pi.tipo==="video"?ALTO_V:ALTO_A,marginTop:6,display:"flex",alignItems:"center",justifyContent:"center",gap:3}}>
                <span style={{fontSize:10.5,fontWeight:700,color:"var(--text-3)"}}>{pi.tipo==="video" ? "V1" : "A"+(p.pistas.filter(x=>x.tipo==="audio").indexOf(pi)+1)}</span>
                <button onClick={()=>silenciarPista(pi.id)} style={{...bi(!!pi.muda),width:24,height:24}} title={pi.muda ? "Pista silenciada" : "Silenciar la pista"}>{pi.muda ? I.mudo : I.sonido}</button>
                {pi.tipo==="audio" && !pi.clips.length && p.pistas.filter(x=>x.tipo==="audio").length>1 && <button onClick={()=>quitarPista(pi.id)} style={{...bi(false,true),width:20,height:24}} title="Quitar la pista vacía">×</button>}
              </div>))}
          </div>
          <div ref={linea} onWheel={rueda} style={{overflowX:"auto",overflowY:"hidden",position:"relative",flex:1}}>
            <div style={{position:"relative",width:ancho,padding:"0 0 8px 20px",userSelect:"none"}}>
              <div onMouseDown={arrastrarCabezal} style={{position:"relative",height:24,cursor:"pointer",borderBottom:"1px solid var(--border)"}}>
                {Array.from({length:Math.ceil((total+15)/paso)+1}, (_,i)=>i*paso).map(s=>(
                  <div key={s} style={{position:"absolute",left:s*zoom,top:0,height:"100%",borderLeft:"1px solid var(--border)",paddingLeft:3,fontSize:10,color:"var(--text-3)"}}>{corto(s)}</div>))}
                {(p.marcadores||[]).map(m=><div key={m} title={"Marcador "+t2s(m)} style={{position:"absolute",left:m*zoom-5,top:2,color:"#60a5fa"}}>{I.marcador}</div>)}
              </div>
              {p.pistas.map(pi=>(
                <div key={pi.id} onMouseDown={arrastrarCabezal} onDragOver={e=>{ e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }} onDrop={e=>soltarEnPista(e, pi)}
                  style={{position:"relative",height:pi.tipo==="video"?ALTO_V:ALTO_A,marginTop:6,borderRadius:6,background:"rgba(255,255,255,0.025)",opacity:pi.muda?0.55:1}}>
                  {pi.clips.map(c=>{
                    const elegido = sel.has(c.id), od = ondas[c.ruta], anchoPx = largo(c)*zoom;
                    const onda = pi.tipo==="video"
                      ? <div style={{position:"absolute",left:0,right:0,bottom:0,height:ALTO_V-FOTOS_V-4,background:"rgba(8,12,20,0.88)",borderTop:"1px solid rgba(255,255,255,0.12)"}}>
                          <Onda picos={od} c={c} anchoPx={anchoPx} alto={ALTO_V-FOTOS_V-4} color={c.silencio||pi.muda ? "rgba(160,160,160,0.5)" : "rgba(96,165,250,0.95)"}/></div>
                      : <Onda picos={od} c={c} anchoPx={anchoPx} alto={ALTO_A-6} color={c.silencio||pi.muda ? "rgba(160,160,160,0.5)" : "rgba(74,222,128,0.9)"}/>;
                    return (
                      <div key={c.id} onMouseDown={e=>arrastrarClip(e, c, pi, "mover")} title={c.nombre}
                        style={{position:"absolute",left:c.en*zoom,width:Math.max(4,largo(c)*zoom),top:0,bottom:0,borderRadius:6,overflow:"hidden",cursor:"grab",
                          border:"2px solid "+(elegido?"var(--gold)":"rgba(255,255,255,0.15)"),
                          background: pi.tipo==="video" ? (c.mini ? `#1b2a3a url("${fileUrl(c.mini)}") left top/auto ${FOTOS_V}px repeat-x` : "#1b2a3a") : (c.silencio?"#3a2a2a":"#1f3a2a"),
                          opacity: c.silencio ? 0.55 : 1}}>
                        {onda}
                        <div style={{position:"absolute",left:4,top:2,right:4,fontSize:10.5,fontWeight:700,color:"#fff",textShadow:"0 1px 2px #000",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.nombre}</div>
                        {pi.tipo==="video" && <div style={{position:"absolute",right:6,top:FOTOS_V-16,fontSize:9.5,color:"#ddd",textShadow:"0 1px 2px #000"}}>{corto(largo(c))}</div>}
                        <div onMouseDown={e=>arrastrarClip(e, c, pi, "izq")} style={{position:"absolute",left:0,top:0,bottom:0,width:7,cursor:"ew-resize",background:elegido?"rgba(212,175,55,0.65)":"transparent"}}/>
                        <div onMouseDown={e=>arrastrarClip(e, c, pi, "der")} style={{position:"absolute",right:0,top:0,bottom:0,width:7,cursor:"ew-resize",background:elegido?"rgba(212,175,55,0.65)":"transparent"}}/>
                      </div>);
                  })}
                  {pi.id==="v1" && !pi.clips.length && <div style={{position:"absolute",left:8,top:22,fontSize:12,color:"var(--text-3)",pointerEvents:"none"}}>Arrastra aquí clips de la biblioteca (o pulsa ＋)</div>}
                </div>))}
              {(p.marcadores||[]).map(m=><div key={"l"+m} style={{position:"absolute",left:20+m*zoom,top:24,bottom:0,width:1,background:"rgba(96,165,250,0.5)",pointerEvents:"none"}}/>)}
              <div style={{position:"absolute",left:20 + t*zoom,top:0,bottom:0,width:2,background:"var(--gold)",boxShadow:"0 0 6px var(--gold)",pointerEvents:"none"}}>
                <div style={{position:"absolute",top:-1,left:-5,width:12,height:10,background:"var(--gold)",clipPath:"polygon(0 0,100% 0,50% 100%)"}}/>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>);
}
