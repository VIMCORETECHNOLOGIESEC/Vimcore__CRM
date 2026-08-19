import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/funcionalidades/autenticacion/AuthContext";
import type { Notificacion } from "@/tipos/notificacion";
import {
  connectNotificacionesSse,
  type EstadoConexion,
  type EventoNotificaciones,
  type NotificacionesSseConnection,
} from "./notificaciones.sse";

export function useNotificacionesRealtime(onNuevaNotificacion?: (value: Notificacion) => void) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [estado, setEstado] = useState<EstadoConexion>("idle");
  const connectionRef = useRef<NotificacionesSseConnection | null>(null);
  const onNuevaRef = useRef(onNuevaNotificacion);
  onNuevaRef.current = onNuevaNotificacion;

  useEffect(() => {
    if (!user?.id) { setEstado("idle"); return; }
    const userId = user.id;
    const onEvent = (event: EventoNotificaciones) => {
      if (event.type === "notificacion.nueva") {
        queryClient.setQueryData<Notificacion[]>(["notificaciones", userId], (current = []) => {
          const next = current.filter(({ id }) => id !== event.data.id);
          next.push(event.data);
          return next.sort((a, b) => Date.parse(b.creadaEn) - Date.parse(a.creadaEn));
        });
        onNuevaRef.current?.(event.data);
        return;
      }
      if (event.type === "lead.asignado" || event.type === "lead.etapa-cambiada") {
        void queryClient.invalidateQueries({ queryKey: ["leads"] });
        void queryClient.invalidateQueries({ queryKey: ["lead-detalle", event.data.leadId] });
        return;
      }
      if (event.type === "metricas.actualizadas") {
        void queryClient.invalidateQueries({ queryKey: ["metricas"] });
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ["notificaciones", userId], exact: true });
      void queryClient.invalidateQueries({ queryKey: ["leads"] });
      void queryClient.invalidateQueries({ queryKey: ["lead-detalle"] });
    };
    const connection = connectNotificacionesSse({ onEvent, onStateChange: setEstado });
    connectionRef.current = connection;
    return () => { connection.abort(); connectionRef.current = null; };
  }, [queryClient, user?.id]);

  const reintentar = useCallback(() => connectionRef.current?.retry(), []);
  return { estado, reintentar };
}
