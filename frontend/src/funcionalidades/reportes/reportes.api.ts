import { ApiError, authenticatedFetch, httpClient } from "@/api/httpClient";
import type { ReporteJob, ReporteParametros, TipoReporte } from "@/tipos/reporte";

/**
 * Capa de datos de la exportación de reportes (docs/23 item 15). Contrato
 * verificado contra `backend/src/controllers/reportes/reportes.controller.ts`,
 * `reportes.service.ts`, `reporte.schema.ts` y `event-broker.ts`.
 *
 * Mismo patrón que `conversaciones.api.ts` para los 3 endpoints JSON (una
 * función `async` por endpoint, envoltura `{ job }` desenvuelta acá). La
 * descarga (`descargarReporteApi`) es distinta a propósito: el endpoint real
 * es un stream autenticado (`res.download` del backend), NO una URL firmada
 * -- por eso usa `authenticatedFetch` (que expone la `Response` cruda) en vez
 * de `httpClient` (que siempre asume JSON). Queda aislada en esta única
 * función porque hay un commit futuro sin mergear (`ad64e8b`, no en esta
 * rama) que cambia el mecanismo a una URL firmada de Azure Blob -- el día
 * que eso pase, este es el único punto de cambio.
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

const MENSAJE_ERROR_DESCARGA_GENERICO =
  "Ocurrió un error inesperado. Intentá nuevamente en unos segundos.";
const MENSAJE_ERROR_RED =
  "No se pudo conectar con el servidor. Verificá tu conexión e intentá nuevamente.";

interface CuerpoErrorDescarga {
  code?: string;
  message?: string;
}

function extraerNombreArchivo(headers: Headers, jobId: string, tipo: TipoReporte): string {
  const disposition = headers.get("Content-Disposition") ?? headers.get("content-disposition");
  if (disposition) {
    const coincidencia = /filename="?([^";]+)"?/i.exec(disposition);
    if (coincidencia?.[1]) return coincidencia[1];
  }
  return `reporte-${jobId}.${tipo}`;
}

function guardarBlob(blob: Blob, nombreArchivo: string): void {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombreArchivo;
  enlace.style.display = "none";
  document.body.appendChild(enlace);
  enlace.click();
  window.setTimeout(() => {
    enlace.remove();
    URL.revokeObjectURL(url);
  }, 1000);
}

/**
 * `GET /reportes/jobs/:id/descargar`. Descarga autenticada del archivo ya
 * generado (`estado === "LISTO"`) y dispara el guardado en el navegador vía
 * un `<a>` sintético sobre un `Blob` (mismo mecanismo de limpieza que
 * `exportarDashboard.ts::descargarArchivo`, adaptado a un `Blob` que viene
 * de una `Response` fetch en vez de contenido en memoria).
 *
 * Ante un error HTTP, lanza un `ApiError` con el mensaje accionable del
 * backend (`{ code, message }`, ej. 409 `reporte_no_disponible`, 404
 * `archivo_no_encontrado`) o uno genérico si el cuerpo no es JSON legible --
 * así el `MutationCache` global (`api/queryClient.ts`) ya sabe mostrarlo sin
 * que este módulo dispare su propio toast.
 */
export async function descargarReporteApi(jobId: string, tipo: TipoReporte): Promise<void> {
  let response: Response;
  try {
    response = await authenticatedFetch(`/reportes/jobs/${jobId}/descargar`);
  } catch {
    throw new ApiError("error_red", 0, MENSAJE_ERROR_RED);
  }

  if (!response.ok) {
    let cuerpo: CuerpoErrorDescarga | null = null;
    try {
      cuerpo = (await response.json()) as CuerpoErrorDescarga;
    } catch {
      // Cuerpo no JSON (o vacío) -- se conserva el mensaje genérico.
    }
    throw new ApiError(
      cuerpo?.code ?? "error_desconocido",
      response.status,
      cuerpo?.message ?? MENSAJE_ERROR_DESCARGA_GENERICO,
    );
  }

  const blob = await response.blob();
  const nombreArchivo = extraerNombreArchivo(response.headers, jobId, tipo);
  guardarBlob(blob, nombreArchivo);
}
