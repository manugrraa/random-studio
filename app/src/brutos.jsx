import React from "react";
import { PanelTarea, SelectorModelo, useTarea, boton } from "./clon";
import { driveConectado, driveConectar, driveCorreo, driveToken } from "./datos";
import { PERFILES, perfilActual } from "./perfiles";
const { useState, useEffect, useMemo, useRef } = React;

/* ============================ BRUTOS (v3.40, Carental) ============================
   Él: "en el RandomStudio debes detectar automáticamente las carpetas con los vídeos dentro, y yo podré cribar los
   brutos que no nos van a servir y crear carpetas, las cuales serán para juntar varios clips de un mismo vídeo;
   entonces tú usarás esos clips para crear un vídeo con todo el sentido del mundo".
   - Los días: las subcarpetas de la carpeta de brutos del perfil (Configuración → Carpetas). Sus brutos NO se tocan.
   - Cribar (descartar/restaurar) y las «carpetas» de cada vídeo viven en el Studio (brutos/estado.json).
   - «Montar con IA»: el clon (clon/concesionario.py) lo monta como él y deja un proyecto del RandomEditor con TODO
     suelto (cortes, planos, fichas, subtítulos, música y SFX) para retocarlo; el vídeo, a Editados/<perfil>/<mes>/.
   - Si Drive está conectado en el perfil, el vídeo y su miniatura se suben solos a RandomStudio/<perfil>/<mes>/. */

const fileUrl = p => p ? "file:///" + p.replace(/\\/g, "/").split("/").map(encodeURIComponent).join("/").replace(/^([A-Za-z])%3A/, "$1:") : null;
const mmss = s => { s = Math.round(s || 0); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
const uidC = () => "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const ESTADOS = { nuevo: ["Sin montar", "var(--text-3)"], montando: ["Montando…", "var(--gold)"], montado: ["Montado", "#4ade80"], error: ["Con error", "var(--red)"] };
const ls = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } };

/* (5/11) TERMINADOS: los vídeos ya exportados del perfil (su carpeta de salida), para subirlos a Drive de un clic a
   RandomStudio/<perfil> - .Terminados/<nombre del vídeo>/ (el vídeo y su miniatura). */
