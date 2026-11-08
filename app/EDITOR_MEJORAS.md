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
- 🆕 4.6 Recorte de **rodillo** (R) y de **deslizar** (Y) (slip/slide) con Alt y Ctrl en los bordes — Premiere/Avid
- 🆕 4.4 **Roles por colores**: voz, música, SFX, títulos, fichas (y silenciar un rol entero) — Final Cut
- 🆕 4.5 Marcadores con **nombre y color**, y lista de marcadores — Premiere/DaVinci
- 🆕 4.5 **Historial de deshacer** visible (volver a cualquier punto) — DaVinci/Kdenlive
- 🆕 4.6 Atajos **personalizables** (⚙ del editor → Atajos propios) — Premiere
- 🆕 4.7 **Audiciones**: varias tomas en el mismo hueco y elegir la buena — Final Cut

### Sonido
- ✅ Mejorar voz (estilo CapCut) · aislar voz · fundidos · puntos de volumen · ondas reales · medidor
- 🆕 4.4 **Auto ducking** (botón ↘ de la pista; en 4.5 el visor también lo hace con la voz real): la música baja sola mientras se habla (Premiere/CapCut) — clave para Carental
- 🆕 4.5 **Normalizar sonoridad** (menú de exportar: «Volumen de YouTube») a −14 LUFS al exportar (lo que pide YouTube) — DaVinci Fairlight
- 🆕 4.4 Fundido arrastrando la **esquina del clip** en la línea de tiempo — Vegas/CapCut
- 🆕 4.5 **Quitar muletillas** («eh», «este») y respiraciones con un clic — Descript

### Texto, subtítulos y efectos
- ✅ Subtítulos automáticos con plantillas y corrección con IA · textos con estilos, sombras y animación de entrada · efectos · máscaras · color · fotogramas clave con curvas
- 🆕 4.5 **Editar por texto** (pestaña Guion): la transcripción al lado, borrar una frase borra su trozo — Descript/Premiere
- 🆕 4.6 Palabras destacadas en color (Guion) y **zoom en los cortes de salto** (sin zoom constante) al ritmo de la voz — Submagic
- 🆕 4.6 **Biblioteca de estilos de texto** propios (las fichas de Carental en un clic) — CapCut
- 🆕 4.7 **Rastreo de movimiento** (para clips superpuestos: logos, imágenes, vídeo) (un texto que sigue a algo) — After Effects
- 🆕 4.7 Editor de **curvas de animación** — After Effects

### Visor, rendimiento y exportación
- ✅ Proxies · contador de FPS · guías de Shorts · portada al exportar · pantalla completa
- 🆕 **Al exportar con un nombre que ya existe: reemplazarlo o guardar una copia (2)**
- 🆕 **Registro de cambios** de cada proyecto (para aprender de tus retoques)
- ✅ **Exportar en segundo plano** y seguir editando, con cola — DaVinci/Kdenlive
- 🆕 4.7 Medidores de **color** (forma de onda e histograma, ya con el color aplicado) — DaVinci
- 🆕 4.7 Exportar y **programar** directamente en YouTube, Instagram y TikTok desde el editor — Edits/CapCut

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

**Hecho en la 4.6.0 (fase 3):** deslizar y rodillo, atajos propios, palabras destacadas, zoom en los cortes de salto, estilos de texto propios.

**Hecho en la 4.7.0 (lo más grande):** audiciones (varias tomas en un hueco), editor de curvas, medidores de color, rastreo de movimiento para superpuestos, «Programar en redes» tras exportar, y el visor ya suena por encima del 100 %.

**Revisión de conflictos de la 4.7.0 (16 puntos, todos corregidos):** el aviso de «reemplazar» de la 4.4 no llegaba a salir (RandomStudio no dejaba pasar esa consulta) y ahora sí; los clips conectados ya no se corren con el rodillo ni recortando por delante; «A» no arrastra la principal magnética; «Quitar lo elegido» no hace nada con la principal bloqueada y no deja nada pisándose; las tomas tienen que ser del mismo tipo (vídeo con vídeo, audio con audio); al partir una tarjeta, cada palabra va a una sola mitad; las tarjetas sueltas de 0,1 s se juntan con la anterior sin perder palabras; «Cerrar huecos» en una pista de SFX o textos ya no lo lleva todo al segundo 0; Alt+letra ya no dispara atajos; al apagar «Ver al pasar» el visor vuelve al cabezal; el aviso de reemplazar exporta lo último que hayas cambiado; los textos se vuelven a medir al cargar sus fuentes.

**Prueba real de la ventana (4.7.1, 8/11):** abierta en modo de pruebas con una copia del Mercedes, sin errores. Fluidez medida (FPS, pantalla de 144 Hz): reproducir 144 · desplazar 116 → **144** · zoom con la rueda 45 → **128** · arrastrar un clip 60 con parones de 125 ms → **144 sin parones**. Cómo: la onda se guarda en pirámide y se pinta como un solo polígono, cada pista solo se repinta si cambió ella, la rueda y el arrastre van a un cambio por fotograma y el visor no se recalcula con el zoom.

**4.7.2 (8/11, sus apuntes):** copiar y pegar atributos también entre textos, y «Pegar solo tamaño y posición» (Ctrl+Alt+Shift+V o clic derecho) · alto de las pistas a medida («Alto» en la barra; por defecto más bajas) · cada vídeo de Carental en SU carpeta con su título (ya no «2026-11 Noviembre») · la biblioteca ya no se repinta en cada movimiento al editar.

**Límites que quedan:** el rastreo sirve para clips superpuestos (logos, imágenes, vídeo), todavía no para textos; los medidores miden el clip elegido con su color, no la mezcla de todas las capas; «Programar en redes» te lleva al programador con el vídeo resaltado (el día y la red los eliges tú arrastrándolo).
