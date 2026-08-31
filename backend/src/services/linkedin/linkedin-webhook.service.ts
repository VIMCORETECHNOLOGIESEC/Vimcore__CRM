import { env } from "../../config/env.js";
import { AppError } from "../../lib/app-error.js";
import { logger } from "../../lib/logger.js";
import {
  computeLinkedInChallengeResponse,
  verifyFirmaLinkedIn as verifyFirmaLinkedInSignature,
} from "../../lib/firma-linkedin.js";
import { INGESTA_ACCEPT_TRANSACTION_BOUNDS, runInTransaction, runWithTenantContext } from "../../lib/prisma.js";
import { adaptLinkedIn } from "../../adapters/linkedin.adapter.js";
import * as leadRecibidoRepository from "../../repositories/lead-recibido.repository.js";
import * as linkedinFuenteRepository from "../../repositories/linkedin/linkedin-fuente.repository.js";
import type { LeadEntrante } from "../../types/lead-entrante.js";
import { linkedinLeadFormResponseSchema } from "../../schemas/linkedin/linkedin-leads.schema.js";
import type {
  LinkedInNotificationBody,
  LinkedInNotificationOwner,
} from "../../schemas/linkedin/linkedin-webhook.schema.js";
import { registrarBridgeLog } from "../bridge-log.service.js";
import { createProductionLinkedInApiClient } from "./linkedin-api.service.js";
import { withLinkedInAccessToken } from "./linkedin-token.service.js";

const LEAD_FORM_RESPONSE_URN_PREFIX = "urn:li:leadGenFormResponse:";

function configurationUnavailable(): AppError {
  return new AppError(
    "linkedin_oauth_no_configurado",
    503,
    "La integración de LinkedIn no está configurada",
  );
}

/**
 * Handshake de validación del webhook (learn.microsoft.com/en-us/linkedin/
 * shared/api-guide/webhook-validation, verificado 2026-08-31): el proceso
 * NO arranca sin `LINKEDIN_CLIENT_SECRET` para poder responder este GET —
 * mismo criterio que `linkedin-subscription.service.ts::configurationUnavailable`.
 */
export function verificarChallengeLinkedIn(challengeCode: string): string {
  if (!env.LINKEDIN_CLIENT_SECRET) throw configurationUnavailable();
  return computeLinkedInChallengeResponse(challengeCode, env.LINKEDIN_CLIENT_SECRET);
}

export function verifyFirmaLinkedIn(
  rawBody: Buffer | undefined,
  signatureHeader: string | undefined,
): boolean {
  return verifyFirmaLinkedInSignature(rawBody, signatureHeader, env.LINKEDIN_CLIENT_SECRET);
}

function ownerUrnFrom(owner: LinkedInNotificationOwner): string {
  // `linkedinNotificationOwnerSchema` ya garantizó (vía `superRefine`) que
  // exactamente una de las dos keys está presente.
  return (owner.organization ?? owner.sponsoredAccount) as string;
}

function leadFormResponseIdFrom(urn: string): string {
  return urn.startsWith(LEAD_FORM_RESPONSE_URN_PREFIX)
    ? urn.slice(LEAD_FORM_RESPONSE_URN_PREFIX.length)
    : urn;
}

async function registrarLogSeguro(data: Parameters<typeof registrarBridgeLog>[0]): Promise<void> {
  try {
    await registrarBridgeLog(data);
  } catch (error) {
    logger.error({ err: error, bridgeId: data.bridgeId }, "linkedin-webhook: fallo al registrar bridge_logs");
  }
}

/**
 * Encolado durable de la notificación de LinkedIn (mismo patrón que
 * `meta-webhook.service.ts::encolarLeadgenMeta`: buzón `leads_recibidos`,
 * idempotente por `(bridge_id, id_externo_lead)`). `leadAction: "DELETED"`
 * se descarta sin encolar nada — no existe ningún flujo de "borrar lead" en
 * este proyecto y no corresponde inventarlo acá (decisión de alcance, no un
 * TODO pendiente).
 *
 * `runWithTenantContext({ empresaId: null })` (D3, "holding-wide" vía el rol
 * de aplicación): este webhook se autentica por `X-LI-Signature` (secreto
 * único de la app, nunca por bridge/empresa), así que no hay un
 * `TenantContext` de request que fijar de antemano — mismo criterio que
 * `procesarNotificacionMeta`.
 */
