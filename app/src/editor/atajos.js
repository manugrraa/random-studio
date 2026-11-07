/* RandomEditor · todos sus atajos (la guía de Configuración los lee de aquí) */
export const ATAJOS_EDITOR = [
  ["Espacio", "Reproducir / pausar"],
  ["J / K / L", "Atrás / pausa / adelante (L otra vez: más rápido)"],
  ["V / B", "Herramienta selección / cuchilla (con la cuchilla, clic = cortar ahí)"],
  ["Y", "Deslizar: arrastrar un clip cambia qué trozo del archivo enseña, sin moverlo ni cambiar su largo (Premiere)"],
  ["R", "Rodillo: arrastrar el borde entre dos clips seguidos mueve el corte; uno crece y el otro encoge (Premiere/Avid)"],
  ["Ctrl+B", "Dividir en el cabezal (lo elegido, o la pista principal)"],
  ["Q / W", "Borrar a la izquierda / derecha del cabezal"],
  ["Supr / Retroceso", "Eliminar lo elegido (la principal se cierra sola)"],
  ["Shift+Supr", "Eliminar lo elegido y cerrar el hueco que deja (como el «ripple delete» de Premiere)"],
  ["A", "Elegir todo lo que hay del cabezal en adelante, en todas las pistas (para correrlo de golpe)"],
  ["S", "Previsualizar al pasar el ratón por la línea de tiempo, sin mover el cabezal (como Final Cut)"],
  ["H", "Pistas compactas: más bajas, para ver muchas a la vez"],
  ["Clic derecho con 2+ clips → Juntar como tomas", "Audición: varias tomas en el mismo hueco; en Propiedades cambias de toma con un clic"],
  ["Transformar → Curva", "Arrastra los ◆ de la curva: a los lados = cuándo, arriba/abajo = valor; doble clic lo quita"],
  ["Transformar → Seguir lo de debajo", "Rastreo: un clip superpuesto (logo, imagen) se pone encima de algo y lo sigue"],
  ["Color → Medidores", "Forma de onda e histograma del clip en el cabezal, ya con su color (rojo = quemado)"],
  ["📅 Programar en redes (tras exportar)", "Abre el programador con el vídeo recién exportado resaltado: arrástralo al día y la red"],
  ["⚙ del editor → Atajos propios", "Pon tus teclas: una tecla tuya que hace lo mismo que otra del editor"],
  ["Zoom en cortes (barra de arriba)", "En los cortes de salto (dos trozos seguidos del mismo vídeo), uno sí y otro no entra a ×1,07; otra vez lo quita"],
  ["Guion → Destacar palabras", "Una palabra por tarjeta de subtítulos en amarillo (números, nombres, palabras fuertes); otra vez lo quita"],
  ["Propiedades de un texto → Mis estilos", "Guarda el estilo de un texto con un nombre; luego, un clic se lo pone a otro (también sale en la pestaña Texto)"],
  ["☰ junto a deshacer", "Historial: vuelve de golpe a cualquier paso (y adelante otra vez)"],
  ["Pestaña Guion", "Lo que se dice, como un texto: clic = ir ahí; Shift+clic o arrastrar = elegir; «Quitar lo elegido» lo saca del vídeo; «Quitar muletillas» quita los «eh», «em», «mmm»"],
  ["Conectados (barra de la línea de tiempo)", "Al mover o quitar un clip de la principal, los SFX, textos y subtítulos que tiene encima van con él"],
  ["Bolitas blancas arriba de un clip", "Arrastrarlas: fundido de entrada / salida"],
  ["↘ en una pista de audio", "Bajar sola cuando se habla (auto ducking): para la música"],
  ["Marcadores (Propiedades, sin nada elegido)", "Nombre y color de cada marcador; clic en su tiempo = ir ahí"],
  ["Doble clic en un clip", "Elegirlo (en un texto, escribir directamente)"],
  ["Ctrl+C / Ctrl+X / Ctrl+V", "Copiar / cortar / pegar en el cabezal"], ["Ctrl+D", "Duplicar"],
  ["Ctrl+A / Esc", "Elegir todo / quitar la selección"],
  ["Arrastrar en un hueco de las pistas", "Recuadro de selección, como en el escritorio (Shift/Ctrl: se suma); un clic, mueve el cabezal"],
  ["Ctrl+Z / Ctrl+Shift+Z (Ctrl+Y)", "Deshacer / rehacer (todo: también arrastres, recortes, volumen)"],
  ["← / →", "Un fotograma atrás / adelante (Shift: 1 s)"],
  ["↑ / ↓  ·  Ctrl+← / →", "De trozo en trozo: al corte o marcador anterior / siguiente"],
  ["Inicio / Fin", "Al principio / al final"],
  ["Alt+← / Alt+→", "Mover lo elegido (menos la principal) un fotograma (Shift: 10) — para cuadrar un SFX o un texto"],
  ["Clic / doble clic en la previsualización", "Reproducir o pausar / pantalla completa"],
  ["M", "Poner (o quitar) un marcador"], ["Shift+M", "Silenciar / devolver el sonido de lo elegido"],
  ["Ctrl+Shift+S", "Extraer el audio de lo elegido a una pista"],
  ["N", "Imán: el cabezal, los recortes y los movimientos se pegan a los cortes (Alt al arrastrar: sin imán)"],
  ["G", "Guías de YouTube Shorts en la previsualización"],
  ["Ctrl+rueda / Alt+rueda", "Acercar / alejar donde está el ratón"], ["Ctrl++ / Ctrl+-", "Acercar / alejar alrededor del cabezal"],
  ["Rueda  ·  Shift+rueda", "Desplazar la línea de tiempo en horizontal  ·  las pistas en vertical"],
  ["Re Pág / Av Pág", "Una pantalla a la izquierda / derecha (sin mover el cabezal)"],
  ["Rueda pulsada y arrastrar", "Mover la vista en cualquier dirección"],
  ["Barra de abajo", "Arrastrarla = moverse; arrastrar sus bordes dorados = acercar / alejar; clic = ir ahí"],
  ["Shift+Z", "Ver toda la línea de tiempo"],
  ["Ctrl+I", "Meter archivos del disco"], ["Ctrl+T", "Texto nuevo en el cabezal (el de los títulos, en la pestaña Texto)"],
  ["Ctrl+S", "Guardar (con un clip abierto: Guardar cambios)"], ["Ctrl+E / Ctrl+Shift+E", "Exportar vídeo a Shorts Listos / exportar vídeo en… (eliges dónde)"],
  ["Clip elegido en la previsualización", "Recuadro: arrastrar = mover (se pega al centro, bordes y esquinas; Alt: sin imán) · esquinas = escalar · punto de arriba = girar"],
  ["◇ / ◆ en Transformar", "Fotograma clave en el cabezal; muévete y cambia el valor para animar; «Curva» = aceleración, desaceleración o las dos"],
  ["Pestaña Máscara", "Formas (o libre: clic añade puntos, doble clic quita); el contorno se arrastra en la previsualización"],
  ["Efectos: ＋ / ＋♪", "Solo el efecto / el efecto y su sonido, cada uno en su pista"],
  ["Arrastrar un texto en la previsualización", "Moverlo (se pega al centro y a la línea del título)"],
  ["Ctrl+Shift+F", "Previsualización a pantalla completa"],
  ["Clic derecho en un clip", "Menú: dividir, copiar, duplicar, extraer audio, silenciar, eliminar, eliminar cerrando el hueco, cerrar huecos de la pista"],
  ["Arrastrar un clip / un borde", "Moverlo (en la principal cambia el orden; el audio, también de pista) / recortarlo (con su medida)"],
  ["Arrastrar uno de los elegidos", "Mueve todos los elegidos juntos, cada uno en su pista (un clic sin arrastrar: se queda elegido solo ese)"],
  ["☆ en la biblioteca", "Favorito: sale en «★ Favoritos», el primer apartado de cada pestaña"],
  ["Arrastrar de la biblioteca", "Meterlo justo donde lo sueltes"],
];

