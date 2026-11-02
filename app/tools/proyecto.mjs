// Copia el CÓDIGO del proyecto de historias (kit, herramientas e instrucciones del estudio) dentro de RandomStudio, para
// que viaje con cada versión y los demás equipos (el ordenador) rueden con el mismo kit que el portátil (1-11-2026).
// Se ejecuta solo antes de `npm run build` (prebuild). No copia vídeos, audios ni historias: solo .py y .md.
//
//   proyecto/kit/*.py, proyecto/tools/*.py, proyecto/tools/estudio/*.md
//   proyecto/guiones/<guías>.md            (v3.41.3) las guías de guion e ideas
//   proyecto/historias/_plantilla/*        (v3.41.3) la plantilla buena: los scripts de la última historia entregada
//   proyecto/_memoria/*.md                 (v3.41.3) la memoria de las historias (el resto de equipos no la tenía)
//   proyecto/manifiesto.json  -> { fecha, archivos: { "kit/camera.py": sha256, ... } }
//
// En el equipo de origen deja el archivo .origen_kit: ahí nunca se sobrescribe nada al arrancar.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ORIGEN = process.env.RH_ORIGEN || "E:\\A RdeRandom\\RandomHistorias";
const DEST = path.join(APP, "proyecto");
const QUE = [["kit", /\.py$/], ["tools", /\.py$/], [path.join("tools", "estudio"), /\.md$/],
  ["guiones", /^(prompt-produccion|prompt-para-amigo|canal_nuevo|ideas_aprobadas|ideas_cifras|ideas_temporada)\.md$/],
  [path.join("historias", "_plantilla"), /\.(py|md|json)$/], ["_memoria", /\.md$/]];
// la memoria que es de las historias (la del portátil —disco, AppData, versiones— no le sirve al ordenador)
const MEMORIA = path.join(os.homedir(), ".claude", "projects", "E--A-RdeRandom-RandomHistorias", "memory");
const MEM_NO = /^(randomstudio-integracion|publicar-version-equipos|entorno-appdata-desviado|disco-c-lleno|optimizar-tokens|sesiones-coordinar-compilados)\.md$/;

if (!fs.existsSync(path.join(ORIGEN, "kit"))) {
  console.log("proyecto: no encuentro " + ORIGEN + " (se deja la copia que hubiera)");
  process.exit(0);
}

/* (2-11-2026, revisión) La plantilla se NORMALIZA al copiarla, vengan de la historia que vengan sus scripts:
 *  - montar.py: el número de historia sale de la carpeta (no «historia09_» fijo).
 *  - sincronizar.py: sin arranque acelerado por defecto (velocidad constante, como pidió Manu).
 *  - subtitulos.py: la fuente también se busca en assets/fuentes del proyecto (sin ella fallaba la etapa Animatic). */
