# 03 — Modelo de datos

PostgreSQL con Prisma (code-first). Sin columna `tenant_id`: la instancia es de
una sola empresa.

---

## 1. Diagrama de relaciones

```
usuarios ──┬──< leads.asesor_id
           ├──< leads.vendedor_id
           ├──< lead_eventos.usuario_id
           └──< notificaciones.usuario_id

clientes ──┬──< correos_cliente
           └──< leads

campanias ──< leads
cuentas_publicitarias ──< campanias
bridges ──┬──< cuentas_publicitarias
          ├──< bridge_logs
          └──< leads_recibidos ──> leads (nulo hasta que la ingesta resuelve el lead)

leads ──┬──< lead_eventos
        ├──< respuestas_formulario
        ├──< citas
        └──< leads_recibidos
```

---

## 2. Entidades

### `usuarios`

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `nombre` | text | |
| `correo` | citext UNIQUE | Login |
| `password_hash` | text | argon2id |
| `rol` | enum | `ADMINISTRADOR`, `SUPERVISOR`, `ASESOR`, `VENDEDOR` |
| `activo` | boolean | Baja lógica; nunca se borra un usuario con leads |
| `ultima_asignacion_en` | timestamptz NULL | Desempate del algoritmo de asignación |
| `creado_en` / `actualizado_en` | timestamptz | |

### `clientes`

Persona física detrás de uno o más leads.

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `nombre` | text | Último nombre recibido |
| `telefono_original` | text | Tal como llegó |
| `telefono_normalizado` | text **UNIQUE** | E.164. Clave de identidad |
| `telefono_valido` | boolean | `false` si no pasó validación E.164 |
| `creado_en` | timestamptz | |

> **Invariante crítica:** `telefono_normalizado` es único en toda la tabla. El
> índice único es la última línea de defensa contra duplicados por condición de
> carrera cuando dos webhooks llegan simultáneamente. La inserción debe usar
> `ON CONFLICT` y tratar el conflicto como "cliente ya existente", nunca como error.

### `correos_cliente`

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `cliente_id` | uuid FK | |
| `correo` | text | Valor original, sin alterar |
| `correo_normalizado` | citext | Solo para comparación |
| `es_principal` | boolean | El primero recibido |

UNIQUE (`cliente_id`, `correo_normalizado`)

### `leads`

Una oportunidad comercial. Un cliente puede acumular varias en el tiempo.

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `cliente_id` | uuid FK | |
| `campania_id` | uuid FK NULL | Nulo si el bridge no la reportó |
| `origen` | enum | `NUEVO`, `REINGRESO` |
| `red_social` | enum | `FACEBOOK`, `INSTAGRAM`, `X`, `LINKEDIN`, `GOOGLE_FORMS` |
| `etapa` | enum | `NUEVO`, `CONTACTADO`, `CITA`, `VENTA`, `NO_VENTA` |
| `semaforo` | enum | `ROJO`, `AMARILLO`, `VERDE` |
| `puntuacion` | int | 0–100, resultado del último formulario |
| `asesor_id` | uuid FK NULL | |
| `vendedor_id` | uuid FK NULL | Nulo hasta el traspaso |
| `campos_dinamicos` | jsonb | Campos variables del formulario de campaña |
| `sla_inicio_en` | timestamptz NULL | Se reinicia en cada reasignación |
| `ingresado_en` | timestamptz | Momento de recepción del webhook |
| `cerrado_en` | timestamptz NULL | Solo en etapas terminales |
| `monto_venta` | numeric(12,2) NULL | Obligatorio si etapa = VENTA |
| `observacion_cierre` | text NULL | Obligatorio si etapa = NO_VENTA |
| `payload_original` | jsonb | Cuerpo crudo del webhook, para auditoría |

**Índices necesarios:**

```sql
CREATE INDEX idx_leads_asesor_etapa    ON leads (asesor_id, etapa);
CREATE INDEX idx_leads_vendedor_etapa  ON leads (vendedor_id, etapa);
CREATE INDEX idx_leads_etapa_ingreso   ON leads (etapa, ingresado_en DESC);
CREATE INDEX idx_leads_campania        ON leads (campania_id);
CREATE INDEX idx_leads_red_social      ON leads (red_social);
CREATE INDEX idx_leads_sla             ON leads (sla_inicio_en) WHERE cerrado_en IS NULL;
```

El índice parcial de SLA es el que sostiene el job de detección de atrasos: solo
recorre leads abiertos, no el histórico completo.

