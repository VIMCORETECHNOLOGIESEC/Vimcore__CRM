import type { Request, Response } from "express";
import { AppError } from "../../lib/app-error.js";
import { logger } from "../../lib/logger.js";
import { linkedinNotificationSchema, linkedinWebhookChallengeQuerySchema } from "../../schemas/linkedin/linkedin-webhook.schema.js";
import { registrarBridgeLog } from "../../services/bridge-log.service.js";
import {
  encolarNotificacionLinkedIn,
  verificarChallengeLinkedIn,
  verifyFirmaLinkedIn,
} from "../../services/linkedin/linkedin-webhook.service.js";

/**
 * Handshake de validación (learn.microsoft.com/en-us/linkedin/shared/
 * api-guide/webhook-validation): LinkedIn hace `GET <webhookUrl>?
 * challengeCode=<uuid>` y espera EXACTAMENTE
 * `{ challengeCode, challengeResponse }` como JSON — a diferencia del
 * handshake de Meta (`hub.challenge` en texto plano).
 */
export function getLinkedInWebhookHandshake(req: Request, res: Response): void {
  const parsed = linkedinWebhookChallengeQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError("linkedin_handshake_invalido", 403, "challengeCode inválido o ausente");
  }

  const challengeResponse = verificarChallengeLinkedIn(parsed.data.challengeCode);
  res.status(200).json({ challengeCode: parsed.data.challengeCode, challengeResponse });
}

/**
 * Notificación de Lead Sync. NO pasa por `requireBridgeKey`/JWT: se
 * autentica por `X-LI-Signature` (HMAC-SHA256 con `LINKEDIN_CLIENT_SECRET`
 * sobre `req.rawBody`, ver `lib/firma-linkedin.ts`). Firma inválida o
 * ausente → 401, el lead NUNCA se procesa (mismo criterio que
 * `meta-webhook.controller.ts::postIngestaMeta`).
 *
 * Firma válida pero payload sin la forma esperada → 200 igual: no hay nada
 * que perder ahí, y devolver un error solo lograría que LinkedIn reintente
 * indefinidamente el mismo sobre irreconocible.
 */
export async function postLinkedInWebhook(req: Request, res: Response): Promise<void> {
  const firmaValida = verifyFirmaLinkedIn(req.rawBody, req.header("X-LI-Signature"));

  if (!firmaValida) {
    await registrarLogRechazoFirmaSeguro();
    throw new AppError("firma_linkedin_invalida", 401, "Firma X-LI-Signature inválida o ausente");
  }

  const parsed = linkedinNotificationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(200).send();
    return;
  }

  await encolarNotificacionLinkedIn(parsed.data);
  res.status(200).send();
}

async function registrarLogRechazoFirmaSeguro(): Promise<void> {
  try {
    await registrarBridgeLog({
      bridgeId: null,
      holdingWide: true,
      nivel: "ERROR",
      mensaje: "Firma X-LI-Signature inválida o ausente en webhook de LinkedIn",
    });
  } catch (error) {
    logger.error({ err: error }, "linkedin-webhook: fallo al registrar bridge_logs de firma inválida");
  }
}
