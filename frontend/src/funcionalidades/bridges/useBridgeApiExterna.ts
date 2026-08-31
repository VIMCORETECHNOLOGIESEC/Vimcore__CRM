import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { SaveConexionApiExternaInput, SaveMapeoApiExternaInput } from "@/tipos/bridge";
import {
  saveConexionApiExternaApi,
  saveMapeoApiExternaApi,
  testConexionApiExternaApi,
} from "./bridge-api-externa.api";

/** Mismo string que `useBridges.ts::BRIDGES_QUERY_KEY` -- no se reexporta desde ahí, se repite acá a propósito (no crear un acoplamiento de módulos por una constante). */
const BRIDGES_QUERY_KEY = "bridges";

/**
 * Hooks de los 3 pasos del asistente de configuración de un bridge
 * `API_EXTERNA` (`ApiExternaSetupDialog.tsx`) -- ver `bridge-api-externa.api.ts`
 * para el detalle de contrato y el límite de backend conocido (job de
 * polling inexistente todavía).
 */

/** Paso 1 (Conexión) -- invalida el listado/detalle de bridges, mismo criterio que `useBridges.ts::useSaveToken`. */
export function useSaveConexionApiExterna(bridgeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveConexionApiExternaInput) =>
      saveConexionApiExternaApi(bridgeId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BRIDGES_QUERY_KEY] });
    },
  });
}

/** Paso 2 (Mapeo de campos) -- mismo criterio de invalidación que `useSaveConexionApiExterna`. */
export function useSaveMapeoApiExterna(bridgeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveMapeoApiExternaInput) => saveMapeoApiExternaApi(bridgeId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BRIDGES_QUERY_KEY] });
    },
  });
}

/**
 * Paso 3 (Probar conexión) -- puramente diagnóstica, nunca cambia estado
 * guardado, no invalida ninguna query (mismo criterio que
 * `useBridges.ts::useTestConnection`). El resultado se muestra vía el valor
 * de retorno de la mutación (mensaje/cantidadLeads reales del backend), el
 * toast es solo un refuerzo transitorio.
 */
export function useTestConexionApiExterna(bridgeId: string) {
  return useMutation({
    mutationFn: () => testConexionApiExternaApi(bridgeId),
    onSuccess: (resultado) => {
      if (resultado.ok) {
        toast.success(resultado.mensaje);
      } else {
        toast.error(resultado.mensaje);
      }
    },
  });
}
