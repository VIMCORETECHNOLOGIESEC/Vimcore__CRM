import type { Request, Response } from "express";
import { AppError } from "../lib/app-error.js";
import { assertAuthenticated } from "../lib/assert-authenticated.js";
import { loginBodySchema, logoutBodySchema, refreshBodySchema } from "../schemas/auth.schema.js";
import { login, logout, refresh } from "../services/auth.service.js";

function zodValidationError(): AppError {
  return new AppError("validacion_invalida", 400, "El cuerpo de la petición es inválido");
}

export async function postLogin(req: Request, res: Response): Promise<void> {
  const parsed = loginBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw zodValidationError();
  }

  const result = await login(parsed.data.correo, parsed.data.password);
  res.status(200).json(result);
}

export async function postRefresh(req: Request, res: Response): Promise<void> {
  const parsed = refreshBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw zodValidationError();
  }

  const result = await refresh(parsed.data.refreshToken);
  res.status(200).json(result);
}

export async function postLogout(req: Request, res: Response): Promise<void> {
  const user = assertAuthenticated(req);
  const parsed = logoutBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw zodValidationError();
  }

  await logout(user.id, parsed.data.refreshToken);
  res.status(204).send();
}

export function getPerfil(req: Request, res: Response): void {
  const user = assertAuthenticated(req);
  // `activo` no viaja en `req.user` (tipo `AuthenticatedUser` del diseño no
  // lo incluye) porque `requireAuthentication` ya garantiza `activo === true`
  // antes de poblarlo (D-F); si no lo fuera, la petición nunca habría llegado aquí.
  res.status(200).json({ ...user, activo: true });
}
