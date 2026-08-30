import { describe, expect, it, vi } from "vitest";
import { AppError } from "../src/lib/app-error.js";
import { createLinkedInTokenService } from "../src/services/linkedin/linkedin-token.service.js";

const NOW = new Date("2026-08-28T12:00:00.000Z");
const BRIDGE_ID = "11111111-1111-4111-8111-111111111111";
const CONEXION_ID = "22222222-2222-4222-8222-222222222222";
const ACCESS_TOKEN = "access-token-ultrasecreto";
const REFRESH_TOKEN = "refresh-token-ultrasecreto";
const NEW_ACCESS_TOKEN = "nuevo-access-token-ultrasecreto";
const NEW_REFRESH_TOKEN = "nuevo-refresh-token-ultrasecreto";
const CLIENT_SECRET = "client-secret-ultrasecreto";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function conexion(overrides: Record<string, unknown> = {}) {
  return {
    id: CONEXION_ID,
    bridgeId: BRIDGE_ID,
    autorizadoPorUsuarioId: "33333333-3333-4333-8333-333333333333",
    memberUrn: null,
    accessTokenCifrado: "cipher-access",
    refreshTokenCifrado: "cipher-refresh",
    accessTokenExpiraEn: new Date(NOW.getTime() + 60 * 60_000),
    refreshTokenExpiraEn: new Date(NOW.getTime() + 30 * 24 * 60 * 60_000),
    scopes: ["r_marketing_leadgen_automation"],
    estado: "ACTIVA",
    revocadoEn: null,
    creadoEn: NOW,
    actualizadoEn: NOW,
    ...overrides,
  };
}

function createHarness(overrides: Record<string, unknown> = {}) {
  const signal = new AbortController().signal;
  const dependencies = {
    config: { clientId: "linkedin-client-id", clientSecret: CLIENT_SECRET },
    oauthBaseUrl: "http://linkedin-oauth.test/oauth/v2",
    now: vi.fn(() => new Date(NOW)),
    fetch: vi.fn().mockResolvedValue(jsonResponse(200, {
      access_token: NEW_ACCESS_TOKEN,
      expires_in: 3_600,
      refresh_token: NEW_REFRESH_TOKEN,
      refresh_token_expires_in: 86_400,
      token_type: "Bearer",
    })),
    decryptToken: vi.fn((cipherText: string) => {
      if (cipherText === "cipher-access") return ACCESS_TOKEN;
      if (cipherText === "cipher-refresh") return REFRESH_TOKEN;
      return `plain:${cipherText}`;
    }),
    encryptToken: vi.fn((plainText: string) => `encrypted:${plainText === NEW_ACCESS_TOKEN ? "access" : "refresh"}`),
    createTimeoutSignal: vi.fn(() => signal),
    findWithEncryptedTokens: vi.fn().mockResolvedValue(conexion()),
    rotateTokens: vi.fn().mockResolvedValue(conexion({ accessTokenCifrado: "encrypted:access" })),
    markTokenExpired: vi.fn().mockResolvedValue(conexion({ estado: "TOKEN_EXPIRADO" })),
    ...overrides,
  };
  return { dependencies, service: createLinkedInTokenService(dependencies) };
}

