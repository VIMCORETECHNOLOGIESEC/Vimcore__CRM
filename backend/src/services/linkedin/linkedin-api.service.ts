import { env } from "../../config/env.js";
import { AppError } from "../../lib/app-error.js";

const OFFICIAL_LINKEDIN_API_BASE_URL = "https://api.linkedin.com/rest";
const LINKEDIN_RESTLI_PROTOCOL_VERSION = "2.0.0";
const LINKEDIN_API_TIMEOUT_MS = 10_000;

type FetchFn = typeof globalThis.fetch;

interface HeadersLike {
  get(name: string): string | null;
}

export class LinkedInApiAppError extends AppError {
  public readonly retryAfterSeconds?: number;

  constructor(code: string, statusHttp: number, message: string, retryAfterSeconds?: number) {
    super(code, statusHttp, message);
    this.name = "LinkedInApiAppError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface LinkedInApiClientDependencies {
  accessToken: string;
  apiVersion: string;
  apiBaseUrl?: string;
  fetch: FetchFn;
  createTimeoutSignal?: (timeoutMs: number) => AbortSignal;
  timeoutMs?: number;
}

export interface LinkedInApiCreateResult {
  restliId: string | null;
  body: unknown;
}

export interface LinkedInApiClient {
  getJson(pathOrUrl: string): Promise<unknown>;
  /** POST con body JSON. `restliId` viene del header `x-restli-id` (convención REST.li de esta API). */
  postJson(pathOrUrl: string, body: unknown): Promise<LinkedInApiCreateResult>;
  /** DELETE idempotente: un 404 se trata como éxito (ya no existe en LinkedIn). */
  deleteJson(pathOrUrl: string): Promise<void>;
}

function linkedinTokenExpirado(): AppError {
  return new AppError(
    "linkedin_token_expirado",
    409,
    "La conexión de LinkedIn expiró. Vuelve a conectarla.",
  );
}

function linkedinScopeInsuficiente(): AppError {
  return new AppError(
    "linkedin_scope_insuficiente",
    422,
    "La conexión de LinkedIn no tiene permisos suficientes",
  );
}

function linkedinRateLimit(retryAfterSeconds?: number): LinkedInApiAppError {
  return new LinkedInApiAppError(
    "linkedin_rate_limit",
    503,
    "LinkedIn limitó temporalmente las solicitudes. Vuelve a intentarlo más tarde.",
    retryAfterSeconds,
  );
}

function linkedinApiError(): AppError {
  return new AppError(
    "linkedin_api_error",
    502,
    "No se pudo consultar la API de LinkedIn",
  );
}

function resolveLinkedInUrl(pathOrUrl: string, baseUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return new URL(pathOrUrl.replace(/^\/+/, ""), `${baseUrl.replace(/\/+$/, "")}/`).toString();
}

function retryAfterFromHeader(headers: HeadersLike): number | undefined {
  const value = headers.get("retry-after");
  if (!value) return undefined;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;

  const retryDateMs = Date.parse(value);
  if (Number.isNaN(retryDateMs)) return undefined;
  return Math.max(0, Math.ceil((retryDateMs - Date.now()) / 1_000));
}

function retryAfterFromBody(body: unknown): number | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const record = body as Record<string, unknown>;
  const rawValue = record.retryAfter ?? record.retry_after ?? record.retryAfterSeconds;
  if (typeof rawValue !== "number" || !Number.isFinite(rawValue) || rawValue < 0) {
    return undefined;
  }
  return rawValue;
}

async function responseBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function mapLinkedInHttpError(status: number, body: unknown, headers: HeadersLike): AppError {
  if (status === 401) return linkedinTokenExpirado();
  if (status === 403) return linkedinScopeInsuficiente();
  if (status === 429) {
    return linkedinRateLimit(retryAfterFromHeader(headers) ?? retryAfterFromBody(body));
  }
  return linkedinApiError();
}

export function createLinkedInApiClient(
  dependencies: LinkedInApiClientDependencies,
): LinkedInApiClient {
  const apiBaseUrl = dependencies.apiBaseUrl ?? OFFICIAL_LINKEDIN_API_BASE_URL;
  const timeoutMs = dependencies.timeoutMs ?? LINKEDIN_API_TIMEOUT_MS;
  const createTimeoutSignal = dependencies.createTimeoutSignal
    ?? ((timeout: number) => AbortSignal.timeout(timeout));

  async function getJson(pathOrUrl: string): Promise<unknown> {
    let response: Response;
    try {
      response = await dependencies.fetch(resolveLinkedInUrl(pathOrUrl, apiBaseUrl), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${dependencies.accessToken}`,
          "Linkedin-Version": dependencies.apiVersion,
          "X-Restli-Protocol-Version": LINKEDIN_RESTLI_PROTOCOL_VERSION,
        },
        signal: createTimeoutSignal(timeoutMs),
      });
    } catch {
      throw linkedinApiError();
    }

    const body = await responseBody(response);
    if (!response.ok) throw mapLinkedInHttpError(response.status, body, response.headers);
    if (body === null) throw linkedinApiError();
    return body;
  }

  async function postJson(pathOrUrl: string, requestBody: unknown): Promise<LinkedInApiCreateResult> {
    let response: Response;
    try {
      response = await dependencies.fetch(resolveLinkedInUrl(pathOrUrl, apiBaseUrl), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${dependencies.accessToken}`,
          "Linkedin-Version": dependencies.apiVersion,
          "X-Restli-Protocol-Version": LINKEDIN_RESTLI_PROTOCOL_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: createTimeoutSignal(timeoutMs),
      });
    } catch {
      throw linkedinApiError();
    }

    const body = await responseBody(response);
    if (!response.ok) throw mapLinkedInHttpError(response.status, body, response.headers);
    return { restliId: response.headers.get("x-restli-id"), body };
  }

  async function deleteJson(pathOrUrl: string): Promise<void> {
    let response: Response;
    try {
      response = await dependencies.fetch(resolveLinkedInUrl(pathOrUrl, apiBaseUrl), {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${dependencies.accessToken}`,
          "Linkedin-Version": dependencies.apiVersion,
          "X-Restli-Protocol-Version": LINKEDIN_RESTLI_PROTOCOL_VERSION,
          "Content-Type": "application/json",
        },
        signal: createTimeoutSignal(timeoutMs),
      });
    } catch {
      throw linkedinApiError();
    }

    if (response.status === 404) return;
    if (!response.ok) {
      const body = await responseBody(response);
      throw mapLinkedInHttpError(response.status, body, response.headers);
    }
  }

  return { getJson, postJson, deleteJson };
}

export function createProductionLinkedInApiClient(accessToken: string): LinkedInApiClient {
  if (!env.LINKEDIN_API_VERSION) {
    throw new AppError(
      "linkedin_api_no_configurada",
      503,
      "La integración de LinkedIn no está configurada",
    );
  }

  return createLinkedInApiClient({
    accessToken,
    apiVersion: env.LINKEDIN_API_VERSION,
    apiBaseUrl: env.LINKEDIN_API_BASE_URL,
    fetch: globalThis.fetch,
  });
}
