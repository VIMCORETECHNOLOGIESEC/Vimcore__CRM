# Línea visual — CRM Multi-Tenant (decisión 2026-08-26)

> Reemplaza el intento anterior basado en Stitch (descartado y borrado de
> `docs/mockups/`). De las 3 propuestas exploradas inicialmente, el usuario
> decidió avanzar en desarrollo con **Propuesta B (empresarial)** y
> **Propuesta C (moderna)**. La Propuesta A ("Sala de control monocromática")
> queda descartada como dirección de desarrollo y se retiró de este repo.

Los dos prototipos son HTML/CSS/JS autocontenidos, sin build, construidos a
partir del funcionamiento real del sistema (frontend actual,
`docs/09-linea-grafica-frontend.md`) y del TO-BE de escalado multi-tenant
resuelto en `docs/14-evolucion-multitenant.md` §6 y
`docs/16-hallazgos-y-preguntas.md` §8 (D1: el holding es el tenant, con
empresas internas; un usuario puede tener membresía en más de una empresa).

**Importante — esto no es un cierre de diseño.** Las dos estructuras están
bien fundamentadas, pero el usuario pidió explícitamente evitar que la
siguiente pasada de retoque visual quede monótona/repetitiva (misma card × N,
mismo panel × N). La sección "Línea visual a seguir" de cada propuesta separa
qué es identidad fija de la dirección de qué queda abierto a variarse. El
detalle completo y versionable para agentes futuros vive en
`.interface-design/system.md` (skill `interface-design`) — este documento es
el resumen de contexto de negocio; ese archivo es la fuente de verdad de
diseño.

## Cómo abrirlas

Cada archivo es standalone (Tailwind vía CDN + Google Fonts en B, sin
dependencias de build). Abrí directamente en el navegador:

- `assets/propuesta-b-empresarial.html`
- `assets/propuesta-c-moderna.html`

Cada uno navega solo, con clicks reales: boot → login → selección de empresa
(paso nuevo TO-BE) → dashboard (skeleton → cargado) → kanban de leads. Un
botón "Simular cambio en vivo" en el kanban dispara el pulso/glow de semáforo.
Para saltar directo a una pantalla durante QA, agregá `#login`, `#empresa`,
`#app` o `#kanban` a la URL del archivo.

## Hechos de negocio compartidos por ambas (fijos, no son parte del retoque visual)

- **Sidebar** (240px desktop): Dashboard → Leads → Usuarios (solo admin) →
  Bridges (solo admin). Ítem activo con borde izquierdo + tinte, sin buscador.
- **Header** (56px): hamburguesa solo mobile, campana de notificaciones,
  dropdown de usuario (avatar iniciales, nombre, correo, "Mi perfil", "Cerrar
  sesión").
- **Login**: card centrada, "CRM Embudo de Leads", Correo + Contraseña,
  "Iniciar sesión" → "Ingresando…". Sin recordarme, sin social, sin registro.
- **Selección de empresa — TO-BE, etiquetada explícitamente como tal en
  ambas**: paso nuevo, justificado por `docs/14` §6 (un usuario puede tener
  membresía en más de una empresa dentro del holding). Es solo contexto de
  navegación — nunca un control de seguridad, eso lo valida el backend.
- **Dashboard**, mismo orden en ambas: FiltroRangoFechas (Hoy/7d/30d/Mes
  actual/Mes anterior/Personalizado) → DashboardFiltros (Red social, Campaña,
  Responsable —solo admin/supervisor—) → 7 KPI cards → 6 gráficos.
- **7 KPIs**: Total de leads ingresados, Leads en gestión, Leads cerrados,
  Tasa de conversión, Tiempo prom. de primera respuesta, Tiempo prom. de
  cierre (Venta), Cumplimiento de SLA.
- **6 gráficos**, mismo orden: Leads por red social, Leads por asesor (solo
  admin/supervisor), Embudo por etapa (Nuevo→Contactado→Cita→Venta, con "No
  Venta" siempre aparte, nunca un quinto paso del embudo), Leads por campaña,
  Red social × semáforo, Distribución por semáforo (dona, excluye
  Venta/No Venta).
- **Semáforo**, siempre color + etiqueta de texto: Verde `#16A34A` "Lead
  caliente", Amarillo `#D97706` "Lead tibio", Rojo `#DC2626` "Lead frío", Sin
  calificar `#94A3B8`.
- **Paleta categórica de gráficos** (orden fijo): `#DB2777` `#2563EB`
  `#7C3AED` `#0891B2`.
- **Loading pattern**: skeleton `animate-pulse` en la forma real del
  contenido → error con "Reintentar" → vacío → contenido.
- Animación: solo `transform`/`opacity`, interacciones bajo 300ms con
  ease-out, nada nace desde `scale(0)`, ambas respetan
  `prefers-reduced-motion`.

## Propuesta B — Consejo directivo

`assets/propuesta-b-empresarial.html`

Empresarial premium: azul índigo profundo sobre papel cálido (`#F6F1E7`, ni
blanco puro ni negro). Tipografía Fraunces (headline serif con carácter) +
Source Sans 3 (cuerpo). Sombras suaves de una sola capa.

**Línea visual fija:** temperatura papel+índigo, el par tipográfico
serif/sans, KPI cards con pestaña de color en el borde izquierdo (nunca fondo
sólido), selector de empresa como sello/credencial cuadrada.

**Abierto a retoque** (para evitar que las 7 KPI cards / 6 gráficos / columnas
del kanban se sientan repetidas): tratamiento de la pestaña de color por
categoría de KPI, coreografía del boot (sello estampándose), peso/patrón de
los divisores tipo "regla de libro contable" del kanban, lenguaje de
iconografía (hoy no existe), ilustración de estados vacíos/error.

## Propuesta C — Torre de control nocturna

`assets/propuesta-c-moderna.html`

Moderna y futurista sin caer en el cliché de "casi negro + acento morado":
grafito cálido oscuro con paneles de vidrio esmerilado reales (`backdrop-filter:
blur` + capas translúcidas + reflejo especular superior). Acento azul acero
solo para navegación/foco — nunca para estado de negocio. El semáforo es la
única fuente de luz/glow real de toda la interfaz.

**Línea visual fija:** grafito (nunca negro puro), semáforo como única fuente
de glow, acero reservado a navegación/foco, construcción de vidrio con borde +
reflejo especular, contraste alto siempre verificado.

**Abierto a retoque** (para evitar que los paneles se sientan intercambiables):
variar intensidad/opacidad de vidrio por tipo de panel (sidebar vs. KPI vs.
gráficos), variar radio y tratamiento de borde entre tipos de componente,
coreografía del boot (barrido de luz + deslizamiento), timing de la
inclinación de perspectiva del selector de empresa, lenguaje de iconografía
(hoy no existe).

## Verificación

Ambas se renderizaron con `chromium --headless --screenshot` en boot, login,
selección de empresa, dashboard (skeleton y cargado) y kanban, confirmando
layout, contraste y que las animaciones disparan sin romper el flujo.

## Skills de diseño usadas (versionadas en `.claude/skills/`)

`frontend-design` → `interface-design` → `transitions-dev` /
`transitions-polish` → `baseline-ui` → `better-layout`, en ese orden, según
`.claude/CLAUDE.md` § "UI/UX Skill Stack". El detalle de tokens y patrones
persiste en `.interface-design/system.md` para que cualquier agente futuro
retome la dirección sin repetir la exploración de dominio.
