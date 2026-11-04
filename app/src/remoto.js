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
import { alTimbre, fijarTimbre } from "./timbre";
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
  if (j.timbre) fijarTimbre(j.timbre);
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
    case "borrar": return Array.isArray(a.ids) ? borrarVarias(a.ids.map(String).filter(x => /^\d{2}_[\w-]+$/.test(x)).slice(0, 200)) : borrarHistoria(a.id);
    case "parar_todo": return pararTodo();
    case "reanudar_todo": return reanudarTodo();
    case "drive_subir": return s.estudioDriveSubir(a.id, await driveTokenTrabajo(), perfilDrive(), a.que || "short");
    case "ajustes": return s.estudioAjustes(a.nuevos || {});
    case "instalar_git": return s.instalarGit ? s.instalarGit() : { ok: false, error: "Este equipo necesita la versión nueva de RandomStudio" };
    case "instalar_cuda": return s.instalarCuda ? s.instalarCuda() : { ok: false, error: "Este equipo necesita la versión nueva de RandomStudio" };
    case "pasar": return pasarHistoria(String(a.id || ""), String(a.a || ""));
  }
  throw new Error("Orden desconocida");
}

let _iniciado = false;
/* v3.40.1: arrancan al abrir la app (main.jsx), antes de elegir perfil, y siguen igual al cambiar de perfil. Los avisos en
 * pantalla (toast) llegan cuando la ventana principal se monta y se los pasa. */
