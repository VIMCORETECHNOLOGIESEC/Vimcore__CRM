# 06 — Módulos backend y checklist de avance

Marca cada casilla al completar el ciclo TDD (RED → GREEN → TRIANGULATE →
REFACTOR) del elemento. Un módulo no está terminado hasta que su columna de
pruebas obligatorias está cubierta.

Estructura por módulo: `routes/ → controllers/ → services/ → repositories/`

---

## Estado consolidado (verificado contra código real en `test/integration`, 2026-08-19)

| Módulo | Estado | Pendientes |
|---|---|---|
| M1 — Base e infraestructura | ✅ Completo | — |
| M2 — Autenticación y usuarios | ✅ Completo | — |
| M3 — Normalización y deduplicación | ✅ Completo | — |
| M4 — Ingesta y bridges | ⚠️ Parcial | Adaptador LinkedIn (bloqueado por aprobación externa del Marketing Developer Platform); adaptador X dedicado (trivial sobre el endpoint genérico, no implementado) |
| M5 — Gestión de leads | ⚠️ Completo con deuda técnica | Parámetro `vista=activos\|cerrados` sin implementar (`listLeadsQuerySchema`); `limite` valida rango abierto 1-100 en vez de whitelist 10/25/50/100 (ver "Backlog no bloqueante" más abajo) |
| M6 — Asignación, traspaso y SLA | ✅ Completo | — |
| M7 — Citas | ✅ Completo | — |
| M8 — Notificaciones y tiempo real | ✅ Completo | — |
| M9 — Dashboard y métricas | ✅ Completo | — |

**Ningún módulo backend propuesto está sin empezar.** 7 de 9 están terminados al 100%. M4 tiene dos adaptadores externos pendientes por diseño (dependencia externa documentada desde el inicio, no un olvido — ver "Orden de ejecución sugerido" al final de este documento). M5 tiene dos deudas técnicas puntuales y acotadas, ninguna bloqueante para el resto del sistema.

---

## Backlog no bloqueante — mejoras post-lanzamiento

Verificado contra `docs/01-alcance-mvp.md`: ninguno de estos ítems fue prometido en el scope MVP original, o ya tiene workaround funcional. No bloquean el lanzamiento.

- **`limite` sin whitelist** (M5, `leads.schema.ts::listLeadsQuerySchema`): valida rango abierto 1-100 en vez de la whitelist fija 10/25/50/100 que usa el frontend. Endurecimiento defensivo, sin exploit conocido (ya capado en 100). Esfuerzo: trivial (1 línea de schema).
- **Parámetro `vista=activos|cerrados`** (M5, `GET /leads`): mejora de UX decidida durante el desarrollo de F3 (tabs "Pendientes/Cerrados"), no prometida en `01-alcance-mvp.md`. Esfuerzo: bajo (schema + `buildWhere` en `leads.service.ts`).
- **Validación de traspaso asesor→vendedor y conflicto de rol dual, pendiente de confirmar con el cliente** (no es deuda de código): `docs/01-alcance-mvp.md` riesgos R4 y R6 pedían validar con el cliente la regla de traspaso y el conflicto "misma persona = asesor y vendedor" **antes de M6**. M6 ya está completo, implementado sobre el supuesto de `docs/02-reglas-negocio.md` §5 (marcado ahí mismo como "a confirmar"), sin evidencia documentada de que esa validación con el cliente haya ocurrido. Conviene cerrar esta decisión de producto antes de operar con usuarios reales que puedan combinar ambos roles.

---

## M1 — Base e infraestructura

> **Progreso:** implementado en `configuracion-base-monorepo` (PR1
> `feat/configuracion-base-backend`, PR2 `feat/configuracion-base-frontend`),
> verificado PASS con 2 advertencias no bloqueantes (deriva de pnpm entre
> `onlyBuiltDependencies` y `allowBuilds`; reinstalación completa de pnpm en el
> primer arranque del contenedor).

- [x] Monorepo pnpm con workspaces `backend` y `frontend`
- [x] Express + TypeScript con configuración estricta del compilador
- [x] Prisma conectado a PostgreSQL en Docker
- [x] Esquema inicial completo y primera migración (2026-08-19). Ítem
      obsoleto del arranque de M1: el schema ya pasó por 14 migraciones
      acumuladas a través de M3-M4 (`backend/prisma/migrations/`), muy por
      encima de "la primera" — se marca completo en vez de dejarlo como deuda
      fantasma del checklist.
- [x] Middleware de errores centralizado con clase `AppError`
- [x] Validación con Zod en el borde de cada controller (`auth.controller`;
      `salud.controller` no recibe body/params/query, no aplica — hallazgo H3
      del diseño de `m1-completo-m2-autenticacion`)
- [x] Registro de eventos estructurado (`pino` + `pino-http`, con redacción de
      credenciales y tokens)
