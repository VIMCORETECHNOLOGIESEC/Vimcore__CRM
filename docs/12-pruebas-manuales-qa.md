# 12 — Pruebas manuales de QA

> **Estado documental: No confiable — revalidación en Bloque A.**
>
> **Autoridad operativa actual:** `backend/prisma/seed.ts`,
> `backend/prisma/seed-leads-qa.ts` y el estado real de la base recreada.
>
> **Verificado contra:** rama `test/gpt`, commit `beddbc7`, 2026-08-27.
>
> El catálogo detallado de escenarios que tenía este documento (1098 líneas,
> datos de partida presupuestos que no coinciden con los seeds reales — el
> seed base crea 4 usuarios y 3 bridges; el seed auxiliar crea 10 leads y no
> crea las 5 citas ni las 18 notificaciones que la versión anterior
> presuponía) queda en el historial de Git, no en este archivo. Reconstruir
> ese catálogo contra fixtures reproducibles es el **Lote 4** de
> [`00-estado-documentacion.md`](00-estado-documentacion.md) — sigue sin
> hacerse.

Cuando el Lote 4 esté cerrado, este documento vuelve a ser un checklist de
pruebas manuales exhaustivas contra el ambiente Docker de desarrollo
(`docker compose up -d`), pensado para que alguien sin conocimiento técnico
profundo pueda verificar el sistema completo paso a paso desde
`http://localhost:5173`, con datos reales del ambiente. No repite el
contrato técnico de cada endpoint (ver
[`06-modulos-backend.md`](06-modulos-backend.md) y `backend/src/routes/`) ni
la configuración de bridges (ver
[`13-configuracion-bridges.md`](13-configuracion-bridges.md)).

---

## TODO — Lote 4 de docs/00: reconstruir por categoría

Índice de las categorías que el catálogo anterior cubría, para no perder de
vista el alcance al reconstruirlo con fixtures reproducibles:

| # | Categoría | Qué cubre |
|---|---|---|
| 0 | Datos de partida del ambiente | Usuarios, bridges y leads reales del seed vigente — hoy desincronizado, primer paso del Lote 4 |
| 1 | Acceso y autenticación | Login por cada rol, sesión, tokens |
| 2 | Configuración de bridges | Alta y edición como `admin@crm.local`, ver `docs/13` |
| 3 | Ingreso de leads | Ingesta vía `POST /ingesta/generico` y bridges reales |
| 4 | Gestión y calificación de leads | Formularios y semáforo, ver `docs/04` |
| 5 | Asignación, reasignación y traspaso | Reglas de pool y traspaso, ver `docs/02` §3–§5 |
| 6 | Citas | Estados y recordatorios, ver `docs/06` M7 |
| 7 | Cierre de leads | Cierre en Venta / No Venta |
| 8 | Notificaciones y tiempo real | Campana, contador, SSE |
| 9 | Dashboard y métricas | KPIs, ver `docs/08` |
| 10 | Administración de usuarios | Solo `admin@crm.local` |
| 11 | Casos negativos y edge cases | Payloads inválidos, permisos, límites |
| 12 | Pruebas dependientes del tiempo | Requieren stack corriendo un intervalo real o fechas preparadas — no ejecutables de inmediato |

El detalle completo de cada categoría (pasos, resultado esperado, casos
puntuales por rol) está en el historial de Git de este archivo hasta el
commit `beddbc7` — recuperable con `git log --follow -- docs/12-pruebas-manuales-qa.md`.
