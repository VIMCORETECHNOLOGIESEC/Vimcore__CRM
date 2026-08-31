# Handoff despliegue en producción — estado actual (2026-08-30)

> **Material de coordinación:** explica dónde quedó el despliegue real del
> backend en Azure, el pipeline de CI/CD y qué falta. No reemplaza a
> `docs/00-estado-documentacion.md` ni a `.env.example.deployback`.

## Estado: CI/CD verde de punta a punta, producción confirmada

El pipeline `.github/workflows/deploy-backend.yml` corrió completo por
primera vez el 2026-08-30 (push a `main`, commit `912d9b9`): job `test` en
verde (1237/1237 tests) → job `deploy` en verde (build, push a ACR, update
del Container App) → verificado en producción real:

```
GET https://arcano-crm.happyground-63307e62.eastus.azurecontainerapps.io/api/v1/salud
{"status":"ok","database":"ok"}
```

`main` es la rama de verdad para esto — `dev-mateo` se mergeó a `main` el
2026-08-30 (merge commit `bc5a5a8`) precisamente para que el workflow viva
ahí y nunca dispare desde una rama de desarrollo.

## Infraestructura (resource group `documents`, holding Arcano)

- **Container App**: `arcano-crm` — Consumption, 1 vCPU / 2GiB, ingress
  externo público, puerto 3000, sin session affinity (JWT stateless).
- **Container Registry**: `nexuscorp.azurecr.io/arcano-crm:latest`.
- **Base de datos**: Azure Database for PostgreSQL Flexible Server
  `nexus-postgres`, base `crm_arcano` — 34 migraciones aplicadas, RLS real
  vía rol `crm_app` (no superusuario).
- **Azure Blob Storage**: cuenta `nexuscorp` — contenedor `isotipos`
  (público, logos de empresa vía `<img src>`) y `reportes` (privado,
  PDF/XLSX solo accesibles vía URL SAS temporal de 10 minutos).
- **Usuarios holding-wide iniciales** ya creados vía
  `backend/prisma/bootstrap-produccion.ts` — credenciales reales en
  `docs/credenciales-produccion-arcano.md` (gitignoreado, no en este doc).

## CI/CD — `.github/workflows/deploy-backend.yml`

- **Disparo**: push a `main` únicamente, y solo si el diff toca
  `backend/**`, `packages/schemas/**`, `pnpm-lock.yaml`,
  `pnpm-workspace.yaml` o el propio workflow (`paths:` filter). Un push que
  solo cambie frontend o docs no dispara nada. Deliberadamente NO se dispara
  desde `dev-mateo`/`test/gpt`.
- **Job `test`**: levanta un Postgres 16 de servicio efímero (usuario
  `crm_dev`), corre `prisma migrate deploy`, fija la contraseña de
  `crm_app` (creado por la propia migración) al mismo valor de
  `CI_POSTGRES_PASSWORD`, y corre `pnpm --filter backend test` completo.
- **Job `deploy`** (`needs: test`, no corre si `test` falla): login a Azure,
  build de `backend/Dockerfile`, push a ACR con tag `:latest` y
  `:${{ github.sha }}`, y `az containerapp update --image ...:${{ github.sha }}`.

### Secrets de GitHub requeridos (Settings → Secrets and variables → Actions)

Los 4 ya están configurados y confirmados funcionando (corrida verde del
2026-08-30):

| Secret | Para qué se usa | Es sensible de verdad? |
|---|---|---|
| `AZURE_CREDENTIALS` | Login del job `deploy` contra Azure (`azure/login@v2`) | Sí — credenciales reales de Azure |
| `CI_POSTGRES_PASSWORD` | Password del Postgres efímero de CI (admin `crm_dev` y app `crm_app`, mismo valor para ambos) | No — descartable, vive y muere con el contenedor de esa corrida |
| `CI_JWT_SECRET` | Satisface la validación obligatoria de `env.ts` (`JWT_SECRET` mín. 32 chars) para que el proceso arranque durante los tests | No — no protege nada real, solo evita el fail-fast de boot |
| `CI_TOKEN_ENCRYPTION_KEY` | Igual que arriba, para `TOKEN_ENCRYPTION_KEY` (hex 64 chars, AES-256) | No |

