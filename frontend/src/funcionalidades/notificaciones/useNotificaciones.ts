import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/funcionalidades/autenticacion/auth-context";
import {
  fetchNotificacionesApi,
  markAllNotificacionesLeidasApi,
  markNotificacionLeidaApi,
  type ListarNotificacionesParams,
} from "./notificaciones.api";

const NOTIFICACIONES_QUERY_KEY = "notificaciones";

/**
 * Trae el listado de notificaciones del usuario en sesión (F6), backend real
 * -- ver `notificaciones.api.ts`. La query key incluye `user.id` a
 * propósito: `useNotificacionesRealtime.ts` escribe (`setQueryData`) e
 * invalida sobre la misma clave `["notificaciones", userId]` al recibir
 * eventos del canal SSE (`notificacion.nueva`, resincronización), así que
 * sacar `user.id` de la clave desincronizaría en silencio ese caché en
 * tiempo real -- `queryClient.invalidateQueries` no matchea una clave más
 * específica contra una más corta.
 */
export function useNotificaciones(params: ListarNotificacionesParams = {}) {
  const { user } = useAuth();

  return useQuery({
    queryKey: [NOTIFICACIONES_QUERY_KEY, user?.id],
    queryFn: () => fetchNotificacionesApi(params),
    enabled: Boolean(user),
  });
}

/** Marca una notificación puntual como leída (F6, "individual"). */
export function useMarkNotificacionLeida() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: (notificacionId: string) => markNotificacionLeidaApi(notificacionId),
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: [NOTIFICACIONES_QUERY_KEY, user!.id],
        exact: true,
      });
    },
  });
}

/** Marca todas las notificaciones del usuario como leídas (F6, "masivo"). */
export function useMarkAllNotificacionesLeidas() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: () => markAllNotificacionesLeidasApi(),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [NOTIFICACIONES_QUERY_KEY, user!.id],
        exact: true,
      });
      toast.success("Todas las notificaciones se marcaron como leídas.");
    },
  });
}
