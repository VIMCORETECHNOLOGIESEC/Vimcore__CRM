# 03 — Modelo de datos (AS-IS)

> **Estado:** vigente. Regenerado a partir de `backend/prisma/schema.prisma`.
>
> **Autoridad técnica:** `backend/prisma/schema.prisma` y
> `backend/prisma/migrations/` siguen siendo la fuente de verdad. Este
> documento es una lectura resumida para orientarse sin abrir el schema
> completo; ante cualquier discrepancia, gana el schema.
>
> **Verificado contra:** rama `test/gpt`, commit `2526af7`, 2026-08-26.

PostgreSQL con Prisma (code-first). Bloque B (`docs/blocks/b-tenant-prisma-foundation.md`,
✅ cerrado) agregó `Empresa`/`Membresia` y columnas `empresa_id` en modo
aditivo y en sombra: la autorización activa en producción sigue siendo
`Usuario.rol` sin scoping por tenant (ver `docs/16-hallazgos-y-preguntas.md`
§8 para el diseño multi-tenant TO-BE restante, aún no implementado en los
bloques C-F).

---

## 1. Relaciones principales

```
usuarios ──┬──< leads.asesor_id (SetNull)
           ├──< leads.vendedor_id (SetNull)
           ├──< lead_eventos.usuario_id (SetNull)
           ├──< respuestas_formulario.usuario_id (Restrict)
           ├──< citas.usuario_id (Restrict)
           ├──< notificaciones.usuario_id (Cascade)
           ├──< refresh_tokens.usuario_id (Cascade)
           └──< membresias.usuario_id (Cascade)

empresas ──┬──< membresias.empresa_id (Cascade)
           ├──< bridges.empresa_id (SetNull, nullable)
           └──< leads.empresa_id (SetNull, nullable)

membresias ──< refresh_tokens.membresia_id (SetNull, nullable)

clientes ──┬──< correos_cliente (Cascade)
           ├──< leads (Restrict)
           └──< leads_abiertos_revision_pendiente.cliente_id (Cascade)

bridges ──┬──< cuentas_publicitarias (Cascade)
          ├──< bridge_logs (SetNull)
          └──< leads_recibidos (Restrict)

cuentas_publicitarias ──< campanias (Cascade)

leads ──┬──< lead_eventos (Cascade)
        ├──< respuestas_formulario (Cascade)
        ├──< citas (Cascade)
        ├──< notificaciones (SetNull)
        ├──< leads_recibidos (SetNull)
        └──< leads_abiertos_revision_pendiente.lead_abierto_id (Cascade)
```

`campanias` **sí** tiene relación con `leads` desde Bloque A (WU4,
`docs/blocks/a-hardening-single-company.md`): `Lead.campaniaId` y
`Lead.cuentaPublicitariaId` son FKs nullable resueltas en ingesta por
`atribucion.service.ts` (lookup de dos pasos: cuenta primero, campaña
después), degradando a `null` en silencio si no hay match — nunca fallan la
ingesta. Los escalares crudos (`idExternoCuenta`, `idExternoCampania`,
`nombreCampania`) se siguen persistiendo siempre en `leads`, con o sin match
canónico. Ver columnas en la tabla `leads` abajo.

---

## 2. Entidades

### `usuarios` (`Usuario`)

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `nombre` | text | |
| `correo` | citext UNIQUE | Login |
| `password_hash` | text | |
| `rol` | enum `RolUsuario` | `ADMINISTRADOR`, `SUPERVISOR`, `ASESOR`, `VENDEDOR` |
| `activo` | boolean, default `true` | Baja lógica |
| `ultima_asignacion_en` | timestamptz NULL | Desempate del algoritmo de asignación |
| `creado_en` / `actualizado_en` | timestamptz | |

### `refresh_tokens` (`RefreshToken`)

PK es `jti` (uuid), no un id sustituto — el 100% de los accesos es por `jti`.

