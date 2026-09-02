import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";

vi.mock("@/funcionalidades/autenticacion/auth-context", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/funcionalidades/leads/leads.api", () => ({
  fetchLeadsApi: vi.fn(),
  assignLeadsMasivoApi: vi.fn(),
  fetchRedesSocialesCatalogoApi: vi.fn(),
  getCatalogoCampanias: vi.fn(() => [{ id: "camp-1", nombre: "Verano 2026" }]),
  getCatalogoResponsables: vi.fn(() => Promise.resolve([])),
}));

vi.mock("@/funcionalidades/leads/tutorial/LeadsNavigationTutorial", () => ({
  useLeadsNavigationTutorial: vi.fn(),
  dispatchTutorialReady: vi.fn(),
}));

const { useAuth } = await import("@/funcionalidades/autenticacion/auth-context");
const { fetchLeadsApi, fetchRedesSocialesCatalogoApi } = await import(
  "@/funcionalidades/leads/leads.api"
);
const { useLeadsNavigationTutorial } = await import(
  "@/funcionalidades/leads/tutorial/LeadsNavigationTutorial"
);
const { LeadsPage } = await import("@/funcionalidades/leads/LeadsPage");
const { TUTORIAL_MOCK_LEAD_ID } = await import("@/funcionalidades/leads/tutorial/tutorialMockLead");

const useAuthMock = vi.mocked(useAuth);
const fetchLeadsApiMock = vi.mocked(fetchLeadsApi);
const fetchRedesSocialesCatalogoApiMock = vi.mocked(fetchRedesSocialesCatalogoApi);
const useLeadsNavigationTutorialMock = vi.mocked(useLeadsNavigationTutorial);

function mockearAuth() {
  useAuthMock.mockReturnValue({
    user: { id: "u1", nombre: "Asesora", correo: "u1@crm.test", rol: "ASESOR" },
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    hasRole: () => true,
  } as unknown as ReturnType<typeof useAuth>);
}

function renderLeadsPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <MemoryRouter initialEntries={["/leads"]}>
          <LeadsPage />
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchLeadsApiMock.mockReset();
  fetchRedesSocialesCatalogoApiMock.mockReset();
  fetchRedesSocialesCatalogoApiMock.mockResolvedValue([]);
  mockearAuth();
  // Este archivo prueba el tour guiado (mockeado vía useLeadsNavigationTutorial),
  // no el modal de entrada (`TutorialEntryDialog`, ver
  // `tests/leads/tutorial/`) -- se pre-descarta acá para que no tape la UI.
  localStorage.setItem("crm.leads-navigation-tour.modal-dismissed.u1", "true");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LeadsPage — 'Ver tutorial' funciona sin depender de leads reales (regresión)", () => {
  it("un asesor SIN leads asignados puede iniciar el tour: arranca con el lead de ejemplo", async () => {
    fetchLeadsApiMock.mockResolvedValue({ datos: [], total: 0, pagina: 1, porPagina: 10 });
    const startTour = vi.fn();
    useLeadsNavigationTutorialMock.mockReturnValue({
      startTour,
      startTourIfNeeded: vi.fn(),
      tourActivo: false,
    });
    const user = userEvent.setup();

    renderLeadsPage();
    await screen.findByText("No hay leads que coincidan con estos filtros");

    await user.click(screen.getByRole("button", { name: /Ver tutorial/ }));

    expect(startTour).toHaveBeenCalledWith(TUTORIAL_MOCK_LEAD_ID);
  });
});

describe("LeadsPage — fila del lead de ejemplo mientras el tour está activo", () => {
  it("con tourActivo=true, la tabla muestra el lead de ejemplo con el badge 'Ejemplo', incluso sin leads reales", async () => {
    fetchLeadsApiMock.mockResolvedValue({ datos: [], total: 0, pagina: 1, porPagina: 10 });
    useLeadsNavigationTutorialMock.mockReturnValue({
      startTour: vi.fn(),
      startTourIfNeeded: vi.fn(),
      tourActivo: true,
    });

    renderLeadsPage();

    expect(await screen.findByText("Valeria Sosa")).toBeInTheDocument();
    expect(screen.getByText("Ejemplo")).toBeInTheDocument();
  });

  it("con tourActivo=false, el lead de ejemplo NO aparece en la tabla", async () => {
    fetchLeadsApiMock.mockResolvedValue({
      datos: [
        {
          id: "lead-01",
          cliente: {
            id: "cliente-01",
            nombre: "Roberto Salazar",
            telefonoOriginal: "0991234567",
            telefonoNormalizado: "+593991234567",
            correoPrincipal: "roberto.salazar@mail.com",
          },
          campania: { id: "camp-1", nombre: "Verano 2026" },
          origen: "NUEVO",
          redSocial: "INSTAGRAM",
          etapa: "NUEVO",
          semaforo: "VERDE",
          puntuacion: 80,
          asesor: null,
          vendedor: null,
          slaInicioEn: null,
          ingresadoEn: new Date().toISOString(),
          cerradoEn: null,
        },
      ],
      total: 1,
      pagina: 1,
      porPagina: 10,
    });
    useLeadsNavigationTutorialMock.mockReturnValue({
      startTour: vi.fn(),
      startTourIfNeeded: vi.fn(),
      tourActivo: false,
    });

    renderLeadsPage();

    await screen.findByText("Roberto Salazar");
    expect(screen.queryByText("Valeria Sosa")).not.toBeInTheDocument();
    expect(screen.queryByText("Ejemplo")).not.toBeInTheDocument();
  });
});
