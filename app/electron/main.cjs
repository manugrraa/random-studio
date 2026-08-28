/* RDeRandom Studio — proceso principal de Electron.
   Guarda los datos en un archivo local (con copia diaria) y gestiona el
   login de Google en una ventana propia, sin depender de la web. */
const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const fs = require("fs");
const path = require("path");
const https = require("https");

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
      // Devolver el fragmento (#access_token, flujo antiguo) o la query (?code, flujo nuevo)
      const h = u.indexOf("#");
      if (h >= 0) { finish(u.slice(h)); return true; }
      const q = u.indexOf("?");
      finish(q >= 0 ? u.slice(q) : "");
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

/* ——— Carpeta local de vídeos y subida directa a YouTube ——— */
ipcMain.handle("studio-pick-folder", async () => {
  const r = await dialog.showOpenDialog(mainWindow || undefined, { properties: ["openDirectory"], title: "Elige tu carpeta de vídeos" });
  return (r.canceled || !r.filePaths.length) ? null : r.filePaths[0];
});

ipcMain.handle("studio-pick-video", async () => {
  const r = await dialog.showOpenDialog(mainWindow || undefined, {
    properties: ["openFile"], title: "Elige el vídeo a subir",
    filters: [{ name: "Vídeos", extensions: ["mp4", "mov", "mkv", "webm", "avi", "m4v"] }]
  });
  return (r.canceled || !r.filePaths.length) ? null : r.filePaths[0];
});

const EXT_VIDEO = new Set([".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v"]);
ipcMain.handle("studio-scan-videos", async (e, dir) => {
  const out = [];
  const walk = (d, depth) => {
    if (depth > 3 || out.length >= 800) return;
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch (err) { return; }
    for (const ent of entries) {
      if (out.length >= 800) return;
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) walk(p, depth + 1);
      else if (EXT_VIDEO.has(path.extname(ent.name).toLowerCase())) {
        try { const st = fs.statSync(p); out.push({ path: p, name: ent.name, size: st.size, mtime: st.mtimeMs }); } catch (err) {}
      }
    }
  };
  if (dir && fs.existsSync(dir)) walk(dir, 0);
  return out;
});

// Subida directa a YouTube (sesión reanudable) con progreso hacia la app
ipcMain.handle("studio-yt-upload", async (e, args) => {
  const { filePath, token, meta } = args || {};
  const wc = e.sender;
  if (!filePath || !fs.existsSync(filePath)) throw new Error("El archivo no existe");
  const size = fs.statSync(filePath).size;

  // 1. Abrir la sesión de subida
  const sesion = await new Promise((resolve, reject) => {
    const req = https.request("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Length": String(size),
        "X-Upload-Content-Type": "video/*"
      }
    }, res => {
      let body = ""; res.on("data", c => body += c);
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.headers.location) resolve(res.headers.location);
        else {
          let msg = ""; try { msg = JSON.parse(body)?.error?.message || body.slice(0, 200); } catch (x) { msg = body.slice(0, 200); }
          reject(new Error("YouTube rechazó la subida (" + res.statusCode + "): " + msg));
        }
      });
    });
    req.on("error", reject);
    req.end(JSON.stringify(meta));
  });

  // 2. Enviar el archivo con progreso
  return await new Promise((resolve, reject) => {
    const req = https.request(sesion, { method: "PUT", headers: { "Content-Length": String(size), "Content-Type": "video/*" } }, res => {
      let body = ""; res.on("data", c => body += c);
      res.on("end", () => {
        try {
          const data = JSON.parse(body || "{}");
          if (res.statusCode >= 200 && res.statusCode < 300 && data.id) resolve({ videoId: data.id });
          else reject(new Error(data?.error?.message || ("Error al subir (" + res.statusCode + ")")));
        } catch (err) { reject(new Error("Respuesta inesperada de YouTube (" + res.statusCode + ")")); }
      });
    });
    req.on("error", reject);
    let enviado = 0, ultimoPct = -1;
    const stream = fs.createReadStream(filePath, { highWaterMark: 1024 * 1024 });
    stream.on("data", chunk => {
      enviado += chunk.length;
      const pct = Math.round(enviado / size * 100);
      if (pct !== ultimoPct) { ultimoPct = pct; try { wc.send("studio-upload-progress", { pct, enviado, total: size }); } catch (err) {} }
    });
    stream.on("error", err => { try { req.destroy(err); } catch (x) {} reject(err); });
    stream.pipe(req);
  });
});

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
