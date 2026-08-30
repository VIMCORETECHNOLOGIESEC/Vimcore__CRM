import path from "node:path";
import type { NextFunction, Request, Response } from "express";
import { env } from "../../config/env.js";
import { AppError } from "../../lib/app-error.js";
import { assertAuthenticated } from "../../lib/assert-authenticated.js";
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
 * `res.download` usa un callback (no una promesa) para reportar errores de
 * streaming (p. ej. el archivo fue barrido del disco efímero del contenedor
 * aunque el estado en BD siga en `LISTO`) -- por eso este único controller de
 * este módulo recibe `next` explícito, en vez de dejar que el rechazo de una
 * promesa llegue solo al `errorHandler` (Express 5 sí reenvía promesas
 * rechazadas automáticamente, pero el callback de `res.download` NO es una
 * promesa).
 */
export async function getReporteJobDescarga(req: Request, res: Response, next: NextFunction): Promise<void> {
  const usuario = assertAuthenticated(req);

  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) throw zodValidationError();

  const job = await obtenerJobParaDescarga(usuario, parsedId.data.id);
  const extension = job.tipo === "pdf" ? "pdf" : "xlsx";
  const rutaArchivo = path.join(env.REPORTES_STORAGE_DIR, `${job.id}.${extension}`);

  res.download(rutaArchivo, `reporte-${job.id}.${extension}`, (err) => {
    if (!err || res.headersSent) return;
    next(new AppError("archivo_no_encontrado", 404, "El archivo del reporte ya no está disponible"));
  });
}
