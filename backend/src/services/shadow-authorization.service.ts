import type { Membresia, RolUsuario } from "@prisma/client";
import { logger } from "../lib/logger.js";
import { rolEquivalente } from "../lib/rol-membresia.js";
import * as membresiaRepository from "../repositories/membresia.repository.js";
import {
  canClose,
  canReassign,
  canTransfer,
  type LeadCierre,
  type LeadReasignacion,
  type LeadTraspaso,
  type MotivoDenegacion,
} from "./leads.access.js";

/**
 * Bloque B (Fase 2, non-functional requirement "Shadow authorizer is
 * observational only"): compara la decisión legada (`Usuario.rol`, única
 * autoridad viva) contra la que resultaría de las `Membresia` activas del
 * usuario, y SOLO loguea la divergencia — nunca altera, bloquea ni demora la
 * respuesta. Toda función acá es fire-and-forget en el llamador (`void
 * compareX(...)`, nunca `await`ada en el camino de la petición) y traga
 * cualquier error (spec, "Shadow failure is non-fatal").
 *
 * Reutiliza `canReassign`/`canTransfer`/`canClose` de `leads.access.ts` TAL
 * CUAL contra un `UsuarioAcceso` sintético por cada `Membresia` activa
 * (`rolEquivalente` abajo) — cero lógica de autorización duplicada/derivada
 * que pudiera desviarse de la real.
 */
export type ShadowCapability = "requireRole" | "canReassign" | "canTransfer" | "canClose";

/**
 * Mapeo inverso EXACTO del backfill de Fase 1 (spec membership-backfill):
 * `VENDEDOR` legado -> `Membresia(rol: ASESOR, habilitadoParaVenta: true)`.
 * Reconstruye el rol legado equivalente para poder invocar las mismas
 * funciones puras de `leads.access.ts`. Exportada (Bloque C, D2): reutilizada
 * por `require-authentication.middleware.ts` para resolver el TenantContext
 * sin duplicar el criterio de mapeo.
 *
 * Re-exportada desde `../lib/rol-membresia.ts` (fix de aislamiento de capas,
 * pre-commit review): esta era la única implementación del mapeo hasta que
 * `notificacion.repository.ts::condicionesMembresiaPorRol` reimplementó su
 * inversa por separado. Ambas ahora comparten la misma fuente en `lib`, sin
 * que `notificacion.repository.ts` (una `repository`) tenga que importar de
 * `services`.
 */
export { rolEquivalente };

/**
 * Bloque C (D1): corrige el bug nombrado en el brief — antes filtraba SOLO
 * por `usuarioId`, agrupando en una sola lista las membresías activas de
 * TODAS las empresas del usuario. Un ADMINISTRADOR de la Empresa A aparecía
 * como equivalente incluso evaluando un recurso de la Empresa B, invalidando
 * la señal de divergencia antes del cutover. `empresaId === null` preserva
 * el paso holding-wide (D2, `ROLES_ACCESO_TOTAL`) sin filtrar por empresa;
 * cualquier otro valor exige coincidencia exacta de `Membresia.empresaId`.
 */
export async function rolesEquivalentesActivos(
  usuarioId: string,
  empresaId: string | null,
): Promise<RolUsuario[]> {
  const membresias = await membresiaRepository.findActivasByUsuarioId(usuarioId);
  const relevantes = filtrarPorEmpresa(membresias, empresaId);
  if (empresaId !== null) logShadowAuthzEmpresaCompared(empresaId);
  return relevantes.map(rolEquivalente);
}

/**
 * Extraída como función pura (task 1.11 REFACTOR) para poder probar el
 * criterio de filtrado sin mockear el repositorio.
 */
export function filtrarPorEmpresa(
  membresias: readonly Membresia[],
  empresaId: string | null,
): Membresia[] {
  if (empresaId === null) return [...membresias];
  return membresias.filter((membresia) => membresia.empresaId === empresaId);
}

function logDivergencia(
  capability: ShadowCapability,
  usuarioId: string,
  legacyDecision: boolean,
  membresiaDecision: boolean,
): void {
  logger.warn(
    { event: "shadow_authz_divergence", capability, usuarioId, legacyDecision, membresiaDecision },
    "Divergencia entre Usuario.rol y Membresia en autorización (shadow, observacional, no bloqueante)",
  );
}

function logFalloNoFatal(capability: ShadowCapability, usuarioId: string, error: unknown): void {
  logger.warn(
    { event: "shadow_authz_error", capability, usuarioId, error },
    "Fallo no fatal del comparador en sombra de autorización — camino legado sin afectar",
  );
}

/**
 * Bloque C (D3, bake-period exit): una señal de volumen por invocación
 * "corregida" (con empresa conocida) del comparador — nunca en el paso
 * holding-wide, que preserva el comportamiento pooled anterior y no es la
 * ruta que este cambio corrige. El criterio de salida real
 * (`evaluateBakeExit`) consulta el conteo de este evento desde el pipeline
 * de logs existente (pino) — no se mantiene un contador en proceso.
 */
