/* Control remoto de RandomStudio (v3.30).
 *
 * En el ESCRITORIO (portátil u ordenador): cada 8 s publica cómo va (historias, etapa en marcha, plano del render, ideas,
 * enlaces de Drive) y cada 5 s recoge las órdenes que le manden otros equipos aprobados (el móvil). Solo ejecuta las de
 * una lista cerrada, y el servidor ya ha comprobado que vienen de un equipo con permiso para este perfil.
 * También sube solo a Drive los Shorts entregados (y lo que espera revisión, para poder verlo desde el móvil).
 * En la WEB/móvil: remotoApi() lee ese estado y manda órdenes (lo usa la vista de Historias).
 */
import { APP_VERSION } from "./base";
import { YT_BACKEND } from "./datos";
import { driveConectadoTrabajo, driveHistorias, driveTokenTrabajo, tokenTrabajo } from "./sesion_historias";
import { cabecerasEquipo } from "./seguridad";
import { PERFILES, perfilActual } from "./perfiles";
import { avisar } from "./avisos";

const SF = () => window.studioFS;

export async function remotoApi(metodo, cuerpo) {
  const token = await tokenTrabajo();
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
// la carpeta de Drive: la de RandomHistorias si su Drive está conectado en este equipo (v3.40.1)
const perfilDrive = () => driveHistorias() ? "RandomHistorias" : nombrePerfil();

// ------------------------------------------------------------------ órdenes que entiende el escritorio
async function ejecutar(o) {
  const a = o.args || {}, s = SF();
  switch (o.que) {
    case "avanzar": return s.estudioAvanzar(a.id);
    case "revisar": return s.estudioRevisar(a.id, a.etapa, !!a.ok, String(a.nota || ""));
    case "rehacer": return s.estudioRehacer(a.id, a.etapa, String(a.nota || ""));
    case "nota": return s.estudioNotaFinal(a.id, String(a.texto || ""));
    case "cancelar": return s.historiasCancelar(a.historia || undefined);
    case "ideas_generar": return s.estudioIdeasGenerar(Number(a.n) || 5, String(a.pista || ""));
    case "idea_poner": return s.estudioIdeaPoner(a.id, { estado: a.estado });
    // (v3.38.1: ya no hay orden «crear»: toda historia nueva pasa por la cola, que es la que impide repetirlas)
    case "borrar": return borrarHistoria(a.id);
    case "parar_todo": return pararTodo();
    case "drive_subir": return s.estudioDriveSubir(a.id, await driveTokenTrabajo(), perfilDrive(), a.que || "short");
    case "ajustes": return s.estudioAjustes(a.nuevos || {});
  }
  throw new Error("Orden desconocida");
}

let _iniciado = false;
/* v3.40.1: arrancan al abrir la app (main.jsx), antes de elegir perfil, y siguen igual al cambiar de perfil. Los avisos en
 * pantalla (toast) llegan cuando la ventana principal se monta y se los pasa. */
let _toast = null;
const toast = (m) => { if (_toast) _toast(m); };
export function iniciarRemotoEscritorio(t) {
  if (t) _toast = t;
  const s = SF();
  if (_iniciado || !s || !s.historiasLista || !s.estudioEtapas) return;
  _iniciado = true;
  let subiendo = false;

  const publicar = async () => {
    if (!navigator.onLine) return;
    try { await tokenTrabajo(); } catch (e) { return; }
    const [l0, t, aj, id] = await Promise.all([s.historiasLista(), s.historiasTareaEstado(), s.estudioAjustes(), s.estudioIdeas()]);
    // sin el proyecto de historias (p. ej. el ordenador antes de prepararlo) se publica igual: así se ve que está encendido
    const l = l0 && l0.ok ? l0 : { ok: true, historias: [] };
    // Drive: el Short entregado (si está activado) y lo que espera revisión de voces o animatic, de uno en uno
    if (!subiendo && driveConectadoTrabajo()) {
      const lista = aj.ajustes.driveAuto && l.historias.find(h => !h.legado && h.entregada && !h.drive);
      const pend = lista ? { h: lista, que: "short" } : null;
      const rev = !pend && l.historias.map(h => ({ h, e: (h.etapas || []).find(x => x.estado === "revisar" && (x.id === "voces" || x.id === "animatic")) }))
        .find(x => x.e && !(x.h.driveRevision || {})[x.e.id]);
      const tarea = pend || (rev && { h: rev.h, que: rev.e.id });
      if (tarea) {
        subiendo = true;
        driveTokenTrabajo().then(dt => s.estudioDriveSubir(tarea.h.id, dt, perfilDrive(), tarea.que))
          .then(r => { if (r.ok && tarea.que === "short" && toast) toast("☁️ «" + tarea.h.titulo + "» ya está en tu Drive"); })
          .catch(() => {}).finally(() => { subiendo = false; });
      }
    }
    // avisos al móvil: lo que acaba de cambiar desde la última vuelta (se recuerda para no repetir tras reiniciar)
    const K_AV = "rs_perfil_avisados";
    let previos = {}; try { previos = JSON.parse(localStorage.getItem(K_AV) || "{}"); } catch (e) {}
    const ahora = {};
    for (const h of l.historias) {
      if (h.legado) continue;
      const rev = (h.etapas || []).find(e => e.estado === "revisar");
      const clave = h.entregada ? "listo" : rev ? "revisar:" + rev.id : "";
      ahora[h.id] = clave;
      if (clave && previos[h.id] !== clave && previos.__iniciado) {
        if (clave === "listo") avisar("🎉 Short listo", "«" + (h.titulo || h.id) + "» ya está terminado" + (h.drive ? " y en tu Drive" : ""), "h" + h.id);
        else avisar("📋 Te toca revisar", "Historia " + h.id.slice(0, 2) + (h.titulo ? " «" + h.titulo + "»" : "") + " · " + ({ guion: "el guion", voces: "las voces", animatic: "el animatic" }[rev.id] || rev.id), "h" + h.id);
      }
      // v3.37.4: cada etapa terminada (guion, voces, escena, animatic, render…), también avisa
      const hechas = (h.etapas || []).filter(e => e.estado === "hecho").map(e => e.id);
      ahora["e" + h.id] = hechas.join(",");
      const antes = String(previos["e" + h.id] || "").split(",").filter(Boolean);
      const nueva = [...hechas].reverse().find(id => !antes.includes(id));
      if (nueva && previos.__iniciado && previos["e" + h.id] !== undefined && clave !== "listo" && !(clave && previos[h.id] !== clave)) {
        const et = (h.etapas || []).find(e => e.id === nueva) || {};
        avisar("✅ " + (et.nombre || nueva) + " hecho", "Historia " + h.id.slice(0, 2) + (h.titulo ? " · «" + h.titulo + "»" : "") + " sigue adelante", "e" + h.id + nueva);
      }
    }
    ahora.__iniciado = 1;
    try { localStorage.setItem(K_AV, JSON.stringify(ahora)); } catch (e) {}
    const historias = [];
    for (const h of l.historias.slice(0, 12)) {
      const x = { id: h.id, titulo: h.titulo, etapas: h.etapas, entregada: h.entregada, legado: h.legado, drive: h.drive, driveRevision: h.driveRevision };
      if ((h.etapas || []).some(e => e.estado === "revisar" && e.id === "guion")) {
        try { const m = await s.estudioMaterial(h.id); x.narracion = (m.narracion || "").slice(0, 8000); x.guionTitulo = m.titulo; } catch (e) {}
      }
      historias.push(x);
    }
    const datos = {
      tipo: "escritorio", version: APP_VERSION, ts: Date.now(), historias, disponible: _disponible,
      capacidad: { proyecto: !!aj.proyecto, claude: !!aj.claude, claudeInstalado: aj.claudeInstalado !== false, claudeError: aj.claudeError || "", blender: !!aj.blender, eleven: !!aj.eleven },
      numeros: l.historias.map(h => parseInt(h.id, 10)).filter(n => !isNaN(n)),
      tarea: t && t.activa ? { id: t.id, titulo: ((l.historias || []).find(h => h.id === t.id) || {}).titulo || "", tipo: t.tipo, etapa: t.etapa, inicio: t.inicio, paso: t.paso, render: t.render, accion: t.accion, acciones: (t.acciones || []).slice(-8) } : null,
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

// ------------------------------------------------------------------ cola compartida (v3.33): /api/pedidos
export async function pedidosApi(metodo, cuerpo) {
  const token = await tokenTrabajo();
  const r = await fetch(YT_BACKEND + "/api/pedidos", {
    method: metodo,
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token, ...(await cabecerasEquipo(metodo, "/api/pedidos")) },
    body: metodo === "GET" ? undefined : JSON.stringify(cuerpo || {}),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.success) throw new Error(j.error || ("Error " + r.status));
  return j;
}

/** Parar todo en ESTE equipo: deja de coger trabajo y para lo que esté haciendo (lo hecho se queda). */
let _parando = 0;
export async function pararTodo() {
  ponerDisponible(false);
  _parando = Date.now();          // lo que se corte ahora no cuenta como fallo: mañana sigue sola
  return SF().historiasPararTodo ? SF().historiasPararTodo() : { ok: true };
}

/** Borra una historia de ESTE equipo (a su papelera) y la quita de la cola compartida para que se pueda volver a pedir. */
export async function borrarHistoria(id) {
  const r = await SF().estudioBorrar(id);
  if (r && r.ok) await pedidosApi("POST", { accion: "borrada", historia_id: id }).catch(() => {});
  return r;
}

/* Disponible para trabajar: al abrir RandomStudio siempre empieza en «disponible»; el botón lo cambia hasta cerrar. */
let _disponible = true;
const _oyentes = new Set();
export const disponible = () => _disponible;
export function ponerDisponible(v) { _disponible = !!v; _oyentes.forEach(f => f(_disponible)); }
export function alCambiarDisponible(f) { _oyentes.add(f); return () => _oyentes.delete(f); }

/* El trabajador: si este escritorio está disponible y libre, coge el siguiente pedido de la cola compartida.
 * Una historia se queda en el equipo que la empieza (sus archivos están ahí); mientras espera tu revisión, el equipo
 * queda libre y coge otro pedido. Los pedidos de este equipo se guardan aquí para seguir su estado aunque se reinicie. */
const K_MIOS = "rs_perfil_pedidos_mios";
const mios = () => { try { return JSON.parse(localStorage.getItem(K_MIOS) || "{}"); } catch (e) { return {}; } };
const guardarMios = (m) => { try { localStorage.setItem(K_MIOS, JSON.stringify(m)); } catch (e) {} };
/* v3.40.4: lo que se paró por el LÍMITE de uso de Claude espera aquí a que se restablezca y luego sigue solo: historias
 * (de la cola o empezadas a mano) y pedidos de ideas. { "h:<historia>": hora, "i:<pedido>": hora } */
const K_LIM = "rs_perfil_limite";
const esperas = () => { try { return JSON.parse(localStorage.getItem(K_LIM) || "{}"); } catch (e) { return {}; } };
const guardarEsperas = (w) => { try { localStorage.setItem(K_LIM, JSON.stringify(w)); } catch (e) {} };
const hora = (ms) => new Date(ms).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

let _trabajador = false;
export function iniciarTrabajador(t) {
  if (t) _toast = t;
  const s = SF();
  if (_trabajador || !s || !s.estudioCrear) return;
  _trabajador = true;
  let ocupadoCogiendo = false, ultimoAviso = {};
  const avisarPedido = (id, estado, extra) => {
    const k = id + estado;
    if (ultimoAviso[k]) return Promise.resolve();
    ultimoAviso[k] = 1;
    return pedidosApi("POST", { accion: "estado", id, estado, ...(extra || {}) }).catch(() => { delete ultimoAviso[k]; });
  };

  // los fallos de una etapa de una historia de la cola
  s.onHistoriasProgreso && s.onHistoriasProgreso((d) => {
    if (d.tipo !== "fin" || d.ok) return;
    if (Date.now() - _parando < 20000) return;
    const m = mios(), p = Object.keys(m).find(k => m[k].historia === d.id);
    if (d.limite) {
      const w = esperas(); w["h:" + d.id] = d.limite; guardarEsperas(w);
      const txt = "Historia " + d.id.slice(0, 2) + " · sigue sola a las " + hora(d.limite);
      if (p) { delete ultimoAviso[p + "trabajando"]; avisarPedido(Number(p), "trabajando", { historia_id: d.id, detalle: "⏸ límite de Claude: sigue a las " + hora(d.limite) }); }
      avisar("⏸ Se acabó el límite de Claude", txt, "l" + d.id);
      toast("⏸ Límite de Claude. " + txt);
      return;
    }
    if (p) { m[p].parada = true; guardarMios(m); }
    if (p) { avisarPedido(Number(p), "fallido", { detalle: "se paró en " + (d.etapa || "una etapa") }); avisar("⚠️ Una historia se paró", "Historia " + d.id.slice(0, 2) + " (" + d.id.slice(3).replace(/_/g, " ") + ") · " + (d.etapa || "una etapa"), "f" + d.id); }
  });
  s.onEstudioIdeas && s.onEstudioIdeas((d) => {
    const m = mios(), p = Object.keys(m).find(k => m[k].tipo === "ideas" && !m[k].fin);
    if (p && !d.ok && d.limite) {
      const w = esperas(); w["i:" + p] = d.limite; guardarEsperas(w);
      delete ultimoAviso[p + "trabajando"];
      avisarPedido(Number(p), "trabajando", { detalle: "⏸ límite de Claude: sigue a las " + hora(d.limite) });
      avisar("⏸ Se acabó el límite de Claude", "Las ideas siguen solas a las " + hora(d.limite), "li" + p);
      return;
    }
    if (p) { m[p].fin = true; guardarMios(m); avisarPedido(Number(p), d.ok ? "hecho" : "fallido", { detalle: d.ok ? d.n + " ideas nuevas" : d.error }); }
  });

  const vuelta = async () => {
    if (!navigator.onLine || ocupadoCogiendo) return;
    let aj, t, l;
    try { [aj, t, l] = await Promise.all([s.estudioAjustes(), s.historiasTareaEstado(), s.historiasLista()]); } catch (e) { return; }
    const m = mios(), w = esperas();
    // 0) lo que esperaba al límite de Claude: a su hora, sigue (de uno en uno, y solo si estoy disponible y libre)
    const vencida = Object.keys(w).find(k => w[k] <= Date.now());
    if (vencida && _disponible && !(t && t.activa)) {
      delete w[vencida]; guardarEsperas(w);
      const id = vencida.slice(2);
      try {
        if (vencida[0] === "h" && (l.historias || []).some(h => h.id === id)) {
          const pid = Object.keys(m).find(k => m[k].historia === id);
          if (pid) delete ultimoAviso[pid + "trabajando"];
          await s.estudioAvanzar(id);
          toast("▶ Límite de Claude restablecido: sigo con la historia " + id.slice(0, 2));
          avisar("▶ Límite restablecido", "Sigo con la historia " + id.slice(0, 2), "l" + id);
        } else if (vencida[0] === "i" && m[id] && !m[id].fin) {
          delete ultimoAviso[id + "trabajando"];
          await s.estudioIdeasGenerar(Number(m[id].n) || 5, String(m[id].pista || ""));
          avisarPedido(Number(id), "trabajando", { detalle: "pensando ideas" });
        }
      } catch (e) {}
      return;
    }
    // 1) seguir el estado de mis pedidos
    for (const [pid, x] of Object.entries(m)) {
      if (x.tipo !== "historia" || !x.historia || x.fin) continue;
      const h = (l.historias || []).find(y => y.id === x.historia);
      if (!h) continue;
      const et = h.etapas || [];
      if (h.entregada || (et.length && et.every(e => e.estado === "hecho"))) { x.fin = true; avisarPedido(Number(pid), "hecho", { historia_id: h.id, detalle: "Short entregado" }); }
      else if (et.some(e => e.estado === "revisar")) { delete ultimoAviso[pid + "trabajando"]; avisarPedido(Number(pid), "revision", { historia_id: h.id, detalle: "te toca revisar: " + ({ guion: "el guion", voces: "las voces", animatic: "el animatic" }[(et.find(e => e.estado === "revisar") || {}).id] || "una etapa") }); }
      else if (t && t.activa && t.id === h.id) { x.parada = false; x.quieta = 0; delete ultimoAviso[pid + "revision"]; avisarPedido(Number(pid), "trabajando", { historia_id: h.id, detalle: t.etapa || "" }); }
      // v3.38.2: se quedó a medias (equipo apagado o «Parar todo»): al volver a estar disponible y libre, sigue sola
      // (solo si lleva quieta dos vueltas seguidas, para no pisar el paso de una etapa a la siguiente, y nunca si falló)
      else if (_disponible && !(t && t.activa) && !x.reanudada && !x.parada && !w["h:" + h.id] && et.some(e => e.estado === "pendiente") && (x.quieta = (x.quieta || 0) + 1) >= 3) {
        x.reanudada = Date.now(); x.quieta = 0;
        try { await s.estudioAvanzar(h.id); if (toast) toast("▶ Sigo con la historia " + h.id.slice(0, 2) + " donde se quedó"); } catch (e) {}
        break;
      }
      else if (t && t.activa) x.reanudada = 0;
    }
    guardarMios(m);
    // 2) coger trabajo nuevo: solo si estoy disponible, libre y preparado
    if (!_disponible || (t && t.activa) || !aj.proyecto || !aj.claude) return;
    const tipos = aj.blender ? ["historia", "ideas"] : ["ideas"];
    ocupadoCogiendo = true;
    try {
      const r = await pedidosApi("POST", { accion: "reclamar", tipos });
      const p = r.pedido;
      if (!p) return;
      if (p.tipo === "historia") {
        const idea = (p.args && p.args.idea) || { titulo: p.titulo };
        const c = await s.estudioCrear("p" + p.id, { nn: p.numero, idea });
        if (!c || c.ok === false) {
          // si justo empezó otra cosa aquí, el pedido vuelve a la cola para otro equipo (o para este, al quedar libre)
          await pedidosApi("POST", { accion: "estado", id: p.id, estado: "fallido", detalle: (c && c.error) || "no se pudo crear" });
          if (/en marcha/.test((c && c.error) || "")) await pedidosApi("POST", { accion: "reintentar", id: p.id }).catch(() => {});
          return;
        }
        m[p.id] = { tipo: "historia", historia: c.id }; guardarMios(m);
        await pedidosApi("POST", { accion: "estado", id: p.id, estado: "trabajando", historia_id: c.id, detalle: "guion" });
        if (toast) toast("📥 Pedido de la cola: «" + (p.titulo || c.id) + "» (historia " + c.id.slice(0, 2) + ")");
      } else {
        const g = await s.estudioIdeasGenerar(Number(p.args && p.args.n) || 5, String((p.args && p.args.pista) || ""));
        if (g && g.ok === false) { await pedidosApi("POST", { accion: "estado", id: p.id, estado: "fallido", detalle: g.error }); return; }
        m[p.id] = { tipo: "ideas", n: Number(p.args && p.args.n) || 5, pista: String((p.args && p.args.pista) || "") }; guardarMios(m);
        await pedidosApi("POST", { accion: "estado", id: p.id, estado: "trabajando", detalle: "pensando ideas" });
      }
    } catch (e) {} finally { ocupadoCogiendo = false; }
  };
  // v3.38.1: numeración seguida: si se borró una historia, las de este equipo que van detrás se renumeran (cada 30 s,
  // nunca la que está trabajando)
  let ultimaNumeracion = 0;
  const renumerar = async () => {
    if (Date.now() - ultimaNumeracion < 30000 || !s.estudioRenumerar) return;
    ultimaNumeracion = Date.now();
    try {
      const r = await pedidosApi("POST", { accion: "numeracion" });
      for (const c of (r.cambios || [])) {
        const x = await s.estudioRenumerar(c.de, c.a);
        if (x && x.ok) {
          await pedidosApi("POST", { accion: "renombrada", id: c.pedido, a: c.a }).catch(() => {});
          const m = mios(); if (m[c.pedido]) { m[c.pedido].historia = c.a; guardarMios(m); }
          if (toast) toast("🔢 Historia " + c.de.slice(0, 2) + " → " + c.a.slice(0, 2));
        }
      }
    } catch (e) {}
  };
  setInterval(renumerar, 10000);
  // que el número global de historia nunca vaya por detrás de las hechas A MANO que existen aquí (las del estudio las
  // numera el servidor, y así no vuelve a subir el contador después de borrar una)
  s.historiasLista().then(l => {
    const max = Math.max(0, ...((l && l.historias) || []).filter(h => h.legado).map(h => parseInt(h.id, 10)).filter(n => !isNaN(n)));
    if (max) pedidosApi("POST", { accion: "contador", minimo: max }).catch(() => {});
  }).catch(() => {});
  vuelta();
  setInterval(vuelta, 6000);
}
