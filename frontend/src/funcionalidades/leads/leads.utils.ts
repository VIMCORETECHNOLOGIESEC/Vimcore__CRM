import type { EstadoSla, EtapaLead, Lead, RedSocial, ResponsableLead, SemaforoLead } from "@/tipos/lead";
import type { LeadsQueryParams } from "./leads.api";

/**
 * Responsable operativo vigente de un lead (docs/02-reglas-negocio.md §5):
 * el vendedor si ya hubo traspaso, si no el asesor. Toda la UI (columna
 * "Responsable", filtro por responsable, restricción de cartera por rol)
 * debe usar esta función en vez de leer `asesor`/`vendedor` por separado.
 */
export function getResponsable(lead: Lead): ResponsableLead | null {
  return lead.vendedor ?? lead.asesor;
}

/** Sentinela para "todos/todas" en los `<Select>` de filtros (Radix Select no admite `value=""`). */
export const FILTRO_TODOS = "TODOS";

export interface LeadsFiltrosState {
  busqueda: string;
  etapa: EtapaLead | typeof FILTRO_TODOS;
  semaforo: SemaforoLead | typeof FILTRO_TODOS;
  redSocial: RedSocial | typeof FILTRO_TODOS;
  campaniaId: string;
  responsableId: string;
  estadoSla: EstadoSla | typeof FILTRO_TODOS;
  /** ISO `YYYY-MM-DD` o cadena vacía. */
  fechaDesde: string;
  fechaHasta: string;
}

export const FILTROS_LEADS_VACIOS: LeadsFiltrosState = {
  busqueda: "",
  etapa: FILTRO_TODOS,
  semaforo: FILTRO_TODOS,
  redSocial: FILTRO_TODOS,
  campaniaId: FILTRO_TODOS,
  responsableId: FILTRO_TODOS,
  estadoSla: FILTRO_TODOS,
  fechaDesde: "",
  fechaHasta: "",
};

/**
 * Traduce el estado de los filtros de la UI al contrato de query de
 * `fetchLeadsApi` (mismo contrato que tendrá `GET /api/v1/leads`, M5). Pura
 * y con test dedicado (`leads.utils.test.ts`) porque compone la consulta
 * real que se le manda a la capa de datos -- justo el tipo de lógica que
 * AGENTS.md §5 exige cubrir, aunque viva en el frontend.
 */
export function buildLeadsQueryParams(
  filtros: LeadsFiltrosState,
  pagina: number,
  porPagina: number,
): LeadsQueryParams {
  const busqueda = filtros.busqueda.trim();
  const params: LeadsQueryParams = { pagina, porPagina };

  if (busqueda) params.busqueda = busqueda;
  if (filtros.etapa !== FILTRO_TODOS) params.etapa = filtros.etapa;
  if (filtros.semaforo !== FILTRO_TODOS) params.semaforo = filtros.semaforo;
  if (filtros.redSocial !== FILTRO_TODOS) params.redSocial = filtros.redSocial;
  if (filtros.campaniaId !== FILTRO_TODOS) params.campaniaId = filtros.campaniaId;
  if (filtros.responsableId !== FILTRO_TODOS) params.responsableId = filtros.responsableId;
  if (filtros.estadoSla !== FILTRO_TODOS) params.estadoSla = filtros.estadoSla;
  if (filtros.fechaDesde) params.fechaDesde = filtros.fechaDesde;
  if (filtros.fechaHasta) params.fechaHasta = filtros.fechaHasta;

  return params;
}
