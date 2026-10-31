import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import { App } from "./Principal";
import { EditorApp } from "./editor/EditorApp";
import { PantallaPerfiles, perfilAlArrancar } from "./perfiles";
import { HistoriasApp } from "./historias_app";

// v3.14: la misma página sirve a las dos ventanas; la del RandomEditor se abre con #editor
// v3.21: antes de la app, la pantalla para elegir perfil (canal)
const esEditor = location.hash === "#editor";
// vuelta de Google (o la renovación silenciosa dentro de un iframe): directo a la app, que recoge el token
const vueltaGoogle = /access_token=|[?&#]code=|error=/.test(location.hash + location.search) || window.self !== window.top;

function Inicio() {
  const [perfil, setPerfil] = React.useState(vueltaGoogle ? "rderandom" : perfilAlArrancar());
  if (!perfil) return <PantallaPerfiles onElegir={setPerfil}/>;
  return perfil === "randomhistorias" ? <HistoriasApp/> : <App/>;
}

ReactDOM.createRoot(document.getElementById("root")).render(esEditor ? <EditorApp/> : <Inicio/>);
