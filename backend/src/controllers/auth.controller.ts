import type { Request, Response } from "express";
import { AppError } from "../lib/app-error.js";
import { assertAuthenticated } from "../lib/assert-authenticated.js";
import { loginBodySchema, logoutBodySchema, refreshBodySchema } from "../schemas/auth.schema.js";
import { login, logout, refresh, resolveEmpresaMarca } from "../services/auth.service.js";
import type { AuthenticatedUser } from "../types/authenticated-user.js";

function zodValidationError(): AppError {
  return new AppError("validacion_invalida", 400, "El cuerpo de la petición es inválido");
}

/**
 * Bloque D0 (docs/blocks/d0-visualizacion-multitenant.md, "Extensión mínima
 * de GET /auth/perfil") + tema-empresarial-integracion (Parte 2): forma de
 * respuesta exclusiva de este endpoint — `empresaNombre`/
 * `empresaColorPrimario`/`empresaColorSecundario` NUNCA se agregan a
 * `AuthenticatedUser`/`req.user` (eso gastaría una consulta extra en cada
 * request autenticado del sistema). La resolución en sí vive en
 * `auth.service.ts::resolveEmpresaMarca`, no acá — el controller solo arma
 * la forma HTTP de la respuesta.
 */
interface PerfilResponse extends AuthenticatedUser {
  activo: true;
  empresaNombre: string | null;
  empresaColorPrimario: string | null;
  empresaColorSecundario: string | null;
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

export async function getPerfil(req: Request, res: Response): Promise<void> {
  const user = assertAuthenticated(req);
  const {
    nombre: empresaNombre,
    colorPrimario: empresaColorPrimario,
    colorSecundario: empresaColorSecundario,
  } = await resolveEmpresaMarca(user);

  // `activo` no viaja en `req.user` (tipo `AuthenticatedUser` del diseño no
  // lo incluye) porque `requireAuthentication` ya garantiza `activo === true`
  // antes de poblarlo (D-F); si no lo fuera, la petición nunca habría llegado aquí.
  const perfil: PerfilResponse = {
    ...user,
    activo: true,
    empresaNombre,
    empresaColorPrimario,
    empresaColorSecundario,
  };
  res.status(200).json(perfil);
}
