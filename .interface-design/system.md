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

**Abierto a retoque (evitar monotonía — variar antes de la siguiente pasada):**
- Tratamiento de la pestaña de color en KPI cards: hoy es uniforme índigo en
  las 7 cards; considerar variar por categoría de KPI para que no lea como
  "misma card × 7".
- Coreografía y detalle del boot (sello estampándose) — probar otras texturas
  de estampado.
- Los divisores tipo "regla de libro contable" entre columnas del kanban:
  hoy un solo estilo de línea — variar peso/patrón por contexto.
- No hay lenguaje de iconografía todavía (todo es texto) — definir uno antes
  de dar por cerrada esta dirección.
- Estados vacíos/error sin ilustración propia — hoy genéricos.

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
  el usuario es que los 6 gráficos / 7 KPI cards / columnas del kanban lean
  "misma card × N" — variar tratamiento por tipo de dato, no solo por color.
- Motion: solo `transform`/`opacity`, interacciones <300ms con ease-out, nada
  nace desde `scale(0)`, respetar `prefers-reduced-motion` (tokens de
  `transitions-dev` / `transitions-polish`).
