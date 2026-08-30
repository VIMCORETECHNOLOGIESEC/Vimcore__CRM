# 05 — Bridges de captación

Un **bridge** es el adaptador que traduce el formato de leads de una plataforma
al contrato interno del CRM. Integración directa contra APIs oficiales, sin
Zapier, Make ni n8n: el control de la interconectividad es parte del valor del
producto.

---

## 1. Arquitectura — Implementado

```
Plataforma externa
      │  webhook / consulta programada
      ▼
┌──────────────────────────────────┐
│  Adaptador específico            │  Verifica firma, traduce el payload
│  (meta / linkedin / x / gforms)  │  al contrato interno
└──────────────┬───────────────────┘
               ▼
┌──────────────────────────────────┐
│  Normalizador  (compartido)      │  Teléfono a E.164, correo, campos fijos
└──────────────┬───────────────────┘
               ▼
┌──────────────────────────────────┐
│  Deduplicador  (compartido)      │  Identidad de cliente y reingreso
└──────────────┬───────────────────┘
               ▼
┌──────────────────────────────────┐
│  Persistencia + Asignación       │  Transacción única
└──────────────┬───────────────────┘
               ▼
        Notificación + SSE
```

Solo el primer bloque cambia por plataforma. Todo lo demás es común, y agregar
TikTok o un sitio web propio consiste en escribir un adaptador nuevo.

---

## 2. Contrato interno de ingesta — Implementado

Todo adaptador entrega esta estructura. Si no puede llenar un campo, lo deja nulo;
no inventa valores por defecto.

```ts
export interface LeadEntrante {
  redSocial: RedSocial;
  bridgeId: string;

  // Campos fijos
  nombre: string | null;
  telefono: string | null;        // sin normalizar
  correo: string | null;          // sin alterar

  // Atribución
  idExternoLead: string;          // idempotencia
  idExternoCampania: string | null;
  nombreCampania: string | null;
  idExternoCuenta: string | null;

  // Resto del formulario
  camposDinamicos: Record<string, unknown>;

  ingresadoEn: Date;              // marca de tiempo de la plataforma
  payloadOriginal: unknown;
}
```

**Idempotencia:** `(bridgeId, idExternoLead)` lleva índice único en una tabla
`leads_recibidos`. Las plataformas reintentan webhooks ante cualquier respuesta
que no sea 200, y sin esta protección un reintento genera duplicados que la
deduplicación por teléfono **no** detecta, porque un mismo lead legítimo sí puede
volver a entrar como reingreso. Son dos problemas distintos y necesitan dos
defensas distintas.

**Respuesta al webhook:** después de validar y confirmar el commit en PostgreSQL,
devolver exactamente `200 { recepcionId, estado: "ACEPTADO" }`. El identificador
es opaco y confirma solo recepción durable, no creación del lead. Un duplicado
secuencial o concurrente obtiene el recibo original. El worker reclama con lease,
procesa en transacción y publica SSE/asigna únicamente después del commit; al
tercer fallo conserva el sobre y el error en `FALLA_MANUAL`.

---

## 3. Meta — Facebook e Instagram — Implementado

Adaptador, webhook (firma + handshake), servicio de token y job de
verificación diaria existen en `backend/src/adapters/meta.adapter.ts`,
`controllers/meta-webhook.controller.ts`, `services/meta-token.service.ts`
y `jobs/verificacion-token.job.ts`.

**API:** Meta Lead Ads (Graph API)
**Mecanismo:** webhook con notificación + consulta del detalle

Meta no envía el contenido del lead en el webhook: envía un `leadgen_id`. El
adaptador debe consultar `GET /{leadgen_id}` con el token de la página para
obtener los campos.

