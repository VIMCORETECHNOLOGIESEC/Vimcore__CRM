# 20 — Integración backend de LinkedIn Lead Sync

> **Estado:** borrador técnico TO-BE, no implementado.
>
> **Autoridad:** diseño propuesto para una futura SDD change. Este documento no
> autoriza migraciones ni cambia el comportamiento AS-IS.
>
> **Alcance:** backend para OAuth 2.0, selección de múltiples fuentes,
> `leadNotifications`, reconciliación e ingesta de leads de LinkedIn.

## 1. Decisión resumida

LinkedIn se integrará mediante el flujo OAuth 2.0 Authorization Code de tres
partes. Un administrador del CRM iniciará la conexión, LinkedIn mostrará su
pantalla de autenticación y consentimiento, y el callback del backend
intercambiará el código por tokens sin exponerlos al frontend.

Una autorización podrá descubrir y conectar varias cuentas publicitarias u
organizaciones. Los leads llegarán preferentemente mediante
`leadNotifications`; una reconciliación programada consultará
`leadFormResponses` para recuperar notificaciones perdidas.

Decisiones de diseño:

| Tema | Decisión |
|---|---|
| Autenticación | OAuth 2.0 Authorization Code; `state` obligatorio y de un solo uso. |
| Credenciales | Tokens cifrados por conexión LinkedIn, nunca en `CuentaPublicitaria.tokenCifrado`. |
| Multiplicidad | Una conexión OAuth puede habilitar varias fuentes. |
| Recepción | Webhook firmado, persistencia durable e idempotente antes del `2xx`. |
| Recuperación | Reconciliación periódica con ventana temporal solapada. |
| Contrato interno | Todo detalle resuelto se adapta al `LeadEntrante` existente. |
| Atribución | Sponsored accounts reutilizan `CuentaPublicitaria`; organizaciones no se fuerzan dentro de ese modelo. |
| Baseline | Se conserva el despliegue single-company y el `empresaId` vigente del `Bridge`. |
| Frontend | Fuera de alcance. El backend entrega `authorizationUrl` para un botón futuro. |

## 2. Flujo objetivo

### 2.1 Conexión OAuth

```text
Administrador autenticado
  → POST /api/v1/bridges/:id/linkedin/oauth/iniciar
  → backend valida Bridge LINKEDIN y crea state de un solo uso
  → backend responde authorizationUrl
  → navegador abre linkedin.com/oauth/v2/authorization
  → LinkedIn autentica y solicita consentimiento
  → GET /api/v1/integraciones/linkedin/oauth/callback?code=...&state=...
  → backend consume state e intercambia code por tokens
  → backend cifra tokens y descubre cuentas/organizaciones
  → fuentes descubiertas quedan inactivas
  → administrador activa una o varias fuentes por API
  → backend crea suscripciones leadNotifications
```

El CRM nunca recibe la contraseña de LinkedIn. El `client_secret`, los tokens y
el authorization code no se escriben en logs ni se devuelven en DTOs.

### 2.2 Recepción de leads

```text
LinkedIn
  → POST /api/v1/integraciones/linkedin/webhook
  → firma X-LI-Signature sobre raw body
  → validación Zod del payload
  → resolución de Bridge/Fuente
  → INSERT idempotente en leads_recibidos
  → HTTP 2xx
  → worker consulta leadFormResponses y leadForms
  → linkedin.adapter.ts produce LeadEntrante
  → deduplicación + LeadEvento en transacción existente
  → asignación y eventos después del commit
```

### 2.3 Reconciliación

```text
Job cada 5 minutos
  → lista fuentes LinkedIn activas
  → obtiene token vigente
  → consulta leadFormResponses desde ultimaSincronizacionEn con solape
  → encola cada response id mediante la misma idempotencia del webhook
  → avanza el cursor solo después de aceptar durablemente todas las respuestas
```

## 3. Cambios capa por capa

### 3.1 Prisma y migración

**Archivo modificado:** `backend/prisma/schema.prisma`

`RedSocial.LINKEDIN` ya existe; no se agrega ni se renombra. Tampoco se agregan
columnas a `Lead`: la atribución continúa entrando por `LeadEntrante` y se
resuelve mediante `atribucion.service.ts`.

Se proponen los siguientes enums y modelos. Los nombres de índices y la SQL
exacta deberán cerrarse en la spec de la SDD change.

