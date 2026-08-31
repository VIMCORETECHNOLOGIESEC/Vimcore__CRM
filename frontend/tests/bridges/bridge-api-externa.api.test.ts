import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `bridge-api-externa.api.ts` -- 3 endpoints de configuración de un bridge
 * `API_EXTERNA` (material de prueba,
 * `docs/contrato-frontend-bridge-api_mat_01.md`). Mismo patrón que
 * `bridges.api.test.ts`: `httpClient` mockeado, se verifica la ruta/verbo/
 * body exactos que manda cada función y cómo desenvuelve la respuesta.
 */
vi.mock("@/api/httpClient", () => ({
  httpClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    code: string;
    status: number;
    constructor(code: string, status: number, message: string) {
      super(message);
      this.name = "ApiError";
      this.code = code;
      this.status = status;
    }
  },
}));

const { httpClient, ApiError } = await import("@/api/httpClient");
const {
  saveConexionApiExternaApi,
  saveMapeoApiExternaApi,
  testConexionApiExternaApi,
} = await import("@/funcionalidades/bridges/bridge-api-externa.api");

const postMock = vi.mocked(httpClient.post);
const patchMock = vi.mocked(httpClient.patch);

beforeEach(() => {
  postMock.mockReset();
  patchMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function bridgeApiConfigFake(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "bridge-1",
    redSocial: "API_EXTERNA",
    configuracionJson: {
      url: "https://api.ejemplo.com/leads",
      nombreHeaderApiKey: "X-Api-Key",
      mapeoCampos: { id: "idExternoLead" },
    },
    ...overrides,
  };
}

describe("saveConexionApiExternaApi — PATCH /bridges/:id/api-externa/conexion", () => {
  it("manda el body tal cual y desenvuelve `{ bridgeApiConfig }`", async () => {
    const bridgeApiConfig = bridgeApiConfigFake();
    patchMock.mockResolvedValue({ bridgeApiConfig });

    const resultado = await saveConexionApiExternaApi("bridge-1", {
      url: "https://api.ejemplo.com/leads",
      credencialExterna: "clave-secreta",
      nombreHeaderApiKey: "X-Api-Key",
    });

    expect(patchMock).toHaveBeenCalledWith("/bridges/bridge-1/api-externa/conexion", {
      url: "https://api.ejemplo.com/leads",
      credencialExterna: "clave-secreta",
      nombreHeaderApiKey: "X-Api-Key",
    });
    expect(resultado).toEqual(bridgeApiConfig);
  });

  it("propaga el ApiError 404 del backend si el bridge no existe", async () => {
    patchMock.mockRejectedValue(new ApiError("bridge_no_encontrado", 404, "Bridge no encontrado"));

    await expect(
      saveConexionApiExternaApi("no-existe", { url: "https://x.com", credencialExterna: "clave" }),
    ).rejects.toMatchObject({ code: "bridge_no_encontrado", status: 404 });
  });

  it("propaga el ApiError 400 del backend si el bridge existe pero no es API_EXTERNA", async () => {
    patchMock.mockRejectedValue(
      new ApiError("bridge_no_es_api_externa", 400, "El bridge no es de tipo API externa."),
    );

    await expect(
      saveConexionApiExternaApi("bridge-facebook", { url: "https://x.com", credencialExterna: "clave" }),
    ).rejects.toMatchObject({ code: "bridge_no_es_api_externa", status: 400 });
  });
});

describe("saveMapeoApiExternaApi — PATCH /bridges/:id/api-externa/mapeo", () => {
  it("manda el body tal cual (incluyendo parametroFecha opcional) y desenvuelve `{ bridgeApiConfig }`", async () => {
    const bridgeApiConfig = bridgeApiConfigFake({
      configuracionJson: {
        url: "https://api.ejemplo.com/leads",
        nombreHeaderApiKey: "X-Api-Key",
        mapeoCampos: { customer_id: "idExternoLead", full_name: "nombre" },
        parametroFecha: "updated_since",
      },
    });
    patchMock.mockResolvedValue({ bridgeApiConfig });

    const resultado = await saveMapeoApiExternaApi("bridge-1", {
      mapeoCampos: { customer_id: "idExternoLead", full_name: "nombre" },
      parametroFecha: "updated_since",
    });

    expect(patchMock).toHaveBeenCalledWith("/bridges/bridge-1/api-externa/mapeo", {
      mapeoCampos: { customer_id: "idExternoLead", full_name: "nombre" },
      parametroFecha: "updated_since",
    });
    expect(resultado).toEqual(bridgeApiConfig);
  });

  it("propaga el ApiError 400 del backend cuando mapeoCampos no mapea ninguna clave a idExternoLead", async () => {
    patchMock.mockRejectedValue(
      new ApiError("mapeo_sin_id_externo", 400, "mapeoCampos debe mapear al menos una clave a idExternoLead"),
    );

    await expect(
      saveMapeoApiExternaApi("bridge-1", { mapeoCampos: { full_name: "nombre" } }),
    ).rejects.toMatchObject({ code: "mapeo_sin_id_externo", status: 400 });
  });
});

describe("testConexionApiExternaApi — POST /bridges/:id/api-externa/probar-conexion", () => {
  it("manda la ruta sin body y devuelve `{ ok, mensaje, cantidadLeads }` tal cual", async () => {
    postMock.mockResolvedValue({ ok: true, mensaje: "Conexión verificada correctamente.", cantidadLeads: 12 });

    const resultado = await testConexionApiExternaApi("bridge-1");

    expect(postMock).toHaveBeenCalledWith("/bridges/bridge-1/api-externa/probar-conexion");
    expect(resultado).toEqual({ ok: true, mensaje: "Conexión verificada correctamente.", cantidadLeads: 12 });
  });

  it("nunca lanza para un resultado diagnóstico negativo -- resuelve con `ok: false` y sin cantidadLeads", async () => {
    postMock.mockResolvedValue({ ok: false, mensaje: "No se pudo conectar con la URL configurada." });

    const resultado = await testConexionApiExternaApi("bridge-1");

    expect(resultado.ok).toBe(false);
    expect(resultado.cantidadLeads).toBeUndefined();
  });
});
