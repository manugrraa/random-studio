/* RandomEditor · el modelo: el proyecto y las operaciones de edición, sin nada de pantalla.
   Un proyecto: { nombre, formato, ancho, alto, fps, marcadores:[s], clip?:{carpeta,archivo},
                  pistas:[{ id, tipo:"video"|"audio", nombre, muda, bloqueada, clips:[clip] }] }
   Un clip: { id, ruta, nombre, desde, hasta (trozo del archivo, s), en (dónde empieza en la línea, s),
              dur_src, vol (0-2), silencio, fade_in, fade_out, mini }
   La pista principal (id "v1") es MAGNÉTICA, como en CapCut: sus clips van seguidos, sin huecos. */

export const uid = () => Math.random().toString(36).slice(2, 10);
// 31/10 (v3.18): la VELOCIDAD de cada clip (0,1x-10x): a 2x dura la mitad en la línea de tiempo
export const vel = c => c.velocidad || 1;
export const largo = c => (c.hasta - c.desde) / vel(c);
// el segundo del ARCHIVO que suena en el instante `t` de la línea de tiempo
export const local = (c, t) => c.desde + (t - c.en) * vel(c);
// las pistas que se VEN y las que se OYEN no se mezclan nunca (él: "al pegar un subtítulo a veces se iba a la de audio")
export const esVisual = tipo => tipo === "video" || tipo === "texto" || tipo === "subtitulos";

/* 31/10 (v3.18): TRANSFORMAR y animar. `transform` = el valor fijo de cada propiedad; `kf[prop]` = sus
   fotogramas clave [[t (desde el inicio del clip, s), valor, curva]]: la curva es cómo se llega a ESE
   fotograma clave (lineal, aceleración, desaceleración o las dos). Las mismas fórmulas en la exportación. */
export const TRANS0 = { escala:1, x:0, y:0, rot:0, opacidad:1 };
export const CURVAS = {
  lineal: u=>u,
  entrada: u=>u*u*u,                                                     // aceleración (sale despacio)
  salida: u=>1 - Math.pow(1 - u, 3),                                     // desaceleración (llega despacio)
  ambas: u=>u < 0.5 ? 4*u*u*u : 1 - Math.pow(-2*u + 2, 3) / 2,           // las dos
};
export function valorEn(c, prop, tRel) {
  const base = (c.transform || {})[prop] ?? TRANS0[prop];
  const kf = ((c.kf || {})[prop] || []).slice().sort((a,b)=>a[0]-b[0]);
  if(!kf.length) return base;
  if(tRel <= kf[0][0]) return kf[0][1];
  for(let i = 1; i < kf.length; i++){
    const [ta, va] = kf[i-1], [tb, vb, curva] = kf[i];
    if(tRel <= tb){ const u = tb > ta ? (tRel - ta) / (tb - ta) : 1; return va + (vb - va) * (CURVAS[curva] || CURVAS.lineal)(u); }
  }
  return kf[kf.length-1][1];
}
export const transformado = c => !!(c.kf && Object.values(c.kf).some(x=>x && x.length)) || Object.entries(c.transform || {}).some(([k, v])=>v !== TRANS0[k]);
export const fin = c => c.en + largo(c);
export const LIENZOS = { vertical:[1080,1920,"9:16"], horizontal:[1920,1080,"16:9"] };

export const nuevoProyecto = () => ({ nombre:"", formato:"vertical", ancho:1080, alto:1920, fps:30, marcadores:[], pistas:[
  { id:"v1", tipo:"video", nombre:"Principal", clips:[] },
  { id:"a1", tipo:"audio", nombre:"Audio 1", clips:[] },
]});

// la principal se cierra sola: cada clip empieza donde acaba el anterior (en su orden)
export const cerrar = pista => {
  if(pista.id!=="v1") return pista;
  let t = 0;
  return { ...pista, clips: [...pista.clips].sort((a,b)=>a.en-b.en).map(c=>{ const n = c.en===t ? c : {...c, en:t}; t += largo(c); return n; }) };
};
// 28/10, él: "poder mover los clips del timeline a mi libre albedrío, no que se queden pegados": la principal
// solo se cierra sola con `magnetica` (el botón de la barra); si no, cada clip se queda donde se suelta
export const ordenar = p => p.magnetica ? { ...p, pistas: p.pistas.map(cerrar) } : p;
// con la principal libre, un clip que caería encima de otro se va al final de la pista
export const sinPisar = (pi, c) => solapa(pi, c.en, largo(c), c.id) ? {...c, en: Math.max(0, ...pi.clips.filter(x=>x.id!==c.id).map(fin))} : c;
export const solapa = (pi, en, d, ignorar) => pi.clips.some(x=>x.id!==ignorar && en < fin(x) - 1e-6 && en + d > x.en + 1e-6);
export const total = p => Math.max(0, ...p.pistas.flatMap(pi=>pi.clips.map(fin)));
export const todos = p => p.pistas.flatMap(pi=>pi.clips.map(c=>({...c, pista:pi.id})));
export const cuantiza = (t, fps) => Math.round(t * fps) / fps;          // los cortes caen en un fotograma exacto
export const puntosDeCorte = p => [...new Set([0, ...p.pistas.flatMap(pi=>pi.clips.flatMap(c=>[c.en, fin(c)])), ...(p.marcadores||[]).map(m=>typeof m === "number" ? m : m.t)])].sort((a,b)=>a-b);