**Invariantes:**

- `etapa = VENTA` ⟹ `cerrado_en` y `monto_venta` no nulos
- `etapa = NO_VENTA` ⟹ `cerrado_en` y `observacion_cierre` no nulos
- `vendedor_id` no nulo ⟹ `asesor_id` no nulo (no se traspasa lo que no fue asignado)
- `puntuacion` entre 0 y 100

### `lead_eventos`

Bitácora de auditoría. **Se escribe siempre en la misma transacción** que el
cambio que la origina. Es la base de todos los KPIs temporales.

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `lead_id` | uuid FK | |
| `usuario_id` | uuid FK NULL | Nulo si lo originó el sistema |
| `tipo` | enum | Ver tabla siguiente |
| `etapa_anterior` | enum NULL | |
| `etapa_nueva` | enum NULL | |
| `semaforo_anterior` | enum NULL | |
| `semaforo_nuevo` | enum NULL | |
| `detalle` | jsonb NULL | |
| `ocurrido_en` | timestamptz | |

Tipos de evento: `INGRESO`, `ASIGNACION`, `REASIGNACION`, `TRASPASO`,
`CAMBIO_ETAPA`, `CAMBIO_SEMAFORO`, `INTERACCION_REPETIDA`, `CITA_AGENDADA`,
`CITA_REPROGRAMADA`, `SLA_INCUMPLIDO`, `CIERRE`.

Índice: `(lead_id, ocurrido_en)` y `(tipo, ocurrido_en)`.

### `respuestas_formulario`

Respuestas al formulario de cada etapa. Se guarda **una fila por cada vez** que
se completa un formulario, no se sobrescribe: el historial de puntuación importa.

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `lead_id` | uuid FK | |
| `usuario_id` | uuid FK | Quién lo completó |
| `etapa` | enum | Etapa a la que corresponde |
| `respuestas` | jsonb | `{ clave_pregunta: valor }` |
| `puntuacion` | int | Resultado del cálculo |
| `semaforo` | enum | Color resultante |
| `version_rubrica` | text | Versión de la rúbrica aplicada |
| `registrado_en` | timestamptz | |

> `version_rubrica` permite que una recalibración futura de umbrales no invalide
> la lectura histórica de las puntuaciones ya registradas.

### `citas`

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `lead_id` | uuid FK | |
| `usuario_id` | uuid FK | Responsable |
| `programada_para` | timestamptz | |
| `modalidad` | enum | `PRESENCIAL`, `VIRTUAL`, `TELEFONICA` |
| `estado` | enum | `AGENDADA`, `CUMPLIDA`, `NO_ASISTIO`, `REPROGRAMADA`, `CANCELADA` |
| `notas` | text NULL | |
| `recordatorio_enviado` | boolean | |

### `campanias`

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `cuenta_publicitaria_id` | uuid FK | |
| `id_externo` | text | Identificador en la plataforma de origen |
| `nombre` | text | Nombre reportado por la plataforma |
| `red_social` | enum | |
| `activa` | boolean | |

UNIQUE (`cuenta_publicitaria_id`, `id_externo`)

> **Decisión de diseño confirmada:** una campaña pertenece a **una sola red
> social**, la que la reportó. No se intenta unificar campañas homónimas entre
> redes. El cliente señaló que los nombres se digitan por separado en cada
> plataforma y un error de tipeo produciría fusiones incorrectas. Agrupar por
> nombre es una función de reporte, no de modelo.

### `cuentas_publicitarias`

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `bridge_id` | uuid FK | `onDelete: Cascade` |
| `id_externo` | text | Unidad de suscripción de la plataforma. Para Meta: el ID de la **Página** de Facebook, nunca un Business Manager ni una cuenta publicitaria genérica — el webhook y el Page Access Token son por Página (`m4-bridges-crud-fundacion`, docs/05-bridges.md §3) |
| `nombre` | text | |
| `id_externo_vinculado` | text NULL | Cuenta profesional de Instagram vinculada a esa misma Página. Instagram no tiene suscripción ni token propios — sus leads llegan por el webhook de la Página, así que nunca es una fila aparte. NULL en el resto de las redes (`m4-bridges-crud-fundacion`) |
| `activa` | boolean | |

UNIQUE (`bridge_id`, `id_externo`) — target de upsert determinístico para el futuro adaptador y defensa contra filas de Página duplicadas (`m4-bridges-crud-fundacion`).

### `bridges`

