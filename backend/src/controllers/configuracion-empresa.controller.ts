import type { Request, Response } from "express";
import { AppError } from "../lib/app-error.js";
import { updateConfiguracionEmpresaBodySchema } from "../schemas/configuracion-empresa.schema.js";
import {
  getConfiguracion,
  updateConfiguracion,
  uploadLogo,
} from "../services/configuracion-empresa.service.js";

function zodValidationError(): AppError {
  return new AppError("validacion_invalida", 400, "El cuerpo de la petición es inválido");
}

function archivoFaltante(): AppError {
  return new AppError(
    "archivo_faltante",
    400,
    "Debes adjuntar un archivo de imagen en el campo 'logo'",
  );
}

export async function getConfiguracionEmpresa(_req: Request, res: Response): Promise<void> {
  const configuracion = await getConfiguracion();
  res.status(200).json(configuracion);
}

export async function patchConfiguracionEmpresa(req: Request, res: Response): Promise<void> {
  const parsed = updateConfiguracionEmpresaBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw zodValidationError();
  }

  const configuracion = await updateConfiguracion(parsed.data);
  res.status(200).json(configuracion);
}

/**
 * `POST /configuracion-empresa/logo`: exclusivo ADMINISTRADOR (`requireRole`
 * en la ruta), mismo criterio que `PATCH /configuracion-empresa` -- sin
 * distinción de `sessionScope` (fila singleton de holding). `req.file` lo
 * puebla `uploadLogoMiddleware` (Multer, `memoryStorage`) antes de llegar
 * acá.
 */
export async function postConfiguracionEmpresaLogo(req: Request, res: Response): Promise<void> {
  if (!req.file) {
    throw archivoFaltante();
  }

  const configuracion = await uploadLogo({
    buffer: req.file.buffer,
    mimeType: req.file.mimetype,
    sizeBytes: req.file.size,
  });
  res.status(200).json(configuracion);
}
