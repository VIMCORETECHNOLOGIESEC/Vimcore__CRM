# Bloque D0 — Visualización de la separación multiempresa (sin tocar lógica de negocio)

> Slice mínimo extraído de la cola de Bloque D para permitir que el
> solicitante pueda VER que el multi-tenant funciona antes del despliegue,
> sin tocar los archivos de alto riesgo que otro desarrollador puede estar
> perfeccionando en paralelo sobre el single-company actual (ver
> `docs/06-modulos-backend.md` §"Archivos de alto riesgo — coordinar antes
> de tocar en paralelo"). El resto de Bloque D (routing, handoff,
> Oportunidad) queda diferido — ver `docs/blocks/d-routing-oportunidad.md`.

## Estado (2026-08-28, creado)

Aún no implementado. Este documento reemplaza, para efectos de "qué se hace
antes del despliegue", la entrada directa a Bloque D completo.

## Hallazgo verificado que habilita este bloque

El backend **ya resuelve y expone** la separación por empresa de forma seria
(server-side, derivada del JWT, nunca confiada del cliente) desde Bloque B/C
— el frontend simplemente nunca la lee ni la muestra:

- `backend/src/types/authenticated-user.ts` — el `AuthenticatedUser` que
  puebla `req.user` en cada request autenticado YA tiene `sessionScope`
  (`"company" | "holding"`), `membresiaId` y `empresaId` (este último
  **siempre resuelto server-side releyendo `Membresia`**, nunca el claim del
  JWT — "Client-supplied empresaId is ignored").
- `backend/src/controllers/auth.controller.ts:47` (`getPerfil`) — `GET
  /auth/perfil` devuelve `{ ...user, activo: true }`, es decir, el objeto
  completo de arriba viaja HOY MISMO en la respuesta HTTP real.
- El gap es **100% frontend**: `frontend/src/tipos/usuario.ts::AuthenticatedUser`
  solo tipa `{ id, nombre, correo, rol }` — descarta `sessionScope`,
  `empresaId` y `membresiaId` al no declararlos, y ninguna pantalla
  (`AuthContext.tsx`, `Header.tsx`, `Sidebar.tsx`, dashboard) los consume.
  Verificado: cero ocurrencias de la palabra "empresa" en todo
  `frontend/src`.
- `backend/prisma/seed.ts` solo siembra **una** empresa
  (`EMPRESA_BOOTSTRAP_ID`) con una `Membresia` por usuario — hoy no existen
  datos de una segunda empresa para poder demostrar visualmente la
  separación.

## Alcance

1. **Backend (aislado, fuera de la lista de archivos de alto riesgo)** —
   `auth.service.ts`/`auth.controller.ts`: resolver `Empresa.nombre` a partir
   de `empresaId` (cuando la sesión es `company`-scoped) y agregarlo como
   campo adicional en `PublicUser`/la respuesta de perfil (p. ej.
   `empresaNombre`). No requiere migración — `Empresa` ya existe desde
   Bloque B.
2. **Frontend** — extender `AuthenticatedUser` en `frontend/src/tipos/usuario.ts`
   con `sessionScope`, `empresaId`, `empresaNombre`; agregar un indicador
   visual del alcance de la sesión (p. ej. "Empresa: Arcano Motors" o
   "Alcance: Holding" para administración holding-wide) en un lugar de bajo
   riesgo de colisión, como `Header.tsx` o `Sidebar.tsx`.
3. **Datos de demo** — sembrar una **segunda empresa real** con su propio
   usuario `Membresia.correo` (sesión company-scoped) y 1-2 leads/bridges
   propios, para poder loguearse con dos usuarios distintos y mostrar que
   cada uno ve únicamente los datos de su empresa. Cambio aislado a
   seed/fixtures, sin lógica de producción nueva.

## Explícitamente fuera de este bloque (permanece como está hoy)

- `backend/src/services/asignacion.service.ts` — el pool de asignación sigue
  siendo global (D3 sin implementar). Diverge ~479 líneas entre `test/gpt` y
  `dev-back`; tocarlo hoy es el mayor riesgo de colisión con el otro
  desarrollador.
- `backend/src/services/leads.access.ts` — la autoridad de cierre sigue en
  `Usuario.rol` legacy (D7 sin cutover). El propio `docs/06` ya advierte que
  este archivo "reescrita tanto por Bloque C como por Bloque D".
- `backend/prisma/schema.prisma` — sin migraciones nuevas en este bloque.
- Cualquier archivo de `docs/06-modulos-backend.md` §"Archivos de alto
  riesgo".

## Honestidad técnica — qué NO demuestra este bloque

Este bloque demuestra **aislamiento de lectura** (ya cerrado de verdad en
Bloque C vía RLS forzado + `Membresia`) haciéndolo **visible** en la
interfaz. No corrige ni demuestra:

- Que el pool de asignación reparte leads solo dentro de la empresa correcta
  (D3 sigue global — deuda técnica, ver `docs/blocks/d-routing-oportunidad.md`).
- Que la autoridad de cierre respeta `habilitadoParaVenta` por membresía
  (D7 sigue en `Usuario.rol` — misma deuda).

Si el solicitante pide ver también que un lead nuevo se asigna solo a
asesores de su propia empresa, eso requiere el pool D3 real y por lo tanto
sí toca `asignacion.service.ts` — no se puede demostrar sin ese riesgo. Este
documento no lo oculta: lo declara fuera de alcance de D0 a propósito.

## Riesgo de colisión conocido

`frontend/src/funcionalidades/autenticacion/AuthContext.tsx` tiene un diff
de 13 líneas en la rama `dev-front` (demo visual de "Propuesta B",
mayormente aislada en `frontend/src/temas/variante-empresarial/`). Riesgo
bajo — pero coordinar antes de tocar ese archivo puntual.

## Requiere cerrado

- **Bloque C** — el `empresaId`/`sessionScope` que este bloque expone ya
  depende de que el TenantContext y RLS de Bloque C estén reales (lo están,
  cerrado 100%, commit `052e811`).

## Criterios de salida

- Un usuario de Empresa A y un usuario de Empresa B pueden loguearse y ver,
  en login/header/dashboard, que pertenecen a tenants distintos.
- Ninguno de los dos ve datos del otro (ya garantizado por Bloque C; este
  bloque solo lo hace visible).
- Cero cambios en `asignacion.service.ts`, `leads.access.ts` ni migraciones
  de `schema.prisma`.

## Siguiente bloque

Bloque D completo (`docs/blocks/d-routing-oportunidad.md`) — diferido a
después del despliegue. Su ciclo SDD (propuesta/spec/diseño/tareas) ya
corrió y queda persistido en Engram (`sdd/bloque-d-routing-oportunidad/{proposal,
spec,design,tasks}`) para retomarlo sin volver a planificar desde cero.
