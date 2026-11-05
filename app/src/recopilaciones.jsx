/* (5-11-2026, Manu) Pestaña «Recopilaciones» de RandomHistorias: grupos de 12 historias en orden de creación, ideas de
 * intro y outro (eliges una), la miniatura con 4 historias, y el vídeo entero montado sin CapCut. La lógica está en
 * electron/recopilaciones.cjs; el proceso, en tools/estudio/recopilacion.md. */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Icons } from "./base";

const SF = () => window.studioFS;
const mmss = (s) => { s = Math.round(s || 0); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
const INTRO_OUTRO = 45;   // lo que suman más o menos la intro y el outro (s): cuenta para los 20 min
const PASOS = [["grupo", "Historias"], ["idea", "Idea"], ["introoutro", "Intro y outro"], ["miniatura", "Miniatura"], ["montaje", "Vídeo"]];

export function Recopilaciones({ toast }) {
  const [datos, setDatos] = useState(null);
  const [sel, setSel] = useState(null);
  const [creando, setCreando] = useState(false);
  const [progreso, setProgreso] = useState({});
  const cargar = useCallback(async () => {
    const r = await SF().recopLista();
    if (!r.ok) { toast(r.error); return; }
    setDatos(r);
    setSel(s => s && r.recopilaciones.some(x => x.numero === s) ? s : (r.recopilaciones.length ? r.recopilaciones[r.recopilaciones.length - 1].numero : null));
  }, [toast]);
  useEffect(() => {
    cargar();
    const off = SF().onRecopProgreso((d) => {
      if (d.tipo === "accion") setProgreso(p => ({ ...p, [d.nn]: d.accion }));
      if (d.tipo === "fin" || d.tipo === "ideas") {
        setProgreso(p => ({ ...p, [d.nn]: null }));
        if (d.ok) toast(d.tipo === "ideas" ? "Ideas listas (Recopilación " + d.nn + ")" : "Recopilación " + d.nn + ": " + (d.etapa === "montaje" ? "vídeo montado" : d.etapa === "miniatura" ? "miniatura hecha" : "intro y outro hechos"));
        else if (!d.cancelada) toast("Recopilación " + d.nn + ": no salió. " + String(d.error || d.informe || "").slice(0, 300));
        cargar();
      }
    });
    return () => off && off();
  }, [cargar, toast]);

  if (!datos) return <div className="rs-vacio">Cargando…</div>;
  const recs = datos.recopilaciones || [], disp = datos.disponibles || [];
  const r = recs.find(x => x.numero === sel);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="rs-kpis">
        <span className="kpi"><span className="punto" /><b>{recs.length}</b>recopilaciones</span>
        <span className="kpi"><span className="punto" /><b>{disp.length}</b>historias sin recopilar</span>
        <span className="kpi"><span className="punto" />{disp.length >= datos.porGrupo ? <b>lista la siguiente</b> : <>faltan <b>{datos.porGrupo - disp.length}</b>para la siguiente</>}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(220px,280px) 1fr", gap: 16, alignItems: "start" }} className="historias-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button className={"rs-btn" + (disp.length >= datos.porGrupo ? " primary" : "")} onClick={() => { setCreando(true); setSel(null); }}>{Icons.plus} Nueva recopilación</button>
          {recs.map(x => (
            <button key={x.numero} onClick={() => { setSel(x.numero); setCreando(false); }} className="rs-card"
              style={{ display: "flex", gap: 10, alignItems: "center", textAlign: "left", padding: 8, borderColor: x.numero === sel && !creando ? "var(--border-gold)" : undefined }}>
              {x.miniatura ? <img src={x.miniatura} alt="" style={{ width: 96, borderRadius: 8 }} /> : <div style={{ width: 96, height: 54, borderRadius: 8, background: "var(--card-2, #222)" }} />}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>Recopilación {x.numero}</div>
                <div style={{ fontSize: 12, color: "var(--text-3)" }}>{(x.historias || []).length} historias · {mmss(x.total)}</div>
                <span className="rs-chip">{x.tarea || progreso[x.numero] ? "trabajando" : x.estado}</span>
              </div>
            </button>))}
        </div>
        <div>
          {creando && <Crear disp={disp} porGrupo={datos.porGrupo} minSeg={datos.minSeg} numero={String(recs.length ? Math.max(...recs.map(x => +x.numero)) + 1 : 1).padStart(2, "0")}
            onHecho={(nn) => { setCreando(false); setSel(nn); cargar(); }} toast={toast} />}
          {!creando && r && <Detalle r={r} disp={disp} porGrupo={datos.porGrupo} minSeg={datos.minSeg} progreso={progreso[r.numero] || (r.tarea && r.tarea.accion)} cargar={cargar} toast={toast} />}
          {!creando && !r && <div className="rs-vacio">Todavía no hay recopilaciones. Cuando haya {datos.porGrupo} historias entregadas, crea la primera.</div>}
        </div>
      </div>
    </div>
  );
}

