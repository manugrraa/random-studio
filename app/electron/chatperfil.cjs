/* 2/11, él: "has desconfigurado como yo tenía los chats y has quitado el contador de suscriptores": al abrir Studio
   en el perfil RandomHistorias, el RandomChat se encendía con los datos y el canal de ese perfil (otro config.json,
   otros overlays) y el contador leía otro canal. Ahora el chat (y su contador) van con el perfil de los DIRECTOS,
   por defecto RDeRandom, abras el perfil que abras; se cambia en la ventana del RandomChat › Ajustes. */
const { app } = require("electron");
const path = require("path");
const fs = require("fs");

const archivo = () => path.join(app.getPath("userData"), "chat_perfil.json");
const carpetas = () => require("./carpetas.cjs");

function chatPerfil() {
  try { const id = JSON.parse(fs.readFileSync(archivo(), "utf8")).perfil; if (carpetas().PERFILES[id] && !carpetas().PERFILES[id].local) return id; } catch (e) {}
  return "rderandom";
}
function ponerChatPerfil(id) {
  if (!carpetas().PERFILES[id] || carpetas().PERFILES[id].local) return false;
  try { fs.writeFileSync(archivo(), JSON.stringify({ perfil: id })); return true; } catch (e) { return false; }
}
/** Los perfiles con canal de YouTube (los locales no tienen directos). */
function perfilesConCanal() {
  return Object.entries(carpetas().PERFILES).filter(([, p]) => p && p.canal && !p.local).map(([id, p]) => ({ id, nombre: p.nombre || id }));
}

module.exports = { chatPerfil, ponerChatPerfil, perfilesConCanal };
