import React from "react";
const { useState, useEffect, useRef, useMemo, useCallback } = React;


export const APP_VERSION = "3.20.0";

/* ============================ DATOS BASE ============================ */
/* Formatos v2 (23/8/2026): 8 formatos que resumen todo el contenido real del canal.
   Las claves son fijas (el clasificador las usa); las etiquetas y colores se pueden cambiar. */
export const DEFAULT_FORMATS = {
  combates:  { label: "Combates",             color: "#ef4444", score: 95, ideal: ["Lun","Mie","Vie","Dom"] },
  jugadas:   { label: "Jugadas y momentos",   color: "#60a5fa", score: 90, ideal: ["Mar","Jue","Sab"] },
  cajas:     { label: "Cajas y regalos",      color: "#a78bfa", score: 92, ideal: ["Mar","Jue","Sab"] },
  retos:     { label: "Retos y dinÃ¡micas",    color: "#4ade80", score: 88, ideal: ["Lun","Mie","Sab"] },
  comunidad: { label: "Comunidad y preguntas", color: "#f472b6", score: 86, ideal: ["Mar","Jue","Dom"] },
  ropa:      { label: "Ropa y equipaciones",  color: "#22d3ee", score: 82, ideal: ["Mar","Vie"] },
  novedades: { label: "Novedades y eventos",  color: "#fb923c", score: 84, ideal: ["Lun","Sab","Dom"] },
  directos:  { label: "Directos",             color: "#D4AF37", score: 80, ideal: ["Vie","Sab","Dom"] },
};
export const PALETTE = [
  // Rojos / corales
  "#ef4444","#f87171","#fb7185","#e11d48",
  // Naranjas / Ã¡mbar
  "#f97316","#fb923c","#fdba74","#ea580c",
  // Amarillos / dorados
  "#facc15","#fde047","#eab308","#D4AF37",
  // Limas / verdes
  "#a3e635","#84cc16","#4ade80","#22c55e","#16a34a",
  // Esmeralda / teal / cian
  "#10b981","#2dd4bf","#14b8a6","#22d3ee","#06b6d4",
  // Azules
  "#38bdf8","#60a5fa","#3b82f6","#2563eb","#1d4ed8",
  // Ãndigos / violetas
  "#818cf8","#6366f1","#a78bfa","#8b5cf6","#7c3aed",
  // Morados / fucsias / rosas
  "#c084fc","#a855f7","#d946ef","#e879f9","#f472b6","#ec4899",
  // Marrones / neutros
  "#b45309","#92400e","#a8a29e","#94a3b8","#64748b",
];

export const STATUSES = {
  idea:       { label: "Idea", color: "#6B6B6B" },
  grabacion:  { label: "Grabado", color: "#fb923c" },
  edicion:    { label: "Editados", color: "#a78bfa" },
  programado: { label: "Programado", color: "#60a5fa" },
  publicado:  { label: "Publicado", color: "#4ade80" },
};
export const CHECKLIST_TEMPLATE = [
  { id:"guion", label:"Guion / Gancho", done:false },
  { id:"grabacion", label:"GrabaciÃ³n", done:false },
  { id:"edicion", label:"EdiciÃ³n", done:false },
  { id:"miniatura", label:"Miniatura / TÃ­tulo", done:false },
  { id:"descripcion", label:"DescripciÃ³n / Tags", done:false },
];
export const DAYS = ["Lun","Mar","Mie","Jue","Vie","Sab","Dom"];
export const DAY_FULL = { Lun:"Lunes", Mar:"Martes", Mie:"MiÃ©rcoles", Jue:"Jueves", Vie:"Viernes", Sab:"SÃ¡bado", Dom:"Domingo" };

export let _id = 100;
export const uid = () => "v" + (++_id);
// el contador de ids vive aquÃ­: los demÃ¡s mÃ³dulos lo cambian con estas dos
export const setIdBase = n => { _id = n; };
export const getIdBase = () => _id;
export const clone = o => JSON.parse(JSON.stringify(o));
// Devuelve los pares [clave, formato] ordenados alfabÃ©ticamente por su etiqueta
export const sortedFormats = (formats) => Object.entries(formats).sort((a,b)=>a[1].label.localeCompare(b[1].label, "es", {sensitivity:"base"}));