```prisma
enum EstadoConexionLinkedIn {
  ACTIVA
  TOKEN_EXPIRADO
  REVOCADA
  ERROR

  @@map("estado_conexion_linkedin")
}

enum TipoFuenteLinkedIn {
  SPONSORED_ACCOUNT
  ORGANIZATION

  @@map("tipo_fuente_linkedin")
}

enum TipoLeadLinkedIn {
  SPONSORED
  EVENT
  COMPANY
  ORGANIZATION_PRODUCT

  @@map("tipo_lead_linkedin")
}

enum EstadoSuscripcionLinkedIn {
  PENDIENTE
  ACTIVA
  ERROR
  REVOCADA

  @@map("estado_suscripcion_linkedin")
}

model LinkedInConexion {
  id                       String                  @id @default(uuid()) @db.Uuid
  bridgeId                 String                  @unique @map("bridge_id") @db.Uuid
  autorizadoPorUsuarioId   String                  @map("autorizado_por_usuario_id") @db.Uuid
  memberUrn                String?                 @map("member_urn") @db.Text
  accessTokenCifrado       String                  @map("access_token_cifrado") @db.Text
  refreshTokenCifrado      String?                 @map("refresh_token_cifrado") @db.Text
  accessTokenExpiraEn      DateTime                @map("access_token_expira_en") @db.Timestamptz(6)
  refreshTokenExpiraEn     DateTime?               @map("refresh_token_expira_en") @db.Timestamptz(6)
  scopes                   String[]
  estado                   EstadoConexionLinkedIn  @default(ACTIVA)
  revocadoEn               DateTime?               @map("revocado_en") @db.Timestamptz(6)
  creadoEn                 DateTime                @default(now()) @map("creado_en") @db.Timestamptz(6)
  actualizadoEn            DateTime                @updatedAt @map("actualizado_en") @db.Timestamptz(6)

  bridge                   Bridge                  @relation(fields: [bridgeId], references: [id], onDelete: Cascade)
  autorizadoPor            Usuario                 @relation(fields: [autorizadoPorUsuarioId], references: [id], onDelete: Restrict)
  fuentes                  LinkedInFuente[]

  @@map("linkedin_conexiones")
}

model LinkedInOAuthState {
  id         String    @id @default(uuid()) @db.Uuid
  stateHash  String    @unique @map("state_hash") @db.Text
  bridgeId   String    @map("bridge_id") @db.Uuid
  usuarioId  String    @map("usuario_id") @db.Uuid
  expiraEn   DateTime  @map("expira_en") @db.Timestamptz(6)
  usadoEn    DateTime? @map("usado_en") @db.Timestamptz(6)
  creadoEn   DateTime  @default(now()) @map("creado_en") @db.Timestamptz(6)

  bridge     Bridge    @relation(fields: [bridgeId], references: [id], onDelete: Cascade)
  usuario    Usuario   @relation(fields: [usuarioId], references: [id], onDelete: Cascade)

  @@index([expiraEn])
  @@map("linkedin_oauth_states")
}

model LinkedInFuente {
  id                         String                     @id @default(uuid()) @db.Uuid
  conexionId                 String                     @map("conexion_id") @db.Uuid
  cuentaPublicitariaId       String?                    @map("cuenta_publicitaria_id") @db.Uuid
  tipo                       TipoFuenteLinkedIn
  ownerUrn                   String                     @map("owner_urn") @db.Text
  nombre                     String                     @db.Text
  tipoLead                   TipoLeadLinkedIn            @map("tipo_lead")
  activa                     Boolean                    @default(false)
  estadoSuscripcion          EstadoSuscripcionLinkedIn  @default(PENDIENTE) @map("estado_suscripcion")
  subscriptionId             String?                    @map("subscription_id") @db.Text
  ultimaSincronizacionEn     DateTime?                  @map("ultima_sincronizacion_en") @db.Timestamptz(6)
  creadoEn                   DateTime                   @default(now()) @map("creado_en") @db.Timestamptz(6)
  actualizadoEn              DateTime                   @updatedAt @map("actualizado_en") @db.Timestamptz(6)

  conexion                   LinkedInConexion           @relation(fields: [conexionId], references: [id], onDelete: Cascade)
  cuentaPublicitaria         CuentaPublicitaria?        @relation(fields: [cuentaPublicitariaId], references: [id], onDelete: SetNull)
  formularios                LinkedInFormulario[]

  @@unique([conexionId, ownerUrn, tipoLead])
  @@index([activa, estadoSuscripcion])
  @@map("linkedin_fuentes")
}

model LinkedInFormulario {
  id                     String           @id @default(uuid()) @db.Uuid
  fuenteId               String           @map("fuente_id") @db.Uuid
  versionedFormUrn       String           @map("versioned_form_urn") @db.Text
  nombre                 String?          @db.Text
  contenido              Json             @db.JsonB
  activo                 Boolean          @default(true)
  sincronizadoEn         DateTime         @map("sincronizado_en") @db.Timestamptz(6)

  fuente                 LinkedInFuente   @relation(fields: [fuenteId], references: [id], onDelete: Cascade)

  @@unique([fuenteId, versionedFormUrn])
  @@map("linkedin_formularios")
}
```

Relaciones adicionales requeridas:

