import type { EtapaLead } from "@/tipos/lead";
import { ETAPA_OPORTUNIDAD_ETIQUETAS } from "./catalogos";
import type { OportunidadesQueryParams } from "./oportunidades.api";

/**
 * Utilidades puras de los filtros del listado de oportunidades (Bloque D) --
 * mismo criterio que `funcionalidades/leads/leads.utils.ts`: componen la
 * consulta real que se manda a la capa de datos, así que llevan test
 * dedicado (`oportunidades.utils.test.ts`).
 */

/** Sentinela para "todos/todas" en los `<Select>` de filtros (Radix Select no admite `value=""`). */
export const FILTRO_TODOS = "TODOS";

export interface FiltrosState {
  etapa: EtapaLead | typeof FILTRO_TODOS;
  /** Id del asesor, o `FILTRO_TODOS`. Solo lo usan ADMINISTRADOR/SUPERVISOR. */
  asesorId: string;
}

export const FILTROS_VACIOS: FiltrosState = {
  etapa: FILTRO_TODOS,
  asesorId: FILTRO_TODOS,
};

/**
 * Traduce el estado de los filtros de la UI al contrato de query de
 * `fetchOportunidadesApi`. `pagina` + `limite` van siempre; los campos en
 * `FILTRO_TODOS` se descartan; `empresaVistaId` (drill-down de un holding) se
 * reenvía como `empresaId` solo cuando es truthy.
 */
export function buildQueryParams(
  filtros: FiltrosState,
  pagina: number,
  limite: number,
  empresaVistaId?: string,
): OportunidadesQueryParams {
  const params: OportunidadesQueryParams = { pagina, limite };
  if (filtros.etapa !== FILTRO_TODOS) params.etapa = filtros.etapa;
  if (filtros.asesorId !== FILTRO_TODOS) params.asesorId = filtros.asesorId;
  if (empresaVistaId) params.empresaId = empresaVistaId;
  return params;
}

export interface FiltroActivo {
  campo: keyof FiltrosState;
  etiqueta: string;
  valorLegible: string;
}

/** Orden fijo de campos filtrables, usado para construir los chips sin duplicados. */
const CAMPOS_FILTRO_ACTIVO: { campo: keyof FiltrosState; etiqueta: string }[] = [
  { campo: "etapa", etiqueta: "Etapa" },
  { campo: "asesorId", etiqueta: "Asesor" },
];

/**
 * Chips de filtros activos, uno por campo (nunca más de uno), iterando
 * `CAMPOS_FILTRO_ACTIVO` una sola vez. `asesores` es opcional: cuando el
 * asesor seleccionado está en esa lista se muestra su nombre, si no se cae al
 * id crudo (mismo criterio que `leads.utils.ts::buildFiltrosActivos`, que
 * resuelve nombre por catálogo).
 */
export function buildFiltrosActivos(
  filtros: FiltrosState,
  asesores: { id: string; nombre: string }[] = [],
): FiltroActivo[] {
  const resolver: Record<keyof FiltrosState, () => string | null> = {
    etapa: () => (filtros.etapa !== FILTRO_TODOS ? ETAPA_OPORTUNIDAD_ETIQUETAS[filtros.etapa] : null),
    asesorId: () =>
      filtros.asesorId !== FILTRO_TODOS
        ? (asesores.find((a) => a.id === filtros.asesorId)?.nombre ?? filtros.asesorId)
        : null,
  };

  return CAMPOS_FILTRO_ACTIVO.flatMap(({ campo, etiqueta }) => {
    const valorLegible = resolver[campo]();
    return valorLegible !== null ? [{ campo, etiqueta, valorLegible }] : [];
  });
}