function logShadowAuthzEmpresaCompared(empresaId: string): void {
  logger.info(
    { event: "shadow_authz_empresa_compared", empresaId },
    "Comparador en sombra evaluado con filtro por empresa (Bloque C, señal de bake-period)",
  );
}

/**
 * `require-role.middleware.ts`: `legacyDecision` es el mismo booleano que ya
 * decide `next()` vs 403 (`roles.includes(usuario.rol)`), calculado por el
 * llamador — este comparador nunca vuelve a evaluarlo, solo lo contrasta.
 *
 * Bloque C (D1): `empresaId` es un parámetro opcional NUEVO, default `null`
 * (holding-wide) para no romper los call sites existentes
 * (`require-role.middleware.ts`, `asignacion.service.ts`, `leads.service.ts`)
 * — ninguno de los 3 está en el alcance de esta etapa (Fase 1 / Stage 1);
 * conectarlos con el `empresaId` real del recurso queda como seguimiento.
 */
export async function compareRequireRole(
  usuarioId: string,
  rolesPermitidos: readonly RolUsuario[],
  legacyDecision: boolean,
  empresaId: string | null = null,
): Promise<void> {
  try {
    const equivalentes = await rolesEquivalentesActivos(usuarioId, empresaId);
    const membresiaDecision = equivalentes.some((rol) => rolesPermitidos.includes(rol));
    if (membresiaDecision !== legacyDecision) {
      logDivergencia("requireRole", usuarioId, legacyDecision, membresiaDecision);
    }
  } catch (error) {
    logFalloNoFatal("requireRole", usuarioId, error);
  }
}

export async function compareCanReassign(
  usuarioId: string,
  lead: LeadReasignacion,
  legacyMotivo: MotivoDenegacion | null,
  empresaId: string | null = null,
): Promise<void> {
  try {
    const legacyDecision = legacyMotivo === null;
    const equivalentes = await rolesEquivalentesActivos(usuarioId, empresaId);
    const membresiaDecision = equivalentes.some(
      (rol) => canReassign({ id: usuarioId, rol }, lead) === null,
    );
    if (membresiaDecision !== legacyDecision) {
      logDivergencia("canReassign", usuarioId, legacyDecision, membresiaDecision);
    }
  } catch (error) {
    logFalloNoFatal("canReassign", usuarioId, error);
  }
}

export async function compareCanTransfer(
  usuarioId: string,
  lead: LeadTraspaso,
  legacyMotivo: MotivoDenegacion | null,
  empresaId: string | null = null,
): Promise<void> {
  try {
    const legacyDecision = legacyMotivo === null;
    const equivalentes = await rolesEquivalentesActivos(usuarioId, empresaId);
    const membresiaDecision = equivalentes.some(
      (rol) => canTransfer({ id: usuarioId, rol }, lead) === null,
    );
    if (membresiaDecision !== legacyDecision) {
      logDivergencia("canTransfer", usuarioId, legacyDecision, membresiaDecision);
    }
  } catch (error) {
    logFalloNoFatal("canTransfer", usuarioId, error);
  }
}

export async function compareCanClose(
  usuarioId: string,
  lead: LeadCierre,
  legacyMotivo: MotivoDenegacion | null,
  empresaId: string | null = null,
): Promise<void> {
  try {
    const legacyDecision = legacyMotivo === null;
    const equivalentes = await rolesEquivalentesActivos(usuarioId, empresaId);
    const membresiaDecision = equivalentes.some(
      (rol) => canClose({ id: usuarioId, rol }, lead) === null,
    );
    if (membresiaDecision !== legacyDecision) {
      logDivergencia("canClose", usuarioId, legacyDecision, membresiaDecision);
    }
  } catch (error) {
    logFalloNoFatal("canClose", usuarioId, error);
  }
}

/**
 * Bloque C (D3, spec "Bake-period exit"): el exit criterion exige AMBAS
 * condiciones — tiempo transcurrido Y volumen observado — nunca una sola.
 * `elapsedDays`/`observedCount` se resuelven fuera de esta función (consulta
 * al pipeline de logs pino sobre `shadow_authz_empresa_compared`, fuera de
 * proceso); `minDays`/`minCount` son parámetros de operación fijados al
 * desplegar (nunca hardcodeados acá), spec: "N/M son parámetros de
 * operación". Función pura (task 1.11) — testeable sin I/O.
 */
export interface BakeExitParams {
  elapsedDays: number;
  observedCount: number;
  minDays: number;
  minCount: number;
}

export type BakeExitCriterio = "elapsed" | "volume";

export type BakeExitResult =
  | { status: "met" }
  | { status: "not-met"; missing: readonly BakeExitCriterio[] };

export function evaluateBakeExit(params: BakeExitParams): BakeExitResult {
  const missing: BakeExitCriterio[] = [];
  if (params.elapsedDays < params.minDays) missing.push("elapsed");
  if (params.observedCount < params.minCount) missing.push("volume");
  return missing.length === 0 ? { status: "met" } : { status: "not-met", missing };
}

