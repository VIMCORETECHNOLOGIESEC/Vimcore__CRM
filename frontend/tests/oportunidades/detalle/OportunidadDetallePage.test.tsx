import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/httpClient";
import type { Oportunidad } from "@/tipos/oportunidad";
import type { RolUsuario } from "@/tipos/usuario";

vi.mock("@/layouts/PageHeaderContext", () => ({ usePageHeader: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock("@/funcionalidades/autenticacion/authContext", () => ({ useAuth: vi.fn() }));
vi.mock("@/funcionalidades/leads/leads.api", () => ({
  getCatalogoResponsables: vi.fn(() =>
    Promise.resolve([{ id: "asesor-2", nombre: "Julián Peña" }]),
  ),
}));
vi.mock("@/funcionalidades/oportunidades/detalle/useOportunidadDetalle", () => ({
  OPORTUNIDAD_DETALLE_QUERY_KEY: "oportunidad-detalle",
  useOportunidadDetalle: vi.fn(),
  useCambiarEtapaOportunidad: vi.fn(),
  useCerrarOportunidad: vi.fn(),
  useReasignarOportunidad: vi.fn(),
}));

const { useAuth } = await import("@/funcionalidades/autenticacion/authContext");
const hook = await import("@/funcionalidades/oportunidades/detalle/useOportunidadDetalle");
const { OportunidadDetallePage } = await import(
  "@/funcionalidades/oportunidades/detalle/OportunidadDetallePage"
);

const useAuthMock = vi.mocked(useAuth);
const useOportunidadDetalleMock = vi.mocked(hook.useOportunidadDetalle);
const useCambiarEtapaMock = vi.mocked(hook.useCambiarEtapaOportunidad);
const useCerrarMock = vi.mocked(hook.useCerrarOportunidad);
const useReasignarMock = vi.mocked(hook.useReasignarOportunidad);

function mutationStub() {
  return { mutate: vi.fn(), isPending: false, isError: false, error: null, reset: vi.fn() };
}

function mockearAuth(rol: RolUsuario = "ASESOR") {
  useAuthMock.mockReturnValue({
    user: { id: "asesor-1", nombre: "Marta Herrera", correo: "m@crm.test", rol },
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
    producto: {
      id: "prod-1",
      empresaId: "emp-1",
      nombre: "Plan Premium",
      activo: true,
      creadoEn: "2026-01-01T00:00:00.000Z",
    },
    asesor: { id: "asesor-1", nombre: "Marta Herrera", rol: "ASESOR" },
    vendedor: null,
    ...overrides,
  };
}

function mockQuery(overrides: Record<string, unknown> = {}) {
  useOportunidadDetalleMock.mockReturnValue({
    data: oportunidadFake(),
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof hook.useOportunidadDetalle>);
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/oportunidades/opp-1"]}>
        <Routes>
          <Route path="/oportunidades/:id" element={<OportunidadDetallePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockearAuth("ASESOR");
  useCambiarEtapaMock.mockReturnValue(mutationStub() as never);
  useCerrarMock.mockReturnValue(mutationStub() as never);
  useReasignarMock.mockReturnValue(mutationStub() as never);
  mockQuery();
});

describe("OportunidadDetallePage — estados", () => {
  it("muestra el esqueleto de carga", () => {
    mockQuery({ data: undefined, isLoading: true });
    renderPage();
    expect(screen.getByRole("status", { name: "Cargando" })).toBeInTheDocument();
  });

  it("muestra un mensaje de error accionable con botón de reintentar", () => {
    const refetch = vi.fn();
    mockQuery({
      data: undefined,
      isError: true,
      error: new ApiError("error_desconocido", 500, "No se pudo cargar la oportunidad."),
      refetch,
    });
    renderPage();
    expect(screen.getByText("No se pudo cargar la oportunidad.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });

  it("muestra un estado vacío cuando no hay oportunidad", () => {
    mockQuery({ data: undefined });
    renderPage();
    expect(screen.getByText("No se encontró la oportunidad solicitada.")).toBeInTheDocument();
  });
});

describe("OportunidadDetallePage — contenido", () => {
  it("renderiza el encabezado con cliente, producto, etapa y responsable", () => {
    renderPage();
    expect(screen.getByText("Roberto Salazar")).toBeInTheDocument();
    expect(screen.getByText("Plan Premium")).toBeInTheDocument();
    expect(screen.getByText("Contactado")).toBeInTheDocument();
    expect(screen.getByText("Marta Herrera")).toBeInTheDocument();
  });

  it("sigue renderizando el encabezado (solo lectura) cuando la oportunidad es terminal", () => {
    useOportunidadDetalleMock.mockReturnValue({
      data: oportunidadFake({
        etapa: "VENTA",
        cerradaEn: "2026-08-25T10:00:00.000Z",
        montoVenta: 4500,
        formaPago: "CONTADO",
      }),
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof hook.useOportunidadDetalle>);
    renderPage();
    expect(screen.getByText("Roberto Salazar")).toBeInTheDocument();
    expect(screen.getByText("Venta")).toBeInTheDocument();
  });
});