- [x] Variables de entorno validadas al arranque; el proceso no inicia si falta una
- [x] Semillas de datos para desarrollo (un usuario `activo=true` por cada rol
      de `RolUsuario`; campañas de prueba quedan para M4, fuera de alcance de
      este cambio)

---

## M2 — Autenticación y usuarios

Desacoplado a propósito: otro equipo integrará el SSO contra esta misma API.

- [x] `POST /api/v1/auth/login` — devuelve JWT de acceso y refresh
- [x] `POST /api/v1/auth/refresh`
- [x] `POST /api/v1/auth/logout`
- [x] `GET /api/v1/auth/perfil`
- [x] Hash de contraseña con argon2id (`@node-rs/argon2`)
- [x] Middleware `requiereAutenticacion` (identificador real: `requireAuthentication`)
- [x] Middleware `requiereRol(...roles)` (identificador real: `requireRole(...roles)`)
- [x] CRUD de usuarios (solo administrador — `requireRole("ADMINISTRADOR")` en los 5 endpoints)
- [x] Reactivación de usuario dado de baja — `PATCH /api/v1/usuarios/:id
      { activo: true }` (mismo endpoint de update, mismo patrón que
      `PATCH /bridges/:id { estado: "ACTIVO" }`, 2026-08-20): SOLO fija
      `activo=true`, sin validar el estado previo (no-op idempotente si ya
      está activo). NO restaura la cartera reasignada por `deactivateUsuario`
      ni reemite tokens/sesión — el usuario reactivado arranca con cartera
      vacía y vuelve a recibir leads por asignación normal hacia adelante.
- [x] Baja lógica de usuario con reasignación obligatoria de su cartera activa
      — `DELETE /api/v1/usuarios/:id` (`usuarios.service.ts::deactivateUsuario`)
      es transaccional de punta a punta: si el usuario dado de baja es
      `ASESOR`/`VENDEDOR` y tiene cartera abierta (leads en su pool, no
      terminales; para `ASESOR` excluye los ya traspasados con
      `vendedorId` no nulo), cada lead se reasigna a un candidato activo del
      mismo pool (reutiliza `selectResponsable` para elegir candidato
      lead-por-lead en memoria; la escritura persiste agrupada por receptor
      con `applyAsignacionesEnLote` de `asignacion.service.ts` — fix de
      bulk writes, O(candidatos) en vez de O(cartera) — motivo
      `baja_usuario`). **"Obligatoria" =
      bloqueante**: si no hay ningún otro candidato activo del mismo pool
      (p. ej. es el último asesor activo), la baja se rechaza entera con 409
      `baja_sin_candidato_reasignacion` — nada se persiste (ni la baja ni
      ninguna reasignación parcial). `activo=false` + revocación de refresh
      tokens sigue en la misma transacción. `ADMINISTRADOR`/`SUPERVISOR`
      nunca tienen cartera, así que su baja nunca dispara reasignación.

**Pruebas obligatorias:** cada endpoint protegido rechaza petición sin token, con
token expirado y con rol insuficiente.

---

## M3 — Normalización y deduplicación

El módulo de mayor riesgo del sistema. Un error aquí corrompe la base de clientes
de forma progresiva y difícil de revertir.

- [x] Normalizador de teléfono a E.164 con país por defecto EC
- [x] Manejo de teléfono no normalizable sin descartar el lead
- [x] Normalizador de correo para comparación, preservando el original
- [x] Resolución de identidad de cliente por teléfono normalizado
- [x] Alta de correo adicional a cliente existente
- [x] Detección de lead abierto y registro de interacción repetida
- [x] Regla de reingreso con ventana de 90 días
- [x] Manejo de `ON CONFLICT` en la inserción de cliente (condición de carrera)

**Pruebas obligatorias:** batería de números en distintos formatos (con y sin
prefijo, con espacios, con guiones, inválidos); dos webhooks simultáneos con el
mismo teléfono producen un solo cliente; lead cerrado hace 89 días no genera
reingreso, hace 91 días sí.

---

## M4 — Ingesta y bridges

