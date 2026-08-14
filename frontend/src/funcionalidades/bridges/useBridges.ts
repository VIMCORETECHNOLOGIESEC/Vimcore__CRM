import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  fetchBridgeDetalleApi,
  fetchBridgeLogsApi,
  fetchBridgesApi,
  saveTokenApi,
  testConnectionApi,
  toggleCuentaActivaApi,
  type BridgeLogsFiltros,
} from "./bridges.api";

const BRIDGES_QUERY_KEY = "bridges";
const BRIDGE_LOGS_QUERY_KEY = "bridge-logs";

/** Listado de bridges (F8). Mock -- ver `bridges.api.ts`. */
export function useBridges() {
  return useQuery({ queryKey: [BRIDGES_QUERY_KEY], queryFn: fetchBridgesApi });
}

/** Detalle de un bridge, con sus cuentas publicitarias asociadas (F8). */
export function useBridgeDetalle(bridgeId: string) {
  return useQuery({
    queryKey: [BRIDGES_QUERY_KEY, bridgeId],
    queryFn: () => fetchBridgeDetalleApi(bridgeId),
  });
}

/**
 * Carga/renovación de token con verificación inmediata (F8). Invalida tanto
 * el listado como el detalle -- el estado y la expiración cambian en ambas
 * vistas.
 */
export function useSaveToken(bridgeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => saveTokenApi(bridgeId, token),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BRIDGES_QUERY_KEY] });
      toast.success("Token guardado y verificado correctamente.");
    },
  });
}

/**
 * Prueba de conexión bajo demanda (F8). No invalida ninguna query -- es
 * diagnóstica, no cambia el estado guardado del bridge (ver
 * `bridges.api.ts::testConnectionApi`). El resultado se muestra vía el valor
 * de retorno de la mutación, no solo por toast, para que quede visible en
 * pantalla después de que el aviso desaparezca.
 */
export function useTestConnection(bridgeId: string) {
  return useMutation({
    mutationFn: () => testConnectionApi(bridgeId),
    onSuccess: (resultado) => {
      if (resultado.ok) {
        toast.success(resultado.mensaje);
      } else {
        toast.error(resultado.mensaje);
      }
    },
  });
}

/** Alta/baja de cuentas publicitarias asociadas (docs/05 §7). */
export function useToggleCuentaActiva(bridgeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ cuentaId, activa }: { cuentaId: string; activa: boolean }) =>
      toggleCuentaActivaApi(bridgeId, cuentaId, activa),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BRIDGES_QUERY_KEY] });
      toast.success("Cuenta publicitaria actualizada correctamente.");
    },
  });
}

/** Bitácora de errores con filtro por nivel y rango de fechas (F8). */
export function useBridgeLogs(bridgeId: string, filtros: BridgeLogsFiltros) {
  return useQuery({
    queryKey: [BRIDGE_LOGS_QUERY_KEY, bridgeId, filtros],
    queryFn: () => fetchBridgeLogsApi(bridgeId, filtros),
  });
}
