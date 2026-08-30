import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../src/lib/app-error.js";

const mocks = vi.hoisted(() => ({
  findBridgeById: vi.fn(),
  findInternalByIdForBridge: vi.fn(),
  setActive: vi.fn(),
  markSubscription: vi.fn(),
  withLinkedInAccessToken: vi.fn(),
  createApiClient: vi.fn(),
  postJson: vi.fn(),
  deleteJson: vi.fn(),
  webhookUrl: vi.fn(),
}));

vi.mock("../src/repositories/bridge.repository.js", () => ({
  findById: mocks.findBridgeById,
}));

vi.mock("../src/repositories/linkedin/linkedin-fuente.repository.js", () => ({
  findInternalByIdForBridge: mocks.findInternalByIdForBridge,
  setActive: mocks.setActive,
  markSubscription: mocks.markSubscription,
}));

vi.mock("../src/services/linkedin/linkedin-token.service.js", () => ({
  withLinkedInAccessToken: mocks.withLinkedInAccessToken,
}));

vi.mock("../src/services/linkedin/linkedin-api.service.js", () => ({
  createProductionLinkedInApiClient: mocks.createApiClient,
}));

import { createLinkedInSubscriptionService } from "../src/services/linkedin/linkedin-subscription.service.js";

const BRIDGE_ID = "11111111-1111-4111-8111-111111111111";
const FUENTE_ID = "22222222-2222-4222-8222-222222222222";
const ACCESS_TOKEN = "access-token-no-debe-salir";
const WEBHOOK_URL = "https://crm.example.com/api/v1/integraciones/linkedin/webhook";

function fuenteInterna(overrides: Record<string, unknown> = {}) {
  return {
    id: FUENTE_ID,
    tipo: "SPONSORED_ACCOUNT",
    ownerUrn: "urn:li:sponsoredAccount:123",
    nombre: "Cuenta activa",
    tipoLead: "SPONSORED",
    activa: false,
    estadoSuscripcion: "PENDIENTE",
    ultimaSincronizacionEn: null,
    subscriptionId: null,
    ...overrides,
  };
}

function fuenteSafe(overrides: Record<string, unknown> = {}) {
  const { subscriptionId: _subscriptionId, ...safe } = fuenteInterna(overrides);
  return safe;
}

function service() {
  return createLinkedInSubscriptionService({
    findBridgeById: mocks.findBridgeById,
    findInternalByIdForBridge: mocks.findInternalByIdForBridge,
    setActive: mocks.setActive,
    markSubscription: mocks.markSubscription,
    withLinkedInAccessToken: mocks.withLinkedInAccessToken,
    createApiClient: mocks.createApiClient,
    webhookUrl: mocks.webhookUrl,
  });
}

// `setActive`/`markSubscription` operan sobre la misma fila en el repositorio
// real: una vez que `setActive(id, true)` persiste, el `markSubscription`
// posterior devuelve la fila con ese `activa` ya aplicado. Sin este mapa, cada
// mock devolvería un objeto aislado con el default `activa: false` de
// `fuenteInterna()`, perdiendo el `setActive` previo dentro del mismo caso.
let estadoActivoPorId: Record<string, boolean> = {};

beforeEach(() => {
  vi.clearAllMocks();
  estadoActivoPorId = {};
  mocks.findBridgeById.mockResolvedValue({ id: BRIDGE_ID, redSocial: "LINKEDIN" });
  mocks.findInternalByIdForBridge.mockResolvedValue(fuenteInterna());
  mocks.createApiClient.mockReturnValue({ postJson: mocks.postJson, deleteJson: mocks.deleteJson });
  mocks.withLinkedInAccessToken.mockImplementation(async (_bridgeId: string, fn: (accessToken: string) => Promise<unknown>) =>
    fn(ACCESS_TOKEN),
  );
  mocks.webhookUrl.mockReturnValue(WEBHOOK_URL);
  mocks.postJson.mockResolvedValue({ restliId: "107708", body: null });
  mocks.deleteJson.mockResolvedValue(undefined);
  mocks.setActive.mockImplementation(async (id: string, activa: boolean) => {
    estadoActivoPorId[id] = activa;
    return fuenteSafe({ id, activa });
  });
  mocks.markSubscription.mockImplementation(async (id: string, data: Record<string, unknown>) =>
    fuenteSafe({ id, activa: estadoActivoPorId[id] ?? false, ...data }),
  );
});

