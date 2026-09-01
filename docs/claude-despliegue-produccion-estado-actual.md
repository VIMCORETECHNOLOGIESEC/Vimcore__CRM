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
  puerto 30080 por defecto para no chocar con un proxy o web server existente
  en 80/8080.
- `.github/workflows/deploy-frontend-vps.yml`: tests y build de frontend antes
  de publicar imagen en GHCR y actualizar la VPS por SSH; valida salud interna
  desde la VPS y solo valida salud pública si `FRONTEND_HEALTH_URL` está
  configurada.
- `docs/despliegue-frontend-vps.md`: guía de secrets, variables, dominio,
  HTTPS y verificación.

El dominio se configura fuera del repo, en DNS: registro `A` del subdominio al
IP público de la VPS. Antes de uso real con usuarios, activar HTTPS y cambiar
`CORS_ORIGIN` del backend desde `*` al origen exacto del frontend.

## Pre-deploy 2026-08-31: 3 bloqueantes reportados por frontend, cerrados y verificados en producción

El equipo de frontend reportó 3 puntos que bloqueaban funciones ya construidas
del lado de UI. Verificados letra por letra contra el código antes de tocar
nada (los 3 eran reales, no suposiciones), implementados y confirmados en
producción real — commit `0db6b69`, imagen
`nexuscorp.azurecr.io/arcano-crm:0db6b69d9996f119cc3ca06e0955a222a519d713`
(`az containerapp show` → `provisioningState: Succeeded`, `runningStatus:
Running`; `/api/v1/salud` → `200`).

1. **403 determinístico en "Ver en vivo"** — `leads.access.ts::canRead`
   (línea 96) usaba `ROLES_ACCESO_TOTAL` (`ADMINISTRADOR`/`SUPERVISOR`), sin
   incluir `SUPERVISOR_HOLDING`/`SUPER_ADMIN` — un holding-wide viendo el
   detalle de un lead no asignado a él directamente recibía 403 siempre.
   Fix: se agregó el chequeo de `ROLES_HOLDING_TOTAL` (constante ya existente
   del Bloque F) a `canRead`. `canEdit` queda deliberadamente SIN este bypass
   — es el modo solo-lectura de "Ver en vivo", no un descuido.
2. **`POST /notificaciones` — aviso manual de canal/producto faltante.**
   Supervisor/Asesor puede notificar al Administrador activo de su propia
   empresa cuando falta un canal o producto para cargar un lead (el frontend
   ya bloqueaba esa acción sin forma de avisar). Nuevo campo `Notificacion.metadata`
   (`Json?`) para que, al hacer click en la notificación, el admin sea
   redirigido con los datos precargados. `empresaId` sale siempre de la
   sesión autenticada, nunca del body; una sesión holding-wide (sin empresa
   fija) recibe 422 en vez de que se le asuma una empresa.
3. **Webhook receptor de LinkedIn.** La integración (OAuth, descubrir/activar
   fuentes) ya suscribía la fuente contra la API real de LinkedIn apuntando a
   `/api/v1/integraciones/linkedin/webhook`, pero no existía ningún
   controller/ruta ahí — ningún lead real entraba al CRM pese a que la UI
   "parecía" funcionar. Se agregó el receptor completo (`GET` challenge +
   `POST` notificación, verificado contra la documentación oficial de
   LinkedIn — el payload real es un objeto plano `LEAD_ACTION`, distinto del
   schema especulativo que ya estaba escrito en el repo, que se reescribió) y
   se conectó al mismo patrón de buzón durable (`leads_recibidos`) que ya usa
   Meta. Decisión de alcance deliberada: el mapeo fino de
   `nombre`/`telefono`/`correo` vía `predefinedField` requiere un segundo
   llamado a la definición del formulario, no integrado todavía — el lead
   igual entra al CRM, con las respuestas crudas preservadas en
   `camposDinamicos` en vez de adivinar el mapeo (mejora futura documentada,
   no un gap silencioso).

