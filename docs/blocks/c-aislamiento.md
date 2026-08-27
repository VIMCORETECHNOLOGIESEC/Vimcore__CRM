# Bloque C — Aislamiento efectivo entre empresas

> Fase 4 de `docs/16-hallazgos-y-preguntas.md` §7 ("Aislamiento efectivo").
> Cubre Fase 4 de `docs/14-evolucion-multitenant.md` §13 ("Aislamiento
> efectivo").

## Estado (2026-08-27) — EN PROGRESO, pausado para handoff

Ciclo SDD completo (explore/propose/spec/design/tasks) corrido y persistido en
Engram (artifact store = `engram`, no `openspec/` — ver
`sdd-init/crm_comercial`). 35 tareas totales en `sdd/bloque-c-aislamiento/tasks`,
repartidas en 3 etapas internas de este mismo bloque (no son bloques
separados):

| Etapa | Alcance | Estado | Commit | Evidencia |
|---|---|---|---|---|
| 1 | Autorizador sombra company-aware + chokepoint de notificaciones + alta de Usuario con Membresia (bootstrap) + TenantContext fail-closed | ✅ Completa (12/12 tareas) | `c1807fe` | 812/812 tests, tsc limpio |
| 2 | Cutover bloqueante (`leads.access`/`leads.service`/`metricas.access`) + `empresaId` NOT NULL + decisión por job | ✅ Completa (13/13 tareas) | `f45923e` | 832/832 tests, tsc limpio |
| 3 | RLS de Postgres + rol de bypass + suite adversarial entre empresas | ⏳ **NO iniciada** (0/10 tareas) | — | — |

Ambos commits están pusheados a `origin/test/gpt`. `sdd-verify` corrió como
checkpoint intermedio después de cada etapa (0 CRITICAL, 0 WARNING nuevo) —
detalle completo en `sdd/bloque-c-aislamiento/verify-report`.

**Vacío detectado, sin cubrir por ninguna de las 35 tareas — pendiente antes de
poder cerrar este bloque:** el "riesgo de diseño #2" de la sección siguiente
(condición de carrera entre el pool automático de asignación y una
reasignación manual de Administrador/Supervisor sobre el mismo `Lead`) fue
resuelto como decisión — **versión optimista: columna de versión +
compare-and-swap en el UPDATE, con reintento en la capa de servicio** — pero
esa decisión nunca se incorporó al pipeline `sdd-propose`→`sdd-tasks`, así que
no hay tarea que la implemente en ninguna de las 3 etapas. Este documento
sigue exigiendo su corrección en los "Criterios de salida" de abajo. Quien
retome este bloque debe: (a) agregar esta corrección como tarea explícita
(probablemente Etapa 3, junto a la suite adversarial que la ejercitaría), o
(b) confirmar con `sdd-propose`/`sdd-design` si corresponde re-scopearla hacia
Bloque D una vez que `Oportunidad` reemplace a `Lead` como el registro sobre
el que compiten pool y reasignación manual (ver D13/D14 en `docs/16` §8) —
pero no darla por resuelta sin una de las dos.

**Para retomar Etapa 3 desde otra sesión/equipo:**
- Leer `sdd/bloque-c-aislamiento/{spec,design,tasks,apply-progress,verify-report}`
  en Engram (`mem_search` → `mem_get_observation`), en ese orden.
- Base estable: commit `f45923e` en `origin/test/gpt`, 832/832 tests en verde.
- Contenedor de test DB usado en esta sesión (`crm-test-db`,
  postgres:16.14-alpine, puerto 55432) no persiste entre sesiones — recrear y
  correr `prisma migrate deploy` + `prisma generate` antes de testear.
- `pnpm install`/`pnpm exec` fallan con EACCES en el sandbox usado en esta
  sesión — si persiste, invocar vitest/prisma/tsc directo desde
  `node_modules/.pnpm/` en la raíz del workspace.
- Ledger nativo de intentos (`gentle-ai sdd-attempt`) para este `change` está
  en estado limpio (`interrupted`, sin bloqueo) — un `acquire` nuevo debería
  proceder sin necesitar `reset`.

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
