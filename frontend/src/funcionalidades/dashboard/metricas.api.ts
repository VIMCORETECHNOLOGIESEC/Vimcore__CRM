import { httpClient, type QueryParamValue } from "@/api/httpClient";
import type {
  MetricasEmbudo,
  MetricasFiltros,
  MetricasPorAsesor,
  MetricasPorCampania,
  MetricasPorEtapa,
  MetricasPorRedSocial,
  RedSocialPorSemaforo,
  ResumenMetricas,
} from "@/tipos/metricas";

/**
 * Capa de datos del dashboard -- backend real (M9, integración F5). Verificado
 * contra `backend/src/routes/metricas.routes.ts`,
 * `backend/src/controllers/metricas.controller.ts` y
 * `backend/src/services/metricas.service.ts` (worktree `dev-back`).
 * Reemplaza el mock que agregaba `LEADS_MOCK` client-side en
 * `metricas.utils.ts` (eliminado con esta integración).
 *
 * Todos los endpoints exigen sesión (`requireAuthentication`) pero NO tienen
 * un `requireRole` fijo -- el alcance por rol lo resuelve el propio servicio
 * a partir del JWT, igual criterio que `leads.api.ts`/`notificaciones.api.ts`
 * ya integrados: ninguna de estas funciones recibe `contexto`/rol como
 * parámetro.
 *
 * `/metricas/por-asesor` es la única excepción de autorización: 403 real si
 * la pide un ASESOR/VENDEDOR (`metricas.service.ts::getPorAsesor`). Ese 403
 * lo maneja `httpClient`/`ApiError` como cualquier otro error de dominio --
 * `useMetricasPorAsesor` además evita la llamada innecesaria con `enabled`
 * cuando el rol no debería verla (ver `useMetricas.ts`).
 */

function toParams(filtros: MetricasFiltros): Record<string, QueryParamValue> {
  return {
    rango: filtros.rango,
    desde: filtros.desde,
    hasta: filtros.hasta,
    redSocial: filtros.redSocial,
    campania: filtros.campania,
    responsableId: filtros.responsableId,
  };
}

/** `GET /metricas/resumen` -- devuelve el objeto de resumen tal cual, sin envolver (incluye `distribucionSemaforo`, 3.6). */
export async function fetchResumenMetricasApi(filtros: MetricasFiltros): Promise<ResumenMetricas> {
  return httpClient.get<ResumenMetricas>("/metricas/resumen", { params: toParams(filtros) });
}

interface ItemsResponse<T> {
  items: T[];
}

/** `GET /metricas/por-red-social` -- desenvuelve `{ items }`. */
export async function fetchMetricasPorRedSocialApi(
  filtros: MetricasFiltros,
): Promise<MetricasPorRedSocial[]> {
  const { items } = await httpClient.get<ItemsResponse<MetricasPorRedSocial>>("/metricas/por-red-social", {
    params: toParams(filtros),
  });
  return items;
}

/**
 * `GET /metricas/por-asesor` -- desenvuelve `{ items }`. Solo
 * administrador/supervisor la consultan (docs/08 §3.2, 403 real en el
 * backend si no); la restricción de visibilidad vive en `DashboardPage.tsx`
 * + `useMetricasPorAsesor` (`enabled`), no acá.
 */
export async function fetchMetricasPorAsesorApi(filtros: MetricasFiltros): Promise<MetricasPorAsesor[]> {
  const { items } = await httpClient.get<ItemsResponse<MetricasPorAsesor>>("/metricas/por-asesor", {
    params: toParams(filtros),
  });
  return items;
}

/**
 * `GET /metricas/por-etapa` -- desenvuelve `{ items }`. Conteo PLANO por las
 * 5 etapas, sin orden de embudo ni % de caída -- endpoint distinto de
 * `/embudo` (`fetchMetricasEmbudoApi`), no lo alimenta. Ninguna gráfica del
 * dashboard documentada en `docs/08-dashboard-kpis.md` consume este conteo
 * plano hoy (el widget de "Embudo por etapa", §3.3, usa `/embudo`); se deja
 * disponible e integrado contra el contrato real por completitud.
 */
export async function fetchMetricasPorEtapaApi(filtros: MetricasFiltros): Promise<MetricasPorEtapa[]> {
  const { items } = await httpClient.get<ItemsResponse<MetricasPorEtapa>>("/metricas/por-etapa", {
    params: toParams(filtros),
  });
  return items;
}

/** `GET /metricas/por-campania` -- desenvuelve `{ items }`, top 10 ya resuelto por el backend. */
export async function fetchMetricasPorCampaniaApi(filtros: MetricasFiltros): Promise<MetricasPorCampania[]> {
  const { items } = await httpClient.get<ItemsResponse<MetricasPorCampania>>("/metricas/por-campania", {
    params: toParams(filtros),
  });
  return items;
}

/**
 * `GET /metricas/embudo` (docs/08 §3.3) -- devuelve el objeto de embudo tal
 * cual, sin envolver (a diferencia de los demás endpoints de lista). Endpoint
 * DISTINTO de `/por-etapa`: acá sí viene el orden NUEVO→CONTACTADO→CITA→VENTA
 * con `caidaPct`, y No Venta reportado aparte (`noVenta`), nunca como paso.
 */
export async function fetchMetricasEmbudoApi(filtros: MetricasFiltros): Promise<MetricasEmbudo> {
  return httpClient.get<MetricasEmbudo>("/metricas/embudo", { params: toParams(filtros) });
}

/** `GET /metricas/red-social-x-semaforo` -- desenvuelve `{ items }`. */
export async function fetchRedSocialPorSemaforoApi(filtros: MetricasFiltros): Promise<RedSocialPorSemaforo[]> {
  const { items } = await httpClient.get<ItemsResponse<RedSocialPorSemaforo>>(
    "/metricas/red-social-x-semaforo",
    { params: toParams(filtros) },
  );
  return items;
}