export const nuevaPistaAudio = ps => ({ id:"a"+uid(), tipo:"audio", nombre:"Audio "+(ps.filter(x=>x.tipo==="audio").length+1), clips:[] });
// 28/10: las pistas de TEXTO van ENCIMA de la principal (como en CapCut): la primera de la lista es la de arriba
// 31/10 (v3.19): pistas de VÍDEO superpuestas (como las de CapCut): encima de la principal, con lo mismo
// que ella (transformar, color, máscara, velocidad); para máscaras, efectos y vídeo dentro de vídeo
export const nuevaPistaVideo = ps => ({ id:"v"+uid(), tipo:"video", nombre:"Vídeo "+(ps.filter(x=>x.tipo==="video").length+1), clips:[] });
export const IMAGEN = /\.(png|jpe?g|webp|gif|bmp)$/i;
export const nuevaPistaTexto = ps => ({ id:"t"+uid(), tipo:"texto", nombre:"Texto "+(ps.filter(x=>x.tipo==="texto").length+1), clips:[] });

// mete un clip donde quepa (en la pista pedida, en otra libre del mismo tipo o en una nueva)
export function colocar(ps, c, preferida, tipo="audio") {
  const libre = ps.find(x=>x.id===preferida && x.tipo===tipo && !x.bloqueada && !solapa(x, c.en, largo(c)))
    || ps.find(x=>x.tipo===tipo && !x.bloqueada && !(tipo === "video" && x.id === "v1") && !solapa(x, c.en, largo(c)));
  if(libre) return ps.map(x=>x.id!==libre.id ? x : {...x, clips:[...x.clips, c]});
  if(tipo === "texto"){ const n = nuevaPistaTexto(ps); const i = ps.findIndex(x=>x.tipo==="texto"); return i < 0 ? [{...n, clips:[c]}, ...ps] : [...ps.slice(0, i), {...n, clips:[c]}, ...ps.slice(i)]; }
  // 31/10: sin sitio en los subtítulos, otra pista de SUBTÍTULOS con su plantilla (antes caía en una de audio)
  if(tipo === "subtitulos"){
    const ref = ps.find(x=>x.id===preferida) || ps.find(x=>x.tipo==="subtitulos") || {};
    const n = { id:"s"+uid(), tipo:"subtitulos", nombre:"Subtítulos", plantilla:ref.plantilla, estilo:ref.estilo || {}, clips:[c] };
    const i = ps.findIndex(x=>x.tipo==="subtitulos"); return i < 0 ? [n, ...ps] : [...ps.slice(0, i), n, ...ps.slice(i)];
  }
  // (8/11, fallo: un clip de una pista SUPERPUESTA pegado sin sitio caía en la principal) → una superpuesta nueva encima
  if(tipo === "video" && preferida && preferida !== "v1"){ const n = nuevaPistaVideo(ps), i = Math.max(0, ps.findIndex(x=>x.id===preferida)); return [...ps.slice(0, i), {...n, clips:[c]}, ...ps.slice(i)]; }
  if(tipo === "video") return ps.map(x=>x.id!=="v1" ? x : {...x, clips:[...x.clips, sinPisar(x, c)]});
  return [...ps, {...nuevaPistaAudio(ps), clips:[c]}];
}
export const colocarAudio = (ps, c, preferida) => colocar(ps, c, preferida, "audio");

/* un TEXTO de la línea de tiempo. `desde` empieza en 1000 (virtual) para que su principio se pueda
   alargar hacia atrás igual que el final; lo que dura es hasta - desde */
export const TEXTO0 = 1000;

/* 28/10: la pista de SUBTÍTULOS (una; justo encima de la principal, debajo de los textos). Sus tarjetas
   llevan `palabras` [[a, b, w]] relativas a su inicio; la pista, su `plantilla` y sus cambios de `estilo` */
export function ponerSubtitulos(p, clips, plantilla, estilo) {
  const prev = p.pistas.find(x=>x.tipo==="subtitulos");
  const pista = { id: prev ? prev.id : "s"+uid(), tipo:"subtitulos", nombre:"Subtítulos", plantilla, estilo: estilo ?? ((prev && prev.estilo) || {}), clips };
  if(prev) return {...p, pistas: p.pistas.map(x=>x.id===prev.id ? {...x, ...pista} : x)};
  const i = p.pistas.findIndex(x=>x.id==="v1");
  return {...p, pistas: [...p.pistas.slice(0, i), pista, ...p.pistas.slice(i)]};
}
// el texto de una tarjeta cambiado a mano: si tiene las mismas palabras, conservan su tiempo; si no, se reparten
export function retextoTarjeta(c, texto) {
  const ws = texto.split(/\s+/).filter(Boolean), viejas = c.palabras || [], dur = largo(c);
  const palabras = ws.length === viejas.length ? viejas.map((p, k)=>p.length > 3 ? [p[0], p[1], ws[k], p[3]] : [p[0], p[1], ws[k]])   // (v3.40: con su color)
    : ws.map((w, k)=>[+(dur * k / ws.length).toFixed(3), +(dur * (k + 1) / ws.length).toFixed(3), w]);
  return {...c, texto, nombre: texto, palabras};
}
export const nuevoTexto = (texto, estilo, en, dur, plantilla) => ({ id:uid(), tipo:"texto", texto, nombre:texto, estilo:{...estilo},
  plantilla: plantilla || null, desde:TEXTO0, hasta:TEXTO0 + dur, dur_src:1e9, en, vol:1, silencio:false });

