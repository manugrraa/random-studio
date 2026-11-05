/* Vigilante de seguridad (4.2.0, 5-11-2026). Manu, tras un intento de robo de cuentas (llamada de Países Bajos, un
 * Telegram falso y Claude pidiendo verificar la identidad, todo en 5 minutos): «tenemos que activar un método de
 * protección de mis datos por si pasa esto otra vez».
 *
 * En cada equipo de escritorio aprobado como dueño o administrador, cada 3 minutos:
 *   1. Accesos de RandomStudio (servidor): avisa de un equipo nuevo que pide acceso, de intentos rechazados, de una IP
 *      que no se había visto nunca y de accesos desde fuera de España.
 *   2. Este equipo (electron/vigilante.cjs): amenazas nuevas de Windows Defender, entradas por TeamViewer, dispositivos
 *      nuevos en Tailscale y el escritorio remoto de Windows activado.
 * El aviso llega al móvil (/api/avisos, el mismo de las historias) y sale también aquí. Cada aviso lleva una etiqueta
 * fija (el id del acceso o de lo detectado): si lo detectan dos equipos, en el móvil se queda uno solo.
 * La primera vez solo se apunta lo que ya hay (no avisa de lo antiguo). Solo lee: no cambia ni cierra nada. */
import { YT_BACKEND } from "./datos";
import { tokenTrabajo } from "./sesion_historias";
import { estadoEquipo, seguridadApi } from "./seguridad";
import { avisar } from "./avisos";

const CLAVE = "rs_vigilante_v1";
const CADA = 3 * 60 * 1000;
let _iniciado = false;

const leer = () => { try { return JSON.parse(localStorage.getItem(CLAVE) || "null"); } catch (e) { return null; } };
const guardar = (s) => { try { localStorage.setItem(CLAVE, JSON.stringify(s)); } catch (e) {} };

function aviso(titulo, cuerpo, etiqueta) {
  avisar("🛡️ " + titulo, cuerpo, etiqueta);
  try { new Notification("🛡️ " + titulo, { body: cuerpo, tag: etiqueta }); } catch (e) {}
  try { window.dispatchEvent(new CustomEvent("rs-vigilante", { detail: { titulo, cuerpo, fecha: new Date().toISOString() } })); } catch (e) {}
}

const donde = (a) => [a.ciudad, a.pais].filter(Boolean).join(", ") || "lugar desconocido";

async function revisarAccesos(est) {
  const token = await tokenTrabajo();
  const j = await seguridadApi(YT_BACKEND, token, "GET");
  const acc = (j.accesos || []).slice().sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  if (!est.accesos) {           // primera vez: lo que ya hay es «conocido»
    est.accesos = { hasta: acc.length ? acc[acc.length - 1].fecha : new Date().toISOString(),
      ips: [...new Set(acc.filter(a => a.ip && a.resultado === "ok").map(a => a.ip))] };
    return;
  }
  const ips = new Set(est.accesos.ips || []);
  for (const a of acc) {
    if (String(a.fecha) <= String(est.accesos.hasta)) continue;
    const quien = a.nombre || "un equipo sin nombre", et = "vig-acc-" + a.id;
    if (/alta de equipo|solicitud de acceso/i.test(a.accion || ""))
      aviso("Un equipo pide entrar en RandomStudio", `«${quien}» desde ${donde(a)} (${a.ip || "?"}). Si no eres tú, recházalo en Administración.`, et);
    else if (a.resultado === "rechazado")
      aviso("Intento rechazado en RandomStudio", `${a.accion || "acceso"} desde ${donde(a)} (${a.ip || "?"}).`, et);
    else if (a.pais && a.pais !== "ES")
      aviso("Acceso desde fuera de España", `«${quien}»: ${a.accion || "acceso"} desde ${donde(a)} (${a.ip}).`, et);
    else if (a.ip && !ips.has(a.ip) && a.resultado === "ok")
      aviso("Acceso desde una IP nueva", `«${quien}»: ${a.accion || "acceso"} desde ${donde(a)} (${a.ip}). Si es tu móvil con datos, no pasa nada.`, et);
    if (a.ip && a.resultado === "ok") ips.add(a.ip);
    est.accesos.hasta = a.fecha;
  }
  est.accesos.ips = [...ips].slice(-200);
}

async function revisarEquipo(est) {
  const s = window.studioFS;
  if (!s || !s.vigilanteSistema) return;
  const r = await s.vigilanteSistema();
  const yo = estadoEquipo.nombre || "este equipo";
  const primera = !est.equipo;
  const antes = est.equipo || {};
  const ahora = {
    defender: r.defender ? r.defender.map(d => d.fecha + "|" + d.recurso) : antes.defender,
    teamviewer: r.teamviewer ? r.teamviewer.map(t => t.clave) : (antes.teamviewer || []),
    tailscale: r.tailscale ? r.tailscale.map(p => p.id) : antes.tailscale,
    rdp: r.rdp,
  };
  if (!primera) {
    for (const d of r.defender || []) if (!(antes.defender || []).includes(d.fecha + "|" + d.recurso))
      aviso("Windows Defender ha detectado algo", `En ${yo}: ${d.recurso || "un archivo"}. Defender ya lo ha bloqueado; revisa de dónde vino.`, "vig-def-" + d.fecha);
    for (const t of r.teamviewer || []) if (!(antes.teamviewer || []).includes(t.clave))
      aviso("Alguien ha entrado por TeamViewer", `En ${yo}: ${t.quien || "?"} (${t.desde}). Si no eras tú, quita TeamViewer ya.`, "vig-tv-" + t.id + t.desde);
    for (const p of r.tailscale || []) if (antes.tailscale && !antes.tailscale.includes(p.id))
      aviso("Dispositivo nuevo en tu red de Tailscale", `${p.nombre} (${p.so}). Si no es tuyo, quítalo en login.tailscale.com.`, "vig-ts-" + p.id);
    if (r.rdp === true && antes.rdp !== true)
      aviso("Escritorio remoto activado", `En ${yo} se ha activado el escritorio remoto de Windows. Si no has sido tú, desactívalo.`, "vig-rdp-" + yo);
  }
  est.equipo = ahora;
}

export function iniciarVigilante() {
  if (_iniciado || !window.studioFS) return;   // solo en los equipos de escritorio
  _iniciado = true;
  const vuelta = async () => {
    // solo equipos aprobados como dueño o administrador (los que pueden ver el registro de accesos)
    if (estadoEquipo.estado !== "aprobado" || !["dueno", "admin"].includes(estadoEquipo.rol) || !navigator.onLine) return;
    const est = leer() || {};
    try { await revisarAccesos(est); } catch (e) {}
    try { await revisarEquipo(est); } catch (e) {}
    est.ultima = new Date().toISOString();
    guardar(est);
  };
  setTimeout(vuelta, 45 * 1000);
  setInterval(vuelta, CADA);
}
