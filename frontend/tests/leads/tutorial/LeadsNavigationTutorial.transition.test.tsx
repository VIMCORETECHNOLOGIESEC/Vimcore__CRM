import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Lead } from "@/tipos/lead";

type JoyridePropsSnapshot = {
  stepIndex: number;
  onEvent: (data: unknown) => void;
};

let latestJoyrideProps: JoyridePropsSnapshot | null = null;

vi.mock("react-joyride", async () => {
  const actual = await vi.importActual<typeof import("react-joyride")>("react-joyride");

  return {
    ...actual,
    Joyride: ({ stepIndex, onEvent }: JoyridePropsSnapshot) => {
      latestJoyrideProps = { stepIndex, onEvent };
      return <div data-testid="joyride-mock" data-step-index={stepIndex} />;
    },
  };
});

vi.mock("@/funcionalidades/autenticacion/authContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/layouts/PageHeaderContext", () => ({
  usePageHeader: vi.fn(),
}));

vi.mock("@/funcionalidades/leads/detalle/useLeadDetalle", () => ({
  useLeadDetalle: vi.fn(),
}));

vi.mock("@/funcionalidades/leads/detalle/AccionesResponsable", () => ({
  AccionesResponsable: () => <div>Acciones responsable</div>,
}));

vi.mock("@/funcionalidades/leads/detalle/LeadTimeline", () => ({
  LeadTimeline: () => <div>Timeline mock</div>,
}));

vi.mock("@/funcionalidades/leads/detalle/PanelCitas", () => ({
  PanelCitas: () => <div>Panel citas mock</div>,
}));

vi.mock("@/funcionalidades/leads/detalle/CierreVentaForm", () => ({
  CierreVentaForm: () => <div>Cierre venta mock</div>,
}));

vi.mock("@/funcionalidades/leads/detalle/CierreNoVentaForm", () => ({
  CierreNoVentaForm: () => <div>Cierre no venta mock</div>,
}));

const { ACTIONS, EVENTS } = await import("react-joyride");
const { useAuth } = await import("@/funcionalidades/autenticacion/authContext");
const { useLeadDetalle } = await import("@/funcionalidades/leads/detalle/useLeadDetalle");
const { LeadDetallePage } = await import("@/funcionalidades/leads/detalle/LeadDetallePage");
const {
  LeadsNavigationTutorialProvider,
} = await import("@/funcionalidades/leads/tutorial/LeadsNavigationTutorial");

const useAuthMock = vi.mocked(useAuth);
const useLeadDetalleMock = vi.mocked(useLeadDetalle);

function buildLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead-01",
    cliente: {
      id: "cliente-01",
      nombre: "Roberto Salazar",
      telefonoOriginal: "0991234567",
      telefonoNormalizado: "+593991234567",
      correoPrincipal: "roberto.salazar@mail.com",
      telefonoValido: false,
    },
    campania: { id: "camp-1", nombre: "Verano 2026" },
    origen: "NUEVO",
    redSocial: "FACEBOOK",
    etapa: "CONTACTADO",
    semaforo: "AMARILLO",
    puntuacion: 55,
    asesor: { id: "asesor-1", nombre: "Marta Herrera", rol: "ASESOR" },
    vendedor: null,
    slaInicioEn: new Date().toISOString(),
    ingresadoEn: "2026-01-05T10:30:00.000Z",
    cerradoEn: null,
    cuentaPublicitaria: { id: "cuenta-1", nombre: "Cuenta Principal" },
    camposDinamicos: { formulario: "Lead Ads" },
    ...overrides,
  };
}

function renderTutorialOnLeadDetail() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <MemoryRouter initialEntries={["/leads/lead-01"]}>
          <LeadsNavigationTutorialProvider>
            <Routes>
              <Route path="/leads/:id" element={<LeadDetallePage />} />
            </Routes>
          </LeadsNavigationTutorialProvider>
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  latestJoyrideProps = null;

  useAuthMock.mockReturnValue({
    user: { id: "u1", nombre: "Usuaria", correo: "u1@crm.test", rol: "ADMINISTRADOR" },
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    hasRole: () => true,
  });

  useLeadDetalleMock.mockReturnValue({
    data: buildLead(),
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  });
});

describe("LeadsNavigationTutorial workspace transition", () => {
  it("espera a que el panel de WhatsApp exista antes de avanzar del paso 8 al 9", async () => {
    renderTutorialOnLeadDetail();

    expect(screen.getByTestId("joyride-mock")).toHaveAttribute("data-step-index", "0");
    expect(screen.queryByLabelText("Chat de WhatsApp")).not.toBeInTheDocument();

    act(() => {
      latestJoyrideProps?.onEvent({
        type: EVENTS.STEP_AFTER,
        action: ACTIONS.NEXT,
        index: 7,
        status: "running",
      });
    });

    await waitFor(() => {
      expect(screen.getByLabelText("Chat de WhatsApp")).toBeInTheDocument();
      expect(document.querySelector('[data-tour="lead-whatsapp-chat"]')).not.toBeNull();
      expect(screen.getByTestId("joyride-mock")).toHaveAttribute("data-step-index", "8");
    });
  });
});
