/* Avisos en el móvil (v3.34): notificaciones push aunque RandomStudio esté cerrado.
 * - Web/móvil: activarAvisos() pide permiso, se apunta con el service worker (sw.js, junto a index.html) y lo guarda en
 *   el servidor (/api/avisos). En iPhone solo funciona con RandomStudio añadido a la pantalla de inicio.
 * - Escritorio: avisar() lo usan los equipos de trabajo cuando una historia espera revisión, termina o falla.
 */
import { YT_BACKEND } from "./datos";
import { tokenTrabajo } from "./sesion_historias";
import { cabecerasEquipo } from "./seguridad";

async function api(cuerpo) {
  const token = await tokenTrabajo();
  const r = await fetch(YT_BACKEND + "/api/avisos", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token, ...(await cabecerasEquipo("POST", "/api/avisos")) },
    body: JSON.stringify(cuerpo),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.success) throw new Error(j.error || ("Error " + r.status));
  return j;
}

export const esIphone = () => /iPhone|iPad/i.test(navigator.userAgent);
export const enPantallaInicio = () => window.matchMedia && (window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true);
export const avisosPosibles = () => location.protocol === "https:" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/** El service worker de los avisos (solo en la web, no en el escritorio). */
export async function registrarSW() {
  if (!avisosPosibles()) return null;
  try { return await navigator.serviceWorker.register("sw.js"); } catch (e) { return null; }
}

const b64aBytes = (b64) => {
  const s = (b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
};

export async function estadoAvisos() {
  if (!avisosPosibles()) return { posible: false };
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && await reg.pushManager.getSubscription();
  return { posible: true, permiso: Notification.permission, activos: !!sub };
}

export async function activarAvisos() {
  if (!avisosPosibles()) throw new Error(esIphone() && !enPantallaInicio() ? "En iPhone, primero añade RandomStudio a la pantalla de inicio y ábrelo desde ahí" : "Este navegador no admite avisos");
  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") throw new Error("No has dado permiso para los avisos");
  const reg = (await registrarSW()) || await navigator.serviceWorker.ready;
  await navigator.serviceWorker.ready;
  const { clave } = await (await fetch(YT_BACKEND + "/api/avisos?clave=1")).json();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64aBytes(clave) });
  await api({ accion: "suscribir", sub: sub.toJSON() });
  return true;
}

export async function desactivarAvisos() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && await reg.pushManager.getSubscription();
  if (sub) { await api({ accion: "quitar", endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe(); }
}

export const probarAviso = () => api({ accion: "probar" });

/** Desde un escritorio: avisar a los móviles apuntados. */
export const avisar = (titulo, cuerpo, etiqueta) => api({ accion: "enviar", titulo, cuerpo, etiqueta, url: "./" }).catch(() => {});