let _toast = null, _base = null, _kitVivo = null, _kitPropio = null, _basePendiente = null, _instalarBase = null;
// 3-11: el kit compartido al momento (ver kitcompartido.cjs): lo que este equipo tiene del kit, en una huella corta que va
// en el timbre; los demás, al oírla distinta, se ponen al día en segundos. _kitPendiente: llegaron cambios con una tarea en
// marcha: se aplican en el primer hueco.
let _kitPendiente = false, _otros = [], _igualarAhora = null;
const miKitHuella = () => ((_kitVivo && _kitVivo.huella) || "") + "/" + ((_kitPropio && _kitPropio.huella) || "");
const anotar = (ambito, texto, datos) => { try { const s = SF(); if (s && s.registro) s.registro(ambito, texto, datos); } catch (e) {} };
// (v3.42.1) el último fallo se guarda: antes vivía en memoria y se perdía al reiniciar la app
const K_FALLO = "rs_perfil_ultimo_fallo";
let _ultimoFallo = (() => { try { return JSON.parse(localStorage.getItem(K_FALLO) || "null"); } catch (e) { return null; } })();
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
      // (v3.43.3) también si la de Drive es más vieja que la del disco (tras pedir cambios), y el animatic de TODAS las
      // historias aunque no esté en revisión: así se ve dentro de la app desde cualquier equipo y desde el móvil
      const vieja = (h, q) => { const d = (h.driveRevision || {})[q]; return !d || !!(h.revMs && h.revMs[q] && Date.parse(d.fecha) < h.revMs[q]); };
      const rev = !pend && l.historias.map(h => ({ h, e: (h.etapas || []).find(x => x.estado === "revisar" && (x.id === "voces" || x.id === "animatic")) }))
        .find(x => x.e && vieja(x.h, x.e.id));
      const anim = !pend && !rev && l.historias.find(h => h.revMs && h.revMs.animatic && vieja(h, "animatic"));
      const tarea = pend || (rev && { h: rev.h, que: rev.e.id }) || (anim && { h: anim, que: "animatic" });
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
    // v3.45.6: con una versión nueva, las historias paradas se vuelven a intentar (una vez): suele traer el arreglo
    try {
      if (localStorage.getItem("rs_perfil_version_paradas") !== APP_VERSION) {
        const m = mios(); for (const x of Object.values(m)) if (x.parada) { x.parada = false; x.fallos = 0; x.reintentar = 0; } guardarMios(m);
        localStorage.setItem("rs_perfil_version_paradas", APP_VERSION);
      }
    } catch (e) {}
    // v3.45.3: si el rescate del kit recuperó algo, las historias paradas se vuelven a intentar (una vez por rescate)
    const rk = aj.rescateKit;
    if (rk && (rk.restaurados || []).length) {
      let visto = ""; try { visto = localStorage.getItem("rs_perfil_rescate_kit_visto") || ""; } catch (e) {}
      if (visto !== rk.fecha) {
        const m = mios(); for (const x of Object.values(m)) if (x.parada) { x.parada = false; x.fallos = 0; x.reintentar = 0; } guardarMios(m);
        try { localStorage.setItem("rs_perfil_rescate_kit_visto", rk.fecha); } catch (e) {}
        toast("🧰 Recuperado del kit: " + rk.restaurados.map(r => r.nombre + ".py").join(", ") + ". Las historias paradas siguen solas");
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
      tipo: "escritorio", version: APP_VERSION, ts: Date.now(), historias, disponible: _disponible,
      capacidad: { proyecto: !!aj.proyecto, claude: !!aj.claude, claudeInstalado: aj.claudeInstalado !== false, claudeError: aj.claudeError || "", blender: !!aj.blender, eleven: !!aj.eleven,
        // v3.41: la salud del equipo (la pestaña «Equipos» dice qué le falta a cada uno y cómo arreglarlo)
        bash: aj.bash !== false, disco: aj.disco || null, elevenError: aj.elevenError || "", gpu: aj.gpu || null, whisper: aj.whisper || null, drive: driveConectadoTrabajo(), kit: aj.kit || null, rescateKit: aj.rescateKit || null, esperandoLimite: Object.keys(esperas()).length },
      numeros: l.historias.map(h => parseInt(h.id, 10)).filter(n => !isNaN(n)),
      ligeras: ((t && t.ligeras) || []).map(x => ({ id: x.id, titulo: ((l.historias || []).find(h => h.id === x.id) || {}).titulo || "", etapa: x.etapa, inicio: x.inicio, accion: x.accion })),
      fondo: t && t.fondo ? { id: t.fondo.id, titulo: ((l.historias || []).find(h => h.id === t.fondo.id) || {}).titulo || "", etapa: t.fondo.etapa, inicio: t.fondo.inicio, render: t.fondo.render } : null,
      tarea: t && t.activa ? { id: t.id, titulo: ((l.historias || []).find(h => h.id === t.id) || {}).titulo || "", tipo: t.tipo, etapa: t.etapa, inicio: t.inicio, paso: t.paso, render: t.render, accion: t.accion, acciones: (t.acciones || []).slice(-8), ultimas: (t.lineas || []).slice(-8).map(x => String(x).slice(0, 220)) } : null,
      ajustes: aj.ajustes,
      ideas: (id.ideas || []).filter(i => i.estado !== "descartada").slice(0, 30).map(i => ({ id: i.id, titulo: i.titulo, regla: i.regla, resumen: i.resumen, estado: i.estado, temporada: i.temporada, historia: i.historia })),
      generandoIdeas: !!id.generando,
      // v3.40.6: el uso de Claude de este equipo (lo ve el móvil en su marcador); se lee como mucho cada 10 min
      claudeUso: s.claudeUso ? await s.claudeUso(false).catch(() => null) : null,
      // v3.41.3: la base que sube el portátil (los demás la bajan) y el último fallo de este equipo (se ve en «Equipos»)
      base: _base, kitVivo: _kitVivo, ultimoFallo: _ultimoFallo,
      // v3.45.4: los módulos del kit creados en este equipo (los demás bajan los que les falten); 3-11: todo el kit compartido
      kitPropio: _kitPropio && _kitPropio.archivo ? _kitPropio : null, kitHuella: miKitHuella(),
    };
    const r = await remotoApi("POST", { accion: "publicar", datos }).catch(() => null);
    if (r) { _otros = r.otros || []; vigilarOtros(_otros); igualarBase(_otros, t).catch(() => {}); }
    if (aj.origen) bajarEntregas().catch(() => {});
  };
  // v3.43.3: el portátil guarda TODAS las historias terminadas en Vídeos RDR\Editados\RandomHistorias\<TÍTULO>\: las que
  // termina otro equipo (y sube a Drive) las baja de allí. Se mira cada 2 min, de una en una.
  let bajando = false, bajadaMirada = 0;
  const fallosBajada = {};                 // (el aviso de un fallo, una vez por Short)
  const bajarEntregas = async () => {
    if (bajando || !s.estudioEntregaBajar || !driveConectadoTrabajo() || Date.now() - bajadaMirada < 120000) return;
    bajadaMirada = Date.now(); bajando = true;
    try {
      const r = await remotoApi("GET");
      for (const eq of r.equipos || []) {
        if (eq.id === r.yo) continue;
        for (const h of (eq.datos && eq.datos.historias) || []) {
          if (!h.entregada || !h.drive || !(h.drive.archivos || []).length) continue;
          const x = await s.estudioEntregaBajar(await driveTokenTrabajo(), h.drive);
          if (x && x.bajado) toast("⬇ «" + (h.titulo || h.id) + "» (de " + eq.nombre + ") ya está en Editados\\RandomHistorias");
          else if (x && !x.ok && !fallosBajada[h.drive.carpeta]) { fallosBajada[h.drive.carpeta] = 1; toast("❌ No pude bajar «" + (h.titulo || h.id) + "» de Drive: " + (x.error || "")); }
        }
      }
    } finally { bajando = false; }
  };
  // v3.41.3: los recursos del proyecto, iguales en todos los equipos (el portátil los sube a Drive si cambian; los demás
  // los bajan cuando su huella no coincide y están libres). Con la base nueva, las historias paradas se vuelven a intentar.
  let baseOcupada = false, baseMirada = 0;
  // v3.42: dos paquetes: «base» (recursos fijos, ~45 MB, casi nunca cambia) y «kit» (kit vivo, ~1 MB, cambia a menudo)
  const instalarPaquetes = async (pendientes) => {
    let alguno = false;
    for (const { cual, o } of pendientes) {
      toast((cual === "kit" ? "🧰 Pongo al día el kit (del " : "📦 Bajo los recursos del proyecto (del ") + o.nombre + ")…");
      const r = await s.baseInstalar(await driveTokenTrabajo(), o[cual === "kit" ? "kitVivo" : "base"], cual);
      if (!r || !r.ok) { toast("❌ No pude bajar " + (cual === "kit" ? "el kit" : "los recursos") + ": " + ((r && r.error) || "")); continue; }
      alguno = true;
    }
    if (alguno) { const m = mios(); for (const x of Object.values(m)) if (x.parada) { x.parada = false; x.fallos = 0; x.reintentar = 0; } guardarMios(m); toast("✅ Este equipo trabaja ya con lo mismo que el portátil"); }
    return alguno;
  };
  _instalarBase = async () => {            // (lo llama el trabajador entre etapas)
    if (baseOcupada) return false;
    const pb = _basePendiente; _basePendiente = null; baseOcupada = true;
    try {
      let alguno = false;
      if (_kitPendiente) { _kitPendiente = false; await cambiarKitPropio().catch(() => {}); alguno = true; }   // (3-11) los cambios del kit que esperaban
      if (pb) alguno = (await instalarPaquetes(pb)) || alguno;
      return alguno;
    } catch (e) { return false; } finally { baseOcupada = false; }
  };
  // v3.45.4 KIT PROPIO (ver kit-propio-* en historias.cjs): subir los módulos del kit creados aquí y bajar los de los demás
  const cambiarKitPropio = async () => {
    if (!s.kitPropioSubir) return;
    const tk = await driveTokenTrabajo();
    const up = await s.kitPropioSubir(tk, _kitPropio);
    if (up && up.ok) _kitPropio = up.nada ? null : up;
    const g = await remotoApi("GET").catch(() => null);
    if (!g) return;
    let vistos = {}; try { vistos = JSON.parse(localStorage.getItem("rs_perfil_kit_propio_visto") || "{}"); } catch (e) {}
    const puestos = [], conflictos = [];
    for (const e of g.equipos || []) {
      const kp = e.id !== g.yo && e.datos && e.datos.kitPropio;
      if (!kp || !kp.archivo || vistos[e.id] === kp.huella) continue;
      const r = await s.kitPropioRecibir(tk, kp).catch(() => null);
      if (r && r.ok) { vistos[e.id] = kp.huella; puestos.push(...(r.puestos || [])); conflictos.push(...(r.conflictos || [])); }
      else if (r && r.pendiente) { _kitPendiente = true; anotar("kit", "cambios del kit de " + e.nombre + " esperando a que este equipo quede libre"); }
    }
    try { localStorage.setItem("rs_perfil_kit_propio_visto", JSON.stringify(vistos)); } catch (e) {}
    if (puestos.length) {
      const m = mios(); for (const x of Object.values(m)) if (x.parada) { x.parada = false; x.fallos = 0; x.reintentar = 0; } guardarMios(m);
      toast("🧰 Del otro equipo: " + puestos.map(p => p.split("/").pop()).join(", ") + ". Las historias paradas siguen solas");
      publicarPronto();            // (3-11) con lo recibido, la huella cambia: que los demás lo sepan ya
    }
    for (const c of conflictos) if (c.apartado) toast("⚠️ " + c.rel + ": lo cambiaron los dos equipos; se queda el de " + c.gana + " (el de aquí, en " + c.apartado + ")");
  };
  // (3-11) poner el kit al día AHORA (sin esperar a la vuelta de los 3 min): al guardar un archivo del kit aquí, o al oír en
  // el timbre que otro equipo cambió el suyo. Como mucho una vez cada 8 s.
  let igualadoA = 0;
  _igualarAhora = async (motivo) => {
    if (Date.now() - igualadoA < 8000) return;
    igualadoA = Date.now();
    baseMirada = 0;
    let t = null; try { t = await s.historiasTareaEstado(); } catch (e) {}
    anotar("kit", "kit al día ahora (" + motivo + ")");
    await igualarBase(_otros, t).catch(() => {});
    publicarPronto();
  };
  if (s.onKitCambio) s.onKitCambio(() => _igualarAhora("cambió un archivo del kit en este equipo"));
  const igualarBase = async (otros, t) => {
    if (baseOcupada || !s.baseEstado || !driveConectadoTrabajo() || Date.now() - baseMirada < 3 * 60000) return;
    baseMirada = Date.now(); baseOcupada = true;
    try {
      const b = await s.baseEstado();
      if (!b || !b.ok) return;
      await cambiarKitPropio().catch(() => {});
      if (b.origen) {
        _base = b.subida || null; _kitVivo = b.subidaKit || null;
        if (!b.subida || b.subida.huella !== b.huella) { const up = await s.baseSubir(await driveTokenTrabajo(), "base"); if (up && up.ok) _base = up; }
        if (!b.subidaKit || b.subidaKit.huella !== b.huellaKit) { const up = await s.baseSubir(await driveTokenTrabajo(), "kit"); if (up && up.ok) _kitVivo = up; }
        return;
      }
      const pend = [];
      const ob = otros.find(x => x.base && x.base.archivo);
      if (ob && !(b.instalada && b.instalada.huella === ob.base.huella)) pend.push({ cual: "base", o: ob });
      const ok = otros.find(x => x.kitVivo && x.kitVivo.archivo);
      if (ok && !(b.instaladaKit && b.instaladaKit.huella === ok.kitVivo.huella)) pend.push({ cual: "kit", o: ok });
      if (!pend.length) { _basePendiente = null; return; }
      // ocupado ahora: se instala en el primer hueco entre etapas (la vuelta del trabajador)
      if (t && t.activa) { _basePendiente = pend; return; }     // (v3.49.1) con un render de fondo SÍ se instala: cada acto carga el kit al empezar
      await instalarPaquetes(pend);
    } finally { baseOcupada = false; }
  };
  // v3.41: si otro equipo se desconecta a mitad de una historia, aviso (una vez hasta que vuelva); a los 10 min, el
  // primer equipo libre la sigue con su copia de Drive (relevo, en el servidor)
  const caidos = {};
  const vigilarOtros = (otros) => {
    for (const o of otros) {
      if (o.en_linea) { delete caidos[o.id]; continue; }
      if (!o.tarea || caidos[o.id]) continue;
      caidos[o.id] = 1;
      const txt = "Estaba con «" + (o.tarea.titulo || o.tarea.id) + "». Si en 10 min no vuelve, la sigue otro equipo.";
      avisar("⚠️ " + o.nombre + " se ha desconectado", txt, "off" + o.id);
      toast("⚠️ " + o.nombre + " se ha desconectado. " + txt);
    }
  };
  // publicar al momento lo que cambia aquí (sin esperar a la siguiente vuelta)
  let pronto = null;
  const publicarPronto = () => { clearTimeout(pronto); pronto = setTimeout(publicar, 1500); };
  s.onHistoriasProgreso && s.onHistoriasProgreso((d) => { if (["fin", "terminado", "espera", "driveListo"].includes(d.tipo)) publicarPronto(); });
  alCambiarDisponible(publicarPronto);

  const recoger = async () => {
    if (!navigator.onLine) return;
    let r; try { r = await remotoApi("POST", { accion: "recoger" }); } catch (e) { return; }
    for (const o of r.ordenes || []) {
      let ok = true, txt = "";
      try { const x = await ejecutar(o); if (x && x.ok === false) { ok = false; txt = x.error || ""; } }
      catch (e) { ok = false; txt = e.message || String(e); }
      if (toast) toast(`📱 Orden de ${o.de || "otro equipo"}: ${o.que}${ok ? "" : " (no se pudo: " + txt + ")"}`);
      anotar("orden", "orden «" + o.que + "» de " + (o.de || "otro equipo") + (ok ? ": hecha" : ": NO se pudo (" + txt + ")"), o.args || null);
      await remotoApi("POST", { accion: "resultado", id: o.id, ok, resultado: txt }).catch(() => {});
      setTimeout(publicar, 500);
    }
  };

  publicar(); recoger();
  // v3.41: con el timbre, las órdenes llegan al instante; las vueltas de siempre quedan de respaldo, más espaciadas
  const kitOido = {};
  alTimbre((d) => {
    if (d.que === "orden") recoger();
    // (3-11) otro equipo publica con otra huella del kit: me pongo al día al momento
    if (d.que === "estado" && d.kit && d.de && kitOido[d.de] !== d.kit) { const primera = !(d.de in kitOido); kitOido[d.de] = d.kit; if (!primera && d.kit !== miKitHuella() && _igualarAhora) _igualarAhora("el timbre dice que " + String(d.de).slice(0, 8) + " cambió su kit"); }
  });
  setInterval(publicar, 20000);
  setInterval(recoger, 20000);
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
  if (j.timbre) fijarTimbre(j.timbre);
  return j;
}

