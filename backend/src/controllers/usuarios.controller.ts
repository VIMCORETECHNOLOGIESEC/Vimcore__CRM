import type { Request, Response } from "express";
import { AppError } from "../lib/app-error.js";
import {
  createUsuarioBodySchema,
  idParamSchema,
  listUsuariosQuerySchema,
  updateUsuarioBodySchema,
} from "../schemas/usuarios.schema.js";
import {
  createUsuario,
  deactivateUsuario,
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

export async function getUsuarios(req: Request, res: Response): Promise<void> {
  const parsed = listUsuariosQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw zodValidationError();
  }

  const resultado = await findUsuarios(parsed.data);
  res
    .status(200)
    .json({ users: resultado.usuarios, total: resultado.total, pagina: resultado.pagina, limite: resultado.limite });
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
