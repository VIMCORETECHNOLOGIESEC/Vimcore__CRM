# Handoff negociación (Bloque D) — estado actual

> **Material de coordinación:** explica dónde quedó el módulo `negociacion`
> (split Lead/Oportunidad, Bloque D) y qué falta. No reemplaza a
> `docs/00-estado-documentacion.md`, `docs/blocks/d-routing-oportunidad.md`,
> Prisma, migraciones ni tests.

## Decisión de testing (explícita, no un olvido)

El módulo se entrega **sin tests automatizados propios** (unitarios/integración
de Vitest) por decisión del usuario: la lógica de negocio (pool D3/D4,
autoridad de cierre D7, excepción D9, dedup D14) se verifica con **pruebas de
integración manuales contra el backend ya desplegado**, no en esta sesión de
desarrollo. La suite completa de Vitest (1024/1024) pasa porque nada de lo
existente se rompió — **no** porque la lógica nueva esté probada. Ver
"Plan de pruebas de integración" más abajo para el checklist a correr una vez
desplegado.

## Qué ya está hecho

Schema Prisma: `Producto`, `Oportunidad`, `OportunidadEvento` +
`TipoEventoOportunidad` (incluye `SIN_ASIGNAR`, agregado después de discutir
el caso de una `Oportunidad` sin candidatos en el pool). Migración
`add_negociacion_oportunidad_producto` aplicada, suite completa verde.

**100% aditivo** — verificado con `git diff --stat`: `Lead` no perdió ninguna
columna, y `services/asignacion.service.ts`, `services/leads.access.ts`,
`repositories/usuario.repository.ts`, `repositories/lead.repository.ts`
tienen cero cambios. El "corte" (retirarle esas columnas a `Lead` y reescribir
esos archivos) es una fase **posterior y separada**, no arrancada todavía.

### Reglas de negocio implementadas (cerradas con el usuario en esta sesión)

- **D3/D4 — pool por empresa vía `Membresia`**: candidatos = `Usuario`s con
  `Membresia` activa, `rol: ASESOR`, en la empresa de la `Oportunidad`.
  Algoritmo: menor carga activa + desempate FIFO por `Usuario.ultimaAsignacionEn`
  (mismo criterio que el pool viejo de `Lead`).
- **D7 — autoridad de cierre estricta**: solo el `asesorId` actual de la
  `Oportunidad`, con `Membresia.habilitadoParaVenta: true`, puede cerrarla
  (VENTA/NO_VENTA). A diferencia del `Lead` viejo, **ningún** ADMINISTRADOR/
  SUPERVISOR tiene bypass de cierre por defecto — gana esa autoridad solo si
  pasó antes por la excepción D9.
- **D9 — excepción administrativa con creación lazy de `Membresia`**: un
  ADMINISTRADOR/SUPERVISOR puede tomar una `Oportunidad` fuera del pool
  (`POST /oportunidades/:id/reasignar`). Si no tiene ya una `Membresia(rol:
  ASESOR)` activa en esa empresa, se le crea al vuelo (nunca se
  pre-provisiona para todos los administradores "por si acaso"). Genera
  `OportunidadEvento` tipo `ASIGNADA_EXCEPCION_ADMINISTRATIVA` — la única
  forma en que Bloque E podrá segmentar estos casos del rendimiento regular
  de asesores. Un administrador polifuncional que ya tiene su `Membresia`
  permanente y recibe una `Oportunidad` por el pool normal genera
  `ASIGNADA_POOL` como cualquier asesor — nunca se segmenta.
- **D14 — dedup sin ventana de reingreso**: rechaza crear una `Oportunidad`
  nueva para `(leadId, productoId)` si ya existe una ABIERTA (etapa fuera de
  VENTA/NO_VENTA) para esa combinación. A diferencia del reingreso de
  Cliente/Lead (90 días), acá no hay espera — cerrada la anterior, se puede
  abrir una nueva de inmediato.
- **`SIN_ASIGNAR`**: sin candidatos en el pool al crear, la `Oportunidad`
  queda con `asesorId: null` (nunca falla la creación) y genera este evento
  — mismo criterio que `TipoEventoLead.SIN_ASIGNAR`. La salida es la
  excepción D9, no un reintento automático.

### Riesgo conocido, aceptado a propósito (no es un bug)

