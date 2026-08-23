import React from "react";
import ReactDOM from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import "./styles.css";
const { useState, useEffect, useRef, useMemo, useCallback } = React;

const APP_VERSION = "2.7.0";

/* ============================ DATOS BASE ============================ */
/* Formatos v2 (23/8/2026): 8 formatos que resumen todo el contenido real del canal.
   Las claves son fijas (el clasificador las usa); las etiquetas y colores se pueden cambiar. */
const DEFAULT_FORMATS = {
  combates:  { label: "Combates",             color: "#ef4444", score: 95, ideal: ["Lun","Mie","Vie","Dom"] },
  jugadas:   { label: "Jugadas y momentos",   color: "#60a5fa", score: 90, ideal: ["Mar","Jue","Sab"] },
  cajas:     { label: "Cajas y regalos",      color: "#a78bfa", score: 92, ideal: ["Mar","Jue","Sab"] },
  retos:     { label: "Retos y dinámicas",    color: "#4ade80", score: 88, ideal: ["Lun","Mie","Sab"] },
  comunidad: { label: "Comunidad y preguntas", color: "#f472b6", score: 86, ideal: ["Mar","Jue","Dom"] },
  ropa:      { label: "Ropa y equipaciones",  color: "#22d3ee", score: 82, ideal: ["Mar","Vie"] },
  novedades: { label: "Novedades y eventos",  color: "#fb923c", score: 84, ideal: ["Lun","Sab","Dom"] },
  directos:  { label: "Directos",             color: "#D4AF37", score: 80, ideal: ["Vie","Sab","Dom"] },
};
const PALETTE = [
  // Rojos / corales
  "#ef4444","#f87171","#fb7185","#e11d48",
  // Naranjas / ámbar
  "#f97316","#fb923c","#fdba74","#ea580c",
  // Amarillos / dorados
  "#facc15","#fde047","#eab308","#D4AF37",
  // Limas / verdes
  "#a3e635","#84cc16","#4ade80","#22c55e","#16a34a",
  // Esmeralda / teal / cian
  "#10b981","#2dd4bf","#14b8a6","#22d3ee","#06b6d4",
  // Azules
  "#38bdf8","#60a5fa","#3b82f6","#2563eb","#1d4ed8",
  // Índigos / violetas
  "#818cf8","#6366f1","#a78bfa","#8b5cf6","#7c3aed",
  // Morados / fucsias / rosas
  "#c084fc","#a855f7","#d946ef","#e879f9","#f472b6","#ec4899",
  // Marrones / neutros
  "#b45309","#92400e","#a8a29e","#94a3b8","#64748b",
];

const STATUSES = {
  idea:       { label: "Idea", color: "#6B6B6B" },
  grabacion:  { label: "Grabado", color: "#fb923c" },
  edicion:    { label: "Editados", color: "#a78bfa" },
  programado: { label: "Programado", color: "#60a5fa" },
  publicado:  { label: "Publicado", color: "#4ade80" },
};
const CHECKLIST_TEMPLATE = [
  { id:"guion", label:"Guion / Gancho", done:false },
  { id:"grabacion", label:"Grabación", done:false },
  { id:"edicion", label:"Edición", done:false },
  { id:"miniatura", label:"Miniatura / Título", done:false },
  { id:"descripcion", label:"Descripción / Tags", done:false },
];
const DAYS = ["Lun","Mar","Mie","Jue","Vie","Sab","Dom"];
const DAY_FULL = { Lun:"Lunes", Mar:"Martes", Mie:"Miércoles", Jue:"Jueves", Vie:"Viernes", Sab:"Sábado", Dom:"Domingo" };

let _id = 100;
const uid = () => "v" + (++_id);
const clone = o => JSON.parse(JSON.stringify(o));
// Devuelve los pares [clave, formato] ordenados alfabéticamente por su etiqueta
const sortedFormats = (formats) => Object.entries(formats).sort((a,b)=>a[1].label.localeCompare(b[1].label, "es", {sensitivity:"base"}));

function makeVideo(opts={}, formats) {
  return {
    id: uid(),
    title: opts.title || "Nueva idea",
    // Sin formato por defecto: lo decide el clasificador o el usuario (antes se
    // colaba el primer formato de la lista y acababa todo como "Ropa")
    format: opts.format || "",
    type: opts.type || "short",
    status: opts.status || "idea",
    date: opts.date || null,
    time: opts.time || "22:00",
    checklist: clone(CHECKLIST_TEMPLATE),
    notes: opts.notes || "",
    description: opts.description || "",
    pinnedComment: opts.pinnedComment || "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    youtubeId: null,
    youtubeStatus: null,
    youtubeUrl: null,
  };
}

