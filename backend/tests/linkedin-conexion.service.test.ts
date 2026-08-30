import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findBridgeById: vi.fn(),
  findConexionByBridgeId: vi.fn(),
  listFuentesByBridge: vi.fn(),
}));

vi.mock("../src/repositories/bridge.repository.js", () => ({
  findById: mocks.findBridgeById,
}));

vi.mock("../src/repositories/linkedin/linkedin-conexion.repository.js", () => ({
  findByBridgeId: mocks.findConexionByBridgeId,
}));

vi.mock("../src/repositories/linkedin/linkedin-fuente.repository.js", () => ({
  listByBridge: mocks.listFuentesByBridge,
}));

import { getLinkedInConexion } from "../src/services/linkedin/linkedin-conexion.service.js";

const BRIDGE_ID = "11111111-1111-4111-8111-111111111111";
const CONEXION_ID = "22222222-2222-4222-8222-222222222222";
const FUENTE_ID = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findBridgeById.mockResolvedValue({ id: BRIDGE_ID, redSocial: "LINKEDIN" });
  mocks.findConexionByBridgeId.mockResolvedValue({
    id: CONEXION_ID,
    bridgeId: BRIDGE_ID,
    autorizadoPorUsuarioId: "44444444-4444-4444-8444-444444444444",
    memberUrn: null,
    accessTokenExpiraEn: new Date("2026-08-28T18:00:00.000Z"),
    refreshTokenExpiraEn: null,
    scopes: ["r_marketing_leadgen_automation"],
    estado: "ACTIVA",
    revocadoEn: null,
    creadoEn: new Date("2026-08-28T16:00:00.000Z"),
    actualizadoEn: new Date("2026-08-28T16:00:00.000Z"),
    tieneRefreshToken: true,
    accessTokenCifrado: "ciphertext-que-no-debe-salir",
  });
  mocks.listFuentesByBridge.mockResolvedValue([
    {
      id: FUENTE_ID,
      tipo: "ORGANIZATION",
      ownerUrn: "urn:li:organization:123",
      nombre: "Organización de prueba",
      tipoLead: "COMPANY",
      activa: true,
      estadoSuscripcion: "ACTIVA",
      ultimaSincronizacionEn: new Date("2026-08-28T17:00:00.000Z"),
      subscriptionId: "secreto-que-no-debe-salir",
    },
  ]);
});

describe("services/linkedin/conexion", () => {
  it("incluye fuentes en el DTO seguro sin ciphertext ni datos de suscripción internos", async () => {
    const conexion = await getLinkedInConexion(BRIDGE_ID);

    expect(conexion).toEqual({
      id: CONEXION_ID,
      bridgeId: BRIDGE_ID,
      estado: "ACTIVA",
      accessTokenExpiraEn: "2026-08-28T18:00:00.000Z",
      refreshTokenExpiraEn: null,
      scopes: ["r_marketing_leadgen_automation"],
      tieneRefreshToken: true,
      fuentes: [
        {
          id: FUENTE_ID,
          tipo: "ORGANIZATION",
          ownerUrn: "urn:li:organization:123",
          nombre: "Organización de prueba",
          tipoLead: "COMPANY",
          activa: true,
          estadoSuscripcion: "ACTIVA",
          ultimaSincronizacionEn: "2026-08-28T17:00:00.000Z",
        },
      ],
    });
    expect(mocks.listFuentesByBridge).toHaveBeenCalledWith(BRIDGE_ID);
    expect(JSON.stringify(conexion)).not.toMatch(/ciphertext|subscriptionId|tokenCifrado/i);
  });

  it("no consulta fuentes cuando el bridge todavía no tiene conexión", async () => {
    mocks.findConexionByBridgeId.mockResolvedValue(null);

    await expect(getLinkedInConexion(BRIDGE_ID)).resolves.toBeNull();
    expect(mocks.listFuentesByBridge).not.toHaveBeenCalled();
  });
});
