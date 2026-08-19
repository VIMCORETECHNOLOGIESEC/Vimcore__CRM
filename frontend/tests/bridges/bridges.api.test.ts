import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `bridges.api.ts` -- backend real (integración M4). Mismo patrón que
 * `leads/leads.api.test.ts` (F3/F4): `httpClient` mockeado, se verifica la
 * ruta/verbo/body exactos que manda cada función y cómo adapta la
 * respuesta -- nunca contra un fixture en memoria (eso quedó atrás con el
 * mock, ver `bridges.api.ts` para el detalle del reemplazo).
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
  createBridgeApi,
  deleteBridgeApi,
  fetchBridgeDetalleApi,
  fetchBridgeLogsApi,
  fetchBridgesApi,
  fetchRedesSocialesActivasApi,
  fetchRedesSocialesSoportadasApi,
  reactivateBridgeApi,
  regenerateClaveApi,
  saveTokenApi,
  testConnectionApi,
  toggleCuentaActivaApi,
} = await import("@/funcionalidades/bridges/bridges.api");

const getMock = vi.mocked(httpClient.get);
const postMock = vi.mocked(httpClient.post);
const patchMock = vi.mocked(httpClient.patch);
const deleteMock = vi.mocked(httpClient.delete);

function bridgeBackendFake(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "bridge-1",
    redSocial: "FACEBOOK",
    nombre: "Meta Ads — Facebook",
    estado: "ACTIVO",
    ultimoLeadEn: null,
    tokenExpiraEn: null,
    ...overrides,
  };
}

function cuentaBackendFake(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "cuenta-1",
    bridgeId: "bridge-1",
    idExterno: "page-1",
    nombre: "Página Principal",
    instagramAccountId: null,
    activa: true,
    ...overrides,
  };
}

beforeEach(() => {
  getMock.mockReset();
  postMock.mockReset();
  patchMock.mockReset();
  deleteMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchBridgesApi — GET /bridges", () => {
  it("desenvuelve `{ bridges }` y lo devuelve tal cual", async () => {
    const bridges = [bridgeBackendFake(), bridgeBackendFake({ id: "bridge-2", redSocial: "X" })];
    getMock.mockResolvedValue({ bridges });

    const resultado = await fetchBridgesApi();

    expect(getMock).toHaveBeenCalledWith("/bridges");
    expect(resultado).toEqual(bridges);
  });
});

describe("fetchBridgeDetalleApi — GET /bridges/:id", () => {
  it("desenvuelve `{ bridge }` con sus cuentas publicitarias embebidas", async () => {
    const bridge = bridgeBackendFake({ cuentasPublicitarias: [cuentaBackendFake()] });
    getMock.mockResolvedValue({ bridge });

    const resultado = await fetchBridgeDetalleApi("bridge-1");

    expect(getMock).toHaveBeenCalledWith("/bridges/bridge-1");
    expect(resultado).toEqual(bridge);
  });

  it("propaga el ApiError del backend si el bridge no existe (sin envolverlo de nuevo)", async () => {
    getMock.mockRejectedValue(new ApiError("bridge_no_encontrado", 404, "Bridge no encontrado"));

    await expect(fetchBridgeDetalleApi("no-existe")).rejects.toMatchObject({
      code: "bridge_no_encontrado",
      status: 404,
    });
  });
});

describe("saveTokenApi — POST /bridges/:id/cuentas/:cuentaId/token (gap de contrato: por cuenta, no por bridge)", () => {
  it("manda bridgeId y cuentaId en la ruta y el token en el body, devuelve la cuenta actualizada", async () => {
    const cuenta = cuentaBackendFake({ activa: true });
    postMock.mockResolvedValue({ cuenta });

    const resultado = await saveTokenApi("bridge-1", "cuenta-1", "un-token-bastante-largo");

    expect(postMock).toHaveBeenCalledWith("/bridges/bridge-1/cuentas/cuenta-1/token", {
      token: "un-token-bastante-largo",
    });
    expect(resultado).toEqual(cuenta);
  });

  it("propaga el ApiError 422 del backend cuando Graph API rechaza el token, con mensaje accionable", async () => {
    postMock.mockRejectedValue(
      new ApiError("meta_token_invalido", 422, "El token no pudo verificarse contra Graph API: inválido."),
    );

    await expect(saveTokenApi("bridge-1", "cuenta-1", "corto")).rejects.toMatchObject({
      code: "meta_token_invalido",
      status: 422,
      message: "El token no pudo verificarse contra Graph API: inválido.",
    });
  });
});

