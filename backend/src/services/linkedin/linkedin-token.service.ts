import { z } from "zod";
import { env } from "../../config/env.js";
import { AppError } from "../../lib/app-error.js";
import { decrypt, encrypt } from "../../lib/cifrado-token.js";
import * as linkedinConexionRepository from "../../repositories/linkedin/linkedin-conexion.repository.js";
import type { RotateTokensData } from "../../repositories/linkedin/linkedin-conexion.repository.js";

const OFFICIAL_LINKEDIN_OAUTH_BASE_URL = "https://www.linkedin.com/oauth/v2";
const LINKEDIN_REFRESH_TIMEOUT_MS = 10_000;
const ACCESS_TOKEN_REFRESH_WINDOW_MS = 5 * 60_000;

type FetchFn = typeof globalThis.fetch;
type TokenCallback<T> = (accessToken: string) => Promise<T>;

const refreshTokenResponseSchema = z
  .object({
    access_token: z.string().trim().min(1).max(10_000),
    expires_in: z.number().int().positive(),
    refresh_token: z.string().trim().min(1).max(10_000).optional(),
    refresh_token_expires_in: z.number().int().positive().optional(),
    token_type: z.string().trim().min(1).max(64).optional(),
  })
  .passthrough();

export interface LinkedInTokenConfig {
  clientId: string;
  clientSecret: string;
}

export interface LinkedInTokenServiceDependencies {
  config: LinkedInTokenConfig | null;
  oauthBaseUrl?: string;
  now: () => Date;
  fetch: FetchFn;
  decryptToken: (cipherText: string) => string;
  encryptToken: (plainText: string) => string;
  createTimeoutSignal?: (timeoutMs: number) => AbortSignal;
  refreshTimeoutMs?: number;
  findWithEncryptedTokens: typeof linkedinConexionRepository.findWithEncryptedTokens;
  rotateTokens: typeof linkedinConexionRepository.rotateTokens;
  markTokenExpired: typeof linkedinConexionRepository.markTokenExpired;
}

export interface LinkedInTokenService {
  withLinkedInAccessToken<T>(bridgeId: string, fn: TokenCallback<T>): Promise<T>;
}

function reconnectRequired(): AppError {
  return new AppError(
    "linkedin_reconexion_requerida",
    409,
    "Debes volver a conectar LinkedIn",
  );
}

function configurationUnavailable(): AppError {
  return new AppError(
    "linkedin_oauth_no_configurado",
    503,
    "La integración de LinkedIn no está configurada",
  );
}

function oauthEndpoint(baseUrl: string): string {
  return new URL("accessToken", `${baseUrl.replace(/\/+$/, "")}/`).toString();
}

function isUsableConnection(conexion: Awaited<ReturnType<typeof linkedinConexionRepository.findWithEncryptedTokens>>): boolean {
  return Boolean(conexion && conexion.estado === "ACTIVA" && conexion.revocadoEn === null);
}

function shouldRefresh(accessTokenExpiraEn: Date, now: Date): boolean {
  return accessTokenExpiraEn.getTime() - now.getTime() <= ACCESS_TOKEN_REFRESH_WINDOW_MS;
}

