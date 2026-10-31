/* ============================ CONTADOR DE SUSCRIPTORES (v3.23) ============================
   Él: "que se pueda reproducir la ventana del contador de suscriptores de YouTube Studio con el contador solo,
   que no salga nada más en el overlay, y poder añadir texto para poner la meta de suscriptores".
   Una ventana de Studio con la página en tiempo real de YouTube Studio (la única con el número EXACTO): se le
   pone SU estilo (el de su extensión: Komika Axis, borde negro de 8 px, croma magenta, el dígito que sube
   deslizándose), se esconde todo lo demás y debajo va el texto de la meta. En OBS: «Captura de ventana» +
   filtro «Clave de croma» magenta. La sesión de Google se inicia una vez en esa ventana (la pone él) y se
   queda guardada en su partición, aparte del resto de Studio. */
const { app, BrowserWindow, ipcMain, screen } = require("electron");
const path = require("path");
const fs = require("fs");

const CANAL = "UCF-3SarqM5bvy3sBT_avssQ";
const url = canal => process.env.STUDIO_CONTADOR_URL || `https://studio.youtube.com/channel/${canal}/analytics/tab-overview/period-default/explore?entity_type=CHANNEL&entity_id=${canal}&time_period=4_weeks&explore_type=SUBSCRIBERS`;
// v3.27: por perfil (su canal, sus opciones y su sesión de Google); RDeRandom conserva lo de antes
const perfilC = () => require("./carpetas.cjs");
const perfil = () => perfilC().perfilActivo();
const opcionesFile = () => path.join(perfilC().dirDatos(), "contador.json");
const particion = () => perfil() === "rderandom" ? "persist:contador-youtube" : "persist:contador-" + perfil();
// formato «fraccion» (él, 31/10: "el contador lo quiero estilo 34.345/100.000"): la meta al lado, con la misma letra;
// «debajo»: un texto libre debajo del número
const OP0 = { canal: CANAL, formato: "fraccion", meta: 100000, texto: "META: 10.000 SUBS", escala: 1, tamMeta: 30, colorMeta: "#ffffff", verMeta: true };
let win = null, winPerfil = null, op = { ...OP0 }, opPerfil = null;
function cargarOp() {
  if (opPerfil === perfil()) return;
  opPerfil = perfil();
  op = { ...OP0, canal: perfilC().canalDe(opPerfil) };
  try { op = { ...op, ...JSON.parse(fs.readFileSync(opcionesFile(), "utf8")), canal: perfilC().canalDe(opPerfil) }; } catch (e) {}
}
const guardarOp = () => { try { fs.mkdirSync(path.dirname(opcionesFile()), { recursive: true }); fs.writeFileSync(opcionesFile(), JSON.stringify(op)); } catch (x) {} };

// su CSS (el de la extensión, tal cual) + lo que esconde el resto de la página y coloca el contador y la meta
const CSS = `
.counter.yta-smooth-counter { --font-size: 50px !important; --digit-height: 50px !important; --digit-width: 38px !important; --non-digit-width: 18px !important; }
.counter.yta-smooth-counter, .counter.yta-smooth-counter * { overflow: visible !important; clip-path: none !important; max-height: none !important; }
#subscribers-label { display: none !important; }
.counter.yta-smooth-counter .counter-sequence-inner { transform: none !important; transition: none !important; }
.counter.yta-smooth-counter .counter-value { display: none !important; }
.counter.yta-smooth-counter[is-value-increasing] .counter-value[last],
.counter.yta-smooth-counter:not([is-value-increasing]) .counter-sequence-inner > .counter-value:first-child {
  display: block !important; position: absolute !important; top: 0 !important; left: 0 !important; }
.counter.yta-smooth-counter[is-value-increasing]:not(.counter-animating) .counter-sequence-inner:has(> .counter-value:not([last])) > .counter-value[last] { animation: rdr-espera 0.3s !important; }
.counter.yta-smooth-counter[is-value-increasing].counter-animating .counter-sequence-inner:has(> .counter-value:not([last])) > .counter-value[last] { animation: rdr-sube 0.45s cubic-bezier(0.22, 1, 0.36, 1) both !important; }
@keyframes rdr-espera { from, to { opacity: 0; } }
@keyframes rdr-sube { from { transform: translateY(60%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
html, body { background: #FF00FF !important; }
#counter-area, .small-counter-area, .large-counter-area { background: #FF00FF !important; }
.counter.yta-smooth-counter .counter-value { -webkit-text-stroke: 8px #000; paint-order: stroke fill; }
.counter.yta-smooth-counter, .counter.yta-smooth-counter * { font-family: "Komika Axis", sans-serif !important; }
/* ---- (Studio) solo el contador y la meta ---- */
.counter.yta-smooth-counter { -webkit-text-stroke: 8px #000; paint-order: stroke fill; }
html, body { overflow: hidden !important; }
body * { visibility: hidden !important; }
.rdr-sitio, .rdr-sitio * { visibility: visible !important; }
.rdr-sitio { position: fixed !important; left: 50% !important; top: 40% !important; margin: 0 !important; z-index: 2147483646 !important;
  transform: translate(-50%, -50%) scale(var(--rdr-escala, 1)) !important; background: transparent !important; }
#rdr-meta.rdr-fraccion { font-size: calc(50px * var(--rdr-escala, 1)); -webkit-text-stroke: calc(8px * var(--rdr-escala, 1)) #000; line-height: 1; }
#rdr-meta { position: fixed !important; left: 50%; top: calc(40% + 25px * var(--rdr-escala, 1) + 18px); transform: translateX(-50%);
  visibility: visible !important; z-index: 2147483647; white-space: nowrap; font-family: "Komika Axis", sans-serif;
  font-size: var(--rdr-meta-tam, 30px); color: var(--rdr-meta-color, #fff); -webkit-text-stroke: 6px #000; paint-order: stroke fill; }
`;
const JS = o => `(()=>{
  const o = ${JSON.stringify(o)}, r = document.documentElement;
  let m = document.getElementById("rdr-meta");
  if(!m){ m = document.createElement("div"); m.id = "rdr-meta"; document.body.appendChild(m); }
  const fr = o.formato === "fraccion";
  m.textContent = fr ? "/" + Number(o.meta || 0).toLocaleString("es-ES") : (o.texto || "");
  m.style.display = o.verMeta && m.textContent ? "block" : "none";
  m.classList.toggle("rdr-fraccion", fr);
  r.style.setProperty("--rdr-escala", o.escala || 1); r.style.setProperty("--rdr-meta-tam", (o.tamMeta || 30) + "px"); r.style.setProperty("--rdr-meta-color", o.colorMeta || "#fff");
  const colocar = () => { const c = document.querySelector(".counter.yta-smooth-counter"); if(!c) return false;
    const b = c.closest("#counter-area, .large-counter-area, .small-counter-area") || c;
    if(!b.classList.contains("rdr-sitio")){ document.querySelectorAll(".rdr-sitio").forEach(x=>x.classList.remove("rdr-sitio")); b.classList.add("rdr-sitio"); }
    // «34.345/100.000»: la meta pegada a la derecha del número y los dos juntos, centrados
    const mm = document.getElementById("rdr-meta"), o2 = window.__rdrOp || o;
    if(o2.formato === "fraccion" && mm.style.display !== "none"){
      const mw = mm.getBoundingClientRect().width, gap = 0, sh = (mw + gap) / 2;
      b.style.setProperty("left", "calc(50% - " + sh + "px)", "important");
      const r = c.getBoundingClientRect();
      mm.style.left = (r.right + gap) + "px"; mm.style.top = (r.top + r.height / 2) + "px"; mm.style.transform = "translateY(-50%)";
    } else { b.style.removeProperty("left"); mm.style.left = "50%"; mm.style.top = ""; mm.style.transform = "translateX(-50%)"; }
    return true; };
  window.__rdrOp = o;
  if(!window.__rdr) window.__rdr = setInterval(colocar, 700);
  return colocar();
})()`;

