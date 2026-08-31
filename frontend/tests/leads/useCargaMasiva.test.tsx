import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CargaMasivaResponse } from "@/funcionalidades/leads/carga-masiva.api";
import type { FilaCargaMasivaParseada } from "@/funcionalidades/leads/carga-masiva.utils";

vi.mock("@/funcionalidades/leads/carga-masiva.api", async () => {
  const actual = await vi.importActual<typeof import("@/funcionalidades/leads/carga-masiva.api")>(
    "@/funcionalidades/leads/carga-masiva.api",
  );
  return { ...actual, crearLeadsMasivoApi: vi.fn() };
});

const cargaMasivaApi = await import("@/funcionalidades/leads/carga-masiva.api");
const { useCargaMasivaLeads } = await import("@/funcionalidades/leads/useCargaMasiva");

const crearLeadsMasivoApiMock = vi.mocked(cargaMasivaApi.crearLeadsMasivoApi);

function filaFake(overrides: Partial<FilaCargaMasivaParseada> = {}): FilaCargaMasivaParseada {
  return {
    filaExcel: 2,
    nombre: "María Cabrera",
    telefono: "0991234567",
    ...overrides,
  };
}

/** Genera N filas parseadas con filaExcel consecutivo empezando en 2 (fila 1 = encabezado). */
function filasFake(cantidad: number): FilaCargaMasivaParseada[] {
  return Array.from({ length: cantidad }, (_, i) => filaFake({ filaExcel: i + 2, nombre: `Lead ${i + 2}` }));
}

function crearWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  crearLeadsMasivoApiMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useCargaMasivaLeads -- remapeo de fila (índice de tanda -> filaExcel real)", () => {
  it("con una sola tanda, mapea el índice 1-based del array directo a su filaExcel", async () => {
    crearLeadsMasivoApiMock.mockResolvedValue({
      resumen: { solicitados: 2, creados: 1, duplicados: 0, fallidos: 1 },
      resultados: [
        { fila: 1, estado: "creado", leadId: "lead-1" },
        { fila: 2, estado: "error", motivo: "telefono y correo ausentes" },
      ],
    } satisfies CargaMasivaResponse);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useCargaMasivaLeads(), { wrapper: crearWrapper(queryClient) });

    const filas = filasFake(2); // filaExcel 2 y 3
    let final: Awaited<ReturnType<typeof result.current.ejecutar>> | undefined;
    await act(async () => {
      final = await result.current.ejecutar(filas, undefined, "empresa-1");
    });

    expect(final?.resultados).toEqual([
      { filaExcel: 2, estado: "creado", leadId: "lead-1", motivo: undefined },
      { filaExcel: 3, estado: "error", leadId: undefined, motivo: "telefono y correo ausentes" },
    ]);
  });

  it("en la segunda tanda, NO confunde el índice 1-based del request con el número real de fila del Excel", async () => {
    // 150 filas -> 2 tandas (100 + 50). La segunda tanda arranca en filaExcel
    // 102 (fila 1 = encabezado, filas 2-101 = primera tanda, 102-151 =
    // segunda). Si el hook devolviera `resultadoFila.fila` sin remapear,
    // este test fallaría (reportaría "fila 1" en vez de "fila 102").
    const filas = filasFake(150);

    crearLeadsMasivoApiMock
      .mockResolvedValueOnce({
        resumen: { solicitados: 100, creados: 100, duplicados: 0, fallidos: 0 },
        resultados: Array.from({ length: 100 }, (_, i) => ({
          fila: i + 1,
          estado: "creado" as const,
          leadId: `lead-${i + 1}`,
        })),
      })
      .mockResolvedValueOnce({
        resumen: { solicitados: 50, creados: 0, duplicados: 0, fallidos: 50 },
        resultados: [{ fila: 1, estado: "error", motivo: "telefono y correo ausentes" }],
      });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useCargaMasivaLeads(), { wrapper: crearWrapper(queryClient) });

    let final: Awaited<ReturnType<typeof result.current.ejecutar>> | undefined;
    await act(async () => {
      final = await result.current.ejecutar(filas, undefined, "empresa-1");
    });

    expect(crearLeadsMasivoApiMock).toHaveBeenCalledTimes(2);
    expect(crearLeadsMasivoApiMock.mock.calls[0][0].leads).toHaveLength(100);
    expect(crearLeadsMasivoApiMock.mock.calls[1][0].leads).toHaveLength(50);

    // El único resultado de la segunda tanda es `{ fila: 1, ... }`, pero la
    // fila real del Excel es la 102 (segunda tanda arranca en filaExcel 102).
    const resultadoSegundaTanda = final?.resultados.at(-1);
    expect(resultadoSegundaTanda).toEqual({
      filaExcel: 102,
      estado: "error",
      leadId: undefined,
      motivo: "telefono y correo ausentes",
    });

    expect(final?.resumen).toEqual({ solicitados: 150, creados: 100, duplicados: 0, fallidos: 50 });
  });

  it("manda las tandas en orden secuencial, nunca en paralelo", async () => {
    const ordenLlamadas: string[] = [];
    crearLeadsMasivoApiMock.mockImplementation(async (body) => {
      ordenLlamadas.push(`inicio-${body.leads.length}`);
      await new Promise((r) => setTimeout(r, 0));
      ordenLlamadas.push(`fin-${body.leads.length}`);
      return {
        resumen: { solicitados: body.leads.length, creados: body.leads.length, duplicados: 0, fallidos: 0 },
        resultados: body.leads.map((_, i) => ({ fila: i + 1, estado: "creado" as const, leadId: `l-${i}` })),
      };
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useCargaMasivaLeads(), { wrapper: crearWrapper(queryClient) });

    await act(async () => {
      await result.current.ejecutar(filasFake(150), undefined, "empresa-1");
    });

    // Si fuera paralelo, ambos "inicio" aparecerían antes que cualquier "fin".
    expect(ordenLlamadas).toEqual(["inicio-100", "fin-100", "inicio-50", "fin-50"]);
  });

  it("sin filas válidas, resuelve con un resultado final vacío sin llamar a la API", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useCargaMasivaLeads(), { wrapper: crearWrapper(queryClient) });

    let final: Awaited<ReturnType<typeof result.current.ejecutar>> | undefined;
    await act(async () => {
      final = await result.current.ejecutar([], undefined, "empresa-1");
    });

    expect(crearLeadsMasivoApiMock).not.toHaveBeenCalled();
    expect(final).toEqual({
      resumen: { solicitados: 0, creados: 0, duplicados: 0, fallidos: 0 },
      resultados: [],
    });
    expect(result.current.enviando).toBe(false);
  });

  it("invalida el listado real de leads solo al terminar todas las tandas", async () => {
    crearLeadsMasivoApiMock.mockResolvedValue({
      resumen: { solicitados: 1, creados: 1, duplicados: 0, fallidos: 0 },
      resultados: [{ fila: 1, estado: "creado", leadId: "lead-1" }],
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useCargaMasivaLeads(), { wrapper: crearWrapper(queryClient) });

    await act(async () => {
      await result.current.ejecutar(filasFake(1), undefined, "empresa-1");
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["leads"] });
  });

  it("deja enviando en false incluso si una tanda falla", async () => {
    crearLeadsMasivoApiMock.mockRejectedValue(new Error("network"));

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useCargaMasivaLeads(), { wrapper: crearWrapper(queryClient) });

    await act(async () => {
      await expect(result.current.ejecutar(filasFake(1), undefined, "empresa-1")).rejects.toThrow(
        "network",
      );
    });

    await waitFor(() => expect(result.current.enviando).toBe(false));
  });
});
