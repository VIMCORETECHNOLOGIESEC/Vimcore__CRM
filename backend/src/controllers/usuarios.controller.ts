import type { Request, Response } from "express";
import { AppError } from "../lib/app-error.js";
import { assertAuthenticated } from "../lib/assert-authenticated.js";
import {
  createUsuarioBodySchema,
  idParamSchema,
  listResponsablesQuerySchema,
  listUsuariosQuerySchema,
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
  const usuario = assertAuthenticated(req);

  const parsed = createUsuarioBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw zodValidationError();
  }

  const user = await createUsuario(usuario, parsed.data);
  res.status(201).json({ user });
}

export async function getUsuarios(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);

  const parsed = listUsuariosQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw zodValidationError();
  }

  const resultado = await findUsuarios(usuario, parsed.data);
  res
    .status(200)
    .json({ users: resultado.usuarios, total: resultado.total, pagina: resultado.pagina, limite: resultado.limite });
}

/**
 * F3/F4 (diseño D-A1): traducción HTTP pura. La ruta ya restringe el rol a
 * ADMINISTRADOR/SUPERVISOR (`requireRole`) — el servicio no reaplica la
 * regla, sigue el mismo patrón que `postLeadAsignar`.
 *
 * Fix (bug de seguridad, scope por empresa): ahora exige el actor
 * autenticado -- `findResponsables` aplica el mismo criterio de 3 ramas que
 * `getUsuarios`.
 */
export async function getUsuariosResponsables(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);

  const parsed = listResponsablesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw zodValidationError();
  }

  const responsables = await findResponsables(usuario, parsed.data);
  res.status(200).json({ responsables });
}

export async function getUsuarioById(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);

  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) {
    throw invalidIdParam();
  }

  const user = await findUsuarioById(usuario, parsedId.data.id);
  res.status(200).json({ user });
}

export async function patchUsuario(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);

  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) {
    throw invalidIdParam();
  }

  const parsedBody = updateUsuarioBodySchema.safeParse(req.body);
  if (!parsedBody.success) {
    throw zodValidationError();
  }

  const user = await updateUsuario(usuario, parsedId.data.id, parsedBody.data);
  res.status(200).json({ user });
}

export async function deleteUsuario(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);

  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) {
    throw invalidIdParam();
  }

  await deactivateUsuario(usuario, parsedId.data.id);
  res.status(204).send();
}
