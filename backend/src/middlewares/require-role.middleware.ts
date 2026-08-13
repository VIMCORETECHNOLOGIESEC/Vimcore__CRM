import type { RolUsuario } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/app-error.js";

/**
 * Debe montarse después de `requireAuthentication` — asume `req.user` ya
 * poblado. Rechaza con 403 (no 401: el usuario sí está autenticado, solo le
 * falta permiso) cuando su rol no está en la lista permitida (D9, D10).
 */
export function requireRole(...roles: RolUsuario[]) {
  return function requireRoleMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): void {
    if (!req.user || !roles.includes(req.user.rol)) {
      next(new AppError("permiso_denegado", 403, "No tienes permiso para esta acción"));
      return;
    }

    next();
  };
}
