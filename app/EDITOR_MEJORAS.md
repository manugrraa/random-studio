# RandomEditor · lo mejor de cada editor (análisis 8-11-2026)

Análisis de los editores punteros: lo que hace fuerte a cada uno y qué nos llevamos. Estado de cada punto en el RandomEditor:
**✅** ya lo tenemos · **🆕** hecho en la 4.4.0 · **⏭** fase 2 (lo siguiente) · **🧭** fase 3 (más grande).

## 1. Lo fuerte de cada uno

| Editor | Lo que lo hace bueno |
|---|---|
| **CapCut PC** | Pista principal magnética; subtítulos automáticos con plantillas; mejorar voz y aislar voz con un clic; efectos, transiciones y animaciones de texto en un solo clic; «auto reframe»; quitar fondo sin croma; plantillas; copiar y pegar atributos; Ctrl+B, Q y W; cerrar huecos; música que se ajusta al ritmo (marcas de beat); exportar con un clic |
| **Premiere Pro** | Atajos para todo y personalizables; recorte de ondulación, de rodillo, de deslizar (slip y slide); «ripple delete»; seleccionar todo hacia delante (A); fotogramas clave con curvas; «Auto Ducking» (la música baja sola con la voz); Essential Sound; editar por texto (borrar frases de la transcripción y se borran del vídeo); Generative Extend; Speech to Text; marcadores con nombre y color; espacios de trabajo |
| **DaVinci Resolve** | Página Cut (para ir rápido) y página Edit (para precisión); alto de pista ajustable; corrección de color por nodos y medidores (vectorscopio, forma de onda); Fairlight: mezclador, normalizar sonoridad (LUFS), limitador; Voice Isolation; Magic Mask; Smart Reframe; caché de render; deshacer con historial; «Close Up» y transiciones suaves; recortar sin soltar el teclado (modo trim) |
| **Final Cut Pro** | «Skimming»: el visor enseña lo que hay bajo el ratón sin mover el cabezal; la línea de tiempo magnética con clips conectados (el SFX va pegado al clip y se mueve con él); roles por colores (voz, música, efectos); audiciones (varias tomas en el mismo hueco); «Enhance Light and Color»; muy fluido incluso en equipos modestos |
| **Avid Media Composer** | Montaje de precisión: recortes dobles y asimétricos, «segment mode», marcar entrada y salida (I y O) y sobrescribir o insertar; todo con teclado |
| **After Effects** | Curvas de animación (editor de gráficas), «motion blur» real, rastreo de movimiento (pegar un texto a algo que se mueve), expresiones; plantillas que usa Premiere |
| **Vegas Pro** | Edición en la línea de tiempo sin ventanas, fundidos arrastrando la esquina del clip, envolventes de volumen y opacidad dibujadas sobre el clip |
| **Filmora** | Facilidad: «Auto Beat Sync», «Silence Detection» (quitar silencios), efectos en un clic, keyframes sencillos, «AI copywriting» |
| **Descript** | Editar el vídeo como un documento: borras texto y se borra el clip; quita muletillas («eh», «o sea») y silencios automáticamente; «Studio Sound»; «Overdub» (corregir una palabra con tu voz) |
| **Edits (Instagram) / CapCut móvil / VN** | Pensados para Shorts y Reels: plantillas, textos animados listos, guías de la zona segura, exportar directo a la red |
| **Submagic / Opus Clip** | Subtítulos con emojis y palabras destacadas en color, zooms automáticos al ritmo de la voz, encontrar los mejores momentos de un vídeo largo |
| **Kdenlive / Shotcut** | Proxies automáticos, render en segundo plano, historial de deshacer visible |

## 2. La lista unificada (todo lo bueno, hecho nuestro)

### Línea de tiempo y montaje
- ✅ Pista principal magnética (se puede apagar) · imán a cortes y marcadores · cuchilla · Ctrl+B / Q / W · recuadro de selección · mover grupos
- ✅ Pistas nuevas soltando el clip arriba o abajo · bloquear y silenciar pistas · J/K/L · flechas fotograma a fotograma
- 🆕 **Una pista nunca tiene dos clips a la vez** (al abrir, lo que se pisaba va a otra pista del mismo tipo) — arregla los SFX y títulos apilados
- 🆕 **Eliminar y cerrar el hueco** (Shift+Supr, el «ripple delete» de Premiere)
- 🆕 **Cerrar los huecos de una pista** (clic derecho)
- 🆕 **A: elegir todo del cabezal en adelante** (Premiere)
- 🆕 **S: previsualizar al pasar el ratón** sin mover el cabezal (Final Cut)
- 🆕 **H: pistas compactas** para ver muchas a la vez (DaVinci)
- 🆕 Doble clic en un clip: lo elige; en un texto, a escribir directamente
- 🆕 4.5 Clips **conectados**: el SFX y el texto pegados a su clip de la principal (se mueven con él) — Final Cut
- ⏭ Recorte de **rodillo** y de **deslizar** (slip/slide) con Alt y Ctrl en los bordes — Premiere/Avid
- 🆕 4.4 **Roles por colores**: voz, música, SFX, títulos, fichas (y silenciar un rol entero) — Final Cut
- 🆕 4.5 Marcadores con **nombre y color**, y lista de marcadores — Premiere/DaVinci
- 🆕 4.5 **Historial de deshacer** visible (volver a cualquier punto) — DaVinci/Kdenlive
- ⏭ Atajos **personalizables** — Premiere
- 🧭 **Audiciones**: varias tomas en el mismo hueco y elegir la buena — Final Cut

