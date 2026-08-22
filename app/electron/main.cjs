/* RDeRandom Studio — proceso principal de Electron.
   Guarda los datos en un archivo local (con copia diaria) y gestiona el
   login de Google en una ventana propia, sin depender de la web. */
const { app, BrowserWindow, ipcMain, shell } = require("electron");
const fs = require("fs");
const path = require("path");

app.setAppUserModelId("com.rderandom.studio");

// Con STUDIO_DEBUG=1, los mensajes de consola de la app salen por la terminal
if (process.env.STUDIO_DEBUG) {
  app.on("web-contents-created", (e, wc) => {
    wc.on("console-message", (ev, level, message) => console.log("[app]", typeof ev === "object" && ev.message !== undefined ? ev.message : message));
    wc.on("did-fail-load", (ev, code, desc, url) => console.log("[fallo-carga]", code, desc, url));
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

let mainWindow = null;

const dataDir = () => app.getPath("userData");
const dataFile = () => path.join(dataDir(), "datos.json");

// Primera escritura de cada día → copia en /copias (se conservan las últimas 30)
function copiaDiaria(txt) {
  try {
    const dia = new Date().toISOString().slice(0, 10);
    const dir = path.join(dataDir(), "copias");
    fs.mkdirSync(dir, { recursive: true });
    const f = path.join(dir, "datos-" + dia + ".json");
    if (!fs.existsSync(f)) fs.writeFileSync(f, txt);
    const files = fs.readdirSync(dir).filter(x => x.startsWith("datos-")).sort();
    while (files.length > 30) fs.unlinkSync(path.join(dir, files.shift()));
  } catch (e) {}
}

ipcMain.on("studio-load", (e) => {
  try { e.returnValue = fs.readFileSync(dataFile(), "utf8"); }
  catch (err) { e.returnValue = null; }
});

ipcMain.on("studio-save", (e, txt) => {
  try {
    if (typeof txt !== "string") return;
    fs.mkdirSync(dataDir(), { recursive: true });
    const f = dataFile();
    fs.writeFileSync(f + ".tmp", txt);
    fs.renameSync(f + ".tmp", f);
    copiaDiaria(txt);
  } catch (err) {}
});

ipcMain.on("studio-clear", () => {
  try { fs.unlinkSync(dataFile()); } catch (err) {}
});

// OAuth de Google: abre la pantalla de login en una ventana propia e intercepta
// la vuelta (redirect) para capturar el token sin llegar a cargar la web.
// En modo silencioso (prompt=none) la ventana ni se muestra.
ipcMain.handle("studio-oauth", (ev, url, redirect, opts) => new Promise((resolve) => {
  const silent = !!(opts && opts.silent);
  let win = new BrowserWindow({
    width: 540, height: 680,
    show: false,
    parent: mainWindow || undefined,
    autoHideMenuBar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });
  let done = false;
  const finish = (hash) => {
    if (done) return; done = true;
    try { win.destroy(); } catch (e) {}
    win = null;
    resolve(hash || "");
  };
  const check = (u) => {
    if (u && typeof u === "string" && u.startsWith(redirect)) {
      const i = u.indexOf("#");
      finish(i >= 0 ? u.slice(i) : "");
      return true;
    }
    return false;
  };
  win.webContents.on("will-redirect", (e, u) => { if (check(u)) e.preventDefault(); });
  win.webContents.on("will-navigate", (e, u) => { if (check(u)) e.preventDefault(); });
  win.webContents.on("did-navigate", (e, u) => { check(u); });
  win.on("closed", () => finish(""));
  if (silent) setTimeout(() => finish(""), 12000);
  else win.once("ready-to-show", () => { try { win.show(); } catch (e) {} });
  win.loadURL(url).catch(() => finish(""));
}));

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 900,
    minWidth: 900, minHeight: 600,
    backgroundColor: "#000000",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  // Los enlaces externos (YouTube Studio, etc.) se abren en el navegador normal
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (e, u) => {
    // La app es de una sola página: cualquier navegación fuera se bloquea
    if (!u.startsWith("file:")) { e.preventDefault(); if (/^https?:/i.test(u)) shell.openExternal(u); }
  });
  mainWindow.on("closed", () => { mainWindow = null; });
}

app.on("second-instance", () => {
  if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
});

app.whenReady().then(createWindow);
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on("window-all-closed", () => app.quit());
