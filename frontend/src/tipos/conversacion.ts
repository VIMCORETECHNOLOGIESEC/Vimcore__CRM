/**
 * Tipos compartidos con el backend para la bandeja de conversaciones de
 * WhatsApp (mensajería entrante/saliente) -- contrato real en
 * `docs/contrato-frontend-whatsapp-api_mat_04.md`, secciones 4-6.
 *
 * Separado a propósito de `tipos/whatsapp.ts`, que cubre solo el flujo de
 * conexión OAuth (Embedded Signup de Meta, secciones 1-3). Un mensaje no es
 * una conexión: distinto ciclo de vida, distintos endpoints.
 */

/** Dirección de un mensaje respecto de la empresa: lo recibió o lo envió un asesor. */
export type DireccionMensaje = "ENTRANTE" | "SALIENTE";

/**
 * Fila del listado paginado `GET /conversaciones`, ordenado por
 * `ultimoMensajeEn` desc en el servidor. No hay endpoint de detalle por id:
 * los datos de cabecera (cliente, asesor) salen de esta misma fila.
 */
export interface ConversacionListItem {
  id: string;
  clienteId: string;
  clienteNombre: string | null;
  clienteTelefono: string | null;
  asesorId: string | null;
  asesorNombre: string | null;
  /** ISO 8601. `null` si la conversación todavía no tiene mensajes. */
  ultimoMensajeEn: string | null;
  /** ISO 8601. */
  creadaEn: string;
  /**
   * D-mensajería (leído/no leído): calculado server-side por usuario
   * (`ConversacionListItemDto`, `toListItemDto` en el backend). `true` si el
   * usuario en sesión todavía no marcó esta conversación como leída
   * (`POST /conversaciones/:id/leido`).
   */
  noLeido: boolean;
}

/** Un mensaje dentro de una conversación (`GET /conversaciones/:id/mensajes`). */
export interface Mensaje {
  id: string;
  conversacionId: string;
  direccion: DireccionMensaje;
  /** `null` para mensajes sin texto (adjuntos no soportados en el MVP). */
  texto: string | null;
  /** Asesor que escribió un mensaje SALIENTE; `null` en los ENTRANTE. */
  usuarioId: string | null;
  /** ISO 8601. */
  enviadoEn: string;
}
