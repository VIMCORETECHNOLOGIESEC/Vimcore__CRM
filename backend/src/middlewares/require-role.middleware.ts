import type { RolUsuario } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/app-error.js";
import * as shadowAuthorizationService from "../services/shadow-authorization.service.js";

/**
 * Bloque F (aditivo, decisión cerrada con el usuario): `SUPERVISOR_HOLDING`/
 * `SUPER_ADMIN` comparten el mismo alcance máximo — acceso total
 * holding-wide, sin restricción de `empresaId`. En vez de agregar estos dos
 * roles a cada lista fija de `requireRole(...)` en los ~17-19 call sites
 * existentes (retiro/expansión del enum legacy, explícitamente NO parte de
 * este batch — bloqueado por coordinación con otro equipo), el bypass se
 * conecta UNA sola vez acá: `requireRole` es el único punto por el que pasan
 * TODAS las rutas gateadas por rol fijo, así que un bypass acá cubre
 * `/leads/:id/asignar`, `/leads/asignar-lote`, `/oportunidades/:id/reasignar`,
 * `/productos` (POST), `/usuarios/*`, `/bridges/*`, etc. sin tocar ninguno de
 * esos archivos de rutas.
 */
const ROLES_HOLDING_BYPASS: readonly RolUsuario[] = ["SUPERVISOR_HOLDING", "SUPER_ADMIN"];

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

    // Bloque F: bypass total ANTES del comparador en sombra — no tiene
    // sentido comparar la decisión legada (`Usuario.rol` contra la lista
    // fija) para un rol que ni siquiera existía cuando esa lista se escribió.
    if (ROLES_HOLDING_BYPASS.includes(req.user.rol)) {
      next();
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

