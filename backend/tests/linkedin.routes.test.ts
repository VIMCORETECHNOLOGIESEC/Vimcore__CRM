import type { NextFunction, Request, Response } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../src/lib/app-error.js";

const mocks = vi.hoisted(() => ({
  startLinkedInOAuth: vi.fn(),
  completeLinkedInOAuth: vi.fn(),
  probarConexionLinkedIn: vi.fn(),
  descubrirFuentesLinkedIn: vi.fn(),
  actualizarActivacionLinkedInFuente: vi.fn(),
  findBridgeById: vi.fn(),
  findConexionByBridgeId: vi.fn(),
  listFuentesByBridge: vi.fn(),
}));

vi.mock("../src/services/linkedin/linkedin-oauth.service.js", () => ({
  startLinkedInOAuth: mocks.startLinkedInOAuth,
  completeLinkedInOAuth: mocks.completeLinkedInOAuth,
}));

vi.mock("../src/services/linkedin/linkedin-probar-conexion.service.js", () => ({
  probarConexionLinkedIn: mocks.probarConexionLinkedIn,
}));

vi.mock("../src/services/linkedin/linkedin-discovery.service.js", () => ({
  descubrirFuentesLinkedIn: mocks.descubrirFuentesLinkedIn,
}));

vi.mock("../src/services/linkedin/linkedin-subscription.service.js", () => ({
  actualizarActivacionLinkedInFuente: mocks.actualizarActivacionLinkedInFuente,
}));

vi.mock("../src/repositories/bridge.repository.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/repositories/bridge.repository.js")>(),
  findById: mocks.findBridgeById,
}));

vi.mock("../src/repositories/linkedin/linkedin-conexion.repository.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/repositories/linkedin/linkedin-conexion.repository.js")>(),
  findByBridgeId: mocks.findConexionByBridgeId,
}));

vi.mock("../src/repositories/linkedin/linkedin-fuente.repository.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/repositories/linkedin/linkedin-fuente.repository.js")>(),
  listByBridge: mocks.listFuentesByBridge,
}));

vi.mock("../src/middlewares/require-authentication.middleware.js", async () => {
  const { AppError: AuthenticationError } = await import("../src/lib/app-error.js");
  return {
    requireAuthentication(req: Request, _res: Response, next: NextFunction): void {
      const token = req.headers.authorization;
      if (token !== "Bearer admin-token" && token !== "Bearer vendedor-token") {
        next(new AuthenticationError("no_autenticado", 401, "Falta el token de acceso"));
        return;
      }
      req.user = {
        id: token === "Bearer admin-token" ? ADMIN_ID : VENDEDOR_ID,
        nombre: "Usuario de prueba",
        correo: "usuario@prueba.local",
        rol: token === "Bearer admin-token" ? "ADMINISTRADOR" : "VENDEDOR",
        sessionScope: "holding",
        empresaId: null,
      };
      next();
    },
  };
});

vi.mock("../src/services/shadow-authorization.service.js", () => ({
  compareRequireRole: vi.fn(),
}));

import { createApp } from "../src/app.js";

const app = createApp();
const BRIDGE_ID = "11111111-1111-4111-8111-111111111111";
const ADMIN_ID = "22222222-2222-4222-8222-222222222222";
const VENDEDOR_ID = "33333333-3333-4333-8333-333333333333";
const CONEXION_ID = "44444444-4444-4444-8444-444444444444";
const FUENTE_ID = "55555555-5555-4555-8555-555555555555";
const CALLBACK_STATE = "estado-opaco-de-un-solo-uso";

const conexionDto = {
  id: CONEXION_ID,
  bridgeId: BRIDGE_ID,
  estado: "ACTIVA",
  accessTokenExpiraEn: "2026-08-28T18:00:00.000Z",
  refreshTokenExpiraEn: null,
  scopes: ["r_marketing_leadgen_automation"],
  tieneRefreshToken: true,
  fuentes: [],
};