| Modelo vigente | Relación nueva |
|---|---|
| `Bridge` | `linkedinConexion LinkedInConexion?` y `linkedinOAuthStates LinkedInOAuthState[]`. |
| `Usuario` | Conexiones autorizadas y states OAuth iniciados. |
| `CuentaPublicitaria` | `linkedinFuentes LinkedInFuente[]`. |

Reglas de migración:

- No migrar tokens Meta hacia tablas LinkedIn.
- No crear conexión LinkedIn durante el seed.
- `LinkedInConexion.bridgeId` es único: una autorización vigente por bridge.
- `refreshTokenCifrado` es nullable porque LinkedIn solo entrega refresh token
  programático a aplicaciones habilitadas.
- Los campos cifrados deben soportar tokens de al menos 1.000 caracteres antes
  del cifrado.
- La fuente `SPONSORED_ACCOUNT` crea o enlaza una `CuentaPublicitaria` con
  `idExterno = ownerUrn`, permitiendo que `resolverAtribucion` encuentre la
  cuenta sin cambios de contrato.
- Una fuente `ORGANIZATION` conserva `cuentaPublicitariaId = null`; nunca se
  inventa una cuenta publicitaria para representar una organización.

### 3.2 Variables y configuración

**Archivos modificados:**

- `backend/src/config/env.ts`
- `.env.example`
- `docker-compose.yml`

Variables propuestas:

```text
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
LINKEDIN_REDIRECT_URI=
LINKEDIN_API_VERSION=
LINKEDIN_API_BASE_URL=        # solo override de tests/QA
```

Decisiones:

- `LINKEDIN_REDIRECT_URI` debe ser HTTPS y coincidir exactamente con LinkedIn
  Developer Portal.
- `LINKEDIN_CLIENT_SECRET` se usa tanto en OAuth como en challenge y firma del
  webhook; nunca se envía al frontend.
- `LINKEDIN_API_VERSION` fija el header `Linkedin-Version` y evita depender de
  una versión implícita.
- Se reutiliza `TOKEN_ENCRYPTION_KEY` y `lib/cifrado-token.ts`; no se reutiliza
  la columna Meta `CuentaPublicitaria.tokenCifrado`.
- El proceso debe fallar al arrancar si LinkedIn está habilitado y falta su
  configuración. La spec debe decidir si las variables serán globalmente
  obligatorias o condicionales a un flag explícito.

### 3.3 Schemas de entrada y contratos externos

**Archivo nuevo:** `backend/src/schemas/linkedin.schema.ts`

Schemas de borde:

| Schema | Valida |
|---|---|
| `linkedinOAuthStartParamsSchema` | UUID del bridge. |
| `linkedinOAuthCallbackQuerySchema` | `code`, `state`, `error`, `error_description`. |
| `linkedinFuenteParamsSchema` | UUID de bridge y fuente local. |
| `updateLinkedInFuenteBodySchema` | Activación explícita de la fuente. |
| `linkedinWebhookChallengeQuerySchema` | `challengeCode` y `applicationId` opcional. |
| `linkedinNotificationSchema` | Notification ID y referencias necesarias para resolver el lead. |
| `linkedinTokenResponseSchema` | Access token, TTL, scopes y refresh token opcional. |
| `linkedinLeadFormResponseSchema` | Respuesta de `leadFormResponses`. |
| `linkedinLeadFormSchema` | Formulario/version y definición de preguntas. |

Reglas:

- Los payloads externos son `unknown` hasta pasar por Zod.
- El callback acepta éxito o error, nunca una mezcla silenciosa de ambos.
- Los tokens deben aceptar hasta 1.000 caracteres.
- El webhook se valida contra el raw body antes de parsear su JSON.
- Los schemas no contienen lógica de negocio ni acceso a Prisma.

### 3.4 DTOs públicos

**Archivo nuevo:** `backend/src/types/linkedin.ts`

```ts
export interface LinkedInOAuthStartDto {
  authorizationUrl: string;
  expiraEn: string;
}

export interface LinkedInConexionDto {
  id: string;
  bridgeId: string;
  estado: "ACTIVA" | "TOKEN_EXPIRADO" | "REVOCADA" | "ERROR";
  accessTokenExpiraEn: string;
  refreshTokenExpiraEn: string | null;
  scopes: string[];
  tieneRefreshToken: boolean;
  fuentes: LinkedInFuenteDto[];
}

export interface LinkedInFuenteDto {
  id: string;
  tipo: "SPONSORED_ACCOUNT" | "ORGANIZATION";
  ownerUrn: string;
  nombre: string;
  tipoLead: "SPONSORED" | "EVENT" | "COMPANY" | "ORGANIZATION_PRODUCT";
  activa: boolean;
  estadoSuscripcion: "PENDIENTE" | "ACTIVA" | "ERROR" | "REVOCADA";
  ultimaSincronizacionEn: string | null;
}
```