| Columna | Tipo | Nota |
|---|---|---|
| `jti` | uuid PK | |
| `usuario_id` | uuid FK → `usuarios`, Cascade | |
| `hash` | text | sha256hex del JWT de refresco completo, nunca el token en claro |
| `expira_en` | timestamptz | |
| `revocado_en` | timestamptz NULL | |
| `creado_en` | timestamptz | |
| `membresia_id` | uuid FK NULL → `membresias`, SetNull | Bloque B (dual-login-routing): nulo para toda sesión emitida antes del cambio o vía `Usuario.correo` (camino holding-wide) |

Índice `(usuario_id, revocado_en)`.

### `empresas` (`Empresa`)

Bloque B (`docs/blocks/b-tenant-prisma-foundation.md`, ✅ cerrado): unidad de
tenant. Nace con una fila bootstrap de id fijo por migración (backfill Fase
1) — ninguna `Empresa` real se crea todavía por código de aplicación.

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `nombre` | text | |
| `creado_en` | timestamptz | |

No tiene `activa` ni `sla_horas` — no se incluyeron en esta implementación.

### `membresias` (`Membresia`)

Bloque B: pertenencia de un `Usuario` a una `Empresa` con un `RolMembresia`
propio. `empresa_id` es **NOT NULL** — el concepto de membresía
holding-wide (`empresa_id = null`) del diseño original TO-BE no se
implementó; el acceso holding-wide sigue siendo puramente `Usuario.rol`.

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `usuario_id` | uuid FK → `usuarios`, Cascade | |
| `empresa_id` | uuid FK → `empresas`, Cascade | NOT NULL |
| `rol` | enum `RolMembresia` | `ADMINISTRADOR`, `SUPERVISOR`, `ASESOR` — distinto de `RolUsuario` (holding-wide, sin cambios) |
| `habilitado_para_venta` | boolean, default `false` | Backfill: `true` solo para `VENDEDOR` legado (mapeado a `ASESOR`) |
| `correo` | citext NULL UNIQUE | Segundo camino de login por empresa; NULL en todo backfill |
| `password_hash` | text NULL | Credencial independiente por empresa; NULL en todo backfill |
| `activa` | boolean, default `true` | Baja lógica — nunca `DELETE` |
| `creado_en` / `actualizado_en` | timestamptz | |

UNIQUE (`usuario_id`, `empresa_id`, `rol`). Índices `(usuario_id, activa)` y
`(empresa_id, rol)`.

> **Estado de autorización:** `Usuario.rol` y `enum RolUsuario` siguen
> siendo la única fuente de autorización activa en producción.
> `Membresia` opera en modo sombra (Fase 2 de Bloque B: compara y loguea
> divergencias contra el autorizador legacy, nunca bloquea) hasta que un
> bloque posterior corte el switch.

### `clientes` (`Cliente`)

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `nombre` | text NULL | Último nombre recibido |
| `telefono_original` | text NULL | Tal como llegó |
| `telefono_normalizado` | text NULL UNIQUE | E.164. Clave de identidad |
| `telefono_valido` | boolean, default `false` | |
| `creado_en` | timestamptz | |

> **Invariante:** `telefono_normalizado` es único. Insertar con `ON CONFLICT`
> y tratar el conflicto como "cliente existente", nunca como error.

### `correos_cliente` (`CorreoCliente`)

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `cliente_id` | uuid FK → `clientes`, Cascade | |
| `correo` | text | Valor original |
| `correo_normalizado` | citext | |
| `es_principal` | boolean, default `false` | |

UNIQUE (`cliente_id`, `correo_normalizado`); índice en `correo_normalizado`.

