import { createHmac } from "node:crypto";
import request from "supertest";
import { afterAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { encrypt } from "../src/lib/cifrado-token.js";
import { hashClaveBridge } from "../src/lib/clave-bridge.js";
import { prisma } from "../src/lib/prisma.js";
import * as leadRecibidoRepository from "../src/repositories/lead-recibido.repository.js";
import { procesarRecepcion } from "../src/services/ingesta.service.js";

const app = createApp();
let contador = 0;

function cuerpoFirmado(payload: unknown): { rawBody: string; firma: string } {
  const rawBody = JSON.stringify(payload);
  const firma = `sha256=${createHmac("sha256", env.META_APP_SECRET).update(rawBody, "utf8").digest("hex")}`;
  return { rawBody, firma };
}

function postMeta(rawBody: string, firma?: string) {
  const req = request(app).post("/api/v1/ingesta/meta").set("Content-Type", "application/json");
  if (firma !== undefined) req.set("X-Hub-Signature-256", firma);
  return req.send(rawBody);
}

function notificacionLeadgen(leadgenId: string, pageId: string): unknown {
  return {
    object: "page",
    entry: [
      {
        id: pageId,
        time: 1_700_000_000,
        changes: [
          {
            field: "leadgen",
            value: { leadgen_id: leadgenId, page_id: pageId, form_id: "form-1", ad_id: "ad-1" },
          },
        ],
      },
    ],
  };
}

interface CuentaFixture {
  bridgeId: string;
  cuentaId: string;
  pageId: string;
}

async function crearBridgeConCuenta(
  overrides: { estadoToken?: "VALIDO" | "TOKEN_EXPIRADO" | "ERROR"; tokenCifrado?: string | null } = {},
): Promise<CuentaFixture> {
  contador += 1;
  const bridge = await prisma.bridge.create({
    data: {
      redSocial: "FACEBOOK",
      nombre: `Bridge Meta ${contador}`,
      claveApiHash: hashClaveBridge(`clave-meta-webhook-${contador}`),
      estado: "ACTIVO",
    },
  });
  const pageId = `page-meta-${contador}`;
  const cuenta = await prisma.cuentaPublicitaria.create({
    data: {
      bridgeId: bridge.id,
      idExterno: pageId,
      nombre: `Página Meta ${contador}`,
      estadoToken: overrides.estadoToken ?? "VALIDO",
      tokenCifrado:
        overrides.tokenCifrado === undefined ? encrypt("page-access-token-de-prueba") : overrides.tokenCifrado,
    },
  });
  return { bridgeId: bridge.id, cuentaId: cuenta.id, pageId };
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /api/v1/ingesta/meta — handshake de suscripción (docs/05-bridges.md §3)", () => {
  it("200 + hub.challenge en texto plano cuando hub.verify_token coincide", async () => {
    const respuesta = await request(app).get("/api/v1/ingesta/meta").query({
      "hub.mode": "subscribe",
      "hub.verify_token": env.META_WEBHOOK_VERIFY_TOKEN,
      "hub.challenge": "desafio-de-meta-123",
    });

    expect(respuesta.status).toBe(200);
    expect(respuesta.text).toBe("desafio-de-meta-123");
    expect(respuesta.headers["content-type"]).toContain("text/plain");
  });

  it("403 cuando hub.verify_token no coincide", async () => {
    const respuesta = await request(app).get("/api/v1/ingesta/meta").query({
      "hub.mode": "subscribe",
      "hub.verify_token": "token-incorrecto",
      "hub.challenge": "desafio-de-meta-123",
    });

    expect(respuesta.status).toBe(403);
    expect(respuesta.body).not.toEqual({});
  });
});

