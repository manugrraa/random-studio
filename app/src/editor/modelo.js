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
export const puntosDeCorte = p => [...new Set([0, ...p.pistas.flatMap(pi=>pi.clips.flatMap(c=>[c.en, fin(c)])), ...(p.marcadores||[])])].sort((a,b)=>a-b);

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
    || ps.find(x=>x.tipo===tipo && !x.bloqueada && !solapa(x, c.en, largo(c)));
  if(libre) return ps.map(x=>x.id!==libre.id ? x : {...x, clips:[...x.clips, c]});
  if(tipo === "texto"){ const n = nuevaPistaTexto(ps); const i = ps.findIndex(x=>x.tipo==="texto"); return i < 0 ? [{...n, clips:[c]}, ...ps] : [...ps.slice(0, i), {...n, clips:[c]}, ...ps.slice(i)]; }
  // 31/10: sin sitio en los subtítulos, otra pista de SUBTÍTULOS con su plantilla (antes caía en una de audio)
  if(tipo === "subtitulos"){
    const ref = ps.find(x=>x.id===preferida) || ps.find(x=>x.tipo==="subtitulos") || {};
    const n = { id:"s"+uid(), tipo:"subtitulos", nombre:"Subtítulos", plantilla:ref.plantilla, estilo:ref.estilo || {}, clips:[c] };
    const i = ps.findIndex(x=>x.tipo==="subtitulos"); return i < 0 ? [n, ...ps] : [...ps.slice(0, i), n, ...ps.slice(i)];
  }
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
  const palabras = ws.length === viejas.length ? viejas.map((p, k)=>[p[0], p[1], ws[k]])
    : ws.map((w, k)=>[+(dur * k / ws.length).toFixed(3), +(dur * (k + 1) / ws.length).toFixed(3), w]);
  return {...c, texto, nombre: texto, palabras};
}
export const nuevoTexto = (texto, estilo, en, dur, plantilla) => ({ id:uid(), tipo:"texto", texto, nombre:texto, estilo:{...estilo},
  plantilla: plantilla || null, desde:TEXTO0, hasta:TEXTO0 + dur, dur_src:1e9, en, vol:1, silencio:false });

// dividir en `t` los clips con esos ids
export const dividir = (p, ids, t) => ({...p, pistas: p.pistas.map(pi=>({...pi, clips: pi.clips.flatMap(c=>{
  if(!ids.has(c.id) || t <= c.en + 0.01 || t >= fin(c) - 0.01) return [c];
  const k = local(c, t), dt = t - c.en;
  // (los fotogramas clave se reparten: cada mitad se queda con los suyos, en su tiempo)
  const kfDe = (desde, hasta) => c.kf ? Object.fromEntries(Object.entries(c.kf).map(([pr, l])=>[pr, (l||[]).filter(x=>x[0] >= desde && x[0] <= hasta).map(x=>[+(x[0] - desde).toFixed(4), x[1], x[2]])])) : c.kf;
  return [{...c, hasta:k, fade_out:0, kf: kfDe(0, dt)}, {...c, id:uid(), desde:k, en:t, fade_in:0, kf: kfDe(dt, 1e9)}];
})}))});

// borrar a la izquierda (Q) o a la derecha (W) del cabezal
export const borrarLado = (p, ids, t, izq) => ({...p, pistas: p.pistas.map(pi=>({...pi, clips: pi.clips.map(c=>{
  if(!ids.has(c.id) || t <= c.en + 0.01 || t >= fin(c) - 0.01) return c;
  const k = local(c, t);
  return izq ? {...c, desde:k, en: pi.id==="v1" && p.magnetica ? c.en : t} : {...c, hasta:k};
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
  let quitados = 0;
  const q = {...p, pistas: p.pistas.map(pi=>pi.id!=="v1" ? pi : {...pi, clips: pi.clips.flatMap(c=>{
    let trozos = [[c.desde, c.hasta]];
    (aires[c.ruta]||[]).forEach(([a,b])=>{
      trozos = trozos.flatMap(([x,y])=> (b<=x || a>=y) ? [[x,y]] : [[x,Math.max(x,a)],[Math.min(y,b),y]].filter(([u,v])=>v-u>0.05));
    });
    quitados += trozos.length - 1;
    let en = c.en;
    return trozos.map(([x,y],k)=>{ const n = {...c, id:k ? uid() : c.id, desde:x, hasta:y, en}; en += (y - x) / vel(c); return n; });
  })})};
  return [q, quitados];
}

// el volumen de un clip en un instante (con sus fundidos), para la previsualización
export function volumenEn(c, t, pistaMuda) {
  if(c.silencio || pistaMuda) return 0;
  const d = t - c.en, L = largo(c);
  let v = c.vol ?? 1;
  if(c.fade_in > 0 && d < c.fade_in) v *= Math.max(0, d / c.fade_in);
  if(c.fade_out > 0 && L - d < c.fade_out) v *= Math.max(0, (L - d) / c.fade_out);
  return Math.max(0, Math.min(1, v));
}

// tiempos: m:ss:ff (fotogramas) y m:ss
export const tc = (t, fps=30) => { t = Math.max(0, t||0); const f = Math.round(t*fps), ff = f % fps, s = Math.floor(f / fps);
  return Math.floor(s/60) + ":" + String(s%60).padStart(2,"0") + ":" + String(ff).padStart(2,"0"); };
export const corto = t => { t = Math.max(0, Math.round(t||0)); return Math.floor(t/60) + ":" + String(t%60).padStart(2,"0"); };
// el contador grande, como Premiere/CapCut PC: hh:mm:ss:ff
export const tcLargo = (t, fps=30) => { t = Math.max(0, t||0); const f = Math.round(t*fps), s = Math.floor(f / fps), d = n => String(n).padStart(2,"0");
  return d(Math.floor(s/3600)) + ":" + d(Math.floor(s/60)%60) + ":" + d(s%60) + ":" + d(f % fps); };
