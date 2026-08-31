import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
const { PanelCitas } = await import("@/funcionalidades/leads/detalle/PanelCitas");

const getMock = vi.mocked(httpClient.get);
const postMock = vi.mocked(httpClient.post);

function citaBackendFake(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "cita-01",
    leadId: "lead-01",
    usuarioId: "asesor-1",
    programadaPara: "2026-03-01T10:00:00.000Z",
    modalidad: "VIRTUAL",
    estado: "AGENDADA",
    notas: null,
    ...overrides,
  };
}

function renderPanelCitas() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <PanelCitas leadId="lead-01" usuarioId="asesor-1" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  getMock.mockReset();
  postMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * `PanelCitas` (F4) -- botón Cancelar. Design D-B1 / spec
 * `sdd/integracion-leads-f3-f4/spec` (Requirement "Cancelación de cita
 * separada del resultado", unidad B2). Antes el botón reusaba
 * `useMarkCitaResult` con `estado: "CANCELADA"` contra `/resultado`, que el
 * backend real rechaza con 400 (`marcarResultadoCitaBodySchema` solo admite
 * CUMPLIDA|NO_ASISTIO).
 */
describe("PanelCitas -- botón Cancelar", () => {
  it('llama a POST /citas/:citaId/cancelar sin body al presionar "Cancelar" (no /resultado)', async () => {
    getMock.mockResolvedValue({ citas: [citaBackendFake()] });
    postMock.mockResolvedValue({ cita: citaBackendFake({ estado: "CANCELADA" }) });

    renderPanelCitas();

    const botonCancelar = await screen.findByRole("button", { name: "Cancelar" });
    await userEvent.click(botonCancelar);

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith("/citas/cita-01/cancelar");
    });
  });

  /**
   * Escenario negativo explícito del spec: ninguna interacción de UI sobre
   * citas (cancelar, marcar cumplida, marcar no asistió) envía
   * `estado: "CANCELADA"` a `/citas/:id/resultado`.
   */
  it('ninguna interacción de citas envía estado "CANCELADA" a /citas/:id/resultado', async () => {
    getMock.mockResolvedValue({ citas: [citaBackendFake()] });
    postMock.mockResolvedValue({ cita: citaBackendFake({ estado: "CANCELADA" }) });

    renderPanelCitas();

    const botonCancelar = await screen.findByRole("button", { name: "Cancelar" });
    const botonCumplida = screen.getByRole("button", { name: "Marcar cumplida" });
    const botonNoAsistio = screen.getByRole("button", { name: "No asistió" });

    await userEvent.click(botonCancelar);
    await userEvent.click(botonCumplida);
    await userEvent.click(botonNoAsistio);

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledTimes(3);
    });

    const llamadasAResultadoConCancelada = postMock.mock.calls.filter(
      ([path, body]) =>
        path === "/citas/cita-01/resultado" &&
        typeof body === "object" &&
        body !== null &&
        (body as { estado?: unknown }).estado === "CANCELADA",
    );
    expect(llamadasAResultadoConCancelada).toHaveLength(0);

    expect(postMock).toHaveBeenCalledWith("/citas/cita-01/cancelar");
    expect(postMock).toHaveBeenCalledWith("/citas/cita-01/resultado", { estado: "CUMPLIDA" });
    expect(postMock).toHaveBeenCalledWith("/citas/cita-01/resultado", { estado: "NO_ASISTIO" });
  });
});