/** Parar todo en ESTE equipo: deja de coger trabajo y para lo que esté haciendo (lo hecho se queda).
 * v3.43.1: la parada se RECUERDA (también si el equipo se reinicia o se actualiza) hasta pulsar «Reanudar todo»: antes, al
 * reabrir RandomStudio volvía a estar disponible solo y seguía gastando tokens por la noche. */
let _parando = 0;
// (v3.45.8) con «rs_perfil_» delante es de todo el equipo: sin él se guardaba por perfil pero se leía al arrancar, antes de
// entrar en el perfil, y el ordenador arrancaba siempre «Parado» tras actualizarse
const K_PARADO = "rs_perfil_equipo_parado";
const leerParado = () => { try { return localStorage.getItem(K_PARADO) === "1"; } catch (e) { return false; } };
export function guardarParado(v) { try { if (v) localStorage.setItem(K_PARADO, "1"); else localStorage.removeItem(K_PARADO); } catch (e) {} }
export async function pararTodo() {
  anotar("equipo", "PARADO: este equipo deja de coger trabajo");
  guardarParado(true);
  ponerDisponible(false);
  _parando = Date.now();          // lo que se corte ahora no cuenta como fallo: mañana sigue sola
  return SF() && SF().historiasPararTodo ? SF().historiasPararTodo() : { ok: true };
}
/** Reanudar todo en ESTE equipo: vuelve a coger trabajo y sigue las historias por donde se quedaron. */
export async function reanudarTodo() {
  anotar("equipo", "REANUDADO: este equipo vuelve a coger trabajo");
  guardarParado(false);
  try { if (SF() && SF().historiasPausarEncadenado) await SF().historiasPausarEncadenado(false); } catch (e) {}
  ponerDisponible(true);
  return { ok: true };
}
/** Parar o reanudar TODOS los equipos: este directamente y los demás (en línea) con una orden. Devuelve cuántos otros. */
export async function enTodosLosEquipos(que) {
  if (window.studioFS) await (que === "parar_todo" ? pararTodo() : reanudarTodo());
  let otros = 0;
  try {
    const r = await remotoApi("GET");
    for (const e of (r.equipos || [])) {
      if (!e.en_linea || e.id === r.yo || !(e.datos && e.datos.historias)) continue;
      try { await remotoApi("POST", { accion: "orden", para: e.id, que, args: {} }); otros++; } catch (x) {}
    }
  } catch (x) {}
  return otros;
}

