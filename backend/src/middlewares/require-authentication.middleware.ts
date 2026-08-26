import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/app-error.js";
import { verifyAccessToken } from "../lib/jwt.js";
import * as usuarioRepository from "../repositories/usuario.repository.js";

/**
 * D-F: recarga el usuario en cada petición y verifica `activo`. Confiar solo
 * en los claims del token dejaría hasta 1 hora de acceso tras una baja
 * lógica (D4) — inaceptable con ~100 usuarios concurrentes, donde un
 * `findUnique` por PK es irrelevante en costo.
 */
export async function requireAuthentication(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;
  const [scheme, token] = header?.split(" ") ?? [];

  if (scheme !== "Bearer" || !token) {
    next(new AppError("no_autenticado", 401, "Falta el token de acceso"));
    return;
  }

  let payload;
  try {
    payload = await verifyAccessToken(token);
  } catch {
    next(new AppError("no_autenticado", 401, "Token de acceso inválido o expirado"));
    return;
  }

  const user = await usuarioRepository.findById(payload.sub);
  if (!user || !user.activo) {
    next(new AppError("no_autenticado", 401, "Usuario no encontrado o inactivo"));
    return;
  }

  // El claim `rol` del token es una pista; la BD es la verdad (D-F).
  // Bloque B (dual-login-routing): `membresiaId`/`empresaId` viajan tal cual
  // el claim del access token — additivos, nunca releídos de `Membresia`
  // acá. Ninguna decisión de acceso los usa en este cambio.
  req.user = {
    id: user.id,
    nombre: user.nombre,
    correo: user.correo,
    rol: user.rol,
    ...(typeof payload.membresiaId === "string" ? { membresiaId: payload.membresiaId } : {}),
    ...(typeof payload.empresaId === "string" ? { empresaId: payload.empresaId } : {}),
  };
  next();
}
