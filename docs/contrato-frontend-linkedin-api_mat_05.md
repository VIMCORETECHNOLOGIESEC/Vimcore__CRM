# Contrato frontend: LinkedIn Lead Sync — material de prueba

> **Estado:** material de trabajo/pruebas, fuera de la secuencia numerada de
> `docs/` y sin registrar en `docs/00-estado-documentacion.md` a propósito —
> no es documentación de producción. Basado en el código real (rutas,
> controllers, servicios), verificado contra la suite de tests (verde:
> discovery, rutas, OAuth, activación/suscripción).

LinkedIn **sí** es un `Bridge` (a diferencia de WhatsApp) — cada conexión
cuelga de un `Bridge` con `redSocial: LINKEDIN` ya creado vía `POST /bridges`.
Este contrato cubre solo los endpoints específicos de LinkedIn, anidados bajo
ese bridge.

Todos los endpoints exigen `Authorization: Bearer <accessToken>` de un
`ADMINISTRADOR`, salvo el callback OAuth (público, la identidad viaja en el
`state`). Base: `http://localhost:3000/api/v1` en local.

Forma de error común: `{ "code": "string", "message": "string" }`.

**Errores compartidos por cualquier endpoint que llame a la API de LinkedIn**
(probar-conexión, descubrir, activar/desactivar fuente) — no se repiten por
endpoint abajo:

| Code | HTTP | Motivo |
|---|---|---|
| `linkedin_token_expirado` | 409 | El access token venció, hace falta reconectar |
| `linkedin_reconexion_requerida` | 409 | No hay refresh token o falló la renovación |
| `linkedin_scope_insuficiente` | 422 | El token no tiene el permiso necesario |
| `linkedin_api_error` | 502 | LinkedIn respondió con error o payload inesperado |
| `linkedin_api_no_configurada` / `linkedin_oauth_no_configurado` | 503 | Faltan `LINKEDIN_*` en el `.env` del servidor |

---

## 1. Iniciar OAuth (`POST /bridges/:id/linkedin/oauth/iniciar`)

```
POST /bridges/:id/linkedin/oauth/iniciar
(sin body)

200 →
{ "authorizationUrl": "string", "expiraEn": "string (ISO 8601)" }

400 → validacion_invalida (id de bridge inválido)
404 → bridge_no_encontrado
422 → linkedin_bridge_invalido (el bridge no es redSocial LINKEDIN)
503 → linkedin_oauth_no_configurado
```

## 2. Callback de LinkedIn (`GET /integraciones/linkedin/oauth/callback`)

**Público, sin `Authorization`** — LinkedIn redirige acá el navegador.

```
GET /integraciones/linkedin/oauth/callback?code=string&state=string
// o cancelación: ?error=string&error_description=string&state=string (state obligatorio si hay error)

200 →
{
  "conexion": {
    "id": "uuid",
    "bridgeId": "uuid",
    "estado": "ACTIVA | TOKEN_EXPIRADO | REVOCADA | ERROR",
    "accessTokenExpiraEn": "string (ISO 8601)",
    "refreshTokenExpiraEn": "string (ISO 8601) | null",
    "scopes": ["string"],
    "tieneRefreshToken": true,
    "fuentes": []   // recién descubiertas en el paso 6, vacío en la primera conexión
  }
}

400 → validacion_invalida (query mal formada, o mezcla code+error)
400 → linkedin_oauth_cancelado (el admin canceló en LinkedIn)
400 → linkedin_oauth_callback_invalido (falta code sin error)
401 → linkedin_oauth_state_invalido (desconocido, vencido, ya usado)
502 → linkedin_oauth_intercambio_fallido
500 → linkedin_oauth_persistencia_fallida
```

`accessTokenExpiraEn`/`refreshTokenExpiraEn`/token en sí **nunca** viajan en claro — esto ya es el DTO seguro.

## 3. Ver conexión (`GET /bridges/:id/linkedin/conexion`)

```
GET /bridges/:id/linkedin/conexion

200 → { "conexion": <mismo shape del paso 2> | null }   // null si nunca se conectó

400 → validacion_invalida
404 → bridge_no_encontrado
422 → linkedin_bridge_invalido
```

## 4. Probar conexión (`POST /bridges/:id/linkedin/probar-conexion`)

Puramente diagnóstico.

```
POST /bridges/:id/linkedin/probar-conexion
(sin body)

200 → { "conectado": true, "verificadoEn": "string (ISO 8601)" }

400 → validacion_invalida
404 → bridge_no_encontrado
422 → linkedin_bridge_invalido
+ errores compartidos de arriba
```

## 5. Listar fuentes (`GET /bridges/:id/linkedin/fuentes`)

```
GET /bridges/:id/linkedin/fuentes

200 →
{
  "fuentes": [
    {
      "id": "uuid",
      "tipo": "SPONSORED_ACCOUNT | ORGANIZATION",
      "ownerUrn": "string",
      "nombre": "string | null",
      "tipoLead": "SPONSORED | EVENT | COMPANY | ORGANIZATION_PRODUCT",
      "activa": false,
      "estadoSuscripcion": "PENDIENTE | ACTIVA | ERROR | REVOCADA",
      "ultimaSincronizacionEn": "string (ISO 8601) | null"
    }
  ]
}

400 → validacion_invalida
404 → bridge_no_encontrado
422 → linkedin_bridge_invalido
```

## 6. Descubrir fuentes (`POST /bridges/:id/linkedin/fuentes/descubrir`)

Consulta LinkedIn en vivo (sponsored accounts + organizaciones con rol
permitido + formularios por owner) y hace upsert local — nunca activa una
fuente automáticamente, ni pisa la activación/suscripción ya existente.

```
POST /bridges/:id/linkedin/fuentes/descubrir
(sin body)

200 → { "fuentes": [ <mismo shape del paso 5> ] }

400 → validacion_invalida
404 → bridge_no_encontrado
422 → linkedin_bridge_invalido
409 → linkedin_conexion_requerida (nunca se completó el OAuth)
+ errores compartidos de arriba
```

## 7. Activar/desactivar una fuente (`PATCH /bridges/:id/linkedin/fuentes/:fuenteId`)

Activar suscribe de verdad a `leadNotifications` en LinkedIn; desactivar
desuscribe. Ninguna de las dos es optimista — el estado local solo cambia
después de la confirmación (o falla) real de LinkedIn.

```
PATCH /bridges/:id/linkedin/fuentes/:fuenteId
Body: { "activa": true }

200 → { "fuente": <mismo shape de fuente del paso 5> }
// activar fallido: fuente vuelve con activa:false, estadoSuscripcion:"ERROR"
// desactivar con baja remota fallida: activa:false local, pero la suscripción
// remota puede seguir viva -- reintentable, no se pierde el subscriptionId
// (subscriptionId en sí NUNCA aparece en esta respuesta)

400 → validacion_invalida (id de bridge/fuente inválido, o body sin `activa`)
404 → bridge_no_encontrado
422 → linkedin_bridge_invalido
404 → linkedin_fuente_no_encontrada (fuenteId no existe o es de otro bridge)
+ errores compartidos de arriba
```