> **Progreso:** rebanada inicial implementada en `m4-ingesta-bridges-parcial`
> (endpoint genérico + adaptador Google Forms). Nota obsoleta (2026-08-19):
> este párrafo listaba como "fuera de alcance" el CRUD de administración de
> token y los trabajos programados de verificación de token/bridge mudo —
> ambos ya se implementaron y están marcados abajo. LinkedIn (adaptador OAuth2
> + consulta programada) y X (no requiere adaptador propio: reusa
> `POST /api/v1/ingesta/generico`, ya implementado, ver §5 de
> `05-bridges.md`) quedan como próximo desarrollo — LinkedIn bloqueado
> externamente por la aprobación del Marketing Developer Platform (semanas).
>
> **Corrección retroactiva (M5, DD1):** `deduplicacion.service.ts::createLead`
> no poblaba `redSocial`/`payloadOriginal`/`camposDinamicos` en `leads` pese a
> que `LeadEntrante` ya los traía completos — quedaban NULL en todo lead nuevo.
> Corregido en `m5-gestion-leads` PR1 (commit `79f95aa`), con backfill NULL-only
> para leads previos (`camposDinamicos` queda fuera del backfill a propósito,
> ver `migration.sql`). El contrato y los endpoints de M4 no cambiaron.
>
> **Adaptador Meta (2026-08-18):** handshake + verificación de firma + consulta
> de detalle implementados (`GET`/`POST /api/v1/ingesta/meta`,
> `adapters/meta.adapter.ts`, `services/meta-webhook.service.ts`,
> `lib/firma-meta.ts`). Fuera de esta rebanada, explícitamente: endpoints de
> administración de token (carga/renovación contra `/debug_token`) y el trabajo
> programado de verificación diaria de token — ambos ya listados abajo, sin
> marcar. `campaign_id` se agregó a la consulta de detalle
> (`GET /{leadgen_id}?fields=...,campaign_id`) — `LeadEntrante.idExternoCampania`
> ya no queda `null` a propósito; se resuelve desde ahí, `null` solo si Graph
> API no lo devuelve para ese lead puntual.
>
> **Webhook de Meta pasado al patrón durable (2026-08-18, cambio consciente):**
> el `POST` ya NO consulta Graph API de forma síncrona antes de responder.
> Encola cada `leadgen_id` en el mismo buzón `leads_recibidos` que usa
> `POST /api/v1/ingesta/generico` (`repositories/lead-recibido.repository.ts::
> aceptarLeadgenMetaPendiente`, sobre `META_PENDIENTE_DETALLE` v2, idempotente
> por `(bridgeId, leadgenId)`). La consulta de detalle (con sus 3 reintentos),
> el mapeo a `LeadEntrante` y la actualización de `estadoToken` ante token
> inválido corren en el worker, DESPUÉS del commit del recibo
> (`meta-webhook.service.ts::resolverLeadgenMeta`, invocado desde
> `ingesta.service.ts::procesarRecepcion` — resuelve el `LeadEntrante` ANTES de
> abrir la transacción de dedupe, porque la llamada a Graph API es I/O lento
> que nunca debe correr dentro de una transacción de Postgres abierta; el
> lease de 60s adquirido por `claimNext` protege esa ventana). Reutiliza el
> mecanismo de reintento/`FALLA_MANUAL` ya existente del worker genérico en
> vez de inventar uno nuevo solo para Meta — un fallo irrecuperable (cuenta no
> encontrada, token no vigente, Graph API agotando reintentos) lanza y deja
> que el ciclo estándar de 60s/300s decida.
>
> **Fix (2026-08-18):** `aceptarLeadgenMetaPendiente` inserta
> `leads_recibidos.datos_incompletos = false` siempre, porque al encolar el
> webhook solo se conoce `leadgen_id`/`page_id` — el teléfono/correo real
> recién se sabe tras resolver el detalle en el worker. `completeClaim`
> ahora recibe `datosIncompletos` (calculado sobre el `LeadEntrante` YA
> resuelto) y lo persiste en el mismo `UPDATE` que cierra la recepción, así
> la bitácora de auditoría queda alineada con el lead real.
>
> **Fix (2026-08-19):** al investigar el fix anterior se encontró que
> `procesarRecepcion` (el worker durable que reemplazó al `ingestarLead`
> síncrono retirado) registraba SIEMPRE `bridge_logs` nivel INFO al
> completar, para **cualquier bridge** — v1 genérico incluido, no solo Meta.
> Era una regresión de la migración al buzón durable: el contrato retirado
> (`describe.skip` en `ingesta.service.test.ts`) sí distinguía
> INFO/ADVERTENCIA según `datosIncompletos`, y esa distinción se perdió al
> mover la lógica al worker. Corregido: `procesarRecepcion` unifica el nivel
> para todos los bridges (`ADVERTENCIA` si `datosIncompletos`, `INFO` si no),
> restaurando la regla de docs/05-bridges.md §8 ("notificar a supervisores")
> sin distinguir v1/v2 — ya no hace falta una rama especial para Meta.

- [x] Contrato `LeadEntrante` y normalizador compartido
- [x] Buzón PostgreSQL `leads_recibidos` con idempotencia, lease y recuperación
- [x] Endpoint genérico `POST /api/v1/ingesta/generico` con clave por bridge
- [x] Adaptador Google Forms
- [x] Adaptador Meta — handshake: responder `hub.challenge` en la suscripción
      inicial (`GET /api/v1/ingesta/meta`, `META_WEBHOOK_VERIFY_TOKEN`)
- [x] Adaptador Meta — verificación de firma `X-Hub-Signature-256`
      (HMAC-SHA256 con `META_APP_SECRET` sobre el cuerpo crudo, `lib/firma-meta.ts`)