function comoAdmin(testRequest: request.Test): request.Test {
  return testRequest.set("Authorization", "Bearer admin-token");
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.startLinkedInOAuth.mockResolvedValue({
    authorizationUrl: "https://www.linkedin.com/oauth/v2/authorization?state=opaco",
    expiraEn: "2026-08-28T17:10:00.000Z",
  });
  mocks.completeLinkedInOAuth.mockResolvedValue(conexionDto);
  mocks.probarConexionLinkedIn.mockResolvedValue({
    conectado: true,
    verificadoEn: "2026-08-28T18:30:00.000Z",
  });
  mocks.descubrirFuentesLinkedIn.mockResolvedValue({ fuentes: [] });
  mocks.actualizarActivacionLinkedInFuente.mockResolvedValue({
    id: FUENTE_ID,
    tipo: "SPONSORED_ACCOUNT",
    ownerUrn: "urn:li:sponsoredAccount:123",
    nombre: "Cuenta local",
    tipoLead: "SPONSORED",
    activa: true,
    estadoSuscripcion: "ACTIVA",
    ultimaSincronizacionEn: null,
  });
  mocks.findBridgeById.mockResolvedValue({ id: BRIDGE_ID, redSocial: "LINKEDIN" });
  mocks.findConexionByBridgeId.mockResolvedValue(null);
  mocks.listFuentesByBridge.mockResolvedValue([]);
});

describe("POST /api/v1/bridges/:id/linkedin/oauth/iniciar", () => {
  it("devuelve 200 e inicia OAuth con el bridge y el usuario autenticado", async () => {
    const respuesta = await comoAdmin(request(app).post(`/api/v1/bridges/${BRIDGE_ID}/linkedin/oauth/iniciar`));

    expect(respuesta.status).toBe(200);
    expect(mocks.startLinkedInOAuth).toHaveBeenCalledWith(BRIDGE_ID, ADMIN_ID);
    expect(respuesta.body.authorizationUrl).toContain("linkedin.com/oauth/v2/authorization");
  });

  it("aplica autenticación, rol administrador y validación UUID antes del servicio", async () => {
    const sinToken = await request(app).post(`/api/v1/bridges/${BRIDGE_ID}/linkedin/oauth/iniciar`);
    const vendedor = await request(app)
      .post(`/api/v1/bridges/${BRIDGE_ID}/linkedin/oauth/iniciar`)
      .set("Authorization", "Bearer vendedor-token");
    const idInvalido = await comoAdmin(request(app).post("/api/v1/bridges/no-es-uuid/linkedin/oauth/iniciar"));

    expect(sinToken.status).toBe(401);
    expect(vendedor.status).toBe(403);
    expect(idInvalido.status).toBe(400);
    expect(mocks.startLinkedInOAuth).toHaveBeenCalledTimes(0);
  });
});

