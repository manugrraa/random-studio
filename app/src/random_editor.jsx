import React from "react";
import { useTarea, PanelTarea } from "./clon";
const { useState, useEffect, useRef, useMemo, useCallback } = React;

/* ================================ RandomEditor (v3.11) ================================
   26/10, él: "un apartado que sea RandomEditor, una copia de CapCut en lo que es los elementos
   básicos de copiar, pegar, cortar, etc. Yo sé editar bien". Como CapCut:
   - la pista PRINCIPAL es magnética (los clips van seguidos, sin huecos); las pistas de audio
     (música, SFX) son libres
   - Ctrl+B divide en el cabezal, Q/W borran a la izquierda/derecha del cabezal, Supr elimina,
     Ctrl+C/X/V/D copiar/cortar/pegar/duplicar, Ctrl+Z/Ctrl+Shift+Z deshacer/rehacer, N el imán,
     arrastrar mueve, los bordes recortan
   - la biblioteca son sus Clips Recortados, la música de la Biblioteca y cualquier archivo
   - exporta él mismo (clon.py exportar) a Shorts Listos/RandomEditor o como clip recortado
   La guía de atajos está en Configuración (ATAJOS_EDITOR). */

export const ATAJOS_EDITOR = [
  ["Espacio", "Reproducir / pausar"],
  ["Ctrl+B", "Dividir en el cabezal (lo elegido, o la pista principal)"],
  ["Q", "Borrar a la izquierda del cabezal"],
  ["W", "Borrar a la derecha del cabezal"],
  ["Supr / Retroceso", "Eliminar lo elegido (la principal se cierra sola)"],
  ["Ctrl+C", "Copiar"], ["Ctrl+X", "Cortar"], ["Ctrl+V", "Pegar en el cabezal"], ["Ctrl+D", "Duplicar"],
  ["Ctrl+A", "Elegir todo"], ["Esc", "Quitar la selección"],
  ["Ctrl+Z", "Deshacer"], ["Ctrl+Shift+Z / Ctrl+Y", "Rehacer"],
  ["← / →", "Un fotograma atrás / adelante"], ["Shift+← / →", "Un segundo atrás / adelante"],
  ["↑ / ↓", "Al corte anterior / siguiente"], ["Inicio / Fin", "Al principio / al final"],
  ["Ctrl++ / Ctrl+-", "Acercar / alejar la línea de tiempo (o Ctrl+rueda)"], ["Shift+Z", "Ver toda la línea de tiempo"],
  ["N", "Imán (encajar con el cabezal y los bordes) sí/no"], ["M", "Silenciar / devolver el sonido de lo elegido"],
  ["Ctrl+S", "Guardar el proyecto"], ["Ctrl+E", "Exportar"],
  ["Clic / Shift+clic", "Elegir un clip / añadir a la selección"],
  ["Arrastrar un clip", "Moverlo (en la principal, cambia el orden)"],
  ["Arrastrar un borde", "Recortar el clip"],
];

const fileUrl = p => p ? "file:///" + p.replace(/\\/g,"/").split("/").map(encodeURIComponent).join("/").replace(/^([A-Za-z])%3A/,"$1:") : null;
const t2s = t => { t = Math.max(0, t||0); const m = Math.floor(t/60); return m + ":" + (t%60).toFixed(2).padStart(5,"0"); };
const uid = () => Math.random().toString(36).slice(2, 10);
const boton = (activo, peligro) => ({fontSize:12.5,fontWeight:600,padding:"7px 11px",borderRadius:9,border:"1px solid "+(peligro?"rgba(248,113,113,0.45)":"var(--border)"),
  color: activo?"#000":(peligro?"var(--red)":"var(--text-2)"), background: activo?"var(--gold)":"transparent", cursor:"pointer", whiteSpace:"nowrap"});
const largo = c => c.hasta - c.desde;
const fin = c => c.en + largo(c);
const LIENZOS = { vertical:[1080,1920,"9:16"], horizontal:[1920,1080,"16:9"] };

const nuevoProyecto = () => ({ nombre:"", formato:"vertical", ancho:1080, alto:1920, fps:30, pistas:[
  { id:"v1", tipo:"video", nombre:"Principal", clips:[] },
  { id:"a1", tipo:"audio", nombre:"Música", clips:[] },
]});

// la principal, magnética: cada clip empieza donde acaba el anterior (en su orden)
const cerrar = pista => {
  if(pista.tipo!=="video" || pista.id!=="v1") return pista;
  let t = 0;
  return { ...pista, clips: [...pista.clips].sort((a,b)=>a.en-b.en).map(c=>{ const n = {...c, en:t}; t += largo(c); return n; }) };
};
const conPistas = (p, f) => ({ ...p, pistas: f(p.pistas).map(cerrar) });

async function consultar(args) {
  const r = await window.studioFS.clonConsultar(args);
  if (r.error) throw new Error(r.error);
  return r.eventos || [];
}

