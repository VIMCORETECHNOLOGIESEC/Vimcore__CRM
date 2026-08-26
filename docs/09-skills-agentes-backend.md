# 09 — Skills de agentes de IA para el backend

> **Estado:** vigente. Inventario regenerado desde `.claude/skills/` y
> `.agents/skills/` reales en este repositorio (rama `test/gpt`, commit
> `e70b3a4`, 2026-08-25). Reemplaza la versión anterior, que declaraba skills
> de Prisma/Zod/JWT inexistentes con comandos de instalación incompatibles
> con pnpm.

Ninguna skill instalada es específica de Prisma, Zod o `jose`. El inventario
siguiente lista las skills reales instaladas en el repo que aplican a trabajo
de `backend/**` (Express + Prisma + Zod + `jose`), excluyendo las de diseño
visual/motion de frontend. Gobernanza general en `AGENTS.md` §9.

## 1. Instaladas en `.claude/skills/` (aplicables a backend)

| Skill | Ruta | Disparador |
|---|---|---|
| `branch-pr` | `.claude/skills/branch-pr/` | Crear/preparar PRs con verificación de issue |
| `chained-pr` | `.claude/skills/chained-pr/` | PRs de más de 400 líneas, PRs encadenados |
| `cognitive-doc-design` | `.claude/skills/cognitive-doc-design/` | Escribir guías, READMEs, RFCs, docs de arquitectura |
| `comment-writer` | `.claude/skills/comment-writer/` | Comentarios de PR, respuestas a issues, reviews |
| `harden` | `.claude/skills/harden/` | Estados de error, casos borde, resiliencia de producción |
| `issue-creation` | `.claude/skills/issue-creation/` | Crear/triage de issues de GitHub desde evidencia del repo |
| `judgment-day` | `.claude/skills/judgment-day/` | Revisión dual ciega adversarial |
| `rdd-defect-workflow` | `.claude/skills/rdd-defect-workflow/` | Autoridad de revisión, receipt/lineage, corrección/recuperación |
| `sdd-apply` a `sdd-verify` (9 skills) | `.claude/skills/sdd-*/` | Ciclo completo SDD (explore/propose/spec/design/tasks/apply/verify/archive/onboard) |
| `skill-creator` | `.claude/skills/skill-creator/` | Crear una skill nueva con frontmatter válido |
| `skill-improver` | `.claude/skills/skill-improver/` | Auditar/mejorar una skill existente |
| `skill-registry` | `.claude/skills/skill-registry/` | Reindexar el registro tras cambios de skills |
| `systemic-issue-triage` | `.claude/skills/systemic-issue-triage/` | Atacar issues por causa raíz, no una por una |
| `work-unit-commits` | `.claude/skills/work-unit-commits/` | Planificar commits como unidades de trabajo revisables |

## 2. Excluidas de este inventario (frontend/no aplicables aquí)

`accessibility`, `baseline-ui`, `better-accessibility`, `better-layout`,
`fixing-accessibility`, `interface-design`, `react-router-framework-mode`,
`shadcn`, `transitions-dev`, `transitions-polish`,
`vercel-react-best-practices` — ver `docs/10-skills-agente-frontend.md`.
`gentle-ai-bench` y `go-testing` apuntan al tooling de `gentle-ai` en sí, no
a este repositorio. `_shared` no es invocable directamente.

## 3. Instaladas en `.agents/skills/`

Solo `transitions-dev` y `transitions-polish` (frontend, motion) — ninguna
aplica a `backend/**`.

## 4. Skills de dominio pendientes (no instaladas)

Ninguna skill de Prisma, Zod ni `jose` está instalada hoy en este repo. Antes
de instalar una, debe pasar el criterio de admisión de `AGENTS.md` §2.1
(cadena de suministro): procedencia verificable, sin agregador sin
mantenedor identificable, y coincidencia exacta con la librería y versión
real del proyecto (`jose`, no `jsonwebtoken`).

## 5. Referencia

Regla general y gobernanza en `AGENTS.md` §9. Este documento se actualiza
cada vez que cambia el inventario real de `.claude/skills/` o
`.agents/skills/`.