Los DTOs nunca incluyen:

- access token;
- refresh token;
- authorization code;
- client secret;
- hash de `state`;
- payload completo de un lead.

### 3.5 Sobre durable de ingesta

**Archivo modificado:** `backend/src/repositories/lead-recibido.repository.ts`

Agregar una tercera versión sin alterar V1 ni V2 ya persistidas:

```ts
export interface PersistedLinkedInPendienteDetalleV3 {
  version: 3;
  tipo: "LINKEDIN_PENDIENTE_DETALLE";
  recibidoEn: string;
  notificationId: string;
  leadFormResponseId: string;
  ownerUrn: string;
  versionedFormUrn: string;
}
```

`PersistedEntradaProcesamiento` pasa a ser la unión V1 | V2 | V3.

Nueva función:

```ts
aceptarLinkedInPendiente(data, recibidoEn?, client?): Promise<AceptacionLead>
```

Reglas:

- `id_externo_lead = leadFormResponseId`, no Notification ID.
- Notification ID se conserva en `payload` y sirve para auditoría de
  redelivery.
- Se mantiene `UNIQUE(bridge_id, id_externo_lead)` para convergencia
  secuencial y concurrente.
- La recepción responde `2xx` únicamente después del commit del inbox.
- No se consulta LinkedIn desde el request del webhook.

### 3.6 Repositories

Los repositories son la única capa nueva que toca Prisma directamente.

#### `backend/src/repositories/linkedin-oauth-state.repository.ts`

| Función | Responsabilidad |
|---|---|
| `createState()` | Inserta hash, bridge, usuario y expiración. |
| `consumeValidState()` | Consume atómicamente un state no usado y vigente. |
| `deleteExpiredStates()` | Limpieza periódica, nunca parte del callback crítico. |

`consumeValidState()` debe hacer una sola operación condicional. Un
`find` seguido de `update` permitiría reutilización concurrente.

#### `backend/src/repositories/linkedin-conexion.repository.ts`

| Función | Responsabilidad |
|---|---|
| `findByBridgeId()` | Lee conexión sin descifrar tokens. |
| `findWithEncryptedTokens()` | Uso interno exclusivo de servicios OAuth/API. |
| `upsertFromAuthorization()` | Persiste tokens cifrados, TTLs y scopes. |
| `rotateTokens()` | Sustituye tokens y expiraciones tras refresh. |
| `markTokenExpired()` | Marca fallo recuperable que exige reconexión. |
| `revoke()` | Invalida localmente la conexión y sus fuentes. |
| `listDueForRefresh()` | Selecciona conexiones próximas a expirar. |

#### `backend/src/repositories/linkedin-fuente.repository.ts`

| Función | Responsabilidad |
|---|---|
| `upsertDiscoveredSource()` | Upsert por conexión, owner URN y lead type. |
| `listByBridge()` | DTO de fuentes para administración. |
| `findActiveByOwner()` | Resuelve webhook hacia fuente y bridge. |
| `setActive()` | Cambia activación solo después de validar conexión. |
| `markSubscription()` | Persiste id y estado de suscripción. |
| `listActiveForReconciliation()` | Alimenta el job de recuperación. |
| `advanceReconciliationCursor()` | Avanza timestamp solo tras encolado durable. |

#### `backend/src/repositories/linkedin-formulario.repository.ts`

| Función | Responsabilidad |
|---|---|
| `upsertForm()` | Persiste schema por `versionedFormUrn`. |
| `findByVersionedFormUrn()` | Entrega preguntas al adaptador. |
| `markInactiveMissingForms()` | Desactiva formularios retirados sin borrarlos. |

#### Repositories vigentes modificados

| Archivo | Cambio |
|---|---|
| `cuenta-publicitaria.repository.ts` | Upsert de sponsored account por `(bridgeId, idExterno)` sin token Meta. |
| `lead-recibido.repository.ts` | Sobre V3 y aceptación idempotente LinkedIn. |

### 3.7 Services

#### `backend/src/services/linkedin-oauth.service.ts`

Responsabilidades:

- validar que el bridge exista y sea `LINKEDIN`;
- generar `state` aleatorio de alta entropía;
- guardar SHA-256 del state con TTL de 10 minutos;
- construir `authorizationUrl` con scopes mínimos;
- consumir state antes de intercambiar el code;
- intercambiar code mediante `POST /oauth/v2/accessToken`;
- cifrar tokens y persistir la conexión;
- iniciar discovery después de una autorización válida.

No se agrega PKCE hasta que la documentación del producto habilitado para la
app lo confirme. El confidential client usa `client_secret`; `state` sigue
siendo obligatorio aunque LinkedIn lo documente como opcional.