describe("GET /api/v1/bridges/:id/linkedin/conexion", () => {
  it("devuelve null y no cae en la ruta genérica /bridges/:id", async () => {
    const respuesta = await comoAdmin(request(app).get(`/api/v1/bridges/${BRIDGE_ID}/linkedin/conexion`));

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ conexion: null });
    expect(mocks.findBridgeById).toHaveBeenCalledWith(BRIDGE_ID);
  });

  it("devuelve solo el DTO seguro de conexión", async () => {
    mocks.findConexionByBridgeId.mockResolvedValue({
      ...conexionDto,
      autorizadoPorUsuarioId: ADMIN_ID,
      memberUrn: null,
      accessTokenExpiraEn: new Date(conexionDto.accessTokenExpiraEn),
      refreshTokenExpiraEn: null,
      revocadoEn: null,
      creadoEn: new Date(),
      actualizadoEn: new Date(),
      accessTokenCifrado: "ciphertext-access",
      refreshTokenCifrado: "ciphertext-refresh",
    });

    const respuesta = await comoAdmin(request(app).get(`/api/v1/bridges/${BRIDGE_ID}/linkedin/conexion`));

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ conexion: conexionDto });
    expect(JSON.stringify(respuesta.body)).not.toMatch(/ciphertext|tokenCifrado|clientSecret/i);
  });

  it("propaga bridge oculto/inexistente y red incorrecta desde la capa de servicio", async () => {
    mocks.findBridgeById.mockResolvedValueOnce(null);
    const inexistente = await comoAdmin(request(app).get(`/api/v1/bridges/${BRIDGE_ID}/linkedin/conexion`));
    mocks.findBridgeById.mockResolvedValueOnce({ id: BRIDGE_ID, redSocial: "FACEBOOK" });
    const redIncorrecta = await comoAdmin(request(app).get(`/api/v1/bridges/${BRIDGE_ID}/linkedin/conexion`));

    expect(inexistente.status).toBe(404);
    expect(inexistente.body.code).toBe("bridge_no_encontrado");
    expect(redIncorrecta.status).toBe(422);
    expect(redIncorrecta.body.code).toBe("linkedin_bridge_invalido");
    expect(mocks.findConexionByBridgeId).not.toHaveBeenCalled();
  });

  it("aplica autenticación, rol administrador y validación UUID", async () => {
    const sinToken = await request(app).get(`/api/v1/bridges/${BRIDGE_ID}/linkedin/conexion`);
    const vendedor = await request(app)
      .get(`/api/v1/bridges/${BRIDGE_ID}/linkedin/conexion`)
      .set("Authorization", "Bearer vendedor-token");
    const idInvalido = await comoAdmin(request(app).get("/api/v1/bridges/no-es-uuid/linkedin/conexion"));

    expect(sinToken.status).toBe(401);
    expect(vendedor.status).toBe(403);
    expect(idInvalido.status).toBe(400);
  });
});

describe("POST /api/v1/bridges/:id/linkedin/probar-conexion", () => {
  it("devuelve una respuesta sanitizada de conexión verificada", async () => {
    const respuesta = await comoAdmin(request(app).post(`/api/v1/bridges/${BRIDGE_ID}/linkedin/probar-conexion`));

    expect(respuesta.status).toBe(200);
    expect(mocks.probarConexionLinkedIn).toHaveBeenCalledWith(BRIDGE_ID);
    expect(respuesta.body).toEqual({
      conectado: true,
      verificadoEn: "2026-08-28T18:30:00.000Z",
    });
    expect(JSON.stringify(respuesta.body)).not.toMatch(/access-token|refresh-token|ciphertext|client-secret/i);
  });

  it("aplica autenticación, rol administrador y validación UUID antes del servicio", async () => {
    const sinToken = await request(app).post(`/api/v1/bridges/${BRIDGE_ID}/linkedin/probar-conexion`);
    const vendedor = await request(app)
      .post(`/api/v1/bridges/${BRIDGE_ID}/linkedin/probar-conexion`)
      .set("Authorization", "Bearer vendedor-token");
    const idInvalido = await comoAdmin(request(app).post("/api/v1/bridges/no-es-uuid/linkedin/probar-conexion"));

    expect(sinToken.status).toBe(401);
    expect(vendedor.status).toBe(403);
    expect(idInvalido.status).toBe(400);
    expect(mocks.probarConexionLinkedIn).toHaveBeenCalledTimes(0);
  });

  it("propaga errores sanitizados del servicio", async () => {
    mocks.probarConexionLinkedIn.mockRejectedValueOnce(
      new AppError("linkedin_reconexion_requerida", 409, "Debes volver a conectar LinkedIn"),
    );

    const respuesta = await comoAdmin(request(app).post(`/api/v1/bridges/${BRIDGE_ID}/linkedin/probar-conexion`));

    expect(respuesta.status).toBe(409);
    expect(respuesta.body).toEqual({
      code: "linkedin_reconexion_requerida",
      message: "Debes volver a conectar LinkedIn",
    });
  });
});