describe("testConnectionApi — POST /bridges/:id/cuentas/:cuentaId/probar-conexion (gap de contrato: por cuenta, no por bridge)", () => {
  it("manda bridgeId y cuentaId en la ruta, sin body, y devuelve `{ ok, mensaje }` tal cual", async () => {
    postMock.mockResolvedValue({ ok: true, mensaje: "Conexión verificada correctamente." });

    const resultado = await testConnectionApi("bridge-1", "cuenta-1");

    expect(postMock).toHaveBeenCalledWith("/bridges/bridge-1/cuentas/cuenta-1/probar-conexion");
    expect(resultado).toEqual({ ok: true, mensaje: "Conexión verificada correctamente." });
  });

  it("nunca lanza para un resultado diagnóstico negativo -- resuelve con `ok: false`", async () => {
    postMock.mockResolvedValue({ ok: false, mensaje: "El token expiró o fue revocado. Cargá uno nuevo." });

    const resultado = await testConnectionApi("bridge-1", "cuenta-1");

    expect(resultado.ok).toBe(false);
  });
});

describe("toggleCuentaActivaApi — PATCH /bridges/:id/cuentas/:cuentaId", () => {
  it("manda solo `{ activa }` y devuelve la cuenta actualizada", async () => {
    const cuenta = cuentaBackendFake({ activa: false });
    patchMock.mockResolvedValue({ cuenta });

    const resultado = await toggleCuentaActivaApi("bridge-1", "cuenta-1", false);

    expect(patchMock).toHaveBeenCalledWith("/bridges/bridge-1/cuentas/cuenta-1", { activa: false });
    expect(resultado).toEqual(cuenta);
  });
});

describe("fetchBridgeLogsApi — GET /bridges/:id/logs", () => {
  it("sin filtros, no manda ningún query param con valor (el backend aplica su propio default)", async () => {
    getMock.mockResolvedValue({ logs: [] });

    await fetchBridgeLogsApi("bridge-1");

    expect(getMock).toHaveBeenCalledWith("/bridges/bridge-1/logs", {
      params: { nivel: undefined, fechaDesde: undefined, fechaHasta: undefined },
    });
  });

  it("combina nivel y rango de fechas en la misma consulta (filtros combinables)", async () => {
    getMock.mockResolvedValue({ logs: [] });

    await fetchBridgeLogsApi("bridge-1", { nivel: "ERROR", fechaDesde: "2026-01-01", fechaHasta: "2026-01-31" });

    expect(getMock).toHaveBeenCalledWith("/bridges/bridge-1/logs", {
      params: { nivel: "ERROR", fechaDesde: "2026-01-01", fechaHasta: "2026-01-31" },
    });
  });

  it("desenvuelve `{ logs }` y lo devuelve tal cual", async () => {
    const logs = [
      { id: "log-1", bridgeId: "bridge-1", nivel: "ERROR", mensaje: "boom", ocurridoEn: new Date().toISOString() },
    ];
    getMock.mockResolvedValue({ logs });

    const resultado = await fetchBridgeLogsApi("bridge-1");

    expect(resultado).toEqual(logs);
  });
});