/* 8/11 (fallos): al partir un clip, cada trozo se queda con sus fotogramas clave Y el valor que había justo en el corte
   (antes, un zoom partido por la mitad saltaba), y una tarjeta de subtítulos con SUS palabras (antes se repetían) */
export function kfTramo(c, desde, hasta) {
  if(!c.kf) return c.kf;
  return Object.fromEntries(Object.entries(c.kf).map(([pr, l])=>{
    l = (l || []).slice().sort((a,b)=>a[0]-b[0]);
    if(!l.length) return [pr, l];
    const val = t => pr === "vol" ? volEn(c, t) : valorEn(c, pr, t);
    const dentro = l.filter(x=>x[0] >= desde && x[0] <= hasta).map(x=>[+(x[0] - desde).toFixed(4), x[1], x[2]]);
    if(!dentro.length || dentro[0][0] > 1e-4) dentro.unshift([0, val(desde), "lineal"]);
    if(hasta < 1e8 && dentro[dentro.length - 1][0] < hasta - desde - 1e-4) dentro.push([+(hasta - desde).toFixed(4), val(hasta), (l.find(x=>x[0] > hasta) || [])[2] || "lineal"]);
    return [pr, dentro];
  }));
}
export const palabrasDe = (c, desde, hasta) => !c.palabras ? {} : (()=>{
  const ws = c.palabras.filter(w=>{ const m = (w[0] + w[1]) / 2; return m >= desde && m < hasta; }).map(w=>{ const n = [+(Math.max(0, w[0] - desde)).toFixed(3), +(Math.min(hasta, w[1]) - desde).toFixed(3), w[2]]; if(w.length > 3) n.push(w[3]); return n; });
  return { palabras: ws, texto: ws.map(w=>w[2]).join(" ") || c.texto };
})();

// dividir en `t` los clips con esos ids
export const dividir = (p, ids, t) => ({...p, pistas: p.pistas.map(pi=>({...pi, clips: pi.clips.flatMap(c=>{
  if(!ids.has(c.id) || t <= c.en + 0.01 || t >= fin(c) - 0.01) return [c];
  const k = local(c, t), dt = t - c.en;
  // (los fotogramas clave se reparten: cada mitad se queda con los suyos, en su tiempo)
  const kfDe = (desde, hasta) => kfTramo(c, desde, hasta);
  return [{...c, hasta:k, fade_out:0, kf: kfDe(0, dt), ...palabrasDe(c, 0, dt)}, {...c, id:uid(), desde:k, en:t, fade_in:0, kf: kfDe(dt, 1e9), ...palabrasDe(c, dt, 1e9)}];
})}))});

// borrar a la izquierda (Q) o a la derecha (W) del cabezal
export const borrarLado = (p, ids, t, izq) => ({...p, pistas: p.pistas.map(pi=>({...pi, clips: pi.clips.map(c=>{
  if(!ids.has(c.id) || t <= c.en + 0.01 || t >= fin(c) - 0.01) return c;
  const k = local(c, t);
  const dt = t - c.en;
  return izq ? {...c, desde:k, en: pi.id==="v1" && p.magnetica ? c.en : t, kf: kfTramo(c, dt, 1e9), ...palabrasDe(c, dt, 1e9)}
             : {...c, hasta:k, kf: kfTramo(c, 0, dt), ...palabrasDe(c, 0, dt)};
})}))});

export const eliminar = (p, ids) => ({...p, pistas: p.pistas.map(pi=> pi.bloqueada ? pi : {...pi, clips: pi.clips.filter(c=>!ids.has(c.id))})});

// pegar (o duplicar) en la línea: en la principal detrás del clip que pisa el cabezal; en audio, donde quepa
export function pegar(p, cs, t, trasCadaUno) {
  let ps = p.pistas;
  const base = Math.min(...cs.map(c=>c.en)), nuevos = [];
  cs.forEach((c, k)=>{
    const n = {...c, id:uid()}; delete n.pista; nuevos.push(n.id);
    if(c.pista==="v1"){
      const pi = ps.find(x=>x.id==="v1");
      const cubre = pi.clips.find(x=>t > x.en && t < fin(x));
      const pos = trasCadaUno ? fin(c) : (cubre ? fin(cubre) : t);
      if(p.magnetica) n.en = pos - 0.0005 + k * 0.00001;
      else { n.en = trasCadaUno ? fin(c) : t + (c.en - base); Object.assign(n, sinPisar(ps.find(x=>x.id==="v1"), n)); }
      ps = ps.map(x=>x.id!=="v1" ? x : {...x, clips:[...x.clips, n]});
    } else {
      n.en = trasCadaUno ? fin(c) : t + (c.en - base);
      ps = colocar(ps, n, c.pista, (p.pistas.find(x=>x.id===c.pista) || {}).tipo || (n.tipo === "texto" ? "texto" : n.tipo === "sub" ? "subtitulos" : "audio"));
    }
  });
  return [{...p, pistas: ps}, nuevos];
}