export function makeVideo(opts={}, formats) {
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
export const todayObj = new Date();
export const Y = todayObj.getFullYear(), M = todayObj.getMonth();
export const iso = (y,m,d) => `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;

export const SEED = [
  makeVideo({title:"1v1 vs el suscriptor mÃ¡s nuevo", format:"competitivo", status:"programado", date:iso(Y,M,todayObj.getDate()), type:"short"}),
  makeVideo({title:"AbrÃ­ 10 bolsas doradas en 1 minuto", format:"cajas", status:"edicion", date:iso(Y,M,todayObj.getDate()+1), type:"short"}),
  makeVideo({title:"Reto: no puedes hablar antes de ganar", format:"retos", status:"grabacion", date:iso(Y,M,todayObj.getDate()+2), type:"short"}),
  makeVideo({title:"Mundial de equipaciones â€” capÃ­tulo 4", format:"competitivo", status:"idea", type:"largo"}),
  makeVideo({title:"Reacciono a los mejores clips de Rivals", format:"reacciones", status:"idea", type:"short"}),
  makeVideo({title:"Â¿Para quÃ© sirve esta skin escondida?", format:"educativo", status:"idea", type:"short"}),
  makeVideo({title:"1 like = 1 caja (camino al millÃ³n)", format:"retos", status:"idea", type:"short"}),
];

/* ============================ ICONOS ============================ */
export const Icon = ({d, size=18, fill="none", stroke="currentColor", sw=1.8, style}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={style}>{d}</svg>
);
export const Icons = {
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
  chat: <Icon d={<><path d="M21 12a8 8 0 01-11.6 7.1L4 20.5l1.4-4.7A8 8 0 1121 12z"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01" strokeWidth="2.6"/></>}/>,
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
export function useToast() {
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
export const FormatPill = ({fmt, small}) => {
  if(!fmt) return null;
  return (
    <span style={{
      display:"inline-flex", alignItems:"center", gap:6, fontSize: small?10.5:11.5, fontWeight:600,
      color:fmt.color, background:`${fmt.color}14`, border:`1px solid ${fmt.color}33`,
      padding: small?"2px 7px":"3px 9px", borderRadius:7, whiteSpace:"nowrap",
      minWidth:0, maxWidth:"100%" // puede encogerse: el nombre se corta con â€¦ si no cabe
    }}>
      <span style={{width:6, height:6, borderRadius:"50%", background:fmt.color, flexShrink:0}}/>
      <span style={{overflow:"hidden", textOverflow:"ellipsis"}}>{fmt.label}</span>
    </span>
  );
};
export const StatusDot = ({status}) => {
  const s = STATUSES[status];
  return <span style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:11,color:s.color,fontWeight:600}}>
    <span style={{width:7,height:7,borderRadius:"50%",background:s.color,boxShadow:`0 0 8px ${s.color}99`}}/>{s.label}
  </span>;
};

/* ============================ VIDEO CARD ============================ */
/* ============================ ARRASTRE TÃCTIL (iPhone/Android) ============================ */
// Puente entre las tarjetas y las acciones de mover de App.
export const dnd = { moveToDate:null, moveToStatus:null, moveToUnassign:null, suppressClickUntil:0 };

export const touchDrag = {
  active:false, id:null, ghost:null, lastZone:null, lpTimer:null,
  startX:0, startY:0, moved:false, cardEl:null, scrollDir:0, scrollRAF:null, lastY:0,

  // Desplaza la pÃ¡gina cuando el dedo se acerca a los bordes (para poder arrastrar lejos)
  autoScroll(){
    if(!touchDrag.active){ touchDrag.scrollRAF=null; return; }
    if(touchDrag.scrollDir!==0){
      window.scrollBy(0, touchDrag.scrollDir);
      // La pÃ¡gina se mueve bajo el dedo: recalcular la zona bajo el dedo
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
    // MantÃ©n pulsado ~300ms (sin mover) para "levantar" la tarjeta
    this.lpTimer = setTimeout(()=>this.begin(t.clientX, t.clientY), 300);
  },
  onMovePre(e){
    // Antes de levantar: si el dedo se desplaza, es un scroll â†’ cancelamos el "levantar"
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
    // Cerca del borde superior/inferior â†’ desplazar la pÃ¡gina
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

/* Estado global de tarjetas (contraÃ­das/expandidas); cada tarjeta puede ajustarse aparte */
