import type { Request, Response } from "express";
import { AppError } from "../lib/app-error.js";
import {
  createUsuarioBodySchema,
  idParamSchema,
  listResponsablesQuerySchema,
  updateUsuarioBodySchema,
} from "../schemas/usuarios.schema.js";
import {
  createUsuario,
  deactivateUsuario,
  findResponsables,
  findUsuarioById,
  findUsuarios,
  updateUsuario,
} from "../services/usuarios.service.js";

function zodValidationError(): AppError {
  return new AppError("validacion_invalida", 400, "El cuerpo de la petición es inválido");
}

function invalidIdParam(): AppError {
  return new AppError("validacion_invalida", 400, "El identificador de usuario es inválido");
}

export async function postUsuario(req: Request, res: Response): Promise<void> {
  const parsed = createUsuarioBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw zodValidationError();
  }

  const user = await createUsuario(parsed.data);
  res.status(201).json({ user });
}

export async function getUsuarios(_req: Request, res: Response): Promise<void> {
  const users = await findUsuarios();
  res.status(200).json({ users });
}

/**
 * F3/F4 (diseño D-A1): traducción HTTP pura. La ruta ya restringe el rol a
 * ADMINISTRADOR/SUPERVISOR (`requireRole`) — el servicio no reaplica la
 * regla, sigue el mismo patrón que `postLeadAsignar`.
 */
export async function getUsuariosResponsables(req: Request, res: Response): Promise<void> {
  const parsed = listResponsablesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw zodValidationError();
  }

  const responsables = await findResponsables(parsed.data.rol);
  res.status(200).json({ responsables });
}

export async function getUsuarioById(req: Request, res: Response): Promise<void> {
  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) {
    throw invalidIdParam();
  }

  const user = await findUsuarioById(parsedId.data.id);
  res.status(200).json({ user });
}

export async function patchUsuario(req: Request, res: Response): Promise<void> {
  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) {
    throw invalidIdParam();
  }

  const parsedBody = updateUsuarioBodySchema.safeParse(req.body);
  if (!parsedBody.success) {
    throw zodValidationError();
  }

  const user = await updateUsuario(parsedId.data.id, parsedBody.data);
  res.status(200).json({ user });
}

export async function deleteUsuario(req: Request, res: Response): Promise<void> {
  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) {
    throw invalidIdParam();
  }

  await deactivateUsuario(parsedId.data.id);
  res.status(204).send();
}
