# Cuentas de Claude (desde la 4.11.0)

## Qué hace
Manu tiene varias cuentas de Claude (Maggi, Claudie y las que vengan). **Cada equipo elige la suya** (4.11.1: p. ej. el
portátil con Maggi y el Ordenador con Claudie, o cambiarla para los vídeos de Carental):
- desde cualquier panel de administrador (Historias → Equipos, escritorio o móvil): «Claude de» en la tarjeta de cada equipo;
- en el propio equipo: Ajustes de RandomHistorias → «Este equipo gasta de»;
- «Claude en todos» (arriba, junto a «Trabajar hasta») los pone todos iguales de una vez.
Cada equipo solo puede gastar de las cuentas cuyo permiso tenga pegado (Ajustes); si eligen una que no tiene, avisa y usa otra.
Opciones:
- **automática (más margen)**: cada equipo usa la cuenta suya con menos gasto (lo más alto de sus ventanas de 5 h y semana).
- **una cuenta concreta** («maggi», «claudie»…).

Si la elegida se queda sin límite, o un equipo no tiene su permiso, ese equipo usa otra cuenta con margen en vez de
esperar (la historia se reintenta en 1 min con la otra). Solo si TODAS están sin límite se espera como antes.

## Dónde está cada cosa
- `electron/claude.cjs`
  - Permisos por cuenta: `userData/claude-<cuenta>.token` (cifrados con safeStorage; nunca van al servidor).
  - Elección y límites: `userData/claude-cuentas.json` `{ elegida, cuando, limites: { cuenta: hasta }, migrada }`.
  - `cuentaActiva()` decide la cuenta; `entornoClaude(extra, cuenta)` pone su permiso en `CLAUDE_CODE_OAUTH_TOKEN` y el
    nombre en `RS_CLAUDE_CUENTA`; `limiteDe(texto, cuenta)` aparta la cuenta que llegó al límite.
  - `leerUso()` lee el uso de cada cuenta (`uso.cuentas`); arriba va el de la activa (compatible con antes).
  - IPC: `claude-cuentas`, `claude-cuenta-guardar`, `claude-cuenta-probar`, `claude-cuenta-renombrar`, `claude-elegir`.
  - Migración: el `claude.token` de antes pasa a ser la cuenta «maggi» (se puede renombrar en Ajustes).
- `electron/historias.cjs`: la orden «ajustes» acepta `nuevos.claudeCuenta = { cuenta, cuando }`; cada etapa anota en el
  registro con qué cuenta empieza; `estudio-ajustes` devuelve `claudeCuentas`.
- `src/remoto.js`: el estado del equipo publica `claudeCuentas` (nombres, límites, elegida, activa: nunca permisos). Al
  arrancar, un equipo toma la elección más nueva de los demás (gana el `cuando` mayor). También entiende la orden
  `claude_cuenta` (por si el servidor la deja pasar).
- `src/historias.jsx`: Ajustes → lista de cuentas de este equipo (probar, renombrar, quitar, añadir). Panel → «Claude de»
  (junto a «Trabajar hasta») y, en Equipos, la cuenta que usa cada equipo y un aviso si le falta el permiso elegido.
- `src/uso_claude.jsx`: `UsoCuentas` (uso de cada cuenta, 5 h y semana, con su reinicio) y el nombre de la cuenta en el
  marcador de la barra lateral.

## Sin tocar el servidor
La elección viaja en la orden «ajustes» (ya existía) y en el estado de cada equipo. No hay que desplegar nada.

## Trampas
- Un equipo sin el permiso de la cuenta elegida usa otra y lo dice en Equipos: pegar el permiso allí (Ajustes).
- El uso de cada cuenta se mira con una consulta mínima a Haiku cada 10 min por cuenta (gasta casi nada).
- La sesión normal de Claude Code (`~/.claude`) solo se usa si el equipo no tiene ninguna cuenta guardada.

## Historial
- 4.11.0 (23-11-2026, Claudie): primera versión (una elección para todos).
- 4.11.1 (23-11-2026, Claudie): elección por equipo (tarjeta de Equipos y Ajustes); al arrancar, solo un equipo que nunca
  eligió toma la de los demás.