#### `backend/src/services/linkedin-token.service.ts`

Responsabilidades:

- descifrar token únicamente durante una llamada a LinkedIn;
- refrescar antes del vencimiento cuando exista refresh token;
- aceptar rotación del refresh token si LinkedIn devuelve uno nuevo;
- marcar `TOKEN_EXPIRADO` si el grant fue revocado o expiró;
- registrar `bridge_logs` y notificar al administrador;
- solicitar reconexión cuando la app no tenga refresh programático.

#### `backend/src/services/linkedin-api.service.ts`

Cliente HTTP único para LinkedIn:

- `Authorization: Bearer`;
- `Linkedin-Version: <YYYYMM>`;
- `X-Restli-Protocol-Version: 2.0.0`;
- timeout explícito;
- validación Zod de cada respuesta;
- traducción centralizada de `401`, `403`, `429` y `5xx`;
- respeto de `Retry-After` sin mantener transacciones PostgreSQL abiertas.

#### `backend/src/services/linkedin-discovery.service.ts`

Responsabilidades:

- descubrir sponsored accounts y organizaciones accesibles por el miembro;
- verificar roles suficientes;
- crear fuentes inactivas;
- crear/enlazar `CuentaPublicitaria` para sponsored accounts;
- sincronizar formularios y versiones;
- no activar automáticamente fuentes no seleccionadas.

#### `backend/src/services/linkedin-subscription.service.ts`

Responsabilidades:

- crear y eliminar suscripciones `leadNotifications`;
- mantener `subscriptionId` y `estadoSuscripcion`;
- activar una fuente solo cuando LinkedIn confirme su suscripción;
- dejar la fuente inactiva y registrar error ante permisos insuficientes.

#### `backend/src/services/linkedin-webhook.service.ts`

Responsabilidades:

- responder challenge de validación;
- verificar `X-LI-Signature` en tiempo constante;
- validar payload ya autenticado;
- resolver fuente/bridge;
- encolar V3 y devolver aceptación durable.

Challenge oficial:

```text
challengeResponse = hex(HMAC-SHA256(challengeCode, LINKEDIN_CLIENT_SECRET))
```

Firma oficial del POST:

```text
stringToSign = "hmacsha256=" + rawBody
expected = hex(HMAC-SHA256(stringToSign, LINKEDIN_CLIENT_SECRET))
```

#### `backend/src/services/linkedin-lead.service.ts`

Responsabilidades:

- obtener `leadFormResponse` por identificador;
- obtener o reutilizar el schema exacto del formulario versionado;
- reunir owner, campaña, creative y respuestas;
- delegar la transformación pura a `adaptLinkedIn`;
- no escribir directamente `Lead`, `Cliente` ni `LeadEvento`.

#### Servicios vigentes modificados

| Archivo | Cambio |
|---|---|
| `ingesta.service.ts` | Resolver sobre V3 mediante `resolverLeadLinkedIn()` antes de abrir transacción. |
| `bridge.service.ts` | Cambiar mecanismo LinkedIn a `webhook-linkedin`; marcar implementado solo al cerrar toda la integración. |
| `bridge-log.service.ts` | Reutilizado sin introducir tratamiento especial por proveedor. |

### 3.8 Adapter

**Archivo nuevo:** `backend/src/adapters/linkedin.adapter.ts`

El adapter es puro: no usa Prisma, no hace `fetch`, no descifra tokens y no
registra logs.

```ts
export function adaptLinkedIn(
  response: LinkedInLeadFormResponse,
  form: LinkedInLeadForm,
  context: LinkedInLeadContext,
): LeadEntrante;
```

Mapeo:

| `LeadEntrante` | Fuente LinkedIn |
|---|---|
| `redSocial` | Constante `LINKEDIN`. |
| `bridgeId` | Fuente local resuelta por owner. |
| `idExternoLead` | ID de `leadFormResponse`. |
| `nombre` | Preguntas con `predefinedField` `FIRST_NAME` + `LAST_NAME`, o nombre completo si existe. |
| `correo` | Pregunta `EMAIL`. |
| `telefono` | Pregunta telefónica oficial disponible en el form schema. |
| `idExternoCuenta` | Sponsored account owner URN; `null` para organización. |
| `idExternoCampania` | Campaign URN de metadata patrocinada, si existe. |
| `nombreCampania` | Decoración de campaña, si fue devuelta; si no, `null`. |
| `camposDinamicos` | Respuestas no consumidas, form URN, creative URN, lead type y consentimientos. |
| `ingresadoEn` | `submittedAt`. |
| `payloadOriginal` | Respuesta externa validada, sin tokens. |

El mapeo usa `predefinedField` y `questionId`, nunca el texto visible de la
pregunta, porque el texto cambia por idioma y versión del formulario.

### 3.9 Controllers

**Archivos nuevos:**