`Usuario.ultimaAsignacionEn` es la misma columna que usa el pool viejo de
`Lead` para su desempate FIFO — el pool nuevo de `Oportunidad` la reusa tal
cual (documentado en `repositories/negociacion/membresia-pool.repository.ts`).
Efecto: una asignación de `Lead` puede afectar el desempate de `Oportunidad`
y viceversa mientras los dos sistemas coexistan. Nunca causa datos
incorrectos ni doble asignación — solo una rotación un poco menos precisa.
Se resuelve cuando el corte le dé a `Oportunidad` su propia columna de
rotación.

## Endpoints (todos bajo `/api/v1`, `Authorization: Bearer <accessToken>`)

```
POST   /productos                       (ADMINISTRADOR)
GET    /productos                       (cualquier autenticado)
POST   /oportunidades
GET    /oportunidades
GET    /oportunidades/:id
PATCH  /oportunidades/:id/etapa
POST   /oportunidades/:id/cerrar
POST   /oportunidades/:id/reasignar     (ADMINISTRADOR, SUPERVISOR — excepción D9)
```

## Plan de pruebas de integración (correr contra el backend desplegado)

1. **Pool normal (D3/D4)**: crear una `Oportunidad` con al menos un asesor
   con `Membresia(rol: ASESOR, activa: true)` en la empresa → debe asignarse
   automático, `OportunidadEvento` tipo `ASIGNADA_POOL`.
2. **Sin candidatos (`SIN_ASIGNAR`)**: crear una `Oportunidad` en una empresa
   sin ningún asesor activo → debe crearse igual con `asesorId: null`, sin
   fallar, con `OportunidadEvento` tipo `SIN_ASIGNAR`.
3. **Cierre autorizado (D7)**: el asesor asignado, con `habilitadoParaVenta:
   true`, cierra VENTA/NO_VENTA → 200, `OportunidadEvento` tipo `CERRADA`.
4. **Cierre rechazado**: un ADMINISTRADOR sin `Membresia` de asesor intenta
   cerrar directo, sin pasar por D9 → debe rechazar (403).
5. **Excepción D9, primera vez**: un ADMINISTRADOR sin `Membresia` previa en
   esa empresa usa `POST .../reasignar` → debe crearle la `Membresia(ASESOR)`
   al vuelo, reasignar, y generar `ASIGNADA_EXCEPCION_ADMINISTRATIVA` (nunca
   `ASIGNADA_POOL`).
6. **Excepción D9, administrador polifuncional**: un ADMINISTRADOR que YA
   tiene `Membresia(ASESOR)` permanente recibe una `Oportunidad` por el pool
   normal (no por `/reasignar`) → debe generar `ASIGNADA_POOL`, no
   segmentarse como excepción.
7. **Dedup D14**: crear dos `Oportunidad` para el mismo `(leadId,
   productoId)` sin cerrar la primera → la segunda debe rechazar (409). Cerrar
   la primera y reintentar → debe permitir la segunda sin esperar ningún
   plazo.
8. **Transiciones de etapa**: `PATCH .../etapa` con una transición inválida
   (ej. saltar de NUEVO a VENTA sin pasar por CONTACTADO/CITA) → debe
   rechazar (409); con una válida → 200 y `OportunidadEvento` tipo
   `ETAPA_CAMBIADA`.
9. **Producto de otra empresa**: crear una `Oportunidad` con un `productoId`
   que pertenece a otra empresa → debe rechazar (409).
10. **No-regresión de `Lead`**: confirmar que crear/asignar/cerrar un `Lead`
    normal sigue funcionando exactamente igual que antes de este módulo —
    nada de `negociacion` debería tocar ese flujo.

## Siguiente fase (no arrancada, requiere confirmación aparte)

El "corte": retirarle a `Lead` sus columnas de negociación
(`etapa`/`semaforo`/`asesorId`/`vendedorId`/`montoVenta`/`observacionCierre`/
`formaPago`/`cerradoEn`/`slaInicioEn`), reescribir `leads.access.ts` y
`asignacion.service.ts` para operar sobre `Oportunidad`, y migrar
`usuario.repository.ts::findActivosPorRol`/`lead.repository.ts::
countCargaActivaPorResponsable`. Bloque E (dashboards) depende de que este
corte cierre primero.
