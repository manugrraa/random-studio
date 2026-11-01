import React from "react";
const { useState, useEffect, useCallback } = React;
import { driveConectado, driveToken } from "./datos";
import { PERFILES, perfilActual } from "./perfiles";

/* ============================ ALMACENAMIENTO (Configuración, v3.34) ============================
 * Qué ocupa cada carpeta y los discos; Drive con el límite de tu plan; y para cada carpeta:
 *  - «Archivar en Drive y liberar»: sube, comprueba que la copia es idéntica y solo entonces lo borra del disco.
 *  - «A la papelera» (se puede deshacer) o «Borrar para siempre» (libera el espacio ya), con confirmación.
 *  - «Archivado»: lo que ya está en Drive, con «Recuperar».
 * El archivado sigue aunque cambies de sección (vive en este módulo), archivo a archivo y renovando el permiso de Drive.
 */
const SF = () => window.studioFS;
const GB = (b) => (b / 1e9).toFixed(b >= 1e10 ? 0 : 1) + " GB";
const tam = (b) => b >= 1e9 ? GB(b) : b >= 1e6 ? (b / 1e6).toFixed(0) + " MB" : Math.max(1, Math.round(b / 1e3)) + " KB";
const K_LIMITE = "rds_drive_limite_gb";
const btn = { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, borderRadius: 10, padding: "8px 13px", border: "1px solid var(--border)", background: "var(--card-2)", color: "var(--text)" };

// ------------------------------------------------------------------ el archivado en marcha (uno a la vez)
let trabajo = null;                       // { clave, total, hechos, bytes, totalBytes, liberado, actual, fraccion, fallos, parar, fin }
const oyentes = new Set();
const avisar = () => oyentes.forEach(f => f(trabajo ? { ...trabajo } : null));
function useTrabajo() {
  const [t, setT] = useState(trabajo ? { ...trabajo } : null);
  useEffect(() => { oyentes.add(setT); return () => oyentes.delete(setT); }, []);
  return t;
}
async function archivar(clave, archivos, totalBytes) {
  const perfil = (PERFILES.find(p => p.id === perfilActual()) || PERFILES[0] || {}).nombre || "RandomStudio";
  trabajo = { clave, total: archivos.length, hechos: 0, bytes: 0, totalBytes, liberado: 0, fallos: [], actual: "", fraccion: 0 };
  const off = SF().onAlmProgreso(d => { if (trabajo && d.tipo === "parcial") { trabajo.fraccion = d.fraccion; avisar(); } });
  avisar();
  for (const a of archivos) {
    if (trabajo.parar) break;
    trabajo.actual = a.rel; trabajo.fraccion = 0; avisar();
    try {
      const r = await SF().almArchivarUno(await driveToken(), perfil, clave, a.rel);
      if (r.ok) trabajo.liberado += r.liberado || 0; else trabajo.fallos.push(a.rel + ": " + r.error);
    } catch (e) { trabajo.fallos.push(a.rel + ": " + e.message); if (/Drive/.test(e.message)) break; }
    trabajo.hechos++; trabajo.bytes += a.tam; avisar();
  }
  off && off();
  trabajo.fin = true; avisar();
}

function Barra({ v, color }) {
  return (
    <div style={{ height: 8, borderRadius: 9, background: "var(--track)", overflow: "hidden", border: "1px solid var(--border)" }}>
      <div style={{ height: "100%", width: Math.round(Math.max(0, Math.min(1, v)) * 100) + "%", background: color || "linear-gradient(90deg,#FFD700,#D4AF37)", transition: "width .5s" }} />
    </div>);
}