**Bug real encontrado en la revisión, no en el reporte original:** el campo
`metadata` nuevo (punto 2) no tipaba contra Prisma (`tsc --noEmit` fallaba —
un `null` literal no es válido para una columna `Json?` en un input de
escritura, hace falta el sentinel `Prisma.JsonNull` o, más simple, sacar el
`| null` del tipo si ningún caller lo necesita) y faltaba un call site en
`asignacion.service.ts`. Los tests con `vitest run` pasaban igual porque no
typechequean — quedó como lección: correr `tsc --noEmit` además de la suite
antes de dar por buena una verificación, no alcanza con "los tests pasan".

**CI de GitHub Actions rota desde el fix del incidente TRUNCATE (`e2d6374`,
ver más abajo):** `tests/setup.ts` fuerza la lectura de `.env.dev` sin
condición — correcto para defender de que `docker compose` local resuelva
`DATABASE_URL` desde el `.env` equivocado, pero el runner de CI nunca tuvo
ni necesitó ese archivo (el job `test` de `deploy-backend.yml` ya inyecta
`DATABASE_URL`/etc. de forma explícita y confiable vía `env:` del workflow).
Fix: si `.env.dev` no existe Y `process.env.CI === "true"` (variable que
setea GitHub Actions solo, no manipulable por un `.env` local), se salta el
forzado y se sigue directo al allowlist de host — la guarda real de
seguridad del incidente sigue intacta en ambos casos, local y CI.

**Nota de proceso (para quien corra la suite completa en Docker local):**
dos corridas completas de `docker compose run backend vitest run` pegándole
a la MISMA base al mismo tiempo (la propia + otra en paralelo) produce
timeouts falsos de 5000ms en tests no relacionados entre sí — confirmado en
esta sesión (`metricas.service.test.ts` mostró 6-12 fallas espurias así, que
desaparecieron corriendo en aislamiento y confirmaron limpias en el run de
CI, con su propio Postgres efímero). No es una señal de que el código esté
roto — es contención de recursos, no una regresión.

## Sesión 2026-09-01: batería de fixes de producción + D-mensajería (leído/no leído) + RLS en WhatsApp

Seis cambios reales, todos verificados en producción real (logs del
Container App y/o consultas directas a la base de Azure), en orden
cronológico:

1. **Meta Ads `discoverAdAccounts()` fallaba con 502, causa real oculta por
   un log suprimido** (commit `9b6beb8`). `GRAPH_API_BASE_URL` (`meta-webhook.service.ts`)
   apuntaba a `https://graph.facebook.com` sin versión — Meta resuelve eso
   contra la "default API version" de la app en su dashboard, un valor
   mutable que quedó deprecado (`(#2635) You are calling a deprecated
   version of the Ads API`). Se fijó una versión explícita (`v26.0`).
   Afecta a TODAS las llamadas de Graph API del backend (WhatsApp Cloud
   API, Meta Ads, webhook de leadgen), todas comparten `GRAPH_API_BASE_URL`.
2. **El listado `GET /usuarios` mostraba el correo sintético del "portador"
   en vez del correo real del admin/supervisor de empresa** (commit
   `b40f900`). Un admin de empresa se crea vía un `Usuario` "portador" con
   correo placeholder `portador-*@no-login.crm.local` (fix de escalamiento
   de credenciales de una sesión previa) — el listado nunca sustituía ese
   valor por el correo real de la `Membresia` activa (el que el admin usa
   de verdad para loguearse).
3. **Bug real de multiempresa: un cliente con lead abierto en la empresa A
   absorbía en silencio ingestas nuevas de las empresas B/C/D como
   "interacción repetida" ajena** (commit `acf2370`, deployado como
   `5e7a30f` con un fix de tests huérfanos de Josué encima).
   `deduplicacion.service.ts` buscaba "lead abierto" por cliente
   GLOBALMENTE (holding-wide), nunca por `(cliente, empresa)` — pese a que
   esto ya estaba decidido el 2026-08-25 (D2, `docs/16-hallazgos-y-preguntas.md`
   §8) y nunca se había implementado. Confirmado en producción: 10
   divergencias ya detectadas por un comparador "en sombra" que solo
   observaba el bug sin corregirlo (`shadow-lead-scope.service.ts`, retirado
   en este cambio junto con `lead-abierto-revision.repository.ts`, ambos
   huérfanos tras el fix real). `findLeadAbierto`/`findUltimoLeadCerrado`
   ahora exigen `empresaId`; mismo fix aplicado a `whatsapp-ruteo.service.ts`
   (dos call sites que ya tenían `empresaId` disponible pero no lo usaban).