- [x] Adaptador Meta — consulta de detalle (ejecutada por el worker durable,
      no por el `POST` del webhook): `GET /{leadgen_id}` con el Page Access
      Token descifrado, `campaign_id` incluido en los `fields`, reintento con
      backoff exponencial (3 intentos), y registro del `leadgen_id` en
      `bridge_logs` para reproceso manual si se agotan; token ya
      `TOKEN_EXPIRADO`/`ERROR` u error de Graph API que indica token
      inválido/revocado (código 190) evita/corta los reintentos y marca la
      cuenta `TOKEN_EXPIRADO`
- [x] Adaptador Meta — webhook encolado en `leads_recibidos` (sobre
      `META_PENDIENTE_DETALLE`, idempotente por `(bridgeId, leadgenId)`):
      mismo patrón de buzón/lease/worker que el endpoint genérico
- [ ] Adaptador LinkedIn: OAuth, consulta programada, refresco de token
- [ ] Adaptador X sobre el endpoint genérico con atribución UTM
- [x] Endpoints de administración de token de Meta (`05-bridges.md` §7): carga
      y renovación con verificación inmediata contra `/debug_token`; el token
      nunca se devuelve por API (2026-08-18). Contrato real por
      `CuentaPublicitaria` (una Página), NO por `Bridge` — un bridge puede
      tener varias Páginas, cada una con su propio Page Access Token
      (`03-modelo-datos.md`). `POST /bridges/:id/cuentas/:cuentaId/token`
      (`services/meta-token.service.ts::verificarTokenPagina`,
      `services/cuenta-publicitaria.service.ts::cargarToken`): un solo intento
      contra `/debug_token`, sin reintento/backoff (a diferencia de la consulta
      de detalle de leadgen); un token que Graph API rechaza responde 422 y
      NUNCA se cifra ni se persiste. `POST
      /bridges/:id/cuentas/:cuentaId/probar-conexion`
      (`cuenta-publicitaria.service.ts::probarConexion`): puramente
      diagnóstica, nunca modifica `estadoToken` ni ninguna otra columna.
      **Gap de integración**: el mock del frontend
      (`frontend/src/funcionalidades/bridges/bridges.api.ts`) simula esto a
      nivel de `Bridge` completo (`POST /bridges/:id/token`) — decisión de
      mock explícita, no el contrato real; el frontend deberá adaptarse al
      endpoint por `cuentaId` cuando integre contra el backend real.
      `estadoToken`/`tokenExpiraEn` viajan en `CuentaPublicitariaDto`
      (`services/cuenta-publicitaria.service.ts::toCuentaPublicitariaDto`,
      2026-08-19) — se agregaron tras detectar que el DTO nunca los exponía
      pese a que ya se persistían correctamente, dejando sin dato al
      indicador visual de "token por vencer/vencido" del panel de bridges.
      `tokenCifrado` sigue sin exponerse jamás.
- [x] Cifrado y descifrado de tokens (AES-256-GCM) — `lib/cifrado-token.ts`;
      migración additiva de `estado_token`/`token_cifrado`/`token_expira_en`/
      `secreto_webhook` en `CuentaPublicitaria` (decisión 2026-08-18, granularidad
      por Página — ver `03-modelo-datos.md` §cuentas_publicitarias). Ahora
      consumido por el adaptador Meta (descifrado del Page Access Token antes
      de consultar Graph API)
- [x] CRUD de bridges y cuentas publicitarias
- [x] Registro en `bridge_logs` de todo error de recepción
- [x] Worker durable con reintentos fijos (60 s/300 s) y `FALLA_MANUAL`
- [x] Trabajo programado: verificación diaria de token vigente por Página vía
      `/debug_token` y notificación a administradores ante invalidez/revocación
      (2026-08-18). `services/verificacion-token.service.ts::verificarTokensVigentes`
      + `jobs/verificacion-token.job.ts::startVerificacionTokenJob` — mismo
      patrón que `bridge-mudo.job.ts`/`sla-atrasado.job.ts` (guarda de
      re-entrada, `unref()`, seam de testabilidad), intervalo de 24h. Escanea
      TODAS las `CuentaPublicitaria` con `tokenCifrado` no nulo (universo
      completo, no filtrado por bridge — el criterio es por Página, no por
      ventana temporal como bridge-mudo); un token inválido/revocado marca
      `estadoToken = TOKEN_EXPIRADO` y registra `bridge_logs` nivel `ERROR` —
      `registrarBridgeLog` en ese nivel YA dispara notificación real a
      administradores (`bridge-log.service.ts`), cumpliendo el requisito sin
      lógica adicional. Un token vigente con `tokenExpiraEn` distinto se
      actualiza sin volver a cifrar (el token no cambió).
