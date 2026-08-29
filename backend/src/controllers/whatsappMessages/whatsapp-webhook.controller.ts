import type { Request, Response } from "express";
import { AppError } from "../../lib/app-error.js";
import { verifyFirmaMeta } from "../../lib/firma-meta.js";
import { logger } from "../../lib/logger.js";
import { whatsappWebhookNotificationSchema } from "../../schemas/whatsappMessages/whatsapp-webhook.schema.js";
import {
  procesarWebhookWhatsApp,
  verificarHandshakeWhatsApp,
} from "../../services/whatsappMessages/whatsapp-webhook.service.js";

/**
 * Handshake de verificación (`GET /webhooks/whatsapp`) — mismo patrón que
 * `meta-webhook.controller.ts::getIngestaMetaHandshake`: responder EXACTAMENTE
 * el `hub.challenge` como texto plano si `hub.verify_token` coincide.
 */
export function getWebhookWhatsAppHandshake(req: Request, res: Response): void {
  const mode = req.query["hub.mode"];
  const verifyToken = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (
    typeof mode === "string"
    && typeof verifyToken === "string"
    && typeof challenge === "string"
    && verificarHandshakeWhatsApp(mode, verifyToken)
  ) {
    res.status(200).type("text/plain").send(challenge);
    return;
  }

  throw new AppError("handshake_whatsapp_invalido", 403, "hub.verify_token inválido o parámetros faltantes");
}

/**
 * `POST /webhooks/whatsapp` — mensaje entrante. NO pasa por
 * `requireBridgeKey`/`requireAuthentication`: se autentica por
 * `X-Hub-Signature-256` contra `req.rawBody` (`lib/firma-meta.ts`, ya
 * capturado globalmente en `app.ts`), mismo mecanismo que
 * `meta-webhook.controller.ts::postIngestaMeta`. Firma inválida → 401, el
 * mensaje NUNCA se procesa. Payload sin la forma esperada → 200 igual: no
 * hay ningún mensaje que perder ahí, y devolver un error solo lograría que
 * Meta reintregue el mismo sobre irreconocible indefinidamente.
 */
export async function postWebhookWhatsApp(req: Request, res: Response): Promise<void> {
  const firmaValida = verifyFirmaMeta(req.rawBody, req.header("X-Hub-Signature-256"));
  if (!firmaValida) {
    logger.warn(
      { event: "whatsapp_firma_invalida", holdingWide: true },
      "whatsapp-webhook: firma X-Hub-Signature-256 inválida o ausente",
    );
    throw new AppError("firma_whatsapp_invalida", 401, "Firma X-Hub-Signature-256 inválida o ausente");
  }

  const parsed = whatsappWebhookNotificationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(200).send();
    return;
  }

  await procesarWebhookWhatsApp(parsed.data);
  res.status(200).send();
}
