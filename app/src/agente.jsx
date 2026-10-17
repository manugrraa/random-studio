import React from "react";
const { useState, useEffect, useRef, useMemo, useCallback } = React;
import { Icons } from "./base";
import { geminiGenerate, geminiGetKey, geminiGetModel, geminiGetSystem, geminiHasKey, geminiSaveKey, geminiSaveModel, geminiSaveSystem } from "./datos";
import { Field, inputStyle } from "./videos";

export function AgentView({ promptTemplates, setPromptTemplates, toast }) {
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
export function PinnedCommentPanel({ programados, onUpdateVideo, toast }){
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