// separar el sonido de un clip de vídeo a una pista de audio (el vídeo se queda mudo), como CapCut
export function extraerAudio(p, ids) {
  let ps = p.pistas;
  todos(p).filter(c=>ids.has(c.id) && c.pista==="v1" && !c.silencio).forEach(c=>{
    const a = {...c, id:uid(), mini:undefined}; delete a.pista;
    ps = ps.map(x=>x.id!=="v1" ? x : {...x, clips: x.clips.map(y=>y.id===c.id ? {...y, silencio:true} : y)});
    ps = colocarAudio(ps, a, null);
  });
  return {...p, pistas: ps};
}

// quitar el aire: fuera de la principal los silencios (en tiempo del archivo) de cada clip
export function quitarAire(p, aires) {
  let quitados = 0, corrido = 0;
  const q = {...p, pistas: p.pistas.map(pi=>pi.id!=="v1" ? pi : {...pi, clips: [...pi.clips].sort((a,b)=>a.en-b.en).flatMap(c=>{
    let trozos = [[c.desde, c.hasta]];
    (aires[c.ruta]||[]).forEach(([a,b])=>{
      trozos = trozos.flatMap(([x,y])=> (b<=x || a>=y) ? [[x,y]] : [[x,Math.max(x,a)],[Math.min(y,b),y]].filter(([u,v])=>v-u>0.05));
    });
    quitados += trozos.length - 1;
    let en = c.en - corrido;
    const res = trozos.map(([x,y],k)=>{ const d0 = (x - c.desde) / vel(c), n = {...c, id:k ? uid() : c.id, desde:x, hasta:y, en, kf: kfTramo(c, d0, d0 + (y - x) / vel(c))}; en += (y - x) / vel(c); return n; });
    corrido += largo(c) - (en - (c.en - corrido));        // lo que se ha quitado de este clip: lo de detrás se corre
    return res;
  })})};
  return [q, quitados];
}

// el volumen de un clip en un instante (con sus fundidos), para la previsualización
/* (5/11, él: "que se puedan poner puntos para animar o distribuir las características como yo quiera, por ejemplo una
   parte en la que quiero bajar la música y otra en la que la quiero subir"): el volumen también con puntos clave,
   kf.vol = [[segundo desde el principio del clip, volumen, curva]] (como los de transformar) */
export function volEn(c, tRel) {
  const kf = ((c.kf || {}).vol || []).slice().sort((a,b)=>a[0]-b[0]);
  if(!kf.length) return c.vol ?? 1;
  if(tRel <= kf[0][0]) return kf[0][1];
  for(let i = 1; i < kf.length; i++){
    const [ta, va] = kf[i-1], [tb, vb, curva] = kf[i];
    if(tRel <= tb){ const u = tb > ta ? (tRel - ta) / (tb - ta) : 1; return va + (vb - va) * (CURVAS[curva] || CURVAS.lineal)(u); }
  }
  return kf[kf.length-1][1];
}
export function volumenEn(c, t, pistaMuda) {
  if(c.silencio || pistaMuda) return 0;
  const d = t - c.en, L = largo(c);
  let v = volEn(c, d);
  if(c.fade_in > 0 && d < c.fade_in) v *= Math.max(0, d / c.fade_in);
  if(c.fade_out > 0 && L - d < c.fade_out) v *= Math.max(0, (L - d) / c.fade_out);
  return Math.max(0, Math.min(2, v));       // (8/11: hasta +6 dB; el visor lo amplifica)
}

// tiempos: m:ss:ff (fotogramas) y m:ss
export const tc = (t, fps=30) => { t = Math.max(0, t||0); const f = Math.round(t*fps), ff = f % fps, s = Math.floor(f / fps);
  return Math.floor(s/60) + ":" + String(s%60).padStart(2,"0") + ":" + String(ff).padStart(2,"0"); };
export const corto = t => { t = Math.max(0, Math.round(t||0)); return Math.floor(t/60) + ":" + String(t%60).padStart(2,"0"); };
// el contador grande, como Premiere/CapCut PC: hh:mm:ss:ff
export const tcLargo = (t, fps=30) => { t = Math.max(0, t||0); const f = Math.round(t*fps), s = Math.floor(f / fps), d = n => String(n).padStart(2,"0");
  return d(Math.floor(s/3600)) + ":" + d(Math.floor(s/60)%60) + ":" + d(s%60) + ":" + d(f % fps); };

/* 8/11 (él: «las propiedades de los textos mostrando el audio, los SFX apilados, el título apilado»): al ABRIR un
   proyecto se ponen en orden (los que monta la IA o vienen de fuera): cada clip lleva el tipo de su pista (los textos,
   su tramo virtual desde TEXTO0) y en una pista nunca hay dos clips a la vez: lo que se pisa va a otra pista del mismo
   tipo (las de vídeo y texto, ENCIMA, para que se siga viendo igual). La principal no se toca. */
