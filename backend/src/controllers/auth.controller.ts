import type { Request, Response } from "express";
import { AppError } from "../lib/app-error.js";
import { assertAuthenticated } from "../lib/assert-authenticated.js";
import * as empresaRepository from "../repositories/empresa.repository.js";
import { loginBodySchema, logoutBodySchema, refreshBodySchema } from "../schemas/auth.schema.js";
import { login, logout, refresh } from "../services/auth.service.js";
import type { AuthenticatedUser } from "../types/authenticated-user.js";

function zodValidationError(): AppError {
  return new AppError("validacion_invalida", 400, "El cuerpo de la petición es inválido");
}

function empresaInconsistente(): AppError {
  return new AppError(
    "empresa_inconsistente",
    500,
    "La empresa asociada a la sesión no pudo resolverse",
  );
}

/**
 * Bloque D0 (docs/blocks/d0-visualizacion-multitenant.md, "Extensión mínima
 * de GET /auth/perfil"): forma de respuesta exclusiva de este endpoint —
 * `empresaNombre` NUNCA se agrega a `AuthenticatedUser`/`req.user` (eso
 * gastaría una consulta extra en cada request autenticado del sistema).
 */
interface PerfilResponse extends AuthenticatedUser {
  activo: true;
  empresaNombre: string | null;
}

/**
 * Bloque D0: sesión `company` resuelve `Empresa.nombre` server-side desde el
 * `empresaId` canónico ya resuelto por `requireAuthentication` (nunca del
 * cliente). Sesión `holding` no atribuye ninguna empresa concreta
 * (`empresaNombre: null`, sin consultar nada). Fallo cerrado obligatorio: una
 * sesión `company` cuyo `empresaId` no resuelve a ninguna `Empresa` real
 * (dato inconsistente) hace fallar la petición entera — nunca degrada a un
 * nombre nulo ni a un 200 con dato incompleto.
 */
async function resolveEmpresaNombre(user: AuthenticatedUser): Promise<string | null> {
  if (user.sessionScope !== "company") {
    return null;
  }

  if (user.empresaId === null) {
    throw empresaInconsistente();
  }

  const empresa = await empresaRepository.findById(user.empresaId);
  if (!empresa) {
    throw empresaInconsistente();
  }

  return empresa.nombre;
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
  const empresaNombre = await resolveEmpresaNombre(user);

  // `activo` no viaja en `req.user` (tipo `AuthenticatedUser` del diseño no
  // lo incluye) porque `requireAuthentication` ya garantiza `activo === true`
  // antes de poblarlo (D-F); si no lo fuera, la petición nunca habría llegado aquí.
  const perfil: PerfilResponse = { ...user, activo: true, empresaNombre };
  res.status(200).json(perfil);
}
