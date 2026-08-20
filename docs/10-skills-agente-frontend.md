# 10 — Skills de agente IA para el frontend

Documento de apoyo, separado de `docs/07-modulos-frontend.md` (que solo
documenta el avance del proyecto). Acá vive la lista de skills de Claude
Code Skills instaladas para el desarrollo de las 8 pantallas (F1-F8), el
comando para descargar cada una, y en qué caso debe usarlas el agente.

Si el desarrollo de este frontend se hace con un agente de IA compatible con
Claude Code Skills, instalá estas 12 skills en `.claude/skills/` para
mantener el mismo criterio de craft, accesibilidad y rendimiento en las 8
pantallas. Se cargan solas cuando la tarea del agente calza con su trigger
(ver `.atl/skill-registry.md`); no hace falta invocarlas a mano.

---

## Instalación general

9 de las 10 vienen del registro comunitario
[ui-skills.com](https://www.ui-skills.com/) (MIT, código en GitHub), vía su
CLI oficial:

```bash
npx ui-skills get <slug>            # imprime el SKILL.md en stdout
mkdir -p .claude/skills/<slug>
npx ui-skills get <slug> > .claude/skills/<slug>/SKILL.md
gentle-ai skill-registry refresh --force   # reindexa .atl/skill-registry.md
```

La excepción es `accessibility` (ver tabla), que se descarga directo del
repo de su autor porque no está en el registro de ui-skills.com.

Procedencia completa y criterio de selección de cada una:
`.claude/skills/_shared/ui-skills-sources.md`.

Las dos últimas de la tabla (`transitions-dev`/`transitions-polish`) son una
segunda excepción: vienen de
[github.com/Jakubantalik/transitions.dev](https://github.com/Jakubantalik/transitions.dev)
(2.8k★, no está en el registro de ui-skills.com), instaladas vía su propio
CLI, que además fija la fuente/hash en `skills-lock.json` (raíz del repo):

```bash
npx skills add Jakubantalik/transitions.dev
```

El instalador crea el contenido real en `.agents/skills/<slug>/` y un enlace
simbólico desde `.claude/skills/<slug>/` — en este repo (Windows,
`core.symlinks=false`) ese symlink no sobrevive un commit real (git lo
guardaría como un archivo de texto con una ruta absoluta, roto en cualquier
otro checkout o dentro de Docker). Por eso lo versionado en `.claude/skills/`
es una **copia real** de esos dos directorios, no el symlink que deja el
instalador — mismo patrón que el resto de las skills de esta tabla.

---

## Lista de skills

| Skill | Instalación | Cuándo debe usarla el agente |
|---|---|---|
| `interface-design` | `npx ui-skills get interface-design` | Al diseñar o revisar cualquier pantalla nueva — craft-first para dashboards/admin/SaaS, la categoría de este CRM. |
| `better-layout` | `npx ui-skills get better-layout` | Al estructurar toolbars, tablas y formularios: agrupación, alineación, orden de lectura, breakpoints. |
| `baseline-ui` | `npx ui-skills get baseline-ui` | Pasada rápida anti-slop antes de dar una pantalla por terminada: un acento por vista, primitivas accesibles. |
| `shadcn` | `npx ui-skills get shadcn` | Al instalar, buscar o componer componentes shadcn/ui (base de componentes decidida en `docs/09` §4), desde F1 en adelante. |
| `fixing-accessibility` | `npx ui-skills get fixing-accessibility` | Al auditar formularios y controles interactivos antes de cerrar F4 (detalle de lead), F7 (usuarios) o F8 (bridges). |
| `better-accessibility` | `npx ui-skills get better-accessibility` | Revisión de componentes con foco, teclado y ARIA durante el desarrollo diario — complementa a `fixing-accessibility`. |
| `react-router-framework-mode` | `npx ui-skills get react-router-framework-mode` | Al implementar el enrutado con rutas protegidas por rol (F1, pendiente: loaders, actions, patrones de ruta). |
| `harden` | `npx ui-skills get harden` | Al cerrar cada pantalla — estados de carga, vacío y error, no solo el camino feliz (ver "Criterios transversales de calidad" en `docs/07`). |
| `vercel-react-best-practices` | `npx ui-skills get react-best-practices > .claude/skills/vercel-react-best-practices/SKILL.md` (el slug del CLI es `react-best-practices`; el `name` interno de la skill es `vercel-react-best-practices` — la carpeta usa este último) | Al implementar data fetching con TanStack Query, la tabla densa de F3, o el contador de SLA en vivo (rendimiento, re-render, bundle). La categoría "server-side" no aplica — este repo es Vite, no Next.js. |
| `accessibility` | `curl -fsSL https://raw.githubusercontent.com/addyosmani/web-quality-skills/HEAD/skills/accessibility/SKILL.md -o .claude/skills/accessibility/SKILL.md` | Auditoría formal WCAG 2.2 (POUR, niveles A/AA/AAA, protocolo de testing con Lighthouse/axe-core). Usarla en particular para verificar la regla "el semáforo nunca es solo color" (Criterios transversales de calidad, `docs/07`). |
| `transitions-dev` | `npx skills add Jakubantalik/transitions.dev` | Al agregar o modificar una transición puntual (modal, dropdown, toast, tooltip, skeleton loader, badge, acordeón, etc.) — 27 patrones CSS listos, namespaced `t-*`, cada uno con guarda `prefers-reduced-motion` ya integrada (mismo requisito que exige `better-accessibility` §10). Sin dependencia de framework — copiar/pegar el snippet documentado. |
| `transitions-polish` | (mismo comando, instala ambas skills juntas) | Add-on de `transitions-dev`: para AJUSTAR motion que ya existe (duración, distancia, escala, blur, easing) contra la escala de tokens de la librería, nunca para agregar transiciones nuevas. Usarla al revisar timing/easing que "se siente raro" o al auditar animaciones ad hoc antes de tokenizarlas. |