function FilaHistoria({ h, n, acciones }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "4px 0" }}>
      <b style={{ width: 26, color: "var(--gold)" }}>{String(n).padStart(2, "0")}</b>
      {h.miniatura ? <img src={h.miniatura} alt="" style={{ width: 34, height: 60, objectFit: "cover", borderRadius: 6 }} /> : <div style={{ width: 34, height: 60 }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{h.titulo}</div>
        <div style={{ fontSize: 12, color: h.falta ? "var(--red)" : "var(--text-3)" }}>{h.falta ? "No está en la carpeta" : (h.numero ? "Historia " + String(h.numero).padStart(2, "0") + " · " : "") + mmss(h.duracion)}</div>
      </div>
      {acciones}
    </div>
  );
}

function Crear({ disp, porGrupo, minSeg, numero, onHecho, toast }) {
  const [elegidas, setElegidas] = useState(() => disp.slice(0, porGrupo).map(h => h.titulo));
  const [yendo, setYendo] = useState(false);
  const orden = disp.filter(h => elegidas.includes(h.titulo));
  const total = orden.reduce((s, h) => s + (h.duracion || 0), 0);
  const cambiar = (t) => setElegidas(e => e.includes(t) ? e.filter(x => x !== t) : [...e, t]);
  return (
    <div className="rs-card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="rs-kicker">Recopilación {numero}: elige las historias</div>
      <div style={{ fontSize: 13, color: "var(--text-2)" }}>Van en el orden en que se hicieron. Al crearla, la carpeta de cada historia (vídeo y miniatura) se mueve a <i>.Recopilaciones\{numero}</i>.</div>
      <div className="rs-kpis">
        <span className="kpi"><span className="punto" /><b>{orden.length}</b>de {porGrupo}</span>
        <span className="kpi" style={{ color: total + INTRO_OUTRO < minSeg ? "var(--red)" : undefined }}><span className="punto" /><b>{mmss(total + INTRO_OUTRO)}</b>{total + INTRO_OUTRO < minSeg ? "con intro y outro (menos de 20 min)" : "con intro y outro"}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", maxHeight: 520, overflow: "auto" }}>
        {disp.map((h, i) => (
          <label key={h.titulo} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", opacity: elegidas.includes(h.titulo) ? 1 : .55 }}>
            <input type="checkbox" checked={elegidas.includes(h.titulo)} onChange={() => cambiar(h.titulo)} />
            <div style={{ flex: 1 }}><FilaHistoria h={h} n={elegidas.includes(h.titulo) ? orden.findIndex(x => x.titulo === h.titulo) + 1 : i + 1} /></div>
          </label>))}
        {!disp.length && <div className="rs-vacio">No hay historias entregadas fuera de una recopilación.</div>}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="rs-btn primary" disabled={yendo || !orden.length} onClick={async () => {
          setYendo(true);
          const r = await SF().recopCrear(orden.map(h => h.titulo));
          setYendo(false);
          if (!r.ok) return toast(r.error);
          toast("Recopilación " + r.numero + " creada: carpetas movidas");
          onHecho(r.numero);
        }}>{yendo ? "Moviendo…" : "Crear recopilación " + numero}</button>
      </div>
    </div>
  );
}

