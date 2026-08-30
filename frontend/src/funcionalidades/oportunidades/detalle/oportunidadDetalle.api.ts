import { httpClient } from "@/api/httpClient";
import type { FormaPago } from "@/tipos/lead";
import type { Oportunidad } from "@/tipos/oportunidad";
import { mapOportunidadFromApi, type BackendOportunidad } from "../oportunidades.api";

/**
 * Capa de datos del detalle de una Oportunidad (Bloque D). Las mutaciones
 * (`PATCH .../etapa`, `POST .../cerrar`, `POST .../reasignar`) devuelven el
 * modelo PLANO sin relaciones -- se ignora esa respuesta y se devuelve
 * `void`: cada hook invalida la query de detalle en su `onSuccess`, que
 * vuelve a traer la forma enriquecida (mismo patrón que
 * `leads/detalle/leadDetalle.api.ts::transicionEtapaApi`).
 */

/** `GET /oportunidades/:id` → `{ oportunidad }` enriquecida. 404/403 → `ApiError`. */
export async function fetchOportunidadDetalleApi(id: string): Promise<Oportunidad> {
  const { oportunidad } = await httpClient.get<{ oportunidad: BackendOportunidad }>(
    `/oportunidades/${id}`,
  );
  return mapOportunidadFromApi(oportunidad);
}

/**
 * `PATCH /oportunidades/:id/etapa` -- solo los pasos intermedios
 * (`CONTACTADO` / `CITA`). VENTA/NO_VENTA cierran por `cerrarOportunidadApi`.
 * 409 `transicion_invalida` / `oportunidad_cerrada` → `ApiError`.
 */
export async function cambiarEtapaOportunidadApi(
  id: string,
  etapa: "CONTACTADO" | "CITA",
): Promise<void> {
  await httpClient.patch(`/oportunidades/${id}/etapa`, { etapa });
}

/**
 * Cuerpo de `POST /oportunidades/:id/cerrar` -- unión discriminada por
 * `etapa`, espejo de `cerrarOportunidadBodySchema` del backend.
 */
export type CerrarOportunidadInput =
  | { etapa: "VENTA"; montoVenta: number; formaPago: FormaPago }
  | { etapa: "NO_VENTA"; observacionCierre: string };

/**
 * `POST /oportunidades/:id/cerrar` (autoridad de cierre D7). 403
 * `permiso_denegado` cuando el asesor actual no tiene
 * `Membresia.habilitadoParaVenta` → `ApiError`, el panel lo muestra inline.
 */
export async function cerrarOportunidadApi(id: string, body: CerrarOportunidadInput): Promise<void> {
  await httpClient.post(`/oportunidades/${id}/cerrar`, body);
}

/**
 * `POST /oportunidades/:id/reasignar` (D9, excepción administrativa --
 * requireRole ADMINISTRADOR/SUPERVISOR). 409 `destinatario_invalido` /
 * `usuario_invalido` → `ApiError`.
 */
export async function reasignarOportunidadApi(id: string, asesorId: string): Promise<void> {
  await httpClient.post(`/oportunidades/${id}/reasignar`, { asesorId });
}
