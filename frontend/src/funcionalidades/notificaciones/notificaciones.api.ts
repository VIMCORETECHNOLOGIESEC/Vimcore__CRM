import { httpClient } from "@/api/httpClient";
import type { Notificacion, TipoNotificacion } from "@/tipos/notificacion";

/**
 * Capa de datos de notificaciones -- backend real (`backend/src/routes/notificaciones.routes.ts`,
 * `backend/src/controllers/notificaciones.controller.ts`, worktree `dev-back`).
 * Reemplaza el mock en memoria (`notificacionesPorUsuario` con siembra
 * perezosa) que usaba este archivo hasta esta integración -- mismo criterio
 * que `leads/leads.api.ts` y `bridges/bridges.api.ts`.
 *
 * `usuarioId` desaparece como parámetro de las tres funciones: el backend lo
 * resuelve del JWT (`assertAuthenticated`) en las tres rutas, todas bajo
 * `requireAuthentication` sin restricción de rol -- mismo criterio que
 * `LeadsContextoRol` al desaparecer de `leads.api.ts`.
 *
 * `httpClient` ya mapea errores del backend (`{ code, message }`) a
 * `ApiError` -- las excepciones se propagan tal cual, sin envolverlas de
 * nuevo.
 */

interface NotificacionesListResponse {
  notificaciones: Notificacion[];
}

/**
 * `GET /notificaciones?soloNoLeidas=true|false`: `soloNoLeidas` es un query
 * param opcional (`listNotificationsQuerySchema` en el backend) -- se omite
 * cuando es `false` para no mandar `?soloNoLeidas=false` innecesariamente
 * (mismo criterio de `buildQueryString` de `httpClient`, que igual omite
 * `undefined`).
 */
export async function fetchNotificacionesApi(soloNoLeidas = false): Promise<Notificacion[]> {
  const { notificaciones } = await httpClient.get<NotificacionesListResponse>("/notificaciones", {
    params: { soloNoLeidas: soloNoLeidas || undefined },
  });
  return notificaciones;
}

/** `PATCH /notificaciones/:id/leer`: responde `204` sin cuerpo. */
export async function markNotificacionLeidaApi(notificacionId: string): Promise<void> {
  await httpClient.patch<void>(`/notificaciones/${notificacionId}/leer`);
}

/** `PATCH /notificaciones/leer-todas`: responde `204` sin cuerpo. */
export async function markAllNotificacionesLeidasApi(): Promise<void> {
  await httpClient.patch<void>("/notificaciones/leer-todas");
}

export type { TipoNotificacion };
