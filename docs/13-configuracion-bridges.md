# 13 — Configuración de bridges (Meta y Google Forms)

Esta guía es operativa: cómo dejar un bridge funcionando de punta a punta, tanto
del lado externo (Meta App Dashboard, Google Forms) como del lado del CRM. El
contrato técnico de cada payload de ingesta (formato de `LeadEntrante`, manejo
de errores, idempotencia) ya está documentado en
[`05-bridges.md`](05-bridges.md) y no se repite acá.

Hoy hay dos canales de ingesta implementados de punta a punta: **Google Forms**
(clave de API) y **Meta Lead Ads** (Facebook/Instagram, Page Access Token +
webhook). Además, Bloque E agrega una conexión separada de **Meta Ads
Marketing API** para métricas de campañas (`act_<id>`); no reemplaza la
configuración de Páginas de leadgen. LinkedIn y X están documentados en
`05-bridges.md`; LinkedIn tiene backend propio y X sigue sin adaptador de
ingesta dedicado.

---

## 1. Variables de entorno involucradas

Todas viven en `backend/src/config/env.ts` y se completan en el `.env` de la
raíz del repo (ver `.env.example`), nunca en texto plano en este documento.
Las variables centrales son obligatorias al arranque; las integraciones OAuth
opcionales responden `503` en su endpoint de conexión si falta su redirect URI.

| Variable | Para qué sirve | Usada por |
|---|---|---|
| `TOKEN_ENCRYPTION_KEY` | Clave maestra AES-256-GCM (64 caracteres hex / 32 bytes) para cifrar en reposo `CuentaPublicitaria.tokenCifrado` | Cualquier bridge que administre un token de proveedor (hoy: Meta) |
| `META_APP_ID` | ID numérico de la Meta App, del dashboard ("Configuración básica") | Consulta a `/debug_token` (verificación de token, carga/renovación) |
| `META_APP_SECRET` | App Secret de la Meta App | Firma HMAC-SHA256 (`X-Hub-Signature-256`) del webhook de leadgen |
| `META_WEBHOOK_VERIFY_TOKEN` | Valor arbitrario elegido por el administrador al suscribir el webhook en el dashboard de Meta | Handshake `GET /api/v1/ingesta/meta` (`hub.verify_token`) |
| `META_ADS_OAUTH_REDIRECT_URI` | Redirect URI registrada en Meta para conectar cuentas de anuncios `act_<id>` con permiso `ads_read` | `GET /api/v1/meta-ads/conectar` / `callback` |
| `REPORTES_STORAGE_DIR` | Directorio interno donde se escriben PDF/XLSX generados | Jobs de reportes |
| `SEED_BRIDGE_CLAVE_API` | Clave de API del bridge Google Forms creado por el seed de desarrollo | Solo `backend/prisma/seed.ts` — no interviene en runtime del servidor |

`SEED_BRIDGE_CLAVE_API`/`TOKEN_ENCRYPTION_KEY` nunca se imprimen en este
documento en texto plano. Para obtener el valor real de la clave del bridge
sembrado en el contenedor en ejecución:

```bash
docker compose exec backend sh -c 'echo $SEED_BRIDGE_CLAVE_API'
```

La clave de API de un bridge **nunca se devuelve por la API una vez creada**
(ni el token de una cuenta publicitaria, ni siquiera enmascarado) — la única
forma de recuperarla es la variable de entorno del seed (para el bridge de
pruebas) o regenerarla desde el panel (ver §3.3), que invalida la anterior.

---

## 2. Cómo se crea un bridge desde el CRM

Solo el rol **Administrador** accede a `/bridges` (`docs/07-modulos-frontend.md`
F8; backend: cada endpoint de `bridges.routes.ts`/`ingesta.routes.ts` exige
`requireRole("ADMINISTRADOR")` salvo los dos de ingesta pública).

1. Iniciar sesión como `admin@crm.local`.
2. Ir a `/bridges` → botón **Nuevo bridge**.
3. Elegir la **Red social** (el selector se puebla desde
   `GET /bridges/catalogo/redes-soportadas`, no es una lista fija en el
   frontend) y un **Nombre** identificador.
4. Confirmar con **Crear bridge**. El backend (`POST /bridges`) crea el
   registro en estado `INACTIVO` y genera la clave de API del lado del
   servidor — el administrador nunca la escribe.
