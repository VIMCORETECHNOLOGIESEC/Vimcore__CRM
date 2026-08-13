import type { OrigenLead } from "@prisma/client";
import { VENTANA_REINGRESO_MS } from "../config/negocio.js";

export interface DeduplicacionState {
  clienteId: string;
  /** Etapa NOT IN (VENTA, NO_VENTA). */
  leadAbierto: { id: string } | null;
  /** Cierre más reciente entre los leads cerrados del cliente. */
  ultimoLeadCerrado: { id: string; cerradoEn: Date } | null;
}

export type DeduplicacionAction =
  | { kind: "crear_lead"; origen: OrigenLead }
  | { kind: "interaccion_repetida"; leadId: string; motivo: "lead_abierto" }
  | {
      kind: "interaccion_repetida";
      leadId: string;
      motivo: "lead_cerrado_en_ventana";
      diasDesdeCierre: number;
    };

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Pura, sin acceso a BD ni dependencia de Prisma en tiempo de ejecución
 * (`OrigenLead` se importa solo como tipo — diseño M3). Árbol de decisión
 * (docs/02-reglas-negocio.md §2, modificado por D7-D9 del diseño):
 *   lead abierto        -> interaccion_repetida / lead_abierto
 *   sin leads            -> crear_lead NUEVO
 *   cerrado, Δ > 90d     -> crear_lead REINGRESO
 *   cerrado, Δ <= 90d    -> interaccion_repetida / lead_cerrado_en_ventana
 * Límite estricto (D5): 89d interacción, exactamente 90d interacción, 91d
 * reingreso — la comparación es `>`, nunca `>=`.
 */
export function decideAccionDeduplicacion(
  estado: DeduplicacionState,
  ahora: Date,
): DeduplicacionAction {
  if (estado.leadAbierto !== null) {
    return {
      kind: "interaccion_repetida",
      leadId: estado.leadAbierto.id,
      motivo: "lead_abierto",
    };
  }

  if (estado.ultimoLeadCerrado === null) {
    return { kind: "crear_lead", origen: "NUEVO" };
  }

  const diffMs = ahora.getTime() - estado.ultimoLeadCerrado.cerradoEn.getTime();

  if (diffMs > VENTANA_REINGRESO_MS) {
    return { kind: "crear_lead", origen: "REINGRESO" };
  }

  return {
    kind: "interaccion_repetida",
    leadId: estado.ultimoLeadCerrado.id,
    motivo: "lead_cerrado_en_ventana",
    diasDesdeCierre: Math.floor(diffMs / DIA_MS),
  };
}
