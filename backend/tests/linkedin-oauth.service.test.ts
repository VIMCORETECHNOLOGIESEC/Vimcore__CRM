import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { linkedinOAuthCallbackQuerySchema } from "../src/schemas/linkedin/linkedin-oauth.schema.js";
import { createLinkedInOAuthService } from "../src/services/linkedin/linkedin-oauth.service.js";

const NOW = new Date("2026-08-28T12:00:00.000Z");
const BRIDGE_ID = "11111111-1111-4111-8111-111111111111";
const USUARIO_ID = "22222222-2222-4222-8222-222222222222";
const RAW_STATE = Buffer.alloc(32, 7).toString("base64url");
const STATE_HASH = createHash("sha256").update(RAW_STATE).digest("hex");
const ACCESS_TOKEN = "access-token-ultrasecreto";
const REFRESH_TOKEN = "refresh-token-ultrasecreto";
const CLIENT_SECRET = "client-secret-ultrasecreto";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function conexionSegura(overrides: Record<string, unknown> = {}) {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    bridgeId: BRIDGE_ID,
    autorizadoPorUsuarioId: USUARIO_ID,
    memberUrn: null,
    accessTokenExpiraEn: new Date(NOW.getTime() + 3_600_000),
    refreshTokenExpiraEn: null,
    scopes: ["r_marketing_leadgen_automation"],
    estado: "ACTIVA",
    revocadoEn: null,
    creadoEn: NOW,
    actualizadoEn: NOW,
    ...overrides,
  };
}

function validState() {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    stateHash: STATE_HASH,
    bridgeId: BRIDGE_ID,
    usuarioId: USUARIO_ID,
    expiraEn: new Date(NOW.getTime() + 600_000),
    usadoEn: NOW,
    creadoEn: NOW,
  };
}

function createHarness(
  options: { configured?: boolean; refreshToken?: boolean; useOfficialBase?: boolean } = {},
) {
  const tokenBody = options.refreshToken
    ? {
        access_token: ACCESS_TOKEN,
        expires_in: 3_600,
        refresh_token: REFRESH_TOKEN,
        refresh_token_expires_in: 86_400,
        scope: "r_marketing_leadgen_automation",
        token_type: "Bearer",
      }
    : {
        access_token: ACCESS_TOKEN,
        expires_in: 3_600,
        scope: "r_marketing_leadgen_automation",
        token_type: "Bearer",
      };
  const tokenExchangeSignal = new AbortController().signal;
  const dependencies = {
    config: options.configured === false
      ? null
      : {
          clientId: "linkedin-client-id",
          clientSecret: CLIENT_SECRET,
          redirectUri: "http://localhost:3000/api/v1/integraciones/linkedin/oauth/callback",
        },
    ...(options.useOfficialBase ? {} : { oauthBaseUrl: "http://linkedin-oauth.test/oauth/v2" }),
    now: vi.fn(() => new Date(NOW)),
    randomBytes: vi.fn(() => Buffer.alloc(32, 7)),
    fetch: vi.fn().mockResolvedValue(jsonResponse(200, tokenBody)),
    createTimeoutSignal: vi.fn(() => tokenExchangeSignal),
    encryptToken: vi.fn((token: string) => `cifrado:${token === ACCESS_TOKEN ? "access" : "refresh"}`),
    findBridgeById: vi.fn().mockResolvedValue({ id: BRIDGE_ID, redSocial: "LINKEDIN" }),
    createState: vi.fn().mockResolvedValue(validState()),
    consumeValidState: vi.fn().mockResolvedValue(validState()),
    upsertFromAuthorization: vi.fn().mockImplementation(async (data) => conexionSegura({
      accessTokenExpiraEn: data.accessTokenExpiraEn,
      refreshTokenExpiraEn: data.refreshTokenExpiraEn ?? null,
      scopes: data.scopes,
    })),
  };
  return { dependencies, service: createLinkedInOAuthService(dependencies) };
}

describe("schemas/linkedin OAuth callback", () => {
  it("requiere state también cuando LinkedIn informa cancelación o error", () => {
    expect(linkedinOAuthCallbackQuerySchema.safeParse({ error: "user_cancelled_authorize" }).success)
      .toBe(false);
    expect(linkedinOAuthCallbackQuerySchema.safeParse({
      error: "user_cancelled_authorize",
      state: RAW_STATE,
    }).success).toBe(true);
  });
});

