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
  rankingCalibrar: () => ipcRenderer.invoke("ranking-calibrar"),
  temaVentana: (tema) => ipcRenderer.invoke("tema-ventana", tema),
  redGuardar: (p) => ipcRenderer.invoke("red-guardar", p),
  redAbrir: (n) => ipcRenderer.invoke("red-abrir", n),
  redLista: () => ipcRenderer.invoke("red-lista"),
  redGuardarTmp: (p) => ipcRenderer.invoke("red-guardar-tmp", p),
  redElegirArchivos: () => ipcRenderer.invoke("red-elegir-archivos"),
  redElegirDestino: (nombre) => ipcRenderer.invoke("red-elegir-destino", nombre),
  // v3.14: el RandomEditor en su propia ventana
  abrirEditor: (req) => ipcRenderer.invoke("editor-abrir", req || {}),
  editorListo: () => ipcRenderer.invoke("editor-listo"),
  // v3.14.1: el modo de rendimiento (gráfica dedicada, etc.) y reiniciar para aplicarlo
  rendimientoLeer: () => ipcRenderer.invoke("rendimiento-leer"),
  rendimientoPoner: (modo) => ipcRenderer.invoke("rendimiento-poner", modo),
  reiniciar: () => ipcRenderer.invoke("app-reiniciar"),
  editorSucio: (si) => ipcRenderer.send("editor-sucio", !!si),
  onEditorPeticion: (cb) => {
    const h = (e, d) => cb(d);
    ipcRenderer.on("editor-peticion", h);
    return () => ipcRenderer.removeListener("editor-peticion", h);
  },
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
  // 2/11: el RandomChat en su propia ventana (como el RandomEditor) y la moderación del chat de YouTube
  chatVentana: () => ipcRenderer.invoke("chatwin-abrir"),
  chatVentanaEstado: () => ipcRenderer.invoke("chatwin-estado"),
  chatVentanaAjustes: (op) => ipcRenderer.invoke("chatwin-ajustes", op || {}),
  chatModeracion: () => ipcRenderer.invoke("chat-moderacion"),
  chatModerar: (op) => ipcRenderer.invoke("chat-moderar", op || {}),
  chatPerfil: (id) => ipcRenderer.invoke("chat-perfil", id || null),
  contadorSesion: () => ipcRenderer.invoke("contador-sesion"),
  onUploadProgress: (cb) => {
    const h = (e, d) => cb(d);
    ipcRenderer.on("studio-upload-progress", h);
    return () => ipcRenderer.removeListener("studio-upload-progress", h);
  },
  // Perfiles y carpetas (v3.26)
  perfilPoner: (id, info) => ipcRenderer.invoke("perfil-poner", id, info),
  claude: (prompt, opts) => ipcRenderer.invoke("claude-generar", prompt, opts),
  claudeDisponible: () => ipcRenderer.invoke("claude-disponible"),
  claudeComprobar: (forzar) => ipcRenderer.invoke("claude-comprobar", forzar),
  claudeToken: (token) => ipcRenderer.invoke("claude-token", token),
  claudeUso: (forzar) => ipcRenderer.invoke("claude-uso", forzar),   // v3.40.6: el marcador de uso de Claude
  // v3.30: el estudio de Historias (ideas, etapas, revisiones y notas)
  estudioIdeas: () => ipcRenderer.invoke("estudio-ideas"),
  estudioIdeasGenerar: (n, pista) => ipcRenderer.invoke("estudio-ideas-generar", n, pista),
  estudioIdeaPoner: (id, cambios) => ipcRenderer.invoke("estudio-idea-poner", id, cambios),
  estudioBorrar: (id) => ipcRenderer.invoke("estudio-borrar", id),
  historiasPararTodo: () => ipcRenderer.invoke("historias-parar-todo"),
  estudioRenumerar: (de, a) => ipcRenderer.invoke("estudio-renumerar", de, a),
  // v3.41: el relevo entre equipos (copia de la historia por Drive) y Git Bash para que Claude no use PowerShell
  estudioRelevoSubir: (id, token) => ipcRenderer.invoke("estudio-relevo-subir", id, token),
  estudioRelevoRecibir: (id, token, archivo, md5) => ipcRenderer.invoke("estudio-relevo-recibir", id, token, archivo, md5),
  estudioRelevada: (id) => ipcRenderer.invoke("estudio-relevada", id),
  estudioRelevoPreparar: (id) => ipcRenderer.invoke("estudio-relevo-preparar", id),
  // v3.41.3: los recursos del proyecto (efectos, música, fuentes, texturas, biblioteca 3D) iguales en todos los equipos
  baseEstado: () => ipcRenderer.invoke("base-estado"),
  historiasPausarEncadenado: (v) => ipcRenderer.invoke("historias-pausar-encadenado", v),
  baseSubir: (token, cual) => ipcRenderer.invoke("base-subir", token, cual),
  kitPropioSubir: (token, anterior) => ipcRenderer.invoke("kit-propio-subir", token, anterior),
  kitPropioRecibir: (token, info) => ipcRenderer.invoke("kit-propio-recibir", token, info),
  baseInstalar: (token, info, cual) => ipcRenderer.invoke("base-instalar", token, info, cual),
  estudioRelevoBorrar: (id, token, archivo) => ipcRenderer.invoke("estudio-relevo-borrar", id, token, archivo),
  instalarGit: () => ipcRenderer.invoke("instalar-git"),
  instalarCuda: () => ipcRenderer.invoke("instalar-cuda"),
  estudioIdeaBorrar: (id) => ipcRenderer.invoke("estudio-idea-borrar", id),
  onEstudioIdeas: (cb) => { const f = (e, d) => cb(d); ipcRenderer.on("estudio-ideas-listas", f); return () => ipcRenderer.removeListener("estudio-ideas-listas", f); },
  estudioCrear: (ideaId, opts) => ipcRenderer.invoke("estudio-crear", ideaId, opts),
  estudioEtapas: (id) => ipcRenderer.invoke("estudio-etapas", id),
  estudioAvanzar: (id) => ipcRenderer.invoke("estudio-avanzar", id),
  estudioRehacer: (id, etapa, nota) => ipcRenderer.invoke("estudio-rehacer", id, etapa, nota),
  estudioRevisar: (id, etapa, ok, nota) => ipcRenderer.invoke("estudio-revisar", id, etapa, ok, nota),
  estudioNotaFinal: (id, texto) => ipcRenderer.invoke("estudio-nota-final", id, texto),
  estudioAjustes: (nuevos) => ipcRenderer.invoke("estudio-ajustes", nuevos),
  estudioClaveEleven: (clave) => ipcRenderer.invoke("estudio-clave-eleven", clave),
  estudioClaveFish: (clave) => ipcRenderer.invoke("estudio-clave-fish", clave),
  estudioPruebaFish: () => ipcRenderer.invoke("estudio-prueba-fish"),
  estudioMaterial: (id) => ipcRenderer.invoke("estudio-material", id),
  estudioDriveSubir: (id, token, perfil, que) => ipcRenderer.invoke("estudio-drive-subir", id, token, perfil, que),
  estudioEntregaBajar: (token, drive) => ipcRenderer.invoke("estudio-entrega-bajar", token, drive),
  driveEspacio: (token) => ipcRenderer.invoke("drive-espacio", token),
  actInfo: () => ipcRenderer.invoke("act-info"),
  actSubir: (url, cual) => ipcRenderer.invoke("act-subir", url, cual),
  actInfoPendiente: () => ipcRenderer.invoke("act-info-pendiente"),
  actInstalar: (url, sha, version) => ipcRenderer.invoke("act-instalar", url, sha, version),
  actLocal: () => ipcRenderer.invoke("act-local"),
  almResumen: () => ipcRenderer.invoke("alm-resumen"),
  almListar: (clave, sub) => ipcRenderer.invoke("alm-listar", clave, sub),
  almPreparar: (clave, rels) => ipcRenderer.invoke("alm-preparar", clave, rels),
  almArchivarUno: (token, perfil, clave, rel) => ipcRenderer.invoke("alm-archivar-uno", token, perfil, clave, rel),
  almIndice: () => ipcRenderer.invoke("alm-indice"),
  almRecuperar: (token, ids) => ipcRenderer.invoke("alm-recuperar", token, ids),
  almBorrar: (clave, rels, definitivo) => ipcRenderer.invoke("alm-borrar", clave, rels, definitivo),
  almAbrir: (ruta) => ipcRenderer.invoke("alm-abrir", ruta),
  onAlmProgreso: (cb) => { const f = (e, d) => cb(d); ipcRenderer.on("alm-progreso", f); return () => ipcRenderer.removeListener("alm-progreso", f); },
  actLocalAplicar: () => ipcRenderer.invoke("act-local-aplicar"),
  onActCambio: (cb) => { const f = () => cb(); ipcRenderer.on("act-cambio", f); return () => ipcRenderer.removeListener("act-cambio", f); },
  carpetasLeer: (id) => ipcRenderer.invoke("carpetas-leer", id),
  carpetasGuardar: (id, clave, ruta) => ipcRenderer.invoke("carpetas-guardar", id, clave, ruta),
  carpetasElegir: (actual) => ipcRenderer.invoke("carpetas-elegir", actual),
  carpetasAbrir: (ruta) => ipcRenderer.invoke("carpetas-abrir", ruta),
  // v3.40 (Carental): perfiles LOCALES (sin Google) y los BRUTOS de un perfil (brutos.cjs)
  localesLeer: () => ipcRenderer.invoke("locales-leer"),
  localesCrear: (nombre, brutos) => ipcRenderer.invoke("locales-crear", nombre, brutos),
  localesRenombrar: (id, nombre) => ipcRenderer.invoke("locales-renombrar", id, nombre),
  localesQuitar: (id) => ipcRenderer.invoke("locales-quitar", id),
  brutosEstado: () => ipcRenderer.invoke("brutos-estado"),
  brutosCambiar: (cambio) => ipcRenderer.invoke("brutos-cambiar", cambio),
  brutosDriveSubir: (id, token, perfil) => ipcRenderer.invoke("brutos-drive-subir", id, token, perfil),
  brutosDriveCarpeta: (token, perfil) => ipcRenderer.invoke("brutos-drive-carpeta", token, perfil),
  onBrutosProgreso: (cb) => { const h = (e, d) => cb(d); ipcRenderer.on("brutos-progreso", h); return () => ipcRenderer.removeListener("brutos-progreso", h); },
  // RandomHistorias dentro de Studio (v3.21): estado, cadena con progreso y miniatura
  historiasLista: () => ipcRenderer.invoke("historias-lista"),
  historiasDetalle: (id) => ipcRenderer.invoke("historias-detalle", id),
  historiasTarea: (id, args) => ipcRenderer.invoke("historias-tarea", id, args),
  historiasTareaEstado: () => ipcRenderer.invoke("historias-tarea-estado"),
  historiasCancelar: (soloId) => ipcRenderer.invoke("historias-cancelar", soloId),
  historiasMiniatura: (id, plano, t) => ipcRenderer.invoke("historias-miniatura", id, plano, t),
  historiasAbrir: (id, que) => ipcRenderer.invoke("historias-abrir", id, que),
  // contador de suscriptores para OBS (v3.23, contador.cjs)
  contadorAbrir: (op) => ipcRenderer.invoke("contador-abrir", op),
  contadorMeta: (op) => ipcRenderer.invoke("contador-meta", op),
  contadorEstado: () => ipcRenderer.invoke("contador-estado"),
  contadorVentana: (ver) => ipcRenderer.invoke("contador-ventana", ver),
  onHistoriasProgreso: (cb) => {
    const h = (e, d) => cb(d);
    ipcRenderer.on("historias-progreso", h);
    return () => ipcRenderer.removeListener("historias-progreso", h);
  }
});
