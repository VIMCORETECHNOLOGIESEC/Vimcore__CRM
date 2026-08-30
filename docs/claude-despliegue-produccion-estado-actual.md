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
- **WhatsApp: TODAVÍA NO.** Solo `WHATSAPP_OAUTH_REDIRECT_URI` está
  configurada; no tiene credenciales de app propias más allá de eso. El
  código existe y está montado en las rutas
  (`backend/src/{controllers,services,repositories,routes}/whatsappMessages/`),
  pero no hay nada real detrás para que un flujo de conexión funcione en
  producción todavía. No pedirle a nadie que pruebe WhatsApp hasta que se
  complete esa configuración.

## Pendiente / gaps conocidos

- Frontend todavía no desplegado (va a un VPS aparte) — `CORS_ORIGIN` sigue
  en `*` temporalmente, cambiar al dominio real del frontend en cuanto
  exista.
- WhatsApp: falta terminar de configurar sus credenciales de app en
  producción antes de que el bridge sea probable de verdad (ver sección
  arriba).
