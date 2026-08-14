import type { Request, Response } from "express";
import { AppError } from "../lib/app-error.js";
import { assertAuthenticated } from "../lib/assert-authenticated.js";
import { etapaParamSchema } from "../schemas/formularios.schema.js";
import { findFormulario } from "../services/formularios.service.js";

function zodValidationError(): AppError {
  return new AppError("validacion_invalida", 400, "La petición es inválida");
}

/**
 * spec ("Definición de formulario por etapa"): traducción HTTP pura —
 * `services/formularios.service.ts::findFormulario` es la única puerta hacia
 * la rúbrica estática de `config/formularios.ts` (AGENTS.md §4, controllers
 * nunca importan `config/` directo).
 */
export async function getFormularioEtapa(req: Request, res: Response): Promise<void> {
  assertAuthenticated(req);

  const parsed = etapaParamSchema.safeParse(req.params);
  if (!parsed.success) throw zodValidationError();

  res.status(200).json({ formulario: findFormulario(parsed.data.etapa) });
}
