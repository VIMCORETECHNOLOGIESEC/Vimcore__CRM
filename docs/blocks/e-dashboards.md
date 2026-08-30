# Bloque E — Dashboards, reporting y exportación

> Fase 6 de `docs/16-hallazgos-y-preguntas.md` §7 ("Reporting jerárquico").
> Cubre Fase 6 de `docs/14-evolucion-multitenant.md` §13 ("Dashboard
> jerárquico").

> **Post-despliegue; cierre subordinado a Bloque D (2026-08-28).** Las
> maquetas de UI y la sincronización publicitaria independiente pueden
> prepararse antes, pero este bloque no puede considerarse cerrado hasta que
> Bloque D provea `Oportunidad`/`Producto`: el embudo de negociación y el
> rendimiento por producto dependen de esas entidades.

## Estado real (2026-08-30)

**Backend cerrado, frontend pendiente.** Las tres piezas de backend están
construidas y probadas sobre `dev-mateo`: extensiones de dashboard
(embudo de Oportunidad, rendimiento por producto, cascada Lead→Oportunidad→
Venta, eficiencia de habilitados para venta D8, ranking de productos, todo
sobre `metricas.service.ts` existente, sin duplicar agregación); módulo
`reportes` (exportación PDF vía Chromium headless, XLSX vía `exceljs`,
`ReporteJob` asíncrono con progreso SSE, scope siempre derivado server-side
desde `Membresia`, nunca del cliente); módulo `metaAds` (OAuth de cuenta de
anuncios, mismo patrón de 4 pasos que WhatsApp, cubre Facebook e Instagram
con una sola conexión, más el job de sincronización real de
`CampaniaMetricaDiaria` — CPC/CPL/CAC ya no son estimados).

**Pendiente, fuera de este backend**: los componentes de frontend
(`GraficoEmbudoOportunidad.tsx`, `GraficoPorProducto.tsx`, UI de reportes,
UI de conexión de Meta Ads) — ver `docs/contrato-frontend-general.md`
(distribuido aparte, no vive en el repo). Desglose por empresa en reportes
holding-wide sigue como TODO explícito en el código, no implementado.

## Alcance

Sincronizar métricas publicitarias reales de Meta, exponer
CPC/CPL/CAC por canal, agregar el embudo de Oportunidad, y ofrecer
exportación PDF/XLSX de los mismos reportes — todo reutilizando
`metricas.service.ts`, nunca duplicando lógica de agregación.

## Requiere cerrado

- **Bloque D** — `Oportunidad`/`Producto` deben existir en Prisma antes de
  construir el embudo de negociación y el rendimiento por producto.

## Nota de priorización

Este bloque no es necesario para que el multi-tenant esencial funcione de
punta a punta — el aislamiento por empresa (Bloque C) y el routing sobre
`Oportunidad` (Bloque D esencial) ya alcanzan para operar. El esfuerzo alto
está en la sincronización real con la Marketing API de Meta,
`CampaniaMetricaDiaria` y la generación asincrónica de `ReporteJob`. Puede
construirse como maquetas de UI desconectadas de `router.tsx` (botón
"Generar", progreso SSE) mientras el núcleo esencial no está cerrado, e
integrarse directo contra el esquema ya especificado en este documento sin
rediseño.

## Decisión que implementa (ver rationale completo en `docs/16` §8 — no se repite acá)

- **D10 — Rendimiento de canal**: métricas publicitarias reales (Meta Ads
  primero) cruzadas con la conversión real del CRM, no solo conteos propios
  de `Lead`.

## Sincronización de campañas Meta (movido desde `docs/16` §8.4)

`CuentaPublicitaria`, `Campania` y la FK nullable `Lead.campaniaId` ya existen
en el esquema AS-IS. Bloque A también implementó el productor idempotente
`TOKEN_POR_EXPIRAR`. Para este bloque falta:

1. Job periódico que sincroniza el catálogo de `Campania` desde la Marketing
   API de Meta (upsert por `idExterno`, mismo patrón de idempotencia que
   `LeadRecibido`).
2. Consumir la relación canónica `Lead.campaniaId` ya implementada para
   cruzar captación y conversión, sin volver a inferir campaña desde JSON.
3. Nuevo modelo `CampaniaMetricaDiaria` (`campaniaId`, `fecha`, `gasto`,
   `impresiones`, `clics`, `alcance`) — serie diaria, no un acumulado, para
   ver tendencia. Otro job la trae de la Insights API de Meta.
4. CPC/CPL/CAC se calculan al vuelo cruzando `CampaniaMetricaDiaria` con
   conteos de `Lead`/`Oportunidad` por `campaniaId` y etapa `VENTA` — no se
   persisten como columna, se desactualizarían.
5. El mismo job de sincronización puede marcar
   `CuentaPublicitaria.estadoToken` como expirado si Meta rechaza el token.
   Esto complementa, pero no reemplaza ni inaugura, el productor
   `TOKEN_POR_EXPIRAR` ya cerrado por Bloque A.

La integración con la Marketing API de Meta (OAuth, scopes por página, rate
limits) se trata como su propia etapa de trabajo, no como "un job más".

## Exportación PDF/XLSX (movido desde `docs/16` §8.5)

Se reutilizan exactamente los mismos servicios de agregación que ya
alimentan el dashboard — cero lógica de negocio duplicada. La autorización
por empresa (Bloque C/D6) se aplica una sola vez, en el servidor.

- **PDF**: plantilla HTML/CSS renderizada vía Chromium headless
  (server-side; el solicitante no necesita nada instalado). Estructura:
  portada → resumen ejecutivo → embudo → rendimiento por canal (CPC/CPL/CAC)
  → rendimiento por asesor (según visibilidad de D6) → desglose por empresa
  si es reporte holding-wide. Acceso: solo Supervisor y Administrador
  (empresa u holding) — Asesor no.
- **XLSX**: `exceljs`, una hoja por métrica, sin gráficos nativos de Excel
  (decisión firme).
- **Configuración por defecto**, nuevo modelo:

```prisma
model ConfiguracionReporte {
  id            String   @id @default(uuid()) @db.Uuid
  empresaId     String?  @map("empresa_id") @db.Uuid // null = default holding
  secciones     Json     @db.JsonB
  actualizadoEn DateTime @updatedAt @map("actualizado_en") @db.Timestamptz(6)

  empresa Empresa? @relation(fields: [empresaId], references: [id], onDelete: Cascade)

  @@unique([empresaId])
  @@map("configuraciones_reporte")
}
```

- **Generación asincrónica con progreso por SSE**, nuevo modelo:

```prisma
enum EstadoReporteJob {
  PENDIENTE
  PROCESANDO
  LISTO
  ERROR

  @@map("estado_reporte_job")
}

model ReporteJob {
  id           String           @id @default(uuid()) @db.Uuid
  usuarioId    String           @map("usuario_id") @db.Uuid
  tipo         String           // "pdf" | "xlsx"
  parametros   Json             @db.JsonB
  estado       EstadoReporteJob @default(PENDIENTE)
  archivoUrl   String?          @map("archivo_url")
  error        String?          @db.Text
  creadoEn     DateTime         @default(now()) @map("creado_en") @db.Timestamptz(6)
  finalizadoEn DateTime?        @map("finalizado_en") @db.Timestamptz(6)

  usuario Usuario @relation(fields: [usuarioId], references: [id], onDelete: Cascade)

  @@index([usuarioId, estado])
  @@map("reporte_jobs")
}
```

**Scope empresarial de `ReporteJob` — siempre derivado server-side.** El
modelo de arriba no declara `empresaId` propio; su scope empresarial se
resuelve a partir de `usuarioId` y su(s) `Membresia` activa(s), nunca desde
`parametros` (JSON) enviado por el cliente. Un `parametros.empresaId` que no
coincida con una membresía activa del usuario debe rechazarse en el backend
antes de crear el job. Esta derivación server-side aplica a las tres
operaciones sensibles: creación del job, reanudación de estado
(`GET /reportes/jobs/activo`) y descarga del archivo generado (`archivoUrl`)
— las tres deben respetar RLS y el tenant/empresa reales del usuario
autenticado, no un valor confiado del payload.

Bloqueo de generación duplicada: antes de crear un `ReporteJob`, se busca si
ese usuario ya tiene uno `PENDIENTE`/`PROCESANDO` con el mismo
tipo/parámetros; si existe, se devuelve ese job. Flujo UI: botón "Generar" →
"Generando…" → eventos SSE `reporte.iniciado`/`reporte.listo`/`reporte.error`
sobre el mismo `event-broker.ts` ya existente → notificación con descarga.
Endpoint de resincronización (`GET /reportes/jobs/activo`) para recuperar
estado tras recarga, sin depender solo del evento en vivo. La generación es
asincrónica desde el diseño (Puppeteer es lento para holdings de alto
volumen), no un parche posterior.

## Extensiones de dashboard (movido desde `docs/16` §8.6)

Sobre `metricas.service.ts` ya existente:

1. Embudo por Oportunidad, separado del embudo de Lead ("embudo de
   contacto" vs. "embudo de negociación").
2. Rendimiento por producto (mismo patrón que "por campaña" hoy).
3. Cascada Lead → Oportunidad → Venta.
4. Habilitados vs. no habilitados para venta — eficiencia del handoff (D8).
5. Ranking de productos por empresa (`empresaId` ya está resuelto desde
   Bloque B).

Orden de implementación recomendado (menor esfuerzo primero): 1 y 2
(extensión directa de gráficos existentes), luego 3 y 4 (agregación cruzada
nueva); el ítem 5 consume la fundación de Bloque B, ya cerrada.

## Migración (de `docs/14` §13, Fase 6)

- Incorporar selectores de holding, empresa, sitio y fuente según el rol.
- Separar métricas de asesor y vendedor.
- Consumir la relación materializada `Lead.campaniaId` ya disponible, sin
  reintroducir el filtro sintético de campaña por JSON.
- Scopear invalidaciones en tiempo real (SSE) por tenant y empresa.

## Criterios de salida

- CPC/CPL/CAC se calculan sobre datos reales de Meta, no estimaciones.
- Exportación PDF y XLSX disponible con la misma autorización que el
  dashboard en vivo.
- Embudo de Oportunidad y rendimiento por producto visibles en el dashboard.
- Bloque D está cerrado y `Oportunidad`/`Producto` son la fuente real del
  embudo; una maqueta previa no satisface este criterio.

## Enfoque de implementación — capas existentes, sin reestructuración

Directiva vigente (2026-08-28): mismo criterio que Bloque D — editar lógica
dentro de la estructura de capas ya usada por Bloques A/B/C, sin mover ni
renombrar carpetas, para no interferir con el trabajo paralelo de otros
developers sobre el layout físico actual.

**Archivos existentes que se editan:**

- `backend/src/services/metricas.service.ts` — se extiende con los nuevos
  cálculos (embudo de Oportunidad, rendimiento por producto, cascada
  Lead→Oportunidad→Venta); explícitamente reutilizado, no duplicado, según
  ya fija el "Alcance" de este documento.
- `backend/src/lib/event-broker.ts` — nuevos eventos
  `reporte.iniciado`/`reporte.listo`/`reporte.error` sobre el mismo hub SSE.
  Está en la lista de "archivos de alto riesgo" de `docs/06` (24 símbolos
  dependientes de `publish`) — agregar eventos nuevos es de menor riesgo que
  cambiar la firma de `publish`, pero igual amerita avisar antes del PR.

**Archivos nuevos — dentro de carpetas ya existentes:**

- `backend/src/services/reportes.service.ts`,
  `backend/src/repositories/reporte-job.repository.ts`,
  `backend/src/controllers/reportes.controller.ts`,
  `backend/src/routes/reportes.routes.ts`,
  `backend/src/jobs/sincronizacion-meta.job.ts` (mismo patrón que los jobs
  ya existentes en `backend/src/jobs/`, ej. `sla-atrasado.service`,
  `bridge-mudo.service.ts`) — sin carpeta nueva.
- `backend/prisma/schema.prisma` — agrega `CampaniaMetricaDiaria`,
  `ConfiguracionReporte` y `ReporteJob`; `Lead.campaniaId` ya existe y no se
  vuelve a agregar. Mismo archivo
  único ya extendido por A/B/C/D.
- Frontend: nuevo módulo `frontend/src/funcionalidades/reportes/` (mismo
  nivel que `dashboard/`), y extensión de
  `frontend/src/funcionalidades/dashboard/` con los componentes de embudo de
  Oportunidad/rendimiento por producto (`GraficoEmbudoOportunidad.tsx`,
  `GraficoPorProducto.tsx` — mismo patrón flat que
  `GraficoPorCampania.tsx`/`GraficoPorAsesor.tsx` ya existentes).

Ningún directorio se mueve ni se renombra. Este bloque tiene menor riesgo de
colisión que D: no toca `leads.access.ts` ni `asignacion.service.ts`.

## Siguiente bloque

Bloque F (`docs/blocks/f-retiro-legacy.md`) — último bloque; requiere que
Bloques B-E estén verificados en producción antes de retirar compatibilidad.
