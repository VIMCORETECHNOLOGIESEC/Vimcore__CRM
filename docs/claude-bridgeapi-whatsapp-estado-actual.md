# Handoff bridgeApi + whatsappMessages — estado actual (2026-08-29)

> **Material de coordinación:** explica dónde quedaron estos dos módulos y qué
> falta. No reemplaza a `docs/00-estado-documentacion.md`, Prisma, migraciones
> ni tests. Rama de trabajo: `dev-mateo`, partida de `test/gpt` en el commit
> donde también vive `docs/claude-linkedin-estado-actual.md` (trabajo paralelo
> de LinkedIn, no tocado por este handoff).

## bridgeApi (`RedSocial.API_EXTERNA`) — completo de punta a punta

Schema → adapter → repositories → services (config + prueba de conexión) →
controllers/routes → job de polling programado. Todo comiteado en `test/gpt`
antes de hoy (`f20d635`, `bebcdd5`, `6bcf002`, `4dfe7d8`, `c46e617`). Nada
pendiente de este módulo en esta sesión — no generó commits nuevos hoy.

Endpoints: `POST /bridges` (crear, `redSocial: API_EXTERNA`),
`PATCH /bridges/:id/api-externa/conexion`, `PATCH /bridges/:id/api-externa/mapeo`,
`POST /bridges/:id/api-externa/probar-conexion`. Contrato completo en
`docs/contrato-frontend-bridge-api_mat_01.md`.

## whatsappMessages — schema + backend completo, falta credenciales reales y un endpoint

### Qué ya está hecho

- Schema Prisma: `WhatsAppConexion`, `WhatsAppOAuthState`, `Conversacion`,
  `ConversacionEvento`, `Mensaje` + `RedSocial.WHATSAPP`. Migración
  `20260829043249_add_whatsapp_messages` **ya aplicada**.
- Flujo OAuth (Embedded Signup): `GET /whatsapp/conectar` →
  `GET /whatsapp/callback` (descubre números, no conecta) →
  `POST /whatsapp/conexion` (elige número, persiste cifrado).
- Webhook entrante: `GET`/`POST /webhooks/whatsapp`, verificado por firma
  `X-Hub-Signature-256` (reusa `lib/firma-meta.ts`, mismo mecanismo que Meta
  Lead Ads).
- Mensajería: `GET /conversaciones`, `GET /conversaciones/:id/mensajes`,
  `POST /conversaciones/:id/mensajes` (envío real vía WhatsApp Cloud API).
- Ruteo por asignación existente: si el `Cliente` ya tiene un `Lead` con
  asesor, la `Conversacion` rutea ahí; si no, dispara la misma asignación
  automática por pool (menor carga + FIFO) que ya usan los demás bridges, y
  la misma regla de reingreso de 90 días.
- SLA real: `jobs/whatsappMessages/whatsapp-sla.job.ts` reasigna
  automáticamente una `Conversacion` sin respuesta en `SLA_HORAS`
  (`config/negocio.ts`, reusada, no un valor nuevo) — historial completo en
  `ConversacionEvento` (mirror de `LeadEvento`).
- `.env.example` documentado (`WHATSAPP_OAUTH_REDIRECT_URI`, reusa
  `META_APP_ID`/`META_APP_SECRET`/`META_WEBHOOK_VERIFY_TOKEN`).
- Contrato de endpoints para el frontend: `docs/contrato-frontend-whatsapp-api_mat_04.md`.
- Guía para crear la App de Meta / sandbox de prueba:
  `docs/crear-app-meta-whatsapp-sandbox_mat_03.md`.

### Qué falta para mañana (deploy)

1. **Credenciales reales** — `WHATSAPP_OAUTH_REDIRECT_URI` con la URL pública
   del backend ya desplegado (no `localhost`), registrada tal cual en el
   dashboard de la Meta App (Facebook Login for Business / Embedded Signup).
2. **`GET /whatsapp/conexion`** — no existe todavía (a diferencia de
   LinkedIn, que sí tiene su equivalente). El repositorio ya tiene
   `findByEmpresaId`; falta el controller/ruta si el frontend necesita
   consultar el estado de conexión fuera del flujo de conectar. Documentado
   como gap explícito en el contrato mat_04.
3. **Correr la suite completa una vez desplegado**, después de que se
   mergeen los cambios de LinkedIn del compañero:
   ```bash
   sudo docker compose exec -T -e NODE_ENV=test backend pnpm test
   ```
   Único fallo esperado y ya documentado: timeouts transitorios de
   `sla-atrasado.job.test.ts` bajo contención de Docker con la suite
   completa (no-regresión, confirmado corriendo el archivo solo).

## Archivos entrelazados con el trabajo paralelo de LinkedIn (no tocados)

`backend/src/config/env.ts` mezcla la validación de `LINKEDIN_*` (bloque
`superRefine` completo) con la línea de `WHATSAPP_OAUTH_REDIRECT_URI` dentro
del mismo objeto de schema Zod — no se pudo separar en un commit limpio sin
inventar una versión intermedia que nunca existió tal cual. Queda sin
commitear en esta sesión; lo coordina quien cierre el trabajo de LinkedIn
(`docs/claude-linkedin-estado-actual.md`).

`docker-compose.yml` (variables `LINKEDIN_*` del servicio `backend`) y los
schemas/tests bajo `backend/src/schemas/linkedin/`,
`backend/tests/adversarial/rls-*.test.ts` son 100% de ese mismo trabajo
paralelo — no se tocaron ni se commitearon desde acá.
