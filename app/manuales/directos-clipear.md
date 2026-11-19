# Directos → clipear

**Qué hace:** de un directo grabado saca TODOS los clips con algo dentro a `Clips Recortados`; él los criba después.

## Archivos (en E:\A RdeRandom\RandomClon)
- `clon.py preparar|clipear "<NOMBRE>"`: lo que llama Studio (emite eventos JSON por stdout).
- `clon/directos.py`:
  - `juego(nombre)`: saca el juego del nombre del directo (tabla `JUEGOS`) o de `Vídeos en bruto/<NOMBRE>/juego.txt`. Tipos: `combates` (RIVALS), `partidas` (Fortnite, Rocket…), `mundo` (GTA, Minecraft…), `momentos` (el resto).
  - `preparar`: lanza 25 (Whisper por tramos, energía, fotogramas cada 20 s) y 29 (detector de combates, solo RIVALS o juego sin saber; en el resto escribe `combates.json = []`). Después lanza 27 (candidatos).
  - `dossier_directo`: el texto que lee el agente (juego, combates, picos de voz, candidatos, transcripción).
  - `clipear`: el agente (agente.preguntar, ESQUEMA_CLIPS) con CANAL.md + CLIPEAR.md. Hasta 3 intentos con validación. Guarda `clips.json` y recorta.
- `clon/cerebro/CLIPEAR.md`: las reglas del clipeo. El §1 bis va por tipo de juego.
- Datos de cada directo: `Resultados/08_Directos/<NOMBRE>/` (transcripcion.json, combates.json, energia.json, fotogramas/, candidatos.json, clips.json, _clips_agente_N.json).

## Estado
`estado(nombre)` → registrado / transcrito / combates / candidatos / clipeado. `preparado` = transcrito y combates.json existe.

## Trampas
- Al escribir regex con `\b` desde un heredoc de Python sale `\x08`: usa chr(92).
- Preparar es local (gratis). Clipear gasta límite de Claude (lee el directo entero).

## Historial
- 19/11: tipos de juego + juego.txt + reglas GTA (sin cinemáticas a pelo, sin spoilers en el título).