describe("services/linkedin/subscription — activar", () => {
  it("suscribe en LinkedIn con el owner/leadType correctos y persiste ACTIVA", async () => {
    const resultado = await service().actualizarActivacionLinkedInFuente(BRIDGE_ID, FUENTE_ID, true);

    expect(mocks.withLinkedInAccessToken).toHaveBeenCalledWith(BRIDGE_ID, expect.any(Function));
    expect(mocks.createApiClient).toHaveBeenCalledWith(ACCESS_TOKEN);
    expect(mocks.postJson).toHaveBeenCalledWith("/leadNotifications", {
      webhook: WEBHOOK_URL,
      owner: { sponsoredAccount: "urn:li:sponsoredAccount:123" },
      leadType: "SPONSORED",
    });
    expect(mocks.setActive).toHaveBeenCalledWith(FUENTE_ID, true);
    expect(mocks.markSubscription).toHaveBeenCalledWith(FUENTE_ID, {
      estadoSuscripcion: "ACTIVA",
      subscriptionId: "107708",
    });
    expect(resultado).toMatchObject({ activa: true, estadoSuscripcion: "ACTIVA" });
    expect(JSON.stringify(resultado)).not.toMatch(/subscriptionId|107708/);
  });

  it("usa el owner de organización para fuentes ORGANIZATION", async () => {
    mocks.findInternalByIdForBridge.mockResolvedValueOnce(
      fuenteInterna({ tipo: "ORGANIZATION", ownerUrn: "urn:li:organization:456", tipoLead: "COMPANY" }),
    );

    await service().actualizarActivacionLinkedInFuente(BRIDGE_ID, FUENTE_ID, true);

    expect(mocks.postJson).toHaveBeenCalledWith("/leadNotifications", {
      webhook: WEBHOOK_URL,
      owner: { organization: "urn:li:organization:456" },
      leadType: "COMPANY",
    });
  });

  it("es un no-op cuando la fuente ya está activa y suscrita, sin volver a llamar a LinkedIn", async () => {
    mocks.findInternalByIdForBridge.mockResolvedValueOnce(
      fuenteInterna({ activa: true, estadoSuscripcion: "ACTIVA", subscriptionId: "vigente" }),
    );

    const resultado = await service().actualizarActivacionLinkedInFuente(BRIDGE_ID, FUENTE_ID, true);

    expect(mocks.withLinkedInAccessToken).not.toHaveBeenCalled();
    expect(mocks.setActive).not.toHaveBeenCalled();
    expect(mocks.markSubscription).not.toHaveBeenCalled();
    expect(resultado).toMatchObject({ activa: true, estadoSuscripcion: "ACTIVA" });
  });

  it("reintenta contra LinkedIn si la fuente está activa localmente pero la suscripción quedó en ERROR", async () => {
    mocks.findInternalByIdForBridge.mockResolvedValueOnce(
      fuenteInterna({ activa: true, estadoSuscripcion: "ERROR", subscriptionId: null }),
    );

    await service().actualizarActivacionLinkedInFuente(BRIDGE_ID, FUENTE_ID, true);

    expect(mocks.postJson).toHaveBeenCalledTimes(1);
    expect(mocks.markSubscription).toHaveBeenCalledWith(FUENTE_ID, {
      estadoSuscripcion: "ACTIVA",
      subscriptionId: "107708",
    });
  });

  it("deja la fuente inactiva con ERROR y propaga el error si LinkedIn rechaza la suscripción", async () => {
    mocks.postJson.mockRejectedValueOnce(
      new AppError("linkedin_scope_insuficiente", 422, "La conexión de LinkedIn no tiene permisos suficientes"),
    );

    const error = await service()
      .actualizarActivacionLinkedInFuente(BRIDGE_ID, FUENTE_ID, true)
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: "linkedin_scope_insuficiente", statusHttp: 422 });
    expect(mocks.setActive).toHaveBeenCalledWith(FUENTE_ID, false);
    expect(mocks.markSubscription).toHaveBeenCalledWith(FUENTE_ID, {
      estadoSuscripcion: "ERROR",
      subscriptionId: null,
    });
  });

  it("trata una respuesta sin x-restli-id como error de proveedor y no activa la fuente", async () => {
    mocks.postJson.mockResolvedValueOnce({ restliId: null, body: null });

    const error = await service()
      .actualizarActivacionLinkedInFuente(BRIDGE_ID, FUENTE_ID, true)
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: "linkedin_api_error", statusHttp: 502 });
    expect(mocks.markSubscription).toHaveBeenCalledWith(FUENTE_ID, {
      estadoSuscripcion: "ERROR",
      subscriptionId: null,
    });
  });

  it("sanitiza errores crudos del proveedor sin filtrar el token", async () => {
    mocks.postJson.mockRejectedValueOnce(new Error(`provider body ${ACCESS_TOKEN}`));

    const error = await service()
      .actualizarActivacionLinkedInFuente(BRIDGE_ID, FUENTE_ID, true)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code: "linkedin_api_error", statusHttp: 502 });
    expect(JSON.stringify(error)).not.toContain(ACCESS_TOKEN);
  });
});

