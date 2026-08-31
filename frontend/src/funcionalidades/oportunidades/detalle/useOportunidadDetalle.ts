import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { OPORTUNIDADES_QUERY_KEY } from "../useOportunidades";
import {
  cambiarEtapaOportunidadApi,
  cerrarOportunidadApi,
  fetchOportunidadDetalleApi,
  reasignarOportunidadApi,
  type CerrarOportunidadInput,
} from "./oportunidadDetalle.api";

/**
 * Query key del detalle de una oportunidad (Bloque D). Las mutaciones del
 * detalle (`useCambiarEtapaOportunidad`, `useCerrarOportunidad`,
 * `useReasignarOportunidad`) la invalidan junto con `OPORTUNIDADES_QUERY_KEY`
 * -- mismo patrón que `leads/detalle/useLeadDetalle.ts`.
 */
export const OPORTUNIDAD_DETALLE_QUERY_KEY = "oportunidad-detalle";

/**
 * `GET /oportunidades/:id` -- forma enriquecida (`OportunidadConRelaciones`).
 * `enabled: Boolean(id)` evita disparar la petición mientras la ruta todavía
 * no resolvió el parámetro.
 */
export function useOportunidadDetalle(id: string) {
  return useQuery({
    queryKey: [OPORTUNIDAD_DETALLE_QUERY_KEY, id],
    queryFn: () => fetchOportunidadDetalleApi(id),
    enabled: Boolean(id),
  });
}

/**
 * `PATCH /oportunidades/:id/etapa` -- solo los pasos intermedios
 * (`CONTACTADO` / `CITA`). Sin actualización optimista: ante un 409
 * (`transicion_invalida` / `oportunidad_cerrada`) el toast global de error
 * (`queryClient` mutationCache) se dispara y la invalidación del detalle
 * vuelve a traer la verdad del servidor.
 */
export function useCambiarEtapaOportunidad(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (etapa: "CONTACTADO" | "CITA") => cambiarEtapaOportunidadApi(id, etapa),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [OPORTUNIDAD_DETALLE_QUERY_KEY, id] });
      void queryClient.invalidateQueries({ queryKey: [OPORTUNIDADES_QUERY_KEY] });
      toast.success("Etapa actualizada");
    },
  });
}

/**
 * `POST /oportunidades/:id/cerrar` (autoridad de cierre D7). Irreversible --
 * `OportunidadCierrePanel` exige confirmación explícita antes de mutar. Un
 * rechazo 403 `permiso_denegado` no invalida nada (el detalle no cambió) y se
 * muestra inline en el panel, además del toast global de error.
 */
export function useCerrarOportunidad(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CerrarOportunidadInput) => cerrarOportunidadApi(id, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [OPORTUNIDAD_DETALLE_QUERY_KEY, id] });
      void queryClient.invalidateQueries({ queryKey: [OPORTUNIDADES_QUERY_KEY] });
      toast.success("Oportunidad cerrada");
    },
  });
}

/**
 * `POST /oportunidades/:id/reasignar` (D9, excepción administrativa --
 * requireRole ADMINISTRADOR/SUPERVISOR). Un rechazo 409
 * (`destinatario_invalido` / `usuario_invalido`) se muestra inline en
 * `OportunidadReasignarPanel`, además del toast global de error.
 */
export function useReasignarOportunidad(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (asesorId: string) => reasignarOportunidadApi(id, asesorId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [OPORTUNIDAD_DETALLE_QUERY_KEY, id] });
      void queryClient.invalidateQueries({ queryKey: [OPORTUNIDADES_QUERY_KEY] });
      toast.success("Oportunidad reasignada");
    },
  });
}
