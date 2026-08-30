# 09 — Línea gráfica del frontend y flujo de mockups (Stitch AI + Lazyweb)

No existe manual de marca del cliente (ver F1 en `07-modulos-frontend.md`). Este
documento fija los criterios visuales mínimos para que los 8 módulos del
frontend sean consistentes entre sí, y describe el flujo para generar mockups
de referencia con IA antes de construir cada pantalla en código.

---

## 1. Stack tecnológico confirmado

| Capa | Elección | Estado |
|---|---|---|
| Framework | React 19.2 + TypeScript | Instalado |
| Build | Vite 8 | Instalado |
| Estilos | Tailwind CSS **v3.4** (fijado, no v4, para evitar el binario nativo `oxide`) | Instalado |
| Datos remotos | TanStack Query | Pendiente (F1) |
| Enrutado | React Router con rutas por rol | Pendiente (F1) |
| Gráficas | Recharts | Definido en `07-modulos-frontend.md` §F5 |
| Formularios | Sin decidir | Ver §4 |
| Componentes UI | Sin decidir | Ver §4 |

Cualquier librería nueva debe ser compatible con **Tailwind v3** (no v4) y
**React 19** simultáneamente — no todas las librerías de componentes lo
garantizan todavía.

---

## 2. Principios de línea gráfica

Derivados de los "Criterios transversales de calidad" de `07-modulos-frontend.md`:

1. **Contraste y claridad antes que expresividad.** Sin manual de marca, la
   paleta debe ser neutra (grises + un color de acento) y priorizar
   legibilidad sobre personalidad visual.
2. **El semáforo nunca es solo color.** Todo indicador de semáforo (verde/
   amarillo/rojo) lleva etiqueta de texto siempre visible. Es un requisito de
   accesibilidad (daltonismo, lectores de pantalla), no una preferencia.
3. **Ninguna pantalla se congela sin feedback.** Toda operación asíncrona
   muestra esqueleto de carga, spinner en botón, o indicador de progreso.
4. **Estados completos por vista:** carga, vacío, error y éxito — para las 8
   pantallas, no solo el camino feliz.
5. **Errores accionables en español**, nunca un código HTTP crudo.
6. **Confirmación explícita** en acciones irreversibles (cierre de lead, baja
   de usuario).
7. **Responsive real:** móvil, tableta y escritorio — la vista de listado de
   leads (F3) es la más usada a diario y define el estándar de densidad de
   información.
8. **Interfaz 100% en español**, incluyendo formatos: fecha `DD/MM/AAAA
   HH:mm`, moneda USD con separador de miles.

### 2.1 Skills de diseño instaladas

Para mantener el mismo criterio de craft en las pantallas que faltan (F6-F8)
y en el desarrollo general, este repo tiene instaladas 10 skills de Claude
Code. Lista completa, comando de instalación por skill y en qué caso debe
usarla el agente: ver `docs/10-skills-agente-frontend.md`. Procedencia y
criterio de selección de cada una en
`.claude/skills/_shared/ui-skills-sources.md`.

---

## 3. Paleta y tipografía — SUPERADA por "Propuesta B" (2026-08-28)

> **Estado:** la paleta blanco/negro de esta sección queda **reemplazada**
> como línea gráfica base del proyecto — decisión de producto explícita
> (2026-08-28), no una preferencia técnica. La nueva línea base es "Propuesta
> B — empresarial premium" (`frontend/src/temas/variante-empresarial/` en la
> rama `dev-front`, catálogo de referencia en `/temas/empresarial` y
> `/temas/empresarial/demo`): paleta índigo (`--indigo #1E2A5E`,
> `--indigo-2 #14204A`), fondo papel (`--papel #F6F1E7`), acentos categóricos
> (`--cat-1..4`), tipografía `Fraunces` (headline) + `Source Sans 3` (body).
> Incluye secuencia de arranque obligatoria: sello de boot (`SelloBootLoader`)
> + splash de bienvenida (`WelcomeSplashLoader`) mostrando el scope de la
> sesión — nombre de empresa en sesión `company`, texto de holding en sesión
> `holding`. Contrato completo de implementación:
> `docs/blocks/d0-visualizacion-multitenant.md` y el work unit de adopción de
> tema (rama dedicada, ver Engram si existe ciclo SDD asociado).
>
> El propio código de origen (`tema-empresarial.css`,
> `frontend/src/temas/README.md`) documentaba esta dirección como
> "exploratoria, no adoptada" hasta esta decisión — queda registrado acá que
> la aprobación ocurrió explícitamente en este punto, no por adopción
> silenciosa de código de demo.
>
> La sección de abajo (paleta blanco/negro, `docs/mockups/propuesta-visual.html`)
> se conserva como registro histórico de la línea gráfica anterior, ya no
> vigente.

