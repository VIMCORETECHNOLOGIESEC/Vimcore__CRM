import type { ReporteJob } from "@prisma/client";
import { AppError } from "../../lib/app-error.js";
import { eventBroker } from "../../lib/event-broker.js";
import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";
import { resolverMarcaReporte } from "../../jobs/reportes/reporte-marca.js";
import { construirNombreArchivoReporte } from "../../jobs/reportes/reporte-nombre-archivo.js";
import * as reporteJobRepository from "../../repositories/reportes/reporte-job.repository.js";
import type { CrearReporteJobBody } from "../../schemas/reportes/reporte.schema.js";
import type { AuthenticatedUser } from "../../types/authenticated-user.js";
import { comoJson, serializarParametros, type ParametrosReportePersistidos } from "./reporte-parametros.js";
import { puedeGenerarReportes, resolverEmpresaIdReporte } from "./reportes.access.js";

/**
 * reportes (Bloque E, docs/blocks/e-dashboards.md "Exportación PDF/XLSX").
 *
 * NUNCA importa `services/metricas.service.ts` directo -- otro batch lo está
 * editando en paralelo AHORA MISMO (extensiones de dashboard E1-E5). La
 * agregación real vive en `jobs/reportes/reporte-generacion.job.ts`, que sí
 * la reusa (docs, "Alcance": "reutilizando metricas.service.ts, nunca
 * duplicando lógica de agregación") -- pero ese import ocurre en un módulo
 * separado, cargado dinámicamente (ver `crearReporteJob` abajo) para que este
 * archivo de servicio HTTP-facing no dependa en absoluto del archivo en
 * edición paralela, ni siquiera transitivamente al momento de compilar.
 */
export interface CrearReporteJobResultado {
  job: ReporteJob;
  /** `false` cuando el bloqueo de generación duplicada devolvió un job ya existente -- el controller usa esto para responder 200 en vez de 201. */
  creado: boolean;
}

export async function crearReporteJob(
  usuario: AuthenticatedUser,
  body: CrearReporteJobBody,
): Promise<CrearReporteJobResultado> {
  if (!puedeGenerarReportes(usuario)) {
    throw new AppError("permiso_denegado", 403, "No tienes permiso para generar reportes");
  }

  const empresaIdResuelto = await resolverEmpresaIdReporte(usuario, body.parametros.empresaId, prisma);

  // El valor resuelto reemplaza SIEMPRE al recibido del cliente -- nunca se
  // persiste `parametros.empresaId` sin pasar por `resolverEmpresaIdReporte`,
  // ni siquiera cuando por casualidad coincide (docs/blocks/e-dashboards.md,
  // "nunca desde parametros (JSON) enviado por el cliente").
  const parametrosCanonicos = serializarParametros(body.parametros, empresaIdResuelto);
  const parametrosJson = comoJson(parametrosCanonicos);

  const existente = await reporteJobRepository.findActivoDuplicado(usuario.id, body.tipo, parametrosJson);
  if (existente) {
    return { job: existente, creado: false };
  }

  const job = await reporteJobRepository.create({
    usuarioId: usuario.id,
    tipo: body.tipo,
    parametros: parametrosJson,
  });

  eventBroker.publish(usuario.id, "reporte.iniciado", { jobId: job.id, tipo: job.tipo }, usuario.empresaId);

  // Fire-and-forget deliberado (doc, "la generación es asincrónica desde el
  // diseño"): la generación real (Puppeteer/exceljs) corre fuera del ciclo de
  // request/response, nunca como un `await` bloqueante de este servicio. El
  // `.catch` es la única red de seguridad -- cualquier fallo AL DISPARAR el
  // job (no durante su ejecución, que ya maneja sus propios estados
  // PROCESANDO/LISTO/ERROR) queda logueado, nunca como un rechazo de promesa
  // no controlado.
  void import("../../jobs/reportes/reporte-generacion.job.js")
    .then((mod) => mod.procesarReporteJob(job.id))
    .catch((err: unknown) => {
      logger.error(
        {
          err,
          jobId: job.id,
          ...(usuario.empresaId === null ? { holdingWide: true } : { empresaId: usuario.empresaId }),
        },
        "reportes: fallo al disparar la generación en background",
      );
    });

  return { job, creado: true };
}

/** `GET /reportes/jobs/activo` (endpoint de resincronización, docs/blocks/e-dashboards.md). */
export async function obtenerJobActivo(usuario: AuthenticatedUser): Promise<ReporteJob | null> {
  return reporteJobRepository.findActivoPorUsuario(usuario.id);
}

/**
 * Titularidad, no empresa: `ReporteJob` no tiene `empresaId` propio (ver
 * comentario del modelo en schema.prisma) -- el único chequeo de acceso
 * posible/necesario acá es que el job pertenezca al usuario autenticado.
 */
export async function obtenerJob(usuario: AuthenticatedUser, id: string): Promise<ReporteJob> {
  const job = await reporteJobRepository.findById(id);
  if (!job) throw new AppError("reporte_no_encontrado", 404, "El reporte no existe");
  if (job.usuarioId !== usuario.id) {
    throw new AppError("permiso_denegado", 403, "No tienes acceso a este reporte");
  }
  return job;
}

/** `GET /reportes/jobs/:id/descargar` -- misma titularidad que `obtenerJob`, más el gate de estado LISTO. */
export async function obtenerJobParaDescarga(usuario: AuthenticatedUser, id: string): Promise<ReporteJob> {
  const job = await obtenerJob(usuario, id);
  if (job.estado !== "LISTO" || !job.archivoUrl) {
    throw new AppError("reporte_no_disponible", 409, "El reporte todavía no está listo para descargar");
  }
  return job;
}

/**
 * Nombre de archivo legible para `GET /reportes/jobs/:id/descargar` --
 * distinto del nombre del BLOB en Azure (un uuid opaco, ver
 * `lib/azure-blob-storage.ts::uploadReporteArchivo`). Importa
 * `jobs/reportes/reporte-marca.ts` de forma estática y segura: ese módulo
 * solo depende de `repositories/empresa.repository.ts` y
 * `services/configuracion-empresa.service.ts`, nunca de
 * `services/metricas.service.ts` (ni siquiera transitivamente) -- el
 * aislamiento de import dinámico que documenta el docblock de arriba es
 * específico de `jobs/reportes/reporte-generacion.job.ts` (el módulo que sí
 * ejecuta la agregación real vía `metricas.service.ts`), no aplica acá.
 *
 * `job.tipo` es `String` en el schema de Prisma (comentario `"pdf" | "xlsx"`,
 * no un enum real) -- se normaliza defensivamente a `"xlsx"` solo con match
 * exacto, cualquier otro valor cae a `"pdf"`.
 */
export async function obtenerNombreArchivoReporte(job: ReporteJob): Promise<string> {
  const parametros = job.parametros as unknown as ParametrosReportePersistidos;
  const marca = await resolverMarcaReporte(parametros.empresaId ?? null);
  const extension: "pdf" | "xlsx" = job.tipo === "xlsx" ? "xlsx" : "pdf";
  return construirNombreArchivoReporte(marca.nombre, job.finalizadoEn ?? job.creadoEn, extension);
}
