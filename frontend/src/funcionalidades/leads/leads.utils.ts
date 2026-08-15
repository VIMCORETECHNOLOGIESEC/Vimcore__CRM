import type { EstadoSla, EtapaLead, Lead, RedSocial, ResponsableLead, SemaforoLead } from "@/tipos/lead";
import {
  ESTADO_SLA_ETIQUETAS,
  ETAPA_ETIQUETAS,
  RED_SOCIAL_ETIQUETAS,
  SEMAFORO_ETIQUETAS,
} from "./catalogos";
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

export interface FiltroActivo {
  campo: keyof LeadsFiltrosState;
  etiqueta: string;
  valorLegible: string;
}

/** Orden fijo de campos filtrables, usado para construir los chips sin riesgo de duplicados. */
const CAMPOS_FILTRO_ACTIVO: { campo: keyof LeadsFiltrosState; etiqueta: string }[] = [
  { campo: "busqueda", etiqueta: "Búsqueda" },
  { campo: "etapa", etiqueta: "Etapa" },
  { campo: "semaforo", etiqueta: "Semáforo" },
  { campo: "redSocial", etiqueta: "Red social" },
  { campo: "campaniaId", etiqueta: "Campaña" },
  { campo: "responsableId", etiqueta: "Responsable" },
  { campo: "estadoSla", etiqueta: "Estado de SLA" },
  { campo: "fechaDesde", etiqueta: "Ingreso desde" },
  { campo: "fechaHasta", etiqueta: "Ingreso hasta" },
];

function formatFechaCorta(iso: string): string {
  const [anio, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${anio}`;
}

/**
 * Construye la lista de chips de filtros activos, un elemento por campo
 * (nunca más de uno), iterando `CAMPOS_FILTRO_ACTIVO` una sola vez: el "sin
 * duplicados" queda garantizado por construcción, no por una guarda ad hoc.
 */
export function buildFiltrosActivos(
  filtros: LeadsFiltrosState,
  campanias: { id: string; nombre: string }[],
  responsables: { id: string; nombre: string }[],
): FiltroActivo[] {
  const resolver: Record<keyof LeadsFiltrosState, () => string | null> = {
    busqueda: () => (filtros.busqueda !== "" ? filtros.busqueda : null),
    etapa: () => (filtros.etapa !== FILTRO_TODOS ? ETAPA_ETIQUETAS[filtros.etapa] : null),
    semaforo: () => (filtros.semaforo !== FILTRO_TODOS ? SEMAFORO_ETIQUETAS[filtros.semaforo] : null),
    redSocial: () => (filtros.redSocial !== FILTRO_TODOS ? RED_SOCIAL_ETIQUETAS[filtros.redSocial] : null),
    campaniaId: () =>
      filtros.campaniaId !== FILTRO_TODOS
        ? (campanias.find((c) => c.id === filtros.campaniaId)?.nombre ?? filtros.campaniaId)
        : null,
    responsableId: () =>
      filtros.responsableId !== FILTRO_TODOS
        ? (responsables.find((r) => r.id === filtros.responsableId)?.nombre ?? filtros.responsableId)
        : null,
    estadoSla: () => (filtros.estadoSla !== FILTRO_TODOS ? ESTADO_SLA_ETIQUETAS[filtros.estadoSla] : null),
    fechaDesde: () => (filtros.fechaDesde !== "" ? formatFechaCorta(filtros.fechaDesde) : null),
    fechaHasta: () => (filtros.fechaHasta !== "" ? formatFechaCorta(filtros.fechaHasta) : null),
  };

  return CAMPOS_FILTRO_ACTIVO.flatMap(({ campo, etiqueta }) => {
    const valorLegible = resolver[campo]();
    return valorLegible !== null ? [{ campo, etiqueta, valorLegible }] : [];
  });
}
