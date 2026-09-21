import { AppError } from "./app-error.js";
import type { AuthenticatedUser } from "../types/authenticated-user.js";

/**
 * holding-scoped-tenant-isolation: holding scope handed to services that
 * enforce holding isolation in application code (`empresas` and `usuarios`
 * have no RLS). REQUIRED at every call site so a forgetful caller cannot
 * silently fall back to a global (fail-open) read.
 *
 * - `{ holdingId: "<uuid>" }`: restricted to that holding.
 * - `{ holdingId: null }`: explicit global scope. Only SUPER_ADMIN (or a
 *   company session, which callers pin to its own empresa) gets it.
 */
export interface EmpresaScope {
  holdingId: string | null;
}

export const GLOBAL_EMPRESA_SCOPE: EmpresaScope = { holdingId: null };

/**
 * Derives the scope from the authenticated session only (never from request
 * input). Fails closed with the same 403 `identidad_no_vinculada` as the auth
 * middlewares when a holding-wide session that is not SUPER_ADMIN has no
 * `holdingId`.
 */
export function resolveEmpresaScope(user: Pick<AuthenticatedUser, "rol" | "empresaId" | "holdingId">): EmpresaScope {
  if (user.holdingId) return { holdingId: user.holdingId };
  if (user.empresaId) return GLOBAL_EMPRESA_SCOPE; // company session: pinned to its own empresa by callers
  if (user.rol === "SUPER_ADMIN") return GLOBAL_EMPRESA_SCOPE;
  throw new AppError(
    "identidad_no_vinculada",
    403,
    "El usuario de holding no está vinculado a ningún holding",
  );
}

/** True when `empresa` must be hidden from `scope` (another holding or none). */
export function isEmpresaOutsideScope(
  empresa: { holdingId: string | null },
  scope: EmpresaScope,
): boolean {
  return scope.holdingId !== null && empresa.holdingId !== scope.holdingId;
}
