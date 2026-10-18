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

// En modo captura (pruebas) se usa una carpeta de datos aparte: nunca toca sus
// datos ni choca con su Studio abierto
if (process.env.STUDIO_CAPTURA) app.setPath("userData", path.join(process.env.STUDIO_CAPTURA, "_datos_prueba"));
const gotLock = process.env.STUDIO_CAPTURA ? true : app.requestSingleInstanceLock();
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
    // v3.2: lista y ranking en UNA llamada (antes dos procesos de Python cada vez)
    const d = JSON.parse(await correrPython(["datos"]));
    return { lista: d.lista, ranking: d.ranking, eliminados: d.eliminados || [], analizando: !!rankingProc };
  } catch (e) { return { error: e.message }; }
});

// v3.2: los Shorts ya subidos, reconocidos por su miniatura en YouTube (o a mano)
ipcMain.handle("ranking-verificar", async () => {
  try {
    const out = await correrPython(["verificar", "150"]);
    const ev = out.split("\n").map(l => { try { return JSON.parse(l); } catch (x) { return null; } }).filter(Boolean);
    const fin = ev.find(x => x.evento === "fin"), err = ev.find(x => x.evento === "error");
    return err ? { error: err.error } : fin || { ok: true };
  } catch (e) { return { error: e.message }; }
});

// v3.4: eliminar un Short del ranking = a Shorts Listos/_Eliminados (se puede recuperar)
ipcMain.handle("ranking-eliminar", async (e, n, recuperar) => {
  if (!Number.isInteger(n)) return { error: "número no válido" };
  try { await correrPython([recuperar ? "recuperar" : "eliminar", String(n)]); return { ok: true }; }
  catch (x) {
    const m = String(x.message || x).match(/"error":\s*"([^"]+)"/);
    return { error: m ? m[1] : x.message };
  }
});

ipcMain.handle("ranking-subido", async (e, n, si) => {
  if (!Number.isInteger(n)) return { error: "número no válido" };
  try { await correrPython(["subido", String(n), si ? "si" : "no"]); return { ok: true }; }
  catch (x) { return { error: x.message }; }
});

