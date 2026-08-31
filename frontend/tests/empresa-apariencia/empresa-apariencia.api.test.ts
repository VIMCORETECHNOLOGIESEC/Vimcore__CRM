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
const { updateEmpresaAparienciaApi, uploadLogoEmpresaApi } = await import(
  "@/funcionalidades/empresa-apariencia/empresa-apariencia.api"
);

const patchMock = vi.mocked(httpClient.patch);
const postFormDataMock = vi.mocked(httpClient.postFormData);

beforeEach(() => {
  patchMock.mockReset();
  postFormDataMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("empresa-apariencia.api", () => {
  it("updateEmpresaAparienciaApi llama a PATCH /empresas/actual/apariencia con el body dado", async () => {
    const actualizado = { colorPrimario: "#111111", colorSecundario: "#222222", logoUrl: null };
    patchMock.mockResolvedValue(actualizado);

    const resultado = await updateEmpresaAparienciaApi({
      colorPrimario: "#111111",
      colorSecundario: "#222222",
    });

    expect(patchMock).toHaveBeenCalledWith("/empresas/actual/apariencia", {
      colorPrimario: "#111111",
      colorSecundario: "#222222",
    });
    expect(resultado).toEqual(actualizado);
  });

  it("uploadLogoEmpresaApi envía el archivo en un FormData al campo 'logo' y devuelve la URL nueva", async () => {
    postFormDataMock.mockResolvedValue({
      colorPrimario: "#111111",
      colorSecundario: "#222222",
      logoUrl: "https://cdn.miempresa.com/logo.png",
    });
    const file = new File([new Uint8Array(10)], "logo.png", { type: "image/png" });

    const resultado = await uploadLogoEmpresaApi(file);

    expect(postFormDataMock).toHaveBeenCalledTimes(1);
    const [path, formData] = postFormDataMock.mock.calls[0] as [string, FormData];
    expect(path).toBe("/empresas/actual/apariencia/logo");
    expect(formData.get("logo")).toBe(file);
    expect(resultado).toBe("https://cdn.miempresa.com/logo.png");
  });
});
