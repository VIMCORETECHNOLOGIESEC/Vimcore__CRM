# Bloque D — Routing, handoff y Oportunidad

> Fase 5 de `docs/16-hallazgos-y-preguntas.md` §7 ("Routing y handoff").
> Cubre Fase 5 de `docs/14-evolucion-multitenant.md` §13 ("Routing y
> handoff").

## Alcance

Activar el pool de asignación scopeado por empresa, la matriz de
competencia asesor/venta, el canal de ingreso manual de leads, y separar
`Lead` (contacto) de `Oportunidad` (negociación) para permitir varias
negociaciones paralelas del mismo cliente en la misma empresa.

### Esencial vs. diferido

Para llegar al multi-tenant esencial no hace falta todo lo de arriba de una
sola vez:

- **Esencial** (cierra este bloque): modelos `Oportunidad`/`Producto`, pool
  de asignación scopeado por empresa (D3/D4), autoridad de cierre (D7),
  split `Lead`/`Oportunidad` (D13), y la decisión registrada del riesgo de
  invariante `asesorId` (abajo).
- **Diferido** (módulo de catálogo, con mock — ver "Contratos mock para
  módulos dependientes" más abajo): el canal de ingreso manual
  (`CanalManual`, más abajo) y las excepciones auditadas de
  Administrador/Supervisor (D9). Ninguno de los dos bloquea que el
  aislamiento y el routing esencial funcionen; se integran cuando este
  bloque cierre, contra el shape ya especificado acá.

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

## Riesgo de diseño a resolver en este bloque (movido desde `docs/16` §8.1)

**Invariante de `Lead.asesorId`/`Oportunidad.asesorId` en riesgo.** D3 asume
que los candidatos del pool son usuarios con rol Asesor. Si Administrador se
autoasigna vía la excepción de D9 usando el mismo campo `asesorId`, cualquier
cálculo de carga (D3) o de rendimiento de asesor (Bloque E, D10) que asuma
esa invariante se corrompe en silencio. Decidir antes de implementar si
Administrador puede ocupar `asesorId` directamente o si necesita un marcador
separado (ej. `gestionadoPorAdmin`) para excluirse de esos cálculos.

## Esquema Prisma — Oportunidad y Producto (movido desde `docs/16` §8, D13/D14)

```prisma
model Oportunidad {
  id                String     @id @default(uuid()) @db.Uuid
  leadId            String     @map("lead_id") @db.Uuid
  productoId        String?    @map("producto_id") @db.Uuid
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
  producto Producto? @relation(fields: [productoId], references: [id])
  asesor   Usuario? @relation("OportunidadAsesor", fields: [asesorId], references: [id], onDelete: SetNull)
  vendedor Usuario? @relation("OportunidadVendedor", fields: [vendedorId], references: [id], onDelete: SetNull)

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

- Activar elegibilidad por fuente (D4).
- Migrar `ultimaAsignacionEn` al scope de membresía/pool empresarial.
- Implementar precedencia de routing y fallback.
- Persistir primer contacto y estado de handoff.
- Aplicar la matriz asesor-vendedor acordada y el límite Lead→Oportunidad
  (D13).

## Criterios de salida

- El pool de asignación y el catálogo de canal manual operan scopeados por
  empresa, verificado con datos de al menos dos empresas.
- `Oportunidad`/`Producto` existen en el esquema y las dashboards de Bloque E
  ya pueden consumirlos.
- El riesgo de invariante de `asesorId` (arriba) tiene decisión registrada,
  no solo señalada.

## Siguiente bloque

Bloque E (`docs/blocks/e-dashboards.md`) — requiere `Oportunidad`/`Producto`
ya existentes en Prisma antes de construir el embudo de negociación.