export function RandomEditorView({ toast }) {
  const enPC = !!(window.studioFS && window.studioFS.redGuardar);
  const [p, setP] = useState(nuevoProyecto);
  const [pasado, setPasado] = useState([]);
  const [futuro, setFuturo] = useState([]);
  const [sel, setSel] = useState(()=>new Set());
  const [clip, setClip] = useState([]);              // el portapapeles
  const [t, setT] = useState(0);
  const [jugando, setJugando] = useState(false);
  const [zoom, setZoom] = useState(30);              // px por segundo
  const [iman, setIman] = useState(true);
  const [medios, setMedios] = useState(null);
  const [pestana, setPestana] = useState("clips");
  const [busca, setBusca] = useState("");
  const [proyectos, setProyectos] = useState([]);
  const [sucio, setSucio] = useState(false);
  const vid = useRef(null);
  const auds = useRef({});
  const linea = useRef(null);
  const nombreRef = useRef(null);
  const reloj = useRef(null);
  const estado = useRef({}); estado.current = { p, t, sel, jugando, zoom, iman, clip };

  const [tarea, lanzar, cerrarTarea] = useTarea(ev=>{ if(!ev.codigo) toast && toast("Exportado: lo tienes en Shorts Listos/RandomEditor (o en Clips, si lo mandaste como clip)"); });

  useEffect(()=>{ if(!enPC) return;
    consultar(["redmedios"]).then(ev=>setMedios(ev.find(e=>e.evento==="hecho"))).catch(e=>toast && toast(e.message));
    window.studioFS.redLista().then(r=>setProyectos(r.lista||[]));
  },[]);

  // ---- historial
  const cambiar = (f, quitarSel) => {
    setPasado(h=>[...h.slice(-60), p]); setFuturo([]);
    setP(prev=>f(prev)); setSucio(true);
    if(quitarSel) setSel(new Set());
  };
  const deshacer = () => { if(!pasado.length) return; setFuturo(f=>[p, ...f]); setP(pasado[pasado.length-1]); setPasado(h=>h.slice(0,-1)); };
  const rehacer = () => { if(!futuro.length) return; setPasado(h=>[...h, p]); setP(futuro[0]); setFuturo(f=>f.slice(1)); };

  const todos = useMemo(()=>p.pistas.flatMap(pi=>pi.clips.map(c=>({...c, pista:pi.id}))),[p]);
  const total = useMemo(()=>Math.max(0, ...p.pistas.flatMap(pi=>pi.clips.map(fin))),[p]);
  const v1 = p.pistas.find(x=>x.id==="v1");
  const cortes = useMemo(()=>[...new Set([0, ...todos.flatMap(c=>[c.en, fin(c)])])].sort((a,b)=>a-b),[todos]);

  // ---- meter medios
  const meter = async (m, tipo) => {
    let dur = m.dur;
    if(dur==null){
      try { const ev = await consultar(["redinfo", m.ruta]); const a = (ev.find(e=>e.evento==="hecho")||{}).archivos[0]; dur = a.dur; if(a.video===false) tipo = "audio"; }
      catch(e){ toast && toast(e.message); return; }
    }
    const c = { id:uid(), ruta:m.ruta, nombre:m.nombre, mini:m.mini, desde:0, hasta:dur, dur_src:dur, en:0, vol:1, silencio:false };
    if(tipo==="video"){
      cambiar(prev=>conPistas(prev, ps=>ps.map(pi=>pi.id!=="v1" ? pi : {...pi, clips:[...pi.clips, {...c, en: Math.max(0,...pi.clips.map(fin))}]})));
      toast && toast("Añadido al final de la pista principal");
    } else {
      // en el cabezal; si choca con algo de la pista de audio, a una pista nueva
      cambiar(prev=>{
        const en = estado.current.t;
        const libre = prev.pistas.find(pi=>pi.tipo==="audio" && !pi.clips.some(x=>en < fin(x) && en + dur > x.en));
        const ps = libre ? prev.pistas.map(pi=>pi.id!==libre.id ? pi : {...pi, clips:[...pi.clips, {...c, en}]})
                         : [...prev.pistas, { id:"a"+uid(), tipo:"audio", nombre:"Audio "+(prev.pistas.filter(x=>x.tipo==="audio").length+1), clips:[{...c, en}] }];
        return {...prev, pistas: ps};
      });
    }
  };
  const meterArchivos = async () => {
    const rs = await window.studioFS.redElegirArchivos();
    for(const r of rs){
      try {
        const ev = await consultar(["redinfo", r]);
        const a = (ev.find(e=>e.evento==="hecho")||{}).archivos[0];
        await meter({ruta:r, nombre:a.nombre, dur:a.dur}, a.video ? "video" : "audio");
      } catch(e){ toast && toast(e.message); }
    }
  };

  // ---- operaciones (sobre lo elegido; si no hay nada, lo que pisa el cabezal en la principal)
  const objetivos = (tt) => {
    const s = estado.current.sel;
    const bajo = todos.filter(c=>tt > c.en + 0.01 && tt < fin(c) - 0.01);
    const elegidos = bajo.filter(c=>s.has(c.id));
    return elegidos.length ? elegidos : bajo.filter(c=>c.pista==="v1");
  };
  const dividir = () => {
    const tt = estado.current.t, ob = objetivos(tt); if(!ob.length) return;
    const ids = new Set(ob.map(c=>c.id));
    cambiar(prev=>conPistas(prev, ps=>ps.map(pi=>({...pi, clips: pi.clips.flatMap(c=>{
      if(!ids.has(c.id)) return [c];
      const k = c.desde + (tt - c.en);
      return [{...c, hasta:k}, {...c, id:uid(), desde:k, en:tt}];
    })}))));
  };
  const borrarLado = (izq) => {
    const tt = estado.current.t, ob = objetivos(tt); if(!ob.length) return;
    const ids = new Set(ob.map(c=>c.id));
    cambiar(prev=>conPistas(prev, ps=>ps.map(pi=>({...pi, clips: pi.clips.map(c=>{
      if(!ids.has(c.id)) return c;
      const k = c.desde + (tt - c.en);
      return izq ? {...c, desde:k, en: pi.id==="v1" ? c.en : tt} : {...c, hasta:k};
    })}))));
    if(izq){ const c0 = ob.find(c=>c.pista==="v1"); if(c0) setTimeout(()=>ir(c0.en), 0); }
  };
  const eliminar = () => {
    const s = estado.current.sel; if(!s.size) return;
    cambiar(prev=>conPistas(prev, ps=>ps.map(pi=>({...pi, clips: pi.clips.filter(c=>!s.has(c.id))}))), true);
  };
  const copiar = (y_cortar) => {
    const s = estado.current.sel; if(!s.size) return;
    setClip(todos.filter(c=>s.has(c.id)).sort((a,b)=>a.en-b.en));
    toast && toast(`${s.size} clip${s.size!==1?"s":""} ${y_cortar?"cortado":"copiado"}${s.size!==1?"s":""}`);
    if(y_cortar) eliminar();
  };
  const pegar = (despuesDe) => {
    const cs = despuesDe || estado.current.clip; if(!cs.length) return;
    const tt = estado.current.t;
    const nuevos = new Set();
    cambiar(prev=>{
      let ps = prev.pistas;
      const base = Math.min(...cs.map(c=>c.en));
      cs.forEach(c=>{
        const n = {...c, id:uid()}; nuevos.add(n.id); delete n.pista;
        if(c.pista==="v1"){
          // en la principal: detrás del clip que pisa el cabezal (al cerrar, todo se corre solo)
          const pi = ps.find(x=>x.id==="v1");
          const cubre = pi.clips.find(x=>tt > x.en && tt < fin(x));
          const pos = despuesDe ? fin(c) - 0.001 : (cubre ? fin(cubre) - 0.001 : tt - 0.001);
          n.en = pos + nuevos.size * 0.00001;
          ps = ps.map(x=>x.id!=="v1" ? x : {...x, clips:[...x.clips, n]});
        } else {
          n.en = despuesDe ? fin(c) : tt + (c.en - base);
          const misma = ps.find(x=>x.id===c.pista && !x.clips.some(y=>n.en < fin(y) && fin(n) > y.en));
          const libre = misma || ps.find(x=>x.tipo==="audio" && !x.clips.some(y=>n.en < fin(y) && fin(n) > y.en));
          ps = libre ? ps.map(x=>x.id!==libre.id ? x : {...x, clips:[...x.clips, n]})
                     : [...ps, { id:"a"+uid(), tipo:"audio", nombre:"Audio "+(ps.filter(x=>x.tipo==="audio").length+1), clips:[n] }];
        }
      });
      return conPistas({...prev, pistas: ps}, x=>x);
    });
    setTimeout(()=>setSel(nuevos), 0);
  };
  const duplicar = () => { const s = estado.current.sel; if(!s.size) return; pegar(todos.filter(c=>s.has(c.id)).sort((a,b)=>a.en-b.en)); };
  const silenciar = () => {
    const s = estado.current.sel; if(!s.size) return;
    const todosMudos = todos.filter(c=>s.has(c.id)).every(c=>c.silencio);
    cambiar(prev=>({...prev, pistas: prev.pistas.map(pi=>({...pi, clips: pi.clips.map(c=>s.has(c.id) ? {...c, silencio:!todosMudos} : c)}))}));
  };
  const ponerVol = (v) => {
    const s = estado.current.sel;
    setP(prev=>({...prev, pistas: prev.pistas.map(pi=>({...pi, clips: pi.clips.map(c=>s.has(c.id) ? {...c, vol:v} : c)}))})); setSucio(true);
  };

  // ---- reproducción: un reloj y cada elemento sigue a su clip
  const ir = (tt) => { tt = Math.max(0, Math.min(total || 0, tt)); setT(tt); sincronizar(tt, false); };
  const sincronizar = (tt, play) => {
    const v = vid.current;
    const c = (v1 ? v1.clips : []).find(x=>tt >= x.en && tt < fin(x));
    if(v){
      if(!c){ if(!v.paused) v.pause(); v.style.visibility = "hidden"; }
      else {
        v.style.visibility = "visible";
        const url = fileUrl(c.ruta);
        if(v.dataset.ruta !== c.ruta){ v.dataset.ruta = c.ruta; v.src = url; }
        const local = c.desde + (tt - c.en);
        if(Math.abs(v.currentTime - local) > (play ? 0.25 : 0.02)) { try { v.currentTime = local; } catch(e){} }
        v.volume = c.silencio ? 0 : Math.min(1, c.vol);
        if(play && v.paused) v.play().catch(()=>{});
        if(!play && !v.paused) v.pause();
      }
    }
    p.pistas.filter(pi=>pi.tipo==="audio").forEach(pi=>{
      let a = auds.current[pi.id];
      if(!a){ a = new Audio(); auds.current[pi.id] = a; }
      const c2 = pi.clips.find(x=>tt >= x.en && tt < fin(x));
      if(!c2){ if(!a.paused) a.pause(); return; }
      if(a.dataset.ruta !== c2.ruta){ a.dataset.ruta = c2.ruta; a.src = fileUrl(c2.ruta); }
      const local = c2.desde + (tt - c2.en);
      if(Math.abs(a.currentTime - local) > (play ? 0.3 : 0.05)) { try { a.currentTime = local; } catch(e){} }
      a.volume = c2.silencio ? 0 : Math.min(1, c2.vol);
      if(play && a.paused) a.play().catch(()=>{});
      if(!play && !a.paused) a.pause();
    });
  };
  const jugar = () => {
    if(estado.current.jugando){ setJugando(false); return; }
    if(t >= total - 0.05) setT(0);
    setJugando(true);
  };
  useEffect(()=>{
    if(!jugando){ sincronizar(t, false); cancelAnimationFrame(reloj.current); return; }
    let ant = performance.now(), tt = t >= total - 0.05 ? 0 : t;
    const paso = ahora => {
      tt += (ahora - ant) / 1000; ant = ahora;
      if(tt >= total){ setT(total); setJugando(false); return; }
      setT(tt); sincronizar(tt, true);
      reloj.current = requestAnimationFrame(paso);
    };
    reloj.current = requestAnimationFrame(paso);
    return ()=>cancelAnimationFrame(reloj.current);
  },[jugando, p]);
  useEffect(()=>()=>{ Object.values(auds.current).forEach(a=>{ try { a.pause(); a.src=""; } catch(e){} }); },[]);

  // ---- guardar / abrir / exportar
  const guardar = async () => {
    let nombre = p.nombre;
    // (Electron no tiene window.prompt: el nombre se escribe arriba)
    if(!nombre.trim()){ toast && toast("Ponle un nombre al proyecto (arriba a la izquierda)"); nombreRef.current && nombreRef.current.focus(); return null; }
    const r = await window.studioFS.redGuardar({...p, nombre});
    if(r.error){ toast && toast(r.error); return null; }
    setP(x=>({...x, nombre:r.nombre})); setSucio(false);
    window.studioFS.redLista().then(x=>setProyectos(x.lista||[]));
    toast && toast("Proyecto guardado");
    return r.ruta;
  };
  const abrir = async (nombre) => {
    if(sucio && !window.confirm("Hay cambios sin guardar en este proyecto. ¿Abrir otro igualmente?")) return;
    const r = await window.studioFS.redAbrir(nombre);
    if(r.error){ toast && toast(r.error); return; }
    setP(r.proyecto); setPasado([]); setFuturo([]); setSel(new Set()); setT(0); setSucio(false);
  };
  const nuevo = () => { if(sucio && !window.confirm("Hay cambios sin guardar. ¿Empezar un proyecto nuevo?")) return; setP(nuevoProyecto()); setPasado([]); setFuturo([]); setSel(new Set()); setT(0); setSucio(false); };
  const exportar = async (como) => {
    if(!v1 || !v1.clips.length){ toast && toast("La pista principal está vacía"); return; }
    const ruta = await guardar(); if(!ruta) return;
    let nombreClip = null;
    if(como==="clip") nombreClip = p.nombre;          // el clip se llama como el proyecto (lo puedes renombrar en Clips)
    try { await lanzar(["exportar", ruta, como, ...(nombreClip ? [nombreClip] : [])]); }
    catch(e){ toast && toast(e.message); }
  };
  const cambiarFormato = f => { const [w,h] = LIENZOS[f]; cambiar(prev=>({...prev, formato:f, ancho:w, alto:h})); };

  // ---- atajos (los de CapCut)
  useEffect(()=>{
    const h = e => {
      if(/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||"")) return;
      const k = e.key, ctrl = e.ctrlKey || e.metaKey;
      const fps = estado.current.p.fps || 30, tt = estado.current.t;
      const hecho = () => { e.preventDefault(); e.stopImmediatePropagation(); };   // que no deshaga también la planificación
      if(k===" "){ hecho(); jugar(); }
      else if(ctrl && (k==="b"||k==="B")){ hecho(); dividir(); }
      else if(!ctrl && (k==="q"||k==="Q")){ hecho(); borrarLado(true); }
      else if(!ctrl && (k==="w"||k==="W")){ hecho(); borrarLado(false); }
      else if(k==="Delete"||k==="Backspace"){ hecho(); eliminar(); }
      else if(ctrl && (k==="c"||k==="C")){ hecho(); copiar(false); }
      else if(ctrl && (k==="x"||k==="X")){ hecho(); copiar(true); }
      else if(ctrl && (k==="v"||k==="V")){ hecho(); pegar(); }
      else if(ctrl && (k==="d"||k==="D")){ hecho(); duplicar(); }
      else if(ctrl && (k==="a"||k==="A")){ hecho(); setSel(new Set(todos.map(c=>c.id))); }
      else if(ctrl && e.shiftKey && (k==="z"||k==="Z")){ hecho(); rehacer(); }
      else if(ctrl && (k==="y"||k==="Y")){ hecho(); rehacer(); }
      else if(ctrl && (k==="z"||k==="Z")){ hecho(); deshacer(); }
      else if(ctrl && (k==="s"||k==="S")){ hecho(); guardar(); }
      else if(ctrl && (k==="e"||k==="E")){ hecho(); exportar("listos"); }
      else if(ctrl && (k==="+"||k==="=")){ hecho(); setZoom(z=>Math.min(400, z*1.4)); }
      else if(ctrl && (k==="-"||k==="_")){ hecho(); setZoom(z=>Math.max(0.5, z/1.4)); }
      else if(e.shiftKey && (k==="z"||k==="Z")){ hecho(); ajustar(); }
      else if(k==="Escape"){ hecho(); setSel(new Set()); }
      else if(!ctrl && (k==="n"||k==="N")){ hecho(); setIman(x=>!x); toast && toast(estado.current.iman ? "Imán apagado" : "Imán encendido"); }
      else if(!ctrl && (k==="m"||k==="M")){ hecho(); silenciar(); }
      else if(k==="ArrowLeft"){ hecho(); setJugando(false); ir(tt - (e.shiftKey ? 1 : 1/fps)); }
      else if(k==="ArrowRight"){ hecho(); setJugando(false); ir(tt + (e.shiftKey ? 1 : 1/fps)); }
      else if(k==="ArrowUp"){ hecho(); const c = [...cortes].reverse().find(x=>x < tt - 0.01); ir(c ?? 0); }
      else if(k==="ArrowDown"){ hecho(); const c = cortes.find(x=>x > tt + 0.01); ir(c ?? total); }
      else if(k==="Home"){ hecho(); ir(0); }
      else if(k==="End"){ hecho(); ir(total); }
    };
    window.addEventListener("keydown", h, true);
    return ()=>window.removeEventListener("keydown", h, true);
  });
  const ajustar = () => { const w = linea.current ? linea.current.clientWidth - 40 : 900; setZoom(Math.max(0.5, Math.min(400, w / Math.max(5, total)))); };

  // ---- línea de tiempo: arrastrar clips y bordes
  const encaje = (x, ignorar) => {
    if(!estado.current.iman) return x;
    const umbral = 8 / estado.current.zoom;
    const puntos = [estado.current.t, ...todos.filter(c=>c.id!==ignorar).flatMap(c=>[c.en, fin(c)])];
    let mejor = x, d = umbral;
    puntos.forEach(q=>{ if(Math.abs(q - x) < d){ d = Math.abs(q - x); mejor = q; } });
    return mejor;
  };
  const arrastrarClip = (e, c, pista, modo) => {
    e.stopPropagation(); e.preventDefault();
    if(e.shiftKey){ setSel(s=>{ const n = new Set(s); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; }); }
    else if(!sel.has(c.id)) setSel(new Set([c.id]));
    const x0 = e.clientX, inicial = p;
    setPasado(h=>[...h.slice(-60), p]); setFuturo([]);
    const mover = ev => {
      const dt = (ev.clientX - x0) / estado.current.zoom;
      setSucio(true);
      setP(()=>conPistas(inicial, ps=>ps.map(pi=>pi.id!==pista.id ? pi : {...pi, clips: pi.clips.map(y=>{
        if(y.id!==c.id) return y;
        if(modo==="izq"){
          let desde = Math.max(0, Math.min(y.hasta - 0.1, y.desde + dt));
          if(pista.id==="v1") return {...y, desde};                 // la principal se cierra sola
          const en = encaje(y.en + (desde - y.desde), y.id);        // en audio, el clip no se mueve: se come su principio
          desde = Math.max(0, Math.min(y.hasta - 0.1, y.desde + (en - y.en)));
          return {...y, desde, en: y.en + (desde - y.desde)};
        }
        if(modo==="der"){
          let hasta = Math.max(y.desde + 0.1, Math.min(y.dur_src ?? 1e9, y.hasta + dt));
          if(pista.id!=="v1"){ const f2 = encaje(y.en + (hasta - y.desde), y.id); hasta = Math.max(y.desde + 0.1, Math.min(y.dur_src ?? 1e9, y.desde + (f2 - y.en))); }
          return {...y, hasta};
        }
        // mover: en la principal cambia el orden (por el centro), en audio se coloca libre
        if(pista.id==="v1") return {...y, en: y.en + dt + (dt>0 ? 0.001 : -0.001)};
        return {...y, en: Math.max(0, encaje(y.en + dt, y.id))};
      })})));
    };
    const soltar = () => { window.removeEventListener("mousemove", mover); window.removeEventListener("mouseup", soltar); };
    window.addEventListener("mousemove", mover); window.addEventListener("mouseup", soltar);
  };
  const arrastrarCabezal = e => {
    const r = linea.current.getBoundingClientRect();
    const a = ev => { setJugando(false); ir((ev.clientX - r.left + linea.current.scrollLeft - 20) / zoom); };
    a(e);
    if(!e.shiftKey) setSel(new Set());
    const soltar = () => { window.removeEventListener("mousemove", a); window.removeEventListener("mouseup", soltar); };
    window.addEventListener("mousemove", a); window.addEventListener("mouseup", soltar);
  };
  const rueda = e => { if(e.ctrlKey){ e.preventDefault(); setZoom(z=>Math.max(0.5, Math.min(400, z * (e.deltaY < 0 ? 1.15 : 1/1.15)))); } };

  if(!enPC) return <div style={{padding:"18px 20px",border:"1px dashed var(--border)",borderRadius:14,color:"var(--text-2)",fontSize:13.5}}>El RandomEditor funciona en el PC: ábrelo desde RandomStudio de escritorio.</div>;

  const ancho = Math.max(1, total + 10) * zoom + 40;
  const paso = zoom > 120 ? 1 : zoom > 40 ? 2 : zoom > 15 ? 5 : zoom > 6 ? 10 : zoom > 2 ? 30 : 60;
  const elegidos = todos.filter(c=>sel.has(c.id));
  const lista = medios ? (pestana==="clips" ? medios.clips : medios.musica).filter(m=>!busca.trim() || m.nombre.toLowerCase().includes(busca.toLowerCase())) : [];
  const [W, H] = [p.ancho, p.alto];
  return (
    <div className="fade-in" style={{display:"flex",flexDirection:"column",gap:12}}>
      {/* barra del proyecto */}
      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
        <input ref={nombreRef} value={p.nombre} onChange={e=>{ setP(x=>({...x, nombre:e.target.value})); setSucio(true); }} placeholder="Nombre del proyecto"
          style={{flex:"1 1 200px",minWidth:0,maxWidth:340,fontSize:13.5,fontWeight:650,padding:"8px 11px",borderRadius:9,border:"1px solid var(--border)",background:"var(--bg-2)",color:"var(--text)"}}/>
        {sucio && <span style={{fontSize:11.5,color:"var(--gold)"}}>sin guardar</span>}
        <button onClick={nuevo} style={boton(false)}>Nuevo</button>
        <select value="" onChange={e=>e.target.value && abrir(e.target.value)} style={{...boton(false),background:"var(--bg-2)"}}>
          <option value="">Abrir…</option>
          {proyectos.map(x=><option key={x.nombre} value={x.nombre}>{x.nombre}</option>)}
        </select>
        <button onClick={guardar} style={boton(false)} title="Ctrl+S">Guardar</button>
        <span style={{width:1,height:22,background:"var(--border)"}}/>
        {Object.entries(LIENZOS).map(([k,[w,h,et]])=><button key={k} onClick={()=>cambiarFormato(k)} style={boton(p.formato===k)}>{et}</button>)}
        <span style={{marginLeft:"auto"}}/>
        <button onClick={()=>exportar("clip")} disabled={!!(tarea&&!tarea.cerrada)} style={boton(false)} title="Lo exporta como un clip recortado nuevo (aprobado) para montarlo con el clon">Exportar como clip</button>
        <button onClick={()=>exportar("listos")} disabled={!!(tarea&&!tarea.cerrada)} style={boton(true)} title="Ctrl+E · a Shorts Listos/RandomEditor">Exportar</button>
      </div>
      <PanelTarea tarea={tarea} onCerrar={cerrarTarea}/>

      <div style={{display:"grid",gridTemplateColumns:"minmax(0,330px) minmax(0,1fr) minmax(0,240px)",gap:12,alignItems:"stretch",minHeight:360}}>
        {/* biblioteca */}
        <div style={{border:"1px solid var(--border)",borderRadius:12,background:"var(--bg-2)",display:"flex",flexDirection:"column",minHeight:0,maxHeight:460}}>
          <div style={{display:"flex",gap:4,padding:8,borderBottom:"1px solid var(--border)"}}>
            {[["clips","Clips"],["musica","Música"]].map(([k,l])=><button key={k} onClick={()=>setPestana(k)} style={{...boton(pestana===k),flex:1}}>{l}</button>)}
            <button onClick={meterArchivos} style={boton(false)} title="Cualquier vídeo o audio del disco">＋ Archivo</button>
          </div>
          <input value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Buscar…" style={{margin:8,fontSize:12.5,padding:"6px 9px",borderRadius:8,border:"1px solid var(--border)",background:"var(--bg)",color:"var(--text)"}}/>
          <div style={{overflowY:"auto",flex:1,padding:"0 8px 8px",display:"flex",flexDirection:"column",gap:5}}>
            {!medios && <div style={{fontSize:12.5,color:"var(--text-3)",padding:8}}>Cargando la biblioteca…</div>}
            {lista.slice(0,300).map(m=>(
              <div key={m.ruta} style={{display:"flex",gap:8,alignItems:"center",padding:5,borderRadius:8,border:"1px solid var(--border)"}}>
                {pestana==="clips" && <div style={{width:34,height:60,borderRadius:5,background:m.mini?`#111 url("${fileUrl(m.mini)}") center/cover`:"#111",flexShrink:0}}/>}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={m.nombre}>{m.nombre}</div>
                  <div style={{fontSize:10.5,color:"var(--text-3)"}}>{m.dur!=null ? t2s(m.dur).replace(/\.\d+$/,"") : (m.carpeta||"")}{pestana==="musica" && m.segura ? " · sin copyright" : ""}</div>
                </div>
                <button onClick={()=>meter(m, pestana==="clips"?"video":"audio")} title={pestana==="clips"?"Al final de la pista principal":"En el cabezal, en una pista de audio"} style={{...boton(false),padding:"4px 9px"}}>＋</button>
              </div>))}
          </div>
        </div>
        {/* previsualización */}
        <div style={{border:"1px solid var(--border)",borderRadius:12,background:"#000",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:10,gap:8,minHeight:0}}>
          <div style={{position:"relative",height:p.formato==="vertical"?400:"auto",width:p.formato==="vertical"?400*W/H:"100%",aspectRatio:`${W}/${H}`,maxWidth:"100%",background:"#000"}}>
            <video ref={vid} muted={false} playsInline style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"contain"}}/>
          </div>
          <div style={{display:"flex",gap:10,alignItems:"center",fontSize:13}}>
            <button onClick={()=>ir(0)} style={boton(false)} title="Inicio">⏮</button>
            <button onClick={jugar} style={boton(jugando)} title="Espacio">{jugando ? "❚❚" : "▶"}</button>
            <span style={{fontFamily:"monospace",color:"var(--gold)"}}>{t2s(t)}</span><span style={{color:"var(--text-3)",fontFamily:"monospace"}}>/ {t2s(total)}</span>
          </div>
        </div>
        {/* inspector */}
        <div style={{border:"1px solid var(--border)",borderRadius:12,background:"var(--bg-2)",padding:12,display:"flex",flexDirection:"column",gap:10,fontSize:12.5}}>
          <b style={{fontSize:13}}>{elegidos.length ? `${elegidos.length} elegido${elegidos.length!==1?"s":""}` : "Nada elegido"}</b>
          {elegidos.length===1 && <div style={{color:"var(--text-2)",lineHeight:1.6}}>
            <div style={{overflowWrap:"anywhere"}}>{elegidos[0].nombre}</div>
            <div>Del {t2s(elegidos[0].desde)} al {t2s(elegidos[0].hasta)} del archivo</div>
            <div>En la línea: {t2s(elegidos[0].en)} → {t2s(fin(elegidos[0]))}</div>
          </div>}
          {elegidos.length>0 && <>
            <label style={{display:"flex",flexDirection:"column",gap:4}}>Volumen · {Math.round((elegidos[0].vol??1)*100)}%
              <input type="range" min={0} max={2} step={0.05} value={elegidos[0].vol??1} onChange={e=>ponerVol(Number(e.target.value))}/></label>
            <button onClick={silenciar} style={boton(elegidos.every(c=>c.silencio))} title="M">{elegidos.every(c=>c.silencio) ? "🔇 Silenciado" : "🔊 Silenciar"}</button>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              <button onClick={dividir} style={boton(false)} title="Ctrl+B">Dividir</button>
              <button onClick={duplicar} style={boton(false)} title="Ctrl+D">Duplicar</button>
              <button onClick={eliminar} style={boton(false,true)} title="Supr">Eliminar</button>
            </div>
          </>}
          <div style={{marginTop:"auto",color:"var(--text-3)",fontSize:11.5,lineHeight:1.5}}>Ctrl+B dividir · Q/W borrar izq./der. · Ctrl+C/X/V/D · Ctrl+Z · N imán. Todos los atajos, en Configuración.</div>
        </div>
      </div>

      {/* línea de tiempo */}
      <div style={{border:"1px solid var(--border)",borderRadius:12,background:"var(--bg-2)"}}>
        <div style={{display:"flex",gap:6,alignItems:"center",padding:"8px 10px",borderBottom:"1px solid var(--border)",flexWrap:"wrap"}}>
          <button onClick={deshacer} disabled={!pasado.length} style={{...boton(false),opacity:pasado.length?1:.4}} title="Ctrl+Z">↶</button>
          <button onClick={rehacer} disabled={!futuro.length} style={{...boton(false),opacity:futuro.length?1:.4}} title="Ctrl+Shift+Z">↷</button>
          <button onClick={dividir} style={boton(false)} title="Ctrl+B">✂ Dividir</button>
          <button onClick={()=>borrarLado(true)} style={boton(false)} title="Q">⇤ Borrar izq.</button>
          <button onClick={()=>borrarLado(false)} style={boton(false)} title="W">Borrar der. ⇥</button>
          <button onClick={eliminar} disabled={!sel.size} style={{...boton(false,true),opacity:sel.size?1:.4}} title="Supr">🗑</button>
          <span style={{width:1,height:22,background:"var(--border)"}}/>
          <button onClick={()=>setIman(x=>!x)} style={boton(iman)} title="N">🧲 Imán</button>
          <span style={{marginLeft:"auto",fontSize:12,color:"var(--text-3)",display:"flex",alignItems:"center",gap:6}}>
            <button onClick={()=>setZoom(z=>Math.max(0.5,z/1.4))} style={{...boton(false),padding:"3px 9px"}} title="Ctrl+-">−</button>
            <input type="range" min={0.5} max={400} step={0.5} value={zoom} onChange={e=>setZoom(Number(e.target.value))} style={{width:130}}/>
            <button onClick={()=>setZoom(z=>Math.min(400,z*1.4))} style={{...boton(false),padding:"3px 9px"}} title="Ctrl++">+</button>
            <button onClick={ajustar} style={{...boton(false),padding:"3px 9px"}} title="Shift+Z">Ajustar</button>
          </span>
        </div>
        <div ref={linea} onWheel={rueda} style={{overflowX:"auto",overflowY:"hidden",position:"relative"}}>
          <div style={{position:"relative",width:ancho,padding:"0 0 8px 20px",userSelect:"none"}}>
            {/* regla */}
            <div onMouseDown={arrastrarCabezal} style={{position:"relative",height:24,cursor:"pointer",borderBottom:"1px solid var(--border)"}}>
              {Array.from({length:Math.ceil((total+10)/paso)+1}, (_,i)=>i*paso).map(s=>(
                <div key={s} style={{position:"absolute",left:s*zoom,top:0,height:"100%",borderLeft:"1px solid var(--border)",paddingLeft:3,fontSize:10,color:"var(--text-3)"}}>{t2s(s).replace(/\.\d+$/,"")}</div>))}
            </div>
            {/* pistas */}
            {p.pistas.map(pi=>(
              <div key={pi.id} onMouseDown={arrastrarCabezal} style={{position:"relative",height:pi.tipo==="video"?64:42,marginTop:6,borderRadius:6,background:"rgba(255,255,255,0.025)"}}>
                <span style={{position:"absolute",left:-18,top:4,fontSize:9.5,color:"var(--text-3)",writingMode:"vertical-rl",transform:"rotate(180deg)"}}>{pi.tipo==="video"?"V":"A"}</span>
                {pi.clips.map(c=>{
                  const elegido = sel.has(c.id);
                  return (
                    <div key={c.id} onMouseDown={e=>arrastrarClip(e, c, pi, "mover")} title={c.nombre}
                      style={{position:"absolute",left:c.en*zoom,width:Math.max(4,largo(c)*zoom),top:0,bottom:0,borderRadius:6,overflow:"hidden",cursor:"grab",
                        border:"2px solid "+(elegido?"var(--gold)":"rgba(255,255,255,0.15)"),
                        background: pi.tipo==="video" ? (c.mini ? `#1b2a3a url("${fileUrl(c.mini)}") left center/auto 100% repeat-x` : "#1b2a3a") : (c.silencio?"#3a2a2a":"#24402f"),
                        opacity: c.silencio ? 0.55 : 1}}>
                      <div style={{position:"absolute",left:4,top:2,right:4,fontSize:10.5,fontWeight:700,color:"#fff",textShadow:"0 1px 2px #000",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        {c.silencio?"🔇 ":""}{c.nombre}</div>
                      <div style={{position:"absolute",left:4,bottom:2,fontSize:9.5,color:"#ddd",textShadow:"0 1px 2px #000"}}>{t2s(largo(c)).replace(/\.\d$/,"")}</div>
                      <div onMouseDown={e=>arrastrarClip(e, c, pi, "izq")} style={{position:"absolute",left:0,top:0,bottom:0,width:7,cursor:"ew-resize",background:elegido?"rgba(212,175,55,0.65)":"transparent"}}/>
                      <div onMouseDown={e=>arrastrarClip(e, c, pi, "der")} style={{position:"absolute",right:0,top:0,bottom:0,width:7,cursor:"ew-resize",background:elegido?"rgba(212,175,55,0.65)":"transparent"}}/>
                    </div>);
                })}
                {pi.tipo==="video" && !pi.clips.length && <div style={{position:"absolute",left:8,top:22,fontSize:12,color:"var(--text-3)"}}>Pista principal: mete clips desde la biblioteca (＋)</div>}
              </div>
            ))}
            {/* cabezal */}
            <div style={{position:"absolute",left:20 + t*zoom,top:0,bottom:0,width:2,background:"var(--gold)",boxShadow:"0 0 6px var(--gold)",pointerEvents:"none"}}>
              <div style={{position:"absolute",top:-1,left:-5,width:12,height:10,background:"var(--gold)",clipPath:"polygon(0 0,100% 0,50% 100%)"}}/>
            </div>
          </div>
        </div>
      </div>
    </div>);
}
