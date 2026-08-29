# Contrato frontend: WhatsApp Business Platform (Meta) — material de prueba

> **Estado:** material de trabajo/pruebas, fuera de la secuencia numerada de
> `docs/` y sin registrar en `docs/00-estado-documentacion.md` a propósito —
> no es documentación de producción. Cubre únicamente los endpoints
> implementados abajo; ver la sección "Lo que todavía NO existe" para lo que
> falta. **Actualizado:** migración de `whatsappMessages` ya aplicada y
> `WHATSAPP_OAUTH_REDIRECT_URI` ya documentada en `.env.example` — rutas
> reverificadas contra el código real, sin cambios respecto a la versión
> anterior de este contrato.

Mensajería WhatsApp vía Embedded Signup de Meta (no es un `Bridge` — un
mensaje no es un lead, ver `docs/crear-app-meta-whatsapp-sandbox_mat_03.md`).
Un solo número de WhatsApp por empresa. El flujo de conexión son tres pasos
encadenados (`conectar` → `callback` → `conexion`); los mensajes viven bajo
`/conversaciones`.

Todos los endpoints de este contrato exigen `Authorization: Bearer
<accessToken>`, salvo `GET /whatsapp/callback` (Meta redirige ahí el
navegador del administrador; la identidad se recupera del `state`, no de un
JWT). Base: `http://localhost:3000/api/v1` en local.

Forma de error común a todos (Zod inválido, recurso no encontrado, permiso
denegado, etc.):

```json
{ "code": "string", "message": "string" }
```

---

## 1. Iniciar conexión (`GET /whatsapp/conectar`)

Rol `ADMINISTRADOR`. Redirige a Meta OAuth (Embedded Signup) con un `state`
opaco de un solo uso.

```
GET /whatsapp/conectar?empresaId=uuid   // empresaId SOLO si el actor es holding-wide (empresaId null en su sesión)

200 →
{ "authorizationUrl": "string", "expiraEn": "string (ISO 8601)" }

400 → whatsapp_empresa_requerida — actor holding-wide sin indicar empresaId
503 → whatsapp_oauth_no_configurado — falta WHATSAPP_OAUTH_REDIRECT_URI
```

Un actor scoped a una empresa (no holding-wide) siempre usa la suya — el
query param se ignora para ese caso.

---

## 2. Callback de Meta (`GET /whatsapp/callback`)

**Público, sin `Authorization`** — Meta redirige acá el navegador del
administrador. NO conecta nada todavía: solo descubre los números de
WhatsApp Business disponibles en la cuenta autorizada y devuelve un blob
opaco (`seleccion`) que el frontend debe reenviar tal cual al paso 3, sin
poder leerlo ni alterarlo.

```
GET /whatsapp/callback?code=string&state=string
// o en caso de cancelación: ?error=string&error_description=string&state=string

200 →
{
  "numeros": [
    { "wabaId": "string", "numeroTelefonoId": "string", "numeroDisplay": "string", "verifiedName": "string | null" }
  ],
  "seleccion": "string",              // blob cifrado (AES-256-GCM), reenviar tal cual — nunca contiene el access token en claro para quien lo lea
  "expiraEn": "string (ISO 8601)"     // TTL de la selección — vencida, hay que reiniciar el flujo desde el paso 1
}

400 → whatsapp_oauth_cancelado — el administrador canceló en Meta
400 → whatsapp_oauth_callback_invalido — falta code en un callback sin error
401 → whatsapp_oauth_state_invalido — state desconocido, vencido, ya usado o no coincidente
502 → whatsapp_oauth_intercambio_fallido — Meta rechazó o no respondió al exchange
```

---

## 3. Completar conexión (`POST /whatsapp/conexion`)

Rol `ADMINISTRADOR`. El administrador elige un número de los devueltos en el
paso 2; recién acá se persiste la `WhatsAppConexion` (cifrada) — el paso 2
**nunca conecta automático**.