- [x] Trabajo programado: detección de bridge sin actividad por 72 h
      (2026-08-19). Criterio real implementado (`services/bridge-mudo.service.ts`,
      `bridgeRepository.findBridgesMudos`): `Bridge.estado = ACTIVO`,
      `ultimoLeadEn` no nulo y vencido hace más de 72 h, y "campaña activa" se
      resuelve como "sin ninguna `CuentaPublicitaria` registrada o con al
      menos una `activa = true`" — `Campania` existe en el schema pero no se
      escribe en ningún flujo real todavía, así que no participa del filtro.
      Un bridge con `ultimoLeadEn IS NULL` (nunca recibió un lead) queda
      excluido: no hay columna de fecha de creación en `Bridge` para medir
      "72 h de silencio" sin una marca de referencia. Anti-spam vía
      `Bridge.advertenciaMudoEnviada` (mismo patrón que
      `Cita.recordatorioEnviado`): se resetea en `touchUltimoLeadEn` cuando
      llega un lead nuevo. La advertencia se escribe en `bridge_logs` nivel
      `ADVERTENCIA` (visible en `GET /bridges/:id/logs`), no como notificación
      push a administradores — `registrarBridgeLog` solo dispara notificación
      en nivel `ERROR`; extender ese disparo a `ADVERTENCIA` queda fuera de
      esta rebanada. `touchUltimoLeadEn` quedó wireado en
      `ingesta.service.ts::procesarRecepcion` (antes no se llamaba desde
      ningún flujo de producción)

**Pruebas obligatorias:** `X-Bridge-Key` ausente, malformada o que no coincide
con ningún bridge activo se rechaza con 401 y registra una fila `bridge_logs`
ERROR; el mismo `idExternoLead` dos veces, incluida entrega concurrente,
produce un solo lead; lead sin teléfono ni correo se persiste con marca de
dato incompleto; firma `X-Hub-Signature-256` ausente o inválida en el webhook
de Meta se rechaza con 401 y registra `bridge_logs` ERROR sin encolar nada;
firma válida encola el `leadgen_id` en `leads_recibidos` (sobre
`META_PENDIENTE_DETALLE`) de forma idempotente y responde 200 sin llamar a
Graph API; el worker resuelve ese sobre — consulta de detalle exitosa mapea
el `LeadEntrante` y completa el mismo recibo; fallo transitorio de Graph API
reintenta con backoff hasta 3 veces, registra `bridge_logs` ERROR y propaga
el rechazo (el ciclo estándar de reintento/`FALLA_MANUAL` del worker se
encarga, no un mecanismo nuevo); token ya `TOKEN_EXPIRADO` o detectado como
inválido por Graph API (código 190) evita/corta los reintentos y marca la
cuenta.

La aceptación HTTP confirma solo el recibo durable. El worker completa deduplicación,
eventos y vínculo al lead atómicamente; SSE y asignación ocurren después del commit.

La aceptación HTTP confirma solo el recibo durable. El worker completa deduplicación,
eventos y vínculo al lead atómicamente; SSE y asignación ocurren después del commit.

---

## M5 — Gestión de leads

- [x] `GET /api/v1/leads` con filtros (etapa, semáforo, red social, campaña,
      responsable, rango de fechas, estado de SLA), paginación y orden
      > **Pendiente (validación server-side faltante):** `leads.schema.ts::listLeadsQuerySchema`
      > (línea 54) valida `limite` como `z.coerce.number().int().min(1).max(100).default(20)`
      > — un rango abierto, no la whitelist acotada (10/25/50/100) que pide el
      > contrato de frontend (`leads.api.ts::LeadsQueryParams.porPagina`). Hoy
      > cualquier entero entre 1 y 100 pasa (p. ej. `limite=37`), así que el
      > servidor no impone el mismo conjunto fijo que usa el cliente. Falta
      > acotar `limite` a esos 4 valores exactos en `leads.schema.ts`.
- [ ] `GET /api/v1/leads` — parámetro `vista` (`activos` | `cerrados`,
      default `activos`) (2026-08-19, decisión de diseño para la tabla de
      leads de F3 en `dev-front`: tabs "Pendientes/En proceso" — vista por
      defecto — vs "Cerrados", con Venta/No Venta dentro de esta última).
      `activos` = `etapa NOT IN (VENTA, NO_VENTA)`; `cerrados` = `etapa IN
      (VENTA, NO_VENTA)`. Si el query ya trae `etapa` puntual, esta gana
      sobre `vista` (ya acota a una sola etapa, terminal o no) — `vista`
      solo decide el conjunto por defecto cuando no hay una etapa específica
      elegida, y se combina con el resto de filtros existentes sin
      reemplazarlos. Único punto a tocar: `listLeadsQuerySchema`
      (`leads.schema.ts`) + `buildWhere` (`leads.service.ts`). No hace falta
      índice nuevo — `idx_leads_etapa_ingreso` ya cubre `etapa`, y el
      volumen de esta CRM no justifica uno compuesto para un `IN`/`NOT IN`
      de 2-3 valores.
