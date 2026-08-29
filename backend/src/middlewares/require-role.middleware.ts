import type { RolUsuario } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/app-error.js";
import * as shadowAuthorizationService from "../services/shadow-authorization.service.js";

/**
 * Debe montarse después de `requireAuthentication` — asume `req.user` ya
 * poblado. Rechaza con 403 (no 401: el usuario sí está autenticado, solo le
 * falta permiso) cuando su rol no está en la lista permitida (D9, D10).
 *
 * Bloque B (Fase 2, "Shadow authorizer call sites"): dispara el comparador
 * en sombra fire-and-forget (`void`, nunca `await`ado) tras calcular la
 * decisión legada — corre para ambos desenlaces (permitido y denegado) y
 * NUNCA afecta la respuesta ni le agrega latencia perceptible.
 */
export function requireRole(...roles: RolUsuario[]) {
  return function requireRoleMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): void {
    if (!req.user) {
      next(new AppError("permiso_denegado", 403, "No tienes permiso para esta acción"));
      return;
    }

    const legacyDecision = roles.includes(req.user.rol);
    void shadowAuthorizationService.compareRequireRole(req.user.id, roles, legacyDecision);

    if (!legacyDecision) {
      next(new AppError("permiso_denegado", 403, "No tienes permiso para esta acción"));
      return;
    }

    next();
  };
}