export function normalizar(p, limpiarSubs = true) {
  const out = [], usados = new Set((p.pistas || []).map(x=>x.id));
  for(const pi of p.pistas || []){
    const clips = (pi.clips || []).map(c=>{
      if(pi.tipo === "texto" && c.tipo !== "texto"){ const d = c.desde < TEXTO0 / 2 ? TEXTO0 - c.desde : 0; return {...c, tipo:"texto", desde:c.desde + d, hasta:c.hasta + d, dur_src:1e9}; }
      if(pi.tipo === "subtitulos" && !c.tipo) return {...c, tipo:"sub"};
      return c;
    });
    if(pi.id === "v1"){ out.push({...pi, clips}); continue; }
    if(pi.tipo === "subtitulos"){
      // (las tarjetas de 0,1 s sueltas se juntan con la de antes, con sus palabras: no se pierde nada)
      const cs = [];
      [...clips].sort((a,b)=>a.en-b.en).forEach(c=>{
        const ant = cs[cs.length - 1];
        if(limpiarSubs && ant && largo(c) <= 0.12){
          const d = c.en - ant.en, ws = [...(ant.palabras || []), ...(c.palabras || []).map(w=>[+(w[0] + d).toFixed(3), +(w[1] + d).toFixed(3), ...w.slice(2)])];
          cs[cs.length - 1] = {...ant, hasta: +(ant.desde + Math.max(largo(ant), fin(c) - ant.en) * vel(ant)).toFixed(4), palabras: ws, texto: ws.map(w=>w[2]).join(" ") || ant.texto};
        } else cs.push(c);
      });
      out.push({...pi, clips: cs.map((c, k)=>{ const sig = cs[k + 1]; return sig && fin(c) > sig.en + 1e-6 ? {...c, hasta: +(c.desde + (sig.en - c.en) * vel(c)).toFixed(4)} : c; })});
      continue;
    }
    const carriles = [];
    [...clips].sort((a,b)=>a.en-b.en).forEach(c=>{
      let l = carriles.find(l=>l.every(x=>c.en >= fin(x) - 1e-6 || fin(c) <= x.en + 1e-6));
      if(!l){ l = []; carriles.push(l); }
      l.push(c);
    });
    if(carriles.length <= 1){ out.push({...pi, clips}); continue; }
    const idNuevo = k => { let id = pi.id + "_" + k; while(usados.has(id)) id += "b"; usados.add(id); return id; };     // (fijos: no cambian en cada arrastre)
    const nuevas = carriles.map((l, k)=>k === 0 ? {...pi, clips:l} : {...pi, id:idNuevo(k), nombre:(pi.nombre || "") + " " + (k + 1), clips:l});
    out.push(...(pi.tipo === "video" || pi.tipo === "texto" ? nuevas.reverse() : nuevas));
  }
  return {...p, pistas: out};
}

// 8/11 (Premiere «Ripple Delete», Final Cut, CapCut): borrar lo elegido Y cerrar el hueco que deja en su pista
export function borrarCerrando(p, ids) {
  return {...p, pistas: p.pistas.map(pi=>{
    if(pi.bloqueada) return pi;
    const quitados = pi.clips.filter(c=>ids.has(c.id));
    if(!quitados.length) return pi;
    const resto = pi.clips.filter(c=>!ids.has(c.id));
    return {...pi, clips: resto.map(c=>{ const antes = quitados.filter(q=>fin(q) <= c.en + 1e-6).reduce((s, q)=>s + largo(q), 0); return antes ? {...c, en: Math.max(0, +(c.en - antes).toFixed(4))} : c; })};
  })};
}
// 8/11 (CapCut «Cerrar huecos», Premiere «Close Gap»): en las pistas elegidas (o todas) cada clip se pega al anterior
export function cerrarHuecos(p, pistasIds) {
  return {...p, pistas: p.pistas.map(pi=>{
    if(pi.bloqueada || (pistasIds && !pistasIds.has(pi.id)) || !pi.clips.length) return pi;
    let t = pi.id === "v1" ? 0 : Math.min(...pi.clips.map(c=>c.en));
    return {...pi, clips: [...pi.clips].sort((a,b)=>a.en-b.en).map(c=>{ const n = Math.abs(c.en - t) < 1e-6 ? c : {...c, en: +t.toFixed(4)}; t = fin(n); return n; })};
  })};
}
// 8/11 (Premiere «Track Select Forward», tecla A): todo lo que empieza a partir de `t`, en todas las pistas sin bloquear
export const desdeAqui = (p, t) => new Set(p.pistas.filter(pi=>!pi.bloqueada && !(pi.id==="v1" && p.magnetica)).flatMap(pi=>pi.clips.filter(c=>c.en >= t - 1e-6).map(c=>c.id)));

/* ===== 8/11 · fase 2 ===== */
// los marcadores pueden ser un número (los de antes) o { t, nombre, color }
export const mt = m => typeof m === "number" ? m : (m && m.t) || 0;

/* CLIPS CONECTADOS (Final Cut): si un clip de la principal se mueve, lo que empieza encima de él en las demás pistas
   (SFX, textos, fichas, subtítulos, planos) se mueve con él. Se compara el antes y el después de un cambio: solo se
   corre lo que el cambio NO ha movido ya. */
