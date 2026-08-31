import type { Request, Response } from "express";
import { AppError } from "../lib/app-error.js";
import { assertAuthenticated } from "../lib/assert-authenticated.js";
import {
  crearCanalManualBodySchema,
  editarCanalManualBodySchema,
  idParamSchema,
  listCanalesManualesQuerySchema,
} from "../schemas/canal-manual.schema.js";
import {
  crearCanalManual,
  editarCanalManual,
  listarCanalesManuales,
} from "../services/canal-manual.service.js";

function zodValidationError(): AppError {
  return new AppError("validacion_invalida", 400, "La petición es inválida");
}

/** `POST /canales-manuales` -- gestión del catálogo (`requireRole`, ver el router). */
export async function postCanalManual(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);

  const parsedBody = crearCanalManualBodySchema.safeParse(req.body);
  if (!parsedBody.success) throw zodValidationError();

  const canalManual = await crearCanalManual(usuario, parsedBody.data);
  res.status(201).json({ canalManual });
}

/** `GET /canales-manuales` -- Administrador/Supervisor/Asesor/holding listan para elegir canal al cargar un lead manual. */
export async function getCanalesManuales(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);

  const parsedQuery = listCanalesManualesQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) throw zodValidationError();

  const canalesManuales = await listarCanalesManuales(usuario, parsedQuery.data);
  res.status(200).json({ canalesManuales });
}

/** `PATCH /canales-manuales/:id` -- gestión del catálogo (`requireRole`, ver el router). */
export async function patchCanalManual(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);

  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) throw zodValidationError();

  const parsedBody = editarCanalManualBodySchema.safeParse(req.body);
  if (!parsedBody.success) throw zodValidationError();

  const canalManual = await editarCanalManual(usuario, parsedId.data.id, parsedBody.data);
  res.status(200).json({ canalManual });
}
