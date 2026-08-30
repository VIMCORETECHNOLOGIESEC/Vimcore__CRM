import { describe, expect, it, vi } from "vitest";
import { AppError } from "../src/lib/app-error.js";
import {
  createLinkedInApiClient,
  LinkedInApiAppError,
} from "../src/services/linkedin/linkedin-api.service.js";

const ACCESS_TOKEN = "access-token-ultrasecreto";
const API_VERSION = "202508";

function headers(values: Record<string, string> = {}): Headers {
  return new Headers(values);
}

function jsonResponse(status: number, body: unknown, responseHeaders = headers()): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: responseHeaders,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function createHarness(options: { apiBaseUrl?: string } = {}) {
  const signal = new AbortController().signal;
  const dependencies = {
    accessToken: ACCESS_TOKEN,
    apiVersion: API_VERSION,
    ...(options.apiBaseUrl ? { apiBaseUrl: options.apiBaseUrl } : {}),
    fetch: vi.fn().mockResolvedValue(jsonResponse(200, { data: [] })),
    createTimeoutSignal: vi.fn(() => signal),
  };
  return { dependencies, client: createLinkedInApiClient(dependencies), signal };
}

describe("services/linkedin API client", () => {
  it("usa la base oficial, headers REST obligatorios y timeout inyectado", async () => {
    const { dependencies, client, signal } = createHarness();

    const result = await client.getJson("/organizationAcls?q=roleAssignee&count=1");

    expect(result).toEqual({ data: [] });
    expect(dependencies.createTimeoutSignal).toHaveBeenCalledWith(10_000);
    expect(dependencies.fetch).toHaveBeenCalledWith(
      "https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&count=1",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          "Linkedin-Version": API_VERSION,
          "X-Restli-Protocol-Version": "2.0.0",
        },
        signal,
      },
    );
    expect(JSON.stringify(result)).not.toContain(ACCESS_TOKEN);
  });

  it("respeta el override de base y URLs absolutas sin reescribirlas", async () => {
    const { dependencies, client } = createHarness({ apiBaseUrl: "http://linkedin-rest.test/rest" });

    await client.getJson("/adForms/123");
    await client.getJson("http://linkedin-rest.test/rest/me");

    expect(dependencies.fetch.mock.calls[0]?.[0]).toBe("http://linkedin-rest.test/rest/adForms/123");
    expect(dependencies.fetch.mock.calls[1]?.[0]).toBe("http://linkedin-rest.test/rest/me");
  });

  it.each([
    [401, "linkedin_token_expirado", 409],
    [403, "linkedin_scope_insuficiente", 422],
  ])("mapea HTTP %s a %s", async (status, code, statusHttp) => {
    const { dependencies, client } = createHarness();
    dependencies.fetch.mockResolvedValueOnce(jsonResponse(status, { message: "detalle externo" }));

    await expect(client.getJson("/organizationAcls")).rejects.toMatchObject({ code, statusHttp });
  });

  it("mapea 429 a rate limit y conserva Retry-After como metadata sanitizada", async () => {
    const { dependencies, client } = createHarness();
    dependencies.fetch.mockResolvedValueOnce(
      jsonResponse(429, { retry_after: 9, token: ACCESS_TOKEN }, headers({ "Retry-After": "7" })),
    );

    let captured: unknown;
    try {
      await client.getJson("/organizationAcls");
    } catch (error) {
      captured = error;
    }

    expect(captured).toBeInstanceOf(AppError);
    expect(captured).toBeInstanceOf(LinkedInApiAppError);
    expect(captured).toMatchObject({
      code: "linkedin_rate_limit",
      statusHttp: 503,
      retryAfterSeconds: 7,
    });
    expect(JSON.stringify(captured)).not.toContain(ACCESS_TOKEN);
  });

  it("mapea red, 5xx y JSON inválido a error sanitizado", async () => {
    const red = createHarness();
    red.dependencies.fetch.mockRejectedValueOnce(new Error(`network ${ACCESS_TOKEN}`));
    await expect(red.client.getJson("/organizationAcls")).rejects.toMatchObject({
      code: "linkedin_api_error",
      statusHttp: 502,
    });

    const server = createHarness();
    server.dependencies.fetch.mockResolvedValueOnce(jsonResponse(500, { token: ACCESS_TOKEN }));
    await expect(server.client.getJson("/organizationAcls")).rejects.toMatchObject({
      code: "linkedin_api_error",
      statusHttp: 502,
    });

    const malformed = createHarness();
    malformed.dependencies.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: headers(),
      json: vi.fn().mockRejectedValue(new Error("malformed")),
    } as unknown as Response);
    await expect(malformed.client.getJson("/organizationAcls")).rejects.toMatchObject({
      code: "linkedin_api_error",
      statusHttp: 502,
    });
  });

  it("postJson envía Content-Type JSON, el body serializado y expone el id via x-restli-id", async () => {
    const { dependencies, client, signal } = createHarness();
    dependencies.fetch.mockResolvedValueOnce(
      jsonResponse(201, null, headers({ "x-restli-id": "107708" })),
    );

    const result = await client.postJson("/leadNotifications", {
      webhook: "https://crm.example.com/webhook",
      owner: { sponsoredAccount: "urn:li:sponsoredAccount:1" },
      leadType: "SPONSORED",
    });

    expect(result).toEqual({ restliId: "107708", body: null });
    expect(dependencies.fetch).toHaveBeenCalledWith(
      "https://api.linkedin.com/rest/leadNotifications",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          "Linkedin-Version": API_VERSION,
          "X-Restli-Protocol-Version": "2.0.0",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          webhook: "https://crm.example.com/webhook",
          owner: { sponsoredAccount: "urn:li:sponsoredAccount:1" },
          leadType: "SPONSORED",
        }),
        signal,
      },
    );
  });

  it("postJson mapea errores HTTP igual que getJson y nunca filtra el token", async () => {
    const { dependencies, client } = createHarness();
    dependencies.fetch.mockResolvedValueOnce(jsonResponse(403, { token: ACCESS_TOKEN }));

    const error = await client.postJson("/leadNotifications", {}).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: "linkedin_scope_insuficiente", statusHttp: 422 });
    expect(JSON.stringify(error)).not.toContain(ACCESS_TOKEN);
  });

  it("deleteJson envía DELETE con los headers oficiales", async () => {
    const { dependencies, client, signal } = createHarness();
    dependencies.fetch.mockResolvedValueOnce(jsonResponse(204, null));

    await client.deleteJson("/leadNotifications/107708");

    expect(dependencies.fetch).toHaveBeenCalledWith(
      "https://api.linkedin.com/rest/leadNotifications/107708",
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          "Linkedin-Version": API_VERSION,
          "X-Restli-Protocol-Version": "2.0.0",
          "Content-Type": "application/json",
        },
        signal,
      },
    );
  });

  it("deleteJson trata un 404 como éxito idempotente", async () => {
    const { client, dependencies } = createHarness();
    dependencies.fetch.mockResolvedValueOnce(jsonResponse(404, { message: "not found" }));

    await expect(client.deleteJson("/leadNotifications/107708")).resolves.toBeUndefined();
  });

  it("deleteJson propaga otros errores HTTP sanitizados", async () => {
    const { client, dependencies } = createHarness();
    dependencies.fetch.mockResolvedValueOnce(jsonResponse(401, { token: ACCESS_TOKEN }));

    const error = await client.deleteJson("/leadNotifications/107708").catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: "linkedin_token_expirado", statusHttp: 409 });
    expect(JSON.stringify(error)).not.toContain(ACCESS_TOKEN);
  });
});