export function conectar(antes, despues) {
  const pa = antes.pistas.find(x=>x.id==="v1"), pd = despues.pistas.find(x=>x.id==="v1");
  if(!pa || !pd || pa === pd) return despues;
  const nuevos = new Map(pd.clips.map(c=>[c.id, c]));
  // (lo que cuenta es dónde queda el CONTENIDO: con el mismo archivo, en − desde/velocidad; un rodillo o un recorte por
  // delante cambian «en» pero el contenido no se mueve, y lo de encima tampoco)
  const ancla = c => c.en - c.desde / vel(c);
  const deltas = pa.clips.map(c=>{ const d = nuevos.get(c.id); if(!d || Math.abs(d.en - c.en) < 1e-6) return null;
    const dd = d.ruta === c.ruta ? ancla(d) - ancla(c) : d.en - c.en; return Math.abs(dd) > 1e-6 ? [c.en, fin(c), dd] : null; }).filter(Boolean);
  if(!deltas.length) return despues;
  const enAntes = new Map(antes.pistas.flatMap(pi=>pi.id==="v1" ? [] : pi.clips.map(c=>[c.id, c.en])));
  let cambio = false;
  const r = {...despues, pistas: despues.pistas.map(pi=>pi.id==="v1" || pi.bloqueada ? pi : {...pi, clips: pi.clips.map(c=>{
    const e0 = enAntes.get(c.id);
    if(e0 == null || Math.abs(e0 - c.en) > 1e-6) return c;
    const d = deltas.find(([a, b])=>e0 >= a - 1e-6 && e0 < b - 1e-6);
    if(!d) return c;
    cambio = true; return {...c, en: Math.max(0, +(c.en + d[2]).toFixed(4))};
  })})};
  if(!cambio) return despues;
  // (si al correrse algo cae encima de otro de su pista, pasa a otra pista: nunca dos a la vez)
  return r.pistas.some(pi=>pi.id!=="v1" && pi.tipo!=="subtitulos" && pi.clips.some(c=>solapa(pi, c.en, largo(c), c.id))) ? normalizar(r, false) : r;
}

/* QUITAR TRAMOS de la línea de tiempo (editar por texto, muletillas — Descript): cada [a, b] sale de la principal
   y todo lo de detrás se corre; en los subtítulos se quitan esas palabras. */
export function quitarTramos(p, rangos) {
  if((p.pistas.find(x=>x.id==="v1") || {}).bloqueada) return p;
  rangos = [...rangos].map(([a, b])=>[Math.max(0, a), b]).filter(([a, b])=>b - a > 0.02).sort((x, y)=>y[0] - x[0]);
  for(const [a, b] of rangos){
    const L = b - a, v1 = p.pistas.find(x=>x.id==="v1"); if(!v1) break;
    const bajo = t => new Set(v1.clips.filter(c=>t > c.en + 0.01 && t < fin(c) - 0.01).map(c=>c.id));
    p = dividir(p, bajo(a), a);
    const v1b = p.pistas.find(x=>x.id==="v1");
    p = dividir(p, new Set(v1b.clips.filter(c=>b > c.en + 0.01 && b < fin(c) - 0.01).map(c=>c.id)), b);
    p = {...p, pistas: p.pistas.map(pi=>{
      if(pi.bloqueada) return pi;
      if(pi.id === "v1") return {...pi, clips: pi.clips.filter(c=>!(c.en >= a - 0.01 && fin(c) <= b + 0.01)).map(c=>c.en >= b - 0.01 ? {...c, en: +(c.en - L).toFixed(4)} : c)};
      if(pi.tipo === "subtitulos") return {...pi, clips: pi.clips.flatMap(c=>{
        if(c.en >= b - 0.01) return [{...c, en: +(c.en - L).toFixed(4)}];
        if(fin(c) <= a + 0.01 || !c.palabras) return [c];
        const ws = c.palabras.filter(w=>!(c.en + w[0] >= a - 0.02 && c.en + w[1] <= b + 0.02)).map(w=>c.en + w[0] >= b - 0.02 ? [+(w[0] - L).toFixed(3), +(w[1] - L).toFixed(3), ...w.slice(2)] : w);
        if(!ws.length) return [];
        const quitado = Math.max(0, Math.min(fin(c), b) - Math.max(c.en, a));
        return [{...c, palabras: ws, texto: ws.map(w=>w[2]).join(" "), nombre: ws.map(w=>w[2]).join(" "), hasta: +(c.hasta - quitado * vel(c)).toFixed(4)}];
      })};
      return {...pi, clips: pi.clips.map(c=>c.en >= b - 0.01 ? {...c, en: +(c.en - L).toFixed(4)} : c.en > a ? {...c, en: a} : c)};
    })};
  }
  return normalizar(p, false);          // (lo que queda pisándose en una pista pasa a otra)
}
// las palabras de los subtítulos, en tiempo de la línea: [{ a, b, w, id }]
export const palabrasLinea = p => p.pistas.filter(pi=>pi.tipo==="subtitulos" && !pi.muda).flatMap(pi=>pi.clips.flatMap(c=>(c.palabras || []).map((w, k)=>({ a: c.en + w[0], b: c.en + w[1], w: w[2], id: c.id + ":" + k }))))
  .sort((x, y)=>x.a - y.a);
