import React from "react";
const { useState, useEffect } = React;
import { estadoEquipo } from "./seguridad";

/* ============================ SEGURIDAD (Ajustes) ============================
 * v3.30: aquí solo se ve cómo está ESTE equipo. Todo lo demás (solicitudes, equipos, cuentas, IPs bloqueadas y
 * registro) está en Administración, que solo sale en el portátil y en los equipos a los que él dé ese poder.
 */
const ROL = { dueno: "manda en todo (portátil)", admin: "administrador", usuario: "usuario" };

export function SeguridadPanel({ caja, tituloZona }) {
  const [est, setEst] = useState({ ...estadoEquipo });
  useEffect(() => {
    const f = (e) => setEst(e.detail || {});
    window.addEventListener("rs-seguridad", f);
    return () => window.removeEventListener("rs-seguridad", f);
  }, []);
  const ok = est.estado === "aprobado";
  return (
    <div style={caja}>
      <div style={tituloZona}>Seguridad</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: ok ? "var(--green)" : est.estado ? "var(--gold)" : "var(--text-2)" }}>
        {ok ? `● Este equipo (${est.nombre}) está autorizado · ${ROL[est.rol] || "usuario"}`
          : est.estado ? "● Este equipo está " + est.estado
          : est.error ? "○ No se pudo comprobar el equipo: " + est.error : "○ Comprobando el equipo…"}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--text-3)", lineHeight: 1.6, marginTop: 8 }}>
        {(est.rol === "dueno" || est.rol === "admin")
          ? "Las solicitudes, los equipos, las cuentas y las IPs bloqueadas se gestionan en Administración (abajo en la barra lateral)."
          : "Cada equipo tiene una llave propia que no se puede copiar y solo entra en las cuentas que el portátil le aprueba."}
      </div>
    </div>);
}
