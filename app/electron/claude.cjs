/* La IA de RandomStudio (v3.30): Claude Code del propio equipo (`claude -p`), con la cuenta del plan Max.
 * Sustituye a Gemini. Solo funciona en el escritorio (necesita Claude Code instalado y con sesión iniciada).
 *
 * Se registra solo con require("./claude.cjs") (desde historias.cjs).
 */
const { ipcMain } = require("electron");
const { spawn, execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const MODELO = "claude-opus-5-5";

/** El claude.exe real (el .cmd de npm no acepta bien argumentos largos), como RandomClon/clon/agente.py.
 * v3.33.1: también el del instalador nativo (~/.local/bin) y el que trae la app de escritorio de Claude
 * (%LOCALAPPDATA%/Claude-Data/<cuenta>/claude-code/<versión>/<id>/claude.exe, el más nuevo). */
function exeClaude() {
  const npm = path.join(process.env.APPDATA || "", "npm");
  const exe = path.join(npm, "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe");
  if (fs.existsSync(exe)) return exe;
  const nativo = path.join(process.env.USERPROFILE || "", ".local", "bin", "claude.exe");
  if (fs.existsSync(nativo)) return nativo;
  try {
    const base = path.join(process.env.LOCALAPPDATA || "", "Claude-Data");
    const encontrados = [];
    for (const cuenta of fs.readdirSync(base)) {
      const cc = path.join(base, cuenta, "claude-code");
      if (!fs.existsSync(cc)) continue;
      for (const ver of fs.readdirSync(cc)) for (const id of fs.readdirSync(path.join(cc, ver))) {
        const f = path.join(cc, ver, id, "claude.exe");
        if (fs.existsSync(f)) encontrados.push({ f, ver: ver.split(".").map(Number) });
      }
    }
    encontrados.sort((a, b) => { for (let i = 0; i < 3; i++) if ((a.ver[i] || 0) !== (b.ver[i] || 0)) return (b.ver[i] || 0) - (a.ver[i] || 0); return 0; });
    if (encontrados[0]) return encontrados[0].f;
  } catch (e) {}
  try {
    const cmd = execFileSync("where", ["claude"], { encoding: "utf8", windowsHide: true }).split(/\r?\n/).find(Boolean);
    if (cmd) return cmd.trim();
  } catch (e) {}
  return null;
}

/* v3.37: el permiso de LARGA DURACIÓN de Claude Code (`claude setup-token`, el que Anthropic recomienda para automatizar).
 * Se guarda cifrado en este equipo (safeStorage) y se le pasa a Claude en CLAUDE_CODE_OAUTH_TOKEN: así no depende de la
 * sesión normal de Claude Code, que caduca y entonces RandomStudio no podía escribir guiones. */
const { app, safeStorage } = require("electron");
const registro = require("./registro.cjs");
const tokenArchivo = () => path.join(app.getPath("userData"), "claude.token");

/* (4.11.0) VARIAS CUENTAS DE CLAUDE (Maggi, Claudie y las que vengan). Cada equipo guarda los permisos que tenga, cifrados,
 * uno por cuenta: userData/claude-<cuenta>.token (nunca salen del equipo ni van al servidor). La cuenta con la que se gasta
 * se elige desde cualquier panel de administrador y llega a todos los equipos como orden («claude_cuenta»); se guarda en
 * userData/claude-cuentas.json { elegida: "auto"|"<cuenta>", cuando, limites: { <cuenta>: hasta } }.
 * «auto» = la cuenta de este equipo con más margen. Si la elegida se queda sin límite (o este equipo no tiene su permiso),
 * se usa otra que tenga margen en vez de esperar. El claude.token de antes se convierte en una cuenta al arrancar. */
const NOMBRE_CUENTA = /^[a-z0-9][a-z0-9-]{1,19}$/;
const archivoCuenta = (c) => path.join(app.getPath("userData"), "claude-" + c + ".token");
const cfgArchivo = () => path.join(app.getPath("userData"), "claude-cuentas.json");
function leerCfg() {
  try { const j = JSON.parse(fs.readFileSync(cfgArchivo(), "utf8")); return { elegida: j.elegida || "auto", cuando: Number(j.cuando) || 0, limites: j.limites || {}, migrada: j.migrada || "" }; }
  catch (e) { return { elegida: "auto", cuando: 0, limites: {}, migrada: "" }; }
}
function guardarCfg(c) { try { fs.writeFileSync(cfgArchivo(), JSON.stringify(c, null, 1)); } catch (e) {} }
/** El claude.token de antes pasa a ser la cuenta «maggi» (la del plan con el que se pegó; se puede renombrar en Ajustes). */
function migrar() {
  try {
    if (!fs.existsSync(tokenArchivo())) return;
    const c = leerCfg();
    const nombre = fs.existsSync(archivoCuenta("maggi")) ? "anterior" : "maggi";
    fs.renameSync(tokenArchivo(), archivoCuenta(nombre));
    c.migrada = nombre; guardarCfg(c);
    registro.anotar("claude", "el permiso de Claude de antes pasa a ser la cuenta «" + nombre + "»");
  } catch (e) {}
}
function cuentasAqui() {
  try { return fs.readdirSync(app.getPath("userData")).map(f => (f.match(/^claude-([a-z0-9-]+)\.token$/) || [])[1]).filter(c => c && NOMBRE_CUENTA.test(c)).sort(); }
  catch (e) { return []; }
}
function tokenDe(cuenta) {
  if (!cuenta) return "";
  try { const b = fs.readFileSync(archivoCuenta(cuenta)); return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(b).replace(/\s+/g, "") : ""; } catch (e) { return ""; }
}
const libre = (cfg, c) => !(Number(cfg.limites[c]) > Date.now());
/** Lo que lleva gastado una cuenta (lo más alto de sus dos ventanas); sin datos, 50 (ni la mejor ni la peor). */
const gastado = (c) => { const u = usoCuentas[c]; return u && u.ok ? Math.max((u.cinco && u.cinco.pct) || 0, (u.semana && u.semana.pct) || 0) : 50; };
/** La cuenta con la que trabaja este equipo AHORA y por qué. "" = ninguna guardada (se usa la sesión normal de Claude Code). */
function cuentaActiva() {
  const cfg = leerCfg(), hay = cuentasAqui();
  if (!hay.length) return { cuenta: "", motivo: "sin cuentas guardadas" };
  if (cfg.elegida !== "auto" && hay.includes(cfg.elegida) && libre(cfg, cfg.elegida)) return { cuenta: cfg.elegida, motivo: "elegida" };
  const conMargen = hay.filter(c => libre(cfg, c)).sort((a, b) => gastado(a) - gastado(b));
  const motivo = cfg.elegida === "auto" ? "automática: la de más margen"
    : !hay.includes(cfg.elegida) ? "este equipo no tiene el permiso de «" + cfg.elegida + "»"
    : "«" + cfg.elegida + "» está sin límite hasta las " + new Date(cfg.limites[cfg.elegida]).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  if (conMargen.length) return { cuenta: conMargen[0], motivo };
  // todas sin límite: la elegida si está aquí (o la que antes se restablezca)
  const antes = hay.slice().sort((a, b) => (Number(cfg.limites[a]) || 0) - (Number(cfg.limites[b]) || 0))[0];
  return { cuenta: hay.includes(cfg.elegida) ? cfg.elegida : antes, motivo: "todas sin límite" };
}
let _ultimaActiva = null;
function activaAnotada() {
  const a = cuentaActiva();
  if (_ultimaActiva !== null && _ultimaActiva !== a.cuenta) registro.anotar("claude", "CUENTA de Claude: ahora «" + (a.cuenta || "sesión de Claude Code") + "» (" + a.motivo + ")");
  _ultimaActiva = a.cuenta;
  return a;
}
function tokenClaude() { return tokenDe(cuentaActiva().cuenta); }
/* v3.41: Git Bash. Con él, Claude trabaja en Bash (rápido, como en el portátil); sin él, solo tiene PowerShell, que va
 * más lento y con el que fallaban muchos comandos. Se busca donde lo deja el instalador de Git (para todos o solo para
 * este usuario) y se le pasa a Claude; la pestaña «Equipos» avisa si falta y lo instala con un botón (winget). */
function rutaBash() {
  const c = [path.join(process.env.ProgramFiles || "C:\\Program Files", "Git", "bin", "bash.exe"),
    path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Git", "bin", "bash.exe"),
    path.join(process.env.LOCALAPPDATA || "", "Programs", "Git", "bin", "bash.exe")];
  return c.find(f => { try { return fs.existsSync(f); } catch (e) { return false; } }) || "";
}
const GUIA_POWERSHELL = "ESTE EQUIPO NO TIENE BASH: tus comandos se ejecutan en Windows PowerShell 5.1. Encadena con «;» (nunca «&&» ni «||»), "
  + "pon todas las rutas entre comillas (tienen espacios), usa «python» (no «python3») y, para leer o buscar, las herramientas Read, Grep y Glob, "
  + "que son mucho más rápidas que Get-Content o Select-String. Si tienes que hacer varios pasos seguidos, escríbelos en un .py y ejecútalo de una vez "
  + "en lugar de muchos comandos sueltos. No uses sed, grep, cat, head, tail, ls -la ni rm -rf: aquí no existen.";
let instalandoGit = false;   // (un segundo clic mientras instala hacía fallar a winget: «archivo en uso»)
ipcMain.handle("instalar-git", async () => instalandoGit ? { ok: false, error: "Ya se está instalando" } : new Promise((ok0) => {
  instalandoGit = true;
  const ok = (r) => { instalandoGit = false; ok0(r); };
  const p = spawn("winget", ["install", "--id", "Git.Git", "-e", "--scope", "user", "--silent", "--accept-package-agreements", "--accept-source-agreements"], { windowsHide: true });
  let out = "";
  p.stdout.on("data", d => out += d); p.stderr.on("data", d => out += d);
  p.on("error", (e) => ok({ ok: false, error: "No encuentro winget en este equipo: " + e.message }));
  p.on("close", (code) => ok(rutaBash() ? { ok: true, bash: rutaBash() } : { ok: false, error: (out.trim().split(/\r?\n/).slice(-2).join(" ") || "winget terminó con " + code).slice(0, 300) }));
}));

/** El entorno para lanzar Claude: sin las variables de otra sesión de Claude, y con el permiso guardado si lo hay. */
function entornoClaude(extra, cuenta) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_AGENT_SDK|ANTHROPIC_BASE_URL)/.test(k)));
  // (4.11.0) el permiso de la cuenta elegida (o la que se pida, p. ej. al probar una); RS_CLAUDE_CUENTA dice cuál fue
  const c = cuenta !== undefined ? cuenta : activaAnotada().cuenta;
  const t = tokenDe(c);
  if (t) env.CLAUDE_CODE_OAUTH_TOKEN = t;
  env.RS_CLAUDE_CUENTA = t ? c : "";
  const bash = rutaBash();
  if (bash) env.CLAUDE_CODE_GIT_BASH_PATH = bash;
  return Object.assign(env, extra || {});
}

