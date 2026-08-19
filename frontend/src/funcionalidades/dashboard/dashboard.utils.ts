import type { RedSocial } from "@/tipos/lead";
import type { MetricasFiltros, RangoMetricas } from "@/tipos/metricas";
import { FILTRO_TODOS } from "../leads/leads.utils";

/**
 * Estado de los filtros combinados del dashboard (docs/08 §4: red social,
 * campaña, responsable) -- mismo patrón que `LeadsFiltrosState` en
 * `leads.utils.ts`. El rango de fechas se maneja aparte, en `RangoSeleccionado`.
 *
 * `campania` es texto libre (nombre de campaña), NO un id -- el backend real
 * busca `ILIKE` contra `payload_original ->> 'nombreCampania'`
 * (`metricas.schema.ts`), no contra una entidad de catálogo con id (esa
 * entidad no existe todavía, M4/F8 -- mismo gap ya documentado en
 * `leads.api.ts::LeadsQueryParams.campaniaId`). El selector de
 * `DashboardFiltros.tsx` sigue poblándose del catálogo local fijo
 * (`getCatalogoCampanias`), pero manda el `nombre` como valor, no el `id`.
 */
export interface DashboardFiltrosState {
  redSocial: RedSocial | typeof FILTRO_TODOS;
  campania: string;
  responsableId: string;
}

export const FILTROS_DASHBOARD_VACIOS: DashboardFiltrosState = {
  redSocial: FILTRO_TODOS,
  campania: FILTRO_TODOS,
  responsableId: FILTRO_TODOS,
};

/**
 * Rango de fechas seleccionado en `FiltroRangoFechas.tsx`. `desde`/`hasta`
 * (`YYYY-MM-DD`) solo se usan -- y solo se mandan al backend -- cuando
 * `preset === "personalizado"`.
 */
export interface RangoSeleccionado {
  preset: RangoMetricas;
  desde: string;
  hasta: string;
}

/**
 * Traduce el estado de los filtros de la UI + el rango seleccionado al
 * contrato `MetricasFiltros` que consumen los hooks (`useMetricas.ts`). Pura
 * y con test dedicado, mismo criterio que `buildLeadsQueryParams`.
 */
export function buildMetricasFiltros(
  estado: DashboardFiltrosState,
  rango: RangoSeleccionado,
): MetricasFiltros {
  const filtros: MetricasFiltros = { rango: rango.preset };
  if (rango.preset === "personalizado") {
    filtros.desde = rango.desde;
    filtros.hasta = rango.hasta;
  }
  if (estado.redSocial !== FILTRO_TODOS) filtros.redSocial = estado.redSocial;
  if (estado.campania !== FILTRO_TODOS) filtros.campania = estado.campania;
  if (estado.responsableId !== FILTRO_TODOS) filtros.responsableId = estado.responsableId;
  return filtros;
}