describe("services/linkedin/subscription — desactivar", () => {
  it("desuscribe en LinkedIn por subscriptionId y persiste REVOCADA", async () => {
    mocks.findInternalByIdForBridge.mockResolvedValueOnce(
      fuenteInterna({ activa: true, estadoSuscripcion: "ACTIVA", subscriptionId: "107708" }),
    );

    const resultado = await service().actualizarActivacionLinkedInFuente(BRIDGE_ID, FUENTE_ID, false);

    expect(mocks.deleteJson).toHaveBeenCalledWith("/leadNotifications/107708");
    expect(mocks.setActive).toHaveBeenCalledWith(FUENTE_ID, false);
    expect(mocks.markSubscription).toHaveBeenCalledWith(FUENTE_ID, {
      estadoSuscripcion: "REVOCADA",
      subscriptionId: null,
    });
    expect(resultado).toMatchObject({ activa: false, estadoSuscripcion: "REVOCADA" });
  });

  it("es un no-op cuando la fuente ya está inactiva y sin suscripción", async () => {
    mocks.findInternalByIdForBridge.mockResolvedValueOnce(
      fuenteInterna({ activa: false, estadoSuscripcion: "PENDIENTE", subscriptionId: null }),
    );

    const resultado = await service().actualizarActivacionLinkedInFuente(BRIDGE_ID, FUENTE_ID, false);

    expect(mocks.withLinkedInAccessToken).not.toHaveBeenCalled();
    expect(mocks.setActive).not.toHaveBeenCalled();
    expect(mocks.markSubscription).not.toHaveBeenCalled();
    expect(resultado).toMatchObject({ activa: false });
  });

  it("conserva subscriptionId y no toca el estado local si la baja remota falla", async () => {
    mocks.findInternalByIdForBridge.mockResolvedValueOnce(
      fuenteInterna({ activa: true, estadoSuscripcion: "ACTIVA", subscriptionId: "107708" }),
    );
    mocks.deleteJson.mockRejectedValueOnce(
      new AppError("linkedin_api_error", 502, "No se pudo consultar la API de LinkedIn"),
    );

    const error = await service()
      .actualizarActivacionLinkedInFuente(BRIDGE_ID, FUENTE_ID, false)
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: "linkedin_api_error", statusHttp: 502 });
    expect(mocks.setActive).not.toHaveBeenCalled();
    expect(mocks.markSubscription).not.toHaveBeenCalled();
  });
});

describe("services/linkedin/subscription — validaciones previas", () => {
  it("rechaza bridges inexistentes o de otra red antes de tocar la fuente", async () => {
    mocks.findBridgeById.mockResolvedValueOnce(null);
    const inexistente = await service()
      .actualizarActivacionLinkedInFuente(BRIDGE_ID, FUENTE_ID, true)
      .catch((error: unknown) => error);

    mocks.findBridgeById.mockResolvedValueOnce({ id: BRIDGE_ID, redSocial: "FACEBOOK" });
    const redIncorrecta = await service()
      .actualizarActivacionLinkedInFuente(BRIDGE_ID, FUENTE_ID, true)
      .catch((error: unknown) => error);

    expect(inexistente).toMatchObject({ code: "bridge_no_encontrado", statusHttp: 404 });
    expect(redIncorrecta).toMatchObject({ code: "linkedin_bridge_invalido", statusHttp: 422 });
    expect(mocks.findInternalByIdForBridge).not.toHaveBeenCalled();
  });

  it("rechaza una fuente inexistente o ajena al bridge", async () => {
    mocks.findInternalByIdForBridge.mockResolvedValueOnce(null);

    const error = await service()
      .actualizarActivacionLinkedInFuente(BRIDGE_ID, FUENTE_ID, true)
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: "linkedin_fuente_no_encontrada", statusHttp: 404 });
    expect(mocks.withLinkedInAccessToken).not.toHaveBeenCalled();
  });
});
