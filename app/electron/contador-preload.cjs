/* La ventana del contador de suscriptores (v3.28): YouTube Studio deja de actualizar el contador en tiempo real
   cuando cree que nadie lo mira (pestaña oculta, ventana minimizada o tapada). Aquí, antes de que cargue su código,
   la página se cree SIEMPRE visible y con el foco. (Junto con backgroundThrottling: false, que no frena sus
   temporizadores.) Se ejecuta en el mundo de la página con webFrame. */
const { webFrame } = require("electron");
webFrame.executeJavaScript(`(() => {
  const def = (o, k, v) => { try { Object.defineProperty(o, k, { configurable: true, get: () => v }); } catch (e) {} };
  def(Document.prototype, "visibilityState", "visible");
  def(Document.prototype, "hidden", false);
  def(Document.prototype, "webkitVisibilityState", "visible");
  def(Document.prototype, "webkitHidden", false);
  Document.prototype.hasFocus = () => true;
  for (const ev of ["visibilitychange", "webkitvisibilitychange", "blur", "pagehide", "freeze"])
    window.addEventListener(ev, e => e.stopImmediatePropagation(), true);
  document.addEventListener("visibilitychange", e => e.stopImmediatePropagation(), true);
})()`);
