/* Control remoto de RandomStudio (v3.30).
 *
 * En el ESCRITORIO (portátil u ordenador): cada 8 s publica cómo va (historias, etapa en marcha, plano del render, ideas,
 * enlaces de Drive) y cada 5 s recoge las órdenes que le manden otros equipos aprobados (el móvil). Solo ejecuta las de
 * una lista cerrada, y el servidor ya ha comprobado que vienen de un equipo con permiso para este perfil.
 * También sube solo a Drive los Shorts entregados (y lo que espera revisión, para poder verlo desde el móvil).
 * En la WEB/móvil: remotoApi() lee ese estado y manda órdenes (lo usa la vista de Historias).
 */
import { YT_BACKEND, cloudToken } from "./datos";
import { cabecerasEquipo } from "./seguridad";
import { PERFILES, perfilActual } from "./perfiles";

const SF = () => window.studioFS;

export async function remotoApi(metodo, cuerpo) {
  const token = await cloudToken();
  const r = await fetch(YT_BACKEND + "/api/remoto", {
    method: metodo,
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token, ...(await cabecerasEquipo(metodo, "/api/remoto")) },
    body: metodo === "GET" ? undefined : JSON.stringify(cuerpo || {}),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.success) throw new Error(j.error || ("Error " + r.status));
  return j;
}

const nombrePerfil = () => (PERFILES.find(p => p.id === perfilActual()) || PERFILES[0] || {}).nombre || "RandomStudio";

// ------------------------------------------------------------------ órdenes que entiende el escritorio
async function ejecutar(o) {
  const a = o.args || {}, s = SF();
  switch (o.que) {
    case "avanzar": return s.estudioAvanzar(a.id);
    case "revisar": return s.estudioRevisar(a.id, a.etapa, !!a.ok, String(a.nota || ""));
    case "rehacer": return s.estudioRehacer(a.id, a.etapa, String(a.nota || ""));
    case "nota": return s.estudioNotaFinal(a.id, String(a.texto || ""));
    case "cancelar": return s.historiasCancelar();
    case "ideas_generar": return s.estudioIdeasGenerar(Number(a.n) || 5, String(a.pista || ""));
    case "idea_poner": return s.estudioIdeaPoner(a.id, { estado: a.estado });
    case "crear": return s.estudioCrear(a.id, { nn: Number.isInteger(a.nn) ? a.nn : undefined, idea: a.idea });
    case "drive_subir": return s.estudioDriveSubir(a.id, await cloudToken(), nombrePerfil(), a.que || "short");
    case "ajustes": return s.estudioAjustes(a.nuevos || {});
  }
  throw new Error("Orden desconocida");
}

