import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EtapaLead } from "@/tipos/lead";
import type { Oportunidad } from "@/tipos/oportunidad";

vi.mock("@/funcionalidades/oportunidades/detalle/useOportunidadDetalle", () => ({
  OPORTUNIDAD_DETALLE_QUERY_KEY: "oportunidad-detalle",
  useCambiarEtapaOportunidad: vi.fn(),
}));

const hook = await import("@/funcionalidades/oportunidades/detalle/useOportunidadDetalle");
const { OportunidadEtapaAcciones } = await import(
  "@/funcionalidades/oportunidades/detalle/OportunidadEtapaAcciones"
);

const useCambiarEtapaMock = vi.mocked(hook.useCambiarEtapaOportunidad);
const mutate = vi.fn();

function mockMutation(overrides: Record<string, unknown> = {}) {
  useCambiarEtapaMock.mockReturnValue({
    mutate,
    isPending: false,
    isError: false,
    error: null,
    reset: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof hook.useCambiarEtapaOportunidad>);
}

function oportunidadFake(etapa: EtapaLead): Oportunidad {
  return {
    id: "opp-1",
    leadId: "lead-1",
    empresaId: "emp-1",
    productoId: null,
    etapa,
    semaforo: null,
    puntuacion: null,
    asesorId: "asesor-1",
    vendedorId: null,
    montoVenta: null,
    observacionCierre: null,
    formaPago: null,
    slaInicioEn: null,
    cerradaEn: null,
    creadaEn: "2026-08-20T14:30:00.000Z",
    version: 1,
    lead: {
      id: "lead-1",
      etapa,
      origen: "NUEVO",
      redSocial: null,
      cliente: {
        id: "cli-1",
        nombre: "Roberto Salazar",
        telefonoOriginal: "0991234567",
        telefonoNormalizado: "+593991234567",
        telefonoValido: true,
      },
    },
    producto: null,
    asesor: { id: "asesor-1", nombre: "Marta Herrera", rol: "ASESOR" },
    vendedor: null,
  };
}

function renderPanel(etapa: EtapaLead) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <OportunidadEtapaAcciones oportunidad={oportunidadFake(etapa)} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockMutation();
});

describe("OportunidadEtapaAcciones", () => {
  it("desde NUEVO ofrece avanzar a Contactado", () => {
    renderPanel("NUEVO");
    expect(screen.getByRole("button", { name: "Avanzar a Contactado" })).toBeInTheDocument();
  });

  it("desde CONTACTADO ofrece avanzar a Cita", () => {
    renderPanel("CONTACTADO");
    expect(screen.getByRole("button", { name: "Avanzar a Cita" })).toBeInTheDocument();
  });

  it("no renderiza ningún botón desde CITA (sin paso intermedio siguiente)", () => {
    const { container } = renderPanel("CITA");
    expect(container).toBeEmptyDOMElement();
  });

  it("no renderiza nada en etapas terminales", () => {
    expect(renderPanel("VENTA").container).toBeEmptyDOMElement();
    expect(renderPanel("NO_VENTA").container).toBeEmptyDOMElement();
  });

  it("al hacer clic llama a la mutación con la etapa destino correcta", async () => {
    const user = userEvent.setup();
    renderPanel("NUEVO");
    await user.click(screen.getByRole("button", { name: "Avanzar a Contactado" }));
    expect(mutate).toHaveBeenCalledWith("CONTACTADO");
  });

  it("ante un rechazo (409) no cambia la etapa de forma optimista: sigue mostrando el mismo destino", async () => {
    mutate.mockImplementation((_etapa, options?: { onError?: (e: unknown) => void }) => {
      options?.onError?.(new Error("transicion_invalida"));
    });
    const user = userEvent.setup();
    renderPanel("CONTACTADO");
    await user.click(screen.getByRole("button", { name: "Avanzar a Cita" }));
    expect(mutate).toHaveBeenCalledWith("CITA");
    expect(screen.getByRole("button", { name: "Avanzar a Cita" })).toBeInTheDocument();
  });

  it("deshabilita el botón mientras la mutación está en curso", () => {
    mockMutation({ isPending: true });
    renderPanel("NUEVO");
    expect(screen.getByRole("button", { name: "Avanzando…" })).toBeDisabled();
  });
});