5. Aparece el modal **Clave de API de `<nombre>`**: es la **única vez** que se
   muestra en texto plano. El cierre queda bloqueado hasta tildar «Ya copié la
   clave y la guardé en un lugar seguro». El sistema solo guarda su hash
   (`Bridge.claveApiHash`, comparación en tiempo constante) y no puede volver
   a mostrarla — si se pierde, la única salida es regenerarla (§3.3).
6. El bridge nuevo queda `INACTIVO`. Activarlo es una acción explícita
   (botón **Reactivar** en la tabla de `/bridges`) — un bridge recién creado
   nunca empieza a aceptar leads solo.

`POST /bridges` (equivalente por API, requiere `Authorization: Bearer <access
token de admin>`):

```bash
curl -X POST http://localhost:3000/api/v1/bridges \
  -H "Authorization: Bearer <ACCESS_TOKEN_ADMIN>" \
  -H "Content-Type: application/json" \
  -d '{"redSocial": "GOOGLE_FORMS", "nombre": "Google Forms — Campaña Q3"}'
```

Respuesta `201`:

```json
{ "bridge": { "id": "...", "redSocial": "GOOGLE_FORMS", "nombre": "...", "estado": "INACTIVO", "ultimoLeadEn": null, "...": "..." }, "claveApi": "<clave en texto plano, una sola vez>" }
```

---

## 3. Bridge Google Forms

**Canal de ingesta que representa:** formularios de generación de leads de
Google Forms — el bridge de desarrollo/demostración. Se autentica con
**clave de API por bridge** (estilo `CLAVE_API`, no un token OAuth), y por eso
nunca tiene `CuentaPublicitaria` asociada: la sección «Cuentas publicitarias
asociadas» del detalle del bridge queda vacía a propósito.

### 3.1 Configuración del lado externo (Google Forms)

1. Crear el formulario en Google Forms con los campos que se quieran capturar
   (nombre, teléfono, correo, campaña, y cualquier campo dinámico adicional).
2. En el editor del formulario → menú **⋮** → **Editor de secuencias de
   comandos** (Apps Script).
3. Agregar una función que, en el disparador `onFormSubmit`, arme el payload
   del contrato de `POST /api/v1/ingesta/generico` (ver §3.2) a partir de
   `e.namedValues` y lo envíe con `UrlFetchApp.fetch`, incluyendo el header
   `X-Bridge-Key` con la clave de API del bridge.
4. En **Activadores** (ícono de reloj, panel izquierdo de Apps Script), crear
   un disparador **Al enviarse el formulario** que ejecute esa función.
5. `idExternoLead` (obligatorio en el contrato) debe ser un identificador
   estable de esa respuesta — Apps Script expone `e.response.getId()` para
   eso.

Este mismo endpoint sirve a X y a un futuro sitio propio sin trabajo
adicional (`docs/05-bridges.md` §5), así que el patrón de Apps Script de
arriba es reutilizable para cualquier bridge de estilo `CLAVE_API`.

### 3.2 Configuración del lado del CRM

- Autenticación: header `X-Bridge-Key: <clave de API del bridge>` en cada
  `POST /api/v1/ingesta/generico`. La resuelve `requireBridgeKey`
  (`backend/src/middlewares/require-bridge-key.middleware.ts`): clave
  ausente, malformada o de un bridge que no está `ACTIVO` → `401
  bridge_no_autenticado`, con una fila `bridge_logs` nivel `ERROR`.
- El bridge debe estar en estado `ACTIVO` (§2, paso 6) — un bridge `INACTIVO`
  rechaza cualquier envío con el mismo 401, aunque la clave sea correcta.
- Payload esperado (`backend/src/schemas/ingesta.schema.ts::ingestaGenericaSchema`):

  | Campo | Tipo | Obligatorio | Nota |
  |---|---|:--:|---|
  | `idExternoLead` | string | ✅ | Idempotencia — reenviar el mismo valor no crea un segundo lead |
  | `nombre` | string \| null | — | `null` si se omite, nunca `""` |
  | `telefono` | string \| null | — | Se normaliza a E.164 (EC por defecto) del lado del servidor |
  | `correo` | string \| null | — | Se persiste sin alterar |
  | `idExternoCampania` | string \| null | — | |
  | `nombreCampania` | string \| null | — | |
  | `idExternoCuenta` | string \| null | — | |
  | `ingresadoEn` | fecha ISO | — | Si se omite, usa el momento de recepción del servidor |
  | `camposDinamicos` | objeto | — | Resto del formulario, sin restricción de forma |

