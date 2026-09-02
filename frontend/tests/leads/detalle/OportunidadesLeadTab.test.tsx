import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Oportunidad } from "@/tipos/oportunidad";

vi.mock("@/funcionalidades/empresa-apariencia/useVistaEmpresa", () => ({
  useVistaEmpresa: vi.fn(),
}));

vi.mock("@/funcionalidades/oportunidades/useOportunidades", () => ({
  useOportunidades: vi.fn(),
}));

vi.mock("@/funcionalidades/oportunidades/NuevaOportunidadButton", () => ({
  NuevaOportunidadButton: ({ leadId }: { leadId: string }) => (
    <button type="button">Nueva oportunidad ({leadId})</button>
  ),
}));

const { useVistaEmpresa } = await import("@/funcionalidades/empresa-apariencia/useVistaEmpresa");
const { useOportunidades } = await import("@/funcionalidades/oportunidades/useOportunidades");
const { OportunidadesLeadTab } = await import("@/funcionalidades/leads/detalle/OportunidadesLeadTab");

const useVistaEmpresaMock = vi.mocked(useVistaEmpresa);
const useOportunidadesMock = vi.mocked(useOportunidades);

function buildOportunidad(overrides: Partial<Oportunidad> = {}): Oportunidad {
  return {
    id: "op-1",
    leadId: "lead-01",
    empresaId: "empresa-1",
    productoId: "prod-1",
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
    creadaEn: "2026-01-05T10:30:00.000Z",
    version: 1,
    lead: {
      id: "lead-01",
      etapa: "CONTACTADO",
      origen: "NUEVO",
      redSocial: "FACEBOOK",
      cliente: {
        id: "cliente-01",
        nombre: "Roberto Salazar",
        telefonoOriginal: "0991234567",
        telefonoNormalizado: "+593991234567",
        telefonoValido: true,
      },
    },
    producto: { id: "prod-1", empresaId: "empresa-1", nombre: "Producto A", activo: true, creadoEn: "2026-01-01T00:00:00.000Z" },
    asesor: { id: "asesor-1", nombre: "Marta Herrera", rol: "ASESOR" },
    vendedor: null,
    ...overrides,
  };
}

function renderTab(leadId = "lead-01") {
  return render(
    <MemoryRouter>
      <OportunidadesLeadTab leadId={leadId} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useVistaEmpresaMock.mockReturnValue({
    empresaVistaId: null,
    esVistaSoloLectura: false,
    entrarAEmpresa: vi.fn(),
    salirDeEmpresa: vi.fn(),
  });
});

describe("OportunidadesLeadTab", () => {
  it("muestra el botón de nueva oportunidad y la lista cuando hay datos", () => {
    useOportunidadesMock.mockReturnValue({
      data: { oportunidades: [buildOportunidad()], total: 1, pagina: 1, limite: 25 },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useOportunidades>);

    renderTab();

    expect(screen.getByText("Nueva oportunidad (lead-01)")).toBeInTheDocument();
    expect(screen.getByText("Producto A")).toBeInTheDocument();
    expect(screen.getByText("Contactado")).toBeInTheDocument();
    expect(screen.getByText("Marta Herrera")).toBeInTheDocument();
  });

  it("llama a useOportunidades con leadId, pagina y limite", () => {
    useOportunidadesMock.mockReturnValue({
      data: { oportunidades: [], total: 0, pagina: 1, limite: 25 },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useOportunidades>);

    renderTab();

    expect(useOportunidadesMock).toHaveBeenCalledWith(
      { leadId: "lead-01", pagina: 1, limite: 25 },
      { enabled: true },
    );
  });

  it("lead de ejemplo del tutorial: no consulta el backend y muestra el vacío real sin botón de alta", () => {
    useOportunidadesMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useOportunidades>);

    renderTab("tutorial-demo-lead");

    expect(useOportunidadesMock).toHaveBeenCalledWith(
      { leadId: "tutorial-demo-lead", pagina: 1, limite: 25 },
      { enabled: false },
    );
    expect(screen.getByText("Sin oportunidades")).toBeInTheDocument();
    expect(screen.queryByText(/Nueva oportunidad/)).not.toBeInTheDocument();
  });

  it("muestra un estado vacío cuando el lead no tiene oportunidades", () => {
    useOportunidadesMock.mockReturnValue({
      data: { oportunidades: [], total: 0, pagina: 1, limite: 25 },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useOportunidades>);

    renderTab();

    expect(screen.getByText("Sin oportunidades")).toBeInTheDocument();
  });

  it("muestra un esqueleto de carga mientras isLoading es true", () => {
    useOportunidadesMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useOportunidades>);

    renderTab();

    expect(screen.getByRole("status", { name: "Cargando" })).toBeInTheDocument();
  });

  it("muestra un mensaje de error accionable ante un fallo del listado", () => {
    const refetch = vi.fn();
    useOportunidadesMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("fallo"),
      refetch,
    } as unknown as ReturnType<typeof useOportunidades>);

    renderTab();

    expect(screen.getByText("No se pudo completar la operación")).toBeInTheDocument();
    screen.getByRole("button", { name: "Reintentar" }).click();
    expect(refetch).toHaveBeenCalled();
  });

  it("oculta el botón de nueva oportunidad en vista de solo lectura (holding-wide en «Ver en vivo»)", () => {
    useVistaEmpresaMock.mockReturnValue({
      empresaVistaId: "empresa-9",
      esVistaSoloLectura: true,
      entrarAEmpresa: vi.fn(),
      salirDeEmpresa: vi.fn(),
    });
    useOportunidadesMock.mockReturnValue({
      data: { oportunidades: [], total: 0, pagina: 1, limite: 25 },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useOportunidades>);

    renderTab();

    expect(screen.queryByText("Nueva oportunidad (lead-01)")).not.toBeInTheDocument();
  });
});
