import React from "react";
const { useState, useEffect, useCallback } = React;
import { YT_BACKEND, cloudToken, ytIsConnected } from "./datos";
import { estadoEquipo, idEquipo, seguridadApi } from "./seguridad";

/* ============================ SEGURIDAD (Ajustes) ============================
 * Equipos autorizados + registro de inicios de sesión. Un equipo nuevo entra «pendiente» aunque tenga la
 * sesión de Google del canal: hay que aprobarlo desde aquí, en un equipo ya autorizado.
 * Modo «registrar»: todo se apunta pero aún sincronizan los pendientes (para dar de alta los equipos).
 * Modo «exigir»: solo sincronizan los aprobados.
 */

const fecha = (s) => s ? new Date(s).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
const COLOR = { aprobado: "var(--green)", pendiente: "var(--gold)", revocado: "var(--red)", ok: "var(--green)", rechazado: "var(--red)" };

function navegador(ua) {
  ua = ua || "";
  if (/Electron/i.test(ua)) return "RandomStudio (escritorio)";
  if (/Android/i.test(ua)) return "Android";
  if (/iPhone|iPad/i.test(ua)) return "iPhone/iPad";
  if (/Edg\//i.test(ua)) return "Edge";
  if (/OPR\//i.test(ua)) return "Opera";
  if (/Chrome\//i.test(ua)) return "Chrome";
  if (/Firefox\//i.test(ua)) return "Firefox";
  return ua.slice(0, 40);
}

export function SeguridadPanel({ caja, tituloZona, toast }) {
  const [est, setEst] = useState({ ...estadoEquipo });
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [yo, setYo] = useState(null);
  const [verTodo, setVerTodo] = useState(false);

  useEffect(() => {
    const f = (e) => setEst(e.detail || {});
    window.addEventListener("rs-seguridad", f);
    idEquipo().then(setYo).catch(() => {});
    return () => window.removeEventListener("rs-seguridad", f);
  }, []);

  const cargar = useCallback(async () => {
    setError("");
    try {
      const token = await cloudToken();
      setEst({ ...estadoEquipo });
      setYo(await idEquipo());
      if (estadoEquipo.estado !== "aprobado") { setDatos(null); return; }
      setDatos(await seguridadApi(YT_BACKEND, token, "GET"));
    } catch (e) { setError(e.message); }
  }, []);

  useEffect(() => { if (ytIsConnected()) cargar(); }, [cargar]);

  const accion = async (cuerpo, ok) => {
    try {
      const token = await cloudToken();
      await seguridadApi(YT_BACKEND, token, "POST", cuerpo);
      toast(ok);
      cargar();
    } catch (e) { toast(e.message); }
  };

  const boton = (txt, onClick, color = "var(--gold)") => (
    <button onClick={onClick} style={{ fontSize: 11.5, fontWeight: 700, color, border: "1px solid var(--border)", borderRadius: 8, padding: "5px 10px" }}>{txt}</button>
  );

  const pendientes = datos ? datos.dispositivos.filter(d => d.estado === "pendiente") : [];
  const accesos = datos ? (verTodo ? datos.accesos : datos.accesos.slice(0, 12)) : [];

  return (
    <div style={caja}>
      <div style={tituloZona}>Seguridad</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {!ytIsConnected() && <div style={{ fontSize: 12.5, color: "var(--text-2)" }}>Conecta Google para ver los equipos autorizados.</div>}
        {ytIsConnected() && (
          <div style={{ fontSize: 13, fontWeight: 600, color: COLOR[est.estado] || "var(--text-2)" }}>
            {est.estado === "aprobado" && "● Este equipo está autorizado"}
            {est.estado === "pendiente" && "● Este equipo está pendiente de aprobación: apruébalo desde un equipo autorizado"}
            {est.estado === "revocado" && "● Este equipo fue revocado: no puede sincronizar"}
            {!est.estado && (est.error ? "○ No se pudo comprobar el equipo: " + est.error : "○ Comprobando el equipo…")}
          </div>
        )}
        {error && <div style={{ fontSize: 12, color: "var(--red)" }}>{error}</div>}

        {datos && (<>
          {pendientes.length > 0 && (
            <div style={{ border: "1px solid var(--border-gold)", borderRadius: 10, padding: 10, background: "rgba(212,175,55,0.06)" }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--gold)", marginBottom: 6 }}>Equipos esperando aprobación</div>
              {pendientes.map(d => (
                <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12.5, padding: "4px 0" }}>
                  <span style={{ fontWeight: 600 }}>{d.nombre}</span>
                  <span style={{ color: "var(--text-3)" }}>{navegador(d.user_agent)} · {fecha(d.creado)}</span>
                  <span style={{ flex: 1 }} />
                  {boton("Aprobar", () => accion({ accion: "aprobar", id: d.id }, "Equipo aprobado"), "var(--green)")}
                  {boton("Rechazar", () => accion({ accion: "revocar", id: d.id }, "Equipo rechazado"), "var(--red)")}
                </div>
              ))}
            </div>
          )}

          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)" }}>Equipos</div>
          {datos.dispositivos.filter(d => d.estado !== "pendiente").map(d => (
            <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12.5 }}>
              <span style={{ color: COLOR[d.estado] }}>●</span>
              <span style={{ fontWeight: 600 }}>{d.nombre}{d.id === yo ? " (este)" : ""}</span>
              <span style={{ color: "var(--text-3)" }}>{navegador(d.user_agent)} · último uso {fecha(d.ultimo_uso)}</span>
              <span style={{ flex: 1 }} />
              {boton("Renombrar", () => { const n = prompt("Nombre del equipo", d.nombre); if (n && n.trim()) accion({ accion: "renombrar", id: d.id, nombre: n.trim() }, "Nombre cambiado"); })}
              {d.estado === "aprobado" && d.id !== yo && boton("Revocar", () => { if (confirm("¿Quitar el acceso a «" + d.nombre + "»?")) accion({ accion: "revocar", id: d.id }, "Acceso revocado"); }, "var(--red)")}
              {d.estado === "revocado" && boton("Volver a aprobar", () => accion({ accion: "aprobar", id: d.id }, "Equipo aprobado"), "var(--green)")}
            </div>
          ))}

          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, marginTop: 4 }}>
            <span style={{ fontWeight: 700, color: "var(--text-2)" }}>Modo:</span>
            <span style={{ color: datos.modo === "exigir" ? "var(--green)" : "var(--gold)", fontWeight: 600 }}>
              {datos.modo === "exigir" ? "solo equipos aprobados" : "registrar (aún entran los pendientes)"}
            </span>
            <span style={{ flex: 1 }} />
            {datos.modo === "exigir"
              ? boton("Pasar a registrar", () => accion({ accion: "modo", valor: "registrar" }, "Modo registrar"))
              : boton("Exigir aprobación", () => { if (confirm("Desde ahora solo sincronizan los equipos aprobados. ¿Seguro?")) accion({ accion: "modo", valor: "exigir" }, "Solo equipos aprobados"); }, "var(--green)")}
          </div>

          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", marginTop: 4 }}>Registro de accesos</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: verTodo ? 360 : "none", overflowY: "auto" }}>
            {accesos.map(a => (
              <div key={a.id} style={{ display: "flex", gap: 8, fontSize: 11.5, color: "var(--text-2)" }}>
                <span style={{ color: "var(--text-3)", flexShrink: 0 }}>{fecha(a.fecha)}</span>
                <span style={{ color: COLOR[a.resultado] || "var(--gold)", fontWeight: 600, flexShrink: 0 }}>{a.resultado}</span>
                <span>{a.accion}{a.nombre ? " · " + a.nombre : ""}{a.ciudad || a.pais ? " · " + [a.ciudad, a.pais].filter(Boolean).join(", ") : ""}{a.detalle ? " · " + a.detalle : ""}</span>
              </div>
            ))}
          </div>
          {datos.accesos.length > 12 && boton(verTodo ? "Ver menos" : "Ver todo el registro", () => setVerTodo(v => !v))}
        </>)}

        <div style={{ display: "flex", gap: 8 }}>{ytIsConnected() && boton("Actualizar", cargar)}</div>
        <div style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.5 }}>
          Para entrar hace falta la sesión de Google del canal y que el equipo esté aprobado. Cada equipo tiene una llave propia que no se puede copiar; un equipo nuevo se queda pendiente hasta que lo apruebas aquí.
        </div>
      </div>
    </div>
  );
}
