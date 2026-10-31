import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import { App } from "./Principal";
import { EditorApp } from "./editor/EditorApp";
import { PantallaBloqueo, PantallaPerfiles, comprobarAcceso, entrarEnPerfil } from "./perfiles";

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
    comprobarAcceso().then(r => {
      const auto = r.auto || (vueltaGoogle && (r.lista || []).find(p => p.activo && p.id === localStorage.getItem("rs_perfil")) || {}).id;
      if (!r.bloqueado && auto && !codigoEntrar) entrarEnPerfil(auto).then(() => { setPerfil(auto); setEstado(r); });
      else setEstado(r);
    });
  }, []);
  if (estado === null) return null;
  if (estado.bloqueado) return <PantallaBloqueo ip={estado.ip}/>;
  if (!perfil) return <PantallaPerfiles onElegir={setPerfil} codigo={codigoEntrar} inicial={estado}/>;
  return <App/>;
}

ReactDOM.createRoot(document.getElementById("root")).render(esEditor ? <EditorApp/> : <Inicio/>);
