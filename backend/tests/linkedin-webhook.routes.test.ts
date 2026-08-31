import { createHmac } from "node:crypto";
import request from "supertest";
import { afterAll, describe, expect, it, vi } from "vitest";

/**
 * `LINKEDIN_CLIENT_SECRET` viene vacío en `.env.dev` (integración LinkedIn
 * opcional en runtime, `config/env.ts`) — a diferencia de
 * `META_APP_SECRET`, que sí está poblado ahí. Se sobreescribe acá SOLO ese
 * valor (spread del resto del `env` real) para poder ejercitar el
 * round-trip real de HMAC del handshake/firma sin tocar `.env.dev` (fuera
 * de `backend/**`, fuera de alcance). `vi.hoisted` (mismo patrón que
 * `linkedin.routes.test.ts`/`linkedin-subscription.service.test.ts`): el
 * factory de `vi.mock` se hoistea arriba de todo el archivo, así que una
 * `const` de nivel superior normal cae en TDZ si el factory la referencia.
 */
const { TEST_CLIENT_SECRET } = vi.hoisted(() => ({ TEST_CLIENT_SECRET: "linkedin-secreto-de-pruebas" }));

vi.mock("../src/config/env.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/config/env.js")>();
  return { ...actual, env: { ...actual.env, LINKEDIN_CLIENT_SECRET: TEST_CLIENT_SECRET } };
});

import { createApp } from "../src/app.js";
import { encrypt } from "../src/lib/cifrado-token.js";
import { hashClaveBridge } from "../src/lib/clave-bridge.js";
import { prisma } from "../src/lib/prisma.js";
import { testAdminPrisma } from "./fixtures/admin-prisma.js";
import { EMPRESA_BOOTSTRAP_ID } from "./fixtures/empresa.js";

const app = createApp();
let contador = 0;

function firmar(rawBody: string): string {
  return createHmac("sha256", TEST_CLIENT_SECRET)
    .update(Buffer.concat([Buffer.from("hmacsha256="), Buffer.from(rawBody, "utf8")]))
    .digest("hex");
}

function postLinkedIn(rawBody: string, firma?: string) {
  const req = request(app)
    .post("/api/v1/integraciones/linkedin/webhook")
    .set("Content-Type", "application/json");
  if (firma !== undefined) req.set("X-LI-Signature", firma);
  return req.send(rawBody);
}

function notificacionLeadAction(overrides: Record<string, unknown> = {}): unknown {
  return {
    type: "LEAD_ACTION",
    leadGenFormResponse: "urn:li:leadGenFormResponse:1a2b3c-4",
    leadGenForm: "urn:li:versionedLeadGenForm:(urn:li:leadGenForm:1, 1)",
    owner: { organization: "urn:li:organization:123" },
    associatedEntity: { event: "urn:li:event:123" },
    leadType: "EVENT",
    leadAction: "CREATED",
    occurredAt: 123_456_789,
    ...overrides,
  };
}

interface FuenteFixture {
  bridgeId: string;
  ownerUrn: string;
}

