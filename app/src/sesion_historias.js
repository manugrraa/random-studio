/* v3.40.1: las historias son siempre del canal RandomHistorias (el servidor ya las manda ahí: perfilDeTrabajo). En el
 * ESCRITORIO, el trabajador, el control remoto y los avisos usan la sesión de Google (y la de Drive) de ese perfil aunque
 * estés en otro perfil, en uno local sin Google o en la pantalla de perfiles: así un equipo nunca deja de hacer historias
 * por cambiar de perfil. Si este equipo no tiene esa sesión, se usa la del perfil abierto (como antes).
 * En la web/móvil no cambia nada: la sesión del perfil abierto. */
import { DRIVE_TOKEN_KEY, YT_BACKEND, YT_TOKEN_KEY, cloudToken, driveConectado, driveToken, ytIsConnected } from "./datos";
import { asegurarEquipo, cabecerasEquipo } from "./seguridad";
import { almacenDe, perfilActual } from "./perfiles";

const escritorio = () => !!(window.studioFS && window.studioFS.historiasLista);
const leer = (alm, clave) => { try { return JSON.parse(alm.get(clave) || "null"); } catch (e) { return null; } };

/** El access token guardado en un perfil (lo renueva con su refresh token si hace falta); null si no hay sesión. */
async function tokenGuardado(perfil, clave) {
  const alm = almacenDe(perfil), t = leer(alm, clave);
  if (!t || !(t.access_token || t.refresh_token)) return null;
  if (t.access_token && t.expires_at && Date.now() < t.expires_at - 120000) return t.access_token;
  if (!t.refresh_token) return null;
  try {
    const res = await fetch(YT_BACKEND + "/api/auth/refresh", { method: "POST",
      headers: { "Content-Type": "application/json", ...(await cabecerasEquipo("POST", "/api/auth/refresh")) },
      body: JSON.stringify({ refreshToken: t.refresh_token }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) return null;
    alm.set(clave, JSON.stringify({ ...t, access_token: data.access_token, expires_at: Date.now() + (data.expires_in || 3600) * 1000 }));
    return data.access_token;
  } catch (e) { return null; }
}

/** Token para /api/remoto, /api/pedidos y /api/avisos. */
export async function tokenTrabajo() {
  if (!escritorio()) return cloudToken();
  const t = await tokenGuardado("randomhistorias", YT_TOKEN_KEY);
  if (t) { await asegurarEquipo(YT_BACKEND, t); return t; }
  if (perfilActual() && ytIsConnected()) return cloudToken();
  const r = await tokenGuardado("rderandom", YT_TOKEN_KEY);
  if (r) { await asegurarEquipo(YT_BACKEND, r); return r; }
  throw new Error("Este equipo no tiene ninguna sesión de Google para las historias");
}

/** Drive de las historias: el de RandomHistorias si está conectado en este equipo; si no, el del perfil abierto. */
export const driveHistorias = () => !!(leer(almacenDe("randomhistorias"), DRIVE_TOKEN_KEY) || {}).refresh_token;
export const driveConectadoTrabajo = () => (escritorio() && driveHistorias()) || (!!perfilActual() && driveConectado());
export async function driveTokenTrabajo() {
  if (escritorio() && driveHistorias()) {
    const t = await tokenGuardado("randomhistorias", DRIVE_TOKEN_KEY);
    if (t) return t;
  }
  return driveToken();
}