| Aspecto | Detalle |
|---|---|
| Permisos requeridos | `leads_retrieval`, `pages_manage_metadata`, `pages_show_list`, `pages_read_engagement`, `ads_management` (verificado contra la Webhooks for Leadgen Guide vigente; `business_management` solo aplica si la app además administra el Business Manager en sí, no para la suscripción de leads) |
| Verificación | Firma `X-Hub-Signature-256` (HMAC-SHA256 con el App Secret) |
| Handshake | Responder al `hub.challenge` en la suscripción inicial |
| Suscripción y token | **Por Página de Facebook**, no por Business ni por cuenta publicitaria: cada Página se suscribe individualmente (`POST /{page-id}/subscribed_apps`) y tiene su propio Page Access Token |
| Vigencia del token | Un Page Access Token de larga duración (derivado de un User Token de larga duración) **no caduca en un ciclo fijo de ~60 días** — eso aplica solo a los User Tokens. El Page Token permanece válido hasta que se revoca el permiso, se cambia la contraseña del usuario o se desautoriza la app |
| Campaña | Disponible consultando `GET /{leadgen_id}?fields=field_data,ad_id,form_id,campaign_name,ad_name` — no viene en el payload del webhook ni por defecto en la consulta |
| Instagram | **No opera de forma independiente**: toda cuenta profesional de Instagram debe estar vinculada a una Página de Facebook para correr Lead Ads. Sus leads llegan por el webhook de esa misma Página — no existe suscripción ni token separado para Instagram. La API no expone un campo `platform` que distinga el origen; si se necesita reportar FB vs. IG, hay que derivarlo de `ad_id`/`form_id`/metadata de campaña |

> **Bloqueante de cronograma (R3):** los permisos exigen App Review de Meta,
> y la Business Verification es hoy un requisito duro para obtener Advanced
> Access sobre `ads_management`/`business_management` contra Páginas reales
> (Standard Access solo sirve contra Páginas de prueba propias). Inicia el
> proceso el primer día. Mientras tanto, desarrolla contra la herramienta de
> pruebas de Lead Ads, que permite generar leads de prueba sin campaña activa.

**Verificación de token:** trabajo programado diario que valida el token
vigente por página vía `/debug_token` (no una cuenta regresiva fija de días,
dado que el Page Token no expira por calendario) y notifica a los
administradores ante invalidez o revocación detectada.

**Modelo de datos:** `CuentaPublicitaria` representa una Página de Facebook
(un `pageId` de Meta, su propio Page Access Token cifrado y su propio estado
de suscripción al webhook), con un `instagramAccountId` opcional en la misma
fila para la cuenta de Instagram vinculada — nunca una fila separada por
Instagram, porque no tiene suscripción ni token propios.

---

## 4. LinkedIn — Conexión implementada; adaptador de ingesta pendiente

El backend ya implementa OAuth 2.0, conexión, discovery de formularios y
activación de suscripción a `leadNotifications`
(`backend/src/services/linkedin/`, `backend/src/controllers/linkedin/`,
`backend/src/routes/linkedin/` — ver
`docs/contrato-frontend-linkedin-api_mat_05.md` y
`docs/claude-linkedin-estado-actual.md`; frontend conectado desde el commit
`ac906c9`, sin mocks). Lo que sigue sin existir es el adaptador/consulta
programada que efectivamente recibe/trae los leads de LinkedIn Lead Sync y
los inserta en el pipeline de `Lead`: no hay adaptador propio en
`backend/src/adapters/` ni job de polling en `backend/src/jobs/` todavía —
mientras esa pieza no exista, activar una fuente no hace llegar leads reales
al CRM. Esta sección describe ese requisito funcional y diseño de
integración pendientes.

**API:** LinkedIn Lead Sync (Marketing Developer Platform)
**Mecanismo:** consulta programada de formularios de generación de leads

| Aspecto | Detalle |
|---|---|
| Acceso | Requiere aprobación en el LinkedIn Marketing Developer Platform |
| Token | OAuth 2.0 con refresh token; caducidad más corta que la de Meta |
| Campaña | Disponible vía la API de campañas |
| Frecuencia | Consulta cada 5 minutos |

LinkedIn es el único bridge del MVP que no opera por push. Aísla esta diferencia
en el adaptador: el resto del sistema no debe saber que este lead llegó por
consulta y no por webhook.