describe("services/linkedin OAuth — inicio", () => {
  it("genera state opaco, persiste solo SHA-256 por diez minutos y arma la URL oficial", async () => {
    const { dependencies, service } = createHarness({ useOfficialBase: true });

    const result = await service.startOAuth(BRIDGE_ID, USUARIO_ID);

    expect(dependencies.randomBytes).toHaveBeenCalledWith(32);
    expect(dependencies.createState).toHaveBeenCalledWith({
      stateHash: STATE_HASH,
      bridgeId: BRIDGE_ID,
      usuarioId: USUARIO_ID,
      expiraEn: new Date("2026-08-28T12:10:00.000Z"),
    });
    expect(JSON.stringify(dependencies.createState.mock.calls)).not.toContain(RAW_STATE);
    const authorizationUrl = new URL(result.authorizationUrl);
    expect(`${authorizationUrl.origin}${authorizationUrl.pathname}`).toBe(
      "https://www.linkedin.com/oauth/v2/authorization",
    );
    expect(Object.fromEntries(authorizationUrl.searchParams)).toEqual({
      response_type: "code",
      client_id: "linkedin-client-id",
      redirect_uri: "http://localhost:3000/api/v1/integraciones/linkedin/oauth/callback",
      state: RAW_STATE,
      scope: "r_marketing_leadgen_automation",
    });
    expect(result).toEqual({
      authorizationUrl: authorizationUrl.toString(),
      expiraEn: "2026-08-28T12:10:00.000Z",
    });
    expect(JSON.stringify(result)).not.toContain(CLIENT_SECRET);
  });

  it("oculta como no encontrado un bridge fuera del tenant actual", async () => {
    const { dependencies, service } = createHarness();
    dependencies.findBridgeById.mockResolvedValue(null);

    await expect(service.startOAuth(BRIDGE_ID, USUARIO_ID)).rejects.toMatchObject({
      code: "bridge_no_encontrado",
      statusHttp: 404,
    });
    expect(dependencies.createState).not.toHaveBeenCalled();
  });

  it("rechaza un bridge de otra red social", async () => {
    const { dependencies, service } = createHarness();
    dependencies.findBridgeById.mockResolvedValue({ id: BRIDGE_ID, redSocial: "FACEBOOK" });

    await expect(service.startOAuth(BRIDGE_ID, USUARIO_ID)).rejects.toMatchObject({
      code: "linkedin_bridge_invalido",
      statusHttp: 422,
      message: "El bridge no es válido para OAuth de LinkedIn",
    });
    expect(dependencies.createState).not.toHaveBeenCalled();
  });
});

