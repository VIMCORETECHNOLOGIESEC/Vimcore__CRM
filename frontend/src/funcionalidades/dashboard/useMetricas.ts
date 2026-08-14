import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { MetricasFiltros } from "@/tipos/metricas";
import { useAuth } from "@/funcionalidades/autenticacion/AuthContext";
import {
  fetchDistribucionSemaforoApi,
  fetchMetricasPorAsesorApi,
  fetchMetricasPorCampaniaApi,
  fetchMetricasPorEtapaApi,
  fetchMetricasPorRedSocialApi,
  fetchRedSocialPorSemaforoApi,
  fetchResumenMetricasApi,
} from "./metricas.api";

const METRICAS_QUERY_KEY = "metricas";

/**
 * Un hook por cada fetch de `metricas.api.ts` (F5), mismo patrón que
 * `useLeads.ts` en F3: la key de cada query incluye filtros + usuario + rol,
 * para que cambiar de sesión o de alcance nunca sirva datos cacheados de
 * otro usuario. `keepPreviousData` evita el parpadeo a "cargando" al mover
 * el rango de fechas o los filtros combinados.
 */
export function useResumenMetricas(filtros: MetricasFiltros) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [METRICAS_QUERY_KEY, "resumen", filtros, user?.id, user?.rol],
    queryFn: () =>
      fetchResumenMetricasApi(filtros, user ? { rol: user.rol, usuarioId: user.id } : undefined),
    placeholderData: keepPreviousData,
  });
}

export function useMetricasPorRedSocial(filtros: MetricasFiltros) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [METRICAS_QUERY_KEY, "por-red-social", filtros, user?.id, user?.rol],
    queryFn: () =>
      fetchMetricasPorRedSocialApi(filtros, user ? { rol: user.rol, usuarioId: user.id } : undefined),
    placeholderData: keepPreviousData,
  });
}

/**
 * `enabled` deja la query sin disparar cuando el rol no debe ver esta
 * gráfica (docs/08 §3.2, "visible solo para administrador y supervisor") --
 * la restricción de UI la aplica igual `DashboardPage.tsx` no renderizando
 * el gráfico, esto además evita la llamada de red innecesaria.
 */
export function useMetricasPorAsesor(filtros: MetricasFiltros, habilitado: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [METRICAS_QUERY_KEY, "por-asesor", filtros, user?.id, user?.rol],
    queryFn: () =>
      fetchMetricasPorAsesorApi(filtros, user ? { rol: user.rol, usuarioId: user.id } : undefined),
    placeholderData: keepPreviousData,
    enabled: habilitado,
  });
}

export function useMetricasPorEtapa(filtros: MetricasFiltros) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [METRICAS_QUERY_KEY, "por-etapa", filtros, user?.id, user?.rol],
    queryFn: () =>
      fetchMetricasPorEtapaApi(filtros, user ? { rol: user.rol, usuarioId: user.id } : undefined),
    placeholderData: keepPreviousData,
  });
}

export function useMetricasPorCampania(filtros: MetricasFiltros) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [METRICAS_QUERY_KEY, "por-campania", filtros, user?.id, user?.rol],
    queryFn: () =>
      fetchMetricasPorCampaniaApi(filtros, user ? { rol: user.rol, usuarioId: user.id } : undefined),
    placeholderData: keepPreviousData,
  });
}

export function useRedSocialPorSemaforo(filtros: MetricasFiltros) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [METRICAS_QUERY_KEY, "red-social-x-semaforo", filtros, user?.id, user?.rol],
    queryFn: () =>
      fetchRedSocialPorSemaforoApi(filtros, user ? { rol: user.rol, usuarioId: user.id } : undefined),
    placeholderData: keepPreviousData,
  });
}

export function useDistribucionSemaforo(filtros: MetricasFiltros) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [METRICAS_QUERY_KEY, "distribucion-semaforo", filtros, user?.id, user?.rol],
    queryFn: () =>
      fetchDistribucionSemaforoApi(filtros, user ? { rol: user.rol, usuarioId: user.id } : undefined),
    placeholderData: keepPreviousData,
  });
}
