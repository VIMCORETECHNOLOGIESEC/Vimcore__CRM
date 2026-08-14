import type {
  DistribucionSemaforo,
  MetricasContextoRol,
  MetricasEmbudo,
  MetricasFiltros,
  MetricasPorAsesor,
  MetricasPorCampania,
  MetricasPorRedSocial,
  RedSocialPorSemaforo,
  ResumenMetricas,
} from "@/tipos/metricas";
import { LEADS_MOCK } from "../leads/leads.api";
import {
  calculateDistribucionSemaforo,
  calculateEmbudoPorEtapa,
  calculateMetricasPorAsesor,
  calculateMetricasPorCampania,
  calculateMetricasPorRedSocial,
  calculateRedSocialPorSemaforo,
  calculateResumenMetricas,
} from "./metricas.utils";

/**
 * Capa de datos del dashboard -- **mock hasta que exista el backend real**
 * (M9, `docs/06-modulos-backend.md`: ninguno de los endpoints
 * `GET /api/v1/metricas/*` está implementado todavía, ni siquiera como
 * esqueleto). Reutiliza el mismo fixture mutable `LEADS_MOCK` que F3/F4
 * (`leads.api.ts`) en vez de duplicarlo, para que el dashboard quede
 * consistente con el listado y el detalle dentro de una misma sesión de la
 * app. La lógica de agregación real vive en `metricas.utils.ts` (pura,
 * testeada con fixtures propios); acá solo se envuelve con el retardo
 * simulado y el fixture compartido, mismo patrón que F3.
 *
 * Todo punto de integración pendiente está marcado con el token
 * `INTEGRACION-BACKEND`.
 */

function delay(ms = 150): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * INTEGRACION-BACKEND: reemplazar por
 * `httpClient.get<ResumenMetricas>("/metricas/resumen", { params: filtros })`
 * cuando exista `GET /api/v1/metricas/resumen` (M9).
 */
export async function fetchResumenMetricasApi(
  filtros: MetricasFiltros,
  contexto?: MetricasContextoRol,
): Promise<ResumenMetricas> {
  await delay();
  return calculateResumenMetricas(LEADS_MOCK, filtros, contexto);
}

/**
 * INTEGRACION-BACKEND: reemplazar por
 * `httpClient.get<MetricasPorRedSocial[]>("/metricas/por-red-social", { params: filtros })`
 * cuando exista (M9).
 */
export async function fetchMetricasPorRedSocialApi(
  filtros: MetricasFiltros,
  contexto?: MetricasContextoRol,
): Promise<MetricasPorRedSocial[]> {
  await delay();
  return calculateMetricasPorRedSocial(LEADS_MOCK, filtros, contexto);
}

/**
 * INTEGRACION-BACKEND: reemplazar por
 * `httpClient.get<MetricasPorAsesor[]>("/metricas/por-asesor", { params: filtros })`
 * cuando exista (M9). Solo administrador/supervisor la consultan
 * (docs/08 §3.2) -- la restricción de visibilidad vive en `DashboardPage.tsx`.
 */
export async function fetchMetricasPorAsesorApi(
  filtros: MetricasFiltros,
  contexto?: MetricasContextoRol,
): Promise<MetricasPorAsesor[]> {
  await delay();
  return calculateMetricasPorAsesor(LEADS_MOCK, filtros, contexto);
}

/**
 * INTEGRACION-BACKEND: reemplazar por
 * `httpClient.get<MetricasEmbudo>("/metricas/embudo", { params: filtros })`
 * cuando exista (M9). El backend documenta también
 * `GET /api/v1/metricas/por-etapa` por separado (docs/06 M9) -- se asume que
 * es el mismo dato que alimenta el embudo (`/embudo` agrega el % de caída
 * sobre el conteo de `/por-etapa`); a validar contra la implementación real
 * antes de conectar.
 */
export async function fetchMetricasPorEtapaApi(
  filtros: MetricasFiltros,
  contexto?: MetricasContextoRol,
): Promise<MetricasEmbudo> {
  await delay();
  return calculateEmbudoPorEtapa(LEADS_MOCK, filtros, contexto);
}

/**
 * INTEGRACION-BACKEND: reemplazar por
 * `httpClient.get<MetricasPorCampania[]>("/metricas/por-campania", { params: filtros })`
 * cuando exista (M9).
 */
export async function fetchMetricasPorCampaniaApi(
  filtros: MetricasFiltros,
  contexto?: MetricasContextoRol,
): Promise<MetricasPorCampania[]> {
  await delay();
  return calculateMetricasPorCampania(LEADS_MOCK, filtros, contexto);
}

/**
 * INTEGRACION-BACKEND: reemplazar por
 * `httpClient.get<RedSocialPorSemaforo[]>("/metricas/red-social-x-semaforo", { params: filtros })`
 * cuando exista (M9).
 */
export async function fetchRedSocialPorSemaforoApi(
  filtros: MetricasFiltros,
  contexto?: MetricasContextoRol,
): Promise<RedSocialPorSemaforo[]> {
  await delay();
  return calculateRedSocialPorSemaforo(LEADS_MOCK, filtros, contexto);
}

/**
 * Distribución por semáforo (docs/08 §3.6). No tiene un endpoint listado
 * aparte en docs/06 M9 -- ninguno de los siete endpoints documentados ahí
 * coincide con esta agregación (que excluye VENTA/NO_VENTA, a diferencia de
 * "red social × semáforo"). Se asume que la implementación real la sirve
 * `GET /api/v1/metricas/resumen` (como parte del resumen) o un endpoint
 * adicional no documentado todavía; a definir con backend antes de M9.
 *
 * INTEGRACION-BACKEND: ver nota arriba -- endpoint real a confirmar.
 */
export async function fetchDistribucionSemaforoApi(
  filtros: MetricasFiltros,
  contexto?: MetricasContextoRol,
): Promise<DistribucionSemaforo[]> {
  await delay();
  return calculateDistribucionSemaforo(LEADS_MOCK, filtros, contexto);
}
