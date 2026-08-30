import type { Request, Response } from "express";
import { AppError } from "../../lib/app-error.js";
import { assertAuthenticated } from "../../lib/assert-authenticated.js";
import { generarUrlTemporalReporte } from "../../lib/azure-blob-storage.js";
import { crearReporteJobBodySchema, idParamSchema } from "../../schemas/reportes/reporte.schema.js";
import {
  crearReporteJob,
  obtenerJob,
  obtenerJobActivo,
  obtenerJobParaDescarga,
} from "../../services/reportes/reportes.service.js";

/**
 * reportes (Bloque E): traducción HTTP pura -- mismo patrón que
 * `oportunidad.controller.ts`. Ninguna regla de negocio ni autorización vive
 * en este archivo, todo en `reportes.service.ts`/`reportes.access.ts`.
 */
function zodValidationError(): AppError {
  return new AppError("validacion_invalida", 400, "La petición es inválida");
}

export async function postReporteJob(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);

  const parsedBody = crearReporteJobBodySchema.safeParse(req.body);
  if (!parsedBody.success) throw zodValidationError();

  const { job, creado } = await crearReporteJob(usuario, parsedBody.data);
  res.status(creado ? 201 : 200).json({ job });
}

/** `GET /reportes/jobs/activo` -- resincronización tras recarga de página, sin depender solo del evento SSE en vivo. */
export async function getReporteJobActivo(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);
  const job = await obtenerJobActivo(usuario);
  res.status(200).json({ job });
}

export async function getReporteJobById(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);

  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) throw zodValidationError();

  const job = await obtenerJob(usuario, parsedId.data.id);
  res.status(200).json({ job });
}

/**
 * Descarga vía Azure Blob Storage: el backend ya NO proxea/streamea el
 * archivo él mismo (decisión del usuario, 2026-08-30) -- después de que
 * `obtenerJobParaDescarga` autoriza (dueño del `ReporteJob`), genera una URL
 * firmada (SAS) de solo lectura, vigente unos minutos
 * (`azure-blob-storage.ts::SAS_URL_TTL_MS`), y se la devuelve al cliente. El
 * navegador la consume directo contra Azure -- el backend deja de estar en
 * el camino del archivo en sí, sin necesidad de manejar streaming ni cortes
 * de conexión a mitad de transferencia.
 */
export async function getReporteJobDescarga(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);

  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) throw zodValidationError();

  const job = await obtenerJobParaDescarga(usuario, parsedId.data.id);
  if (!job.archivoUrl) {
    throw new AppError("archivo_no_encontrado", 404, "El archivo del reporte ya no está disponible");
  }

  const url = await generarUrlTemporalReporte(job.archivoUrl);
  res.status(200).json({ url });
}
