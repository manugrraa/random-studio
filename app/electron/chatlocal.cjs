/* 2/11, él: "pásale al ordenador la carpeta con el RandomChat, que no puedo ver el chat en la otra pantalla porque no
   tiene los archivos… en forma de actualización". El RandomChat viaja dentro de cada versión de Studio (app/chat, lo
   copia tools/chat.mjs). En el equipo de los directos (el portátil, con E:\A RdeRandom\RandomChat) se usa esa carpeta
   como siempre. En los demás se instala en los datos de Studio y se enciende en modo ESPEJO: solo lee el chat (y deja
   moderar); sin lector de suscriptores, sin RandomBot, sin voz y sin contador, para no duplicar nada ni gastar cuota.
   Se enciende con el Node de la propia app (ELECTRON_RUN_AS_NODE): el ordenador no necesita tener Node instalado. */
const { app } = require("electron");
const path = require("path");
const fs = require("fs");

const ORIGEN = process.env.RANDOMCHAT_DIR || "E:\\A RdeRandom\\RandomChat";
const espejo = !fs.existsSync(path.join(ORIGEN, "src", "server.js"));
const instalado = () => path.join(app.getPath("userData"), "RandomChat");
const empaquetado = path.join(__dirname, "..", "chat");

function chatDir() { return espejo ? instalado() : ORIGEN; }
/** Los datos del chat de cada canal en el espejo (su config.json y sus registros). */
function datosEspejo(perfil) { return path.join(instalado(), "datos", perfil || "rderandom"); }

const leerJson = f => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { return null; } };
// (los archivos de dentro del .asar se leen con el fs de Electron; se copian uno a uno)
function copiar(de, a) {
  for (const f of fs.readdirSync(de)) {
    const x = path.join(de, f), y = path.join(a, f);
    if (fs.statSync(x).isDirectory()) { fs.mkdirSync(y, { recursive: true }); copiar(x, y); }
    else fs.writeFileSync(y, fs.readFileSync(x));
  }
}
/** Instala (o pone al día) la copia del chat si esta versión trae otra. No toca studio.key, logs ni datos. */
function instalar() {
  if (!espejo) return { ok: true, origen: true };
  const nuevo = leerJson(path.join(empaquetado, "manifiesto.json"));
  if (!nuevo) return { ok: false, error: "Esta versión de Studio no trae el RandomChat" };
  const dest = instalado();
  const actual = leerJson(path.join(dest, "manifiesto.json"));
  if (actual && actual.huella === nuevo.huella && fs.existsSync(path.join(dest, "src", "server.js"))) return { ok: true, ya: true };
  try {
    for (const d of ["src", "public", "node_modules"]) {
      fs.rmSync(path.join(dest, d), { recursive: true, force: true });
    }
    fs.mkdirSync(dest, { recursive: true });
    // (su node_modules viaja como «modulos»: electron-builder quita las carpetas node_modules que no son de la app)
    for (const [d, a] of [["src", "src"], ["public", "public"], ["modulos", "node_modules"]]) { fs.mkdirSync(path.join(dest, a), { recursive: true }); copiar(path.join(empaquetado, d), path.join(dest, a)); }
    fs.writeFileSync(path.join(dest, "package.json"), fs.readFileSync(path.join(empaquetado, "package.json")));
    fs.writeFileSync(path.join(dest, "manifiesto.json"), JSON.stringify(nuevo));     // (lo último: si se corta, se repite)
    return { ok: true, instalado: nuevo.huella };
  } catch (e) { return { ok: false, error: "No se ha podido instalar el RandomChat: " + e.message }; }
}

module.exports = { espejo, chatDir, datosEspejo, instalar };