- `backend/src/controllers/linkedin.controller.ts`
- `backend/src/controllers/linkedin-webhook.controller.ts`

Handlers administrativos:

| Handler | Respuesta |
|---|---|
| `postLinkedInOAuthStart` | `200 { authorizationUrl, expiraEn }`. |
| `getLinkedInConexion` | `200 { conexion }`, sin secretos. |
| `getLinkedInFuentes` | `200 { fuentes }`. |
| `patchLinkedInFuente` | `200 { fuente }`. |
| `deleteLinkedInConexion` | `204`. |
| `postLinkedInSync` | `202 { estado: "PROGRAMADA" }`. |

Handlers públicos:

| Handler | Comportamiento |
|---|---|
| `getLinkedInOAuthCallback` | Consume state, intercambia code y redirige a una URL fija; nunca acepta un `returnTo` arbitrario. |
| `getLinkedInWebhookChallenge` | Responde JSON challenge en menos de 3 segundos. |
| `postLinkedInWebhook` | Verifica raw body, encola y responde `2xx`. |

Los controllers solo validan entrada y traducen HTTP. OAuth, firma, discovery y
persistencia permanecen en services/repositories.

### 3.10 Routes

**Archivo modificado:** `backend/src/routes/bridges.routes.ts`

```text
POST   /bridges/:id/linkedin/oauth/iniciar
GET    /bridges/:id/linkedin/conexion
GET    /bridges/:id/linkedin/fuentes
PATCH  /bridges/:id/linkedin/fuentes/:fuenteId
DELETE /bridges/:id/linkedin/conexion
POST   /bridges/:id/linkedin/sincronizar
```

Todas requieren `requireAuthentication` y `requireRole("ADMINISTRADOR")`.

**Archivo nuevo:** `backend/src/routes/linkedin.routes.ts`

```text
GET  /integraciones/linkedin/oauth/callback
GET  /integraciones/linkedin/webhook
POST /integraciones/linkedin/webhook
```

Estas rutas son públicas por necesidad del proveedor, pero no son anónimas en
sentido de confianza: callback usa state y webhook usa challenge/firma.

**Archivo modificado:** `backend/src/routes/index.ts`

- montar `linkedinRouter` bajo `/api/v1`;
- mantener rutas literales antes de parámetros variables;
- no aplicar `requireBridgeKey` al webhook LinkedIn.

### 3.11 Jobs

**Archivos nuevos:**

- `backend/src/jobs/linkedin-token-refresh.job.ts`
- `backend/src/jobs/linkedin-reconciliation.job.ts`

Token refresh:

- selecciona conexiones próximas a expirar;
- limita concurrencia;
- rota tokens de forma idempotente;
- notifica expiración/revocación sin detener otros bridges.

Reconciliación:

- corre cada cinco minutos;
- usa una ventana solapada para tolerar desfases;
- encola por `leadFormResponseId`;
- avanza `ultimaSincronizacionEn` solo después del encolado completo;
- respeta rate limits y reprograma sin perder cursor.

**Archivo modificado:** `backend/src/server-lifecycle.ts`

- registrar inicio y cierre limpio de ambos jobs;
- evitar timers duplicados durante tests y hot reload.

### 3.12 Librerías de seguridad

**Archivo nuevo:** `backend/src/lib/firma-linkedin.ts`

Funciones puras:

```ts
createLinkedInChallengeResponse(challengeCode, clientSecret): string
verifyLinkedInSignature(rawBody, signature, clientSecret): boolean
```

Requisitos:

- HMAC-SHA256;
- salida hexadecimal minúscula;
- comparación con `timingSafeEqual`;
- rechazo seguro si longitud o formato son inválidos;
- nunca parsear/re-serializar el body antes de verificar.

Se reutilizan:

- `lib/cifrado-token.ts` para AES-256-GCM;
- `lib/app-error.ts` para errores de dominio;
- `lib/logger.ts`, manteniendo redacción de secretos.

## 4. Errores de dominio

| Código | HTTP | Uso |
|---|---:|---|
| `linkedin_bridge_invalido` | 422 | El bridge no es LINKEDIN. |
| `linkedin_oauth_state_invalido` | 401 | State desconocido, vencido, usado o no coincidente. |
| `linkedin_oauth_cancelado` | 400 | Usuario canceló login/consentimiento. |
| `linkedin_oauth_intercambio_fallido` | 502 | LinkedIn rechazó o no respondió al token exchange. |
| `linkedin_scope_insuficiente` | 422 | La app o el miembro no tienen permisos Lead Sync. |
| `linkedin_token_expirado` | 409 | Se requiere refresh o reconexión. |
| `linkedin_fuente_no_encontrada` | 404 | Fuente local inexistente o ajena al bridge. |
| `linkedin_webhook_firma_invalida` | 401 | Firma ausente o inválida. |
| `linkedin_webhook_payload_invalido` | 400 | Firma válida, forma no procesable. |
| `linkedin_rate_limit` | 503 | Límite externo; el worker reintenta respetando `Retry-After`. |