describe("GET /api/v1/bridges/:id/linkedin/fuentes", () => {
  it("devuelve fuentes locales seguras sin consultar discovery", async () => {
    mocks.listFuentesByBridge.mockResolvedValueOnce([
      {
        id: "55555555-5555-4555-8555-555555555555",
        tipo: "SPONSORED_ACCOUNT",
        ownerUrn: "urn:li:sponsoredAccount:123",
        nombre: "Cuenta local",
        tipoLead: "SPONSORED",
        activa: false,
        estadoSuscripcion: "PENDIENTE",
        ultimaSincronizacionEn: null,
        subscriptionId: "subscription-no-debe-salir",
      },
    ]);

    const respuesta = await comoAdmin(request(app).get(`/api/v1/bridges/${BRIDGE_ID}/linkedin/fuentes`));

    expect(respuesta.status).toBe(200);
    expect(mocks.findBridgeById).toHaveBeenCalledWith(BRIDGE_ID);
    expect(mocks.listFuentesByBridge).toHaveBeenCalledWith(BRIDGE_ID);
    expect(mocks.descubrirFuentesLinkedIn).not.toHaveBeenCalled();
    expect(respuesta.body).toEqual({
      fuentes: [
        {
          id: "55555555-5555-4555-8555-555555555555",
          tipo: "SPONSORED_ACCOUNT",
          ownerUrn: "urn:li:sponsoredAccount:123",
          nombre: "Cuenta local",
          tipoLead: "SPONSORED",
          activa: false,
          estadoSuscripcion: "PENDIENTE",
          ultimaSincronizacionEn: null,
        },
      ],
    });
    expect(JSON.stringify(respuesta.body)).not.toMatch(/subscription|ciphertext|token/i);
  });

  it("aplica autenticación, rol administrador y validación UUID", async () => {
    const sinToken = await request(app).get(`/api/v1/bridges/${BRIDGE_ID}/linkedin/fuentes`);
    const vendedor = await request(app)
      .get(`/api/v1/bridges/${BRIDGE_ID}/linkedin/fuentes`)
      .set("Authorization", "Bearer vendedor-token");
    const idInvalido = await comoAdmin(request(app).get("/api/v1/bridges/no-es-uuid/linkedin/fuentes"));

    expect(sinToken.status).toBe(401);
    expect(vendedor.status).toBe(403);
    expect(idInvalido.status).toBe(400);
    expect(mocks.listFuentesByBridge).toHaveBeenCalledTimes(0);
  });
});

describe("POST /api/v1/bridges/:id/linkedin/fuentes/descubrir", () => {
  it("ejecuta discovery y devuelve fuentes sanitizadas respetando el orden de ruta específica", async () => {
    mocks.descubrirFuentesLinkedIn.mockResolvedValueOnce({
      fuentes: [
        {
          id: "55555555-5555-4555-8555-555555555555",
          tipo: "ORGANIZATION",
          ownerUrn: "urn:li:organization:456",
          nombre: "Organización local",
          tipoLead: "COMPANY",
          activa: false,
          estadoSuscripcion: "PENDIENTE",
          ultimaSincronizacionEn: null,
        },
      ],
    });

    const respuesta = await comoAdmin(request(app).post(`/api/v1/bridges/${BRIDGE_ID}/linkedin/fuentes/descubrir`));

    expect(respuesta.status).toBe(200);
    expect(mocks.descubrirFuentesLinkedIn).toHaveBeenCalledWith(BRIDGE_ID);
    expect(respuesta.body.fuentes).toHaveLength(1);
    expect(JSON.stringify(respuesta.body)).not.toMatch(/ciphertext|token|subscriptionId/i);
  });

  it("aplica autenticación, rol administrador y validación UUID antes del servicio", async () => {
    const sinToken = await request(app).post(`/api/v1/bridges/${BRIDGE_ID}/linkedin/fuentes/descubrir`);
    const vendedor = await request(app)
      .post(`/api/v1/bridges/${BRIDGE_ID}/linkedin/fuentes/descubrir`)
      .set("Authorization", "Bearer vendedor-token");
    const idInvalido = await comoAdmin(request(app).post("/api/v1/bridges/no-es-uuid/linkedin/fuentes/descubrir"));

    expect(sinToken.status).toBe(401);
    expect(vendedor.status).toBe(403);
    expect(idInvalido.status).toBe(400);
    expect(mocks.descubrirFuentesLinkedIn).toHaveBeenCalledTimes(0);
  });

  it("propaga errores sanitizados del servicio", async () => {
    mocks.descubrirFuentesLinkedIn.mockRejectedValueOnce(
      new AppError("linkedin_api_error", 502, "No se pudo consultar la API de LinkedIn"),
    );

    const respuesta = await comoAdmin(request(app).post(`/api/v1/bridges/${BRIDGE_ID}/linkedin/fuentes/descubrir`));

    expect(respuesta.status).toBe(502);
    expect(respuesta.body).toEqual({
      code: "linkedin_api_error",
      message: "No se pudo consultar la API de LinkedIn",
    });
  });
});

