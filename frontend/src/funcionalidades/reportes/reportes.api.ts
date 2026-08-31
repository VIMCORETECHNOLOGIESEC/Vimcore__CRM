import { httpClient } from "@/api/httpClient";
import type { ReporteJob, ReporteParametros, TipoReporte } from "@/tipos/reporte";

/**
 * Capa de datos de la exportación de reportes (docs/23 item 15). Contrato
 * verificado contra `backend/src/controllers/reportes/reportes.controller.ts`,
 * `reportes.service.ts`, `reporte.schema.ts` y `event-broker.ts`.
 *
 * Mismo patrón que `conversaciones.api.ts` para los 3 endpoints JSON (una
 * función `async` por endpoint, envoltura `{ job }` desenvuelta acá). La
 * descarga (`descargarReporteApi`) YA es una URL firmada de Azure Blob
 * Storage, no un stream autenticado del backend: `getReporteJobDescarga`
 * (`reportes.controller.ts:59-72`, desplegado 2026-08-30) dejó de proxear/
 * streamear el archivo -- ahora responde `{ url }` (una SAS de solo
 * lectura, vigente unos minutos) vía JSON normal. Por eso esta función usa
 * `httpClient.get` (como el resto de este archivo) y no
 * `authenticatedFetch`/`.blob()`: la URL SAS no necesita `Authorization`
 * (es Azure Blob Storage directo, no el backend) y el navegador la consume
 * navegando a ella, mismo patrón que
 * `whatsapp.utils.ts::redirectTo` (`window.location.assign`, envuelto en su
 * propia función para poder mockearlo en tests sin pelear con la navegación
 * real de jsdom).
 */

interface CrearReporteJobResponse {
  job: ReporteJob;
}

interface ReporteJobActivoResponse {
  job: ReporteJob | null;
}

interface ReporteJobResponse {
  job: ReporteJob;
}

/**
 * `POST /reportes/jobs`. El backend responde 201 (job nuevo) o 200 (ya había
 * un job idéntico activo) con la MISMA forma `{ job }` -- el llamador trata
 * ambos casos igual, no hay necesidad de distinguir el status acá.
 */
export async function crearReporteJobApi(
  tipo: TipoReporte,
  parametros: ReporteParametros,
): Promise<ReporteJob> {
  const { job } = await httpClient.post<CrearReporteJobResponse>("/reportes/jobs", {
    tipo,
    parametros,
  });
  return job;
}

/**
 * `GET /reportes/jobs/activo`. Siempre 200; `job` es `null` (no 404) cuando
 * el usuario actual no tiene ningún job `PENDIENTE`/`PROCESANDO`. Se usa
 * solo para el resync inicial al montar la página -- una vez identificado el
 * `id`, el seguimiento en vivo pasa a `fetchReporteJobApi`.
 */
export async function fetchReporteJobActivoApi(): Promise<ReporteJob | null> {
  const { job } = await httpClient.get<ReporteJobActivoResponse>("/reportes/jobs/activo");
  return job;
}

/**
 * `GET /reportes/jobs/:id`. Fuente de verdad del job rastreado, incluso
 * luego de llegar a `LISTO`/`ERROR` (a diferencia de `/activo`, que deja de
 * devolverlo apenas sale de `PENDIENTE`/`PROCESANDO`). Errores: 404
 * `reporte_no_encontrado`, 403 `permiso_denegado` (job de otro usuario).
 */
export async function fetchReporteJobApi(id: string): Promise<ReporteJob> {
  const { job } = await httpClient.get<ReporteJobResponse>(`/reportes/jobs/${id}`);
  return job;
}

interface DescargaReporteResponse {
  url: string;
}

/**
 * Dispara la navegación real del navegador hacia la URL SAS -- envuelto en
 * su propia función (igual que `whatsapp.utils.ts::redirectTo`) para poder
 * mockearla en tests sin pelear con la navegación real de jsdom.
 */
export function redirigirADescarga(url: string): void {
  window.location.assign(url);
}

/**
 * `GET /reportes/jobs/:id/descargar`. Pide la URL SAS del archivo ya
 * generado (`estado === "LISTO"`) vía JSON normal (`httpClient.get`, no
 * `authenticatedFetch`/`.blob()` -- ver docblock del módulo) y navega el
 * navegador directo a ella. `httpClient.get` ya mapea cualquier error HTTP a
 * un `ApiError` con el mensaje accionable del backend (409
 * `reporte_no_disponible`, 404 `archivo_no_encontrado`) o de red, y el
 * `MutationCache` global (`api/queryClient.ts`) ya sabe mostrarlo sin que
 * este módulo dispare su propio toast.
 *
 * `tipo` no se usa acá (era solo para nombrar el archivo del `Blob` en el
 * mecanismo viejo) -- se conserva en la firma para no tocar
 * `useReportes.ts::useDescargarReporte`/`DescargarReporteButton.tsx`, que
 * siguen pasando `job.tipo`.
 */
export async function descargarReporteApi(jobId: string, _tipo: TipoReporte): Promise<void> {
  const { url } = await httpClient.get<DescargaReporteResponse>(`/reportes/jobs/${jobId}/descargar`);
  redirigirADescarga(url);
}