### 3.3 Regenerar la clave de API

Desde el detalle del bridge (`/bridges/:id` → sección **Credenciales**, solo
visible para bridges de estilo `CLAVE_API`): botón **Regenerar clave**. Esto
invalida la clave anterior de inmediato (cualquier envío posterior con la
clave vieja pasa a responder `401`) y muestra el mismo modal de una sola
exposición que la creación (§2, paso 5).

Equivalente por API: `POST /bridges/:id/clave` (solo administrador), misma
respuesta `{ bridge, claveApi }` que `POST /bridges`.

### 3.4 Caso de referencia ya sembrado

El ambiente Docker de desarrollo trae un bridge Google Forms creado por
`backend/prisma/seed.ts`:

- Nombre: **"Google Forms (pruebas)"**.
- Estado inicial: **`INACTIVO`** (a propósito — `docs/05-bridges.md` §6:
  "debe quedar desactivado por defecto en el despliegue de producción"; en
  desarrollo un administrador lo activa explícitamente al empezar a probar).
- Clave de API: el valor de `SEED_BRIDGE_CLAVE_API` en el `.env` del
  contenedor `backend` — obtenerlo con el comando de §1, nunca pegarlo en
  texto plano en un documento versionado.
- Sin cuentas publicitarias asociadas (estilo `CLAVE_API`, no aplica).

Para activarlo desde el CRM: iniciar sesión como `admin@crm.local`, ir a
`/bridges`, y en la fila "Google Forms (pruebas)" hacer clic en **Reactivar**.

### 3.5 Ejemplo de request real

Con el bridge ya `ACTIVO` y `<CLAVE>` reemplazado por el valor obtenido en
§1:

```bash
curl -i -X POST http://localhost:3000/api/v1/ingesta/generico \
  -H "X-Bridge-Key: <CLAVE>" \
  -H "Content-Type: application/json" \
  -d '{
    "idExternoLead": "gforms-demo-001",
    "nombre": "Prueba Bridge",
    "telefono": "0991234567",
    "correo": "prueba.bridge@example.com",
    "idExternoCampania": "camp-demo",
    "nombreCampania": "Campaña de prueba",
    "camposDinamicos": { "presupuesto_estimado": "500-1000" }
  }'
```

Respuesta esperada, `200`:

```json
{ "recepcionId": "<uuid opaco>", "estado": "ACEPTADO" }
```

Reenviar exactamente el mismo `idExternoLead` produce el mismo
`recepcionId` (idempotencia) y no crea un segundo lead. El lead resultante
aparece en `GET /api/v1/leads` (o en `/leads` del frontend) en etapa
**NUEVO**, con `redSocial: GOOGLE_FORMS`, asignado automáticamente al asesor
de menor carga activa.

---

## 4. Bridge Meta (Facebook e Instagram)

**Canal de ingesta que representa:** Meta Lead Ads (Graph API) — Facebook e
Instagram comparten el mismo bridge, porque Instagram no opera de forma
independiente (`docs/05-bridges.md` §3): toda cuenta profesional de Instagram
debe estar vinculada a una Página de Facebook, y sus leads llegan por el
webhook de esa misma Página.

### 4.1 Configuración del lado externo (Meta App Dashboard)

