/**
 * Forma normalizada de UN mensaje entrante, ya extraída del payload crudo del
 * webhook de Meta (`adapters/whatsappMessages/whatsapp-webhook.adapter.ts`).
 * `numeroTelefonoId` identifica la `WhatsAppConexion` dueña (nuestro número);
 * `waId`/`nombrePerfil` identifican al remitente (cliente).
 */
export interface WhatsAppMensajeEntrante {
  numeroTelefonoId: string;
  waId: string;
  nombrePerfil: string | null;
  wamid: string;
  /** `null` para tipos de mensaje no soportados aún (imagen, audio, etc.) — se persiste igual, sin texto. */
  texto: string | null;
  enviadoEn: Date;
  payloadOriginal: unknown;
}
