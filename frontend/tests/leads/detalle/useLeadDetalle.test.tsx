import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

vi.mock("@/api/httpClient", () => ({
  httpClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const { httpClient } = await import("@/api/httpClient");
const { useLeadDetalle, useCitasLead } = await import(
  "@/funcionalidades/leads/detalle/useLeadDetalle"
);
const { TUTORIAL_MOCK_LEAD, TUTORIAL_MOCK_LEAD_ID } = await import(
  "@/funcionalidades/leads/tutorial/tutorialMockLead"
);

const getMock = vi.mocked(httpClient.get);

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  getMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useLeadDetalle — lead demo del tutorial", () => {
  it("devuelve TUTORIAL_MOCK_LEAD sin llamar a la API real para el id mock", async () => {
    const { result } = renderHook(() => useLeadDetalle(TUTORIAL_MOCK_LEAD_ID), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(TUTORIAL_MOCK_LEAD);
    expect(getMock).not.toHaveBeenCalled();
  });

  it("para un lead real sigue llamando a la API (fetchLeadDetalleApi -> httpClient.get)", async () => {
    getMock.mockResolvedValue({
      lead: {
        id: "lead-01",
        clienteId: "cliente-01",
        cliente: {
          id: "cliente-01",
          nombre: "Roberto",
          telefonoOriginal: "099",
          telefonoNormalizado: "+593099",
          telefonoValido: true,
        },
        origen: "NUEVO",
        redSocial: "INSTAGRAM",
        etapa: "NUEVO",
        semaforo: null,
        puntuacion: null,
        asesorId: null,
        asesor: null,
        vendedorId: null,
        vendedor: null,
        slaInicioEn: null,
        ingresadoEn: new Date().toISOString(),
        cerradoEn: null,
        montoVenta: null,
        productoServicio: null,
        formaPago: null,
        observacionCierre: null,
      },
    });

    const { result } = renderHook(() => useLeadDetalle("lead-01"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(getMock).toHaveBeenCalledWith("/leads/lead-01", { params: { empresaId: undefined } });
  });
});

describe("useCitasLead — lead demo del tutorial", () => {
  it("devuelve un arreglo vacío sin llamar a la API real para el id mock", async () => {
    const { result } = renderHook(() => useCitasLead(TUTORIAL_MOCK_LEAD_ID), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([]);
    expect(getMock).not.toHaveBeenCalled();
  });
});