- [x] Filtrado automático por rol: asesor y vendedor solo ven su cartera
- [x] `GET /api/v1/leads/:id` con verificación de acceso
- [x] `PATCH /api/v1/leads/:id/etapa` con formulario obligatorio
      > (2026-08-19) `leads.service.ts::transitionEtapa` ahora valida server-side
      > que `body.etapa` sea una transición válida desde `lead.etapa` actual,
      > vía la whitelist `TRANSICIONES_VALIDAS` (progreso lineal Nuevo →
      > Contactado → Cita, nunca se retrocede, más salto directo a cierre desde
      > cualquier etapa no terminal — docs/02-reglas-negocio.md §6), replicando
      > `frontend/src/funcionalidades/leads/etapas.ts::TRANSICIONES_VALIDAS`.
      > Responde 409 `transicion_invalida` cuando la transición pedida no está
      > en la whitelist.
- [x] Validación de campos obligatorios en etapas terminales
- [x] Escritura de `lead_eventos` en la misma transacción que cada cambio
- [x] `GET /api/v1/formularios/:etapa` — definición de formulario
- [x] `POST /api/v1/leads/:id/formulario` — respuestas y cálculo de puntuación
- [x] Motor de cálculo del semáforo con versionado de rúbrica

**Pruebas obligatorias:** un asesor no puede leer ni modificar un lead ajeno
(prueba directa contra el endpoint, no contra la interfaz); cambio de etapa sin
formulario se rechaza; cada combinación de respuestas produce la puntuación
esperada; VENTA sin monto se rechaza.

**Límite M5/M6 (cerrado):** `Lead.asesorId`/`vendedorId` ya existían en el
esquema desde M5 y `leads.service.ts` los consume (filtro de cartera, D4).
M6 aterrizó y es quien los escribe en producción: la asignación automática
por menor carga, la reasignación y el traspaso.

---

## M6 — Asignación, traspaso y SLA

- [x] Algoritmo de asignación por menor carga activa con desempate FIFO
- [x] Asignación automática al persistir lead nuevo o de reingreso
- [x] Manejo del caso sin asesores activos
- [x] `POST /api/v1/leads/:id/asignar` (administrador y supervisor)
- [x] `POST /api/v1/leads/:id/reasignar` con regla de semáforo para el asesor
- [x] `POST /api/v1/leads/:id/traspasar` con selección automática de vendedor
- [x] Reinicio de `sla_inicio_en` en asignación, reasignación y traspaso
- [x] Cálculo derivado del estado de SLA (nunca persistido)
- [x] Trabajo programado cada 15 minutos: detección de leads atrasados

**Pruebas obligatorias:** con cargas 3/1/2 el lead va al asesor de carga 1; con
cargas iguales gana el de asignación más antigua; asesor con lead verde no puede
reasignarlo; el estado de SLA cambia a "En riesgo" exactamente a las 18 h.

**Nota D3 (ancla del SLA):** el criterio de atraso ancla en `sla_inicio_en`, NO en
`ingresado_en` — "24 horas desde su ingreso" en la redacción original de
`docs/02-reglas-negocio.md` §7 es una paráfrasis suelta de "desde la primera
asignación": el reloj arranca al asignar y **se reinicia** en cada reasignación
o traspaso (`sla.calculator.ts` y `slaFilterBoundaries` ya estaban anclados así
desde M5). Un lead sin asignar (`sla_inicio_en = null`) es `sin_iniciar`, nunca
`atrasado` — el cron de M6 lo ignora por completo.

**Nota DD1 (índice del cron):** `idx_leads_sla` (índice parcial `WHERE
cerrado_en IS NULL` sobre `sla_inicio_en`) ya existía desde la migración de M5
(`20260814050000_m5_gestion_leads`); M6 no agrega ningún índice nuevo — el job
de detección de atrasados reutiliza la misma forma de consulta que
`GET /leads?estadoSla=atrasado` de M5.