describe("services/linkedin OAuth — callback", () => {
  it("consume el state antes del intercambio, cifra el access token y devuelve solo conexión segura", async () => {
    const { dependencies, service } = createHarness();

    const result = await service.completeOAuth({ code: "authorization-code", state: RAW_STATE });

    expect(dependencies.consumeValidState).toHaveBeenCalledWith(STATE_HASH);
    expect(dependencies.consumeValidState.mock.invocationCallOrder[0]).toBeLessThan(
      dependencies.fetch.mock.invocationCallOrder[0],
    );
    expect(dependencies.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = dependencies.fetch.mock.calls[0];
    expect(url).toBe("http://linkedin-oauth.test/oauth/v2/accessToken");
    expect(init).toMatchObject({
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    const body = new URLSearchParams(init.body as string);
    expect(Object.fromEntries(body)).toEqual({
      grant_type: "authorization_code",
      code: "authorization-code",
      client_id: "linkedin-client-id",
      client_secret: CLIENT_SECRET,
      redirect_uri: "http://localhost:3000/api/v1/integraciones/linkedin/oauth/callback",
    });
    expect(dependencies.encryptToken).toHaveBeenCalledWith(ACCESS_TOKEN);
    expect(dependencies.upsertFromAuthorization).toHaveBeenCalledWith({
      bridgeId: BRIDGE_ID,
      autorizadoPorUsuarioId: USUARIO_ID,
      accessTokenCifrado: "cifrado:access",
      refreshTokenCifrado: null,
      accessTokenExpiraEn: new Date("2026-08-28T13:00:00.000Z"),
      refreshTokenExpiraEn: null,
      scopes: ["r_marketing_leadgen_automation"],
    });
    expect(result).toEqual({
      id: "33333333-3333-4333-8333-333333333333",
      bridgeId: BRIDGE_ID,
      estado: "ACTIVA",
      accessTokenExpiraEn: "2026-08-28T13:00:00.000Z",
      refreshTokenExpiraEn: null,
      scopes: ["r_marketing_leadgen_automation"],
      tieneRefreshToken: false,
      fuentes: [],
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(ACCESS_TOKEN);
    expect(serialized).not.toContain("cifrado:access");
    expect(serialized).not.toContain(CLIENT_SECRET);
  });

  it("adjunta al intercambio un AbortSignal con timeout acotado", async () => {
    const { dependencies, service } = createHarness();

    await service.completeOAuth({ code: "authorization-code", state: RAW_STATE });

    expect(dependencies.createTimeoutSignal).toHaveBeenCalledWith(10_000);
    const [, init] = dependencies.fetch.mock.calls[0];
    expect(init.signal).toBe(dependencies.createTimeoutSignal.mock.results[0].value);
  });

  it("cifra y persiste refresh token con su vencimiento cuando LinkedIn lo entrega", async () => {
    const { dependencies, service } = createHarness({ refreshToken: true });

    const result = await service.completeOAuth({ code: "authorization-code", state: RAW_STATE });

    expect(dependencies.encryptToken).toHaveBeenNthCalledWith(1, ACCESS_TOKEN);
    expect(dependencies.encryptToken).toHaveBeenNthCalledWith(2, REFRESH_TOKEN);
    expect(dependencies.upsertFromAuthorization).toHaveBeenCalledWith(expect.objectContaining({
      refreshTokenCifrado: "cifrado:refresh",
      refreshTokenExpiraEn: new Date("2026-08-29T12:00:00.000Z"),
    }));
    expect(result.tieneRefreshToken).toBe(true);
    expect(result.refreshTokenExpiraEn).toBe("2026-08-29T12:00:00.000Z");
    expect(JSON.stringify(result)).not.toContain(REFRESH_TOKEN);
  });

  it("rechaza replay del state sin repetir el intercambio", async () => {
    const { dependencies, service } = createHarness();
    dependencies.consumeValidState
      .mockResolvedValueOnce(validState())
      .mockResolvedValueOnce(null);

    await service.completeOAuth({ code: "code-1", state: RAW_STATE });
    await expect(service.completeOAuth({ code: "code-2", state: RAW_STATE })).rejects.toMatchObject({
      code: "linkedin_oauth_state_invalido",
      statusHttp: 401,
    });
    expect(dependencies.fetch).toHaveBeenCalledTimes(1);
  });

  it.each(["expirado", "desconocido"])(
    "rechaza state %s antes del intercambio",
    async () => {
      const { dependencies, service } = createHarness();
      dependencies.consumeValidState.mockResolvedValue(null);

      await expect(service.completeOAuth({ code: "code", state: RAW_STATE })).rejects.toMatchObject({
        code: "linkedin_oauth_state_invalido",
        statusHttp: 401,
      });
      expect(dependencies.fetch).not.toHaveBeenCalled();
    },
  );

  it("consume un state válido al cancelar y no intercambia el código", async () => {
    const { dependencies, service } = createHarness();

    await expect(service.completeOAuth({
      error: "user_cancelled_authorize",
      error_description: `cancelado ${CLIENT_SECRET}`,
      state: RAW_STATE,
    })).rejects.toMatchObject({
      code: "linkedin_oauth_cancelado",
      statusHttp: 400,
      message: "La autorización de LinkedIn fue cancelada",
    });
    expect(dependencies.consumeValidState).toHaveBeenCalledWith(STATE_HASH);
    expect(dependencies.fetch).not.toHaveBeenCalled();
  });

  it.each([400, 401, 500, 503])("traduce respuesta HTTP %s sin exponer datos", async (status) => {
    const { dependencies, service } = createHarness();
    dependencies.fetch.mockResolvedValue(jsonResponse(status, {
      error: "invalid_client",
      error_description: `${CLIENT_SECRET} ${ACCESS_TOKEN}`,
    }));

    const error = await service.completeOAuth({ code: "code", state: RAW_STATE }).catch((cause) => cause);

    expect(error).toMatchObject({ code: "linkedin_oauth_intercambio_fallido", statusHttp: 502 });
    expect(error.message).not.toContain(CLIENT_SECRET);
    expect(error.message).not.toContain(ACCESS_TOKEN);
  });

  it("traduce JSON malformado a un error sanitizado", async () => {
    const { dependencies, service } = createHarness();
    dependencies.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockRejectedValue(new SyntaxError(`JSON ${ACCESS_TOKEN}`)),
    } as unknown as Response);

    await expect(service.completeOAuth({ code: "code", state: RAW_STATE })).rejects.toMatchObject({
      code: "linkedin_oauth_intercambio_fallido",
      statusHttp: 502,
      message: "No se pudo intercambiar el código de autorización con LinkedIn",
    });
  });

  it("rechaza una respuesta JSON que no cumple el schema", async () => {
    const { dependencies, service } = createHarness();
    dependencies.fetch.mockResolvedValue(jsonResponse(200, {
      access_token: ACCESS_TOKEN,
      expires_in: "3600",
      scope: "r_marketing_leadgen_automation",
    }));

    await expect(service.completeOAuth({ code: "code", state: RAW_STATE })).rejects.toMatchObject({
      code: "linkedin_oauth_intercambio_fallido",
      statusHttp: 502,
    });
    expect(dependencies.encryptToken).not.toHaveBeenCalled();
  });

  it("traduce fallos de red sin propagar la causa", async () => {
    const { dependencies, service } = createHarness();
    dependencies.fetch.mockRejectedValue(new Error(`${CLIENT_SECRET} ${ACCESS_TOKEN}`));

    const error = await service.completeOAuth({ code: "code", state: RAW_STATE }).catch((cause) => cause);

    expect(error).toMatchObject({ code: "linkedin_oauth_intercambio_fallido", statusHttp: 502 });
    expect(error.message).not.toContain(CLIENT_SECRET);
    expect(error.message).not.toContain(ACCESS_TOKEN);
  });

  it("sanitiza fallos de cifrado posteriores al intercambio", async () => {
    const { dependencies, service } = createHarness();
    dependencies.encryptToken.mockImplementation(() => {
      throw new Error(`${ACCESS_TOKEN} ${CLIENT_SECRET}`);
    });

    const error = await service.completeOAuth({ code: "code", state: RAW_STATE }).catch((cause) => cause);

    expect(error).toMatchObject({
      code: "linkedin_oauth_persistencia_fallida",
      statusHttp: 500,
      message: "No se pudo guardar la conexión de LinkedIn",
    });
    expect(error.message).not.toContain(ACCESS_TOKEN);
    expect(error.message).not.toContain(CLIENT_SECRET);
    expect(dependencies.upsertFromAuthorization).not.toHaveBeenCalled();
  });

  it("sanitiza fallos de persistencia posteriores al cifrado", async () => {
    const { dependencies, service } = createHarness();
    dependencies.upsertFromAuthorization.mockRejectedValue(
      new Error(`${ACCESS_TOKEN} cifrado:access ${CLIENT_SECRET}`),
    );

    const error = await service.completeOAuth({ code: "code", state: RAW_STATE }).catch((cause) => cause);

    expect(error).toMatchObject({
      code: "linkedin_oauth_persistencia_fallida",
      statusHttp: 500,
      message: "No se pudo guardar la conexión de LinkedIn",
    });
    expect(error.message).not.toContain(ACCESS_TOKEN);
    expect(error.message).not.toContain("cifrado:access");
    expect(error.message).not.toContain(CLIENT_SECRET);
  });
});

describe("services/linkedin OAuth — configuración ausente", () => {
  it("falla al iniciar con 503 sanitizado y sin consultar el bridge", async () => {
    const { dependencies, service } = createHarness({ configured: false });

    await expect(service.startOAuth(BRIDGE_ID, USUARIO_ID)).rejects.toMatchObject({
      code: "linkedin_oauth_no_configurado",
      statusHttp: 503,
      message: "La integración de LinkedIn no está configurada",
    });
    expect(dependencies.findBridgeById).not.toHaveBeenCalled();
  });

  it("falla al completar con 503 sin consumir el state", async () => {
    const { dependencies, service } = createHarness({ configured: false });

    await expect(service.completeOAuth({ code: "code", state: RAW_STATE })).rejects.toMatchObject({
      code: "linkedin_oauth_no_configurado",
      statusHttp: 503,
    });
    expect(dependencies.consumeValidState).not.toHaveBeenCalled();
    expect(dependencies.fetch).not.toHaveBeenCalled();
  });
});
