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
const tokenArchivo = () => path.join(app.getPath("userData"), "claude.token");
function tokenClaude() {
  try { const b = fs.readFileSync(tokenArchivo()); return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(b) : ""; } catch (e) { return ""; }
}
/** El entorno para lanzar Claude: sin las variables de otra sesión de Claude, y con el permiso guardado si lo hay. */
function entornoClaude(extra) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_AGENT_SDK|ANTHROPIC_BASE_URL)/.test(k)));
  const t = tokenClaude();
  if (t) env.CLAUDE_CODE_OAUTH_TOKEN = t;
  return Object.assign(env, extra || {});
}

// ¿Claude funciona DE VERDAD? (no basta con que esté instalado: la sesión puede haber caducado). Se recuerda 30 min.
let estado = { ok: null, error: "", cuando: 0 };
async function comprobar(forzar) {
  if (!forzar && estado.cuando && Date.now() - estado.cuando < 30 * 60 * 1000) return estado;
  if (!exeClaude()) return (estado = { ok: false, error: "No encuentro Claude Code en este equipo", cuando: Date.now() });
  try {
    const r = await generar("Responde solo: ok", { segundos: 90, modelo: "claude-haiku-5-5" });
    estado = { ok: /ok/i.test(r), error: /ok/i.test(r) ? "" : "Respuesta rara: " + r.slice(0, 80), cuando: Date.now() };
  } catch (e) {
    const m = e.message || String(e);
    estado = { ok: false, cuando: Date.now(), error: /auth|OAuth|login|401|expired/i.test(m) ? "La sesión de Claude Code ha caducado: pon el permiso de larga duración (Ajustes de RandomHistorias)" : m.slice(0, 200) };
  }
  return estado;
}

/** Ejecuta Claude con un prompt (por stdin) y devuelve el texto. */
function generar(prompt, { sistema, cwd, modelo, segundos = 300, herramientas = false } = {}) {
  return new Promise((ok, ko) => {
    const exe = exeClaude();
    if (!exe) return ko(new Error("No encuentro Claude Code en este equipo"));
    const args = ["-p", "--model", modelo || MODELO, "--output-format", "text"];
    if (sistema) args.push("--append-system-prompt", String(sistema));
    if (herramientas === "lectura") args.push("--tools", "Read", "Glob", "Grep");   // solo mirar el proyecto, sin tocar nada
    else if (!herramientas) args.push("--tools", "");
    const p = spawn(exe, args, { cwd: cwd || process.env.USERPROFILE, env: entornoClaude(), windowsHide: true, shell: /\.cmd$/i.test(exe) });
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
ipcMain.handle("claude-token", async (e, token) => {
  const t = String(token || "").trim();
  if (!t) { try { fs.unlinkSync(tokenArchivo()); } catch (x) {} return comprobar(true); }
  if (!/^sk-ant-/.test(t)) throw new Error("Eso no parece un permiso de Claude (empieza por sk-ant-)");
  if (!safeStorage.isEncryptionAvailable()) throw new Error("Windows no deja cifrar el permiso en este equipo");
  fs.writeFileSync(tokenArchivo(), safeStorage.encryptString(t));
  return comprobar(true);
});
app.whenReady().then(() => setTimeout(() => comprobar(false), 15000));   // se comprueba sola al poco de arrancar

module.exports = { exeClaude, generar, MODELO, entornoClaude, comprobar, estadoClaude: () => estado };
