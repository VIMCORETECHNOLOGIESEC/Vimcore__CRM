import type { RedSocial } from "./lead";
import type { RangoMetricas } from "./metricas";

/**
 * Tipos de la exportación de reportes (docs/23 item 15). Espejo del
 * contrato real -- verificado contra `backend/src/schemas/reporte.schema.ts`,
 * `backend/src/controllers/reportes/reportes.controller.ts` y
 * `backend/src/services/reportes.service.ts`. Solo `ADMINISTRADOR`/
 * `SUPERVISOR` (más el bypass holding-wide de `requireRole`) pueden generar
 * reportes -- distinto del resto de `docs/08` (métricas), que no restringe
 * por rol.
 */
export type TipoReporte = "pdf" | "xlsx";

/**
 * Plantilla del PDF (solo aplica cuando `tipo === "pdf"`) -- `"detallado"`
 * es el formato actual, `"ejecutivo"` es la alternativa nueva que el
 * backend agrega en paralelo (mismo endpoint, mismo contrato). No tiene
 * sentido para `tipo === "xlsx"`, por eso viaja opcional dentro de
 * `ReporteParametros` y `ReportesPage.tsx` solo la incluye para PDF.
 */
export type PlantillaReporte = "detallado" | "ejecutivo";

/**
 * NO hay campo de progreso/porcentaje en el contrato real -- solo estos 4
 * valores. La UI debe representarlos como un indicador de estado (badge),
 * nunca como una barra de progreso.
 */
export type EstadoReporteJob = "PENDIENTE" | "PROCESANDO" | "LISTO" | "ERROR";

/**
 * Mismos 6 campos que `MetricasFiltros` (`tipos/metricas.ts`) más
 * `empresaId`, exclusivo de una sesión holding-wide que quiere acotar el
 * reporte a una única empresa (`buildMetricasFiltros` resuelve los primeros
 * 6, `empresaId` se agrega aparte en `ReportesPage.tsx`).
 */
export interface ReporteParametros {
  rango: RangoMetricas;
  desde?: string;
  hasta?: string;
  redSocial?: RedSocial;
  campania?: string;
  responsableId?: string;
  empresaId?: string;
  plantilla?: PlantillaReporte;
}

export interface ReporteJob {
  id: string;
  usuarioId: string;
  tipo: TipoReporte;
  parametros: ReporteParametros;
  estado: EstadoReporteJob;
  archivoUrl: string | null;
  error: string | null;
  creadoEn: string;
  finalizadoEn: string | null;
}
