import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Lead } from "@/tipos/lead";
import type { RolUsuario } from "@/tipos/usuario";

vi.mock("@/funcionalidades/autenticacion/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/funcionalidades/leads/leads.api", () => ({
  fetchLeadsApi: vi.fn(),
  assignLeadsMasivoApi: vi.fn(),
  getCatalogoCampanias: vi.fn(() => [{ id: "camp-1", nombre: "Verano 2026" }]),
  getCatalogoResponsables: vi.fn(() => [
    { id: "asesor-1", nombre: "Marta Herrera" },
    { id: "vendedor-1", nombre: "Sofía Vintimilla" },
  ]),
}));

const { useAuth } = await import("@/funcionalidades/autenticacion/AuthContext");
const { fetchLeadsApi, assignLeadsMasivoApi } = await import("@/funcionalidades/leads/leads.api");
const { LeadsPage } = await import("@/funcionalidades/leads/LeadsPage");

const useAuthMock = vi.mocked(useAuth);
const fetchLeadsApiMock = vi.mocked(fetchLeadsApi);
const assignLeadsMasivoApiMock = vi.mocked(assignLeadsMasivoApi);

function mockearAuth(rol: RolUsuario) {
  useAuthMock.mockReturnValue({
    user: { id: "u1", nombre: "Usuaria de prueba", correo: "u1@crm.test", rol },
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    hasRole: (allowedRoles) => !allowedRoles || allowedRoles.length === 0 || allowedRoles.includes(rol),
  });
}

function leadFake(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead-01",
    cliente: {
      id: "cliente-01",
      nombre: "Roberto Salazar",
      telefonoOriginal: "0991234567",
      telefonoNormalizado: "+593991234567",
      correoPrincipal: "roberto.salazar@mail.com",
    },
    campania: { id: "camp-1", nombre: "Verano 2026" },
    origen: "REINGRESO",
    redSocial: "INSTAGRAM",
    etapa: "CONTACTADO",
    semaforo: "ROJO",
    puntuacion: 32,
    asesor: { id: "asesor-1", nombre: "Marta Herrera", rol: "ASESOR" },
    vendedor: null,
    slaInicioEn: new Date().toISOString(),
    ingresadoEn: new Date().toISOString(),
    cerradoEn: null,
    ...overrides,
  };
}

function renderLeadsPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        {/* MemoryRouter: LeadsTable enlaza el nombre del cliente a /leads/:id (F4). */}
        <MemoryRouter>
          <LeadsPage />
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchLeadsApiMock.mockReset();
  assignLeadsMasivoApiMock.mockReset();
  assignLeadsMasivoApiMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LeadsPage — estados de carga, vacío y error", () => {
  it("muestra un esqueleto de carga mientras llega la respuesta", async () => {
    mockearAuth("ADMINISTRADOR");
    let resolver: (value: Awaited<ReturnType<typeof fetchLeadsApi>>) => void = () => {};
    fetchLeadsApiMock.mockReturnValue(
      new Promise((resolve) => {
        resolver = resolve;
      }),
    );

    renderLeadsPage();

    expect(screen.getByRole("status", { name: "Cargando" })).toBeInTheDocument();

    resolver({ datos: [leadFake()], total: 1, pagina: 1, porPagina: 10 });
    await waitFor(() =>
      expect(screen.queryByRole("status", { name: "Cargando" })).not.toBeInTheDocument(),
    );
  });

  it("muestra un estado vacío honesto cuando no hay leads que coincidan", async () => {
    mockearAuth("ADMINISTRADOR");
    fetchLeadsApiMock.mockResolvedValue({ datos: [], total: 0, pagina: 1, porPagina: 10 });

    renderLeadsPage();

    expect(
      await screen.findByText("No hay leads que coincidan con estos filtros"),
    ).toBeInTheDocument();
  });

  it("muestra un mensaje de error accionable (nunca un código HTTP) con botón de reintentar", async () => {
    mockearAuth("ADMINISTRADOR");
    fetchLeadsApiMock.mockRejectedValue(new Error("boom"));

    renderLeadsPage();

    expect(await screen.findByText("Ocurrió un error inesperado. Intentá nuevamente en unos segundos.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });
});

describe("LeadsPage — tabla y vista por rol", () => {
  it("para administrador: muestra columna de responsable y casillas de selección masiva", async () => {
    mockearAuth("ADMINISTRADOR");
    fetchLeadsApiMock.mockResolvedValue({ datos: [leadFake()], total: 1, pagina: 1, porPagina: 10 });

    renderLeadsPage();

    expect(await screen.findByText("Roberto Salazar")).toBeInTheDocument();
    expect(screen.getByText("Reingreso")).toBeInTheDocument();
    expect(screen.getByText("Rojo · Lead frío")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Responsable" })).toBeInTheDocument();
    expect(screen.getByText("Marta Herrera")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Seleccionar a Roberto Salazar" }),
    ).toBeInTheDocument();
  });

  it("para asesor: oculta la columna de responsable y no ofrece selección masiva", async () => {
    mockearAuth("ASESOR");
    fetchLeadsApiMock.mockResolvedValue({ datos: [leadFake()], total: 1, pagina: 1, porPagina: 10 });

    renderLeadsPage();

    expect(await screen.findByText("Roberto Salazar")).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Responsable" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: "Seleccionar a Roberto Salazar" }),
    ).not.toBeInTheDocument();
  });
});

describe("LeadsPage — filtros combinables y búsqueda", () => {
  it("la búsqueda por nombre/teléfono/correo dispara una nueva consulta con el término", async () => {
    mockearAuth("ADMINISTRADOR");
    fetchLeadsApiMock.mockResolvedValue({ datos: [leadFake()], total: 1, pagina: 1, porPagina: 10 });
    const user = userEvent.setup();

    renderLeadsPage();
    await screen.findByText("Roberto Salazar");

    await user.type(screen.getByLabelText("Buscar leads"), "roberto");

    await waitFor(() => {
      const ultimaLlamada = fetchLeadsApiMock.mock.calls.at(-1)?.[0];
      expect(ultimaLlamada?.busqueda).toBe("roberto");
    });
  });

  it("cambiar la etapa filtrada reinicia la paginación a la página 1", async () => {
    mockearAuth("ADMINISTRADOR");
    fetchLeadsApiMock.mockResolvedValue({ datos: [leadFake()], total: 1, pagina: 1, porPagina: 10 });
    const user = userEvent.setup();

    renderLeadsPage();
    await screen.findByText("Roberto Salazar");

    await user.click(screen.getByRole("combobox", { name: "Etapa" }));
    await user.click(await screen.findByRole("option", { name: "Venta" }));

    await waitFor(() => {
      const ultimaLlamada = fetchLeadsApiMock.mock.calls.at(-1)?.[0];
      expect(ultimaLlamada?.etapa).toBe("VENTA");
      expect(ultimaLlamada?.pagina).toBe(1);
    });
  });
});

describe("LeadsPage — asignación masiva (supervisor/administrador)", () => {
  it("selecciona leads, elige responsable y dispara la asignación masiva", async () => {
    mockearAuth("SUPERVISOR");
    fetchLeadsApiMock.mockResolvedValue({ datos: [leadFake()], total: 1, pagina: 1, porPagina: 10 });
    const user = userEvent.setup();

    renderLeadsPage();
    await screen.findByText("Roberto Salazar");

    await user.click(screen.getByRole("checkbox", { name: "Seleccionar a Roberto Salazar" }));
    expect(screen.getByText("1 lead seleccionado")).toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: "Nuevo responsable" }));
    await user.click(await screen.findByRole("option", { name: "Sofía Vintimilla" }));
    await user.click(screen.getByRole("button", { name: "Asignar" }));

    await waitFor(() => {
      expect(assignLeadsMasivoApiMock).toHaveBeenCalledWith(["lead-01"], "vendedor-1");
    });
  });
});
