import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/httpClient", () => ({
  httpClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const { httpClient } = await import("@/api/httpClient");
const { fetchConfiguracionEmpresaApi, updateConfiguracionEmpresaApi, CONFIGURACION_EMPRESA_DEFAULT } =
  await import("@/funcionalidades/configuracion-empresa/configuracion-empresa.api");

const getMock = vi.mocked(httpClient.get);
const patchMock = vi.mocked(httpClient.patch);

beforeEach(() => {
  getMock.mockReset();
  patchMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("configuracion-empresa.api", () => {
  it("fetchConfiguracionEmpresaApi llama a GET /configuracion-empresa y devuelve la respuesta", async () => {
    const respuesta = {
      nombre: "Arcano Motos",
      colorPrimario: "#111111",
      colorSecundario: "#222222",
      logoUrl: null,
    };
    getMock.mockResolvedValue(respuesta);

    const resultado = await fetchConfiguracionEmpresaApi();

    expect(getMock).toHaveBeenCalledWith("/configuracion-empresa");
    expect(resultado).toEqual(respuesta);
  });

  it("updateConfiguracionEmpresaApi llama a PATCH /configuracion-empresa con el body parcial dado", async () => {
    const actualizado = {
      nombre: "Arcano Motos",
      colorPrimario: "#111111",
      colorSecundario: "#2563eb",
      logoUrl: null,
    };
    patchMock.mockResolvedValue(actualizado);

    const resultado = await updateConfiguracionEmpresaApi({ nombre: "Arcano Motos", colorPrimario: "#111111" });

    expect(patchMock).toHaveBeenCalledWith("/configuracion-empresa", {
      nombre: "Arcano Motos",
      colorPrimario: "#111111",
    });
    expect(resultado).toEqual(actualizado);
  });

  it("expone los defaults documentados como fallback", () => {
    expect(CONFIGURACION_EMPRESA_DEFAULT).toEqual({
      nombre: "CRM Embudo de Leads",
      colorPrimario: "#1e2a5e",
      colorSecundario: "#2563eb",
      logoUrl: null,
    });
  });
});