Paleta histórica (dos colores base mientras no había manual de marca — blanco y
negro — más los tres colores fijos del semáforo, que quedaban **fuera** de esa
paleta y nunca se usaban de forma decorativa):

| Uso | Color | Notas |
|---|---|---|
| Fondo / superficie | `#FFFFFF` | Fondo dominante en páginas, cards y cuerpo de tabla |
| Acento estructural | `#111113` (negro) | Reservado a navegación/estructura: borde + estado activo del sidebar, regla del encabezado de tabla, botón principal. Nunca como panel sólido grande — el sidebar comparte fondo con el canvas, el negro es un acento preciso, no un bloque de color |
| Texto principal | `#18181B` | Sobre fondo blanco |
| Gris neutro (bordes, superficies secundarias) | `#E8E8E8` / `#F5F5F5` | Sin tinte de color |
| Serie de gráficas (categórica) | `#DB2777` `#2563EB` `#0D9488` `#7C3AED` `#0891B2` | 5 tonos en este orden fijo (magenta, azul, teal, violeta, cian) — orden 1..N asignado en secuencia, nunca ciclado. Corrección técnica de la paleta original de 4 tonos (`#4F46E5 #2563EB #0D9488 #7C3AED`): validada con `dataviz/scripts/validate_palette.js`, el par adyacente azul-índigo fallaba el piso de daltonismo (ΔE 2.8 deutan) y el piso de visión normal (ΔE 6.7, por debajo de 15) — indistinguibles incluso sin daltonismo. Esta paleta corregida pasa los 5 checks contra la superficie clara `#FFFFFF` (peor par adyacente: ΔE 15.0 deutan, ΔE 22.6 visión normal). Sin validar contra modo oscuro: el proyecto no tiene superficie oscura aprobada ni `ThemeProvider` activo (F1-F4), `darkMode: ["class"]` en `tailwind.config.js` es boilerplate de shadcn sin uso. Ninguno pisa los colores de semáforo (verde/ámbar/rojo quedan fuera de la familia cromática usada acá) |
| Semáforo — Frío | `#16A34A` + etiqueta de texto | Nunca solo el chip |
| Semáforo — Tibio | `#D97706` + etiqueta de texto | |
| Semáforo — Caliente | `#DC2626` + etiqueta de texto | |

Tipografía: Montserrat en toda la interfaz (headline y body), tamaño base 13-16px
según densidad de la vista, escala corta para no fragmentar la jerarquía
entre las 8 pantallas. Roundness moderado (8px).

Ver también §2.1 (skills de diseño instaladas) para seguir tomando estas
decisiones con el mismo criterio en las pantallas que faltan.

---

## 4. Librerías candidatas para las interfaces

Comparadas contra el requisito real: Tailwind v3 + React 19 + TypeScript, sin
manual de marca, con necesidad de tabla densa (F3), formularios dinámicos
(F4), y campana de notificaciones (F6).

| Librería | Qué resuelve | Compatibilidad verificada | Trade-off |
|---|---|---|---|
| **shadcn/ui** (CLI legacy `v3.shadcn.com`, no `@canary`) | Componentes base (diálogo, dropdown, tabs, toast) copiados al repo, sobre Radix + Tailwind | Confirmado: la CLI v3 sigue soportando Tailwind v3 + React 18/19 en paralelo a la rama v4 | No es un paquete instalado — el código vive en el repo, hay que mantenerlo |
| **Radix UI Primitives** | Accesibilidad (foco, teclado, ARIA) para menús, diálogos, tooltips | Ya es la base de shadcn/ui | Sin estilos propios, requiere Tailwind encima (ya lo tenemos) |
| **TanStack Table** | Tabla de leads (F3): columnas dinámicas por rol, orden, paginación server-side | Misma familia que TanStack Query, ya elegido | Headless, hay que maquetar filas con Tailwind |
| **React Hook Form + Zod** | Formularios dinámicos de campaña (F4) y de bridges (F8); Zod ya se usa en el backend, mismo esquema se puede compartir tipos | Estándar de facto en React 19 | Ninguno relevante |
| **lucide-react** | Set de iconos consistente (semáforo, campana, SLA) | Compatible React 19 | Ninguno relevante |
| **Recharts** | Gráficas del dashboard (F5) | Ya decidido en `07-modulos-frontend.md` | Ninguno relevante |

