import type { Request, Response } from "express";
import { AppError } from "../lib/app-error.js";
import { updateEmpresaAparienciaBodySchema } from "../schemas/empresa-apariencia.schema.js";
import { updateApariencia } from "../services/empresa-apariencia.service.js";

function validacionInvalida(): AppError {
  return new AppError("validacion_invalida", 400, "El cuerpo de la petición es inválido");
}

/**
 * Guarda adicional (Tarea 3, más allá de `requireRole("ADMINISTRADOR")` en
 * la ruta): este endpoint es exclusivamente self-service, para el
 * ADMINISTRADOR de UNA empresa sobre la SUYA -- una sesión `holding` (aunque
 * tenga rol ADMINISTRADOR holding-wide) no tiene una única empresa propia
 * que editar. 403, no 401: la sesión sí está autenticada y autorizada por
 * rol, solo le falta el scope correcto para esta acción puntual.
 */
function soloEmpresaPropia(): AppError {
  return new AppError(
    "solo_empresa_propia",
    403,
    "Esta acción es exclusiva del administrador de una empresa sobre su propia apariencia",
  );
}

export async function patchEmpresaApariencia(req: Request, res: Response): Promise<void> {
  if (!req.user || req.user.sessionScope !== "company" || req.user.empresaId === null) {
    throw soloEmpresaPropia();
  }

  const parsed = updateEmpresaAparienciaBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw validacionInvalida();
  }

  // `req.user.empresaId` -- NUNCA `req.body.empresaId` -- es la única fuente
  // de autoridad para qué `Empresa` se modifica (D0/RLS, mismo principio que
  // el resto del proyecto).
  const apariencia = await updateApariencia(req.user.empresaId, parsed.data);
  res.status(200).json(apariencia);
}