export function AlmacenPanel({ toast }) {
  const [res, setRes] = useState(null);
  const [drive, setDrive] = useState(null);
  const [limite, setLimite] = useState(() => { try { return Number(localStorage.getItem(K_LIMITE)) || 200; } catch (e) { return 200; } });
  const [abierta, setAbierta] = useState(null);       // { clave, nombre, sub }
  const [lista, setLista] = useState(null);
  const [sel, setSel] = useState(new Set());
  const [verArchivado, setVerArchivado] = useState(false);
  const [indice, setIndice] = useState(null);
  const t = useTrabajo();

  const cargar = useCallback(async () => {
    setRes(await SF().almResumen());
    if (driveConectado()) driveToken().then(tk => SF().driveEspacio(tk)).then(setDrive).catch(e => setDrive({ ok: false, error: e.message }));
    else setDrive({ ok: false, sin: true });
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { if (t && t.fin) { cargar(); if (abierta) abrir(abierta.clave, abierta.nombre, abierta.sub); } }, [t && t.fin]);

  const abrir = async (clave, nombre, sub) => {
    setAbierta({ clave, nombre, sub: sub || "" }); setSel(new Set()); setLista(null);
    try { setLista(await SF().almListar(clave, sub || "")); } catch (e) { toast(e.message); }
  };
  const elegidos = lista ? lista.items.filter(i => sel.has(i.rel)) : [];
  const bytesSel = elegidos.reduce((a, i) => a + i.tam, 0);
  const archivables = elegidos.some(i => i.archivable);
  const borrables = elegidos.filter(i => i.borrable);
  const usadoDrive = drive && drive.ok ? drive.usado : 0;
  const limiteBytes = limite * 1e9;

  const empezarArchivo = async () => {
    if (!driveConectado()) return toast("Conecta Drive primero (Cuenta y conexiones)");
    const p = await SF().almPreparar(abierta.clave, elegidos.map(i => i.rel));
    if (!p.ok) return toast(p.error);
    const saltados = Object.entries(p.saltados || {}).map(([m, n]) => n + " " + m).join(", ");
    if (!p.archivos.length) return toast("No hay nada que se pueda archivar ahí" + (saltados ? ": " + saltados : ""));
    if (usadoDrive + p.bytes > limiteBytes * 0.95)
      return toast(`No cabe: Drive quedaría en ${GB(usadoDrive + p.bytes)} de ${limite} GB. Elige menos o borra algo antes.`);
    if (!confirm(`¿Archivar ${p.archivos.length} vídeos (${tam(p.bytes)}) en Drive y borrarlos de este disco?\n\nCada uno se borra solo después de comprobar que la copia de Drive es idéntica. Las carpetas y sus archivos pequeños se quedan. Se pueden recuperar cuando quieras.` + (saltados ? `\n\nSe saltan: ${saltados}.` : ""))) return;
    archivar(abierta.clave, p.archivos, p.bytes);
  };
  const borrar = async (definitivo) => {
    if (!borrables.length) return toast("Nada de lo elegido se puede borrar: " + (elegidos[0] && elegidos[0].motivoBorrar));
    const bytesB = borrables.reduce((a, i) => a + i.tam, 0), soloVideos = borrables.some(i => i.soloVideos);
    const extra = (soloVideos ? "\n\nEn clips y Shorts se borran los vídeos; la carpeta y sus datos se quedan (para que los números y el ranking no se crucen)." : "")
      + (lista.aviso ? "\n\nOjo: " + lista.aviso : "") + (borrables.length < elegidos.length ? `\n\n${elegidos.length - borrables.length} elegidos no se pueden borrar y se saltan.` : "");
    const txt = (definitivo
      ? `¿BORRAR PARA SIEMPRE ${borrables.length} elementos (hasta ${tam(bytesB)})?\n\nNo se pueden recuperar.`
      : `¿Mandar ${borrables.length} elementos (hasta ${tam(bytesB)}) a la papelera de Windows?\n\nSe pueden recuperar desde la papelera, pero el espacio NO se libera hasta que la vacíes.`) + extra;
    if (!confirm(txt)) return;
    if (definitivo && !confirm("Última comprobación: se borran de verdad. ¿Seguro?")) return;
    const r = await SF().almBorrar(abierta.clave, borrables.map(i => i.rel), definitivo);
    toast((definitivo ? "🗑 Borrados " : "🗑 A la papelera ") + r.hechos + " · " + tam(r.liberado) + (r.fallos.length ? " · " + r.fallos.length + " no se pudieron" : ""));
    cargar(); abrir(abierta.clave, abierta.nombre, abierta.sub);
  };

  if (!SF() || !SF().almResumen) return null;
  if (!res) return <div style={{ fontSize: 13, color: "var(--text-3)" }}>Midiendo las carpetas… (con muchos archivos tarda unos segundos)</div>;
  const maxCarpeta = Math.max(1, ...res.carpetas.map(c => c.tam));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* discos y Drive */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}>
        {res.discos.map(d => {
          const usado = d.total - d.libre, pct = usado / d.total, mal = d.libre < 20e9;
          return (
            <div key={d.raiz} style={{ background: "var(--bg-2)", border: "1px solid " + (mal ? "rgba(248,113,113,.5)" : "var(--border)"), borderRadius: 14, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 800 }}><span>💽 Disco {d.raiz.replace("\\", "")}</span><span style={{ color: mal ? "var(--red)" : "var(--green)" }}>{GB(d.libre)} libres</span></div>
              <div style={{ margin: "8px 0 4px" }}><Barra v={pct} color={mal ? "var(--red)" : undefined} /></div>
              <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{GB(usado)} usados de {GB(d.total)}</div>
            </div>);
        })}
        <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 14, padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 800 }}><span>☁️ Google Drive</span>
            {drive && drive.ok && <span style={{ color: usadoDrive > limiteBytes * 0.9 ? "var(--red)" : "var(--green)" }}>{GB(Math.max(0, limiteBytes - usadoDrive))} libres</span>}</div>
          {drive && drive.ok ? (<>
            <div style={{ margin: "8px 0 4px" }}><Barra v={usadoDrive / limiteBytes} /></div>
            <div style={{ fontSize: 11.5, color: "var(--text-3)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              {GB(usadoDrive)} usados · límite de tu plan:
              <input value={limite} onChange={e => { const v = Math.max(15, Number(e.target.value) || 0); setLimite(v); try { localStorage.setItem(K_LIMITE, String(v)); } catch (x) {} }}
                inputMode="numeric" style={{ width: 54, fontSize: 11.5, padding: "2px 6px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--card-2)", color: "var(--text)" }} /> GB
            </div>
            {drive.limite > limiteBytes && <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>Ahora tienes {GB(drive.limite)}; cuento con {limite} GB para que no te pases cuando cambie el plan.</div>}
          </>) : <div style={{ fontSize: 12, color: "#F59E0B", marginTop: 8 }}>{drive && drive.sin ? "Drive sin conectar (Cuenta y conexiones)" : drive ? drive.error : "Mirando…"}</div>}
        </div>
      </div>

      {/* archivado en marcha */}
      {t && (
        <div style={{ background: "linear-gradient(135deg,rgba(212,175,55,.10),rgba(212,175,55,.02))", border: "1px solid var(--border-gold)", borderRadius: 14, padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <b style={{ fontSize: 13.5 }}>{t.fin ? "✓ Archivado terminado" : "☁️ Archivando en Drive…"}</b>
            <span style={{ fontSize: 12, color: "var(--text-2)" }}>{t.hechos} de {t.total} · {tam(t.bytes)} de {tam(t.totalBytes)} · liberado {tam(t.liberado)}</span>
            <span style={{ flex: 1 }} />
            {!t.fin ? <button onClick={() => { trabajo.parar = true; avisar(); }} style={{ ...btn, color: "var(--red)" }}>{t.parar ? "Parando…" : "Parar"}</button>
              : <button onClick={() => { trabajo = null; avisar(); }} style={btn}>Cerrar</button>}
          </div>
          {!t.fin && <div style={{ marginTop: 8 }}><Barra v={t.bytes / Math.max(1, t.totalBytes) + (t.total ? (t.fraccion || 0) / t.total : 0)} /></div>}
          {!t.fin && t.actual && <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.actual}</div>}
          {t.fallos.length > 0 && <div style={{ fontSize: 11.5, color: "var(--red)", marginTop: 6 }}>{t.fallos.length} no se pudieron (se quedan en el disco): {t.fallos.slice(0, 3).join(" · ")}</div>}
        </div>)}

      {/* carpetas */}
      {!abierta && (
        <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 16, padding: "6px 16px" }}>
          {res.carpetas.filter(c => c.existe).sort((a, b) => b.tam - a.tam).map((c, i, arr) => (
            <div key={c.clave} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: i === arr.length - 1 ? "none" : "1px solid var(--border)", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>{c.nombre}</div>
                <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 2 }}>{c.archivos.toLocaleString("es-ES")} archivos{c.nota ? " · " + c.nota : ""}</div>
                <div style={{ marginTop: 6, maxWidth: 360 }}><Barra v={c.tam / maxCarpeta} /></div>
              </div>
              <b style={{ fontSize: 14, minWidth: 70, textAlign: "right" }}>{tam(c.tam)}</b>
              {c.clave !== "renders" && <button onClick={() => abrir(c.clave, c.nombre)} style={{ ...btn, color: "var(--gold)", borderColor: "var(--border-gold)" }}>Abrir y elegir</button>}
            </div>))}
        </div>)}

      {/* dentro de una carpeta */}
      {abierta && (
        <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 16, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <button onClick={() => { setAbierta(null); setLista(null); }} style={btn}>← Carpetas</button>
            <b style={{ fontSize: 14 }}>{abierta.nombre}</b>
            {abierta.sub && abierta.sub.split(/[\\/]/).map((p, i, arr) => (
              <button key={i} onClick={() => abrir(abierta.clave, abierta.nombre, arr.slice(0, i + 1).join("\\"))} style={{ fontSize: 12.5, color: "var(--text-2)" }}>› {p}</button>))}
            <span style={{ flex: 1 }} />
            {lista && <button onClick={() => SF().almAbrir(lista.base + (abierta.sub ? "\\" + abierta.sub : ""))} style={btn}>Abrir en el explorador</button>}
          </div>
          {!lista && <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>Midiendo…</div>}
          {lista && (<>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "8px 10px", borderRadius: 10, background: "var(--card-2)", marginBottom: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700 }}>
                <input type="checkbox" checked={sel.size > 0 && sel.size === lista.items.length} onChange={e => setSel(e.target.checked ? new Set(lista.items.map(i => i.rel)) : new Set())} /> Todo
              </label>
              <span style={{ fontSize: 12.5, color: "var(--text-2)" }}>{sel.size ? `${sel.size} elegidos · ${tam(bytesSel)}` : "Elige lo que quieras archivar o borrar"}</span>
              <span style={{ flex: 1 }} />
              <button disabled={!sel.size || !archivables || !!(t && !t.fin)} onClick={empezarArchivo} className="grad-gold"
                title={!archivables ? "Nada de lo elegido se archiva (pasa el ratón por ☁️ para ver por qué)" : ""}
                style={{ ...btn, color: "#000", border: "none", opacity: (!sel.size || !archivables || (t && !t.fin)) ? .45 : 1 }}>☁️ Archivar en Drive y liberar</button>
              <button disabled={!borrables.length} onClick={() => borrar(false)} style={{ ...btn, opacity: borrables.length ? 1 : .45 }}>🗑 A la papelera</button>
              <button disabled={!borrables.length} onClick={() => borrar(true)} style={{ ...btn, color: "var(--red)", borderColor: "rgba(248,113,113,.4)", opacity: borrables.length ? 1 : .45 }}>Borrar para siempre</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", maxHeight: 460, overflowY: "auto" }}>
              {lista.items.map(i => (
                <div key={i.rel} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 8px", borderBottom: "1px solid var(--border)", fontSize: 12.5 }}>
                  <input type="checkbox" checked={sel.has(i.rel)} onChange={e => { const s = new Set(sel); e.target.checked ? s.add(i.rel) : s.delete(i.rel); setSel(s); }} />
                  <span>{i.carpeta ? "📁" : /\.(mp4|mov|mkv)$/i.test(i.nombre) ? "🎬" : "📄"}</span>
                  {i.carpeta ? <button onClick={() => abrir(abierta.clave, abierta.nombre, i.rel)} style={{ flex: 1, textAlign: "left", fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.nombre}</button>
                    : <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.nombre}</span>}
                  <span style={{ color: "var(--text-3)", fontSize: 11.5, whiteSpace: "nowrap" }}>{new Date(i.fecha).toLocaleDateString("es-ES")}</span>
                  <span title={i.archivable ? "Se puede archivar en Drive" : "No se archiva: " + i.motivoArchivo} style={{ fontSize: 12, opacity: i.archivable ? 1 : .25 }}>☁️</span>
                  <span title={i.borrable ? (i.soloVideos ? "Se pueden borrar sus vídeos (la carpeta se queda)" : "Se puede borrar") : "No se borra: " + i.motivoBorrar} style={{ fontSize: 12, opacity: i.borrable ? 1 : .25 }}>🗑</span>
                  <b style={{ width: 70, textAlign: "right" }}>{tam(i.tam)}</b>
                </div>))}
              {!lista.items.length && <div style={{ fontSize: 12.5, color: "var(--text-3)", padding: 8 }}>Vacía.</div>}
              {(lista.enDrive || []).length > 0 && <div style={{ fontSize: 12, color: "var(--text-3)", padding: "8px 4px" }}>☁️ Ya no están aquí: {lista.enDrive.map(x => x.archivo + (x.estado === "drive" ? " (en Drive)" : " (" + x.estado + ")")).join(", ")}</div>}
            </div>
          </>)}
        </div>)}

      {/* lo archivado */}
      <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 16, padding: "12px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <b style={{ fontSize: 13.5 }}>☁️ Archivado en Drive</b>
          <span style={{ fontSize: 12, color: "var(--text-3)" }}>{res.archivado.archivos} archivos · {tam(res.archivado.tam)}</span>
          <span style={{ flex: 1 }} />
          <button onClick={async () => { const v = !verArchivado; setVerArchivado(v); if (v) setIndice((await SF().almIndice()).items); }} style={btn}>{verArchivado ? "Ocultar" : "Ver y recuperar"}</button>
        </div>
        {verArchivado && indice && (
          <div style={{ marginTop: 10, maxHeight: 320, overflowY: "auto" }}>
            {!indice.length && <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>Todavía no has archivado nada.</div>}
            {indice.map(x => (
              <div key={x.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid var(--border)", fontSize: 12.5 }}>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.rel}</span>
                <span style={{ color: "var(--text-3)", fontSize: 11.5 }}>{tam(x.tam)}</span>
                <a href={x.ver} target="_blank" rel="noopener" style={{ ...btn, padding: "5px 10px", textDecoration: "none" }}>Ver</a>
                {x.existeLocal ? <span style={{ fontSize: 11.5, color: "var(--green)" }}>en el disco</span>
                  : <button onClick={async () => { const r = await SF().almRecuperar(await driveToken(), [x.id]); toast(r.resultados[0] && r.resultados[0].ok ? "Recuperado en su carpeta" : "No se pudo: " + ((r.resultados[0] || {}).error || "")); setIndice((await SF().almIndice()).items); }} style={{ ...btn, padding: "5px 10px" }}>Recuperar</button>}
              </div>))}
          </div>)}
      </div>
    </div>);
}
