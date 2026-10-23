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
  // Ranking de Shorts (v3): lo calcula el clon en el PC con Claude Opus
  rankingDatos: () => ipcRenderer.invoke("ranking-datos"),
  rankingAnalizar: (opts) => ipcRenderer.invoke("ranking-analizar", opts || {}),
  rankingCancelar: () => ipcRenderer.invoke("ranking-cancelar"),
  rankingAbrir: (carpeta) => ipcRenderer.invoke("ranking-abrir", carpeta),
  rankingVerificar: () => ipcRenderer.invoke("ranking-verificar"),
  rankingSubido: (n, si) => ipcRenderer.invoke("ranking-subido", n, si),
  rankingEliminar: (n, recuperar) => ipcRenderer.invoke("ranking-eliminar", n, !!recuperar),
  onRankingProgreso: (cb) => {
    const h = (e, d) => cb(d);
    ipcRenderer.on("ranking-progreso", h);
    return () => ipcRenderer.removeListener("ranking-progreso", h);
  },
  // El clon dentro de Studio (v3.1): directos, clips y montaje sin CapCut
  clonConsultar: (args) => ipcRenderer.invoke("clon-consultar", args),
  clonTarea: (args) => ipcRenderer.invoke("clon-tarea", args),
  clonTareaEstado: () => ipcRenderer.invoke("clon-tarea-estado"),
  clonCancelar: () => ipcRenderer.invoke("clon-cancelar"),
  clonAbrir: (ruta) => ipcRenderer.invoke("clon-abrir", ruta),
  clonElegirCarpeta: () => ipcRenderer.invoke("clon-elegir-carpeta"),
  onClonProgreso: (cb) => {
    const h = (e, d) => cb(d);
    ipcRenderer.on("clon-progreso", h);
    return () => ipcRenderer.removeListener("clon-progreso", h);
  },
  // Convertidor YT dentro de Studio (v3.4)
  ytDestinos: () => ipcRenderer.invoke("yt-destinos"),
  ytDescargar: (o) => ipcRenderer.invoke("yt-descargar", o),
  ytCancelar: () => ipcRenderer.invoke("yt-cancelar"),
  ytAbrir: (ruta) => ipcRenderer.invoke("yt-abrir", ruta),
  ytElegirCarpeta: () => ipcRenderer.invoke("yt-elegir-carpeta"),
  onYtProgreso: (cb) => {
    const h = (e, d) => cb(d);
    ipcRenderer.on("yt-progreso", h);
    return () => ipcRenderer.removeListener("yt-progreso", h);
  },
  // RandomChat dentro de Studio (v3.6): encender/apagar el chat de OBS y pasarle la sesión de YouTube
  chatEstado: () => ipcRenderer.invoke("chat-estado"),
  chatEncender: () => ipcRenderer.invoke("chat-encender"),
  chatApagar: () => ipcRenderer.invoke("chat-apagar"),
  chatSesion: (refreshToken, backend) => ipcRenderer.invoke("chat-sesion", refreshToken, backend),
  chatOlvidar: () => ipcRenderer.invoke("chat-olvidar"),
  chatRegistro: () => ipcRenderer.invoke("chat-registro"),
  chatAbrir: (que) => ipcRenderer.invoke("chat-abrir", que),
  onUploadProgress: (cb) => {
    const h = (e, d) => cb(d);
    ipcRenderer.on("studio-upload-progress", h);
    return () => ipcRenderer.removeListener("studio-upload-progress", h);
  }
});
