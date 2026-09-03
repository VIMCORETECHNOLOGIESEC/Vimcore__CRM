import { AppError } from "../../lib/app-error.js";
import { PDF_MIME_TYPE, uploadReporteArchivo, XLSX_MIME_TYPE } from "../../lib/azure-blob-storage.js";
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
import { resolverMarcaReporte } from "./reporte-marca.js";
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
      generarArchivo(job.tipo, usuarioView, aMetricasQuery(parametros)),
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
  tipo: string,
  usuarioView: UsuarioAcceso,
  query: ReturnType<typeof aMetricasQuery>,
): Promise<string> {
  const [resumen, embudo, porCampania, rendimientoCampanias, porAsesor, marca] = await Promise.all([
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
    // pdfmake-migracion: `Empresa`/`ConfiguracionEmpresa` no tienen RLS
    // (mismo comentario que en `empresa.repository.ts::findById`), así que
    // resolver esto en paralelo con las 5 llamadas de métricas no tiene
    // ningún problema de tenant-context.
    resolverMarcaReporte(usuarioView.empresaId),
  ]);

  const datos: DatosReporte = {
    empresaId: usuarioView.empresaId,
    resumen,
    embudo,
    porCampania,
    rendimientoCampanias,
    porAsesor,
    marca,
  };

  const buffer = tipo === "pdf" ? await generarPdfReporte(datos) : await generarXlsxReporte(datos);
  const mimeType = tipo === "pdf" ? PDF_MIME_TYPE : XLSX_MIME_TYPE;

  // `ReporteJob.archivoUrl` guarda el NOMBRE del blob en el contenedor
  // privado de Azure Blob Storage (`AZURE_STORAGE_CONTAINER_REPORTES`), NO
  // una ruta de disco local ni una URL pública -- cambio de significado
  // deliberado respecto de la versión anterior de este campo (que apuntaba a
  // `storage/reportes/<jobId>.<ext>` en disco local, invisible entre réplicas
  // al escalar Azure Container Apps horizontalmente). `GET
  // /reportes/jobs/:id/descargar` (`reportes.controller.ts`) usa este valor
  // para descargar el blob del lado del servidor con sus propias
  // credenciales y streamearlo de vuelta al cliente ya autorizado.
  return uploadReporteArchivo({ buffer, mimeType });
}
