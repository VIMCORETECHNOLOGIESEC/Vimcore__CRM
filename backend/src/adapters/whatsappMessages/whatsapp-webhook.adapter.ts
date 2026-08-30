import type { WhatsAppWebhookNotificationBody } from "../../schemas/whatsappMessages/whatsapp-webhook.schema.js";
import type { WhatsAppMensajeEntrante } from "../../types/whatsappMessages/whatsapp-mensaje-entrante.js";

/**
 * Traduce el sobre crudo de Meta a una lista plana de mensajes entrantes
 * normalizados — un solo POST puede traer varios `entry`/`changes`/
 * `messages` juntos (mismo idioma que `meta.adapter.ts` para leadgen). Pura,
 * sin I/O: solo reformatea lo que `whatsappWebhookNotificationSchema` ya
 * validó.
 *
 * `contacts[].wa_id` es el remitente reportado por Meta para el `messages[]`
 * correspondiente en el mismo `value` — se resuelve el nombre de perfil por
 * `wa_id` (mapa), nunca por posición de array (Meta no garantiza el mismo
 * orden entre `contacts` y `messages`).
 */
export function adaptWhatsAppWebhook(
  body: WhatsAppWebhookNotificationBody,
): WhatsAppMensajeEntrante[] {
  const mensajes: WhatsAppMensajeEntrante[] = [];

  for (const entry of body.entry) {
    for (const change of entry.changes) {
      if (change.field !== "messages") continue;
      const { value } = change;
      if (value.messages.length === 0) continue;

      const nombresPorWaId = new Map<string, string | null>();
      for (const contacto of value.contacts) {
        nombresPorWaId.set(contacto.wa_id, contacto.profile?.name ?? null);
      }

      for (const mensaje of value.messages) {
        mensajes.push({
          numeroTelefonoId: value.metadata.phone_number_id,
          waId: mensaje.from,
          nombrePerfil: nombresPorWaId.get(mensaje.from) ?? null,
          wamid: mensaje.id,
          texto: mensaje.type === "text" ? (mensaje.text?.body ?? null) : null,
          // Meta reporta el timestamp en segundos Unix (string) — `* 1000` para `Date`.
          enviadoEn: new Date(Number.parseInt(mensaje.timestamp, 10) * 1_000),
          payloadOriginal: mensaje,
        });
      }
    }
  }

  return mensajes;
}
