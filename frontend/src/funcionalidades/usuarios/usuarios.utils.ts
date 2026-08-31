import type { RolUsuario } from "@/tipos/usuario";
import type { UsuariosQueryParams } from "./usuarios.api";

/** Sentinela para "todos" en el `<Select>` de rol (Radix Select no admite `value=""`), mismo criterio que `leads/leads.utils.ts::FILTRO_TODOS`. */
export const FILTRO_TODOS = "TODOS";

export interface UsuariosFiltrosState {
  /** Nombre o correo (backend filtra por ambos con un único término, insensible a mayúsculas). */
  busqueda: string;
  rol: RolUsuario | typeof FILTRO_TODOS;
  /** Tres estados en vez de un booleano: "sin elegir" es un estado real del filtro, no solo `false`. */
  estado: "TODOS" | "ACTIVOS" | "INACTIVOS";
  /**
   * Tab holding-wide vs. por empresa (Item 25, Bloque F tarea 2) -- solo
   * tiene efecto para una sesión holding-wide (`UsuariosFiltros.tsx` lo
   * oculta para una sesión company-scoped). Ver el docblock de
   * `UsuariosQueryParams::soloHoldingWide` en `usuarios.api.ts`.
   */
  soloHoldingWide: boolean;
}

/**
 * Default "Activos" (no "Todos"): un usuario dado de baja no debería
 * aparecer en el listado por defecto -- hay que elegir explícitamente
 * "Todos los estados" o "Inactivos" para verlo (ver `UsuariosTable.tsx`,
 * que atenúa la fila cuando el filtro deja de estar acotado a "Activos").
 *
 * Default `soloHoldingWide: true` (invertido, decisión de producto a partir
 * de QA manual): `/usuarios` (`UsuariosPage.tsx`) es la pantalla propia del
 * holding y por defecto debe mostrar SOLO usuarios holding-wide (sin
 * ninguna `Membresia`), no la mezcla cruzada con usuarios de cada empresa
 * individual -- esos ya tienen su propia pantalla acotada
 * (`EmpresaUsuariosPage.tsx`, `/empresas/:id/usuarios`). El checkbox de
 * `UsuariosFiltros.tsx` queda invertido semánticamente: tildarlo desactiva
 * este filtro (`soloHoldingWide: false`) para ver la vista cruzada de todas
 * las empresas.
 */
export const FILTROS_USUARIOS_VACIOS: UsuariosFiltrosState = {
  busqueda: "",
  rol: FILTRO_TODOS,
  estado: "ACTIVOS",
  soloHoldingWide: true,
};

/**
 * Traduce el estado de los filtros de la UI al contrato de query de
 * `fetchUsuariosApi` (`GET /usuarios`, backend real -- F7). Pura y con test
 * dedicado (`usuarios.utils.test.ts`) porque compone la consulta real que se
 * le manda al backend, mismo criterio que `leads/leads.utils.ts::buildLeadsQueryParams`
 * (AGENTS.md §5).
 */
export function buildUsuariosQueryParams(
  filtros: UsuariosFiltrosState,
  pagina: number,
  limite: number,
  /** Vista de empresa de un holding-wide (`useVistaEmpresa`) -- ver el docblock de `UsuariosQueryParams::empresaId`. */
  empresaId?: string,
): UsuariosQueryParams {
  const busqueda = filtros.busqueda.trim();
  const params: UsuariosQueryParams = { pagina, limite };

  if (busqueda) params.busqueda = busqueda;
  if (filtros.rol !== FILTRO_TODOS) params.rol = filtros.rol;
  if (filtros.estado === "ACTIVOS") params.activo = true;
  if (filtros.estado === "INACTIVOS") params.activo = false;
  if (empresaId) {
    // Un `empresaId` explícito (drill-down a UNA empresa puntual -- ver el
    // docblock de arriba) gana SIEMPRE sobre `soloHoldingWide`, incluso
    // cuando este último sigue en su default `true`: el backend
    // (`usuarios.service.ts::buildWhere`) prioriza `query.soloHoldingWide`
    // por sobre `query.empresaId` cuando llegan juntos (decisión de
    // prioridad documentada ahí, pensada para un `empresaId` residual de
    // query string). Si mandáramos ambos acá, esa prioridad del backend
    // haría que CUALQUIER vista de una empresa puntual devuelva 0 usuarios
    // (el filtro "sin ninguna Membresia" nunca matchea a alguien CON una
    // Membresia en `empresaId`) -- afecta tanto a la vista de empresa de
    // `UsuariosPage.tsx` (`useVistaEmpresa`) como a
    // `EmpresaUsuariosPage.tsx` (empresaId fijo por la ruta, que además
    // oculta el checkbox y nunca lo deja tocar). Omitir `soloHoldingWide`
    // acá evita depender de esa prioridad del backend por completo.
    params.empresaId = empresaId;
  } else if (filtros.soloHoldingWide) {
    params.soloHoldingWide = true;
  }

  return params;
}