// ¿Claude funciona DE VERDAD? (no basta con que esté instalado: la sesión puede haber caducado). Se recuerda 30 min.
let estado = { ok: null, error: "", cuando: 0 };
/** Prueba UNA cuenta (o la sesión normal si cuenta es ""): { ok, error }. */
async function probarCuenta(cuenta) {
  try {
    const r = await generar("Responde solo: ok", { segundos: 90, modelo: "claude-haiku-5-5", cuenta, silencio: true });
    return { ok: /ok/i.test(r), error: /ok/i.test(r) ? "" : "Respuesta rara: " + r.slice(0, 80) };
  } catch (e) {
    const m = e.message || String(e);
    // v3.37.2: el motivo real (antes todo salía como «caducada», también un permiso mal copiado)
    const conPermiso = !!tokenDe(cuenta);
    // (4.11.0) sin límite NO es «no funciona»: el permiso vale y se usa otra cuenta mientras tanto
    const lim = /limit/i.test(m) ? limiteReal(m) : 0;
    if (lim) limiteDe(m, cuenta);          // (la aparta hasta su hora)
    const error = lim ? "Sin límite hasta las " + new Date(lim).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
      : conPermiso && /Not logged in|401|invalid/i.test(m) ? "El permiso pegado no vale (¿incompleto?): vuelve a sacarlo con «claude setup-token» y pégalo entero"
      : /expired|Not logged in/i.test(m) ? "La sesión de Claude Code ha caducado: pon el permiso de larga duración (Ajustes de RandomHistorias)"
      : m.slice(0, 200);
    return { ok: false, error, limite: lim || 0 };
  }
}
async function comprobar(forzar) {
  if (!forzar && estado.cuando && Date.now() - estado.cuando < 30 * 60 * 1000) return estado;
  if (!exeClaude()) return (estado = { ok: false, error: "No encuentro Claude Code en este equipo", cuando: Date.now() });
  const a = activaAnotada();
  const r = await probarCuenta(a.cuenta);
  // si la activa se quedó sin límite y hay otra con margen, se prueba esa (ya es la activa)
  const b = !r.ok && r.limite ? cuentaActiva() : null;
  const r2 = b && b.cuenta !== a.cuenta ? await probarCuenta(b.cuenta) : r;
  estado = { ok: r2.ok, error: r2.error, cuando: Date.now(), cuenta: (b && b.cuenta !== a.cuenta ? b : a).cuenta };
  return estado;
}