`META_APP_ID`/`META_APP_SECRET`/`META_WEBHOOK_VERIFY_TOKEN` en el job `test`
son valores inventados hardcodeados directo en el workflow (no secrets) —
los tests no llaman a la API real de Meta, solo hace falta que `env.ts` no
aborte el boot. No hace falta (ni conviene) poner credenciales reales de
Meta ahí.

## Bugs reales encontrados y corregidos al ejecutar el pipeline por primera vez

Estos NO existían antes porque nadie había corrido el pipeline completo de
punta a punta hasta el 2026-08-30:

1. **`pnpm-workspace.yaml` con `storeDir: /root/.pnpm-store-internal`
   hardcodeado** (agregado en `b2bb4c5` para un entorno local que corría
   como root) — rompía `pnpm install --frozen-lockfile` en el runner de
   GitHub Actions (`EACCES`, el usuario `runner` no puede escribir en
   `/root`). Fix: se quitó el override (commit `d77b036`); sin él, pnpm usa
   su store por defecto, que es escribible en cualquier entorno (local,
   Docker como root, runner de CI).
2. **`sla-atrasado.job.test.ts` prueba 8b, timeout de 5000ms** — la suite
   completa (1237 tests) corre secuencial (`fileParallelism: false`) contra
   una sola base compartida; el runner de CI es más lento que una máquina
   local y ese margen no alcanzaba bajo contención. Fix: timeout ampliado a
   15s solo para esa prueba (commit `912d9b9`) — no es un bug de lógica,
   solo un margen de tiempo insuficiente en CI.

## Decisiones/hallazgos del despliegue manual inicial (previo al pipeline)

- Azure Database for PostgreSQL Flexible Server: el admin NO es superusuario
  real (`rolsuper = false`) — la migración `20260827100000_rls_tenant_isolation`
  asumía que sí (revocaba un flag `BYPASSRLS` redundante ahí). Verificado con
  `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`
  antes de migrar. No hizo falta ningún fix de código: `crm_app`/`crm_bypass_jobs`
  se crean igual (necesitan `CREATEROLE`, no `SUPERUSER`), y el admin no
  necesitaba de vuelta el bypass para nada de lo que corre en este batch.
- La extensión `citext` no está en la lista blanca de Azure por default —
  hay que habilitarla en el servidor (`azure.extensions` server parameter)
  antes de la primera migración.
- `DATABASE_URL` (admin, solo migraciones) y `DATABASE_URL_APP` (runtime
  real, usuario `crm_app`) son DOS variables distintas y fáciles de
  confundir — un error real de esta sesión fue poner el usuario admin en
  `DATABASE_URL_APP`, causando `{"status":"degradado","database":"error"}`
  en `/salud` pese a que las migraciones corrían bien.
- Editar variables de entorno del Container App por el Portal y por
  `az containerapp update` en el mismo período genera inconsistencias (el
  formulario del Portal reenvía TODO su estado cacheado, pudiendo revivir
  una variable ya corregida por CLI). Recomendado: un solo camino por sesión
  de cambios, verificar con `az containerapp show` después de cualquier
  edición por Portal.
- El Dockerfile de producción (`RUN pnpm build` real, no `tsx` sin
  typecheck) destapó bugs de tipos reales que nunca se habían detectado
  (LinkedIn token rotation, bridgeApi `Partial`/`Pick`, Puppeteer
  `waitUntil`, `packages/schemas` nunca copiado a la imagen) — todos
  corregidos en `dev-mateo` antes del merge a `main`.

## Acceso Git — remote con dos identidades SSH

Este repo (`DinnZart/crm_comercial`) requiere la identidad de empresa para
push/fetch, no la personal. El remote `origin` está configurado como:

