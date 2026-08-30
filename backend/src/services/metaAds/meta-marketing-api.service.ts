import { AppError } from "../../lib/app-error.js";
import { GRAPH_API_BASE_URL } from "../meta-webhook.service.js";

export type MetaAdsErrorKind = "token_expired" | "transient" | "permanent";

export class MetaAdsApiError extends Error {
  constructor(public readonly kind: MetaAdsErrorKind) {
    super(kind === "token_expired" ? "Meta Ads token expired" : "Meta Ads API request failed");
    this.name = "MetaAdsApiError";
  }
}

export interface MetaAdsCuentaDescubierta {
  cuentaAnunciosIdExterno: string;
  nombre: string;
  moneda: string | null;
  zonaHoraria: string | null;
}

export interface MetaAdsCampaniaRemota {
  idExterno: string;
  nombre: string;
  estado: string | null;
}

export interface MetaAdsInsightDiario {
  campaniaIdExterno: string;
  fecha: string;
  redSocial: "FACEBOOK" | "INSTAGRAM";
  gasto: string;
  impresiones: number;
  clics: number;
  alcance: number;
}

interface GraphPaging {
  next?: string;
}

interface GraphList<T> {
  data?: T[];
  paging?: GraphPaging;
}

interface GraphErrorBody {
  error?: { code?: number; message?: string };
}

interface MetaMarketingApiDependencies {
  fetch: typeof globalThis.fetch;
  createTimeoutSignal: (ms: number) => AbortSignal;
  sleep: (ms: number) => Promise<void>;
  baseUrl: string;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_INTENTOS_TRANSITORIOS = 3;
const BACKOFF_MS: readonly number[] = [500, 1_500];

function defaultCreateTimeoutSignal(ms: number): AbortSignal {
  return AbortSignal.timeout(ms);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function classify(status: number, body: unknown): MetaAdsErrorKind {
  const graph = body as GraphErrorBody | null;
  if (status === 401 || graph?.error?.code === 190) return "token_expired";
  if (status === 429 || status >= 500) return "transient";
  return "permanent";
}

function sanitizeUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  url.searchParams.delete("access_token");
  return url.toString();
}

function appendAccessToken(url: URL, accessToken: string): string {
  url.searchParams.set("access_token", accessToken);
  return url.toString();
}

function parseRetryAfter(headerValue: string | null): number | null {
  if (!headerValue) return null;
  const seconds = Number(headerValue);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const timestamp = Date.parse(headerValue);
  if (!Number.isNaN(timestamp)) return Math.max(0, timestamp - Date.now());
  return null;
}

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

export class MetaMarketingApiClient {
  constructor(
    private readonly accessToken: string,
    private readonly dependencies: MetaMarketingApiDependencies = {
      fetch: globalThis.fetch,
      createTimeoutSignal: defaultCreateTimeoutSignal,
      sleep,
      baseUrl: GRAPH_API_BASE_URL,
    },
  ) {}

  private async getJson<T>(url: URL): Promise<T> {
    let ultimoError: MetaAdsErrorKind = "permanent";
    const urlWithToken = appendAccessToken(url, this.accessToken);

    for (let intento = 1; intento <= MAX_INTENTOS_TRANSITORIOS; intento++) {
      try {
        const response = await this.dependencies.fetch(urlWithToken, {
          signal: this.dependencies.createTimeoutSignal(DEFAULT_TIMEOUT_MS),
        });
        const body = await readJson(response);
        if (response.ok) return body as T;

        ultimoError = classify(response.status, body);
        if (ultimoError !== "transient") throw new MetaAdsApiError(ultimoError);

        const quedanReintentos = intento < MAX_INTENTOS_TRANSITORIOS;
        if (quedanReintentos) {
          await this.dependencies.sleep(parseRetryAfter(response.headers.get("retry-after")) ?? (BACKOFF_MS[intento - 1] as number));
        }
      } catch (error) {
        if (error instanceof MetaAdsApiError) throw error;
        ultimoError = "transient";
        const quedanReintentos = intento < MAX_INTENTOS_TRANSITORIOS;
        if (quedanReintentos) await this.dependencies.sleep(BACKOFF_MS[intento - 1] as number);
      }
    }

    throw new MetaAdsApiError(ultimoError);
  }

