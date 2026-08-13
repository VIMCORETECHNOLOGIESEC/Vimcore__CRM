import type { Request, Response } from "express";
import { AppError } from "../lib/app-error.js";
import {
  actualizarUsuarioBodySchema,
  crearUsuarioBodySchema,
  idParamSchema,
} from "../schemas/usuarios.schema.js";
import {
  createUser,
  deactivateUser,
  findAllUsers,
  findUserById,
  updateUser,
} from "../services/usuarios.service.js";

function zodValidationError(): AppError {
  return new AppError("validacion_invalida", 400, "El cuerpo de la petición es inválido");
}

function invalidIdParam(): AppError {
  return new AppError("validacion_invalida", 400, "El identificador de usuario es inválido");
}

export async function postUsuario(req: Request, res: Response): Promise<void> {
  const parsed = crearUsuarioBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw zodValidationError();
  }

  const usuario = await createUser(parsed.data);
  res.status(201).json({ usuario });
}

export async function getUsuarios(_req: Request, res: Response): Promise<void> {
  const usuarios = await findAllUsers();
  res.status(200).json({ usuarios });
}

export async function getUsuarioPorId(req: Request, res: Response): Promise<void> {
  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) {
    throw invalidIdParam();
  }

  const usuario = await findUserById(parsedId.data.id);
  res.status(200).json({ usuario });
}

export async function patchUsuario(req: Request, res: Response): Promise<void> {
  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) {
    throw invalidIdParam();
  }

  const parsedBody = actualizarUsuarioBodySchema.safeParse(req.body);
  if (!parsedBody.success) {
    throw zodValidationError();
  }

  const usuario = await updateUser(parsedId.data.id, parsedBody.data);
  res.status(200).json({ usuario });
}

export async function deleteUsuario(req: Request, res: Response): Promise<void> {
  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) {
    throw invalidIdParam();
  }

  await deactivateUser(parsedId.data.id);
  res.status(204).send();
}
