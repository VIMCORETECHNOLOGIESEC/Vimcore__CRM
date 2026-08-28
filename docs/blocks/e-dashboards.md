# Bloque E — Dashboards, reporting y exportación

> Fase 6 de `docs/16-hallazgos-y-preguntas.md` §7 ("Reporting jerárquico").
> Cubre Fase 6 de `docs/14-evolucion-multitenant.md` §13 ("Dashboard
> jerárquico").

> **Nota (2026-08-28):** su sección "embudo de Oportunidad" depende de que
> `Oportunidad`/`Producto` existan en Prisma, y Bloque D (quien los crea)
> quedó diferido a después del despliegue — ver
> `docs/blocks/d-routing-oportunidad.md`. El resto de este bloque no
> depende de esa entrada.

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

`CuentaPublicitaria` y `Campania` ya existen en el esquema AS-IS (ver
`docs/03-modelo-datos.md`). Falta:

1. Job periódico que sincroniza el catálogo de `Campania` desde la Marketing
   API de Meta (upsert por `idExterno`, mismo patrón de idempotencia que
   `LeadRecibido`).
2. `Lead.campaniaId` (nuevo, nullable, FK a `Campania`) — resuelto durante el
   procesamiento de `LeadRecibido` contra `idExternoCampania` del payload.
   Cierra el hallazgo P1 de `docs/16` §4.3.
3. Nuevo modelo `CampaniaMetricaDiaria` (`campaniaId`, `fecha`, `gasto`,
   `impresiones`, `clics`, `alcance`) — serie diaria, no un acumulado, para
   ver tendencia. Otro job la trae de la Insights API de Meta.
4. CPC/CPL/CAC se calculan al vuelo cruzando `CampaniaMetricaDiaria` con
   conteos de `Lead`/`Oportunidad` por `campaniaId` y etapa `VENTA` — no se
   persisten como columna, se desactualizarían.
5. El mismo job de sincronización marca `CuentaPublicitaria.estadoToken`
   como expirado si Meta rechaza el token — cierra de paso
   `TOKEN_POR_EXPIRAR` (P1, `docs/16` §4.3; también relevante para Bloque A,
   que corrige la falta de productor sobre el esquema single-company).

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
5. Ranking de productos por empresa (requiere `empresaId`, ya resuelto en
   Bloque B).

Orden de implementación recomendado (menor esfuerzo primero): 1 y 2
(extensión directa de gráficos existentes), luego 3 y 4 (agregación cruzada
nueva); el ítem 5 depende de que Bloque B ya esté mergeado.

## Migración (de `docs/14` §13, Fase 6)

- Incorporar selectores de holding, empresa, sitio y fuente según el rol.
- Separar métricas de asesor y vendedor.
- Reemplazar el filtro sintético de campaña (JSON) por relaciones
  materializadas (`Lead.campaniaId`, arriba).
- Scopear invalidaciones en tiempo real (SSE) por tenant y empresa.

## Criterios de salida

- CPC/CPL/CAC se calculan sobre datos reales de Meta, no estimaciones.
- Exportación PDF y XLSX disponible con la misma autorización que el
  dashboard en vivo.
- Embudo de Oportunidad y rendimiento por producto visibles en el dashboard.

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
  `ConfiguracionReporte`, `ReporteJob`, `Lead.campaniaId`. Mismo archivo
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