/** Ejecuta Claude con un prompt (por stdin) y devuelve el texto. */
function generar(prompt, { sistema, cwd, modelo, segundos = 300, herramientas = false, cuenta, silencio } = {}) {
  return new Promise((ok, ko0) => {
    const exe = exeClaude();
    if (!exe) return ko0(new Error("No encuentro Claude Code en este equipo"));
    const env = entornoClaude(undefined, cuenta);
    const cta = env.RS_CLAUDE_CUENTA;
    // (4.11.0) cada tarea de Claude dice con qué cuenta se hizo; y si se acabó el límite, esa cuenta queda apartada
    if (!silencio) registro.anotar("claude", "tarea de Claude (" + (modelo || MODELO) + ") con la cuenta «" + (cta || "sesión de Claude Code") + "»");
    const ko = (e) => { e.cuenta = cta; if (!silencio && limiteDe(e.message, cta)) registro.anotar("claude", "la cuenta «" + (cta || "sesión") + "» llegó al límite"); ko0(e); };
    const args = ["-p", "--model", modelo || MODELO, "--output-format", "text"];
    if (sistema) args.push("--append-system-prompt", String(sistema));
    if (herramientas === "lectura") args.push("--tools", "Read", "Glob", "Grep");   // solo mirar el proyecto, sin tocar nada
    else if (!herramientas) args.push("--tools", "");
    const p = spawn(exe, args, { cwd: cwd || process.env.USERPROFILE, env, windowsHide: true, shell: /\.cmd$/i.test(exe) });
    let out = "", err = "";
    const t = setTimeout(() => { try { p.kill(); } catch (e) {} ko(new Error("Claude tardó demasiado")); }, segundos * 1000);
    p.stdout.on("data", d => out += d);
    p.stderr.on("data", d => err += d);
    p.on("error", e => { clearTimeout(t); ko(e); });
    p.on("close", code => {
      clearTimeout(t);
      if (code === 0 && out.trim()) ok(out.trim());
      else ko(new Error((err || out).trim().split("\n").slice(-2).join(" ") || ("Claude terminó con código " + code)));
    });
    p.stdin.end(String(prompt));
  });
}

