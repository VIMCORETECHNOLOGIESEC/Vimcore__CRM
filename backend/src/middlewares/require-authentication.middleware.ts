import type { Membresia, Usuario } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/app-error.js";
import { logger } from "../lib/logger.js";
import { runWithTenantContext, withBootstrapUsuarioGuc } from "../lib/prisma.js";
import { verifyAccessToken } from "../lib/jwt.js";
import * as membresiaRepository from "../repositories/membresia.repository.js";
import * as usuarioRepository from "../repositories/usuario.repository.js";
import { rolEquivalente } from "../services/shadow-authorization.service.js";

/**
 * Bloque C (D2, spec "Request-scoped tenant context"): mismos dos roles que
 * `leads.access.ts::ROLES_ACCESO_TOTAL` — duplicado deliberado (esa
 * constante no se exporta, y ese archivo queda fuera del alcance de Fase 1 /
 * Stage 1). Resuelven `empresaId: null` (holding-wide) INCONDICIONALMENTE:
 * preserva su comportamiento actual sin restricción exacto (D2) — no es una
 * capacidad nueva.
 */
function membresiaCoincide(
  membresia: Membresia | null,
  usuario: Usuario,
  payload: { membresiaId?: string; empresaId?: string; rol: string },
): membresia is Membresia {
  return Boolean(
    membresia &&
      membresia.activa &&
      membresia.id === payload.membresiaId &&
      membresia.usuarioId === usuario.id &&
      membresia.empresaId === payload.empresaId &&
      payload.rol === usuario.rol &&
      rolEquivalente(membresia) === usuario.rol,
  );
}

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

  let empresaId: string | null | undefined;
  let membresiaId: string | undefined;
  let correoMembresia: string | undefined;
  if (payload.sessionScope === "holding") {
    if (
      payload.membresiaId !== undefined ||
      payload.empresaId !== undefined ||
      payload.rol !== user.rol
    ) {
      empresaId = undefined;
    } else {
      empresaId = null;
    }
  } else if (
    payload.sessionScope === "company" &&
    typeof payload.membresiaId === "string" &&
    typeof payload.empresaId === "string"
  ) {
    const membresia = await withBootstrapUsuarioGuc(user.id, (tx) =>
      membresiaRepository.findById(payload.membresiaId as string, tx),
    );
    if (membresiaCoincide(membresia, user, payload)) {
      empresaId = membresia.empresaId;
      membresiaId = membresia.id;
      correoMembresia = membresia.correo ?? undefined;
    }
  }

  if (empresaId === undefined) {
    logger.warn(
      { event: "tenant_context_rejected", usuarioId: user.id, rol: user.rol },
      "Sesión rechazada porque su membresía exacta ya no coincide con el contexto autenticado",
    );
    next(
      new AppError(
        "no_autenticado",
        401,
        "Token de acceso inválido o expirado",
      ),
    );
    return;
  }

  // El claim `rol` del token es una pista; la BD es la verdad (D-F).
  // Fix (correo de portador visible en "Mi perfil"/dropdown, mismo bug y
  // criterio que `usuario.repository.ts::toListView`): `Usuario.correo` de
  // un portador es el placeholder sintético `@no-login.crm.local`. Una
  // sesión `company` con `membresiaId` se autenticó necesariamente vía
  // `Membresia.correo` (dual-login-routing) -- ese ES el correo real, se usa
  // sin condicionar por dominio.
  req.user = {
    id: user.id,
    nombre: user.nombre,
    correo: correoMembresia ?? user.correo,
    rol: user.rol,
    sessionScope: payload.sessionScope,
    ...(membresiaId ? { membresiaId } : {}),
    empresaId,
  };
  // Bloque C (Etapa 3, D2/D3): puebla el carrier de `AsyncLocalStorage` de
  // `lib/prisma.ts` alrededor de `next()` — todo el resto del ciclo de vida
  // de esta request (controllers, services, repositorios, hasta que la
  // response termine) corre dentro de este contexto. `empresaId` ya viene
  // resuelto arriba con el mismo criterio D2/D3 (`null` = holding-wide vía
  // el ROL DE APLICACIÓN, nunca `crm_bypass_jobs` — spec §2 "HTTP request
  // always uses application role").
  runWithTenantContext({ empresaId }, next);
}