1. Crear (o usar) una Meta App en [developers.facebook.com](https://developers.facebook.com).
2. En **Configuración básica**, anotar el **App ID** y el **App Secret** —
   son `META_APP_ID`/`META_APP_SECRET` del CRM.
3. Solicitar los permisos: `leads_retrieval`, `pages_manage_metadata`,
   `pages_show_list`, `pages_read_engagement`, `ads_management`. Requieren
   App Review y, para Páginas reales (no de prueba), Business Verification —
   es el mayor riesgo de cronograma de este bridge (`docs/05-bridges.md` §3,
   "Bloqueante de cronograma R3"); iniciar el proceso lo antes posible y
   mientras tanto desarrollar contra la herramienta de pruebas de Lead Ads.
4. Configurar el **Webhook** del producto Leads Ads:
   - URL de callback: `https://<host-público-del-backend>/api/v1/ingesta/meta`.
   - Verify Token: cualquier valor elegido por el administrador — debe
     coincidir exactamente con `META_WEBHOOK_VERIFY_TOKEN` del CRM. Meta hace
     un `GET` con `hub.mode=subscribe&hub.verify_token=...&hub.challenge=...`
     y el CRM debe responder el `challenge` tal cual, en texto plano.
   - Campo a suscribir: `leadgen`.
5. Por cada **Página de Facebook** que vaya a generar leads: suscribirla
   explícitamente (`POST /{page-id}/subscribed_apps`) y obtener su **Page
   Access Token** — la suscripción y el token son por Página, no por Business
   ni por cuenta publicitaria.

### 4.2 Configuración del lado del CRM

1. Crear el bridge: `/bridges` → **Nuevo bridge** → Red social **Facebook**
   (o el rótulo correspondiente a `FACEBOOK` en el catálogo) → nombre
   identificador. Queda `INACTIVO` hasta activarlo.
2. Registrar la Página como **cuenta publicitaria** del bridge:
   `/bridges/:id` → sección **Cuentas publicitarias asociadas** no tiene alta
   desde la interfaz todavía (gap documentado en `docs/07-modulos-frontend.md`
   F8 — requiere decidir de dónde sale el `idExterno`); se crea por API:

   ```bash
   curl -X POST http://localhost:3000/api/v1/bridges/<BRIDGE_ID>/cuentas \
     -H "Authorization: Bearer <ACCESS_TOKEN_ADMIN>" \
     -H "Content-Type: application/json" \
     -d '{
       "idExterno": "<page-id de Meta>",
       "nombre": "Página de Facebook — Marca X",
       "instagramAccountId": "<id de la cuenta de Instagram vinculada, opcional>"
     }'
   ```

3. Cargar el Page Access Token de esa cuenta — se verifica de inmediato
   contra `/debug_token` de Graph API antes de cifrarlo y guardarlo; un token
   inválido responde `422 meta_token_invalido` y **nunca** se persiste:

   ```bash
   curl -X POST http://localhost:3000/api/v1/bridges/<BRIDGE_ID>/cuentas/<CUENTA_ID>/token \
     -H "Authorization: Bearer <ACCESS_TOKEN_ADMIN>" \
     -H "Content-Type: application/json" \
     -d '{"token": "<Page Access Token>"}'
   ```

   Desde la interfaz: `/bridges/:id` → fila de la cuenta → formulario de
   token (solo visible para Facebook/Instagram — LinkedIn muestra "Fase 2 ·
   Proveedor OAuth no conectado todavía" porque no tiene adaptador real del
   lado del servidor). El campo de token **siempre se muestra vacío**, nunca
   precargado.
4. **Probar conexión** bajo demanda (puramente diagnóstico, no cambia ningún
   estado guardado): botón junto al token, o
   `POST /bridges/:id/cuentas/:cuentaId/probar-conexion`.
5. Activar el bridge (`PATCH /bridges/:id` con `{"estado": "ACTIVO"}`, o
   botón **Reactivar** en `/bridges`).

### 4.3 Ejemplo de request real (simulación del webhook)

Meta no manda el contenido del lead en el webhook, solo un `leadgen_id` — el
`POST` real solo encola el aviso; la consulta de detalle a Graph API corre
después, en el worker. Para simular una notificación válida hace falta
firmarla con `META_APP_SECRET` (HMAC-SHA256 sobre el cuerpo exacto):

```bash
BODY='{"object":"page","entry":[{"id":"<page-id>","time":1700000000,"changes":[{"field":"leadgen","value":{"leadgen_id":"1234567890","page_id":"<page-id>","form_id":"<form-id>","created_time":1700000000}}]}]}'
SIGNATURE="sha256=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$META_APP_SECRET" | sed 's/^.* //')"

curl -i -X POST http://localhost:3000/api/v1/ingesta/meta \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: $SIGNATURE" \
  -d "$BODY"
```

Respuesta esperada: `200` sin cuerpo. Una firma ausente o inválida responde
`401 firma_meta_invalida` y registra `bridge_logs` nivel `ERROR`, sin encolar
nada. El handshake de suscripción se prueba con:

```bash
curl "http://localhost:3000/api/v1/ingesta/meta?hub.mode=subscribe&hub.verify_token=$META_WEBHOOK_VERIFY_TOKEN&hub.challenge=1234"
```

Respuesta esperada: `200`, cuerpo de texto plano `1234` (idéntico al
`hub.challenge` recibido).

---

## 5. Meta Ads Marketing API para métricas

Esta sección no configura la ingesta de leads. Configura la cuenta de anuncios
Meta (`act_<id>`) desde la que Bloque E trae campañas e Insights diarios para
calcular CPC, CPL y CAC reales.

### 5.1 Configuración externa

1. Registrar `META_ADS_OAUTH_REDIRECT_URI` como redirect URI válido de la Meta
   App.
2. Habilitar el permiso mínimo `ads_read` para la app.
3. Completar el flujo con una cuenta que tenga acceso a la cuenta de anuncios.

Facebook e Instagram no usan cuentas de anuncios separadas: ambas plataformas
se distinguen en Insights por `publisher_platform`.

### 5.2 Flujo del CRM

1. `GET /api/v1/meta-ads/conectar` inicia OAuth y devuelve una URL de Meta.
2. `GET /api/v1/meta-ads/callback` consume el `state`, descubre cuentas
   `act_<id>` y devuelve un blob `seleccion` cifrado.
3. `POST /api/v1/meta-ads/conexion` recibe `cuentaAnunciosIdExterno` y
   `seleccion`; persiste la conexión segura de la empresa.
4. `GET /api/v1/meta-ads/conexion` devuelve el estado seguro, sin tokens.
5. El job `backend/src/jobs/metaAds/meta-ads-sync.job.ts` sincroniza campañas e
   Insights. Las métricas se consultan en
   `GET /api/v1/metricas/rendimiento-campanias` y se reutilizan en reportes.

El contrato técnico completo está en
[`22-contrato-backend-meta-ads.md`](22-contrato-backend-meta-ads.md).

> **Verificación externa pendiente:** el código quedó probado contra mocks y
> checks estáticos, pero la validación con una cuenta real de Meta sigue
> bloqueada por la verificación SMS de Meta.

---

## 6. Qué hacer si un bridge queda "mudo"

Un trabajo programado (`backend/src/jobs/bridge-mudo.job.ts`, cada 15
minutos, servicio `bridge-mudo.service.ts`) detecta bridges `ACTIVO` cuyo
`ultimoLeadEn` está vencido hace más de 72 horas y tienen al menos una
condición de "campaña activa" (sin ninguna `CuentaPublicitaria` registrada, o
con al menos una `activa = true`). Un bridge `INACTIVO`, o uno que nunca
recibió un lead (`ultimoLeadEn` nulo, sin marca de referencia para medir las
72 h), no dispara este aviso.

La advertencia se escribe en `bridge_logs` nivel `ADVERTENCIA` (visible en
`GET /bridges/:id/logs` o en la sección **Bitácora de errores** del detalle
del bridge en el frontend, filtro de Nivel) — con anti-spam propio
(`Bridge.advertenciaMudoEnviada`, se resetea al llegar un lead nuevo), así
que no se repite en cada tick mientras el silencio continúa. A diferencia de
un token expirado o una firma inválida (nivel `ERROR`), este nivel
`ADVERTENCIA` **no** dispara notificación push a los administradores hoy —
solo queda en la bitácora.

Pasos de diagnóstico ante un bridge sin leads:

1. Revisar `/bridges/:id` → **Bitácora de errores**, filtrando por nivel
   `ADVERTENCIA` y `ERROR`, en el rango de fechas relevante.
2. Confirmar que el bridge está `ACTIVO` (un bridge `INACTIVO` nunca debería
   estar recibiendo leads — no es un problema de configuración).
3. Para Google Forms: verificar que el disparador `onFormSubmit` del Apps
   Script siga activo y que la clave de API usada en el `UrlFetchApp.fetch`
   coincida con la vigente (si se regeneró, el script viejo queda huérfano).
4. Para Meta Lead Ads: revisar `/debug_token` manualmente o esperar al trabajo
   programado diario de verificación de token
   (`backend/src/jobs/verificacion-token.job.ts`, cada 24 h) — un token
   inválido o revocado marca la cuenta `TOKEN_EXPIRADO` y sí notifica a los
   administradores (nivel `ERROR`). Confirmar también que la Página siga
   suscrita (`GET /{page-id}/subscribed_apps` contra Graph API).
5. Probar conexión bajo demanda por cada Página del bridge
   (§4.2, paso 4) para descartar un problema de token sin esperar al cron.
