import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/funcionalidades/autenticacion/AuthContext";
import {
  fetchNotificacionesApi,
  markAllNotificacionesLeidasApi,
  markNotificacionLeidaApi,
  type ListarNotificacionesParams,
} from "./notificaciones.api";

const NOTIFICACIONES_QUERY_KEY = "notificaciones";

/**
 * Trae el listado de notificaciones del usuario en sesión (F6). Misma forma
 * de retorno que tendría contra el backend real -- ver `notificaciones.api.ts`
 * para el punto de integración exacto con M8.
 *
 * Sin `refetchInterval`: agregar un polling artificial para simular "tiempo
 * real" sería fingir el canal SSE que todavía no existe (docs/07 F6, ítems
 * de SSE dejados sin marcar). TanStack Query igual refresca al recuperar el
 * foco de la ventana (comportamiento por defecto), que es una mejora
 * razonable sin inventar infraestructura de push.
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
  const { user } = useAuth();
  const queryClient = useQueryClient();

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
  const { user } = useAuth();
  const queryClient = useQueryClient();

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
