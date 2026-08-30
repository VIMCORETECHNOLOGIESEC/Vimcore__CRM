import type { TipoFuenteLinkedIn } from "@prisma/client";
import { env } from "../../config/env.js";
import { AppError } from "../../lib/app-error.js";
import * as bridgeRepository from "../../repositories/bridge.repository.js";
import * as linkedinFuenteRepository from "../../repositories/linkedin/linkedin-fuente.repository.js";
import type { LinkedInFuenteInternal, LinkedInFuenteSafe } from "../../repositories/linkedin/linkedin-fuente.repository.js";
import type { LinkedInFuenteDto } from "../../types/linkedin/linkedin.dto.js";
import { createProductionLinkedInApiClient, type LinkedInApiClient } from "./linkedin-api.service.js";
import { withLinkedInAccessToken } from "./linkedin-token.service.js";

// Endpoint confirmado (Microsoft Learn, "Lead Syncing", API `leadNotifications`,
// 2026-08): POST crea la suscripción de webhook contra un owner
// (organization/sponsoredAccount); el id vuelve en el header `x-restli-id`
// (misma convención REST.li que `leadForms`). DELETE por id la elimina.
const LEAD_NOTIFICATIONS_RESOURCE = "/leadNotifications";

export interface LinkedInSubscriptionDependencies {
  findBridgeById: typeof bridgeRepository.findById;
  findInternalByIdForBridge: typeof linkedinFuenteRepository.findInternalByIdForBridge;
  setActive: typeof linkedinFuenteRepository.setActive;
  markSubscription: typeof linkedinFuenteRepository.markSubscription;
  withLinkedInAccessToken: typeof withLinkedInAccessToken;
  createApiClient: (accessToken: string) => LinkedInApiClient;
  webhookUrl: () => string;
}

function bridgeNotFound(): AppError {
  return new AppError("bridge_no_encontrado", 404, "Bridge no encontrado");
}

function invalidLinkedInBridge(): AppError {
  return new AppError(
    "linkedin_bridge_invalido",
    422,
    "El bridge no es válido para LinkedIn",
  );
}

function fuenteNotFound(): AppError {
  return new AppError(
    "linkedin_fuente_no_encontrada",
    404,
    "Fuente LinkedIn no encontrada",
  );
}

function linkedinApiError(): AppError {
  return new AppError(
    "linkedin_api_error",
    502,
    "No se pudo consultar la API de LinkedIn",
  );
}

function configurationUnavailable(): AppError {
  return new AppError(
    "linkedin_oauth_no_configurado",
    503,
    "La integración de LinkedIn no está configurada",
  );
}

function sanitizeProviderError(error: unknown): never {
  if (error instanceof AppError) throw error;
  throw linkedinApiError();
}

function toFuenteDto(fuente: LinkedInFuenteSafe): LinkedInFuenteDto {
  return {
    id: fuente.id,
    tipo: fuente.tipo,
    ownerUrn: fuente.ownerUrn,
    nombre: fuente.nombre,
    tipoLead: fuente.tipoLead,
    activa: fuente.activa,
    estadoSuscripcion: fuente.estadoSuscripcion,
    ultimaSincronizacionEn: fuente.ultimaSincronizacionEn?.toISOString() ?? null,
  };
}

function ownerBodyFor(tipo: TipoFuenteLinkedIn, ownerUrn: string): Record<string, string> {
  return tipo === "SPONSORED_ACCOUNT" ? { sponsoredAccount: ownerUrn } : { organization: ownerUrn };
}

function subscriptionPath(subscriptionId: string): string {
  return `${LEAD_NOTIFICATIONS_RESOURCE}/${encodeURIComponent(subscriptionId)}`;
}

async function subscribeLeadNotifications(
  apiClient: LinkedInApiClient,
  fuente: LinkedInFuenteInternal,
  webhookUrl: string,
): Promise<string> {
  try {
    const { restliId } = await apiClient.postJson(LEAD_NOTIFICATIONS_RESOURCE, {
      webhook: webhookUrl,
      owner: ownerBodyFor(fuente.tipo, fuente.ownerUrn),
      leadType: fuente.tipoLead,
    });
    if (!restliId) throw linkedinApiError();
    return restliId;
  } catch (error) {
    return sanitizeProviderError(error);
  }
}

