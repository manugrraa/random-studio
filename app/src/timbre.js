/* El «timbre» (v3.41): avisos al instante entre equipos (Supabase Realtime, broadcast). La API dice en sus respuestas
 * el nombre del canal del perfil («timbre») y aquí se escucha; cada aviso solo dice qué cambió («orden», «pedidos»,
 * «estado», «resultado») y quien lo oye vuelve a preguntar a la API. Si el canal se cae, todo sigue funcionando con las
 * preguntas de siempre (ahora más espaciadas). */
import { getClient } from "./datos";

let _tema = null, _canal = null;
const _oyentes = new Set();
let _conectado = false;

/** Lo llaman remotoApi/pedidosApi con el «timbre» de la respuesta: la primera vez (o si cambia) se suscribe. */
export function fijarTimbre(tema) {
  if (!tema || tema === _tema) return;
  const sb = getClient();
  if (!sb) return;
  try { if (_canal) sb.removeChannel(_canal); } catch (e) {}
  _tema = tema;
  _canal = sb.channel(tema).on("broadcast", { event: "timbre" }, (m) => {
    const d = (m && m.payload) || {};
    _oyentes.forEach(f => { try { f(d); } catch (e) {} });
  }).subscribe((s) => { _conectado = s === "SUBSCRIBED"; });
}

/** Avisar a una función cada vez que suena el timbre. Devuelve la función para dejar de escuchar. */
export function alTimbre(f) { _oyentes.add(f); return () => _oyentes.delete(f); }
export const timbreConectado = () => _conectado;