const enStudio = () => win && !win.isDestroyed() && /studio\.youtube\.com|^file:/.test(win.webContents.getURL());
async function aplicar() {
  if (!enStudio()) return false;
  try { await win.webContents.insertCSS(CSS); return await win.webContents.executeJavaScript(JS(op)); } catch (e) { return false; }
}

function abrir() {
  if (win && !win.isDestroyed() && winPerfil !== perfil()) win.close();     // (era la de otro perfil)
  if (win && !win.isDestroyed()) { win.show(); return win; }
  winPerfil = perfil();
  win = new BrowserWindow({ width: 560, height: 300, title: "Contador de suscriptores", backgroundColor: "#FF00FF", autoHideMenuBar: true,
    icon: path.join(__dirname, "..", "build", "icon.png"),
    show: !process.env.STUDIO_CAPTURA,
    webPreferences: { partition: particion(), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  // (Google no deja iniciar sesión en un navegador que se presenta como Electron: se presenta como Chrome)
  win.webContents.setUserAgent(`Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`);
  win.on("page-title-updated", e => e.preventDefault());
  // fuera de Studio (la página de Google para entrar) la ventana se hace grande; en el contador, a su tamaño
  const mirar = () => {
    if (!win || win.isDestroyed()) return;
    if (enStudio()) { aplicar(); setTimeout(aplicar, 1500); setTimeout(aplicar, 5000); }
    if (process.env.STUDIO_CAPTURA && enStudio()) setTimeout(async () => {      // (pruebas: su captura)
      try { const img = await win.webContents.capturePage(); fs.mkdirSync(process.env.STUDIO_CAPTURA, { recursive: true });
        fs.writeFileSync(path.join(process.env.STUDIO_CAPTURA, "contador.png"), img.toPNG()); } catch (x) {}
    }, 2500);
    else { const [w, h] = win.getSize(); if (w < 800) win.setSize(900, 720); }
  };
  win.webContents.on("did-finish-load", mirar);
  win.webContents.on("did-navigate-in-page", mirar);
  const esta = win;
  win.on("closed", () => { if (win === esta) win = null; });   // (al cambiar de perfil se cierra la vieja y ya hay otra)
  if (process.env.STUDIO_CAPTURA) {      // (pruebas: en la pantalla del portátil, nunca en la suya)
    const pri = screen.getPrimaryDisplay(), d = screen.getAllDisplays().find(x => x.id !== pri.id) || pri;
    win.setPosition(d.workArea.x + 40, d.workArea.y + 40);
    win.showInactive();
  }
  win.loadURL(url(op.canal || CANAL));
  return win;
}

ipcMain.handle("contador-abrir", async (e, nuevas) => {
  cargarOp();
  op = { ...op, ...(nuevas || {}), canal: perfilC().canalDe(perfil()) };
  guardarOp();
  abrir();
  return { ok: true, op };
});
ipcMain.handle("contador-meta", async (e, nuevas) => {
  cargarOp();
  op = { ...op, ...(nuevas || {}), canal: perfilC().canalDe(perfil()) };
  guardarOp();
  const mia = !!(win && !win.isDestroyed() && winPerfil === perfil());
  return { ok: true, abierta: mia, contador: mia ? await aplicar() : false, op };
});
ipcMain.handle("contador-estado", async () => { cargarOp(); return { abierta: !!(win && !win.isDestroyed() && winPerfil === perfil()), enStudio: !!enStudio(), op }; });