async function crearBridgeConFuenteActiva(
  overrides: { activa?: boolean } = {},
): Promise<FuenteFixture> {
  contador += 1;
  const usuario = await testAdminPrisma.usuario.create({
    data: {
      nombre: `Administrador LinkedIn Webhook ${contador}`,
      correo: `linkedin-webhook-${contador}@test.local`,
      passwordHash: "hash-no-usado",
      rol: "ADMINISTRADOR",
    },
  });
  const bridge = await testAdminPrisma.bridge.create({
    data: {
      redSocial: "LINKEDIN",
      nombre: `Bridge LinkedIn Webhook ${contador}`,
      claveApiHash: hashClaveBridge(`clave-linkedin-webhook-${contador}`),
      estado: "ACTIVO",
      empresaId: EMPRESA_BOOTSTRAP_ID,
    },
  });
  const conexion = await testAdminPrisma.linkedInConexion.create({
    data: {
      bridgeId: bridge.id,
      autorizadoPorUsuarioId: usuario.id,
      accessTokenCifrado: encrypt("access-token-de-prueba"),
      refreshTokenCifrado: encrypt("refresh-token-de-prueba"),
      accessTokenExpiraEn: new Date(Date.now() + 60 * 60_000),
      refreshTokenExpiraEn: new Date(Date.now() + 24 * 60 * 60_000),
      scopes: ["r_marketing_leadgen_automation"],
    },
  });
  const ownerUrn = `urn:li:organization:${contador}`;
  await testAdminPrisma.linkedInFuente.create({
    data: {
      conexionId: conexion.id,
      tipo: "ORGANIZATION",
      ownerUrn,
      nombre: `Fuente LinkedIn Webhook ${contador}`,
      tipoLead: "EVENT",
      activa: overrides.activa ?? true,
    },
  });
  return { bridgeId: bridge.id, ownerUrn };
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /api/v1/integraciones/linkedin/webhook — handshake (learn.microsoft.com webhook-validation)", () => {
  it("200 con challengeResponse = HMACSHA256(challengeCode, LINKEDIN_CLIENT_SECRET) en hex", async () => {
    const challengeCode = "b1a7e5c2-1111-4aaa-9999-abcdef012345";

    const respuesta = await request(app)
      .get("/api/v1/integraciones/linkedin/webhook")
      .query({ challengeCode });

    const esperado = createHmac("sha256", TEST_CLIENT_SECRET).update(challengeCode).digest("hex");
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ challengeCode, challengeResponse: esperado });
  });

  it("403 sin challengeCode", async () => {
    const respuesta = await request(app).get("/api/v1/integraciones/linkedin/webhook");

    expect(respuesta.status).toBe(403);
  });
});

describe("POST /api/v1/integraciones/linkedin/webhook — verificación de X-LI-Signature", () => {
  it("401 sin encabezado de firma: registra ERROR en bridge_logs y no encola nada", async () => {
    const rawBody = JSON.stringify(notificacionLeadAction({ leadGenFormResponse: "urn:li:leadGenFormResponse:sin-firma" }));

    const respuesta = await postLinkedIn(rawBody);

    expect(respuesta.status).toBe(401);
    const log = await testAdminPrisma.bridgeLog.findFirst({
      where: { bridgeId: null, nivel: "ERROR", mensaje: "Firma X-LI-Signature inválida o ausente en webhook de LinkedIn" },
      orderBy: { ocurridoEn: "desc" },
    });
    expect(log).not.toBeNull();
    expect(
      await testAdminPrisma.leadRecibido.findFirst({ where: { idExternoLead: { contains: "sin-firma" } } }),
    ).toBeNull();
  });

  it("401 con firma calculada sobre un cuerpo distinto: registra ERROR y no encola nada", async () => {
    const rawBody = JSON.stringify(notificacionLeadAction({ leadGenFormResponse: "urn:li:leadGenFormResponse:firma-invalida" }));
    const firmaDeOtroCuerpo = firmar(JSON.stringify(notificacionLeadAction({ occurredAt: 1 })));

    const respuesta = await postLinkedIn(rawBody, firmaDeOtroCuerpo);

    expect(respuesta.status).toBe(401);
    expect(
      await testAdminPrisma.leadRecibido.findFirst({ where: { idExternoLead: { contains: "firma-invalida" } } }),
    ).toBeNull();
  });
});

