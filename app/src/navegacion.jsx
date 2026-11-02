import { Icons } from "./base.jsx";
import { PERFILES, cambiarPerfil, fotoPerfil, perfilActual } from "./perfiles";

/* v3.11 (26/10), él: "reforma la distribución de TODO el RandomStudio, porque las pestañas arriba se
   me hacen feas visualmente". Barra lateral con los apartados agrupados por lo que se hace en cada
   uno; se pliega a solo iconos (se recuerda). En móvil sigue el menú lateral de siempre.
   v3.43 (2-11-2026): la barra es «dónde estás y cómo está este equipo»: arriba la cuenta, en medio los
   apartados, abajo el estado del equipo (nube, Claude, tema, versión). La cabecera queda para la vista. */
export const GRUPOS = [
  ["plan", "Planificación"],
  ["canal", "Canal"],
  ["produccion", "Producción"],
  ["asistente", "Asistente"],
];

function Boton({ tb, activo, plegada, onClick, conPC }) {
  return (
    <button onClick={onClick} title={plegada ? tb.label + (tb.atajo ? `  (Ctrl+${tb.atajo})` : "") : (tb.atajo ? `Ctrl+${tb.atajo}` : undefined)}
      className={"side-btn" + (activo ? " activo" : "")}>
      <span className="ico">{tb.icon}</span>
      {!plegada && <span className="txt">{tb.label}</span>}
      {tb.badge > 0 && <span className="badge">{tb.badge}</span>}
      {conPC && tb.pc && !plegada && <span className="pc" title="Funciona en el PC (necesita el clon)">PC</span>}
    </button>);
}

/** `estado`: lo que va abajo (nube, Claude, tema); `version`: el número de versión. */
export function BarraLateral({ tabs, view, setView, plegada, setPlegada, estado, version, tema, onTema }) {
  const abajo = tabs.filter(t => t.grupo === "abajo");
  const perfil = PERFILES.find(p => p.id === perfilActual()) || PERFILES[0] || { nombre: "Sin cuenta", avatar: "" };
  // la marca «PC» solo tiene sentido donde NO hay PC (la web del móvil): en el escritorio todo funciona
  const conPC = !window.studioFS;
  return (
    <aside className={"side-nav" + (plegada ? " plegada" : "")}>
      <div className="side-marca">
        {/* v3.26: la cuenta con la que se ha entrado (clic = cambiar de perfil) */}
        <button onClick={cambiarPerfil} title={"Perfil: " + perfil.nombre + " · cambiar de perfil"}
          style={{width:34,height:34,borderRadius:10,padding:0,flexShrink:0,overflow:"hidden",boxShadow:"0 0 0 1px var(--border-2)"}}>
          <img src={perfil.id ? fotoPerfil(perfil) : ""} alt="" referrerPolicy="no-referrer" onError={e=>{ if(e.currentTarget.src!==perfil.avatar) e.currentTarget.src=perfil.avatar; }}
            style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>
        </button>
        {!plegada && <div style={{minWidth:0}}>
          <div style={{fontFamily:"'Sora'",fontWeight:700,fontSize:15,letterSpacing:"-.01em",lineHeight:1.15}}>Random<span className="gold-text">Studio</span></div>
          <div style={{fontSize:11,color:"var(--text-3)",fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{perfil.nombre}</div>
        </div>}
      </div>
      <nav>
        {GRUPOS.map(([g, nombre]) => {
          const ts = tabs.filter(t => t.grupo === g);
          if (!ts.length) return null;
          return (
            <div key={g} style={{display:"flex",flexDirection:"column",gap:1}}>
              <div className="side-grupo">{nombre}</div>
              {ts.map(tb => <Boton key={tb.id} tb={tb} activo={view===tb.id} plegada={plegada} conPC={conPC} onClick={()=>setView(tb.id)}/>)}
            </div>);
        })}
      </nav>
      <div className="side-pie">
        {abajo.map(tb => <Boton key={tb.id} tb={tb} activo={view===tb.id} plegada={plegada} conPC={conPC} onClick={()=>setView(tb.id)}/>)}
      </div>
      {estado && <div className="side-estado">{estado}</div>}
      <div style={{display:"flex",alignItems:"center",justifyContent:plegada?"center":"space-between",gap:2,padding:plegada?"0 0 8px":"0 6px 8px",flexWrap:plegada?"wrap":"nowrap"}}>
        {!plegada && <span className="side-version">v{version}</span>}
        {onTema && <button onClick={onTema} className="rs-icon-btn" style={{width:30,height:28}} title={tema==="dark"?"Cambiar al tema claro":"Cambiar al tema oscuro"}>
          {tema==="dark"?Icons.sun:Icons.moon}</button>}
        <button onClick={()=>setPlegada(p=>!p)} className="rs-icon-btn" style={{width:30,height:28}}
          title={plegada ? "Desplegar la barra" : "Plegar la barra (solo iconos)"}>
          <span style={{display:"flex",transform:plegada?"rotate(-90deg)":"rotate(90deg)",transition:"transform .18s"}}>{Icons.chevron}</span>
        </button>
      </div>
    </aside>);
}
