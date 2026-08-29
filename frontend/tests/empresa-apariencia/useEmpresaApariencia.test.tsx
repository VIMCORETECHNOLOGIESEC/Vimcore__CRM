import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/funcionalidades/empresa-apariencia/empresa-apariencia.api", () => ({
  updateEmpresaAparienciaApi: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const empresaAparienciaApi = await import(
  "@/funcionalidades/empresa-apariencia/empresa-apariencia.api"
);
const { toast } = await import("sonner");
const { useUpdateEmpresaApariencia } = await import(
  "@/funcionalidades/empresa-apariencia/useEmpresaApariencia"
);

const updateEmpresaAparienciaApiMock = vi.mocked(empresaAparienciaApi.updateEmpresaAparienciaApi);
const toastSuccessMock = vi.mocked(toast.success);

beforeEach(() => {
  updateEmpresaAparienciaApiMock.mockReset();
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

describe("useUpdateEmpresaApariencia", () => {
  it("llama a la API con el input recibido", async () => {
    updateEmpresaAparienciaApiMock.mockResolvedValue({ colorPrimario: null, colorSecundario: null });
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const { result } = renderHook(() => useUpdateEmpresaApariencia(), {
      wrapper: crearWrapper(queryClient),
    });

    act(() => {
      result.current.mutate({ colorPrimario: null, colorSecundario: null });
    });

    await waitFor(() =>
      expect(updateEmpresaAparienciaApiMock).toHaveBeenCalledWith({
        colorPrimario: null,
        colorSecundario: null,
      }),
    );
  });

  it("invalida la query de perfil (['auth','perfil']) al tener éxito, sin esperar un login nuevo", async () => {
    updateEmpresaAparienciaApiMock.mockResolvedValue({ colorPrimario: "#123456", colorSecundario: "#abcdef" });
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useUpdateEmpresaApariencia(), {
      wrapper: crearWrapper(queryClient),
    });

    act(() => {
      result.current.mutate({ colorPrimario: "#123456", colorSecundario: "#abcdef" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["auth", "perfil"] });
    expect(toastSuccessMock).toHaveBeenCalledWith("Apariencia de la empresa actualizada correctamente.");
  });
});
