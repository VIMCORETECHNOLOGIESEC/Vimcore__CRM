# CRM Multi-Tenant — sistema de diseño (en exploración)

Estado: dos direcciones visuales activas en paralelo, ninguna cerrada todavía.
No colapsar a una sola sin decisión explícita del usuario. Origen: skills
`frontend-design` + `interface-design`, aplicadas sobre
`docs/mockups/assets/propuesta-b-empresarial.html` y
`docs/mockups/assets/propuesta-c-moderna.html`.

Una tercera dirección ("Sala de control monocromática", blanco/negro estricto)
se descartó el 2026-08-26 — no retomar sin pedido explícito.

## Estructura compartida (fija, no es parte del retoque visual)

Esto es contrato de producto, no estilo — igual en cualquier dirección futura:

- Sidebar 240px desktop (Sheet en `<md`): Dashboard → Leads → Usuarios (solo
  ADMINISTRADOR) → Bridges (solo ADMINISTRADOR). Ítem activo: borde izquierdo +
  tinte de fondo, nunca bloque sólido.
- Header 56px: hamburguesa solo mobile, campana, dropdown de usuario (avatar
  iniciales, nombre, correo, "Mi perfil", "Cerrar sesión"). Sin buscador.
- Paso TO-BE de selección de empresa post-login (justificado en `docs/14` §6):
  solo cuando hay membresía en +1 empresa del holding. Es contexto de
  navegación, nunca control de seguridad — aclarar esto siempre en el copy.
- Dashboard: FiltroRangoFechas → DashboardFiltros → 7 KPI cards → 6 gráficos,
  en ese orden exacto.
- Semáforo: color + etiqueta de texto siempre juntos, nunca solo color.
  Verde `#16A34A` "Lead caliente" · Amarillo `#D97706` "Lead tibio" · Rojo
  `#DC2626` "Lead frío" · Gris `#94A3B8` "Sin calificar".
- Paleta categórica de gráficos, orden fijo: `#DB2777` `#2563EB` `#7C3AED`
  `#0891B2`.
- Loading pattern: skeleton `animate-pulse` con la forma real del contenido →
  error con "Reintentar" → vacío → contenido.

## Propuesta B — Consejo directivo (empresarial premium)

**Feel:** empresarial, cálido, con peso institucional — un directorio, no una
consola de ingeniería.

**Fijo (identidad de la dirección, no tocar sin repensar la dirección entera):**
- Temperatura: azul índigo profundo sobre papel cálido (`#F6F1E7` aprox.), NUNCA
  blanco puro ni negro.
- Par tipográfico: display serif con carácter (Fraunces) + cuerpo sans legible
  (Source Sans 3). El *concepto* del par (serif institucional + sans de
  trabajo) es la identidad; pesos/tamaños exactos son ajustables.
- Profundidad: sombras suaves de una sola capa (nunca bordes duros como única
  fuente de jerarquía).
- KPI cards con pestaña de color en el borde izquierdo, nunca fondo sólido de
  color — el color es acento, no relleno.
- Selector de empresa como sello/credencial cuadrada — nunca un dropdown
  genérico.
- Fondo de sidebar/header: índigo sólido `#1E2A5E` (el mismo índigo, no un
  color nuevo) — ya no comparten fondo con el canvas papel del contenido;
  decisión explícita del usuario tras rechazar que sidebar/header y canvas
  compartan el mismo hueso ("se ve monótono").
- Texto sobre ese índigo: hueso `#F5F3EE` — 100% en ítems/labels activos o
  principales, ~65% en inactivos/secundarios (contraste validado 12.2:1,
  sobra margen).
- Ítem activo del sidebar: pill sólido en el azul de acento `#2563EB` (ya
  definido como `--cat-2` de la paleta categórica de gráficos de arriba, no
  un color nuevo) con texto blanco (contraste validado 5.17:1) — reemplaza el
  borde izquierdo + tinte de fondo de "Estructura compartida" porque no se
  lee bien sobre un fondo ya coloreado; sumar `ring-1 ring-white/10` al pill
  si a simple vista no se distingue del índigo de fondo (hues cercanos).
  **Diverge a propósito** de la sección "Estructura compartida" de arriba
  (que fija borde izquierdo + tinte, "nunca bloque sólido") solo para esta
  dirección — pendiente decisión explícita de si "Estructura compartida" se
  actualiza para reflejar esta excepción o si Propuesta B queda documentada
  como la única divergencia.
- Sin borde divisorio entre sidebar/header y el canvas — el contraste de
  color entre hueso (canvas) e índigo (chrome) ya marca el límite; jerarquía
  por espacio/color antes que por línea (criterio de la skill
  `interface-design`).

**Abierto a retoque (evitar monotonía — variar antes de la siguiente pasada):**
- Tratamiento de la pestaña de color en KPI cards: hoy es uniforme índigo en
  las 7 cards; considerar variar por categoría de KPI para que no lea como
  "misma card × 7".
- Boot / animación de entrada: propuesta DESCARTADA (2026-08-27) tras la
  decisión de adoptar el "Loader de bienvenida" (`WelcomeSplashLoader.tsx`,
  ver abajo) como dirección de carga de la app. Las dos alternativas del
  sello (circular/puntos) ya no se muestran en el catálogo.
  `SelloBootLoader.tsx` **no se borró**: sigue siendo el componente que
  resuelve el "Selector de empresa como sello/credencial" de la sección
  Fijo de arriba (uso distinto al de boot) — queda sin demo hasta que se
  diseñe esa pantalla de selección; su patrón `.boot-dots`/`.boot-dot` (3
  puntos en `--cat-2`, cascada) sí se sigue usando tal cual, reutilizado por
  `WelcomeSplashLoader.tsx`. No retomar la demo de boot sin pedido
  explícito.