  private async getPaginated<T>(initialUrl: URL): Promise<T[]> {
    const items: T[] = [];
    let nextUrl: string | null = initialUrl.toString();

    while (nextUrl) {
      const pageUrl = new URL(nextUrl);
      const page = await this.getJson<GraphList<T>>(pageUrl);
      if (!Array.isArray(page.data)) {
        throw new AppError("meta_ads_respuesta_invalida", 502, "Meta devolvió una respuesta inválida");
      }
      items.push(...page.data);
      nextUrl = page.paging?.next ? sanitizeUrl(page.paging.next) : null;
    }

    return items;
  }

  async discoverAdAccounts(): Promise<MetaAdsCuentaDescubierta[]> {
    const url = new URL(`${this.dependencies.baseUrl}/me/adaccounts`);
    url.searchParams.set("fields", "account_id,id,name,currency,timezone_name");
    url.searchParams.set("limit", "100");

    const rows = await this.getPaginated<{
      account_id?: string;
      id?: string;
      name?: string;
      currency?: string;
      timezone_name?: string;
    }>(url);

    return rows
      .map((row) => {
        const actId = row.id?.startsWith("act_") ? row.id : row.account_id ? `act_${row.account_id}` : null;
        if (!actId || !row.name) return null;
        return {
          cuentaAnunciosIdExterno: actId,
          nombre: row.name,
          moneda: row.currency ?? null,
          zonaHoraria: row.timezone_name ?? null,
        };
      })
      .filter((row): row is MetaAdsCuentaDescubierta => row !== null);
  }

  async listCampaigns(cuentaAnunciosIdExterno: string): Promise<MetaAdsCampaniaRemota[]> {
    const url = new URL(`${this.dependencies.baseUrl}/${encodeURIComponent(cuentaAnunciosIdExterno)}/campaigns`);
    url.searchParams.set("fields", "id,name,status,effective_status");
    url.searchParams.set("limit", "100");
    const rows = await this.getPaginated<{ id?: string; name?: string; status?: string; effective_status?: string }>(url);
    return rows
      .filter((row): row is { id: string; name: string; status?: string; effective_status?: string } => Boolean(row.id && row.name))
      .map((row) => ({ idExterno: row.id, nombre: row.name, estado: row.effective_status ?? row.status ?? null }));
  }

  async listDailyInsights(
    cuentaAnunciosIdExterno: string,
    desde: Date,
    hasta: Date,
  ): Promise<MetaAdsInsightDiario[]> {
    const url = new URL(`${this.dependencies.baseUrl}/${encodeURIComponent(cuentaAnunciosIdExterno)}/insights`);
    url.searchParams.set("fields", "campaign_id,date_start,spend,impressions,clicks,reach,publisher_platform");
    url.searchParams.set("level", "campaign");
    url.searchParams.set("time_increment", "1");
    url.searchParams.set("breakdowns", "publisher_platform");
    url.searchParams.set("time_range", JSON.stringify({
      since: desde.toISOString().slice(0, 10),
      until: hasta.toISOString().slice(0, 10),
    }));
    url.searchParams.set("limit", "100");

    const rows = await this.getPaginated<{
      campaign_id?: string;
      date_start?: string;
      spend?: string;
      impressions?: string;
      clicks?: string;
      reach?: string;
      publisher_platform?: string;
    }>(url);

    return rows.flatMap((row) => {
      const platform = row.publisher_platform?.toLowerCase();
      const redSocial = platform === "facebook" ? "FACEBOOK" : platform === "instagram" ? "INSTAGRAM" : null;
      if (!row.campaign_id || !row.date_start || !redSocial) return [];
      return [{
        campaniaIdExterno: row.campaign_id,
        fecha: row.date_start,
        redSocial,
        gasto: normalizeMoney(row.spend),
        impresiones: normalizeInteger(row.impressions),
        clics: normalizeInteger(row.clicks),
        alcance: normalizeInteger(row.reach),
      }];
    });
  }
}

function normalizeInteger(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "0", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function normalizeMoney(value: string | undefined): string {
  const parsed = Number(value ?? "0");
  return Number.isFinite(parsed) && parsed >= 0 ? parsed.toFixed(2) : "0.00";
}

export function createMetaMarketingApiClient(accessToken: string): MetaMarketingApiClient {
  return new MetaMarketingApiClient(accessToken);
}
