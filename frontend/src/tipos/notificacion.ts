/**
 * Tipos compartidos con el backend para notificaciones (docs/03-modelo-datos.md
 * §`notificaciones`, docs/06-modulos-backend.md M8). Mantenerlos sincronizados
 * manualmente: el frontend no comparte el cliente de Prisma generado (mismo
 * criterio que `tipos/lead.ts`).
 */

/**
 * `docs/02-reglas-negocio.md` §8 documenta 7 eventos que generan notificación,
 * pero no fija el nombre exacto del enum `tipo` de la tabla `notificaciones`
 * -- estos valores son una propuesta razonable (un caso por fila de esa
 * tabla), a validar contra el enum real de Prisma cuando M8 exista.
 */
export type TipoNotificacion =
  | "LEAD_ASIGNADO"
  | "LEAD_TRASPASADO"
  | "LEAD_SIN_ATENDER"
  | "LEAD_SIN_ASIGNAR"
  | "RECORDATORIO_CITA"
  | "ERROR_BRIDGE"
  | "TOKEN_POR_EXPIRAR";

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
}