> **Nota D1 revisada (F3/F4, diseño D-A2 revisión 2) — ruptura consciente de
> la invariante original:** hasta esta revisión, la asignación automática
> corría **dentro de la misma transacción** de ingesta
> (`ingesta.service.ts::procesarEnTransaccion`). Esa invariante se rompió a
> propósito: el lead debe estar **realmente committeado** antes de intentar
> asignarlo. Ahora `procesarEnTransaccion` solo persiste recepción+dedupe y
> propaga `leadCreado`; `ingesta.service.ts::ingestarLead` dispara
> `asignacion.service.ts::asignarTrasCommit(leadId, ahoraIngesta)` **después**
> del commit, en su propia transacción, con hasta 3 reintentos (backoff
> 250ms/1000ms). `assignAutomatically` en sí **sigue sin abrir transacción
> propia** — solo cambió quién le pasa la `tx` viva (antes `ingesta.service`,
> ahora `asignarTrasCommit`).
>
> Efectos del cambio, todos deliberados:
> - **Guarda de idempotencia obligatoria**: `assignAutomatically` no-opea en
>   silencio si el lead ya tiene `asesorId` no-nulo — cubre tanto una
>   asignación manual del Supervisor durante la ventana post-commit como un
>   reintento sobre un intento anterior ya confirmado.
> - **`slaInicioEn` = instante de ingesta**, no el instante en que la
>   asignación automática efectivamente concluye (evita regalar minutos de
>   SLA por un retraso de infraestructura propio).
> - **Degradación tras agotar los 3 reintentos**: evento `ASIGNACION_FALLIDA`
>   nuevo en `lead_eventos` (`requiereNotificacion: true`, distinto de
>   `SIN_ASIGNAR` — este es un incidente de infraestructura, no la ausencia
>   de candidatos) + ERROR en `bridge_logs` + `logger.error`. El lead queda
>   `asesorId: null`, visible y filtrable, reparable manualmente vía
>   `/leads/:id/asignar` o el lote `/leads/asignar-lote`.
> - **La respuesta HTTP de ingesta nunca depende del resultado de la
>   asignación**: `asignarTrasCommit` nunca lanza, así que el webhook
>   siempre responde 200 con el `leadId` committeado. Un 5xx aquí sería
>   activamente dañino: el reintento del bridge entraría por el `ON
>   CONFLICT` de `upsertLeadRecibido` y cortocircuitaría como
>   `duplicado: true` sin volver a intentar la asignación.
>
> Migración aditiva asociada: `20260816120000_asignacion_fallida_postcommit`
> (`ALTER TYPE "tipo_evento_lead" ADD VALUE 'ASIGNACION_FALLIDA'`), mismo
> patrón que la migración original de M6.

---

## M7 — Citas

- [x] CRUD de citas asociadas a un lead
- [x] Validación: no se agenda una cita en el pasado
- [x] Reprogramación con registro de evento
- [x] Estados de cita y su efecto en el formulario de la etapa Cita
- [x] Trabajo programado: recordatorio 1 hora antes

**Pruebas obligatorias:** cobertura de integración para el CRUD de citas,
reprogramación y máquina de estados (`citas.service.test.ts`,
`citas.routes.test.ts`), y para el trabajo de recordatorio, incluida su
idempotencia y la guarda de re-entrada (`citas-recordatorio.job.test.ts`).