describe("services/linkedin token boundary", () => {
  it("descifra el access token solo dentro del boundary y no lo retorna", async () => {
    const { dependencies, service } = createHarness();
    const callback = vi.fn().mockResolvedValue({ ok: true });

    const result = await service.withLinkedInAccessToken(BRIDGE_ID, callback);

    expect(result).toEqual({ ok: true });
    expect(dependencies.findWithEncryptedTokens).toHaveBeenCalledWith(BRIDGE_ID);
    expect(dependencies.decryptToken).toHaveBeenCalledWith("cipher-access");
    expect(callback).toHaveBeenCalledWith(ACCESS_TOKEN);
    expect(dependencies.fetch).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain(ACCESS_TOKEN);
  });

  it("refresca cuando el access token vence pronto, cifra tokens nuevos y persiste vencimientos", async () => {
    const { dependencies, service } = createHarness({
      findWithEncryptedTokens: vi.fn().mockResolvedValue(conexion({
        accessTokenExpiraEn: new Date(NOW.getTime() + 60_000),
      })),
    });
    const callback = vi.fn().mockResolvedValue("ok");

    await service.withLinkedInAccessToken(BRIDGE_ID, callback);

    expect(dependencies.decryptToken).toHaveBeenCalledWith("cipher-refresh");
    expect(dependencies.createTimeoutSignal).toHaveBeenCalledWith(10_000);
    const [url, init] = dependencies.fetch.mock.calls[0];
    expect(url).toBe("http://linkedin-oauth.test/oauth/v2/accessToken");
    expect(init).toMatchObject({
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    expect(Object.fromEntries(new URLSearchParams(init.body as string))).toEqual({
      grant_type: "refresh_token",
      refresh_token: REFRESH_TOKEN,
      client_id: "linkedin-client-id",
      client_secret: CLIENT_SECRET,
    });
    expect(dependencies.encryptToken).toHaveBeenNthCalledWith(1, NEW_ACCESS_TOKEN);
    expect(dependencies.encryptToken).toHaveBeenNthCalledWith(2, NEW_REFRESH_TOKEN);
    expect(dependencies.rotateTokens).toHaveBeenCalledWith(CONEXION_ID, {
      accessTokenCifrado: "encrypted:access",
      accessTokenExpiraEn: new Date("2026-08-28T13:00:00.000Z"),
      refreshTokenCifrado: "encrypted:refresh",
      refreshTokenExpiraEn: new Date("2026-08-29T12:00:00.000Z"),
    });
    expect(callback).toHaveBeenCalledWith(NEW_ACCESS_TOKEN);
  });

  it("preserva el refresh token anterior cuando LinkedIn no devuelve uno nuevo", async () => {
    const { dependencies, service } = createHarness({
      findWithEncryptedTokens: vi.fn().mockResolvedValue(conexion({
        accessTokenExpiraEn: new Date(NOW.getTime() + 60_000),
      })),
      fetch: vi.fn().mockResolvedValue(jsonResponse(200, {
        access_token: NEW_ACCESS_TOKEN,
        expires_in: 3_600,
        token_type: "Bearer",
      })),
    });

    await service.withLinkedInAccessToken(BRIDGE_ID, vi.fn().mockResolvedValue("ok"));

    expect(dependencies.rotateTokens).toHaveBeenCalledWith(CONEXION_ID, {
      accessTokenCifrado: "encrypted:access",
      accessTokenExpiraEn: new Date("2026-08-28T13:00:00.000Z"),
    });
  });

  it.each([
    ["sin conexión", null],
    ["revocada", conexion({ estado: "REVOCADA", revocadoEn: NOW })],
    ["en error", conexion({ estado: "ERROR" })],
    ["token marcado expirado", conexion({ estado: "TOKEN_EXPIRADO" })],
  ])("exige reconexión cuando la conexión está %s", async (_caseName, connection) => {
    const { dependencies, service } = createHarness({
      findWithEncryptedTokens: vi.fn().mockResolvedValue(connection),
    });

    await expect(service.withLinkedInAccessToken(BRIDGE_ID, vi.fn())).rejects.toMatchObject({
      code: "linkedin_reconexion_requerida",
      statusHttp: 409,
    });
    expect(dependencies.decryptToken).not.toHaveBeenCalled();
  });

  it("sin refresh token y access vencido marca TOKEN_EXPIRADO y exige reconexión", async () => {
    const { dependencies, service } = createHarness({
      findWithEncryptedTokens: vi.fn().mockResolvedValue(conexion({
        refreshTokenCifrado: null,
        accessTokenExpiraEn: new Date(NOW.getTime() - 1),
      })),
    });

    await expect(service.withLinkedInAccessToken(BRIDGE_ID, vi.fn())).rejects.toMatchObject({
      code: "linkedin_reconexion_requerida",
      statusHttp: 409,
    });
    expect(dependencies.markTokenExpired).toHaveBeenCalledWith(CONEXION_ID);
    expect(dependencies.fetch).not.toHaveBeenCalled();
  });

  it("si el refresh falla o devuelve schema inválido marca TOKEN_EXPIRADO sin exponer detalles", async () => {
    const { dependencies, service } = createHarness({
      findWithEncryptedTokens: vi.fn().mockResolvedValue(conexion({
        accessTokenExpiraEn: new Date(NOW.getTime() + 60_000),
      })),
      fetch: vi.fn().mockResolvedValue(jsonResponse(401, { error: "invalid_grant", token: REFRESH_TOKEN })),
    });

    await expect(service.withLinkedInAccessToken(BRIDGE_ID, vi.fn())).rejects.toMatchObject({
      code: "linkedin_reconexion_requerida",
    });
    expect(dependencies.markTokenExpired).toHaveBeenCalledWith(CONEXION_ID);

    const invalid = createHarness({
      findWithEncryptedTokens: vi.fn().mockResolvedValue(conexion({
        accessTokenExpiraEn: new Date(NOW.getTime() + 60_000),
      })),
      fetch: vi.fn().mockResolvedValue(jsonResponse(200, { access_token: "", expires_in: 0 })),
    });
    await expect(invalid.service.withLinkedInAccessToken(BRIDGE_ID, vi.fn())).rejects.toMatchObject({
      code: "linkedin_reconexion_requerida",
    });
    expect(invalid.dependencies.markTokenExpired).toHaveBeenCalledWith(CONEXION_ID);
  });

  it("marca TOKEN_EXPIRADO cuando LinkedIn responde 401 dentro del API boundary", async () => {
    const { dependencies, service } = createHarness();
    const callback = vi.fn().mockRejectedValue(new AppError("linkedin_token_expirado", 409, "expirado"));

    await expect(service.withLinkedInAccessToken(BRIDGE_ID, callback)).rejects.toMatchObject({
      code: "linkedin_reconexion_requerida",
      statusHttp: 409,
    });

    expect(dependencies.markTokenExpired).toHaveBeenCalledWith(CONEXION_ID);
  });
});
