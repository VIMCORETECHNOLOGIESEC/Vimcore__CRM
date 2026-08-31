import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/httpClient";
import type { CanalManual } from "@/funcionalidades/leads/canal-manual.api";

vi.mock("@/funcionalidades/leads/canal-manual.api", () => ({
  fetchCanalesManualesApi: vi.fn(),
  createCanalManualApi: vi.fn(),
  updateCanalManualApi: vi.fn(),
  createLeadManualApi: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const canalManualApi = await import("@/funcionalidades/leads/canal-manual.api");
const { toast } = await import("sonner");
const {
  useCanalesManuales,
  useCrearCanalManual,
  useActualizarCanalManual,
  useCrearLeadManual,
} = await import("@/funcionalidades/leads/useCanalesManuales");

const fetchCanalesManualesApiMock = vi.mocked(canalManualApi.fetchCanalesManualesApi);
const createCanalManualApiMock = vi.mocked(canalManualApi.createCanalManualApi);
const updateCanalManualApiMock = vi.mocked(canalManualApi.updateCanalManualApi);
const createLeadManualApiMock = vi.mocked(canalManualApi.createLeadManualApi);
const toastSuccessMock = vi.mocked(toast.success);

function canalFake(overrides: Partial<CanalManual> = {}): CanalManual {
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
  fetchCanalesManualesApiMock.mockReset();
  createCanalManualApiMock.mockReset();
  updateCanalManualApiMock.mockReset();
  createLeadManualApiMock.mockReset();
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

describe("useCanalesManuales", () => {
  it("consulta el catálogo con el empresaId recibido", async () => {
    fetchCanalesManualesApiMock.mockResolvedValue([canalFake()]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useCanalesManuales("empresa-1"), {
      wrapper: crearWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchCanalesManualesApiMock).toHaveBeenCalledWith("empresa-1");
    expect(result.current.data).toEqual([canalFake()]);
  });

  it("no dispara la consulta cuando empresaId es null", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderHook(() => useCanalesManuales(null), { wrapper: crearWrapper(queryClient) });

    expect(fetchCanalesManualesApiMock).not.toHaveBeenCalled();
  });
});

describe("useCrearCanalManual", () => {
  it("llama a la API con el empresaId y el input recibidos", async () => {
    createCanalManualApiMock.mockResolvedValue(canalFake({ nombre: "WhatsApp directo" }));
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const { result } = renderHook(() => useCrearCanalManual("empresa-1"), {
      wrapper: crearWrapper(queryClient),
    });

    act(() => {
      result.current.mutate({ nombre: "WhatsApp directo" });
    });

    await waitFor(() =>
      expect(createCanalManualApiMock).toHaveBeenCalledWith("empresa-1", { nombre: "WhatsApp directo" }),
    );
  });

  it("avisa éxito e invalida el catálogo de la empresa al terminar", async () => {
    createCanalManualApiMock.mockResolvedValue(canalFake());
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useCrearCanalManual("empresa-1"), {
      wrapper: crearWrapper(queryClient),
    });

    act(() => {
      result.current.mutate({ nombre: "Referido" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toastSuccessMock).toHaveBeenCalledWith("Canal creado correctamente.");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["canales-manuales", "empresa-1"] });
  });
});

describe("useActualizarCanalManual", () => {
  it("llama a la API con empresaId, canalId e input recibidos", async () => {
    updateCanalManualApiMock.mockResolvedValue(canalFake({ nombre: "Renombrado" }));
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const { result } = renderHook(() => useActualizarCanalManual("empresa-1"), {
      wrapper: crearWrapper(queryClient),
    });

    act(() => {
      result.current.mutate({ canalId: "canal-1", input: { nombre: "Renombrado" } });
    });

    await waitFor(() =>
      expect(updateCanalManualApiMock).toHaveBeenCalledWith("empresa-1", "canal-1", {
        nombre: "Renombrado",
      }),
    );
  });

  it("avisa éxito e invalida el catálogo de la empresa al terminar", async () => {
    updateCanalManualApiMock.mockResolvedValue(canalFake({ activo: false }));
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useActualizarCanalManual("empresa-1"), {
      wrapper: crearWrapper(queryClient),
    });

    act(() => {
      result.current.mutate({ canalId: "canal-1", input: { activo: false } });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toastSuccessMock).toHaveBeenCalledWith("Canal actualizado correctamente.");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["canales-manuales", "empresa-1"] });
  });
});

describe("useCrearLeadManual", () => {
  it("llama a la API con el input recibido", async () => {
    createLeadManualApiMock.mockResolvedValue({ id: "lead-nuevo" });
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const { result } = renderHook(() => useCrearLeadManual(), { wrapper: crearWrapper(queryClient) });

    act(() => {
      result.current.mutate({
        empresaId: "empresa-1",
        nombre: "María Cabrera",
        telefono: "0991234567",
        canalManualId: "canal-1",
      });
    });

    await waitFor(() =>
      expect(createLeadManualApiMock).toHaveBeenCalledWith({
        empresaId: "empresa-1",
        nombre: "María Cabrera",
        telefono: "0991234567",
        canalManualId: "canal-1",
      }),
    );
  });

  it("avisa éxito al terminar", async () => {
    createLeadManualApiMock.mockResolvedValue({ id: "lead-nuevo" });
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const { result } = renderHook(() => useCrearLeadManual(), { wrapper: crearWrapper(queryClient) });

    act(() => {
      result.current.mutate({
        empresaId: "empresa-1",
        nombre: "María Cabrera",
        telefono: "0991234567",
        canalManualId: "canal-1",
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toastSuccessMock).toHaveBeenCalledWith("Lead cargado correctamente.");
  });

  it("invalida el listado real de leads al terminar (backend real, el lead recién cargado debe aparecer en LeadsPage)", async () => {
    createLeadManualApiMock.mockResolvedValue({ id: "lead-nuevo" });
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useCrearLeadManual(), { wrapper: crearWrapper(queryClient) });

    act(() => {
      result.current.mutate({
        empresaId: "empresa-1",
        nombre: "María Cabrera",
        telefono: "0991234567",
        canalManualId: "canal-1",
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["leads"] });
  });

  it("propaga el error de la API sin invocar el aviso de éxito", async () => {
    createLeadManualApiMock.mockRejectedValue(
      new ApiError("error_desconocido", 500, "Ocurrió un error inesperado."),
    );
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const { result } = renderHook(() => useCrearLeadManual(), { wrapper: crearWrapper(queryClient) });

    act(() => {
      result.current.mutate({
        empresaId: "empresa-1",
        nombre: "María Cabrera",
        telefono: "0991234567",
        canalManualId: "canal-1",
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });
});
