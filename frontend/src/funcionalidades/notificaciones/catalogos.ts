import type { TipoNotificacion } from "@/tipos/notificacion";

/** Etiqueta en español de cada tipo de notificación (docs/02-reglas-negocio.md §8). */
export const TIPO_NOTIFICACION_ETIQUETAS: Record<TipoNotificacion, string> = {
  LEAD_ASIGNADO: "Lead asignado",
  LEAD_TRASPASADO: "Lead traspasado",
  LEAD_SIN_ATENDER: "Lead sin atender",
  LEAD_SIN_ASIGNAR: "Lead sin asignar",
  RECORDATORIO_CITA: "Recordatorio de cita",
  ERROR_BRIDGE: "Error de bridge",
  INTERACCION_REPETIDA: "Interacción repetida",
  TOKEN_POR_EXPIRAR: "Token por expirar",
  LEAD_DATO_INCOMPLETO: "Dato incompleto",
  ASIGNACION_CONFLICTO: "Conflicto de asignación",
  CANAL_O_PRODUCTO_FALTANTE: "Falta canal o producto",
  WHATSAPP_NO_CONECTADO: "WhatsApp no conectado",
  WHATSAPP_MENSAJE_NUEVO: "Nuevo mensaje de WhatsApp",
};