// muletillas que se quitan sin dudar (las de verdad dudosas, como «este» o «bueno», no: cambian el sentido)
const MULETILLAS = /^(e+h+|e+m+|e+h+m+|m+|h?m+h?|a+h+|uh+m*|ehm+)$/i;
export const limpiaPalabra = w => String(w || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zñ0-9]/g, "");
export function muletillas(p) {
  const ws = palabrasLinea(p), out = [];
  ws.forEach((x, k)=>{
    const l = limpiaPalabra(x.w);
    if(MULETILLAS.test(l)) out.push([x.a, x.b]);
    else if(l === "o" && ws[k + 1] && limpiaPalabra(ws[k + 1].w) === "sea" && (!ws[k + 2] || ws[k + 2].a - ws[k + 1].b > 0.15)) out.push([x.a, ws[k + 1].b]);
  });
  return out;
}

// HISTORIAL (DaVinci): qué cambió de un estado al siguiente, en pocas palabras
export function resumenCambio(a, b) {
  if(!a || !b) return "Cambio";
  const ca = new Map(a.pistas.flatMap(pi=>pi.clips.map(c=>[c.id, c]))), cb = new Map(b.pistas.flatMap(pi=>pi.clips.map(c=>[c.id, c])));
  const nom = c => String(c.texto || c.nombre || "clip").split("\n")[0].slice(0, 28);
  const nuevos = [...cb.keys()].filter(k=>!ca.has(k)), quitados = [...ca.keys()].filter(k=>!cb.has(k));
  if(nuevos.length && quitados.length) return `Dividir o rehacer (${quitados.length} → ${nuevos.length})`;
  if(nuevos.length) return nuevos.length === 1 ? `Añadir «${nom(cb.get(nuevos[0]))}»` : `Añadir ${nuevos.length} clips`;
  if(quitados.length) return quitados.length === 1 ? `Eliminar «${nom(ca.get(quitados[0]))}»` : `Eliminar ${quitados.length} clips`;
  const camb = [...cb.values()].filter(c=>ca.get(c.id) !== c);
  if(camb.length){
    const c = camb[0], o = ca.get(c.id);
    const que = o.en !== c.en && o.desde === c.desde && o.hasta === c.hasta ? "Mover" : o.desde !== c.desde || o.hasta !== c.hasta ? "Recortar"
      : o.texto !== c.texto ? "Escribir" : o.estilo !== c.estilo ? "Estilo de" : o.vol !== c.vol || (o.kf || {}).vol !== (c.kf || {}).vol ? "Volumen de"
      : o.transform !== c.transform || o.kf !== c.kf ? "Transformar" : o.color !== c.color || o.filtro !== c.filtro ? "Color de" : "Cambiar";
    return `${que} «${nom(c)}»${camb.length > 1 ? ` (+${camb.length - 1})` : ""}`;
  }
  if(a.marcadores !== b.marcadores) return "Marcadores";
  if(a.portada !== b.portada) return "Portada";
  if(a.pistas.length !== b.pistas.length) return a.pistas.length < b.pistas.length ? "Pista nueva" : "Quitar pista";
  return "Ajuste del proyecto";
}

/* 8/11 (fase 3, Submagic/CapCut): PALABRAS DESTACADAS en los subtítulos: como mucho una por tarjeta, la que más pesa
   (un número o precio; si no, un nombre propio; si no, una palabra fuerte). Otra vez = quitar los colores. */
const FUERTES = /^(gratis|nuevo|nueva|nunca|mejor|peor|unico|unica|increible|oferta|barato|barata|precio|garantia|perfecto|perfecta|ahorra|ahorro|rapido|rapida|potente|lujo|exclusivo|exclusiva|imposible|secreto|verdad|todo|nada|millon|millones|euros?)$/;
export function destacarPalabras(p, color = "#FFD23F") {
  const subs = p.pistas.filter(pi=>pi.tipo==="subtitulos");
  const yaHay = subs.some(pi=>pi.clips.some(c=>(c.palabras || []).some(w=>w[3] === color)));
  let n = 0;
  const pistas = p.pistas.map(pi=>pi.tipo!=="subtitulos" ? pi : {...pi, clips: pi.clips.map(c=>{
    if(!c.palabras) return c;
    if(yaHay) return {...c, palabras: c.palabras.map(w=>w[3] === color ? w.slice(0, 3) : w)};
    const nota = (w, k) => { const l = limpiaPalabra(w[2]); if(!l || l.length < 2) return 0;
      if(/\d/.test(w[2]) || /€|\$/.test(w[2])) return 3;
      if(k > 0 && /^[A-ZÁÉÍÓÚÑ]/.test(w[2])) return 2;
      return FUERTES.test(l) ? 1 : 0; };
    let mejor = -1, mn = 0;
    c.palabras.forEach((w, k)=>{ const x = nota(w, k); if(x > mn){ mn = x; mejor = k; } });
    if(mejor < 0) return c;
    n++;
    return {...c, palabras: c.palabras.map((w, k)=>k === mejor ? [w[0], w[1], w[2], color] : w)};
  })});
  return [{...p, pistas}, yaHay ? -1 : n];
}

