import type { Request, Response } from "express";
import { AppError } from "../lib/app-error.js";
import {
  createUserBodySchema,
  idParamSchema,
  listResponsablesQuerySchema,
  listUsersQuerySchema,
  updateUserBodySchema,
} from "../schemas/usuarios.schema.js";
import {
  createUser,
  deactivateUser,
  findResponsables,
  findUserById,
  findUsers,
  updateUser,
} from "../services/usuarios.service.js";

function zodValidationError(): AppError {
  return new AppError("validacion_invalida", 400, "El cuerpo de la petición es inválido");
}

function invalidIdParam(): AppError {
  return new AppError("validacion_invalida", 400, "El identificador de usuario es inválido");
}

export async function postUser(req: Request, res: Response): Promise<void> {
  const parsed = createUserBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw zodValidationError();
  }

  const user = await createUser(parsed.data);
  res.status(201).json({ user });
}

export async function getUsers(req: Request, res: Response): Promise<void> {
  const parsed = listUsersQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw zodValidationError();
  }

  const resultado = await findUsers(parsed.data);
  res
    .status(200)
    .json({ users: resultado.usuarios, total: resultado.total, pagina: resultado.pagina, limite: resultado.limite });
}

/**
 * F3/F4 (diseño D-A1): traducción HTTP pura. La ruta ya restringe el rol a
 * ADMINISTRADOR/SUPERVISOR (`requireRole`) — el servicio no reaplica la
 * regla, sigue el mismo patrón que `postLeadAsignar`.
 */
export async function getUsersResponsables(req: Request, res: Response): Promise<void> {
  const parsed = listResponsablesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw zodValidationError();
  }

  const responsables = await findResponsables(parsed.data.rol);
  res.status(200).json({ responsables });
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

  const parsedBody = updateUserBodySchema.safeParse(req.body);
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
