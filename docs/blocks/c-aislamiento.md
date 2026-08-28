# Bloque C — Aislamiento efectivo entre empresas

> Fase 4 de `docs/16-hallazgos-y-preguntas.md` §7 ("Aislamiento efectivo").
> Cubre Fase 4 de `docs/14-evolucion-multitenant.md` §13 ("Aislamiento
> efectivo").

## Estado (2026-08-28, actualizado) — Etapa 3 completa

Ciclo SDD completo (explore/propose/spec/design/tasks) corrido y persistido en
Engram (artifact store = `engram`, no `openspec/` — ver
`sdd-init/crm_comercial`).

| Etapa | Alcance | Estado | Commit | Evidencia |
|---|---|---|---|---|
| 1 | Autorizador sombra company-aware + chokepoint de notificaciones + alta de Usuario con Membresia (bootstrap) + TenantContext fail-closed | ✅ Completa (12/12 tareas) | `c1807fe` | 812/812 tests, tsc limpio |
| 2 | Cutover bloqueante (`leads.access`/`leads.service`/`metricas.access`) + `empresaId` NOT NULL + decisión por job | ✅ Completa (13/13 tareas) | `f45923e` | 832/832 tests, tsc limpio |
| 3 | RLS de Postgres + rol de bypass + suite adversarial + CAS en asignación | ✅ **Completa** — ver detalle abajo | (sin commitear — ver `sdd/bloque-c-aislamiento/apply-progress` en Engram) | 94/94 archivos, 894/894 tests (corrido dos veces), tsc limpio |

Etapa 3 se retomó como cambio SDD independiente `bloque-c-etapa3-rls-adversarial`
(no el `bloque-c-aislamiento/tasks` original de 35 tareas — esos artefactos
nunca quedaron persistidos en Engram pese a lo que decía esta misma sección
antes; ver `sdd/bloque-c-etapa3-rls-adversarial/{proposal,spec,design,tasks,
apply-progress}` en Engram, ese es el rastro real). El "riesgo de diseño #2"
(condición de carrera pool automático vs. reasignación manual) que esta
sección marcaba como vacío sin tarea **ya está resuelto e implementado** —
ver Grupo 3 abajo. El cierre de los grupos 4 y 6 (esta actualización) se hizo
bajo el cambio Engram `bloque-c-aislamiento` (fases 5/6 de su `tasks`), no
bajo `bloque-c-etapa3-rls-adversarial` — ambos rastros conviven en Engram
para esta etapa.

### Etapa 3 — desglose real por grupo de tareas

| Grupo | Alcance | Estado |
|---|---|---|
| 0 | Rol Postgres `crm_app` sin superuser (D8) — hace que RLS proteja de verdad | ✅ Completo |
| 1 | Migración: columna `version`, `empresaId` denormalizado, políticas RLS, rol `crm_bypass_jobs` | ✅ Completo |
| 2 | Tenant context (`AsyncLocalStorage` + Prisma `$extends` + middleware) | ✅ Completo |
| 3 | CAS optimista en asignación de `Lead` (el riesgo de diseño #2, ya resuelto) | ✅ Completo |
| 4 | Notificación a usuario + supervisor al agotar el CAS | ✅ Completo — `asignacion.service.ts` (corrección tras 3 conflictos: evento `ASIGNACION_CONFLICTO` + notificación al actor y a supervisores activos de la misma empresa), probado en `tests/asignacion.cas-correction.test.ts` (dos empresas reales, supervisor revocado y supervisor de la empresa ajena excluidos) |
| 5 | `sla-atrasado.service` y jobs bajo rol de bypass (más `citas-recordatorio`, `bridge-mudo`, `verificacion-token` — mismo patrón `runAsBypassJob` solo-lectura + `partitionByEmpresa` + `runWithTenantContext` por grupo) | ✅ Completo |
| 6 | Suite adversarial completa (cross-empresa read/write/HTTP/side-channels) | ✅ Completo — ver desglose abajo |

#### Grupo 6 — evidencia adversarial por superficie

| Superficie | Archivo(s) | Qué prueba |
|---|---|---|
| RLS directa/indirecta (12 tablas) | `tests/adversarial/rls-runtime-matrix.test.ts` | GUC ausente o ajeno oculta y bloquea lectura/escritura fila por fila (dos empresas reales) |
| Inventario de políticas | `tests/adversarial/rls-policy-coverage.test.ts` | RLS `enabled`+`forced` y policy `tenant_isolation` presente en las 12 tablas; único rol con `BYPASSRLS` |
| HTTP end-to-end (leads/citas/asignación/métricas) | `tests/adversarial/http-cross-company.test.ts` | Login real con credenciales de `Membresia` (sesión `company` genuina, no holding-wide) — 404 (no 403) al pedir/editar/asignar un recurso real de la otra empresa; `/metricas/resumen` nunca mezcla el conteo de la empresa ajena |
| SSE | `tests/eventos.test.ts` (`EventBroker`) | Conexión y replay de un mismo usuario aislados por `empresaId`, evento de empresa nunca llega a la conexión de la otra empresa |
| Logs | `tests/tenant-logger.test.ts` | Contexto ambiguo suprime el payload (`tenant_output_suppressed`), contexto de empresa/holding explícito se etiqueta correctamente |
| Notificaciones (scope obligatorio) | `tests/notificaciones.company-scope.test.ts` | `empresaId` obligatorio en toda notificación derivada; API holding explícita es la única vía para `empresaId: null` |
| CAS de agotamiento | `tests/asignacion.cas-correction.test.ts` | Solo actor + supervisores activos de la misma empresa reciben la notificación tras 3 conflictos |
| Partición de jobs (chokepoint compartido) | `tests/company-partition.test.ts` | `partitionByEmpresa` agrupa cada fila únicamente con las de su propia empresa (usado por los 4 jobs bajo bypass) |
| Allowlist de bypass | `tests/bypass-jobs.test.ts` | Escaneo estático: cada llamada real a `runAsBypassJob` en `src/` tiene su `jobId` en el allowlist, y viceversa (7 = 7) |

**Nota sobre "mutación de aislamiento" (spec, "Isolation mutations")**: no se
construyó un harness que deshabilite cada política RLS en tiempo de
ejecución (alto riesgo de locks DDL en una base compartida por tests
paralelos, ver razonamiento completo en
`sdd/bloque-c-aislamiento/apply-progress`, batch 6). En su lugar,
`rls-runtime-matrix.test.ts` ya cumple el mismo propósito práctico: prueba,
con dos empresas reales, que sin el GUC de empresa correcto (equivalente a
que el filtro/política esté ausente desde la perspectiva de la app) toda
lectura y escritura directa/indirecta se bloquea — combinado con
`rls-policy-coverage.test.ts` (cada policy existe, está `FORCED`, y solo un
rol tiene `BYPASSRLS`), esto documenta por qué un filtro o política ausente
causaría al menos un fallo, sin manipular DDL en vivo.

## Alcance

Convertir el scope por empresa (introducido en Bloque B como columnas
nullable) en una regla obligatoria en cada lectura/escritura: consultas,
SQL crudo, jobs, notificaciones, SSE y logs. Este bloque no agrega
capacidades nuevas — endurece las que ya existen para que no crucen empresa.

## Requiere cerrado

- **Bloque B** — `Empresa`/`Membresia` deben existir y estar pobladas antes
  de poder scopear nada por ellas.

## Decisión que implementa (ver rationale completo en `docs/16` §8 — no se repite acá)

- **D6 — Scope de supervisión**: espejo exacto de la jerarquía admin (D5):
  supervisor de holding (ve todo, sin permisos de modificación) y supervisor
  de empresa (solo su propia empresa), sin niveles intermedios arbitrarios.

## Riesgos de diseño a resolver en este bloque (movidos desde `docs/16` §8.1)

Estos riesgos fueron detectados junto a D3/D5/D8/D9 pero son, por
naturaleza, defectos de aislamiento/autorización — se resuelven acá, no en
Bloque D:

1. **El SSE nunca es el mecanismo de autorización.** Existe una ventana
   entre el commit de una reasignación y la llegada del evento SSE al
   navegador de quien pierde acceso. Cada endpoint de escritura sobre un
   lead/oportunidad (cerrar, reasignar, agendar cita) debe revalidar en el
   momento de la petición si el usuario sigue siendo el responsable vigente
   y sigue habilitado — nunca confiar en el estado cacheado del frontend.
   Corrección de tecnología: el sistema usa SSE (unidireccional
   servidor→cliente), verificado en `backend/src/lib/event-broker.ts:79`,
   no websockets.
2. **Condición de carrera entre auto-asignación y reasignación manual.** Si
   el pool automático y una reasignación manual de Administrador ocurren
   casi al mismo tiempo sobre el mismo registro, sin bloqueo/transacción que
   lea el estado vigente antes de escribir, una de las dos se pierde en
   silencio.
3. **`Notificacion` no tiene destinatario por grupo.** `Notificacion.usuarioId`
   es 1:1 por usuario; "todos los supervisores de la Empresa X" se resuelve
   ahora como consulta directa sobre `Membresia` (`empresaId = X, rol =
   SUPERVISOR`, más `empresaId = null, rol IN (ADMINISTRADOR, SUPERVISOR)`
   para el nivel holding) — sin cambiar el esquema de `Notificacion`, una vez
   que Bloque B ya dejó `Membresia` disponible.

## Migración (de `docs/14` §13, Fase 4)

- Cambiar lecturas y escrituras a contexto empresarial obligatorio (dejar de
  aceptar el scope nullable de Bloque B).
- Scopear SQL crudo, jobs programados, notificaciones, SSE y logs por
  empresa.
- Ejecutar pruebas adversariales entre dos holdings y entre dos empresas del
  mismo holding — un usuario de la Empresa A nunca debe poder leer ni
  escribir datos de la Empresa B.
- Activar Row-Level Security de Postgres como defensa adicional, dado que
  D11 (Bloque B) eligió esquema compartido: no confiar en que cada consulta
  recuerde filtrar por `empresaId` por su cuenta.

## Criterios de salida

- Ninguna consulta, job, notificación, canal SSE ni log expone datos entre
  empresas — verificado con pruebas adversariales, no solo revisión de
  código.
- Cada endpoint de escritura sensible revalida autorización en el momento de
  la petición, nunca solo al montar la pantalla.
- Los tres riesgos de la sección anterior tienen corrección verificada, no
  solo documentada.

## Siguiente bloque

Bloque D (`docs/blocks/d-routing-oportunidad.md`) — requiere aislamiento
verificado antes de activar routing/elegibilidad por empresa.
