# 22 — Backlog paralelo independiente de bloques (3 devs simultáneos)

> **Estado:** vigente — complementa `docs/21-proyeccion-bloques-y-
> reparto-equipo.md`. Ese documento asumía un reparto donde un dev
> quedaba como cuello de botella secuencial del roadmap B–F; este backlog
> corrige eso: son ítems que **no dependen de ningún bloque** (A–F) ni
> entre sí, para que los 3 devs tengan trabajo simultáneo continuo sin
> esperar a que otro termine.
>
> **Verificado contra:** rama `test/gpt`, commit `1ae57f0`, 2026-08-27.

## Criterio de independencia

Un ítem entra en este backlog solo si cumple las tres condiciones:

1. No requiere que ningún Bloque B–F esté más avanzado de lo que está hoy.
2. No modifica `backend/prisma/schema.prisma`, `event-broker.ts` ni
   `leads.access.ts` (los archivos de alto riesgo de `docs/21` §3).
3. No comparte archivo de edición con otro ítem de este mismo backlog que
   esté asignado a otro dev en simultáneo (verificado abajo por track).

Cada track es una **cola**, no una tarea única: al terminar un ítem, ese
dev sigue con el siguiente de su propio track sin sincronizar con los
otros dos.

## Track 1 — Backend: integraciones y reglas de negocio actuales

1. **Adaptadores LinkedIn + X.** Nuevos `backend/src/adapters/
   linkedin.adapter.ts` y `x.adapter.ts` siguiendo el patrón de
   `meta.adapter.ts`; alta en el dispatch de `ingesta.service.ts`;
   catálogo en `frontend/src/funcionalidades/bridges/catalogos.ts` (ya
   tiene el placeholder `LINKEDIN: "TOKEN_PROVEEDOR"`).
2. **Contrato de cierre (docs 02/04 vs. schema real).** Reconciliar fecha
   de cierre y `observaciones` de Venta: `backend/src/schemas/
   leads.schema.ts`, `backend/src/services/leads.service.ts`,
   `frontend/.../detalle/cierre.schemas.ts`, `CierreVentaForm.tsx`.
3. **M6 — exigir `asesor_id` antes de entregar el lead a vendedor.**
   `backend/src/services/asignacion.service.ts`.
   ⚠️ **Coordinar, no paralelizar a ciegas:** este es el mismo archivo
   donde vive el Grupo 4 de Bloque C (notificación al agotar el CAS de
   asignación, `docs/21` §2). Si alguien retoma Bloque C en simultáneo,
   este ítem 3 se secuencia con esa persona — avisar antes de tocar
   `asignacion.service.ts`.

## Track 2 — Frontend: UX de leads

1. **Fix `mapLeadFromApi`.** Resolver `correoPrincipal` y `campania`
   reales en vez de `null` — único archivo:
   `frontend/src/funcionalidades/leads/leads.api.ts` (`leadDetalle.api.ts`
   solo importa esta función, no la duplica).
2. **Guard de edición local + redirección ante 403.**
   `frontend/src/funcionalidades/leads/detalle/LeadTimeline.tsx`,
   `FormularioEtapaLead.tsx`, `LeadDetallePage.tsx`.

Sin overlap con Track 1: ninguno de estos archivos es tocado por los
ítems del Track 1.

## Track 3 — Calidad, QA y documentación

1. **QA reproducible (Lote 4 de `docs/00`).** Único procedimiento de
   reset/seed para que `docs/12-pruebas-manuales-qa.md` deje de ser "no
   confiable": `backend/prisma/seed.ts`, `backend/prisma/
   seed-leads-qa.ts`, `docs/12-pruebas-manuales-qa.md`.
2. **Documentación pendiente (Lotes 2–3 de `docs/00`).** Aclarar fuentes
   reales en `docs/08-dashboard-kpis.md` y `docs/13-configuracion-
   bridges.md`; reconciliar `docs/09-linea-grafica-frontend.md` y
   `docs/10-skills-agente-frontend.md` con el repo real.

Sin overlap de código con Track 1 ni 2 — son fixtures, seeds y
documentación, cero colisión de merge posible.

## Qué queda fuera de este backlog a propósito

Los Grupos 4 y 6 de Bloque C (`docs/21` §1–2) **no entran acá** porque
son, por definición, trabajo del roadmap de bloques — aunque ya están
desbloqueados hoy (el Grupo 3 del que dependen está cerrado). Siguen
como un cuarto hilo de trabajo real, en paralelo a estos 3 tracks, sin
bloquear a ninguno de ellos; solo requiere coordinación puntual con el
ítem 3 del Track 1 por el archivo compartido `asignacion.service.ts`.

## Reparto sugerido

- **Dev A:** Track 1 (adaptadores → contrato de cierre → `asesor_id`,
  coordinando el último con quien siga Bloque C).
- **Dev B:** Track 2 (fix de mapper → guards de UI).
- **Dev C:** Track 3 (QA reproducible → documentación), y retoma Bloque C
  Grupos 4/6 cuando su cola del Track 3 se agote, si ya hay contexto
  técnico suficiente (ver `docs/21` §2 para el punto de retomado en
  Engram).

Cuando un dev agota su track, no salta al track de otro sin avisar —
pasa a los Grupos 4/6 de Bloque C o a un ítem nuevo que se agregue a este
mismo documento.
