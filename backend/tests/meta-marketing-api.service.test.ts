import { describe, expect, it, vi } from "vitest";
import { MetaAdsApiError, MetaMarketingApiClient } from "../src/services/metaAds/meta-marketing-api.service.js";

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function harness(responses: Response[]) {
  const fetch = vi.fn().mockImplementation(async () => {
    const response = responses.shift();
    if (!response) throw new Error("sin respuesta mockeada");
    return response;
  });
  const sleep = vi.fn().mockResolvedValue(undefined);
  const createTimeoutSignal = vi.fn(() => new AbortController().signal);
  const client = new MetaMarketingApiClient("token-secreto", {
    fetch,
    sleep,
    createTimeoutSignal,
    baseUrl: "http://meta.test",
  });
  return { client, fetch, sleep, createTimeoutSignal };
}

describe("services/metaAds/meta-marketing-api", () => {
  it("pagina descubrimiento de cuentas y normaliza act_<id> sin exponer el token en asserts públicos", async () => {
    const { client, fetch } = harness([
      jsonResponse(200, {
        data: [{ account_id: "123", name: "Cuenta A", currency: "USD", timezone_name: "America/Argentina/Buenos_Aires" }],
        paging: { next: "http://meta.test/me/adaccounts?after=abc&access_token=token-secreto" },
      }),
      jsonResponse(200, { data: [{ id: "act_456", name: "Cuenta B" }] }),
    ]);

    await expect(client.discoverAdAccounts()).resolves.toEqual([
      { cuentaAnunciosIdExterno: "act_123", nombre: "Cuenta A", moneda: "USD", zonaHoraria: "America/Argentina/Buenos_Aires" },
      { cuentaAnunciosIdExterno: "act_456", nombre: "Cuenta B", moneda: null, zonaHoraria: null },
    ]);
    expect(fetch).toHaveBeenCalledTimes(2);
    const secondUrl = new URL(fetch.mock.calls[1]![0] as string);
    expect(secondUrl.searchParams.get("after")).toBe("abc");
    expect(secondUrl.searchParams.get("access_token")).toBe("token-secreto");
  });

  it("reintenta 429 con Retry-After y no clasifica el token como expirado", async () => {
    const { client, sleep } = harness([
      jsonResponse(429, { error: { code: 4, message: "rate limit" } }, { "retry-after": "2" }),
      jsonResponse(200, { data: [] }),
    ]);

    await expect(client.listCampaigns("act_123")).resolves.toEqual([]);
    expect(sleep).toHaveBeenCalledWith(2_000);
  });

  it.each([
    [401, { error: { code: 190, message: "invalid token" } }],
    [400, { error: { code: 190, message: "invalid token" } }],
  ])("clasifica HTTP %s / code 190 como token expirado", async (status, body) => {
    const { client } = harness([jsonResponse(status, body)]);

    const error = await client.listCampaigns("act_123").catch((cause) => cause);

    expect(error).toBeInstanceOf(MetaAdsApiError);
    expect((error as MetaAdsApiError).kind).toBe("token_expired");
  });

  it("divide Insights por publisher_platform y descarta plataformas no soportadas", async () => {
    const { client, createTimeoutSignal } = harness([
      jsonResponse(200, {
        data: [
          { campaign_id: "c1", date_start: "2026-08-29", spend: "12.345", impressions: "100", clicks: "5", reach: "80", publisher_platform: "facebook" },
          { campaign_id: "c1", date_start: "2026-08-29", spend: "3", impressions: "50", clicks: "2", reach: "40", publisher_platform: "instagram" },
          { campaign_id: "c1", date_start: "2026-08-29", publisher_platform: "audience_network" },
        ],
      }),
    ]);

    await expect(client.listDailyInsights("act_123", new Date("2026-08-01T00:00:00Z"), new Date("2026-08-29T00:00:00Z"))).resolves.toEqual([
      { campaniaIdExterno: "c1", fecha: "2026-08-29", redSocial: "FACEBOOK", gasto: "12.35", impresiones: 100, clics: 5, alcance: 80 },
      { campaniaIdExterno: "c1", fecha: "2026-08-29", redSocial: "INSTAGRAM", gasto: "3.00", impresiones: 50, clics: 2, alcance: 40 },
    ]);
    expect(createTimeoutSignal).toHaveBeenCalledWith(15_000);
  });
});
