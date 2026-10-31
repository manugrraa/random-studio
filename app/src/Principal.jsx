import React from "react";
const { useState, useEffect, useRef, useMemo, useCallback } = React;
import { AgentView } from "./agente";
import { RankingView } from "./ranking";
import { DirectosView, ClipsView } from "./clon";
import { ConvertidorView } from "./convertidor";
import { RandomChatView, useSesionChat } from "./randomchat";
import { ConfigView, GlobalSearch } from "./ajustes";
import { BarraLateral } from "./navegacion";
import { abrirEnEditor } from "./random_editor";
import { APP_VERSION, DEFAULT_FORMATS, Icons, SEED, STATUSES, clone, dnd, makeVideo, setIdBase, uid, useToast } from "./base";
import { DEFAULT_TASK_LISTS, StatStrip, bumpIdFrom, clasificarFormato, clearStore, cloudFecha, cloudLoad, cloudSave, cloudSaveUrgente, completarChecklist, ensureAuth, esFormatosV2, fireNotification, getClient, getSyncCode, loadStore, mergeById, mergeDailyArchive, mergeTaskLists, migrarFormatosV2, normalizarDatos, pruneTombs, registerNotifSW, saveStore, storeSyncCode, ytCaptureAuthFromHash, ytCheckVideos, ytExchangeCode, ytIsConnected, ytPostComment, ytSilentRefresh, ytStartAuth, ytTokenValid, ytUpdateSchedule } from "./datos";
import { ConfirmDialog, SyncModal } from "./dialogos";
import { CalendarView, FormatsModal, KanbanView } from "./planificacion";
import { TasksView, dailyDayKey, weekKey } from "./tareas";
import { ExpandCtx, VideoModal, YouTubeUploadModal, inputStyle } from "./videos";
import { ScheduledView, StatsView, TrashView } from "./youtube";

