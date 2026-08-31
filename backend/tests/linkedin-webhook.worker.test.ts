import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { hashClaveBridge } from "../src/lib/clave-bridge.js";
import { prisma, runWithTenantContext } from "../src/lib/prisma.js";
import { testAdminPrisma } from "./fixtures/admin-prisma.js";
import { EMPRESA_BOOTSTRAP_ID } from "./fixtures/empresa.js";

/**
 * Cubre el tramo del worker que resuelve el detalle vía
 * `GET /leadFormResponses/{id}` (`linkedin-webhook.service.ts::
 * resolverLinkedInLeadFormResponse`, invocado desde `ingesta.service.ts::
 * resolverEntradaProcesamiento` -> `procesarRecepcion`). Mockea
 * `linkedin-token.service.js`/`linkedin-api.service.js` a nivel de módulo
 * (mismo patrón de mocking de LinkedIn que `linkedin-subscription.service
 * .test.ts`) en vez de `global.fetch` como hace `meta-webhook.worker.test
 * .ts`, porque acá el `LinkedInApiClient` es una abstracción propia — no
 * hace falta (ni corresponde) simular la capa HTTP cruda.
 */
const mocks = vi.hoisted(() => ({
  withLinkedInAccessToken: vi.fn(),
  createApiClient: vi.fn(),
  getJson: vi.fn(),
}));

vi.mock("../src/services/linkedin/linkedin-token.service.js", () => ({
  withLinkedInAccessToken: mocks.withLinkedInAccessToken,
}));

vi.mock("../src/services/linkedin/linkedin-api.service.js", () => ({
  createProductionLinkedInApiClient: mocks.createApiClient,
}));

import * as inbox from "../src/repositories/lead-recibido.repository.js";
import { procesarRecepcion } from "../src/services/ingesta.service.js";

function conContexto<T>(fn: () => Promise<T>): Promise<T> {
  return runWithTenantContext({ empresaId: null }, fn);
}

let contador = 0;

async function crearBridge(): Promise<{ id: string }> {
  contador += 1;
  const bridge = await testAdminPrisma.bridge.create({
    data: {
      redSocial: "LINKEDIN",
      nombre: `Bridge LinkedIn Worker ${contador}`,
      claveApiHash: hashClaveBridge(`clave-linkedin-worker-${contador}`),
      estado: "ACTIVO",
      empresaId: EMPRESA_BOOTSTRAP_ID,
    },
  });
  return { id: bridge.id };
}

async function encolarYReclamar(
  bridgeId: string,
  leadFormResponseId: string,
  leadGenFormResponse: string,
  occurredAt: number,
  owner: string,
): Promise<inbox.InboxClaim> {
  const receipt = await inbox.aceptarLinkedInPendiente(
    { bridgeId, leadFormResponseId, leadGenFormResponse, occurredAt },
    new Date(),
    testAdminPrisma,
  );
  const row = await testAdminPrisma.leadRecibido.update({
    where: { id: receipt.recepcionId },
    data: { estado: "PROCESANDO", intentos: 1, leaseOwner: owner, leaseHasta: new Date(Date.now() + 60_000) },
  });
  return {
    recepcionId: row.id,
    bridgeId: row.bridgeId,
    leaseOwner: owner,
    intento: 1,
    leaseHasta: row.leaseHasta!,
    entradaProcesamiento: row.entradaProcesamiento as unknown as inbox.PersistedEntradaProcesamiento,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("worker de ingesta — sobre LINKEDIN_PENDIENTE_DETALLE", () => {
  it("detalle resuelto sin predefinedField inline: completa el lead con nombre/telefono/correo en null y las respuestas crudas en camposDinamicos", async () => {
    const bridge = await crearBridge();
    const leadFormResponseId = `resp-${contador}`;
    const leadGenFormResponse = `urn:li:leadGenFormResponse:${leadFormResponseId}`;
    const occurredAt = 555;
    mocks.getJson.mockResolvedValueOnce({
      id: leadFormResponseId,
      submittedAt: "2026-08-30T12:00:00.000Z",
      owner: { organization: "urn:li:organization:1" },
      leadType: "EVENT",
      versionedLeadGenFormUrn: "urn:li:versionedLeadGenForm:(urn:li:leadGenForm:1, 1)",
      formResponse: {
        answers: [{ questionId: 1, answer: "Juan" }],
        consents: [],
        consentResponses: [],
      },
    });
    mocks.createApiClient.mockReturnValue({ getJson: mocks.getJson });
    mocks.withLinkedInAccessToken.mockImplementation(
      async (_bridgeId: string, fn: (accessToken: string) => Promise<unknown>) => fn("access-token-de-prueba"),
    );

    const claim = await encolarYReclamar(bridge.id, leadFormResponseId, leadGenFormResponse, occurredAt, `worker-linkedin-ok-${contador}`);

    const completado = await conContexto(() => procesarRecepcion(claim));

    expect(completado).toBe(true);
    expect(mocks.withLinkedInAccessToken).toHaveBeenCalledWith(bridge.id, expect.any(Function));
    expect(mocks.getJson).toHaveBeenCalledWith(`/leadFormResponses/${leadFormResponseId}`);
    const recepcion = await testAdminPrisma.leadRecibido.findFirstOrThrow({ where: { id: claim.recepcionId } });
    expect(recepcion.estado).toBe("PROCESADO");
    expect(recepcion.leadId).not.toBeNull();
    expect(recepcion.datosIncompletos).toBe(true);
    const lead = await testAdminPrisma.lead.findUniqueOrThrow({ where: { id: recepcion.leadId! } });
    expect(lead.redSocial).toBe("LINKEDIN");
    expect(lead.payloadOriginal).toMatchObject({ id: leadFormResponseId });
    expect((lead.camposDinamicos as Record<string, unknown>)["1"]).toMatchObject({ questionId: 1, answer: "Juan" });
  });

  it("respuesta de LinkedIn con forma inesperada: registra ERROR y propaga el rechazo sin completar la recepción", async () => {
    const bridge = await crearBridge();
    const leadFormResponseId = `resp-invalida-${contador}`;
    const leadGenFormResponse = `urn:li:leadGenFormResponse:${leadFormResponseId}`;
    mocks.getJson.mockResolvedValueOnce({ algoInesperado: true });
    mocks.createApiClient.mockReturnValue({ getJson: mocks.getJson });
    mocks.withLinkedInAccessToken.mockImplementation(
      async (_bridgeId: string, fn: (accessToken: string) => Promise<unknown>) => fn("access-token-de-prueba"),
    );

    const claim = await encolarYReclamar(bridge.id, leadFormResponseId, leadGenFormResponse, 1, `worker-linkedin-invalido-${contador}`);

    await expect(conContexto(() => procesarRecepcion(claim))).rejects.toThrow();

    const log = await testAdminPrisma.bridgeLog.findFirst({
      where: { bridgeId: bridge.id, nivel: "ERROR" },
      orderBy: { ocurridoEn: "desc" },
    });
    expect(log?.mensaje).toContain("no tiene la forma esperada");
    const recepcion = await testAdminPrisma.leadRecibido.findUniqueOrThrow({ where: { id: claim.recepcionId } });
    expect(recepcion.leadId).toBeNull();
  });
});
