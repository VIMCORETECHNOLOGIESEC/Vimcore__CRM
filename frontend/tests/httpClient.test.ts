import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  getAccessToken,
  getErrorMessage,
  getRefreshToken,
  httpClient,
  setOnSessionExpired,
  setTokens,
} from "@/api/httpClient";

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

beforeEach(() => {
  setTokens(null);
  setOnSessionExpired(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("httpClient — inyección de JWT", () => {
  it("no envía Authorization cuando no hay sesión activa", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await httpClient.get("/publico");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it("adjunta 'Authorization: Bearer <accessToken>' cuando hay sesión activa", async () => {
    setTokens({ accessToken: "token-abc", refreshToken: "refresh-abc" });
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await httpClient.get("/protegido");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer token-abc");
  });

  it("con skipAuth nunca adjunta Authorization, aunque haya sesión activa", async () => {
    setTokens({ accessToken: "token-abc", refreshToken: "refresh-abc" });
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await httpClient.post("/auth/login", { correo: "a@a.com" }, { skipAuth: true });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });
});

describe("httpClient — reintento automático ante 401", () => {
  it("refresca el token y reintenta la petición original una sola vez", async () => {
    setTokens({ accessToken: "token-viejo", refreshToken: "refresh-1" });

    let callsToRuta = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/auth/refresh")) {
        return jsonResponse(200, { accessToken: "token-nuevo", refreshToken: "refresh-2" });
      }
      callsToRuta += 1;
      if (callsToRuta === 1) {
        return jsonResponse(401, { code: "no_autorizado", message: "No autorizado" });
      }
      return jsonResponse(200, { ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await httpClient.get("/protegido");

    expect(resultado).toEqual({ ok: true });
    expect(callsToRuta).toBe(2); // intento original + reintento
    expect(fetchMock).toHaveBeenCalledTimes(3); // original + refresh + reintento

    const [, initReintento] = fetchMock.mock.calls[2] as [string, RequestInit];
    const headers = initReintento.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer token-nuevo");

    // El par de tokens quedó actualizado en el store del módulo.
    expect(getAccessToken()).toBe("token-nuevo");
    expect(getRefreshToken()).toBe("refresh-2");
  });

  it("no reintenta un 401 recibido durante el reintento (evita loop infinito)", async () => {
    setTokens({ accessToken: "token-viejo", refreshToken: "refresh-1" });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/auth/refresh")) {
        return jsonResponse(200, { accessToken: "token-nuevo", refreshToken: "refresh-2" });
      }
      // Toda petición a la ruta protegida devuelve 401, incluso el reintento.
      return jsonResponse(401, { code: "no_autorizado", message: "No autorizado" });
    });
    vi.stubGlobal("fetch", fetchMock);

    // El reintento (isRetry: true) ya no dispara un segundo refresco: se
    // propaga tal cual el error que trajo la respuesta 401 del reintento.
    await expect(httpClient.get("/protegido")).rejects.toMatchObject({
      code: "no_autorizado",
      status: 401,
    });

    // original + refresh + un único reintento -- nunca un segundo refresco.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("sin refresh token guardado, un 401 no intenta refrescar y falla directo", async () => {
    // Sin setTokens: no hay sesión.
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(401, { code: "no_autorizado", message: "No autorizado" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(httpClient.get("/protegido")).rejects.toMatchObject({
      code: "sesion_expirada",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("httpClient — deduplicación de refrescos concurrentes", () => {
  it("dos peticiones que reciben 401 al mismo tiempo disparan un único POST /auth/refresh", async () => {
    setTokens({ accessToken: "token-viejo", refreshToken: "refresh-1" });

    let refreshCalls = 0;
    let callsToA = 0;
    let callsToB = 0;

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/auth/refresh")) {
        refreshCalls += 1;
        // Latencia simulada: ambas peticiones originales deben recibir su
        // 401 y llegar a `refreshAccessToken()` ANTES de que este refresco
        // se resuelva, para ejercitar la deduplicación real.
        await delay(5);
        return jsonResponse(200, { accessToken: "token-nuevo", refreshToken: "refresh-2" });
      }

      if (url.endsWith("/a")) {
        callsToA += 1;
        return callsToA === 1
          ? jsonResponse(401, { code: "no_autorizado", message: "No autorizado" })
          : jsonResponse(200, { ruta: "a" });
      }

      if (url.endsWith("/b")) {
        callsToB += 1;
        return callsToB === 1
          ? jsonResponse(401, { code: "no_autorizado", message: "No autorizado" })
          : jsonResponse(200, { ruta: "b" });
      }

      throw new Error(`URL inesperada en el mock de fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const [resultadoA, resultadoB] = await Promise.all([
      httpClient.get("/a"),
      httpClient.get("/b"),
    ]);

    expect(resultadoA).toEqual({ ruta: "a" });
    expect(resultadoB).toEqual({ ruta: "b" });
    // La garantía central: un solo refresco compartido, no uno por petición
    // en vuelo -- el backend rota y revoca toda la familia de refresh
    // tokens si detecta reutilización (D-D en auth.service.ts), así que un
    // segundo refresco en paralelo con el mismo refresh token cerraría la
    // sesión igual que un token robado.
    expect(refreshCalls).toBe(1);
    expect(getAccessToken()).toBe("token-nuevo");
  });
});

describe("httpClient — sesión expirada cuando el refresco también falla", () => {
  it("limpia el store de tokens y notifica a onSessionExpired", async () => {
    setTokens({ accessToken: "token-viejo", refreshToken: "refresh-invalido" });
    const onSessionExpired = vi.fn();
    setOnSessionExpired(onSessionExpired);

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/auth/refresh")) {
        return jsonResponse(401, { code: "token_invalido", message: "Token de refresco inválido" });
      }
      return jsonResponse(401, { code: "no_autorizado", message: "No autorizado" });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(httpClient.get("/protegido")).rejects.toMatchObject({
      code: "sesion_expirada",
      status: 401,
      message: "Tu sesión expiró. Iniciá sesión nuevamente.",
    });

    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });
});

describe("httpClient — mapeo de errores", () => {
  it("propaga code y message tal cual los manda el backend en un error de dominio", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(400, {
          code: "validacion_invalida",
          message: "El cuerpo de la petición es inválido",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(httpClient.post("/algo", {})).rejects.toMatchObject({
      code: "validacion_invalida",
      status: 400,
      message: "El cuerpo de la petición es inválido",
    });
  });

  it("usa un mensaje genérico cuando la respuesta de error no trae JSON parseable", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("cuerpo no es JSON");
      },
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(httpClient.get("/algo")).rejects.toMatchObject({
      code: "error_desconocido",
      status: 500,
      message: "Ocurrió un error inesperado. Intentá nuevamente en unos segundos.",
    });
  });

  it("mapea un fallo de red (fetch rechazado) a un ApiError de conexión", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(httpClient.get("/algo")).rejects.toMatchObject({
      code: "error_red",
      status: 0,
      message: "No se pudo conectar con el servidor. Verificá tu conexión e intentá nuevamente.",
    });
  });

  it("devuelve undefined para una respuesta 204 sin cuerpo", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => {
        throw new Error("204 no trae cuerpo");
      },
    });
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await httpClient.delete("/algo");
    expect(resultado).toBeUndefined();
  });
});

describe("getErrorMessage", () => {
  it("devuelve el message de un ApiError sin modificarlo", () => {
    const error = new ApiError("codigo_x", 409, "Mensaje específico y accionable");
    expect(getErrorMessage(error)).toBe("Mensaje específico y accionable");
  });

  it("devuelve un mensaje genérico en español para cualquier otro tipo de error", () => {
    expect(getErrorMessage(new Error("boom"))).toBe(
      "Ocurrió un error inesperado. Intentá nuevamente en unos segundos.",
    );
    expect(getErrorMessage("un string cualquiera")).toBe(
      "Ocurrió un error inesperado. Intentá nuevamente en unos segundos.",
    );
    expect(getErrorMessage(undefined)).toBe(
      "Ocurrió un error inesperado. Intentá nuevamente en unos segundos.",
    );
  });
});
