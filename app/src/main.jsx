import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import { App } from "./Principal";
import { EditorApp } from "./editor/EditorApp";
import { PantallaBloqueo, PantallaPerfiles, comprobarAcceso, entrarEnPerfil } from "./perfiles";
import { AvisoActualizacion, publicarSiToca } from "./actualizar";
import { iniciarRemotoEscritorio, iniciarTrabajador } from "./remoto";

// v3.14: la misma página sirve a las dos ventanas; la del RandomEditor se abre con #editor
// v3.21: antes de la app, la pantalla para elegir perfil (canal)
// v3.30: el servidor decide qué cuentas puede abrir este equipo (las pendientes salen con candado)
const esEditor = location.hash === "#editor";
const q = new URLSearchParams(location.search);
// vuelta de Google al pedir entrar con una cuenta (pantalla de perfiles)
const codigoEntrar = q.get("state") === "rs_entrar" ? q.get("code") : null;
if (codigoEntrar) history.replaceState(null, "", location.pathname);
// vuelta de Google dentro de un perfil (o la renovación silenciosa en un iframe): directo a la app, que recoge el token
const vueltaGoogle = !codigoEntrar && (/access_token=|[?&#]code=|error=/.test(location.hash + location.search) || window.self !== window.top);

// v3.26: todos los perfiles abren la MISMA app; cambia la cuenta (datos, Google y carpetas)
function Inicio() {
  const [estado, setEstado] = React.useState(null);     // null = comprobando
  const [perfil, setPerfil] = React.useState("");
  React.useEffect(() => {
    if (window.studioFS) setTimeout(publicarSiToca, 4000);   // el portátil deja su versión publicada para los demás equipos
    comprobarAcceso().then(r => {
      // v3.40.1: las historias siguen en marcha en cualquier perfil (y en esta pantalla): el escritorio publica su estado,
      // recoge órdenes y coge pedidos desde que se abre, con la sesión de RandomHistorias
      if (!r.bloqueado && window.studioFS && !esEditor) { iniciarRemotoEscritorio(); iniciarTrabajador(); }
      const auto = r.auto || (vueltaGoogle && (r.lista || []).find(p => p.activo && p.id === localStorage.getItem("rs_perfil")) || {}).id;
      if (!r.bloqueado && auto && !codigoEntrar) entrarEnPerfil(auto).then(() => { setPerfil(auto); setEstado(r); });
      else setEstado(r);
    });
  }, []);
  // solo en desarrollo (vite): ?diseno=1 abre la app sin cuenta para revisar la interfaz; no existe en la versión publicada
  if (import.meta.env.DEV && q.get("diseno")) return <App/>;
  if (estado === null) return null;
  if (estado.bloqueado) return <PantallaBloqueo ip={estado.ip}/>;
  // el aviso de versión nueva también en la pantalla de cuentas (encima de todo)
  if (!perfil) return <><div style={{ position: "fixed", top: "env(safe-area-inset-top, 0px)", left: 0, right: 0, zIndex: 10000 }}><AvisoActualizacion/></div>
    <PantallaPerfiles onElegir={setPerfil} codigo={codigoEntrar} inicial={estado}/></>;
  return <App/>;
}

// v3.37.5: cada botón «se hunde» un momento al pulsarlo, aunque el toque sea muy corto (en el móvil :active casi no se ve)
document.addEventListener("pointerdown", (e) => {
  const b = e.target && e.target.closest && e.target.closest("button");
  if (!b || b.disabled) return;
  b.classList.add("rs-pulso");
  setTimeout(() => b.classList.remove("rs-pulso"), 160);
}, { passive: true });
document.addEventListener("touchstart", () => {}, { passive: true });   // iOS: sin esto no aplica :active

ReactDOM.createRoot(document.getElementById("root")).render(esEditor ? <EditorApp/> : <Inicio/>);