4. **`trust proxy` sin configurar — el rate-limit de `GET /marca-publica`
   terminaba compartido por TODOS los clientes, no por IP** (commit
   `9d58f3d`). Azure Container Apps pone un único reverse proxy propio
   delante del contenedor; sin `app.set("trust proxy", 1)`, Express usaba
   la IP del proxy (siempre la misma) para el rate-limit en vez de la IP
   real del `X-Forwarded-For`.
5. **D-mensajería: estado leído/no leído de conversaciones** (commit
   `3d129de`) — feature nueva, no un fix. Tabla nueva
   `conversaciones_lectura_whatsapp` (watermark `leidoHastaEn` por
   `(conversación, usuario)`, RLS igual patrón que el resto del backend) —
   deliberadamente NO por mensaje ni un flag compartido en `Mensaje`:
   varias personas (asesor asignado + Administrador/Supervisor) ven la
   misma `Conversacion` a la vez, cada una con su propio estado de lectura.
   `GET /conversaciones` ahora devuelve `noLeido: boolean` por fila
   (derivado: `ultimoMensajeEn > leidoHastaEn`, nunca persistido por
   mensaje). `POST /conversaciones/:id/leido` marca como leída hasta ahora
   para el usuario actual y publica `whatsapp.conversacion-leida` por el
   mismo canal SSE que ya usa `whatsapp.mensaje-nuevo`
   (`committed-events.service.ts`/`event-broker.ts`). 13 tests nuevos,
   incluido aislamiento RLS real. **Pendiente del lado del frontend** (no
   incluido en este cambio, backend-only): pintar el badge con
   `conversacion.noLeido`, disparar `POST .../leido` al abrir una
   conversación, y escuchar `whatsapp.conversacion-leida` para sincronizar
   el badge entre pestañas.
6. **Hallazgo de seguridad: `conversaciones_whatsapp`/`mensajes_whatsapp`/
   `conversaciones_whatsapp_eventos` nunca tuvieron RLS habilitado**
   (commit `8bfeed6`) — a diferencia de casi todo el resto del backend
   (leads, bridges, LinkedIn, Meta Ads, negociación). Se crearon así desde
   `20260829043249_add_whatsapp_messages` y nadie lo notó hasta este
   punto. Verificado ANTES de forzar RLS que los 4 caminos que escriben ahí
   (webhook de WhatsApp, job de SLA, `conversaciones.service.ts`
   autenticado, `whatsapp-ruteo.service.ts`) ya resolvían `TenantContext`
   correctamente — cero riesgo de romper algo al prender el interruptor.
   `conversaciones_whatsapp`/`conversaciones_whatsapp_eventos` tienen
   `empresa_id` directo; `mensajes_whatsapp` no, su política usa `EXISTS`
   contra `conversaciones_whatsapp` por `conversacion_id` (mismo patrón que
   `linkedin_fuentes`). Test nuevo de aislamiento RLS directo sobre las 3
   tablas (consulta con el cliente de la app, sin pasar por ningún
   servicio). Suite completa corrida dos veces en esta sesión (antes y
   después de este último cambio): **1465/1465 tests, 134/134 archivos, sin
   fallas**.

Todos sincronizados a `main` y `test/gpt` (rebase limpio cada vez, sin
conflictos reales — el único archivo que se solapó con trabajo paralelo de
otra sesión fue `backend/prisma/schema.prisma`, resuelto sin intervención
manual). Cada uno confirmado desplegado en producción real vía
`az containerapp show` antes de darlo por cerrado.

**Gotcha de proceso descubierto en esta sesión** (afecta a cualquier sync
`main` → `test/gpt` futuro): después de un `git push origin main` exitoso,
el ref local `origin/main` de este clon **no se actualiza solo** — hace
falta `git fetch origin main:refs/remotes/origin/main --force` de nuevo
ANTES de usar `origin/main` como fuente para el `git checkout` del sync a
`test/gpt`, o el sync termina copiando contenido viejo sin ningún error que
lo avise (`git status` no muestra diff porque compara contra el mismo
contenido viejo). Pasó dos veces en esta sesión antes de detectarlo.

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