ipcMain.handle("claude-generar", async (e, prompt, opts) => {
  try { return { ok: true, texto: await generar(prompt, { sistema: opts && opts.sistema }) }; }
  catch (x) { return { ok: false, error: x.message }; }
});
ipcMain.handle("claude-disponible", async () => ({ ok: !!exeClaude() }));
ipcMain.handle("claude-comprobar", async (e, forzar) => comprobar(!!forzar));
/** Guarda (o quita, con token vacío) el permiso de una cuenta en este equipo. */
function guardarCuenta(nombre, token) {
  const c = String(nombre || "").trim().toLowerCase();
  if (!NOMBRE_CUENTA.test(c)) throw new Error("El nombre de la cuenta: 2-20 letras minúsculas, números o guiones (p. ej. «claudie»)");
  // al copiarlo de la terminal, el salto de línea del permiso se convierte en un espacio: se quitan todos
  const t = String(token || "").replace(/\s+/g, "");
  if (!t) { try { fs.unlinkSync(archivoCuenta(c)); } catch (x) {} registro.anotar("claude", "quitado de este equipo el permiso de la cuenta «" + c + "»"); return; }
  if (!/^sk-ant-[\w-]+$/.test(t)) throw new Error("Eso no parece un permiso de Claude (empieza por sk-ant-)");
  if (!safeStorage.isEncryptionAvailable()) throw new Error("Windows no deja cifrar el permiso en este equipo");
  fs.writeFileSync(archivoCuenta(c), safeStorage.encryptString(t));
  const cfg = leerCfg(); delete cfg.limites[c]; guardarCfg(cfg);
  registro.anotar("claude", "guardado en este equipo el permiso de la cuenta «" + c + "»");
}
/** Lo que este equipo sabe de sus cuentas (sin permisos: solo nombres, límites y la elegida). Va en el estado del equipo. */
function resumenCuentas() {
  const cfg = leerCfg(), a = cuentaActiva();
  const ahora = Date.now();
  return { elegida: cfg.elegida, cuando: cfg.cuando, activa: a.cuenta, motivo: a.motivo, migrada: cfg.migrada || "",
    cuentas: cuentasAqui().map(c => ({ nombre: c, limiteHasta: Number(cfg.limites[c]) > ahora ? Number(cfg.limites[c]) : 0 })) };
}
/** La elección que llega de un panel de administrador (o de otro equipo al arrancar): gana la más nueva. */
function elegir(cuenta, cuando) {
  const c = String(cuenta || "").trim().toLowerCase();
  if (c !== "auto" && !NOMBRE_CUENTA.test(c)) throw new Error("Cuenta de Claude no válida");
  const cfg = leerCfg(), t = Number(cuando) || Date.now();
  if (t < cfg.cuando) return { ok: true, ...resumenCuentas(), vieja: true };
  cfg.elegida = c; cfg.cuando = t; guardarCfg(cfg);
  registro.anotar("claude", "ELEGIDA la cuenta de Claude «" + c + "»" + (c !== "auto" && !cuentasAqui().includes(c) ? " (este equipo NO tiene su permiso: usa otra)" : ""));
  estado.cuando = 0; activaAnotada();
  return { ok: true, ...resumenCuentas() };
}