export function createLinkedInSubscriptionService(dependencies: LinkedInSubscriptionDependencies) {
  async function validateLinkedInBridge(bridgeId: string): Promise<void> {
    const bridge = await dependencies.findBridgeById(bridgeId);
    if (!bridge) throw bridgeNotFound();
    if (bridge.redSocial !== "LINKEDIN") throw invalidLinkedInBridge();
  }

  /**
   * Activar solo confirma `activa=true` después de que LinkedIn confirme la
   * suscripción. Si algo falla (permisos, conexión, red), la fuente queda
   * inactiva con `estadoSuscripcion=ERROR` en vez de en un estado ambiguo.
   * Reactivar una fuente ya `ACTIVA` es un no-op: nunca duplica suscripciones.
   */
  async function activar(bridgeId: string, fuente: LinkedInFuenteInternal): Promise<LinkedInFuenteDto> {
    if (fuente.activa && fuente.estadoSuscripcion === "ACTIVA") {
      return toFuenteDto(fuente);
    }

    try {
      const subscriptionId = await dependencies.withLinkedInAccessToken(bridgeId, async (accessToken) => {
        const apiClient = dependencies.createApiClient(accessToken);
        return subscribeLeadNotifications(apiClient, fuente, dependencies.webhookUrl());
      });

      await dependencies.setActive(fuente.id, true);
      const actualizado = await dependencies.markSubscription(fuente.id, {
        estadoSuscripcion: "ACTIVA",
        subscriptionId,
      });
      return toFuenteDto(actualizado);
    } catch (error) {
      await dependencies.setActive(fuente.id, false);
      await dependencies.markSubscription(fuente.id, {
        estadoSuscripcion: "ERROR",
        subscriptionId: null,
      });
      return sanitizeProviderError(error);
    }
  }

  /**
   * Desactivar solo confirma el apagado local después de que LinkedIn
   * confirme la baja (o ya no exista, 404 tratado como éxito por el cliente).
   * Si la baja remota falla, `subscriptionId` se conserva para poder
   * reintentar — nunca se descarta en silencio.
   */
  async function desactivar(bridgeId: string, fuente: LinkedInFuenteInternal): Promise<LinkedInFuenteDto> {
    if (!fuente.activa && !fuente.subscriptionId) {
      return toFuenteDto(fuente);
    }

    if (fuente.subscriptionId) {
      const subscriptionId = fuente.subscriptionId;
      await dependencies
        .withLinkedInAccessToken(bridgeId, async (accessToken) => {
          const apiClient = dependencies.createApiClient(accessToken);
          await apiClient.deleteJson(subscriptionPath(subscriptionId));
        })
        .catch(sanitizeProviderError);
    }

    await dependencies.setActive(fuente.id, false);
    const actualizado = await dependencies.markSubscription(fuente.id, {
      estadoSuscripcion: "REVOCADA",
      subscriptionId: null,
    });
    return toFuenteDto(actualizado);
  }

  async function actualizarActivacionLinkedInFuente(
    bridgeId: string,
    fuenteId: string,
    activa: boolean,
  ): Promise<LinkedInFuenteDto> {
    await validateLinkedInBridge(bridgeId);

    const fuente = await dependencies.findInternalByIdForBridge(fuenteId, bridgeId);
    if (!fuente) throw fuenteNotFound();

    return activa ? activar(bridgeId, fuente) : desactivar(bridgeId, fuente);
  }

  return { actualizarActivacionLinkedInFuente };
}

function productionWebhookUrl(): string {
  if (!env.LINKEDIN_REDIRECT_URI) throw configurationUnavailable();
  // Reusa el host HTTPS ya validado de `LINKEDIN_REDIRECT_URI` (mismo dominio
  // público registrado en el LinkedIn Developer Portal) — evita introducir una
  // variable de entorno nueva antes de que exista el endpoint público del
  // webhook (próximo paso, ver docs/claude-linkedin-estado-actual.md).
  return new URL(
    "/api/v1/integraciones/linkedin/webhook",
    new URL(env.LINKEDIN_REDIRECT_URI).origin,
  ).toString();
}

const productionService = createLinkedInSubscriptionService({
  findBridgeById: bridgeRepository.findById,
  findInternalByIdForBridge: linkedinFuenteRepository.findInternalByIdForBridge,
  setActive: linkedinFuenteRepository.setActive,
  markSubscription: linkedinFuenteRepository.markSubscription,
  withLinkedInAccessToken,
  createApiClient: createProductionLinkedInApiClient,
  webhookUrl: productionWebhookUrl,
});

export const actualizarActivacionLinkedInFuente = productionService.actualizarActivacionLinkedInFuente;
