import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { CrearBridgeInput } from "@/tipos/bridge";
import {
  createBridgeApi,
  deleteBridgeApi,
  fetchBridgeDetalleApi,
  fetchBridgeLogsApi,
  fetchBridgesApi,
  fetchRedesSocialesActivasApi,
  fetchRedesSocialesSoportadasApi,
  reactivateBridgeApi,
  regenerateClaveApi,
  saveTokenApi,
  testConnectionApi,
  toggleCuentaActivaApi,
  type BridgeLogsFiltros,
} from "./bridges.api";

const BRIDGES_QUERY_KEY = "bridges";
const BRIDGE_LOGS_QUERY_KEY = "bridge-logs";
const REDES_SOCIALES_SOPORTADAS_QUERY_KEY = "redes-sociales-soportadas";
const REDES_SOCIALES_ACTIVAS_QUERY_KEY = "redes-sociales-activas";

/** Listado de bridges (F8). Backend real -- ver `bridges.api.ts`. */
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
 * Carga/renovación de token con verificación inmediata (F8). Opera POR
 * CUENTA PUBLICITARIA, no por bridge (`POST
 * /bridges/:id/cuentas/:cuentaId/token`, backend real) -- ver el gap de
 * contrato documentado en `bridges.api.ts` y `tipos/bridge.ts`. Invalida el
 * detalle del bridge (las cuentas embebidas cambian) y el listado.
 */
export function useSaveToken(bridgeId: string, cuentaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => saveTokenApi(bridgeId, cuentaId, token),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BRIDGES_QUERY_KEY] });
      toast.success("Token guardado y verificado correctamente.");
    },
  });
}

/**
 * Prueba de conexión bajo demanda (F8). Opera POR CUENTA PUBLICITARIA
 * (`POST /bridges/:id/cuentas/:cuentaId/probar-conexion`, backend real) --
 * mismo gap de contrato que `useSaveToken`. No invalida ninguna query -- es
 * diagnóstica, no cambia el estado guardado de la cuenta (ver
 * `bridges.api.ts::testConnectionApi`). El resultado se muestra vía el valor
 * de retorno de la mutación, no solo por toast, para que quede visible en
 * pantalla después de que el aviso desaparezca.
 */
export function useTestConnection(bridgeId: string, cuentaId: string) {
  return useMutation({
    mutationFn: () => testConnectionApi(bridgeId, cuentaId),
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

/**
 * Alta de bridge (bridge-lifecycle-management, Requirement: Create Bridge).
 * No dispara el toast de éxito acá -- `BridgesPage` encadena la apertura de
 * `ClaveBridgeModal` con la clave devuelta, y el toast de éxito ("Bridge
 * creado correctamente") acompaña ese cierre, no la sola creación.
 */
export function useCreateBridge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CrearBridgeInput) => createBridgeApi(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BRIDGES_QUERY_KEY] });
    },
  });
}

/**
 * Baja física o lógica (Requirement: Hard Delete Only Without Leads). El
 * toast refleja `resultado` -- distinto mensaje según haya sido eliminación
 * permanente o desactivación reversible (misma razón por la que el backend
 * real responde `200` con `{ resultado }` en vez de `204`, ver diseño).
 */
export function useDeleteBridge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (bridgeId: string) => deleteBridgeApi(bridgeId),
    onSuccess: (resultado) => {
      void queryClient.invalidateQueries({ queryKey: [BRIDGES_QUERY_KEY] });
      toast.success(
        resultado.resultado === "BAJA_FISICA"
          ? "Bridge eliminado permanentemente: nunca había recibido leads."
          : "Bridge dado de baja correctamente. Podés reactivarlo cuando quieras.",
      );
    },
  });
}

/** Reactivación, preservando clave e historial (Requirement: Soft Deactivate and Reactivate). */
export function useReactivateBridge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (bridgeId: string) => reactivateBridgeApi(bridgeId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BRIDGES_QUERY_KEY] });
      toast.success("Bridge reactivado correctamente.");
    },
  });
}

/**
 * Regeneración de clave (Requirement: Regenerate Key). Tampoco dispara el
 * toast de éxito acá, mismo criterio que `useCreateBridge` -- la clave nueva
 * se muestra a través de `ClaveBridgeModal`, no de un toast (no puede
 * mostrarse ahí sin violar la confirmación reforzada).
 */
export function useRegenerateClave(bridgeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => regenerateClaveApi(bridgeId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BRIDGES_QUERY_KEY] });
    },
  });
}

/**
 * Catálogo de creación (Requirement: Backend-Driven Creation Catalog),
 * consumido por `NuevoBridgeDialog` para poblar el selector de red social.
 */
export function useRedesSocialesSoportadas() {
  return useQuery({
    queryKey: [REDES_SOCIALES_SOPORTADAS_QUERY_KEY],
    queryFn: fetchRedesSocialesSoportadasApi,
  });
}

/**
 * Catálogo de redes activas (Requirement: Active Red-Social Catalog
 * Endpoint), consumido por el filtro de red social de F3
 * (`leads/LeadsFiltros.tsx`). `GET /bridges/redes-activas` exige
 * ADMINISTRADOR (`bridges.routes.ts`) -- `enabled` deja que el llamador
 * gatee el fetch por rol en vez de dispararlo para cualquier usuario
 * autenticado.
 */
export function useRedesSocialesActivas(enabled = true) {
  return useQuery({
    queryKey: [REDES_SOCIALES_ACTIVAS_QUERY_KEY],
    queryFn: fetchRedesSocialesActivasApi,
    enabled,
  });
}