### Sonido
- ✅ Mejorar voz (estilo CapCut) · aislar voz · fundidos · puntos de volumen · ondas reales · medidor
- 🆕 4.4 **Auto ducking** (botón ↘ de la pista; en 4.5 el visor también lo hace con la voz real): la música baja sola mientras se habla (Premiere/CapCut) — clave para Carental
- 🆕 4.5 **Normalizar sonoridad** (menú de exportar: «Volumen de YouTube») a −14 LUFS al exportar (lo que pide YouTube) — DaVinci Fairlight
- 🆕 4.4 Fundido arrastrando la **esquina del clip** en la línea de tiempo — Vegas/CapCut
- 🆕 4.5 **Quitar muletillas** («eh», «este») y respiraciones con un clic — Descript

### Texto, subtítulos y efectos
- ✅ Subtítulos automáticos con plantillas y corrección con IA · textos con estilos, sombras y animación de entrada · efectos · máscaras · color · fotogramas clave con curvas
- 🆕 4.5 **Editar por texto** (pestaña Guion): la transcripción al lado, borrar una frase borra su trozo — Descript/Premiere
- ⏭ Palabras destacadas en color y **zooms automáticos** al ritmo de la voz — Submagic
- ⏭ **Biblioteca de estilos de texto** propios (las fichas de Carental en un clic) — CapCut
- 🧭 **Rastreo de movimiento** (un texto que sigue a algo) — After Effects
- 🧭 Editor de **curvas de animación** — After Effects

### Visor, rendimiento y exportación
- ✅ Proxies · contador de FPS · guías de Shorts · portada al exportar · pantalla completa
- 🆕 **Al exportar con un nombre que ya existe: reemplazarlo o guardar una copia (2)**
- 🆕 **Registro de cambios** de cada proyecto (para aprender de tus retoques)
- ✅ **Exportar en segundo plano** y seguir editando, con cola — DaVinci/Kdenlive
- ⏭ Medidores de **color** (forma de onda) — DaVinci
- 🧭 Exportar y **programar** directamente en YouTube, Instagram y TikTok desde el editor — Edits/CapCut

## 3. Fallos corregidos en la 4.4.0 (tu aviso + revisión completa del código)
- Las propiedades de un texto enseñaban volumen y fundidos (los textos que monta la IA no iban marcados como texto).
- SFX, títulos y planos apilados en la misma pista: ahora se reparten en pistas al abrir y al montar Carental.
- **Moviendo o recortando, un clip podía montarse encima de otro** de su pista (SFX, textos, superpuestas). Ya no, en ninguna pista; también al moverlos en grupo, con Alt+flechas o escribiendo los tiempos.
- Escribir en un texto y luego pulsar un botón **desordenaba el deshacer**; los botones −/+ de los fundidos no se podían deshacer.
- **Dividir una tarjeta de subtítulos repetía sus palabras** en las dos mitades; ahora cada mitad lleva las suyas.
- Dividir un clip animado (zoom, posición, volumen) **saltaba en el corte**; ahora cada mitad sigue desde el valor del corte.
- «Quitar el aire» dejaba **huecos negros** con la principal libre; ahora se corre lo de detrás.
- Pegar un clip superpuesto o una imagen podía caer en la **pista principal**; una imagen soltada en una pista de audio quedaba muerta.
- Las pistas **bloqueadas** se podían cambiar (silenciar, volumen, estilo de texto, Ctrl+A…).
- Alt+← → **separaba** dos SFX elegidos y pegados.
- La **música de una pista quitada** (o de otro proyecto) seguía sonando.
- El **medidor de volumen** no se movía.
- El ◆ de fotograma clave se ponía a veces **un instante antes**.
- La entrada «golpe» no se veía en la previsualización y el desenfoque sí salía en superpuestas (al exportar no).
- Imágenes y efectos enseñaban controles de sonido que no hacían nada.
- «Mejorar / aislar voz» podía **deshacer lo que cambiaste mientras procesaba**.
- Q con la principal libre dejaba el cabezal en un hueco.
- Fluidez: el visor ya no remide todos los textos en cada fotograma ni la biblioteca se repinta entera al arrastrar.
- Tarjetas de subtítulos de 0,1 s sueltas: fuera.

**Hechos en la 4.5.0 (fase 2):** el «fundido» de entrada de los textos ya dura lo que dice; el «bajar al hablar» del visor usa la voz real; el visor avisa cuando el volumen pasa del 100 % (no puede sonar más alto; al exportar sí).

**Lo que queda (fase 3):** recorte de rodillo y deslizar · atajos personalizables · palabras destacadas y zooms automáticos al ritmo de la voz · biblioteca de estilos de texto propios · medidores de color · audiciones · rastreo de movimiento · curvas de animación · exportar y programar desde el editor.
