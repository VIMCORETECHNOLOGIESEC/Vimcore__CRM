import { describe, expect, it, vi } from "vitest";

vi.mock("@/api/httpClient", () => ({
  httpClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const { httpClient } = await import("@/api/httpClient");
const { fetchEmpresasHoldingApi } = await import(
  "@/funcionalidades/empresa-apariencia/empresa-apariencia-holding.api"
);

const getMock = vi.mocked(httpClient.get);

describe("fetchEmpresasHoldingApi", () => {
  it("llama a GET /empresas y devuelve el listado tal cual", async () => {
    const empresas = [
      { id: "e1", nombre: "Empresa A", colorPrimario: "#111111", colorSecundario: "#222222", logoUrl: null },
      { id: "e2", nombre: "Empresa B", colorPrimario: null, colorSecundario: null, logoUrl: null },
    ];
    getMock.mockResolvedValue(empresas);

    const resultado = await fetchEmpresasHoldingApi();

    expect(getMock).toHaveBeenCalledWith("/empresas");
    expect(resultado).toEqual(empresas);
  });
});