> **Bloqueante de cronograma (R2):** la aprobación puede tardar semanas. Solicítala
> el primer día del proyecto.

---

## 5. X (Twitter) — Diseño (endpoint reutilizado, adaptador no implementado)

`POST /api/v1/ingesta/generico` existe y está montado (`routes/ingesta.routes.ts`),
pero hoy solo despacha al adaptador de Google Forms
(`controllers/ingesta.controller.ts`); no hay un adaptador de X conectado
todavía.

> **Advertencia (R1).** X no ofrece hoy una API de formularios de lead nativos.
> Las Lead Generation Cards, el formato equivalente a Meta Lead Ads, fueron
> descontinuadas por la plataforma. La captación en X se realiza dirigiendo el
> anuncio a un formulario propio del anunciante.

**Implementación adoptada: ingesta genérica.**

| Aspecto | Detalle |
|---|---|
| Mecanismo | Endpoint propio `POST /api/v1/ingesta/generico` |
| Autenticación | Clave de API por bridge en cabecera `X-Bridge-Key` |
| Atribución de campaña | Parámetros UTM propagados desde el anuncio al formulario |
| Métricas de X | Opcionalmente vía X Pixel / Conversions API, fuera del alcance del MVP |

Este mismo endpoint es el que servirá al bridge de sitio web propio cuando se
implemente, sin trabajo adicional.

**Antes de comprometer esta funcionalidad con el cliente**, confirma qué esperaba
exactamente de "bridge de X". Si esperaba recepción automática desde un formulario
nativo de X, esa expectativa no es realizable y conviene aclararlo ahora y no en
la entrega.

---

## 6. Google Forms (pruebas) — Implementado

Bridge de desarrollo y demostración. **Se implementa primero**, porque permite
ejercitar el embudo completo sin depender de las aprobaciones de Meta y LinkedIn,
que son el mayor riesgo de cronograma del proyecto.

| Aspecto | Detalle |
|---|---|
| Mecanismo | Google Apps Script con disparador `onFormSubmit` que hace POST al endpoint genérico |
| Autenticación | Clave de API por bridge |
| Campaña | Campo del propio formulario |

Debe quedar **desactivado por defecto** en el despliegue de producción.

---

## 7. Panel de administración de bridges — Requisito + Diseño

Accesible solo para el rol administrador.

**Listado:** red social, nombre, estado, fecha del último lead recibido,
expiración del token.

**Detalle:**
- Alta y baja de cuentas publicitarias
- Carga y renovación de token con verificación inmediata de validez
- Prueba de conexión bajo demanda
- Bitácora de errores con filtro por nivel y rango de fechas
- Contador de leads recibidos por período

**El token nunca se devuelve por la API**, ni siquiera enmascarado. La interfaz
muestra únicamente estado y fecha de expiración. Un campo de token que se
rellena con el valor guardado es una filtración esperando ocurrir.

---

## 8. Manejo de errores — Implementado (Meta y Google Forms); Diseño (LinkedIn, X)

| Situación | Comportamiento |
|---|---|
| Firma de webhook inválida | Descartar, registrar en `bridge_logs` nivel ERROR, responder 401 |
| Token expirado | Marcar bridge `TOKEN_EXPIRADO`, notificar a administradores, seguir aceptando webhooks para no perder datos |
| Lead sin teléfono ni correo | Persistir con marca de dato incompleto, notificar a supervisores. **Nunca descartar**: es un lead pagado |
| Teléfono no normalizable | Persistir con `telefono_valido = false` |
| Fallo de la API de Meta al consultar el detalle | Reintentar con retroceso exponencial (3 intentos). Si falla, registrar el `leadgen_id` para reproceso manual |
| Bridge sin leads durante 72 h con campañas activas | Advertencia a administradores: probable problema de configuración |

El principio general: **no se pierde un lead**. Ante la duda, se persiste con la
marca correspondiente y se avisa a una persona, porque cada registro representa
inversión publicitaria ya gastada.
