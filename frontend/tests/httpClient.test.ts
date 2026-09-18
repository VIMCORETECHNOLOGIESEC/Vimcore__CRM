import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  authenticatedFetch,
  getAuthLoginUrl,
  getErrorMessage,
  getGatewayBaseUrl,
  httpClient,
  redirectToAuth,
  resetAuthRedirectGuard,
  setOnSessionExpired,
} from "@/api/httpClient";

const GATEWAY_CRM = "http://localhost:3001/crm";

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

let assignMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetAuthRedirectGuard();
  setOnSessionExpired(null);
  assignMock = vi.fn();
  vi.stubGlobal("location", { assign: assignMock, href: "http://localhost:5173/" });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("httpClient — gateway y cookie de sesión", () => {
  it("llama a <gateway>/crm/<ruta> con credentials 'include' y sin Authorization", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await httpClient.get("/leads");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${GATEWAY_CRM}/leads`);
    expect(init.credentials).toBe("include");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it("no escribe nada en localStorage (sin tokens en el navegador)", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, {})));

    await httpClient.post("/leads", { nombre: "Ana" });

    expect(setItem).not.toHaveBeenCalled();
  });

  it("expone los orígenes por defecto del gateway y del frontend de auth", () => {
    expect(getGatewayBaseUrl()).toBe("http://localhost:3001");
    expect(getAuthLoginUrl()).toBe("http://localhost:5174/auth/login");
  });

  it("devuelve el cuerpo de éxito tal cual lo reenvía el gateway (forma del CRM, sin sobre)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { items: [1], total: 1 })));

    await expect(httpClient.get("/leads")).resolves.toEqual({ items: [1], total: 1 });
  });
});

describe("httpClient — postFormData (subida de archivos)", () => {
  it("envía el FormData como body sin fijar Content-Type a mano (el browser define el boundary)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { logoUrl: "https://cdn/x.png" }));
    vi.stubGlobal("fetch", fetchMock);
    const formData = new FormData();
    formData.append("logo", new File(["contenido"], "logo.png", { type: "image/png" }));

    const resultado = await httpClient.postFormData<{ logoUrl: string }>(
      "/empresas/actual/apariencia/logo",
      formData,
    );

    expect(resultado).toEqual({ logoUrl: "https://cdn/x.png" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${GATEWAY_CRM}/empresas/actual/apariencia/logo`);
    expect(init.method).toBe("POST");
    expect(init.body).toBe(formData);
    expect(init.credentials).toBe("include");
    const headers = (init.headers ?? {}) as Record<string, string>;
    expect(headers["Content-Type"]).toBeUndefined();
    expect(headers.Authorization).toBeUndefined();
  });

  it("propaga el mensaje de error accionable del backend (ej. archivo inválido)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(400, { code: "archivo_invalido", message: "El archivo no es una imagen válida" }),
      ),
    );

    await expect(httpClient.postFormData("/x", new FormData())).rejects.toMatchObject({
      code: "archivo_invalido",
      status: 400,
      message: "El archivo no es una imagen válida",
    });
  });

  it("mapea un fallo de red a un ApiError de conexión, igual que el resto de httpClient", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(httpClient.postFormData("/x", new FormData())).rejects.toMatchObject({
      code: "error_red",
      status: 0,
    });
  });
});

describe("httpClient — serialización de query params (F7, GET /usuarios con filtro y paginación)", () => {
  it("serializa `params` a query string, en el orden en que se declaran las claves", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);

    await httpClient.get("/usuarios", { params: { rol: "ASESOR", page: 2 } });

    expect(fetchMock.mock.calls[0][0]).toBe(`${GATEWAY_CRM}/usuarios?rol=ASESOR&page=2`);
  });

  it("omite claves con valor `undefined`, sin mandar `campo=undefined`", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);

    await httpClient.get("/usuarios", { params: { rol: undefined, page: 1 } });

    expect(fetchMock.mock.calls[0][0]).toBe(`${GATEWAY_CRM}/usuarios?page=1`);
  });

  it("serializa un booleano como el string 'true'/'false' (contrato de `activo` en GET /usuarios)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);

    await httpClient.get("/usuarios", { params: { activo: true } });

    expect(fetchMock.mock.calls[0][0]).toBe(`${GATEWAY_CRM}/usuarios?activo=true`);
  });

  it("sin `params`, no agrega un '?' a la URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);

    await httpClient.get("/usuarios");

    expect(fetchMock.mock.calls[0][0]).toBe(`${GATEWAY_CRM}/usuarios`);
  });
});

