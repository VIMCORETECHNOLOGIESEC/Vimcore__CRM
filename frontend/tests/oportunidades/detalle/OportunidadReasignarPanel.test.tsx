import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/httpClient";
import type { Oportunidad } from "@/tipos/oportunidad";
import type { RolUsuario } from "@/tipos/usuario";

vi.mock("@/funcionalidades/oportunidades/detalle/oportunidadDetalle.api");
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock("@/funcionalidades/autenticacion/auth-context", () => ({ useAuth: vi.fn() }));
vi.mock("@/funcionalidades/leads/leads.api", () => ({
  getCatalogoResponsables: vi.fn(() =>
    Promise.resolve([
      { id: "asesor-2", nombre: "Julián Peña" },
      { id: "asesor-3", nombre: "Sofía Vintimilla" },
    ]),
  ),
}));

const api = await import("@/funcionalidades/oportunidades/detalle/oportunidadDetalle.api");
const leadsApi = await import("@/funcionalidades/leads/leads.api");
const { useAuth } = await import("@/funcionalidades/autenticacion/auth-context");
const { OportunidadReasignarPanel } = await import(
  "@/funcionalidades/oportunidades/detalle/OportunidadReasignarPanel"
);

const reasignarMock = vi.mocked(api.reasignarOportunidadApi);
const getCatalogoResponsablesMock = vi.mocked(leadsApi.getCatalogoResponsables);
const useAuthMock = vi.mocked(useAuth);

function mockearAuth(rol: RolUsuario) {
  useAuthMock.mockReturnValue({
    user: { id: "u1", nombre: "Usuaria de prueba", correo: "u1@crm.test", rol },
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    hasRole: (allowedRoles) =>
      !allowedRoles || allowedRoles.length === 0 || allowedRoles.includes(rol),
  } as unknown as ReturnType<typeof useAuth>);
}

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
      <OportunidadReasignarPanel oportunidad={oportunidad} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getCatalogoResponsablesMock.mockResolvedValue([
    { id: "asesor-2", nombre: "Julián Peña" },
    { id: "asesor-3", nombre: "Sofía Vintimilla" },
  ]);
});

describe("OportunidadReasignarPanel", () => {
  it("no se renderiza para ASESOR", () => {
    mockearAuth("ASESOR");
    const { container } = renderPanel(oportunidadFake());
    expect(container).toBeEmptyDOMElement();
  });

  it("no se renderiza para VENDEDOR", () => {
    mockearAuth("VENDEDOR");
    const { container } = renderPanel(oportunidadFake());
    expect(container).toBeEmptyDOMElement();
  });

  it("se renderiza para ADMINISTRADOR", async () => {
    mockearAuth("ADMINISTRADOR");
    renderPanel(oportunidadFake());
    expect(await screen.findByRole("combobox", { name: "Nuevo asesor" })).toBeInTheDocument();
  });

  it("se renderiza para SUPERVISOR", async () => {
    mockearAuth("SUPERVISOR");
    renderPanel(oportunidadFake());
    expect(await screen.findByRole("combobox", { name: "Nuevo asesor" })).toBeInTheDocument();
  });

  it("las opciones vienen del catálogo de asesores", async () => {
    mockearAuth("ADMINISTRADOR");
    const user = userEvent.setup();
    renderPanel(oportunidadFake());
    await user.click(await screen.findByRole("combobox", { name: "Nuevo asesor" }));
    expect(await screen.findByText("Julián Peña")).toBeInTheDocument();
    expect(screen.getByText("Sofía Vintimilla")).toBeInTheDocument();
  });

  it("elegir un asesor y confirmar llama a la mutación con el id elegido", async () => {
    mockearAuth("ADMINISTRADOR");
    reasignarMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPanel(oportunidadFake());

    await user.click(await screen.findByRole("combobox", { name: "Nuevo asesor" }));
    await user.click(await screen.findByText("Julián Peña"));
    await user.click(screen.getByRole("button", { name: "Reasignar" }));

    expect(reasignarMock).toHaveBeenCalledWith("opp-1", "asesor-2");
  });

  it("ante un 409 destinatario_invalido muestra el mensaje inline y conserva la selección", async () => {
    mockearAuth("ADMINISTRADOR");
    reasignarMock.mockRejectedValue(
      new ApiError("destinatario_invalido", 409, "El asesor elegido ya es el responsable actual."),
    );
    const user = userEvent.setup();
    renderPanel(oportunidadFake());

    await user.click(await screen.findByRole("combobox", { name: "Nuevo asesor" }));
    await user.click(await screen.findByText("Julián Peña"));
    await user.click(screen.getByRole("button", { name: "Reasignar" }));

    expect(
      await screen.findByText("El asesor elegido ya es el responsable actual."),
    ).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Nuevo asesor" })).toHaveTextContent("Julián Peña");
  });

  it("no se renderiza cuando la oportunidad está en etapa terminal", () => {
    mockearAuth("ADMINISTRADOR");
    const { container } = renderPanel(oportunidadFake({ etapa: "VENTA", cerradaEn: "2026-08-25T10:00:00.000Z" }));
    expect(container).toBeEmptyDOMElement();
  });
});
