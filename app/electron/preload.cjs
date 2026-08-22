const { contextBridge, ipcRenderer } = require("electron");

// Puente seguro entre la app y el disco: si window.studioFS existe, la app
// está corriendo como programa de escritorio y guarda en archivo local.
contextBridge.exposeInMainWorld("studioFS", {
  load: () => ipcRenderer.sendSync("studio-load"),
  save: (txt) => ipcRenderer.send("studio-save", txt),
  clear: () => ipcRenderer.send("studio-clear"),
  oauth: (url, redirect, opts) => ipcRenderer.invoke("studio-oauth", url, redirect, opts || {}),
  // Carpeta local de vídeos + subida directa a YouTube
  pickFolder: () => ipcRenderer.invoke("studio-pick-folder"),
  pickVideo: () => ipcRenderer.invoke("studio-pick-video"),
  scanVideos: (dir) => ipcRenderer.invoke("studio-scan-videos", dir),
  ytUpload: (args) => ipcRenderer.invoke("studio-yt-upload", args),
  onUploadProgress: (cb) => {
    const h = (e, d) => cb(d);
    ipcRenderer.on("studio-upload-progress", h);
    return () => ipcRenderer.removeListener("studio-upload-progress", h);
  }
});