describe("createBridgeApi — POST /bridges (Requirement: Create Bridge)", () => {
  it("manda el input tal cual y devuelve `{ bridge, claveApi }` sin envolver", async () => {
    const respuesta = { bridge: bridgeBackendFake({ estado: "INACTIVO" }), claveApi: "brg_nueva-clave" };
    postMock.mockResolvedValue(respuesta);

    const resultado = await createBridgeApi({ redSocial: "GOOGLE_FORMS", nombre: "Formulario Ventas Norte" });

    expect(postMock).toHaveBeenCalledWith("/bridges", {
      redSocial: "GOOGLE_FORMS",
      nombre: "Formulario Ventas Norte",
    });
    expect(resultado).toEqual(respuesta);
  });
});

describe("deleteBridgeApi — DELETE /bridges/:id (Requirement: Hard Delete Only Without Leads)", () => {
  it("devuelve `{ resultado, bridge }` tal cual llega del backend -- nunca decide la baja del lado del frontend", async () => {
    const respuesta = { resultado: "BAJA_FISICA" as const, bridge: bridgeBackendFake() };
    deleteMock.mockResolvedValue(respuesta);

    const resultado = await deleteBridgeApi("bridge-1");

    expect(deleteMock).toHaveBeenCalledWith("/bridges/bridge-1");
    expect(resultado).toEqual(respuesta);
  });

  it("también propaga BAJA_LOGICA tal cual, sin replicar la regla de conteo de leads", async () => {
    const respuesta = { resultado: "BAJA_LOGICA" as const, bridge: bridgeBackendFake({ estado: "INACTIVO" }) };
    deleteMock.mockResolvedValue(respuesta);

    const resultado = await deleteBridgeApi("bridge-1");

    expect(resultado.resultado).toBe("BAJA_LOGICA");
  });
});

describe("reactivateBridgeApi — PATCH /bridges/:id { estado: ACTIVO } (Requirement: Soft Deactivate and Reactivate)", () => {
  it("manda únicamente `{ estado: \"ACTIVO\" }`", async () => {
    patchMock.mockResolvedValue({ bridge: bridgeBackendFake({ estado: "ACTIVO" }) });

    await reactivateBridgeApi("bridge-1");

    expect(patchMock).toHaveBeenCalledWith("/bridges/bridge-1", { estado: "ACTIVO" });
  });
});

describe("regenerateClaveApi — POST /bridges/:id/clave (Requirement: Regenerate Key)", () => {
  it("sin body, devuelve `{ bridge, claveApi }` tal cual", async () => {
    const respuesta = { bridge: bridgeBackendFake(), claveApi: "brg_otra-clave" };
    postMock.mockResolvedValue(respuesta);

    const resultado = await regenerateClaveApi("bridge-1");

    expect(postMock).toHaveBeenCalledWith("/bridges/bridge-1/clave");
    expect(resultado).toEqual(respuesta);
  });
});

describe("fetchRedesSocialesSoportadasApi — GET /bridges/catalogo/redes-soportadas (Requirement: Backend-Driven Creation Catalog)", () => {
  it("desenvuelve `{ redesSociales }`", async () => {
    getMock.mockResolvedValue({ redesSociales: ["FACEBOOK", "INSTAGRAM", "LINKEDIN", "X", "GOOGLE_FORMS"] });

    const resultado = await fetchRedesSocialesSoportadasApi();

    expect(getMock).toHaveBeenCalledWith("/bridges/catalogo/redes-soportadas");
    expect(resultado).toEqual(["FACEBOOK", "INSTAGRAM", "LINKEDIN", "X", "GOOGLE_FORMS"]);
  });
});

describe("fetchRedesSocialesActivasApi — GET /bridges/redes-activas (Requirement: Active Red-Social Catalog Endpoint)", () => {
  it("desenvuelve `{ redesSociales }`", async () => {
    getMock.mockResolvedValue({ redesSociales: ["FACEBOOK"] });

    const resultado = await fetchRedesSocialesActivasApi();

    expect(getMock).toHaveBeenCalledWith("/bridges/redes-activas");
    expect(resultado).toEqual(["FACEBOOK"]);
  });
});
