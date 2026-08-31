import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/httpClient";
import type { Oportunidad } from "@/tipos/oportunidad";

vi.mock("@/funcionalidades/oportunidades/detalle/oportunidadDetalle.api");
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const api = await import("@/funcionalidades/oportunidades/detalle/oportunidadDetalle.api");
const { OportunidadCierrePanel } = await import(
  "@/funcionalidades/oportunidades/detalle/OportunidadCierrePanel"
);

const cerrarMock = vi.mocked(api.cerrarOportunidadApi);

function oportunidadFake(overrides: Partial<Oportunidad> = {}): Oportunidad {
  return {
    id: "opp-1",
    leadId: "lead-1",
    empresaId: "emp-1",
    productoId: null,
    etapa: "CONTACTADO",
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
      etapa: "CONTACTADO",
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
    ...overrides,
  };
}

function renderPanel(oportunidad: Oportunidad) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <OportunidadCierrePanel oportunidad={oportunidad} />
    </QueryClientProvider>,
  );
}

async function llenarYAbrirConfirmacion() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Venta" }));
  await user.type(screen.getByLabelText("Monto (USD)"), "1500");
  await user.click(screen.getByRole("combobox", { name: "Forma de pago" }));
  await user.click(await screen.findByRole("option", { name: "Contado" }));
  await user.click(screen.getByRole("button", { name: "Cerrar como Venta" }));
  return user;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("OportunidadCierrePanel", () => {
  it("al elegir Venta renderiza el formulario de cierre en venta", async () => {
    const user = userEvent.setup();
    renderPanel(oportunidadFake());
    await user.click(screen.getByRole("button", { name: "Venta" }));
    expect(screen.getByLabelText("Monto (USD)")).toBeInTheDocument();
  });

  it("al enviar el formulario válido abre la confirmación", async () => {
    renderPanel(oportunidadFake());
    await llenarYAbrirConfirmacion();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("al confirmar llama a la mutación con el payload de Venta", async () => {
    cerrarMock.mockResolvedValue(undefined);
    renderPanel(oportunidadFake());
    const user = await llenarYAbrirConfirmacion();
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Cerrar como Venta" }));

    expect(cerrarMock).toHaveBeenCalledWith("opp-1", {
      etapa: "VENTA",
      montoVenta: 1500,
      formaPago: "CONTADO",
    });
  });

  it("el botón de confirmar refleja isPending mientras la mutación está en curso", async () => {
    let resolverPendiente: (() => void) | undefined;
    cerrarMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolverPendiente = () => resolve(undefined);
        }),
    );
    renderPanel(oportunidadFake());
    const user = await llenarYAbrirConfirmacion();
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Cerrar como Venta" }));

    expect(await within(dialog).findByRole("button", { name: "Procesando…" })).toBeDisabled();

    resolverPendiente?.();
  });

  it("ante un 403 permiso_denegado muestra el mensaje inline y conserva el formulario", async () => {
    cerrarMock.mockRejectedValue(
      new ApiError("permiso_denegado", 403, "No tenés permiso para cerrar esta oportunidad."),
    );
    renderPanel(oportunidadFake());
    const user = await llenarYAbrirConfirmacion();
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Cerrar como Venta" }));

    expect(
      await screen.findByText("No tenés permiso para cerrar esta oportunidad."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Monto (USD)")).toHaveValue(1500);
  });

  it("cuando la oportunidad está en etapa terminal muestra el resumen de solo lectura", () => {
    renderPanel(
      oportunidadFake({
        etapa: "VENTA",
        cerradaEn: "2026-08-25T10:00:00.000Z",
        montoVenta: 4500,
        formaPago: "CONTADO",
      }),
    );
    expect(screen.getByText("Oportunidad cerrada")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Venta" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "No Venta" })).not.toBeInTheDocument();
  });
});