describe("POST /api/v1/integraciones/linkedin/webhook — encolado durable", () => {
  it("leadAction CREATED con owner de fuente activa: encola en leads_recibidos con id_externo_lead compuesto", async () => {
    const fuente = await crearBridgeConFuenteActiva();
    const leadGenFormResponse = `urn:li:leadGenFormResponse:encola-${contador}`;
    const payload = notificacionLeadAction({
      leadGenFormResponse,
      owner: { organization: fuente.ownerUrn },
      occurredAt: 111_000_000,
    });
    const rawBody = JSON.stringify(payload);

    const respuesta = await postLinkedIn(rawBody, firmar(rawBody));

    expect(respuesta.status).toBe(200);
    const idExternoLead = `${leadGenFormResponse}:111000000`;
    const recepcion = await testAdminPrisma.leadRecibido.findFirst({
      where: { bridgeId: fuente.bridgeId, idExternoLead },
    });
    expect(recepcion).not.toBeNull();
    expect(recepcion?.estado).toBe("PENDIENTE");
    expect(recepcion?.leadId).toBeNull();
    expect(recepcion?.entradaProcesamiento).toMatchObject({
      version: 2,
      tipo: "LINKEDIN_PENDIENTE_DETALLE",
      leadFormResponseId: `encola-${contador}`,
      leadGenFormResponse,
      occurredAt: 111_000_000,
    });
  });

  it("redelivery de la misma notificación converge al mismo recibo (Requirement: Idempotent reception)", async () => {
    const fuente = await crearBridgeConFuenteActiva();
    const leadGenFormResponse = `urn:li:leadGenFormResponse:redelivery-${contador}`;
    const payload = notificacionLeadAction({ leadGenFormResponse, owner: { organization: fuente.ownerUrn }, occurredAt: 222 });
    const rawBody = JSON.stringify(payload);

    const primera = await postLinkedIn(rawBody, firmar(rawBody));
    const segunda = await postLinkedIn(rawBody, firmar(rawBody));

    expect(primera.status).toBe(200);
    expect(segunda.status).toBe(200);
    const idExternoLead = `${leadGenFormResponse}:222`;
    expect(
      await testAdminPrisma.leadRecibido.count({ where: { bridgeId: fuente.bridgeId, idExternoLead } }),
    ).toBe(1);
  });

  it("leadAction DELETED: no encola nada y responde 200 (sin flujo de borrado en este proyecto)", async () => {
    const fuente = await crearBridgeConFuenteActiva();
    const leadGenFormResponse = `urn:li:leadGenFormResponse:deleted-${contador}`;
    const payload = notificacionLeadAction({ leadGenFormResponse, owner: { organization: fuente.ownerUrn }, leadAction: "DELETED" });
    const rawBody = JSON.stringify(payload);

    const respuesta = await postLinkedIn(rawBody, firmar(rawBody));

    expect(respuesta.status).toBe(200);
    expect(
      await testAdminPrisma.leadRecibido.findFirst({ where: { idExternoLead: { contains: leadGenFormResponse } } }),
    ).toBeNull();
  });

  it("owner sin fuente activa: registra ERROR holding-wide, no encola nada y responde 200", async () => {
    const leadGenFormResponse = `urn:li:leadGenFormResponse:sin-fuente-${Date.now()}`;
    const payload = notificacionLeadAction({
      leadGenFormResponse,
      owner: { organization: `urn:li:organization:inexistente-${Date.now()}` },
    });
    const rawBody = JSON.stringify(payload);

    const respuesta = await postLinkedIn(rawBody, firmar(rawBody));

    expect(respuesta.status).toBe(200);
    const log = await testAdminPrisma.bridgeLog.findFirst({
      where: { bridgeId: null, nivel: "ERROR" },
      orderBy: { ocurridoEn: "desc" },
    });
    expect(log?.mensaje).toContain("no se encontró ninguna fuente activa");
    expect(
      await testAdminPrisma.leadRecibido.findFirst({ where: { idExternoLead: { contains: leadGenFormResponse } } }),
    ).toBeNull();
  });

  it("payload con forma inesperada: firma válida pero body irreconocible → 200 sin encolar (nunca reintento indefinido)", async () => {
    const rawBody = JSON.stringify({ type: "ALGO_DISTINTO" });

    const respuesta = await postLinkedIn(rawBody, firmar(rawBody));

    expect(respuesta.status).toBe(200);
  });
});
