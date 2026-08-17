# 11 — Plan de integración front-back

Estado real de qué funcionalidades del frontend ya consumen el backend real
y cuáles siguen contra datos mock, más el orden recomendado para ir
reemplazando cada mock. Fuente de verdad: el checklist de módulos backend
(`06-modulos-backend.md`), el checklist de módulos frontend
(`07-modulos-frontend.md`) y el token `INTEGRACION-BACKEND`, grepeable en
todo `frontend/src` — cada aparición es un punto de integración concreto,
con un comentario explicando exactamente qué reemplazar.

Marca cada casilla al reemplazar el mock correspondiente por la llamada real
(`httpClient`) y confirmar que los tests de ese módulo siguen en verde.

---

## Resumen de estado

| Feature (frontend) | Módulo backend | Backend | Frontend | Bloqueador |
| --- | --- | --- | --- | --- |
| F2 Autenticación | M2 | ✅ Completo | ✅ Real | — |
| F7 Administración de usuarios | M2 | ✅ Completo (gap: baja lógica no reasigna cartera) | ✅ Real | — |
| **F3 Listado de leads** | M5 | ✅ Completo | ✅ Real | — (Fase 1 mergeada en `test/integration`) |
| **F4 Detalle de lead** | M5 + M6 + M7 | ✅ Completo | ✅ Real | — (Fase 1 mergeada en `test/integration`) |
| F8 Administración de bridges | M4 | ◐ Parcial (solo adaptador Google Forms) | ❌ Mock | Completar M4 en backend |
| F6 Notificaciones | M8 | ✗ No iniciado | ❌ Mock | Implementar M8 en backend |
| F5 Dashboard | M9 | ✗ No iniciado | ❌ Mock | Implementar M9 en backend |

---

## Fase 1 — Leads (F3 + F4 → M5/M6/M7) — [issue #6](https://github.com/DinnZart/crm_comercial/issues/6) — ✅ MERGEADA en `test/integration`

> **Corrección (exploración SDD, `sdd/integracion-leads-f3-f4/explore`):** la
> premisa original de "cero trabajo de backend" era incorrecta.
> `GET /leads`/`GET /leads/:id` devolvían el `Lead` plano (sin `include` de
> Prisma) — sin nombre/teléfono/correo del cliente ni nombre de
> asesor/vendedor, solo IDs. Tampoco existía `busqueda` en
> `listLeadsQuerySchema`, y `GET /usuarios` era exclusivo de
> `ADMINISTRADOR` (bloqueaba a Supervisor como catálogo de responsables,
> pese a que M6/DD10 lo autoriza a elegir destino explícito). Se resolvió
> con una rebanada de backend antes de integrar el frontend, para no
> degradar la UX de F3/F4. Detalle completo de decisiones y diseño en
> Engram `sdd/integracion-leads-f3-f4/{proposal,spec,design,tasks,verify-report}`.