let _iniciado = false;
export function iniciarRemotoEscritorio(toast) {
  const s = SF();
  if (_iniciado || !s || !s.historiasLista || !s.estudioEtapas) return;
  _iniciado = true;
  let subiendo = false;

  const publicar = async () => {
    if (!navigator.onLine) return;
    let token; try { token = await cloudToken(); } catch (e) { return; }
    const [l0, t, aj, id] = await Promise.all([s.historiasLista(), s.historiasTareaEstado(), s.estudioAjustes(), s.estudioIdeas()]);
    // sin el proyecto de historias (p. ej. el ordenador antes de prepararlo) se publica igual: así se ve que está encendido
    const l = l0 && l0.ok ? l0 : { ok: true, historias: [] };
    // Drive: el Short entregado (si está activado) y lo que espera revisión de voces o animatic, de uno en uno
    if (!subiendo) {
      const lista = aj.ajustes.driveAuto && l.historias.find(h => !h.legado && h.entregada && !h.drive);
      const pend = lista ? { h: lista, que: "short" } : null;
      const rev = !pend && l.historias.map(h => ({ h, e: (h.etapas || []).find(x => x.estado === "revisar" && (x.id === "voces" || x.id === "animatic")) }))
        .find(x => x.e && !(x.h.driveRevision || {})[x.e.id]);
      const tarea = pend || (rev && { h: rev.h, que: rev.e.id });
      if (tarea) {
        subiendo = true;
        s.estudioDriveSubir(tarea.h.id, token, nombrePerfil(), tarea.que)
          .then(r => { if (r.ok && tarea.que === "short" && toast) toast("☁️ «" + tarea.h.titulo + "» ya está en tu Drive"); })
          .finally(() => { subiendo = false; });
      }
    }
    const historias = [];
    for (const h of l.historias.slice(0, 12)) {
      const x = { id: h.id, titulo: h.titulo, etapas: h.etapas, entregada: h.entregada, legado: h.legado, drive: h.drive, driveRevision: h.driveRevision };
      if ((h.etapas || []).some(e => e.estado === "revisar" && e.id === "guion")) {
        try { const m = await s.estudioMaterial(h.id); x.narracion = (m.narracion || "").slice(0, 8000); x.guionTitulo = m.titulo; } catch (e) {}
      }
      historias.push(x);
    }
    const datos = {
      tipo: "escritorio", ts: Date.now(), historias,
      capacidad: { proyecto: !!aj.proyecto, claude: !!aj.claude, blender: !!aj.blender, eleven: !!aj.eleven },
      numeros: l.historias.map(h => parseInt(h.id, 10)).filter(n => !isNaN(n)),
      tarea: t && t.activa ? { id: t.id, tipo: t.tipo, etapa: t.etapa, inicio: t.inicio, paso: t.paso, render: t.render, accion: t.accion, acciones: (t.acciones || []).slice(-8) } : null,
      ajustes: aj.ajustes,
      ideas: (id.ideas || []).filter(i => i.estado !== "descartada").slice(0, 30).map(i => ({ id: i.id, titulo: i.titulo, regla: i.regla, resumen: i.resumen, estado: i.estado, temporada: i.temporada, historia: i.historia })),
      generandoIdeas: !!id.generando,
    };
    await remotoApi("POST", { accion: "publicar", datos }).catch(() => {});
  };

  const recoger = async () => {
    if (!navigator.onLine) return;
    let r; try { r = await remotoApi("POST", { accion: "recoger" }); } catch (e) { return; }
    for (const o of r.ordenes || []) {
      let ok = true, txt = "";
      try { const x = await ejecutar(o); if (x && x.ok === false) { ok = false; txt = x.error || ""; } }
      catch (e) { ok = false; txt = e.message || String(e); }
      if (toast) toast(`📱 Orden de ${o.de || "otro equipo"}: ${o.que}${ok ? "" : " (no se pudo: " + txt + ")"}`);
      await remotoApi("POST", { accion: "resultado", id: o.id, ok, resultado: txt }).catch(() => {});
      setTimeout(publicar, 500);
    }
  };

  publicar(); recoger();
  setInterval(publicar, 8000);
  setInterval(recoger, 5000);
}

// ------------------------------------------------------------------ trabajo dual
/** Los otros equipos de escritorio en línea que pueden hacer historias (para «Crear en el ordenador»). */
export async function equiposDual() {
  try {
    const r = await remotoApi("GET");
    return { yo: r.yo, todos: r.equipos || [], otros: (r.equipos || []).filter(e => e.id !== r.yo && e.en_linea && e.datos && e.datos.capacidad
      && e.datos.capacidad.proyecto && e.datos.capacidad.claude) };
  } catch (e) { return { yo: null, todos: [], otros: [] }; }
}
/** El número de la siguiente historia contando las de TODOS los equipos (que no se pisen dos «09»). */
export function numeroSiguiente(todos, locales) {
  const ns = [...(locales || [])];
  (todos || []).forEach(e => ((e.datos && e.datos.numeros) || []).forEach(n => ns.push(n)));
  return (ns.length ? Math.max(...ns) : 0) + 1;
}
export async function ordenA(para, que, args) { return remotoApi("POST", { accion: "orden", para, que, args }); }