describe("PATCH /api/v1/bridges/:id/linkedin/fuentes/:fuenteId", () => {
  it("activa una fuente y devuelve el DTO sanitizado sin exponer subscriptionId", async () => {
    const respuesta = await comoAdmin(
      request(app).patch(`/api/v1/bridges/${BRIDGE_ID}/linkedin/fuentes/${FUENTE_ID}`).send({ activa: true }),
    );

    expect(respuesta.status).toBe(200);
    expect(mocks.actualizarActivacionLinkedInFuente).toHaveBeenCalledWith(BRIDGE_ID, FUENTE_ID, true);
    expect(respuesta.body).toEqual({
      fuente: {
        id: FUENTE_ID,
        tipo: "SPONSORED_ACCOUNT",
        ownerUrn: "urn:li:sponsoredAccount:123",
        nombre: "Cuenta local",
        tipoLead: "SPONSORED",
        activa: true,
        estadoSuscripcion: "ACTIVA",
        ultimaSincronizacionEn: null,
      },
    });
    expect(JSON.stringify(respuesta.body)).not.toMatch(/subscription|ciphertext|token/i);
  });

  it("desactiva una fuente pasando activa=false", async () => {
    mocks.actualizarActivacionLinkedInFuente.mockResolvedValueOnce({
      id: FUENTE_ID,
      tipo: "SPONSORED_ACCOUNT",
      ownerUrn: "urn:li:sponsoredAccount:123",
      nombre: "Cuenta local",
      tipoLead: "SPONSORED",
      activa: false,
      estadoSuscripcion: "REVOCADA",
      ultimaSincronizacionEn: null,
    });

    const respuesta = await comoAdmin(
      request(app).patch(`/api/v1/bridges/${BRIDGE_ID}/linkedin/fuentes/${FUENTE_ID}`).send({ activa: false }),
    );

    expect(respuesta.status).toBe(200);
    expect(mocks.actualizarActivacionLinkedInFuente).toHaveBeenCalledWith(BRIDGE_ID, FUENTE_ID, false);
    expect(respuesta.body.fuente).toMatchObject({ activa: false, estadoSuscripcion: "REVOCADA" });
  });

  it("aplica autenticación, rol administrador y validación UUID antes del servicio", async () => {
    const sinToken = await request(app)
      .patch(`/api/v1/bridges/${BRIDGE_ID}/linkedin/fuentes/${FUENTE_ID}`)
      .send({ activa: true });
    const vendedor = await request(app)
      .patch(`/api/v1/bridges/${BRIDGE_ID}/linkedin/fuentes/${FUENTE_ID}`)
      .set("Authorization", "Bearer vendedor-token")
      .send({ activa: true });
    const idInvalido = await comoAdmin(
      request(app).patch(`/api/v1/bridges/no-es-uuid/linkedin/fuentes/${FUENTE_ID}`).send({ activa: true }),
    );
    const fuenteIdInvalido = await comoAdmin(
      request(app).patch(`/api/v1/bridges/${BRIDGE_ID}/linkedin/fuentes/no-es-uuid`).send({ activa: true }),
    );

    expect(sinToken.status).toBe(401);
    expect(vendedor.status).toBe(403);
    expect(idInvalido.status).toBe(400);
    expect(fuenteIdInvalido.status).toBe(400);
    expect(mocks.actualizarActivacionLinkedInFuente).toHaveBeenCalledTimes(0);
  });

  it("rechaza un cuerpo sin el booleano activa", async () => {
    const respuesta = await comoAdmin(
      request(app).patch(`/api/v1/bridges/${BRIDGE_ID}/linkedin/fuentes/${FUENTE_ID}`).send({}),
    );

    expect(respuesta.status).toBe(400);
    expect(mocks.actualizarActivacionLinkedInFuente).toHaveBeenCalledTimes(0);
  });

  it("propaga errores sanitizados del servicio", async () => {
    mocks.actualizarActivacionLinkedInFuente.mockRejectedValueOnce(
      new AppError("linkedin_fuente_no_encontrada", 404, "Fuente LinkedIn no encontrada"),
    );

    const respuesta = await comoAdmin(
      request(app).patch(`/api/v1/bridges/${BRIDGE_ID}/linkedin/fuentes/${FUENTE_ID}`).send({ activa: true }),
    );

    expect(respuesta.status).toBe(404);
    expect(respuesta.body).toEqual({
      code: "linkedin_fuente_no_encontrada",
      message: "Fuente LinkedIn no encontrada",
    });
  });
});