Recomendación: **shadcn/ui + Radix + Tailwind v3** como base de componentes,
por ser código propio (no dependencia externa que fuerce versión de Tailwind),
más TanStack Table para F3 y React Hook Form + Zod para F4/F7/F8.

---

## 5. Requerimientos gráficos por módulo

| Módulo | Pantalla | Elementos gráficos clave |
|---|---|---|
| F1 | Layout base | Barra lateral colapsable, encabezado con campana, breakpoints móvil/tableta/escritorio |
| F2 | Login / Perfil | Formulario centrado, estado de error de credenciales, cambio de contraseña |
| F3 | Listado de leads | Tabla densa, chip de semáforo + texto, contador SLA `HH:MM:SS` en vivo, filtros combinables, badge de reingreso |
| F4 | Detalle de lead | Encabezado con estado, formulario dinámico por etapa, panel de citas, selector de cambio de etapa |
| F5 | Dashboard | Tarjetas KPI, 4 tipos de gráfica (barras, embudo, barras apiladas), selector de rango de fechas |
| F6 | Notificaciones | Campana con contador, panel desplegable, toast de aviso en tiempo real |
| F7 | Usuarios | Tabla con carga activa, formulario alta/edición, confirmación de baja lógica |
| F8 | Bridges | Tabla de estado, formulario de token (campo siempre vacío), bitácora de errores filtrable |

Estas 8 pantallas son el set mínimo a maquetar en Stitch AI antes de
implementar cada módulo en código.

---

## 6. Flujo de mockups con Stitch AI

Vigente solo mientras queden pantallas de la tabla §5 sin mockup (ver TODO en
§7). Stitch AI (Google Labs, MCP conectado desde Claude Code) genera mockups
visuales a partir de prompts de texto/imagen.

Proyecto reutilizable para las pantallas pendientes: `CRM Comercial -
Propuesta Visual`, `projectId 8669152245244265576`, sistema de diseño
`assets/15350993658645954285`. Las pantallas complejas (listado de leads,
detalle de lead, dashboard) dieron timeout sistemático — no depende del
prompt ni de la paleta, es un límite de capacidad del backend de Stitch. Al
reintentar F1/F6/F7/F8, esperar el mismo comportamiento y usar como plan B el
patrón de wireframe HTML de alta fidelidad de
`docs/mockups/propuesta-visual.html`.

Plantilla de prompt por pantalla pendiente:

```
Pantalla: <nombre de la pantalla>
Contexto: CRM de gestión comercial de leads, interfaz en español, web
  responsive (móvil/tableta/escritorio).
Paleta: blanco (fondo dominante) + negro (acento estructural: navegación,
  encabezado de tabla, botón principal — nunca un panel sólido grande);
  semáforo verde/ámbar/rojo con etiqueta de texto obligatoria junto al color.
Elementos obligatorios: <lista de la columna "Elementos gráficos clave">
Restricciones: sin bloqueo de interfaz (mostrar estado de carga), estados de
  error accionables en español, formato de fecha DD/MM/AAAA HH:mm.
```

---

## 7. Estado y próximos pasos

- [x] Confirmar esta guía con el cliente/diseño — **aprobada**, ver §3.
- [x] Generar mockups de referencia — 4 de 8 (F2 Login, F3 Listado de leads,
      F4 Detalle de lead, F5 Dashboard) en
      [`docs/mockups/propuesta-visual.html`](mockups/propuesta-visual.html).
- [ ] Generar los 4 mockups restantes en Stitch (F1 Layout base, F6
      Notificaciones, F7 Usuarios, F8 Bridges) reutilizando
      `projectId 8669152245244265576` / `assets/15350993658645954285`. Esperar
      timeouts en pantallas complejas (ver §6) y tener listo el patrón de
      wireframe HTML como plan B.
- [x] Instalar shadcn/ui (CLI legacy `3.8.5`, fijado por incompatibilidad
      de `@latest`/v4 con Tailwind v3.4 de este repo) + React Router +
      TanStack Query + React Hook Form + Zod + lucide-react + sonner +
      date-fns, como parte de F1. **Pendiente:** `@tanstack/react-table` se
      agrega cuando arranque F3.
- [x] Definir la paleta categórica final de Recharts junto con F5 — resuelta
      en §3 (`#DB2777 #2563EB #0D9488 #7C3AED #0891B2`, corregida y validada
      con la skill de dataviz; el punto de partida original de 4 tonos
      fallaba la validación de daltonismo).
- [x] Con la línea gráfica aprobada, arrancar el desarrollo general del
      frontend — F1 completo, ver `docs/07-modulos-frontend.md`.
