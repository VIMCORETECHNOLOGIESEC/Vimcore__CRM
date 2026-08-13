import type { Request } from "express";
import { AppError } from "./app-error.js";
import type { AuthenticatedUser } from "../types/authenticated-user.js";

/**
 * `req.user` es opcional en el tipo porque Express no lo garantiza. Los
 * controllers protegidos llaman esto en vez de `req.user!`, así ningún
 * controller asume sin verificar que `requireAuthentication` corrió antes.
 */
export function assertAuthenticated(req: Request): AuthenticatedUser {
  if (!req.user) {
    throw new AppError("no_autenticado", 401, "Se requiere autenticación");
  }

  return req.user;
}
