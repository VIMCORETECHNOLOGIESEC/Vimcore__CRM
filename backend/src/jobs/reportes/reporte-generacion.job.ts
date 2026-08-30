import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { AppError } from "../../lib/app-error.js";
import { env } from "../../config/env.js";
import { eventBroker } from "../../lib/event-broker.js";
import { logger } from "../../lib/logger.js";
import { runWithTenantContext } from "../../lib/prisma.js";
import * as reporteJobRepository from "../../repositories/reportes/reporte-job.repository.js";
import * as usuarioRepository from "../../repositories/usuario.repository.js";
import type { UsuarioAcceso } from "../../services/leads.access.js";
import { getEmbudo, getPorAsesor, getPorCampania, getRendimientoCampanias, getResumen } from "../../services/metricas.service.js";
import type { ParametrosReportePersistidos } from "../../services/reportes/reporte-parametros.js";
import { aMetricasQuery } from "../../services/reportes/reporte-parametros.js";
import { generarPdfReporte } from "./pdf-reporte.js";
import type { DatosReporte } from "./tipos.js";
import { generarXlsxReporte } from "./xlsx-reporte.js";

/**
 * reportes (Bloque E, docs/blocks/e-dashboards.md "Exportación PDF/XLSX"):
 * worker en background -- disparado (fire-and-forget) por
 * `reportes.service.ts::crearReporteJob` vía import dinámico, NUNCA
 * `await`ado por el ciclo de request/response.
 *
 * GOTCHA no obvio (documentado para el próximo que toque este archivo): este
 * código corre FUERA de cualquier request HTTP, así que
 * `currentTenantContext()` (`lib/tenant-context.ts`) está `undefined` salvo
 * que se fije explícitamente acá. `metricas.service.ts` lee/escribe `Lead` vía
 * el cliente `prisma` extendido de `lib/prisma.ts`, cuya extensión
 * `$allOperations` SOLO aplica los GUCs de tenant (`app.tenant_empresa_id`/
 * `app.tenant_unrestricted`) dentro de un `TenantContext` activo -- sin él,
 * las políticas RLS de Postgres (`FORCE ROW LEVEL SECURITY` sobre `leads`)
 * fallan CERRADO: no lanzan error, simplemente no devuelven ninguna fila. Sin
 * el `runWithTenantContext(...)` de abajo, un reporte "generado" con éxito
 * mostraría 0 en absolutamente todo, en silencio.
 *
 * Este job NO usa `runAsBypassJob` (D1, `lib/prisma.ts`): ese seam está
 * reservado a los 7 jobs ya enumerados en `BYPASS_JOB_ALLOWLIST` -- agregar
 * un octavo entrante sin que el negocio lo pida sería reabrir una decisión de
 * arquitectura ya cerrada (Bloque C, D1/D8) fuera del alcance de este batch.
 * `runWithTenantContext({ empresaId })` es la alternativa correcta y ya
 * establecida: `empresaId` acá es SIEMPRE el valor que
 * `reportes.access.ts::resolverEmpresaIdReporte` ya validó (contra una
 * `Membresia` activa real, o `null` legítimamente holding-wide) en el
 * request HTTP que creó este job -- exactamente el mismo criterio que
 * `require-authentication.middleware.ts` aplica en cada request real, solo
 * que replicado acá porque este código corre después, fuera de ese ciclo.
 */
export async function procesarReporteJob(jobId: string): Promise<void> {
  const job = await reporteJobRepository.findById(jobId);
  if (!job) {
    logger.error({ jobId, holdingWide: true }, "reportes: job no encontrado al iniciar el procesamiento");
    return;
  }

  const usuario = await usuarioRepository.findById(job.usuarioId);
  if (!usuario) {
    await reporteJobRepository.marcarError(job.id, "El usuario solicitante ya no existe");
    eventBroker.publish(job.usuarioId, "reporte.error", { jobId: job.id, error: "usuario_no_encontrado" }, null);
    return;
  }

  const parametros = job.parametros as unknown as ParametrosReportePersistidos;
  const empresaId = parametros.empresaId ?? null;
  const logScope = empresaId === null ? { holdingWide: true } : { empresaId };

  await reporteJobRepository.marcarProcesando(job.id);

  try {
    const usuarioView: UsuarioAcceso = { id: job.usuarioId, rol: usuario.rol, empresaId };
    const archivoUrl = await runWithTenantContext({ empresaId }, () =>
      generarArchivo(job.id, job.tipo, usuarioView, aMetricasQuery(parametros)),
    );

    await reporteJobRepository.marcarListo(job.id, archivoUrl);
    eventBroker.publish(job.usuarioId, "reporte.listo", { jobId: job.id, archivoUrl }, empresaId);
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error desconocido al generar el reporte";
    logger.error({ err, jobId: job.id, ...logScope }, "reportes: fallo la generación del reporte");
    await reporteJobRepository.marcarError(job.id, mensaje);
    eventBroker.publish(job.usuarioId, "reporte.error", { jobId: job.id, error: mensaje }, empresaId);
  }
}

async function generarArchivo(
  jobId: string,
  tipo: string,
  usuarioView: UsuarioAcceso,
  query: ReturnType<typeof aMetricasQuery>,
): Promise<string> {
  const [resumen, embudo, porCampania, rendimientoCampanias, porAsesor] = await Promise.all([
    getResumen(usuarioView, query),
    getEmbudo(usuarioView, query),
    getPorCampania(usuarioView, query),
    getRendimientoCampanias(usuarioView, query),
    // D6 ("solo administrador y supervisor pueden consultar esta gráfica"):
    // se degrada a `null` (sección omitida en el render) en vez de fallar todo
    // el reporte cuando el rol no puede ver métricas por asesor.
    getPorAsesor(usuarioView, query).catch((err: unknown) => {
      if (err instanceof AppError && err.statusHttp === 403) return null;
      throw err;
    }),
  ]);

  const datos: DatosReporte = { empresaId: usuarioView.empresaId, resumen, embudo, porCampania, rendimientoCampanias, porAsesor };

  const buffer = tipo === "pdf" ? await generarPdfReporte(datos) : await generarXlsxReporte(datos);
  const extension = tipo === "pdf" ? "pdf" : "xlsx";

  await mkdir(env.REPORTES_STORAGE_DIR, { recursive: true });
  const rutaArchivo = path.join(env.REPORTES_STORAGE_DIR, `${jobId}.${extension}`);
  await writeFile(rutaArchivo, buffer);

  return `/api/v1/reportes/jobs/${jobId}/descargar`;
}