function Detalle({ r, disp, porGrupo, minSeg, progreso, cargar, toast }) {
  const [paso, setPaso] = useState("grupo");
  useEffect(() => {
    const h = r.hecho || {};
    setPaso(!h.idea ? (r.ideas && r.ideas.length ? "idea" : "grupo") : !h.introoutro ? "introoutro" : !h.miniatura ? "miniatura" : "montaje");
  }, [r.numero]);   // eslint-disable-line react-hooks/exhaustive-deps
  const trabajando = !!(progreso || r.tarea);
  const hacer = async (fn, ok) => { const x = await fn(); if (x && x.ok === false) toast(x.error); else { if (ok) toast(ok); cargar(); } };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div className="rs-seg">
          {PASOS.map(([k, t]) => <button key={k} className={paso === k ? "on" : ""} onClick={() => setPaso(k)}>{(r.hecho || {})[k] ? Icons.check : null}{t}</button>)}
        </div>
        <span style={{ flex: 1 }} />
        <button className="rs-btn ghost sm" onClick={() => SF().recopAbrir(r.numero)}>Abrir carpeta</button>
        {r.estado !== "publicada" && r.hecho && r.hecho.montaje && <button className="rs-btn sm" onClick={() => hacer(() => SF().recopPublicada(r.numero, true), "Marcada como publicada")}>Marcar publicada</button>}
      </div>
      {trabajando && (
        <div className="rs-card" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="rs-chip">en marcha</span>
          <span style={{ flex: 1, fontSize: 13, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{progreso || (r.tarea && r.tarea.accion) || "Trabajando…"}</span>
          <button className="rs-btn danger sm" onClick={() => SF().recopParar(r.numero).then(() => toast("Parando…"))}>Parar</button>
        </div>)}
      {paso === "grupo" && <Grupo r={r} disp={disp} porGrupo={porGrupo} minSeg={minSeg} hacer={hacer} />}
      {paso === "idea" && <Ideas r={r} hacer={hacer} trabajando={trabajando} />}
      {paso === "introoutro" && <IntroOutro r={r} hacer={hacer} trabajando={trabajando} />}
      {paso === "miniatura" && <Miniatura r={r} hacer={hacer} trabajando={trabajando} toast={toast} />}
      {paso === "montaje" && <Montaje r={r} hacer={hacer} trabajando={trabajando} toast={toast} />}
    </div>
  );
}

function Grupo({ r, disp, porGrupo, minSeg, hacer }) {
  const fija = !!(r.hecho && r.hecho.montaje) || r.estado === "publicada";
  const [lista, setLista] = useState(r.historias.map(h => h.titulo));
  useEffect(() => setLista(r.historias.map(h => h.titulo)), [r.numero, r.historias.length]);   // eslint-disable-line react-hooks/exhaustive-deps
  const todas = [...r.historias, ...disp];
  const fichas = lista.map(t => todas.find(h => h.titulo === t) || { titulo: t, falta: true });
  const total = fichas.reduce((s, h) => s + (h.duracion || 0), 0);
  const cambiado = lista.join("|") !== r.historias.map(h => h.titulo).join("|");
  const mover = (i, d) => setLista(l => { const n = [...l]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x); return n; });
  const [anadir, setAnadir] = useState("");
  return (
    <div className="rs-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="rs-kpis">
        <span className="kpi"><span className="punto" /><b>{fichas.length}</b>historias</span>
        <span className="kpi" style={{ color: total + INTRO_OUTRO < minSeg ? "var(--red)" : undefined }}><span className="punto" /><b>{mmss(total + INTRO_OUTRO)}</b>{total + INTRO_OUTRO < minSeg ? "con intro y outro (menos de 20 min)" : "con intro y outro"}</span>
        {r.detectada && <span className="rs-chip">detectada por sus carpetas</span>}
      </div>
      <div>
        {fichas.map((h, i) => <FilaHistoria key={h.titulo} h={h} n={i + 1} acciones={fija ? null : (
          <div className="rs-grupo">
            <button className="rs-icon-btn" disabled={i === 0} onClick={() => mover(i, -1)} title="Subir">▲</button>
            <button className="rs-icon-btn" disabled={i === fichas.length - 1} onClick={() => mover(i, 1)} title="Bajar">▼</button>
            <button className="rs-icon-btn" onClick={() => setLista(l => l.filter(x => x !== h.titulo))} title="Quitar (vuelve a las entregas)">{Icons.x}</button>
          </div>)} />)}
      </div>
      {!fija && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select className="rs-input" value={anadir} onChange={e => setAnadir(e.target.value)} style={{ flex: 1, minWidth: 200 }}>
            <option value="">Añadir otra historia…</option>
            {disp.filter(h => !lista.includes(h.titulo)).map(h => <option key={h.titulo} value={h.titulo}>{(h.numero ? String(h.numero).padStart(2, "0") + " · " : "") + h.titulo}</option>)}
          </select>
          <button className="rs-btn" disabled={!anadir} onClick={() => { setLista(l => [...l, anadir]); setAnadir(""); }}>Añadir</button>
          <span style={{ flex: 1 }} />
          {cambiado && <button className="rs-btn primary" onClick={() => hacer(() => SF().recopGrupo(r.numero, lista), "Grupo guardado (carpetas movidas)")}>Guardar grupo</button>}
          {!cambiado && <button className="rs-btn danger sm" onClick={() => { if (window.confirm("¿Deshacer el grupo? Las carpetas de las historias vuelven a las entregas.")) hacer(() => SF().recopDeshacer(r.numero), "Grupo deshecho"); }}>Deshacer grupo</button>}
        </div>)}
      {fija && <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>Ya está montada: el grupo no se cambia.</div>}
      {!fija && fichas.length !== porGrupo && <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>Lo normal son {porGrupo} historias.</div>}
    </div>
  );
}

