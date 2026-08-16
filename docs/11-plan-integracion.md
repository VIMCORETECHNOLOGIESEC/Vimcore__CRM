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
| **F3 Listado de leads** | M5 | ✅ Completo | ❌ Mock | Ninguno — listo para integrar |
| **F4 Detalle de lead** | M5 + M6 + M7 | ✅ Completo | ❌ Mock | Ninguno — listo para integrar |
| F8 Administración de bridges | M4 | ◐ Parcial (solo adaptador Google Forms) | ❌ Mock | Completar M4 en backend |
| F6 Notificaciones | M8 | ✗ No iniciado | ❌ Mock | Implementar M8 en backend |
| F5 Dashboard | M9 | ✗ No iniciado | ❌ Mock | Implementar M9 en backend |

---

## Fase 1 — Leads (F3 + F4 → M5/M6/M7) — [issue #6](https://github.com/DinnZart/crm_comercial/issues/6)

Cero trabajo de backend: los tres módulos que sostienen esta fase ya están
completos y probados (312 tests backend). Es puro reemplazo de mock por
llamada real en el frontend.

- [ ] `frontend/src/funcionalidades/leads/leads.api.ts::fetchLeadsApi` →
      `httpClient.get<LeadsResponse>("/leads", { params })`
- [ ] `leads.api.ts::assignLeadsMasivoApi` → decidir si se implementa
      `POST /leads/asignar-lote` en backend o se resuelve con N llamadas a
      `POST /leads/:id/asignar`
- [ ] `leads.api.ts::getCatalogoResponsables`/`getCatalogoResponsablesConRol` →
      reemplazar el fixture `ASESORES`/`VENDEDORES` por un endpoint real de
      catálogo de usuarios por rol (hoy no existe, ver nota en el propio
      archivo)
- [ ] `LeadsPage.tsx` — selector "Leads por página" (10/25/50/100) pendiente
      de aprobación, con validación server-side de `porPagina` contra ese
      mismo whitelist
- [ ] `LeadsPage.tsx` — conectar el canal SSE de "lead nuevo" (depende de M8)
- [ ] `frontend/src/funcionalidades/leads/detalle/leadDetalle.api.ts` (8
      puntos `INTEGRACION-BACKEND`: detalle de lead, formulario de etapa,
      cierre, citas) → reemplazar por `httpClient` contra `GET /leads/:id`,
      `PATCH /leads/:id/etapa`, `POST /leads/:id/formulario`, endpoints de
      `M7 Citas`
- [ ] `frontend/src/funcionalidades/leads/detalle/LeadTimeline.tsx` — no hay
      forma de traer el historial de `lead_eventos` todavía; confirmar si
      `GET /leads/:id` ya lo incluye o hace falta un endpoint dedicado
- [ ] `usuarios.api.ts::getCargaActivaDeUsuario`/`reassignCarteraActiva` —
      dejan de depender del mock de leads una vez que `GET /leads` esté
      conectado de verdad

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