### `leads` (`Lead`)

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `cliente_id` | uuid FK → `clientes`, Restrict | |
| `origen` | enum `OrigenLead` | `NUEVO`, `REINGRESO` |
| `etapa` | enum `EtapaLead`, default `NUEVO` | `NUEVO`, `CONTACTADO`, `CITA`, `VENTA`, `NO_VENTA` |
| `red_social` | enum `RedSocial` NULL | Nulo en leads previos a la rebanada que la agregó |
| `campos_dinamicos` | jsonb NULL | |
| `payload_original` | jsonb NULL | Cuerpo crudo del webhook |
| `semaforo` | enum `Semaforo` NULL | Nulo = "sin calificar", valor de filtro explícito |
| `puntuacion` | int NULL | 0–100 |
| `asesor_id` | uuid FK NULL → `usuarios`, SetNull | |
| `vendedor_id` | uuid FK NULL → `usuarios`, SetNull | Nulo hasta el traspaso |
| `sla_inicio_en` | timestamptz NULL | Nulo mientras no hay asesor asignado |
| `ingresado_en` | timestamptz | |
| `cerrado_en` | timestamptz NULL | |
| `monto_venta` | numeric(12,2) NULL | |
| `observacion_cierre` | text NULL | |
| `producto_servicio` | text NULL | |
| `forma_pago` | enum `FormaPago` NULL | `CONTADO`, `CREDITO`, `FINANCIAMIENTO` |
| `cuenta_publicitaria_id` | uuid FK NULL → `cuentas_publicitarias` | Bloque A (WU4): resuelto por `atribucion.service.ts`, degrada a `null` sin match |
| `campania_id` | uuid FK NULL → `campanias` | Bloque A (WU4): idem, lookup posterior a cuenta |
| `id_externo_cuenta` / `id_externo_campania` / `nombre_campania` | text NULL | Escalares crudos, persistidos siempre, con o sin match canónico |
| `empresa_id` | uuid FK NULL → `empresas`, SetNull | Bloque B (Fase 3, sombra): derivado de `Bridge.empresaId` en ingesta, nullable passthrough — no reemplaza `asesor_id`/`vendedor_id` |

Índices: `(cliente_id, etapa)`, `(cliente_id, cerrado_en DESC)`,
`(asesor_id, etapa)`, `(vendedor_id, etapa)`, `(etapa, ingresado_en DESC)`,
`(red_social)`, `(empresa_id)`, más un índice parcial agregado a mano en la
migración — `idx_leads_sla` `(sla_inicio_en) WHERE cerrado_en IS NULL` — no
expresable en el DSL de Prisma.

No hay unique compuesto de "lead abierto" por cliente+empresa: la
comparación (cliente, empresa) es puramente en sombra vía la tabla nueva
`leads_abiertos_revision_pendiente` (ver abajo).

### `lead_eventos` (`LeadEvento`)

Bitácora de auditoría, escrita siempre en la misma transacción que el cambio
que la origina.

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `lead_id` | uuid FK → `leads`, Cascade | |
| `usuario_id` | uuid FK NULL → `usuarios`, SetNull | Nulo si lo originó el sistema |
| `tipo` | enum `TipoEventoLead` | ver abajo |
| `etapa_anterior` / `etapa_nueva` | enum NULL | |
| `semaforo_anterior` / `semaforo_nuevo` | enum NULL | |
| `detalle` | jsonb NULL | |
| `ocurrido_en` | timestamptz | |

`TipoEventoLead`: `INGRESO`, `ASIGNACION`, `REASIGNACION`, `TRASPASO`,
`CAMBIO_ETAPA`, `CAMBIO_SEMAFORO`, `INTERACCION_REPETIDA`, `CITA_AGENDADA`,
`CITA_REPROGRAMADA`, `SLA_INCUMPLIDO`, `CIERRE`, `SIN_ASIGNAR` (sin
candidatos elegibles), `ASIGNACION_FALLIDA` (fallo de infraestructura tras 3
reintentos — distinto de `SIN_ASIGNAR`).

Índices `(lead_id, ocurrido_en)` y `(tipo, ocurrido_en)`.

### `respuestas_formulario` (`RespuestaFormulario`)

Una fila por cada envío de formulario, nunca se sobrescribe.

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `lead_id` | uuid FK → `leads`, Cascade | |
| `usuario_id` | uuid FK → `usuarios`, Restrict | |
| `etapa` | enum `EtapaLead` | |
| `respuestas` | jsonb | |
| `puntuacion` | int | |
| `semaforo` | enum `Semaforo` | |
| `version_rubrica` | text | Congela la versión vigente al momento del cálculo |
| `registrado_en` | timestamptz | |

