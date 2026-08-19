import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `notificaciones.api.ts` -- backend real (integración M8,
 * `backend/src/controllers/notificaciones.controller.ts`,
 * `backend/src/routes/notificaciones.routes.ts`, worktree `dev-back`). Mismo
 * patrón que `bridges/bridges.api.test.ts` (F8): `httpClient` mockeado, se
 * verifica la ruta/verbo/params exactos que manda cada función y cómo
 * adapta la respuesta -- nunca contra un fixture en memoria (eso quedó
 * atrás con el mock, ver `notificaciones.api.ts` para el detalle del
 * reemplazo).
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
const { fetchNotificacionesApi, markNotificacionLeidaApi, markAllNotificacionesLeidasApi } =
  await import("@/funcionalidades/notificaciones/notificaciones.api");

const getMock = vi.mocked(httpClient.get);
const patchMock = vi.mocked(httpClient.patch);

function notificacionBackendFake(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "notif-1",
    usuarioId: "u1",
    tipo: "LEAD_ASIGNADO",
    canal: "IN_APP",
    titulo: "Nuevo lead asignado",
    mensaje: "Se te asignó el lead de Roberto Salazar.",
    leadId: "lead-01",
    leidaEn: null,
    creadaEn: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  getMock.mockReset();
  patchMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchNotificacionesApi — GET /notificaciones", () => {
  it("desenvuelve `{ notificaciones }` y lo devuelve tal cual", async () => {
    const notificaciones = [notificacionBackendFake(), notificacionBackendFake({ id: "notif-2" })];
    getMock.mockResolvedValue({ notificaciones });

    const resultado = await fetchNotificacionesApi();

    expect(getMock).toHaveBeenCalledWith("/notificaciones", {
      params: { soloNoLeidas: undefined },
    });
    expect(resultado).toEqual(notificaciones);
  });

  it("manda `soloNoLeidas=true` como query param cuando se pide", async () => {
    getMock.mockResolvedValue({ notificaciones: [] });

    await fetchNotificacionesApi(true);

    expect(getMock).toHaveBeenCalledWith("/notificaciones", {
      params: { soloNoLeidas: true },
    });
  });

  it("propaga el ApiError del backend sin envolverlo de nuevo", async () => {
    getMock.mockRejectedValue(new ApiError("sesion_expirada", 401, "Tu sesión expiró."));

    await expect(fetchNotificacionesApi()).rejects.toMatchObject({
      code: "sesion_expirada",
      status: 401,
    });
  });
});

describe("markNotificacionLeidaApi — PATCH /notificaciones/:id/leer", () => {
  it("manda el id en la ruta y no espera cuerpo de respuesta (204)", async () => {
    patchMock.mockResolvedValue(undefined);

    await markNotificacionLeidaApi("notif-1");

    expect(patchMock).toHaveBeenCalledWith("/notificaciones/notif-1/leer");
  });
});

describe("markAllNotificacionesLeidasApi — PATCH /notificaciones/leer-todas", () => {
  it("no manda parámetros y no espera cuerpo de respuesta (204)", async () => {
    patchMock.mockResolvedValue(undefined);

    await markAllNotificacionesLeidasApi();

    expect(patchMock).toHaveBeenCalledWith("/notificaciones/leer-todas");
  });
});
