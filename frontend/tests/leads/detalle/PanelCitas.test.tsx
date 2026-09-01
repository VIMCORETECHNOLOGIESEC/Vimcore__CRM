import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
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

/**
 * `PanelCitas` (F4) -- form "Reprogramar" dentro de `CitaItem`. Migrado de
 * `useState` + `citaRescheduleSchema.safeParse` manual a
 * `useForm` + `zodResolver(citaRescheduleSchema)` (AGENTS.md §4). Estos
 * casos cubren la validación real que motivó la migración.
 */
describe("PanelCitas -- form Reprogramar", () => {
  it('reprograma la cita con una fecha válida: llama a rescheduleCita.mutate (POST /citas/:citaId/reprogramar) con la fecha ISO', async () => {
    getMock.mockResolvedValue({ citas: [citaBackendFake()] });
    postMock.mockResolvedValue({ cita: citaBackendFake({ estado: "REPROGRAMADA" }) });

    renderPanelCitas();

    const botonReprogramar = await screen.findByRole("button", { name: "Reprogramar" });
    await userEvent.click(botonReprogramar);

    const fechaFutura = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Hay DOS forms con el mismo campo "Hora de la cita" en pantalla a la vez
    // (el de agendar, siempre visible, y el de reprogramar, revelado por el
    // botón de arriba) -- se acota la búsqueda al form de reprogramar
    // ubicándolo por su botón "Confirmar", único de ese form.
    const formReprogramar = screen.getByRole("button", { name: "Confirmar" }).closest("form");
    if (!formReprogramar) throw new Error("No se encontró el form de reprogramar");
    const dentroDelForm = within(formReprogramar);

    const campoHora = dentroDelForm.getByLabelText("Hora de la cita");
    await userEvent.clear(campoHora);
    await userEvent.type(campoHora, "15:30");

    // El campo puede arrancar con un valor por defecto ("30 de agosto de
    // 2026") en vez del placeholder "Elige una fecha" -- matcheamos
    // cualquiera de los dos, el único botón disparador del calendario dentro
    // de este form ya está acotado por `within`.
    const botonFecha = dentroDelForm.getByRole("button", { name: /elige una fecha|de \d{4}$/i });
    await userEvent.click(botonFecha);
    const diaBoton = await waitFor(() => {
      const elemento = document.querySelector(`[data-day="${fechaFutura.toLocaleDateString()}"]`);
      if (!elemento) throw new Error("Día de la agenda no encontrado en el calendario");
      return elemento as HTMLElement;
    });
    await userEvent.click(diaBoton);

    const botonConfirmar = dentroDelForm.getByRole("button", { name: "Confirmar" });
    await userEvent.click(botonConfirmar);

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith(
        "/citas/cita-01/reprogramar",
        expect.objectContaining({ programadaPara: expect.any(String) }),
      );
    });

    const llamadaReprogramar = postMock.mock.calls.find(([path]) => path === "/citas/cita-01/reprogramar");
    const { programadaPara } = llamadaReprogramar?.[1] as { programadaPara: string };
    expect(new Date(programadaPara).getTime()).toBeGreaterThan(Date.now());
  });

  it("no reprograma con fecha vacía: no llama a POST /citas/:citaId/reprogramar y muestra el error de validación", async () => {
    getMock.mockResolvedValue({ citas: [citaBackendFake()] });
    postMock.mockResolvedValue({ cita: citaBackendFake() });

    renderPanelCitas();

    const botonReprogramar = await screen.findByRole("button", { name: "Reprogramar" });
    await userEvent.click(botonReprogramar);

    const botonConfirmar = screen.getByRole("button", { name: "Confirmar" });
    await userEvent.click(botonConfirmar);

    expect(await screen.findByText("La fecha y hora son obligatorias")).toBeInTheDocument();
    expect(postMock).not.toHaveBeenCalledWith(
      "/citas/cita-01/reprogramar",
      expect.anything(),
    );
  });
});
