const { contextBridge, ipcRenderer } = require("electron");

// Puente seguro entre la app y el disco: si window.studioFS existe, la app
// está corriendo como programa de escritorio y guarda en archivo local.
contextBridge.exposeInMainWorld("studioFS", {
  load: () => ipcRenderer.sendSync("studio-load"),
  save: (txt) => ipcRenderer.send("studio-save", txt),
  clear: () => ipcRenderer.send("studio-clear"),
  oauth: (url, redirect, opts) => ipcRenderer.invoke("studio-oauth", url, redirect, opts || {})
});
