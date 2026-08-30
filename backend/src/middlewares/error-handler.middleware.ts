import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/app-error.js";
import { logger } from "../lib/logger.js";

/**
 * Middleware central de errores (AGENTS.md §4). Debe registrarse el último,
 * después del router raíz. Firma de 4 argumentos exigida por Express para
 * que actúe como manejador de errores.
 *
 * Nunca devuelve un stack trace al cliente, independientemente de NODE_ENV.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusHttp).json({ code: err.code, message: err.message });
    return;
  }

  logger.error({ err }, "error interno no controlado");
  res.status(500).json({ code: "internal_error", message: "Error interno del servidor" });
}