```
git@github.com-empresa:DinnZart/crm_comercial.git
```

usando el alias definido en `~/.ssh/config` (`Host github.com-empresa` →
`IdentityFile ~/.ssh/id_ed25519_empresa`). Si `git push`/`git fetch` da
`ERROR: Repository not found` con el remote apuntando a
`git@github.com:...` (sin el sufijo `-empresa`), es la identidad SSH
equivocada, no un problema de permisos del repo ni de red.

**Nota aparte (no arreglado, no bloqueante):** `git config remote.origin.fetch`
en este clon solo trae `test/gpt` (`+refs/heads/test/gpt:refs/remotes/origin/test/gpt`).
Un `git fetch origin` normal NO actualiza el ref local `origin/main` —
para chequear el estado real de `main` en el remoto hace falta
`git ls-remote origin main` en vez de confiar en `origin/main` local.

## Bridges sociales en producción — qué está listo para probarse

Verificado el 2026-08-30 contra las variables reales del Container App
(`az containerapp show`), no contra código ni suposición:

- **LinkedIn: SÍ, probarlo.** Las 4 variables núcleo están configuradas en
  producción con valores reales — `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`,
  `LINKEDIN_API_VERSION`, `LINKEDIN_REDIRECT_URI`. El flujo OAuth de conexión
  de una empresa (`GET /api/v1/bridges/:id/linkedin/oauth/iniciar` →
  callback) puede probarse de punta a punta contra la API real de LinkedIn.
  `LINKEDIN_API_BASE_URL` queda sin setear a propósito — es opcional y usa
  el endpoint real de LinkedIn por default.
- **WhatsApp: probable en modo prueba, no en producción real todavía.**
  Actualizado 2026-08-30, verificado contra el Container App real (`az
  containerapp show -n arcano-crm -g documents`): `META_APP_ID`,
  `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_OAUTH_REDIRECT_URI`
  y `META_ADS_OAUTH_REDIRECT_URI` ya tienen valor real (antes solo estaba el
  redirect URI). Webhooks configurados en el panel de Meta (`leadgen` en
  objeto Página, y el webhook de mensajería de WhatsApp), casos de uso
  agregados (WhatsApp, Marketing API — medir rendimiento y captar clientes
  potenciales).
  La app de Meta sigue en **modo Development** y el Business Portfolio
  todavía no pasó Verificación de Negocio — mientras tanto: (a) solo cuentas
  agregadas como Admin/Developer/Tester en el panel de la app pueden
  completar el flujo OAuth de conexión (`/api/v1/whatsapp/conectar`,
  `/api/v1/meta-ads/conectar`); (b) los mensajes de WhatsApp solo funcionan
  contra los hasta 5 números agregados como destinatarios de prueba en
  WhatsApp Manager, no con clientes reales sin agregar; (c) ninguna empresa
  cliente externa puede autoconectarse todavía. Suficiente para demos
  controladas con cuentas propias, no para uso productivo multi-tenant real.
- Mensajería de WhatsApp (Parte 2 — bandeja de conversaciones,
  envío/recepción real) ya está en `main` (commit `4e94a2f`), no es código
  pendiente — lo que falta para producción real es exclusivamente la
  configuración de Meta de arriba (App Review + modo Live + Verificación de
  Negocio), no backend.

## Frontend en VPS — preparación agregada (2026-08-31)

Se agregó la base operativa para desplegar solo el frontend en una VPS, mientras
el backend se mantiene en Azure Container Apps:

- `frontend/Dockerfile.prod`: imagen productiva multi-stage, build de Vite con
  `VITE_API_BASE_URL` y servidor Nginx.
- `deploy/frontend/nginx.conf`: fallback de SPA, cache de assets y endpoint
  `/health`.
- `deploy/frontend/docker-compose.yml`: Compose mínimo para la VPS, exponiendo
  puerto 8080 por defecto para no chocar con un proxy o web server existente en
  80.
- `.github/workflows/deploy-frontend-vps.yml`: tests y build de frontend antes
  de publicar imagen en GHCR y actualizar la VPS por SSH.
