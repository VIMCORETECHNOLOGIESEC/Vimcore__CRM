import type { RolUsuario } from "@prisma/client";

/**
 * Mismo criterio que `leads.access.ts` (`canEdit`): Administrador/Supervisor
 * siempre; el resto solo si es el asesor asignado ACTUAL de la conversación
 * (`Conversacion.asesorId`, el puntero de ruteo vigente — nunca un asesor
 * histórico de `ConversacionEvento`). Vendedor nunca tiene acceso: WhatsApp
 * es mensajería asesor↔cliente, el pool `VENDEDOR` no participa (D-mensajería).
 */
export interface UsuarioAccesoConversacion {
  id: string;
  rol: RolUsuario;
  empresaId: string | null;
}

export interface ConversacionAcceso {
  asesorId: string | null;
  empresaId: string;
}

/** Exportado (a diferencia de `leads.access.ts`): `conversaciones.service.ts::buildWhere` lo reusa para el filtro de listado. */
export const ROLES_ACCESO_TOTAL: readonly RolUsuario[] = ["ADMINISTRADOR", "SUPERVISOR"];

function empresaCoincide(usuario: UsuarioAccesoConversacion, conversacion: ConversacionAcceso): boolean {
  return usuario.empresaId === null || usuario.empresaId === conversacion.empresaId;
}

export function canView(usuario: UsuarioAccesoConversacion, conversacion: ConversacionAcceso): boolean {
  if (!empresaCoincide(usuario, conversacion)) return false;
  if (ROLES_ACCESO_TOTAL.includes(usuario.rol)) return true;
  return usuario.id === conversacion.asesorId;
}

/** Responder un mensaje exige la misma titularidad que ver la conversación — no hay una regla más laxa para lectura. */
export const canReply = canView;
