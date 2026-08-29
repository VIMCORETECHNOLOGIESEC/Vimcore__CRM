import { createHash, randomBytes as nodeRandomBytes } from "node:crypto";
import { env } from "../../config/env.js";
import { AppError } from "../../lib/app-error.js";
import { encrypt } from "../../lib/cifrado-token.js";
import * as bridgeRepository from "../../repositories/bridge.repository.js";
import * as linkedinConexionRepository from "../../repositories/linkedin/linkedin-conexion.repository.js";
import type {
  LinkedInConexionSafe,
  UpsertFromAuthorizationData,
} from "../../repositories/linkedin/linkedin-conexion.repository.js";
import * as linkedinOAuthStateRepository from "../../repositories/linkedin/linkedin-oauth-state.repository.js";
import type { CreateLinkedInOAuthStateData } from "../../repositories/linkedin/linkedin-oauth-state.repository.js";
import {
  linkedinTokenResponseSchema,
  type LinkedInOAuthCallbackQuery,
  type LinkedInTokenResponseBody,
} from "../../schemas/linkedin/linkedin-oauth.schema.js";
import type { LinkedInConexionDto, LinkedInOAuthStartDto } from "../../types/linkedin/linkedin.dto.js";

const OFFICIAL_LINKEDIN_OAUTH_BASE_URL = "https://www.linkedin.com/oauth/v2";
const OAUTH_STATE_TTL_MS = 10 * 60_000;
const OAUTH_STATE_BYTES = 32;
const TOKEN_EXCHANGE_TIMEOUT_MS = 10_000;
const LINKEDIN_OAUTH_SCOPES = ["r_marketing_leadgen_automation"] as const;

export interface LinkedInOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

interface ConsumedOAuthState {
  bridgeId: string;
  usuarioId: string;
}

export interface LinkedInOAuthDependencies {
  config: LinkedInOAuthConfig | null;
  oauthBaseUrl?: string;
  now: () => Date;
  randomBytes: (size: number) => Uint8Array;
  fetch: typeof globalThis.fetch;
  tokenExchangeTimeoutMs?: number;
  createTimeoutSignal?: (timeoutMs: number) => AbortSignal;
  encryptToken: (token: string) => string;
  findBridgeById: (bridgeId: string) => Promise<{ id: string; redSocial: string } | null>;
  createState: (data: CreateLinkedInOAuthStateData) => Promise<unknown>;
  consumeValidState: (stateHash: string) => Promise<ConsumedOAuthState | null>;
  upsertFromAuthorization: (data: UpsertFromAuthorizationData) => Promise<LinkedInConexionSafe>;
}

export interface LinkedInOAuthService {
  startOAuth: (bridgeId: string, usuarioId: string) => Promise<LinkedInOAuthStartDto>;
  completeOAuth: (callback: LinkedInOAuthCallbackQuery) => Promise<LinkedInConexionDto>;
}

function configurationUnavailable(): AppError {
  return new AppError(
    "linkedin_oauth_no_configurado",
    503,
    "La integración de LinkedIn no está configurada",
  );
}

function invalidState(): AppError {
  return new AppError(
    "linkedin_oauth_state_invalido",
    401,
    "El estado de autorización de LinkedIn es inválido o expiró",
  );
}

function tokenExchangeFailed(): AppError {
  return new AppError(
    "linkedin_oauth_intercambio_fallido",
    502,
    "No se pudo intercambiar el código de autorización con LinkedIn",
  );
}

function cancellationReported(): AppError {
  return new AppError(
    "linkedin_oauth_cancelado",
    400,
    "La autorización de LinkedIn fue cancelada",
  );
}

function requireConfig(config: LinkedInOAuthConfig | null): LinkedInOAuthConfig {
  if (!config) throw configurationUnavailable();
  return config;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function oauthEndpoint(baseUrl: string, path: "authorization" | "accessToken"): string {
  return new URL(path, `${baseUrl.replace(/\/+$/, "")}/`).toString();
}

function parseScopes(scope: string): string[] {
  let decoded = scope;
  try {
    decoded = decodeURIComponent(scope);
  } catch {
    // El schema ya acota el valor; si no está URL-encoded se conserva literal.
  }
  return [...new Set(decoded.split(/[\s,]+/).filter(Boolean))];
}

async function exchangeAuthorizationCode(
  code: string,
  config: LinkedInOAuthConfig,
  oauthBaseUrl: string,
  fetchFn: typeof globalThis.fetch,
  signal: AbortSignal,
): Promise<LinkedInTokenResponseBody> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
  });

  try {
    const response = await fetchFn(oauthEndpoint(oauthBaseUrl, "accessToken"), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal,
    });
    if (!response.ok) throw tokenExchangeFailed();

    const responseBody: unknown = await response.json();
    const parsed = linkedinTokenResponseSchema.safeParse(responseBody);
    if (!parsed.success) throw tokenExchangeFailed();
    return parsed.data;
  } catch {
    // Nunca se propagan payloads, causas de red ni mensajes del proveedor:
    // pueden contener client_secret, authorization code o tokens.
    throw tokenExchangeFailed();
  }
}

function toSafeConnectionDto(
  connection: LinkedInConexionSafe,
  tieneRefreshToken: boolean,
): LinkedInConexionDto {
  return {
    id: connection.id,
    bridgeId: connection.bridgeId,
    estado: connection.estado,
    accessTokenExpiraEn: connection.accessTokenExpiraEn.toISOString(),
    refreshTokenExpiraEn: connection.refreshTokenExpiraEn?.toISOString() ?? null,
    scopes: connection.scopes,
    tieneRefreshToken,
    fuentes: [],
  };
}

