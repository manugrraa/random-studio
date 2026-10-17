import React from "react";
const { useState, useEffect, useRef, useMemo, useCallback } = React;
import { Icons } from "./base";
import { ytGetChannelStats, ytIsConnected } from "./datos";

export function StatCard({ label, value, sub, color, icon }) {
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
export function OdometerDigit({ digit }) {
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
export function SubscriberCounter({ value, prev }) {
  const str = (value==null?0:value).toLocaleString("es-ES"); // "1.234"
  return (
    <span style={{display:"inline-flex",fontVariantNumeric:"tabular-nums",letterSpacing:"-0.01em"}}>
      {str.split("").map((ch,i)=><OdometerDigit key={str.length-i} digit={ch}/>)}
    </span>
  );
}

// Tarjeta grande del canal con contador de suscriptores en vivo
export function ChannelHeroCard({ subHistory, onRecordSubs, onConnect, toast }) {
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
export function SubGrowthChart({ history }) {
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