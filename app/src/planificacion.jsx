import React from "react";
const { useState, useEffect, useRef, useMemo, useCallback } = React;
import { DAYS, Icon, Icons, PALETTE, STATUSES, dnd, iso, sortedFormats } from "./base";
import { VideoCard, inputStyle, labelStyle } from "./videos";

export function FormatsModal({formats, setFormats, videos, onClose, toast, askConfirm}) {
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
export const MAX_VIDEOS_MES = 3; // en la vista Mes cada día enseña hasta 3 y el resto va en «+N más»
export const CalDayCell = React.memo(function CalDayCell({d, di, big, minH, items, isToday, otherMonth, dragOver, setDragDay, onDrop, onQuickAdd, onOpen, onDragStart, onDragEnd, onShowDay, formats}){
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

export function CalendarView({videos, onOpen, onDrop, onDragStart, onDragEnd, weekOffset, setWeekOffset, calView, setCalView, onQuickAdd, onUnassign, formats}) {
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
export const navBtn = { width:38, height:38, borderRadius:10, background:"var(--card)", border:"1px solid var(--border)", color:"var(--text)", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center", transition:"all .15s" };

/* ============================ KANBAN ============================ */
// Caja desplegable reutilizable (Completados del tablero y Completadas de tareas)
export function CollapsibleBox({ title, count, children, icon }) {
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

export function KanbanView({videos, onOpen, onDrop, onDragStart, onDragEnd, onQuickAdd, formats, search}) {
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