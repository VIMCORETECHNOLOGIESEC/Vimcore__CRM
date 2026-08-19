import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { MetricasFiltros } from "@/tipos/metricas";
import { useAuth } from "@/funcionalidades/autenticacion/AuthContext";
import {
  fetchMetricasEmbudoApi,
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