/* ZOOM EN LOS CORTES DE SALTO (los «jump cuts» de los Shorts): cuando dos clips seguidos de la principal son del mismo
   archivo, el segundo entra un poco más cerca (×1,07) y el siguiente vuelve: tapa el salto sin zoom constante. Solo
   en los clips sin escala propia. Otra vez = quitarlo. */
export function zoomCortes(p, k = 1.07) {
  const v1 = p.pistas.find(x=>x.id==="v1"); if(!v1) return [p, 0];
  const cs = [...v1.clips].sort((a,b)=>a.en-b.en);
  const quitar = cs.some(c=>c.zoom_corte);
  let n = 0, cerca = false;
  const nuevos = new Map();
  cs.forEach((c, i)=>{
    if(quitar){ if(c.zoom_corte){ const t = {...(c.transform || {})}; delete t.escala; const x = {...c, transform: t}; delete x.zoom_corte; nuevos.set(c.id, x); } return; }
    const ant = cs[i - 1], salto = ant && ant.ruta === c.ruta && Math.abs(fin(ant) - c.en) < 0.05;
    cerca = salto ? !cerca : false;
    const propia = (c.transform || {}).escala != null && (c.transform || {}).escala !== 1 || ((c.kf || {}).escala || []).length;
    if(cerca && !propia){ nuevos.set(c.id, {...c, transform: {...(c.transform || {}), escala: k}, zoom_corte: true}); n++; }
  });
  return [{...p, pistas: p.pistas.map(pi=>pi.id!=="v1" ? pi : {...pi, clips: pi.clips.map(c=>nuevos.get(c.id) || c)})}, quitar ? -1 : n];
}

/* 8/11 (fase 3, «audiciones» de Final Cut): VARIAS TOMAS en el mismo hueco. Se eligen 2 o más clips con «Juntar como
   tomas»: el primero se queda en su sitio y los demás se guardan dentro (salen de la línea de tiempo); en Propiedades se
   cambia de toma con un clic. Cada toma conserva su propio recorte. */
const CAMPOS_TOMA = ["ruta", "nombre", "desde", "hasta", "dur_src", "mini", "voz", "velocidad", "flujo", "silencio"];
const tomaDe = c => Object.fromEntries(CAMPOS_TOMA.filter(k=>c[k] !== undefined).map(k=>[k, c[k]]));
export function juntarTomas(p, ids) {
  const cs = todos(p).filter(c=>ids.has(c.id) && c.ruta && !c.imagen && !c.efecto && !(p.pistas.find(x=>x.id===c.pista) || {}).bloqueada).sort((a,b)=>a.en-b.en);
  if(cs.length < 2) return [p, 0];
  const tipoDe = c => (p.pistas.find(x=>x.id===c.pista) || {}).tipo;
  if(cs.some(c=>tipoDe(c) !== tipoDe(cs[0]))) return [p, 0];          // (un vídeo y una música no son tomas de lo mismo)
  const slot = cs[0], resto = cs.slice(1);
  const tomas = [...(slot.tomas || [tomaDe(slot)]), ...resto.flatMap(c=>c.tomas || [tomaDe(c)])];
  const fuera = new Set(resto.map(c=>c.id));
  return [{...p, pistas: p.pistas.map(pi=>({...pi, clips: pi.clips.filter(c=>!fuera.has(c.id)).map(c=>c.id!==slot.id ? c : {...c, tomas, toma: slot.toma || 0})}))}, tomas.length];
}
export function elegirToma(p, id, k) {
  return {...p, pistas: p.pistas.map(pi=>({...pi, clips: pi.clips.map(c=>{
    if(c.id !== id || !c.tomas || !c.tomas[k] || (c.toma || 0) === k) return c;
    const tomas = c.tomas.map((t, j)=>j === (c.toma || 0) ? tomaDe(c) : t);       // (lo que recortaste de la toma actual se guarda)
    const n = {...c}; CAMPOS_TOMA.forEach(f=>{ delete n[f]; });
    let r = {...n, ...tomas[k], tomas, toma: k};
    if(solapa({clips: pi.clips.filter(x=>x.id!==id)}, r.en, largo(r))){           // (si no cabe, se queda del largo del hueco)
      const L = largo(c) * vel(r); r = {...r, hasta: Math.min(r.dur_src ?? 1e9, +(r.desde + L).toFixed(4))};
    }
    return r;
  })}))};
}
export function quitarToma(p, id, k) {
  return {...p, pistas: p.pistas.map(pi=>({...pi, clips: pi.clips.map(c=>{
    if(c.id !== id || !c.tomas || c.tomas.length < 2 || (c.toma || 0) === k) return c;
    const tomas = c.tomas.filter((t, j)=>j !== k), toma = (c.toma || 0) > k ? c.toma - 1 : (c.toma || 0);
    if(tomas.length < 2){ const n = {...c}; delete n.tomas; delete n.toma; return n; }
    return {...c, tomas, toma};
  })}))};
}
