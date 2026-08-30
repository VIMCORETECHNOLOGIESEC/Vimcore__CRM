# Handoff LinkedIn — estado actual para Claude

> **Material de coordinación:** este archivo explica dónde quedó la implementación
> de LinkedIn y qué falta hacer. No reemplaza a `docs/00-estado-documentacion.md`,
> `docs/05-bridges.md`, Prisma, migraciones ni tests.

## Claude: estamos aquí

Claude, estamos aquí: la integración backend de LinkedIn ya tiene implementados
OAuth, conexión segura, prueba de conexión, repositories de fuentes/formularios,
discovery de fuentes/formularios, y activación/suscripción a `leadNotifications`
(WU4). El punto exacto actual es **validar en Docker la suite de activación/
suscripción** (`tests/linkedin-subscription.service.test.ts`,
`tests/linkedin-api.service.test.ts`, `tests/linkedin.routes.test.ts`) — fue
escrita por una sesión sin acceso a Docker y todavía no se corrió.

El siguiente paso NO es avanzar a webhook todavía sin antes confirmar ese
GREEN. Una vez confirmado, el siguiente paso es el webhook durable V3 (paso 3
más abajo).

## Qué ya está hecho

- Configuración `LINKEDIN_*` validada en backend y cableada por Docker Compose.
- Migración RLS de tablas LinkedIn aplicada correctamente.
- OAuth seguro implementado:
  - state opaco de un solo uso;
  - hash SHA-256;
  - TTL de 10 minutos;
  - callback consume state antes de intercambiar token;
  - errores sanitizados.
- Endpoints HTTP LinkedIn implementados:
  - `POST /api/v1/bridges/:id/linkedin/oauth/iniciar`
  - `GET /api/v1/integraciones/linkedin/oauth/callback`
  - `GET /api/v1/bridges/:id/linkedin/conexion`
  - `POST /api/v1/bridges/:id/linkedin/probar-conexion`
  - `GET /api/v1/bridges/:id/linkedin/fuentes`
  - `POST /api/v1/bridges/:id/linkedin/fuentes/descubrir`
  - `PATCH /api/v1/bridges/:id/linkedin/fuentes/:fuenteId` (activación/suscripción)
- Repositories implementados para:
  - OAuth state;
  - conexión/tokens cifrados;
  - fuentes LinkedIn;
  - formularios versionados.
- Cliente LinkedIn implementado con headers requeridos:
  - `Linkedin-Version`;
  - `X-Restli-Protocol-Version`.
- Token refresh implementado para renovar access token cuando haya refresh token.
- Discovery implementado para:
  - sponsored accounts;
  - organizaciones con rol permitido;
  - formularios por owner;
  - preservación de activación/suscripción local;
  - no activar fuentes automáticamente.
- Corrección reciente: `adAccounts` usa paginación por cursor (`pageSize` y
  `pageToken`), no `start`/`count`.
- `git diff --check` pasó limpio después de esa corrección.
- Confirmado en Docker (usuario, 2026-08-27): 24/24 tests verdes en
  `tests/linkedin-discovery.service.test.ts` + `tests/linkedin.routes.test.ts`
  (estado previo a este batch).
- Activación/suscripción implementada (WU4, docs/integracion-linkedin-backend_mat_02.md
  §3.7 `linkedin-subscription.service.ts`):
  - `PATCH /api/v1/bridges/:id/linkedin/fuentes/:fuenteId` (`{ activa: boolean }`)
    activa o desactiva una fuente LinkedIn ya descubierta.
  - Activar solo confirma `activa=true` después de que LinkedIn confirme la
    suscripción (`POST /leadNotifications`, endpoint real confirmado contra
    Microsoft Learn "Lead Syncing" 2026-08); si falla, la fuente queda
    inactiva con `estadoSuscripcion=ERROR`. Reactivar una fuente ya
    `ACTIVA` es no-op (nunca duplica suscripciones); una fuente `ACTIVA`
    localmente pero con suscripción en `ERROR` sí reintenta.
  - Desactivar solo confirma el apagado local después de que LinkedIn
    confirme la baja (`DELETE /leadNotifications/{id}`; un 404 se trata
    como éxito idempotente). Si la baja remota falla, `subscriptionId` se
    conserva sin tocar el estado local (nunca se descarta en silencio).
  - `subscriptionId` nunca sale de la capa de repositorio hacia un DTO
    HTTP: se agregó un select interno separado
    (`findInternalByIdForBridge`/`LinkedInFuenteInternal`) de uso exclusivo
    del servicio de suscripción.
  - El cliente LinkedIn (`linkedin-api.service.ts`) se extendió con
    `postJson`/`deleteJson` (antes solo tenía `getJson`), reusando los mismos
    headers/timeout/mapeo de errores ya existentes.

## Qué falta hacer ahora

### 1. Validar activación/suscripción en Docker

Escrito por una sesión sin acceso a Docker — todavía no se corrió. Ejecutar:

```bash
sudo docker compose exec -T \
  -w /app/backend \
  -e NODE_ENV=test \
  backend pnpm exec vitest run \
  tests/linkedin-subscription.service.test.ts \
  tests/linkedin-api.service.test.ts \
  tests/linkedin.routes.test.ts \
  tests/linkedin-discovery.service.test.ts
```

Si falla, corregir solo el alcance de activación/suscripción/rutas LinkedIn
(no tocar discovery, que ya estaba GREEN antes de este batch) y volver a
correr la misma suite.

