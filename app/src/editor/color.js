/* RandomEditor · COLOR y FILTROS (31/10, él: "una pestaña en propiedades para ajustar el color del visual,
   con todas las opciones posibles: exposición, saturación, gamma..."; "filtros como los de CapCut: uso
   «Intenso» para el concesionario; busca filtros predefinidos y crea los que veas").
   Las MISMAS fórmulas que clon/color.py (la exportación):
     1) matriz de entrada: exposición (×2^EV), temperatura y tinte (ganancia por canal)
     2) curva de tonos (tabla de 256 por canal): negros, blancos, brillo, gamma, contraste, sombras, luces
     3) matriz de salida: saturación, vivacidad y tono (las de CSS: saturate y hue-rotate)
   En la previsualización es un filtro SVG (lo pinta la gráfica); al exportar, ffmpeg con la misma tabla. */

export const AJUSTES = [
  ["exposicion","Exposición",-3,3,0.05,v=>(v>0?"+":"")+v.toFixed(2)+" EV"], ["brillo","Brillo",-100,100,1], ["contraste","Contraste",-100,100,1],
  ["gamma","Gamma",0.3,3,0.01,v=>v.toFixed(2)], ["luces","Luces",-100,100,1], ["sombras","Sombras",-100,100,1],
  ["blancos","Blancos",-100,100,1], ["negros","Negros",-100,100,1], ["saturacion","Saturación",-100,100,1],
  ["vivacidad","Vivacidad",-100,100,1], ["temperatura","Temperatura",-100,100,1], ["tinte","Tinte",-100,100,1], ["tono","Tono",-180,180,1,v=>v+"°"],
];
export const COLOR0 = { exposicion:0, brillo:0, contraste:0, gamma:1, luces:0, sombras:0, blancos:0, negros:0, saturacion:0, vivacidad:0, temperatura:0, tinte:0, tono:0 };

// los filtros: un juego de ajustes; la intensidad los escala (100 % = tal cual)
export const FILTROS = {
  intenso:   { nombre:"Intenso",      color:{ contraste:22, saturacion:30, vivacidad:20, luces:-10, sombras:8, temperatura:4 } },
  vivo:      { nombre:"Vivo",         color:{ saturacion:40, vivacidad:30, contraste:10, brillo:4 } },
  calido:    { nombre:"Cálido",       color:{ temperatura:35, tinte:6, saturacion:8, brillo:3 } },
  frio:      { nombre:"Frío",         color:{ temperatura:-35, tinte:-4, contraste:6 } },
  cine:      { nombre:"Cine",         color:{ contraste:28, saturacion:-12, temperatura:-8, negros:12, luces:-14, sombras:-6 } },
  dramatico: { nombre:"Dramático",    color:{ contraste:45, saturacion:-25, exposicion:-0.2, luces:-20, sombras:-15 } },
  brillante: { nombre:"Brillante",    color:{ exposicion:0.35, brillo:10, sombras:15, saturacion:10 } },
  noche:     { nombre:"Noche",        color:{ exposicion:-0.5, temperatura:-30, saturacion:-20, contraste:15 } },
  retro:     { nombre:"Retro",        color:{ negros:25, blancos:-12, saturacion:-25, temperatura:22, tinte:8, contraste:-10 } },
  bn:        { nombre:"Blanco y negro", color:{ saturacion:-100, contraste:20 } },
  bn_suave:  { nombre:"B/N suave",    color:{ saturacion:-100, contraste:-10, negros:15 } },
  pastel:    { nombre:"Pastel",       color:{ saturacion:-30, brillo:15, negros:20, contraste:-15 } },
};

// el color final de un clip: sus ajustes + su filtro (con su intensidad)
export function colorDe(c) {
  const out = {...COLOR0, ...(c.color || {})};
  const f = c.filtro && FILTROS[c.filtro.id];
  if(f){ const k = c.filtro.intensidad ?? 1; for(const [x, v] of Object.entries(f.color)) out[x] = (out[x] ?? 0) + v * k; }
  return out;
}
export const conColor = c => { const x = colorDe(c); return Object.keys(COLOR0).some(k=>Math.abs(x[k] - COLOR0[k]) > 1e-6); };

const cl = x => Math.max(0, Math.min(1, x));
export function curva(x, e) {
  const lo = -e.negros / 100 * 0.15, hi = 1 - e.blancos / 100 * 0.15;
  x = cl((x - lo) / Math.max(1e-4, hi - lo));
  x = Math.pow(x, Math.pow(2, -e.brillo / 100));
  x = Math.pow(x, 1 / Math.max(0.05, e.gamma));
  x = cl(0.5 + (x - 0.5) * (1 + e.contraste / 100));
  x = cl(x + e.sombras / 100 * 0.5 * Math.pow(1 - x, 2) * x);
  x = cl(x + e.luces / 100 * 0.5 * x * x * (1 - x));
  return x;
}
export const tabla = (e, n = 256) => Array.from({length:n}, (_, i)=>+curva(i / (n - 1), e).toFixed(5));

// matrices 3x3
export function entrada(e) {
  const g = Math.pow(2, e.exposicion), t = e.temperatura / 100, ti = e.tinte / 100;
  return [g * (1 + 0.2 * t), 0, 0,  0, g * (1 - 0.15 * ti), 0,  0, 0, g * (1 - 0.2 * t)];
}
const mul = (a, b) => [0,1,2].flatMap(i=>[0,1,2].map(j=>a[i*3]*b[j] + a[i*3+1]*b[3+j] + a[i*3+2]*b[6+j]));
export function salida(e) {
  const s = Math.max(0, (1 + e.saturacion / 100) * (1 + e.vivacidad / 200));
  const sat = [0.213 + 0.787*s, 0.715 - 0.715*s, 0.072 - 0.072*s,  0.213 - 0.213*s, 0.715 + 0.285*s, 0.072 - 0.072*s,  0.213 - 0.213*s, 0.715 - 0.715*s, 0.072 + 0.928*s];
  const a = e.tono * Math.PI / 180, co = Math.cos(a), si = Math.sin(a);
  const hue = [0.213 + co*0.787 - si*0.213, 0.715 - co*0.715 - si*0.715, 0.072 - co*0.072 + si*0.928,
               0.213 - co*0.213 + si*0.143, 0.715 + co*0.285 + si*0.140, 0.072 - co*0.072 - si*0.283,
               0.213 - co*0.213 - si*0.787, 0.715 - co*0.715 + si*0.715, 0.072 + co*0.928 + si*0.072];
  return mul(hue, sat);
}
const fila = m => [0,1,2].map(i=>`${m[i*3].toFixed(5)} ${m[i*3+1].toFixed(5)} ${m[i*3+2].toFixed(5)} 0 0`).join(" ") + " 0 0 0 1 0";

// el filtro SVG (para la previsualización)
export function svgFiltro(id, c) {
  const e = colorDe(c), t = tabla(e, 256).join(" ");
  return `<filter id="${id}" color-interpolation-filters="sRGB" x="0" y="0" width="1" height="1">`
    + `<feColorMatrix type="matrix" values="${fila(entrada(e))}"/>`
    + `<feComponentTransfer><feFuncR type="table" tableValues="${t}"/><feFuncG type="table" tableValues="${t}"/><feFuncB type="table" tableValues="${t}"/></feComponentTransfer>`
    + `<feColorMatrix type="matrix" values="${fila(salida(e))}"/></filter>`;
}
