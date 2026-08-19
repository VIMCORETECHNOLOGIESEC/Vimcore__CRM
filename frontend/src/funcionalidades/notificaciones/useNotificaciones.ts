import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  fetchNotificacionesApi,
  markAllNotificacionesLeidasApi,
  markNotificacionLeidaApi,
} from "./notificaciones.api";

const NOTIFICACIONES_QUERY_KEY = "notificaciones";

/**
 * Trae el listado de notificaciones del usuario en sesión (F6), backend real
 * -- ver `notificaciones.api.ts`. Sin `useAuth()`/`enabled`: el backend
 * resuelve el usuario del JWT y este componente solo se monta detrás de
 * `ProtectedRoute` (`router.tsx`), mismo criterio que `useLeads`/`useBridges`
 * tras su integración (F3/F4/F8) -- `LeadsContextoRol` desapareció por la
 * misma razón.
 *
 * Sin `refetchInterval`: agregar un polling artificial para simular "tiempo
 * real" sería fingir el canal SSE que todavía no existe (docs/07 F6, ítems
 * de SSE dejados sin marcar). TanStack Query igual refresca al recuperar el
 * foco de la ventana (comportamiento por defecto), que es una mejora
 * razonable sin inventar infraestructura de push.
 */
export function useNotificaciones() {
  return useQuery({
    queryKey: [NOTIFICACIONES_QUERY_KEY],
    queryFn: () => fetchNotificacionesApi(),
  });
}

/** Marca una notificación puntual como leída (F6, "individual"). */
export function useMarkNotificacionLeida() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificacionId: string) => markNotificacionLeidaApi(notificacionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [NOTIFICACIONES_QUERY_KEY] });
    },
  });
}

/** Marca todas las notificaciones del usuario como leídas (F6, "masivo"). */
export function useMarkAllNotificacionesLeidas() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => markAllNotificacionesLeidasApi(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [NOTIFICACIONES_QUERY_KEY] });
      toast.success("Todas las notificaciones se marcaron como leídas.");
    },
  });
}
