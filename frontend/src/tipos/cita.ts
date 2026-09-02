/**
 * Panel de citas (F4, docs/07-modulos-frontend.md). El backend real (M7)
 * todavía no tiene un modelo Prisma de `Cita` -- ver
 * `funcionalidades/leads/detalle/leadDetalle.api.ts` para el mock y los
 * puntos de integración pendientes (`INTEGRACION-BACKEND`).
 */
export type ModalidadCita = "PRESENCIAL" | "VIRTUAL" | "TELEFONICA";

export type EstadoCita = "AGENDADA" | "CUMPLIDA" | "NO_ASISTIO" | "REPROGRAMADA" | "CANCELADA";

export interface Cita {
  id: string;
  leadId: string;
  /** Responsable operativo que agenda/atiende la cita. */
  usuarioId: string;
  /** ISO 8601 (UTC). */
  programadaPara: string;
  /** ISO 8601 (UTC). Opcional para tolerar respuestas antiguas del detalle de lead. */
  finalizaEn?: string;
  modalidad: ModalidadCita;
  estado: EstadoCita;
  notas?: string;
}
