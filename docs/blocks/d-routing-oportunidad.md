# Bloque D — Routing, handoff y Oportunidad

> **Diferido a después del despliegue (2026-08-28).** Prioridad del cliente:
> completar primero lo mínimo visualizable del multi-tenant sin tocar
> archivos de alto riesgo compartidos con trabajo paralelo sobre el
> single-company actual (ver `docs/06-modulos-backend.md`
> §"Archivos de alto riesgo"). El slice previo que sí se ejecuta antes del
> despliegue es `docs/blocks/d0-visualizacion-multitenant.md`. Todo el
> contenido de este documento sigue vigente como el plan real de Bloque D —
> solo se pospone su ejecución, no se descarta. Su ciclo SDD completo
> (proposal/spec/design/tasks) ya corrió y quedó persistido en Engram
> (`sdd/bloque-d-routing-oportunidad/{proposal,spec,design,tasks}`,
> observations #83-#86) — al retomarlo, leer esos artefactos antes de
> replanificar desde cero. Antes de `apply` se actualizarán únicamente el
> calendario, las dependencias y cualquier supuesto que haya cambiado; los
> artefactos no se rehacen.

> Fase 5 de `docs/16-hallazgos-y-preguntas.md` §7 ("Routing y handoff").
> Cubre Fase 5 de `docs/14-evolucion-multitenant.md` §13 ("Routing y
> handoff").

## Alcance

Después del despliegue, activar el pool de asignación scopeado por empresa,
la matriz esencial de competencia asesor/venta y separar `Lead` (contacto)
de `Oportunidad` (negociación) para permitir varias negociaciones paralelas
del mismo cliente en la misma empresa. El canal manual y las excepciones D9
permanecen como entregables diferidos independientes.

### Esencial vs. diferido

Para llegar al multi-tenant esencial no hace falta todo lo de arriba de una
sola vez:

- **Esencial** (cierra este bloque): modelos `Oportunidad`/`Producto`, pool
  de asignación scopeado por empresa (D3/D4), autoridad de cierre (D7),
  split `Lead`/`Oportunidad` (D13), y la decisión registrada del riesgo de
  invariante `asesorId` (abajo).
- **Diferido** (no bloquea el cierre esencial): el canal de ingreso manual
  (`CanalManual`) y las excepciones auditadas de Administrador/Supervisor
  (D9). Sus contratos mock pueden prepararse de forma independiente, pero su
  integración real tendrá criterios de cierre propios; no se presume incluida
  en el cierre esencial de D.

## Requiere cerrado

- **Bloque C** — el pool de asignación y la autoridad de cierre deben operar
  sobre un aislamiento ya verificado entre empresas.

## Decisiones que implementa (ver rationale completo en `docs/16` §8 — no se repite acá)

- **D3 — Cardinalidad de routing**: pool por empresa (candidatos = asesores
  activos con membresía en la empresa dueña del bridge de origen); se
  conserva el algoritmo vigente de menor carga + desempate FIFO.
- **D4 — Granularidad de elegibilidad**: por membresía de empresa completa,
  sin sub-filtro por red social dentro de la misma empresa; sin herencia
  automática entre empresas del holding.
- **D7 — Competencia sobre cierre**: solo el asesor habilitado para venta y
  actualmente responsable puede marcar `VENTA`/`NO_VENTA`.
- **D8 — Modalidad del handoff**: asignación automática inmediata al pool de
  habilitados para venta, sin aceptación manual.
- **D9 — Política de excepciones** *(diferido, ver "Esencial vs. diferido" arriba)*:
  Administrador y Supervisor conservan reasignación manual auditada, sobre
  el flujo automático de D8, no como reemplazo.
- **D13 — Límite Lead→Oportunidad**: un mismo cliente puede tener varias
  negociaciones paralelas en la misma empresa; `Lead` (contacto) y
  `Oportunidad` (negociación) dejan de ser la misma fila.
- **D14 — Efecto cascada de D13 sobre D2/D3/D7/D8/D9**: catálogo `Producto`
  por empresa, reglas de dedup/pool/SLA de Oportunidad.

## Decisión de invariante `asesorId` (artefactos Engram #83-#86)

Quien ocupe `Lead.asesorId`, `Oportunidad.asesorId` o
`Oportunidad.vendedorId` debe tener una `Membresia` real con rol `ASESOR` en
la empresa del lead. No se agrega un marcador `gestionadoPorAdmin`: una
persona con excepción D9 deberá tener también la membresía ASESOR
correspondiente. La validación específica del camino D9 y el join de
`metricas.repository.ts::getPorAsesorConSla` se implementan cuando aterrice
D9; no bloquean el núcleo esencial.

## Esquema Prisma — Oportunidad y Producto (movido desde `docs/16` §8, D13/D14)

```prisma
model Oportunidad {
  id                String     @id @default(uuid()) @db.Uuid
  leadId            String     @map("lead_id") @db.Uuid
  empresaId         String     @map("empresa_id") @db.Uuid
  productoId        String?    @map("producto_id") @db.Uuid
  version           Int        @default(0)
  etapa             EtapaLead  @default(NUEVO)
  semaforo          Semaforo?
  puntuacion        Int?
  asesorId          String?    @map("asesor_id") @db.Uuid
  vendedorId        String?    @map("vendedor_id") @db.Uuid
  montoVenta        Decimal?   @map("monto_venta") @db.Decimal(12, 2)
  observacionCierre String?    @map("observacion_cierre") @db.Text
  formaPago         FormaPago? @map("forma_pago")
  slaInicioEn       DateTime?  @map("sla_inicio_en") @db.Timestamptz(6)
  cerradaEn         DateTime?  @map("cerrada_en") @db.Timestamptz(6)
  creadaEn          DateTime   @default(now()) @map("creada_en") @db.Timestamptz(6)

  lead     Lead     @relation(fields: [leadId], references: [id], onDelete: Cascade)
  empresa  Empresa  @relation(fields: [empresaId], references: [id], onDelete: Cascade)
  producto Producto? @relation(fields: [productoId], references: [id])
  asesor   Usuario? @relation("OportunidadAsesor", fields: [asesorId], references: [id], onDelete: SetNull)
  vendedor Usuario? @relation("OportunidadVendedor", fields: [vendedorId], references: [id], onDelete: SetNull)

  @@index([empresaId])
  @@map("oportunidades")
}

model Producto {
  id        String   @id @default(uuid()) @db.Uuid
  empresaId String   @map("empresa_id") @db.Uuid
  nombre    String   @db.Text
  activo    Boolean  @default(true)
  creadoEn  DateTime @default(now()) @map("creado_en") @db.Timestamptz(6)

  empresa       Empresa       @relation(fields: [empresaId], references: [id], onDelete: Cascade)
  oportunidades Oportunidad[]

  @@unique([empresaId, nombre])
  @@map("productos")
}
```

`Lead` cede a `Oportunidad` los campos de negociación (`etapa`, `semaforo`,
`puntuacion`, `asesorId`/`vendedorId` como responsables de venta,
`montoVenta`, `observacionCierre`, `formaPago`, `cerradoEn`). `Lead` queda
como el contacto: `clienteId`, `empresaId`, `origen`,
`redSocial`/`canalManualId`, `campaniaId`, `ingresadoEn`, y el asesor del
primer contacto — no necesariamente el mismo de cada `Oportunidad` derivada.
`Producto.nombre` reemplaza el campo de texto libre inicial de D13: un
selector de catálogo evita normalizar strings para reporting.

Reglas clave de D14: se bloquea crear una Oportunidad nueva solo si ya existe
una **abierta** (etapa fuera de VENTA/NO_VENTA) para el mismo
`(leadId, productoId)` — sin ventana de espera al reabrir tras un cierre,
a diferencia del reingreso de Cliente/Lead (90 días). Si el asesor que abre
la Oportunidad ya está habilitado para venta, se autoasigna al instante
(bypass del pool); si no, entra al pool de D3. El SLA de Oportunidad reusa
`calculateEstadoSla` ya existente para `Lead`
(`backend/src/services/sla.calculator.ts`), con `Empresa.slaOportunidadHoras`
como configuración por empresa. D7 no cambia: la autoridad de cierre está
anclada al responsable vigente, sin importar cómo llegó a serlo.

### Momento de apertura de la Oportunidad (reformulado — `etapa` ya no vive en `Lead`)

`docs/16` §8 (D14) describe el momento de apertura como "en cualquier etapa
del Lead". Con el esquema de arriba, `etapa` deja de existir en `Lead` (pasa
a `Oportunidad` desde su creación), así que esa frase ya no puede leerse
literal. Reformulación compatible con D13/D14: la apertura de una Oportunidad
ocurre desde el contacto/detalle del Lead **en cualquier momento** de su
gestión — no depende de un campo `etapa` del Lead, porque ese campo ya no
existe ahí. `Oportunidad.etapa` arranca en `NUEVO` al crearse,
independientemente de cuánto avanzó la gestión del Lead que la originó.

> **Precondición de diseño pendiente (no resuelta acá):** una vez que `etapa`
> vive solo en `Oportunidad`, falta definir cómo preservar o representar el
> estado de gestión previo del Lead mientras **todavía no existe ninguna
> Oportunidad** para él (por ejemplo, un Lead contactado pero sin negociación
> abierta todavía). Este documento no inventa un campo o mecanismo nuevo para
> cubrir ese hueco — queda señalado como diseño abierto a resolver antes de
> implementar el split `Lead`/`Oportunidad`, no como parte del cierre esencial
> ya descrito arriba.

## Canal de ingreso manual y catálogo dinámico (movido desde `docs/16` §8.4)

> **Diferido** — no bloquea el cierre esencial de este bloque; se construye
> como módulo de catálogo con mock (ver "Contratos mock para módulos
> dependientes" más abajo) contra el shape de abajo y se integra cuando se
> agregue el endpoint real.

```prisma
model CanalManual {
  id        String   @id @default(uuid()) @db.Uuid
  empresaId String   @map("empresa_id") @db.Uuid
  nombre    String   @db.Text
  activo    Boolean  @default(true)
  creadoEn  DateTime @default(now()) @map("creado_en") @db.Timestamptz(6)

  empresa Empresa @relation(fields: [empresaId], references: [id], onDelete: Cascade)
  leads   Lead[]

  @@unique([empresaId, nombre])
  @@map("canales_manuales")
}
```

- Nuevo endpoint de creación manual, sin pasar por `LeadRecibido` ni Bridge
  — mismo patrón sin-bridge que la recomendación cruzada (D2).
- `OrigenLead` gana `MANUAL` (y `RECOMENDACION`), queda
  `NUEVO | REINGRESO | RECOMENDACION | MANUAL`.
- Administrador, Supervisor y Asesor pueden cargar un lead manual —
  requiere `Membresia` activa en la empresa destino.
- `Lead.canalManualId` se usa únicamente cuando `origen = MANUAL`, mutuamente
  excluyente con `redSocial`.
- Gestión del catálogo (`CanalManual`) en manos de Administrador; Supervisor
  y Asesor solo eligen de la lista.
- Reutiliza sin cambios la dedup de D2 y el auto-assignment de D3.
- **Selector de Bridges vs. canal manual — dos fuentes distintas:** el
  selector de Bridges se restringe por una allowlist de aplicación
  (`FACEBOOK, INSTAGRAM, GOOGLE_FORMS` — los 3 realmente desarrollados); `X`
  y `LINKEDIN` quedan comentados en el código del selector, no eliminados,
  para reactivarlos sin reconstruir la opción. El `enum RedSocial` no
  cambia. `CanalManual` es la vía para canales sin bridge (referido,
  llamada, feria) y es dinámico por empresa.

## Contratos mock para módulos dependientes (frontend)

Módulos de frontend que dependen de este bloque pero no necesitan esperar a
que esté cerrado para construirse, si fijan su contrato contra el shape ya
especificado acá y lo enchufan al backend real después.

### Autoridad de cierre de negociación

Los campos de cierre (`montoVenta`, `observacionCierre`, `formaPago`,
`cerradaEn`) migran de `Lead` a `Oportunidad` (ver esquema arriba). El
contrato de cierre en frontend se tipa contra el modelo `Oportunidad` ya
documentado en este bloque, con fixture local (`msw` o similar) en vez de
pegarle al endpoint actual de `Lead` — hacerlo directo sobre `Lead` hoy es
retrabajo garantizado.

- **Front:** `frontend/src/funcionalidades/leads/detalle/CierreVentaForm.tsx`,
  `cierre.schemas.ts`.
- **Back:** ninguno todavía — el mock se reemplaza por el endpoint real
  cuando el split `Lead`/`Oportunidad` (D13) y la autoridad de cierre (D7)
  esenciales de este bloque queden cerrados.

### Guard de edición y sesión en detalle de lead

Depende de `backend/src/services/leads.access.ts` (`canEdit`/`canTransfer`),
reescrito tanto por Bloque C como por este bloque. Mock a construir ahora:
interfaz `AutorizacionEdicion { puedeEditar, puedeTransferir, motivo }`
consumida vía un hook (`useAutorizacionLead`) que hoy pega contra el
endpoint actual — cuando el endpoint real esté disponible, solo cambia la
fuente de datos del hook, no el contrato que ya consume la UI.

- **Front:** `LeadTimeline.tsx`, `FormularioEtapaLead.tsx`,
  `LeadDetallePage.tsx` (guard de edición + redirección ante 403).
- **Back:** ninguno nuevo por ahora.

### Canal de ingreso manual (UI)

Mientras el endpoint real de `CanalManual` (arriba) no existe: UI de "Cargar
lead manual" + administración del catálogo de canales, contra el shape ya
especificado (`nombre`, `activo`, `empresaId`) con datos fixture; wiring
real cuando se agregue el endpoint.

## Migración (de `docs/14` §13, Fase 5)

- Activar elegibilidad por membresía de empresa completa (D4), sin sub-filtro
  por red social.
- Migrar `ultimaAsignacionEn` al scope de membresía/pool empresarial.
- Implementar precedencia de routing y fallback.
- Persistir primer contacto y estado de handoff.
- Aplicar la matriz asesor-vendedor acordada y el límite Lead→Oportunidad
  (D13).

## Criterios de salida

### Cierre esencial de Bloque D

- El pool de asignación opera scopeado por empresa, verificado con datos de
  al menos dos empresas del mismo tenant holding.
- La autoridad de cierre usa `Membresia` y `habilitadoParaVenta` según D7;
  no depende de `Usuario.rol` para esa decisión.
- `Oportunidad`/`Producto` existen en el esquema y Bloque E puede consumirlos.
- El split Lead→Oportunidad, el handoff D8 y las reglas D13/D14 esenciales
  tienen pruebas observables.
- El riesgo de invariante de `asesorId` tiene decisión registrada, no solo
  señalada.
- La precondición de diseño pendiente sobre el estado previo del Lead sin
  Oportunidad (ver "Momento de apertura de la Oportunidad" arriba) tiene
  decisión registrada antes de implementar el split `Lead`/`Oportunidad`.

### Criterios diferidos, no bloqueantes

- `CanalManual` y los orígenes manual/recomendación tienen implementación y
  pruebas cuando se active ese módulo.
- Las excepciones auditadas de Administrador/Supervisor (D9) se implementan
  con motivo, auditoría y el guard de membresía acordado.

La ausencia de estos dos entregables diferidos no impide cerrar el núcleo
post-despliegue de D ni habilitar la dependencia técnica de Bloque E.

## Enfoque de implementación — capas existentes, sin reestructuración

Directiva vigente (2026-08-28): implementar como edición de lógica dentro de
la estructura de capas ya usada por Bloques A/B/C, nunca moviendo/renombrando
carpetas ni introduciendo un patrón nuevo. Otros developers (`dev-back`,
`dev-front`) siguen trabajando sobre el layout físico actual perfeccionando
el single-company — reestructurar rompería sus imports; editar contenido de
archivos ya existentes es un costo de coordinación aceptado.

**Archivos existentes que se editan (inevitable, no se puede evitar tocarlos
para D3/D7/D13):**

- `backend/src/services/leads.access.ts` — cutover esencial de `canClose`/
  `canReassign`/`canTransfer` de `Usuario.rol` a
  `Membresia.rol`/`habilitadoParaVenta`; `canRead`/`canEdit` quedan fuera de
  los artefactos #83-#86 y deberán resolverse antes de F. Ya señalado en
  `docs/06-modulos-backend.md` como archivo de alto
  riesgo "reescrito tanto por Bloque C como por Bloque D" — bajo esta
  directiva pasa de "evitar" a "coordinar antes de editar": avisar al equipo
  antes del PR, no diferirlo a un archivo nuevo paralelo (dividiría la
  autoridad de cierre en dos fuentes de verdad).
- `backend/src/services/asignacion.service.ts` — pool D3 scopeado por
  empresa; reescribe `selectResponsable`/`applyAsignacion` para operar sobre
  `Oportunidad` en vez de `Lead`. Mismo criterio: coordinar, no evitar.
- `backend/src/repositories/usuario.repository.ts` (`findActivosPorRol`) y
  `backend/src/repositories/lead.repository.ts`
  (`countCargaActivaPorResponsable`) — filtro de candidatos y cálculo de
  carga migran a `Membresia`/`Oportunidad`.
- `backend/prisma/schema.prisma` — agrega `Oportunidad`/`Producto` (y
  `CanalManual` si se activa el diferido). Es el mismo archivo único que
  Bloques A/B/C ya extendieron así; no es infraestructura nueva, es la
  convención ya establecida del repo. Conflicto de merge es de contenido
  (resoluble), no de estructura.

**Archivos nuevos — todos dentro de carpetas ya existentes, ningún directorio
de primer nivel nuevo:**

- `backend/src/services/oportunidad.service.ts`,
  `backend/src/repositories/oportunidad.repository.ts`,
  `backend/src/repositories/producto.repository.ts`,
  `backend/src/controllers/oportunidad.controller.ts`,
  `backend/src/routes/oportunidad.routes.ts`,
  `backend/src/schemas/oportunidad.schema.ts` — siguen exactamente el mismo
  patrón `routes/ → controllers/ → services/ → repositories/` que ya usan
  `leads.*`/`bridges.*`.
- Frontend: nuevo módulo `frontend/src/funcionalidades/oportunidades/` (al
  mismo nivel que `leads/`, `dashboard/`, `usuarios/` ya existentes) con
  `oportunidad.api.ts`, `useOportunidades.ts`, componentes `.tsx` — mismo
  patrón flat que ya usa `frontend/src/funcionalidades/leads/`. No es una
  carpeta de arquitectura nueva, es un módulo de negocio nuevo dentro del
  patrón de módulos ya existente (mismo criterio que agregar `bridges/` o
  `notificaciones/` en su momento).
- Reemplazo de los mocks ya construidos (`CierreVentaForm.tsx`,
  `useAutorizacionLead`, ver "Contratos mock" arriba) por su fuente real —
  edición de archivos ya existentes, no archivos nuevos.

Ningún directorio se mueve ni se renombra. `routes/`, `controllers/`,
`services/`, `repositories/` (backend) y `funcionalidades/<módulo>/`
(frontend) quedan exactamente como están hoy.

## Siguiente bloque

Bloque E (`docs/blocks/e-dashboards.md`) — requiere `Oportunidad`/`Producto`
ya existentes en Prisma antes de construir el embudo de negociación.
