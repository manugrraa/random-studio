import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import { App } from "./Principal";
import { EditorApp } from "./editor/EditorApp";

// v3.14: la misma página sirve a las dos ventanas; la del RandomEditor se abre con #editor
const esEditor = location.hash === "#editor";
ReactDOM.createRoot(document.getElementById("root")).render(esEditor ? <EditorApp/> : <App/>);