async function readRefreshResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function createLinkedInTokenService(
  dependencies: LinkedInTokenServiceDependencies,
): LinkedInTokenService {
  const oauthBaseUrl = dependencies.oauthBaseUrl ?? OFFICIAL_LINKEDIN_OAUTH_BASE_URL;
  const refreshTimeoutMs = dependencies.refreshTimeoutMs ?? LINKEDIN_REFRESH_TIMEOUT_MS;
  const createTimeoutSignal = dependencies.createTimeoutSignal
    ?? ((timeoutMs: number) => AbortSignal.timeout(timeoutMs));

  async function markExpiredAndReconnect(connectionId: string): Promise<never> {
    await dependencies.markTokenExpired(connectionId);
    throw reconnectRequired();
  }

  async function refreshAccessToken(
    conexion: NonNullable<Awaited<ReturnType<typeof linkedinConexionRepository.findWithEncryptedTokens>>>,
  ): Promise<string> {
    if (!conexion.refreshTokenCifrado) return markExpiredAndReconnect(conexion.id);
    if (conexion.refreshTokenExpiraEn && conexion.refreshTokenExpiraEn <= dependencies.now()) {
      return markExpiredAndReconnect(conexion.id);
    }
    const config = dependencies.config;
    if (!config) throw configurationUnavailable();

    let refreshToken: string;
    try {
      refreshToken = dependencies.decryptToken(conexion.refreshTokenCifrado);
    } catch (error) {
      if (error instanceof AppError) throw error;
      return markExpiredAndReconnect(conexion.id);
    }

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    });

    let parsedBody: z.infer<typeof refreshTokenResponseSchema>;
    try {
      const response = await dependencies.fetch(oauthEndpoint(oauthBaseUrl), {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        signal: createTimeoutSignal(refreshTimeoutMs),
      });
      if (!response.ok) return markExpiredAndReconnect(conexion.id);

      const responseBody = await readRefreshResponse(response);
      const parsed = refreshTokenResponseSchema.safeParse(responseBody);
      if (!parsed.success) return markExpiredAndReconnect(conexion.id);
      parsedBody = parsed.data;
    } catch {
      return markExpiredAndReconnect(conexion.id);
    }

    const issuedAt = dependencies.now();
    const baseRotateData = {
      accessTokenCifrado: dependencies.encryptToken(parsedBody.access_token),
      accessTokenExpiraEn: new Date(issuedAt.getTime() + parsedBody.expires_in * 1_000),
    };
    // Union discriminado de RotateTokensData: un spread condicional parcial
    // (`...(cond ? {...} : {})`) infiere `refreshTokenCifrado?: string |
    // undefined`, que no matchea contra NINGUNA de las dos variantes exactas
    // del union (ni la que lo exige `string`, ni la que lo exige `never`).
    // El ternario completo de nivel superior sí permite que TS matchee cada
    // rama contra su variante exacta.
    const rotateData: RotateTokensData =
      parsedBody.refresh_token !== undefined
        ? {
            ...baseRotateData,
            refreshTokenCifrado: dependencies.encryptToken(parsedBody.refresh_token),
            refreshTokenExpiraEn: parsedBody.refresh_token_expires_in === undefined
              ? null
              : new Date(issuedAt.getTime() + parsedBody.refresh_token_expires_in * 1_000),
          }
        : baseRotateData;

    await dependencies.rotateTokens(conexion.id, rotateData);
    return parsedBody.access_token;
  }

  async function withLinkedInAccessToken<T>(bridgeId: string, fn: TokenCallback<T>): Promise<T> {
    const conexion = await dependencies.findWithEncryptedTokens(bridgeId);
    if (!isUsableConnection(conexion)) throw reconnectRequired();

    const usableConnection = conexion!;
    let accessToken: string;
    if (shouldRefresh(usableConnection.accessTokenExpiraEn, dependencies.now())) {
      accessToken = await refreshAccessToken(usableConnection);
    } else {
      try {
        accessToken = dependencies.decryptToken(usableConnection.accessTokenCifrado);
      } catch {
        return markExpiredAndReconnect(usableConnection.id);
      }
    }

    try {
      return await fn(accessToken);
    } catch (error) {
      if (error instanceof AppError && error.code === "linkedin_token_expirado") {
        return markExpiredAndReconnect(usableConnection.id);
      }
      throw error;
    }
  }

  return { withLinkedInAccessToken };
}

function productionConfig(): LinkedInTokenConfig | null {
  if (!env.LINKEDIN_CLIENT_ID || !env.LINKEDIN_CLIENT_SECRET) return null;
  return {
    clientId: env.LINKEDIN_CLIENT_ID,
    clientSecret: env.LINKEDIN_CLIENT_SECRET,
  };
}

const productionService = createLinkedInTokenService({
  config: productionConfig(),
  now: () => new Date(),
  fetch: globalThis.fetch,
  decryptToken: decrypt,
  encryptToken: encrypt,
  findWithEncryptedTokens: linkedinConexionRepository.findWithEncryptedTokens,
  rotateTokens: linkedinConexionRepository.rotateTokens,
  markTokenExpired: linkedinConexionRepository.markTokenExpired,
});

export const withLinkedInAccessToken = productionService.withLinkedInAccessToken;
