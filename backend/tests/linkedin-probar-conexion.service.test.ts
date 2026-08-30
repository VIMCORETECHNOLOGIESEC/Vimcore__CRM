import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLinkedInProbarConexionService } from "../src/services/linkedin/linkedin-probar-conexion.service.js";

const NOW = new Date("2026-08-28T12:00:00.000Z");
const BRIDGE_ID = "11111111-1111-4111-8111-111111111111";
const ACCESS_TOKEN = "access-token-ultrasecreto";

function createHarness() {
  const apiClient = { getJson: vi.fn().mockResolvedValue({ data: [] }) };
  const dependencies = {
    now: vi.fn(() => new Date(NOW)),
    findBridgeById: vi.fn().mockResolvedValue({ id: BRIDGE_ID, redSocial: "LINKEDIN" }),
    withLinkedInAccessToken: vi.fn(async (_bridgeId: string, fn: (accessToken: string) => Promise<unknown>) =>
      fn(ACCESS_TOKEN)
    ),
    createApiClient: vi.fn(() => apiClient),
  };
  return { apiClient, dependencies, service: createLinkedInProbarConexionService(dependencies) };
}

describe("services/linkedin probar conexión", () => {
  beforeEach(() => vi.clearAllMocks());

  it("valida bridge LinkedIn, prueba organizationAcls y descarta el cuerpo", async () => {
    const { apiClient, dependencies, service } = createHarness();

    const result = await service.probarConexionLinkedIn(BRIDGE_ID);

    expect(dependencies.findBridgeById).toHaveBeenCalledWith(BRIDGE_ID);
    expect(dependencies.withLinkedInAccessToken).toHaveBeenCalledWith(BRIDGE_ID, expect.any(Function));
    expect(dependencies.createApiClient).toHaveBeenCalledWith(ACCESS_TOKEN);
    expect(apiClient.getJson).toHaveBeenCalledWith(
      "/organizationAcls?q=roleAssignee&state=APPROVED&count=1&start=0",
    );
    expect(result).toEqual({ conectado: true, verificadoEn: "2026-08-28T12:00:00.000Z" });
    expect(JSON.stringify(result)).not.toContain(ACCESS_TOKEN);
  });

  it("rechaza bridges inexistentes o de otra red antes de usar tokens", async () => {
    const missing = createHarness();
    missing.dependencies.findBridgeById.mockResolvedValue(null);
    await expect(missing.service.probarConexionLinkedIn(BRIDGE_ID)).rejects.toMatchObject({
      code: "bridge_no_encontrado",
      statusHttp: 404,
    });
    expect(missing.dependencies.withLinkedInAccessToken).not.toHaveBeenCalled();

    const wrongNetwork = createHarness();
    wrongNetwork.dependencies.findBridgeById.mockResolvedValue({ id: BRIDGE_ID, redSocial: "FACEBOOK" });
    await expect(wrongNetwork.service.probarConexionLinkedIn(BRIDGE_ID)).rejects.toMatchObject({
      code: "linkedin_bridge_invalido",
      statusHttp: 422,
    });
    expect(wrongNetwork.dependencies.withLinkedInAccessToken).not.toHaveBeenCalled();
  });
});