export function App() {
  // Cargar UNA vez (antes se re-parseaba todo el JSON en cada render), migrar a formatos v2
  // y normalizar (checklist completa en lo que ya está en YouTube)
  const _initial = useMemo(()=>normalizarDatos(migrarFormatosV2(loadStore())), []);
  const [videos, setVideos] = useState(()=>{
    const base = _initial ? _initial.videos : [];
    // Sellar updatedAt en datos anteriores a esta versión (para que la fusión funcione)
    return (base||[]).map(v=> v.updatedAt ? v : {...v, updatedAt: v.createdAt || 1});
  });
  const [formats, setFormats] = useState(_initial ? _initial.formats : DEFAULT_FORMATS);
  const [trash, setTrash] = useState(_initial && Array.isArray(_initial.trash) ? _initial.trash : []);
  const [tombstones, setTombstones] = useState(_initial && Array.isArray(_initial.tombstones) ? pruneTombs(_initial.tombstones) : []);
  const addTomb = (id, kind) => setTombstones(ts=>[...ts.filter(t=>t.id!==id), {id, kind:kind||"item", at:Date.now()}]);
  const [taskLists, setTaskLists] = useState(()=>{
    let base = (_initial && Array.isArray(_initial.taskLists) && _initial.taskLists.length) ? _initial.taskLists : clone(DEFAULT_TASK_LISTS);
    // Sellar updatedAt en listas/tareas anteriores a esta versión (para que la fusión funcione)
    base = base.map(l=>({
      ...l,
      updatedAt: l.updatedAt || 1,
      tasks: (l.tasks||[]).map(t=> t.updatedAt ? t : {...t, updatedAt: t.createdAt || 1})
    }));
    // Garantizar que exista la lista diaria fija (para datos guardados antes de esta versión)
    if(!base.some(l=>l.fixed)){
      base = [{ id:"lst_daily", name:"Tareas diarias", fixed:true, tasks:[], updatedAt:Date.now() }, ...base];
    }
    return base;
  });
  const [saved, setSaved] = useState(false);
  const [ytUpload, setYtUpload] = useState(null); // vídeo que se está subiendo a YouTube
  // Plantillas de etiquetas para YouTube (se sincronizan)
  const [tagTemplates, setTagTemplates] = useState(()=> (_initial && Array.isArray(_initial.tagTemplates)) ? _initial.tagTemplates : []);
  // Archivo semanal de tareas diarias realizadas: { "2026-W28": [{title, doneAt}], ... }
  const [dailyArchive, setDailyArchive] = useState(()=> (_initial && _initial.dailyArchive && typeof _initial.dailyArchive==="object") ? _initial.dailyArchive : {});
  // Historial de suscriptores para la gráfica: [{t: timestamp, s: subs}, ...] (se sincroniza)
  const [subHistory, setSubHistory] = useState(()=> (_initial && Array.isArray(_initial.subHistory)) ? _initial.subHistory : []);
  // Plantillas de prompt para el Agente de IA (se sincronizan)
  const [promptTemplates, setPromptTemplates] = useState(()=> (_initial && Array.isArray(_initial.promptTemplates)) ? _initial.promptTemplates : []);
  // Objetivos (dinero → visitas), RPM real e historial diario de visitas/ingresos (se sincroniza)
  const [goals, setGoals] = useState(()=> (_initial && _initial.goals && typeof _initial.goals==="object") ? _initial.goals : null);
  // v3.11: se abre donde lo dejaste
  const [view, setView0] = useState(()=>{ try { const v = localStorage.getItem("rds_vista")||"calendar"; return v==="editor" ? "clips" : v; } catch(e){ return "calendar"; } });
  // v3.14: el RandomEditor es su propia ventana: «RandomEditor» la abre (o la trae delante) y no cambia de apartado
  const setView = v => { if(v==="editor"){ abrirEnEditor(); return; } setView0(v); };
  useEffect(()=>{ try { localStorage.setItem("rds_vista", view); } catch(e){} },[view]);
  const [plegada, setPlegada] = useState(()=>{ try { return localStorage.getItem("rds_barra_plegada")==="1"; } catch(e){ return false; } });
  useEffect(()=>{ try { localStorage.setItem("rds_barra_plegada", plegada?"1":"0"); } catch(e){} },[plegada]);
  // Tarjetas contraídas (false) o expandidas (true) en todos los apartados
  const [cardsExpanded, setCardsExpanded] = useState(()=>{ try { return localStorage.getItem("rds_cards_exp")==="1"; } catch(e){ return false; } });
  useEffect(()=>{ try { localStorage.setItem("rds_cards_exp", cardsExpanded?"1":"0"); } catch(e){} },[cardsExpanded]);
  const [calView, setCalView] = useState("week"); // month | week | day
  const [editing, setEditing] = useState(null);
  const [showFormats, setShowFormats] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [dragId, setDragId] = useState(null);
  const [search, setSearch] = useState("");
  const [confirm, setConfirm] = useState(null); // {title, message, confirmLabel, danger, onConfirm}
  const [syncStatus, setSyncStatus] = useState("connecting"); // connecting | online | offline | saving
  const syncStatusRef = useRef("connecting");
  useEffect(()=>{ syncStatusRef.current = syncStatus; },[syncStatus]);
  const [showSync, setShowSync] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Modo de sincronización: "auto" (sube y baja solo) o "manual" (solo cuando pulsas el botón)
  const [syncMode, setSyncMode] = useState(()=>{ try { return localStorage.getItem("rds_sync_mode")||"auto"; } catch(e){ return "auto"; } });
  const [pendingChanges, setPendingChanges] = useState(false); // hay cambios locales sin subir (modo manual)
  const syncModeRef = useRef(syncMode);
  useEffect(()=>{
    syncModeRef.current = syncMode;
    try { localStorage.setItem("rds_sync_mode", syncMode); } catch(e){}
  },[syncMode]);

  // TEMA claro/oscuro (preferencia por dispositivo)
  const [theme, setTheme] = useState(()=>{ try { return localStorage.getItem("rds_theme")||"dark"; } catch(e){ return "dark"; } });
  useEffect(()=>{
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("rds_theme", theme); } catch(e){}
    // v3.11: la barra de título de Windows (y el fondo de la ventana) con el mismo tema
    try { window.studioFS?.temaVentana?.(theme); } catch(e){}
  },[theme]);

  // HISTORIAL: deshacer/rehacer los últimos 10 cambios locales
  const historyRef = useRef({past:[], future:[]});
  const prevSnapRef = useRef(null);
  const applyingHistoryRef = useRef(false);
  const [histVersion, setHistVersion] = useState(0);
  const undo = () => {
    const h = historyRef.current;
    if(!h.past.length){ toast("Nada que deshacer"); return; }
    const snap = h.past.pop();
    h.future.push({videos, formats, trash, taskLists});
    if(h.future.length>10) h.future.shift();
    applyingHistoryRef.current = true;
    setVideos(snap.videos); setFormats(snap.formats); setTrash(snap.trash); setTaskLists(snap.taskLists);
    setHistVersion(v=>v+1);
    toast("Cambio deshecho");
  };
  const redo = () => {
    const h = historyRef.current;
    if(!h.future.length){ toast("Nada que rehacer"); return; }
    const snap = h.future.pop();
    h.past.push({videos, formats, trash, taskLists});
    if(h.past.length>10) h.past.shift();
    applyingHistoryRef.current = true;
    setVideos(snap.videos); setFormats(snap.formats); setTrash(snap.trash); setTaskLists(snap.taskLists);
    setHistVersion(v=>v+1);
    toast("Cambio rehecho");
  };
  // Atajos: Ctrl/Cmd+Z deshace, Ctrl+Y o Ctrl/Cmd+Shift+Z rehace
  const undoRef = useRef(undo), redoRef = useRef(redo);
  useEffect(()=>{ undoRef.current = undo; redoRef.current = redo; });
  useEffect(()=>{
    const onKey = (e)=>{
      const tag = (e.target && e.target.tagName || "").toLowerCase();
      if(tag==="input" || tag==="textarea" || e.target.isContentEditable) return;
      const mod = e.ctrlKey || e.metaKey;
      if(mod && !e.shiftKey && e.key.toLowerCase()==="z"){ e.preventDefault(); undoRef.current(); }
      else if((mod && e.key.toLowerCase()==="y") || (mod && e.shiftKey && e.key.toLowerCase()==="z")){ e.preventDefault(); redoRef.current(); }
    };
    window.addEventListener("keydown", onKey);
    return ()=>window.removeEventListener("keydown", onKey);
  },[]);
  const [syncCode, setSyncCodeState] = useState(()=>getSyncCode());
  const [toast, toastNode] = useToast();
  useSesionChat(toast);   // v3.8.2: la sesión de YouTube llega al RandomChat esté donde esté

  const lastSyncedRef = useRef(null); // huella de los últimos datos sincronizados (para ignorar ecos)
  const lastRemoteTsRef = useRef(0);  // fecha de la última versión de la nube que hemos integrado
  const localEditedAtRef = useRef((_initial && _initial.savedAt) ? _initial.savedAt : 0); // última edición local
  const stateRef = useRef({videos, formats, trash, taskLists, tombstones}); // estado vivo para los manejadores async
  const pullingRef = useRef(false);
  const saveTimer = useRef(null);
  const [rtKey, setRtKey] = useState(0); // al aumentar, se recrea el canal de tiempo real

  // Espejo del estado actual (para leerlo dentro de callbacks asíncronos sin datos obsoletos)
  useEffect(()=>{ stateRef.current = {videos, formats, trash, taskLists, tombstones, dailyArchive, tagTemplates, subHistory, promptTemplates, goals}; },[videos, formats, trash, taskLists, tombstones, dailyArchive, tagTemplates, subHistory, promptTemplates, goals]);

  // Huella del estado sincronizable. Con caché: si las referencias de los 8 campos no
  // han cambiado desde la última llamada, devuelve la huella anterior sin re-serializar
  // (JSON.stringify de todo el estado es costoso y fp se llama muy a menudo).
  const fpCacheRef = useRef({ parts:null, out:"" });
  const fp = (s) => {
    const parts = [s.videos, s.formats, s.trash||null, s.taskLists||null, s.dailyArchive||null, s.tagTemplates||null, s.subHistory||null, s.promptTemplates||null, s.goals||null];
    const cache = fpCacheRef.current;
    if(cache.parts && cache.parts.length===9 && cache.parts.every((p,i)=>p===parts[i])) return cache.out;
    const out = JSON.stringify({videos:s.videos, formats:s.formats, trash:s.trash||[], taskLists:s.taskLists||[], dailyArchive:s.dailyArchive||{}, tagTemplates:s.tagTemplates||[], subHistory:s.subHistory||[], promptTemplates:s.promptTemplates||[], goals:s.goals||null});
    fpCacheRef.current = { parts, out };
    return out;
  };

  // FUSIÓN NO DESTRUCTIVA: combina remoto + local por elementos, quedándose SIEMPRE con la
  // versión de updatedAt más alto de cada vídeo/tarea. Un dispositivo que suba datos viejos
  // NO puede hacer retroceder los tuyos: sus elementos viejos pierden frente a los nuevos.
  // Devuelve {state, changed}: changed=true solo si el resultado difiere de lo que ya tenías.
  const computeMerge = (r) => {
    const s = stateRef.current;
    const mergedVideos = mergeById(s.videos, r.videos, s.tombstones, r.tombstones);
    const mergedTrash  = mergeById(s.trash,  r.trash,  s.tombstones, r.tombstones);
    const mergedTasks  = mergeTaskLists(s.taskLists, r.taskLists, s.tombstones, r.tombstones);
    const mergedTombs  = pruneTombs([...(s.tombstones||[]), ...(r.tombstones||[])]);
    // Formatos: nos quedamos con el conjunto que tenga más entradas o el local si empatan
    // (los formatos casi no cambian; ante la duda, conservar lo local evita perder ediciones).
    // Un dispositivo ya migrado a formatos v2 nunca retrocede a la lista antigua
    const lv2 = esFormatosV2(s.formats), rv2 = esFormatosV2(r.formats);
    const localFmtN = Object.keys(s.formats||{}).length;
    const remoteFmtN = Object.keys(r.formats||{}).length;
    const mergedFormats = (lv2!==rv2) ? (lv2 ? s.formats : r.formats)
      : (remoteFmtN > localFmtN ? r.formats : s.formats);
    // Vídeos que llegan de un dispositivo sin migrar (formato antiguo o tipo "largo"):
    // se reclasifican aquí mismo para que todos converjan al mismo resultado
    const arreglaV2 = (arr) => !esFormatosV2(mergedFormats) ? arr.map(completarChecklist) : arr.map(v=>{
      if(!v) return v;
      const type = v.type==="largo" ? "video" : (v.type||"short");
      const fmtDesconocido = v.format && !mergedFormats[v.format];
      if(type===v.type && !fmtDesconocido) return completarChecklist(v);
      return completarChecklist({...v, type, format: fmtDesconocido ? clasificarFormato(v.title, type) : v.format, updatedAt:Date.now()});
    });
    // Archivo diario: unión por semana, sin duplicados (por título+día)
    const mergedArchive = mergeDailyArchive(s.dailyArchive, r.dailyArchive);
    // Plantillas de etiquetas: unión por nombre (la más reciente/mayor gana)
    const tplMap = {};
    [...(s.tagTemplates||[]), ...(r.tagTemplates||[])].forEach(t=>{
      if(!t || !t.name) return;
      const prev = tplMap[t.name];
      if(!prev || (t.tags||[]).length >= (prev.tags||[]).length) tplMap[t.name] = t;
    });
    const mergedTpls = Object.values(tplMap);
    // Historial de suscriptores: unión por timestamp (redondeado al minuto), ordenado
    const subMap = {};
    [...(s.subHistory||[]), ...(r.subHistory||[])].forEach(p=>{
      if(!p || p.t==null) return;
      const k = Math.round(p.t/60000);
      if(!subMap[k]) subMap[k] = p;
    });
    const mergedSubs = Object.values(subMap).sort((a,b)=>a.t-b.t);
    // Plantillas de prompt: unión por nombre (la más reciente gana)
    const promptMap = {};
    [...(s.promptTemplates||[]), ...(r.promptTemplates||[])].forEach(p=>{
      if(!p || !p.name) return;
      const prev = promptMap[p.name];
      if(!prev || (p.updatedAt||0) >= (prev.updatedAt||0)) promptMap[p.name] = p;
    });
    const mergedPrompts = Object.values(promptMap);
    // Objetivos: config y RPM por fecha de actualización; historial diario por unión de días
    const mergedGoals = (()=>{
      const a = s.goals, b = r.goals;
      if(!a) return b||null;
      if(!b) return a;
      const cfg = ((b.cfg?.updatedAt||0) > (a.cfg?.updatedAt||0)) ? b.cfg : a.cfg;
      const rpm = ((b.rpm?.at||0) > (a.rpm?.at||0)) ? b.rpm : a.rpm;
      const daily = {...(a.daily||{})};
      Object.entries(b.daily||{}).forEach(([k,v])=>{
        const p = daily[k];
        if(!p || (v && (v.views||0) >= (p.views||0))) daily[k] = v;
      });
      return { cfg: cfg||null, rpm: rpm||null, daily, dailyAt: Math.max(a.dailyAt||0, b.dailyAt||0) };
    })();
    const merged = { videos:arreglaV2(mergedVideos), formats:mergedFormats, trash:arreglaV2(mergedTrash), taskLists:mergedTasks, tombstones:mergedTombs, dailyArchive:mergedArchive, tagTemplates:mergedTpls, subHistory:mergedSubs, promptTemplates:mergedPrompts, goals:mergedGoals };
    const changed = fp(merged) !== fp(s);
    return { merged, changed };
  };

  // Aplica un estado fusionado a la app
  const applyMerged = (merged) => {
    bumpIdFrom([...(merged.videos||[]), ...(merged.trash||[])]);
    const s = stateRef.current;
    // Actualizar SOLO lo que cambió de verdad. Si un array/objeto es idéntico (misma huella),
    // no llamamos a su setter → React no re-renderiza esas tarjetas → sin parpadeo ni re-animación.
    const j = (x)=>JSON.stringify(x);
    if(j(merged.videos)!==j(s.videos)) setVideos(merged.videos);
    if(j(merged.formats)!==j(s.formats)) setFormats(merged.formats);
    if(j(merged.trash)!==j(s.trash)) setTrash(merged.trash);
    const nextTasks = merged.taskLists.length?merged.taskLists:clone(DEFAULT_TASK_LISTS);
    if(j(nextTasks)!==j(s.taskLists)) setTaskLists(nextTasks);
    if(j(merged.tombstones)!==j(s.tombstones)) setTombstones(merged.tombstones);
    if(merged.dailyArchive && j(merged.dailyArchive)!==j(s.dailyArchive)) setDailyArchive(merged.dailyArchive);
    if(merged.tagTemplates && j(merged.tagTemplates)!==j(s.tagTemplates)) setTagTemplates(merged.tagTemplates);
    if(merged.subHistory && j(merged.subHistory)!==j(s.subHistory)) setSubHistory(merged.subHistory);
    if(merged.promptTemplates && j(merged.promptTemplates)!==j(s.promptTemplates)) setPromptTemplates(merged.promptTemplates);
    if(merged.goals && j(merged.goals)!==j(s.goals)) setGoals(merged.goals);
    lastSyncedRef.current = fp(merged);
    lastRemoteTsRef.current = Date.now();
  };

  // Sube el estado actual a la nube
  const pushLocal = async () => {
    const s = stateRef.current;
    const huella = fp(s);
    setSyncStatus("saving");
    await cloudSave(syncCode, { videos:s.videos, formats:s.formats, trash:s.trash, taskLists:s.taskLists, tombstones:pruneTombs(s.tombstones), dailyArchive:s.dailyArchive||{}, tagTemplates:s.tagTemplates||[], subHistory:s.subHistory||[], promptTemplates:s.promptTemplates||[], goals:s.goals||null, savedAt: Date.now() });
    lastSyncedRef.current = huella;
    lastRemoteTsRef.current = Date.now();
    setPendingChanges(false);
    setSyncStatus("online");
  };

  // Sube un estado ya fusionado
  const pushMerged = async (merged) => {
    setSyncStatus("saving");
    await cloudSave(syncCode, { videos:merged.videos, formats:merged.formats, trash:merged.trash, taskLists:merged.taskLists, tombstones:pruneTombs(merged.tombstones), dailyArchive:merged.dailyArchive||{}, tagTemplates:merged.tagTemplates||[], subHistory:merged.subHistory||[], promptTemplates:merged.promptTemplates||[], goals:merged.goals||null, savedAt: Date.now() });
    lastSyncedRef.current = fp(merged);
    lastRemoteTsRef.current = Date.now();
    setSyncStatus("online");
  };

  // Integra datos remotos SIN hacer retroceder lo local. Devuelve true si algo cambió aquí.
  // - Si la fusión no aporta nada nuevo respecto a lo local → no toca la app (no hay "cambio fantasma").
  // - Si aporta algo (otro dispositivo añadió/editó algo genuino) → lo integra y lo sube fusionado.
  const integrateRemote = async (r, silent) => {
    const { merged, changed } = computeMerge(r);
    const s = stateRef.current;
    if(!changed){
      // La fusión no aporta nada nuevo a lo que YA tenemos aquí.
      // ¿El remoto está desactualizado respecto a lo nuestro? Solo entonces subimos.
      const localHuella = fp(merged);           // = fp(local), porque no cambió
      const remoteHuella = fp({
        videos:r.videos, formats:r.formats, trash:r.trash, taskLists:r.taskLists,
        dailyArchive:r.dailyArchive, tagTemplates:r.tagTemplates,
        subHistory:r.subHistory, promptTemplates:r.promptTemplates, goals:r.goals
      });
      if(localHuella !== remoteHuella){
        // Nosotros tenemos algo que el remoto no → subir lo nuestro (sin tocar la UI)
        try { await pushLocal(); } catch(e){}
      } else {
        // Idénticos: solo marcamos como sincronizado, sin tocar nada
        lastSyncedRef.current = localHuella;
        setSyncStatus("online");
      }
      return false;
    }
    // Hay novedades reales de otro dispositivo → integrarlas (sin perder lo tuyo) y republicar
    applyMerged(merged);
    try { await pushMerged(merged); } catch(e){}
    if(!silent) toast("Cambios de otro dispositivo integrados");
    return true;
  };

  // RECONCILIACIÓN al abrir / despertar / periódicamente: baja la nube y la integra sin retroceder.
  const pullFromCloud = async (silent) => {
    if(pullingRef.current) return;
    pullingRef.current = true;
    try {
      if(!silent) setSyncStatus("connecting");
      // v3: en el sondeo, primero solo la fecha; se baja todo solo si hay algo nuevo
      if(silent && lastRemoteTsRef.current){
        const f = await cloudFecha(syncCode);
        if(f && f <= lastRemoteTsRef.current) return;
      }
      const remote = await cloudLoad(syncCode);
      if(remote && remote.updated_at) lastRemoteTsRef.current = Math.max(lastRemoteTsRef.current||0, new Date(remote.updated_at).getTime());
      if(remote && remote.data) {
        await integrateRemote(remote.data, silent);
      } else {
        await pushLocal(); // nube vacía → sembrarla con lo local
      }
      // En modo silencioso no forzamos "online" para no pisar un "saving" en curso;
      // integrateRemote/pushLocal ya dejan el estado correcto.
      if(!silent) setSyncStatus("online");
    } catch(e) {
      setSyncStatus("offline");
    } finally {
      pullingRef.current = false;
    }
  };
  const pullRef = useRef(pullFromCloud);
  useEffect(()=>{ pullRef.current = pullFromCloud; });

  // Carga inicial
  const didInit = useRef(false);
  useEffect(()=>{
    if(didInit.current) return; didInit.current = true;
    pullRef.current(false);
  },[]);

  // RE-SINCRONIZACIÓN AUTOMÁTICA: al volver a la app, al recuperar internet y cada 60s.
  // (iOS corta la conexión en segundo plano; esto la revive y trae lo que haya pasado mientras tanto.)
  useEffect(()=>{
    const onWake = () => {
      if(document.visibilityState === "hidden") return;
      pullRef.current(true);
      setRtKey(k=>k+1); // recrear el canal de tiempo real por si murió en segundo plano
    };
    const onOnline = () => { pullRef.current(true); setRtKey(k=>k+1); };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    window.addEventListener("online", onOnline);
    window.addEventListener("pageshow", onWake);
    return ()=>{
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pageshow", onWake);
    };
  },[]);

  // GUARDADO URGENTE: sube al instante aunque la app se esté cerrando o pasando a segundo plano.
  // fetch con keepalive sobrevive al cierre de la pestaña/app (el guardado normal con retardo no).
  const flushNow = () => {
    if(syncModeRef.current === "manual") return; // en manual no subimos automáticamente
    const s = stateRef.current;
    const huella = fp(s);
    if(huella === lastSyncedRef.current) return; // nada pendiente
    // v3: por el backend protegido (la clave pública de Supabase ya no entra)
    cloudSaveUrgente(syncCode, { videos:s.videos, formats:s.formats, trash:s.trash, taskLists:s.taskLists, tombstones:pruneTombs(s.tombstones), dailyArchive:s.dailyArchive||{}, tagTemplates:s.tagTemplates||[], subHistory:s.subHistory||[], promptTemplates:s.promptTemplates||[], goals:s.goals||null, savedAt: Date.now() });
  };
  const flushRef = useRef(flushNow);
  useEffect(()=>{ flushRef.current = flushNow; });

  // Al ocultar la app (cambiar de app en iPhone, cerrar pestaña, bloquear pantalla) → subir ya
  useEffect(()=>{
    const onHide = () => { if(document.visibilityState === "hidden") flushRef.current(); };
    const onPageHide = () => flushRef.current();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    return ()=>{ document.removeEventListener("visibilitychange", onHide); window.removeEventListener("pagehide", onPageHide); };
  },[]);

  // Sincronización manual inmediata (botón "Sincronizar ahora")
  const [manualSyncing, setManualSyncing] = useState(false);
  const syncNow = async () => {
    if(manualSyncing) return;
    setManualSyncing(true);
    try {
      // Fusiona con la nube (sin pisar cambios de otro dispositivo) y sube el resultado.
      const remote = await cloudLoad(syncCode);
      if(remote && remote.data){
        const { merged } = computeMerge(remote.data);
        applyMerged(merged);
        await pushMerged(merged);
      } else {
        await pushLocal();
      }
      setPendingChanges(false);
      toast("✅ Sincronización completada");
    } catch(e){
      setSyncStatus("offline");
      toast("❌ No se pudo sincronizar");
    } finally { setManualSyncing(false); }
  };

  // Suscripción en tiempo real: si otro dispositivo cambia algo, lo recibimos al instante
  const rtOkRef = useRef(false); // true si Realtime está funcionando
  // v3: sin Supabase Realtime (la tabla está cerrada con RLS): los cambios de otro
  // dispositivo llegan por el sondeo periódico (rtOkRef queda en false)

  // Sondeo adaptativo que SOLO corre con la pestaña visible.
  // Si la app está oculta (otra app, pantalla bloqueada, pestaña en segundo plano),
  // no hace ninguna petición: cero carga en el servidor y cero gasto de batería.
  useEffect(()=>{
    let timer = null;
    let stopped = false;
    let failures = 0; // fallos seguidos → freno exponencial
    const schedule = () => {
      if(stopped) return;
      // Con Realtime activo, los cambios llegan al instante por el canal: el sondeo es solo
      // un respaldo poco frecuente. Sin Realtime, sondeamos más a menudo pero con mesura.
      let delay = rtOkRef.current ? 60000 : 20000;
      // FRENO: si Supabase está fallando, esperar cada vez más (30s → 1m → 2m → 4m → máx 5m)
      // para no martillear un servidor caído (eso agrava el agotamiento de recursos).
      if(failures > 0) delay = Math.min(30000 * Math.pow(2, failures-1), 300000);
      timer = setTimeout(run, delay);
    };
    const run = async () => {
      if(stopped) return;
      // En modo manual no bajamos datos automáticamente (cero carga al servidor).
      if(syncModeRef.current === "manual"){ schedule(); return; }
      if(document.visibilityState === "visible"){
        try {
          await pullRef.current(true);
          failures = 0;
        } catch(e){ failures++; }
        // pullFromCloud captura sus propios errores; usamos el estado para detectar fallo
        if(syncStatusRef.current === "offline") failures = Math.max(failures, 1);
        else failures = 0;
        schedule();
      }
      // Si no está visible, no reprogramamos; se reanudará al volver a la app.
    };
    const onVis = () => {
      if(document.visibilityState === "visible"){
        // Al volver: traer cambios enseguida (solo en modo auto) y reanudar el sondeo
        if(syncModeRef.current !== "manual") pullRef.current(true).catch(()=>{});
        if(!timer) schedule();
      } else {
        // Al ocultar: cancelar cualquier sondeo pendiente
        if(timer){ clearTimeout(timer); timer = null; }
      }
    };
    document.addEventListener("visibilitychange", onVis);
    if(document.visibilityState === "visible") schedule();
    return ()=>{ stopped = true; if(timer) clearTimeout(timer); document.removeEventListener("visibilitychange", onVis); };
  },[]);

  // Vincular este dispositivo a otro código de sincronización
  // Exportar todos los datos a un archivo JSON descargable
  const exportData = () => {
    const payload = { app:"RandomStudio", version:2, exportedAt:new Date().toISOString(), videos, formats, trash, taskLists, tombstones };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const d = new Date();
    a.href = url;
    a.download = `RDeRandom_datos_${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 2000);
    toast("Datos exportados · revisa tus descargas");
  };

  // Importar datos desde un archivo JSON (reemplaza lo actual, con confirmación)
  const importData = (file) => {
    if(!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let parsed = null;
      try { parsed = JSON.parse(reader.result); } catch(e){ toast("El archivo no es un JSON válido"); return; }
      const inVideos = Array.isArray(parsed?.videos) ? parsed.videos : null;
      const inFormats = (parsed?.formats && typeof parsed.formats==="object" && !Array.isArray(parsed.formats)) ? parsed.formats : null;
      const inTrash = Array.isArray(parsed?.trash) ? parsed.trash : [];
      const inTasks = Array.isArray(parsed?.taskLists) ? parsed.taskLists : null;
      if(!inVideos || !inFormats){ toast("El archivo no tiene el formato esperado de RandomStudio"); return; }
      setConfirm({
        title: "Importar datos",
        message: `Se importarán ${inVideos.length} vídeo${inVideos.length!==1?"s":""}, ${Object.keys(inFormats).length} formato${Object.keys(inFormats).length!==1?"s":""} y ${inTrash.length} elemento${inTrash.length!==1?"s":""} de la papelera. Esto reemplazará TODOS los datos actuales de este organizador (y se sincronizará a la nube). ¿Continuar?`,
        confirmLabel: "Importar",
        danger: true,
        onConfirm: () => {
          bumpIdFrom([...inVideos, ...inTrash]);
          setVideos(inVideos);
          setFormats(inFormats);
          setTrash(inTrash);
          if(inTasks) setTaskLists(inTasks.length?inTasks:clone(DEFAULT_TASK_LISTS));
          setConfirm(null);
          setShowSync(false);
          toast("Datos importados correctamente");
        }
      });
    };
    reader.readAsText(file);
  };

  const linkToCode = async (code) => {
    code = (code||"").trim();
    if(!code){ toast("Introduce un código de sincronización"); return; }
    storeSyncCode(code);
    setSyncCodeState(code);
    setSyncStatus("connecting");
    try {
      const remote = await cloudLoad(code);
      if(remote && remote.data){
        // Vinculación explícita: adoptar los datos de ese código tal cual
        const r = remote.data;
        bumpIdFrom([...(r.videos||[]), ...(r.trash||[])]);
        if(Array.isArray(r.videos)) setVideos(r.videos);
        if(r.formats && typeof r.formats==="object") setFormats(r.formats);
        if(Array.isArray(r.trash)) setTrash(r.trash);
        if(Array.isArray(r.taskLists)) setTaskLists(r.taskLists.length?r.taskLists:clone(DEFAULT_TASK_LISTS));
        if(Array.isArray(r.tombstones)) setTombstones(pruneTombs(r.tombstones));
        lastSyncedRef.current = fp(r);
        lastRemoteTsRef.current = Date.now();
        toast("Vinculado · datos descargados de la nube");
      } else {
        const s = stateRef.current;
        await cloudSave(code, { videos:s.videos, formats:s.formats, trash:s.trash, taskLists:s.taskLists, tombstones:pruneTombs(s.tombstones), dailyArchive:s.dailyArchive||{}, tagTemplates:s.tagTemplates||[], subHistory:s.subHistory||[], promptTemplates:s.promptTemplates||[], savedAt: Date.now() });
        lastSyncedRef.current = fp(s);
        lastRemoteTsRef.current = Date.now();
        toast("Vinculado · se subieron tus datos actuales");
      }
      setSyncStatus("online");
      setShowSync(false);
    } catch(e) {
      setSyncStatus("offline");
      toast("No se pudo conectar con ese código");
    }
  };

  // Auto-guardado: local al instante + nube según el modo (auto = debounce, manual = solo local)
  const firstRun = useRef(true);
  useEffect(()=>{
    if(firstRun.current){ firstRun.current=false; prevSnapRef.current = {videos, formats, trash, taskLists}; return; }
    // Guardado local (siempre; es barato e instantáneo)
    const ok = saveStore(videos, formats, trash, taskLists, tombstones, dailyArchive, tagTemplates, subHistory, promptTemplates, goals);
    if(ok){ setSaved(true); setTimeout(()=>setSaved(false), 1600); }

    // Huella COMPLETA del estado actual
    const huella = fp(stateRef.current);
    const hayCambioReal = huella !== lastSyncedRef.current;

    // Solo si hay un cambio real registramos historial y (en modo auto) programamos subida.
    if(hayCambioReal){
      localEditedAtRef.current = Date.now();
      if(!applyingHistoryRef.current && prevSnapRef.current){
        historyRef.current.past.push(prevSnapRef.current);
        if(historyRef.current.past.length>10) historyRef.current.past.shift();
        historyRef.current.future = [];
        setHistVersion(v=>v+1);
      }
      applyingHistoryRef.current = false;

      if(syncModeRef.current === "manual"){
        // MODO MANUAL: no tocamos el servidor. Solo marcamos que hay cambios pendientes.
        setPendingChanges(true);
      } else {
        // MODO AUTO: subimos tras un pequeño retardo (debounce)
        setSyncStatus("saving");
        if(saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(async ()=>{
          if(fp(stateRef.current) === lastSyncedRef.current){ setSyncStatus("online"); return; }
          try { await pushLocal(); }
          catch(e) { setSyncStatus("offline"); }
        }, 700);
      }
    }
    prevSnapRef.current = {videos, formats, trash, taskLists};
  },[videos, formats, trash, taskLists, tombstones, dailyArchive, tagTemplates, subHistory, promptTemplates, goals]);

  const resetAll = () => {
    setConfirm({
      title: "Restablecer datos",
      message: "Esto borrará todos tus vídeos, formatos y la papelera, y restaurará el contenido de ejemplo. Esta acción no se puede deshacer.",
      confirmLabel: "Restablecer",
      danger: true,
      onConfirm: () => {
        clearStore();
        setIdBase(100);
        const freshFormats = clone(DEFAULT_FORMATS);
        const freshVideos = clone(SEED);
        setFormats(freshFormats);
        setVideos(freshVideos);
        setTrash([]);
        const freshTasks = clone(DEFAULT_TASK_LISTS);
        setTaskLists(freshTasks);
        setTombstones([]);
        setConfirm(null);
        // Reflejar el restablecimiento también en la nube
        lastSyncedRef.current = JSON.stringify({videos:freshVideos, formats:freshFormats, trash:[], taskLists:freshTasks});
        lastRemoteTsRef.current = Date.now();
        cloudSave(syncCode, { videos:freshVideos, formats:freshFormats, trash:[], taskLists:freshTasks, tombstones:[], savedAt:Date.now() }).catch(()=>{});
        toast("Datos restablecidos");
      }
    });
  };

  // Si se borra un formato en uso, reasignar al primero disponible
  useEffect(()=>{
    const keys = Object.keys(formats);
    if(keys.length===0) return;
    setVideos(vs=>vs.map(v=> formats[v.format] ? v : {...v, format:keys[0]}));
  },[formats]);

  const onDragStart = useCallback((e,v) => { setDragId(v.id); dnd.dragId = v.id; e.dataTransfer.effectAllowed="move"; if(e.currentTarget.classList) e.currentTarget.classList.add("dragging"); },[]);
  const onDragEnd = useCallback(e => { setDragId(null); dnd.dragId = null; if(e.currentTarget.classList) e.currentTarget.classList.remove("dragging"); },[]);

  // Reordenar: inserta el vídeo arrastrado justo antes del vídeo objetivo.
  // Si el objetivo está en otro día o estado, además lo adopta.
  const moveBefore = (id, targetId) => {
    if(!id || !targetId || id===targetId) return;
    setVideos(vs=>{
      const dragged = vs.find(v=>v.id===id);
      const target = vs.find(v=>v.id===targetId);
      if(!dragged || !target) return vs;
      const rest = vs.filter(v=>v.id!==id);
      const idx = rest.findIndex(v=>v.id===targetId);
      const adopted = {...dragged, date: target.date, updatedAt: Date.now()};
      // Cambia de día y era una idea → pasa a programado
      if(dragged.date !== target.date && target.date && adopted.status==="idea") adopted.status = "programado";
      // Mismo día pero distinta columna del tablero → adopta la columna del objetivo
      if(dragged.date === target.date && dragged.status !== target.status) adopted.status = target.status;
      const next = [...rest.slice(0,idx), adopted, ...rest.slice(idx)];
      return next;
    });
    toast("Reordenado");
  };

  // Movimientos con id explícito (los usan tanto el ratón como el dedo)
  // Si el vídeo está PROGRAMADO en YouTube y aquí cambia su fecha/hora, se reprograma también allí
  const reprogramarEnYT = async (v, fecha, hora) => {
    if(!v || !v.youtubeId || v.youtubeStatus!=="scheduled" || !ytIsConnected()) return;
    if(!fecha){ toast("⚠ Sigue programado en YouTube con su fecha anterior"); return; }
    const cuando = new Date(fecha+"T"+(hora||v.time||"22:00"));
    if(cuando.getTime() < Date.now()+60000){ toast("⚠ No se reprogramó en YouTube: esa fecha ya pasó"); return; }
    try {
      await ytUpdateSchedule(v.youtubeId, cuando.toISOString());
      toast("📅 Reprogramado también en YouTube: "+cuando.toLocaleString("es-ES",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}));
    } catch(e){ toast("⚠ Cambiado aquí, pero YouTube respondió: "+e.message); }
  };

  const moveToDate = (id, date) => {
    if(!id) return;
    const previo = (stateRef.current.videos||[]).find(x=>x.id===id);
    setVideos(vs=>vs.map(v=>v.id===id?{...v,date,status: v.status==="idea"?"programado":v.status, updatedAt:Date.now()}:v));
    toast(`Reprogramado para el ${new Date(date+"T00:00").toLocaleDateString("es-ES",{day:"numeric",month:"short"})}`);
    if(previo && previo.date!==date) reprogramarEnYT(previo, date, previo.time);
  };
  const moveToStatus = (id, status) => {
    if(!id) return;
    setVideos(vs=>vs.map(v=>v.id===id?{...v,status, updatedAt:Date.now()}:v));
    toast(`Movido a «${STATUSES[status].label}»`);
  };
  const moveToUnassign = (id) => {
    if(!id) return;
    setVideos(vs=>{
      const v = vs.find(x=>x.id===id);
      if(!v || !v.date) return vs; // ya estaba sin asignar
      toast("Vídeo movido a «Sin asignar»");
      return vs.map(x=>x.id===id?{...x, date:null, status: x.status==="programado"?"idea":x.status, updatedAt:Date.now()}:x);
    });
  };

  // Conectar el puente de arrastre táctil con estas acciones
  useEffect(()=>{
    dnd.moveToDate = moveToDate;
    dnd.moveToStatus = moveToStatus;
    dnd.moveToUnassign = moveToUnassign;
    dnd.moveBefore = moveBefore;
  });

  // Versiones para el ratón (escritorio): usan el vídeo que se está arrastrando
  const dropOnDate = (date) => moveToDate(dragId, date);
  const dropOnStatus = (status) => moveToStatus(dragId, status);
  const unassignVideo = () => moveToUnassign(dragId);

  const saveVideo = (draft) => {
    const previo = (stateRef.current.videos||[]).find(x=>x.id===draft.id);
    setVideos(vs=>vs.map(v=>v.id===draft.id?{...draft, updatedAt: Date.now()}:v));
    // Fecha u hora cambiadas en la ficha de un vídeo programado → reprogramar en YouTube
    if(previo && draft.youtubeId && draft.youtubeStatus==="scheduled" && (previo.date!==draft.date || previo.time!==draft.time)){
      reprogramarEnYT(draft, draft.date, draft.time);
    }
  };

  // Mover a la papelera (no borra del todo)
  const deleteVideo = (id) => {
    setVideos(vs=>{
      const v = vs.find(x=>x.id===id);
      if(v) setTrash(t=>[{...v, deletedAt: Date.now()}, ...t]);
      return vs.filter(x=>x.id!==id);
    });
    addTomb(id, "video"); // que no reaparezca desde el otro dispositivo
    toast("Vídeo movido a la papelera");
  };
  // Restaurar un vídeo desde la papelera
  const restoreVideo = (id) => {
    setTrash(t=>{
      const v = t.find(x=>x.id===id);
      if(v){ const { deletedAt, ...rest } = v; setVideos(vs=>[...vs, {...rest, updatedAt: Date.now()}]); }
      return t.filter(x=>x.id!==id);
    });
    setTombstones(ts=>ts.filter(t=>t.id!==id)); // deja de estar "borrado"
    toast("Vídeo restaurado");
  };
  // Vaciar la papelera (con aviso de seguridad)
  const emptyTrash = () => {
    if(trash.length===0){ toast("La papelera ya está vacía"); return; }
    setConfirm({
      title: "Vaciar papelera",
      message: `Se eliminarán definitivamente ${trash.length} vídeo${trash.length!==1?"s":""}. Esta acción no se puede deshacer.`,
      confirmLabel: "Vaciar papelera",
      danger: true,
      onConfirm: () => { setTrash([]); setConfirm(null); toast("Papelera vaciada"); }
    });
  };
  // Borrar un único vídeo de la papelera de forma permanente
  const deleteForever = (id) => {
    const v = trash.find(x=>x.id===id);
    setConfirm({
      title: "Eliminar para siempre",
      message: `«${v?v.title:"Este vídeo"}» se eliminará permanentemente. Esta acción no se puede deshacer.`,
      confirmLabel: "Eliminar",
      danger: true,
      onConfirm: () => { setTrash(t=>t.filter(x=>x.id!==id)); setConfirm(null); toast("Vídeo eliminado permanentemente"); }
    });
  };

  const duplicateVideo = (v) => {
    const copy = {...clone(v), id:uid(), title:v.title+" (copia)", status:"idea", date:null};
    setVideos(vs=>[...vs, copy]);
    setEditing(copy);
    toast("Vídeo duplicado");
  };

  const quickAdd = (date) => {
    const v = makeVideo({date, status: date?"programado":"idea", title:"Nueva idea"}, formats);
    setVideos(vs=>[...vs, v]);
    setEditing(v);
  };

  const tabs = [
    {id:"calendar", label:"Calendario", icon:Icons.calendar, primary:true, grupo:"plan"},
    {id:"kanban", label:"Ideas y tablero", icon:Icons.kanban, primary:true, grupo:"plan"},
    {id:"tasks", label:"Tareas", icon:Icons.tasks, grupo:"plan", badge: taskLists.reduce((a,l)=>{
      if(l.fixed){
        // Diarias: vencidas si no se hicieron hoy y pasó su hora límite
        const tk = (()=>{ const d=new Date();const p=n=>String(n).padStart(2,"0");return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; })();
        return a + l.tasks.filter(t=>t.lastDone!==tk && t.limitTime && (()=>{ const [h,m]=t.limitTime.split(":").map(Number); const lim=new Date();lim.setHours(h||0,m||0,0,0); return Date.now()>lim.getTime(); })()).length;
      }
      return a + l.tasks.filter(t=>!t.done && t.due && new Date(t.due).getTime()<Date.now()).length;
    },0)},
    {id:"scheduled", label:"YouTube", icon:Icons.youtube, primary:true, grupo:"canal"},
    {id:"stats", label:"Estadísticas", icon:Icons.chart, grupo:"canal"},
    {id:"directos", label:"Directos", icon:Icons.live, primary:true, grupo:"produccion", pc:true},
    {id:"clips", label:"Clips", icon:Icons.scissors, primary:true, grupo:"produccion", pc:true},
    {id:"editor", label:"RandomEditor", icon:Icons.edit, grupo:"produccion", pc:true},
    {id:"ranking", label:"Ranking de Shorts", icon:Icons.chart, primary:true, grupo:"produccion", pc:true},
    {id:"convertidor", label:"Convertidor", icon:Icons.download, primary:true, grupo:"produccion", pc:true},
    {id:"randomchat", label:"RandomChat", icon:Icons.chat, grupo:"produccion", pc:true},
    {id:"agent", label:"Agente", icon:Icons.sparkles, grupo:"asistente"},
    {id:"config", label:"Configuración", icon:Icons.gear, grupo:"abajo"},
    {id:"trash", label:"Papelera", icon:Icons.trash, badge:trash.length, grupo:"abajo"},
  ];
  // v3.11: Ctrl+1…9 salta a cada apartado (en el orden de la barra)
  tabs.filter(t=>t.grupo!=="abajo").forEach((t,i)=>{ if(i<9) t.atajo = i+1; });
  const vistaActual = tabs.find(t=>t.id===view) || tabs[0];
  const tabsRef = useRef(tabs); tabsRef.current = tabs;
  useEffect(()=>{
    const h = e => {
      if((e.ctrlKey||e.metaKey) && !e.shiftKey && !e.altKey && /^[1-9]$/.test(e.key)){
        const t = tabsRef.current.find(x=>x.atajo===Number(e.key));
        if(t){ e.preventDefault(); setView(t.id); }
      }
    };
    window.addEventListener("keydown", h);
    return ()=>window.removeEventListener("keydown", h);
  },[]);
  // v3: arriba van las principales y, si estás en otra, también esa (resaltada),
  // para que siempre se vea dónde estás
  const primaryTabs = tabs.filter(t=>t.primary || t.id===view);

  // Registro del Service Worker + permiso al arrancar
  // Inicia la conexión con Google desde la vista de YouTube
  const connectGoogle = () => {
    try { sessionStorage.setItem("rds_yt_return", "scheduled"); } catch(e){}
    ytStartAuth();
  };

  // Registra una lectura de suscriptores en el historial (máx. una cada 30 min)
  const recordSubs = (subs) => {
    setSubHistory(prev=>{
      const list = prev || [];
      const last = list[list.length-1];
      const now = Date.now();
      if(last && (now - last.t) < 30*60*1000 && last.s === subs) return list;
      if(last && last.s === subs && (now - last.t) < 6*60*60*1000) return list;
      const next = [...list, { t: now, s: subs }];
      return next.length > 500 ? next.slice(next.length-500) : next;
    });
  };

  // Aviso de publicación: comprueba periódicamente si algún vídeo PROGRAMADO ya se publicó
  // y lanza una notificación. Solo con la app visible y la sesión de Google activa.
  useEffect(()=>{
    let stopped = false;
    const checkPublished = async () => {
      if(stopped || document.visibilityState!=="visible") return;
      if(!ytIsConnected() || !ytTokenValid()) return;
      const s = stateRef.current;
      const scheduled = (s.videos||[]).filter(v=>v.youtubeId && v.youtubeStatus==="scheduled");
      // Comentarios preparados que quedaron pendientes (p. ej. falló el primer intento)
      const comentariosPendientes = (s.videos||[]).filter(v=>v.youtubeId && v.youtubeStatus==="published" && v.pinnedComment && !v.pinnedCommentPosted);
      for(const v of comentariosPendientes){
        try {
          await ytPostComment(v.youtubeId, v.pinnedComment);
          setVideos(vs=>vs.map(x=>x.id===v.id?{...x, pinnedCommentPosted:true, updatedAt:Date.now()}:x));
          toast("💬 Comentario publicado en «"+(v.title||"el vídeo")+"»");
        } catch(e){ /* reintento en el próximo ciclo */ }
      }
      if(scheduled.length===0) return;
      try {
        const map = await ytCheckVideos(scheduled.map(v=>v.youtubeId));
        const nowPublished = [];
        scheduled.forEach(v=>{
          const st = map[v.youtubeId];
          if(!st || !st.exists) return;
          if(st.privacyStatus==="public"){
            nowPublished.push(v);
            setVideos(vs=>vs.map(x=>x.id===v.id?{...x, youtubeStatus:"published", status:"publicado", updatedAt:Date.now()}:x));
          } else if(st.publishAt){
            // Reprogramado en YouTube → mover también aquí (fecha y hora locales)
            const wd = new Date(st.publishAt);
            const p2 = n=>String(n).padStart(2,"0");
            const nd = `${wd.getFullYear()}-${p2(wd.getMonth()+1)}-${p2(wd.getDate())}`;
            const nt = `${p2(wd.getHours())}:${p2(wd.getMinutes())}`;
            if(nd!==v.date || nt!==v.time){
              setVideos(vs=>vs.map(x=>x.id===v.id?{...x, date:nd, time:nt, updatedAt:Date.now()}:x));
            }
          }
        });
        for(const v of nowPublished){
          fireNotification("🎉 ¡Vídeo publicado!", "«"+(v.title||"Tu vídeo")+"» ya está disponible en YouTube");
          // Comentario fijado preparado → publicarlo ahora que el vídeo es público
          if(v.pinnedComment && !v.pinnedCommentPosted){
            try {
              await ytPostComment(v.youtubeId, v.pinnedComment);
              setVideos(vs=>vs.map(x=>x.id===v.id?{...x, pinnedCommentPosted:true, updatedAt:Date.now()}:x));
              toast("💬 Comentario publicado en «"+(v.title||"el vídeo")+"»");
            } catch(e){ /* se reintentará en la próxima comprobación */ }
          }
        }
        if(nowPublished.length>0) toast("🎉 "+nowPublished.length+" vídeo(s) recién publicado(s)");
      } catch(e){ /* silencioso */ }
    };
    const iv = setInterval(checkPublished, 5*60*1000); // cada 5 min
    const t0 = setTimeout(checkPublished, 8000);        // una primera pasada al arrancar
    const onVis = ()=>{ if(document.visibilityState==="visible") checkPublished(); };
    document.addEventListener("visibilitychange", onVis);
    return ()=>{ stopped=true; clearInterval(iv); clearTimeout(t0); document.removeEventListener("visibilitychange", onVis); };
  },[]);

  useEffect(()=>{ registerNotifSW(); },[]);

  // Mantener viva la sesión de Google: renovar el token en silencio antes de que caduque.
  useEffect(()=>{
    const check = async () => {
      if(document.visibilityState!=="visible") return;
      if(ytIsConnected() && !ytTokenValid()){
        await ytSilentRefresh(); // renueva sin recargar ni pedir login otra vez
      }
    };
    check();
    const iv = setInterval(check, 4*60*1000); // cada 4 min
    const onVis = ()=>{ if(document.visibilityState==="visible") check(); };
    document.addEventListener("visibilitychange", onVis);
    return ()=>{ clearInterval(iv); document.removeEventListener("visibilitychange", onVis); };
  },[]);

  // Al volver del login de Google (redirect con #access_token), guardar el token
  // y reabrir el modal de subida del vídeo que estábamos subiendo.
  useEffect(()=>{
    (async ()=>{
      let captured = ytCaptureAuthFromHash();
      // Flujo nuevo (?code=...): canjear en el backend por tokens permanentes
      if(!captured){
        try {
          const q = new URLSearchParams(window.location.search);
          const code = q.get("code");
          if(code){
            captured = await ytExchangeCode(code);
            history.replaceState(null, "", window.location.pathname);
            if(!captured) toast("❌ No se pudo completar el login de Google");
          }
        } catch(e){}
      }
      if(captured){
        toast("✅ Conectado con Google · la sesión ya no caduca");
        try {
          const pendingId = sessionStorage.getItem("rds_yt_pending");
          const ret = sessionStorage.getItem("rds_yt_return");
          if(pendingId){
            sessionStorage.removeItem("rds_yt_pending");
            setTimeout(()=>{
              const vid = (stateRef.current.videos||[]).find(v=>v.id===pendingId);
              if(vid){ setView("calendar"); setYtUpload(vid); }
            }, 300);
          } else if(ret){
            sessionStorage.removeItem("rds_yt_return");
            setView(ret);
          }
        } catch(e){}
      }
    })();
  },[]);

  // ARCHIVADO DIARIO (corte a las 6:00): mueve las tareas diarias hechas ayer al archivo
  // semanal y marca como "atrasadas" las que quedaron sin hacer. Corre al abrir y cada 5 min.
  const rollDailyTasks = () => {
    const today = dailyDayKey();
    let archivedAny = false;
    const newArchiveEntries = {};
    setTaskLists(ls=>{
      let changed = false;
      const next = ls.map(l=>{
        if(!l.fixed) return l;
        const tasks = (l.tasks||[]).map(t=>{
          // Tarea marcada como hecha en un día lógico ANTERIOR → archivar y reiniciar
          if(t.lastDone && t.lastDone < today){
            const wk = weekKey(new Date(t.lastDone+"T12:00"));
            (newArchiveEntries[wk] = newArchiveEntries[wk] || []).push({ title:t.title, doneAt: t.completedAt || new Date(t.lastDone+"T12:00").getTime() });
            archivedAny = true; changed = true;
            // Reiniciar la tarea para el nuevo día: pendiente, y su "lastPending" pasa a hoy
            return {...t, lastDone:null, lastPending: today, completedAt:null, updatedAt:Date.now()};
          }
          // Tarea sin hacer de un día anterior → dejarla como atrasada (lastPending viejo)
          if(!t.lastDone){
            if(!t.lastPending){ changed = true; return {...t, lastPending: today, updatedAt:Date.now()}; }
            // lastPending ya es < today → queda atrasada; no tocamos para no romper la marca
            return t;
          }
          return t;
        });
        return changed ? {...l, tasks} : l;
      });
      return changed ? next : ls;
    });
    if(archivedAny){
      setDailyArchive(a=>{
        const copy = {...a};
        Object.entries(newArchiveEntries).forEach(([wk,items])=>{
          copy[wk] = [...(copy[wk]||[]), ...items];
        });
        return copy;
      });
    }
  };
  useEffect(()=>{
    rollDailyTasks(); // al abrir
    const iv = setInterval(rollDailyTasks, 5*60*1000); // cada 5 min por si la app queda abierta al cruzar las 6am
    return ()=>clearInterval(iv);
  },[]);

  // PLANIFICADOR DE NOTIFICACIONES
  // Marca "notified" en un registro LOCAL por dispositivo (no se sincroniza, para que cada
  // dispositivo avise una vez y la sincronización no reactive ni silencie avisos).
  const notifiedRef = useRef({});
  useEffect(()=>{
    try { notifiedRef.current = JSON.parse(localStorage.getItem("rds_notified")||"{}"); } catch(e){ notifiedRef.current = {}; }
  },[]);
  const markNotified = (id, dueSnapshot) => {
    notifiedRef.current[id] = { at: Date.now(), due: dueSnapshot };
    try { localStorage.setItem("rds_notified", JSON.stringify(notifiedRef.current)); } catch(e){}
  };
  // ¿Ya se notificó esta tarea CON esta misma hora? Si cambió la hora, se puede volver a avisar.
  const alreadyNotified = (t) => {
    const rec = notifiedRef.current[t.id];
    if(!rec) return false;
    if(typeof rec === "number") return true; // formato antiguo
    return rec.due === (t.due||null);
  };

  useEffect(()=>{
    let timers = [];
    const fireFor = (t, listName) => {
      if(alreadyNotified(t)) return; // ya avisado en este dispositivo con esta hora
      markNotified(t.id, t.due||null);
      const ok = fireNotification("⏰ " + t.title, "Tarea programada" + (listName?" · "+listName:""));
      if(!ok) toast("🔔 " + t.title);
    };
    const scan = () => {
      const now = Date.now();
      const lists = stateRef.current.taskLists || [];
      timers.forEach(clearTimeout); timers = [];
      lists.forEach(l=>{
        (l.tasks||[]).forEach(t=>{
          if(t.done || !t.due) return;
          if(alreadyNotified(t)) return;
          const at = new Date(t.due).getTime();
          if(isNaN(at)) return;
          if(at <= now){
            fireFor(t, l.name); // ya venció → avisar ya
          } else if(at - now <= 65000){
            // Vence en menos de ~1 min → programar timeout exacto
            timers.push(setTimeout(()=>fireFor(t, l.name), at - now));
          }
        });
      });
    };
    scan();
    const iv = setInterval(scan, 15000); // reevaluar cada 15s
    // Limpiar registros de tareas que ya no existen (evita que crezca sin fin)
    const clean = setInterval(()=>{
      const ids = new Set((stateRef.current.taskLists||[]).flatMap(l=>(l.tasks||[]).map(t=>t.id)));
      let changed=false;
      Object.keys(notifiedRef.current).forEach(id=>{ if(!ids.has(id)){ delete notifiedRef.current[id]; changed=true; } });
      if(changed){ try { localStorage.setItem("rds_notified", JSON.stringify(notifiedRef.current)); } catch(e){} }
    }, 120000);
    return ()=>{ clearInterval(iv); clearInterval(clean); timers.forEach(clearTimeout); };
  },[]);

  return (
    <div className="app-shell" style={{display:"flex",minHeight:"100vh",background:"radial-gradient(1200px 600px at 80% -10%, rgba(212,175,55,0.06), transparent), var(--bg)"}}>
      <BarraLateral tabs={tabs} view={view} setView={setView} plegada={plegada} setPlegada={setPlegada}/>
      <div className="app-col" style={{flex:1,minWidth:0,display:"flex",flexDirection:"column"}}>
      {/* HEADER */}
      <header style={{borderBottom:"1px solid var(--border)",position:"sticky",top:0,zIndex:50,backdropFilter:"blur(12px)",background:"var(--header-bg)"}}>
        <div className="app-header" style={{maxWidth:1500,margin:"0 auto",padding:"0 24px",height:66,display:"flex",alignItems:"center",justifyContent:"space-between",gap:16}}>
          <div style={{display:"flex",alignItems:"center",gap:13}}>
            <button onClick={()=>setMenuOpen(true)} title="Abrir menú" className="menu-btn" style={{
              display:"none",alignItems:"center",justifyContent:"center",width:40,height:40,borderRadius:11,
              color:"var(--text)",border:"1px solid var(--border)",flexShrink:0
            }}>{Icons.menu}</button>
            {/* v3.11: arriba, dónde estás (la navegación va en la barra lateral) */}
            <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0}}>
              <span style={{display:"flex",color:"var(--gold)"}}>{vistaActual.icon}</span>
              <h1 style={{fontFamily:"'Sora'",fontSize:18,fontWeight:700,letterSpacing:"-.01em",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{vistaActual.label}</h1>
            </div>
          </div>

          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            {/* Buscador global: encuentra cualquier vídeo y abre su ventana */}
            <GlobalSearch videos={videos} formats={formats} onOpen={setEditing} secciones={tabs} onIr={setView}/>

            {/* Grupo edición: deshacer / rehacer (oculto en móvil, va al menú lateral) */}
            <div className="undo-group" style={{display:"flex",gap:2,background:"var(--bg-2)",border:"1px solid var(--border)",borderRadius:11,padding:3}}>
              <button onClick={undo} disabled={!historyRef.current.past.length} title="Deshacer (Ctrl+Z)" style={{
                display:"flex",alignItems:"center",justifyContent:"center",width:32,height:30,borderRadius:8,
                color: historyRef.current.past.length?"var(--text-2)":"var(--empty)", opacity: historyRef.current.past.length?1:0.5, transition:"color .15s"
              }} onMouseEnter={e=>{if(historyRef.current.past.length)e.currentTarget.style.color="var(--gold)";}}
                 onMouseLeave={e=>e.currentTarget.style.color=historyRef.current.past.length?"var(--text-2)":"var(--empty)"}>{Icons.undo}</button>
              <button onClick={redo} disabled={!historyRef.current.future.length} title="Rehacer (Ctrl+Y)" style={{
                display:"flex",alignItems:"center",justifyContent:"center",width:32,height:30,borderRadius:8,
                color: historyRef.current.future.length?"var(--text-2)":"var(--empty)", opacity: historyRef.current.future.length?1:0.5, transition:"color .15s"
              }} onMouseEnter={e=>{if(historyRef.current.future.length)e.currentTarget.style.color="var(--gold)";}}
                 onMouseLeave={e=>e.currentTarget.style.color=historyRef.current.future.length?"var(--text-2)":"var(--empty)"}>{Icons.redo}</button>
            </div>

            {/* Grupo herramientas: tema + formatos (formatos oculto en móvil, va al menú) */}
            <div className="tools-group" style={{display:"flex",gap:2,background:"var(--bg-2)",border:"1px solid var(--border)",borderRadius:11,padding:3}}>
              <button onClick={()=>setTheme(t=>t==="dark"?"light":"dark")} title={theme==="dark"?"Tema claro":"Tema oscuro"} style={{
                display:"flex",alignItems:"center",justifyContent:"center",width:32,height:30,borderRadius:8,color:"var(--text-2)",transition:"color .15s"
              }} onMouseEnter={e=>e.currentTarget.style.color="var(--gold)"} onMouseLeave={e=>e.currentTarget.style.color="var(--text-2)"}>
                {theme==="dark"?Icons.sun:Icons.moon}
              </button>
              <button onClick={()=>setShowFormats(true)} title="Gestionar formatos" className="fmt-btn" style={{
                display:"flex",alignItems:"center",justifyContent:"center",width:32,height:30,borderRadius:8,color:"var(--text-2)",transition:"color .15s"
              }} onMouseEnter={e=>e.currentTarget.style.color="var(--gold)"} onMouseLeave={e=>e.currentTarget.style.color="var(--text-2)"}>
                {Icons.tag}
              </button>
            </div>

            {/* Grupo sincronización: refrescar + estado */}
            {(()=>{
              const manualPending = syncMode==="manual" && pendingChanges;
              const si = {
                connecting:{c:"var(--gold)",t:"Conectando…",icon:Icons.cloud,pulse:true},
                online:{c:"var(--green)",t:"Sincronizado",icon:Icons.cloudCheck,pulse:false},
                saving:{c:"var(--gold)",t:"Guardando…",icon:Icons.cloud,pulse:true},
                offline:{c:"var(--red)",t:"Sin conexión",icon:Icons.cloud,pulse:false},
              }[syncStatus] || {c:"var(--text-3)",t:"—",icon:Icons.cloud,pulse:false};
              const off = syncStatus==="offline";
              // En modo manual con cambios sin subir, el badge lo indica claramente
              const disp = manualPending
                ? {c:"var(--gold)",t:"Cambios sin subir",pulse:true}
                : (syncMode==="manual" ? {c:si.c,t:"Manual · al día",pulse:false} : si);
              return (
                <div style={{display:"flex",gap:2,background:"var(--bg-2)",border:`1px solid ${off?"rgba(248,113,113,0.5)":(manualPending?"var(--border-gold)":"var(--border)")}`,borderRadius:11,padding:3}}>
                  <button onClick={syncNow} disabled={manualSyncing} title={syncMode==="manual"?"Sincronizar ahora (subir y bajar)":"Sincronizar ahora"} style={{
                    display:"flex",alignItems:"center",justifyContent:"center",width:32,height:30,borderRadius:8,
                    color: (manualSyncing||manualPending)?"var(--gold)":"var(--text-2)",transition:"color .15s"
                  }} onMouseEnter={e=>e.currentTarget.style.color="var(--gold)"} onMouseLeave={e=>{if(!manualSyncing&&!manualPending)e.currentTarget.style.color="var(--text-2)";}}>
                    <span className={manualSyncing?"spinning":""} style={{display:"flex"}}>{Icons.refresh}</span>
                  </button>
                  <button onClick={()=>setShowSync(true)} title="Sincronización entre dispositivos" className="sync-btn" style={{
                    display:"flex",alignItems:"center",gap:7,fontSize:12,fontWeight:600,color:disp.c,padding:"0 11px 0 9px",borderRadius:8,
                    background: off?"rgba(248,113,113,0.1)":(manualPending?"rgba(212,175,55,0.08)":"transparent"), transition:"all .15s",whiteSpace:"nowrap"
                  }}>
                    <span className={"sync-dot"+(disp.pulse?" pulsing":"")} style={{background:disp.c}}/>
                    <span className={off?"":"sync-label"}>{disp.t}</span>
                  </button>
                </div>
              );
            })()}
          </div>
        </div>
      </header>

      {/* AVISO DE MODO SIN CONEXIÓN */}
      {syncStatus==="offline" && (
        <div className="fade-in" style={{background:"rgba(248,113,113,0.08)",borderBottom:"1px solid rgba(248,113,113,0.25)",padding:"9px 16px",display:"flex",alignItems:"center",justifyContent:"center",gap:9,flexWrap:"wrap"}}>
          {/* v3: la nube exige la sesión de Google del canal */}
          <span style={{fontSize:12.5,color:"var(--red)",fontWeight:600}}>{ytIsConnected() ? "Sin conexión" : "Nube sin conectar"}</span>
          <span style={{fontSize:12,color:"var(--text-2)"}}>{ytIsConnected()
            ? "Trabajas con la copia guardada en este dispositivo. Tus cambios se conservan y se subirán solos al volver internet."
            : "Para sincronizar, conecta tu cuenta de Google del canal. Mientras, todo se guarda en este dispositivo."}</span>
          {ytIsConnected()
            ? <button onClick={syncNow} style={{fontSize:12,fontWeight:700,color:"var(--red)",border:"1px solid rgba(248,113,113,0.4)",borderRadius:8,padding:"4px 11px"}}>Reintentar</button>
            : <button onClick={connectGoogle} style={{fontSize:12,fontWeight:700,color:"var(--red)",border:"1px solid rgba(248,113,113,0.4)",borderRadius:8,padding:"4px 11px"}}>Conectar Google</button>}
        </div>
      )}

      {/* MENÚ LATERAL (móvil) */}
      {menuOpen && (
        <div onClick={()=>setMenuOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:900,backdropFilter:"blur(2px)"}}>
          <div onClick={e=>e.stopPropagation()} className="drawer" style={{
            position:"absolute",left:0,top:0,bottom:0,width:280,maxWidth:"82vw",
            background:"var(--bg-2)",borderRight:"1px solid var(--border)",display:"flex",flexDirection:"column",
            paddingTop:"calc(env(safe-area-inset-top) + 14px)",paddingBottom:"calc(env(safe-area-inset-bottom) + 14px)",
            boxShadow:"12px 0 40px rgba(0,0,0,0.5)"
          }}>
            <div style={{display:"flex",alignItems:"center",gap:11,padding:"4px 16px 16px",borderBottom:"1px solid var(--border)"}}>
              <div className="grad-gold" style={{width:34,height:34,borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center",color:"#000"}}>
                <span style={{fontFamily:"'Sora'",fontWeight:800,fontSize:16}}>R</span>
              </div>
              <div>
                <div style={{fontFamily:"'Sora'",fontWeight:700,fontSize:14.5}}>Random<span className="gold-text">Studio</span></div>
                <div style={{fontSize:10,color:"var(--text-3)"}}>Gestor de contenido</div>
              </div>
              <button onClick={()=>setMenuOpen(false)} style={{marginLeft:"auto",color:"var(--text-2)",display:"flex",padding:5}}>{Icons.x}</button>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:4,padding:"14px 12px",flex:1,overflowY:"auto"}}>
              {tabs.map(tb=>(
                <button key={tb.id} onClick={()=>{setView(tb.id); setMenuOpen(false);}} style={{
                  display:"flex",alignItems:"center",gap:12,fontSize:14,fontWeight:600,padding:"13px 14px",borderRadius:11,transition:"all .15s",textAlign:"left",
                  ...(view===tb.id
                    ? {background:"linear-gradient(135deg,rgba(212,175,55,0.18),rgba(212,175,55,0.08))",color:"var(--gold)",boxShadow:"0 0 0 1px rgba(212,175,55,0.25)"}
                    : {color:"var(--text-2)"})
                }}>{tb.icon}<span style={{flex:1}}>{tb.label}</span>
                  {tb.badge>0 && <span style={{
                    fontSize:10,fontWeight:700,minWidth:18,height:18,padding:"0 5px",borderRadius:9,
                    background:"var(--red)",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center"
                  }}>{tb.badge}</span>}
                </button>
              ))}
              <div style={{height:1,background:"var(--border)",margin:"10px 4px"}}/>
              <div style={{display:"flex",gap:8,padding:"0 2px"}}>
                <button onClick={undo} disabled={!historyRef.current.past.length} style={{
                  flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:8,fontSize:13,fontWeight:600,padding:"11px",borderRadius:11,
                  color: historyRef.current.past.length?"var(--text-2)":"var(--empty)",border:"1px solid var(--border)",opacity:historyRef.current.past.length?1:0.55
                }}>{Icons.undo} Deshacer</button>
                <button onClick={redo} disabled={!historyRef.current.future.length} style={{
                  flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:8,fontSize:13,fontWeight:600,padding:"11px",borderRadius:11,
                  color: historyRef.current.future.length?"var(--text-2)":"var(--empty)",border:"1px solid var(--border)",opacity:historyRef.current.future.length?1:0.55
                }}>{Icons.redo} Rehacer</button>
              </div>
              <button onClick={()=>{setShowFormats(true); setMenuOpen(false);}} style={{
                display:"flex",alignItems:"center",gap:12,fontSize:14,fontWeight:600,padding:"13px 14px",borderRadius:11,color:"var(--text-2)",textAlign:"left"
              }}>{Icons.tag}<span>Formatos</span></button>
              <button onClick={()=>{setShowSync(true); setMenuOpen(false);}} style={{
                display:"flex",alignItems:"center",gap:12,fontSize:14,fontWeight:600,padding:"13px 14px",borderRadius:11,color:"var(--text-2)",textAlign:"left"
              }}>{Icons.cloud}<span>Sincronización</span></button>
            </div>
            <div style={{padding:"10px 16px 0",borderTop:"1px solid var(--border)",fontSize:10.5,color:"var(--text-3)"}}>
              {syncStatus==="offline" ? "Sin conexión con la nube: los cambios se subirán al volver" : (syncMode==="manual" ? "Sincronización manual" : "Datos sincronizados con la nube")}
            </div>
          </div>
        </div>
      )}

      {/* MAIN */}
      <main className="app-main" style={{maxWidth:1500,width:"100%",boxSizing:"border-box",margin:"0 auto",padding:"26px 24px 60px"}}>
        <ExpandCtx.Provider value={cardsExpanded}>
        {(view==="calendar" || view==="kanban" || view==="scheduled") && (
          <div style={{display:"flex",justifyContent:"flex-end",marginBottom:8}}>
            <button onClick={()=>setCardsExpanded(x=>!x)} title={cardsExpanded?"Contraer todas las tarjetas":"Expandir todas las tarjetas"} style={{
              display:"flex",alignItems:"center",gap:6,fontSize:11.5,fontWeight:600,color:"var(--text-3)",
              border:"1px solid var(--border)",borderRadius:8,padding:"6px 11px"
            }}>
              <span style={{display:"flex",transform:cardsExpanded?"rotate(180deg)":"none",transition:"transform .18s"}}>{Icons.chevron}</span>
              {cardsExpanded?"Contraer todo":"Expandir todo"}
            </button>
          </div>
        )}
        {["calendar","kanban","scheduled"].includes(view) && <StatStrip videos={videos}/>}
        {view==="kanban" && (
          <div style={{position:"relative",marginBottom:16,maxWidth:340}}>
            <span style={{position:"absolute",left:13,top:"50%",transform:"translateY(-50%)",color:"var(--text-3)",display:"flex"}}>{Icons.search}</span>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar vídeo por título..." style={{...inputStyle,paddingLeft:38}}/>
          </div>
        )}
        {view==="calendar" && <CalendarView videos={videos} onOpen={setEditing} onDrop={dropOnDate} onDragStart={onDragStart} onDragEnd={onDragEnd} weekOffset={weekOffset} setWeekOffset={setWeekOffset} calView={calView} setCalView={setCalView} onQuickAdd={quickAdd} onUnassign={unassignVideo} formats={formats}/>}
        {view==="kanban" && <KanbanView videos={videos} onOpen={setEditing} onDrop={dropOnStatus} onDragStart={onDragStart} onDragEnd={onDragEnd} onQuickAdd={quickAdd} formats={formats} search={search}/>}
        {view==="tasks" && <TasksView taskLists={taskLists} setTaskLists={setTaskLists} dailyArchive={dailyArchive} toast={toast} onTaskDeleted={(id)=>addTomb(id,"task")} onListDeleted={(id)=>addTomb(id,"list")} askConfirm={(cfg)=>setConfirm({...cfg, onConfirm:()=>{ cfg.onConfirm(); setConfirm(null); }})}/>}
        {view==="stats" && <StatsView videos={videos} goals={goals} onConnect={connectGoogle}/>}
        {view==="scheduled" && <ScheduledView videos={videos} trashYtIds={trash.map(t=>t.youtubeId).filter(Boolean)} onOpen={setEditing} onUpdateVideo={(id,patch)=>setVideos(vs=>vs.map(v=>v.id===id?{...v,...patch,updatedAt:Date.now()}:v))} onAddVideos={(nuevos)=>setVideos(vs=>[...vs, ...nuevos])} subHistory={subHistory} onRecordSubs={recordSubs} onConnect={connectGoogle} formats={formats} toast={toast} goals={goals} setGoals={setGoals}/>}
        {view==="agent" && <AgentView promptTemplates={promptTemplates} setPromptTemplates={setPromptTemplates} toast={toast}/>}
        {view==="directos" && <DirectosView toast={toast}/>}
        {view==="clips" && <ClipsView toast={toast}/>}
        {view==="ranking" && <RankingView toast={toast}/>}
        {view==="convertidor" && <ConvertidorView toast={toast}/>}
        {view==="randomchat" && <RandomChatView toast={toast}/>}
        {view==="trash" && <TrashView trash={trash} onRestore={restoreVideo} onDeleteForever={deleteForever} onEmpty={emptyTrash} formats={formats}/>}
        {view==="config" && <ConfigView goals={goals} setGoals={setGoals} theme={theme} setTheme={setTheme} cardsExpanded={cardsExpanded} setCardsExpanded={setCardsExpanded} onConnect={connectGoogle} onExport={exportData} onImport={importData} onReset={resetAll} toast={toast}/>}

        <footer style={{marginTop:40,paddingTop:20,borderTop:"1px solid var(--border)",display:"flex",flexDirection:"column",gap:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
            <p style={{fontSize:12,color:"var(--text-3)",lineHeight:1.5,maxWidth:520}}>
              Tus datos se guardan en este dispositivo y se sincronizan en la nube con tu código de sincronización. Úsalo en otro dispositivo para tener todo al día.
            </p>
            <button onClick={resetAll} style={{
              display:"flex",alignItems:"center",gap:7,fontSize:12.5,fontWeight:600,color:"var(--text-3)",padding:"8px 13px",borderRadius:9,
              border:"1px solid var(--border)",transition:"all .15s",whiteSpace:"nowrap"
            }} onMouseEnter={e=>{e.currentTarget.style.color="var(--red)";e.currentTarget.style.borderColor="rgba(248,113,113,0.3)";}}
               onMouseLeave={e=>{e.currentTarget.style.color="var(--text-3)";e.currentTarget.style.borderColor="var(--border)";}}>
              {Icons.trash} Restablecer datos
            </button>
          </div>
          <div style={{textAlign:"center",fontSize:11.5,color:"var(--text-3)",paddingTop:6,borderTop:"1px solid var(--border)"}}>
            <span style={{fontFamily:"'Sora'",fontWeight:700}}>Random<span className="gold-text">Studio</span></span>
            <span style={{margin:"0 8px",opacity:.5}}>·</span>
            <span>v{APP_VERSION}</span>
            <span style={{margin:"0 8px",opacity:.5}}>·</span>
            <span>© {new Date().getFullYear()} RDeRandom. Todos los derechos reservados.</span>
          </div>
        </footer>
        </ExpandCtx.Provider>
      </main>
      </div>

      {editing && <VideoModal v={editing} allVideos={videos} goals={goals} onClose={()=>setEditing(null)} onSave={saveVideo} onDelete={deleteVideo} onDuplicate={duplicateVideo} onUploadYouTube={(draft)=>{ setEditing(null); setYtUpload(draft); }} promptTemplates={promptTemplates} toast={toast} formats={formats}/>}
      {ytUpload && <YouTubeUploadModal video={ytUpload} allVideos={videos} tagTemplates={tagTemplates} setTagTemplates={setTagTemplates} onClose={()=>setYtUpload(null)} onDone={(yt)=>{ setVideos(vs=>vs.map(v=>v.id===ytUpload.id?completarChecklist({...v, ...yt, updatedAt:Date.now()}):v)); }} toast={toast}/>}
      {showFormats && <FormatsModal formats={formats} setFormats={setFormats} videos={videos} onClose={()=>setShowFormats(false)} toast={toast} askConfirm={(cfg)=>setConfirm({...cfg, onConfirm:()=>{ cfg.onConfirm(); setConfirm(null); }})}/>}
      {showSync && <SyncModal syncCode={syncCode} status={syncStatus} syncMode={syncMode} setSyncMode={setSyncMode} pendingChanges={pendingChanges} onClose={()=>setShowSync(false)} onLink={linkToCode} onExport={exportData} onImport={importData} onSyncNow={syncNow} syncing={manualSyncing} toast={toast}/>}
      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
        danger={confirm?.danger}
        onConfirm={()=>confirm?.onConfirm&&confirm.onConfirm()}
        onCancel={()=>setConfirm(null)}
      />
      {/* BANNER PERSISTENTE DE TAREAS VENCIDAS */}
      {(()=>{
        const overdueList = [];
        taskLists.forEach(l=>l.tasks.forEach(t=>{
          if(!t.done && t.due && new Date(t.due).getTime() < Date.now()) overdueList.push({...t, listName:l.name});
        }));
        if(overdueList.length===0 || view==="tasks") return null;
        const postponeAll = () => {
          const newDue = new Date(Date.now()+60*60*1000);
          const pad = n=>String(n).padStart(2,"0");
          const iso = `${newDue.getFullYear()}-${pad(newDue.getMonth()+1)}-${pad(newDue.getDate())}T${pad(newDue.getHours())}:${pad(newDue.getMinutes())}`;
          setTaskLists(ls=>ls.map(l=>({...l, tasks:l.tasks.map(t=>
            (!t.done && t.due && new Date(t.due).getTime()<Date.now()) ? {...t, due:iso, notified:false} : t
          )})));
          toast("Tareas pospuestas 1 hora");
        };
        return (
          <div className="overdue-banner" style={{
            position:"fixed", bottom:"calc(env(safe-area-inset-bottom) + 16px)", left:"50%", transform:"translateX(-50%)",
            zIndex:850, display:"flex", alignItems:"center", gap:10, flexWrap:"wrap", justifyContent:"center",
            background:"var(--bg-2)", border:"1px solid rgba(248,113,113,0.45)", borderRadius:13,
            padding:"11px 15px", boxShadow:"0 12px 40px rgba(0,0,0,0.5)", maxWidth:"calc(100vw - 24px)"
          }}>
            <span style={{display:"flex",color:"var(--red)"}}>{Icons.bell}</span>
            <span style={{fontSize:12.5,fontWeight:700,color:"var(--red)",whiteSpace:"nowrap"}}>
              {overdueList.length} tarea{overdueList.length!==1?"s":""} vencida{overdueList.length!==1?"s":""}
            </span>
            <span style={{fontSize:12,color:"var(--text-2)",maxWidth:220,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} className="tab-label">
              {overdueList[0].title}{overdueList.length>1?` y ${overdueList.length-1} más`:""}
            </span>
            <button onClick={()=>setView("tasks")} className="grad-gold" style={{fontSize:12,fontWeight:700,color:"#000",padding:"6px 13px",borderRadius:8,flexShrink:0}}>Ver</button>
            <button onClick={postponeAll} style={{fontSize:12,fontWeight:600,color:"var(--text-2)",padding:"6px 11px",borderRadius:8,border:"1px solid var(--border)",flexShrink:0}}>+1 hora</button>
          </div>
        );
      })()}

      {toastNode}

      <style>{`
        /* La pista táctil solo se ve en pantallas pequeñas */
        .hint-touch { display:none; }

        /* ——— Animaciones leves ——— */
        [data-drop="card"] { transition: transform .13s ease, box-shadow .18s ease, background .15s, border-color .15s !important; }
        [data-drop="card"]:hover { transform: translateY(-1px); box-shadow: 0 5px 16px rgba(0,0,0,0.28); }
        .modal-overlay > div, .yt-modal-panel { animation: modalIn .16s ease; }
        @keyframes modalIn { from { opacity:0; transform: translateY(8px) scale(.985); } to { opacity:1; transform:none; } }

        @media (max-width: 1100px) {
          .global-search { display:none; }
        }

        /* Editor de vídeo: ancho y a dos columnas en escritorio */
        @media (min-width: 900px) {
          .vm-panel { max-width: 980px !important; }
          .vm-cols { display: grid !important; grid-template-columns: 1fr 1.15fr; gap: 22px; align-items: start; }
        }

        @media (max-width: 1100px) {
          .stat-grid { grid-template-columns: repeat(3,1fr) !important; }
        }
        /* v3.11: el título de cada apartado ya va arriba; las explicaciones largas, plegadas */
        .titulo-vista { display:none !important; }
        details.ayuda > summary { cursor:pointer; font-size:12.5px; color:var(--text-3); list-style:none; display:inline-flex; gap:6px; align-items:center; }
        details.ayuda > summary::before { content:"ⓘ"; color:var(--gold); }
        details.ayuda[open] > summary { color:var(--text-2); margin-bottom:4px; }
        .side-btn:not(.activo):hover { background: var(--bg-3, rgba(255,255,255,0.04)); color: var(--text) !important; }
        @media (max-width: 920px) {
          .tab-label { display:none; }
          .brand-text { display:none; }
          /* En móvil el botón de nube queda visible pero compacto (solo icono) */
          .sync-label { display:none; }
          .sync-btn { padding: 8px 10px !important; }
        }
        @media (max-width: 760px) {
          .cal-grid { grid-template-columns: repeat(2,1fr) !important; }
          .stat-grid { grid-template-columns: repeat(2,1fr) !important; }
          .unassigned-hint { display:none !important; }
          .modal-hint { display:none !important; }
          .hint-desktop { display:none; }
          .hint-touch { display:inline; }
          .app-header { padding: 0 14px !important; height: 58px !important; gap: 10px !important; }
          .app-main { padding: 16px 14px 80px !important; }
          /* En móvil: menú lateral (cajón) en vez de la barra lateral fija */
          .side-nav { display:none !important; }
          .menu-btn { display:flex !important; }
          .cal-month-grid > div { min-height: 62px !important; padding: 4px !important; }
          .tasks-grid { grid-template-columns: 1fr !important; }
          /* Estadísticas apiladas en móvil */
          .stats-grid { grid-template-columns: 1fr !important; }
          .stats-cards { grid-template-columns: repeat(2,1fr) !important; }
          /* Deshacer/rehacer y formatos viven en el menú lateral en móvil */
          .undo-group { display:none !important; }
          .fmt-btn { display:none !important; }
          /* La lista de vídeos en YouTube se apila para no desbordar */
          .yt-row { flex-direction: column !important; align-items: stretch !important; }
          .yt-row-actions { justify-content: flex-start !important; }
        }
        @media (max-width: 480px) {
          .stat-grid { grid-template-columns: repeat(2,1fr) !important; gap: 8px !important; }
          .cal-grid { grid-template-columns: 1fr !important; }
          .app-main { padding: 14px 11px 90px !important; }
          /* Botones del header más compactos */
          .app-header { gap: 8px !important; }
          /* Modales casi a pantalla completa, respetando el notch */
          .modal-overlay { padding: calc(env(safe-area-inset-top) + 12px) 10px calc(env(safe-area-inset-bottom) + 16px) 10px !important; align-items: flex-start !important; }
          /* El modal de YouTube ocupa casi toda la pantalla y permite scroll cómodo */
          .yt-modal-panel { max-width: 100% !important; padding: 18px !important; }
        }
      `}</style>
    </div>
  );
}
