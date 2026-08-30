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
  it("llama a GET /empresas con page/pageSize/search y devuelve { items, total } tal cual", async () => {
    const items = [
      { id: "e1", nombre: "Empresa A", colorPrimario: "#111111", colorSecundario: "#222222", logoUrl: null },
      { id: "e2", nombre: "Empresa B", colorPrimario: null, colorSecundario: null, logoUrl: null },
    ];
    const respuesta = { items, total: 2 };
    getMock.mockResolvedValue(respuesta);

    const resultado = await fetchEmpresasHoldingApi({ page: 1, pageSize: 25, search: "emp" });

    expect(getMock).toHaveBeenCalledWith("/empresas", {
      params: { page: 1, pageSize: 25, search: "emp" },
    });
    expect(resultado).toEqual(respuesta);
  });

  it("funciona sin params (usa los defaults del backend: page=1, pageSize=25)", async () => {
    getMock.mockResolvedValue({ items: [], total: 0 });

    await fetchEmpresasHoldingApi();

    expect(getMock).toHaveBeenCalledWith("/empresas", { params: {} });
  });
});
