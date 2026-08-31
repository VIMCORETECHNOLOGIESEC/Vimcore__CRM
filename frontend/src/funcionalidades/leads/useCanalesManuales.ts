import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createCanalManualApi,
  createLeadManualApi,
  fetchCanalesManualesApi,
  updateCanalManualApi,
  type ActualizarCanalManualInput,
  type CrearCanalManualInput,
  type CrearLeadManualInput,
} from "./canal-manual.api";

const CANALES_MANUALES_QUERY_KEY = "canales-manuales";

/**
 * Query key real de `useLeads.ts` (no exportada desde ese archivo) -- se
 * duplica el literal acá a propósito, mismo criterio ya establecido en este
 * código base de no introducir un helper compartido solo para esto (ver
 * `canal-manual.api.ts`, "duplicado deliberadamente por archivo").
 */
const LEADS_QUERY_KEY = "leads";

/**
 * Hooks TanStack Query del canal de ingreso manual (Bloque D). Backend real,
 * ver el docblock de `canal-manual.api.ts`.
 */
export function useCanalesManuales(empresaId: string | null) {
  return useQuery({
    queryKey: [CANALES_MANUALES_QUERY_KEY, empresaId],
    queryFn: () => fetchCanalesManualesApi(empresaId as string),
    enabled: empresaId !== null,
  });
}

export function useCrearCanalManual(empresaId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CrearCanalManualInput) => createCanalManualApi(empresaId as string, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [CANALES_MANUALES_QUERY_KEY, empresaId] });
      toast.success("Canal creado correctamente.");
    },
  });
}

export function useActualizarCanalManual(empresaId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ canalId, input }: { canalId: string; input: ActualizarCanalManualInput }) =>
      updateCanalManualApi(empresaId as string, canalId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [CANALES_MANUALES_QUERY_KEY, empresaId] });
      toast.success("Canal actualizado correctamente.");
    },
  });
}

/**
 * Alta de lead manual (backend real, `POST /leads`). Invalida el listado
 * real de leads (`["leads", ...]`, `useLeads.ts`) al terminar -- el lead
 * recién cargado debe aparecer en `LeadsPage.tsx` sin que el usuario tenga
 * que refrescar la página a mano (AGENTS.md, "no frozen UI").
 */
export function useCrearLeadManual() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CrearLeadManualInput) => createLeadManualApi(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [LEADS_QUERY_KEY] });
      toast.success("Lead cargado correctamente.");
    },
  });
}
