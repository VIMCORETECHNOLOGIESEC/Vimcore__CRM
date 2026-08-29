import { logger } from "../../lib/logger.js";
import { runWithTenantContext } from "../../lib/prisma.js";
import * as whatsappConexionRepository from "../../repositories/whatsappMessages/whatsapp-conexion.repository.js";
import { adaptWhatsAppWebhook } from "../../adapters/whatsappMessages/whatsapp-webhook.adapter.js";
import { env } from "../../config/env.js";
import type { WhatsAppWebhookNotificationBody } from "../../schemas/whatsappMessages/whatsapp-webhook.schema.js";
import { procesarMensajeEntrante } from "./whatsapp-ruteo.service.js";

/**
 * Handshake de verificación del webhook (`GET /webhooks/whatsapp`) — mismo
 * mecanismo `hub.verify_token`/`hub.challenge` que
 * `meta-webhook.service.ts::verificarHandshake`, reusado tal cual (una sola
 * app de Meta, un solo verify token compartido — ver la nota de diseño en
 * `config/env.ts`). Redeclarada acá en vez de importada porque
 * `verificarHandshake` no está exportada como una función genérica de
 * propósito general fuera de ese archivo — es trivial y pura, sin
 * duplicar ningún dato (usa el mismo `env.META_WEBHOOK_VERIFY_TOKEN`).
 */
export function verificarHandshakeWhatsApp(mode: string, verifyToken: string): boolean {
  return mode === "subscribe" && verifyToken === env.META_WEBHOOK_VERIFY_TOKEN;
}

/**
 * Notificación de mensajes entrantes (`POST /webhooks/whatsapp`). A
 * diferencia de la ingesta de leads (`leads_recibidos`), NO hay buzón
 * durable acá (brief, "la ingesta durable NO aplica"): cada mensaje se
 * procesa directo dentro de esta misma request; si algo falla, Meta
 * reintenta la entrega del webhook por su cuenta (comportamiento estándar).
 *
 * Mismo criterio que `meta-webhook.service.ts::procesarNotificacionMeta`: el
 * webhook se autentica por firma de la app (verificada en el controller),
 * nunca por empresa — un solo POST puede traer mensajes de números
 * (empresas) distintos, así que la resolución de `WhatsAppConexion` por
 * `numero_telefono_id` corre holding-wide (D3, vía el ROL DE APLICACIÓN
 * `crm_app`, nunca `crm_bypass_jobs` — este es un camino HTTP). El
 * procesamiento real de cada mensaje (`procesarMensajeEntrante`) corre luego
 * scoped a la empresa real de esa conexión.
 */
export async function procesarWebhookWhatsApp(body: WhatsAppWebhookNotificationBody): Promise<void> {
  const mensajes = adaptWhatsAppWebhook(body);
  if (mensajes.length === 0) return;

  await runWithTenantContext({ empresaId: null }, async () => {
    for (const mensaje of mensajes) {
      const conexion = await whatsappConexionRepository.findByNumeroTelefonoId(mensaje.numeroTelefonoId);
      if (!conexion) {
        logger.warn(
          {
            event: "whatsapp_conexion_no_encontrada",
            holdingWide: true,
            numeroTelefonoId: mensaje.numeroTelefonoId,
          },
          "whatsapp-webhook: no se encontró ninguna WhatsAppConexion para el número entrante",
        );
        continue;
      }

      try {
        await runWithTenantContext({ empresaId: conexion.empresaId }, () =>
          procesarMensajeEntrante(mensaje, { id: conexion.id, empresaId: conexion.empresaId }),
        );
      } catch (error) {
        // Un fallo al procesar UN mensaje nunca debe abortar el resto del
        // lote ni hacer que el controller responda distinto de 200 (mismo
        // principio que `meta-webhook.service.ts::procesarNotificacionMeta`,
        // "no se pierde un lead por un fallo ajeno a la recepción del
        // webhook en sí") — Meta reintenta la entrega completa del webhook
        // si esta request no responde 200, así que un mensaje ya procesado
        // exitosamente en un intento anterior se re-procesa de forma
        // idempotente (`mensaje.repository.ts::upsertEntrante`).
        logger.error(
          { err: error, empresaId: conexion.empresaId, wamid: mensaje.wamid },
          "whatsapp-webhook: fallo al procesar un mensaje entrante",
        );
      }
    }
  });
}
