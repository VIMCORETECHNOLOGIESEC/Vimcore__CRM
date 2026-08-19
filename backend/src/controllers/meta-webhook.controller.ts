import type { Request, Response } from "express";
import { AppError } from "../lib/app-error.js";
import { logger } from "../lib/logger.js";
import { verifyFirmaMeta } from "../lib/firma-meta.js";
import { metaWebhookNotificationSchema } from "../schemas/meta-webhook.schema.js";
import { registrarBridgeLog } from "../services/bridge-log.service.js";
import { procesarNotificacionMeta, verificarHandshake } from "../services/meta-webhook.service.js";

/**
 * Handshake de suscripción del webhook (docs/05-bridges.md §3): Meta hace
 * `GET` con `hub.mode=subscribe`, `hub.verify_token`, `hub.challenge`.
 * Responder EXACTAMENTE el `hub.challenge` como texto plano si el token
 * coincide — Meta rechaza la suscripción si la respuesta es JSON o si el
 * cuerpo no es idéntico al challenge recibido.
 */
export function getIngestaMetaHandshake(req: Request, res: Response): void {
  const mode = req.query["hub.mode"];
  const verifyToken = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (
    typeof mode === "string" &&
    typeof verifyToken === "string" &&
    typeof challenge === "string" &&
    verificarHandshake(mode, verifyToken)
  ) {
    res.status(200).type("text/plain").send(challenge);
    return;
  }

  throw new AppError("handshake_meta_invalido", 403, "hub.verify_token inválido o parámetros faltantes");
}

/**
 * Notificación de leadgen (docs/05-bridges.md §2, §3, §8). NO pasa por
 * `requireBridgeKey`: Meta no manda `X-Bridge-Key`, se autentica por
 * `X-Hub-Signature-256` (HMAC-SHA256 con `META_APP_SECRET` sobre
 * `req.rawBody`, ver `app.ts`/`lib/firma-meta.ts`). Firma inválida o ausente
 * → 401 + `bridge_logs` ERROR, el lead NUNCA se procesa (Requirement: Bridge
 * authentication, aplicado al adaptador Meta).
 *
 * Firma válida pero payload sin la forma esperada → 200 igual: no hay ningún
 * lead que perder ahí, y devolver un error solo lograría que Meta reintregue
 * el mismo sobre irreconocible indefinidamente.
 *
 * `procesarNotificacionMeta` (2026-08-18, cambio consciente: patrón durable)
 * YA NO consulta Graph API acá — solo encola cada `leadgen_id` en el mismo
 * buzón `leads_recibidos` que usa el endpoint genérico (idempotente por
 * `(bridgeId, leadgenId)`), así que esta respuesta 200 confirma únicamente
 * el commit del recibo, igual que `POST /api/v1/ingesta/generico`. La
 * consulta de detalle (con sus reintentos), el mapeo a `LeadEntrante` y la
 * actualización de `estadoToken` ante token inválido corren después, en el
 * worker (`meta-webhook.service.ts::resolverLeadgenMeta`, invocado desde
 * `ingesta.service.ts::procesarRecepcion`) — nunca antes de responder este
 * webhook.
 */
export async function postIngestaMeta(req: Request, res: Response): Promise<void> {
  const firmaValida = verifyFirmaMeta(req.rawBody, req.header("X-Hub-Signature-256"));

  if (!firmaValida) {
    await registrarLogRechazoFirmaSeguro();
    throw new AppError("firma_meta_invalida", 401, "Firma X-Hub-Signature-256 inválida o ausente");
  }

  const parsed = metaWebhookNotificationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(200).send();
    return;
  }

  await procesarNotificacionMeta(parsed.data);
  res.status(200).send();
}

async function registrarLogRechazoFirmaSeguro(): Promise<void> {
  try {
    await registrarBridgeLog({
      bridgeId: null,
      nivel: "ERROR",
      mensaje: "Firma X-Hub-Signature-256 inválida o ausente en webhook de Meta",
    });
  } catch (error) {
    logger.error({ err: error }, "meta-webhook: fallo al registrar bridge_logs de firma inválida");
  }
}