```
POST /whatsapp/conexion
Body:
{
  "seleccion": "string",          // el blob devuelto tal cual por el paso 2
  "numeroTelefonoId": "string",   // cuál de los `numeros` del paso 2 elige el admin
  "empresaId": "uuid"             // opcional, solo si el actor es holding-wide; debe coincidir con la empresa del flujo iniciado en el paso 1
}

200 →
{
  "conexion": {
    "id": "uuid",
    "empresaId": "uuid",
    "numeroTelefonoId": "string",
    "numeroDisplay": "string",
    "wabaId": "string",
    "estado": "ACTIVA | TOKEN_EXPIRADO | ERROR | INACTIVA",
    "creadoEn": "string (ISO 8601)"
    // el token de acceso NUNCA aparece acá, ni cifrado ni en claro
  }
}

400 → whatsapp_empresa_requerida
401 → whatsapp_seleccion_invalida — blob alterado, vencido, o de otra empresa
422 → whatsapp_numero_invalido — numeroTelefonoId no está entre los descubiertos en el paso 2
```

---

## 4. Listar conversaciones (`GET /conversaciones`)

Cualquier usuario autenticado. Administrador/Supervisor ven todas dentro de
su alcance de empresa (holding-wide si no tienen empresa asignada);
Asesor/Vendedor solo ven las propias (`asesorId` = su id) — Vendedor en la
práctica nunca tiene conversaciones asignadas (WhatsApp es asesor↔cliente).

```
GET /conversaciones?pagina=1&limite=25   // limite: 10 | 25 | 50 | 100, default 25

200 →
{
  "conversaciones": [
    {
      "id": "uuid",
      "clienteId": "uuid",
      "clienteNombre": "string | null",
      "clienteTelefono": "string | null",
      "asesorId": "uuid | null",
      "asesorNombre": "string | null",
      "ultimoMensajeEn": "string (ISO 8601) | null",
      "creadaEn": "string (ISO 8601)"
    }
  ],
  "total": 0
}
```

---

## 5. Historial de mensajes (`GET /conversaciones/:id/mensajes`)

Mismo criterio de acceso que el listado (`canView`), evaluado contra la
conversación puntual.

```
GET /conversaciones/:id/mensajes?pagina=1&limite=25

200 →
{
  "mensajes": [
    {
      "id": "uuid",
      "conversacionId": "uuid",
      "direccion": "ENTRANTE | SALIENTE",
      "texto": "string | null",
      "usuarioId": "uuid | null",   // quién lo escribió — solo aplica a SALIENTE
      "enviadoEn": "string (ISO 8601)"
    }
  ],
  "total": 0
}

403 → permiso_denegado
404 → conversacion_no_encontrada
```

---

## 6. Responder un mensaje (`POST /conversaciones/:id/mensajes`)

Mismo criterio de acceso que el punto 5 (`canReply === canView`). Envía de
verdad vía WhatsApp Cloud API — solo persiste el mensaje SALIENTE tras una
confirmación real de Meta (`wamid`), nunca un envío optimista.

```
POST /conversaciones/:id/mensajes
Body:
{ "texto": "string (1 a 4096 caracteres)" }

201 →
{
  "mensaje": {
    "id": "uuid", "conversacionId": "uuid", "direccion": "SALIENTE",
    "texto": "string", "usuarioId": "uuid", "enviadoEn": "string (ISO 8601)"
  }
}

403 → permiso_denegado
404 → conversacion_no_encontrada
422 → whatsapp_cliente_sin_telefono — el cliente de la conversación no tiene teléfono válido
503 → whatsapp_conexion_no_disponible — no hay una WhatsAppConexion ACTIVA para la empresa
```

---

## Lo que todavía NO existe (no lo asuman en el front)

- **No hay un `GET /whatsapp/conexion`** para consultar el estado de la
  conexión de la empresa de forma independiente (a diferencia del LinkedIn de
  este mismo backend, que sí tiene `GET /bridges/:id/linkedin/conexion`). El
  repositorio ya tiene la función (`whatsapp-conexion.repository.ts::
  findByEmpresaId`) pero ningún controller/ruta la usa todavía — hoy el único
  momento en que el front ve el DTO de la conexión es la respuesta del paso 3
  (`POST /whatsapp/conexion`), en el momento de conectar. Si el front necesita
  mostrar "¿WhatsApp está conectado?" en una pantalla de configuración
  separada, ese endpoint hay que pedirlo/crearlo — no está.
- El webhook (`GET`/`POST /webhooks/whatsapp`) existe pero es
  exclusivamente para Meta (verificación por `hub.verify_token` y firma
  `X-Hub-Signature-256`) — no es un endpoint que el frontend llame nunca.