function Terminados({ toast, drive, perfil, onConectar }) {
  const [d, setD] = useState(null);
  const [abierto, setAbierto] = useState(() => ls("rds_terminados_abierto", "1") === "1");
  const [subiendo, setSubiendo] = useState({});      // id -> fracción
  const leer = async () => { const r = await window.studioFS.terminadosLista(); if (r && r.ok) setD(r); };
  useEffect(() => { if (window.studioFS && window.studioFS.terminadosLista) leer(); }, []);
  useEffect(() => { try { localStorage.setItem("rds_terminados_abierto", abierto ? "1" : "0"); } catch (e) {} }, [abierto]);
  useEffect(() => window.studioFS && window.studioFS.onTerminadosProgreso ? window.studioFS.onTerminadosProgreso(x => setSubiendo(s => ({ ...s, [x.id]: x.fraccion }))) : undefined, []);
  if (!window.studioFS || !window.studioFS.terminadosLista) return null;
  const lista = (d && d.lista) || [], sin = lista.filter(t => !t.drive);
  const subir = async (t, aviso = true) => {
    if (!drive) { toast("Conecta Drive primero"); return false; }
    setSubiendo(s => ({ ...s, [t.id]: 0 }));
    try {
      const r = await window.studioFS.terminadosSubir(t.id, await driveToken(), perfil);
      if (r && r.error) throw new Error(r.error);
      if (aviso) toast("☁️ «" + t.nombre + "» subido a RandomStudio/" + perfil + " - .Terminados");
      return true;
    } catch (e) { toast("Drive: " + e.message); return false; }
    finally { setSubiendo(s => { const n = { ...s }; delete n[t.id]; return n; }); leer(); }
  };
  const subirTodos = async () => { let n = 0; for (const t of sin) if (await subir(t, false)) n++; toast("☁️ " + n + " vídeo" + (n === 1 ? "" : "s") + " subido" + (n === 1 ? "" : "s") + " a Drive"); };
  const abrirCarpeta = async () => { try { const r = await window.studioFS.terminadosCarpeta(await driveToken(), perfil); if (r && r.url) window.open(r.url); else toast(r.error || "No se pudo abrir"); } catch (e) { toast(e.message); } };
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 14, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button onClick={() => setAbierto(a => !a)} style={{ ...boton(false), padding: "4px 9px" }}>{abierto ? "▾" : "▸"}</button>
        <b style={{ fontFamily: "'Sora'", fontSize: 15 }}>📤 Terminados</b>
        <span style={{ fontSize: 12, color: "var(--text-3)" }}>{d ? lista.length + " exportados · " + (sin.length ? sin.length + " sin subir" : "todos en Drive") : "…"}</span>
        <span style={{ flex: 1 }} />
        <button onClick={leer} style={boton(false)}>Actualizar</button>
        {d && d.base && <button onClick={() => window.studioFS.clonAbrir(d.base)} style={boton(false)}>Abrir carpeta</button>}
        {drive ? <>
            <button onClick={abrirCarpeta} style={boton(false)} title={"RandomStudio/" + perfil + " - .Terminados"}>Ver en Drive</button>
            <button disabled={!sin.length || Object.keys(subiendo).length > 0} onClick={subirTodos} style={{ ...boton(true), opacity: sin.length ? 1 : 0.5 }}>☁️ Subir los {sin.length || ""} nuevos</button></>
          : <button onClick={onConectar} style={boton(true)}>Conectar Drive</button>}
      </div>
      {abierto && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 360, overflow: "auto" }}>
          {d && !lista.length && <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>No hay vídeos exportados en {d.base}. Los que exportes del RandomEditor (o los montajes de los brutos) salen aquí.</div>}
          {lista.map(t => {
            const fr = subiendo[t.id];
            return (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px", borderRadius: 10, background: "var(--bg-2)" }}>
                {t.miniatura ? <img src={fileUrl(t.miniatura)} alt="" style={{ width: 34, height: 52, objectFit: "cover", borderRadius: 5, flex: "none" }} />
                  : <span style={{ width: 34, height: 52, borderRadius: 5, background: "#111", flex: "none", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🎬</span>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={t.video}>{t.nombre}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{new Date(t.fecha).toLocaleDateString("es-ES")} · {(t.tam / 1e6).toFixed(0)} MB{t.miniatura ? " · con miniatura" : " · sin miniatura"}</div>
                </div>
                {fr != null ? <span style={{ fontSize: 12, color: "var(--gold)", fontWeight: 700 }}>Subiendo {Math.round(fr * 100)}%</span>
                  : t.drive ? <a href={t.drive.carpeta} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#4ade80", fontWeight: 700 }}>✓ En Drive</a>
                  : <button disabled={!drive} onClick={() => subir(t)} style={{ ...boton(false), opacity: drive ? 1 : 0.5 }}>☁️ Subir</button>}
              </div>);
          })}
        </div>)}
    </div>);
}

