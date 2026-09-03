import type { RolUsuario } from "@prisma/client";
import { AppError } from "../../lib/app-error.js";
import type { PrismaClientOrTransaction } from "../../lib/prisma.js";
import * as membresiaRepository from "../../repositories/membresia.repository.js";
import type { AuthenticatedUser } from "../../types/authenticated-user.js";

/**
 * docs/blocks/e-dashboards.md ("Exportación PDF/XLSX"): "Acceso: solo
 * Supervisor y Administrador (empresa u holding) -- Asesor no". Bloque F
 * (aditivo, mismo criterio que `oportunidad.access.ts::ROLES_ACCESO_TOTAL`):
 * SUPERVISOR_HOLDING/SUPER_ADMIN comparten el mismo alcance máximo que
 * SUPERVISOR/ADMINISTRADOR -- "empresa u holding" en el texto del doc es
 * exactamente esta distinción. `reportes.routes.ts` ya gatea por
 * `requireRole("ADMINISTRADOR", "SUPERVISOR")`, que a su vez ya deja pasar
 * SUPERVISOR_HOLDING/SUPER_ADMIN vía el bypass centralizado de
 * `require-role.middleware.ts` -- esta lista es el chequeo DEFENSIVO
 * redundante dentro del servicio, mismo patrón que el resto del código base.
 */
export const ROLES_REPORTES: readonly RolUsuario[] = [
  "ADMINISTRADOR",
  "SUPERVISOR",
  "SUPERVISOR_HOLDING",
  "SUPER_ADMIN",
];

export function puedeGenerarReportes(usuario: Pick<AuthenticatedUser, "rol">): boolean {
  return ROLES_REPORTES.includes(usuario.rol);
}

/**
 * Scope empresarial de `ReporteJob` -- SIEMPRE derivado server-side
 * (docs/blocks/e-dashboards.md, "Scope empresarial de ReporteJob"). Aplica a
 * las tres operaciones sensibles que el doc nombra explícitamente: creación
 * del job (acá), `GET /reportes/jobs/activo` (el repositorio ya filtra por
 * `usuarioId`, `ReporteJob` no tiene `empresaId` propio -- no necesita esta
 * función) y la descarga del archivo (`reportes.service.ts::
 * obtenerJobParaDescarga`, que valida titularidad del job -- el job en sí ya
 * nació con el `empresaId` que ESTA función resolvió, no hace falta
 * revalidar de nuevo en la descarga).
 *
 * `empresaIdSolicitado` (de `parametros.empresaId`, JSON del cliente) NUNCA
 * se confía tal cual:
 * - Sin él (`undefined`): se usa el alcance de la SESIÓN actual
 *   (`usuario.empresaId`, ya resuelto por `require-authentication.middleware.ts`
 *   desde una `Membresia` real, o `null` = holding-wide) -- mismo criterio que
 *   los 7 endpoints de `metricas.service.ts` (sin selector de empresa
 *   explícito, el alcance es el de la sesión).
 * - Con él, sesión holding-wide (`usuario.empresaId === null`): se confía
 *   directo, SIN exigir `Membresia` -- mismo criterio que
 *   `metricas.access.ts::resolveEmpresaId` (el drill-down holding-wide del
 *   Dashboard). Una sesión holding-wide por definición no tiene ninguna
 *   `Membresia` propia (eso es justamente lo que la hace holding-wide, ver
 *   `ROLES_REPORTES` arriba), así que exigirle una siempre rechazaba con 403
 *   a cualquier holding-wide que pidiera un reporte acotado a una empresa
 *   puntual -- bug real encontrado en producción (2026-09-03): el holding,
 *   como contenedor de todas las empresas, ya tiene autorización sobre
 *   cualquiera de ellas por construcción (docs/08 §1, `ROLES_ACCESO_TOTAL`).
 * - Con él, sesión company-scoped (`usuario.empresaId !== null`): debe
 *   corresponder a una `Membresia` ACTIVA real del usuario -- se rechaza
 *   aunque coincida por casualidad con `usuario.empresaId` de la sesión
 *   actual, para no depender implícitamente de qué sesión abrió el usuario
 *   en este momento (un usuario con membresías activas en varias empresas
 *   puede pedir un reporte de cualquiera de ellas, no solo la de su sesión
 *   vigente).
 */
export async function resolverEmpresaIdReporte(
  usuario: AuthenticatedUser,
  empresaIdSolicitado: string | undefined,
  client: PrismaClientOrTransaction,
): Promise<string | null> {
  if (empresaIdSolicitado === undefined) {
    return usuario.empresaId;
  }

  if (usuario.empresaId === null) {
    return empresaIdSolicitado;
  }

  const membresiasActivas = await membresiaRepository.findActivasByUsuarioId(usuario.id, client);
  const autorizado = membresiasActivas.some((membresia) => membresia.empresaId === empresaIdSolicitado);
  if (!autorizado) {
    throw new AppError(
      "empresa_no_autorizada",
      403,
      "No tienes una membresía activa para la empresa indicada",
    );
  }
  return empresaIdSolicitado;
}
