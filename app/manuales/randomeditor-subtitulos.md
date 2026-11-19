# RandomEditor → subtítulos

**Qué hace:** genera los subtítulos del vídeo (Whisper y, si quieres, la IA) en una pista `subtitulos`. Cada tarjeta es una frase con sus palabras. La plantilla da el estilo y la animación.

## Modelo
- La pista es `{tipo:"subtitulos", plantilla, estilo, clips}`. `estilo` es lo que cambias encima de la plantilla (color, tam, x, y, contorno, sombra, cursiva, fuente), en unidades de CapCut: x e y van de -1 a 1, con y hacia arriba.
- Cada tarjeta es `{tipo:"sub", en, desde, hasta, texto, palabras:[[t, t2, palabra, color?]], pos?}`.
- **`pos` = {x, y, tam}** (19/11) es el sitio propio de una tarjeta, encima del estilo de la pista. Sin `pos`, la tarjeta va «como todos».

## Archivos
- `src/editor/Subtitulos.jsx`:
  - `estiloPx` pasa de unidades de CapCut a píxeles (la misma calibración que el exportado).
  - `plantillaDe` y `estiloTarjeta(pl, c)`.
  - `CapaSubtitulos`: el visor. Pinta fotograma a fotograma con `reloj.oir`. Al arrastrar: sin elegir esa tarjeta se mueven TODAS (`pista.estilo.x/y`, y las que tienen `pos` se desplazan lo mismo); si está elegida, solo las elegidas (su `pos`). Imán al centro.
  - `PanelSubtitulos`: la pestaña con las plantillas, el estilo de todas (Horizontal, Altura…) y «Todas a este sitio».
  - `InspectorSub`: el texto, el color por palabra, y el sitio y tamaño propios (Como todos / Copiar / Pegar).
- `src/editor/RandomEditor.jsx`:
  - `copiarAtributos` y `pegarAtributos` (Ctrl+Alt+C / Ctrl+Alt+V y el clic derecho). Con una tarjeta de subtítulo copian y pegan `pos`.
  - Aquí se monta `InspectorSub` (onPos).
  - `generarSubs` lanza `redsubs`.
- Vista.jsx monta `CapaSubtitulos` con sel, onElegir y onGesto.
- Exportado: `RandomClon/clon/subtitulos.py` → `capas()`. Cada tarjeta usa `{**estilo, **pos}` para su centro y su tamaño.

## Pruebas
Modo de pruebas con STUDIO_CAPTURA, STUDIO_EDITOR=1, **STUDIO_SEP="¦"** (si no, el JS se parte por las comas) y STUDIO_PESTANAS="$<js>". El JS mete la pista con `__redPrueba.gesto("inicio"|"durante"|"fin")` y lee `__redPrueba.p()`. Ejemplo: scratchpad `prueba_subs.js`.

## Plantillas propias
«Guardar como plantilla» (clon.py redsubsguardar → `subtitulos.guardar_plantilla`) guarda `pista.estilo` (sitio común x/y incluido) con el nombre que él ponga, por ejemplo «Shorts arriba». Los `pos` de cada tarjeta NO van en la plantilla.