Los mensajes al cliente no incluyen cuerpos externos ni detalles de tokens.
`bridge_logs.payload` solo conserva identificadores operativos y códigos
sanitizados.

## 5. Límites transaccionales

| Operación | Dentro de transacción PostgreSQL |
|---|---|
| Consumir OAuth state | Sí, operación condicional atómica. |
| Llamar token endpoint LinkedIn | No. |
| Cifrar token | No requiere transacción. |
| Guardar conexión y fuentes descubiertas | Sí, después de recibir respuestas externas. |
| Verificar firma webhook | No. |
| Encolar `LeadRecibido` | Sí, commit antes del `2xx`. |
| Consultar `leadFormResponses` | No, ocurre bajo lease antes de dedupe. |
| Dedupe + Lead + LeadEvento | Sí, usa la transacción existente. |
| SSE, asignación y métricas | Después del commit, comportamiento vigente. |

Ninguna llamada de red a LinkedIn mantiene una transacción PostgreSQL abierta.

## 6. TDD y pruebas

Comando canónico dentro del contenedor:

```bash
docker compose exec backend pnpm test
```

### 6.1 Schema y migración

**Tests nuevos:**

- `backend/tests/schema.linkedin.test.ts`
- relación 1:1 Bridge–LinkedInConexion;
- múltiples fuentes por conexión;
- unique de owner + lead type;
- tokens ausentes de `CuentaPublicitaria` LinkedIn;
- cascadas y restricciones esperadas.

### 6.2 OAuth

**Tests nuevos:**

- `backend/tests/linkedin-oauth.service.test.ts`
- `backend/tests/linkedin-oauth.routes.test.ts`

Escenarios:

- authorization URL con redirect y scopes exactos;
- state almacenado como hash, no texto plano;
- state válido consumido una sola vez;
- replay concurrente rechazado;
- state vencido rechazado;
- cancelación de usuario;
- callback con code válido;
- respuesta sin refresh token;
- token exchange 4xx/5xx;
- ningún DTO o log contiene tokens.

### 6.3 Discovery y fuentes

**Test nuevo:** `backend/tests/linkedin-discovery.service.test.ts`

- varias cuentas y organizaciones se upsertean sin duplicarse;
- todas nacen inactivas;
- sponsored account crea/enlaza `CuentaPublicitaria`;
- organización no crea cuenta falsa;
- permisos insuficientes no activan la fuente.

### 6.4 Firma y webhook

**Tests nuevos:**

- `backend/tests/firma-linkedin.test.ts`
- `backend/tests/linkedin-webhook.routes.test.ts`

Escenarios:

- challenge HMAC oficial;
- challenge inválido;
- firma válida sobre bytes exactos;
- firma inválida o longitud incorrecta;
- payload firmado pero mal formado;
- redelivery secuencial y concurrente converge a una fila;
- fallo de persistencia no responde aceptación;
- respuesta exitosa ocurre después del commit del inbox.

### 6.5 Adapter y worker

**Tests nuevos:**

- `backend/tests/linkedin.adapter.test.ts`
- `backend/tests/linkedin-webhook.worker.test.ts`

Escenarios:

- mapeo por predefined fields, no por etiquetas visibles;
- formulario traducido o versionado;
- campos dinámicos preservados;
- campaña/cuenta patrocinada;
- lead orgánico sin cuenta publicitaria;
- teléfono/correo ausentes;
- token expirado;
- 429 con `Retry-After`;
- 5xx reintentable;
- respuesta ya procesada no crea duplicado;
- red externa ocurre fuera de la transacción de dedupe.

### 6.6 Reconciliación y refresh

**Tests nuevos:**

- `backend/tests/linkedin-reconciliation.job.test.ts`
- `backend/tests/linkedin-token-refresh.job.test.ts`

Escenarios:

- ventana solapada no duplica;
- cursor no avanza ante página incompleta;
- refresh rota access token;
- refresh token rotado reemplaza el anterior;
- refresh revocado marca conexión y notifica;
- una conexión fallida no detiene las demás.

## 7. Work units recomendados

| WU | Alcance | Salida verificable |
|---|---|---|
| WU0 | Acceso externo | App LinkedIn, Lead Sync aprobado, redirect HTTPS y scopes visibles. |
| WU1 | Schema + repositories | Migración, modelos y pruebas de restricciones. |
| WU2 | OAuth | Inicio, callback, state one-time y tokens cifrados. |
| WU3 | Discovery | Varias fuentes, formularios y atribución sponsored account. |
| WU4 | Suscripciones | Activación y administración de `leadNotifications`. |
| WU5 | Webhook durable | Challenge, firma, sobre V3 e idempotencia. |
| WU6 | Adapter + worker | Detalle LinkedIn convertido a `LeadEntrante`. |
| WU7 | Reconciliación + refresh | Recuperación de huecos y ciclo de vida del token. |
| WU8 | Endurecimiento | Logs sanitizados, rate limits, QA y documentación AS-IS. |

