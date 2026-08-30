import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { MetricasFiltros } from "@/tipos/metricas";
import { useAuth } from "@/funcionalidades/autenticacion/authContext";
import {
  fetchMetricasCascadaLeadOportunidadApi,
  fetchMetricasEmbudoApi,
  fetchMetricasEmbudoOportunidadApi,
  fetchMetricasPorAsesorApi,
  fetchMetricasPorCampaniaApi,
  fetchMetricasPorEtapaApi,
  fetchMetricasPorProductoApi,
  fetchMetricasPorRedSocialApi,
  fetchMetricasRankingProductosPorEmpresaApi,
  fetchRedSocialPorSemaforoApi,
  fetchResumenMetricasApi,
} from "./metricas.api";

const METRICAS_QUERY_KEY = "metricas";

/**
 * Un hook por cada fetch de `metricas.api.ts` (F5), mismo patrón que
 * `useLeads.ts` en F3: la key de cada query incluye filtros + usuario, para
 * que cambiar de sesión nunca sirva datos cacheados de otro usuario.
 * `keepPreviousData` evita el parpadeo a "cargando" al mover el rango de
 * fechas o los filtros combinados.
 *
 * A diferencia del mock anterior, ninguna función de `metricas.api.ts`
 * recibe `contexto`/rol -- el backend real resuelve el alcance por rol desde
 * el JWT (`assertAuthenticated`), igual criterio que `useLeads.ts`/
 * `useNotificaciones.ts` ya integrados.
 */
export function useResumenMetricas(filtros: MetricasFiltros) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [METRICAS_QUERY_KEY, "resumen", filtros, user?.id],
    queryFn: () => fetchResumenMetricasApi(filtros),
    placeholderData: keepPreviousData,
  });
}

export function useMetricasPorRedSocial(filtros: MetricasFiltros) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [METRICAS_QUERY_KEY, "por-red-social", filtros, user?.id],
    queryFn: () => fetchMetricasPorRedSocialApi(filtros),
    placeholderData: keepPreviousData,
  });
}

/**
 * `enabled` deja la query sin disparar cuando el rol no debe ver esta
 * gráfica (docs/08 §3.2, "visible solo para administrador y supervisor") --
 * el backend real además responde 403 si un asesor/vendedor la pide
 * directamente (`metricas.service.ts::getPorAsesor`), esto evita esa llamada
 * innecesaria.
 */
export function useMetricasPorAsesor(filtros: MetricasFiltros, habilitado: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [METRICAS_QUERY_KEY, "por-asesor", filtros, user?.id],
    queryFn: () => fetchMetricasPorAsesorApi(filtros),
    placeholderData: keepPreviousData,
    enabled: habilitado,
  });
}

/** Conteo plano por etapa (`/metricas/por-etapa`) -- sin uso en `DashboardPage.tsx` hoy, ver nota en `metricas.api.ts`. */
export function useMetricasPorEtapa(filtros: MetricasFiltros) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [METRICAS_QUERY_KEY, "por-etapa", filtros, user?.id],
    queryFn: () => fetchMetricasPorEtapaApi(filtros),
    placeholderData: keepPreviousData,
  });
}

/** Embudo real (`/metricas/embudo`, docs/08 §3.3) -- el que alimenta `GraficoEmbudo.tsx`. */
export function useMetricasEmbudo(filtros: MetricasFiltros) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [METRICAS_QUERY_KEY, "embudo", filtros, user?.id],
    queryFn: () => fetchMetricasEmbudoApi(filtros),
    placeholderData: keepPreviousData,
  });
}

export function useMetricasPorCampania(filtros: MetricasFiltros) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [METRICAS_QUERY_KEY, "por-campania", filtros, user?.id],
    queryFn: () => fetchMetricasPorCampaniaApi(filtros),
    placeholderData: keepPreviousData,
  });
}

export function useRedSocialPorSemaforo(filtros: MetricasFiltros) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [METRICAS_QUERY_KEY, "red-social-x-semaforo", filtros, user?.id],
    queryFn: () => fetchRedSocialPorSemaforoApi(filtros),
    placeholderData: keepPreviousData,
  });
}

/**
 * Embudo de Oportunidad (`/metricas/embudo-oportunidad`, docs/23 item 13) --
 * alimenta `GraficoEmbudoOportunidad.tsx`. Sin `enabled`: el endpoint no
 * tiene `requireRole` propio, igual criterio que el resto de este archivo
 * (nunca `/metricas/por-asesor`, ese es el único caso con 403 real).
 */
export function useMetricasEmbudoOportunidad(filtros: MetricasFiltros) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [METRICAS_QUERY_KEY, "embudo-oportunidad", filtros, user?.id],
    queryFn: () => fetchMetricasEmbudoOportunidadApi(filtros),
    placeholderData: keepPreviousData,
  });
}

/** Ranking global por producto (`/metricas/por-producto`, docs/23 item 13) -- alimenta `GraficoPorProducto.tsx`. */
export function useMetricasPorProducto(filtros: MetricasFiltros) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [METRICAS_QUERY_KEY, "por-producto", filtros, user?.id],
    queryFn: () => fetchMetricasPorProductoApi(filtros),
    placeholderData: keepPreviousData,
  });
}

/** Cascada Lead → Oportunidad (`/metricas/cascada-lead-oportunidad`, docs/23 item 13) -- alimenta `CascadaLeadOportunidad.tsx`. */
export function useMetricasCascadaLeadOportunidad(filtros: MetricasFiltros) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [METRICAS_QUERY_KEY, "cascada-lead-oportunidad", filtros, user?.id],
    queryFn: () => fetchMetricasCascadaLeadOportunidadApi(filtros),
    placeholderData: keepPreviousData,
  });
}

/**
 * Ranking de productos por empresa (`/metricas/ranking-productos-por-empresa`,
 * docs/23 item 13) -- alimenta `GraficoRankingProductosPorEmpresa.tsx`. Igual
 * que las otras 3 de este bloque, sin `enabled`: el endpoint no restringe por
 * rol; el aviso de la limitación conocida por scope de sesión (E5) lo decide
 * el propio componente de gráfico, no este hook.
 */
export function useMetricasRankingProductosPorEmpresa(filtros: MetricasFiltros) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [METRICAS_QUERY_KEY, "ranking-productos-por-empresa", filtros, user?.id],
    queryFn: () => fetchMetricasRankingProductosPorEmpresaApi(filtros),
    placeholderData: keepPreviousData,
  });
}
