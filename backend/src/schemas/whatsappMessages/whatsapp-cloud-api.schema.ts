import { z } from "zod";

/** Respuesta de `POST /{numero_telefono_id}/messages` — validada por ser una API externa, mismo criterio que `metaLeadgenDetalleSchema`. */
export const whatsappEnvioMensajeRespuestaSchema = z.object({
  messaging_product: z.literal("whatsapp").optional(),
  messages: z.array(z.object({ id: z.string().trim().min(1) })).min(1),
});

/** Respuesta de `GET /me/businesses`. */
export const whatsappBusinessesRespuestaSchema = z.object({
  data: z.array(z.object({ id: z.string().trim().min(1), name: z.string().optional() })).default([]),
});

/** Respuesta de `GET /{business_id}/owned_whatsapp_business_accounts`. */
export const whatsappOwnedWabaRespuestaSchema = z.object({
  data: z.array(z.object({ id: z.string().trim().min(1), name: z.string().optional() })).default([]),
});

/** Respuesta de `GET /{waba_id}/phone_numbers`. */
export const whatsappPhoneNumbersRespuestaSchema = z.object({
  data: z
    .array(
      z.object({
        id: z.string().trim().min(1),
        display_phone_number: z.string().trim().min(1),
        verified_name: z.string().optional(),
      }),
    )
    .default([]),
});

export type WhatsAppEnvioMensajeRespuesta = z.infer<typeof whatsappEnvioMensajeRespuestaSchema>;
export type WhatsAppBusinessesRespuesta = z.infer<typeof whatsappBusinessesRespuestaSchema>;
export type WhatsAppOwnedWabaRespuesta = z.infer<typeof whatsappOwnedWabaRespuestaSchema>;
export type WhatsAppPhoneNumbersRespuesta = z.infer<typeof whatsappPhoneNumbersRespuestaSchema>;
