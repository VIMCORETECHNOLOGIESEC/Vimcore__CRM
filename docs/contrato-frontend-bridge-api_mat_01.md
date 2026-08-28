# Contrato frontend: bridge API_EXTERNA (bridgeApi) — material de prueba

> **Estado:** material de trabajo/pruebas, fuera de la secuencia numerada de
> `docs/` y sin registrar en `docs/00-estado-documentacion.md` a propósito —
> no es documentación de producción. Cubre los endpoints implementados abajo;
> el job de polling que efectivamente trae los leads todavía no existe.

Bridge genérico tipo *pull*: en vez de un adaptador de código por proveedor
(como Meta o Google Forms), el administrador carga la URL, la API key y un
mapeo de campos por bridge. Sirve para cualquier API propia del cliente que
devuelva un array JSON de leads y acepte una API key por header.

Todos los endpoints exigen `Authorization: Bearer <accessToken>` de un
usuario con rol `ADMINISTRADOR` (`requireRole("ADMINISTRADOR")`, igual que el
resto de `/bridges`). Base: `http://localhost:3000/api/v1` en local.

Forma de error común a todos (Zod inválido, bridge no encontrado, tipo de
bridge incorrecto):

```json
{ "code": "string", "message": "string" }
```

---

## 1. Crear el bridge

Mismo endpoint genérico de siempre — no hay uno específico para `API_EXTERNA`.

```
POST /bridges
Body:
{
  "redSocial": "API_EXTERNA",
  "nombre": "string",
  "empresaId": "uuid"
}

201 →
{
  "bridge": { "id": "uuid", "redSocial": "API_EXTERNA", "nombre": "string", "estado": "INACTIVO", "ultimoLeadEn": null, "tokenExpiraEn": null },
  "claveApi": "string"   // clave en texto plano, se muestra UNA sola vez
}
```

El bridge nace `INACTIVO` y sin configuración — los tres endpoints siguientes
son los que la cargan.

---

## 2. Cargar/corregir conexión

Idempotente: sirve tanto para cargar la primera vez como para corregir un
error de configuración. No toca el mapeo si ya estaba cargado.

```
PATCH /bridges/:id/api-externa/conexion
Body:
{
  "url": "string (URL válida)",
  "credencialExterna": "string",       // API key en texto plano; se cifra en el server, nunca se devuelve
  "nombreHeaderApiKey": "string"       // opcional, default "X-Api-Key"
}

200 →
{
  "bridgeApiConfig": {
    "id": "uuid",
    "redSocial": "API_EXTERNA",
    "configuracionJson": { "url": "string", "nombreHeaderApiKey": "string", "mapeoCampos": { ... } }
    // credencialExterna NUNCA aparece acá, ni cifrada ni en claro
  }
}

400 → bridge existe pero no es API_EXTERNA
404 → bridge no existe
```

---

## 3. Cargar/corregir mapeo de campos

Idempotente, mismo criterio que el endpoint anterior. No toca `url`/credencial
ya cargados.

```
PATCH /bridges/:id/api-externa/mapeo
Body:
{
  "mapeoCampos": { "<clave del JSON externo>": "<campo interno>", ... },  // ver tabla abajo
  "parametroFecha": "string"   // opcional -- nombre del query param de fecha (ISO 8601 UTC) que soporta el GET del cliente
}

200 → misma forma de bridgeApiConfig que el endpoint anterior
400 → bridge no es API_EXTERNA, o mapeoCampos no mapea ninguna clave a "idExternoLead"
404 → bridge no existe
```

**Campos internos válidos como valor de `mapeoCampos`** (cualquier otro valor
es rechazado por Zod):

| Campo interno | Va a parar a... |
|---|---|
| `idExternoLead` | **Obligatorio** — al menos una clave del mapeo debe apuntar acá. Es la clave de idempotencia. |
| `nombre` | `Cliente.nombre` |
| `telefono` | `Cliente.telefonoOriginal` |
| `correo` | `CorreoCliente` |
| `idExternoCampania` | Atribución de campaña |
| `nombreCampania` | Atribución de campaña (texto crudo) |
| `idExternoCuenta` | Atribución de cuenta publicitaria |

Cualquier clave del JSON externo que no esté en `mapeoCampos` no se pierde —
se guarda igual en `camposDinamicos`, sin campo fijo asignado.

---

## 4. Probar conexión

Puramente diagnóstico — nunca persiste nada, nunca falla con 500 por un
problema de la API externa: siempre `200` con `{ ok, mensaje }`.

```
POST /bridges/:id/api-externa/probar-conexion
(sin body)

200 →
{ "ok": true, "mensaje": "Conexión verificada correctamente.", "cantidadLeads": 12 }
// o
{ "ok": false, "mensaje": "string (motivo: red, HTTP no-2xx, forma inesperada, conexión/credencial no cargada, etc.)" }
```
