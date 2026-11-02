/* v3.45.3 RESCATE DEL KIT (2/11, el ordenador no renderizaba: «cannot import name 'escuela' from 'kit'").
 * En el ordenador, Claude crea a veces un módulo nuevo del kit para una escena (kit/escuela.py). Al ponerse al día con el
 * kit del portátil, la 3.42.3 borraba todo lo que el portátil no tiene, y la historia ya no podía rodarse.
 * Aquí se buscan los módulos del kit que usan las historias y faltan, y se recuperan:
 *   1) de una copia apartada (_kit_local/<fecha>/kit/<nombre>.py, la más nueva);
 *   2) si no hay, del historial de Claude Code de este equipo (los .jsonl de ~/.claude/projects/…RandomHistorias): se repiten
 *      en orden sus Write/Edit/MultiEdit de ese archivo. Solo se pone si Python lo da por bueno (sintaxis).
 * Sin Electron: rescatar(raiz, { home }) -> { fecha, restaurados: [{ nombre, de }], faltan: [nombre] }. */
const fs = require("fs");
const os = require("os");
const path = require("path");

const leer = (p) => { try { return fs.readFileSync(p, "utf8"); } catch (e) { return ""; } };

/** Los módulos de «kit» que importa un script: from kit import (a, b), from kit.x import y, import kit.x */
function importados(src) {
  const out = new Set();
  const limpio = src.replace(/#[^\n]*/g, "");
  for (const m of limpio.matchAll(/^\s*from\s+kit\s+import\s+(\([^)]*\)|[^\n]+)/gm))
    for (const n of m[1].replace(/[()\\\n]/g, " ").split(",")) { const x = n.trim().split(/\s+/)[0]; if (/^\w+$/.test(x)) out.add(x); }
  for (const m of limpio.matchAll(/^\s*(?:from|import)\s+kit\.(\w+)/gm)) out.add(m[1]);
  // dentro del kit: from . import x / from .x import y
  for (const m of limpio.matchAll(/^\s*from\s+\.\s+import\s+(\([^)]*\)|[^\n]+)/gm))
    for (const n of m[1].replace(/[()\\\n]/g, " ").split(",")) { const x = n.trim().split(/\s+/)[0]; if (/^\w+$/.test(x)) out.add(x); }
  for (const m of limpio.matchAll(/^\s*from\s+\.(\w+)\s+import/gm)) out.add(m[1]);
  return out;
}

function scriptsDeHistorias(R) {
  const out = [];
  // (v3.45.4) también las que siguió otro equipo (historias/_relevadas): su módulo hay que poder mandárselo
  for (const h of [path.join(R, "historias"), path.join(R, "historias", "_relevadas")]) {
    let ns = []; try { ns = fs.readdirSync(h); } catch (e) { continue; }
    for (const n of ns) {
      if (!/^\d{2}_[\w-]+$/.test(n)) continue;
      let fs2 = []; try { fs2 = fs.readdirSync(path.join(h, n)); } catch (e) { continue; }
      for (const f of fs2) if (f.endsWith(".py")) out.push(path.join(h, n, f));
    }
  }
  return out;
}

/** Los módulos que faltan (y lo que importan los que ya hay en el kit, por si uno usa otro que también falta). */
function faltantes(R) {
  const kit = path.join(R, "kit"), vistos = new Set(), faltan = new Set();
  const pendientes = [];
  for (const s of scriptsDeHistorias(R)) for (const n of importados(leer(s))) pendientes.push(n);
  while (pendientes.length) {
    const n = pendientes.pop();
    if (vistos.has(n)) continue;
    vistos.add(n);
    const f = path.join(kit, n + ".py");
    if (fs.existsSync(f)) { for (const x of importados(leer(f))) pendientes.push(x); }
    else if (!fs.existsSync(path.join(kit, n))) faltan.add(n);       // (una subcarpeta del kit también vale)
  }
  return [...faltan].sort();
}