- El divisor tipo "regla de libro contable" (`.ledger-divider`/`-v`): hoy un
  solo estilo de línea — variar peso/patrón por contexto.
- No hay lenguaje de iconografía todavía (todo es texto) — definir uno antes
  de dar por cerrada esta dirección.
- Estados vacíos/error sin ilustración propia — hoy genéricos.
- Kanban de leads: se propuso como vista alternativa a la tabla y se
  DESCARTÓ (2026-08-27) — el módulo de leads mantiene `LeadsTable.tsx` como
  única vista de cartera. No retomar sin pedido explícito.
- Loader de bienvenida: nueva propuesta (2026-08-27) — overlay full-screen
  (`WelcomeSplashLoader.tsx`) mostrado al entrar a la app, ANTES de montar
  el layout, distinto del sello de boot del sidebar (`SelloBootLoader.tsx`,
  no reemplazado). Misma paleta que el resto de esta dirección (`--indigo`
  sólido de fondo, marca sobre `--papel`, puntos de progreso en `--cat-2`
  reutilizando `.boot-dots`/`.boot-dot`), ningún color nuevo.
  Demo real a pantalla completa en el catálogo (`SeccionWelcomeSplash`,
  botón "Ver demo a pantalla completa"): `createPortal` a un nodo
  DEDICADO (`#tema-empresarial-portal-root`, hermano de
  `#tema-empresarial-root`), nunca a `document.body` a secas ni como hijo
  directo de `#tema-empresarial-root`. Dos bugs reales encontrados con
  `CSS.getMatchedStylesForNode` vía CDP al verificar en navegador (no
  supuestos): (1) `document.body` no hereda las variables/selectores
  scopeados bajo `.tema-empresarial` → overlay transparente; (2) un hijo
  directo de `#tema-empresarial-root` hereda su `space-y-16`
  (`margin-top: 4rem` vía `> :not([hidden]) ~ :not([hidden])`) → el
  `fixed inset-0` queda corrido 64px. Patrón a reutilizar para cualquier
  otro overlay a pantalla completa que se agregue a este catálogo.
- Hover de fila de `LeadsTable.tsx` (2026-08-27, `tema-empresarial.css`):
  sobre el hover base compartido (`.leads-table-row:hover`, `src/index.css`,
  no tocado), esta variante agrega tinte de fondo
  `color-mix(in srgb, var(--indigo) 4%, var(--papel))` + barra de acento
  vertical de 3px en `--cat-2` sobre `::before` (`transform: scaleX()` +
  `opacity`, nunca `width`), 180ms, easing propio
  `cubic-bezier(0.23, 1, 0.32, 1)` (no el `--ease-out` ya usado por boot/
  welcome splash). Con `prefers-reduced-motion: reduce` se conserva el
  cambio de color pero se retira la barra animada.

## Propuesta C — Torre de control nocturna (glassmorphism)

**Feel:** centro de operaciones nocturno, premium, futurista — sin caer en el
cliché "casi negro + acento morado".

**Fijo (identidad de la dirección):**
- Base: grafito cálido oscuro, NUNCA negro puro.
- El semáforo es la ÚNICA fuente de glow/bloom real de toda la interfaz — se
  ve literalmente como una lámpara encendida. Esto es regla de negocio
  (estado), no debe diluirse con glow decorativo en otros elementos.
- Acento azul acero reservado EXCLUSIVAMENTE a navegación/foco — nunca para
  comunicar estado de negocio (eso es siempre el semáforo).
- Construcción de vidrio: `backdrop-filter: blur` + capa translúcida + borde +
  reflejo especular en el borde superior. Contraste de texto siempre alto —
  verificado visualmente, el vidrio nunca sacrifica legibilidad.

**Abierto a retoque (evitar monotonía — variar antes de la siguiente pasada):**
- Hoy todos los paneles usan la misma "receta" de vidrio (mismo blur, misma
  opacidad); considerar variar la intensidad de vidrio por tipo de panel
  (sidebar vs. KPI vs. gráficos) para que no se sientan intercambiables.
- Radio de esquina y tratamiento de borde del vidrio: variar entre tipos de
  componente en vez de un único valor repetido en todas las superficies.
- Coreografía del boot (barrido de luz + deslizamiento de paneles) — hoy un
  solo timing; ajustar por sensación de "sistema despertando" más orgánica.
- Transición de inclinación/perspectiva del selector de empresa: hoy sutil y
  única — validar que no se sienta genérica en más pantallas.
- No hay lenguaje de iconografía todavía.

## Notas de proceso

- Ambas direcciones comparten la estructura de producto de la sección
  "Estructura compartida" — cualquier iteración de estilo debe preservarla.
- Antes de la próxima pasada de retoque visual, releer la sección
  "Infinite Expression" de la skill `interface-design`: el riesgo señalado por
  el usuario es que los 6 gráficos / 7 KPI cards lean "misma card × N" —
  variar tratamiento por tipo de dato, no solo por color.
- Motion: solo `transform`/`opacity`, interacciones <300ms con ease-out, nada
  nace desde `scale(0)`, respetar `prefers-reduced-motion` (tokens de
  `transitions-dev` / `transitions-polish`).