describe("GET /api/v1/integraciones/linkedin/oauth/callback", () => {
  it("es público, valida el callback y devuelve la conexión sanitizada", async () => {
    const respuesta = await request(app)
      .get("/api/v1/integraciones/linkedin/oauth/callback")
      .query({ code: "authorization-code", state: CALLBACK_STATE });

    expect(respuesta.status).toBe(200);
    expect(mocks.completeLinkedInOAuth).toHaveBeenCalledWith({ code: "authorization-code", state: CALLBACK_STATE });
    expect(respuesta.body).toEqual({ conexion: conexionDto });
    expect(JSON.stringify(respuesta.body)).not.toMatch(/access-token|refresh-token|client-secret|ciphertext/i);
  });

  it("propaga cancelación y state inválido o reproducido sin exponer detalles", async () => {
    mocks.completeLinkedInOAuth.mockRejectedValueOnce(
      new AppError("linkedin_oauth_cancelado", 400, "La autorización de LinkedIn fue cancelada"),
    );
    const cancelado = await request(app)
      .get("/api/v1/integraciones/linkedin/oauth/callback")
      .query({ error: "user_cancelled_authorize", error_description: "cancelled", state: CALLBACK_STATE });
    mocks.completeLinkedInOAuth.mockRejectedValueOnce(
      new AppError("linkedin_oauth_state_invalido", 401, "El estado de autorización de LinkedIn es inválido o expiró"),
    );
    const reproducido = await request(app)
      .get("/api/v1/integraciones/linkedin/oauth/callback")
      .query({ code: "authorization-code", state: CALLBACK_STATE });

    expect(cancelado.status).toBe(400);
    expect(cancelado.body.code).toBe("linkedin_oauth_cancelado");
    expect(reproducido.status).toBe(401);
    expect(reproducido.body.code).toBe("linkedin_oauth_state_invalido");
  });

  it("rechaza un callback inválido antes del servicio", async () => {
    const respuesta = await request(app)
      .get("/api/v1/integraciones/linkedin/oauth/callback")
      .query({ code: "sin-state" });

    expect(respuesta.status).toBe(400);
    expect(mocks.completeLinkedInOAuth).not.toHaveBeenCalled();
  });

  it("no acepta returnTo ni lo entrega al servicio", async () => {
    const respuesta = await request(app)
      .get("/api/v1/integraciones/linkedin/oauth/callback")
      .query({ code: "authorization-code", state: CALLBACK_STATE, returnTo: "https://evil.example" });

    expect(respuesta.status).toBe(400);
    expect(mocks.completeLinkedInOAuth).not.toHaveBeenCalled();
    expect(respuesta.headers.location).toBeUndefined();
  });
});
