import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../src/lib/app-error.js";

const mocks = vi.hoisted(() => ({
  findBridgeById: vi.fn(),
  findConexionByBridgeId: vi.fn(),
  withLinkedInAccessToken: vi.fn(),
  createApiClient: vi.fn(),
  getJson: vi.fn(),
  upsertDiscoveredSource: vi.fn(),
  upsertForm: vi.fn(),
  markInactiveMissingForms: vi.fn(),
  now: vi.fn(),
}));

vi.mock("../src/repositories/bridge.repository.js", () => ({
  findById: mocks.findBridgeById,
}));

vi.mock("../src/repositories/linkedin/linkedin-conexion.repository.js", () => ({
  findByBridgeId: mocks.findConexionByBridgeId,
}));

vi.mock("../src/repositories/linkedin/linkedin-fuente.repository.js", () => ({
  upsertDiscoveredSource: mocks.upsertDiscoveredSource,
}));

vi.mock("../src/repositories/linkedin/linkedin-formulario.repository.js", () => ({
  upsertForm: mocks.upsertForm,
  markInactiveMissingForms: mocks.markInactiveMissingForms,
}));

vi.mock("../src/services/linkedin/linkedin-token.service.js", () => ({
  withLinkedInAccessToken: mocks.withLinkedInAccessToken,
}));

vi.mock("../src/services/linkedin/linkedin-api.service.js", () => ({
  createProductionLinkedInApiClient: mocks.createApiClient,
}));

import { createLinkedInDiscoveryService } from "../src/services/linkedin/linkedin-discovery.service.js";

const BRIDGE_ID = "11111111-1111-4111-8111-111111111111";
const CONEXION_ID = "22222222-2222-4222-8222-222222222222";
const FUENTE_SPONSORED_ID = "33333333-3333-4333-8333-333333333333";
const FUENTE_ORG_ID = "44444444-4444-4444-8444-444444444444";
const ACCESS_TOKEN = "access-token-no-debe-salir";

function discoveryService() {
  return createLinkedInDiscoveryService({
    now: mocks.now,
    findBridgeById: mocks.findBridgeById,
    findConexionByBridgeId: mocks.findConexionByBridgeId,
    withLinkedInAccessToken: mocks.withLinkedInAccessToken,
    createApiClient: mocks.createApiClient,
    upsertDiscoveredSource: mocks.upsertDiscoveredSource,
    upsertForm: mocks.upsertForm,
    markInactiveMissingForms: mocks.markInactiveMissingForms,
  });
}

function fuentePersistida(overrides: Record<string, unknown> = {}) {
  return {
    id: FUENTE_SPONSORED_ID,
    tipo: "SPONSORED_ACCOUNT",
    ownerUrn: "urn:li:sponsoredAccount:123",
    nombre: "Cuenta activa",
    tipoLead: "SPONSORED",
    activa: false,
    estadoSuscripcion: "PENDIENTE",
    ultimaSincronizacionEn: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.now.mockReturnValue(new Date("2026-08-28T19:00:00.000Z"));
  mocks.findBridgeById.mockResolvedValue({ id: BRIDGE_ID, redSocial: "LINKEDIN" });
  mocks.findConexionByBridgeId.mockResolvedValue({
    id: CONEXION_ID,
    bridgeId: BRIDGE_ID,
    estado: "ACTIVA",
    revocadoEn: null,
  });
  mocks.createApiClient.mockReturnValue({ getJson: mocks.getJson });
  mocks.withLinkedInAccessToken.mockImplementation(async (_bridgeId: string, fn: (accessToken: string) => Promise<unknown>) =>
    fn(ACCESS_TOKEN),
  );
  mocks.getJson.mockResolvedValue({ elements: [] });
  mocks.upsertDiscoveredSource.mockImplementation(async (data: Record<string, unknown>) =>
    fuentePersistida({
      id: data.tipo === "ORGANIZATION" ? FUENTE_ORG_ID : FUENTE_SPONSORED_ID,
      ...data,
    }),
  );
  mocks.upsertForm.mockResolvedValue({});
  mocks.markInactiveMissingForms.mockResolvedValue(0);
});