function Ideas({ r, hacer, trabajando }) {
  const [pista, setPista] = useState("");
  const [pidiendo, setPidiendo] = useState(false);
  const ideas = r.ideas || [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="rs-card" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input className="rs-input" placeholder="Pista opcional (un sitio, un tono…)" value={pista} onChange={e => setPista(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
        <button className={"rs-btn" + (ideas.length ? "" : " primary")} disabled={pidiendo || trabajando} onClick={async () => {
          setPidiendo(true);
          await hacer(() => SF().recopIdeas(r.numero, pista), "Pensando 4 ideas (unos minutos)…");
          setTimeout(() => setPidiendo(false), 4000);
        }}>{Icons.sparkle} {ideas.length ? "Pedir otras ideas" : "Pedir ideas"}</button>
      </div>
      {!ideas.length && <div className="rs-vacio">Pide ideas: Claude propone 4 intros y outros con los pueblos de estas historias. La que elijas es la que se rueda.</div>}
      {ideas.map(x => {
        const elegida = r.idea && r.idea.id === x.id;
        return (
          <div key={x.id} className="rs-card" style={{ display: "flex", flexDirection: "column", gap: 6, borderColor: elegida ? "var(--border-gold)" : undefined }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <b style={{ fontSize: 15 }}>{x.titulo}</b>{elegida && <span className="rs-chip">elegida</span>}
              <span style={{ flex: 1 }} />
              {!elegida && <button className="rs-btn primary sm" disabled={trabajando || (r.hecho && r.hecho.introoutro)} onClick={() => hacer(() => SF().recopElegir(r.numero, x.id), "Idea elegida")}>Elegir esta</button>}
            </div>
            {x.sitio && <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>{x.sitio}</div>}
            <div style={{ fontSize: 13.5 }}><span className="rs-kicker">Intro</span> {x.intro}</div>
            <div style={{ fontSize: 13.5 }}><span className="rs-kicker">Outro</span> {x.outro}</div>
            {x.destellos && <div style={{ fontSize: 12.5, color: "var(--text-2)" }}>Destellos: {[].concat(x.destellos).join(" · ")}</div>}
            {x.planos && <div style={{ fontSize: 12.5, color: "var(--text-2)" }}>{x.planos}</div>}
            {x.porque && <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>{x.porque}</div>}
          </div>);
      })}
    </div>
  );
}

function IntroOutro({ r, hacer, trabajando }) {
  const inf = r.informes && r.informes.introoutro;
  return (
    <div className="rs-card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {!r.idea && !r.hecho.introoutro && <div className="rs-vacio">Primero elige una idea.</div>}
      {r.idea && <div style={{ fontSize: 13, color: "var(--text-2)" }}>Idea: <b>{r.idea.titulo}</b>. Claude escribe el decorado y los planos, hace la voz con fish.audio, lo rueda en Roblox Studio en horizontal (por turnos con las historias) y lo monta con subtítulos y música.</div>}
      <div style={{ display: "flex", gap: 8 }}>
        {r.idea && <button className={"rs-btn" + (r.hecho.introoutro ? "" : " primary")} disabled={trabajando}
          onClick={() => { if (!r.hecho.introoutro || window.confirm("¿Rehacer la intro y el outro?")) hacer(() => SF().recopIntroOutro(r.numero), "Empezando la intro y el outro…"); }}>
          {r.hecho.introoutro ? "Rehacer intro y outro" : "Hacer intro y outro"}</button>}
      </div>
      {(r.intro || r.outro) && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {r.intro && <div><div className="rs-kicker">Intro</div><video src={r.intro} controls style={{ width: "100%", borderRadius: 10 }} /></div>}
          {r.outro && <div><div className="rs-kicker">Outro</div><video src={r.outro} controls style={{ width: "100%", borderRadius: 10 }} /></div>}
        </div>)}
      {inf && !inf.ok && <div style={{ fontSize: 12.5, color: "var(--red)", whiteSpace: "pre-wrap" }}>{inf.texto}</div>}
    </div>
  );
}

const TITULO_DEF = "EN ESTE PUEBLO...";
function Miniatura({ r, hacer, trabajando, toast }) {
  const [paneles, setPaneles] = useState(() => (r.miniaturaPaneles || r.historias.slice(0, 4).map(h => ({ titulo: h.titulo, t: 0, cy: 1000, zoom: 1 }))));
  const [activo, setActivo] = useState(0);
  const [video, setVideo] = useState(null);
  const [titulo, setTitulo] = useState(TITULO_DEF);
  const ref = useRef(null);
  const p = paneles[activo] || {};
  useEffect(() => {
    if (!p.titulo) return;
    SF().recopVideoLimpio(r.numero, p.titulo).then(v => setVideo(v.ok ? v : null));
  }, [r.numero, p.titulo]);
  useEffect(() => { if (ref.current && video) ref.current.currentTime = p.t || 0; }, [video]);   // eslint-disable-line react-hooks/exhaustive-deps
  const poner = (k, v) => setPaneles(ps => ps.map((x, i) => i === activo ? { ...x, [k]: v } : x));
  // «EN ESTE PUEBLO...»: PUEBLO en rojo y el resto en blanco (como la 01); otro título va todo en blanco salvo la palabra PUEBLO
  const trozos = (txt) => { const m = txt.split(/(PUEBLO)/); return m.filter(Boolean).map(s => [s, s === "PUEBLO" ? "rojo" : "blanco"]); };
  return (
    <div className="rs-card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {r.miniatura && <img src={r.miniatura} alt="" style={{ width: "100%", maxWidth: 560, borderRadius: 10 }} />}
      <div className="rs-seg" style={{ alignSelf: "flex-start" }}>
        {paneles.map((x, i) => <button key={i} className={i === activo ? "on" : ""} onClick={() => setActivo(i)}>Franja {i + 1}{x.t ? " · " + mmss(x.t) : ""}</button>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 12, alignItems: "start" }}>
        <div>
          {video && <video ref={ref} src={video.video} controls style={{ width: 240, borderRadius: 10 }} />}
          {video && !video.limpio && <div style={{ fontSize: 12, color: "var(--text-3)" }}>Sin versión sin subtítulos: elige un momento sin texto.</div>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <select className="rs-input" value={p.titulo || ""} onChange={e => poner("titulo", e.target.value)}>
            {r.historias.map((h, i) => <option key={h.titulo} value={h.titulo}>{String(i + 1).padStart(2, "0")} · {h.titulo}</option>)}
          </select>
          <button className="rs-btn" onClick={() => { if (ref.current) { poner("t", Math.round(ref.current.currentTime * 100) / 100); toast("Momento elegido: " + mmss(ref.current.currentTime)); } }}>Usar este momento</button>
          <label style={{ fontSize: 12.5 }}>Altura del recorte <input type="range" min="500" max="1500" value={p.cy || 1000} onChange={e => poner("cy", +e.target.value)} /></label>
          <label style={{ fontSize: 12.5 }}>Acercar <input type="range" min="1" max="1.8" step="0.05" value={p.zoom || 1} onChange={e => poner("zoom", +e.target.value)} /></label>
          <input className="rs-input" value={titulo} onChange={e => setTitulo(e.target.value)} />
          <button className="rs-btn primary" disabled={trabajando || paneles.some(x => !x.titulo)}
            onClick={() => hacer(() => SF().recopMiniatura(r.numero, paneles.map(x => ({ ...x, cx: 540 })), trozos(titulo || TITULO_DEF)), "Haciendo la miniatura…")}>
            {r.hecho.miniatura ? "Rehacer miniatura" : "Hacer miniatura"}</button>
        </div>
      </div>
    </div>
  );
}

function Montaje({ r, hacer, trabajando, toast }) {
  const copiar = (t) => { try { navigator.clipboard.writeText(t); toast("Copiado"); } catch (e) {} };
  return (
    <div className="rs-card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 13, color: "var(--text-2)" }}>El vídeo entero, sin CapCut y con el diseño exacto de la Recopilación 01: fondo desenfocado, Short en el centro con marco blanco, «HISTORIA ACTUAL» y «SIGUIENTE HISTORIA ?» con sus miniaturas, y la intro y el outro dentro. Tarda unos minutos.</div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className={"rs-btn" + (r.hecho.montaje ? "" : " primary")} disabled={trabajando || !r.hecho.introoutro}
          onClick={() => { if (!r.hecho.montaje || window.confirm("¿Volver a montarlo? El anterior se guarda como «(anterior)».")) hacer(() => SF().recopMontar(r.numero), "Montando el vídeo…"); }}>
          {r.hecho.montaje ? "Volver a montar" : "Montar el vídeo"}</button>
        {!r.hecho.introoutro && <span style={{ fontSize: 12.5, color: "var(--text-3)", alignSelf: "center" }}>Faltan la intro y el outro.</span>}
      </div>
      {r.video && <video src={r.video} controls style={{ width: "100%", borderRadius: 10 }} />}
      {r.textos && (
        <div>
          <div style={{ display: "flex", alignItems: "center" }}><span className="rs-kicker">Título, descripción y capítulos</span><span style={{ flex: 1 }} /><button className="rs-btn ghost sm" onClick={() => copiar(r.textos)}>{Icons.copy} Copiar</button></div>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 12.5, color: "var(--text-2)", margin: 0 }}>{r.textos}</pre>
        </div>)}
      {r.estado === "publicada" && <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>Lo que la gente pida en los comentarios («¿a qué pueblo me mudo?») entra en Historias → Ideas → «Ideas de los comentarios».</div>}
    </div>
  );
}
