import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/funcionalidades/autenticacion/auth-context";
import type { ReporteJob, ReporteParametros, TipoReporte } from "@/tipos/reporte";
import {
  crearReporteJobApi,
  descargarReporteApi,
  fetchReporteJobActivoApi,
  fetchReporteJobApi,
} from "./reportes.api";

/**
 * Hooks de TanStack Query de la bandeja de reportes (docs/23 item 15).
 *
 * Diseño de estado (deliberado, no inferido de un solo endpoint):
 * `GET /reportes/jobs/activo` solo sirve para el resync inicial al montar la
 * página (deja de devolver el job apenas sale de PENDIENTE/PROCESANDO), así
 * que el seguimiento en vivo de un job puntual SIEMPRE pasa por
 * `useReporteJob(jobIdActivo)` (`GET /reportes/jobs/:id`), refrescado por la
 * invalidación SSE ya cableada en `useNotificacionesRealtime.ts`
 * (`["reportes", jobId]`) -- nunca por polling, no hay precedente de polling
 * en este código base (whatsapp/notificaciones usan el mismo patrón
 * invalidación-por-SSE).
 *
 * Contrato de query key (fijado con `useNotificacionesRealtime.ts`):
 * `["reportes", jobId, user?.id]` para que la invalidación por prefijo
 * `["reportes", jobId]` la alcance.
 */
export const REPORTES_QUERY_KEY = "reportes";

/** Resync inicial (`GET /reportes/jobs/activo`) -- ver nota de diseño arriba. */
export function useReporteJobActivo() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [REPORTES_QUERY_KEY, "activo", user?.id],
    queryFn: () => fetchReporteJobActivoApi(),
  });
}

/**
 * Fuente de verdad del job rastreado (`GET /reportes/jobs/:id`), incluso
 * después de LISTO/ERROR. `enabled: false` mientras no hay un `jobId` que
 * rastrear (antes del resync inicial o antes de crear un job nuevo).
 */
export function useReporteJob(jobId: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [REPORTES_QUERY_KEY, jobId, user?.id],
    queryFn: () => fetchReporteJobApi(jobId as string),
    enabled: jobId !== null,
  });
}

export interface CrearReporteJobVariables {
  tipo: TipoReporte;
  parametros: ReporteParametros;
}

/**
 * `POST /reportes/jobs`. El backend responde la misma forma `{ job }` tanto
 * si crea un job nuevo (201) como si ya había uno idéntico activo (200) --
 * en ambos casos se siembra la caché de `useReporteJob(job.id)` con el job
 * recién obtenido para que la UI lo muestre de inmediato, sin esperar un
 * primer fetch.
 */
export function useCrearReporteJob() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: ({ tipo, parametros }: CrearReporteJobVariables) => crearReporteJobApi(tipo, parametros),
    onSuccess: (job: ReporteJob) => {
      queryClient.setQueryData([REPORTES_QUERY_KEY, job.id, user?.id], job);
    },
  });
}

export interface DescargarReporteVariables {
  jobId: string;
  tipo: TipoReporte;
}

/**
 * Descarga autenticada del archivo (`GET /reportes/jobs/:id/descargar`).
 * Sin `onError` propio: `descargarReporteApi` lanza un `ApiError` con el
 * mensaje accionable del backend, y el `MutationCache` global
 * (`api/queryClient.ts`) ya muestra ese mensaje vía toast -- mismo criterio
 * que el resto de mutaciones de este código base.
 */
export function useDescargarReporte() {
  return useMutation({
    mutationFn: ({ jobId, tipo }: DescargarReporteVariables) => descargarReporteApi(jobId, tipo),
  });
}