Conexión con una red social.

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `red_social` | enum | `FACEBOOK`, `INSTAGRAM`, `X`, `LINKEDIN`, `GOOGLE_FORMS` |
| `nombre` | text | Etiqueta del administrador |
| `clave_api_hash` | text UNIQUE | Hash sha256hex irreversible de `X-Bridge-Key` (`m4-ingesta-bridges-parcial`). La clave en claro nunca se persiste |
| `estado` | enum | `ACTIVO`, `TOKEN_EXPIRADO`, `ERROR`, `INACTIVO`. Nuevo bridge nace `INACTIVO` |
| `ultimo_lead_en` | timestamptz NULL | Detección de bridges mudos |
| `token_cifrado` | text | AES-256-GCM. **Nunca sale por la API**. Planificado para el adaptador Meta/LinkedIn, aún no implementado |
| `token_expira_en` | timestamptz NULL | Planificado junto con `token_cifrado` |
| `secreto_webhook` | text | Verificación de firma HMAC. Planificado para el adaptador Meta, aún no implementado |

### `bridge_logs`

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `bridge_id` | uuid FK NULL | Nulo cuando la autenticación falla antes de resolver un bridge |
| `nivel` | enum | `INFO`, `ADVERTENCIA`, `ERROR` |
| `mensaje` | text | |
| `payload` | jsonb NULL | |
| `ocurrido_en` | timestamptz | |

Índice `(bridge_id, ocurrido_en DESC)`. Política de retención: 90 días.

Se escribe siempre **fuera** de la transacción de ingesta, para que sobreviva
a un rollback (`m4-ingesta-bridges-parcial`, DD5).

### `leads_recibidos`

Recepción cruda y buzón durable de cada lead entrante, previo a la deduplicación.

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `bridge_id` | uuid FK | |
| `id_externo_lead` | text | Identificador del lead en la plataforma de origen |
| `lead_id` | uuid FK NULL | Nulo hasta que el worker completa el procesamiento |
| `payload` | jsonb | Cuerpo crudo recibido, incluida la atribución de campaña sin resolver (`id_externo_campania`, `nombre_campania`, `id_externo_cuenta`) |
| `datos_incompletos` | boolean | `true` si llegó sin teléfono ni correo |
| `recibido_en` | timestamptz | |
| `entrada_procesamiento` | jsonb | Sobre interno versionado; conserva la entrada y sus timestamps |
| `estado` | enum | `PENDIENTE`, `PROCESANDO`, `REINTENTO`, `PROCESADO`, `FALLA_MANUAL` |
| `intentos` / `disponible_en` | int / timestamptz | Reintentos automáticos acotados: 60 s y 300 s, máximo 3 intentos |
| `lease_owner` / `lease_hasta` | text / timestamptz NULL | Propiedad temporal del claim; permite recuperar workers caídos |
| `ultimo_error` / `procesado_en` | text / timestamptz NULL | Diagnóstico manual y finalización observable |

UNIQUE (`bridge_id`, `id_externo_lead`) — defensa de idempotencia contra
reintentos de webhook, incluida entrega concurrente.
Los índices parciales de disponibilidad y lease vencido sostienen `FOR UPDATE SKIP LOCKED`.

### `notificaciones`

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `usuario_id` | uuid FK | |
| `tipo` | enum | `LEAD_ASIGNADO`, `LEAD_TRASPASADO`, `LEAD_SIN_ATENDER`, `LEAD_SIN_ASIGNAR`, `RECORDATORIO_CITA`, `ERROR_BRIDGE`, `TOKEN_POR_EXPIRAR`, `INTERACCION_REPETIDA` |
| `canal` | enum | Único valor válido en MVP: `IN_APP` |
| `titulo` / `mensaje` | text | |
| `lead_id` | uuid FK NULL | Navegación directa |
| `leida_en` | timestamptz NULL | |
| `creada_en` | timestamptz | |

Índice parcial: `(usuario_id, creada_en DESC) WHERE leida_en IS NULL`.

---

## 3. Notas de implementación

- **Zona horaria:** todo `timestamptz` en UTC. La conversión ocurre en el frontend.
- **Borrado:** no se borra físicamente ningún lead, cliente ni usuario. Baja
  lógica mediante `activo`.
- **JSONB:** `campos_dinamicos` y `respuestas` no llevan índice GIN en el MVP.
  A 500 leads/mes no se justifica; agrégalo solo si aparece una consulta real
  que filtre por su contenido.
- **Migraciones:** una migración Prisma por cambio de esquema, nombrada con el
  cambio SDD que la origina.
