import type { Request, Response } from "express";
import { AppError } from "../lib/app-error.js";
import { updateConfiguracionEmpresaBodySchema } from "../schemas/configuracion-empresa.schema.js";
import { getConfiguracion, updateConfiguracion } from "../services/configuracion-empresa.service.js";

function zodValidationError(): AppError {
  return new AppError("validacion_invalida", 400, "El cuerpo de la petición es inválido");
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