/** Borra una historia de ESTE equipo (a su papelera) y la quita de la cola compartida para que se pueda volver a pedir. */
export async function borrarHistoria(id) {
  // 3-11: una TERMINADA (su Short ya está en Editados o en Drive) se borra del todo para liberar espacio, y SIN renumerar
  // las demás (su número ya se usó); las que están a medias van a la papelera y se renumeran, como siempre
  try {
    const l = await SF().historiasLista();
    const h = l && (l.historias || []).find(x => x.id === id);
    if (h && h.entregada && SF().estudioBorrarTerminada) return await SF().estudioBorrarTerminada(id);
  } catch (e) {}
  const r = await SF().estudioBorrar(id);
  if (r && r.ok) await pedidosApi("POST", { accion: "borrada", historia_id: id }).catch(() => {});
  anotar("historias", (r && r.ok ? "borrada (a la papelera) " : "NO se pudo borrar ") + id + (r && r.error ? ": " + r.error : ""));
  return r;
}
/** Varias de una vez (la orden «borrar» con ids: una sola orden por equipo, sin llegar al límite de órdenes por minuto). */
export async function borrarVarias(ids) {
  let hechas = 0, liberado = 0; const fallos = [];
  for (const id of ids) {
    const r = await borrarHistoria(id).catch(e => ({ ok: false, error: e.message }));
    if (r && r.ok) { hechas++; liberado += r.liberado || 0; } else fallos.push(id + ": " + ((r && r.error) || "?"));
  }
  return { ok: !fallos.length, hechas, liberado, error: fallos.join(" · ") };
}

/* Disponible para trabajar: al abrir RandomStudio empieza en «disponible», salvo que se dejara PARADO (v3.43.1). */
let _disponible = !leerParado();
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

/* v3.41.2 REPARTO: el ordenador prepara (guion y voces) y el portátil anima (escena, animatic, render, montaje).
 * v3.41.7: el ordenador prepara TODAS las suyas antes de animar ninguna; cada preparada se ofrece al portátil. */
let _soyDueno = false;
const BLENDER = ["escena", "animatic", "render", "montaje"];
// (v3.50) lo que Claude hace sin Roblox Studio va en paralelo (una por historia, sin límite): no espera a que el equipo quede libre
const LIGERAS = ["guion", "voces", "escribir"];
const ETAPA_TXT = { guion: "guion", voces: "voces y efectos", escribir: "escribir la escena", escena: "escena 3D", animatic: "animatic", render: "render", montaje: "montaje" };
/** Historia preparada en este equipo: si el servidor dice que el portátil puede animarla, se sube su copia y se le pasa. */
async function pasarAlPortatil(pid, id, para) {
  const s = SF();
  // v3.45.11: cada paso queda escrito en el pedido (se ve en la cola y desde el otro equipo): antes, si algo fallaba, la
  // historia se quedaba «esperando» sin que nadie supiera por qué
  const nota = (det) => pedidosApi("POST", { accion: "estado", id: Number(pid), estado: "trabajando", detalle: "➡️ pasar al otro equipo: " + det }).catch(() => {});
  const c = await pedidosApi("POST", { accion: "fase_blender", id: Number(pid), consulta: true, ...(para ? { para } : {}) });
  if (!c.pasar) { if (para) await nota("el otro equipo no está en línea o no tiene Roblox Studio/Drive"); return { traspasado: false }; }
  if (!s.estudioRelevoPreparar || !driveConectadoTrabajo()) { await nota("este equipo no tiene Drive conectado"); return { traspasado: false }; }
  // v3.45.10: la copia que ya está en Drive (se sube tras cada etapa) sirve si la historia no ha cambiado desde entonces:
  // el otro equipo la coge AL MOMENTO, sin volver a empaquetar y subir ~120 MB (él: "¿por qué no detectan los dos equipos
  // los archivos del Drive?")
  try {
    const g = await pedidosApi("GET");
    const ped = (g.pedidos || []).find(x => Number(x.id) === Number(pid));
    const rv = ped && ped.args && ped.args.relevo;
    if (!para && rv && rv.archivo && rv.fecha && s.estudioCambiadoDesde && ["escribir", "escena", "animatic"].includes(rv.etapa)) {
      const ch = await s.estudioCambiadoDesde(id, rv.fecha);
      if (ch && ch.ok && !ch.cambiado) { await nota("uso la copia que ya está en Drive"); return pedidosApi("POST", { accion: "fase_blender", id: Number(pid), relevo: { archivo: rv.archivo, md5: rv.md5, tam: rv.tam } }); }
      if (ch && ch.ok) await nota("la copia de Drive es anterior a " + (ch.archivo || "un cambio") + ": preparo otra");
    }
  } catch (e) {}
  await nota("empaquetando la copia…");
  const pr = await s.estudioRelevoPreparar(id, !!para);
  if (!pr || !pr.ok) { await nota("no se pudo empaquetar: " + ((pr && pr.error) || "?")); return { traspasado: false }; }
  await nota("subiendo la copia a Drive…");
  const up = await s.estudioRelevoSubir(id, await driveTokenTrabajo());
  if (!up || !up.ok) { await nota("no se pudo subir a Drive: " + ((up && up.error) || "?")); return { traspasado: false }; }
  const f = await pedidosApi("POST", { accion: "fase_blender", id: Number(pid), relevo: { archivo: up.archivo, md5: up.md5, tam: up.tam }, ...(para ? { para } : {}) });
  if (!f || !f.traspasado) await nota("el servidor no la dejó pasar: " + ((f && (f.error || (f.pasar === false ? "el otro equipo ya no está disponible" : ""))) || "?"));
  return f;
}

