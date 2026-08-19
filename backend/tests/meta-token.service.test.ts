import { afterEach, describe, expect, it, vi } from "vitest";
import { verificarTokenPagina } from "../src/services/meta-token.service.js";

/**
 * `GET /debug_token` (docs/05-bridges.md §3, §7) — mismo estilo de mocking
 * de `fetch` que `meta-webhook.worker.test.ts`.
 */
function mockFetchJson(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("meta-token.service — verificarTokenPagina (docs/05-bridges.md §3, §7)", () => {
  it("token válido con expires_at: devuelve valido=true y expiraEn convertido de segundos unix", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockFetchJson(200, { data: { is_valid: true, expires_at: 1_800_000_000 } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await verificarTokenPagina("token-de-prueba");

    expect(resultado).toEqual({ valido: true, expiraEn: new Date(1_800_000_000 * 1000) });
  });

  it("token válido sin expires_at (Page Token de larga duración): expiraEn es null", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockFetchJson(200, { data: { is_valid: true } }));
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await verificarTokenPagina("token-larga-duracion");

    expect(resultado).toEqual({ valido: true, expiraEn: null });
  });

  it("token válido con expires_at=0: expiraEn es null (0 significa 'no expira', no epoch)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockFetchJson(200, { data: { is_valid: true, expires_at: 0 } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await verificarTokenPagina("token-expires-at-cero");

    expect(resultado).toEqual({ valido: true, expiraEn: null });
  });

  it("token inválido/revocado (is_valid=false): devuelve valido=false con mensaje accionable", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockFetchJson(200, { data: { is_valid: false, error: { message: "Token expirado" } } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await verificarTokenPagina("token-revocado");

    expect(resultado.valido).toBe(false);
    expect((resultado as { mensaje: string }).mensaje).toContain("Token expirado");
  });

  it("fallo de red: devuelve valido=false sin lanzar", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await verificarTokenPagina("token-cualquiera");

    expect(resultado.valido).toBe(false);
    expect((resultado as { mensaje: string }).mensaje).toContain("ECONNREFUSED");
  });

  it("HTTP no-2xx: devuelve valido=false con el mensaje de error de Graph API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockFetchJson(400, { error: { message: "Invalid OAuth access token" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await verificarTokenPagina("token-app-mal-configurada");

    expect(resultado.valido).toBe(false);
    expect((resultado as { mensaje: string }).mensaje).toContain("Invalid OAuth access token");
  });

  it("respuesta con forma inesperada: devuelve valido=false en vez de lanzar", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockFetchJson(200, { unexpected: "shape" }));
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await verificarTokenPagina("token-cualquiera");

    expect(resultado.valido).toBe(false);
    expect((resultado as { mensaje: string }).mensaje).toContain("forma inesperada");
  });
});