describe("POST /api/v1/ingesta/meta — verificación de firma X-Hub-Signature-256 (Requirement: Bridge authentication)", () => {
  it("401 sin encabezado de firma: registra ERROR en bridge_logs y no encola nada", async () => {
    const { rawBody } = cuerpoFirmado(notificacionLeadgen("leadgen-sin-firma", "page-sin-firma"));

    const respuesta = await postMeta(rawBody);

    expect(respuesta.status).toBe(401);
    const log = await prisma.bridgeLog.findFirst({
      where: {
        bridgeId: null,
        nivel: "ERROR",
        mensaje: "Firma X-Hub-Signature-256 inválida o ausente en webhook de Meta",
      },
      orderBy: { ocurridoEn: "desc" },
    });
    expect(log).not.toBeNull();
    expect(await prisma.leadRecibido.findFirst({ where: { idExternoLead: "leadgen-sin-firma" } })).toBeNull();
  });

  it("401 con firma calculada sobre un cuerpo distinto (Scenario: Invalid signature rejected): registra ERROR y no encola nada", async () => {
    const { rawBody } = cuerpoFirmado(notificacionLeadgen("leadgen-firma-invalida", "page-firma-invalida"));
    const firmaDeOtroCuerpo = cuerpoFirmado({ object: "page", entry: [] }).firma;

    const respuesta = await postMeta(rawBody, firmaDeOtroCuerpo);

    expect(respuesta.status).toBe(401);
    const log = await prisma.bridgeLog.findFirst({
      where: {
        bridgeId: null,
        nivel: "ERROR",
        mensaje: "Firma X-Hub-Signature-256 inválida o ausente en webhook de Meta",
      },
      orderBy: { ocurridoEn: "desc" },
    });
    expect(log).not.toBeNull();
    expect(
      await prisma.leadRecibido.findFirst({ where: { idExternoLead: "leadgen-firma-invalida" } }),
    ).toBeNull();
  });
});

describe("POST /api/v1/ingesta/meta — encolado durable (docs/05-bridges.md §2, §3; patrón M4 del buzón)", () => {
  it("firma válida: encola el leadgen_id en leads_recibidos (PENDIENTE, sin lead aún) y responde 200 sin llamar a Graph API", async () => {
    const cuenta = await crearBridgeConCuenta();
    const leadgenId = `leadgen-encola-${contador}`;
    const { rawBody, firma } = cuerpoFirmado(notificacionLeadgen(leadgenId, cuenta.pageId));

    const respuesta = await postMeta(rawBody, firma);

    expect(respuesta.status).toBe(200);
    const recepcion = await prisma.leadRecibido.findFirst({
      where: { bridgeId: cuenta.bridgeId, idExternoLead: leadgenId },
    });
    expect(recepcion).not.toBeNull();
    expect(recepcion?.estado).toBe("PENDIENTE");
    expect(recepcion?.leadId).toBeNull();
    expect(recepcion?.entradaProcesamiento).toMatchObject({
      version: 2,
      tipo: "META_PENDIENTE_DETALLE",
      leadgenId,
      pageId: cuenta.pageId,
    });
  });

  it("redelivery del mismo leadgen_id converge al mismo recibo (Requirement: Idempotent reception)", async () => {
    const cuenta = await crearBridgeConCuenta();
    const leadgenId = `leadgen-redelivery-${contador}`;
    const { rawBody, firma } = cuerpoFirmado(notificacionLeadgen(leadgenId, cuenta.pageId));

    const primera = await postMeta(rawBody, firma);
    const segunda = await postMeta(rawBody, firma);

    expect(primera.status).toBe(200);
    expect(segunda.status).toBe(200);
    expect(
      await prisma.leadRecibido.count({ where: { bridgeId: cuenta.bridgeId, idExternoLead: leadgenId } }),
    ).toBe(1);
  });

  it("Página desconocida (sin CuentaPublicitaria): registra ERROR, no encola nada y responde 200 sin lanzar", async () => {
    const leadgenId = `leadgen-pagina-desconocida-${Date.now()}`;
    const pageId = `page-desconocida-${Date.now()}`;
    const { rawBody, firma } = cuerpoFirmado(notificacionLeadgen(leadgenId, pageId));

    const respuesta = await postMeta(rawBody, firma);

    expect(respuesta.status).toBe(200);
    const log = await prisma.bridgeLog.findFirst({
      where: { bridgeId: null, nivel: "ERROR" },
      orderBy: { ocurridoEn: "desc" },
    });
    expect(log?.mensaje).toContain(pageId);
    expect(await prisma.leadRecibido.findFirst({ where: { idExternoLead: leadgenId } })).toBeNull();
  });

  it("encola igual cuando el token de la Página no está vigente: el chequeo se movió al worker, no bloquea la recepción del webhook", async () => {
    const cuenta = await crearBridgeConCuenta({ estadoToken: "TOKEN_EXPIRADO" });
    const leadgenId = `leadgen-token-expirado-encola-${contador}`;
    const { rawBody, firma } = cuerpoFirmado(notificacionLeadgen(leadgenId, cuenta.pageId));

    const respuesta = await postMeta(rawBody, firma);

    expect(respuesta.status).toBe(200);
    const recepcion = await prisma.leadRecibido.findFirst({
      where: { bridgeId: cuenta.bridgeId, idExternoLead: leadgenId },
    });
    expect(recepcion).not.toBeNull();
    expect(recepcion?.estado).toBe("PENDIENTE");
  });
});

