import { AppError } from "../../lib/app-error.js";
import * as bridgeRepository from "../../repositories/bridge.repository.js";
import { createProductionLinkedInApiClient, type LinkedInApiClient } from "./linkedin-api.service.js";
import { withLinkedInAccessToken } from "./linkedin-token.service.js";

const LINKEDIN_PROBE_PATH = "/organizationAcls?q=roleAssignee&state=APPROVED&count=1&start=0";

export interface ResultadoPruebaConexionLinkedIn {
  conectado: true;
  verificadoEn: string;
}

export interface LinkedInProbarConexionDependencies {
  now: () => Date;
  findBridgeById: typeof bridgeRepository.findById;
  withLinkedInAccessToken: typeof withLinkedInAccessToken;
  createApiClient: (accessToken: string) => LinkedInApiClient;
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

export function createLinkedInProbarConexionService(
  dependencies: LinkedInProbarConexionDependencies,
): { probarConexionLinkedIn(bridgeId: string): Promise<ResultadoPruebaConexionLinkedIn> } {
  async function probarConexionLinkedIn(bridgeId: string): Promise<ResultadoPruebaConexionLinkedIn> {
    const bridge = await dependencies.findBridgeById(bridgeId);
    if (!bridge) throw bridgeNotFound();
    if (bridge.redSocial !== "LINKEDIN") throw invalidLinkedInBridge();

    await dependencies.withLinkedInAccessToken(bridgeId, async (accessToken) => {
      await dependencies.createApiClient(accessToken).getJson(LINKEDIN_PROBE_PATH);
    });

    return { conectado: true, verificadoEn: dependencies.now().toISOString() };
  }

  return { probarConexionLinkedIn };
}

const productionService = createLinkedInProbarConexionService({
  now: () => new Date(),
  findBridgeById: bridgeRepository.findById,
  withLinkedInAccessToken,
  createApiClient: createProductionLinkedInApiClient,
});

export const probarConexionLinkedIn = productionService.probarConexionLinkedIn;
