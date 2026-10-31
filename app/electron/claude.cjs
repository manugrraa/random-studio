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

/** El claude.exe real (el .cmd de npm no acepta bien argumentos largos), como RandomClon/clon/agente.py. */
function exeClaude() {
  const npm = path.join(process.env.APPDATA || "", "npm");
  const exe = path.join(npm, "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe");
  if (fs.existsSync(exe)) return exe;
  try {
    const cmd = execFileSync("where", ["claude"], { encoding: "utf8", windowsHide: true }).split(/\r?\n/).find(Boolean);
    if (cmd) return cmd.trim();
  } catch (e) {}
  return null;
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
    // sin las variables de una sesión de Claude que lo haya lanzado (si no, intenta usar su autenticación)
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_AGENT_SDK|ANTHROPIC_BASE_URL)/.test(k)));
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

module.exports = { exeClaude, generar, MODELO };
