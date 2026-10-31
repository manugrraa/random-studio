import { Icons } from "./base.jsx";
import { PERFILES, cambiarPerfil, fotoPerfil, perfilActual } from "./perfiles";

/* v3.11 (26/10), él: "reforma la distribución de TODO el RandomStudio, porque las pestañas arriba se
   me hacen feas visualmente". Barra lateral con los apartados agrupados por lo que se hace en cada
   uno; se pliega a solo iconos (se recuerda). En móvil sigue el menú lateral de siempre. */
export const GRUPOS = [
  ["plan", "Planificación"],
  ["canal", "Canal"],
  ["produccion", "Producción"],
  ["asistente", "Asistente"],
];

function Boton({ tb, activo, plegada, onClick }) {
  return (
    <button onClick={onClick} title={plegada ? tb.label + (tb.atajo ? `  (Ctrl+${tb.atajo})` : "") : (tb.atajo ? `Ctrl+${tb.atajo}` : undefined)}
      className={"side-btn" + (activo ? " activo" : "")}
      style={{display:"flex",alignItems:"center",gap:11,width:"100%",fontSize:13.5,fontWeight:600,padding:plegada?"10px 0":"9px 12px",
        justifyContent:plegada?"center":"flex-start",borderRadius:10,position:"relative",textAlign:"left",
        ...(activo ? {background:"linear-gradient(135deg,rgba(212,175,55,0.18),rgba(212,175,55,0.07))",color:"var(--gold)",
                      boxShadow:"inset 3px 0 0 var(--gold)"} : {color:"var(--text-2)"})}}>
      <span style={{display:"flex",flexShrink:0}}>{tb.icon}</span>
      {!plegada && <span style={{flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tb.label}</span>}
      {tb.badge>0 && <span style={{fontSize:10,fontWeight:700,minWidth:17,height:17,padding:"0 5px",borderRadius:9,background:"var(--red)",
        color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",...(plegada?{position:"absolute",top:3,right:8}:{})}}>{tb.badge}</span>}
      {tb.pc && !plegada && <span title="Funciona en el PC (necesita el clon)" style={{fontSize:9.5,fontWeight:700,color:"var(--text-3)",
        border:"1px solid var(--border)",borderRadius:5,padding:"0 4px"}}>PC</span>}
    </button>);
}

export function BarraLateral({ tabs, view, setView, plegada, setPlegada }) {
  const abajo = tabs.filter(t => t.grupo === "abajo");
  const perfil = PERFILES.find(p => p.id === perfilActual()) || PERFILES[0];
  return (
    <aside className="side-nav" style={{width:plegada?70:236,flexShrink:0,position:"sticky",top:0,height:"100vh",display:"flex",flexDirection:"column",
      borderRight:"1px solid var(--border)",background:"var(--bg-2)",transition:"width .18s ease"}}>
      <div style={{display:"flex",alignItems:"center",gap:11,padding:plegada?"18px 0 14px":"18px 18px 14px",justifyContent:plegada?"center":"flex-start"}}>
        {/* v3.26: la cuenta con la que se ha entrado (clic = cambiar de perfil) */}
        <button onClick={cambiarPerfil} title={"Perfil: " + perfil.nombre + " · cambiar de perfil"}
          style={{width:38,height:38,borderRadius:11,padding:0,flexShrink:0,overflow:"hidden",boxShadow:"0 0 0 1px var(--border-gold)"}}>
          <img src={fotoPerfil(perfil)} alt="" referrerPolicy="no-referrer" onError={e=>{ if(e.currentTarget.src!==perfil.avatar) e.currentTarget.src=perfil.avatar; }}
            style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>
        </button>
        {!plegada && <div style={{minWidth:0}}>
          <div style={{fontFamily:"'Sora'",fontWeight:700,fontSize:16.5,letterSpacing:"-.01em"}}>Random<span className="gold-text">Studio</span></div>
          <div style={{fontSize:10.5,color:"var(--gold)",letterSpacing:".04em",fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{perfil.nombre}</div>
        </div>}
      </div>
      <nav style={{flex:1,overflowY:"auto",padding:plegada?"4px 8px":"4px 12px",display:"flex",flexDirection:"column",gap:2}}>
        {GRUPOS.map(([g, nombre]) => {
          const ts = tabs.filter(t => t.grupo === g);
          if (!ts.length) return null;
          return (
            <div key={g} style={{display:"flex",flexDirection:"column",gap:2,marginBottom:8}}>
              {plegada ? <div style={{height:1,background:"var(--border)",margin:"6px 10px"}}/>
                : <div style={{fontSize:10.5,fontWeight:700,color:"var(--text-3)",textTransform:"uppercase",letterSpacing:".08em",padding:"8px 12px 4px"}}>{nombre}</div>}
              {ts.map(tb => <Boton key={tb.id} tb={tb} activo={view===tb.id} plegada={plegada} onClick={()=>setView(tb.id)}/>)}
            </div>);
        })}
      </nav>
      <div style={{borderTop:"1px solid var(--border)",padding:plegada?"8px 8px 12px":"8px 12px 12px",display:"flex",flexDirection:"column",gap:2}}>
        {abajo.map(tb => <Boton key={tb.id} tb={tb} activo={view===tb.id} plegada={plegada} onClick={()=>setView(tb.id)}/>)}
        <button onClick={()=>setPlegada(p=>!p)} title={plegada ? "Desplegar la barra" : "Plegar la barra (solo iconos)"}
          style={{display:"flex",alignItems:"center",justifyContent:plegada?"center":"flex-start",gap:11,padding:plegada?"10px 0":"9px 12px",
            fontSize:12.5,fontWeight:600,color:"var(--text-3)",borderRadius:10}}>
          <span style={{display:"flex",transform:plegada?"rotate(-90deg)":"rotate(90deg)",transition:"transform .18s"}}>{Icons.chevron}</span>
          {!plegada && "Plegar"}
        </button>
      </div>
    </aside>);
}