Entregado en 5 PRs encadenados contra `test/integration` (mergeados
[#9](https://github.com/DinnZart/crm_comercial/pull/9)→[#10](https://github.com/DinnZart/crm_comercial/pull/10)→[#11](https://github.com/DinnZart/crm_comercial/pull/11)→[#12](https://github.com/DinnZart/crm_comercial/pull/12)→[#13](https://github.com/DinnZart/crm_comercial/pull/13)),
verificados contra el estado real fusionado (backend 348/348, frontend
424/424, `tsc` limpio — ver Engram `sdd/integracion-leads-f3-f4/verify-report`).

- [x] Backend: `include: { cliente, asesor, vendedor }` en
      `lead.repository.ts::findById/findMany`, mapeado al shape anidado que
      espera el frontend (PR #9)
- [x] Backend: `busqueda` opcional (ILIKE sobre nombre/teléfono/correo de
      cliente) en `listLeadsQuerySchema` (PR #9)
- [x] Backend: `GET /usuarios/responsables?rol=` accesible a
      Admin/Supervisor, solo usuarios activos, sin filtro de equipo,
      devuelve `{id, nombre, rol}[]` (PR #10)
- [x] Backend: `POST /leads/asignar-lote` — una sola request
      (`{leadIds, asesorId}`), N llamadas secuenciales a `assignLead`
      internamente, reporta `exitosos[]`/`fallidos[]` por lead (decisión de
      producto: se descartó la alternativa de N llamadas desde el
      frontend) (PR #10)
- [x] Backend: asignación automática (M6) ahora se dispara DESPUÉS del
      commit real de ingesta (no dentro de la misma transacción), con 3
      reintentos acotados, guarda de idempotencia, y degradación a evento
      `ASIGNACION_FALLIDA` + `bridge_logs` si se agotan los reintentos —
      ruptura consciente de la invariante original de M6 D1, documentada en
      `docs/06-modulos-backend.md` (PR #11). **Portado también a `dev-back`**
      (commits `ae2c923`+`7681685`) para que no quede huérfano ese cambio de
      comportamiento.
- [x] `frontend/src/funcionalidades/leads/leads.api.ts::fetchLeadsApi` →
      `httpClient.get<LeadsResponse>("/leads", { params })` (PR #12)
- [x] `leads.api.ts::assignLeadsMasivoApi` → `POST /leads/asignar-lote` real
      (PR #12)
- [x] `leads.api.ts::getCatalogoResponsables`/`getCatalogoResponsablesConRol` →
      `GET /usuarios/responsables?rol=` real, reemplaza fixtures
      `ASESORES`/`VENDEDORES` (PR #12)
- [x] `frontend/src/funcionalidades/leads/detalle/leadDetalle.api.ts` →
      `httpClient` real contra `GET /leads/:id`, `PATCH /leads/:id/etapa`
      (formulario de etapa/cierre venta/cierre no-venta colapsados en un
      único endpoint), endpoints de `M7 Citas` (PR #12)
- [x] Fix: botón "Cancelar" de cita separado de `markCitaResultApi` hacia
      `POST /citas/:citaId/cancelar` dedicado — el mock lo mapeaba mal
      contra `/resultado`, que solo acepta `CUMPLIDA`/`NO_ASISTIO` y
      hubiera roto con 400 contra el backend real (PR #13)
- [x] `usuarios.api.ts::getCargaActivaDeUsuario`/`reassignCarteraActiva` —
      ya no dependen del mock de leads (PR #12)

### Pendiente / diferido explícitamente (no bloquea el cierre de Fase 1)

- [ ] `LeadsPage.tsx` — selector "Leads por página" (10/25/50/100) sigue
      pendiente de aprobación de producto
- [ ] `LeadsPage.tsx` — canal SSE de "lead nuevo" (depende de M8, Fase 3)
- [ ] `LeadTimeline.tsx` — historial de `lead_eventos` no se conecta
      todavía (fuera de alcance de esta rebanada)
- [ ] Gaps de contrato conocidos y documentados en código
      (`INTEGRACION-BACKEND-GAP`): `cliente.correoPrincipal` siempre null
      (include superficial), `campania`/`cuentaPublicitaria` siempre null
      (sin entidad de backend, es M4/F8), `EstadoSla.CERRADO` sin
      equivalente en backend
- [ ] `LEADS_MOCK` sigue teniendo 2 consumidores fuera de alcance:
      `dashboard/metricas.api.ts` (F5) y `notificaciones/notificaciones.api.ts`
      (F6) — se resuelven en Fase 3

### Nota de arquitectura de ramas

Esta fase se implementó y mergeó directamente en `test/integration`
(no en `dev-back`/`dev-front`), rompiendo momentáneamente el uso previsto
de esa rama como "carril de pruebas antes de mergear a main". Decisión
tomada: `test/integration` sigue siendo el carril de validación
descartable; los cambios de comportamiento real (como el rework de M6) se
portean de vuelta a `dev-back`/`dev-front` a medida que se confirman,
en vez de dejar que `test/integration` se convierta en el nuevo tronco.

**Backend (`dev-back`) ya tiene Unit A1 + A2 + A3 completas**, porteadas
en commits separados (`982e481`+`c3f1b1b` A1, `f7e08f8`+`7a0b4f4` A2,
`ae2c923`+`7681685` A3). Al portear A2 se descubrió que `test/integration`
había regresado a nomenclatura en español en `usuarios.*`
(`postUsuario`/`getUsuarios`) por un commit F7 no relacionado, divergiendo
del fix en inglés ya establecido en `dev-back`
(`postUser`/`getUsers`, commit `ce33902`) — se corrigió `test/integration`
hacia adelante (commit `627a997`, sin reescribir historia) y se implementó
el catálogo de responsables directo en `dev-back` con la nomenclatura
correcta, en vez de arrastrar el cherry-pick con nombres en español.

**`dev-front` sigue sin recibir Unit B1/B2** (reemplazo de mocks +
fix de cancelar cita) — queda como decisión futura.

## Fase 2 — Bridges (M4 backend + F8) — [issue #7](https://github.com/DinnZart/crm_comercial/issues/7)

- [ ] Completar M4 en backend: adaptadores Meta/LinkedIn/X, cifrado
      AES-256-GCM de tokens, CRUD de bridges y cuentas publicitarias, jobs
      programados de expiración/inactividad (`06-modulos-backend.md` §M4)
- [ ] `frontend/src/funcionalidades/bridges/bridges.api.ts` (14 puntos
      `INTEGRACION-BACKEND`) → reemplazar mock por `httpClient` una vez que
      M4 esté completo

## Fase 3 — Notificaciones (M8) y Dashboard (M9), en paralelo — [issue #8](https://github.com/DinnZart/crm_comercial/issues/8)

- [ ] Implementar M8 en backend: servicio de notificaciones,
      `GET /notificaciones`, `PATCH /notificaciones/:id/leer`, canal SSE
      `GET /eventos` con reconexión (`06-modulos-backend.md` §M8)
- [ ] `frontend/src/funcionalidades/notificaciones/notificaciones.api.ts` (3
      puntos `INTEGRACION-BACKEND`) → reemplazar por `httpClient` + cliente SSE
- [ ] Implementar M9 en backend: agregación de KPIs, los 7 endpoints
      `GET /metricas/*`, alcance por rol, emisión por SSE
      (`06-modulos-backend.md` §M9)
- [ ] `frontend/src/funcionalidades/dashboard/metricas.api.ts`,
      `metricas.utils.ts`, `DashboardPage.tsx` (9 puntos
      `INTEGRACION-BACKEND`) → reemplazar por `httpClient`

---

## Seguimiento

El detalle día a día de cada fase se trackea en GitHub Issues (uno por fase,
con esta misma checklist como cuerpo). Este documento es la fuente de verdad
versionada; los issues son el estado operativo (quién, cuándo, en qué PR).
