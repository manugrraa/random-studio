/* RandomEditor · MOTOR DE AUDIO (16/11/2026, fase 1 del motor nuevo).
   Él: "es imposible saber si los audios y los efectos de sonido van bien sincronizados porque sigue dando una falsa imagen
   y un falso audio con respecto a por donde va la vara… cuando intento parar la vara pulsando el espacio, se para con
   retraso".
   Como en los editores de verdad, el RELOJ lo lleva el sonido: todo lo que suena (la voz de la principal, las capas de
   vídeo, la música y los efectos) se programa en un único AudioContext al milisegundo, y la vara se calcula con ese mismo
   reloj (el instante que de verdad está saliendo por los altavoces). Parar corta todo en el acto.
   El sonido llega en trozos de 30 s del archivo (electron/audio.cjs, con caché en disco): así un directo de horas no se
   carga entero, solo los trozos que usa el proyecto. */
import { fin, largo, local, vel, volumenEn, IMAGEN } from "./modelo";

const L = 30;                       // segundos por trozo

export function crearMotorAudio() {
  const fs = typeof window !== "undefined" && window.studioFS;
  const disponible = !!(fs && fs.redAudioTrozo && (window.AudioContext || window.webkitAudioContext));
  let ac = null, salida = null;
  const trozos = new Map();          // clave → { estado: "cargando"|"listo"|"sin"|"error", buf, prom }
  let sesion = null;                 // la reproducción en marcha: { t0, vel, inicio, fuentes:[], id }
  let nSesion = 0;
  let volGeneral = 1;

  const ctx = () => {
    if(!ac){
      ac = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "interactive", sampleRate: 48000 });
      salida = ac.createGain(); salida.gain.value = volGeneral; salida.connect(ac.destination);
    }
    return ac;
  };
  const clave = (ruta, k, tempo) => ruta + "|" + k + "|" + tempo.toFixed(4);

  function trozo(ruta, k, tempo) {
    const kk = clave(ruta, k, tempo);
    let t = trozos.get(kk);
    if(t) return t;
    t = { estado: "cargando", buf: null };
    t.prom = (async () => {
      try {
        const r = await fs.redAudioTrozo(ruta, k, L, tempo);
        if(r && r.sin){ t.estado = "sin"; return t; }
        if(!r || !r.ok) throw new Error((r && r.error) || "sin respuesta");
        const bytes = r.datos instanceof Uint8Array ? r.datos : new Uint8Array(r.datos);
        t.buf = await ctx().decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
        t.estado = "listo";
      } catch(e){ t.estado = "error"; t.error = e.message; }
      return t;
    })();
    trozos.set(kk, t);
    return t;
  }

  /* Lo que SUENA del proyecto: [{ c, ruta, pista, ducking, muda }] (las mismas reglas que la exportación):
     - la principal (v1): su voz mejorada/aislada si la tiene, si no el audio del propio vídeo;
     - las capas de vídeo (no imágenes): igual;
     - las pistas de audio: su archivo (o su voz limpia). */
  function sonidos(pr) {
    const out = [];
    (pr.pistas || []).forEach(pi => {
      if(pi.muda || !(pi.tipo === "video" || pi.tipo === "audio")) return;
      pi.clips.forEach(c => {
        if(!c.ruta || c.silencio) return;
        if(pi.tipo === "video" && IMAGEN.test(c.ruta)) return;
        out.push({ c, ruta: (c.voz && c.voz.ruta) || c.ruta, ducking: !!pi.ducking, principal: pi.id === "v1" });
      });
    });
    return out;
  }
  // con el tono conservado y otra velocidad, el trozo viene ya estirado por ffmpeg (atempo); si no, se acelera al sonar
  const tempoDe = c => (vel(c) !== 1 && !c.tono) ? vel(c) : 1;

  /* «bajar al hablar» (como el sidechain de la exportación): ¿se habla en la principal en el instante t? */
  function hablaEn(pr, ondas, t) {
    const vp = (pr.pistas || []).find(x => x.id === "v1");
    const cv = vp && !vp.muda ? vp.clips.find(x => !x.silencio && t >= x.en && t < fin(x)) : null;
    if(!cv) return false;
    const o = (ondas || {})[cv.ruta], od = o && (Array.isArray(o) ? o : o.p);
    if(!od || !od.length) return true;
    const dt = (!Array.isArray(o) && o.dt) || (cv.dur_src || 1) / od.length, s0 = local(cv, t) - ((!Array.isArray(o) && o.inicio) || 0);
    let m = 0;
    for(let i = Math.max(0, Math.floor((s0 - 0.35) / dt)); i <= Math.min(od.length - 1, Math.ceil((s0 + 0.03) / dt)); i++) m = Math.max(m, od[i]);
    return m * (cv.vol ?? 1) > 0.06;
  }

  /* precarga: pide (sin esperar) todos los trozos que usa el proyecto, para que al darle a reproducir ya estén */
  function precargar(pr) {
    if(!disponible) return;
    for(const s of sonidos(pr)){
      const c = s.c, tp = tempoDe(c);
      const k0 = Math.floor(Math.max(0, c.desde) / L), k1 = Math.floor(Math.max(c.desde, c.hasta - 1e-3) / L);
      for(let k = k0; k <= k1; k++) trozo(s.ruta, k, tp);
    }
  }

  // programa UN clip desde el instante t de la línea, en la sesión `ses`
  function programarClip(ses, pr, ondas, s, tDesde) {
    const c = s.c, v = vel(c), tp = tempoDe(c), velR = ses.vel;
    const tIni = Math.max(tDesde, c.en), tFin = fin(c);
    if(tFin - tIni < 1e-3) return;
    const ac_ = ctx();
    // el volumen de este clip en el tiempo (fundidos, puntos clave y «bajar al hablar"), muestreado cada 20 ms
    const g = ac_.createGain(); g.connect(salida);
    const cuando = t => ses.inicio + (t - ses.t0) / velR;
    const paso = 0.02, n = Math.max(2, Math.ceil((tFin - tIni) / paso) + 1);
    const curva = new Float32Array(n);
    let cambia = false;
    for(let i = 0; i < n; i++){
      const t = Math.min(tFin, tIni + i * paso);
      let vol = volumenEn(c, t, false);
      if(s.ducking && hablaEn(pr, ondas, t)) vol *= 0.32;
      curva[i] = vol;
      if(i && Math.abs(curva[i] - curva[0]) > 1e-4) cambia = true;
    }
    const t0g = Math.max(ac_.currentTime, cuando(tIni));
    if(cambia){
      try { g.gain.setValueAtTime(curva[0], t0g); g.gain.setValueCurveAtTime(curva, t0g, Math.max(0.01, (tFin - tIni) / velR)); }
      catch(e){ g.gain.value = curva[0]; }
    } else g.gain.value = curva[0];
    ses.ganancias.push(g);
    // sus trozos, uno detrás de otro en el instante exacto
    const s0 = local(c, tIni), s1 = c.hasta;
    for(let k = Math.floor(s0 / L); k * L < s1 - 1e-4; k++){
      const a = Math.max(s0, k * L), b = Math.min(s1, (k + 1) * L);
      if(b - a < 1e-4) continue;
      const tA = c.en + (a - c.desde) / v;                       // dónde cae en la línea
      const tr = trozo(s.ruta, k, tp);
      const lanzar = () => {
        if(sesion !== ses || tr.estado !== "listo") return;
        const ahora = ac_.currentTime;
        let when = cuando(tA), off = (a - k * L) / tp, dur = (b - a) / tp;
        if(when < ahora){                                        // llegó tarde (trozo aún cargando): entra a mitad
          const tarde = (ahora - when) * velR * v / tp;
          off += tarde; dur -= tarde; when = ahora;
          if(dur <= 0.005) return;
        }
        if(off >= tr.buf.duration) return;
        const src = ac_.createBufferSource();
        src.buffer = tr.buf;
        src.playbackRate.value = (tp === 1 ? v : 1) * velR;
        src.connect(g);
        src.start(when, off, Math.min(dur, tr.buf.duration - off));
        ses.fuentes.push(src);
      };
      if(tr.estado === "listo") lanzar(); else if(tr.estado === "cargando") tr.prom.then(lanzar);
    }
  }

  /* REPRODUCIR desde t0 a la velocidad `velR` (1 normal, 2/4 rápido; hacia atrás no suena) */
  function reproducir(pr, t0, velR, ondas) {
    parar();
    if(!disponible || !(velR > 0)) { sesion = { t0, vel: velR, inicio: null, fuentes: [], ganancias: [], id: ++nSesion, mudo: true, desde: performance.now() }; return; }
    const ac_ = ctx();
    if(ac_.state === "suspended") ac_.resume().catch(()=>{});
    const ses = { t0, vel: velR, inicio: ac_.currentTime + 0.04, fuentes: [], ganancias: [], id: ++nSesion };
    sesion = ses;
    for(const s of sonidos(pr)) if(fin(s.c) > t0) programarClip(ses, pr, ondas, s, t0);
  }

  /* el instante de la línea que está SONANDO ahora (lo que sale por los altavoces): la vara va con él */
  function tiempo() {
    if(!sesion) return null;
    if(sesion.mudo) return sesion.t0 + (performance.now() - sesion.desde) / 1000 * sesion.vel;
    const ac_ = ctx();
    let ahora = ac_.currentTime;
    try {
      const ts = ac_.getOutputTimestamp && ac_.getOutputTimestamp();
      if(ts && ts.contextTime > 0 && ts.performanceTime > 0) ahora = ts.contextTime + (performance.now() - ts.performanceTime) / 1000;
      else ahora -= (ac_.outputLatency || ac_.baseLatency || 0);
    } catch(e){}
    return sesion.t0 + Math.max(0, ahora - sesion.inicio) * sesion.vel;
  }

  /* PARAR en el acto. Devuelve el instante que estaba sonando (null si no había nada) */
  function parar() {
    const t = sesion ? tiempo() : null;
    if(sesion){
      sesion.fuentes.forEach(f => { try { f.stop(); f.disconnect(); } catch(e){} });
      sesion.ganancias.forEach(g => { try { g.disconnect(); } catch(e){} });
    }
    sesion = null;
    return t;
  }

  /* el proyecto cambió mientras suena: se vuelve a programar desde donde va, sin cortar la vara */
  function reprogramar(pr, ondas) {
    if(!sesion || sesion.mudo) return;
    const t = tiempo(), v = sesion.vel;
    reproducir(pr, t, v, ondas);
  }

  return {
    disponible, precargar, reproducir, parar, tiempo, reprogramar,
    sonando: () => !!sesion,
    volumen(v) { volGeneral = v; if(salida) salida.gain.value = v; },
    estado: () => { let listos = 0, cargando = 0; trozos.forEach(t => { if(t.estado === "listo") listos++; else if(t.estado === "cargando") cargando++; }); return { listos, cargando }; },
    olvidar() { parar(); trozos.clear(); },
  };
}
