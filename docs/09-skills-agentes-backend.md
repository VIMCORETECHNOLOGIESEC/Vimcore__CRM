# 09 — Skills de agentes de IA para el backend

Este documento define qué skills de Claude Code están habilitadas para trabajo
en `backend/**`, con qué comando se instalan y en qué caso concreto el agente
debe decidir usarlas. Es el detalle de la regla general fijada en `AGENTS.md`
§9 — leé esa sección primero.

Alcance: solo backend (Express + Prisma + Zod + `jose`). Skills de frontend
(React/Next.js) no entran acá — le corresponden a la sesión `dev-front`.

---

## 1. Criterio de admisión

Antes de proponer una skill nueva para esta lista, tiene que pasar la misma
barra de confianza que una dependencia de npm (AGENTS.md §2.1 — cadena de
suministro):

- **Procedencia verificable**: repositorio real con autor/organización
  identificable, licencia explícita y contenido que se puede leer completo
  antes de instalar. Vale un vendor oficial (ej. Prisma) o un repo de GitHub
  inspeccionable.
- **Se descarta un agregador sin procedencia clara**: sitios que listan
  decenas de variaciones casi idénticas del mismo tema sin autor
  identificable ni repo verificable (mcpmarket.com mostró 10+ listados
  duplicados de "Express API" y de "Zod validation" sin firma de mantenedor)
  son la misma señal de alerta que un paquete typosquatted — no se instalan.
- **Coincidencia real de stack**: la skill tiene que apuntar a la versión
  exacta de la librería que usa este proyecto, no a un stack adyacente
  (Spring Boot, `jsonwebtoken` npm vs. `jose`, etc.) sin nota del desvío.

## 2. Skills habilitadas

| Skill | Fuente | Instalación | Cuándo debe usarla el agente |
|---|---|---|---|
| **Prisma skills** | Oficial (`prisma.io`) | `skills add prisma/skills` | Al diseñar o modificar `schema.prisma`, escribir una migración, o construir queries/transacciones con `PrismaClientOrTransaction`. Aplica directo a cualquier tabla nueva (ej. `leads_recibidos` de M4) y a los patrones raw SQL tipo `ON CONFLICT ... RETURNING *, (xmax = 0)` ya usados en M3. |
| **`anivar/zod-skill`** | GitHub, MIT, 20★, target Zod v4 explícito | `npx skills add anivar/zod-skill` (o equivalente `pnpm dlx`, ver AGENTS.md §2.1 — nunca `npx` directo) | Al escribir o revisar cualquier schema Zod en el borde de un controller (obligatorio por AGENTS.md §4). Prioridad alta en M4: validar el payload crudo de `LeadEntrante` antes de que llegue a `deduplicarLead`. |
| **`jsonwebtoken/jwt-skills`** | GitHub, Apache 2.0, respaldo Okta, 14★ | `npx skills add jsonwebtoken/jwt-skills` (ver nota de `pnpm dlx` arriba) | **Solo para auditoría/debug**, nunca para generar código de emisión de JWT nuevo — ver advertencia abajo. Usar durante un `security-review` del módulo de auth (`auth.service.ts`, `refresh-token.repository.ts`), o para decodificar/inspeccionar un token real durante troubleshooting. |

### Advertencia — `jsonwebtoken/jwt-skills`

Los tres sub-skills (`jwt-decode`, `jwt-encode`, `jwt-validate`) ejemplifican
con la API del paquete npm `jsonwebtoken`. Este proyecto usa **`jose`**
(ver M2, ya implementado) — son librerías distintas. Los principios de
seguridad que enseña la skill (rechazar `alg: none`, prevenir confusión de
algoritmo, validar `exp`/claims, JWKS) aplican igual sin importar la
librería, pero el código de ejemplo no es el que corre en este repo. El
agente debe traducir el principio, nunca copiar el snippet literal.

## 3. Skills evaluadas y descartadas

Documentado para no repetir la evaluación en el futuro (regla de AGENTS.md
§3, punto 2 — no se inventan requisitos ni se resuelven hallazgos en silencio):

| Skill evaluada | Motivo de descarte |
|---|---|
| mcpmarket — Express API Development | Agregador sin procedencia verificable; 10+ listados duplicados del mismo tema sin autor identificable. |
| mcpmarket — Zod Schema Validation | Mismo problema de procedencia; reemplazada por `anivar/zod-skill`, que sí es auditable. |
| `explainx.ai/skills/tag/jwt` | No es una skill instalable, es una página de índice. 6 de 8 resultados son herramientas de pentesting ofensivo (bypass de firma, inyección de `kid`), fuera del alcance de desarrollo; 1 es específica de Spring Boot (stack equivocado). |
| `vercel/react-best-practices` | 100% frontend (React/Next.js). Fuera del alcance de este documento — propuesta separada para `dev-front` si se quiere. |

## 4. Referencia

Regla general y gobernanza en `AGENTS.md` §9. Este documento se actualiza
cada vez que se evalúa una skill nueva para backend, apruebe o no la barra
de admisión de la sección 1.