> **Progreso:** `model Cita` (enums `ModalidadCita`/`EstadoCita`) agregado por
> migración (`20260814220844_m7_citas`), con relaciones a `Lead`/`Usuario`.
> Endpoints: `POST/GET /leads/:id/citas`, `GET /citas/:citaId`,
> `POST /citas/:citaId/cancelar|reprogramar|resultado`. Autorización por
> recurso reutiliza `canRead`/`canEdit` de `leads.access.ts` (D4, M5) sin
> duplicar la regla — mismo criterio que reasignar/traspasar en M6, sin
> `requireRole` fijo en las rutas.
>
> **D-M7a (responsable por defecto):** no existe algoritmo de selección
> automática de responsable para citas (distinto de
> `asignacion.service.ts::selectResponsable`, M6) — fuera del alcance del
> checklist M7. Por defecto, quien agenda es su propio responsable;
> Administrador/Supervisor pueden asignarla a otro usuario explícito
> (mismo patrón DD10 de M6).
>
> **D-M7b (reprogramación, decisión dejada abierta por el diseño del
> cambio):** tras reprogramar, `citas.estado` vuelve a `AGENDADA` con la
> nueva `programadaPara` — **nunca** queda persistido en `REPROGRAMADA` —
> porque el trabajo de recordatorio filtra estrictamente `estado =
> AGENDADA`; dejarlo en `REPROGRAMADA` excluiría para siempre la cita
> reprogramada del recordatorio de la nueva fecha. El valor `REPROGRAMADA`
> se mantiene en el enum por fidelidad exacta con
> `docs/03-modelo-datos.md` §citas, pero ningún camino de código actual lo
> persiste. El historial de reprogramaciones (una o varias) vive en
> `lead_eventos` (`CITA_REPROGRAMADA`, uno por evento), no en `estado`.
>
> **D-M7c (límite con el formulario de etapa CITA, decisión de integración
> pedida explícitamente por el diseño del cambio):** `POST
> /citas/:citaId/resultado` marca `CUMPLIDA`/`NO_ASISTIO` como un registro
> **asociado** al lead — nunca mueve `leads.etapa` ni escribe
> `respuestas_formulario`. El formulario de la etapa CITA
> (`docs/04-formularios-semaforo.md` §5, "¿Asistió a la cita?") lo sigue
> completando el vendedor por su flujo ya existente de M5 (`PATCH
> /leads/:id/etapa` o `POST /leads/:id/formulario`,
> `formularios.service.ts::applyFormulario`) — no se duplica esa lógica ni
> se inventa una segunda fuente de verdad para la misma pregunta. Tampoco
> escribe `lead_eventos`: `TipoEventoLead` solo reserva `CITA_AGENDADA`/
> `CITA_REPROGRAMADA` para M7, `citas.estado` ya es su propio registro
> auditable para el resultado.
>
> **D-M7d (recordatorio, límite explícito con M8):** `citas-recordatorio.job.ts`
> corre cada 15 minutos (mismo patrón de guarda de re-entrada que
> `sla-atrasado.job.ts` de M6) e invoca `enviarRecordatoriosCita`, que marca
> `recordatorio_enviado = true` de forma atómica (`UPDATE ... WHERE
> recordatorio_enviado = false`) para citas `AGENDADA` cuya
> `programada_para` cae en `[ahora, ahora + 1h]`. La emisión real de la
> notificación al responsable y su entrega por SSE son de M8
> (`docs/06-modulos-backend.md` M8, "Servicio de creación de
> notificaciones" / canal SSE), que todavía no existe en el código — este
> job solo deja la marca anti-duplicado y un log estructurado por cita
> (`citas-recordatorio.service.ts`) como punto de enganche documentado, sin
> inventar infraestructura de notificaciones.

---

## M8 — Notificaciones y tiempo real

- [x] Servicio de creación de notificaciones
- [x] `GET /api/v1/notificaciones` con filtro de no leídas
- [x] `PATCH /api/v1/notificaciones/:id/leer` y marcado masivo
- [x] Canal SSE `GET /api/v1/eventos` autenticado
- [x] Emisión por SSE de: lead asignado, cambio de etapa, notificación nueva
- [x] Gestión de conexiones SSE por usuario con limpieza al desconectar
- [x] Reconexión con `Last-Event-ID`

**Nota de implementación:** mantén el registro de conexiones SSE en memoria del
proceso. Con 100 concurrentes y un solo proceso Node no hace falta Redis ni
sistema de mensajería; introducirlo sería complejidad sin beneficio.

**Evidencia de finalización:** los productores transaccionales cubren asignación,
traspaso, leads sin asignar, interacción repetida, SLA, citas y errores de bridge.
Las ejecuciones concurrentes de SLA y citas persisten un solo conjunto de evento
y notificación por ventana elegible, y la publicación SSE ocurre solo después
del commit.

`TOKEN_POR_EXPIRAR` queda solo como contrato hasta que M4 implemente
almacenamiento cifrado y metadatos persistidos de expiración. M8 no incluye un
productor ni un scheduler de expiración de tokens.

---

## M9 — Dashboard y métricas

- [x] Servicio de agregación de KPIs (ver `08-dashboard-kpis.md`)
- [x] `GET /api/v1/metricas/resumen`
- [x] `GET /api/v1/metricas/por-red-social`
- [x] `GET /api/v1/metricas/por-asesor`
- [x] `GET /api/v1/metricas/por-etapa`
- [x] `GET /api/v1/metricas/por-campania`
- [x] `GET /api/v1/metricas/embudo`
- [x] `GET /api/v1/metricas/red-social-x-semaforo` — matriz cruzada
- [x] Filtro por rango de fechas en todos los endpoints de métricas
- [x] Alcance por rol: general para administrador y supervisor, personal para
      asesor y vendedor
- [x] Emisión de actualización de métricas por SSE ante cambios relevantes —
      diseño "broadcast a todos los conectados": el backend NO recalcula
      métricas ni resuelve destinatarios por rol antes de emitir; emite una
      señal liviana `metricas.actualizadas` (`EventBroker.broadcastAll`,
      `src/lib/event-broker.ts`) a TODO usuario con una conexión SSE activa,
      y es el frontend quien hace refetch de sus endpoints de métricas —
      esos endpoints ya aplican el alcance por rol server-side en cada
      request, así que el filtrado ocurre en el fetch, no en la señal (evita
      el costo de resolver destinatarios en cada evento de negocio, que es
      justo lo que pide evitar la nota de rendimiento del spec). Agrupado en
      una ventana de debounce de 2s (`scheduleMetricasBroadcast`,
      `src/lib/metricas-broadcast.ts`) para que un ingreso masivo de leads no
      dispare un recálculo por cada uno. Tres puntos de disparo: ingreso de
      lead (`ingesta.service.ts::procesarRecepcion`), asignación — un único
      hook en `asignacion.service.ts::applyAsignacion`, el punto de escritura
      compartido por los 4 caminos de asignación de ese archivo más la
      reasignación de cartera de `usuarios.service.ts` — y cambio de
      etapa/cierre (`leads.service.ts::transitionEtapa`, cubre VENTA/NO_VENTA
      como caso de cierre sin lógica separada).

**Pruebas obligatorias:** un asesor consultando métricas recibe solo datos de su
cartera; los conteos por etapa suman el total de leads del período.

---

## Orden de ejecución sugerido

```
M1 → M2 → M3 → M4(parcial: genérico + Google Forms) → M5 → M6 → M7 → M8 → M9
                                                              ↓
                                            M4(resto: Meta, LinkedIn, X)
```

Los adaptadores de Meta y LinkedIn se completan al final porque dependen de
aprobaciones externas cuyo tiempo no controlamos. El resto del sistema no debe
quedar bloqueado esperándolas.