describe("POST /api/v1/ingesta/meta → worker — pipeline completo (docs/05-bridges.md §2, §3)", () => {
  it("firma válida + Graph API exitosa: el webhook encola y el worker completa el lead en el mismo buzón", async () => {
    const cuenta = await crearBridgeConCuenta();
    const leadgenId = `leadgen-pipeline-exito-${contador}`;
    const { rawBody, firma } = cuerpoFirmado(notificacionLeadgen(leadgenId, cuenta.pageId));

    const respuesta = await postMeta(rawBody, firma);
    expect(respuesta.status).toBe(200);

    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        id: leadgenId,
        field_data: [
          { name: "full_name", values: ["Cliente Meta"] },
          { name: "phone_number", values: ["+5491100000001"] },
        ],
        ad_id: "ad-1",
        form_id: "form-1",
        campaign_id: "campania-1",
        campaign_name: "Campaña Meta",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    // Reclama puntualmente la fila que este `POST` encoló, por id (no por
    // `claimNext`, cuyo `ORDER BY disponible_en, recibido_en` sin filtrar
    // podría tomar una fila `PENDIENTE` distinta dejada por otro `it` de este
    // mismo archivo — mismo motivo por el que `ingesta-inbox.worker.test.ts`
    // construye el `InboxClaim` a mano en vez de encadenar `claimNext`).
    const encolada = await prisma.leadRecibido.findFirstOrThrow({
      where: { bridgeId: cuenta.bridgeId, idExternoLead: leadgenId },
    });
    const owner = "worker-pipeline-exito";
    const row = await prisma.leadRecibido.update({
      where: { id: encolada.id },
      data: { estado: "PROCESANDO", intentos: 1, leaseOwner: owner, leaseHasta: new Date(Date.now() + 60_000) },
    });
    const claim: leadRecibidoRepository.InboxClaim = {
      recepcionId: row.id,
      leaseOwner: owner,
      intento: 1,
      leaseHasta: row.leaseHasta!,
      entradaProcesamiento: row.entradaProcesamiento as unknown as leadRecibidoRepository.PersistedEntradaProcesamiento,
    };
    const completado = await procesarRecepcion(claim);

    expect(completado).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const recepcion = await prisma.leadRecibido.findFirstOrThrow({
      where: { bridgeId: cuenta.bridgeId, idExternoLead: leadgenId },
    });
    expect(recepcion.estado).toBe("PROCESADO");
    expect(recepcion.leadId).not.toBeNull();
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: recepcion.leadId! } });
    expect(lead.redSocial).toBe("FACEBOOK");
    expect(lead.payloadOriginal).toMatchObject({ id: leadgenId, campaign_id: "campania-1" });

    vi.unstubAllGlobals();
  });
});
