import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `canal-manual.api.ts` -- backend real (ver el docblock del archivo).
 * Mismo patrón de mockeo de `httpClient` que
 * `frontend/tests/usuarios/usuarios.api.test.ts`: se testea que cada función
 * arma el verbo/ruta/body/params correctos y devuelve la forma esperada de
 * la respuesta, sin pegarle a un servidor real (AGENTS.md §5).
 */

vi.mock("@/api/httpClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/httpClient")>();
  return {
    ...actual,
    httpClient: {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    },
  };
});

const { httpClient } = await import("@/api/httpClient");
const {
  fetchCanalesManualesApi,
  createCanalManualApi,
  updateCanalManualApi,
  createLeadManualApi,
} = await import("@/funcionalidades/leads/canal-manual.api");

const getMock = vi.mocked(httpClient.get);
const postMock = vi.mocked(httpClient.post);
const patchMock = vi.mocked(httpClient.patch);

function canalFake(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "canal-1",
    empresaId: "empresa-1",
    nombre: "Referido",
    activo: true,
    creadoEn: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  getMock.mockReset();
  postMock.mockReset();
  patchMock.mockReset();
});

describe("fetchCanalesManualesApi", () => {
  it("consulta GET /canales-manuales con empresaId de query y devuelve el arreglo", async () => {
    getMock.mockResolvedValue({ canalesManuales: [canalFake()] });

    const canales = await fetchCanalesManualesApi("empresa-1");

    expect(getMock).toHaveBeenCalledWith("/canales-manuales", { params: { empresaId: "empresa-1" } });
    expect(canales).toEqual([canalFake()]);
  });
});

describe("createCanalManualApi", () => {
  it("llama a POST /canales-manuales con nombre y empresaId, devuelve el canal creado", async () => {
    postMock.mockResolvedValue({ canalManual: canalFake({ nombre: "WhatsApp directo" }) });

    const creado = await createCanalManualApi("empresa-1", { nombre: "WhatsApp directo" });

    expect(postMock).toHaveBeenCalledWith("/canales-manuales", {
      nombre: "WhatsApp directo",
      empresaId: "empresa-1",
    });
    expect(creado).toEqual(canalFake({ nombre: "WhatsApp directo" }));
  });

  it("propaga el ApiError del backend ante un nombre duplicado (409)", async () => {
    const { ApiError } = await import("@/api/httpClient");
    postMock.mockRejectedValue(
      new ApiError("canal_manual_duplicado", 409, "Ya existe un canal manual con ese nombre en esta empresa"),
    );

    await expect(createCanalManualApi("empresa-1", { nombre: "Referido" })).rejects.toMatchObject({
      status: 409,
    });
  });
});

describe("updateCanalManualApi", () => {
  it("llama a PATCH /canales-manuales/:id con el input, sin empresaId en el body", async () => {
    patchMock.mockResolvedValue({ canalManual: canalFake({ nombre: "Renombrado" }) });

    const actualizado = await updateCanalManualApi("empresa-1", "canal-1", { nombre: "Renombrado" });

    expect(patchMock).toHaveBeenCalledWith("/canales-manuales/canal-1", { nombre: "Renombrado" });
    expect(actualizado).toEqual(canalFake({ nombre: "Renombrado" }));
  });

  it("permite actualizar solo `activo`", async () => {
    patchMock.mockResolvedValue({ canalManual: canalFake({ activo: false }) });

    await updateCanalManualApi("empresa-1", "canal-1", { activo: false });

    expect(patchMock).toHaveBeenCalledWith("/canales-manuales/canal-1", { activo: false });
  });
});

describe("createLeadManualApi", () => {
  it("llama a POST /leads con el input completo y devuelve solo el id del lead", async () => {
    postMock.mockResolvedValue({ lead: { id: "lead-nuevo" } });

    const resultado = await createLeadManualApi({
      empresaId: "empresa-1",
      nombre: "María Cabrera",
      telefono: "0991234567",
      canalManualId: "canal-1",
    });

    expect(postMock).toHaveBeenCalledWith("/leads", {
      empresaId: "empresa-1",
      nombre: "María Cabrera",
      telefono: "0991234567",
      canalManualId: "canal-1",
    });
    expect(resultado).toEqual({ id: "lead-nuevo" });
  });
});
