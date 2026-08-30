import { z } from "zod";

/**
 * Forma real del webhook de WhatsApp Cloud API (Meta, "Webhooks for
 * WhatsApp Business Platform"). Mismo principio que
 * `meta-webhook.schema.ts` (AGENTS.md §4.4, "nunca confiar en el payload de
 * un webhook"): valida solo la forma, la lógica de negocio vive en
 * `services/whatsappMessages/whatsapp-webhook.service.ts`.
 */
const whatsappProfileSchema = z.object({ name: z.string().optional() });

const whatsappContactSchema = z.object({
  wa_id: z.string().trim().min(1),
  profile: whatsappProfileSchema.optional(),
});

const whatsappTextSchema = z.object({ body: z.string() });

/**
 * `type` cubre todo el catálogo de Meta (text/image/audio/video/document/
 * sticker/location/contacts/interactive/button/system/reaction/unknown) —
 * solo `text` tiene cuerpo tipado acá; el resto persiste `payloadOriginal`
 * completo sin texto (D-mensajería: "no descartar el mensaje, solo el
 * cuerpo que no sabemos interpretar todavía").
 */
const whatsappMessageSchema = z.object({
  id: z.string().trim().min(1),
  from: z.string().trim().min(1),
  timestamp: z.string().trim().min(1),
  type: z.string(),
  text: whatsappTextSchema.optional(),
});

const whatsappMetadataSchema = z.object({
  phone_number_id: z.string().trim().min(1),
  display_phone_number: z.string().optional(),
});

const whatsappValueSchema = z.object({
  messaging_product: z.literal("whatsapp").optional(),
  metadata: whatsappMetadataSchema,
  contacts: z.array(whatsappContactSchema).default([]),
  messages: z.array(whatsappMessageSchema).default([]),
  // `statuses` (delivered/read/sent/failed de mensajes SALIENTES) llega en el
  // mismo tipo de notificación — se acepta la forma pero el service la
  // ignora (D-mensajería: fuera de alcance de este cambio, no hay tracking
  // de estado de entrega en `Mensaje`).
  statuses: z.array(z.unknown()).default([]),
});

const whatsappChangeSchema = z.object({
  field: z.string(),
  value: whatsappValueSchema,
});

const whatsappEntrySchema = z.object({
  id: z.string(),
  changes: z.array(whatsappChangeSchema).default([]),
});

export const whatsappWebhookNotificationSchema = z.object({
  object: z.string(),
  entry: z.array(whatsappEntrySchema).default([]),
});

export type WhatsAppWebhookNotificationBody = z.infer<typeof whatsappWebhookNotificationSchema>;
export type WhatsAppWebhookValue = z.infer<typeof whatsappValueSchema>;
export type WhatsAppWebhookMessage = z.infer<typeof whatsappMessageSchema>;
