import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/funcionalidades/empresa-apariencia/empresa-apariencia-holding.api", () => ({
  updateEmpresaAparienciaHoldingApi: vi.fn(),
  fetchEmpresasHoldingApi: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const empresaAparienciaHoldingApi = await import(
  "@/funcionalidades/empresa-apariencia/empresa-apariencia-holding.api"
);
const { toast } = await import("sonner");
const {
  useUpdateEmpresaAparienciaHolding,
  useEmpresasHolding,
  EMPRESAS_HOLDING_QUERY_KEY,
} = await import("@/funcionalidades/empresa-apariencia/useEmpresaAparienciaHolding");

const updateEmpresaAparienciaHoldingApiMock = vi.mocked(
  empresaAparienciaHoldingApi.updateEmpresaAparienciaHoldingApi,
);
const fetchEmpresasHoldingApiMock = vi.mocked(empresaAparienciaHoldingApi.fetchEmpresasHoldingApi);
const toastSuccessMock = vi.mocked(toast.success);

beforeEach(() => {
  updateEmpresaAparienciaHoldingApiMock.mockReset();
  fetchEmpresasHoldingApiMock.mockReset();
  toastSuccessMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function crearWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("useUpdateEmpresaAparienciaHolding", () => {
  it("llama a la API con el empresaId y el input recibidos", async () => {
    updateEmpresaAparienciaHoldingApiMock.mockResolvedValue({
      id: "e2",
      nombre: "Empresa B",
      colorPrimario: null,
      colorSecundario: null,
      logoUrl: null,
    });
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const { result } = renderHook(() => useUpdateEmpresaAparienciaHolding(), {
      wrapper: crearWrapper(queryClient),
    });

    act(() => {
      result.current.mutate({ empresaId: "e2", input: { nombre: "Empresa B" } });
    });

    await waitFor(() =>
      expect(updateEmpresaAparienciaHoldingApiMock).toHaveBeenCalledWith("e2", {
        nombre: "Empresa B",
      }),
    );
  });

  it("avisa éxito con el nombre de la empresa editada al terminar", async () => {
    updateEmpresaAparienciaHoldingApiMock.mockResolvedValue({
      id: "e2",
      nombre: "Empresa B renombrada",
      colorPrimario: "#065f46",
      colorSecundario: "#10b981",
      logoUrl: null,
    });
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const { result } = renderHook(() => useUpdateEmpresaAparienciaHolding(), {
      wrapper: crearWrapper(queryClient),
    });

    act(() => {
      result.current.mutate({ empresaId: "e2", input: { nombre: "Empresa B renombrada" } });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "Apariencia de Empresa B renombrada actualizada correctamente.",
    );
  });

  it("invalida el listado de empresas del holding al terminar con éxito", async () => {
    updateEmpresaAparienciaHoldingApiMock.mockResolvedValue({
      id: "e2",
      nombre: "Empresa B",
      colorPrimario: null,
      colorSecundario: null,
      logoUrl: null,
    });
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useUpdateEmpresaAparienciaHolding(), {
      wrapper: crearWrapper(queryClient),
    });

    act(() => {
      result.current.mutate({ empresaId: "e2", input: { nombre: "Empresa B" } });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [EMPRESAS_HOLDING_QUERY_KEY] });
  });
});

describe("useEmpresasHolding", () => {
  it("consulta GET /empresas con los params recibidos y devuelve { items, total }", async () => {
    const respuesta = {
      items: [
        { id: "e1", nombre: "Empresa A", colorPrimario: "#111111", colorSecundario: "#222222", logoUrl: null },
      ],
      total: 1,
    };
    fetchEmpresasHoldingApiMock.mockResolvedValue(respuesta);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useEmpresasHolding({ page: 1, pageSize: 25 }), {
      wrapper: crearWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchEmpresasHoldingApiMock).toHaveBeenCalledWith({ page: 1, pageSize: 25 });
    expect(result.current.data).toEqual(respuesta);
  });

  it("funciona sin params (usa {})", async () => {
    fetchEmpresasHoldingApiMock.mockResolvedValue({ items: [], total: 0 });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useEmpresasHolding(), {
      wrapper: crearWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchEmpresasHoldingApiMock).toHaveBeenCalledWith({});
  });
});