function normalizarPlantilla(dir) {
  const fix = (n, f) => { const p = path.join(dir, n); if (!fs.existsSync(p)) return; const s = fs.readFileSync(p, "utf8"); const t = f(s); if (t !== s) fs.writeFileSync(p, t); };
  fix("montar.py", s => {
    let t = s.replace(/historia\d\d_\{quality\}/g, "historia{NN}_{quality}");
    if (/\{NN\}/.test(t) && !/^NN = /m.test(t)) t = t.replace(/^(HERE = .*\n)/m, "$1NN = os.path.basename(HERE)[:2]        # el número de la historia, de su carpeta\n");
    // (2-11-2026) contadores en el montaje: las cifras de contadores.py se dibujan sobre el plano limpio
    if (!/import contadores/.test(t)) {
      t = t.replace("from planos import SHOTS  # noqa: E402",
        "from planos import SHOTS  # noqa: E402\nsys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(HERE)), \"tools\"))\nimport contadores  # noqa: E402  (2-11-2026: las cifras sobre la cabeza se dibujan aquí, desde contadores.py)");
      t = t.replace("        out = os.path.join(tmp, f\"{sid}.mp4\")\n        vf = ",
        "        out = os.path.join(tmp, f\"{sid}.mp4\")\n        # contadores de contadores.py encima del plano limpio (corregir un número = editar y volver a montar)\n        con = os.path.join(tmp, f\"{sid}_contadores.mp4\")\n        if contadores.componer(HERE, sid, clip, con):\n            clip = con\n        vf = ");
    }
    return t;
  });
  fix("sincronizar.py", s => s.replace(/intro_t = float\(sys\.argv\[3\]\) if len\(sys\.argv\) > 3 else INTRO_TEMPO/, "intro_t = float(sys.argv[3]) if len(sys.argv) > 3 else tempo   # sin arranque acelerado: velocidad constante"));
  fix("subtitulos.py", s => s.replace(/    for d in \(os\.path\.join\(os\.environ\.get\("WINDIR", "C:\/Windows"\), "Fonts"\),/,
    '    for d in (os.path.join(os.path.dirname(os.path.dirname(HERE)), "assets", "fuentes"),      # la del proyecto, en cualquier equipo\n              os.path.join(os.environ.get("WINDIR", "C:/Windows"), "Fonts"),'));
}

// la plantilla: los scripts de la historia entregada más reciente (las instrucciones de cada etapa copian de aquí)
const plantilla = path.join(ORIGEN, "historias", "_plantilla");
const listas = process.env.RH_ENTREGAS || path.join(path.dirname(ORIGEN), "Vídeos RDR", "Editados", "RandomHistorias");
const hist = fs.readdirSync(path.join(ORIGEN, "historias")).filter(n => /^\d{2}_[\w-]+$/.test(n)).sort().reverse();
const tituloArch = (t) => t.trim().replace(/!+$/, "!");
const buena = hist.find(n => {
  try {
    const t = tituloArch(fs.readFileSync(path.join(ORIGEN, "historias", n, "titulo.txt"), "utf8"));
    return ["sincronizar.py", "mezclar.py", "montar.py", "rodar.py", "escena.py"].every(f => fs.existsSync(path.join(ORIGEN, "historias", n, f)))
      && fs.existsSync(path.join(listas, t, t + ".mp4"));
  } catch (e) { return false; }
});
if (buena) {
  fs.rmSync(plantilla, { recursive: true, force: true });
  fs.mkdirSync(plantilla, { recursive: true });
  const src = path.join(ORIGEN, "historias", buena);
  for (const f of fs.readdirSync(src)) if (/\.(py|json)$/.test(f) && !/^(cadena_estado|estudio)\.json$/.test(f) && fs.statSync(path.join(src, f)).isFile())
    fs.copyFileSync(path.join(src, f), path.join(plantilla, f));
  for (const f of ["titulo.txt", "narracion.txt"]) if (fs.existsSync(path.join(src, f))) fs.copyFileSync(path.join(src, f), path.join(plantilla, f.replace(".txt", "_ejemplo.md")));
  const g = fs.readdirSync(path.join(ORIGEN, "guiones")).find(n => n.startsWith("historia-" + buena.slice(0, 2) + "-"));
  if (g) fs.copyFileSync(path.join(ORIGEN, "guiones", g), path.join(plantilla, "guion_ejemplo.md"));
  normalizarPlantilla(plantilla);
  fs.writeFileSync(path.join(plantilla, "LEEME.md"), "Plantilla buena (scripts de la historia " + buena + ", la última entregada). "
    + "Cada historia nueva copia de aquí sincronizar.py, mezclar.py, subtitulos.py, montar.py, escena.py, rodar.py y la estructura de planos.py.\n");
}

// v3.41.7: referencia rápida del kit (una página con cada función pública y su uso): Claude ya no lee el kit entero
{
  const lineas = ["# Referencia rápida del kit (se genera sola al compilar RandomStudio; no la edites a mano)", "",
    "Cada función pública de `kit/*.py` con su primera línea de explicación. Para el detalle, Grep de esa función.", ""];
  for (const n of fs.readdirSync(path.join(ORIGEN, "kit")).filter(x => x.endsWith(".py") && !x.startsWith("_")).sort()) {
    const src = fs.readFileSync(path.join(ORIGEN, "kit", n), "utf8");
    const doc = (src.match(/^\s*"""([^\n]*)/) || [])[1] || "";
    lineas.push("## kit/" + n + (doc.trim() ? " — " + doc.trim() : ""));
    const re = /^def ([a-zA-Z]\w*)\(([^)]*)\)[^:]*:\s*\n(?:\s*"""([^\n]*))?/gm;
    let m;
    while ((m = re.exec(src))) lineas.push("- `" + m[1] + "(" + m[2].replace(/\s+/g, " ").slice(0, 120) + ")`" + (m[3] ? " — " + m[3].trim().replace(/"""$/, "") : ""));
    lineas.push("");
  }
  fs.writeFileSync(path.join(ORIGEN, "tools", "estudio", "kit_referencia.md"), lineas.join("\n"));
}

fs.rmSync(DEST, { recursive: true, force: true });
const archivos = {};
const meter = (rel, buf) => {
  fs.mkdirSync(path.dirname(path.join(DEST, rel)), { recursive: true });
  fs.writeFileSync(path.join(DEST, rel), buf);
  archivos[rel.replace(/\\/g, "/")] = crypto.createHash("sha256").update(buf).digest("hex");
};
for (const [dir, re] of QUE) {
  const src = dir === "_memoria" ? MEMORIA : path.join(ORIGEN, dir);
  if (!fs.existsSync(src)) continue;
  for (const n of fs.readdirSync(src)) {
    const f = path.join(src, n);
    if (!fs.statSync(f).isFile() || !re.test(n) || (dir === "_memoria" && (MEM_NO.test(n) || n === "MEMORY.md"))) continue;
    meter(path.join(dir, n), fs.readFileSync(f));
  }
}
// el índice de la memoria, sin las líneas de lo que no viaja
if (fs.existsSync(path.join(MEMORIA, "MEMORY.md"))) {
  const idx = fs.readFileSync(path.join(MEMORIA, "MEMORY.md"), "utf8").split(/\r?\n/)
    .filter(l => { const m = l.match(/\]\(([^)]+\.md)\)/); return !m || !MEM_NO.test(m[1]); }).join("\n");
  meter(path.join("_memoria", "MEMORY.md"), Buffer.from(idx, "utf8"));
}
fs.writeFileSync(path.join(DEST, "manifiesto.json"), JSON.stringify({ fecha: new Date().toISOString(), archivos }, null, 1));
fs.writeFileSync(path.join(ORIGEN, ".origen_kit"), "Este equipo es el ORIGEN del kit: RandomStudio nunca sobrescribe aquí kit/ ni tools/.\n");
console.log(`proyecto: ${Object.keys(archivos).length} archivos (kit, guías, plantilla de ${buena || "—"} y memoria) copiados dentro de RandomStudio`);
