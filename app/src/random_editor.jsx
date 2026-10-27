/* v3.14: el RandomEditor vive en src/editor/ y es su PROPIA VENTANA (electron/main.cjs la crea).
   Desde el Studio solo se abre: «RandomEditor» en la barra, o «Editar el clip» en Clips. */
export { ATAJOS_EDITOR } from "./editor/atajos";
export function abrirEnEditor(req) { window.studioFS?.abrirEditor?.(req || {}); }
