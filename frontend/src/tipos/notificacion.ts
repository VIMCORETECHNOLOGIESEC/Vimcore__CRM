/**
 * Tipos compartidos con el backend para notificaciones (docs/03-modelo-datos.md
 * §`notificaciones`, docs/06-modulos-backend.md M8). Mantenerlos sincronizados
 * manualmente: el frontend no comparte el cliente de Prisma generado (mismo
 * criterio que `tipos/lead.ts`).
 */

/**
 * Sincronizado contra el enum real de Prisma (`backend/prisma/schema.prisma`,
 * `TipoNotificacion`) -- 13 valores. Los últimos 5 se agregaron
 * append-only en integraciones posteriores a la propuesta original de
 * `docs/02-reglas-negocio.md` §8: `INTERACCION_REPETIDA` (interacción
 * repetida de un mismo lead/canal), `LEAD_DATO_INCOMPLETO` (log de bridge
 * ADVERTENCIA por datos incompletos), `ASIGNACION_CONFLICTO` (agotamiento
 * del CAS de asignación), `CANAL_O_PRODUCTO_FALTANTE` y
 * `WHATSAPP_NO_CONECTADO` (avisos manuales Supervisor/Asesor ->
 * Administrador) y `WHATSAPP_MENSAJE_NUEVO` (push en vivo de mensajes de
 * WhatsApp a la campanita).
 */
export type TipoNotificacion =
  | "LEAD_ASIGNADO"
  | "LEAD_TRASPASADO"
  | "LEAD_SIN_ATENDER"
  | "LEAD_SIN_ASIGNAR"
  | "RECORDATORIO_CITA"
  | "ERROR_BRIDGE"
  | "INTERACCION_REPETIDA"
  | "TOKEN_POR_EXPIRAR"
  | "LEAD_DATO_INCOMPLETO"
  | "ASIGNACION_CONFLICTO"
  | "CANAL_O_PRODUCTO_FALTANTE"
  | "WHATSAPP_NO_CONECTADO"
  | "WHATSAPP_MENSAJE_NUEVO";

export interface Notificacion {
  id: string;
  usuarioId: string;
  tipo: TipoNotificacion;
  /** Único valor válido en el MVP (docs/03 §`notificaciones.canal`). */
  canal: "IN_APP";
  titulo: string;
  mensaje: string;
  /** Navegación directa al lead relacionado; `null` para eventos sin lead (ej. bridge, token). */
  leadId: string | null;
  /** `null` mientras no se haya marcado como leída. */
  leidaEn: string | null;
  creadaEn: string;
  /**
   * Denormalizado desde `Lead.empresaId` cuando hay `leadId`; `null` para
   * notificaciones holding-wide (`backend/prisma/schema.prisma`, modelo
   * `Notificacion`).
   */
  empresaId: string | null;
  /**
   * Payload estructurado libre por tipo de notificación (ej.
   * `{ conversacionId: string }` para `WHATSAPP_MENSAJE_NUEVO`). `null` para
   * toda notificación que no lo necesita.
   */
  metadata: Record<string, unknown> | null;
}
