import type { Membresia, RolUsuario } from "@prisma/client";
import { logger } from "../lib/logger.js";
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
 * funciones puras de `leads.access.ts`.
 */
function rolEquivalente(membresia: Membresia): RolUsuario {
  if (membresia.rol === "ASESOR") {
    return membresia.habilitadoParaVenta ? "VENDEDOR" : "ASESOR";
  }
  return membresia.rol;
}

async function rolesEquivalentesActivos(usuarioId: string): Promise<RolUsuario[]> {
  const membresias = await membresiaRepository.findActivasByUsuarioId(usuarioId);
  return membresias.map(rolEquivalente);
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
 * `require-role.middleware.ts`: `legacyDecision` es el mismo booleano que ya
 * decide `next()` vs 403 (`roles.includes(usuario.rol)`), calculado por el
 * llamador — este comparador nunca vuelve a evaluarlo, solo lo contrasta.
 */
export async function compareRequireRole(
  usuarioId: string,
  rolesPermitidos: readonly RolUsuario[],
  legacyDecision: boolean,
): Promise<void> {
  try {
    const equivalentes = await rolesEquivalentesActivos(usuarioId);
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
): Promise<void> {
  try {
    const legacyDecision = legacyMotivo === null;
    const equivalentes = await rolesEquivalentesActivos(usuarioId);
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
): Promise<void> {
  try {
    const legacyDecision = legacyMotivo === null;
    const equivalentes = await rolesEquivalentesActivos(usuarioId);
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
): Promise<void> {
  try {
    const legacyDecision = legacyMotivo === null;
    const equivalentes = await rolesEquivalentesActivos(usuarioId);
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

