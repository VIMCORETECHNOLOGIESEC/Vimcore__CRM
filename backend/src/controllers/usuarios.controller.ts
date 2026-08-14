import type { Request, Response } from "express";
import { AppError } from "../lib/app-error.js";
import {
  createUsuarioBodySchema,
  idParamSchema,
  updateUsuarioBodySchema,
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

export async function postUser(req: Request, res: Response): Promise<void> {
  const parsed = createUsuarioBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw zodValidationError();
  }

  const user = await createUser(parsed.data);
  res.status(201).json({ user });
}

export async function getUsers(_req: Request, res: Response): Promise<void> {
  const users = await findAllUsers();
  res.status(200).json({ users });
}

export async function getUserById(req: Request, res: Response): Promise<void> {
  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) {
    throw invalidIdParam();
  }

  const user = await findUserById(parsedId.data.id);
  res.status(200).json({ user });
}

export async function patchUser(req: Request, res: Response): Promise<void> {
  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) {
    throw invalidIdParam();
  }

  const parsedBody = updateUsuarioBodySchema.safeParse(req.body);
  if (!parsedBody.success) {
    throw zodValidationError();
  }

  const user = await updateUser(parsedId.data.id, parsedBody.data);
  res.status(200).json({ user });
}

export async function deleteUser(req: Request, res: Response): Promise<void> {
  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) {
    throw invalidIdParam();
  }

  await deactivateUser(parsedId.data.id);
  res.status(204).send();
}