export async function encolarNotificacionLinkedIn(body: LinkedInNotificationBody): Promise<void> {
  if (body.leadAction !== "CREATED") {
    logger.info(
      { leadGenFormResponse: body.leadGenFormResponse, leadAction: body.leadAction },
      "linkedin-webhook: notificación no CREATED descartada (sin flujo de borrado en este proyecto)",
    );
    return;
  }

  await runWithTenantContext({ empresaId: null }, async () => {
    const ownerUrn = ownerUrnFrom(body.owner);
    const fuente = await linkedinFuenteRepository.findActiveByOwner(ownerUrn, body.leadType);

    if (fuente === null) {
      await registrarLogSeguro({
        bridgeId: null,
        holdingWide: true,
        nivel: "ERROR",
        mensaje: `LinkedIn: no se encontró ninguna fuente activa para el owner ${ownerUrn}`,
        payload: { ownerUrn, leadType: body.leadType, leadGenFormResponse: body.leadGenFormResponse },
      });
      return;
    }

    // Bloque C (D2 gap closure, mismo motivo que `encolarLeadgenMeta`):
    // `aceptarLinkedInPendiente` hace un `$queryRaw` suelto — envolverlo en
    // `runInTransaction` hace que `applyTenantGucs` corra primero, fijando
    // `app.tenant_unrestricted = 'on'` (holding-wide, D3), necesario porque
    // un solo webhook puede traer leads de owners de distintas empresas.
    await runInTransaction(
      undefined,
      (tx) =>
        leadRecibidoRepository.aceptarLinkedInPendiente(
          {
            bridgeId: fuente.bridgeId,
            leadFormResponseId: leadFormResponseIdFrom(body.leadGenFormResponse),
            leadGenFormResponse: body.leadGenFormResponse,
            occurredAt: body.occurredAt,
          },
          new Date(),
          tx,
        ),
      INGESTA_ACCEPT_TRANSACTION_BOUNDS,
    );
  });
}

/**
 * Resuelve un `LeadEntrante` completo a partir de un sobre
 * `LINKEDIN_PENDIENTE_DETALLE` ya encolado — mismo criterio que
 * `meta-webhook.service.ts::resolverLeadgenMeta`: corre en el worker,
 * DESPUÉS del commit del recibo (`ingesta.service.ts::procesarRecepcion`,
 * llamador único), nunca dentro de una transacción de Postgres abierta (I/O
 * de red lento contra la API de LinkedIn). A diferencia de Meta, LinkedIn no
 * necesita re-derivar `bridgeId` desde un identificador externo: ya lo
 * conoce (columna `bridge_id` de la fila que encoló el `POST`), así que no
 * repite el patrón de doble consulta de `resolverLeadgenMeta`.
 *
 * Sin reintentos con backoff propios (a diferencia de
 * `consultarDetalleLead` de Meta): `withLinkedInAccessToken`/
 * `LinkedInApiClient` ya clasifican y propagan los errores del proveedor de
 * forma razonable (token expirado, rate limit, error genérico) como
 * `AppError`, que el llamador (`ingesta-inbox.job.ts::runIngestionOnce`)
 * reintenta con el mismo mecanismo de backoff (60s/300s) que cualquier otra
 * entrada del buzón — agregar un segundo nivel de reintento acá sería
 * redundante.
 */
export async function resolverLinkedInLeadFormResponse(pendiente: {
  leadFormResponseId: string;
  leadGenFormResponse: string;
  occurredAt: number;
  bridgeId: string;
}): Promise<LeadEntrante> {
  const { leadFormResponseId, leadGenFormResponse, occurredAt, bridgeId } = pendiente;

  const detalle = await withLinkedInAccessToken(bridgeId, async (accessToken) => {
    const apiClient = createProductionLinkedInApiClient(accessToken);
    const body = await apiClient.getJson(`/leadFormResponses/${encodeURIComponent(leadFormResponseId)}`);
    const parsed = linkedinLeadFormResponseSchema.safeParse(body);
    if (!parsed.success) {
      const mensaje = `LinkedIn: la respuesta de /leadFormResponses/${leadFormResponseId} no tiene la forma esperada`;
      await registrarLogSeguro({ bridgeId, nivel: "ERROR", mensaje, payload: { leadFormResponseId } });
      throw new AppError("linkedin_detalle_invalido", 500, mensaje);
    }
    return parsed.data;
  });

  return adaptLinkedIn(detalle, bridgeId, `${leadGenFormResponse}:${occurredAt}`);
}