ipcMain.handle("claude-token", async (e, token) => {   // (antes de la 4.11.0: un solo permiso) → la cuenta activa o «maggi»
  guardarCuenta(cuentaActiva().cuenta || "maggi", token);
  return comprobar(true);
});
ipcMain.handle("claude-cuentas", async () => ({ ok: true, ...resumenCuentas() }));
ipcMain.handle("claude-cuenta-guardar", async (e, nombre, token) => {
  try { guardarCuenta(nombre, token); } catch (x) { return { ok: false, error: x.message }; }
  if (!String(token || "").trim()) { estado.cuando = 0; return { ok: true, ...resumenCuentas() }; }
  const r = await probarCuenta(String(nombre).trim().toLowerCase());
  estado.cuando = 0; uso.cuando = 0;
  return { ...r, ...resumenCuentas(), ok: r.ok || !!r.limite };
});
ipcMain.handle("claude-cuenta-probar", async (e, nombre) => ({ ...(await probarCuenta(String(nombre || ""))), ...resumenCuentas() }));
ipcMain.handle("claude-cuenta-renombrar", async (e, de, a) => {
  const x = String(de || ""), y = String(a || "").trim().toLowerCase();
  if (!NOMBRE_CUENTA.test(x) || !NOMBRE_CUENTA.test(y)) return { ok: false, error: "Nombre no válido (2-20 letras minúsculas, números o guiones)" };
  if (!fs.existsSync(archivoCuenta(x))) return { ok: false, error: "Ese equipo no tiene la cuenta «" + x + "»" };
  if (fs.existsSync(archivoCuenta(y))) return { ok: false, error: "Ya hay una cuenta «" + y + "» en este equipo" };
  fs.renameSync(archivoCuenta(x), archivoCuenta(y));
  const cfg = leerCfg(); if (cfg.limites[x]) { cfg.limites[y] = cfg.limites[x]; delete cfg.limites[x]; } if (cfg.migrada === x) cfg.migrada = ""; guardarCfg(cfg);
  if (usoCuentas[x]) { usoCuentas[y] = usoCuentas[x]; delete usoCuentas[x]; }
  registro.anotar("claude", "la cuenta «" + x + "» se llama ahora «" + y + "»");
  return { ok: true, ...resumenCuentas() };
});
ipcMain.handle("claude-elegir", async (e, cuenta, cuando) => { try { return elegir(cuenta, cuando); } catch (x) { return { ok: false, error: x.message }; } });
app.whenReady().then(() => { migrar(); activaAnotada(); setTimeout(() => comprobar(false), 15000); });   // se comprueba sola al poco de arrancar

