import type { RolUsuario, Usuario } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/app-error.js";
import { logger } from "../lib/logger.js";
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
const ROLES_ACCESO_TOTAL: readonly RolUsuario[] = ["ADMINISTRADOR", "SUPERVISOR"];

/**
 * Bloque C (D2): resuelve el TenantContext SIEMPRE server-side, releyendo la
 * `Membresia` activa cuyo rol equivalente coincide con el rol legado del
 * usuario (mismo criterio de mapeo que
 * `shadow-authorization.service.ts::rolEquivalente` — spec, "resolved...from
 * `Membresia` for user sessions"). `undefined` = no se pudo resolver
 * (ninguna Membresia activa coincide con el rol legado).
 */
async function resolverEmpresaId(usuario: Usuario): Promise<string | null | undefined> {
  if (ROLES_ACCESO_TOTAL.includes(usuario.rol)) return null;
  const membresias = await membresiaRepository.findActivasByUsuarioId(usuario.id);
  const propia = membresias.find((membresia) => rolEquivalente(membresia) === usuario.rol);
  return propia ? propia.empresaId : undefined;
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

  // Bloque C (D2, spec "Client-supplied empresaId is ignored"): el TenantContext
  // se resuelve SIEMPRE acá, nunca desde el claim `empresaId` del token (que
  // dejó de leerse). `membresiaId` sigue siendo el claim additivo de
  // dual-login-routing (Bloque B) — no participa en ninguna decisión de acceso.
  //
  // Bloque C follow-up (D2 gap closure, spec "Request-scoped tenant context"):
  // rechazo real conectado. Fase 1/Stage 1 degradaba a holding-wide con un
  // log de sombra porque ningún flujo de la aplicación creaba una
  // `Membresia` junto con el `Usuario` nuevo — `usuarios.service.ts::
  // createUsuario` ahora cierra ese hueco (crea la `Membresia` en la MISMA
  // transacción para `ASESOR`/`VENDEDOR`), así que "TenantContext
  // irresoluble" deja de ser un estado alcanzable por el flujo normal de
  // alta de usuarios. `ADMINISTRADOR`/`SUPERVISOR` nunca llegan a este
  // camino — `resolverEmpresaId` los resuelve `null` incondicionalmente
  // antes de tocar `Membresia`.
  const empresaId = await resolverEmpresaId(user);
  if (empresaId === undefined) {
    logger.warn(
      { event: "tenant_context_no_resuelto", usuarioId: user.id, rol: user.rol },
      "TenantContext no resuelto (ninguna Membresia activa coincide con el rol legado) — petición rechazada (Bloque C, D2)",
    );
    next(
      new AppError(
        "contexto_empresa_no_resuelto",
        403,
        "No se pudo resolver la empresa del usuario autenticado",
      ),
    );
    return;
  }

  // El claim `rol` del token es una pista; la BD es la verdad (D-F).
  req.user = {
    id: user.id,
    nombre: user.nombre,
    correo: user.correo,
    rol: user.rol,
    ...(typeof payload.membresiaId === "string" ? { membresiaId: payload.membresiaId } : {}),
    empresaId,
  };
  next();
}
