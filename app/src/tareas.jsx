import React from "react";
const { useState, useEffect, useRef, useMemo, useCallback } = React;
import { Icons } from "./base";
import { askNotifPermission, fireNotification, registerNotifSW, tid } from "./datos";
import { CollapsibleBox } from "./planificacion";

export function TaskRow({ t, onToggle, onDelete, onSetDue, onEditTitle, onToggleUrgent, isDone }) {
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

export function TaskList({ list, onUpdate, onDeleteList, onTaskDeleted, toast }) {
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
export function todayKey(){
  const d = new Date(); const p=n=>String(n).padStart(2,"0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}

// "Día lógico" de las tareas diarias: el día NO cambia a medianoche sino a las 6:00.
// Así, algo hecho a las 2am cuenta para el día anterior y el reinicio es a las 6am.
export const DAILY_RESET_HOUR = 6;
export function dailyDayKey(ref){
  const d = ref ? new Date(ref) : new Date();
  // Si aún no son las 6:00, seguimos en el "día" anterior
  if(d.getHours() < DAILY_RESET_HOUR) d.setDate(d.getDate()-1);
  const p=n=>String(n).padStart(2,"0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}
// Clave de semana ISO (para agrupar el archivo de tareas realizadas): "2026-W28"
export function weekKey(ref){
  const d = new Date(ref || Date.now());
  d.setHours(0,0,0,0);
  // Jueves de esta semana define el año ISO
  d.setDate(d.getDate() + 3 - ((d.getDay()+6)%7));
  const week1 = new Date(d.getFullYear(),0,4);
  const wn = 1 + Math.round(((d-week1)/86400000 - 3 + ((week1.getDay()+6)%7))/7);
  return `${d.getFullYear()}-W${String(wn).padStart(2,"0")}`;
}
// Etiqueta legible del rango de una semana ISO ("7 – 13 jul")
export function weekLabel(wk){
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
export function DailyRow({ t, isDone, overdue, late, onToggle, onDelete, onEdit }) {
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

export function DailyList({ list, onUpdate, onTaskDeleted, toast }) {
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
export function DailyArchive({ archive, toast }) {
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

export function TasksView({ taskLists, setTaskLists, dailyArchive, toast, askConfirm, onTaskDeleted, onListDeleted }) {
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