Índice `(lead_id, registrado_en)`.

### `citas` (`Cita`)

Registro asociado al lead; no reemplaza el flujo de etapa/formulario.

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `lead_id` | uuid FK → `leads`, Cascade | |
| `usuario_id` | uuid FK → `usuarios`, Restrict | Responsable |
| `programada_para` | timestamptz | |
| `modalidad` | enum `ModalidadCita` | `PRESENCIAL`, `VIRTUAL`, `TELEFONICA` |
| `estado` | enum `EstadoCita`, default `AGENDADA` | `AGENDADA`, `CUMPLIDA`, `NO_ASISTIO`, `REPROGRAMADA` (declarado, ningún código actual lo persiste — reprogramar deja el estado en `AGENDADA`), `CANCELADA` |
| `notas` | text NULL | |
| `recordatorio_enviado` | boolean, default `false` | |
| `creado_en` | timestamptz | |

Índices `(lead_id)`, `(estado, programada_para)`.

### `notificaciones` (`Notificacion`)

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `usuario_id` | uuid FK → `usuarios`, Cascade | |
| `tipo` | enum `TipoNotificacion` | `LEAD_ASIGNADO`, `LEAD_TRASPASADO`, `LEAD_SIN_ATENDER`, `LEAD_SIN_ASIGNAR`, `RECORDATORIO_CITA`, `ERROR_BRIDGE`, `TOKEN_POR_EXPIRAR`, `INTERACCION_REPETIDA` |
| `canal` | enum `CanalNotificacion`, default `IN_APP` | Único valor válido en MVP |
| `titulo` / `mensaje` | text | |
| `lead_id` | uuid FK NULL → `leads`, SetNull | |
| `leida_en` | timestamptz NULL | |
| `creada_en` | timestamptz | |

Índice parcial `(usuario_id, creada_en DESC) WHERE leida_en IS NULL`; índice
en `lead_id`.

### `bridges` (`Bridge`)

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `red_social` | enum `RedSocial` | `FACEBOOK`, `INSTAGRAM`, `X`, `LINKEDIN`, `GOOGLE_FORMS` |
| `nombre` | text | |
| `clave_api_hash` | text UNIQUE | Hash sha256hex de `X-Bridge-Key`; la clave en claro nunca se persiste |
| `estado` | enum `EstadoBridge`, default `INACTIVO` | `ACTIVO`, `TOKEN_EXPIRADO`, `ERROR`, `INACTIVO` |
| `ultimo_lead_en` | timestamptz NULL | |
| `advertencia_muda_enviada` | boolean, default `false` | Anti-spam del job "bridge sin actividad 72h" |
| `empresa_id` | uuid FK NULL → `empresas`, SetNull | Bloque B (Fase 3): resuelto por `atribucion.service.ts::resolverEmpresaIdDesdeBridge`; nullable — un bridge sin empresa nunca falla la ingesta |

### `cuentas_publicitarias` (`CuentaPublicitaria`)

Unidad de suscripción de la plataforma. Para Meta, `id_externo` es el ID de
la **Página** de Facebook (webhook y token son por Página, nunca por Business
Manager ni cuenta publicitaria genérica).

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `bridge_id` | uuid FK → `bridges`, Cascade | |
| `id_externo` | text | |
| `nombre` | text | |
| `id_externo_vinculado` | text NULL | Cuenta de Instagram vinculada a la misma Página; NULL en el resto de redes |
| `activa` | boolean, default `true` | |
| `estado_token` | enum `EstadoTokenCuenta`, default `VALIDO` | `VALIDO`, `TOKEN_EXPIRADO`, `ERROR` — granularidad por Página, no en `bridges.estado` |
| `token_cifrado` | text NULL | AES-256-GCM, nunca sale por la API |
| `token_expira_en` | timestamptz NULL | |
| `secreto_webhook` | text NULL | |

