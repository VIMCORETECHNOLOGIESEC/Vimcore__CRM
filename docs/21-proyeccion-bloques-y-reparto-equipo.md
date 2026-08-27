# 21 — Proyección de bloques y reparto de trabajo entre 3 desarrolladores

> **Estado:** vigente — snapshot ejecutivo para coordinar desarrollo
> simultáneo. No reemplaza `docs/00`, `docs/16` ni `docs/blocks/*`; ante
> cualquier discrepancia futura, esos documentos mandan.
>
> **Verificado contra:** rama `test/gpt`, commit `b2bb4c5`, 2026-08-27.

## 1. Estado real de bloques

| Bloque | Estado | Detalle |
|---|---|---|
| A — Hardening single-company | ✅ Cerrado | Sin trabajo pendiente (fuera de LinkedIn/X, ver §2) |
| B — Fundación tenant (`Empresa`/`Membresia`) | ✅ Cerrado (2026-08-26) | Modelos en `schema.prisma`, comparador en sombra activo, andamiaje de `habilitadoParaVenta` listo |
| C — Aislamiento efectivo (RLS) | ⏳ En progreso — Etapa 3 a medio camino | Grupos 0/1/2/3/5 completos (RLS real, rol `crm_app`, CAS optimista en asignación). **Grupos 4 y 6 pendientes** — ver §2 |
| D — Routing/Oportunidad | ⛔ Borrador TO-BE | Requiere C cerrado |
| E — Dashboards/reporting real | ⛔ Borrador TO-BE | Requiere D cerrado |
| F — Retiro legacy | ⛔ Borrador TO-BE | Requiere B–E cerrados |

## 2. Puntos faltantes concretos

**Frontera activa — Bloque C, retomar primero:**

- Grupo 4: notificación a usuario/supervisor al agotar el CAS de
  asignación. Chico, depende del Grupo 3 (ya cerrado).
- Grupo 6: suite adversarial cross-holding (read/write/HTTP/side-channels).
  Gate de aceptación final de la etapa; hoy solo existe
  `rls-policy-coverage.test.ts`.
- Contexto completo para retomar desde otra sesión/equipo: Engram, project
  `crm_comercial`, `sdd/bloque-c-etapa3-rls-adversarial/{apply-progress,
  tasks,design,spec}`.

**Deuda de código actual (no bloqueada por el roadmap, se puede paralelizar):**

- `frontend/src/funcionalidades/leads/leads.api.ts::mapLeadFromApi` fija
  `correoPrincipal` y `campania` en `null` — el backend ya resuelve
  `campaniaId`/`cuentaPublicitariaId` reales (Bloque A, WU4); falta
  consumirlos en frontend.
- Contrato de cierre: `docs/02`/`docs/04` piden fecha/observaciones de
  Venta que el servicio no acepta (`cerradoEn` lo fija el servidor).
- M6 (`asignacion.service.ts`): falta exigir `asesor_id` antes de entregar
  el lead a vendedor.
- F3/F4: falta guard de edición local en `LeadTimeline`/
  `FormularioEtapaLead` y redirección ante 403 en `LeadDetallePage`.

**Fuera de alcance / adaptadores pendientes:**

- LinkedIn/X: `backend/src/adapters/` solo tiene `meta.adapter.ts` y
  `google-forms.adapter.ts`.

**Corrección a un hallazgo reportado antes:** el autoservicio de cambio de
contraseña para roles no-admin **ya está implementado**
(`frontend/src/funcionalidades/autenticacion/PerfilPage.tsx` +
`changePasswordApi`) — se había señalado como faltante por analizar el
worktree `dev-front`, desactualizado respecto a `test/gpt`. Descartar ese
punto.

## 3. Archivos de alto riesgo — congelar o coordinar entre los 3 devs

| Archivo | Motivo |
|---|---|
| `backend/prisma/schema.prisma` | Único archivo; cada bloque nuevo le agrega modelos → conflicto de migración si se toca en paralelo |
| `backend/src/lib/event-broker.ts` | Hub SSE transversal, 24 símbolos dependientes de `publish` |
| `backend/src/services/leads.access.ts` | Autoridad `canEdit`/`canTransfer`, reescrita tanto por C como por D |
| `backend/src/lib/jwt.ts` + middlewares de rol | Transversal a toda ruta protegida; 17 archivos backend siguen referenciando `RolUsuario` (retiro real es Bloque F) |
| `frontend/src/api/httpClient.ts` | Cliente HTTP único, 8 módulos de negocio dependen directo |
| `frontend/src/router.tsx` + `frontend/src/layouts/navigation.ts` | Edición obligatoria por cada módulo nuevo → colisión de merge frecuente aunque trivial |

## 4. Reparto propuesto — 3 líneas de trabajo paralelas

- **Dev 1 (senior, dueño de schema/autorización):** cerrar Bloque C
  (Grupos 4 y 6), luego arrancar Bloque D. Único que toca `schema.prisma`,
  `event-broker.ts`, `leads.access.ts` y el módulo de auth/roles.
- **Dev 2 (frontend):** gaps F3/F4 no bloqueados por el roadmap —
  `mapLeadFromApi`, guard de edición, redirección 403. No tocar el tipo
  `Lead` en profundidad hasta que Bloque D separe Lead/Oportunidad; puede
  adelantar mocks desconectados de Bloque E sin integrarlos a `router.tsx`.
- **Dev 3:** adaptadores LinkedIn/X (patrón `meta.adapter.ts`) + Lote 4 de
  QA (`docs/00` — fixtures/seeds reproducibles, hoy "no confiable"). Sin
  overlap real con Dev 1/2.

**Coordinación obligatoria:** avisar antes de mergear cualquier cambio a
`router.tsx`/`navigation.ts`; no iniciar Bloque D o E con un segundo dev
mientras Bloque C siga abierto — las estructuras de datos que necesitan
todavía no existen.

## 5. Cambios de documentación de esta entrega

- Se agrega este documento (`docs/21-proyeccion-bloques-y-reparto-equipo.md`).
- Se incorpora `docs/20-graphify-context-graph.md` (guía operativa de
  Graphify: instalación, extracción y regla de actualización manual por
  worktree), generado antes pero sin commitear.
- Se corrige, en la sección 2, un hallazgo emitido fuera de este repo que
  reportaba Bloque B como no implementado — error de análisis contra el
  worktree `dev-front`, desactualizado respecto a `test/gpt`.
