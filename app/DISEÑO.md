# Diseño de RandomStudio (desde la 3.43, 2-11-2026)

Objetivo: una interfaz limpia donde cada cosa está en un sitio por un motivo. Esto es la referencia: cualquier pantalla
nueva o retoque sigue estas reglas.

## Dónde va cada cosa

| Zona | Qué lleva | Por qué |
|---|---|---|
| **Barra lateral** | Arriba: la cuenta (foto + RandomStudio + perfil). En medio: los apartados por grupos. Abajo: Administración / Configuración / Papelera, y el **estado de este equipo** (nube, uso de Claude) y la versión, tema y plegar. | Es «dónde estás y cómo está este equipo». Nada de eso depende de la vista. |
| **Cabecera** | Icono + nombre del apartado + una línea de descripción (`desc` en la lista de pestañas de `Principal.jsx`). A la derecha: las **acciones de la vista** (portal `rs-acciones`), deshacer/rehacer/formatos solo en las vistas de vídeos, y el buscador. | Es «qué estás mirando y qué puedes hacer aquí». Una sola cabecera por vista: la vista NO repite su título. |
| **Contenido** | Lo que se trabaja. Empieza directamente (pestañas internas, cifras en una línea, listas). | Sin títulos repetidos, sin pies de página, sin texto de relleno. |
| **Configuración** | Todo lo que se ajusta una vez (tema, apartados, datos y copias, restablecer…). | Lo que no se usa a diario no ocupa sitio en las vistas. |

## Cómo se hace

- **Acciones de una vista**: `import { AccionesDeVista } from "./base"` y envolver los botones:
  `<AccionesDeVista><button className="rs-btn primary">…</button></AccionesDeVista>`. Salen en la cabecera.
- **Botones**: `rs-btn` (normal), `rs-btn primary` (la acción principal, dorado: UNA por sitio), `rs-btn ghost`, `rs-btn danger`,
  `rs-btn ok`, `rs-btn sm`. Icono solo: `rs-icon-btn`. Grupo pegado: `rs-grupo`.
- **Pestañas internas**: `<div className="rs-seg">` con `<button className={on ? "on" : ""}>{icono}{texto}</button>`.
- **Tarjetas**: `rs-card` (un nivel con borde). Dentro de una tarjeta, `rs-card flat` (sin borde, un tono más claro). Nunca
  tarjeta con borde dentro de tarjeta con borde.
- **Cifras**: `rs-kpis` con `<span className="kpi"><span className="punto"/><b>3</b>vídeos</span>` (una línea, no cajas).
- **Campos**: `rs-input`. Rótulos de sección: `rs-kicker`. Etiquetas con estado: `rs-chip`. Vacíos: `rs-vacio`.
- **Iconos**: siempre los de `Icons` (`base.jsx`), nunca emojis en la interfaz (los emojis quedan para textos de aviso).
- **Color**: negro + dorado. El dorado solo para lo principal (acción primaria, apartado activo, cifra clave). Lo demás,
  neutro: jerarquía por tamaño y contraste, no por bordes ni brillos.
- **Radios**: 6 (chips) · 10 (botones y campos) · 14 (tarjetas) · 18 (ventanas). **Espaciado** en múltiplos de 4.
- **Tipografía**: Sora para títulos, Inter para el resto. Texto base 13,5 px; secundario `--text-2`; terciario `--text-3`.
- Los tokens y las clases viven en `src/styles.css`. Los estilos en línea de las vistas antiguas se van pasando a estas clases
  cuando se toca cada vista; no hace falta reescribirlo todo de golpe.

## Para revisarlo sin cuenta

Con `npm run dev`, `http://localhost:5173/?diseno=1` abre la app sin cuenta (solo existe en desarrollo; no está en la versión publicada).