/* (3/11) «Seguir en…»: él elige en qué equipo sigue una historia (p. ej. el render de la 17 en el portátil). Lo ejecuta el
 * equipo que la lleva: para lo que esté haciendo con ella, sube su copia (con los planos ya renderizados) y la deja para
 * ese equipo, que la coge en cuanto quede libre. */
export async function pasarHistoria(hid, destino) {
  const s = SF(), m = mios();
  if (!/^\d{2}_[\w-]+$/.test(hid) || !destino) return { ok: false, error: "Faltan datos" };
  const pid = Object.keys(m).find(k => m[k].historia === hid && !m[k].fin && !m[k].traspasada);
  if (!pid) return { ok: false, error: "Esa historia no la lleva este equipo" };
  const t = s.historiasTareaEstado ? await s.historiasTareaEstado() : null;
  if (t && t.activa && t.id === hid) {
    _parando = Date.now();                 // (no cuenta como fallo)
    await s.historiasCancelar(hid);
    for (let i = 0; i < 30; i++) { await new Promise(r => setTimeout(r, 1000)); const t2 = await s.historiasTareaEstado(); if (!(t2 && t2.activa)) break; }
  }
  m[pid].ofrecida = Date.now(); m[pid].pausada = Date.now(); guardarMios(m);
  const r = await pasarAlPortatil(pid, hid, destino).catch(e => ({ error: e.message || String(e) }));
  if (r && r.traspasado) {
    const m2 = mios(); if (m2[pid]) { m2[pid].traspasada = true; guardarMios(m2); }
    anotar("relevo", "historia " + hid + " pasada a mano al equipo " + String(destino).slice(0, 8));
    toast("➡️ Historia " + hid.slice(0, 2) + ": pasa al otro equipo");
    return { ok: true };
  }
  const m3 = mios(); if (m3[pid]) { delete m3[pid].pausada; guardarMios(m3); }     // (no se pudo: sigue aquí)
  return { ok: false, error: (r && r.error) || "No se pudo pasar: mira el detalle del pedido" };
}

