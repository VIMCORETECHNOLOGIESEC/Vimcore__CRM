import type { RedSocial } from "@/tipos/lead";
import type { MetricasFiltros } from "@/tipos/metricas";
import { FILTRO_TODOS } from "../leads/leads.utils";
import type { RangoFechas } from "./rangoFechas";

/**
 * Estado de los filtros combinados del dashboard (docs/08 §4: red social,
 * campaña, responsable) -- mismo patrón que `LeadsFiltrosState` en
 * `leads.utils.ts`. El rango de fechas se maneja aparte, en `rangoFechas.ts`.
 */
export interface DashboardFiltrosState {
  redSocial: RedSocial | typeof FILTRO_TODOS;
  campaniaId: string;
  responsableId: string;
}

export const FILTROS_DASHBOARD_VACIOS: DashboardFiltrosState = {
  redSocial: FILTRO_TODOS,
  campaniaId: FILTRO_TODOS,
  responsableId: FILTRO_TODOS,
};

/**
 * Traduce el estado de los filtros de la UI + el rango de fechas vigente al
 * contrato `MetricasFiltros` que consumen los hooks (`useMetricas.ts`).
 * Pura y con test dedicado, mismo criterio que `buildLeadsQueryParams`.
 */
export function buildMetricasFiltros(
  estado: DashboardFiltrosState,
  rango: RangoFechas,
): MetricasFiltros {
  const filtros: MetricasFiltros = { fechaDesde: rango.fechaDesde, fechaHasta: rango.fechaHasta };
  if (estado.redSocial !== FILTRO_TODOS) filtros.redSocial = estado.redSocial;
  if (estado.campaniaId !== FILTRO_TODOS) filtros.campaniaId = estado.campaniaId;
  if (estado.responsableId !== FILTRO_TODOS) filtros.responsableId = estado.responsableId;
  return filtros;
}