describe("services/linkedin/discovery", () => {
  it("construye las rutas oficiales de discovery y formularios con el cliente inyectado", async () => {
    mocks.getJson
      .mockResolvedValueOnce({ elements: [{ id: 123, name: "Cuenta activa", status: "ACTIVE" }] })
      .mockResolvedValueOnce({
        elements: [
          {
            id: "456",
            organization: "urn:li:organization:456",
            role: "LEAD_GEN_FORMS_MANAGER",
            state: "APPROVED",
          },
        ],
      })
      .mockResolvedValueOnce({ elements: [{ id: "form-1", name: "Formulario cuenta" }] })
      .mockResolvedValueOnce({ elements: [{ id: "form-2", name: "Formulario org" }] });

    await discoveryService().descubrirFuentesLinkedIn(BRIDGE_ID);

    expect(mocks.withLinkedInAccessToken).toHaveBeenCalledWith(BRIDGE_ID, expect.any(Function));
    expect(mocks.createApiClient).toHaveBeenCalledWith(ACCESS_TOKEN);
    expect(mocks.getJson.mock.calls.map((call) => call[0])).toEqual([
      "/adAccounts?q=search&pageSize=100",
      "/organizationAcls?q=roleAssignee&state=APPROVED&start=0&count=100",
      "/leadForms?q=owner&owner=%28sponsoredAccount%3Aurn%3Ali%3AsponsoredAccount%3A123%29&start=0&count=100",
      "/leadForms?q=owner&owner=%28organization%3Aurn%3Ali%3Aorganization%3A456%29&start=0&count=100",
    ]);
  });

  it("crea una fuente sponsored account activa en LinkedIn, persiste sus formularios y no la activa", async () => {
    mocks.getJson
      .mockResolvedValueOnce({ elements: [{ id: "123", name: "Cuenta activa", status: "ACTIVE" }] })
      .mockResolvedValueOnce({ elements: [] })
      .mockResolvedValueOnce({
        elements: [
          { id: "urn:li:versionedLeadGenForm:abc", name: "Formulario A", questions: [] },
          { id: "def", versionedLeadGenFormUrn: "urn:li:versionedLeadGenForm:def", name: "Formulario B" },
        ],
      });

    const resultado = await discoveryService().descubrirFuentesLinkedIn(BRIDGE_ID);

    expect(mocks.upsertDiscoveredSource).toHaveBeenCalledWith({
      conexionId: CONEXION_ID,
      cuentaPublicitariaId: null,
      tipo: "SPONSORED_ACCOUNT",
      ownerUrn: "urn:li:sponsoredAccount:123",
      nombre: "Cuenta activa",
      tipoLead: "SPONSORED",
    });
    expect(mocks.upsertForm).toHaveBeenCalledTimes(2);
    expect(mocks.upsertForm).toHaveBeenNthCalledWith(1, {
      fuenteId: FUENTE_SPONSORED_ID,
      versionedFormUrn: "urn:li:versionedLeadGenForm:abc",
      nombre: "Formulario A",
      contenido: { id: "urn:li:versionedLeadGenForm:abc", name: "Formulario A", questions: [] },
      sincronizadoEn: new Date("2026-08-28T19:00:00.000Z"),
    });
    expect(mocks.markInactiveMissingForms).toHaveBeenCalledWith(FUENTE_SPONSORED_ID, [
      "urn:li:versionedLeadGenForm:abc",
      "urn:li:versionedLeadGenForm:def",
    ]);
    expect(resultado.fuentes[0]).toMatchObject({
      ownerUrn: "urn:li:sponsoredAccount:123",
      activa: false,
      estadoSuscripcion: "PENDIENTE",
    });
  });

  it("descubre organizaciones solo con roles permitidos y conserva COMPANY como tipo orgánico conservador", async () => {
    mocks.getJson
      .mockResolvedValueOnce({ elements: [] })
      .mockResolvedValueOnce({
        elements: [
          { organization: "urn:li:organization:456", role: "LEAD_GEN_FORMS_MANAGER", state: "APPROVED" },
          { organizationTarget: "urn:li:organization:789", role: "VIEWER", state: "APPROVED" },
        ],
      })
      .mockResolvedValueOnce({ elements: [] });

    await discoveryService().descubrirFuentesLinkedIn(BRIDGE_ID);

    expect(mocks.upsertDiscoveredSource).toHaveBeenCalledTimes(1);
    expect(mocks.upsertDiscoveredSource).toHaveBeenCalledWith({
      conexionId: CONEXION_ID,
      cuentaPublicitariaId: null,
      tipo: "ORGANIZATION",
      ownerUrn: "urn:li:organization:456",
      nombre: "urn:li:organization:456",
      tipoLead: "COMPANY",
    });
  });

  it("refleja la preservación local de activación y suscripción al redescubrir", async () => {
    mocks.getJson
      .mockResolvedValueOnce({ elements: [{ id: "123", name: "Cuenta activa", status: "ACTIVE" }] })
      .mockResolvedValueOnce({ elements: [] })
      .mockResolvedValueOnce({ elements: [] });
    mocks.upsertDiscoveredSource.mockResolvedValueOnce(
      fuentePersistida({
        activa: true,
        estadoSuscripcion: "ACTIVA",
        ultimaSincronizacionEn: new Date("2026-08-28T18:00:00.000Z"),
      }),
    );

    const resultado = await discoveryService().descubrirFuentesLinkedIn(BRIDGE_ID);

    expect(resultado.fuentes[0]).toMatchObject({
      activa: true,
      estadoSuscripcion: "ACTIVA",
      ultimaSincronizacionEn: "2026-08-28T18:00:00.000Z",
    });
  });

  it("rechaza bridges inválidos o sin conexión antes de consultar LinkedIn", async () => {
    mocks.findBridgeById.mockResolvedValueOnce({ id: BRIDGE_ID, redSocial: "FACEBOOK" });
    const redIncorrecta = await discoveryService().descubrirFuentesLinkedIn(BRIDGE_ID).catch((error: unknown) => error);
    mocks.findConexionByBridgeId.mockResolvedValueOnce(null);
    const sinConexion = await discoveryService().descubrirFuentesLinkedIn(BRIDGE_ID).catch((error: unknown) => error);

    expect(redIncorrecta).toMatchObject({ code: "linkedin_bridge_invalido", statusHttp: 422 });
    expect(sinConexion).toMatchObject({ code: "linkedin_conexion_requerida", statusHttp: 409 });
    expect(mocks.withLinkedInAccessToken).not.toHaveBeenCalled();
  });

  it("sanitiza errores crudos del proveedor sin filtrar cuerpo ni token", async () => {
    mocks.getJson.mockRejectedValueOnce(new Error(`provider body ${ACCESS_TOKEN}`));

    const error = await discoveryService().descubrirFuentesLinkedIn(BRIDGE_ID).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code: "linkedin_api_error", statusHttp: 502 });
    expect(JSON.stringify(error)).not.toContain(ACCESS_TOKEN);
  });
});
