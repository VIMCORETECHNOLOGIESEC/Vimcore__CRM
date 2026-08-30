import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OportunidadesResponse } from "@/funcionalidades/oportunidades/oportunidades.api";
import type { Oportunidad } from "@/tipos/oportunidad";
import type { RolUsuario } from "@/tipos/usuario";

vi.mock("@/funcionalidades/oportunidades/oportunidades.api", () => ({
  fetchOportunidadesApi: vi.fn(),
  fetchProductosApi: vi.fn(() => Promise.resolve([])),
  crearProductoApi: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock("@/funcionalidades/autenticacion/authContext", () => ({ useAuth: vi.fn() }));
vi.mock("@/funcionalidades/leads/leads.api", () => ({
  getCatalogoResponsables: vi.fn(() =>
    Promise.resolve([{ id: "asesor-1", nombre: "Marta Herrera" }]),
  ),
}));

const { useAuth } = await import("@/funcionalidades/autenticacion/authContext");
const oportunidadesApi = await import("@/funcionalidades/oportunidades/oportunidades.api");
const { OportunidadesPage } = await import(
  "@/funcionalidades/oportunidades/OportunidadesPage"
);

const useAuthMock = vi.mocked(useAuth);
const fetchOportunidadesApiMock = vi.mocked(oportunidadesApi.fetchOportunidadesApi);

function mockearAuth(rol: RolUsuario) {
  useAuthMock.mockReturnValue({
    user: { id: "u1", nombre: "Usuaria de prueba", correo: "u1@crm.test", rol },
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    hasRole: (allowedRoles) =>
      !allowedRoles || allowedRoles.length === 0 || allowedRoles.includes(rol),
  });
}

function oportunidadFake(overrides: Partial<Oportunidad> = {}): Oportunidad {
  return {
    id: "op-1",
    leadId: "lead-1",
    empresaId: "emp-1",
    productoId: null,
    etapa: "NUEVO",
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
      etapa: "NUEVO",
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

function respuesta(
  oportunidades: Oportunidad[],
  overrides: Partial<Omit<OportunidadesResponse, "oportunidades">> = {},
): OportunidadesResponse {
  return {
    oportunidades,
    total: oportunidades.length,
    pagina: 1,
    limite: 25,
    ...overrides,
  };
}

function renderPage(initialEntries: string[] = ["/oportunidades"]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries}>
        <OportunidadesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchOportunidadesApiMock.mockReset();
  mockearAuth("ADMINISTRADOR");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("OportunidadesPage — estados", () => {
  it("muestra el esqueleto de carga mientras llega la respuesta", () => {
    let resolver: (value: OportunidadesResponse) => void = () => {};
    fetchOportunidadesApiMock.mockReturnValue(
      new Promise((resolve) => {
        resolver = resolve;
      }),
    );

    renderPage();

    expect(screen.getByRole("status", { name: "Cargando" })).toBeInTheDocument();
    resolver(respuesta([oportunidadFake()]));
  });

  it("muestra un estado vacío honesto cuando no hay oportunidades", async () => {
    fetchOportunidadesApiMock.mockResolvedValue(respuesta([]));
    renderPage();
    expect(
      await screen.findByText("No hay oportunidades que coincidan con estos filtros"),
    ).toBeInTheDocument();
  });

  it("muestra un mensaje de error accionable con botón de reintentar", async () => {
    fetchOportunidadesApiMock.mockRejectedValue(new Error("boom"));
    renderPage();
    expect(
      await screen.findByText(
        "Ocurrió un error inesperado. Intentá nuevamente en unos segundos.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });

  it("renderiza filas a partir de los datos", async () => {
    fetchOportunidadesApiMock.mockResolvedValue(respuesta([oportunidadFake()]));
    renderPage();
    expect(await screen.findByText("Roberto Salazar")).toBeInTheDocument();
  });
});

describe("OportunidadesPage — filtros y paginación", () => {
  it("cambiar la etapa filtrada reinicia la paginación a la página 1", async () => {
    fetchOportunidadesApiMock.mockResolvedValue(
      respuesta([oportunidadFake()], { total: 60, pagina: 1 }),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Roberto Salazar");

    await user.click(screen.getByRole("button", { name: "Página siguiente" }));
    await waitFor(() =>
      expect(fetchOportunidadesApiMock.mock.calls.at(-1)?.[0]?.pagina).toBe(2),
    );

    await user.click(screen.getByRole("button", { name: /Filtros/ }));
    await user.click(screen.getByRole("combobox", { name: "Etapa" }));
    await user.click(await screen.findByRole("option", { name: "Cita" }));

    await waitFor(() => {
      const ultima = fetchOportunidadesApiMock.mock.calls.at(-1)?.[0];
      expect(ultima?.etapa).toBe("CITA");
      expect(ultima?.pagina).toBe(1);
    });
  });

  it("los botones de paginación están deshabilitados en los límites", async () => {
    fetchOportunidadesApiMock.mockResolvedValue(
      respuesta([oportunidadFake()], { total: 10, pagina: 1 }),
    );
    renderPage();
    await screen.findByText("Roberto Salazar");

    expect(screen.getByRole("button", { name: "Primera página" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Página anterior" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Página siguiente" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Última página" })).toBeDisabled();
  });

  it("reenvía ?empresaId= de la URL como empresaId de la consulta", async () => {
    fetchOportunidadesApiMock.mockResolvedValue(respuesta([oportunidadFake()]));
    renderPage(["/oportunidades?empresaId=emp-9"]);

    await waitFor(() =>
      expect(fetchOportunidadesApiMock.mock.calls.at(-1)?.[0]?.empresaId).toBe("emp-9"),
    );
  });
});

describe("OportunidadesPage — catálogo de productos", () => {
  it("un rol distinto de ADMINISTRADOR nunca ve el trigger 'Gestionar productos'", async () => {
    mockearAuth("ASESOR");
    fetchOportunidadesApiMock.mockResolvedValue(respuesta([oportunidadFake()]));
    renderPage();
    await screen.findByText("Roberto Salazar");

    expect(screen.queryByRole("button", { name: "Gestionar productos" })).not.toBeInTheDocument();
  });
});
