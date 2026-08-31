import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/httpClient", () => ({
  httpClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    postFormData: vi.fn(),
  },
}));

const { httpClient } = await import("@/api/httpClient");
const {
  fetchConfiguracionEmpresaApi,
  updateConfiguracionEmpresaApi,
  uploadLogoHoldingApi,
  CONFIGURACION_EMPRESA_DEFAULT,
} = await import("@/funcionalidades/configuracion-empresa/configuracion-empresa.api");

const getMock = vi.mocked(httpClient.get);
const patchMock = vi.mocked(httpClient.patch);
const postFormDataMock = vi.mocked(httpClient.postFormData);

beforeEach(() => {
  getMock.mockReset();
  patchMock.mockReset();
  postFormDataMock.mockReset();
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

  it("uploadLogoHoldingApi envía el archivo en un FormData al campo 'logo' y devuelve la URL nueva", async () => {
    postFormDataMock.mockResolvedValue({
      nombre: "Arcano Motos",
      colorPrimario: "#111111",
      colorSecundario: "#222222",
      logoUrl: "https://cdn.miempresa.com/logo.png",
    });
    const file = new File([new Uint8Array(10)], "logo.png", { type: "image/png" });

    const resultado = await uploadLogoHoldingApi(file);

    expect(postFormDataMock).toHaveBeenCalledTimes(1);
    const [path, formData] = postFormDataMock.mock.calls[0] as [string, FormData];
    expect(path).toBe("/configuracion-empresa/logo");
    expect(formData.get("logo")).toBe(file);
    expect(resultado).toBe("https://cdn.miempresa.com/logo.png");
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