ipcMain.handle("ranking-analizar", async (e, opts) => {
  if (rankingProc) return { error: "Ya hay un análisis en marcha" };
  const o = opts || {};
  const args = ["analizar", ...((o.numeros || []).map(String)), "--paralelo", String(o.paralelo || 3)];
  if (o.todo) args.push("--todo");
  if (["claude-opus-5-5", "claude-sonnet-5-5"].includes(o.modelo)) args.push("--modelo", o.modelo);
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

// ——— EL CLON DENTRO DE STUDIO (v3.1) ———
// clon.py es la entrada única de la inteligencia del clon: directos, clips y
// montaje sin CapCut. Las consultas rápidas devuelven sus eventos; las tareas
// largas (preparar, clipear, montar) van de una en una y mandan su progreso.
const CLON_PY = () => path.join(CLON_DIR, "clon.py");
const CONSULTAS = new Set(["estado", "vods", "clips", "cribar", "renombrar", "retencion", "aprender"]);
const TAREAS = new Set(["preparar", "clipear", "montar", "mejorar"]);
let tarea = null;          // { proc, args, eventos: [] }

function leerEventos(texto) {
  const out = [];
  for (const l of String(texto).split("\n")) { const s = l.trim(); if (s.startsWith("{")) { try { out.push(JSON.parse(s)); } catch (x) {} } }
  return out;
}

ipcMain.handle("clon-consultar", async (e, args) => {
  if (!Array.isArray(args) || !CONSULTAS.has(args[0]) || !args.every(a => typeof a === "string")) return { error: "Orden no válida" };
  if (!fs.existsSync(CLON_PY())) return { error: "No encuentro " + CLON_PY() };
  return await new Promise(resolve => {
    const p = spawn("python", [CLON_PY(), ...args], { cwd: CLON_DIR, env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
    let out = "", err = "";
    p.stdout.on("data", d => out += d); p.stderr.on("data", d => err += d);
    p.on("error", x => resolve({ error: x.message }));
    p.on("close", code => {
      const eventos = leerEventos(out);
      const fallo = eventos.find(x => x.evento === "error");
      resolve(code === 0 && !fallo ? { eventos } : { eventos, error: (fallo && fallo.mensaje) || err.slice(-400) || ("código " + code) });
    });
  });
});

ipcMain.handle("clon-tarea", async (e, args) => {
  if (tarea) return { error: "Ya hay una tarea del clon en marcha: " + tarea.args.slice(0, 2).join(" ") };
  if (!Array.isArray(args) || !TAREAS.has(args[0]) || !args.every(a => typeof a === "string")) return { error: "Tarea no válida" };
  const wc = e.sender;
  const proc = spawn("python", [CLON_PY(), ...args], { cwd: CLON_DIR, env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
  tarea = { proc, args, eventos: [], inicio: Date.now() };
  const enviar = ev => { tarea && (tarea.eventos.push(ev), tarea.eventos.length > 400 && tarea.eventos.shift()); try { wc.send("clon-progreso", ev); } catch (x) {} };
  let resto = "", err = "";
  proc.stdout.on("data", d => { resto += d; const ls = resto.split("\n"); resto = ls.pop(); leerEventos(ls.join("\n")).forEach(enviar); });
  proc.stderr.on("data", d => { err += d; if (err.length > 20000) err = err.slice(-10000); });
  proc.on("close", code => {
    leerEventos(resto).forEach(enviar);
    enviar({ evento: "cerrado", codigo: code, error: code ? err.slice(-500) : "", tarea: args[0] });
    tarea = null;
  });
  return { ok: true };
});

ipcMain.handle("clon-tarea-estado", async () => tarea ? { activa: true, args: tarea.args, eventos: tarea.eventos, inicio: tarea.inicio } : { activa: false });

ipcMain.handle("clon-cancelar", async () => {
  // el clon lanza ffmpeg, Whisper y Claude: se mata el árbol entero
  if (tarea && tarea.proc) { try { spawn("taskkill", ["/PID", String(tarea.proc.pid), "/T", "/F"]); } catch (x) {} }
  return { ok: true };
});

ipcMain.handle("clon-abrir", async (e, ruta) => {
  if (ruta && ruta.startsWith(CLON_DIR) && fs.existsSync(ruta)) await shell.openPath(ruta);
  return { ok: true };
});

// ——— CONVERTIDOR YT (v3.4) ———
// El mismo motor de su "Convertidor YT" (convertidor.py --cli): 8 conexiones,
// enlaces frescos si YouTube corta, yt-dlp que se actualiza solo.
const CONVERTIDOR_DIR = process.env.CONVERTIDOR_DIR || "E:\\A RdeRandom\\Convertidor YT";
const RAIZ_RDR = "E:\\A RdeRandom";
let ytProc = null;

ipcMain.handle("yt-destinos", async () => ([
  ["Descargas del convertidor", path.join(CONVERTIDOR_DIR, "Descargas")],
  ["Música de la biblioteca", path.join(CLON_DIR, "Biblioteca", "Música")],
  ["SFX de la biblioteca", path.join(CLON_DIR, "Biblioteca", "SFX")],
  ["VODs (para clipear)", path.join(CLON_DIR, "VODs")],
]));

ipcMain.handle("yt-descargar", async (e, o) => {
  if (ytProc) return { error: "Ya hay una descarga en marcha" };
  const url = String((o && o.url) || "").trim();
  if (!/^https?:\/\/(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//i.test(url)) return { error: "Eso no es un enlace de YouTube" };
  const formato = o.formato === "mp3" ? "mp3" : "mp4";
  const args = [path.join(CONVERTIDOR_DIR, "convertidor.py"), "--cli", url, formato,
    "--altura", String(parseInt(o.altura) || 1080), "--kbps", String(parseInt(o.kbps) || 192)];
  if (o.destino && String(o.destino).startsWith(RAIZ_RDR)) args.push("--destino", o.destino);
  const wc = e.sender;
  ytProc = spawn("python", args, { cwd: CONVERTIDOR_DIR, env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
  let resto = "";
  ytProc.stdout.on("data", d => { resto += d; const ls = resto.split("\n"); resto = ls.pop();
    leerEventos(ls.join("\n")).forEach(ev => { try { wc.send("yt-progreso", ev); } catch (x) {} }); });
  let err = ""; ytProc.stderr.on("data", d => { err += d; if (err.length > 8000) err = err.slice(-4000); });
  ytProc.on("close", code => { leerEventos(resto).forEach(ev => { try { wc.send("yt-progreso", ev); } catch (x) {} });
    try { wc.send("yt-progreso", { evento: "cerrado", codigo: code, error: code ? err.slice(-300) : "" }); } catch (x) {}
    ytProc = null; });
  return { ok: true };
});

ipcMain.handle("yt-cancelar", async () => {
  if (ytProc) { try { spawn("taskkill", ["/PID", String(ytProc.pid), "/T", "/F"]); } catch (x) {} }
  return { ok: true };
});

ipcMain.handle("yt-abrir", async (e, ruta) => {
  if (ruta && ruta.startsWith(RAIZ_RDR) && fs.existsSync(ruta)) {
    if (fs.statSync(ruta).isDirectory()) await shell.openPath(ruta); else shell.showItemInFolder(ruta);
  }
  return { ok: true };
});

ipcMain.handle("yt-elegir-carpeta", async () => {
  const r = await dialog.showOpenDialog(mainWindow || undefined, { properties: ["openDirectory"], title: "Dónde guardar las descargas", defaultPath: RAIZ_RDR });
  return (r.canceled || !r.filePaths.length) ? null : r.filePaths[0];
});

ipcMain.handle("clon-elegir-carpeta", async () => {
  const r = await dialog.showOpenDialog(mainWindow || undefined, { properties: ["openDirectory"], title: "Carpeta de los VODs",
    defaultPath: path.join(CLON_DIR, "VODs") });
  return (r.canceled || !r.filePaths.length) ? null : r.filePaths[0];
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
  // STUDIO_CAPTURA=carpeta: abre cada pestaña de STUDIO_PESTANAS ("Clips,Directos"),
  // guarda una captura de cada una y se cierra (pruebas del clon sin tocar la pantalla)
  if (process.env.STUDIO_CAPTURA) {
    const dir = process.env.STUDIO_CAPTURA;
    const pestanas = (process.env.STUDIO_PESTANAS || "Directos,Clips").split(",");
    const esperar = ms => new Promise(r => setTimeout(r, ms));
    mainWindow.webContents.once("did-finish-load", async () => {
      await esperar(5000);
      for (const p of pestanas) {
        // "~texto" = el primer botón que CONTIENE ese texto (una tarjeta de clip)
        // "#selector" = el primer elemento que case con ese selector CSS (el botón del menú)
        const contiene = p.startsWith("~"), css = p.startsWith("#"), txt = (contiene || css) ? p.slice(1) : p;
        await mainWindow.webContents.executeJavaScript(`(()=>{const t=${JSON.stringify(txt)};const b=${css}?document.querySelector(t):[...document.querySelectorAll("button")].find(x=>${contiene}?x.textContent.includes(t):x.textContent.trim()===t);b&&b.click();b&&setTimeout(()=>b.scrollIntoView({block:"start"}),300);return !!b;})()`);
        await esperar(Number(process.env.STUDIO_ESPERA || 9000));
        const v = await mainWindow.webContents.executeJavaScript(`(()=>{const v=document.querySelector("video");return v?{listo:v.readyState,dur:v.duration,err:v.error&&v.error.code}:null;})()`);
        if (v) console.log("[captura] video", JSON.stringify(v));
        const txt0 = await Promise.race([mainWindow.webContents.executeJavaScript(`document.body.innerText.length+" | "+(document.querySelector("h2")||{}).textContent`),
          esperar(5000).then(() => "LA PÁGINA NO RESPONDE")]);
        console.log("[captura]", p, "->", txt0);
        const img = await mainWindow.webContents.capturePage();
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, "studio_" + txt.replace(/[^\w]+/g, "_") + ".png"), img.toPNG());
      }
      app.quit();
    });
  }
}

app.on("second-instance", () => {
  if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
});

app.whenReady().then(createWindow);
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on("window-all-closed", () => app.quit());
