/* Red de seguridad de RandomStudio: la «llave» de este equipo.
 *
 * En el primer arranque el equipo crea una pareja de claves (ECDSA P-256). La privada se guarda en
 * IndexedDB como NO EXPORTABLE: el navegador la usa para firmar pero nadie puede copiarla, ni siquiera
 * desde la consola. La pública se manda al servidor al dar de alta el equipo, que queda «pendiente»
 * hasta que otro equipo ya autorizado lo aprueba (Ajustes → Seguridad).
 * Cada petición a la nube lleva X-Disp-Id + X-Disp-Ts + X-Disp-Firma (firma de "MÉTODO\nruta\nts"),
 * y el servidor la comprueba con la clave pública (rderandom-backend/lib/seguridad.js).
 */

const DB = "rs-seguridad", STORE = "llave", ID_KEY = "rs_disp_id";
let _llave = null;            // { id, privada, publicaJwk }
let _hola = null;             // promesa del «inicio de sesión» de esta ejecución
let _urgente = null;          // cabeceras firmadas de reserva para el guardado al cerrar
export let estadoEquipo = { estado: null, modo: null, nombre: null, error: null };

function idb() {
  return new Promise((ok, ko) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });
}
async function idbGet(k) {
  const db = await idb();
  return new Promise((ok, ko) => { const q = db.transaction(STORE).objectStore(STORE).get(k); q.onsuccess = () => ok(q.result); q.onerror = () => ko(q.error); });
}
async function idbPut(k, v) {
  const db = await idb();
  return new Promise((ok, ko) => { const t = db.transaction(STORE, "readwrite"); t.objectStore(STORE).put(v, k); t.oncomplete = () => ok(); t.onerror = () => ko(t.error); });
}

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));

export function nombrePorDefecto() {
  const ua = navigator.userAgent || "";
  if (window.studio || /Electron/i.test(ua)) return "Ordenador (RandomStudio)";
  if (/Android|iPhone|iPad/i.test(ua)) return "Móvil (web)";
  return "Navegador (web)";
}

async function llave() {
  if (_llave) return _llave;
  let guardada = null;
  try { guardada = await idbGet("par"); } catch (e) {}
  if (!guardada) {
    const par = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]);
    const publicaJwk = await crypto.subtle.exportKey("jwk", par.publicKey);
    guardada = { privada: par.privateKey, publicaJwk, id: null };
    await idbPut("par", guardada);
  }
  _llave = guardada;
  return _llave;
}

export async function idEquipo() { return (await llave()).id; }

async function firmar(metodo, ruta) {
  const k = await llave();
  if (!k.id) return {};
  const ts = String(Date.now());
  const msg = new TextEncoder().encode(`${metodo.toUpperCase()}\n${ruta}\n${ts}`);
  const firma = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, k.privada, msg);
  return { "X-Disp-Id": k.id, "X-Disp-Ts": ts, "X-Disp-Firma": b64(firma) };
}

/** Cabeceras firmadas para una petición (vacías si el equipo aún no está dado de alta). */
export async function cabecerasEquipo(metodo, ruta) {
  try { return await firmar(metodo, ruta); } catch (e) { return {}; }
}

/** Cabeceras para el guardado urgente al cerrar (no da tiempo a firmar): se renuevan cada 2 min. */
export function cabecerasUrgentes() { return (_urgente && _urgente.caduca > Date.now()) ? _urgente.h : {}; }
async function renovarUrgente() {
  const h = await cabecerasEquipo("POST", "/api/datos");
  _urgente = { h, caduca: Date.now() + 4 * 60 * 1000 };
}

function avisar() { try { window.dispatchEvent(new CustomEvent("rs-seguridad", { detail: { ...estadoEquipo } })); } catch (e) {} }

/** Da de alta el equipo si hace falta y apunta el inicio de sesión. Una vez por ejecución. */
export function asegurarEquipo(backend, token, nombre) {
  if (_hola) return _hola;
  _hola = (async () => {
    const k = await llave();
    if (!k.id) {
      const r = await fetch(backend + "/api/dispositivos", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ accion: "registrar", nombre: nombre || nombrePorDefecto(), clave_publica: k.publicaJwk }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.success) throw new Error(j.error || ("Error " + r.status));
      k.id = j.id;
      await idbPut("par", k);
      try { localStorage.setItem(ID_KEY, j.id); } catch (e) {}
    }
    const r = await fetch(backend + "/api/dispositivos", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token, ...(await firmar("POST", "/api/dispositivos")) },
      body: JSON.stringify({ accion: "hola" }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.success) throw new Error(j.error || ("Error " + r.status));
    estadoEquipo = { estado: j.estado, modo: j.modo, nombre: j.nombre, error: null };
    renovarUrgente();
    setInterval(renovarUrgente, 2 * 60 * 1000);
    avisar();
    return estadoEquipo;
  })().catch((e) => {
    _hola = null;                     // se reintenta en la siguiente sincronización
    estadoEquipo = { ...estadoEquipo, error: e.message };
    avisar();
    return estadoEquipo;
  });
  return _hola;
}

/** Llamadas del panel de Seguridad (solo funcionan desde un equipo aprobado). */
export async function seguridadApi(backend, token, metodo, cuerpo) {
  const r = await fetch(backend + "/api/dispositivos", {
    method: metodo,
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token, ...(await firmar(metodo, "/api/dispositivos")) },
    body: metodo === "GET" ? undefined : JSON.stringify(cuerpo || {}),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.success) throw new Error(j.error || ("Error " + r.status));
  return j;
}