export function BrutosView({ toast }) {
  const enPC = !!(window.studioFS && window.studioFS.brutosEstado);
  const [dias, setDias] = useState(null);
  const [raiz, setRaiz] = useState("");
  const [est, setEst] = useState({ descartados: [], carpetas: [] });
  const [sel, setSel] = useState(new Set());
  const [abierta, setAbierta] = useState(null);           // id de la carpeta abierta a la derecha
  const [verDesc, setVerDesc] = useState(false);
  const [nombrando, setNombrando] = useState(null);       // nombre de la carpeta nueva que se está escribiendo
  const [plegados, setPlegados] = useState(() => new Set(JSON.parse(ls("rds_brutos_plegados", "[]"))));
  const [viendo, setViendo] = useState(null);             // bruto que se está viendo
  const [cargando, setCargando] = useState(false);
  const [drive, setDrive] = useState(() => driveConectado());
  const [correo, setCorreo] = useState(() => driveCorreo());
  const [subiendo, setSubiendo] = useState(null);         // { id, fraccion }
  const perfil = (PERFILES.find(p => p.id === perfilActual()) || {}).nombre || "Perfil";

  const leerEstado = async () => { const r = await window.studioFS.brutosEstado(); if (r && r.estado) { setEst(r.estado); setRaiz(r.raiz); } return r; };
  const cambiar = async (cambio) => { const r = await window.studioFS.brutosCambiar(cambio); if (r && r.estado) setEst(r.estado); else if (r && r.error) toast(r.error); return r; };
  const listar = async () => {
    setCargando(true);
    try {
      const r = await window.studioFS.clonConsultar(["brutos"]);
      const ev = (r.eventos || []).find(e => e.evento === "brutos");
      if (r.error || !ev) throw new Error(r.error || ((r.eventos || []).find(e => e.evento === "error") || {}).mensaje || "No se pudieron leer los brutos");
      setDias(ev.existe ? ev.dias : []); setRaiz(ev.raiz);
    } catch (e) { toast(e.message); setDias([]); }
    setCargando(false);
  };
  useEffect(() => { if (!enPC) return; leerEstado(); listar(); }, []);
  useEffect(() => { const h = () => { setDrive(driveConectado()); setCorreo(driveCorreo()); }; window.addEventListener("rs_drive", h); return () => window.removeEventListener("rs_drive", h); }, []);
  useEffect(() => { try { localStorage.setItem("rds_brutos_plegados", JSON.stringify([...plegados])); } catch (e) {} }, [plegados]);
  useEffect(() => window.studioFS && window.studioFS.onBrutosProgreso ? window.studioFS.onBrutosProgreso(d => setSubiendo(d)) : undefined, []);

  // v3.40.2: el perfil local elige la cuenta de Google cuyo Drive usa (solo permiso de Drive, nada de YouTube)
  const conectarDrive = async () => {
    try { await driveConectar({ elegirCuenta: true }); toast("Drive conectado: los vídeos terminados se subirán solos"); }
    catch (e) { toast(e.message); }
  };
  const carpetaDrive = async () => {
    try {
      const r = await window.studioFS.brutosDriveCarpeta(await driveToken(), perfil);
      if (r.error) throw new Error(r.error);
      window.open(r.url, "_blank");
    } catch (e) { toast(e.message); }
  };
  const subirDrive = async (id, aviso) => {
    try {
      setSubiendo({ id, fraccion: 0 });
      const r = await window.studioFS.brutosDriveSubir(id, await driveToken(), perfil);
      if (r.error) throw new Error(r.error);
      await leerEstado();
      toast("Subido a Drive: RandomStudio/" + perfil);
    } catch (e) { if (aviso !== false) toast("Drive: " + e.message); }
    setSubiendo(null);
  };

  const [tarea, lanzar, cerrarTarea] = useTarea(async (ev) => {
    if (ev.tarea !== "brutosmontar") return;
    const r = await leerEstado();
    const id = tareaRef.current && tareaRef.current.args && tareaRef.current.args[1];
    const c = r && r.estado && r.estado.carpetas.find(x => x.id === id);
    if (!ev.codigo && c && c.resultado) {
      toast("Vídeo montado: " + c.resultado.titulo);
      if (drive && ls("rds_brutos_drive_auto", "1") === "1") subirDrive(id, false);
    } else if (ev.codigo) toast("El montaje no ha podido acabar: mira el detalle");
  });
  const tareaRef = useRef(null); tareaRef.current = tarea;
  const montando = tarea && !tarea.cerrada && tarea.args[0] === "brutosmontar" ? tarea.args[1] : null;
  const ocupado = !!(tarea && !tarea.cerrada);

  const desc = useMemo(() => new Set(est.descartados), [est]);
  const enCarpeta = useMemo(() => { const m = {}; est.carpetas.forEach(c => c.clips.forEach(r => { (m[r] = m[r] || []).push(c.nombre); })); return m; }, [est]);
  const porRel = useMemo(() => { const m = {}; (dias || []).forEach(d => d.brutos.forEach(b => { m[b.rel] = b; })); return m; }, [dias]);
  const car = est.carpetas.find(c => c.id === abierta) || null;
  const elegir = (rel) => setSel(s => { const n = new Set(s); n.has(rel) ? n.delete(rel) : n.add(rel); return n; });

  // v3.43.3: el nombre se escribe en la propia barra (window.prompt no existe en la app de escritorio: devolvía null
  // y la carpeta no se creaba nunca)
  const nuevaCarpeta = async () => {
    const rels = [...sel], n = (nombrando || "").trim();
    const id = uidC();
    const r = await cambiar({ tipo: "carpeta", carpeta: { id, nombre: n || "Vídeo sin nombre", clips: rels } });
    if (!r || r.error) return;
    setNombrando(null); setSel(new Set()); setAbierta(id);
    toast(`Carpeta «${n || "Vídeo sin nombre"}» creada con ${rels.length} clip(s)`);
  };
  const anadirA = async (c) => {
    const rels = [...sel].filter(r => !c.clips.includes(r));
    await cambiar({ tipo: "carpeta", carpeta: { id: c.id, clips: [...c.clips, ...rels] } });
    setSel(new Set()); setAbierta(c.id);
    toast(`${rels.length} clip(s) añadidos a «${c.nombre}»`);
  };
  const ponerCar = (patch) => car && cambiar({ tipo: "carpeta", carpeta: { id: car.id, ...patch } });
  const montar = async (c) => {
    if (!c.clips.length) { toast("La carpeta está vacía"); return; }
    try {
      await cambiar({ tipo: "carpeta", carpeta: { id: c.id, estado: "montando", error: null } });
      await lanzar(["brutosmontar", c.id, "--perfil", perfil, "--modelo", ls("rds_modelo_brutos", "claude-opus-5-5")]);
    } catch (e) { toast(e.message); }
  };

  if (!enPC) return <div style={{ padding: "18px 20px", border: "1px dashed var(--border)", borderRadius: 14, color: "var(--text-2)", fontSize: 13.5 }}>
    Los brutos se montan en el PC, que es donde están los vídeos y tu Claude. Ábrelo desde RandomStudio de escritorio.</div>;

  const totalBrutos = (dias || []).reduce((a, d) => a + d.brutos.length, 0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 22 }}>Brutos</div>
          <div style={{ fontSize: 12.5, color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 560 }} title={raiz}>
            {raiz || "…"}{dias ? ` · ${dias.length} días · ${totalBrutos} brutos · ${est.descartados.length} descartados` : ""}</div>
        </div>
        <span style={{ flex: 1 }} />
        <SelectorModelo clave="rds_modelo_brutos" />
        <button onClick={listar} disabled={cargando} style={boton(false)}>{cargando ? "Buscando…" : "Actualizar"}</button>
        <button onClick={() => raiz && window.studioFS.clonAbrir(raiz)} style={boton(false)}>Abrir carpeta</button>
        {drive
          ? <>
              <span title={`Los vídeos montados se suben solos a Drive (RandomStudio/${perfil}/<mes>)`} style={{ fontSize: 12, color: "#4ade80", fontWeight: 700 }}>
                ● Drive{correo ? " · " + correo : " conectado"}</span>
              <button onClick={carpetaDrive} title="Ábrela en Drive y compártela con tus compañeros: ahí aparece cada vídeo terminado" style={boton(false)}>Carpeta en Drive</button>
              <button onClick={conectarDrive} title="Conectar otra cuenta de Google" style={{ ...boton(false), padding: "6px 9px" }}>Cambiar</button>
            </>
          : <button onClick={conectarDrive} title="Solo pide permiso para Drive: los vídeos terminados se suben solos a RandomStudio/<perfil>" style={boton(false)}>Conectar Drive</button>}
      </div>

      {tarea && tarea.args[0] === "brutosmontar" && <PanelTarea tarea={tarea} onCerrar={cerrarTarea} />}

      <Terminados toast={toast} drive={drive} perfil={perfil} onConectar={conectarDrive} />

      {dias && !dias.length && !cargando && (
        <div style={{ padding: "18px 20px", border: "1px dashed var(--border)", borderRadius: 14, color: "var(--text-2)", fontSize: 13.5, lineHeight: 1.6 }}>
          No hay brutos en <b>{raiz}</b>. Pon la carpeta de tus brutos en <b>Configuración → Carpetas → «Vídeos en bruto»</b>: cada subcarpeta (un día) sale aquí con sus vídeos.</div>)}

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* ---- los días y sus brutos ---- */}
        <div style={{ flex: "1 1 520px", minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          {sel.size > 0 && (
            <div style={{ position: "sticky", top: 0, zIndex: 3, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "10px 12px", borderRadius: 12,
              background: "var(--bg-2)", border: "1px solid rgba(212,175,55,0.5)", boxShadow: "0 8px 24px rgba(0,0,0,0.35)" }}>
              <b style={{ fontSize: 13 }}>{sel.size} elegido(s)</b>
              {nombrando == null
                ? <button onClick={() => setNombrando("")} style={boton(true)}>Nueva carpeta con ellos</button>
                : <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input autoFocus value={nombrando} onChange={e => setNombrando(e.target.value)} placeholder="Nombre del vídeo (p. ej. Audi A3 vendido)"
                      onKeyDown={e => { e.stopPropagation(); if (e.key === "Enter") nuevaCarpeta(); if (e.key === "Escape") setNombrando(null); }}
                      style={{ width: 230, background: "var(--bg)", border: "1px solid rgba(212,175,55,0.5)", borderRadius: 8, padding: "6px 9px", color: "var(--text)", fontSize: 12.5 }} />
                    <button onClick={nuevaCarpeta} style={boton(true)}>Crear</button>
                    <button onClick={() => setNombrando(null)} style={boton(false)}>Cancelar</button>
                  </span>}
              {est.carpetas.filter(c => c.estado !== "montando").slice(0, 6).map(c => <button key={c.id} onClick={() => anadirA(c)} style={boton(false)} title="Añadir a esta carpeta">+ {c.nombre}</button>)}
              <button onClick={async () => { await cambiar({ tipo: "descartar", rels: [...sel] }); setSel(new Set()); }} style={boton(false, true)}>Descartar</button>
              {[...sel].some(r => desc.has(r)) && <button onClick={async () => { await cambiar({ tipo: "restaurar", rels: [...sel] }); setSel(new Set()); }} style={boton(false)}>Restaurar</button>}
              <button onClick={() => { setSel(new Set()); setNombrando(null); }} style={{ ...boton(false), marginLeft: "auto" }}>Quitar selección</button>
            </div>)}
          {dias === null && <div style={{ color: "var(--text-3)", fontSize: 13 }}>Buscando los brutos…</div>}
          {(dias || []).map(d => {
            const visibles = d.brutos.filter(b => verDesc || !desc.has(b.rel));
            const plegado = plegados.has(d.rel);
            return (
              <div key={d.rel || "_"} style={{ border: "1px solid var(--border)", borderRadius: 14, background: "var(--card-2)", overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", cursor: "pointer" }}
                  onClick={() => setPlegados(s => { const n = new Set(s); n.has(d.rel) ? n.delete(d.rel) : n.add(d.rel); return n; })}>
                  <span style={{ color: "var(--text-3)", transform: plegado ? "rotate(-90deg)" : "none", transition: "transform .15s" }}>▾</span>
                  <b style={{ fontSize: 14.5 }}>{d.nombre}</b>
                  <span style={{ fontSize: 12, color: "var(--text-3)" }}>{d.brutos.length} brutos · {mmss(d.brutos.reduce((a, b) => a + (b.dur || 0), 0))}</span>
                  <span style={{ flex: 1 }} />
                  {!plegado && <button onClick={(e) => { e.stopPropagation(); setSel(s => { const n = new Set(s); const todos = visibles.every(b => n.has(b.rel)); visibles.forEach(b => todos ? n.delete(b.rel) : n.add(b.rel)); return n; }); }}
                    style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)" }}>Elegir todos</button>}
                </div>
                {!plegado && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(104px, 128px))", gap: 10, padding: "0 14px 14px" }}>
                    {visibles.map(b => {
                      const on = sel.has(b.rel), fuera = desc.has(b.rel), cs = enCarpeta[b.rel];
                      return (
                        <div key={b.rel} onClick={(e) => elegir(b.rel, e)} onDoubleClick={() => setViendo(b)} title={`${b.nombre} · ${mmss(b.dur)} · ${b.mb} MB\nClic: elegir · Doble clic: verlo`}
                          style={{ position: "relative", borderRadius: 10, overflow: "hidden", cursor: "pointer", aspectRatio: "9/16", background: "#000",
                            outline: on ? "2px solid var(--gold)" : "1px solid var(--border)", opacity: fuera ? 0.38 : 1 }}>
                          {b.mini && <img src={fileUrl(b.mini)} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
                          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "18px 6px 5px", background: "linear-gradient(transparent, rgba(0,0,0,0.85))", fontSize: 11 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}><span>{b.nombre.replace(/^IMG_/, "")}</span><span>{mmss(b.dur)}</span></div>
                            {cs && <div style={{ color: "var(--gold)", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>▸ {cs.join(", ")}</div>}
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); setViendo(b); }} title="Verlo"
                            style={{ position: "absolute", top: 6, right: 6, width: 26, height: 26, borderRadius: 99, background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: 11 }}>▶</button>
                          {on && <span style={{ position: "absolute", top: 6, left: 6, width: 22, height: 22, borderRadius: 99, background: "var(--gold)", color: "#000", fontWeight: 900, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>✓</span>}
                        </div>);
                    })}
                    {!visibles.length && <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>Todos descartados.</div>}
                  </div>)}
              </div>);
          })}
          {est.descartados.length > 0 && <label style={{ fontSize: 12.5, color: "var(--text-2)", display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
            <input type="checkbox" checked={verDesc} onChange={e => setVerDesc(e.target.checked)} />Ver también los descartados ({est.descartados.length})</label>}
        </div>

        {/* ---- las carpetas (cada una, un vídeo) ---- */}
        <div style={{ flex: "0 1 380px", minWidth: 300, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".08em" }}>Carpetas · cada una, un vídeo</div>
          {!est.carpetas.length && <div style={{ fontSize: 12.5, color: "var(--text-3)", lineHeight: 1.6, border: "1px dashed var(--border)", borderRadius: 12, padding: 12 }}>
            Elige los brutos de un mismo vídeo (clic en cada uno) y pulsa <b>Nueva carpeta con ellos</b>. Después, <b>Montar con IA</b>.</div>}
          {est.carpetas.map(c => {
            const [txt, col] = ESTADOS[montando === c.id ? "montando" : (c.estado === "montando" && !montando ? "error" : c.estado)] || ESTADOS.nuevo;
            const abiertaEsta = abierta === c.id;
            return (
              <div key={c.id} style={{ border: "1px solid " + (abiertaEsta ? "rgba(212,175,55,0.6)" : "var(--border)"), borderRadius: 12, background: "var(--card-2)" }}>
                <div onClick={() => setAbierta(a => a === c.id ? null : c.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", cursor: "pointer" }}>
                  {c.resultado && c.resultado.miniatura
                    ? <img src={fileUrl(c.resultado.miniatura)} alt="" style={{ width: 34, height: 60, objectFit: "cover", borderRadius: 6 }} />
                    : <div style={{ width: 34, height: 60, borderRadius: 6, background: "var(--bg-2)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)" }}>▤</div>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nombre}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{c.clips.length} clip(s) · <span style={{ color: col, fontWeight: 700 }}>{txt}</span>{c.drive ? " · ☁ Drive" : ""}</div>
                  </div>
                </div>
                {abiertaEsta && <DetalleCarpeta c={c} porRel={porRel} ponerCar={ponerCar} montar={montar} ocupado={ocupado} montando={montando === c.id}
                  subirDrive={subirDrive} drive={drive} subiendo={subiendo && subiendo.id === c.id ? subiendo : null} setViendo={setViendo}
                  quitar={async () => { if (window.confirm(`¿Quitar la carpeta «${c.nombre}»? Los brutos y el vídeo montado no se borran.`)) { await cambiar({ tipo: "quitar-carpeta", id: c.id }); setAbierta(null); } }} />}
              </div>);
          })}
        </div>
      </div>

      {viendo && (
        <div onClick={() => setViendo(null)} style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
            <video src={fileUrl(viendo.ruta)} controls autoPlay style={{ maxHeight: "80vh", maxWidth: "90vw", borderRadius: 12, background: "#000" }} />
            <div style={{ display: "flex", gap: 8 }}>
              <b style={{ alignSelf: "center", marginRight: 8 }}>{viendo.nombre} · {mmss(viendo.dur)}</b>
              {viendo.rel && <button onClick={() => { elegir(viendo.rel); setViendo(null); }} style={boton(sel.has(viendo.rel))}>{sel.has(viendo.rel) ? "Elegido ✓" : "Elegir"}</button>}
              {viendo.rel && <button onClick={async () => { await cambiar({ tipo: desc.has(viendo.rel) ? "restaurar" : "descartar", rels: [viendo.rel] }); setViendo(null); }} style={boton(false, !desc.has(viendo.rel))}>{desc.has(viendo.rel) ? "Restaurar" : "Descartar"}</button>}
              <button onClick={() => setViendo(null)} style={boton(false)}>Cerrar</button>
            </div>
          </div>
        </div>)}
    </div>);
}

function DetalleCarpeta({ c, porRel, ponerCar, montar, ocupado, montando, subirDrive, drive, subiendo, setViendo, quitar }) {
  const [nota, setNota] = useState(c.nota || "");
  const [tit, setTit] = useState({ titulo: c.titulo || "", blanco: c.titulo_blanco || "", rojo: c.titulo_rojo || "" });
  useEffect(() => { setNota(c.nota || ""); setTit({ titulo: c.titulo || "", blanco: c.titulo_blanco || "", rojo: c.titulo_rojo || "" }); }, [c.id]);
  const mover = (k, d) => { const cl = [...c.clips]; const j = k + d; if (j < 0 || j >= cl.length) return; [cl[k], cl[j]] = [cl[j], cl[k]]; ponerCar({ clips: cl }); };
  const modo = c.titulo_modo || "ninguno";   // (7/11, él: «el título lo elijo yo»)
  const campo = { width: "100%", boxSizing: "border-box", background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 9, padding: "8px 10px", color: "var(--text)", fontSize: 13 };
  const r = c.resultado;
  return (
    <div style={{ borderTop: "1px solid var(--border)", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      <input value={c.nombre} onChange={e => ponerCar({ nombre: e.target.value })} style={{ ...campo, fontWeight: 700 }} title="Nombre de la carpeta" />
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {c.clips.map((rel, k) => {
          const b = porRel[rel];
          return (
            <div key={rel} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
              {b && b.mini ? <img src={fileUrl(b.mini)} alt="" onClick={() => b && setViendo(b)} style={{ width: 22, height: 38, objectFit: "cover", borderRadius: 4, cursor: "pointer" }} /> : <span style={{ width: 22 }}>?</span>}
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: b ? "var(--text)" : "var(--red)" }} title={rel}>{rel}{b ? ` · ${mmss(b.dur)}` : " (no está)"}</span>
              <button onClick={() => mover(k, -1)} disabled={k === 0} style={{ color: "var(--text-3)", opacity: k === 0 ? .3 : 1 }}>↑</button>
              <button onClick={() => mover(k, 1)} disabled={k === c.clips.length - 1} style={{ color: "var(--text-3)", opacity: k === c.clips.length - 1 ? .3 : 1 }}>↓</button>
              <button onClick={() => ponerCar({ clips: c.clips.filter(x => x !== rel) })} title="Quitar de la carpeta (el bruto no se toca)" style={{ color: "var(--red)" }}>✕</button>
            </div>);
        })}
      </div>
      <label style={{ fontSize: 12, color: "var(--text-2)", display: "flex", flexDirection: "column", gap: 4 }}>Qué quieres en este vídeo (opcional)
        <textarea value={nota} rows={3} onChange={e => setNota(e.target.value)} onBlur={() => nota !== (c.nota || "") && ponerCar({ nota })}
          placeholder="Ej.: presentar el Arteon R-Line; que salga «Único propietario»; tono de humor; acabar con «pasaros por aquí»…" style={{ ...campo, resize: "vertical", fontFamily: "inherit" }} /></label>
      {/* 1/11, él: "los títulos también quiero poder elegirlos yo" */}
      <label style={{ fontSize: 12, color: "var(--text-2)", display: "flex", flexDirection: "column", gap: 4 }}>Título del vídeo (nombre del archivo)
        <input value={tit.titulo} onChange={e => setTit({ ...tit, titulo: e.target.value })} onBlur={() => tit.titulo !== (c.titulo || "") && ponerCar({ titulo: tit.titulo })}
          placeholder="Lo decide la IA" style={campo} /></label>
      <div style={{ fontSize: 12, color: "var(--text-2)", display: "flex", flexDirection: "column", gap: 6 }}>Título arriba (en el vídeo)
        <div style={{ display: "flex", gap: 6 }}>
          {[["ia", "Lo decide la IA"], ["suyo", "El mío"], ["ninguno", "Sin título"]].map(([m, n]) =>
            <button key={m} onClick={() => ponerCar({ titulo_modo: m })} style={{ ...boton(modo === m), padding: "6px 10px", fontSize: 12 }}>{n}</button>)}
        </div>
        {modo === "suyo" && <>
          <input value={tit.blanco} onChange={e => setTit({ ...tit, blanco: e.target.value })} onBlur={() => ponerCar({ titulo_blanco: tit.blanco })} placeholder="Línea blanca (p. ej. VINO UN CLIENTE)" style={campo} />
          <input value={tit.rojo} onChange={e => setTit({ ...tit, rojo: e.target.value })} onBlur={() => ponerCar({ titulo_rojo: tit.rojo })} placeholder="Línea roja (p. ej. con el coche roto)" style={{ ...campo, color: "#ff5a5a" }} />
        </>}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={() => montar(c)} disabled={ocupado || !c.clips.length} style={{ ...boton(true), opacity: ocupado ? .5 : 1 }}
          title="Whisper + Claude: corrige los subtítulos, elige las tomas, corta, pone fichas, música y SFX, y lo exporta. Todo queda editable en el RandomEditor">
          {montando ? "Montando…" : r ? "Volver a montar con IA" : "Montar con IA"}</button>
        <button onClick={quitar} style={boton(false, true)}>Quitar carpeta</button>
      </div>
      {c.estado === "error" && c.error && <div style={{ fontSize: 12, color: "var(--red)", lineHeight: 1.5 }}>✗ {c.error}</div>}
      {r && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
          <div style={{ display: "flex", gap: 10 }}>
            {r.miniatura && <img src={fileUrl(r.miniatura)} alt="" style={{ width: 70, aspectRatio: "9/16", objectFit: "cover", borderRadius: 8 }} />}
            <div style={{ fontSize: 12.5, lineHeight: 1.5, minWidth: 0 }}>
              <b>{r.titulo}</b> · {mmss(r.dur)}<div style={{ color: "var(--text-3)", fontSize: 11.5 }}>{r.fecha}</div>
              {r.notas && <div style={{ color: "var(--text-2)", marginTop: 4 }}>{r.notas}</div>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button onClick={() => window.studioFS.clonAbrir(r.mp4)} style={{ ...boton(false), padding: "6px 10px", fontSize: 12 }}>Ver vídeo</button>
            <button onClick={() => window.studioFS.abrirEditor({ proyecto: r.proyecto })} style={{ ...boton(true), padding: "6px 10px", fontSize: 12 }}
              title="Todo suelto en su línea de tiempo: cortes, planos, fichas, subtítulos, música y SFX. «Exportar vídeo» rehace este mismo archivo">Editar en el RandomEditor</button>
            <button onClick={() => window.studioFS.clonAbrir(r.mp4.replace(/[\\/][^\\/]+$/, ""))} style={{ ...boton(false), padding: "6px 10px", fontSize: 12 }}>Abrir carpeta</button>
            {drive && <button onClick={() => subirDrive(c.id)} disabled={!!subiendo} style={{ ...boton(false), padding: "6px 10px", fontSize: 12 }}>
              {subiendo ? `Subiendo ${Math.round((subiendo.fraccion || 0) * 100)} %` : c.drive ? "Volver a subir a Drive" : "Subir a Drive"}</button>}
            {c.drive && c.drive.carpeta && <a href={c.drive.carpeta} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 700, color: "var(--gold)", alignSelf: "center" }}>Ver en Drive</a>}
          </div>
        </div>)}
    </div>);
}
