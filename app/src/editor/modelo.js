/* RandomEditor · el modelo: el proyecto y las operaciones de edición, sin nada de pantalla.
   Un proyecto: { nombre, formato, ancho, alto, fps, marcadores:[s], clip?:{carpeta,archivo},
                  pistas:[{ id, tipo:"video"|"audio", nombre, muda, bloqueada, clips:[clip] }] }
   Un clip: { id, ruta, nombre, desde, hasta (trozo del archivo, s), en (dónde empieza en la línea, s),
              dur_src, vol (0-2), silencio, fade_in, fade_out, mini }
   La pista principal (id "v1") es MAGNÉTICA, como en CapCut: sus clips van seguidos, sin huecos. */

export const uid = () => Math.random().toString(36).slice(2, 10);
export const largo = c => c.hasta - c.desde;
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
export const ordenar = p => ({ ...p, pistas: p.pistas.map(cerrar) });
export const solapa = (pi, en, d, ignorar) => pi.clips.some(x=>x.id!==ignorar && en < fin(x) - 1e-6 && en + d > x.en + 1e-6);
export const total = p => Math.max(0, ...p.pistas.flatMap(pi=>pi.clips.map(fin)));
export const todos = p => p.pistas.flatMap(pi=>pi.clips.map(c=>({...c, pista:pi.id})));
export const cuantiza = (t, fps) => Math.round(t * fps) / fps;          // los cortes caen en un fotograma exacto
export const puntosDeCorte = p => [...new Set([0, ...p.pistas.flatMap(pi=>pi.clips.flatMap(c=>[c.en, fin(c)])), ...(p.marcadores||[])])].sort((a,b)=>a-b);

export const nuevaPistaAudio = ps => ({ id:"a"+uid(), tipo:"audio", nombre:"Audio "+(ps.filter(x=>x.tipo==="audio").length+1), clips:[] });

// mete un clip de audio donde quepa (en la pista pedida, en otra libre o en una nueva)
export function colocarAudio(ps, c, preferida) {
  const libre = ps.find(x=>x.id===preferida && x.tipo==="audio" && !x.bloqueada && !solapa(x, c.en, largo(c)))
    || ps.find(x=>x.tipo==="audio" && !x.bloqueada && !solapa(x, c.en, largo(c)));
  if(libre) return ps.map(x=>x.id!==libre.id ? x : {...x, clips:[...x.clips, c]});
  const n = nuevaPistaAudio(ps);
  return [...ps, {...n, clips:[c]}];
}

// dividir en `t` los clips con esos ids
export const dividir = (p, ids, t) => ({...p, pistas: p.pistas.map(pi=>({...pi, clips: pi.clips.flatMap(c=>{
  if(!ids.has(c.id) || t <= c.en + 0.01 || t >= fin(c) - 0.01) return [c];
  const k = c.desde + (t - c.en);
  return [{...c, hasta:k, fade_out:0}, {...c, id:uid(), desde:k, en:t, fade_in:0}];
})}))});

// borrar a la izquierda (Q) o a la derecha (W) del cabezal
export const borrarLado = (p, ids, t, izq) => ({...p, pistas: p.pistas.map(pi=>({...pi, clips: pi.clips.map(c=>{
  if(!ids.has(c.id) || t <= c.en + 0.01 || t >= fin(c) - 0.01) return c;
  const k = c.desde + (t - c.en);
  return izq ? {...c, desde:k, en: pi.id==="v1" ? c.en : t} : {...c, hasta:k};
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
      n.en = pos - 0.0005 + k * 0.00001;
      ps = ps.map(x=>x.id!=="v1" ? x : {...x, clips:[...x.clips, n]});
    } else {
      n.en = trasCadaUno ? fin(c) : t + (c.en - base);
      ps = colocarAudio(ps, n, c.pista);
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
    return trozos.map(([x,y],k)=>{ const n = {...c, id:k ? uid() : c.id, desde:x, hasta:y, en}; en += y - x; return n; });
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