- `docs/despliegue-frontend-vps.md`: guía de secrets, variables, dominio,
  HTTPS y verificación.

El dominio se configura fuera del repo, en DNS: registro `A` del subdominio al
IP público de la VPS. Antes de uso real con usuarios, activar HTTPS y cambiar
`CORS_ORIGIN` del backend desde `*` al origen exacto del frontend.

## Pendiente / gaps conocidos

- **Incidente cerrado (2026-08-31): `tests/setup.ts` truncó producción.**
  El `globalSetup` de vitest (TRUNCATE de `usuarios`/`clientes`/`bridges`/
  `refresh_tokens`/`configuracion_empresa` antes de cada corrida) solo
  validaba `NODE_ENV=test`, nunca a qué base apuntaba `DATABASE_URL` — en
  algún momento la suite corrió con `NODE_ENV=test` pero `DATABASE_URL`
  apuntando a la base real de Azure en vez de `.env.dev`, confirmado por
  filas de fixture (`usuario-seed-N-*@t.local`) apareciendo en producción.
  Sin datos reales todavía en ese momento (fase de pruebas de
  integración), así que no hubo pérdida real. Corregido en `e2d6374`:
  allowlist de host (`db`/`localhost`/`127.0.0.1`/`::1`) que falla
  CERRADO. **Queda pendiente**: limpiar las filas de fixture que siguen
  en la base real (`usuario-seed-*@t.local`, `passwordHash: "x"`, no son
  credenciales usables pero ensucian los datos) antes de que empiece a
  haber clientes reales.
- Frontend todavía no desplegado en la VPS — ya existen los artefactos base de
  CI/CD, Docker, Nginx y documentación; falta preparar la VPS, configurar DNS,
  activar HTTPS y cambiar `CORS_ORIGIN` al dominio real del frontend.
- WhatsApp/Meta Ads: falta App Review + modo Live + Verificación de Negocio
  del Business Portfolio para uso productivo con clientes reales (ver
  sección arriba) — la config técnica (env vars, webhooks, casos de uso) ya
  está lista.
- Leads de Facebook Ads vía Página (`CuentaPublicitaria`, bridge legacy con
  Page Access Token pegado a mano): sigue sin migrar a OAuth. Requiere
  además "instalar la app en la Página" (`POST /{page-id}/subscribed_apps
  ?subscribed_fields=leadgen`) por cada Página conectada — paso manual
  aparte de suscribir el campo `leadgen` en el panel de Webhooks.
- Roadmap de seguridad multitenant (2026-08-30) — **completo**: scope por
  empresa en `/usuarios`/`/bridges` (`dd2c1da`), `empresaId` opcional en
  las 13 funciones de métricas (`5b4cea9`), alta de administrador de
  empresa (`6996f90`), bypass holding-wide completo + filtro
  `soloHoldingWide` (`a76c62b`), cutover de "Vendedor" a permiso + fix P0
  de traspaso sin asesor (`6083399`), `GET/POST /empresas` +
  `GET /empresas/:id` (`8843b99`, `f523699`). Todos verificados con tests
  reales, todos en `main`. Sigue pendiente, sin código involucrado: cutover
  de `ROLES_ACCESO_TOTAL` en los 8→3 archivos reales que faltaban ya se
  cerró también (`a76c62b`); lo único que queda del roadmap original es
  administrativo (App Review de Meta, definición de alcance de WhatsApp
  Parte 2).
- Logs de producción: los access logs HTTP (método/URL/**status
  code**/duración) no se veían — el filtro de supresión de logs sin
  contexto tenant (`logger.ts`, para no filtrar datos de negocio sin
  límite de tenant confirmado) los borraba también a ellos, aunque no son
  datos de negocio. Corregido (`3c62698`): se marcan con `accessLog: true`
  vía `customProps` de `pino-http` en `app.ts`, exentos del filtro. Ya se
  puede ver el status code real de cualquier request en los logs del
  Container App.
