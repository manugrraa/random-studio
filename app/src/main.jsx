import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import { App } from "./Principal";
import { EditorApp } from "./editor/EditorApp";
import { PantallaPerfiles, entrarEnPerfil, perfilAlArrancar } from "./perfiles";

// v3.14: la misma página sirve a las dos ventanas; la del RandomEditor se abre con #editor
// v3.21: antes de la app, la pantalla para elegir perfil (canal)
const esEditor = location.hash === "#editor";
// vuelta de Google (o la renovación silenciosa dentro de un iframe): directo a la app, que recoge el token
const vueltaGoogle = /access_token=|[?&#]code=|error=/.test(location.hash + location.search) || window.self !== window.top;

// v3.26: los dos perfiles abren la MISMA app; cambia la cuenta (datos, Google y carpetas)
function Inicio() {
  const [perfil, setPerfil] = React.useState(null);
  React.useEffect(() => {
    const auto = vueltaGoogle ? (localStorage.getItem("rs_perfil") || "rderandom") : perfilAlArrancar();
    if (auto) entrarEnPerfil(auto).then(() => setPerfil(auto)); else setPerfil("");
  }, []);
  if (perfil === null) return null;
  if (!perfil) return <PantallaPerfiles onElegir={setPerfil}/>;
  return <App/>;
}

ReactDOM.createRoot(document.getElementById("root")).render(esEditor ? <EditorApp/> : <Inicio/>);
