import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  fetchEmpresasHoldingApi,
  updateEmpresaAparienciaHoldingApi,
  type EmpresaAparienciaHoldingView,
  type EmpresasHoldingQueryParams,
  type UpdateEmpresaAparienciaHoldingInput,
} from "./empresa-apariencia-holding.api";

export interface UpdateEmpresaAparienciaHoldingVariables {
  empresaId: string;
  input: UpdateEmpresaAparienciaHoldingInput;
}

/** `queryKey` del listado de empresas del holding -- ver `useEmpresasHolding`. */
export const EMPRESAS_HOLDING_QUERY_KEY = "empresas-holding";

/**
 * Listado paginado del gestor de empresas de holding (PASO 8,
 * `GET /empresas`, contrato server-side `page`/`pageSize`/`search` ->
 * `{ items, total }`). `keepPreviousData` evita el parpadeo a "cargando" al
 * cambiar de página o de término de búsqueda, mismo criterio que
 * `usuarios/useUsuarios.ts::useUsuarios`. Consumido por
 * `GestorEmpresasPage.tsx`.
 */
export function useEmpresasHolding(params: EmpresasHoldingQueryParams = {}) {
  return useQuery({
    queryKey: [EMPRESAS_HOLDING_QUERY_KEY, params],
    queryFn: () => fetchEmpresasHoldingApi(params),
    placeholderData: keepPreviousData,
  });
}

/**
 * Mutación del editor cross-empresa de holding (PASO 8). A diferencia de
 * `useUpdateEmpresaApariencia` (self-service), esta no invalida
 * `["auth","perfil"]`: el `empresaId` editado no es necesariamente el de la
 * sesión del admin de holding que edita (sesión `holding` no tiene
 * `empresaId` propio), así que no hay perfil propio que refrescar.
 *
 * Sí invalida `EMPRESAS_HOLDING_QUERY_KEY` -- el listado del gestor de
 * empresas (`GestorEmpresasPage.tsx`) refleja la edición sin recargar la
 * página.
 */
export function useUpdateEmpresaAparienciaHolding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ empresaId, input }: UpdateEmpresaAparienciaHoldingVariables) =>
      updateEmpresaAparienciaHoldingApi(empresaId, input),
    onSuccess: (empresa: EmpresaAparienciaHoldingView) => {
      toast.success(`Apariencia de ${empresa.nombre} actualizada correctamente.`);
      void queryClient.invalidateQueries({ queryKey: [EMPRESAS_HOLDING_QUERY_KEY] });
    },
  });
}