/* ============================ SEED ============================ */
const todayObj = new Date();
const Y = todayObj.getFullYear(), M = todayObj.getMonth();
const iso = (y,m,d) => `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;

const SEED = [
  makeVideo({title:"1v1 vs el suscriptor más nuevo", format:"competitivo", status:"programado", date:iso(Y,M,todayObj.getDate()), type:"short"}),
  makeVideo({title:"Abrí 10 bolsas doradas en 1 minuto", format:"cajas", status:"edicion", date:iso(Y,M,todayObj.getDate()+1), type:"short"}),
  makeVideo({title:"Reto: no puedes hablar antes de ganar", format:"retos", status:"grabacion", date:iso(Y,M,todayObj.getDate()+2), type:"short"}),
  makeVideo({title:"Mundial de equipaciones — capítulo 4", format:"competitivo", status:"idea", type:"largo"}),
  makeVideo({title:"Reacciono a los mejores clips de Rivals", format:"reacciones", status:"idea", type:"short"}),
  makeVideo({title:"¿Para qué sirve esta skin escondida?", format:"educativo", status:"idea", type:"short"}),
  makeVideo({title:"1 like = 1 caja (camino al millón)", format:"retos", status:"idea", type:"short"}),
];

/* ============================ ICONOS ============================ */
const Icon = ({d, size=18, fill="none", stroke="currentColor", sw=1.8, style}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={style}>{d}</svg>
);
const Icons = {
  calendar: <Icon d={<><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18M8 2v4M16 2v4"/></>}/>,
  kanban: <Icon d={<><rect x="3" y="3" width="6" height="18" rx="1"/><rect x="10" y="3" width="6" height="12" rx="1"/><rect x="17" y="3" width="4" height="8" rx="1"/></>}/>,
  tag: <Icon d={<><path d="M2 10V4a2 2 0 012-2h6l10 10-8 8L2 10z"/><circle cx="7" cy="7" r="1.4" fill="currentColor" stroke="none"/></>}/>,
  plus: <Icon d={<path d="M12 5v14M5 12h14"/>}/>,
  sparkle: <Icon d={<path d="M12 3l1.6 4.8L18 9.4l-4.4 1.6L12 16l-1.6-4.8L6 9.4l4.4-1.6z"/>}/>,
  x: <Icon d={<path d="M18 6L6 18M6 6l12 12"/>}/>,
  check: <Icon d={<path d="M20 6L9 17l-5-5"/>}/>,
  clock: <Icon d={<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>}/>,
  camera: <Icon d={<><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></>}/>,
  scissors: <Icon d={<><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.12 15.88M14.47 14.48L20 20M8.12 8.12L12 12"/></>}/>,
  short: <Icon d={<><rect x="7" y="2" width="10" height="20" rx="2.5"/><path d="M10.5 8.5l4 2.5-4 2.5z"/></>}/>,
  largo: <Icon d={<><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M10 9.5l5 2.5-5 2.5z"/></>}/>,
  live: <Icon d={<><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none"/></>}/>,
  gear: <Icon d={<><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z"/></>}/>,
  trash: <Icon d={<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>} size={16}/>,
  edit: <Icon d={<><path d="M17 3a2.85 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5z"/></>} size={14}/>,
  drag: <Icon d={<path d="M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01"/>} size={16}/>,
  expand: <Icon d={<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>} size={15}/>,
  collapse: <Icon d={<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>} size={15}/>,
  search: <Icon d={<><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></>} size={16}/>,
  copy: <Icon d={<><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 012-2h10"/></>} size={15}/>,
  restore: <Icon d={<><path d="M3 12a9 9 0 109-9 9 9 0 00-7.5 4M3 3v4h4"/></>} size={16}/>,
  inbox: <Icon d={<><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13l3.5 7v6a2 2 0 01-2 2H4a2 2 0 01-2-2v-6z"/></>} size={17}/>,
  cloud: <Icon d={<path d="M17.5 19a4.5 4.5 0 100-9 6 6 0 00-11.6-1.5A4 4 0 006 19z"/>} size={17}/>,
  cloudCheck: <Icon d={<><path d="M17.5 19a4.5 4.5 0 100-9 6 6 0 00-11.6-1.5A4 4 0 006 19z"/><path d="M9 14.5l1.8 1.8L14 13" stroke="currentColor"/></>} size={17}/>,
  link: <Icon d={<><path d="M10 13a5 5 0 007 0l2-2a5 5 0 00-7-7l-1 1M14 11a5 5 0 00-7 0l-2 2a5 5 0 007 7l1-1"/></>} size={16}/>,
  download: <Icon d={<><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></>} size={16}/>,
  upload: <Icon d={<><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></>} size={16}/>,
  chevron: <Icon d={<path d="M6 9l6 6 6-6"/>} size={16}/>,
  bell: <Icon d={<><path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 01-3.4 0"/></>} size={16}/>,
  tasks: <Icon d={<><path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 5l1.5 1.5L8 4M4 11l1.5 1.5L8 10M4 17l1.5 1.5L8 16"/></>} size={17}/>,
  menu: <Icon d={<path d="M3 6h18M3 12h18M3 18h18"/>} size={20}/>,
  sun: <Icon d={<><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M2 12h2.5M19.5 12H22M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></>} size={17}/>,
  moon: <Icon d={<path d="M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z"/>} size={16}/>,
  undo: <Icon d={<><path d="M3 7v6h6"/><path d="M3 13a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 9"/></>} size={16}/>,
  redo: <Icon d={<><path d="M21 7v6h-6"/><path d="M21 13a9 9 0 11-9-9 9.75 9.75 0 016.74 2.74L21 9"/></>} size={16}/>,
  flag: <Icon d={<><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/></>} size={14}/>,
  refresh: <Icon d={<><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.5 9a9 9 0 0114.85-3.36L23 10M1 14l4.65 4.36A9 9 0 0020.5 15"/></>} size={16}/>,
  chart: <Icon d={<><path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/></>} size={17}/>,
  repeat: <Icon d={<><path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/></>} size={15}/>,
  youtube: <Icon d={<><path d="M22.54 6.42a2.78 2.78 0 00-1.95-2C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 00-1.95 2A29 29 0 001 11.75a29 29 0 00.46 5.33A2.78 2.78 0 003.41 19c1.71.46 8.59.46 8.59.46s6.88 0 8.59-.46a2.78 2.78 0 001.95-2 29 29 0 00.46-5.25 29 29 0 00-.46-5.33z"/><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" fill="currentColor" stroke="none"/></>} size={17}/>,
  sparkles: <Icon d={<><path d="M12 3l1.9 5.8L20 10l-6.1 1.2L12 17l-1.9-5.8L4 10l6.1-1.2z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></>} size={15}/>,
  trashBig: <Icon d={<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5"/>}/>,
};

/* ============================ TOAST ============================ */
function useToast() {
  const [toasts, setToasts] = useState([]);
  const push = (msg, kind="gold") => {
    const id = Math.random();
    setToasts(t => [...t, {id, msg, kind}]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000);
  };
  const node = (
    <div style={{position:"fixed", bottom:24, right:24, zIndex:9999, display:"flex", flexDirection:"column", gap:10}}>
      {toasts.map(t => (
        <div key={t.id} className="pop" style={{
          background:"var(--card-2)", border:`1px solid ${t.kind==="gold"?"var(--border-gold)":"var(--border)"}`,
          padding:"12px 16px", borderRadius:12, maxWidth:340, fontSize:13.5, display:"flex", gap:10, alignItems:"center",
          boxShadow:"0 8px 30px rgba(0,0,0,0.6)"
        }}>
          <span style={{color:"var(--gold)",flexShrink:0}}>{Icons.sparkle}</span>
          <span style={{color:"var(--text)"}}>{t.msg}</span>
        </div>
      ))}
    </div>
  );
  return [push, node];
}

/* ============================ BADGE / PILL ============================ */
const FormatPill = ({fmt, small}) => {
  if(!fmt) return null;
  return (
    <span style={{
      display:"inline-flex", alignItems:"center", gap:6, fontSize: small?10.5:11.5, fontWeight:600,
      color:fmt.color, background:`${fmt.color}14`, border:`1px solid ${fmt.color}33`,
      padding: small?"2px 7px":"3px 9px", borderRadius:7, whiteSpace:"nowrap",
      minWidth:0, maxWidth:"100%" // puede encogerse: el nombre se corta con … si no cabe
    }}>
      <span style={{width:6, height:6, borderRadius:"50%", background:fmt.color, flexShrink:0}}/>
      <span style={{overflow:"hidden", textOverflow:"ellipsis"}}>{fmt.label}</span>
    </span>
  );
};
const StatusDot = ({status}) => {
  const s = STATUSES[status];
  return <span style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:11,color:s.color,fontWeight:600}}>
    <span style={{width:7,height:7,borderRadius:"50%",background:s.color,boxShadow:`0 0 8px ${s.color}99`}}/>{s.label}
  </span>;
};

/* ============================ VIDEO CARD ============================ */
/* ============================ ARRASTRE TÁCTIL (iPhone/Android) ============================ */
// Puente entre las tarjetas y las acciones de mover de App.
const dnd = { moveToDate:null, moveToStatus:null, moveToUnassign:null, suppressClickUntil:0 };

const touchDrag = {
  active:false, id:null, ghost:null, lastZone:null, lpTimer:null,
  startX:0, startY:0, moved:false, cardEl:null, scrollDir:0, scrollRAF:null, lastY:0,

  // Desplaza la página cuando el dedo se acerca a los bordes (para poder arrastrar lejos)
  autoScroll(){
    if(!touchDrag.active){ touchDrag.scrollRAF=null; return; }
    if(touchDrag.scrollDir!==0){
      window.scrollBy(0, touchDrag.scrollDir);
      // La página se mueve bajo el dedo: recalcular la zona bajo el dedo
      touchDrag.updateZone(touchDrag.lastX, touchDrag.lastY);
    }
    touchDrag.scrollRAF = requestAnimationFrame(touchDrag.autoScroll);
  },
  updateZone(x,y){
    const el = document.elementFromPoint(x, y);
    const zone = el && el.closest ? el.closest("[data-drop]") : null;
    if(zone !== touchDrag.lastZone){
      if(touchDrag.lastZone) touchDrag.lastZone.classList.remove("drag-over");
      if(zone) zone.classList.add("drag-over");
      touchDrag.lastZone = zone;
    }
  },

  onStart(e, v, cardEl){
    if(e.touches.length!==1) return;
    const t = e.touches[0];
    this.id = v.id; this.startX = t.clientX; this.startY = t.clientY;
    this.moved = false; this.cardEl = cardEl;
    clearTimeout(this.lpTimer);
    // Mantén pulsado ~300ms (sin mover) para "levantar" la tarjeta
    this.lpTimer = setTimeout(()=>this.begin(t.clientX, t.clientY), 300);
  },
  onMovePre(e){
    // Antes de levantar: si el dedo se desplaza, es un scroll → cancelamos el "levantar"
    if(this.active) return;
    const t = e.touches[0]; if(!t) return;
    if(Math.abs(t.clientX-this.startX)>10 || Math.abs(t.clientY-this.startY)>10){
      clearTimeout(this.lpTimer);
    }
  },
  onEndPre(){
    if(!this.active) clearTimeout(this.lpTimer);
  },
  begin(x,y){
    this.active = true; this.moved = false;
    if(navigator.vibrate) { try{ navigator.vibrate(12); }catch(_){} }
    if(this.cardEl){
      const clone = this.cardEl.cloneNode(true);
      clone.className = "touch-ghost";
      clone.style.width = this.cardEl.offsetWidth+"px";
      document.body.appendChild(clone);
      this.ghost = clone;
      this.cardEl.classList.add("lifted");
    }
    this.moveGhost(x,y);
    document.addEventListener("touchmove", this._move, { passive:false });
    document.addEventListener("touchend", this._end, { passive:false });
    document.addEventListener("touchcancel", this._end, { passive:false });
  },
  moveGhost(x,y){
    if(this.ghost) this.ghost.style.transform = `translate(${x-this.ghost.offsetWidth/2}px, ${y-28}px) scale(1.04) rotate(-1.5deg)`;
  },
  _move: function(e){
    if(!touchDrag.active) return;
    e.preventDefault(); // bloquea el scroll mientras se arrastra
    const t = e.touches[0]; if(!t) return;
    touchDrag.moved = true;
    touchDrag.lastX = t.clientX; touchDrag.lastY = t.clientY;
    touchDrag.moveGhost(t.clientX, t.clientY);
    // Cerca del borde superior/inferior → desplazar la página
    const h = window.innerHeight;
    if(t.clientY < 110) touchDrag.scrollDir = -Math.ceil((110 - t.clientY)/8);
    else if(t.clientY > h-110) touchDrag.scrollDir = Math.ceil((t.clientY-(h-110))/8);
    else touchDrag.scrollDir = 0;
    if(touchDrag.scrollDir!==0 && !touchDrag.scrollRAF) touchDrag.scrollRAF = requestAnimationFrame(touchDrag.autoScroll);
    touchDrag.updateZone(t.clientX, t.clientY);
  },
  _end: function(e){
    if(!touchDrag.active) return;
    const zone = touchDrag.lastZone;
    const id = touchDrag.id;
    if(zone && id){
      const kind = zone.getAttribute("data-drop");
      const val = zone.getAttribute("data-dropval");
      if(kind==="date" && dnd.moveToDate) dnd.moveToDate(id, val);
      else if(kind==="status" && dnd.moveToStatus) dnd.moveToStatus(id, val);
      else if(kind==="unassign" && dnd.moveToUnassign) dnd.moveToUnassign(id);
      else if(kind==="card" && dnd.moveBefore) dnd.moveBefore(id, val);
      dnd.suppressClickUntil = Date.now()+500; // evita que se abra el editor tras soltar
    }
    touchDrag.cleanup();
  },
  cleanup(){
    if(this.ghost){ this.ghost.remove(); this.ghost=null; }
    if(this.cardEl){ this.cardEl.classList.remove("lifted"); this.cardEl=null; }
    if(this.lastZone){ this.lastZone.classList.remove("drag-over"); this.lastZone=null; }
    this.active=false; this.id=null; this.scrollDir=0;
    if(this.scrollRAF){ cancelAnimationFrame(this.scrollRAF); this.scrollRAF=null; }
    document.removeEventListener("touchmove", this._move, { passive:false });
    document.removeEventListener("touchend", this._end, { passive:false });
    document.removeEventListener("touchcancel", this._end, { passive:false });
  }
};

/* Estado global de tarjetas (contraídas/expandidas); cada tarjeta puede ajustarse aparte */
const ExpandCtx = React.createContext(false);

function VideoCardBase({v, onOpen, onDragStart, onDragEnd, compact, formats}) {
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
const VideoCard = React.memo(VideoCardBase, (prev, next) => {
  return prev.compact === next.compact
    && prev.onOpen === next.onOpen
    && prev.onDragStart === next.onDragStart
    && prev.onDragEnd === next.onDragEnd
    && prev.formats === next.formats
    && JSON.stringify(prev.v) === JSON.stringify(next.v);
});

function CopyMini({ text, what }) {
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

function VideoModal({v, allVideos, goals, onClose, onSave, onDelete, onDuplicate, onUploadYouTube, promptTemplates, toast, formats}) {
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
  // RPM efectivo y objetivo de visitas por Short (para comparar este vídeo contra tu meta)
  const rpmModal = (()=>{
    const cfgG = goals && goals.cfg; if(!cfgG) return null;
    const r = cfgG.rpmManual!=null ? cfgG.rpmManual : ((goals.rpm && goals.rpm.shorts && goals.rpm.shorts.rpm) || (goals.rpm && goals.rpm.total && goals.rpm.total.rpm) || null);
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
const inputStyle = {
  width:"100%", background:"var(--card)", border:"1px solid var(--border)", borderRadius:9,
  padding:"10px 12px", color:"var(--text)", fontSize:13.5, transition:"border-color .15s"
};
const labelStyle = { fontSize:11.5, fontWeight:600, color:"var(--text-2)", textTransform:"uppercase", letterSpacing:".05em" };
const Field = ({label, children}) => (
  <label style={{display:"flex",flexDirection:"column",gap:7}}>
    <span style={labelStyle}>{label}</span>{children}
  </label>
);

/* ============================ SUBIR A YOUTUBE ============================ */
/* ============================ SUBIR A YOUTUBE ============================ */
function YouTubeUploadModal({ video, allVideos, tagTemplates, setTagTemplates, onClose, onDone, toast }) {
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
function FormatsModal({formats, setFormats, videos, onClose, toast, askConfirm}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(PALETTE[0]);
  // Edición de formatos existentes (nombre y color; la clave interna no cambia, así los vídeos no se rompen)
  const [editingKey, setEditingKey] = useState(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState(PALETTE[0]);
  const saveEdit = (key) => {
    const label = editName.trim();
    if(!label){ toast("El nombre no puede estar vacío"); return; }
    setFormats(f=>({...f, [key]:{...f[key], label, color:editColor}}));
    setEditingKey(null);
    toast(`Formato «${label}» actualizado`);
  };
  const slug = s => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"") || ("fmt"+Date.now());

  const add = () => {
    const label = name.trim();
    if(!label){ toast("Escribe un nombre para el formato"); return; }
    let key = slug(label);
    if(formats[key]) key = key+"_"+Math.floor(Math.random()*999);
    setFormats(f=>({...f, [key]:{ label, color, score:80, ideal:[] }}));
    setName(""); setColor(PALETTE[Math.floor(Math.random()*PALETTE.length)]);
    toast(`Formato «${label}» añadido`);
  };
  const remove = (key) => {
    const inUse = videos.filter(v=>v.format===key).length;
    if(Object.keys(formats).length<=1){ toast("Debe quedar al menos un formato"); return; }
    const doRemove = () => { setFormats(f=>{ const c={...f}; delete c[key]; return c; }); toast("Formato eliminado"); };
    if(inUse>0){
      askConfirm({
        title: "Eliminar formato",
        message: `Hay ${inUse} vídeo${inUse!==1?"s":""} con este formato. Se reasignarán al primer formato disponible. ¿Continuar?`,
        confirmLabel: "Eliminar formato",
        danger: true,
        onConfirm: doRemove
      });
    } else { doRemove(); }
  };

  useEffect(()=>{
    const h = e => { if(e.key==="Escape") onClose(); };
    window.addEventListener("keydown",h); return ()=>window.removeEventListener("keydown",h);
  },[]);

  return (
    <div className="modal-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.78)",zIndex:1000,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"7vh 16px",overflowY:"auto",backdropFilter:"blur(3px)"}}>
      <div onClick={e=>e.stopPropagation()} className="pop" style={{background:"var(--bg-2)",border:"1px solid var(--border-gold)",borderRadius:18,width:"100%",maxWidth:520,boxShadow:"0 20px 70px rgba(0,0,0,0.7)"}}>
        <div style={{padding:"18px 22px",borderBottom:"1px solid var(--border)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{color:"var(--gold)",display:"flex"}}>{Icons.tag}</span>
            <span style={{fontSize:14.5,fontWeight:700}}>Gestionar formatos</span>
          </div>
          <button onClick={onClose} style={{color:"var(--text-2)",display:"flex"}}>{Icons.x}</button>
        </div>

        <div style={{padding:22}}>
          {/* Añadir */}
          <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,padding:14,marginBottom:18}}>
            <div style={{...labelStyle,marginBottom:10}}>Nuevo formato</div>
            <div style={{display:"flex",gap:10,alignItems:"center"}}>
              <input value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()}
                placeholder="Ej: Tier list de skins" style={{...inputStyle,flex:1}}/>
              <button onClick={add} className="grad-gold" style={{color:"#000",fontWeight:700,fontSize:13,padding:"10px 16px",borderRadius:9,display:"flex",alignItems:"center",gap:6,flexShrink:0}}>{Icons.plus} Añadir</button>
            </div>
            <div style={{marginTop:12}}>
              <div style={{fontSize:11.5,color:"var(--text-3)",marginBottom:8}}>Color del formato</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(12, 1fr)",gap:6,maxHeight:128,overflowY:"auto",paddingRight:2}} className="color-grid">
                {PALETTE.map(c=>(
                  <button key={c} onClick={()=>setColor(c)} title={c} style={{
                    aspectRatio:"1 / 1", width:"100%", borderRadius:6, background:c, position:"relative",
                    border: color===c?"2px solid #fff":"2px solid transparent",
                    boxShadow: color===c?`0 0 9px ${c}cc`:"none", transition:"all .12s", cursor:"pointer",
                    display:"flex", alignItems:"center", justifyContent:"center"
                  }}>
                    {color===c && <span style={{color:"#fff",display:"flex",filter:"drop-shadow(0 1px 1px rgba(0,0,0,0.6))"}}><Icon d={<path d="M20 6L9 17l-5-5"/>} size={13} sw={3}/></span>}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Lista */}
          <div style={{...labelStyle,marginBottom:10}}>Formatos actuales ({Object.keys(formats).length})</div>
          <div style={{display:"flex",flexDirection:"column",gap:8,maxHeight:300,overflowY:"auto"}}>
            {sortedFormats(formats).map(([key,val])=>{
              const inUse = videos.filter(v=>v.format===key).length;
              const isEditing = editingKey === key;
              return (
                <div key={key} style={{background:"var(--card)",border:`1px solid ${isEditing?"var(--border-gold)":"var(--border)"}`,borderRadius:10,padding:"10px 13px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <span style={{width:11,height:11,borderRadius:"50%",background:val.color,boxShadow:`0 0 8px ${val.color}88`,flexShrink:0}}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13.5,fontWeight:600,color:"var(--text)"}}>{val.label}</div>
                      <div style={{fontSize:11,color:"var(--text-3)"}}>{inUse} vídeo{inUse!==1?"s":""}{val.ideal&&val.ideal.length?` · mejores días: ${val.ideal.join(", ")}`:""}</div>
                    </div>
                    <button onClick={()=>{ if(isEditing){ setEditingKey(null); } else { setEditingKey(key); setEditName(val.label); setEditColor(val.color); } }}
                      title="Editar nombre y color" style={{color:isEditing?"var(--gold)":"var(--text-3)",display:"flex",padding:7,borderRadius:7,transition:"all .15s"}}
                      onMouseEnter={e=>e.currentTarget.style.color="var(--gold)"} onMouseLeave={e=>e.currentTarget.style.color=isEditing?"var(--gold)":"var(--text-3)"}>{Icons.edit}</button>
                    <button onClick={()=>remove(key)} title="Eliminar formato" style={{color:"var(--text-3)",display:"flex",padding:7,borderRadius:7,transition:"all .15s"}}
                      onMouseEnter={e=>e.currentTarget.style.color="var(--red)"} onMouseLeave={e=>e.currentTarget.style.color="var(--text-3)"}>{Icons.trash}</button>
                  </div>
                  {isEditing && (
                    <div className="fade-in" style={{marginTop:11,paddingTop:11,borderTop:"1px solid var(--border)",display:"flex",flexDirection:"column",gap:9}}>
                      <input value={editName} onChange={e=>setEditName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&saveEdit(key)}
                        placeholder="Nombre del formato" style={{background:"var(--bg-2)",border:"1px solid var(--border)",borderRadius:9,padding:"9px 12px",color:"var(--text)",fontSize:13}}/>
                      <div className="color-grid" style={{display:"grid",gridTemplateColumns:"repeat(12,1fr)",gap:5}}>
                        {PALETTE.map(c=>(
                          <button key={c} onClick={()=>setEditColor(c)} style={{
                            aspectRatio:"1/1",borderRadius:6,background:c,display:"flex",alignItems:"center",justifyContent:"center",
                            border: editColor===c?"2px solid #fff":"2px solid transparent", transition:"transform .1s"
                          }}>{editColor===c && <span style={{color:"#fff",display:"flex",transform:"scale(0.75)"}}>{Icons.check}</span>}</button>
                        ))}
                      </div>
                      <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                        <button onClick={()=>setEditingKey(null)} style={{fontSize:12.5,fontWeight:600,color:"var(--text-2)",padding:"8px 13px",borderRadius:8,border:"1px solid var(--border)"}}>Cancelar</button>
                        <button onClick={()=>saveEdit(key)} className="grad-gold" style={{fontSize:12.5,fontWeight:700,color:"#000",padding:"8px 15px",borderRadius:8}}>Guardar cambios</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================ CALENDARIO ============================ */
// Celda de día del calendario, definida FUERA de CalendarView a propósito:
// si se define dentro, cada render crea un componente "nuevo" y React desmonta y
// remonta todas las celdas (y sus tarjetas), reproduciendo la animación de entrada
// en cada interacción (el "parpadeo"). Fuera y memoizada, el árbol es estable.
const MAX_VIDEOS_MES = 3; // en la vista Mes cada día enseña hasta 3 y el resto va en «+N más»
const CalDayCell = React.memo(function CalDayCell({d, di, big, minH, items, isToday, otherMonth, dragOver, setDragDay, onDrop, onQuickAdd, onOpen, onDragStart, onDragEnd, onShowDay, formats}){
  const dayKey = DAYS[(d.getDay()+6)%7];
  return (
    <div
      data-drop="date" data-dropval={di}
      onDragOver={e=>{e.preventDefault(); setDragDay(di);}}
      onDragLeave={()=>setDragDay(null)}
      onDrop={e=>{e.preventDefault(); onDrop(di); setDragDay(null);}}
      className={dragOver?"drag-over":""}
      style={{
        background: otherMonth?"var(--bg)":"var(--bg-2)", border:`1px solid ${isToday?"var(--border-gold)":"var(--border)"}`, borderRadius:11,
        padding:7, display:"flex", flexDirection:"column", transition:"all .15s", opacity: otherMonth?0.55:1,
        minWidth:0, overflow:"hidden",
        ...(big ? {height:136} : {minHeight:minH}),
        ...(isToday?{boxShadow:"0 0 0 1px rgba(212,175,55,0.15)"}:{})
      }}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"2px 3px 6px"}}>
        <div style={{display:"flex",alignItems:"center",gap:7,minWidth:0}}>
          {big
            ? <div style={{fontSize:13,fontWeight:700,color: isToday?"var(--gold)":"var(--text)"}}>{d.getDate()}</div>
            : <div>
                <div style={{fontSize:10.5,color: isToday?"var(--gold)":"var(--text-3)",fontWeight:600,textTransform:"uppercase",letterSpacing:".05em"}}>{dayKey}</div>
                <div style={{fontSize:16,fontWeight:700,color: isToday?"var(--gold)":"var(--text)"}}>{d.getDate()}</div>
              </div>}
          {items.length>0 && (
            <span style={{fontSize:9.5,fontWeight:700,color:"var(--text-3)",background:"var(--card)",border:"1px solid var(--border)",borderRadius:20,padding:"1px 6px",flexShrink:0}}>{items.length}</span>
          )}
        </div>
        <button onClick={()=>onQuickAdd(di)} title="Añadir vídeo este día" style={{
          width:20,height:20,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,
          color:"var(--text-3)", border:"1px solid var(--border)", transition:"all .15s"
        }} onMouseEnter={e=>{e.currentTarget.style.color="var(--gold)";e.currentTarget.style.borderColor="var(--border-gold)";}}
           onMouseLeave={e=>{e.currentTarget.style.color="var(--text-3)";e.currentTarget.style.borderColor="var(--border)";}}>
          {Icons.plus}
        </button>
      </div>
      {big ? (
        /* Vista MES: entradas de una línea, celdas todas de la misma altura */
        <div style={{display:"flex",flexDirection:"column",gap:3,flex:1,overflow:"hidden",minWidth:0}}>
          {items.slice(0,MAX_VIDEOS_MES).map(v=>{
            const f = formats[v.format]||{color:"#6B6B6B"};
            return (
              <div key={v.id} draggable onDragStart={e=>onDragStart(e,v)} onDragEnd={onDragEnd}
                onClick={e=>{e.stopPropagation(); if(Date.now() < dnd.suppressClickUntil) return; onOpen(v);}} title={v.title}
                style={{display:"flex",alignItems:"center",gap:5,fontSize:10.5,cursor:"pointer",minWidth:0,
                  padding:"2px 5px",borderRadius:5,background:"var(--card)",border:"1px solid var(--border)",
                  transition:"border-color .15s, background .15s"}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor="var(--border-gold)";}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--border)";}}>
                <span style={{width:6,height:6,borderRadius:"50%",background:f.color,flexShrink:0}}/>
                {v.time && <span style={{color:"var(--text-3)",flexShrink:0}}>{v.time}</span>}
                <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontWeight:600,color:"var(--text)"}}>{v.title}</span>
              </div>
            );
          })}
          {items.length>MAX_VIDEOS_MES && (
            <button onClick={()=>onShowDay && onShowDay(di)} title="Ver el día completo" style={{
              fontSize:10,fontWeight:700,color:"var(--gold)",textAlign:"left",padding:"1px 5px",alignSelf:"flex-start"
            }}>+{items.length-MAX_VIDEOS_MES} más</button>
          )}
        </div>
      ) : (
        /* Vista SEMANA: tarjetas completas (contraídas por defecto) */
        <div style={{display:"flex",flexDirection:"column",gap:6,flex:1,overflow:"hidden",minWidth:0}}>
          {items.map(v=><VideoCard key={v.id} v={v} compact onOpen={onOpen} onDragStart={onDragStart} onDragEnd={onDragEnd} formats={formats}/>)}
          {items.length===0 && (
            <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:"var(--empty)",fontSize:11,minHeight:60,border:"1px dashed var(--border)",borderRadius:8}}>
              Vacío
            </div>
          )}
        </div>
      )}
    </div>
  );
});

function CalendarView({videos, onOpen, onDrop, onDragStart, onDragEnd, weekOffset, setWeekOffset, calView, setCalView, onQuickAdd, onUnassign, formats}) {
  const [dragDay, setDragDay] = useState(null);
  const [dragUnassign, setDragUnassign] = useState(false);
  const base = new Date();
  base.setDate(base.getDate() - ((base.getDay()+6)%7) + weekOffset*7);
  const weekDates = DAYS.map((_,i)=>{ const d=new Date(base); d.setDate(base.getDate()+i); return d; });
  const isoOf = d => iso(d.getFullYear(), d.getMonth(), d.getDate());
  const todayIso = isoOf(new Date());

  // Ordena los vídeos de un día por hora de subida (más temprano primero)
  const timeSort = (a,b) => (a.time||"99:99").localeCompare(b.time||"99:99");

  const byDate = useMemo(()=>{
    const m={}; videos.forEach(v=>{ if(v.date){ (m[v.date]=m[v.date]||[]).push(v); } });
    Object.keys(m).forEach(k=>m[k].sort(timeSort));
    return m;
  },[videos]);
  const unassigned = useMemo(()=>{
    const labelOf = v => (formats[v.format]?.label || "\uffff");
    return videos.filter(v=>!v.date).sort((a,b)=>{
      const c = labelOf(a).localeCompare(labelOf(b), "es", {sensitivity:"base"});
      return c !== 0 ? c : a.title.localeCompare(b.title, "es", {sensitivity:"base"});
    });
  },[videos, formats]);

  const weekCount = weekDates.reduce((acc,d)=>acc+(byDate[isoOf(d)]||[]).length,0);

  let headerLabel;
  if(calView==="month"){
    const md = new Date(); md.setMonth(md.getMonth()+weekOffset); md.setDate(1);
    headerLabel = md.toLocaleDateString("es-ES",{month:"long",year:"numeric"});
  } else if(calView==="day"){
    const dd = new Date(); dd.setDate(dd.getDate()+weekOffset);
    headerLabel = dd.toLocaleDateString("es-ES",{weekday:"long",day:"numeric",month:"long"});
  } else {
    headerLabel = weekDates[0].toLocaleDateString("es-ES",{month:"long",year:"numeric"});
  }
  const stepLabel = calView==="month" ? "mes" : calView==="day" ? "día" : "semana";

  const monthGrid = useMemo(()=>{
    const md = new Date(); md.setMonth(md.getMonth()+weekOffset); md.setDate(1);
    const year=md.getFullYear(), month=md.getMonth();
    const first = new Date(year, month, 1);
    const start = new Date(first); start.setDate(1 - ((first.getDay()+6)%7));
    const cells=[];
    for(let i=0;i<42;i++){
      const d=new Date(start); d.setDate(start.getDate()+i);
      d._otherMonth = d.getMonth()!==month;
      cells.push(d);
    }
    while(cells.length>35 && cells[cells.length-1]._otherMonth && cells[cells.length-7]._otherMonth){
      cells.splice(cells.length-7,7);
    }
    return cells;
  },[weekOffset]);

  return (
    <div className="fade-in" style={{padding:"4px 2px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18,flexWrap:"wrap",gap:12}}>
        <div>
          <h2 style={{fontSize:20,fontWeight:700,textTransform:"capitalize"}}>{headerLabel}</h2>
          <p style={{fontSize:12.5,color:"var(--text-2)",marginTop:2}}>
            <span className="hint-desktop">{calView==="week" && `${weekCount} vídeo${weekCount!==1?"s":""} esta semana · `}arrastra para reprogramar</span>
            <span className="hint-touch">mantén pulsado un vídeo para moverlo</span>
          </p>
        </div>
        <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
          <div style={{display:"flex",gap:3,background:"var(--card)",borderRadius:9,padding:3}}>
            {[["month","Mes"],["week","Semana"],["day","Día"]].map(([k,label])=>(
              <button key={k} onClick={()=>{ setCalView(k); setWeekOffset(0); }} style={{
                fontSize:12,fontWeight:600,padding:"6px 12px",borderRadius:6,
                background:calView===k?"var(--gold)":"transparent",color:calView===k?"#000":"var(--text-3)"
              }}>{label}</button>
            ))}
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <button onClick={()=>setWeekOffset(w=>w-1)} style={navBtn} title={"Anterior "+stepLabel}>←</button>
            <button onClick={()=>setWeekOffset(0)} style={{...navBtn, width:"auto", padding:"0 14px", fontSize:12.5, fontWeight:600, color: weekOffset===0?"var(--gold)":"var(--text-2)"}}>Hoy</button>
            <button onClick={()=>setWeekOffset(w=>w+1)} style={navBtn} title={"Siguiente "+stepLabel}>→</button>
          </div>
        </div>
      </div>

      {calView==="week" && (
        <div style={{display:"grid", gridTemplateColumns:"repeat(7, minmax(0,1fr))", gap:10}} className="cal-grid">
          {weekDates.map(d=>{ const di=isoOf(d); return (
            <CalDayCell key={di} d={d} di={di} minH={200}
              items={byDate[di]||[]} isToday={di===todayIso} dragOver={dragDay===di}
              setDragDay={setDragDay} onDrop={onDrop} onQuickAdd={onQuickAdd}
              onOpen={onOpen} onDragStart={onDragStart} onDragEnd={onDragEnd} formats={formats}/>
          );})}
        </div>
      )}

      {calView==="month" && (
        <div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,minmax(0,1fr))",gap:6,marginBottom:6}} className="cal-month-head">
            {DAYS.map(d=><div key={d} style={{textAlign:"center",fontSize:10.5,fontWeight:600,color:"var(--text-3)",textTransform:"uppercase",letterSpacing:".05em"}}>{d}</div>)}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,minmax(0,1fr))",gap:6}} className="cal-month-grid">
            {monthGrid.map(d=>{ const di=isoOf(d); return (
              <CalDayCell key={d.getTime()} d={d} di={di} big minH={92} otherMonth={!!d._otherMonth}
                items={byDate[di]||[]} isToday={di===todayIso} dragOver={dragDay===di}
                setDragDay={setDragDay} onDrop={onDrop} onQuickAdd={onQuickAdd}
                onOpen={onOpen} onDragStart={onDragStart} onDragEnd={onDragEnd} formats={formats}
                onShowDay={(dia)=>{
                  // Saltar a la vista Día de esa fecha (weekOffset son días en esa vista)
                  const hoy0 = new Date(); hoy0.setHours(0,0,0,0);
                  const destino = new Date(dia+"T00:00");
                  setCalView("day");
                  setWeekOffset(Math.round((destino-hoy0)/86400000));
                }}/>
            );})}
          </div>
        </div>
      )}

      {calView==="day" && (()=>{
        const dd = new Date(); dd.setDate(dd.getDate()+weekOffset);
        const di = isoOf(dd);
        const items = byDate[di]||[];
        const isToday = di===todayIso;
        return (
          <div
            data-drop="date" data-dropval={di}
            onDragOver={e=>{e.preventDefault(); setDragDay(di);}}
            onDragLeave={()=>setDragDay(null)}
            onDrop={e=>{e.preventDefault(); onDrop(di); setDragDay(null);}}
            className={dragDay===di?"drag-over":""}
            style={{background:"var(--bg-2)",border:`1px solid ${isToday?"var(--border-gold)":"var(--border)"}`,borderRadius:14,padding:18,minHeight:300}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={{fontSize:15,fontWeight:700,color:isToday?"var(--gold)":"var(--text)"}}>
                {items.length} vídeo{items.length!==1?"s":""} programado{items.length!==1?"s":""}
              </div>
              <button onClick={()=>onQuickAdd(di)} style={{display:"flex",alignItems:"center",gap:7,fontSize:12.5,fontWeight:600,color:"var(--gold)",border:"1px solid var(--border-gold)",borderRadius:9,padding:"8px 13px",background:"rgba(212,175,55,0.05)"}}>{Icons.plus} Añadir vídeo</button>
            </div>
            {items.length===0 ? (
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",color:"var(--empty)",fontSize:13,padding:"50px 0",border:"1px dashed var(--border)",borderRadius:10}}>
                No hay vídeos programados este día
              </div>
            ) : (
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(220px, 1fr))",gap:10}}>
                {items.map(v=><VideoCard key={v.id} v={v} onOpen={onOpen} onDragStart={onDragStart} onDragEnd={onDragEnd} formats={formats}/>)}
              </div>
            )}
          </div>
        );
      })()}

      {calView!=="day" && (
      <div
        data-drop="unassign"
        onDragOver={e=>{e.preventDefault(); setDragUnassign(true);}}
        onDragLeave={()=>setDragUnassign(false)}
        onDrop={e=>{e.preventDefault(); onUnassign(); setDragUnassign(false);}}
        className={dragUnassign?"drag-over":""}
        style={{
          marginTop:14, background:"var(--bg-2)", border:`1px solid var(--border)`, borderRadius:12, padding:"14px 14px 12px",
          transition:"all .15s"
        }}>
        <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:12}}>
          <span style={{color:"var(--text-3)",display:"flex"}}>{Icons.inbox}</span>
          <span style={{fontSize:13.5,fontWeight:700,color:"var(--text)"}}>Sin asignar</span>
          <span style={{fontSize:11,color:"var(--text-3)",background:"var(--card)",padding:"2px 8px",borderRadius:20,border:"1px solid var(--border)"}}>{unassigned.length}</span>
          <span style={{flex:1,minWidth:0,fontSize:11.5,color:"var(--text-3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} className="unassigned-hint">Arrastra un vídeo a un día para programarlo · o suéltalo aquí para quitarle la fecha</span>
          <button onClick={()=>onQuickAdd(null)} title="Crear un vídeo sin asignar" style={{
            display:"flex",alignItems:"center",gap:7,fontSize:12.5,fontWeight:600,color:"var(--gold)",
            border:"1px solid var(--border-gold)",borderRadius:9,padding:"7px 12px",background:"rgba(212,175,55,0.05)",
            transition:"all .15s",flexShrink:0
          }} onMouseEnter={e=>e.currentTarget.style.background="rgba(212,175,55,0.12)"}
             onMouseLeave={e=>e.currentTarget.style.background="rgba(212,175,55,0.05)"}>
            {Icons.plus} Añadir vídeo
          </button>
        </div>
        {unassigned.length===0 ? (
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",color:"var(--empty)",fontSize:12,padding:"22px 0",border:"1px dashed var(--border)",borderRadius:9}}>
            No hay vídeos por asignar
          </div>
        ) : (
          <>
            <div style={{display:"flex",flexWrap:"wrap",gap:7,marginBottom:11}}>
              {sortedFormats(formats).map(([k,val])=>{
                const n = unassigned.filter(v=>v.format===k).length;
                if(n===0) return null;
                return (
                  <span key={k} style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:11,fontWeight:600,color:val.color,background:`${val.color}12`,border:`1px solid ${val.color}30`,padding:"3px 9px",borderRadius:7}}>
                    <span style={{width:6,height:6,borderRadius:"50%",background:val.color}}/>{val.label}<span style={{opacity:.7}}>· {n}</span>
                  </span>
                );
              })}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(190px, 1fr))",gap:9}}>
              {unassigned.map(v=><VideoCard key={v.id} v={v} compact onOpen={onOpen} onDragStart={onDragStart} onDragEnd={onDragEnd} formats={formats}/>)}
            </div>
          </>
        )}
      </div>
      )}
    </div>
  );
}
const navBtn = { width:38, height:38, borderRadius:10, background:"var(--card)", border:"1px solid var(--border)", color:"var(--text)", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center", transition:"all .15s" };

/* ============================ KANBAN ============================ */
// Caja desplegable reutilizable (Completados del tablero y Completadas de tareas)
function CollapsibleBox({ title, count, children, icon }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{marginTop:14, background:"var(--bg-2)", border:"1px solid var(--border)", borderRadius:12, overflow:"hidden"}}>
      <button onClick={()=>setOpen(o=>!o)} style={{
        width:"100%", display:"flex", alignItems:"center", gap:9, padding:"13px 14px", textAlign:"left", transition:"background .15s"
      }} onMouseEnter={e=>e.currentTarget.style.background="var(--card)"}
         onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
        <span style={{color:"var(--green)",display:"flex"}}>{icon||Icons.check}</span>
        <span style={{fontSize:13.5,fontWeight:700,color:"var(--text)"}}>{title}</span>
        <span style={{fontSize:11,color:"var(--text-3)",background:"var(--card)",padding:"2px 8px",borderRadius:20,border:"1px solid var(--border)"}}>{count}</span>
        <span style={{marginLeft:"auto",display:"flex",color:"var(--text-3)",transform:open?"rotate(180deg)":"none",transition:"transform .2s"}}>{Icons.chevron}</span>
      </button>
      {open && <div className="fade-in" style={{padding:"0 14px 14px"}}>{children}</div>}
    </div>
  );
}

function KanbanView({videos, onOpen, onDrop, onDragStart, onDragEnd, onQuickAdd, formats, search}) {
  const [dragCol, setDragCol] = useState(null);
  const cols = Object.keys(STATUSES);
  const filtered = search ? videos.filter(v=>v.title.toLowerCase().includes(search.toLowerCase())) : videos;
  // Completados: publicados hace más de 7 días (salen del tablero y van a la caja de abajo)
  const WEEK = 7*24*60*60*1000;
  const isCompleted = v => v.status==="publicado" && v.date && (Date.now() - new Date(v.date+"T00:00").getTime()) > WEEK;
  const completed = filtered.filter(isCompleted);
  const board = filtered.filter(v=>!isCompleted(v));
  return (
    <div className="fade-in">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18,flexWrap:"wrap",gap:12}}>
        <div>
          <h2 style={{fontSize:20,fontWeight:700}}>Tablero de producción</h2>
          <p style={{fontSize:12.5,color:"var(--text-2)",marginTop:2}}>Mueve cada vídeo por su etapa de producción</p>
        </div>
        <button onClick={()=>onQuickAdd(null)} style={{
          display:"flex",alignItems:"center",gap:7,fontSize:13,fontWeight:600,color:"var(--gold)",
          border:"1px solid var(--border-gold)", borderRadius:10, padding:"9px 14px", background:"rgba(212,175,55,0.05)"
        }}>{Icons.plus} Añadir idea rápida</button>
      </div>
      <div style={{display:"grid", gridTemplateColumns:"repeat(5, minmax(190px,1fr))", gap:12, overflowX:"auto", paddingBottom:8}} className="kanban-grid">
        {cols.map(col=>{
          const items = board.filter(v=>v.status===col);
          const s = STATUSES[col];
          return (
            <div key={col}
              data-drop="status" data-dropval={col}
              onDragOver={e=>{e.preventDefault();setDragCol(col);}}
              onDragLeave={()=>setDragCol(null)}
              onDrop={e=>{e.preventDefault(); onDrop(col); setDragCol(null);}}
              className={dragCol===col?"drag-over":""}
              style={{background:"var(--bg-2)",border:`1px solid var(--border)`,borderRadius:14,padding:10,minHeight:340,transition:"all .15s"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,padding:"5px 6px 12px",borderBottom:`1px solid var(--border)`,marginBottom:10}}>
                <span style={{width:9,height:9,borderRadius:"50%",background:s.color,boxShadow:`0 0 8px ${s.color}aa`}}/>
                <span style={{fontSize:13,fontWeight:700,color:"var(--text)"}}>{s.label}</span>
                <span style={{marginLeft:"auto",fontSize:11,color:"var(--text-3)",background:"var(--card)",padding:"2px 8px",borderRadius:20,border:"1px solid var(--border)"}}>{items.length}</span>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:9}}>
                {items.map(v=><VideoCard key={v.id} v={v} onOpen={onOpen} onDragStart={onDragStart} onDragEnd={onDragEnd} formats={formats}/>)}
                {items.length===0 && <div style={{textAlign:"center",color:"var(--empty)",fontSize:11.5,padding:"24px 0",border:"1px dashed var(--border)",borderRadius:9}}>Suelta vídeos aquí</div>}
              </div>
            </div>
          );
        })}
      </div>

      {/* COMPLETADOS: publicados hace más de una semana */}
      <CollapsibleBox title="Completados" count={completed.length}>
        {completed.length===0 ? (
          <div style={{textAlign:"center",color:"var(--empty)",fontSize:12,padding:"18px 0",border:"1px dashed var(--border)",borderRadius:9}}>
            Aquí aparecerán los vídeos publicados hace más de una semana
          </div>
        ) : (
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(190px, 1fr))",gap:9}}>
            {completed.map(v=><VideoCard key={v.id} v={v} compact onOpen={onOpen} onDragStart={onDragStart} onDragEnd={onDragEnd} formats={formats}/>)}
          </div>
        )}
      </CollapsibleBox>
    </div>
  );
}

/* ============================ DIÁLOGO DE CONFIRMACIÓN ============================ */
function ConfirmDialog({ open, title, message, confirmLabel="Eliminar", danger=true, onConfirm, onCancel }) {
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
function SyncModal({ syncCode, status, syncMode, setSyncMode, pendingChanges, onClose, onLink, onExport, onImport, onSyncNow, syncing, toast }) {
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
function TaskRow({ t, onToggle, onDelete, onSetDue, onEditTitle, onToggleUrgent, isDone }) {
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(t.title);
  const [dueDraft, setDueDraft] = useState(t.due || "");
  const [swipeX, setSwipeX] = useState(0);
  const swipe = useRef({x0:0,y0:0,active:false,horiz:false});
  const overdue = !t.done && t.due && new Date(t.due).getTime() < Date.now();
  const dueLabel = t.due ? new Date(t.due).toLocaleString("es-ES",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}) : null;
  const openEditor = () => { setTitleDraft(t.title); setDueDraft(t.due || ""); setEditing(e=>!e); };
  const saveAll = () => {
    const nt = titleDraft.trim();
    if(!nt){ return; }
    if(nt !== t.title && onEditTitle) onEditTitle(t.id, nt);
    if((dueDraft||null) !== (t.due||null)) onSetDue(t.id, dueDraft || null);
    setEditing(false);
  };
  const clearDue = () => { setDueDraft(""); onSetDue(t.id, null); };
  // Gestos de deslizar (móvil): izquierda = completar/pendiente · derecha = eliminar
  const tstart = (e) => { const p=e.touches[0]; swipe.current={x0:p.clientX,y0:p.clientY,active:true,horiz:false}; };
  const tmove = (e) => {
    if(!swipe.current.active) return;
    const p=e.touches[0]; const dx=p.clientX-swipe.current.x0, dy=p.clientY-swipe.current.y0;
    if(!swipe.current.horiz){
      if(Math.abs(dy)>12 && Math.abs(dy)>Math.abs(dx)){ swipe.current.active=false; return; } // es scroll vertical
      if(Math.abs(dx)>14) swipe.current.horiz=true;
    }
    if(swipe.current.horiz) setSwipeX(Math.max(-110, Math.min(110, dx)));
  };
  const tend = () => {
    if(swipe.current.horiz){
      if(swipeX <= -70) onToggle(t.id);        // izquierda → completar / desmarcar
      else if(swipeX >= 70) onDelete(t.id);    // derecha → eliminar
    }
    setSwipeX(0); swipe.current={x0:0,y0:0,active:false,horiz:false};
  };
  return (
    <div style={{position:"relative",borderRadius:9,overflow:"hidden"}}>
      {/* Fondos que se revelan al deslizar */}
      {swipeX!==0 && (
        <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",
          justifyContent: swipeX<0?"flex-end":"flex-start", padding:"0 16px",
          background: swipeX<0?"rgba(74,222,128,0.16)":"rgba(248,113,113,0.16)"}}>
          <span style={{color: swipeX<0?"var(--green)":"var(--red)",display:"flex"}}>{swipeX<0?Icons.check:Icons.trash}</span>
        </div>
      )}
      <div className={(!isDone && t.urgent)?"urgent-task":""}
        onTouchStart={editing?undefined:tstart} onTouchMove={editing?undefined:tmove} onTouchEnd={editing?undefined:tend}
        style={{padding:"9px 10px",borderRadius:9, position:"relative",
        transform:`translateX(${swipeX}px)`, transition: swipeX===0?"transform .18s ease-out":"none",
        background: isDone?"transparent":"var(--card)", border:`1px solid ${isDone?"transparent":(editing?"var(--border-gold)":"var(--border)")}`}}>
        <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
          <button onClick={()=>onToggle(t.id)} title={isDone?"Marcar como pendiente":"Marcar como completada"} style={{
            width:20,height:20,borderRadius:"50%",flexShrink:0,marginTop:1,
            display:"flex",alignItems:"center",justifyContent:"center",
            background: isDone?"var(--green)":"transparent",
            border:`1.5px solid ${isDone?"var(--green)":"var(--text-3)"}`, color:"#000", transition:"all .15s"
          }}>{isDone && Icons.check}</button>
          <div style={{flex:1,minWidth:0}}>
            <div onDoubleClick={()=>{ if(!isDone) openEditor(); }} style={{fontSize:13.5, color: isDone?"var(--text-3)":"var(--text)", textDecoration: isDone?"line-through":"none", lineHeight:1.4, overflowWrap:"anywhere", cursor: isDone?"default":"text"}}>
              {!isDone && t.urgent && <span style={{color:"var(--gold)",fontWeight:700,marginRight:5}}>⚑</span>}{t.title}
            </div>
            {dueLabel && !isDone && (
              <button onClick={openEditor} title="Editar tarea" style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:11,marginTop:4,padding:0,
                color: overdue?"var(--red)":"var(--text-3)", fontWeight: overdue?600:400}}>
                {Icons.bell}{dueLabel}{overdue && " · vencida"}
              </button>
            )}
            {isDone && t.completedAt && (
              <div style={{fontSize:10.5,color:"var(--text-3)",marginTop:3}}>Completada el {new Date(t.completedAt).toLocaleDateString("es-ES",{day:"numeric",month:"short"})}</div>
            )}
          </div>
          {!isDone && (
            <button onClick={()=>onToggleUrgent(t.id)} title={t.urgent?"Quitar urgente":"Marcar como urgente"} style={{
              color: t.urgent?"var(--gold)":"var(--text-3)", display:"flex",padding:4,borderRadius:6,flexShrink:0,transition:"color .15s"
            }} onMouseEnter={e=>e.currentTarget.style.color="var(--gold)"} onMouseLeave={e=>e.currentTarget.style.color=t.urgent?"var(--gold)":"var(--text-3)"}>
              {Icons.flag}
            </button>
          )}
          {!isDone && (
            <button onClick={openEditor} title="Editar tarea (nombre y hora)" style={{
              color: editing?"var(--gold)":"var(--text-3)", display:"flex",padding:4,borderRadius:6,flexShrink:0,transition:"color .15s"
            }} onMouseEnter={e=>e.currentTarget.style.color="var(--gold)"} onMouseLeave={e=>e.currentTarget.style.color=editing?"var(--gold)":"var(--text-3)"}>
              {Icons.edit}
            </button>
          )}
          <button onClick={()=>onDelete(t.id)} title="Eliminar tarea" style={{color:"var(--text-3)",display:"flex",padding:4,borderRadius:6,flexShrink:0,transition:"color .15s"}}
            onMouseEnter={e=>e.currentTarget.style.color="var(--red)"} onMouseLeave={e=>e.currentTarget.style.color="var(--text-3)"}>
            {Icons.trash}
          </button>
        </div>
        {editing && !isDone && (
          <div className="fade-in" style={{display:"flex",flexDirection:"column",gap:8,marginTop:10,paddingTop:10,borderTop:"1px solid var(--border)"}}>
            <input value={titleDraft} onChange={e=>setTitleDraft(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter")saveAll(); if(e.key==="Escape")setEditing(false); }}
              placeholder="Nombre de la tarea" autoFocus
              style={{background:"var(--bg-2)",border:"1px solid var(--border)",borderRadius:8,padding:"8px 11px",color:"var(--text)",fontSize:13}}/>
            <div style={{display:"flex",gap:7,alignItems:"center",flexWrap:"wrap"}}>
              <div style={{display:"flex",alignItems:"center",gap:6,flex:1,minWidth:170,background:"var(--bg-2)",border:`1px solid ${dueDraft?"var(--border-gold)":"var(--border)"}`,borderRadius:8,padding:"3px 8px"}}>
                <span style={{color:dueDraft?"var(--gold)":"var(--text-3)",display:"flex",flexShrink:0}}>{Icons.bell}</span>
                <input type="datetime-local" value={dueDraft} onChange={e=>setDueDraft(e.target.value)}
                  style={{flex:1,minWidth:0,background:"transparent",border:"none",padding:"5px 0",color:"var(--text)",fontSize:12.5}}/>
                {dueDraft && <button onClick={clearDue} title="Quitar recordatorio" style={{color:"var(--red)",display:"flex",padding:2,flexShrink:0}}>{Icons.x}</button>}
              </div>
              <button onClick={saveAll} className="grad-gold" style={{color:"#000",fontWeight:700,fontSize:12.5,padding:"9px 15px",borderRadius:8,flexShrink:0}}>Guardar</button>
            </div>
            <div style={{fontSize:10.5,color:"var(--text-3)"}}>Consejo: doble clic sobre el nombre para editar rápido</div>
          </div>
        )}
      </div>
    </div>
  );
}

function TaskList({ list, onUpdate, onDeleteList, onTaskDeleted, toast }) {
  const [text, setText] = useState("");
  const [due, setDue] = useState("");
  const [showDue, setShowDue] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(list.name);

  const pending = list.tasks.filter(t=>!t.done).sort((a,b)=>{
    // Urgentes arriba; después por recordatorio más próximo; después por creación
    if(!!a.urgent !== !!b.urgent) return a.urgent ? -1 : 1;
    if(a.due && b.due) return new Date(a.due)-new Date(b.due);
    if(a.due) return -1; if(b.due) return 1;
    return (a.createdAt||0)-(b.createdAt||0);
  });
  const doneTasks = list.tasks.filter(t=>t.done).sort((a,b)=>(b.completedAt||0)-(a.completedAt||0));
  const collapsed = !!list.collapsed;
  const toggleCollapsed = () => onUpdate({...list, collapsed: !collapsed});

  const addTask = () => {
    const title = text.trim();
    if(!title){ toast("Escribe el texto de la tarea"); return; }
    const t = { id:tid(), title, due: due||null, done:false, completedAt:null, notified:false, createdAt:Date.now(), updatedAt:Date.now() };
    onUpdate({...list, tasks:[...list.tasks, t], updatedAt:Date.now()});
    setText(""); setDue(""); setShowDue(false);
  };
  const toggle = (taskId) => {
    onUpdate({...list, tasks: list.tasks.map(t=>t.id===taskId
      ? {...t, done:!t.done, completedAt: !t.done?Date.now():null, notified: t.done?false:t.notified, updatedAt:Date.now()}
      : t)});
  };
  const removeTask = (taskId) => {
    if(onTaskDeleted) onTaskDeleted(taskId); // registra tombstone
    onUpdate({...list, tasks: list.tasks.filter(t=>t.id!==taskId), updatedAt:Date.now()});
  };
  const setTaskDue = (taskId, due) => {
    onUpdate({...list, tasks: list.tasks.map(t=>t.id===taskId ? {...t, due, notified:false, updatedAt:Date.now()} : t)});
  };
  const toggleUrgent = (taskId) => {
    onUpdate({...list, tasks: list.tasks.map(t=>t.id===taskId ? {...t, urgent: !t.urgent, updatedAt:Date.now()} : t)});
  };
  const editTitle = (taskId, title) => {
    onUpdate({...list, tasks: list.tasks.map(t=>t.id===taskId ? {...t, title, updatedAt:Date.now()} : t)});
  };
  const saveRename = () => {
    const n = newName.trim();
    if(!n){ toast("El nombre no puede estar vacío"); return; }
    onUpdate({...list, name:n, updatedAt:Date.now()}); setRenaming(false);
  };

  return (
    <div style={{background:"var(--bg-2)",border:"1px solid var(--border)",borderRadius:14,padding:14,display:"flex",flexDirection:"column",gap:11}}>
      {/* Cabecera de la lista (clic para plegar/desplegar) */}
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        {renaming ? (
          <>
            <input value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")saveRename(); if(e.key==="Escape")setRenaming(false);}}
              style={{flex:1,background:"var(--card)",border:"1px solid var(--border-gold)",borderRadius:8,padding:"7px 10px",color:"var(--text)",fontSize:13.5,fontWeight:700}} autoFocus/>
            <button onClick={saveRename} style={{color:"var(--green)",display:"flex",padding:5}}>{Icons.check}</button>
          </>
        ) : (
          <>
            <button onClick={toggleCollapsed} style={{display:"flex",alignItems:"center",gap:8,flex:1,minWidth:0,textAlign:"left",padding:0}}>
              <span style={{display:"flex",color:"var(--text-3)",transform:collapsed?"rotate(-90deg)":"none",transition:"transform .18s",flexShrink:0}}>{Icons.chevron}</span>
              <span style={{fontSize:14.5,fontWeight:700,color:"var(--text)",overflowWrap:"anywhere"}}>{list.name}</span>
            </button>
            {pending.some(t=>t.urgent) && <span title="Contiene tareas urgentes" style={{color:"var(--gold)",fontSize:12,flexShrink:0}}>⚑</span>}
            <span style={{fontSize:11,color:"var(--text-3)",background:"var(--card)",padding:"2px 8px",borderRadius:20,border:"1px solid var(--border)",flexShrink:0}}>{pending.length}</span>
            <button onClick={()=>{setNewName(list.name); setRenaming(true);}} title="Renombrar lista" style={{color:"var(--text-3)",display:"flex",padding:5,borderRadius:6}}
              onMouseEnter={e=>e.currentTarget.style.color="var(--gold)"} onMouseLeave={e=>e.currentTarget.style.color="var(--text-3)"}>{Icons.edit}</button>
            <button onClick={()=>onDeleteList(list.id)} title="Eliminar lista" style={{color:"var(--text-3)",display:"flex",padding:5,borderRadius:6}}
              onMouseEnter={e=>e.currentTarget.style.color="var(--red)"} onMouseLeave={e=>e.currentTarget.style.color="var(--text-3)"}>{Icons.trash}</button>
          </>
        )}
      </div>

      {!collapsed && <>
      {/* Añadir tarea */}
      <div style={{display:"flex",flexDirection:"column",gap:7}}>
        <div style={{display:"flex",gap:7}}>
          <input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addTask()}
            placeholder="Nueva tarea…" style={{flex:1,minWidth:0,background:"var(--card)",border:"1px solid var(--border)",borderRadius:9,padding:"9px 11px",color:"var(--text)",fontSize:13}}/>
          <button onClick={()=>setShowDue(s=>!s)} title="Añadir recordatorio" style={{
            flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",width:38,borderRadius:9,transition:"all .15s",
            color: (showDue||due)?"var(--gold)":"var(--text-3)", border:`1px solid ${(showDue||due)?"var(--border-gold)":"var(--border)"}`
          }}>{Icons.bell}</button>
          <button onClick={addTask} className="grad-gold" style={{flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",width:38,borderRadius:9,color:"#000"}}>{Icons.plus}</button>
        </div>
        {showDue && (
          <input type="datetime-local" value={due} onChange={e=>setDue(e.target.value)}
            style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:9,padding:"8px 11px",color:"var(--text)",fontSize:13}}/>
        )}
      </div>

      {/* Tareas pendientes */}
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {pending.map(t=><TaskRow key={t.id} t={t} isDone={false} onToggle={toggle} onDelete={removeTask} onSetDue={setTaskDue} onEditTitle={editTitle} onToggleUrgent={toggleUrgent}/>)}
        {pending.length===0 && (
          <div style={{textAlign:"center",color:"var(--empty)",fontSize:11.5,padding:"16px 0",border:"1px dashed var(--border)",borderRadius:9}}>
            No hay tareas pendientes
          </div>
        )}
      </div>

      {/* Completadas (desplegable) */}
      {doneTasks.length>0 && (
        <CollapsibleBox title="Completadas" count={doneTasks.length}>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            {doneTasks.map(t=><TaskRow key={t.id} t={t} isDone={true} onToggle={toggle} onDelete={removeTask} onSetDue={setTaskDue} onEditTitle={editTitle} onToggleUrgent={toggleUrgent}/>)}
          </div>
        </CollapsibleBox>
      )}
      </>}
    </div>
  );
}

// Fecha de hoy en formato YYYY-MM-DD (local)
function todayKey(){
  const d = new Date(); const p=n=>String(n).padStart(2,"0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}

// "Día lógico" de las tareas diarias: el día NO cambia a medianoche sino a las 6:00.
// Así, algo hecho a las 2am cuenta para el día anterior y el reinicio es a las 6am.
const DAILY_RESET_HOUR = 6;
function dailyDayKey(ref){
  const d = ref ? new Date(ref) : new Date();
  // Si aún no son las 6:00, seguimos en el "día" anterior
  if(d.getHours() < DAILY_RESET_HOUR) d.setDate(d.getDate()-1);
  const p=n=>String(n).padStart(2,"0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}
// Clave de semana ISO (para agrupar el archivo de tareas realizadas): "2026-W28"
function weekKey(ref){
  const d = new Date(ref || Date.now());
  d.setHours(0,0,0,0);
  // Jueves de esta semana define el año ISO
  d.setDate(d.getDate() + 3 - ((d.getDay()+6)%7));
  const week1 = new Date(d.getFullYear(),0,4);
  const wn = 1 + Math.round(((d-week1)/86400000 - 3 + ((week1.getDay()+6)%7))/7);
  return `${d.getFullYear()}-W${String(wn).padStart(2,"0")}`;
}
// Etiqueta legible del rango de una semana ISO ("7 – 13 jul")
function weekLabel(wk){
  try {
    const [y,w] = wk.split("-W").map(Number);
    const simple = new Date(y,0,1 + (w-1)*7);
    const dow = (simple.getDay()+6)%7;
    const monday = new Date(simple); monday.setDate(simple.getDate()-dow);
    const sunday = new Date(monday); sunday.setDate(monday.getDate()+6);
    const f = (d,withM)=>d.getDate()+(withM?" "+d.toLocaleDateString("es-ES",{month:"short"}):"");
    const sameMonth = monday.getMonth()===sunday.getMonth();
    return `${f(monday,!sameMonth)} – ${f(sunday,true)}`;
  } catch(e){ return wk; }
}

/* Lista DIARIA fija: sus tareas se repiten cada día (día lógico con corte a las 6:00).
   - Hechas hoy → desaparecen de pendientes; tras el corte de las 6am se archivan por semana.
   - No hechas antes de las 6am del día siguiente → "atrasadas": van arriba y en rojo.
   - Editables como cualquier otra tarea (nombre + hora límite). */
function DailyRow({ t, isDone, overdue, late, onToggle, onDelete, onEdit }) {
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(t.title);
  const [limitDraft, setLimitDraft] = useState(t.limitTime || "");
  const open = () => { setTitleDraft(t.title); setLimitDraft(t.limitTime||""); setEditing(e=>!e); };
  const save = () => {
    const nt = titleDraft.trim(); if(!nt) return;
    onEdit(t.id, { title:nt, limitTime: limitDraft||null });
    setEditing(false);
  };
  const borderColor = late ? "rgba(248,113,113,0.6)" : overdue ? "rgba(248,113,113,0.4)" : "var(--border)";
  return (
    <div className={(overdue||late)?"urgent-task":""} style={{padding:"9px 10px",borderRadius:9,background:isDone?"transparent":"var(--card)",border:`1px solid ${isDone?"transparent":(editing?"var(--border-gold)":borderColor)}`}}>
      <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
        <button onClick={()=>onToggle(t.id)} title={isDone?"Desmarcar":"Marcar como hecha hoy"} style={{
          width:20,height:20,borderRadius:"50%",flexShrink:0,marginTop:1,display:"flex",alignItems:"center",justifyContent:"center",
          background:isDone?"var(--green)":"transparent",border:`1.5px solid ${isDone?"var(--green)":(late?"var(--red)":"var(--text-3)")}`,color:"#000"
        }}>{isDone && Icons.check}</button>
        <div style={{flex:1,minWidth:0}}>
          <div onDoubleClick={()=>{ if(!isDone) open(); }} style={{fontSize:13.5,color:isDone?"var(--text-3)":"var(--text)",textDecoration:isDone?"line-through":"none",lineHeight:1.4,overflowWrap:"anywhere",cursor:isDone?"default":"text"}}>
            {late && <span style={{color:"var(--red)",fontWeight:800,marginRight:5}}>●</span>}{t.title}
          </div>
          {(t.limitTime || late) && !isDone && (
            <div style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:11,marginTop:3,color:(overdue||late)?"var(--red)":"var(--text-3)",fontWeight:(overdue||late)?600:400}}>
              {Icons.clock}{late ? "Atrasada de ayer" : (t.limitTime ? "Antes de las "+t.limitTime+(overdue?" · vencida":"") : "")}
            </div>
          )}
        </div>
        {!isDone && (
          <button onClick={open} title="Editar tarea diaria" style={{color:editing?"var(--gold)":"var(--text-3)",display:"flex",padding:4,borderRadius:6,flexShrink:0}}
            onMouseEnter={e=>e.currentTarget.style.color="var(--gold)"} onMouseLeave={e=>e.currentTarget.style.color=editing?"var(--gold)":"var(--text-3)"}>{Icons.edit}</button>
        )}
        <button onClick={()=>onDelete(t.id)} title="Eliminar tarea diaria" style={{color:"var(--text-3)",display:"flex",padding:4,borderRadius:6,flexShrink:0}}
          onMouseEnter={e=>e.currentTarget.style.color="var(--red)"} onMouseLeave={e=>e.currentTarget.style.color="var(--text-3)"}>{Icons.trash}</button>
      </div>
      {editing && !isDone && (
        <div className="fade-in" style={{display:"flex",gap:7,marginTop:9,paddingTop:9,borderTop:"1px solid var(--border)",flexWrap:"wrap",alignItems:"center"}}>
          <input value={titleDraft} onChange={e=>setTitleDraft(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")save();if(e.key==="Escape")setEditing(false);}} autoFocus
            placeholder="Nombre" style={{flex:1,minWidth:150,background:"var(--bg-2)",border:"1px solid var(--border)",borderRadius:8,padding:"7px 10px",color:"var(--text)",fontSize:13}}/>
          <input type="time" value={limitDraft} onChange={e=>setLimitDraft(e.target.value)} title="Hora límite"
            style={{width:104,background:"var(--bg-2)",border:`1px solid ${limitDraft?"var(--border-gold)":"var(--border)"}`,borderRadius:8,padding:"7px 8px",color:"var(--text)",fontSize:12.5}}/>
          <button onClick={save} className="grad-gold" style={{color:"#000",fontWeight:700,fontSize:12,padding:"8px 13px",borderRadius:8}}>Guardar</button>
        </div>
      )}
    </div>
  );
}

function DailyList({ list, onUpdate, onTaskDeleted, toast }) {
  const [text, setText] = useState("");
  const [limit, setLimit] = useState("");
  const dayNow = dailyDayKey();

  const collapsed = !!list.collapsed;
  const toggleCollapsed = () => onUpdate({...list, collapsed: !collapsed});

  const doneToday = (t) => t.lastDone === dayNow;
  // Atrasada: se dejó sin hacer en un día lógico anterior (no es hoy)
  const isLate = (t) => !doneToday(t) && t.lastPending && t.lastPending < dayNow;
  // Vencida hoy: no hecha y ya pasó su hora límite dentro del día de hoy
  const isOverdue = (t) => {
    if(doneToday(t) || isLate(t)) return false;
    if(!t.limitTime) return false;
    const [h,m] = t.limitTime.split(":").map(Number);
    const lim = new Date(); lim.setHours(h||0, m||0, 0, 0);
    return Date.now() > lim.getTime();
  };

  // Pendientes: atrasadas primero (rojo), luego vencidas de hoy, luego por hora, luego resto
  const pending = list.tasks.filter(t=>!doneToday(t)).sort((a,b)=>{
    const al=isLate(a), bl=isLate(b);
    if(al!==bl) return al?-1:1;
    const ao=isOverdue(a), bo=isOverdue(b);
    if(ao!==bo) return ao?-1:1;
    if(a.limitTime && b.limitTime) return a.limitTime.localeCompare(b.limitTime);
    if(a.limitTime) return -1; if(b.limitTime) return 1;
    return (a.createdAt||0)-(b.createdAt||0);
  });
  const doneNow = list.tasks.filter(t=>doneToday(t));

  const addTask = () => {
    const title = text.trim();
    if(!title){ toast("Escribe la tarea diaria"); return; }
    const t = { id:tid(), title, limitTime: limit||null, lastDone:null, lastPending:dayNow, createdAt:Date.now(), updatedAt:Date.now() };
    onUpdate({...list, tasks:[...list.tasks, t], updatedAt:Date.now()});
    setText(""); setLimit("");
  };
  const toggle = (taskId) => {
    onUpdate({...list, tasks: list.tasks.map(t=>t.id===taskId
      ? {...t, lastDone: doneToday(t)?null:dayNow, lastPending: doneToday(t)?dayNow:t.lastPending, updatedAt:Date.now()} : t)});
  };
  const editTask = (taskId, patch) => {
    onUpdate({...list, tasks: list.tasks.map(t=>t.id===taskId ? {...t, ...patch, updatedAt:Date.now()} : t)});
  };
  const removeTask = (taskId) => {
    if(onTaskDeleted) onTaskDeleted(taskId);
    onUpdate({...list, tasks: list.tasks.filter(t=>t.id!==taskId), updatedAt:Date.now()});
  };

  const lateCount = pending.filter(isLate).length;
  const overdueCount = pending.filter(isOverdue).length;

  return (
    <div style={{background:"linear-gradient(180deg,rgba(212,175,55,0.06),var(--bg-2))",border:"1px solid var(--border-gold)",borderRadius:14,padding:14,display:"flex",flexDirection:"column",gap:11}}>
      {/* Cabecera */}
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <button onClick={toggleCollapsed} style={{display:"flex",alignItems:"center",gap:8,flex:1,minWidth:0,textAlign:"left",padding:0}}>
          <span style={{display:"flex",color:"var(--text-3)",transform:collapsed?"rotate(-90deg)":"none",transition:"transform .18s",flexShrink:0}}>{Icons.chevron}</span>
          <span style={{color:"var(--gold)",display:"flex",flexShrink:0}}>{Icons.repeat}</span>
          <span style={{fontSize:14.5,fontWeight:700,color:"var(--text)",overflowWrap:"anywhere"}}>{list.name}</span>
        </button>
        {lateCount>0 && <span title="Tareas atrasadas de días anteriores" style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:20,background:"var(--red)",color:"#fff",flexShrink:0}}>{lateCount} atrasada{lateCount!==1?"s":""}</span>}
        <span style={{fontSize:11,color:"var(--text-3)",background:"var(--card)",padding:"2px 8px",borderRadius:20,border:"1px solid var(--border)",flexShrink:0}}>{pending.length}</span>
      </div>

      {!collapsed && <>
      <div style={{fontSize:11,color:"var(--text-3)",marginTop:-4}}>Se reinician cada día a las 6:00 · lo no hecho se marca como atrasado</div>

      {/* Añadir tarea diaria */}
      <div style={{display:"flex",gap:7}}>
        <input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addTask()}
          placeholder="Nueva tarea diaria…" style={{flex:1,minWidth:0,background:"var(--card)",border:"1px solid var(--border)",borderRadius:9,padding:"9px 11px",color:"var(--text)",fontSize:13}}/>
        <input type="time" value={limit} onChange={e=>setLimit(e.target.value)} title="Hora límite (opcional)"
          style={{flexShrink:0,width:104,background:"var(--card)",border:`1px solid ${limit?"var(--border-gold)":"var(--border)"}`,borderRadius:9,padding:"9px 8px",color:"var(--text)",fontSize:12.5}}/>
        <button onClick={addTask} className="grad-gold" style={{flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",width:38,borderRadius:9,color:"#000"}}>{Icons.plus}</button>
      </div>

      {/* Pendientes */}
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {pending.map(t=>(
          <DailyRow key={t.id} t={t} isDone={false} overdue={isOverdue(t)} late={isLate(t)} onToggle={toggle} onDelete={removeTask} onEdit={editTask}/>
        ))}
        {pending.length===0 && (
          <div style={{textAlign:"center",color:"var(--green)",fontSize:12,padding:"14px 0",border:"1px dashed rgba(74,222,128,0.3)",borderRadius:9}}>
            ¡Todo hecho por hoy! 🎉
          </div>
        )}
      </div>

      {/* Hechas hoy (aún no archivadas; se archivan tras el corte de las 6am) */}
      {doneNow.length>0 && (
        <CollapsibleBox title="Hechas hoy" count={doneNow.length}>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            {doneNow.map(t=>(
              <DailyRow key={t.id} t={t} isDone={true} overdue={false} late={false} onToggle={toggle} onDelete={removeTask} onEdit={editTask}/>
            ))}
          </div>
        </CollapsibleBox>
      )}
      </>}
    </div>
  );
}

/* Archivo de tareas diarias realizadas, agrupado por semana con desplegables. */
function DailyArchive({ archive, toast }) {
  const [openWeeks, setOpenWeeks] = useState({});
  const weeks = Object.keys(archive||{}).sort().reverse(); // más reciente primero
  if(weeks.length===0) return null;
  const totalDone = weeks.reduce((a,w)=>a+(archive[w]?.length||0),0);
  return (
    <div style={{background:"var(--bg-2)",border:"1px solid var(--border)",borderRadius:14,padding:14,display:"flex",flexDirection:"column",gap:10}}>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <span style={{color:"var(--green)",display:"flex"}}>{Icons.check}</span>
        <span style={{fontSize:14.5,fontWeight:700,color:"var(--text)"}}>Tareas diarias realizadas</span>
        <span style={{fontSize:11,color:"var(--text-3)",background:"var(--card)",padding:"2px 8px",borderRadius:20,border:"1px solid var(--border)",marginLeft:"auto"}}>{totalDone}</span>
      </div>
      <div style={{fontSize:11,color:"var(--text-3)",marginTop:-4}}>Historial semanal de lo que completaste cada día</div>
      <div style={{display:"flex",flexDirection:"column",gap:7}}>
        {weeks.map(wk=>{
          const items = archive[wk]||[];
          const isOpen = !!openWeeks[wk];
          return (
            <div key={wk} style={{border:"1px solid var(--border)",borderRadius:10,overflow:"hidden"}}>
              <button onClick={()=>setOpenWeeks(o=>({...o,[wk]:!o[wk]}))} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"10px 12px",background:"var(--card)",textAlign:"left"}}>
                <span style={{display:"flex",color:"var(--text-3)",transform:isOpen?"none":"rotate(-90deg)",transition:"transform .18s"}}>{Icons.chevron}</span>
                <span style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>Semana {weekLabel(wk)}</span>
                <span style={{fontSize:11,color:"var(--text-3)",marginLeft:"auto"}}>{items.length} tarea{items.length!==1?"s":""}</span>
              </button>
              {isOpen && (
                <div className="fade-in" style={{padding:"8px 12px",display:"flex",flexDirection:"column",gap:5}}>
                  {items.slice().sort((a,b)=>(b.doneAt||0)-(a.doneAt||0)).map((it,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:9,fontSize:12.5,color:"var(--text-2)"}}>
                      <span style={{color:"var(--green)",display:"flex",flexShrink:0}}>{Icons.check}</span>
                      <span style={{flex:1,overflowWrap:"anywhere"}}>{it.title}</span>
                      <span style={{fontSize:10.5,color:"var(--text-3)",flexShrink:0}}>{it.doneAt?new Date(it.doneAt).toLocaleDateString("es-ES",{weekday:"short",day:"numeric"}):""}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TasksView({ taskLists, setTaskLists, dailyArchive, toast, askConfirm, onTaskDeleted, onListDeleted }) {
  const [newList, setNewList] = useState("");
  const [notifState, setNotifState] = useState(typeof Notification!=="undefined" ? Notification.permission : "unsupported");

  const addList = () => {
    const name = newList.trim();
    if(!name){ toast("Escribe un nombre para la lista"); return; }
    setTaskLists(ls=>[...ls, { id:tid(), name, tasks:[], updatedAt:Date.now() }]);
    setNewList("");
    toast(`Lista «${name}» creada`);
  };
  const updateList = (updated) => setTaskLists(ls=>ls.map(l=>l.id===updated.id?updated:l));
  const deleteList = (id) => {
    const l = taskLists.find(x=>x.id===id);
    if(l && l.fixed){ toast("La lista diaria no se puede eliminar"); return; }
    askConfirm({
      title: "Eliminar lista",
      message: `Se eliminará la lista «${l?.name}» con sus ${l?.tasks.length||0} tarea${(l?.tasks.length||0)!==1?"s":""}. Esta acción no se puede deshacer.`,
      confirmLabel: "Eliminar lista",
      danger: true,
      onConfirm: () => { if(onListDeleted) onListDeleted(id); setTaskLists(ls=>ls.filter(x=>x.id!==id)); }
    });
  };
  // La lista fija (diaria) siempre va primera
  const orderedLists = [...taskLists].sort((a,b)=>(b.fixed?1:0)-(a.fixed?1:0));
  const enableNotifs = async () => {
    const res = await askNotifPermission();
    setNotifState(res);
    if(res==="granted"){
      registerNotifSW();
      toast("Notificaciones activadas");
      // Notificación de prueba para confirmar que funcionan
      setTimeout(()=>fireNotification("✅ Notificaciones activas", "Te avisaré cuando venzan tus tareas programadas"), 400);
    }
    else if(res==="denied") toast("Notificaciones bloqueadas · actívalas en los ajustes del navegador");
    else if(res==="unsupported") toast("Este navegador no soporta notificaciones");
  };

  // ——— Indicadores de tareas (normales + diarias de hoy) ———
  const dayNow = dailyDayKey();
  const normalLists = taskLists.filter(l=>!l.fixed);
  const dailyList = taskLists.find(l=>l.fixed);
  const normalTasks = normalLists.flatMap(l=>l.tasks||[]);

  // Diarias: estado de hoy
  const dailyTasks = (dailyList?.tasks)||[];
  const dailyDoneToday = dailyTasks.filter(t=>t.lastDone===dayNow).length;
  const dailyLate = dailyTasks.filter(t=>t.lastDone!==dayNow && t.lastPending && t.lastPending<dayNow).length;
  const dailyOverdue = dailyTasks.filter(t=>{
    if(t.lastDone===dayNow) return false;
    if(t.lastPending && t.lastPending<dayNow) return false; // ya cuenta como atrasada
    if(!t.limitTime) return false;
    const [h,m]=t.limitTime.split(":").map(Number); const lim=new Date(); lim.setHours(h||0,m||0,0,0);
    return Date.now()>lim.getTime();
  }).length;

  // Normales
  const normalPending = normalTasks.filter(t=>!t.done).length;
  const normalDone = normalTasks.filter(t=>t.done).length;
  const normalOverdue = normalTasks.filter(t=>!t.done && t.due && new Date(t.due).getTime()<Date.now()).length;
  const normalUrgent = normalTasks.filter(t=>!t.done && t.urgent).length;

  // Totales combinados
  const totalTasks = normalTasks.length + dailyTasks.length;
  const totalPending = normalPending + (dailyTasks.length - dailyDoneToday);
  const totalDone = normalDone + dailyDoneToday;
  const totalLate = dailyLate + normalOverdue; // atrasadas de ayer + vencidas normales
  const totalOverdueToday = dailyOverdue;
  const totalUrgent = normalUrgent;
  // Total de realizadas en el archivo (histórico)
  const archivedTotal = Object.values(dailyArchive||{}).reduce((a,arr)=>a+(arr?.length||0),0);

  const indicators = [
    {label:"Total de tareas", value:totalTasks, icon:Icons.tasks, color:"var(--text)"},
    {label:"Pendientes", value:totalPending, icon:Icons.inbox, color:"var(--blue)"},
    {label:"Completadas", value:totalDone, icon:Icons.check, color:"var(--green)"},
    {label:"Atrasadas", value:totalLate, icon:Icons.flag, color: totalLate>0?"var(--red)":"var(--text-3)"},
    {label:"Vencen hoy", value:totalOverdueToday, icon:Icons.clock, color: totalOverdueToday>0?"var(--orange)":"var(--text-3)"},
    {label:"Urgentes", value:totalUrgent, icon:Icons.flag, color: totalUrgent>0?"var(--gold)":"var(--text-3)"},
  ];

  return (
    <div className="fade-in">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16,flexWrap:"wrap",gap:12}}>
        <div>
          <h2 style={{fontSize:20,fontWeight:700}}>Tareas</h2>
          <p style={{fontSize:12.5,color:"var(--text-2)",marginTop:2}}>Organiza en listas, programa recordatorios y repite tus rutinas diarias</p>
        </div>
        {notifState!=="granted" && notifState!=="unsupported" && (
          <button onClick={enableNotifs} style={{
            display:"flex",alignItems:"center",gap:7,fontSize:12.5,fontWeight:600,color:"var(--gold)",
            border:"1px solid var(--border-gold)",borderRadius:10,padding:"9px 13px",background:"rgba(212,175,55,0.05)"
          }}>{Icons.bell} Activar notificaciones</button>
        )}
      </div>

      {/* Indicadores visuales (como los del calendario) */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:10,marginBottom:20}} className="stat-grid">
        {indicators.map((it,i)=>(
          <div key={i} style={{background:"var(--bg-2)",border:"1px solid var(--border)",borderRadius:13,padding:"13px 14px",display:"flex",alignItems:"center",gap:11}}>
            <div style={{width:36,height:36,borderRadius:10,flexShrink:0,background:"var(--card)",display:"flex",alignItems:"center",justifyContent:"center",color:it.color}}>{it.icon}</div>
            <div style={{minWidth:0}}>
              <div style={{fontSize:21,fontWeight:700,fontFamily:"'Sora'",color:it.color,lineHeight:1.1}}>{it.value}</div>
              <div style={{fontSize:10,color:"var(--text-3)",textTransform:"uppercase",letterSpacing:".03em",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{it.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Crear lista nueva */}
      <div style={{display:"flex",gap:9,marginBottom:16,maxWidth:420}}>
        <input value={newList} onChange={e=>setNewList(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addList()}
          placeholder="Nombre de la nueva lista…" style={{flex:1,minWidth:0,background:"var(--bg-2)",border:"1px solid var(--border)",borderRadius:10,padding:"10px 13px",color:"var(--text)",fontSize:13}}/>
        <button onClick={addList} style={{
          flexShrink:0,display:"flex",alignItems:"center",gap:7,fontSize:13,fontWeight:600,color:"var(--gold)",
          border:"1px solid var(--border-gold)",borderRadius:10,padding:"9px 14px",background:"rgba(212,175,55,0.05)"
        }}>{Icons.plus} Crear lista</button>
      </div>

      {/* Listas */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(290px, 1fr))",gap:13,alignItems:"start"}} className="tasks-grid">
        {orderedLists.map(l=> l.fixed
          ? <DailyList key={l.id} list={l} onUpdate={updateList} onTaskDeleted={onTaskDeleted} toast={toast}/>
          : <TaskList key={l.id} list={l} onUpdate={updateList} onDeleteList={deleteList} onTaskDeleted={onTaskDeleted} toast={toast}/>
        )}
      </div>

      {/* Archivo semanal de tareas diarias realizadas */}
      {archivedTotal>0 && (
        <div style={{marginTop:16}}>
          <DailyArchive archive={dailyArchive} toast={toast}/>
        </div>
      )}

      {taskLists.length===0 && (
        <div style={{textAlign:"center",color:"var(--text-3)",fontSize:13,padding:"50px 0"}}>
          Crea tu primera lista de tareas con el campo de arriba
        </div>
      )}
    </div>
  );
}

/* ============================ ESTADÍSTICAS ============================ */
function StatCard({ label, value, sub, color, icon }) {
  return (
    <div style={{background:"var(--bg-2)",border:"1px solid var(--border)",borderRadius:14,padding:"16px 17px",display:"flex",flexDirection:"column",gap:5}}>
      <div style={{display:"flex",alignItems:"center",gap:8,color:color||"var(--gold)"}}>
        {icon}<span style={{fontSize:11,textTransform:"uppercase",letterSpacing:".07em",color:"var(--text-3)",fontWeight:600}}>{label}</span>
      </div>
      <div style={{fontSize:28,fontWeight:800,fontFamily:"'Sora'",color:color||"var(--text)",lineHeight:1.1}}>{value}</div>
      {sub && <div style={{fontSize:11.5,color:"var(--text-3)"}}>{sub}</div>}
    </div>
  );
}

/* ============================ VÍDEOS PROGRAMADOS / SUBIDOS ============================ */
// Dígito con animación de rodillo vertical (estilo odómetro de YouTube)
function OdometerDigit({ digit }) {
  const d = /[0-9]/.test(digit) ? parseInt(digit,10) : null;
  if(d===null) return <span style={{display:"inline-block"}}>{digit}</span>;
  return (
    <span style={{display:"inline-block",height:"1em",overflow:"hidden",verticalAlign:"top"}}>
      <span style={{display:"flex",flexDirection:"column",transform:`translateY(-${d}em)`,transition:"transform .8s cubic-bezier(0.22,1,0.36,1)"}}>
        {[0,1,2,3,4,5,6,7,8,9].map(n=><span key={n} style={{height:"1em",lineHeight:"1em"}}>{n}</span>)}
      </span>
    </span>
  );
}

// Contador con animación por dígitos; formatea con separador de miles
function SubscriberCounter({ value, prev }) {
  const str = (value==null?0:value).toLocaleString("es-ES"); // "1.234"
  return (
    <span style={{display:"inline-flex",fontVariantNumeric:"tabular-nums",letterSpacing:"-0.01em"}}>
      {str.split("").map((ch,i)=><OdometerDigit key={str.length-i} digit={ch}/>)}
    </span>
  );
}

// Tarjeta grande del canal con contador de suscriptores en vivo
function ChannelHeroCard({ subHistory, onRecordSubs, onConnect, toast }) {
  const [stats, setStats] = useState(null);
  const [prevSubs, setPrevSubs] = useState(null);
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(ytIsConnected());
  const pollRef = useRef(null);

  const load = async (silent) => {
    if(!ytIsConnected()){ setConnected(false); if(!silent) toast("Conecta tu cuenta de Google primero"); return; }
    if(!silent) setLoading(true);
    try {
      const s = await ytGetChannelStats();
      if(s){
        setStats(prev=>{
          if(prev && prev.subscribers!==s.subscribers) setPrevSubs(prev.subscribers);
          return s;
        });
        setConnected(true);
        if(s.subscribers!=null && onRecordSubs) onRecordSubs(s.subscribers);
        if(!silent) toast("Datos actualizados");
      } else if(!silent){
        toast("No se pudo leer el canal");
      }
    } catch(e){
      if(/caducada/i.test(e.message)){ setConnected(false); if(!silent) toast("Sesión de Google caducada · vuelve a conectar"); }
      else if(!silent){ toast("❌ "+e.message); }
    } finally { if(!silent) setLoading(false); }
  };

  useEffect(()=>{
    if(!connected) return;
    load(false);
    // Refrescar solo mientras la pestaña está visible (ahorra cuota y batería)
    const startPoll = () => {
      if(pollRef.current) return;
      pollRef.current = setInterval(()=>{ if(document.visibilityState==="visible") load(true); }, 60000);
    };
    const stopPoll = () => { if(pollRef.current){ clearInterval(pollRef.current); pollRef.current=null; } };
    startPoll();
    const onVis = () => { if(document.visibilityState==="visible"){ load(true); startPoll(); } else stopPoll(); };
    document.addEventListener("visibilitychange", onVis);
    return ()=>{ stopPoll(); document.removeEventListener("visibilitychange", onVis); };
  },[connected]);

  if(!connected){
    return (
      <div style={{background:"linear-gradient(135deg,rgba(255,0,0,0.08),var(--bg-2))",border:"1px solid var(--border)",borderRadius:16,padding:"22px 24px",marginBottom:20,display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
        <div style={{color:"#FF0000",display:"flex"}}>{Icons.youtube}</div>
        <div style={{flex:1,minWidth:180}}>
          <div style={{fontSize:14,fontWeight:600,color:"var(--text)"}}>Conecta tu canal de YouTube</div>
          <div style={{fontSize:12.5,color:"var(--text-3)",marginTop:2}}>Verás tus suscriptores en vivo y podrás subir y gestionar vídeos.</div>
        </div>
        <button onClick={onConnect} className="grad-gold" style={{display:"inline-flex",alignItems:"center",gap:8,color:"#000",fontWeight:700,fontSize:13.5,padding:"11px 18px",borderRadius:11,flexShrink:0}}>
          {Icons.link} Conectar con Google
        </button>
      </div>
    );
  }

  const delta = (stats && prevSubs!=null) ? stats.subscribers - prevSubs : 0;

  return (
    <div style={{background:"linear-gradient(135deg,rgba(255,0,0,0.09),rgba(212,175,55,0.05),var(--bg-2))",border:"1px solid var(--border)",borderRadius:18,padding:"24px 26px",marginBottom:22,position:"relative",overflow:"hidden"}}>
      <div style={{display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
        {stats?.thumb && <img src={stats.thumb} alt="" style={{width:52,height:52,borderRadius:"50%",border:"2px solid var(--border-gold)"}}/>}
        <div style={{flex:1,minWidth:200}}>
          <div style={{fontSize:12.5,color:"var(--text-3)",textTransform:"uppercase",letterSpacing:".06em",fontWeight:600,marginBottom:4,display:"flex",alignItems:"center",gap:8}}>
            <span style={{color:"#FF0000",display:"flex",width:16,height:16}}>{Icons.youtube}</span>
            {stats?.title || "Tu canal"}
          </div>
          <div style={{display:"flex",alignItems:"baseline",gap:12,flexWrap:"wrap"}}>
            <div style={{fontSize:"clamp(38px, 9vw, 64px)",fontWeight:800,fontFamily:"'Sora'",lineHeight:1,color:"var(--text)"}}>
              {stats && stats.subscribers!=null ? <SubscriberCounter value={stats.subscribers} prev={prevSubs}/> : "—"}
            </div>
            {delta!==0 && (
              <span className="fade-in" style={{fontSize:15,fontWeight:700,color:delta>0?"var(--green)":"var(--red)",display:"inline-flex",alignItems:"center",gap:3}}>
                {delta>0?"▲":"▼"} {Math.abs(delta).toLocaleString("es-ES")}
              </span>
            )}
          </div>
          <div style={{fontSize:13,color:"var(--text-2)",marginTop:4,fontWeight:500}}>
            {stats?.subscribers==null ? "Suscriptores ocultos" : "suscriptores"}
          </div>
        </div>
        <div style={{display:"flex",gap:22,flexWrap:"wrap"}}>
          <div>
            <div style={{fontSize:22,fontWeight:700,fontFamily:"'Sora'",color:"var(--text)"}}>{stats?.videos?.toLocaleString("es-ES")||"—"}</div>
            <div style={{fontSize:10.5,color:"var(--text-3)",textTransform:"uppercase",letterSpacing:".04em"}}>Vídeos</div>
          </div>
          <div>
            <div style={{fontSize:22,fontWeight:700,fontFamily:"'Sora'",color:"var(--text)"}}>{stats?.views?.toLocaleString("es-ES")||"—"}</div>
            <div style={{fontSize:10.5,color:"var(--text-3)",textTransform:"uppercase",letterSpacing:".04em"}}>Visitas</div>
          </div>
          <button onClick={()=>load(false)} disabled={loading} title="Actualizar ahora" style={{alignSelf:"center",color:"var(--text-3)",display:"flex",padding:8,borderRadius:9,border:"1px solid var(--border)"}}>
            <span className={loading?"spinning":""} style={{display:"flex"}}>{Icons.refresh}</span>
          </button>
        </div>
      </div>
      <SubGrowthChart history={subHistory}/>
    </div>
  );
}

// Gráfica de evolución de suscriptores a lo largo del tiempo
function SubGrowthChart({ history }) {
  const [range, setRange] = useState("all");
  const data = useMemo(()=>{
    let h = (history||[]).slice().sort((a,b)=>a.t-b.t);
    if(range!=="all"){
      const days = parseInt(range,10);
      const cut = Date.now() - days*86400000;
      h = h.filter(p=>p.t>=cut);
    }
    return h;
  },[history, range]);

  if(!history || history.length<2){
    return (
      <div style={{marginTop:16,paddingTop:16,borderTop:"1px solid var(--border)",fontSize:12,color:"var(--text-3)",textAlign:"center"}}>
        La gráfica de evolución aparecerá cuando haya al menos dos lecturas de suscriptores. Vuelve dentro de un rato con la app abierta.
      </div>
    );
  }

  const W=640, H=120, pad=8;
  const subs = data.map(p=>p.s);
  const min = Math.min(...subs), max = Math.max(...subs);
  const span = Math.max(1, max-min);
  const t0 = data[0].t, t1 = data[data.length-1].t, tspan = Math.max(1, t1-t0);
  const pts = data.map(p=>{
    const x = pad + (W-2*pad) * (p.t - t0)/tspan;
    const y = pad + (H-2*pad) * (1 - (p.s - min)/span);
    return [x,y];
  });
  const path = pts.map((p,i)=>(i===0?"M":"L")+p[0].toFixed(1)+" "+p[1].toFixed(1)).join(" ");
  const areaPath = path + ` L ${pts[pts.length-1][0].toFixed(1)} ${H-pad} L ${pts[0][0].toFixed(1)} ${H-pad} Z`;
  const gained = subs[subs.length-1] - subs[0];
  const fmtDay = t => new Date(t).toLocaleDateString("es-ES",{day:"numeric",month:"short"});

  return (
    <div style={{marginTop:16,paddingTop:16,borderTop:"1px solid var(--border)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:8}}>
        <div style={{fontSize:12.5,fontWeight:600,color:"var(--text-2)",display:"flex",alignItems:"center",gap:8}}>
          Evolución de suscriptores
          {gained!==0 && <span style={{color:gained>0?"var(--green)":"var(--red)",fontWeight:700}}>{gained>0?"+":""}{gained.toLocaleString("es-ES")}</span>}
        </div>
        <div style={{display:"flex",gap:4,background:"var(--card)",borderRadius:8,padding:3}}>
          {[["7","7d"],["30","30d"],["all","Todo"]].map(([k,label])=>(
            <button key={k} onClick={()=>setRange(k)} style={{
              fontSize:11,fontWeight:600,padding:"4px 10px",borderRadius:6,
              background:range===k?"var(--gold)":"transparent",color:range===k?"#000":"var(--text-3)"
            }}>{label}</button>
          ))}
        </div>
      </div>
      {data.length<2 ? (
        <div style={{fontSize:11.5,color:"var(--text-3)",textAlign:"center",padding:"10px 0"}}>No hay datos en este rango todavía.</div>
      ) : (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:"auto",display:"block"}} preserveAspectRatio="none">
            <defs>
              <linearGradient id="subgrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.35"/>
                <stop offset="100%" stopColor="var(--gold)" stopOpacity="0"/>
              </linearGradient>
            </defs>
            <path d={areaPath} fill="url(#subgrad)"/>
            <path d={path} fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
            {pts.length<=30 && pts.map((p,i)=><circle key={i} cx={p[0]} cy={p[1]} r="2.5" fill="var(--gold)"/>)}
          </svg>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"var(--text-3)",marginTop:4}}>
            <span>{fmtDay(t0)} · {min.toLocaleString("es-ES")}</span>
            <span>{fmtDay(t1)} · {max.toLocaleString("es-ES")}</span>
          </div>
        </>
      )}
    </div>
  );
}

/* ============================ AGENTE (IA / Gemini) ============================ */
function AgentView({ promptTemplates, setPromptTemplates, toast }) {
  const [aiKey, setAiKey] = useState(geminiGetKey());
  const [aiModel, setAiModel] = useState(geminiGetModel() || "gemini-2.5-flash");
  const [aiSystem, setAiSystem] = useState(geminiGetSystem());
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [testing, setTesting] = useState(false);
  const [testOut, setTestOut] = useState("");

  const saveKey = () => {
    geminiSaveKey(aiKey.trim());
    geminiSaveModel(aiModel);
    geminiSaveSystem(aiSystem);
    toast(aiKey.trim()?"Configuración de IA guardada":"Clave borrada");
  };
  const startNew = () => { setEditing("new"); setName(""); setPrompt(""); setTestOut(""); };
  const startEdit = (t) => { setEditing(t.id); setName(t.name); setPrompt(t.prompt); setTestOut(""); };
  const cancel = () => { setEditing(null); setName(""); setPrompt(""); setTestOut(""); };

  const save = () => {
    const n = name.trim(), p = prompt.trim();
    if(!n){ toast("Ponle un nombre a la plantilla"); return; }
    if(!p){ toast("Escribe el prompt"); return; }
    if(editing==="new"){
      setPromptTemplates(prev=>[...(prev||[]), { id:"pr_"+Date.now(), name:n, prompt:p, updatedAt:Date.now() }]);
      toast("Plantilla creada");
    } else {
      setPromptTemplates(prev=>(prev||[]).map(t=>t.id===editing?{...t,name:n,prompt:p,updatedAt:Date.now()}:t));
      toast("Plantilla actualizada");
    }
    cancel();
  };
  const remove = (id) => { setPromptTemplates(prev=>(prev||[]).filter(t=>t.id!==id)); if(editing===id) cancel(); toast("Plantilla eliminada"); };

  const test = async () => {
    if(!geminiHasKey()){ toast("Configura primero la clave de Gemini"); return; }
    if(!prompt.trim()){ toast("Escribe un prompt para probar"); return; }
    setTesting(true); setTestOut("");
    try {
      const demo = prompt.replace(/\{titulo\}/gi,"Cómo conseguí la skin secreta").replace(/\{juego\}/gi,"Roblox").replace(/\{etiquetas\}/gi,"roblox, gaming, skins");
      const out = await geminiGenerate(demo);
      setTestOut(out);
    } catch(e){ toast("❌ "+e.message); }
    finally { setTesting(false); }
  };

  return (
    <div className="fade-in">
      <div style={{marginBottom:18}}>
        <h2 style={{fontSize:20,fontWeight:700,display:"flex",alignItems:"center",gap:9}}><span style={{color:"var(--gold)",display:"flex"}}>{Icons.sparkles}</span> Agente de IA</h2>
        <p style={{fontSize:12.5,color:"var(--text-2)",marginTop:2}}>Crea plantillas de prompt para generar descripciones con Gemini. Luego elígelas en cada vídeo.</p>
      </div>

      <div style={{background:"var(--bg-2)",border:"1px solid var(--border)",borderRadius:14,padding:18,marginBottom:16}}>
        <div style={{fontSize:13.5,fontWeight:700,marginBottom:6,display:"flex",alignItems:"center",gap:8}}>{Icons.sparkles} Conexión con Gemini (gratis)</div>
        <div style={{fontSize:12,color:"var(--text-3)",marginBottom:12,lineHeight:1.5}}>
          Consigue tu clave gratuita en <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" style={{color:"var(--gold)"}}>aistudio.google.com/apikey</a> (sin tarjeta). Se guarda solo en este dispositivo.
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
          <input type="password" value={aiKey} onChange={e=>setAiKey(e.target.value)} placeholder="AIza…" style={{...inputStyle,flex:1,minWidth:200}}/>
        </div>

        <Field label="Modelo de Gemini">
          <select value={aiModel} onChange={e=>setAiModel(e.target.value)} style={inputStyle}>
            <option value="gemini-2.5-flash">Gemini 2.5 Flash (recomendado)</option>
            <option value="gemini-3.5-flash">Gemini 3.5 Flash (más nuevo)</option>
          </select>
        </Field>
        <div style={{fontSize:11,color:"var(--text-3)",marginTop:6,marginBottom:12}}>
          Modelos gratuitos actuales de Google. Si uno falla puntualmente, la app prueba el otro sola. El plan gratis permite ~15 generaciones por minuto.
        </div>

        <Field label="Instrucciones del agente (tu «Gem»)">
          <textarea value={aiSystem} onChange={e=>setAiSystem(e.target.value)} rows={4}
            placeholder={"Pega aquí las instrucciones de tu Gem: cómo quieres que escriba, tono, estructura, reglas fijas…\n\nEjemplo: Eres el gestor del canal RDeRandom. Escribe descripciones en español, cercanas, con emojis moderados y siempre 5 hashtags al final."}
            style={{...inputStyle,resize:"vertical",lineHeight:1.55,fontSize:12.5}}/>
        </Field>
        <div style={{fontSize:11,color:"var(--text-3)",marginTop:6,lineHeight:1.5}}>
          Estas instrucciones se aplican a todas las generaciones (como las «instrucciones» de un Gem).
        </div>

        <div style={{display:"flex",gap:8,marginTop:14}}>
          <button onClick={saveKey} className="grad-gold" style={{color:"#000",fontWeight:700,fontSize:13,padding:"10px 18px",borderRadius:10}}>Guardar configuración</button>
        </div>
        <div style={{fontSize:11,color:geminiHasKey()?"var(--green)":"var(--text-3)",marginTop:10}}>
          {geminiHasKey()?"✅ Clave configurada · la IA está lista":"Sin clave · configúrala para usar la generación"}
        </div>
      </div>

      {editing ? (
        <div className="fade-in" style={{background:"var(--bg-2)",border:"1px solid var(--border-gold)",borderRadius:14,padding:18,marginBottom:16}}>
          <div style={{fontSize:14,fontWeight:700,marginBottom:14}}>{editing==="new"?"Nueva plantilla":"Editar plantilla"}</div>
          <div style={{display:"flex",flexDirection:"column",gap:13}}>
            <Field label="Nombre de la plantilla">
              <input value={name} onChange={e=>setName(e.target.value)} placeholder="p.ej. Shorts de Roblox" style={inputStyle}/>
            </Field>
            <Field label="Prompt">
              <textarea value={prompt} onChange={e=>setPrompt(e.target.value)} rows={6} style={{...inputStyle,resize:"vertical",lineHeight:1.6}}
                placeholder={"Instrucciones para la IA. Variables: {titulo}, {juego}, {etiquetas}.\n\nEjemplo: Escribe una descripción para YouTube del vídeo \"{titulo}\" sobre {juego}. Incluye 3 hashtags."}/>
            </Field>
            <div style={{fontSize:11.5,color:"var(--text-3)",marginTop:-6}}>
              Variables: <code style={{color:"var(--gold)"}}>{"{titulo}"}</code>, <code style={{color:"var(--gold)"}}>{"{juego}"}</code>, <code style={{color:"var(--gold)"}}>{"{etiquetas}"}</code>
            </div>
            <div style={{display:"flex",gap:9,flexWrap:"wrap"}}>
              <button onClick={save} className="grad-gold" style={{color:"#000",fontWeight:700,fontSize:13.5,padding:"10px 20px",borderRadius:10}}>Guardar plantilla</button>
              <button onClick={test} disabled={testing} style={{display:"flex",alignItems:"center",gap:7,fontSize:13,fontWeight:600,color:"var(--gold)",border:"1px solid var(--border-gold)",borderRadius:10,padding:"10px 16px",background:"rgba(212,175,55,0.05)"}}>
                <span className={testing?"spinning":""} style={{display:"flex"}}>{testing?Icons.refresh:Icons.sparkles}</span>{testing?"Probando…":"Probar"}
              </button>
              <button onClick={cancel} style={{fontSize:13,fontWeight:600,color:"var(--text-2)",border:"1px solid var(--border)",borderRadius:10,padding:"10px 16px"}}>Cancelar</button>
            </div>
            {testOut && (
              <div style={{marginTop:4,padding:14,background:"var(--card)",borderRadius:10,border:"1px solid var(--border)"}}>
                <div style={{fontSize:11,color:"var(--text-3)",marginBottom:6,textTransform:"uppercase",letterSpacing:".04em"}}>Resultado de prueba</div>
                <div style={{fontSize:13,color:"var(--text)",whiteSpace:"pre-wrap",lineHeight:1.6}}>{testOut}</div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <button onClick={startNew} style={{display:"flex",alignItems:"center",gap:8,fontSize:13.5,fontWeight:600,color:"var(--gold)",border:"1px solid var(--border-gold)",borderRadius:11,padding:"11px 18px",background:"rgba(212,175,55,0.05)",marginBottom:16}}>
          {Icons.plus} Nueva plantilla de prompt
        </button>
      )}

      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {(promptTemplates||[]).length===0 && !editing && (
          <div style={{textAlign:"center",color:"var(--text-3)",fontSize:13,padding:"40px 20px",border:"1px dashed var(--border)",borderRadius:12}}>
            Aún no tienes plantillas de prompt.<br/>Crea una para generar descripciones automáticamente en tus vídeos.
          </div>
        )}
        {(promptTemplates||[]).map(t=>(
          <div key={t.id} style={{background:"var(--bg-2)",border:"1px solid var(--border)",borderRadius:12,padding:"14px 16px",display:"flex",alignItems:"flex-start",gap:14}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:14,fontWeight:700,color:"var(--text)",marginBottom:4}}>{t.name}</div>
              <div style={{fontSize:12,color:"var(--text-3)",lineHeight:1.5,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{t.prompt}</div>
            </div>
            <div style={{display:"flex",gap:6,flexShrink:0}}>
              <button onClick={()=>startEdit(t)} title="Editar" style={{color:"var(--text-3)",display:"flex",padding:7,borderRadius:8,border:"1px solid var(--border)"}} onMouseEnter={e=>e.currentTarget.style.color="var(--gold)"} onMouseLeave={e=>e.currentTarget.style.color="var(--text-3)"}>{Icons.edit}</button>
              <button onClick={()=>remove(t.id)} title="Eliminar" style={{color:"var(--text-3)",display:"flex",padding:7,borderRadius:8,border:"1px solid var(--border)"}} onMouseEnter={e=>e.currentTarget.style.color="var(--red)"} onMouseLeave={e=>e.currentTarget.style.color="var(--text-3)"}>{Icons.trash}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Panel para preparar el comentario fijado de un vídeo PROGRAMADO: se guarda en el vídeo
// y la app lo publica automáticamente en cuanto el vídeo pasa a público.
// (Definido fuera de ScheduledView para no remontar el árbol en cada render.)
function PinnedCommentPanel({ programados, onUpdateVideo, toast }){
  const [selId, setSelId] = useState("");
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const sel = programados.find(v=>v.id===selId) || null;

  const pick = (id) => {
    setSelId(id);
    const v = programados.find(x=>x.id===id);
    setText(v ? (v.pinnedComment||"") : "");
  };
  const save = () => {
    if(!sel){ toast("Elige un vídeo programado"); return; }
    onUpdateVideo(sel.id, { pinnedComment: text.trim(), pinnedCommentPosted: false });
    toast(text.trim() ? "💬 Comentario preparado · se publicará cuando el vídeo salga" : "Comentario quitado");
  };

  return (
    <div style={{background:"var(--bg-2)",border:"1px solid var(--border)",borderRadius:14,padding:"14px 16px",marginBottom:16}}>
      <button onClick={()=>setOpen(o=>!o)} style={{display:"flex",alignItems:"center",gap:9,width:"100%",textAlign:"left"}}>
        <span style={{color:"var(--gold)",display:"flex"}}>{Icons.sparkles}</span>
        <span style={{fontSize:13.5,fontWeight:700,color:"var(--text)",flex:1}}>Comentario fijado al publicarse</span>
        <span style={{fontSize:11,color:"var(--text-3)"}}>{programados.length} programado{programados.length!==1?"s":""}</span>
        <span style={{color:"var(--text-3)",transform:open?"rotate(180deg)":"none",transition:"transform .2s",display:"flex"}}>▾</span>
      </button>
      {open && (
        <div className="fade-in" style={{marginTop:12,display:"flex",flexDirection:"column",gap:10}}>
          <div style={{fontSize:11.5,color:"var(--text-3)",lineHeight:1.5}}>
            Prepara aquí el comentario de un vídeo programado. En cuanto el vídeo se publique, la app lo publicará automáticamente como comentario de tu canal.
          </div>
          <select value={selId} onChange={e=>pick(e.target.value)} style={inputStyle}>
            <option value="">Elige un vídeo programado…</option>
            {programados.map(v=>(
              <option key={v.id} value={v.id}>
                {(v.pinnedComment?"💬 ":"")+(v.title||"(sin título)")}
              </option>
            ))}
          </select>
          {sel && (
            <>
              <textarea value={text} onChange={e=>setText(e.target.value)} rows={2}
                placeholder="Escribe el comentario que quieres publicar cuando salga el vídeo…"
                style={{...inputStyle,resize:"vertical",lineHeight:1.55}}/>
              <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                <button onClick={save} className="grad-gold" style={{color:"#000",fontWeight:700,fontSize:12.5,padding:"9px 16px",borderRadius:9}}>Guardar comentario</button>
                {sel.pinnedComment && !sel.pinnedCommentPosted && <span style={{fontSize:11,color:"var(--gold)"}}>Pendiente de publicarse</span>}
                {sel.pinnedCommentPosted && <span style={{fontSize:11,color:"var(--green)"}}>✅ Ya publicado</span>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================ OBJETIVOS (dinero → visitas, con RPM real) ============================ */
const BarraProgreso = ({pct, alto=8, color}) => (
  <div style={{height:alto, background:"var(--card)", borderRadius:alto, overflow:"hidden"}}>
    <div style={{height:"100%", width:Math.min(100,Math.max(0,pct||0))+"%", borderRadius:alto, transition:"width .4s, background .4s",
      background: color || rgbaDePct(pct, 1)}}/>
  </div>
);

/* Colores de referencia del progreso: rojo → ámbar → verde, interpolados según el % */
const REF_ROJO=[248,113,113], REF_AMBAR=[212,175,55], REF_VERDE=[74,222,128];
function rgbDePct(pct){
  const p = Math.max(0, Math.min(100, pct==null?0:pct));
  const mix=(a,b,t)=>[0,1,2].map(i=>Math.round(a[i]+(b[i]-a[i])*t));
  return p>=50 ? mix(REF_AMBAR, REF_VERDE, (p-50)/50) : mix(REF_ROJO, REF_AMBAR, p/50);
}
const rgbaDePct=(pct,alpha)=>{ const c=rgbDePct(pct); return `rgba(${c[0]},${c[1]},${c[2]},${alpha})`; };

// Modo de ingresos: estimados (visitas × RPM, al instante) o reales (API, ~2 días de retraso)
function ingresosEstimadosActivos(){ try { return localStorage.getItem("rds_ingresos_reales")!=="1"; } catch(e){ return true; } }

function ObjetivosPanel({ videos, goals, setGoals, onConnect, toast }) {
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

  // RPM efectivo: manual > RPM real de Shorts > RPM global del canal (respaldo)
  const rpmShortsApi = (rpmInfo && rpmInfo.shorts && rpmInfo.shorts.rpm>0) ? rpmInfo.shorts.rpm : null;
  const rpmTotalApi = (rpmInfo && rpmInfo.total && rpmInfo.total.rpm>0) ? rpmInfo.total.rpm : null;
  const rpm = cfg.rpmManual!=null ? cfg.rpmManual : (rpmShortsApi ?? rpmTotalApi);
  const rpmOrigen = cfg.rpmManual!=null ? "manual" : (rpmShortsApi ? "real de Shorts" : (rpmTotalApi ? "global del canal" : null));

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

  // Shorts del día seleccionado, con sus visitas en vivo (acumuladas)
  const shortsDia = videos.filter(v=> v.type==="short" && v.date===diaKey && v.youtubeId);
  const refrescarLive = async () => {
    const ids = shortsDia.filter(v=>v.youtubeStatus==="published").map(v=>v.youtubeId);
    if(!ids.length) return;
    try { const m = await ytViewCounts(ids); setLiveViews(prev=>({...prev, ...m})); setLiveAt(Date.now()); } catch(e){}
  };
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
                  <span style={{fontWeight:700,color:"var(--text-2)"}}>Total del día</span>
                  <span style={{fontWeight:700,color: vistasDia>=objetivoDiaSel?"var(--green)":"var(--text-2)"}}>{nf.format(vistasDia)} / {nf.format(objetivoDiaSel)} ({Math.round(vistasDia/objetivoDiaSel*100)}%)</span>
                </div>
                <BarraProgreso pct={vistasDia/objetivoDiaSel*100} alto={10}/>
              </div>
            )}
          </div>
        )}
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
                  <div key={i} style={{
                    minHeight:48, borderRadius:7, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:2,
                    // Fondo OPACO (el degradado del mes no se ve a través de los días) + relleno del día encima
                    backgroundColor: c ? "var(--card)" : "transparent",
                    backgroundImage: (colorDia && c && !c.futuro && p!=null)
                      ? `linear-gradient(to top, ${rgbaDePct(c.pct, .45)} ${p}%, transparent ${p}%)`
                      : "none",
                    transition:"background .4s",
                    border: c&&c.esHoy ? "1.5px solid var(--gold)" : "1px solid "+(c&&!c.futuro?"var(--border)":(c?"rgba(255,255,255,0.05)":"transparent"))
                  }} title={c&&c.views!=null?nf.format(c.views)+" visitas"+(c.pct!=null?` · ${Math.round(c.pct)}%`:"")+(rev!=null?` · ${pref}${eur(rev)}`:""):""}>
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
function ComentariosPanel({ videos, onConnect, toast }) {
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

function ScheduledView({ videos, trashYtIds, onOpen, onUpdateVideo, onAddVideos, subHistory, onRecordSubs, onConnect, formats, toast, goals, setGoals }) {
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
        const uploads = await ytListUploadsFull(150);
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
      if(/caducada|conectado/i.test(e.message)) ytClearTokens();
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
          <h2 style={{fontSize:20,fontWeight:700}}>Vídeos en YouTube</h2>
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

function StatsView({ videos, taskLists, formats }) {
  const now = Date.now();
  const DAY = 24*60*60*1000, WEEK = 7*DAY;

  // ——— Vídeos publicados por semana (últimas 8 semanas) ———
  const monday = (d) => { const x=new Date(d); x.setHours(0,0,0,0); x.setDate(x.getDate()-((x.getDay()+6)%7)); return x; };
  const thisMonday = monday(new Date());
  const weeks = Array.from({length:8},(_,i)=>{
    const start = new Date(thisMonday); start.setDate(start.getDate()+(i-7)*7);
    const end = new Date(start); end.setDate(end.getDate()+7);
    const count = videos.filter(v=>v.status==="publicado" && v.date && (()=>{ const t=new Date(v.date+"T00:00"); return t>=start && t<end; })()).length;
    return { label: start.toLocaleDateString("es-ES",{day:"numeric",month:"short"}), count, isThis: i===7 };
  });
  const maxWeek = Math.max(1, ...weeks.map(w=>w.count));

  // ——— Racha de días sin tareas vencidas ———
  let streak = 0;
  {
    const allTasks = taskLists.flatMap(l=>l.tasks);
    const hasOverdueNow = allTasks.some(t=>!t.done && t.due && new Date(t.due).getTime()<now);
    if(!hasOverdueNow){
      // Último evento de vencimiento: tarea completada tarde, o el vencimiento más reciente ya resuelto
      let lastBad = 0;
      allTasks.forEach(t=>{
        if(t.done && t.due && t.completedAt && t.completedAt > new Date(t.due).getTime()){
          lastBad = Math.max(lastBad, t.completedAt);
        }
      });
      streak = lastBad ? Math.floor((now-lastBad)/DAY) : Math.min(99, Math.floor((now-(Math.min(...allTasks.map(t=>t.createdAt||now), now)))/DAY));
    }
  }

  // ——— Tiempo medio de producción (creación → fecha de publicación) ———
  const prodTimes = videos.filter(v=>v.status==="publicado" && v.date && v.createdAt)
    .map(v=>(new Date(v.date+"T00:00").getTime()-v.createdAt)/DAY).filter(d=>d>=0 && d<120);
  const avgProd = prodTimes.length ? (prodTimes.reduce((a,b)=>a+b,0)/prodTimes.length) : null;

  // ——— Tareas completadas (últimos 7 días) ———
  const tasksDone7 = taskLists.reduce((a,l)=>a+l.tasks.filter(t=>t.done && t.completedAt && (now-t.completedAt)<WEEK).length,0);

  // ——— Distribución por formato (vídeos activos) ———
  const fmtCounts = {};
  videos.forEach(v=>{ fmtCounts[v.format]=(fmtCounts[v.format]||0)+1; });
  const fmtData = Object.entries(fmtCounts)
    .map(([k,n])=>({ key:k, n, label:formats[k]?.label||"Sin formato", color:formats[k]?.color||"#6B6B6B" }))
    .sort((a,b)=>b.n-a.n);
  const totalFmt = fmtData.reduce((a,f)=>a+f.n,0);

  // Donut SVG: arcos acumulados
  const R = 54, C = 2*Math.PI*R;
  let acc = 0;
  const arcs = fmtData.map(f=>{
    const frac = totalFmt? f.n/totalFmt : 0;
    const a = { ...f, dash:`${frac*C} ${C}`, offset:-acc*C };
    acc += frac;
    return a;
  });

  // ——— Pipeline por estado ———
  const pipeline = Object.entries(STATUSES).map(([k,s])=>({ key:k, label:s.label, color:s.color, n: videos.filter(v=>v.status===k).length }));
  const maxPipe = Math.max(1, ...pipeline.map(p=>p.n));

  // ——— Publicaciones por día de la semana ———
  const dayCounts = [0,0,0,0,0,0,0];
  videos.forEach(v=>{ if(v.status==="publicado" && v.date){ dayCounts[(new Date(v.date+"T00:00").getDay()+6)%7]++; } });
  const maxDay = Math.max(1, ...dayCounts);

  const published = videos.filter(v=>v.status==="publicado").length;

  // ——— NUEVAS ESTADÍSTICAS ———

  // Reparto Shorts vs Vídeos largos
  const shorts = videos.filter(v=>v.type==="short").length;
  const largos = videos.filter(v=>v.type==="largo").length;
  const totalType = shorts + largos;

  // Vídeos programados esta semana (con fecha en la semana actual)
  const weekStart = new Date(thisMonday), weekEnd = new Date(thisMonday); weekEnd.setDate(weekEnd.getDate()+7);
  const thisWeekVideos = videos.filter(v=>v.date && (()=>{ const t=new Date(v.date+"T00:00"); return t>=weekStart && t<weekEnd; })()).length;

  // Vídeos pendientes de publicar (todo lo que no está publicado y tiene fecha)
  const pendingScheduled = videos.filter(v=>v.status!=="publicado" && v.date).length;
  const ideasPool = videos.filter(v=>v.status==="idea" && !v.date).length;

  // Progreso de checklist global (media de completitud de todas las checklists)
  let checkSum = 0, checkCount = 0;
  videos.forEach(v=>{
    if(Array.isArray(v.checklist) && v.checklist.length){
      const done = v.checklist.filter(c=>c.done).length;
      checkSum += done/v.checklist.length; checkCount++;
    }
  });
  const avgChecklist = checkCount ? Math.round(checkSum/checkCount*100) : 0;

  // Tareas: totales, pendientes, completadas, urgentes, vencidas
  const allTasksFlat = taskLists.flatMap(l=>l.tasks||[]);
  const tasksPending = allTasksFlat.filter(t=>!t.done).length;
  const tasksDoneTotal = allTasksFlat.filter(t=>t.done).length;
  const tasksUrgent = allTasksFlat.filter(t=>!t.done && t.urgent).length;
  const tasksOverdue = allTasksFlat.filter(t=>!t.done && t.due && new Date(t.due).getTime()<now).length;
  const taskCompletion = (tasksPending+tasksDoneTotal)>0 ? Math.round(tasksDoneTotal/(tasksPending+tasksDoneTotal)*100) : 0;

  // Publicaciones por mes (últimos 6 meses)
  const monthsArr = Array.from({length:6},(_,i)=>{
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth()-(5-i));
    return { y:d.getFullYear(), m:d.getMonth(), label:d.toLocaleDateString("es-ES",{month:"short"}), count:0 };
  });
  videos.forEach(v=>{
    if(v.status==="publicado" && v.date){
      const t = new Date(v.date+"T00:00");
      const slot = monthsArr.find(x=>x.y===t.getFullYear() && x.m===t.getMonth());
      if(slot) slot.count++;
    }
  });
  const maxMonth = Math.max(1, ...monthsArr.map(m=>m.count));

  // Ritmo: media de vídeos publicados por semana (sobre las 8 semanas)
  const avgPerWeek = (weeks.reduce((a,w)=>a+w.count,0)/8).toFixed(1);

  const box = {background:"var(--bg-2)",border:"1px solid var(--border)",borderRadius:14,padding:"17px 18px"};
  const boxTitle = {fontSize:13,fontWeight:700,color:"var(--text)",marginBottom:14,display:"flex",alignItems:"center",gap:8};

  return (
    <div className="fade-in" style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{marginBottom:4}}>
        <h2 style={{fontSize:20,fontWeight:700}}>Estadísticas</h2>
        <p style={{fontSize:12.5,color:"var(--text-2)",marginTop:2}}>Tu productividad de un vistazo</p>
      </div>

      {/* Tarjetas resumen */}
      <div className="stats-cards" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
        <StatCard label="Racha sin vencidas" value={streak+"d"} sub={streak>0?"días sin tareas vencidas":"tienes tareas vencidas"} color={streak>0?"var(--green)":"var(--red)"} icon={Icons.flag}/>
        <StatCard label="Publicados" value={published} sub="vídeos en total" icon={Icons.check}/>
        <StatCard label="Ritmo semanal" value={avgPerWeek} sub="vídeos/semana (media 8 sem.)" color="var(--gold)" icon={Icons.chart}/>
        <StatCard label="Producción media" value={avgProd!==null?avgProd.toFixed(1)+"d":"—"} sub={avgProd!==null?"de idea a publicado":"aún sin datos"} color="var(--purple)" icon={Icons.clock}/>
        <StatCard label="Esta semana" value={thisWeekVideos} sub="vídeos programados" color="var(--blue)" icon={Icons.calendar}/>
        <StatCard label="En cola" value={pendingScheduled} sub={`+ ${ideasPool} ideas sin fecha`} color="var(--orange)" icon={Icons.kanban}/>
        <StatCard label="Tareas hechas" value={taskCompletion+"%"} sub={`${tasksDoneTotal} de ${tasksPending+tasksDoneTotal}`} color="var(--green)" icon={Icons.tasks}/>
        <StatCard label="Checklist media" value={avgChecklist+"%"} sub="progreso de producción" color="var(--gold)" icon={Icons.check}/>
      </div>

      <div className="stats-grid" style={{display:"grid",gridTemplateColumns:"3fr 2fr",gap:14,alignItems:"start"}}>
        {/* Publicados por semana */}
        <div style={box}>
          <div style={boxTitle}>{Icons.chart} Vídeos publicados por semana</div>
          <div style={{display:"flex",alignItems:"flex-end",gap:8,height:150,padding:"0 4px"}}>
            {weeks.map((w,i)=>(
              <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:6,height:"100%",justifyContent:"flex-end"}}>
                <span style={{fontSize:11,fontWeight:700,color:w.count?"var(--gold)":"var(--text-3)"}}>{w.count||""}</span>
                <div title={`${w.count} vídeo(s)`} style={{
                  width:"100%",maxWidth:38,borderRadius:"6px 6px 2px 2px",
                  height:`${Math.max(4,(w.count/maxWeek)*100)}%`,
                  background: w.count===0 ? "var(--track)" : (w.isThis?"linear-gradient(180deg,#FFD700,#D4AF37)":"linear-gradient(180deg,#D4AF37aa,#8a7320)"),
                  boxShadow: w.count&&w.isThis?"0 0 14px rgba(212,175,55,0.35)":"none",
                  transition:"height .4s ease"
                }}/>
                <span style={{fontSize:9.5,color:w.isThis?"var(--gold)":"var(--text-3)",fontWeight:w.isThis?700:400,whiteSpace:"nowrap"}}>{w.isThis?"Esta sem.":w.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Donut por formato */}
        <div style={box}>
          <div style={boxTitle}>{Icons.tag} Reparto por formato</div>
          {totalFmt===0 ? <div style={{color:"var(--empty)",fontSize:12,textAlign:"center",padding:"30px 0"}}>Sin vídeos todavía</div> : (
            <div style={{display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
              <svg width="130" height="130" viewBox="0 0 130 130" style={{flexShrink:0}}>
                <circle cx="65" cy="65" r={R} fill="none" stroke="var(--track)" strokeWidth="15"/>
                {arcs.map((a,i)=>(
                  <circle key={i} cx="65" cy="65" r={R} fill="none" stroke={a.color} strokeWidth="15"
                    strokeDasharray={a.dash} strokeDashoffset={a.offset} transform="rotate(-90 65 65)" strokeLinecap="butt"/>
                ))}
                <text x="65" y="61" textAnchor="middle" fill="var(--text)" fontSize="21" fontWeight="800" fontFamily="Sora">{totalFmt}</text>
                <text x="65" y="78" textAnchor="middle" fill="var(--text-3)" fontSize="9.5">vídeos</text>
              </svg>
              <div style={{display:"flex",flexDirection:"column",gap:6,flex:1,minWidth:120}}>
                {fmtData.slice(0,6).map(f=>(
                  <div key={f.key} style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{width:9,height:9,borderRadius:3,background:f.color,flexShrink:0}}/>
                    <span style={{fontSize:11.5,color:"var(--text-2)",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.label}</span>
                    <span style={{fontSize:11.5,fontWeight:700,color:"var(--text)"}}>{f.n}</span>
                    <span style={{fontSize:10,color:"var(--text-3)",width:32,textAlign:"right"}}>{Math.round(f.n/totalFmt*100)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Pipeline de producción */}
        <div style={box}>
          <div style={boxTitle}>{Icons.kanban} Estado de la producción</div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {pipeline.map(p=>(
              <div key={p.key} style={{display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:11.5,color:"var(--text-2)",width:86,flexShrink:0}}>{p.label}</span>
                <div style={{flex:1,height:20,background:"var(--track)",borderRadius:6,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${(p.n/maxPipe)*100}%`,minWidth:p.n?18:0,background:`linear-gradient(90deg,${p.color}cc,${p.color}77)`,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"flex-end",paddingRight:6,transition:"width .4s ease"}}>
                    {p.n>0 && <span style={{fontSize:10.5,fontWeight:800,color:"#000"}}>{p.n}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Publicaciones por día de la semana */}
        <div style={box}>
          <div style={boxTitle}>{Icons.calendar} Tu día de publicar</div>
          <div style={{display:"flex",gap:7,alignItems:"flex-end",height:110}}>
            {DAYS.map((d,i)=>(
              <div key={d} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:5,height:"100%",justifyContent:"flex-end"}}>
                <div title={`${dayCounts[i]} publicado(s)`} style={{
                  width:"100%",maxWidth:30,borderRadius:5,
                  height:`${Math.max(6,(dayCounts[i]/maxDay)*100)}%`,
                  background: dayCounts[i]===0?"var(--track)":`rgba(212,175,55,${0.25+0.75*(dayCounts[i]/maxDay)})`,
                  transition:"height .4s ease"
                }}/>
                <span style={{fontSize:10,color: dayCounts[i]===maxDay&&maxDay>0?"var(--gold)":"var(--text-3)",fontWeight:dayCounts[i]===maxDay&&maxDay>0?700:400}}>{d.slice(0,2)}</span>
              </div>
            ))}
          </div>
          <p style={{fontSize:11,color:"var(--text-3)",marginTop:10}}>Días de la semana en que más publicas (vídeos con estado «Publicado»)</p>
        </div>

        {/* Publicaciones por mes (últimos 6 meses) */}
        <div style={box}>
          <div style={boxTitle}>{Icons.chart} Publicaciones por mes</div>
          <div style={{display:"flex",alignItems:"flex-end",gap:9,height:130,padding:"0 4px"}}>
            {monthsArr.map((m,i)=>(
              <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:6,height:"100%",justifyContent:"flex-end"}}>
                <span style={{fontSize:11,fontWeight:700,color:m.count?"var(--purple)":"var(--text-3)"}}>{m.count||""}</span>
                <div title={`${m.count} publicado(s)`} style={{
                  width:"100%",maxWidth:40,borderRadius:"6px 6px 2px 2px",
                  height:`${Math.max(4,(m.count/maxMonth)*100)}%`,
                  background: m.count===0?"var(--track)":"linear-gradient(180deg,#a78bfa,#7c3aed)",
                  transition:"height .4s ease"
                }}/>
                <span style={{fontSize:10,color:"var(--text-3)",textTransform:"capitalize"}}>{m.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Shorts vs Largos */}
        <div style={box}>
          <div style={boxTitle}>{Icons.short} Shorts vs Vídeos largos</div>
          {totalType===0 ? <div style={{color:"var(--empty)",fontSize:12,textAlign:"center",padding:"30px 0"}}>Sin vídeos todavía</div> : (
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <div style={{display:"flex",height:26,borderRadius:8,overflow:"hidden",border:"1px solid var(--border)"}}>
                {shorts>0 && <div style={{width:`${shorts/totalType*100}%`,background:"linear-gradient(90deg,#60a5fa,#2563eb)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <span style={{fontSize:11,fontWeight:800,color:"#fff"}}>{Math.round(shorts/totalType*100)}%</span>
                </div>}
                {largos>0 && <div style={{width:`${largos/totalType*100}%`,background:"linear-gradient(90deg,#D4AF37,#8a7320)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <span style={{fontSize:11,fontWeight:800,color:"#000"}}>{Math.round(largos/totalType*100)}%</span>
                </div>}
              </div>
              <div style={{display:"flex",justifyContent:"space-around",gap:10}}>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:24,fontWeight:800,fontFamily:"Sora",color:"var(--blue)"}}>{shorts}</div>
                  <div style={{fontSize:11,color:"var(--text-3)",display:"flex",alignItems:"center",gap:5,justifyContent:"center"}}><span style={{width:9,height:9,borderRadius:3,background:"var(--blue)"}}/>Shorts</div>
                </div>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:24,fontWeight:800,fontFamily:"Sora",color:"var(--gold)"}}>{largos}</div>
                  <div style={{fontSize:11,color:"var(--text-3)",display:"flex",alignItems:"center",gap:5,justifyContent:"center"}}><span style={{width:9,height:9,borderRadius:3,background:"var(--gold)"}}/>Largos</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Estado de las tareas */}
        <div style={box}>
          <div style={boxTitle}>{Icons.tasks} Estado de tus tareas</div>
          {(tasksPending+tasksDoneTotal)===0 ? <div style={{color:"var(--empty)",fontSize:12,textAlign:"center",padding:"30px 0"}}>Sin tareas todavía</div> : (
            <div style={{display:"flex",flexDirection:"column",gap:11}}>
              {[
                {label:"Completadas", n:tasksDoneTotal, color:"var(--green)"},
                {label:"Pendientes", n:tasksPending, color:"var(--blue)"},
                {label:"Urgentes", n:tasksUrgent, color:"var(--gold)"},
                {label:"Vencidas", n:tasksOverdue, color:"var(--red)"},
              ].map((r,i)=>{
                const mx = Math.max(1, tasksPending+tasksDoneTotal);
                return (
                  <div key={i} style={{display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:11.5,color:"var(--text-2)",width:88,flexShrink:0}}>{r.label}</span>
                    <div style={{flex:1,height:18,background:"var(--track)",borderRadius:5,overflow:"hidden"}}>
                      <div style={{height:"100%",width:`${(r.n/mx)*100}%`,minWidth:r.n?16:0,background:r.color,borderRadius:5,display:"flex",alignItems:"center",justifyContent:"flex-end",paddingRight:6,transition:"width .4s ease"}}>
                        {r.n>0 && <span style={{fontSize:10,fontWeight:800,color:"#000"}}>{r.n}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================ PAPELERA ============================ */
function TrashView({trash, onRestore, onDeleteForever, onEmpty, formats}) {
  const fmtDate = ts => {
    if(!ts) return "";
    const d = new Date(ts);
    return d.toLocaleDateString("es-ES",{day:"numeric",month:"short"}) + " · " + d.toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"});
  };
  return (
    <div className="fade-in">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18,flexWrap:"wrap",gap:12}}>
        <div>
          <h2 style={{fontSize:20,fontWeight:700}}>Papelera</h2>
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
function StatStrip({videos}) {
  const count = st => videos.filter(v=>v.status===st).length;
  const items = [
    {label:"Total vídeos", value:videos.length, icon:Icons.calendar, color:"var(--text)"},
    {label:"Ideas en bruto", value:count("idea"), icon:Icons.sparkle, color:STATUSES.idea.color},
    {label:"Grabados", value:count("grabacion"), icon:Icons.camera, color:STATUSES.grabacion.color},
    {label:"Editados", value:count("edicion"), icon:Icons.scissors, color:STATUSES.edicion.color},
    {label:"Programados", value:count("programado"), icon:Icons.clock, color:STATUSES.programado.color},
    {label:"Publicados", value:count("publicado"), icon:Icons.check, color:STATUSES.publicado.color},
  ];
  return (
    <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:10,marginBottom:22}} className="stat-grid">
      {items.map((it,i)=>(
        <div key={i} style={{background:"var(--bg-2)",border:"1px solid var(--border)",borderRadius:13,padding:"13px 14px",display:"flex",alignItems:"center",gap:11}}>
          <div style={{width:36,height:36,borderRadius:10,flexShrink:0,background:"var(--card)",display:"flex",alignItems:"center",justifyContent:"center",color:it.color||"var(--text-2)"}}>{it.icon}</div>
          <div style={{minWidth:0}}>
            <div style={{fontSize:21,fontWeight:700,fontFamily:"'Sora'",color:it.color||"var(--text)",lineHeight:1.1}}>{it.value}</div>
            <div style={{fontSize:10,color:"var(--text-3)",textTransform:"uppercase",letterSpacing:".03em",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{it.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ============================ APP ============================ */
/* ============================ PERSISTENCIA (localStorage) ============================ */
const STORE_KEY = "rivals_studio_v1";
function loadStore() {
  try {
    const raw = (typeof window !== "undefined" && window.studioFS) ? window.studioFS.load() : localStorage.getItem(STORE_KEY);
    if(!raw) return null;
    const data = JSON.parse(raw);
    if(!data || !Array.isArray(data.videos) || typeof data.formats!=="object") return null;
    // Reajustar el contador de ids para no colisionar con los guardados
    let maxId = 100;
    data.videos.forEach(v=>{ const n = parseInt(String(v.id).replace(/\D/g,"")); if(!isNaN(n) && n>maxId) maxId=n; });
    _id = maxId;
    return data;
  } catch(e) { return null; }
}
function saveStore(videos, formats, trash, taskLists, tombstones, dailyArchive, tagTemplates, subHistory, promptTemplates, goals) {
  try {
    const txt = JSON.stringify({ videos, formats, trash: trash||[], taskLists: taskLists||[], tombstones: tombstones||[], dailyArchive: dailyArchive||{}, tagTemplates: tagTemplates||[], subHistory: subHistory||[], promptTemplates: promptTemplates||[], goals: goals||null, savedAt: Date.now() });
    if(window.studioFS) window.studioFS.save(txt); else localStorage.setItem(STORE_KEY, txt);
    return true;
  }
  catch(e) { return false; }
}
function clearStore() { try { if(window.studioFS) window.studioFS.clear(); localStorage.removeItem(STORE_KEY); } catch(e){} }

/* ============================ TAREAS: datos y notificaciones ============================ */
let _tid = 0;
const tid = () => "t" + Date.now().toString(36) + (++_tid);
const DEFAULT_TASK_LISTS = [
  { id:"lst_daily", name:"Tareas diarias", fixed:true, tasks:[], updatedAt:0 },
  { id:"lst_default", name:"Mis tareas", tasks:[], updatedAt:0 }
];
// Pide permiso de notificaciones (devuelve el estado final)
async function askNotifPermission() {
  if(typeof Notification === "undefined") return "unsupported";
  if(Notification.permission === "granted") return "granted";
  if(Notification.permission === "denied") return "denied";
  try { return await Notification.requestPermission(); } catch(e){ return "denied"; }
}
// Lanza una notificación si hay permiso; si no, devuelve false para avisar por toast
function fireNotification(title, body) {
  try {
    if(typeof Notification !== "undefined" && Notification.permission === "granted") {
      // Preferir el Service Worker (funciona con la pestaña en segundo plano)
      if(!window.studioFS && navigator.serviceWorker && navigator.serviceWorker.controller){
        navigator.serviceWorker.ready.then(reg=>{
          reg.showNotification(title, { body, icon:NOTIF_ICON, badge:NOTIF_ICON, tag:"rderandom-"+Date.now(), requireInteraction:true, vibrate:[120,60,120] });
        }).catch(()=>{ try { new Notification(title, { body }); } catch(e){} });
        return true;
      }
      new Notification(title, { body, tag:"rderandom-"+Date.now() });
      return true;
    }
  } catch(e){}
  return false;
}
// Icono para las notificaciones (data URI dorado)
const NOTIF_ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='22' fill='%23D4AF37'/%3E%3Ctext x='50' y='68' font-size='58' text-anchor='middle' fill='%23000' font-family='sans-serif' font-weight='bold'%3ER%3C/text%3E%3C/svg%3E";

// Registrar un Service Worker mínimo (permite notificaciones con la pestaña en segundo plano)
function registerNotifSW(){
  if(!("serviceWorker" in navigator)) return;
  try {
    const swCode = `
      self.addEventListener("install", e=>self.skipWaiting());
      self.addEventListener("activate", e=>e.waitUntil(self.clients.claim()));
      self.addEventListener("notificationclick", e=>{
        e.notification.close();
        e.waitUntil(clients.matchAll({type:"window"}).then(cs=>{
          for(const c of cs){ if("focus" in c) return c.focus(); }
          if(clients.openWindow) return clients.openWindow("/");
        }));
      });
    `;
    const blob = new Blob([swCode], {type:"text/javascript"});
    const url = URL.createObjectURL(blob);
    navigator.serviceWorker.register(url).catch(()=>{});
  } catch(e){}
}

/* ============================ SINCRONIZACIÓN (Supabase) ============================ */
const SUPABASE_URL = "https://krzuellhsakbwavlahxg.supabase.co";
const SUPABASE_KEY = "sb_publishable_FWzHwkpMr4bOQYjakGGmpg_ZqEFFYCO";
const SYNC_CODE_KEY = "rivals_sync_code";

/* ——— Migración v2.0 (23/8/2026): unificar dispositivos en un solo código ———
   Los dispositivos que quedaron con un código antiguo adoptan el principal y
   bajan los datos buenos de la nube; su copia local queda guardada aparte. */
const MAIN_SYNC_CODE = "a4c23831-be67-4c4c-92d9-f6743acc101e";
const OLD_SYNC_CODES = [
  "c0d7db98-8d11-4dd6-96ad-48c0cd1597a3","afcec6ff-45e7-4f13-8941-21a39a1bbb9b",
  "9de107ab-dac9-4057-85fe-ffdddad4d3d1","43385365-0958-4969-9630-51fab07ec984",
  "89716416-07ef-490c-8c9a-fc277a76ba8b","d48a6235-ea9c-4bd3-9353-91ea23415704",
  "a2f14e77-94fe-4aab-a3f0-eda8f32e6b80","51333649-f1d3-4a15-bdf6-519f2d13538e",
  "1756ebd4-725c-4827-bbf1-9d280b94204c","6d532724-d6ec-4cd2-90db-db08b8e10d1f",
  "3f7de999-095c-43f9-8797-eae1216ce7c6","bed89e86-a315-41a3-b00a-ba2899e2c807"
];
(function migrarCodigoSync(){
  try {
    const c = localStorage.getItem(SYNC_CODE_KEY);
    if(c && OLD_SYNC_CODES.includes(c)){
      const prev = localStorage.getItem("rivals_studio_v1");
      if(prev) localStorage.setItem("rivals_studio_v1_backup_migracion", prev);
      localStorage.removeItem("rivals_studio_v1");
      localStorage.setItem(SYNC_CODE_KEY, MAIN_SYNC_CODE);
    }
  } catch(e){}
})();

/* ============================ YOUTUBE + DRIVE (integración) ============================ */
// URL del backend en Vercel y el Client ID de Google (OAuth). Rellena YT_CLIENT_ID con tu ID real.
const YT_BACKEND = "https://rderandom-backend.vercel.app";
const YT_CLIENT_ID = "376576989643-7hidirnma3vjqru2uppjfl5upg94n6vs.apps.googleusercontent.com";
const YT_REDIRECT = "https://manugrraa.github.io/random-studio/"; // debe coincidir con Google Cloud
const YT_TOKEN_KEY = "rds_yt_tokens";
const YT_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube",
  "https://www.googleapis.com/auth/youtube.force-ssl",
  "https://www.googleapis.com/auth/drive.readonly",
  // Analíticas (visitas e ingresos) para el panel de Objetivos
  "https://www.googleapis.com/auth/yt-analytics.readonly",
  "https://www.googleapis.com/auth/yt-analytics-monetary.readonly"
].join(" ");

/* ============================ GEMINI (IA gratuita, opcional) ============================ */
// La clave la genera el usuario gratis en https://aistudio.google.com/apikey y se guarda local.
const GEMINI_KEY_STORE = "rds_gemini_key";
const GEMINI_MODEL_STORE = "rds_gemini_model"; // modelo que el usuario prefiere / que funcionó
const GEMINI_SYSTEM_STORE = "rds_gemini_system"; // instrucciones de sistema (tipo "Gem")
// Modelos gratuitos a probar, del mejor al más compatible. gemini-flash-latest es un alias
// estable que apunta siempre al Flash vigente (evita errores 404 por nombres caducados).
// Modelos gratuitos ESTABLES y vigentes (jul 2026), del mejor al de respaldo.
// Notas: gemini-2.0-flash se discontinuó (jun 2026); gemini-2.5-flash-lite pasó a ser
// SOLO de pago para cuentas nuevas; gemini-flash-latest es experimental (límites muy bajos).
const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-3.5-flash"];

function geminiGetKey(){ try { return localStorage.getItem(GEMINI_KEY_STORE) || ""; } catch(e){ return ""; } }
function geminiSaveKey(k){ try { localStorage.setItem(GEMINI_KEY_STORE, k||""); } catch(e){} }
function geminiHasKey(){ return !!geminiGetKey(); }
function geminiGetModel(){
  try {
    const m = localStorage.getItem(GEMINI_MODEL_STORE) || "";
    // Ignorar modelos ya retirados o experimentales que guardaron versiones anteriores,
    // para que no se usen como preferidos y provoquen 404/429.
    const obsoletos = ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-2.5-flash-lite", "gemini-flash-latest", "gemini-1.5-flash", "gemini-1.5-pro"];
    if(obsoletos.includes(m)){ localStorage.removeItem(GEMINI_MODEL_STORE); return ""; }
    return m;
  } catch(e){ return ""; }
}
function geminiSaveModel(m){ try { if(m) localStorage.setItem(GEMINI_MODEL_STORE, m); } catch(e){} }
function geminiGetSystem(){ try { return localStorage.getItem(GEMINI_SYSTEM_STORE) || ""; } catch(e){ return ""; } }
function geminiSaveSystem(s){ try { localStorage.setItem(GEMINI_SYSTEM_STORE, s||""); } catch(e){} }

// Llama a un modelo concreto de Gemini. Devuelve {ok, text, status, error}.
async function geminiCall(model, prompt, system){
  const key = geminiGetKey();
  const url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + encodeURIComponent(key);
  const build = (maxTok) => {
    const b = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.9,
        maxOutputTokens: maxTok
      }
    };
    // El "thinking" consume tokens de la salida y puede dejar la respuesta vacía.
    // Los modelos 2.5 aceptan thinkingBudget (número); los de la serie 3 usan
    // thinkingLevel (texto). Enviar el campo equivocado da error 400, así que adaptamos.
    if(/^gemini-2\.5/.test(model)){
      b.generationConfig.thinkingConfig = { thinkingBudget: 0 };
    } else if(/^gemini-3/.test(model)){
      b.generationConfig.thinkingConfig = { thinkingLevel: "minimal" };
    }
    if(system && system.trim()) b.systemInstruction = { parts: [{ text: system.trim() }] };
    return b;
  };
  const doPost = async (maxTok, sinThinking) => {
    try {
      const b = build(maxTok);
      if(sinThinking && b.generationConfig.thinkingConfig) delete b.generationConfig.thinkingConfig;
      const res = await fetch(url, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(b) });
      const data = await res.json().catch(()=>({}));
      return { res, data };
    } catch(e){ return { res:{ok:false,status:0}, data:{} }; }
  };

  let { res, data } = await doPost(2048);

  // Si el modelo rechaza el campo de thinking (400 con mención a thinking), reintentar sin él
  if(!res.ok && res.status===400 && /think/i.test(data?.error?.message||"")){
    const retry = await doPost(8192, true);
    res = retry.res; data = retry.data;
  }

  // Si la respuesta salió vacía por MAX_TOKENS (thinking), reintentar UNA vez con más espacio.
  const emptyByMaxTokens = (rr, dd) => rr.ok && !(dd?.candidates?.[0]?.content?.parts?.some(p=>p.text))
    && dd?.candidates?.[0]?.finishReason==="MAX_TOKENS";
  if(emptyByMaxTokens(res, data)){
    const retry = await doPost(8192);
    res = retry.res; data = retry.data;
  }

  if(res.ok){
    const cand = data?.candidates?.[0];
    const text = cand?.content?.parts?.map(p=>p.text).filter(Boolean).join("") || "";
    if(text) return { ok:true, text: text.trim() };
    // Respuesta vacía: distinguir la causa real
    const reason = cand?.finishReason;
    if(reason==="MAX_TOKENS"){
      return { ok:false, status:200, error:"La respuesta se quedó sin espacio. Prueba un prompt más corto." };
    }
    if(reason==="SAFETY" || reason==="PROHIBITED_CONTENT"){
      return { ok:false, status:200, error:"Gemini bloqueó la respuesta por seguridad. Reformula el prompt." };
    }
    if(!data?.candidates || data.candidates.length===0){
      const block = data?.promptFeedback?.blockReason;
      if(block) return { ok:false, status:200, error:"Gemini bloqueó la petición ("+block+"). Reformula el prompt." };
    }
    return { ok:false, status:200, error: reason ? ("Gemini no generó texto ("+reason+")") : "Gemini no devolvió texto" };
  }
  const msg = data?.error?.message || "";
  return { ok:false, status:res.status, error: msg || ("Error "+res.status), notFound: res.status===404 };
}

// Genera texto probando modelos hasta que uno funcione. Recuerda el que funcionó.
async function geminiGenerate(prompt, systemOverride){
  const key = geminiGetKey();
  if(!key) throw new Error("Falta la clave de Gemini. Configúrala en el apartado Agente.");
  const system = (systemOverride!=null ? systemOverride : geminiGetSystem());

  // Orden de modelos: primero el que el usuario haya fijado, luego los estables por defecto.
  const preferred = geminiGetModel();
  const models = [preferred, ...GEMINI_MODELS].filter((m,i,arr)=> m && arr.indexOf(m)===i);

  let lastErr = "No se pudo generar la descripción";
  for(const model of models){
    const r = await geminiCall(model, prompt, system);
    if(r.ok){ geminiSaveModel(model); return r.text; }

    // Errores DEFINITIVOS → parar de inmediato (no malgastar más peticiones ni cuota):
    if(r.status===400 && /API[ _]?key/i.test(r.error))
      throw new Error("La clave de Gemini no es válida. Revísala en el apartado Agente.");
    if(r.status===403)
      throw new Error("Gemini rechazó la clave (403). Habilita la API «Generative Language» para tu clave en Google AI Studio.");
    if(r.status===429)
      // MUY IMPORTANTE: no seguimos probando otros modelos, porque cada intento consume
      // más cuota del minuto y agrava el bloqueo. Paramos y avisamos.
      throw new Error("Límite gratuito de Gemini alcanzado (máx. ~15 por minuto). Espera un minuto y vuelve a intentarlo.");
    if(r.status===200 && /seguridad|bloqueó/i.test(r.error))
      throw new Error(r.error); // bloqueo de contenido: cambiar de modelo no ayuda

    // Modelo retirado para esta cuenta → olvidarlo como preferido y probar el siguiente
    if(/no longer available|not available/i.test(r.error||"")){
      try { if(model === localStorage.getItem(GEMINI_MODEL_STORE)) localStorage.removeItem(GEMINI_MODEL_STORE); } catch(e){}
    }

    // Errores recuperables (404 modelo no disponible, 5xx puntual, sin texto) → probar el siguiente
    lastErr = r.error || lastErr;
  }
  throw new Error(lastErr + ". Prueba de nuevo en un momento o elige otro modelo en el apartado Agente.");
}

// Lee/guarda los tokens de Google en localStorage
function ytGetTokens(){
  try { return JSON.parse(localStorage.getItem(YT_TOKEN_KEY) || "null"); } catch(e){ return null; }
}
function ytSaveTokens(tok){
  try { localStorage.setItem(YT_TOKEN_KEY, JSON.stringify(tok)); } catch(e){}
}
function ytClearTokens(){
  try { localStorage.removeItem(YT_TOKEN_KEY); } catch(e){}
}
function ytIsConnected(){
  const t = ytGetTokens();
  return !!(t && t.access_token);
}
// ¿El accessToken sigue vigente? (con margen de 2 min)
function ytTokenValid(){
  const t = ytGetTokens();
  return !!(t && t.access_token && t.expires_at && Date.now() < t.expires_at - 120000);
}

// Inicia el flujo OAuth de Google usando el "token flow" del lado cliente (implicit),
// que no necesita backend para autenticarse; el backend solo se usa para subir.
function ytStartAuth(){
  const params = new URLSearchParams({
    client_id: YT_CLIENT_ID,
    redirect_uri: YT_REDIRECT,
    response_type: "token",
    scope: YT_SCOPES,
    include_granted_scopes: "true",
    prompt: "consent",
    state: "yt_auth"
  });
  const authUrl = "https://accounts.google.com/o/oauth2/v2/auth?" + params.toString();
  if(window.studioFS && window.studioFS.oauth){
    window.studioFS.oauth(authUrl, YT_REDIRECT, {}).then(hash=>{
      const h = new URLSearchParams(String(hash||"").replace(/^#/,""));
      const at = h.get("access_token");
      if(at){
        ytSaveTokens({ access_token: at, expires_at: Date.now() + (parseInt(h.get("expires_in")||"3600",10))*1000 });
        window.location.reload();
      }
    });
    return;
  }
  window.location.href = authUrl;
}

// Renovación SILENCIOSA del token: pide uno nuevo sin interacción usando un iframe oculto
// con prompt=none. Google renueva el token si la sesión sigue activa, sin recargar la app.
let _ytSilentInFlight = null;
function ytSilentRefresh(){
  if(_ytSilentInFlight) return _ytSilentInFlight;
  if(window.studioFS && window.studioFS.oauth){
    _ytSilentInFlight = (async ()=>{
      try {
        const params = new URLSearchParams({
          client_id: YT_CLIENT_ID, redirect_uri: YT_REDIRECT, response_type: "token",
          scope: YT_SCOPES, include_granted_scopes: "true", prompt: "none", state: "yt_silent"
        });
        const hash = await window.studioFS.oauth("https://accounts.google.com/o/oauth2/v2/auth?" + params.toString(), YT_REDIRECT, { silent: true });
        const h = new URLSearchParams(String(hash||"").replace(/^#/,""));
        const at = h.get("access_token");
        if(at){
          ytSaveTokens({ access_token: at, expires_at: Date.now() + (parseInt(h.get("expires_in")||"3600",10))*1000 });
          return true;
        }
        return false;
      } catch(e){ return false; }
      finally { _ytSilentInFlight = null; }
    })();
    return _ytSilentInFlight;
  }
  _ytSilentInFlight = new Promise((resolve)=>{
    try {
      const frame = document.createElement("iframe");
      frame.style.display = "none";
      const params = new URLSearchParams({
        client_id: YT_CLIENT_ID,
        redirect_uri: YT_REDIRECT,
        response_type: "token",
        scope: YT_SCOPES,
        include_granted_scopes: "true",
        prompt: "none",
        state: "yt_silent"
      });
      let done = false;
      const cleanup = (ok)=>{ if(done) return; done=true; try{ document.body.removeChild(frame); }catch(e){} window.removeEventListener("message", onMsg); _ytSilentInFlight=null; resolve(ok); };
      const onMsg = (ev)=>{
        if(ev.source !== frame.contentWindow) return;
        const data = ev.data || {};
        if(data.type === "yt_silent_token"){
          if(data.access_token){
            ytSaveTokens({ access_token: data.access_token, expires_at: Date.now() + (parseInt(data.expires_in||"3600",10))*1000 });
            cleanup(true);
          } else cleanup(false);
        }
      };
      window.addEventListener("message", onMsg);
      frame.src = "https://accounts.google.com/o/oauth2/v2/auth?" + params.toString();
      document.body.appendChild(frame);
      // Tiempo máximo de espera
      setTimeout(()=>cleanup(false), 8000);
    } catch(e){ _ytSilentInFlight=null; resolve(false); }
  });
  return _ytSilentInFlight;
}

// Asegura un token válido: si está por caducar, intenta renovarlo en silencio.
async function ytEnsureToken(){
  if(ytTokenValid()) return true;
  if(!ytIsConnected()) return false;
  return await ytSilentRefresh();
}

// Al volver de Google, la URL trae #access_token=...&expires_in=... → lo capturamos
function ytCaptureAuthFromHash(){
  if(!window.location.hash) return false;
  const h = new URLSearchParams(window.location.hash.slice(1));
  const at = h.get("access_token");
  const state = h.get("state");
  if(!at) return false;
  const expiresIn = parseInt(h.get("expires_in")||"3600",10);
  // Si venimos de una renovación silenciosa (dentro de un iframe), avisamos al padre
  if(state === "yt_silent" && window.parent !== window){
    window.parent.postMessage({ type:"yt_silent_token", access_token: at, expires_in: expiresIn }, "*");
    return false;
  }
  ytSaveTokens({ access_token: at, expires_at: Date.now() + expiresIn*1000 });
  history.replaceState(null, "", window.location.pathname + window.location.search);
  return true;
}

// Busca en Drive un vídeo cuyo nombre coincida (exacto o que empiece por) con el título
async function ytSearchDrive(title){
  const t = ytGetTokens();
  if(!t || !t.access_token) throw new Error("No conectado a Google");
  // Escapamos comillas simples para la query de Drive
  const safe = title.replace(/'/g, "\\'");
  const q = `(name = '${safe}' or name contains '${safe}') and mimeType contains 'video/' and trashed = false`;
  const url = "https://www.googleapis.com/drive/v3/files?" + new URLSearchParams({
    q,
    spaces: "drive",
    fields: "files(id,name,size,mimeType,modifiedTime)",
    orderBy: "modifiedTime desc",
    pageSize: "10"
  });
  const res = await fetch(url, { headers: { Authorization: "Bearer " + t.access_token } });
  if(res.status === 401){ ytClearTokens(); throw new Error("Sesión de Google caducada, vuelve a conectar"); }
  if(!res.ok) throw new Error("Error al buscar en Drive ("+res.status+")");
  const data = await res.json();
  return data.files || [];
}

// Pide al backend que descargue de Drive y suba a YouTube (programado)
async function ytUploadViaBackend(payload){
  const res = await fetch(YT_BACKEND + "/api/youtube/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(()=>({}));
  if(!res.ok || !data.success) throw new Error(data.error || data.details || "Error al subir a YouTube");
  return data;
}

// Cabecera de autorización para llamadas directas a la API de YouTube
function ytAuthHeader(){
  const t = ytGetTokens();
  if(!t || !t.access_token) throw new Error("No conectado a Google");
  return { Authorization: "Bearer " + t.access_token };
}

// Lista las playlists del usuario (para elegir dónde añadir el vídeo)
async function ytListPlaylists(){
  const url = "https://www.googleapis.com/youtube/v3/playlists?" + new URLSearchParams({
    part: "snippet", mine: "true", maxResults: "50"
  });
  const res = await fetch(url, { headers: ytAuthHeader() });
  if(res.status===401){ ytClearTokens(); throw new Error("Sesión de Google caducada"); }
  if(!res.ok) throw new Error("Error al leer playlists ("+res.status+")");
  const data = await res.json();
  return (data.items||[]).map(p=>({ id:p.id, title:p.snippet?.title||"(sin título)" }));
}

// Lee estadísticas del canal del usuario (suscriptores, vídeos, visitas)
async function ytGetChannelStats(){
  // Asegurar token válido (renovación silenciosa si hace falta)
  await ytEnsureToken();
  const doFetch = () => fetch("https://www.googleapis.com/youtube/v3/channels?" + new URLSearchParams({
    part: "statistics,snippet", mine: "true"
  }), { headers: ytAuthHeader() });
  let res = await doFetch();
  // Si el token caducó justo ahora, intentar renovar una vez y reintentar
  if(res.status===401){
    const ok = await ytSilentRefresh();
    if(ok) res = await doFetch();
  }
  if(res.status===401){ ytClearTokens(); throw new Error("Sesión de Google caducada"); }
  if(!res.ok) throw new Error("Error al leer el canal ("+res.status+")");
  const data = await res.json();
  const ch = data.items?.[0];
  if(!ch) return null;
  const st = ch.statistics || {};
  return {
    title: ch.snippet?.title || "",
    thumb: ch.snippet?.thumbnails?.default?.url || null,
    subscribers: st.hiddenSubscriberCount ? null : parseInt(st.subscriberCount||"0",10),
    videos: parseInt(st.videoCount||"0",10),
    views: parseInt(st.viewCount||"0",10)
  };
}

// Lista los vídeos subidos del canal (para copiar datos de uno ya existente)
async function ytListMyVideos(max){
  // 1. Obtener el playlist de subidas del canal
  const chRes = await fetch("https://www.googleapis.com/youtube/v3/channels?" + new URLSearchParams({
    part: "contentDetails", mine: "true"
  }), { headers: ytAuthHeader() });
  if(!chRes.ok) throw new Error("Error al leer el canal ("+chRes.status+")");
  const chData = await chRes.json();
  const uploads = chData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if(!uploads) return [];
  // 2. Últimos vídeos de ese playlist
  const plRes = await fetch("https://www.googleapis.com/youtube/v3/playlistItems?" + new URLSearchParams({
    part: "snippet,contentDetails", playlistId: uploads, maxResults: String(max||15)
  }), { headers: ytAuthHeader() });
  if(!plRes.ok) throw new Error("Error al leer subidas ("+plRes.status+")");
  const plData = await plRes.json();
  return (plData.items||[]).map(it=>({
    id: it.contentDetails?.videoId,
    title: it.snippet?.title || "(sin título)"
  })).filter(v=>v.id);
}

// Convierte una duración ISO 8601 (PT1H2M30S) a segundos
function ytParseDuration(iso){
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso||"");
  if(!m) return 0;
  return (parseInt(m[1]||"0",10)*3600) + (parseInt(m[2]||"0",10)*60) + parseInt(m[3]||"0",10);
}

// Lista COMPLETA de subidas del canal con fecha, duración y estado (para importar).
// Devuelve [{id, title, publishedAt, publishAt, privacyStatus, durationSec}]
async function ytListUploadsFull(max){
  await ytEnsureToken();
  // 1. Playlist de subidas
  const chRes = await fetch("https://www.googleapis.com/youtube/v3/channels?" + new URLSearchParams({
    part: "contentDetails", mine: "true"
  }), { headers: ytAuthHeader() });
  if(!chRes.ok) throw new Error("Error al leer el canal ("+chRes.status+")");
  const chData = await chRes.json();
  const uploads = chData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if(!uploads) return [];
  // 2. Últimos N ids del playlist (paginado: con muchos programados, 50 se quedaba corto)
  const limite = Math.min(max||150, 200);
  const ids = [];
  let pageToken = "";
  while(ids.length < limite){
    const params = { part: "contentDetails", playlistId: uploads, maxResults: "50" };
    if(pageToken) params.pageToken = pageToken;
    const plRes = await fetch("https://www.googleapis.com/youtube/v3/playlistItems?" + new URLSearchParams(params), { headers: ytAuthHeader() });
    if(!plRes.ok) throw new Error("Error al leer subidas ("+plRes.status+")");
    const plData = await plRes.json();
    (plData.items||[]).forEach(it=>{ const id = it.contentDetails?.videoId; if(id) ids.push(id); });
    pageToken = plData.nextPageToken || "";
    if(!pageToken) break;
  }
  // 2b. Unión con la búsqueda directa de MIS vídeos: los programados recientes a veces
  // no aparecen en la lista de subidas (peculiaridad conocida de la API). La búsqueda
  // es cara en cuota, así que solo pedimos la primera página (los 50 más nuevos).
  try {
    const sRes = await fetch("https://www.googleapis.com/youtube/v3/search?" + new URLSearchParams({
      part:"id", forMine:"true", type:"video", order:"date", maxResults:"50"
    }), { headers: ytAuthHeader() });
    if(sRes.ok){
      const sData = await sRes.json();
      (sData.items||[]).forEach(it=>{
        const id = it.id?.videoId;
        if(id && !ids.includes(id)) ids.unshift(id);
      });
    }
  } catch(e){ /* si falla la búsqueda, seguimos con el playlist */ }
  if(ids.length===0) return [];
  // 3. Detalles por lotes de 50
  const items = [];
  for(let i=0; i<Math.min(ids.length, limite); i+=50){
    const vRes = await fetch("https://www.googleapis.com/youtube/v3/videos?" + new URLSearchParams({
      part: "snippet,contentDetails,status,liveStreamingDetails", id: ids.slice(i,i+50).join(",")
    }), { headers: ytAuthHeader() });
    if(!vRes.ok) throw new Error("Error al leer detalles ("+vRes.status+")");
    const vData = await vRes.json();
    (vData.items||[]).forEach(it=>items.push({
      id: it.id,
      title: it.snippet?.title || "(sin título)",
      publishedAt: it.snippet?.publishedAt || null,
      publishAt: it.status?.publishAt || null,
      privacyStatus: it.status?.privacyStatus || "private",
      durationSec: ytParseDuration(it.contentDetails?.duration),
      live: !!(it.liveStreamingDetails && (it.liveStreamingDetails.actualStartTime || it.liveStreamingDetails.scheduledStartTime))
    }));
  }
  return items;
}

// Añade un vídeo a una lista de reproducción (para la subida directa desde el PC)
async function ytAddToPlaylist(playlistId, videoId){
  const res = await fetch("https://www.googleapis.com/youtube/v3/playlistItems?part=snippet", {
    method: "POST",
    headers: { ...ytAuthHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ snippet: { playlistId, resourceId: { kind: "youtube#video", videoId } } })
  });
  if(!res.ok){
    const data = await res.json().catch(()=>({}));
    throw new Error(data?.error?.message || "Error al añadir a la lista ("+res.status+")");
  }
  return true;
}

/* ——— ID del canal propio (cacheado en el dispositivo) ——— */
async function ytMyChannelId(){
  try { const c = localStorage.getItem("rds_channel_id"); if(c) return c; } catch(e){}
  const res = await fetch("https://www.googleapis.com/youtube/v3/channels?part=id&mine=true", { headers: ytAuthHeader() });
  if(!res.ok) throw new Error("Error al leer el canal ("+res.status+")");
  const data = await res.json();
  const id = data.items?.[0]?.id;
  if(id){ try { localStorage.setItem("rds_channel_id", id); } catch(e){} }
  return id;
}

/* ——— Aplicar título/descripción EN YouTube (conservando etiquetas y categoría) ——— */
async function ytUpdateVideoMeta(videoId, cambios){
  await ytEnsureToken();
  const actual = await ytGetVideoDetails(videoId);
  if(!actual) throw new Error("No se pudo leer el vídeo en YouTube");
  const snippet = {
    title: cambios.title!=null ? cambios.title : actual.title,
    description: cambios.description!=null ? cambios.description : actual.description,
    tags: actual.tags||[],
    categoryId: actual.categoryId||"20"
  };
  const res = await fetch("https://www.googleapis.com/youtube/v3/videos?part=snippet", {
    method:"PUT", headers:{ ...ytAuthHeader(), "Content-Type":"application/json" },
    body: JSON.stringify({ id: videoId, snippet })
  });
  if(!res.ok){ const d = await res.json().catch(()=>({})); throw new Error(d?.error?.message||("Error al actualizar en YouTube ("+res.status+")")); }
  return true;
}

/* ——— Reprogramar EN YouTube (nueva fecha/hora de publicación) ——— */
async function ytUpdateSchedule(videoId, isoFecha){
  await ytEnsureToken();
  const res = await fetch("https://www.googleapis.com/youtube/v3/videos?part=status", {
    method:"PUT", headers:{ ...ytAuthHeader(), "Content-Type":"application/json" },
    body: JSON.stringify({ id: videoId, status: { privacyStatus:"private", publishAt: isoFecha, selfDeclaredMadeForKids:false } })
  });
  if(!res.ok){ const d = await res.json().catch(()=>({})); throw new Error(d?.error?.message||("Error al reprogramar ("+res.status+")")); }
  return true;
}

/* ——— Comentarios del canal (hilos recientes de todos los vídeos) ——— */
async function ytListChannelComments(pageToken){
  await ytEnsureToken();
  const chId = await ytMyChannelId();
  const params = { part:"snippet,replies", allThreadsRelatedToChannelId: chId, order:"time", maxResults:"50", textFormat:"plainText" };
  if(pageToken) params.pageToken = pageToken;
  const res = await fetch("https://www.googleapis.com/youtube/v3/commentThreads?" + new URLSearchParams(params), { headers: ytAuthHeader() });
  if(!res.ok){ const d = await res.json().catch(()=>({})); throw new Error(d?.error?.message||("Error al leer comentarios ("+res.status+")")); }
  const data = await res.json();
  return {
    nextPageToken: data.nextPageToken||null,
    canal: chId,
    items: (data.items||[]).map(t=>{
      const c = t.snippet?.topLevelComment?.snippet || {};
      return {
        id: t.snippet?.topLevelComment?.id || t.id,
        videoId: t.snippet?.videoId || c.videoId || "",
        autor: c.authorDisplayName||"",
        autorImg: c.authorProfileImageUrl||"",
        autorCanal: c.authorChannelId?.value||"",
        texto: c.textDisplay||"",
        likes: c.likeCount||0,
        fecha: c.publishedAt||null,
        totalRespuestas: t.snippet?.totalReplyCount||0,
        yaRespondido: (t.replies?.comments||[]).some(r=>r.snippet?.authorChannelId?.value===chId)
      };
    })
  };
}
async function ytReplyComment(parentId, texto){
  await ytEnsureToken();
  const res = await fetch("https://www.googleapis.com/youtube/v3/comments?part=snippet", {
    method:"POST", headers:{ ...ytAuthHeader(), "Content-Type":"application/json" },
    body: JSON.stringify({ snippet: { parentId, textOriginal: texto } })
  });
  if(!res.ok){ const d = await res.json().catch(()=>({})); throw new Error(d?.error?.message||("Error al responder ("+res.status+")")); }
  return true;
}

/* ——— Estadísticas de UN vídeo: totales (Data API) y por día (Analytics) ——— */
async function ytVideoStats(videoId){
  await ytEnsureToken();
  const res = await fetch("https://www.googleapis.com/youtube/v3/videos?" + new URLSearchParams({ part:"statistics,snippet", id: videoId }), { headers: ytAuthHeader() });
  if(!res.ok) throw new Error("Error al leer estadísticas ("+res.status+")");
  const it = (await res.json()).items?.[0];
  if(!it) return null;
  return {
    vistas: Number(it.statistics?.viewCount)||0,
    likes: Number(it.statistics?.likeCount)||0,
    comentarios: Number(it.statistics?.commentCount)||0,
    publicadoEl: it.snippet?.publishedAt||null
  };
}
async function ytVideoDiario(videoId, desde, hasta){
  const data = await ytAnalyticsQuery({ startDate: desde, endDate: hasta, metrics:"views,estimatedRevenue", dimensions:"day", filters:"video=="+videoId, sort:"day" });
  return (data.rows||[]).map(f=>({ dia:f[0], views:Number(f[1])||0, rev:Number(f[2])||0 }));
}

// Publica un comentario del propietario en un vídeo (aparece destacado como comentario del canal)
async function ytPostComment(videoId, text){
  await ytEnsureToken();
  const res = await fetch("https://www.googleapis.com/youtube/v3/commentThreads?part=snippet", {
    method: "POST",
    headers: { ...ytAuthHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ snippet: { videoId, topLevelComment: { snippet: { textOriginal: text } } } })
  });
  if(!res.ok){
    const data = await res.json().catch(()=>({}));
    throw new Error(data?.error?.message || "Error al publicar el comentario ("+res.status+")");
  }
  return true;
}

// Detecta el formato de un vídeo a partir del título (comparando con las etiquetas
// de los formatos del usuario). Si es un Short (≤3 min) y existe un formato "short",
// lo usa. Si no hay coincidencia, devuelve "" (sin formato, para elegirlo a mano).
function detectFormatFromTitle(title, durationSec, formats){
  const norm = s => (s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  // v2: delega en el clasificador por glosario (la detección antigua por etiqueta no acertaba)
  const type = (durationSec>0 && durationSec<=183) ? "short" : "video";
  return clasificarFormato(title, type);
}

/* ——— Clasificador de formatos v2: glosario de palabras clave con pesos ———
   Afinado contra los 125 títulos reales del canal (23/8/2026). Cada regla suma
   su peso si el título (normalizado, sin acentos) la contiene; gana el formato
   con más puntos y los empates los resuelve el orden de PRIORIDAD_FORMATO. */
const REGLAS_FORMATO = [
  ["directos", 6, /\bdirecto\b|\ben vivo\b|regalando \d|si me ganas te|nadie me derrota|estoy en mi prime|ultima caja que regalo/],
  ["combates", 4, /\b1\s*vs?\s*1\b|combates?|elimin|derrot|humill|spammer|hackers?|me enfrente|remont|invicto|aplast/],
  ["combates", 3, /\b(cuartos|semifinal(es)?|octavos|gran final)\b|onyx|diamante|platino|esmeralda|rankeds?|\bracha\b|subir de rango|subiendo de rango|\brango\b/],
  ["combates", 2, /\bmundial\b|\bsniper\b|punteria|goku|flash|\bvs\b|\bcontra\b|\bgan(e|o|a|amos|ador)\b|katana/],
  ["cajas", 4, /\bcajas?\b|\bskins?\b|recompensas?|\bpase\b|\bruleta\b|\bsorteo\b|\blotes?\b|\bpacks?\b|outfits?/],
  ["cajas", 2, /regal(o|e|ar|aron)|buscando (el|la|mi|una)|salio est|no me toca nada/],
  ["ropa", 5, /equipacion|equipaciones|\bropa\b|camisetas?|uniformes?/],
  ["comunidad", 4, /que preferis|que clan|necesito tu ayuda|vuestr|discord|encuesta|votad|ayudar a youtubers|os (leo|escucho)|comentarios|suscriptor|mando este mensaje|me encontre a/],
  ["comunidad", 2, /@\w+|colaboracion|invitado especial|netoblox|kdiz|nexoee|soloryee|feex|tilinfactory|choppyblox|me entendeis|\?\?/],
  ["retos", 4, /\bretos?\b|dinamicas?|desafio|armas (basicas|random)|sin usar|entren|clase de|muy pocos saben|trucos?|como (jugar|se juega)|aprended/],
  ["novedades", 4, /super ?cup|torneos?|\beventos?\b|domingos de juegos|actualizacion|novedades|ya podeis|ya esta(n)? disponible|hoy estan disponible|reiniciaron|he creado|nuevo servidor|nueva temporada|\bhoy es\b|empieza el|ultima oportunidad/],
  ["novedades", 2, /nuevo (modo|mapa|lote)|participantes?|proximamente|disponibles?/],
];
const PRIORIDAD_FORMATO = ["directos","ropa","cajas","combates","jugadas","retos","comunidad","novedades"];

function clasificarFormato(title, type){
  if(type==="directo") return "directos";
  const t = (title||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"");
  const pts = {};
  REGLAS_FORMATO.forEach(([fmt, peso, re])=>{ if(re.test(t)) pts[fmt]=(pts[fmt]||0)+peso; });
  delete pts.directos; // solo el TYPE directo decide ese formato
  const mejor = Object.entries(pts).sort((a,b)=> b[1]-a[1] || PRIORIDAD_FORMATO.indexOf(a[0])-PRIORIDAD_FORMATO.indexOf(b[0]))[0];
  if(mejor) return mejor[0];
  // Sin ninguna señal: un Short de gameplay sin más pistas es una jugada/momento
  return type==="short" ? "jugadas" : "";
}

/* Un vídeo que ya está en YouTube (programado allí o subido/publicado) tiene el
   trabajo hecho: su checklist se marca completa automáticamente */
function completarChecklist(v){
  if(!v || !Array.isArray(v.checklist)) return v;
  if(!(v.youtubeId || v.status==="publicado")) return v;
  if(v.checklist.every(c=>c.done)) return v;
  return {...v, checklist: v.checklist.map(c=>c.done?c:{...c, done:true}), updatedAt:Date.now()};
}
function normalizarDatos(d){
  if(!d) return d;
  d.videos = (d.videos||[]).map(completarChecklist);
  return d;
}

/* ——— Migración a formatos v2: sustituye la lista antigua y reclasifica todo ——— */
function esFormatosV2(f){ return !!(f && f.jugadas && f.combates); }
function migrarFormatosV2(d){
  if(!d || esFormatosV2(d.formats)) return d;
  const ahora = Date.now();
  d.formats = clone(DEFAULT_FORMATS);
  const arreglar = v => {
    if(!v) return v;
    const type = v.type==="largo" ? "video" : (v.type||"short");
    const fmt = clasificarFormato(v.title, type);
    if(type!==v.type || fmt!==v.format) return {...v, type, format:fmt, updatedAt:ahora};
    return v;
  };
  d.videos = (d.videos||[]).map(arreglar);
  d.trash = (d.trash||[]).map(arreglar);
  return d;
}

// Trae los datos completos de un vídeo (para copiar descripción, tags, categoría)
async function ytGetVideoDetails(videoId){  const res = await fetch("https://www.googleapis.com/youtube/v3/videos?" + new URLSearchParams({
    part: "snippet", id: videoId
  }), { headers: ytAuthHeader() });
  if(!res.ok) throw new Error("Error al leer el vídeo ("+res.status+")");
  const data = await res.json();
  const s = data.items?.[0]?.snippet;
  if(!s) return null;
  return { title:s.title, description:s.description||"", tags:s.tags||[], categoryId:s.categoryId||"20" };
}

// Comprueba el estado de varios vídeos de golpe (existe / privacidad / fecha de publicación).
// Devuelve un mapa { videoId: {exists, privacyStatus, publishAt} }.
async function ytCheckVideos(ids){
  const out = {};
  if(!ids || ids.length===0) return out;
  // La API admite hasta 50 ids por llamada
  for(let i=0;i<ids.length;i+=50){
    const chunk = ids.slice(i,i+50);
    const res = await fetch("https://www.googleapis.com/youtube/v3/videos?" + new URLSearchParams({
      part: "snippet,status,contentDetails,liveStreamingDetails", id: chunk.join(",")
    }), { headers: ytAuthHeader() });
    if(!res.ok){ throw new Error("Error al comprobar vídeos ("+res.status+")"); }
    const data = await res.json();
    const found = new Set();
    (data.items||[]).forEach(it=>{
      found.add(it.id);
      out[it.id] = {
        exists:true, privacyStatus: it.status?.privacyStatus, publishAt: it.status?.publishAt || null,
        publishedAt: it.snippet?.publishedAt || null,
        durationSec: ytParseDuration(it.contentDetails?.duration),
        live: !!(it.liveStreamingDetails && (it.liveStreamingDetails.actualStartTime || it.liveStreamingDetails.scheduledStartTime))
      };
    });
    // Los que no vuelven, ya no existen
    chunk.forEach(id=>{ if(!found.has(id)) out[id] = { exists:false }; });
  }
  return out;
}

/* ——— YouTube Analytics: visitas e ingresos reales del canal ——— */
async function ytAnalyticsQuery(params){
  await ytEnsureToken();
  const res = await fetch("https://youtubeanalytics.googleapis.com/v2/reports?" + new URLSearchParams({ ids:"channel==MINE", ...params }), { headers: ytAuthHeader() });
  const data = await res.json().catch(()=>({}));
  if(!res.ok){
    const msg = data?.error?.message || "";
    if(res.status===403 && /has not been used|is disabled|accessNotConfigured/i.test(msg)) throw new Error("ANALYTICS_API_OFF");
    if(res.status===403 || res.status===401) throw new Error("ANALYTICS_PERMISOS");
    throw new Error("Error de analíticas ("+res.status+") "+msg);
  }
  return data;
}
const fechaISO = (d) => { const p=n=>String(n).padStart(2,"0"); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; };

// RPM real por tipo de contenido, últimos 30 días cerrados (los ingresos llegan con ~2 días
// de retraso). 30 y no más: antes de junio de 2026 el canal no estaba monetizado y una
// ventana larga pillaría visitas sin ingresos, hundiendo el RPM artificialmente.
async function ytFetchRpmReal(){
  const fin = new Date(); fin.setDate(fin.getDate()-3);
  const ini = new Date(fin); ini.setDate(ini.getDate()-30);
  const data = await ytAnalyticsQuery({
    startDate: fechaISO(ini), endDate: fechaISO(fin),
    metrics: "views,estimatedRevenue",
    dimensions: "creatorContentType"
  });
  const out = { shorts:null, directos:null, videos:null, total:{views:0,revenue:0,rpm:null}, at: Date.now(), ventana: 30 };
  (data.rows||[]).forEach(fila=>{
    // El nombre del tipo puede venir en distintas formas según la versión de la API
    const tipo = String(fila[0]||"").toUpperCase();
    const views = Number(fila[1])||0, rev = Number(fila[2])||0;
    out.total.views += views; out.total.revenue += rev;
    const rpm = views>0 ? rev/views*1000 : null;
    if(tipo.includes("SHORT")) out.shorts = {views, revenue:rev, rpm};
    else if(tipo.includes("LIVE")) out.directos = {views, revenue:rev, rpm};
    else if(tipo.includes("DEMAND") || tipo.includes("VIDEO")) out.videos = {views, revenue:rev, rpm};
  });
  out.total.rpm = out.total.views>0 ? out.total.revenue/out.total.views*1000 : null;
  return out;
}

// Visitas e ingresos por día (alimenta la semana, el mes y el calendario de objetivos)
async function ytFetchDiario(desde, hasta){
  const data = await ytAnalyticsQuery({
    startDate: desde, endDate: hasta,
    metrics: "views,estimatedRevenue",
    dimensions: "day",
    sort: "day"
  });
  const out = {};
  (data.rows||[]).forEach(fila=>{ out[fila[0]] = { views:Number(fila[1])||0, revenue:Number(fila[2])||0 }; });
  return out;
}

// Visitas EN VIVO de vídeos concretos (Data API; se actualiza cada pocos minutos)
async function ytViewCounts(ids){
  const out = {};
  if(!ids || !ids.length) return out;
  for(let i=0;i<ids.length;i+=50){
    const res = await fetch("https://www.googleapis.com/youtube/v3/videos?" + new URLSearchParams({
      part:"statistics", id: ids.slice(i,i+50).join(",")
    }), { headers: ytAuthHeader() });
    if(!res.ok) throw new Error("Error al leer visitas ("+res.status+")");
    const data = await res.json();
    (data.items||[]).forEach(it=>{ out[it.id] = Number(it.statistics?.viewCount)||0; });
  }
  return out;
}

// Borra un vídeo de YouTube
async function ytDeleteVideo(videoId){
  const res = await fetch("https://www.googleapis.com/youtube/v3/videos?id="+encodeURIComponent(videoId), {
    method: "DELETE", headers: ytAuthHeader()
  });
  if(res.status===204) return true;
  if(res.status===404) return true; // ya no existía
  throw new Error("No se pudo borrar en YouTube ("+res.status+")");
}

// Categorías de YouTube más habituales (para el selector)
const YT_CATEGORIES = [
  { id:"20", label:"Videojuegos" },
  { id:"22", label:"Gente y blogs" },
  { id:"24", label:"Entretenimiento" },
  { id:"23", label:"Comedia" },
  { id:"27", label:"Educación" },
  { id:"28", label:"Ciencia y tecnología" },
  { id:"10", label:"Música" },
  { id:"26", label:"Cómo hacer y estilo" },
  { id:"17", label:"Deportes" },
  { id:"1",  label:"Cine y animación" }
];



let _sb = null;

function getClient() {
  if(_sb) return _sb;
  try {
    // SIN capa de Auth: usamos solo la clave pública (anon). Antes se hacía un
    // sign-in anónimo por sesión, lo que creaba usuarios nuevos en Supabase Auth
    // constantemente (cada dispositivo/recarga/limpieza) y saturaba el servicio.
    _sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    return _sb;
  } catch(e){ return null; }
}

// Compatibilidad: antes autenticaba; ahora solo devuelve el cliente (cero carga en Auth)
async function ensureAuth() {
  const sb = getClient(); if(!sb) throw new Error("sin cliente");
  return sb;
}
// Reajusta el contador de IDs para no colisionar con datos venidos de la nube
function bumpIdFrom(videos) {
  let maxId = _id;
  (videos||[]).forEach(v=>{ const n = parseInt(String(v.id).replace(/\D/g,"")); if(!isNaN(n) && n>maxId) maxId=n; });
  _id = maxId;
}

/* ============================ FUSIÓN INTELIGENTE (merge por elementos) ============================ */
// En vez de que el dispositivo "más reciente" pise TODO lo del otro, fusionamos vídeo por vídeo
// y tarea por tarea usando la marca updatedAt de cada elemento. Las eliminaciones se registran
// como "tombstones" (id + cuándo) para no revivir lo borrado en el otro dispositivo.

const TOMB_TTL = 45*24*60*60*1000; // olvidar tombstones tras 45 días

// Fusiona dos listas de objetos con id + updatedAt, respetando eliminaciones de ambos lados
function mergeById(localArr, remoteArr, localTombs, remoteTombs) {
  const tombs = {}; // id -> timestamp de borrado más reciente
  [...(localTombs||[]), ...(remoteTombs||[])].forEach(t=>{
    if(!t || !t.id) return;
    tombs[t.id] = Math.max(tombs[t.id]||0, t.at||0);
  });
  const byId = {};
  const consider = (item, fromRemote) => {
    if(!item || !item.id) return;
    const prev = byId[item.id];
    const ts = item.updatedAt || item.createdAt || 0;
    if(!prev || ts > (prev.updatedAt || prev.createdAt || 0)) byId[item.id] = item;
  };
  (localArr||[]).forEach(i=>consider(i,false));
  (remoteArr||[]).forEach(i=>consider(i,true));
  // Aplicar tombstones: si algo fue borrado DESPUÉS de su última edición, se queda borrado
  const result = [];
  Object.values(byId).forEach(item=>{
    const delAt = tombs[item.id];
    const ts = item.updatedAt || item.createdAt || 0;
    if(delAt && delAt >= ts) return; // borrado gana
    result.push(item);
  });
  return result;
}

// Fusiona las listas de tareas (cada lista tiene su propio array de tareas)
function mergeTaskLists(localLists, remoteLists, localTombs, remoteTombs) {
  const listTombs = {};
  [...(localTombs||[]), ...(remoteTombs||[])].forEach(t=>{ if(t&&t.id&&t.kind==="list") listTombs[t.id]=Math.max(listTombs[t.id]||0,t.at||0); });
  const map = {};
  const consider = (l) => {
    if(!l || !l.id) return;
    const prev = map[l.id];
    if(!prev){ map[l.id] = {...l, tasks:[...(l.tasks||[])]}; return; }
    // Fusionar tareas de ambas versiones de la misma lista
    prev.tasks = mergeById(prev.tasks, l.tasks, localTombs, remoteTombs);
    // Metadatos de la lista (nombre, plegado): el más reciente
    if((l.updatedAt||0) > (prev.updatedAt||0)){ prev.name = l.name; prev.collapsed = l.collapsed; prev.updatedAt = l.updatedAt; prev.fixed = l.fixed; }
  };
  (localLists||[]).forEach(consider);
  (remoteLists||[]).forEach(consider);
  const result = Object.values(map).filter(l=>{
    const delAt = listTombs[l.id];
    return !(delAt && delAt >= (l.updatedAt||0));
  });
  // Ordenar: la lista fija (diaria) siempre primera
  result.sort((a,b)=> (b.fixed?1:0)-(a.fixed?1:0));
  return result;
}

// Poda tombstones caducados
function pruneTombs(tombs) {
  const now = Date.now();
  return (tombs||[]).filter(t=>t && (now-(t.at||0)) < TOMB_TTL);
}

// Fusiona dos archivos de tareas diarias por semana, sin duplicados (clave: título+día)
function mergeDailyArchive(a, b) {
  const out = {};
  const weeks = new Set([...Object.keys(a||{}), ...Object.keys(b||{})]);
  weeks.forEach(wk=>{
    const seen = new Set();
    const merged = [];
    [...((a&&a[wk])||[]), ...((b&&b[wk])||[])].forEach(it=>{
      if(!it || !it.title) return;
      const dayK = it.doneAt ? new Date(it.doneAt).toDateString() : "";
      const k = it.title + "|" + dayK;
      if(seen.has(k)) return;
      seen.add(k); merged.push(it);
    });
    if(merged.length) out[wk] = merged;
  });
  return out;
}

function getSyncCode() {
  let c = null;
  try { c = localStorage.getItem(SYNC_CODE_KEY); } catch(e){}
  if(!c) {
    c = window.studioFS ? MAIN_SYNC_CODE : ((window.crypto && crypto.randomUUID) ? crypto.randomUUID() : ("code-"+Math.random().toString(36).slice(2)+Date.now().toString(36)));
    try { localStorage.setItem(SYNC_CODE_KEY, c); } catch(e){}
  }
  return c;
}
function storeSyncCode(code) { try { localStorage.setItem(SYNC_CODE_KEY, code); } catch(e){} }

async function cloudLoad(code) {
  const sb = await ensureAuth();
  const { data, error } = await sb.from("rivals_data").select("data, updated_at").eq("user_id", code).maybeSingle();
  if(error) throw error;
  return data;
}
async function cloudSave(code, payload) {
  const sb = await ensureAuth();
  const { error } = await sb.from("rivals_data").upsert(
    { user_id: code, data: payload, updated_at: new Date().toISOString() },
    { onConflict: "user_id" }
  );
  if(error) throw error;
}

/* ============================ CONFIGURACIÓN ============================ */
function ConfigView({ goals, setGoals, theme, setTheme, cardsExpanded, setCardsExpanded, onConnect, onExport, onImport, onReset, toast }) {
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
      <h2 style={{fontSize:20,fontWeight:700,marginBottom:4}}>Configuración</h2>
      <p style={{fontSize:12.5,color:"var(--text-2)",marginBottom:18}}>Todo lo ajustable del Studio, en un solo sitio.</p>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(320px,1fr))",gap:14,alignItems:"start"}}>

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
function GlobalSearch({videos, formats, onOpen}) {
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState(false);
  const boxRef = useRef(null);
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
  return (
    <div ref={boxRef} className="global-search" style={{position:"relative"}}>
      <span style={{position:"absolute",left:11,top:"50%",transform:"translateY(-50%)",color:"var(--text-3)",display:"flex",pointerEvents:"none"}}>{Icons.search}</span>
      <input value={q} onChange={e=>setQ(e.target.value)} onFocus={()=>setFocus(true)}
        onKeyDown={e=>{
          if(e.key==="Enter" && res[0]) abrir(res[0]);
          if(e.key==="Escape"){ setQ(""); setFocus(false); e.currentTarget.blur(); }
        }}
        placeholder="Buscar vídeo…"
        style={{
          width: focus?250:170, transition:"width .18s ease, border-color .15s",
          background:"var(--bg-2)", border:"1px solid "+(focus?"var(--border-gold)":"var(--border)"),
          borderRadius:11, padding:"9px 12px 9px 34px", color:"var(--text)", fontSize:12.5
        }}/>
      {focus && q.trim().length>=2 && (
        <div className="fade-in" style={{position:"absolute",top:"calc(100% + 6px)",right:0,width:340,maxWidth:"90vw",background:"var(--bg-2)",border:"1px solid var(--border)",borderRadius:12,boxShadow:"0 14px 44px rgba(0,0,0,0.5)",overflow:"hidden",zIndex:300}}>
          {res.length===0 ? (
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

function App() {
  // Cargar UNA vez (antes se re-parseaba todo el JSON en cada render), migrar a formatos v2
  // y normalizar (checklist completa en lo que ya está en YouTube)
  const _initial = useMemo(()=>normalizarDatos(migrarFormatosV2(loadStore())), []);
  const [videos, setVideos] = useState(()=>{
    const base = _initial ? _initial.videos : [];
    // Sellar updatedAt en datos anteriores a esta versión (para que la fusión funcione)
    return (base||[]).map(v=> v.updatedAt ? v : {...v, updatedAt: v.createdAt || 1});
  });
  const [formats, setFormats] = useState(_initial ? _initial.formats : DEFAULT_FORMATS);
  const [trash, setTrash] = useState(_initial && Array.isArray(_initial.trash) ? _initial.trash : []);
  const [tombstones, setTombstones] = useState(_initial && Array.isArray(_initial.tombstones) ? pruneTombs(_initial.tombstones) : []);
  const addTomb = (id, kind) => setTombstones(ts=>[...ts.filter(t=>t.id!==id), {id, kind:kind||"item", at:Date.now()}]);
  const [taskLists, setTaskLists] = useState(()=>{
    let base = (_initial && Array.isArray(_initial.taskLists) && _initial.taskLists.length) ? _initial.taskLists : clone(DEFAULT_TASK_LISTS);
    // Sellar updatedAt en listas/tareas anteriores a esta versión (para que la fusión funcione)
    base = base.map(l=>({
      ...l,
      updatedAt: l.updatedAt || 1,
      tasks: (l.tasks||[]).map(t=> t.updatedAt ? t : {...t, updatedAt: t.createdAt || 1})
    }));
    // Garantizar que exista la lista diaria fija (para datos guardados antes de esta versión)
    if(!base.some(l=>l.fixed)){
      base = [{ id:"lst_daily", name:"Tareas diarias", fixed:true, tasks:[], updatedAt:Date.now() }, ...base];
    }
    return base;
  });
  const [saved, setSaved] = useState(false);
  const [ytUpload, setYtUpload] = useState(null); // vídeo que se está subiendo a YouTube
  // Plantillas de etiquetas para YouTube (se sincronizan)
  const [tagTemplates, setTagTemplates] = useState(()=> (_initial && Array.isArray(_initial.tagTemplates)) ? _initial.tagTemplates : []);
  // Archivo semanal de tareas diarias realizadas: { "2026-W28": [{title, doneAt}], ... }
  const [dailyArchive, setDailyArchive] = useState(()=> (_initial && _initial.dailyArchive && typeof _initial.dailyArchive==="object") ? _initial.dailyArchive : {});
  // Historial de suscriptores para la gráfica: [{t: timestamp, s: subs}, ...] (se sincroniza)
  const [subHistory, setSubHistory] = useState(()=> (_initial && Array.isArray(_initial.subHistory)) ? _initial.subHistory : []);
  // Plantillas de prompt para el Agente de IA (se sincronizan)
  const [promptTemplates, setPromptTemplates] = useState(()=> (_initial && Array.isArray(_initial.promptTemplates)) ? _initial.promptTemplates : []);
  // Objetivos (dinero → visitas), RPM real e historial diario de visitas/ingresos (se sincroniza)
  const [goals, setGoals] = useState(()=> (_initial && _initial.goals && typeof _initial.goals==="object") ? _initial.goals : null);
  const [view, setView] = useState("calendar");
  // Tarjetas contraídas (false) o expandidas (true) en todos los apartados
  const [cardsExpanded, setCardsExpanded] = useState(()=>{ try { return localStorage.getItem("rds_cards_exp")==="1"; } catch(e){ return false; } });
  useEffect(()=>{ try { localStorage.setItem("rds_cards_exp", cardsExpanded?"1":"0"); } catch(e){} },[cardsExpanded]);
  const [calView, setCalView] = useState("week"); // month | week | day
  const [editing, setEditing] = useState(null);
  const [showFormats, setShowFormats] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [dragId, setDragId] = useState(null);
  const [search, setSearch] = useState("");
  const [confirm, setConfirm] = useState(null); // {title, message, confirmLabel, danger, onConfirm}
  const [syncStatus, setSyncStatus] = useState("connecting"); // connecting | online | offline | saving
  const syncStatusRef = useRef("connecting");
  useEffect(()=>{ syncStatusRef.current = syncStatus; },[syncStatus]);
  const [showSync, setShowSync] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Modo de sincronización: "auto" (sube y baja solo) o "manual" (solo cuando pulsas el botón)
  const [syncMode, setSyncMode] = useState(()=>{ try { return localStorage.getItem("rds_sync_mode")||"auto"; } catch(e){ return "auto"; } });
  const [pendingChanges, setPendingChanges] = useState(false); // hay cambios locales sin subir (modo manual)
  const syncModeRef = useRef(syncMode);
  useEffect(()=>{
    syncModeRef.current = syncMode;
    try { localStorage.setItem("rds_sync_mode", syncMode); } catch(e){}
  },[syncMode]);

  // TEMA claro/oscuro (preferencia por dispositivo)
  const [theme, setTheme] = useState(()=>{ try { return localStorage.getItem("rds_theme")||"dark"; } catch(e){ return "dark"; } });
  useEffect(()=>{
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("rds_theme", theme); } catch(e){}
  },[theme]);

  // HISTORIAL: deshacer/rehacer los últimos 10 cambios locales
  const historyRef = useRef({past:[], future:[]});
  const prevSnapRef = useRef(null);
  const applyingHistoryRef = useRef(false);
  const [histVersion, setHistVersion] = useState(0);
  const undo = () => {
    const h = historyRef.current;
    if(!h.past.length){ toast("Nada que deshacer"); return; }
    const snap = h.past.pop();
    h.future.push({videos, formats, trash, taskLists});
    if(h.future.length>10) h.future.shift();
    applyingHistoryRef.current = true;
    setVideos(snap.videos); setFormats(snap.formats); setTrash(snap.trash); setTaskLists(snap.taskLists);
    setHistVersion(v=>v+1);
    toast("Cambio deshecho");
  };
  const redo = () => {
    const h = historyRef.current;
    if(!h.future.length){ toast("Nada que rehacer"); return; }
    const snap = h.future.pop();
    h.past.push({videos, formats, trash, taskLists});
    if(h.past.length>10) h.past.shift();
    applyingHistoryRef.current = true;
    setVideos(snap.videos); setFormats(snap.formats); setTrash(snap.trash); setTaskLists(snap.taskLists);
    setHistVersion(v=>v+1);
    toast("Cambio rehecho");
  };
  // Atajos: Ctrl/Cmd+Z deshace, Ctrl+Y o Ctrl/Cmd+Shift+Z rehace
  const undoRef = useRef(undo), redoRef = useRef(redo);
  useEffect(()=>{ undoRef.current = undo; redoRef.current = redo; });
  useEffect(()=>{
    const onKey = (e)=>{
      const tag = (e.target && e.target.tagName || "").toLowerCase();
      if(tag==="input" || tag==="textarea" || e.target.isContentEditable) return;
      const mod = e.ctrlKey || e.metaKey;
      if(mod && !e.shiftKey && e.key.toLowerCase()==="z"){ e.preventDefault(); undoRef.current(); }
      else if((mod && e.key.toLowerCase()==="y") || (mod && e.shiftKey && e.key.toLowerCase()==="z")){ e.preventDefault(); redoRef.current(); }
    };
    window.addEventListener("keydown", onKey);
    return ()=>window.removeEventListener("keydown", onKey);
  },[]);
  const [syncCode, setSyncCodeState] = useState(()=>getSyncCode());
  const [toast, toastNode] = useToast();

  const lastSyncedRef = useRef(null); // huella de los últimos datos sincronizados (para ignorar ecos)
  const lastRemoteTsRef = useRef(0);  // fecha de la última versión de la nube que hemos integrado
  const localEditedAtRef = useRef((_initial && _initial.savedAt) ? _initial.savedAt : 0); // última edición local
  const stateRef = useRef({videos, formats, trash, taskLists, tombstones}); // estado vivo para los manejadores async
  const pullingRef = useRef(false);
  const saveTimer = useRef(null);
  const [rtKey, setRtKey] = useState(0); // al aumentar, se recrea el canal de tiempo real

  // Espejo del estado actual (para leerlo dentro de callbacks asíncronos sin datos obsoletos)
  useEffect(()=>{ stateRef.current = {videos, formats, trash, taskLists, tombstones, dailyArchive, tagTemplates, subHistory, promptTemplates, goals}; },[videos, formats, trash, taskLists, tombstones, dailyArchive, tagTemplates, subHistory, promptTemplates, goals]);

  // Huella del estado sincronizable. Con caché: si las referencias de los 8 campos no
  // han cambiado desde la última llamada, devuelve la huella anterior sin re-serializar
  // (JSON.stringify de todo el estado es costoso y fp se llama muy a menudo).
  const fpCacheRef = useRef({ parts:null, out:"" });
  const fp = (s) => {
    const parts = [s.videos, s.formats, s.trash||null, s.taskLists||null, s.dailyArchive||null, s.tagTemplates||null, s.subHistory||null, s.promptTemplates||null, s.goals||null];
    const cache = fpCacheRef.current;
    if(cache.parts && cache.parts.length===9 && cache.parts.every((p,i)=>p===parts[i])) return cache.out;
    const out = JSON.stringify({videos:s.videos, formats:s.formats, trash:s.trash||[], taskLists:s.taskLists||[], dailyArchive:s.dailyArchive||{}, tagTemplates:s.tagTemplates||[], subHistory:s.subHistory||[], promptTemplates:s.promptTemplates||[], goals:s.goals||null});
    fpCacheRef.current = { parts, out };
    return out;
  };

  // FUSIÓN NO DESTRUCTIVA: combina remoto + local por elementos, quedándose SIEMPRE con la
  // versión de updatedAt más alto de cada vídeo/tarea. Un dispositivo que suba datos viejos
  // NO puede hacer retroceder los tuyos: sus elementos viejos pierden frente a los nuevos.
  // Devuelve {state, changed}: changed=true solo si el resultado difiere de lo que ya tenías.
  const computeMerge = (r) => {
    const s = stateRef.current;
    const mergedVideos = mergeById(s.videos, r.videos, s.tombstones, r.tombstones);
    const mergedTrash  = mergeById(s.trash,  r.trash,  s.tombstones, r.tombstones);
    const mergedTasks  = mergeTaskLists(s.taskLists, r.taskLists, s.tombstones, r.tombstones);
    const mergedTombs  = pruneTombs([...(s.tombstones||[]), ...(r.tombstones||[])]);
    // Formatos: nos quedamos con el conjunto que tenga más entradas o el local si empatan
    // (los formatos casi no cambian; ante la duda, conservar lo local evita perder ediciones).
    // Un dispositivo ya migrado a formatos v2 nunca retrocede a la lista antigua
    const lv2 = esFormatosV2(s.formats), rv2 = esFormatosV2(r.formats);
    const localFmtN = Object.keys(s.formats||{}).length;
    const remoteFmtN = Object.keys(r.formats||{}).length;
    const mergedFormats = (lv2!==rv2) ? (lv2 ? s.formats : r.formats)
      : (remoteFmtN > localFmtN ? r.formats : s.formats);
    // Vídeos que llegan de un dispositivo sin migrar (formato antiguo o tipo "largo"):
    // se reclasifican aquí mismo para que todos converjan al mismo resultado
    const arreglaV2 = (arr) => !esFormatosV2(mergedFormats) ? arr.map(completarChecklist) : arr.map(v=>{
      if(!v) return v;
      const type = v.type==="largo" ? "video" : (v.type||"short");
      const fmtDesconocido = v.format && !mergedFormats[v.format];
      if(type===v.type && !fmtDesconocido) return completarChecklist(v);
      return completarChecklist({...v, type, format: fmtDesconocido ? clasificarFormato(v.title, type) : v.format, updatedAt:Date.now()});
    });
    // Archivo diario: unión por semana, sin duplicados (por título+día)
    const mergedArchive = mergeDailyArchive(s.dailyArchive, r.dailyArchive);
    // Plantillas de etiquetas: unión por nombre (la más reciente/mayor gana)
    const tplMap = {};
    [...(s.tagTemplates||[]), ...(r.tagTemplates||[])].forEach(t=>{
      if(!t || !t.name) return;
      const prev = tplMap[t.name];
      if(!prev || (t.tags||[]).length >= (prev.tags||[]).length) tplMap[t.name] = t;
    });
    const mergedTpls = Object.values(tplMap);
    // Historial de suscriptores: unión por timestamp (redondeado al minuto), ordenado
    const subMap = {};
    [...(s.subHistory||[]), ...(r.subHistory||[])].forEach(p=>{
      if(!p || p.t==null) return;
      const k = Math.round(p.t/60000);
      if(!subMap[k]) subMap[k] = p;
    });
    const mergedSubs = Object.values(subMap).sort((a,b)=>a.t-b.t);
    // Plantillas de prompt: unión por nombre (la más reciente gana)
    const promptMap = {};
    [...(s.promptTemplates||[]), ...(r.promptTemplates||[])].forEach(p=>{
      if(!p || !p.name) return;
      const prev = promptMap[p.name];
      if(!prev || (p.updatedAt||0) >= (prev.updatedAt||0)) promptMap[p.name] = p;
    });
    const mergedPrompts = Object.values(promptMap);
    // Objetivos: config y RPM por fecha de actualización; historial diario por unión de días
    const mergedGoals = (()=>{
      const a = s.goals, b = r.goals;
      if(!a) return b||null;
      if(!b) return a;
      const cfg = ((b.cfg?.updatedAt||0) > (a.cfg?.updatedAt||0)) ? b.cfg : a.cfg;
      const rpm = ((b.rpm?.at||0) > (a.rpm?.at||0)) ? b.rpm : a.rpm;
      const daily = {...(a.daily||{})};
      Object.entries(b.daily||{}).forEach(([k,v])=>{
        const p = daily[k];
        if(!p || (v && (v.views||0) >= (p.views||0))) daily[k] = v;
      });
      return { cfg: cfg||null, rpm: rpm||null, daily, dailyAt: Math.max(a.dailyAt||0, b.dailyAt||0) };
    })();
    const merged = { videos:arreglaV2(mergedVideos), formats:mergedFormats, trash:arreglaV2(mergedTrash), taskLists:mergedTasks, tombstones:mergedTombs, dailyArchive:mergedArchive, tagTemplates:mergedTpls, subHistory:mergedSubs, promptTemplates:mergedPrompts, goals:mergedGoals };
    const changed = fp(merged) !== fp(s);
    return { merged, changed };
  };

  // Aplica un estado fusionado a la app
  const applyMerged = (merged) => {
    bumpIdFrom([...(merged.videos||[]), ...(merged.trash||[])]);
    const s = stateRef.current;
    // Actualizar SOLO lo que cambió de verdad. Si un array/objeto es idéntico (misma huella),
    // no llamamos a su setter → React no re-renderiza esas tarjetas → sin parpadeo ni re-animación.
    const j = (x)=>JSON.stringify(x);
    if(j(merged.videos)!==j(s.videos)) setVideos(merged.videos);
    if(j(merged.formats)!==j(s.formats)) setFormats(merged.formats);
    if(j(merged.trash)!==j(s.trash)) setTrash(merged.trash);
    const nextTasks = merged.taskLists.length?merged.taskLists:clone(DEFAULT_TASK_LISTS);
    if(j(nextTasks)!==j(s.taskLists)) setTaskLists(nextTasks);
    if(j(merged.tombstones)!==j(s.tombstones)) setTombstones(merged.tombstones);
    if(merged.dailyArchive && j(merged.dailyArchive)!==j(s.dailyArchive)) setDailyArchive(merged.dailyArchive);
    if(merged.tagTemplates && j(merged.tagTemplates)!==j(s.tagTemplates)) setTagTemplates(merged.tagTemplates);
    if(merged.subHistory && j(merged.subHistory)!==j(s.subHistory)) setSubHistory(merged.subHistory);
    if(merged.promptTemplates && j(merged.promptTemplates)!==j(s.promptTemplates)) setPromptTemplates(merged.promptTemplates);
    if(merged.goals && j(merged.goals)!==j(s.goals)) setGoals(merged.goals);
    lastSyncedRef.current = fp(merged);
    lastRemoteTsRef.current = Date.now();
  };

  // Sube el estado actual a la nube
  const pushLocal = async () => {
    const s = stateRef.current;
    const huella = fp(s);
    setSyncStatus("saving");
    await cloudSave(syncCode, { videos:s.videos, formats:s.formats, trash:s.trash, taskLists:s.taskLists, tombstones:pruneTombs(s.tombstones), dailyArchive:s.dailyArchive||{}, tagTemplates:s.tagTemplates||[], subHistory:s.subHistory||[], promptTemplates:s.promptTemplates||[], goals:s.goals||null, savedAt: Date.now() });
    lastSyncedRef.current = huella;
    lastRemoteTsRef.current = Date.now();
    setPendingChanges(false);
    setSyncStatus("online");
  };

  // Sube un estado ya fusionado
  const pushMerged = async (merged) => {
    setSyncStatus("saving");
    await cloudSave(syncCode, { videos:merged.videos, formats:merged.formats, trash:merged.trash, taskLists:merged.taskLists, tombstones:pruneTombs(merged.tombstones), dailyArchive:merged.dailyArchive||{}, tagTemplates:merged.tagTemplates||[], subHistory:merged.subHistory||[], promptTemplates:merged.promptTemplates||[], goals:merged.goals||null, savedAt: Date.now() });
    lastSyncedRef.current = fp(merged);
    lastRemoteTsRef.current = Date.now();
    setSyncStatus("online");
  };

  // Integra datos remotos SIN hacer retroceder lo local. Devuelve true si algo cambió aquí.
  // - Si la fusión no aporta nada nuevo respecto a lo local → no toca la app (no hay "cambio fantasma").
  // - Si aporta algo (otro dispositivo añadió/editó algo genuino) → lo integra y lo sube fusionado.
  const integrateRemote = async (r, silent) => {
    const { merged, changed } = computeMerge(r);
    const s = stateRef.current;
    if(!changed){
      // La fusión no aporta nada nuevo a lo que YA tenemos aquí.
      // ¿El remoto está desactualizado respecto a lo nuestro? Solo entonces subimos.
      const localHuella = fp(merged);           // = fp(local), porque no cambió
      const remoteHuella = fp({
        videos:r.videos, formats:r.formats, trash:r.trash, taskLists:r.taskLists,
        dailyArchive:r.dailyArchive, tagTemplates:r.tagTemplates,
        subHistory:r.subHistory, promptTemplates:r.promptTemplates, goals:r.goals
      });
      if(localHuella !== remoteHuella){
        // Nosotros tenemos algo que el remoto no → subir lo nuestro (sin tocar la UI)
        try { await pushLocal(); } catch(e){}
      } else {
        // Idénticos: solo marcamos como sincronizado, sin tocar nada
        lastSyncedRef.current = localHuella;
        setSyncStatus("online");
      }
      return false;
    }
    // Hay novedades reales de otro dispositivo → integrarlas (sin perder lo tuyo) y republicar
    applyMerged(merged);
    try { await pushMerged(merged); } catch(e){}
    if(!silent) toast("Cambios de otro dispositivo integrados");
    return true;
  };

  // RECONCILIACIÓN al abrir / despertar / periódicamente: baja la nube y la integra sin retroceder.
  const pullFromCloud = async (silent) => {
    if(pullingRef.current) return;
    pullingRef.current = true;
    try {
      if(!silent) setSyncStatus("connecting");
      const remote = await cloudLoad(syncCode);
      if(remote && remote.data) {
        await integrateRemote(remote.data, silent);
      } else {
        await pushLocal(); // nube vacía → sembrarla con lo local
      }
      // En modo silencioso no forzamos "online" para no pisar un "saving" en curso;
      // integrateRemote/pushLocal ya dejan el estado correcto.
      if(!silent) setSyncStatus("online");
    } catch(e) {
      setSyncStatus("offline");
    } finally {
      pullingRef.current = false;
    }
  };
  const pullRef = useRef(pullFromCloud);
  useEffect(()=>{ pullRef.current = pullFromCloud; });

  // Carga inicial
  const didInit = useRef(false);
  useEffect(()=>{
    if(didInit.current) return; didInit.current = true;
    pullRef.current(false);
  },[]);

  // RE-SINCRONIZACIÓN AUTOMÁTICA: al volver a la app, al recuperar internet y cada 60s.
  // (iOS corta la conexión en segundo plano; esto la revive y trae lo que haya pasado mientras tanto.)
  useEffect(()=>{
    const onWake = () => {
      if(document.visibilityState === "hidden") return;
      pullRef.current(true);
      setRtKey(k=>k+1); // recrear el canal de tiempo real por si murió en segundo plano
    };
    const onOnline = () => { pullRef.current(true); setRtKey(k=>k+1); };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    window.addEventListener("online", onOnline);
    window.addEventListener("pageshow", onWake);
    return ()=>{
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pageshow", onWake);
    };
  },[]);

  // GUARDADO URGENTE: sube al instante aunque la app se esté cerrando o pasando a segundo plano.
  // fetch con keepalive sobrevive al cierre de la pestaña/app (el guardado normal con retardo no).
  const flushNow = () => {
    if(syncModeRef.current === "manual") return; // en manual no subimos automáticamente
    const s = stateRef.current;
    const huella = fp(s);
    if(huella === lastSyncedRef.current) return; // nada pendiente
    try {
      // Usamos SIEMPRE la apikey pública (estable). Un token de sesión puede haber caducado
      // y provocaría un 500/error CORS al cerrar. La apikey funciona con las políticas RLS.
      fetch(SUPABASE_URL + "/rest/v1/rivals_data?on_conflict=user_id", {
        method: "POST",
        keepalive: true,
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_KEY,
          "Authorization": "Bearer " + SUPABASE_KEY,
          "Prefer": "resolution=merge-duplicates"
        },
        body: JSON.stringify([{ user_id: syncCode, data: { videos:s.videos, formats:s.formats, trash:s.trash, taskLists:s.taskLists, tombstones:pruneTombs(s.tombstones), dailyArchive:s.dailyArchive||{}, tagTemplates:s.tagTemplates||[], subHistory:s.subHistory||[], promptTemplates:s.promptTemplates||[], goals:s.goals||null, savedAt: Date.now() }, updated_at: new Date().toISOString() }])
      }).catch(()=>{}); // si falla (sin red), la reconciliación lo reintenta al volver
    } catch(e){}
  };
  const flushRef = useRef(flushNow);
  useEffect(()=>{ flushRef.current = flushNow; });

  // Al ocultar la app (cambiar de app en iPhone, cerrar pestaña, bloquear pantalla) → subir ya
  useEffect(()=>{
    const onHide = () => { if(document.visibilityState === "hidden") flushRef.current(); };
    const onPageHide = () => flushRef.current();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    return ()=>{ document.removeEventListener("visibilitychange", onHide); window.removeEventListener("pagehide", onPageHide); };
  },[]);

  // Sincronización manual inmediata (botón "Sincronizar ahora")
  const [manualSyncing, setManualSyncing] = useState(false);
  const syncNow = async () => {
    if(manualSyncing) return;
    setManualSyncing(true);
    try {
      // Fusiona con la nube (sin pisar cambios de otro dispositivo) y sube el resultado.
      const remote = await cloudLoad(syncCode);
      if(remote && remote.data){
        const { merged } = computeMerge(remote.data);
        applyMerged(merged);
        await pushMerged(merged);
      } else {
        await pushLocal();
      }
      setPendingChanges(false);
      toast("✅ Sincronización completada");
    } catch(e){
      setSyncStatus("offline");
      toast("❌ No se pudo sincronizar");
    } finally { setManualSyncing(false); }
  };

  // Suscripción en tiempo real: si otro dispositivo cambia algo, lo recibimos al instante
  const rtOkRef = useRef(false); // true si Realtime está funcionando
  useEffect(()=>{
    let channel = null;
    ensureAuth().then(sb => {
      channel = sb.channel("rivals-"+syncCode+"-"+rtKey)
        .on("postgres_changes", { event:"*", schema:"public", table:"rivals_data", filter:"user_id=eq."+syncCode }, payload=>{
          const r = payload && payload.new && payload.new.data;
          if(!r) return;
          const remoteTs = payload.new.updated_at ? new Date(payload.new.updated_at).getTime() : Date.now();
          const incoming = fp({videos:r.videos, formats:r.formats, trash:r.trash, taskLists:r.taskLists, dailyArchive:r.dailyArchive, tagTemplates:r.tagTemplates});
          // Eco de nuestro propio guardado: ya lo tenemos → solo actualizar marcas, sin tocar la app
          if(incoming === lastSyncedRef.current || incoming === fp(stateRef.current)){
            lastSyncedRef.current = fp(stateRef.current);
            lastRemoteTsRef.current = Math.max(lastRemoteTsRef.current, remoteTs);
            setSyncStatus("online");
            return;
          }
          // Integración no destructiva: solo cambia la app si el otro dispositivo aportó
          // algo genuinamente nuevo; nunca hace retroceder lo que tú tienes aquí.
          integrateRemote(r, false).catch(()=>{});
          setSyncStatus("online");
        })
        .subscribe((st)=>{
          // st: 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED'
          rtOkRef.current = (st === "SUBSCRIBED");
          if(st === "CHANNEL_ERROR" || st === "TIMED_OUT"){
            // Realtime no disponible → nos apoyamos en el sondeo rápido
            rtOkRef.current = false;
          }
        });
    }).catch(()=>{});
    return ()=>{ try { if(channel) getClient()?.removeChannel(channel); } catch(e){} };
  },[syncCode, rtKey]);

  // Sondeo adaptativo que SOLO corre con la pestaña visible.
  // Si la app está oculta (otra app, pantalla bloqueada, pestaña en segundo plano),
  // no hace ninguna petición: cero carga en el servidor y cero gasto de batería.
  useEffect(()=>{
    let timer = null;
    let stopped = false;
    let failures = 0; // fallos seguidos → freno exponencial
    const schedule = () => {
      if(stopped) return;
      // Con Realtime activo, los cambios llegan al instante por el canal: el sondeo es solo
      // un respaldo poco frecuente. Sin Realtime, sondeamos más a menudo pero con mesura.
      let delay = rtOkRef.current ? 60000 : 20000;
      // FRENO: si Supabase está fallando, esperar cada vez más (30s → 1m → 2m → 4m → máx 5m)
      // para no martillear un servidor caído (eso agrava el agotamiento de recursos).
      if(failures > 0) delay = Math.min(30000 * Math.pow(2, failures-1), 300000);
      timer = setTimeout(run, delay);
    };
    const run = async () => {
      if(stopped) return;
      // En modo manual no bajamos datos automáticamente (cero carga al servidor).
      if(syncModeRef.current === "manual"){ schedule(); return; }
      if(document.visibilityState === "visible"){
        try {
          await pullRef.current(true);
          failures = 0;
        } catch(e){ failures++; }
        // pullFromCloud captura sus propios errores; usamos el estado para detectar fallo
        if(syncStatusRef.current === "offline") failures = Math.max(failures, 1);
        else failures = 0;
        schedule();
      }
      // Si no está visible, no reprogramamos; se reanudará al volver a la app.
    };
    const onVis = () => {
      if(document.visibilityState === "visible"){
        // Al volver: traer cambios enseguida (solo en modo auto) y reanudar el sondeo
        if(syncModeRef.current !== "manual") pullRef.current(true).catch(()=>{});
        if(!timer) schedule();
      } else {
        // Al ocultar: cancelar cualquier sondeo pendiente
        if(timer){ clearTimeout(timer); timer = null; }
      }
    };
    document.addEventListener("visibilitychange", onVis);
    if(document.visibilityState === "visible") schedule();
    return ()=>{ stopped = true; if(timer) clearTimeout(timer); document.removeEventListener("visibilitychange", onVis); };
  },[]);

  // Vincular este dispositivo a otro código de sincronización
  // Exportar todos los datos a un archivo JSON descargable
  const exportData = () => {
    const payload = { app:"RDeRandom Studio", version:2, exportedAt:new Date().toISOString(), videos, formats, trash, taskLists, tombstones };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const d = new Date();
    a.href = url;
    a.download = `RDeRandom_datos_${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 2000);
    toast("Datos exportados · revisa tus descargas");
  };

  // Importar datos desde un archivo JSON (reemplaza lo actual, con confirmación)
  const importData = (file) => {
    if(!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let parsed = null;
      try { parsed = JSON.parse(reader.result); } catch(e){ toast("El archivo no es un JSON válido"); return; }
      const inVideos = Array.isArray(parsed?.videos) ? parsed.videos : null;
      const inFormats = (parsed?.formats && typeof parsed.formats==="object" && !Array.isArray(parsed.formats)) ? parsed.formats : null;
      const inTrash = Array.isArray(parsed?.trash) ? parsed.trash : [];
      const inTasks = Array.isArray(parsed?.taskLists) ? parsed.taskLists : null;
      if(!inVideos || !inFormats){ toast("El archivo no tiene el formato esperado de RDeRandom Studio"); return; }
      setConfirm({
        title: "Importar datos",
        message: `Se importarán ${inVideos.length} vídeo${inVideos.length!==1?"s":""}, ${Object.keys(inFormats).length} formato${Object.keys(inFormats).length!==1?"s":""} y ${inTrash.length} elemento${inTrash.length!==1?"s":""} de la papelera. Esto reemplazará TODOS los datos actuales de este organizador (y se sincronizará a la nube). ¿Continuar?`,
        confirmLabel: "Importar",
        danger: true,
        onConfirm: () => {
          bumpIdFrom([...inVideos, ...inTrash]);
          setVideos(inVideos);
          setFormats(inFormats);
          setTrash(inTrash);
          if(inTasks) setTaskLists(inTasks.length?inTasks:clone(DEFAULT_TASK_LISTS));
          setConfirm(null);
          setShowSync(false);
          toast("Datos importados correctamente");
        }
      });
    };
    reader.readAsText(file);
  };

  const linkToCode = async (code) => {
    code = (code||"").trim();
    if(!code){ toast("Introduce un código de sincronización"); return; }
    storeSyncCode(code);
    setSyncCodeState(code);
    setSyncStatus("connecting");
    try {
      const remote = await cloudLoad(code);
      if(remote && remote.data){
        // Vinculación explícita: adoptar los datos de ese código tal cual
        const r = remote.data;
        bumpIdFrom([...(r.videos||[]), ...(r.trash||[])]);
        if(Array.isArray(r.videos)) setVideos(r.videos);
        if(r.formats && typeof r.formats==="object") setFormats(r.formats);
        if(Array.isArray(r.trash)) setTrash(r.trash);
        if(Array.isArray(r.taskLists)) setTaskLists(r.taskLists.length?r.taskLists:clone(DEFAULT_TASK_LISTS));
        if(Array.isArray(r.tombstones)) setTombstones(pruneTombs(r.tombstones));
        lastSyncedRef.current = fp(r);
        lastRemoteTsRef.current = Date.now();
        toast("Vinculado · datos descargados de la nube");
      } else {
        const s = stateRef.current;
        await cloudSave(code, { videos:s.videos, formats:s.formats, trash:s.trash, taskLists:s.taskLists, tombstones:pruneTombs(s.tombstones), dailyArchive:s.dailyArchive||{}, tagTemplates:s.tagTemplates||[], subHistory:s.subHistory||[], promptTemplates:s.promptTemplates||[], savedAt: Date.now() });
        lastSyncedRef.current = fp(s);
        lastRemoteTsRef.current = Date.now();
        toast("Vinculado · se subieron tus datos actuales");
      }
      setSyncStatus("online");
      setShowSync(false);
    } catch(e) {
      setSyncStatus("offline");
      toast("No se pudo conectar con ese código");
    }
  };

  // Auto-guardado: local al instante + nube según el modo (auto = debounce, manual = solo local)
  const firstRun = useRef(true);
  useEffect(()=>{
    if(firstRun.current){ firstRun.current=false; prevSnapRef.current = {videos, formats, trash, taskLists}; return; }
    // Guardado local (siempre; es barato e instantáneo)
    const ok = saveStore(videos, formats, trash, taskLists, tombstones, dailyArchive, tagTemplates, subHistory, promptTemplates, goals);
    if(ok){ setSaved(true); setTimeout(()=>setSaved(false), 1600); }

    // Huella COMPLETA del estado actual
    const huella = fp(stateRef.current);
    const hayCambioReal = huella !== lastSyncedRef.current;

    // Solo si hay un cambio real registramos historial y (en modo auto) programamos subida.
    if(hayCambioReal){
      localEditedAtRef.current = Date.now();
      if(!applyingHistoryRef.current && prevSnapRef.current){
        historyRef.current.past.push(prevSnapRef.current);
        if(historyRef.current.past.length>10) historyRef.current.past.shift();
        historyRef.current.future = [];
        setHistVersion(v=>v+1);
      }
      applyingHistoryRef.current = false;

      if(syncModeRef.current === "manual"){
        // MODO MANUAL: no tocamos el servidor. Solo marcamos que hay cambios pendientes.
        setPendingChanges(true);
      } else {
        // MODO AUTO: subimos tras un pequeño retardo (debounce)
        setSyncStatus("saving");
        if(saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(async ()=>{
          if(fp(stateRef.current) === lastSyncedRef.current){ setSyncStatus("online"); return; }
          try { await pushLocal(); }
          catch(e) { setSyncStatus("offline"); }
        }, 700);
      }
    }
    prevSnapRef.current = {videos, formats, trash, taskLists};
  },[videos, formats, trash, taskLists, tombstones, dailyArchive, tagTemplates, subHistory, promptTemplates, goals]);

  const resetAll = () => {
    setConfirm({
      title: "Restablecer datos",
      message: "Esto borrará todos tus vídeos, formatos y la papelera, y restaurará el contenido de ejemplo. Esta acción no se puede deshacer.",
      confirmLabel: "Restablecer",
      danger: true,
      onConfirm: () => {
        clearStore();
        _id = 100;
        const freshFormats = clone(DEFAULT_FORMATS);
        const freshVideos = clone(SEED);
        setFormats(freshFormats);
        setVideos(freshVideos);
        setTrash([]);
        const freshTasks = clone(DEFAULT_TASK_LISTS);
        setTaskLists(freshTasks);
        setTombstones([]);
        setConfirm(null);
        // Reflejar el restablecimiento también en la nube
        lastSyncedRef.current = JSON.stringify({videos:freshVideos, formats:freshFormats, trash:[], taskLists:freshTasks});
        lastRemoteTsRef.current = Date.now();
        cloudSave(syncCode, { videos:freshVideos, formats:freshFormats, trash:[], taskLists:freshTasks, tombstones:[], savedAt:Date.now() }).catch(()=>{});
        toast("Datos restablecidos");
      }
    });
  };

  // Si se borra un formato en uso, reasignar al primero disponible
  useEffect(()=>{
    const keys = Object.keys(formats);
    if(keys.length===0) return;
    setVideos(vs=>vs.map(v=> formats[v.format] ? v : {...v, format:keys[0]}));
  },[formats]);

  const onDragStart = useCallback((e,v) => { setDragId(v.id); dnd.dragId = v.id; e.dataTransfer.effectAllowed="move"; if(e.currentTarget.classList) e.currentTarget.classList.add("dragging"); },[]);
  const onDragEnd = useCallback(e => { setDragId(null); dnd.dragId = null; if(e.currentTarget.classList) e.currentTarget.classList.remove("dragging"); },[]);

  // Reordenar: inserta el vídeo arrastrado justo antes del vídeo objetivo.
  // Si el objetivo está en otro día o estado, además lo adopta.
  const moveBefore = (id, targetId) => {
    if(!id || !targetId || id===targetId) return;
    setVideos(vs=>{
      const dragged = vs.find(v=>v.id===id);
      const target = vs.find(v=>v.id===targetId);
      if(!dragged || !target) return vs;
      const rest = vs.filter(v=>v.id!==id);
      const idx = rest.findIndex(v=>v.id===targetId);
      const adopted = {...dragged, date: target.date, updatedAt: Date.now()};
      // Cambia de día y era una idea → pasa a programado
      if(dragged.date !== target.date && target.date && adopted.status==="idea") adopted.status = "programado";
      // Mismo día pero distinta columna del tablero → adopta la columna del objetivo
      if(dragged.date === target.date && dragged.status !== target.status) adopted.status = target.status;
      const next = [...rest.slice(0,idx), adopted, ...rest.slice(idx)];
      return next;
    });
    toast("Reordenado");
  };

  // Movimientos con id explícito (los usan tanto el ratón como el dedo)
  // Si el vídeo está PROGRAMADO en YouTube y aquí cambia su fecha/hora, se reprograma también allí
  const reprogramarEnYT = async (v, fecha, hora) => {
    if(!v || !v.youtubeId || v.youtubeStatus!=="scheduled" || !ytIsConnected()) return;
    if(!fecha){ toast("⚠ Sigue programado en YouTube con su fecha anterior"); return; }
    const cuando = new Date(fecha+"T"+(hora||v.time||"22:00"));
    if(cuando.getTime() < Date.now()+60000){ toast("⚠ No se reprogramó en YouTube: esa fecha ya pasó"); return; }
    try {
      await ytUpdateSchedule(v.youtubeId, cuando.toISOString());
      toast("📅 Reprogramado también en YouTube: "+cuando.toLocaleString("es-ES",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}));
    } catch(e){ toast("⚠ Cambiado aquí, pero YouTube respondió: "+e.message); }
  };

  const moveToDate = (id, date) => {
    if(!id) return;
    const previo = (stateRef.current.videos||[]).find(x=>x.id===id);
    setVideos(vs=>vs.map(v=>v.id===id?{...v,date,status: v.status==="idea"?"programado":v.status, updatedAt:Date.now()}:v));
    toast(`Reprogramado para el ${new Date(date+"T00:00").toLocaleDateString("es-ES",{day:"numeric",month:"short"})}`);
    if(previo && previo.date!==date) reprogramarEnYT(previo, date, previo.time);
  };
  const moveToStatus = (id, status) => {
    if(!id) return;
    setVideos(vs=>vs.map(v=>v.id===id?{...v,status, updatedAt:Date.now()}:v));
    toast(`Movido a «${STATUSES[status].label}»`);
  };
  const moveToUnassign = (id) => {
    if(!id) return;
    setVideos(vs=>{
      const v = vs.find(x=>x.id===id);
      if(!v || !v.date) return vs; // ya estaba sin asignar
      toast("Vídeo movido a «Sin asignar»");
      return vs.map(x=>x.id===id?{...x, date:null, status: x.status==="programado"?"idea":x.status, updatedAt:Date.now()}:x);
    });
  };

  // Conectar el puente de arrastre táctil con estas acciones
  useEffect(()=>{
    dnd.moveToDate = moveToDate;
    dnd.moveToStatus = moveToStatus;
    dnd.moveToUnassign = moveToUnassign;
    dnd.moveBefore = moveBefore;
  });

  // Versiones para el ratón (escritorio): usan el vídeo que se está arrastrando
  const dropOnDate = (date) => moveToDate(dragId, date);
  const dropOnStatus = (status) => moveToStatus(dragId, status);
  const unassignVideo = () => moveToUnassign(dragId);

  const saveVideo = (draft) => {
    const previo = (stateRef.current.videos||[]).find(x=>x.id===draft.id);
    setVideos(vs=>vs.map(v=>v.id===draft.id?{...draft, updatedAt: Date.now()}:v));
    // Fecha u hora cambiadas en la ficha de un vídeo programado → reprogramar en YouTube
    if(previo && draft.youtubeId && draft.youtubeStatus==="scheduled" && (previo.date!==draft.date || previo.time!==draft.time)){
      reprogramarEnYT(draft, draft.date, draft.time);
    }
  };

  // Mover a la papelera (no borra del todo)
  const deleteVideo = (id) => {
    setVideos(vs=>{
      const v = vs.find(x=>x.id===id);
      if(v) setTrash(t=>[{...v, deletedAt: Date.now()}, ...t]);
      return vs.filter(x=>x.id!==id);
    });
    addTomb(id, "video"); // que no reaparezca desde el otro dispositivo
    toast("Vídeo movido a la papelera");
  };
  // Restaurar un vídeo desde la papelera
  const restoreVideo = (id) => {
    setTrash(t=>{
      const v = t.find(x=>x.id===id);
      if(v){ const { deletedAt, ...rest } = v; setVideos(vs=>[...vs, {...rest, updatedAt: Date.now()}]); }
      return t.filter(x=>x.id!==id);
    });
    setTombstones(ts=>ts.filter(t=>t.id!==id)); // deja de estar "borrado"
    toast("Vídeo restaurado");
  };
  // Vaciar la papelera (con aviso de seguridad)
  const emptyTrash = () => {
    if(trash.length===0){ toast("La papelera ya está vacía"); return; }
    setConfirm({
      title: "Vaciar papelera",
      message: `Se eliminarán definitivamente ${trash.length} vídeo${trash.length!==1?"s":""}. Esta acción no se puede deshacer.`,
      confirmLabel: "Vaciar papelera",
      danger: true,
      onConfirm: () => { setTrash([]); setConfirm(null); toast("Papelera vaciada"); }
    });
  };
  // Borrar un único vídeo de la papelera de forma permanente
  const deleteForever = (id) => {
    const v = trash.find(x=>x.id===id);
    setConfirm({
      title: "Eliminar para siempre",
      message: `«${v?v.title:"Este vídeo"}» se eliminará permanentemente. Esta acción no se puede deshacer.`,
      confirmLabel: "Eliminar",
      danger: true,
      onConfirm: () => { setTrash(t=>t.filter(x=>x.id!==id)); setConfirm(null); toast("Vídeo eliminado permanentemente"); }
    });
  };

  const duplicateVideo = (v) => {
    const copy = {...clone(v), id:uid(), title:v.title+" (copia)", status:"idea", date:null};
    setVideos(vs=>[...vs, copy]);
    setEditing(copy);
    toast("Vídeo duplicado");
  };

  const quickAdd = (date) => {
    const v = makeVideo({date, status: date?"programado":"idea", title:"Nueva idea"}, formats);
    setVideos(vs=>[...vs, v]);
    setEditing(v);
  };

  const tabs = [
    {id:"calendar", label:"Calendario", icon:Icons.calendar, primary:true},
    {id:"kanban", label:"Ideas y tablero", icon:Icons.kanban, primary:true},
    {id:"tasks", label:"Tareas", icon:Icons.tasks, badge: taskLists.reduce((a,l)=>{
      if(l.fixed){
        // Diarias: vencidas si no se hicieron hoy y pasó su hora límite
        const tk = (()=>{ const d=new Date();const p=n=>String(n).padStart(2,"0");return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; })();
        return a + l.tasks.filter(t=>t.lastDone!==tk && t.limitTime && (()=>{ const [h,m]=t.limitTime.split(":").map(Number); const lim=new Date();lim.setHours(h||0,m||0,0,0); return Date.now()>lim.getTime(); })()).length;
      }
      return a + l.tasks.filter(t=>!t.done && t.due && new Date(t.due).getTime()<Date.now()).length;
    },0)},
    {id:"scheduled", label:"YouTube", icon:Icons.youtube, primary:true},
    {id:"agent", label:"Agente", icon:Icons.sparkles},
    {id:"stats", label:"Estadísticas", icon:Icons.chart},
    {id:"config", label:"Configuración", icon:Icons.gear},
    {id:"trash", label:"Papelera", icon:Icons.trash, badge:trash.length},
  ];
  const primaryTabs = tabs.filter(t=>t.primary);

  // Registro del Service Worker + permiso al arrancar
  // Inicia la conexión con Google desde la vista de YouTube
  const connectGoogle = () => {
    try { sessionStorage.setItem("rds_yt_return", "scheduled"); } catch(e){}
    ytStartAuth();
  };

  // Registra una lectura de suscriptores en el historial (máx. una cada 30 min)
  const recordSubs = (subs) => {
    setSubHistory(prev=>{
      const list = prev || [];
      const last = list[list.length-1];
      const now = Date.now();
      if(last && (now - last.t) < 30*60*1000 && last.s === subs) return list;
      if(last && last.s === subs && (now - last.t) < 6*60*60*1000) return list;
      const next = [...list, { t: now, s: subs }];
      return next.length > 500 ? next.slice(next.length-500) : next;
    });
  };

  // Aviso de publicación: comprueba periódicamente si algún vídeo PROGRAMADO ya se publicó
  // y lanza una notificación. Solo con la app visible y la sesión de Google activa.
  useEffect(()=>{
    let stopped = false;
    const checkPublished = async () => {
      if(stopped || document.visibilityState!=="visible") return;
      if(!ytIsConnected() || !ytTokenValid()) return;
      const s = stateRef.current;
      const scheduled = (s.videos||[]).filter(v=>v.youtubeId && v.youtubeStatus==="scheduled");
      // Comentarios preparados que quedaron pendientes (p. ej. falló el primer intento)
      const comentariosPendientes = (s.videos||[]).filter(v=>v.youtubeId && v.youtubeStatus==="published" && v.pinnedComment && !v.pinnedCommentPosted);
      for(const v of comentariosPendientes){
        try {
          await ytPostComment(v.youtubeId, v.pinnedComment);
          setVideos(vs=>vs.map(x=>x.id===v.id?{...x, pinnedCommentPosted:true, updatedAt:Date.now()}:x));
          toast("💬 Comentario publicado en «"+(v.title||"el vídeo")+"»");
        } catch(e){ /* reintento en el próximo ciclo */ }
      }
      if(scheduled.length===0) return;
      try {
        const map = await ytCheckVideos(scheduled.map(v=>v.youtubeId));
        const nowPublished = [];
        scheduled.forEach(v=>{
          const st = map[v.youtubeId];
          if(!st || !st.exists) return;
          if(st.privacyStatus==="public"){
            nowPublished.push(v);
            setVideos(vs=>vs.map(x=>x.id===v.id?{...x, youtubeStatus:"published", status:"publicado", updatedAt:Date.now()}:x));
          } else if(st.publishAt){
            // Reprogramado en YouTube → mover también aquí (fecha y hora locales)
            const wd = new Date(st.publishAt);
            const p2 = n=>String(n).padStart(2,"0");
            const nd = `${wd.getFullYear()}-${p2(wd.getMonth()+1)}-${p2(wd.getDate())}`;
            const nt = `${p2(wd.getHours())}:${p2(wd.getMinutes())}`;
            if(nd!==v.date || nt!==v.time){
              setVideos(vs=>vs.map(x=>x.id===v.id?{...x, date:nd, time:nt, updatedAt:Date.now()}:x));
            }
          }
        });
        for(const v of nowPublished){
          fireNotification("🎉 ¡Vídeo publicado!", "«"+(v.title||"Tu vídeo")+"» ya está disponible en YouTube");
          // Comentario fijado preparado → publicarlo ahora que el vídeo es público
          if(v.pinnedComment && !v.pinnedCommentPosted){
            try {
              await ytPostComment(v.youtubeId, v.pinnedComment);
              setVideos(vs=>vs.map(x=>x.id===v.id?{...x, pinnedCommentPosted:true, updatedAt:Date.now()}:x));
              toast("💬 Comentario publicado en «"+(v.title||"el vídeo")+"»");
            } catch(e){ /* se reintentará en la próxima comprobación */ }
          }
        }
        if(nowPublished.length>0) toast("🎉 "+nowPublished.length+" vídeo(s) recién publicado(s)");
      } catch(e){ /* silencioso */ }
    };
    const iv = setInterval(checkPublished, 5*60*1000); // cada 5 min
    const t0 = setTimeout(checkPublished, 8000);        // una primera pasada al arrancar
    const onVis = ()=>{ if(document.visibilityState==="visible") checkPublished(); };
    document.addEventListener("visibilitychange", onVis);
    return ()=>{ stopped=true; clearInterval(iv); clearTimeout(t0); document.removeEventListener("visibilitychange", onVis); };
  },[]);

  useEffect(()=>{ registerNotifSW(); },[]);

  // Mantener viva la sesión de Google: renovar el token en silencio antes de que caduque.
  useEffect(()=>{
    const check = async () => {
      if(document.visibilityState!=="visible") return;
      if(ytIsConnected() && !ytTokenValid()){
        await ytSilentRefresh(); // renueva sin recargar ni pedir login otra vez
      }
    };
    check();
    const iv = setInterval(check, 4*60*1000); // cada 4 min
    const onVis = ()=>{ if(document.visibilityState==="visible") check(); };
    document.addEventListener("visibilitychange", onVis);
    return ()=>{ clearInterval(iv); document.removeEventListener("visibilitychange", onVis); };
  },[]);

  // Al volver del login de Google (redirect con #access_token), guardar el token
  // y reabrir el modal de subida del vídeo que estábamos subiendo.
  useEffect(()=>{
    const captured = ytCaptureAuthFromHash();
    if(captured){
      toast("✅ Conectado con Google");
      try {
        const pendingId = sessionStorage.getItem("rds_yt_pending");
        const ret = sessionStorage.getItem("rds_yt_return");
        if(pendingId){
          sessionStorage.removeItem("rds_yt_pending");
          setTimeout(()=>{
            const vid = (stateRef.current.videos||[]).find(v=>v.id===pendingId);
            if(vid){ setView("calendar"); setYtUpload(vid); }
          }, 300);
        } else if(ret){
          sessionStorage.removeItem("rds_yt_return");
          setView(ret);
        }
      } catch(e){}
    }
  },[]);

  // ARCHIVADO DIARIO (corte a las 6:00): mueve las tareas diarias hechas ayer al archivo
  // semanal y marca como "atrasadas" las que quedaron sin hacer. Corre al abrir y cada 5 min.
  const rollDailyTasks = () => {
    const today = dailyDayKey();
    let archivedAny = false;
    const newArchiveEntries = {};
    setTaskLists(ls=>{
      let changed = false;
      const next = ls.map(l=>{
        if(!l.fixed) return l;
        const tasks = (l.tasks||[]).map(t=>{
          // Tarea marcada como hecha en un día lógico ANTERIOR → archivar y reiniciar
          if(t.lastDone && t.lastDone < today){
            const wk = weekKey(new Date(t.lastDone+"T12:00"));
            (newArchiveEntries[wk] = newArchiveEntries[wk] || []).push({ title:t.title, doneAt: t.completedAt || new Date(t.lastDone+"T12:00").getTime() });
            archivedAny = true; changed = true;
            // Reiniciar la tarea para el nuevo día: pendiente, y su "lastPending" pasa a hoy
            return {...t, lastDone:null, lastPending: today, completedAt:null, updatedAt:Date.now()};
          }
          // Tarea sin hacer de un día anterior → dejarla como atrasada (lastPending viejo)
          if(!t.lastDone){
            if(!t.lastPending){ changed = true; return {...t, lastPending: today, updatedAt:Date.now()}; }
            // lastPending ya es < today → queda atrasada; no tocamos para no romper la marca
            return t;
          }
          return t;
        });
        return changed ? {...l, tasks} : l;
      });
      return changed ? next : ls;
    });
    if(archivedAny){
      setDailyArchive(a=>{
        const copy = {...a};
        Object.entries(newArchiveEntries).forEach(([wk,items])=>{
          copy[wk] = [...(copy[wk]||[]), ...items];
        });
        return copy;
      });
    }
  };
  useEffect(()=>{
    rollDailyTasks(); // al abrir
    const iv = setInterval(rollDailyTasks, 5*60*1000); // cada 5 min por si la app queda abierta al cruzar las 6am
    return ()=>clearInterval(iv);
  },[]);

  // PLANIFICADOR DE NOTIFICACIONES
  // Marca "notified" en un registro LOCAL por dispositivo (no se sincroniza, para que cada
  // dispositivo avise una vez y la sincronización no reactive ni silencie avisos).
  const notifiedRef = useRef({});
  useEffect(()=>{
    try { notifiedRef.current = JSON.parse(localStorage.getItem("rds_notified")||"{}"); } catch(e){ notifiedRef.current = {}; }
  },[]);
  const markNotified = (id, dueSnapshot) => {
    notifiedRef.current[id] = { at: Date.now(), due: dueSnapshot };
    try { localStorage.setItem("rds_notified", JSON.stringify(notifiedRef.current)); } catch(e){}
  };
  // ¿Ya se notificó esta tarea CON esta misma hora? Si cambió la hora, se puede volver a avisar.
  const alreadyNotified = (t) => {
    const rec = notifiedRef.current[t.id];
    if(!rec) return false;
    if(typeof rec === "number") return true; // formato antiguo
    return rec.due === (t.due||null);
  };

  useEffect(()=>{
    let timers = [];
    const fireFor = (t, listName) => {
      if(alreadyNotified(t)) return; // ya avisado en este dispositivo con esta hora
      markNotified(t.id, t.due||null);
      const ok = fireNotification("⏰ " + t.title, "Tarea programada" + (listName?" · "+listName:""));
      if(!ok) toast("🔔 " + t.title);
    };
    const scan = () => {
      const now = Date.now();
      const lists = stateRef.current.taskLists || [];
      timers.forEach(clearTimeout); timers = [];
      lists.forEach(l=>{
        (l.tasks||[]).forEach(t=>{
          if(t.done || !t.due) return;
          if(alreadyNotified(t)) return;
          const at = new Date(t.due).getTime();
          if(isNaN(at)) return;
          if(at <= now){
            fireFor(t, l.name); // ya venció → avisar ya
          } else if(at - now <= 65000){
            // Vence en menos de ~1 min → programar timeout exacto
            timers.push(setTimeout(()=>fireFor(t, l.name), at - now));
          }
        });
      });
    };
    scan();
    const iv = setInterval(scan, 15000); // reevaluar cada 15s
    // Limpiar registros de tareas que ya no existen (evita que crezca sin fin)
    const clean = setInterval(()=>{
      const ids = new Set((stateRef.current.taskLists||[]).flatMap(l=>(l.tasks||[]).map(t=>t.id)));
      let changed=false;
      Object.keys(notifiedRef.current).forEach(id=>{ if(!ids.has(id)){ delete notifiedRef.current[id]; changed=true; } });
      if(changed){ try { localStorage.setItem("rds_notified", JSON.stringify(notifiedRef.current)); } catch(e){} }
    }, 120000);
    return ()=>{ clearInterval(iv); clearInterval(clean); timers.forEach(clearTimeout); };
  },[]);

  return (
    <div style={{minHeight:"100vh",background:"radial-gradient(1200px 600px at 80% -10%, rgba(212,175,55,0.06), transparent), var(--bg)"}}>
      {/* HEADER */}
      <header style={{borderBottom:"1px solid var(--border)",position:"sticky",top:0,zIndex:50,backdropFilter:"blur(12px)",background:"var(--header-bg)"}}>
        <div className="app-header" style={{maxWidth:1500,margin:"0 auto",padding:"0 24px",height:66,display:"flex",alignItems:"center",justifyContent:"space-between",gap:16}}>
          <div style={{display:"flex",alignItems:"center",gap:13}}>
            <button onClick={()=>setMenuOpen(true)} title="Abrir menú" style={{
              display:"flex",alignItems:"center",justifyContent:"center",width:40,height:40,borderRadius:11,
              color:"var(--text)",border:"1px solid var(--border)",flexShrink:0
            }}>{Icons.menu}</button>
            <div className="grad-gold gold-glow" style={{width:40,height:40,borderRadius:11,display:"flex",alignItems:"center",justifyContent:"center",color:"#000"}}>
              <span style={{fontFamily:"'Sora'",fontWeight:800,fontSize:19}}>R</span>
            </div>
            <div className="brand-text">
              <div style={{fontFamily:"'Sora'",fontWeight:700,fontSize:17,letterSpacing:"-.01em"}}>RDeRandom <span className="gold-text">Studio</span></div>
              <div style={{fontSize:10.5,color:"var(--text-3)",letterSpacing:".04em"}}>Gestor de contenido</div>
            </div>
          </div>

          <nav className="top-nav" style={{display:"flex",gap:4,background:"var(--bg-2)",border:"1px solid var(--border)",borderRadius:13,padding:4}}>
            {primaryTabs.map(tb=>(
              <button key={tb.id} onClick={()=>setView(tb.id)} style={{
                display:"flex",alignItems:"center",gap:8,fontSize:13,fontWeight:600,padding:"9px 15px",borderRadius:9,transition:"all .18s",position:"relative",
                ...(view===tb.id
                  ? {background:"linear-gradient(135deg,rgba(212,175,55,0.18),rgba(212,175,55,0.08))",color:"var(--gold)",boxShadow:"0 0 0 1px rgba(212,175,55,0.25)"}
                  : {color:"var(--text-2)"})
              }}>{tb.icon}<span className="tab-label">{tb.label}</span>
                {tb.badge>0 && <span style={{
                  fontSize:10,fontWeight:700,minWidth:17,height:17,padding:"0 5px",borderRadius:9,
                  background:"var(--red)",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center"
                }}>{tb.badge}</span>}
              </button>
            ))}
          </nav>


          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            {/* Buscador global: encuentra cualquier vídeo y abre su ventana */}
            <GlobalSearch videos={videos} formats={formats} onOpen={setEditing}/>

            {/* Grupo edición: deshacer / rehacer (oculto en móvil, va al menú lateral) */}
            <div className="undo-group" style={{display:"flex",gap:2,background:"var(--bg-2)",border:"1px solid var(--border)",borderRadius:11,padding:3}}>
              <button onClick={undo} disabled={!historyRef.current.past.length} title="Deshacer (Ctrl+Z)" style={{
                display:"flex",alignItems:"center",justifyContent:"center",width:32,height:30,borderRadius:8,
                color: historyRef.current.past.length?"var(--text-2)":"var(--empty)", opacity: historyRef.current.past.length?1:0.5, transition:"color .15s"
              }} onMouseEnter={e=>{if(historyRef.current.past.length)e.currentTarget.style.color="var(--gold)";}}
                 onMouseLeave={e=>e.currentTarget.style.color=historyRef.current.past.length?"var(--text-2)":"var(--empty)"}>{Icons.undo}</button>
              <button onClick={redo} disabled={!historyRef.current.future.length} title="Rehacer (Ctrl+Y)" style={{
                display:"flex",alignItems:"center",justifyContent:"center",width:32,height:30,borderRadius:8,
                color: historyRef.current.future.length?"var(--text-2)":"var(--empty)", opacity: historyRef.current.future.length?1:0.5, transition:"color .15s"
              }} onMouseEnter={e=>{if(historyRef.current.future.length)e.currentTarget.style.color="var(--gold)";}}
                 onMouseLeave={e=>e.currentTarget.style.color=historyRef.current.future.length?"var(--text-2)":"var(--empty)"}>{Icons.redo}</button>
            </div>

            {/* Grupo herramientas: tema + formatos (formatos oculto en móvil, va al menú) */}
            <div className="tools-group" style={{display:"flex",gap:2,background:"var(--bg-2)",border:"1px solid var(--border)",borderRadius:11,padding:3}}>
              <button onClick={()=>setTheme(t=>t==="dark"?"light":"dark")} title={theme==="dark"?"Tema claro":"Tema oscuro"} style={{
                display:"flex",alignItems:"center",justifyContent:"center",width:32,height:30,borderRadius:8,color:"var(--text-2)",transition:"color .15s"
              }} onMouseEnter={e=>e.currentTarget.style.color="var(--gold)"} onMouseLeave={e=>e.currentTarget.style.color="var(--text-2)"}>
                {theme==="dark"?Icons.sun:Icons.moon}
              </button>
              <button onClick={()=>setShowFormats(true)} title="Gestionar formatos" className="fmt-btn" style={{
                display:"flex",alignItems:"center",justifyContent:"center",width:32,height:30,borderRadius:8,color:"var(--text-2)",transition:"color .15s"
              }} onMouseEnter={e=>e.currentTarget.style.color="var(--gold)"} onMouseLeave={e=>e.currentTarget.style.color="var(--text-2)"}>
                {Icons.tag}
              </button>
            </div>

            {/* Grupo sincronización: refrescar + estado */}
            {(()=>{
              const manualPending = syncMode==="manual" && pendingChanges;
              const si = {
                connecting:{c:"var(--gold)",t:"Conectando…",icon:Icons.cloud,pulse:true},
                online:{c:"var(--green)",t:"Sincronizado",icon:Icons.cloudCheck,pulse:false},
                saving:{c:"var(--gold)",t:"Guardando…",icon:Icons.cloud,pulse:true},
                offline:{c:"var(--red)",t:"Sin conexión",icon:Icons.cloud,pulse:false},
              }[syncStatus] || {c:"var(--text-3)",t:"—",icon:Icons.cloud,pulse:false};
              const off = syncStatus==="offline";
              // En modo manual con cambios sin subir, el badge lo indica claramente
              const disp = manualPending
                ? {c:"var(--gold)",t:"Cambios sin subir",pulse:true}
                : (syncMode==="manual" ? {c:si.c,t:"Manual · al día",pulse:false} : si);
              return (
                <div style={{display:"flex",gap:2,background:"var(--bg-2)",border:`1px solid ${off?"rgba(248,113,113,0.5)":(manualPending?"var(--border-gold)":"var(--border)")}`,borderRadius:11,padding:3}}>
                  <button onClick={syncNow} disabled={manualSyncing} title={syncMode==="manual"?"Sincronizar ahora (subir y bajar)":"Sincronizar ahora"} style={{
                    display:"flex",alignItems:"center",justifyContent:"center",width:32,height:30,borderRadius:8,
                    color: (manualSyncing||manualPending)?"var(--gold)":"var(--text-2)",transition:"color .15s"
                  }} onMouseEnter={e=>e.currentTarget.style.color="var(--gold)"} onMouseLeave={e=>{if(!manualSyncing&&!manualPending)e.currentTarget.style.color="var(--text-2)";}}>
                    <span className={manualSyncing?"spinning":""} style={{display:"flex"}}>{Icons.refresh}</span>
                  </button>
                  <button onClick={()=>setShowSync(true)} title="Sincronización entre dispositivos" className="sync-btn" style={{
                    display:"flex",alignItems:"center",gap:7,fontSize:12,fontWeight:600,color:disp.c,padding:"0 11px 0 9px",borderRadius:8,
                    background: off?"rgba(248,113,113,0.1)":(manualPending?"rgba(212,175,55,0.08)":"transparent"), transition:"all .15s",whiteSpace:"nowrap"
                  }}>
                    <span className={"sync-dot"+(disp.pulse?" pulsing":"")} style={{background:disp.c}}/>
                    <span className={off?"":"sync-label"}>{disp.t}</span>
                  </button>
                </div>
              );
            })()}
          </div>
        </div>
      </header>

      {/* AVISO DE MODO SIN CONEXIÓN */}
      {syncStatus==="offline" && (
        <div className="fade-in" style={{background:"rgba(248,113,113,0.08)",borderBottom:"1px solid rgba(248,113,113,0.25)",padding:"9px 16px",display:"flex",alignItems:"center",justifyContent:"center",gap:9,flexWrap:"wrap"}}>
          <span style={{fontSize:12.5,color:"var(--red)",fontWeight:600}}>Sin conexión</span>
          <span style={{fontSize:12,color:"var(--text-2)"}}>Trabajas con la copia guardada en este dispositivo. Tus cambios se conservan y se subirán solos al volver internet.</span>
          <button onClick={syncNow} style={{fontSize:12,fontWeight:700,color:"var(--red)",border:"1px solid rgba(248,113,113,0.4)",borderRadius:8,padding:"4px 11px"}}>Reintentar</button>
        </div>
      )}

      {/* MENÚ LATERAL (móvil) */}
      {menuOpen && (
        <div onClick={()=>setMenuOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:900,backdropFilter:"blur(2px)"}}>
          <div onClick={e=>e.stopPropagation()} className="drawer" style={{
            position:"absolute",left:0,top:0,bottom:0,width:280,maxWidth:"82vw",
            background:"var(--bg-2)",borderRight:"1px solid var(--border)",display:"flex",flexDirection:"column",
            paddingTop:"calc(env(safe-area-inset-top) + 14px)",paddingBottom:"calc(env(safe-area-inset-bottom) + 14px)",
            boxShadow:"12px 0 40px rgba(0,0,0,0.5)"
          }}>
            <div style={{display:"flex",alignItems:"center",gap:11,padding:"4px 16px 16px",borderBottom:"1px solid var(--border)"}}>
              <div className="grad-gold" style={{width:34,height:34,borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center",color:"#000"}}>
                <span style={{fontFamily:"'Sora'",fontWeight:800,fontSize:16}}>R</span>
              </div>
              <div>
                <div style={{fontFamily:"'Sora'",fontWeight:700,fontSize:14.5}}>RDeRandom <span className="gold-text">Studio</span></div>
                <div style={{fontSize:10,color:"var(--text-3)"}}>Gestor de contenido</div>
              </div>
              <button onClick={()=>setMenuOpen(false)} style={{marginLeft:"auto",color:"var(--text-2)",display:"flex",padding:5}}>{Icons.x}</button>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:4,padding:"14px 12px",flex:1,overflowY:"auto"}}>
              {tabs.map(tb=>(
                <button key={tb.id} onClick={()=>{setView(tb.id); setMenuOpen(false);}} style={{
                  display:"flex",alignItems:"center",gap:12,fontSize:14,fontWeight:600,padding:"13px 14px",borderRadius:11,transition:"all .15s",textAlign:"left",
                  ...(view===tb.id
                    ? {background:"linear-gradient(135deg,rgba(212,175,55,0.18),rgba(212,175,55,0.08))",color:"var(--gold)",boxShadow:"0 0 0 1px rgba(212,175,55,0.25)"}
                    : {color:"var(--text-2)"})
                }}>{tb.icon}<span style={{flex:1}}>{tb.label}</span>
                  {tb.badge>0 && <span style={{
                    fontSize:10,fontWeight:700,minWidth:18,height:18,padding:"0 5px",borderRadius:9,
                    background:"var(--red)",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center"
                  }}>{tb.badge}</span>}
                </button>
              ))}
              <div style={{height:1,background:"var(--border)",margin:"10px 4px"}}/>
              <div style={{display:"flex",gap:8,padding:"0 2px"}}>
                <button onClick={undo} disabled={!historyRef.current.past.length} style={{
                  flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:8,fontSize:13,fontWeight:600,padding:"11px",borderRadius:11,
                  color: historyRef.current.past.length?"var(--text-2)":"var(--empty)",border:"1px solid var(--border)",opacity:historyRef.current.past.length?1:0.55
                }}>{Icons.undo} Deshacer</button>
                <button onClick={redo} disabled={!historyRef.current.future.length} style={{
                  flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:8,fontSize:13,fontWeight:600,padding:"11px",borderRadius:11,
                  color: historyRef.current.future.length?"var(--text-2)":"var(--empty)",border:"1px solid var(--border)",opacity:historyRef.current.future.length?1:0.55
                }}>{Icons.redo} Rehacer</button>
              </div>
              <button onClick={()=>{setShowFormats(true); setMenuOpen(false);}} style={{
                display:"flex",alignItems:"center",gap:12,fontSize:14,fontWeight:600,padding:"13px 14px",borderRadius:11,color:"var(--text-2)",textAlign:"left"
              }}>{Icons.tag}<span>Formatos</span></button>
              <button onClick={()=>{setShowSync(true); setMenuOpen(false);}} style={{
                display:"flex",alignItems:"center",gap:12,fontSize:14,fontWeight:600,padding:"13px 14px",borderRadius:11,color:"var(--text-2)",textAlign:"left"
              }}>{Icons.cloud}<span>Sincronización</span></button>
            </div>
            <div style={{padding:"10px 16px 0",borderTop:"1px solid var(--border)",fontSize:10.5,color:"var(--text-3)"}}>
              Datos sincronizados con la nube
            </div>
          </div>
        </div>
      )}

      {/* MAIN */}
      <main className="app-main" style={{maxWidth:1500,margin:"0 auto",padding:"26px 24px 60px"}}>
        <ExpandCtx.Provider value={cardsExpanded}>
        {(view==="calendar" || view==="kanban" || view==="scheduled") && (
          <div style={{display:"flex",justifyContent:"flex-end",marginBottom:8}}>
            <button onClick={()=>setCardsExpanded(x=>!x)} title={cardsExpanded?"Contraer todas las tarjetas":"Expandir todas las tarjetas"} style={{
              display:"flex",alignItems:"center",gap:6,fontSize:11.5,fontWeight:600,color:"var(--text-3)",
              border:"1px solid var(--border)",borderRadius:8,padding:"6px 11px"
            }}>
              <span style={{display:"flex",transform:cardsExpanded?"rotate(180deg)":"none",transition:"transform .18s"}}>{Icons.chevron}</span>
              {cardsExpanded?"Contraer todo":"Expandir todo"}
            </button>
          </div>
        )}
        {view!=="trash" && view!=="tasks" && view!=="stats" && view!=="config" && <StatStrip videos={videos}/>}
        {view==="kanban" && (
          <div style={{position:"relative",marginBottom:16,maxWidth:340}}>
            <span style={{position:"absolute",left:13,top:"50%",transform:"translateY(-50%)",color:"var(--text-3)",display:"flex"}}>{Icons.search}</span>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar vídeo por título..." style={{...inputStyle,paddingLeft:38}}/>
          </div>
        )}
        {view==="calendar" && <CalendarView videos={videos} onOpen={setEditing} onDrop={dropOnDate} onDragStart={onDragStart} onDragEnd={onDragEnd} weekOffset={weekOffset} setWeekOffset={setWeekOffset} calView={calView} setCalView={setCalView} onQuickAdd={quickAdd} onUnassign={unassignVideo} formats={formats}/>}
        {view==="kanban" && <KanbanView videos={videos} onOpen={setEditing} onDrop={dropOnStatus} onDragStart={onDragStart} onDragEnd={onDragEnd} onQuickAdd={quickAdd} formats={formats} search={search}/>}
        {view==="tasks" && <TasksView taskLists={taskLists} setTaskLists={setTaskLists} dailyArchive={dailyArchive} toast={toast} onTaskDeleted={(id)=>addTomb(id,"task")} onListDeleted={(id)=>addTomb(id,"list")} askConfirm={(cfg)=>setConfirm({...cfg, onConfirm:()=>{ cfg.onConfirm(); setConfirm(null); }})}/>}
        {view==="stats" && <StatsView videos={videos} taskLists={taskLists} formats={formats}/>}
        {view==="scheduled" && <ScheduledView videos={videos} trashYtIds={trash.map(t=>t.youtubeId).filter(Boolean)} onOpen={setEditing} onUpdateVideo={(id,patch)=>setVideos(vs=>vs.map(v=>v.id===id?{...v,...patch,updatedAt:Date.now()}:v))} onAddVideos={(nuevos)=>setVideos(vs=>[...vs, ...nuevos])} subHistory={subHistory} onRecordSubs={recordSubs} onConnect={connectGoogle} formats={formats} toast={toast} goals={goals} setGoals={setGoals}/>}
        {view==="agent" && <AgentView promptTemplates={promptTemplates} setPromptTemplates={setPromptTemplates} toast={toast}/>}
        {view==="trash" && <TrashView trash={trash} onRestore={restoreVideo} onDeleteForever={deleteForever} onEmpty={emptyTrash} formats={formats}/>}
        {view==="config" && <ConfigView goals={goals} setGoals={setGoals} theme={theme} setTheme={setTheme} cardsExpanded={cardsExpanded} setCardsExpanded={setCardsExpanded} onConnect={connectGoogle} onExport={exportData} onImport={importData} onReset={resetAll} toast={toast}/>}

        <footer style={{marginTop:40,paddingTop:20,borderTop:"1px solid var(--border)",display:"flex",flexDirection:"column",gap:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
            <p style={{fontSize:12,color:"var(--text-3)",lineHeight:1.5,maxWidth:520}}>
              Tus datos se guardan en este navegador y se sincronizan de forma segura en la nube con tu código de sincronización. Úsalo en otro dispositivo para tener todo al día.
            </p>
            <button onClick={resetAll} style={{
              display:"flex",alignItems:"center",gap:7,fontSize:12.5,fontWeight:600,color:"var(--text-3)",padding:"8px 13px",borderRadius:9,
              border:"1px solid var(--border)",transition:"all .15s",whiteSpace:"nowrap"
            }} onMouseEnter={e=>{e.currentTarget.style.color="var(--red)";e.currentTarget.style.borderColor="rgba(248,113,113,0.3)";}}
               onMouseLeave={e=>{e.currentTarget.style.color="var(--text-3)";e.currentTarget.style.borderColor="var(--border)";}}>
              {Icons.trash} Restablecer datos
            </button>
          </div>
          <div style={{textAlign:"center",fontSize:11.5,color:"var(--text-3)",paddingTop:6,borderTop:"1px solid var(--border)"}}>
            <span style={{fontFamily:"'Sora'",fontWeight:700}}>RDeRandom <span className="gold-text">Studio</span></span>
            <span style={{margin:"0 8px",opacity:.5}}>·</span>
            <span>v{APP_VERSION}</span>
            <span style={{margin:"0 8px",opacity:.5}}>·</span>
            <span>© {new Date().getFullYear()} RDeRandom. Todos los derechos reservados.</span>
          </div>
        </footer>
        </ExpandCtx.Provider>
      </main>

      {editing && <VideoModal v={editing} allVideos={videos} goals={goals} onClose={()=>setEditing(null)} onSave={saveVideo} onDelete={deleteVideo} onDuplicate={duplicateVideo} onUploadYouTube={(draft)=>{ setEditing(null); setYtUpload(draft); }} promptTemplates={promptTemplates} toast={toast} formats={formats}/>}
      {ytUpload && <YouTubeUploadModal video={ytUpload} allVideos={videos} tagTemplates={tagTemplates} setTagTemplates={setTagTemplates} onClose={()=>setYtUpload(null)} onDone={(yt)=>{ setVideos(vs=>vs.map(v=>v.id===ytUpload.id?completarChecklist({...v, ...yt, updatedAt:Date.now()}):v)); }} toast={toast}/>}
      {showFormats && <FormatsModal formats={formats} setFormats={setFormats} videos={videos} onClose={()=>setShowFormats(false)} toast={toast} askConfirm={(cfg)=>setConfirm({...cfg, onConfirm:()=>{ cfg.onConfirm(); setConfirm(null); }})}/>}
      {showSync && <SyncModal syncCode={syncCode} status={syncStatus} syncMode={syncMode} setSyncMode={setSyncMode} pendingChanges={pendingChanges} onClose={()=>setShowSync(false)} onLink={linkToCode} onExport={exportData} onImport={importData} onSyncNow={syncNow} syncing={manualSyncing} toast={toast}/>}
      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
        danger={confirm?.danger}
        onConfirm={()=>confirm?.onConfirm&&confirm.onConfirm()}
        onCancel={()=>setConfirm(null)}
      />
      {/* BANNER PERSISTENTE DE TAREAS VENCIDAS */}
      {(()=>{
        const overdueList = [];
        taskLists.forEach(l=>l.tasks.forEach(t=>{
          if(!t.done && t.due && new Date(t.due).getTime() < Date.now()) overdueList.push({...t, listName:l.name});
        }));
        if(overdueList.length===0 || view==="tasks") return null;
        const postponeAll = () => {
          const newDue = new Date(Date.now()+60*60*1000);
          const pad = n=>String(n).padStart(2,"0");
          const iso = `${newDue.getFullYear()}-${pad(newDue.getMonth()+1)}-${pad(newDue.getDate())}T${pad(newDue.getHours())}:${pad(newDue.getMinutes())}`;
          setTaskLists(ls=>ls.map(l=>({...l, tasks:l.tasks.map(t=>
            (!t.done && t.due && new Date(t.due).getTime()<Date.now()) ? {...t, due:iso, notified:false} : t
          )})));
          toast("Tareas pospuestas 1 hora");
        };
        return (
          <div className="overdue-banner" style={{
            position:"fixed", bottom:"calc(env(safe-area-inset-bottom) + 16px)", left:"50%", transform:"translateX(-50%)",
            zIndex:850, display:"flex", alignItems:"center", gap:10, flexWrap:"wrap", justifyContent:"center",
            background:"var(--bg-2)", border:"1px solid rgba(248,113,113,0.45)", borderRadius:13,
            padding:"11px 15px", boxShadow:"0 12px 40px rgba(0,0,0,0.5)", maxWidth:"calc(100vw - 24px)"
          }}>
            <span style={{display:"flex",color:"var(--red)"}}>{Icons.bell}</span>
            <span style={{fontSize:12.5,fontWeight:700,color:"var(--red)",whiteSpace:"nowrap"}}>
              {overdueList.length} tarea{overdueList.length!==1?"s":""} vencida{overdueList.length!==1?"s":""}
            </span>
            <span style={{fontSize:12,color:"var(--text-2)",maxWidth:220,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} className="tab-label">
              {overdueList[0].title}{overdueList.length>1?` y ${overdueList.length-1} más`:""}
            </span>
            <button onClick={()=>setView("tasks")} className="grad-gold" style={{fontSize:12,fontWeight:700,color:"#000",padding:"6px 13px",borderRadius:8,flexShrink:0}}>Ver</button>
            <button onClick={postponeAll} style={{fontSize:12,fontWeight:600,color:"var(--text-2)",padding:"6px 11px",borderRadius:8,border:"1px solid var(--border)",flexShrink:0}}>+1 hora</button>
          </div>
        );
      })()}

      {toastNode}

      <style>{`
        /* La pista táctil solo se ve en pantallas pequeñas */
        .hint-touch { display:none; }

        /* ——— Animaciones leves ——— */
        [data-drop="card"] { transition: transform .13s ease, box-shadow .18s ease, background .15s, border-color .15s !important; }
        [data-drop="card"]:hover { transform: translateY(-1px); box-shadow: 0 5px 16px rgba(0,0,0,0.28); }
        .modal-overlay > div, .yt-modal-panel { animation: modalIn .16s ease; }
        @keyframes modalIn { from { opacity:0; transform: translateY(8px) scale(.985); } to { opacity:1; transform:none; } }

        @media (max-width: 1100px) {
          .global-search { display:none; }
        }

        /* Editor de vídeo: ancho y a dos columnas en escritorio */
        @media (min-width: 900px) {
          .vm-panel { max-width: 980px !important; }
          .vm-cols { display: grid !important; grid-template-columns: 1fr 1.15fr; gap: 22px; align-items: start; }
        }

        @media (max-width: 1100px) {
          .stat-grid { grid-template-columns: repeat(3,1fr) !important; }
        }
        @media (max-width: 920px) {
          .tab-label { display:none; }
          .brand-text { display:none; }
          /* En móvil el botón de nube queda visible pero compacto (solo icono) */
          .sync-label { display:none; }
          .sync-btn { padding: 8px 10px !important; }
        }
        @media (max-width: 760px) {
          .cal-grid { grid-template-columns: repeat(2,1fr) !important; }
          .stat-grid { grid-template-columns: repeat(2,1fr) !important; }
          .unassigned-hint { display:none !important; }
          .modal-hint { display:none !important; }
          .hint-desktop { display:none; }
          .hint-touch { display:inline; }
          .app-header { padding: 0 14px !important; height: 58px !important; gap: 10px !important; }
          .app-main { padding: 16px 14px 80px !important; }
          /* En móvil: menú lateral en vez de pestañas superiores */
          .top-nav { display:none !important; }
          .menu-btn { display:flex !important; }
          .cal-month-grid > div { min-height: 62px !important; padding: 4px !important; }
          .tasks-grid { grid-template-columns: 1fr !important; }
          /* Estadísticas apiladas en móvil */
          .stats-grid { grid-template-columns: 1fr !important; }
          .stats-cards { grid-template-columns: repeat(2,1fr) !important; }
          /* Deshacer/rehacer y formatos viven en el menú lateral en móvil */
          .undo-group { display:none !important; }
          .fmt-btn { display:none !important; }
          /* La lista de vídeos en YouTube se apila para no desbordar */
          .yt-row { flex-direction: column !important; align-items: stretch !important; }
          .yt-row-actions { justify-content: flex-start !important; }
        }
        @media (max-width: 480px) {
          .stat-grid { grid-template-columns: repeat(2,1fr) !important; gap: 8px !important; }
          .cal-grid { grid-template-columns: 1fr !important; }
          .app-main { padding: 14px 11px 90px !important; }
          /* Botones del header más compactos */
          .app-header { gap: 8px !important; }
          /* Modales casi a pantalla completa, respetando el notch */
          .modal-overlay { padding: calc(env(safe-area-inset-top) + 12px) 10px calc(env(safe-area-inset-bottom) + 16px) 10px !important; align-items: flex-start !important; }
          /* El modal de YouTube ocupa casi toda la pantalla y permite scroll cómodo */
          .yt-modal-panel { max-width: 100% !important; padding: 18px !important; }
        }
      `}</style>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
