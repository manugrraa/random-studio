/* RandomEditor · el reloj del cabezal. El tiempo NO vive en el estado de React: cambia 60 veces por
   segundo al reproducir y repintar todo el editor en cada fotograma era lo que lo hacía ir a tirones.
   Quien lo necesita (el cabezal, el contador, la previsualización) se suscribe y se actualiza solo. */
export function crearReloj() {
  const oyentes = new Set();
  const r = {
    t: 0,
    poner(t) { r.t = t; oyentes.forEach(f=>f(t)); },
    oir(f) { oyentes.add(f); return () => oyentes.delete(f); },
  };
  return r;
}