describe("httpClient — 401 redirige al frontend de auth", () => {
  it("ante 401 AUTH_REQUIRED del gateway redirige una vez y notifica onSessionExpired", async () => {
    const onExpired = vi.fn();
    setOnSessionExpired(onExpired);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(401, { success: false, error: { code: "AUTH_REQUIRED", message: "Missing bearer token" } }),
      ),
    );

    await expect(httpClient.get("/leads")).rejects.toMatchObject({
      code: "sesion_expirada",
      status: 401,
    });

    expect(assignMock).toHaveBeenCalledTimes(1);
    expect(assignMock).toHaveBeenCalledWith("http://localhost:5174/auth/login");
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it("no reintenta la petición ni refresca: un único fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, { code: "no_autenticado", message: "x" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(httpClient.get("/leads")).rejects.toBeInstanceOf(ApiError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("varias peticiones con 401 a la vez disparan una sola redirección", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, {})));

    await Promise.allSettled([httpClient.get("/a"), httpClient.get("/b"), httpClient.get("/c")]);

    expect(assignMock).toHaveBeenCalledTimes(1);
  });

  it("con skipAuth un 401 es un error normal: no redirige ni notifica", async () => {
    const onExpired = vi.fn();
    setOnSessionExpired(onExpired);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(401, { code: "no_autenticado", message: "Sin sesión" })),
    );

    await expect(httpClient.get("/marca-publica", { skipAuth: true })).rejects.toMatchObject({
      code: "no_autenticado",
      status: 401,
    });

    expect(assignMock).not.toHaveBeenCalled();
    expect(onExpired).not.toHaveBeenCalled();
  });

  it("guarda anti-bucle: un segundo intento de redirección reciente no navega otra vez", () => {
    expect(redirectToAuth()).toBe(true);
    expect(assignMock).toHaveBeenCalledTimes(1);

    // Simula una carga nueva (rebote auth -> CRM): la bandera en memoria se
    // pierde, pero `sessionStorage` recuerda la redirección reciente.
    const marca = sessionStorage.getItem("crm.authRedirectAt");
    resetAuthRedirectGuard();
    sessionStorage.setItem("crm.authRedirectAt", marca ?? String(Date.now()));

    expect(redirectToAuth()).toBe(false);
    expect(assignMock).toHaveBeenCalledTimes(1);
  });
});

describe("authenticatedFetch — respuesta reutilizable (SSE)", () => {
  it("devuelve la respuesta sin consumirla, con cookie y sin Authorization", async () => {
    const respuesta = jsonResponse(200, { ok: true });
    const fetchMock = vi.fn().mockResolvedValue(respuesta);
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await authenticatedFetch("/notificaciones/stream", {
      headers: { Accept: "text/event-stream" },
    });

    expect(resultado).toBe(respuesta);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${GATEWAY_CRM}/notificaciones/stream`);
    expect(init.credentials).toBe("include");
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("ante 401 redirige a auth y devuelve la respuesta terminal", async () => {
    const respuesta = jsonResponse(401, {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respuesta));

    await expect(authenticatedFetch("/notificaciones/stream")).resolves.toBe(respuesta);

    expect(assignMock).toHaveBeenCalledTimes(1);
  });
});

describe("httpClient — mapeo de errores", () => {
  it("propaga code y message tal cual los manda el CRM ({ code, message })", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(400, {
          code: "validacion_invalida",
          message: "El cuerpo de la petición es inválido",
        }),
      ),
    );

    await expect(httpClient.post("/algo", {})).rejects.toMatchObject({
      code: "validacion_invalida",
      status: 400,
      message: "El cuerpo de la petición es inválido",
    });
  });

  it("normaliza el error del gateway ({ success: false, error: { code, message } })", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(403, {
          success: false,
          error: { code: "CRM_IDENTITY_NOT_LINKED", message: "This account is not linked to a CRM company yet" },
        }),
      ),
    );

    await expect(httpClient.get("/auth/perfil")).rejects.toMatchObject({
      code: "CRM_IDENTITY_NOT_LINKED",
      status: 403,
      message: "This account is not linked to a CRM company yet",
    });
    expect(assignMock).not.toHaveBeenCalled();
  });

  it("502 UPSTREAM_ERROR del gateway: ApiError normal, sin redirección", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(502, { success: false, error: { code: "UPSTREAM_ERROR", message: "CRM unavailable" } }),
      ),
    );

    await expect(httpClient.get("/leads")).rejects.toMatchObject({ code: "UPSTREAM_ERROR", status: 502 });
    expect(assignMock).not.toHaveBeenCalled();
  });

  it("usa un mensaje genérico cuando la respuesta de error no trae JSON parseable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error("cuerpo no es JSON");
        },
      }),
    );

    await expect(httpClient.get("/algo")).rejects.toMatchObject({
      code: "error_desconocido",
      status: 500,
      message: "Ocurrió un error inesperado. Intenta nuevamente en unos segundos.",
    });
  });

  it("mapea un fallo de red (fetch rechazado) a un ApiError de conexión", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(httpClient.get("/algo")).rejects.toMatchObject({
      code: "error_red",
      status: 0,
      message: "No se pudo conectar con el servidor. Verifica tu conexión e intenta nuevamente.",
    });
  });

  it("devuelve undefined para una respuesta 204 sin cuerpo", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        json: async () => {
          throw new Error("204 no trae cuerpo");
        },
      }),
    );

    await expect(httpClient.delete("/algo")).resolves.toBeUndefined();
  });
});

describe("getErrorMessage", () => {
  it("devuelve el message de un ApiError sin modificarlo", () => {
    const error = new ApiError("codigo_x", 409, "Mensaje específico y accionable");
    expect(getErrorMessage(error)).toBe("Mensaje específico y accionable");
  });

  it("devuelve un mensaje genérico en español para cualquier otro tipo de error", () => {
    expect(getErrorMessage(new Error("boom"))).toBe(
      "Ocurrió un error inesperado. Intenta nuevamente en unos segundos.",
    );
    expect(getErrorMessage("un string cualquiera")).toBe(
      "Ocurrió un error inesperado. Intenta nuevamente en unos segundos.",
    );
    expect(getErrorMessage(undefined)).toBe(
      "Ocurrió un error inesperado. Intenta nuevamente en unos segundos.",
    );
  });
});
