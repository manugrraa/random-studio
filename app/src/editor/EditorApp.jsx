import React from "react";
import { useToast } from "../base";
import { RandomEditor } from "./RandomEditor";

/* La ventana del RandomEditor: siempre oscura (como CapCut PC), con sus avisos */
export function EditorApp() {
  const [toast, toastNode] = useToast();
  React.useEffect(()=>{ document.documentElement.setAttribute("data-theme", "dark"); document.body.style.background = "#0e0e0e"; },[]);
  return <>{<RandomEditor toast={toast}/>}{toastNode}</>;
}