### 2. Implementar webhook durable V3

Después de activación/suscripciones, implementar el webhook LinkedIn sobre el
modelo V3 de inbox.

Pendiente esperado:

- Ruta pública de webhook LinkedIn.
- Verificación de firma/procedencia según el contrato real disponible.
- Normalización del payload entrante.
- Escritura durable en `leads_recibidos`.
- Idempotencia/deduplicación para eventos repetidos.
- Registro de errores sin filtrar tokens ni cuerpos sensibles.
- Tests de payload válido, payload inválido, replay/idempotencia y errores.

### 3. Integrar procesamiento desde inbox

El job actual procesa `leads_recibidos`; no recorre bridges arbitrariamente. La
integración LinkedIn debe dejar los eventos en inbox para que el flujo existente
los procese.

Pendiente esperado:

- Mapear lead de LinkedIn al contrato de `leads_recibidos`.
- Asociar fuente/formulario descubierto con el evento recibido.
- Confirmar que el pipeline existente deduplica y crea/actualiza lead según las
  reglas actuales.
- Agregar tests de integración donde sea necesario.

### 4. Reconciliación futura

La reconciliación no reemplaza al webhook. Queda como trabajo posterior para
recuperar huecos si LinkedIn entrega eventos tarde o si hubo caída temporal.

## Restricciones importantes

- No leer ni imprimir `.env`.
- No exponer tokens, secrets, cuerpos crudos sensibles ni `subscriptionId` en
  respuestas HTTP.
- Usar Docker + pnpm. No usar `npm`, `npx`, `yarn`, `bun` ni Node del host.
- No implementar multi-tenant/holding en este trabajo.
- No tocar ni reformatear trabajo paralelo de:
  - `backend/src/**/whatsappMessages/**`;
  - `backend/src/jobs/bridgeApi/**`;
  - `backend/src/services/bridgeApi/**`;
  - `backend/src/controllers/bridgeApi/**`;
  - `backend/src/index.ts`;
  - `backend/src/lib/event-broker.ts`;
  - `backend/src/services/bridge.service.ts`;
  - `backend/prisma/schema.prisma`, salvo coordinación explícita.

## Tests ya verdes antes de este punto

- `tests/linkedin-env.test.ts`
- `tests/adversarial/rls-runtime-matrix.test.ts`
- `tests/linkedin-oauth-state.repository.test.ts`
- `tests/linkedin-conexion.repository.test.ts`
- `tests/linkedin-oauth.service.test.ts`
- `tests/linkedin.routes.test.ts` hasta las rutas acumuladas anteriores
- `tests/linkedin-fuente-formulario.repository.test.ts`
- `tests/linkedin-conexion.service.test.ts`
- `tests/linkedin-api.service.test.ts`
- `tests/linkedin-token.service.test.ts`
- `tests/linkedin-probar-conexion.service.test.ts`
- `tests/linkedin-discovery.service.test.ts` + `tests/linkedin.routes.test.ts`
  (confirmado por el usuario en Docker, 24/24, estado previo a este batch —
  `linkedin.routes.test.ts` se extendió después con casos de activación, ver
  abajo).

## Tests escritos en este batch (activación/suscripción), pendientes de verificar en Docker

Escritos por una sesión sin acceso a Docker — nunca se corrieron. No dar por
verdes hasta confirmar:

- `backend/tests/linkedin-subscription.service.test.ts` (nuevo).
- `backend/tests/linkedin-api.service.test.ts` (extendido: casos de
  `postJson`/`deleteJson`; los casos de `getJson` ya existentes no se
  tocaron).
- `backend/tests/linkedin.routes.test.ts` (extendido: casos de
  `PATCH /bridges/:id/linkedin/fuentes/:fuenteId`; los casos existentes no se
  tocaron).

## Archivos principales de esta unidad

- `backend/src/services/linkedin/linkedin-discovery.service.ts`
- `backend/src/schemas/linkedin/linkedin-discovery.schema.ts`
- `backend/src/services/linkedin/linkedin-subscription.service.ts` (nuevo,
  WU4 — activación/suscripción `leadNotifications`)
- `backend/src/controllers/linkedin/linkedin.controller.ts`
- `backend/src/routes/linkedin/linkedin.routes.ts`
- `backend/src/services/linkedin/linkedin-api.service.ts` (extendido con
  `postJson`/`deleteJson`)
- `backend/src/services/linkedin/linkedin-token.service.ts`
- `backend/src/repositories/linkedin/linkedin-fuente.repository.ts`
  (extendido con `findInternalByIdForBridge`/`LinkedInFuenteInternal`)
- `backend/src/repositories/linkedin/linkedin-formulario.repository.ts`
- `backend/src/schemas/linkedin/linkedin-bridge.schema.ts` (ya existía,
  preparado por la sesión anterior — sin cambios en este batch)
- `backend/tests/linkedin-discovery.service.test.ts`
- `backend/tests/linkedin-subscription.service.test.ts`
- `backend/tests/linkedin-api.service.test.ts`
- `backend/tests/linkedin.routes.test.ts`

## Criterio para continuar

Continuar con el webhook durable V3 solo cuando la suite de activación/
suscripción (`linkedin-subscription.service.test.ts`,
`linkedin-api.service.test.ts`, `linkedin.routes.test.ts`) esté verde dentro
de Docker.