let _trabajador = false;
export function iniciarTrabajador(t) {
  if (t) _toast = t;
  const s = SF();
  if (_trabajador || !s || !s.estudioCrear) return;
  _trabajador = true;
  let ocupadoCogiendo = false, ultimoAviso = {};
  const detalles = {};
  const avisarDetalle = (pid, det) => {
    if (detalles[pid] === det) return;
    detalles[pid] = det;
    pedidosApi("POST", { accion: "estado", id: Number(pid), estado: "trabajando", detalle: det }).catch(() => { delete detalles[pid]; });
  };
  const avisarPedido = (id, estado, extra) => {
    const k = id + estado + (estado === "trabajando" && extra && extra.detalle ? ":" + extra.detalle : "");   // (v3.41.9) el detalle cuenta
    if (ultimoAviso[k]) return Promise.resolve();
    ultimoAviso[k] = 1;
    return pedidosApi("POST", { accion: "estado", id, estado, ...(extra || {}) }).catch(() => { delete ultimoAviso[k]; });
  };

  // los fallos de una etapa de una historia de la cola
  s.onHistoriasProgreso && s.onHistoriasProgreso((d) => {
    if (d.tipo !== "fin" || d.bloqueada) return;       // (bloqueada: la etapa ni empezó, p. ej. clave de ElevenLabs mala)
    const m = mios(), p = Object.keys(m).find(k => m[k].historia === d.id);
    if (d.ok) { if (p && m[p].fallos) { m[p].fallos = 0; guardarMios(m); } return; }
    // parada a mano (botón «Parar» o «Parar todo»): no se reintenta hasta que la sigas tú
    if (d.cancelada || Date.now() - _parando < 20000) { if (p) { m[p].pausada = Date.now(); guardarMios(m); } return; }
    // v3.41.3: el porqué del último fallo, a la vista en «Equipos» (antes había que adivinarlo)
    _ultimoFallo = { id: d.id, etapa: d.etapa || "", texto: String(d.informe || "").slice(-1500), fecha: Date.now() };
    anotar("historias", "fallo apuntado en " + (d.etapa || "") + " de " + d.id + " (se reintenta sola)", { informe: String(d.informe || "").slice(-300) });
    try { localStorage.setItem(K_FALLO, JSON.stringify(_ultimoFallo)); } catch (e) {}
    if (d.limite) {
      const w = esperas(); w["h:" + d.id] = d.limite; guardarEsperas(w);
      const txt = "Historia " + d.id.slice(0, 2) + " · sigue sola a las " + hora(d.limite);
      if (p) { delete ultimoAviso[p + "trabajando"]; avisarPedido(Number(p), "trabajando", { historia_id: d.id, detalle: "⏸ límite de Claude: sigue a las " + hora(d.limite) }); }
      avisar("⏸ Se acabó el límite de Claude", txt, "l" + d.id);
      toast("⏸ Límite de Claude. " + txt);
      return;
    }
    // v3.41.2: un fallo se reintenta solo a los 2 min, hasta 3 veces (muchos «fallos» eran la app reiniciándose al
    // actualizar, y esas historias se quedaban paradas para siempre)
    if (p) {
      const x = m[p];
      x.fallos = (x.fallos || 0) + 1; x.reintentar = Date.now() + 2 * 60000; x.parada = x.fallos >= 3; guardarMios(m);
      delete ultimoAviso[p + "trabajando"]; delete ultimoAviso[p + "fallido"];
      if (x.parada) {
        avisarPedido(Number(p), "fallido", { detalle: "se paró en " + (d.etapa || "una etapa") + " (3 intentos)" });
        avisar("⚠️ Una historia se paró", "Historia " + d.id.slice(0, 2) + " (" + d.id.slice(3).replace(/_/g, " ") + ") · " + (d.etapa || "una etapa") + " · 3 intentos", "f" + d.id);
      } else avisarPedido(Number(p), "trabajando", { historia_id: d.id, detalle: "falló " + (d.etapa || "una etapa") + ": lo reintento en 2 min (" + x.fallos + "/3)" });
    }
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
  // v3.41 RELEVO: al terminar cada etapa, el motor prepara una copia de la historia y aquí se sube a Drive; si este equipo
  // se apaga, otro la sigue desde ahí. Solo las historias de la cola, y si este equipo tiene Drive conectado.
  s.onHistoriasProgreso && s.onHistoriasProgreso(async (d) => {
    if (d.tipo !== "relevo" || !s.estudioRelevoSubir || !driveConectadoTrabajo()) return;
    const m = mios(), p = Object.keys(m).find(k => m[k].historia === d.id && !m[k].fin);
    if (!p) return;
    try {
      const r = await s.estudioRelevoSubir(d.id, await driveTokenTrabajo());
      if (r && r.ok) {
        await pedidosApi("POST", { accion: "relevo", id: Number(p), relevo: { archivo: r.archivo, md5: r.md5, tam: r.tam, etapa: d.etapa } });
        const m2 = mios(); if (m2[p]) { m2[p].relevo = r.archivo; guardarMios(m2); }
      }
    } catch (e) {}
  });
  // v3.41: ¿alguna historia de este equipo la siguió otro mientras este estaba apagado? Entonces aquí se aparta (no se
  // borra: va a historias/_relevadas) y no se reanuda. Hasta comprobarlo, este equipo no reanuda nada.
  let revisadoRelevo = false;
  const comprobarRelevos = async () => {
    try {
      const r = await pedidosApi("GET");
      _soyDueno = ((r.equipos || []).find(e => e.id === r.yo) || {}).rol === "dueno";
      const m = mios(); let cambio = false;
      for (const [pid, x] of Object.entries(m)) {
        if (x.tipo !== "historia" || x.fin) continue;
        const ped = (r.pedidos || []).find(q => String(q.id) === String(pid));
        if (!ped || !ped.equipo || ped.equipo === r.yo) continue;
        // v3.41.2: la que pasó al portátil ya la está animando él: aquí se aparta sin avisar (es lo previsto)
        if (x.traspasada) { x.fin = true; cambio = true; if (s.estudioRelevada) await s.estudioRelevada(x.historia).catch(() => {}); continue; }
        x.fin = true; x.relevada = true; cambio = true;
        if (s.estudioRelevada) await s.estudioRelevada(x.historia).catch(() => {});
        toast("🔁 La historia " + String(x.historia).slice(0, 2) + " la siguió otro equipo mientras este estaba apagado");
      }
      // v3.41.3: historias que el servidor da a este equipo pero que aquí no estaban apuntadas (p. ej. un pedido cancelado
      // por repetido y reactivado): se adoptan, para seguirlas, reintentarlas y darlas por hechas como las demás
      const locales = ((await s.historiasLista().catch(() => null)) || {}).historias || [];
      for (const ped of (r.pedidos || [])) {
        if (ped.tipo !== "historia" || ped.equipo !== r.yo || !ped.historia_id || m[ped.id] || !["asignado", "trabajando", "revision"].includes(ped.estado)) continue;
        if (!locales.some(h => h.id === ped.historia_id)) continue;
        m[ped.id] = { tipo: "historia", historia: ped.historia_id, faseOk: _soyDueno }; cambio = true;
      }
      if (cambio) guardarMios(m);
      revisadoRelevo = true;
    } catch (e) {}
  };

  const vueltaUna = async () => {
    if (!navigator.onLine || ocupadoCogiendo) return;
    let aj, t, l;
    try { [aj, t, l] = await Promise.all([s.estudioAjustes(), s.historiasTareaEstado(), s.historiasLista()]); } catch (e) { return; }
    // v3.41.8: kit y recursos nuevos del portátil esperando: se instalan en este hueco, antes de empezar nada
    if ((_basePendiente || _kitPendiente) && _instalarBase && !(t && t.activa)) { await _instalarBase(); return; }
    const m = mios(), w = esperas();
    // (v3.51) «trabajar hasta»: lo que va después de esa etapa no se empieza ni se ofrece al otro equipo
    const ORDEN_ET = ["guion", "voces", "escribir", "escena", "animatic", "render", "montaje"];
    const hasta = ((aj && aj.ajustes) || {}).hasta || "";
    const pasaDe = (id) => !!hasta && ORDEN_ET.indexOf(id) > ORDEN_ET.indexOf(hasta);
    // 0) lo que esperaba al límite de Claude: a su hora, sigue (de uno en uno, y solo si estoy disponible y libre)
    const vencida = Object.keys(w).find(k => w[k] <= Date.now());
    // (v3.50) aunque Studio esté ocupado: estudioAvanzar la pone en marcha (guion, voces, escribir) o en la cola
    if (vencida && _disponible && revisadoRelevo) {
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
    // 1) seguir el estado de mis pedidos. v3.41.2: las historias EMPEZADAS van antes que cualquier pedido nuevo (de la más
    // antigua a la más nueva); se apunta la primera que puede seguir aquí
    let empezada = null;
    const blender = [];             // v3.41.7: empezadas a las que les toca Blender (en el ordenador, van al final)
    const ordenadas = Object.entries(m).sort((a, b) => String(a[1].historia || "").localeCompare(String(b[1].historia || "")));
    for (const [pid, x] of ordenadas) {
      if (x.tipo !== "historia" || !x.historia || x.fin || x.traspasada) continue;
      const h = (l.historias || []).find(y => y.id === x.historia);
      if (!h) continue;
      const et = h.etapas || [];
      if (x.parada && x.fallos === undefined) { x.parada = false; x.fallos = 1; }   // las paradas de antes: se reintentan
      if (x.pausada === true) x.pausada = false;   // (v3.41.7) las paradas a mano de antes se quedaban así para siempre
      if (h.entregada || (et.length && et.every(e => e.estado === "hecho"))) {
        x.fin = true; avisarPedido(Number(pid), "hecho", { historia_id: h.id, detalle: "Short entregado" });
        // v3.41: la copia de relevo ya no hace falta (ni aquí ni en Drive)
        if (s.estudioRelevoBorrar) driveTokenTrabajo().then(tk => s.estudioRelevoBorrar(h.id, tk, x.relevo || null)).catch(() => {});
      }
      else if (et.some(e => e.estado === "revisar")) { delete ultimoAviso[pid + "trabajando"]; avisarPedido(Number(pid), "revision", { historia_id: h.id, detalle: "te toca revisar: " + ({ guion: "el guion", voces: "las voces", animatic: "el animatic" }[(et.find(e => e.estado === "revisar") || {}).id] || "una etapa") }); }
      else if (t && t.activa && t.id === h.id) { x.parada = false; x.pausada = false; x.quieta = 0; delete ultimoAviso[pid + "revision"]; avisarPedido(Number(pid), "trabajando", { historia_id: h.id, detalle: t.etapa || "" }); }
      // (v3.50) en paralelo (guion, voces o escribir la escena) mientras el hueco principal hace otra cosa
      else if (((t && t.ligeras) || []).some(y => y.id === h.id)) { const y = t.ligeras.find(z => z.id === h.id); x.parada = false; x.pausada = false; x.quieta = 0; delete ultimoAviso[pid + "revision"]; avisarPedido(Number(pid), "trabajando", { historia_id: h.id, detalle: (ETAPA_TXT[y.etapa] || y.etapa || "") + " (en paralelo)" }); }
      // v3.48: la que se graba de fondo (Roblox Studio) también está trabajando, aunque el hueco principal haga otra cosa
      else if (t && t.fondo && t.fondo.id === h.id) { x.parada = false; x.pausada = false; x.quieta = 0; avisarPedido(Number(pid), "trabajando", { historia_id: h.id, detalle: "render (de fondo)" }); }
      // a medias (equipo apagado, app actualizada, fallo que se reintenta…): se apunta para seguirla (si lleva quieta dos
      // vueltas, para no pisar el paso de una etapa a la siguiente; nunca la parada a mano ni la que espera al límite)
      else if ((!(t && t.activa) || LIGERAS.includes((et.find(e => e.estado === "pendiente") || {}).id)) && !x.parada && !x.pausada && !w["h:" + h.id] && Date.now() >= (x.reintentar || 0)) {
        const sig = et.find(e => e.estado === "pendiente");
        if (sig && pasaDe(sig.id)) { avisarDetalle(pid, "en espera: hoy se trabaja solo hasta «" + (ETAPA_TXT[hasta] || hasta) + "»"); continue; }
        // v3.41.6: sin una clave de ElevenLabs que funcione, las voces ni se intentan (antes fallaban cada 2 min, en bucle)
        if (sig && sig.id === "voces" && aj.elevenError) continue;
        // v3.48: con Studio grabando de fondo, las que necesitan Studio esperan y este equipo sigue con guiones y voces
        if (sig && t && t.fondo && ["escena", "animatic", "render"].includes(sig.id)) continue;
        if (sig && (x.quieta = (x.quieta || 0) + 1) >= 2) {
          // v3.49.2 — PRIORIDADES (Manu, 1-11): 1) las historias empezadas antes que nada nuevo; 2) el portátil anima y
          // renderiza; 3) el ordenador PREPARA TODO (guion y voces) y, «cuando acabe de preparar todo», se pone también a
          // animar y renderizar. La 3.47.1 hacía que el ordenador rodara cada historia nada más prepararla aunque quedaran
          // otras por preparar: ahora la escena, el animatic y el render del ordenador esperan (y se ofrecen al portátil)
          // hasta que no haya nada que preparar (más abajo, «nada nuevo que preparar»). Sin Studio, siempre se ofrecen.
          if (BLENDER.includes(sig.id) && (!aj.blender || (!_soyDueno && !x.faseOk))) blender.push({ pid, x, h, sig });
          else if (!empezada) empezada = { pid, x, h, sig };
        }
      }
      // v3.45.9: mientras este equipo está con OTRA historia, las suyas que esperan escena, animatic o render se ofrecen
      // al otro equipo aunque ya se animaran aquí: la sigue el primero que quede libre (él, 3/11: "que no se fijen para
      // siempre las historias para un dispositivo, que la haga el que esté disponible"). El montaje no: necesita los
      // planos renderizados, que no viajan en la copia, y son 4 minutos.
      else if (t && t.activa && t.id !== h.id && !_soyDueno && !x.parada && !x.pausada && !w["h:" + h.id]) {
        const sig = et.find(e => e.estado === "pendiente");
        if (sig && ["escena", "animatic", "render"].includes(sig.id) && !pasaDe(sig.id)) blender.push({ pid, x, h, sig });
      }
    }
    guardarMios(m);
    // v3.41.8: el pedido dice el estado real de las que esperan aquí (antes se quedaba «voces» aunque estuviera parada)
    for (const b of blender) avisarDetalle(b.pid, "preparada · espera para animarse");
    // 2) seguir la empezada antes de coger nada nuevo (v3.47.1: el que la preparó la rueda; solo se pasa al otro si este no
    // tiene Roblox Studio o está ocupado con otra)
    // v3.41.7: en el ordenador, cada historia preparada se ofrece al portátil (cada 5 min como mucho, de una en una)
    if (_disponible && revisadoRelevo) {
      const of = blender.find(b => Date.now() - (b.x.ofrecida || 0) > 5 * 60000 && !(t && t.activa && t.id === b.h.id));
      if (of) {
        of.x.ofrecida = Date.now(); guardarMios(m);
        const r = await pasarAlPortatil(of.pid, of.h.id).catch((e) => { pedidosApi("POST", { accion: "estado", id: Number(of.pid), estado: "trabajando", detalle: "➡️ pasar al otro equipo: error " + (e && e.message || e) }).catch(() => {}); return null; });
        if (r && r.traspasado) { of.x.traspasada = true; guardarMios(m); toast("➡️ Historia " + of.h.id.slice(0, 2) + " preparada: pasa al portátil para animarla"); return; }
      }
    }
    if (empezada && _disponible && revisadoRelevo && (!(t && t.activa) || LIGERAS.includes(empezada.sig.id))) {
      const { pid, x, h, sig } = empezada;
      x.quieta = 0;
      if (BLENDER.includes(sig.id) && !x.faseOk) x.faseOk = true;     // (aquí solo llega en el portátil)
      try { delete ultimoAviso[pid + "trabajando"]; await s.estudioAvanzar(h.id); toast("▶ Sigo con la historia " + h.id.slice(0, 2) + " (" + (ETAPA_TXT[sig.id] || sig.id) + ")"); } catch (e) {}
      guardarMios(m);
      return;
    }
    // 3) coger trabajo nuevo: solo si estoy disponible, libre y preparado
    if (!_disponible || !aj.proyecto || !aj.claude) return;
    const ocupadoAqui = !!(t && t.activa);
    // v3.47.0: preparar (guion y voces) lo puede hacer cualquier equipo; rodar, solo el que tiene Roblox Studio
    const tipos = ["historia", "ideas"];
    ocupadoCogiendo = true;
    try {
      // v3.41: solo se ofrece a seguir relevos si puede bajar la copia de Drive
      // (v3.49.2) con Studio grabando de fondo, no coge historias para animar (esperarían a Studio): que las coja el otro
      const r = await pedidosApi("POST", { accion: "reclamar", tipos, rodar: !!aj.blender && !(t && t.fondo) && !ocupadoAqui && !pasaDe("escena"), relevo: !!(s.estudioRelevoRecibir && driveConectadoTrabajo()) && !ocupadoAqui });
      const p = r.pedido;
      if (!p) {
        // v3.41.7: nada nuevo que preparar ni que animar del portátil: el ordenador anima lo suyo que ya está preparado
        const b = blender[0];
        if (b && !_soyDueno && aj.blender && !(t && t.fondo) && !ocupadoAqui) {
          b.x.faseOk = true; b.x.quieta = 0; guardarMios(m);
          try { await s.estudioAvanzar(b.h.id); toast("🎬 Ya está todo preparado: animo aquí la historia " + b.h.id.slice(0, 2)); } catch (e) {}
        }
        return;
      }
      if (p.porAnimar && p.historia_id) {
        // v3.41.2: historia preparada para animar. Si la preparó este equipo, ya la tiene; si no, se baja su copia de Drive
        const rv = (p.args || {}).relevo || {}, mia = (p.args || {}).de && (l.historias || []).some(h => h.id === p.historia_id) && Object.values(m).some(x => x.historia === p.historia_id);
        if (!mia) {
          let ok = false, err = "";
          // (v3.51) lo pasajero (otra copia empaquetándose, un corte de Drive) se reintenta antes de darla por fallida
          for (let intento = 0; intento < 4 && !ok; intento++) {
            if (intento) await new Promise(r => setTimeout(r, 20000));
            try { const x = await s.estudioRelevoRecibir(p.historia_id, await driveTokenTrabajo(), rv.archivo, rv.md5); ok = !!(x && x.ok); err = (x && x.error) || ""; }
            catch (e) { err = e.message || String(e); }
          }
          if (!ok) { await pedidosApi("POST", { accion: "estado", id: p.id, estado: "fallido", detalle: "no se pudo bajar la copia: " + err }).catch(() => {}); toast("❌ No pude bajar «" + (p.titulo || p.historia_id) + "»: " + err); return; }
        }
        m[p.id] = { tipo: "historia", historia: p.historia_id, faseOk: true }; guardarMios(m);
        await pedidosApi("POST", { accion: "estado", id: p.id, estado: "trabajando", historia_id: p.historia_id, detalle: "escena 3D" });
        toast("🎬 Animo aquí la historia " + p.historia_id.slice(0, 2) + " «" + (p.titulo || "") + "»");
        await s.estudioAvanzar(p.historia_id);
        return;
      }
      if (p.relevo && p.historia_id) {
        // relevo de un equipo desconectado: se baja su copia de Drive y la historia sigue aquí
        const rv = (p.args || {}).relevo || {};
        let ok = false, err = "";
        try { const x = await s.estudioRelevoRecibir(p.historia_id, await driveTokenTrabajo(), rv.archivo, rv.md5); ok = !!(x && x.ok); err = (x && x.error) || ""; }
        catch (e) { err = e.message || String(e); }
        if (!ok) { await pedidosApi("POST", { accion: "devolver", id: p.id }).catch(() => {}); toast("❌ No pude seguir el relevo de «" + (p.titulo || p.historia_id) + "»: " + err); return; }
        m[p.id] = { tipo: "historia", historia: p.historia_id }; guardarMios(m);
        await pedidosApi("POST", { accion: "estado", id: p.id, estado: "trabajando", historia_id: p.historia_id, detalle: "🔁 relevo: sigue aquí desde «" + (rv.etapa || "su última etapa") + "»" });
        toast("🔁 Sigo aquí la historia " + p.historia_id.slice(0, 2) + " «" + (p.titulo || "") + "»: su equipo se desconectó");
        await s.estudioAvanzar(p.historia_id);
        return;
      }
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
  // una sola vuelta a la vez (ahora también las lanza el timbre)
  let enVuelta = false;
  const vuelta = async () => { if (enVuelta) return; enVuelta = true; try { await vueltaUna(); } finally { enVuelta = false; } };
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
  // v3.41.7: al volver a estar disponible (tras «Parar todo»), lo parado a mano sigue solo
  alCambiarDisponible((v) => {
    if (!v) return;
    const m = mios(); let c = false;
    for (const x of Object.values(m)) if (x.pausada) { x.pausada = false; c = true; }
    if (c) guardarMios(m);
  });
  comprobarRelevos().then(vuelta);
  setInterval(comprobarRelevos, 60000);
  // v3.41: con el timbre, los pedidos nuevos se cogen al instante; la vuelta de siempre queda de respaldo, más espaciada
  alTimbre((d) => { if (d.que === "pedidos") vuelta(); });
  setInterval(vuelta, 15000);
}