function deCopiaApartada(R, nombre) {
  const base = path.join(R, "_kit_local");
  let ns = []; try { ns = fs.readdirSync(base).sort().reverse(); } catch (e) { return null; }
  for (const n of ns) { const f = path.join(base, n, "kit", nombre + ".py"); if (fs.existsSync(f)) return { texto: leer(f), de: "_kit_local/" + n }; }
  return null;
}

/** Lo que el historial dice de kit/<nombre>.py, en orden: [{ t, tipo, ... }]. Se usa el RESULTADO de cada herramienta
 * (solo existe si funcionó): una lectura entera trae el archivo tal cual estaba (también con lo que se cambió por comandos),
 * una edición trae el original y el cambio, y una escritura el contenido. */
function cambiosEnHistorial(home, nombres, todos) {
  const raizP = path.join(home, ".claude", "projects");
  let dirs = []; try { dirs = fs.readdirSync(raizP).filter(d => todos || /RandomHistorias$/i.test(d)).map(d => path.join(raizP, d)); } catch (e) { return {}; }
  const archivos = [];
  const ver = (d, nivel) => { let ns = []; try { ns = fs.readdirSync(d); } catch (e) { return; }
    for (const n of ns) { const f = path.join(d, n); let st; try { st = fs.statSync(f); } catch (e) { continue; }
      if (st.isDirectory()) { if (nivel < 3) ver(f, nivel + 1); } else if (n.endsWith(".jsonl")) archivos.push(f); } };
  dirs.forEach(d => ver(d, 0));
  const quiero = new Map(nombres.map(n => [n.toLowerCase(), n]));
  const deQuien = (fp) => {
    const p = String(fp || "").replace(/\\/g, "/").toLowerCase();
    const m = p.match(/(?:^|\/)kit\/(\w+)\.py$/);
    return m && quiero.has(m[1]) ? quiero.get(m[1]) : null;
  };
  const out = {};
  for (const a of archivos) {
    const txt = leer(a);
    if (!txt || !/kit[\\/]+/i.test(txt)) continue;
    let orden = 0;
    for (const l of txt.split(/\r?\n/)) {
      if (!l.includes("toolUseResult") && !l.includes("tool_use")) continue;
      let j; try { j = JSON.parse(l); } catch (e) { continue; }
      // un comando (Bash/PowerShell) que nombra el archivo y escribe: esos cambios no se pueden repetir, solo avisar
      const cs = j && j.message && Array.isArray(j.message.content) ? j.message.content : [];
      for (const u of cs) {
        if (!u || u.type !== "tool_use" || !/^(Bash|PowerShell)$/.test(u.name) || !u.input) continue;
        const cmd = String(u.input.command || "");
        if (!/open\([^)]*['"]w|\.write|sed -i|Set-Content|Out-File|>\s*\S*kit/i.test(cmd)) continue;
        for (const m of cmd.matchAll(/kit[\\/]+(\w+)\.py/gi)) { const n = quiero.get(m[1].toLowerCase()); if (n) (out[n] = out[n] || []).push({ t: Date.parse(j.timestamp) || 0, o: orden++, a, tipo: "comando" }); }
      }
      const r = j && j.toolUseResult;
      if (!r || typeof r !== "object") continue;
      const t = Date.parse(j.timestamp) || 0, ev = (n, x) => n && (out[n] = out[n] || []).push({ t, o: orden++, a, ...x });
      if (r.file && typeof r.file.content === "string") {
        const fl = r.file;
        if ((fl.startLine || 1) <= 1 && (!fl.totalLines || (fl.numLines || 0) >= fl.totalLines)) ev(deQuien(fl.filePath), { tipo: "leido", texto: fl.content });
      } else if (typeof r.oldString === "string" && typeof r.newString === "string") {
        ev(deQuien(r.filePath), { tipo: "edit", original: typeof r.originalFile === "string" ? r.originalFile : null, edits: [{ old_string: r.oldString, new_string: r.newString, replace_all: !!r.replaceAll }] });
      } else if (Array.isArray(r.edits)) {
        ev(deQuien(r.filePath), { tipo: "edit", original: typeof r.originalFileContents === "string" ? r.originalFileContents : null, edits: r.edits.map(e => ({ old_string: e.old_string, new_string: e.new_string, replace_all: !!e.replace_all })) });
      } else if (typeof r.content === "string" && r.filePath && /^(create|update)$/.test(String(r.type))) {
        ev(deQuien(r.filePath), { tipo: "escrito", texto: r.content });
      }
    }
  }
  for (const n of Object.keys(out)) out[n].sort((x, y) => (x.t - y.t) || (x.a === y.a ? x.o - y.o : 0));
  return out;
}

function aplicarEdit(texto, e) {
  if (texto === null || texto === undefined || typeof e.old_string !== "string" || typeof e.new_string !== "string" || !e.old_string) return texto;
  const lf = (s) => s.replace(/\r\n/g, "\n");
  if (!texto.includes(e.old_string)) {
    // (la herramienta Edit acepta el cambio aunque el archivo tenga saltos de línea CRLF)
    const t = lf(texto), o = lf(e.old_string);
    if (!t.includes(o)) return texto;
    return e.replace_all ? t.split(o).join(lf(e.new_string)) : t.replace(o, () => lf(e.new_string));
  }
  return e.replace_all ? texto.split(e.old_string).join(e.new_string) : texto.replace(e.old_string, () => e.new_string);
}

/** Repite lo del historial. Devuelve el texto final o null si nunca se vio entero. */
function repetir(cambios) {
  let t = null;
  for (const c of cambios) {
    if (c.tipo === "leido" || c.tipo === "escrito") t = c.texto;
    else if (c.tipo === "edit") { if (c.original !== null) t = c.original; for (const e of c.edits) t = aplicarEdit(t, e); }
  }
  return t;
}

/** ¿Python lo acepta? (true si no hay Python para comprobarlo: mejor el archivo que nada) */
function sintaxisOk(f) {
  try {
    const r = require("child_process").spawnSync("python", ["-c", "import ast,sys;ast.parse(open(sys.argv[1],encoding='utf-8').read())", f], { windowsHide: true, timeout: 20000 });
    if (r.error) return true;
    return r.status === 0;
  } catch (e) { return true; }
}

function rescatar(R, opts) {
  const home = (opts && opts.home) || os.homedir();
  const res = { fecha: new Date().toISOString(), restaurados: [], faltan: [] };
  if (!R || !fs.existsSync(path.join(R, "kit"))) return res;
  // (varias vueltas: un módulo rescatado puede importar otro que también falta)
  for (let vuelta = 0; vuelta < 4; vuelta++) {
    const faltan = faltantes(R).filter(n => !res.faltan.includes(n));
    if (!faltan.length) break;
    const hist = cambiosEnHistorial(home, faltan);
    let alguno = false;
    for (const n of faltan) {
      const dst = path.join(R, "kit", n + ".py");
      let r = deCopiaApartada(R, n);
      if (!r && hist[n]) {
        const t = repetir(hist[n]);
        // los comandos que lo tocaron DESPUÉS de lo último que se vio entero o editado: puede faltarle algo
        const ultimo = Math.max(0, ...hist[n].filter(c => c.tipo !== "comando").map(c => c.t));
        const comandos = hist[n].filter(c => c.tipo === "comando" && c.t > ultimo).length;
        if (t) r = { texto: t, de: "historial de Claude", ...(comandos ? { aviso: comandos + " cambio(s) hechos con comandos que no se pueden repetir" } : {}) };
      }
      if (!r) { res.faltan.push(n); continue; }
      const tmp = dst + ".rescate";
      fs.writeFileSync(tmp, r.texto);
      if (!sintaxisOk(tmp)) { res.faltan.push(n); continue; }      // (se deja el .rescate para mirarlo)
      fs.renameSync(tmp, dst);
      res.restaurados.push({ nombre: n, de: r.de, lineas: r.texto.split("\n").length, ...(r.aviso ? { aviso: r.aviso } : {}) });
      alguno = true;
    }
    if (!alguno) break;
  }
  return res;
}

module.exports = { rescatar, faltantes, importados, cambiosEnHistorial, repetir };