export function createLinkedInOAuthService(
  dependencies: LinkedInOAuthDependencies,
): LinkedInOAuthService {
  const oauthBaseUrl = dependencies.oauthBaseUrl ?? OFFICIAL_LINKEDIN_OAUTH_BASE_URL;
  const tokenExchangeTimeoutMs = dependencies.tokenExchangeTimeoutMs ?? TOKEN_EXCHANGE_TIMEOUT_MS;
  const createTimeoutSignal = dependencies.createTimeoutSignal
    ?? ((timeoutMs: number) => AbortSignal.timeout(timeoutMs));

  async function startOAuth(
    bridgeId: string,
    usuarioId: string,
  ): Promise<LinkedInOAuthStartDto> {
    const config = requireConfig(dependencies.config);
    const bridge = await dependencies.findBridgeById(bridgeId);
    if (!bridge) throw new AppError("bridge_no_encontrado", 404, "Bridge no encontrado");
    if (bridge.redSocial !== "LINKEDIN") {
      throw new AppError(
        "linkedin_bridge_invalido",
        422,
        "El bridge no es válido para OAuth de LinkedIn",
      );
    }

    const state = Buffer.from(dependencies.randomBytes(OAUTH_STATE_BYTES)).toString("base64url");
    const expiraEn = new Date(dependencies.now().getTime() + OAUTH_STATE_TTL_MS);
    await dependencies.createState({
      stateHash: sha256(state),
      bridgeId,
      usuarioId,
      expiraEn,
    });

    const authorizationUrl = new URL(oauthEndpoint(oauthBaseUrl, "authorization"));
    authorizationUrl.search = new URLSearchParams({
      response_type: "code",
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      state,
      scope: LINKEDIN_OAUTH_SCOPES.join(" "),
    }).toString();

    return { authorizationUrl: authorizationUrl.toString(), expiraEn: expiraEn.toISOString() };
  }

  async function completeOAuth(
    callback: LinkedInOAuthCallbackQuery,
  ): Promise<LinkedInConexionDto> {
    const config = requireConfig(dependencies.config);
    if (!callback.state) throw invalidState();

    const consumedState = await dependencies.consumeValidState(sha256(callback.state));
    if (!consumedState) throw invalidState();
    if (callback.error) throw cancellationReported();
    if (!callback.code) {
      throw new AppError(
        "linkedin_oauth_callback_invalido",
        400,
        "El callback de LinkedIn no contiene un código de autorización",
      );
    }

    // I/O externo deliberadamente fuera de cualquier transacción de base de datos.
    const tokenResponse = await exchangeAuthorizationCode(
      callback.code,
      config,
      oauthBaseUrl,
      dependencies.fetch,
      createTimeoutSignal(tokenExchangeTimeoutMs),
    );
    const issuedAt = dependencies.now();
    const accessTokenExpiraEn = new Date(issuedAt.getTime() + tokenResponse.expires_in * 1_000);
    const hasRefreshToken = tokenResponse.refresh_token !== undefined;
    const refreshTokenExpiraEn = hasRefreshToken && tokenResponse.refresh_token_expires_in !== undefined
      ? new Date(issuedAt.getTime() + tokenResponse.refresh_token_expires_in * 1_000)
      : null;

    let connection: LinkedInConexionSafe;
    try {
      const accessTokenCifrado = dependencies.encryptToken(tokenResponse.access_token);
      const refreshTokenCifrado = hasRefreshToken
        ? dependencies.encryptToken(tokenResponse.refresh_token as string)
        : null;
      connection = await dependencies.upsertFromAuthorization({
        bridgeId: consumedState.bridgeId,
        autorizadoPorUsuarioId: consumedState.usuarioId,
        accessTokenCifrado,
        refreshTokenCifrado,
        accessTokenExpiraEn,
        refreshTokenExpiraEn,
        scopes: parseScopes(tokenResponse.scope),
      });
    } catch {
      // Prisma puede incluir argumentos en errores internos; no se permite que
      // el ciphertext ni los tokens alcancen la capa HTTP o los logs superiores.
      throw new AppError(
        "linkedin_oauth_persistencia_fallida",
        500,
        "No se pudo guardar la conexión de LinkedIn",
      );
    }

    return toSafeConnectionDto(connection, hasRefreshToken);
  }

  return { startOAuth, completeOAuth };
}

function productionConfig(): LinkedInOAuthConfig | null {
  if (!env.LINKEDIN_CLIENT_ID || !env.LINKEDIN_CLIENT_SECRET || !env.LINKEDIN_REDIRECT_URI) {
    return null;
  }
  return {
    clientId: env.LINKEDIN_CLIENT_ID,
    clientSecret: env.LINKEDIN_CLIENT_SECRET,
    redirectUri: env.LINKEDIN_REDIRECT_URI,
  };
}

const productionService = createLinkedInOAuthService({
  config: productionConfig(),
  now: () => new Date(),
  randomBytes: nodeRandomBytes,
  fetch: globalThis.fetch,
  encryptToken: encrypt,
  findBridgeById: bridgeRepository.findById,
  createState: linkedinOAuthStateRepository.createState,
  consumeValidState: linkedinOAuthStateRepository.consumeValidState,
  upsertFromAuthorization: linkedinConexionRepository.upsertFromAuthorization,
});

export const startLinkedInOAuth = productionService.startOAuth;
export const completeLinkedInOAuth = productionService.completeOAuth;