Cada WU sigue RED → GREEN → TRIANGULATE → REFACTOR y mantiene prueba, código
y documentación en la misma unidad revisable.

## 8. Archivos previstos

### Nuevos

```text
backend/src/adapters/linkedin.adapter.ts
backend/src/controllers/linkedin.controller.ts
backend/src/controllers/linkedin-webhook.controller.ts
backend/src/jobs/linkedin-reconciliation.job.ts
backend/src/jobs/linkedin-token-refresh.job.ts
backend/src/lib/firma-linkedin.ts
backend/src/repositories/linkedin-conexion.repository.ts
backend/src/repositories/linkedin-formulario.repository.ts
backend/src/repositories/linkedin-fuente.repository.ts
backend/src/repositories/linkedin-oauth-state.repository.ts
backend/src/routes/linkedin.routes.ts
backend/src/schemas/linkedin.schema.ts
backend/src/services/linkedin-api.service.ts
backend/src/services/linkedin-discovery.service.ts
backend/src/services/linkedin-lead.service.ts
backend/src/services/linkedin-oauth.service.ts
backend/src/services/linkedin-subscription.service.ts
backend/src/services/linkedin-token.service.ts
backend/src/services/linkedin-webhook.service.ts
backend/src/types/linkedin.ts
```

### Modificados

```text
.env.example
docker-compose.yml
backend/prisma/schema.prisma
backend/src/config/env.ts
backend/src/repositories/cuenta-publicitaria.repository.ts
backend/src/repositories/lead-recibido.repository.ts
backend/src/routes/bridges.routes.ts
backend/src/routes/index.ts
backend/src/server-lifecycle.ts
backend/src/services/bridge.service.ts
backend/src/services/ingesta.service.ts
docs/00-estado-documentacion.md
docs/05-bridges.md
docs/06-modulos-backend.md
docs/13-configuracion-bridges.md
```

## 9. Criterios de aceptación

- [ ] Un administrador obtiene una URL de autorización para un bridge LINKEDIN.
- [ ] El callback rechaza state vencido, desconocido o reutilizado.
- [ ] Tokens y client secret nunca aparecen en respuestas, logs o errores.
- [ ] Una autorización descubre y permite seleccionar varias fuentes.
- [ ] Sponsored accounts se integran con la atribución vigente.
- [ ] Organizaciones no se modelan falsamente como cuentas publicitarias.
- [ ] LinkedIn valida el endpoint mediante challenge HMAC-SHA256.
- [ ] Cada POST verifica `X-LI-Signature` sobre el raw body.
- [ ] El webhook confirma solo después de persistencia durable.
- [ ] Redeliveries no duplican `LeadRecibido` ni `Lead`.
- [ ] El worker resuelve el detalle fuera de la transacción PostgreSQL.
- [ ] El adapter produce `LeadEntrante` sin valores inventados.
- [ ] La reconciliación recupera huecos sin duplicar leads.
- [ ] Refresh programático funciona cuando LinkedIn lo habilita.
- [ ] Ausencia/revocación de refresh token conduce a reconexión explícita.
- [ ] LinkedIn solo aparece como red soportada después de cerrar todos los WU.
- [ ] El comportamiento single-company vigente no cambia.

## 10. Gates externos antes de implementar

La implementación no debe comenzar sin evidencia de:

1. App creada y verificada en LinkedIn Developer Portal.
2. Acceso aprobado al programa Lead Sync API; Advertising API por sí sola no
   concede acceso a respuestas de leads.
3. Scope `r_marketing_leadgen_automation` disponible en la pestaña Auth.
4. Redirect URI HTTPS registrado exactamente.
5. Caso de uso de webhooks aprobado.
6. Endpoint HTTPS público; LinkedIn no acepta HTTP ni ngrok para este webhook.
7. Confirmación de refresh tokens programáticos para la aplicación.

LinkedIn revalida periódicamente el endpoint. Si falla tres veces consecutivas,
lo bloquea y deja de enviar eventos; esta condición debe generar alerta
operativa y quedar visible en `bridge_logs`.

## 11. Fuera de alcance

- Botón o pantalla frontend.
- OAuth de Meta o TikTok.
- Cambios al modelo de autorización multi-tenant/holding.
- Motor genérico de mapeo configurable.
- Uso de tokens manuales como flujo productivo.
- Creación o edición de formularios/campañas LinkedIn desde el CRM.