UNIQUE (`bridge_id`, `id_externo`).

### `campanias` (`Campania`)

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `cuenta_publicitaria_id` | uuid FK → `cuentas_publicitarias`, Cascade | |
| `id_externo` | text | |
| `nombre` | text | |
| `red_social` | enum `RedSocial` | Denormalizada a propósito |
| `activa` | boolean, default `true` | |

UNIQUE (`cuenta_publicitaria_id`, `id_externo`). Una campaña pertenece a una
sola red social; no se fusionan nombres homónimos entre plataformas.

### `bridge_logs` (`BridgeLog`)

Se escribe siempre fuera de la transacción de ingesta, para sobrevivir a un
rollback.

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `bridge_id` | uuid FK NULL → `bridges`, SetNull | Nulo si falla la autenticación antes de resolver un bridge |
| `nivel` | enum `NivelBridgeLog` | `INFO`, `ADVERTENCIA`, `ERROR` |
| `mensaje` | text | |
| `payload` | jsonb NULL | |
| `ocurrido_en` | timestamptz | |

Índice `(bridge_id, ocurrido_en DESC)`.

### `leads_recibidos` (`LeadRecibido`)

Recepción cruda y buzón durable de cada lead entrante, previo a la
deduplicación. `lead_id` es nulo hasta que la transacción de ingesta lo
resuelve.

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `bridge_id` | uuid FK → `bridges`, Restrict | |
| `id_externo_lead` | text | |
| `lead_id` | uuid FK NULL → `leads`, SetNull | |
| `payload` | jsonb | Incluye atribución de campaña sin resolver |
| `datos_incompletos` | boolean, default `false` | |
| `recibido_en` | timestamptz | |
| `entrada_procesamiento` | jsonb | Sobre interno versionado |
| `estado` | enum `EstadoRecepcion`, default `PENDIENTE` | `PENDIENTE`, `PROCESANDO`, `REINTENTO`, `PROCESADO`, `FALLA_MANUAL` |
| `intentos` | int, default `0` | Máximo 3 reintentos automáticos (60s, 300s) |
| `disponible_en` | timestamptz | |
| `lease_owner` / `lease_hasta` | text / timestamptz NULL | Recuperación de workers caídos |
| `ultimo_error` / `procesado_en` | text / timestamptz NULL | |

UNIQUE (`bridge_id`, `id_externo_lead`) — idempotencia de webhook. Índice
`(estado, disponible_en)` para el claim `FOR UPDATE SKIP LOCKED`.

### `leads_abiertos_revision_pendiente` (`LeadAbiertoRevisionPendiente`)

Bloque B (Fase 3, dedup en sombra): cola de revisión no invasiva. Registra
una colisión detectada cuando el comparador en sombra encuentra un lead
abierto para el mismo cliente en una empresa distinta a la de ingesta —
nunca bloquea ni modifica el lead existente. Vacía en producción hasta que
el comparador detecte la primera colisión cross-empresa.

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `cliente_id` | uuid FK → `clientes`, Cascade | |
| `lead_abierto_id` | uuid FK → `leads`, Cascade | |
| `empresa_lead_id` | uuid | Empresa del lead abierto existente |
| `empresa_ingesta_id` | uuid | Empresa del bridge que ingirió el nuevo lead |
| `detectado_en` | timestamptz | |
| `resuelto` | boolean, default `false` | |
| `resuelto_en` | timestamptz NULL | |

UNIQUE (`cliente_id`, `lead_abierto_id`, `empresa_ingesta_id`). Índice
`(resuelto)`.

---

## 3. Notas de implementación

- **Zona horaria:** todo `timestamptz` en UTC; la conversión ocurre en el frontend.
- **Borrado:** no se borra físicamente ningún lead, cliente ni usuario. Baja
  lógica mediante `activo`.
- **JSONB:** `campos_dinamicos` y `respuestas` no llevan índice GIN en el MVP.
- **Migraciones:** una migración Prisma por cambio de esquema, nombrada con el
  cambio SDD que la origina.
