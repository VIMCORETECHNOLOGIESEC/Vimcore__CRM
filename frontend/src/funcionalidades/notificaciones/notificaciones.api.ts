import { httpClient } from "@/api/httpClient";
import type { Notificacion } from "@/tipos/notificacion";

export interface ListarNotificacionesParams {
  soloNoLeidas?: boolean;
}

interface NotificacionesEnvelope {
  notificaciones: Notificacion[];
}

/** Lista las notificaciones del sujeto autenticado; el usuario se deriva del JWT. */
export async function fetchNotificacionesApi(
  { soloNoLeidas = false }: ListarNotificacionesParams = {},
): Promise<Notificacion[]> {
  const response = await httpClient.get<NotificacionesEnvelope>("/notificaciones", {
    params: { soloNoLeidas },
  });
  return response.notificaciones;
}

/** Marca una notificación propia como leída usando el contrato autoritativo de M8. */
export async function markNotificacionLeidaApi(notificacionId: string): Promise<void> {
  await httpClient.patch<void>(`/notificaciones/${notificacionId}/leer`);
}

/** Marca todas las notificaciones del sujeto autenticado como leídas. */
export async function markAllNotificacionesLeidasApi(): Promise<void> {
  await httpClient.patch<void>("/notificaciones/leer-todas");
}