/* 8/11 (fase 3, Premiere: atajos PERSONALIZABLES): una tecla tuya que hace lo mismo que otra del editor.
   Se guardan en este PC: { "tu combinación": "la del editor" } (p. ej. "c" → "b": la C también es la cuchilla). */
export const ACCIONES = [
  [" ", "Reproducir / pausar"], ["j", "Atrás"], ["k", "Pausa"], ["l", "Adelante"],
  ["v", "Herramienta selección"], ["b", "Herramienta cuchilla"], ["y", "Herramienta deslizar"], ["r", "Herramienta rodillo"],
  ["ctrl|b", "Dividir en el cabezal"], ["q", "Borrar a la izquierda"], ["w", "Borrar a la derecha"],
  ["Delete", "Eliminar"], ["shift|Delete", "Eliminar y cerrar el hueco"], ["a", "Elegir del cabezal en adelante"],
  ["ctrl|c", "Copiar"], ["ctrl|x", "Cortar"], ["ctrl|v", "Pegar"], ["ctrl|d", "Duplicar"],
  ["ctrl|z", "Deshacer"], ["ctrl|shift|z", "Rehacer"], ["ctrl|s", "Guardar"], ["ctrl|e", "Exportar"],
  ["ctrl|t", "Texto nuevo"], ["ctrl|i", "Meter archivos"], ["ctrl|shift|s", "Extraer el audio"], ["shift|m", "Silenciar"],
  ["m", "Marcador"], ["n", "Imán"], ["g", "Guías de Shorts"], ["s", "Ver al pasar el ratón"], ["h", "Pistas compactas"],
  ["ArrowLeft", "Un fotograma atrás"], ["ArrowRight", "Un fotograma adelante"], ["ArrowUp", "Corte anterior"], ["ArrowDown", "Corte siguiente"],
  ["alt|ArrowLeft", "Mover lo elegido un fotograma atrás"], ["alt|ArrowRight", "Mover lo elegido un fotograma adelante"],
  ["shift|z", "Ver toda la línea de tiempo"], ["Home", "Al principio"], ["End", "Al final"],
];
export const combo = e => [(e.ctrlKey || e.metaKey) && "ctrl", e.altKey && "alt", e.shiftKey && "shift", e.key.length === 1 ? e.key.toLowerCase() : e.key].filter(Boolean).join("|");
export const comboBonito = c => c.split("|").map(x=>({ctrl:"Ctrl", alt:"Alt", shift:"Shift", " ":"Espacio", Delete:"Supr", ArrowLeft:"←", ArrowRight:"→", ArrowUp:"↑", ArrowDown:"↓", Home:"Inicio", End:"Fin"}[x] || (x.length === 1 ? x.toUpperCase() : x))).join("+");
export const leerPropios = () => { try { return JSON.parse(localStorage.getItem("red_atajos_propios") || "{}"); } catch(x){ return {}; } };
export const ponerPropios = o => { try { localStorage.setItem("red_atajos_propios", JSON.stringify(o)); } catch(x){} };
// la tecla pulsada, convertida en la del editor si es uno de tus atajos
export function remapear(e) {
  const m = leerPropios()[combo(e)]; if(!m) return e;
  const ps = m.split("|"), key = ps[ps.length - 1];
  return { key, ctrlKey: ps.includes("ctrl"), metaKey: false, altKey: ps.includes("alt"), shiftKey: ps.includes("shift"), repeat: e.repeat,
    preventDefault: ()=>e.preventDefault(), stopPropagation: ()=>e.stopPropagation(), stopImmediatePropagation: ()=>e.stopImmediatePropagation() };
}