/** v3.40.4: ¿se paró por el LÍMITE de uso de Claude (o porque estaba saturado)? Devuelve la hora (ms) a la que conviene
 * reintentar: la del aviso («resets 9pm», «resets Nov 5, 3:30am», «…limit reached|1730000000») con 2 min de margen, o, si no
 * la dice, dentro de 30 min (saturado: 5 min). 0 si el fallo es otro. */
const MESES = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
/* (4.11.0) con varias cuentas: la que llegó al límite queda apartada hasta su hora y, si este equipo tiene otra con margen,
 * se reintenta en 1 min con esa (en vez de esperar horas). Sin cuenta (o sin otra), lo de siempre. */
function limiteDe(texto, cuenta) {
  const hasta = limiteReal(texto);
  if (!hasta || !cuenta || (/overloaded|529|saturad/i.test(String(texto)) && !/limit/i.test(String(texto)))) return hasta;
  const cfg = leerCfg();
  if (Number(cfg.limites[cuenta]) !== hasta) {
    cfg.limites[cuenta] = hasta; guardarCfg(cfg);
    estado.cuando = 0;
    activaAnotada();
  }
  return cuentasAqui().some(c => c !== cuenta && libre(cfg, c)) ? Date.now() + 60000 : hasta;
}
function limiteReal(texto) {
  const s = String(texto || "");
  const margen = 2 * 60000, ahora = Date.now();
  if (/overloaded|529|saturad/i.test(s) && !/limit/i.test(s)) return ahora + 5 * 60000;
  // (3.42.2) también «hit your 5-hour limit» y «hit your weekly limit»: el ordenador los contaba como fallo y gastaba reintentos
  if (!/usage limit|limit reached|hit your [\w-]* ?limit|rate.?limit|429|out of (extra )?usage|limit will reset|weekly limit|session limit|5-hour limit/i.test(s)) return 0;
  const ep = s.match(/limit reached\|(\d{10})/i);
  if (ep) return Math.max(Number(ep[1]) * 1000, ahora) + margen;
  const m = s.match(/resets?\s+(?:at\s+)?(?:([A-Za-z]{3})[a-z]*\s+(\d{1,2}),?\s+(?:at\s+)?)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (m) {
    let h = Number(m[3]) % 24;
    if (m[5]) h = (Number(m[3]) % 12) + (/pm/i.test(m[5]) ? 12 : 0);
    const d = new Date();
    if (m[1] && MESES[m[1].toLowerCase()] !== undefined) d.setMonth(MESES[m[1].toLowerCase()], Number(m[2]));
    d.setHours(h, Number(m[4] || 0), 0, 0);
    if (d.getTime() <= ahora) d.setDate(d.getDate() + 1);
    if (d.getTime() - ahora < 8 * 86400000) return d.getTime() + margen;
  }
  return ahora + 30 * 60000;
}

/* v3.40.6: cuánto llevas gastado del plan de Claude (la ventana de 5 h y la semana), para pedir más o menos historias.
 * 1) /api/oauth/usage, si el permiso lo deja (el de la sesión normal de Claude Code); 2) si no, las cabeceras de una
 * consulta mínima a Haiku (el permiso de larga duración solo deja hacer consultas). Se recuerda 10 min. */
let uso = { ok: null, cuando: 0 };
function tokenCli() {
  try {
    const o = JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE || "", ".claude", ".credentials.json"), "utf8")).claudeAiOauth || {};
    return o.accessToken && o.expiresAt > Date.now() ? o.accessToken : "";
  } catch (e) { return ""; }
}
const ventana = (pct, reinicio) => (pct == null || isNaN(pct) ? null : { pct: Math.max(0, Math.min(100, Math.round(pct))), reinicio: reinicio || 0 });
// (4.11.0) el uso de CADA cuenta guardada aquí ({ <cuenta>: { ok, cinco, semana, cuando } }); arriba, el de la activa
let usoCuentas = {};
async function leerUso(forzar) {
  if (!forzar && uso.cuando && Date.now() - uso.cuando < 10 * 60000) return uso;
  const hay = cuentasAqui();
  if (!hay.length) return leerUsoUna(tokenCli(), "");
  const nuevo = {};
  for (const c of hay) nuevo[c] = { ...(await leerUsoUna("", c)), cuando: Date.now() };
  usoCuentas = nuevo;
  const a = cuentaActiva().cuenta, ua = nuevo[a] || { ok: false, error: "sin datos" };
  const cfg = leerCfg();
  uso = { ...ua, cuando: Date.now(), cuenta: a,
    cuentas: Object.fromEntries(hay.map(c => [c, { ok: !!nuevo[c].ok, cinco: nuevo[c].cinco || null, semana: nuevo[c].semana || null, error: nuevo[c].error || "",
      limiteHasta: Number(cfg.limites[c]) > Date.now() ? Number(cfg.limites[c]) : 0 }])) };
  // «auto» o la elegida al 100 %: si con el uso nuevo cambia la mejor cuenta, queda anotado
  activaAnotada();
  return uso;
}
/** El uso de una cuenta (cuenta = nombre) o de la sesión normal de Claude Code (cli = su permiso, cuenta = ""). */
async function leerUsoUna(cli, cuenta) {
  const cabeceras = (t) => ({ Authorization: "Bearer " + t, "anthropic-beta": "oauth-2025-04-20", "anthropic-version": "2023-06-01", "content-type": "application/json" });
  const largo = cuenta ? tokenDe(cuenta) : "";
  const fin = (o) => (cuenta ? o : (uso = o));   // con nombre, solo se devuelve (lo junta leerUso)
  try {
    if (cli) {
      const r = await fetch("https://api.anthropic.com/api/oauth/usage", { headers: cabeceras(cli) });
      if (r.ok) {
        const j = await r.json(), w = (x) => x && ventana(Number(x.utilization), x.resets_at ? Date.parse(x.resets_at) : 0);
        return fin({ ok: true, cuando: Date.now(), cinco: w(j.five_hour), semana: w(j.seven_day) });
      }
    }
    const t = largo || cli;
    if (!t) return fin({ ok: false, cuando: Date.now(), error: "Sin permiso de Claude en este equipo" });
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: cabeceras(t),
      body: JSON.stringify({ model: "claude-haiku-5-5", max_tokens: 1, system: "You are Claude Code, Anthropic's official CLI for Claude.", messages: [{ role: "user", content: "ok" }] }) });
    const h = (k) => r.headers.get("anthropic-ratelimit-unified-" + k);
    const v = (k) => { const x = h(k + "-utilization"); return x == null ? null : ventana(Number(x) * 100, Number(h(k + "-reset")) * 1000); };
    const cinco = v("5h"), semana = v("7d");
    if (!cinco && !semana) return fin({ ok: false, cuando: Date.now(), error: "Claude no dijo el uso (" + r.status + ")" });
    return fin({ ok: true, cuando: Date.now(), cinco, semana, estado: h("status") || "" });
  } catch (e) { return fin({ ok: false, cuando: Date.now(), error: e.message || String(e) }); }
}
ipcMain.handle("claude-uso", async (e, forzar) => leerUso(!!forzar));

module.exports = { exeClaude, generar, MODELO, entornoClaude, comprobar, estadoClaude: () => estado, limiteDe, leerUso, rutaBash, GUIA_POWERSHELL,
  cuentaActiva, resumenCuentas, elegir };
