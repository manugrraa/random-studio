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

// Los fallos de guardado se apuntan aquí en vez de tragárselos (v3: datos.json
// llevaba sin actualizarse desde el 23/8 mientras las copias diarias sí se hacían)
function apuntarError(donde, err) {
  try {
    fs.appendFileSync(path.join(dataDir(), "errores.log"),
      new Date().toISOString() + " " + donde + ": " + (err && (err.code || err.message) || err) + "\n");
  } catch (e) {}
}

ipcMain.on("studio-save", (e, txt) => {
  if (typeof txt !== "string") return;
  try {
    fs.mkdirSync(dataDir(), { recursive: true });
    const f = dataFile();
    fs.writeFileSync(f + ".tmp", txt);
    // en Windows el antivirus o el indexador pueden tener el .tmp abierto un
    // instante (EPERM/EBUSY): se reintenta y, si no, se escribe directo
    let ok = false;
    for (let i = 0; i < 5 && !ok; i++) {
      try { fs.renameSync(f + ".tmp", f); ok = true; }
      catch (err) { if (i === 4) apuntarError("renombrar", err); else { const t = Date.now() + 60; while (Date.now() < t) {} } }
    }
    if (!ok) { fs.writeFileSync(f, txt); try { fs.unlinkSync(f + ".tmp"); } catch (x) {} }
  } catch (err) { apuntarError("guardar", err); }
  copiaDiaria(txt);
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

// ——— RANKING DE SHORTS (v3) ———
// Lo calcula ranking_studio.py en la carpeta del clon: mide cada Short de
// "Shorts Listos" y Claude Opus 5.5 (su Claude Code del PC) pone la parte
// editorial. Aquí solo se lanza y se lee.
const { spawn } = require("child_process");
const CLON_DIR = process.env.RANDOMCLON_DIR || "E:\\A RdeRandom\\RandomClon";
const RANKING_PY = () => path.join(CLON_DIR, "ranking_studio.py");
let rankingProc = null;

function correrPython(args) {
  return new Promise((resolve, reject) => {
    const p = spawn("python", [RANKING_PY(), ...args], { cwd: CLON_DIR, env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
    let out = "", err = "";
    p.stdout.on("data", d => out += d); p.stderr.on("data", d => err += d);
    p.on("error", reject);
    p.on("close", code => code === 0 ? resolve(out) : reject(new Error((err || out).slice(-400) || ("código " + code))));
  });
}

ipcMain.handle("ranking-datos", async () => {
  if (!fs.existsSync(RANKING_PY())) return { error: "No encuentro " + RANKING_PY() };
  try {
    const [lista, ranking] = await Promise.all([correrPython(["lista"]), correrPython(["ranking"])]);
    return { lista: JSON.parse(lista), ranking: JSON.parse(ranking), analizando: !!rankingProc };
  } catch (e) { return { error: e.message }; }
});

ipcMain.handle("ranking-analizar", async (e, opts) => {
  if (rankingProc) return { error: "Ya hay un análisis en marcha" };
  const o = opts || {};
  const args = ["analizar", ...((o.numeros || []).map(String)), "--paralelo", String(o.paralelo || 3)];
  if (o.todo) args.push("--todo");
  const wc = e.sender;
  rankingProc = spawn("python", [RANKING_PY(), ...args], { cwd: CLON_DIR, env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
  let resto = "";
  rankingProc.stdout.on("data", d => {
    resto += d; const lineas = resto.split("\n"); resto = lineas.pop();
    for (const l of lineas) { try { wc.send("ranking-progreso", JSON.parse(l)); } catch (x) {} }
  });
  let err = "";
  rankingProc.stderr.on("data", d => err += d);
  rankingProc.on("close", code => {
    rankingProc = null;
    try { wc.send("ranking-progreso", { evento: "cerrado", codigo: code, error: code ? err.slice(-400) : "" }); } catch (x) {}
  });
  return { ok: true };
});

ipcMain.handle("ranking-cancelar", async () => {
  if (rankingProc) { try { rankingProc.kill(); } catch (x) {} }
  return { ok: true };
});

ipcMain.handle("ranking-abrir", async (e, carpeta) => {
  if (carpeta && carpeta.startsWith(CLON_DIR) && fs.existsSync(carpeta)) await shell.openPath(carpeta);
  return { ok: true };
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
