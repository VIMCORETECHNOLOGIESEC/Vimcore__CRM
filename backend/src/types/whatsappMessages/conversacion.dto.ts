import type { DireccionMensaje, TipoEventoConversacion } from "@prisma/client";

export interface ConversacionListItemDto {
  id: string;
  clienteId: string;
  clienteNombre: string | null;
  clienteTelefono: string | null;
  asesorId: string | null;
  asesorNombre: string | null;
  ultimoMensajeEn: string | null;
  creadaEn: string;
}

export interface ConversacionListResultDto {
  conversaciones: ConversacionListItemDto[];
  total: number;
}

export interface MensajeDto {
  id: string;
  conversacionId: string;
  direccion: DireccionMensaje;
  texto: string | null;
  usuarioId: string | null;
  enviadoEn: string;
}

export interface MensajesListResultDto {
  mensajes: MensajeDto[];
  total: number;
}

/** Forma interna del payload que reconstruye el ruteo de una `Conversacion` — nunca sale por HTTP tal cual. */
export interface ConversacionEventoResumen {
  tipo: TipoEventoConversacion;
  ocurridoEn: Date;
}
