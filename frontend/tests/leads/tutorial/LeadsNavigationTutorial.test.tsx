import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

type JoyrideOptionsSnapshot = { blockTargetInteraction?: boolean };
type JoyridePropsSnapshot = {
  options: JoyrideOptionsSnapshot;
  onEvent: (data: unknown) => void;
};

let latestJoyrideProps: JoyridePropsSnapshot | null = null;

vi.mock("react-joyride", async () => {
  const actual = await vi.importActual<typeof import("react-joyride")>("react-joyride");

  return {
    ...actual,
    Joyride: ({ options, onEvent }: JoyridePropsSnapshot) => {
      latestJoyrideProps = { options, onEvent };
      return <div data-testid="joyride-mock" />;
    },
  };
});

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/funcionalidades/autenticacion/auth-context", () => ({
  useAuth: vi.fn(),
}));

const { toast } = await import("sonner");
const { ACTIONS, EVENTS, STATUS } = await import("react-joyride");
const { useAuth } = await import("@/funcionalidades/autenticacion/auth-context");
const {
  LEADS_NAVIGATION_TOUR_STEPS,
  LeadsNavigationTutorialProvider,
} = await import("@/funcionalidades/leads/tutorial/LeadsNavigationTutorial");

const useAuthMock = vi.mocked(useAuth);
const toastSuccessMock = vi.mocked(toast.success);

beforeEach(() => {
  latestJoyrideProps = null;
  toastSuccessMock.mockClear();
  sessionStorage.clear();
  useAuthMock.mockReturnValue({
    user: { id: "u1", nombre: "Usuaria", correo: "u1@crm.test", rol: "ADMINISTRADOR" },
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    hasRole: () => true,
  });
});

function renderProvider() {
  return render(
    <MemoryRouter initialEntries={["/leads/lead-01"]}>
      <LeadsNavigationTutorialProvider>
        <Routes>
          <Route path="/leads" element={<div data-testid="leads-list-stub">Lista de leads</div>} />
          <Route path="/leads/:id" element={<div>Detalle mock</div>} />
        </Routes>
      </LeadsNavigationTutorialProvider>
    </MemoryRouter>,
  );
}

describe("LeadsNavigationTutorial", () => {
  it("incluye el paso del panel de WhatsApp antes de las pestañas y acciones finales", () => {
    const targets = LEADS_NAVIGATION_TOUR_STEPS.map((step) => step.target);

    expect(targets).toEqual([
      '[data-tour="leads-search"]',
      '[data-tour="leads-filters"]',
      '[data-tour="leads-table-columns"]',
      '[data-tour="leads-table-row"]',
      '[data-tour="lead-header"]',
      '[data-tour="lead-contact-origin-cards"]',
      '[data-tour="lead-summary"]',
      '[data-tour="lead-whatsapp"]',
      '[data-tour="lead-whatsapp-chat"]',
      '[data-tour="lead-workspace-tabs"]',
      '[data-tour="lead-workspace-progreso"]',
      '[data-tour="lead-workspace-cita"]',
      '[data-tour="lead-workspace-cierre"]',
      '[data-tour="lead-workspace-oportunidad"]',
    ]);
  });

  it("explica las columnas variables de la tabla sin confundir roles", () => {
    const step = LEADS_NAVIGATION_TOUR_STEPS.find(
      (candidate) => candidate.target === '[data-tour="leads-table-columns"]',
    );

    expect(step).toBeDefined();
    render(<>{step?.content}</>);

    expect(screen.getByText(/Cliente abre el detalle/i)).toBeInTheDocument();
    expect(screen.getByText(/Estado de SLA/i)).toBeInTheDocument();
    expect(screen.getByText(/Si tu rol lo permite también vas a ver la casilla de selección y la columna Responsable/i)).toBeInTheDocument();
  });
});

/**
 * Bug real: `options.blockTargetInteraction` de Joyride nunca se seteaba
 * (default `false`), así que el elemento resaltado por el spotlight quedaba
 * 100% clickeable de verdad -- el overlay solo bloqueaba el resto de la
 * pantalla. Eso permitía clics reales fuera de `handleTourEvent` que
 * desincronizaban el tour del estado real de la página.
 */
describe("LeadsNavigationTutorial -- bloqueo de clics reales bajo el spotlight", () => {
  it("pasa blockTargetInteraction: true a Joyride", () => {
    renderProvider();

    expect(latestJoyrideProps?.options.blockTargetInteraction).toBe(true);
  });
});

/**
 * Bug real: `finishTour()` solo apagaba el tour y marcaba `localStorage`,
 * dejando al usuario en la última pantalla del tour sin ninguna
 * confirmación ni retorno a una vista conocida.
 */
describe("LeadsNavigationTutorial -- finishTour", () => {
  it("al finalizar el último paso (STATUS.FINISHED), navega a /leads y muestra un toast de confirmación", () => {
    renderProvider();

    act(() => {
      latestJoyrideProps?.onEvent({
        type: EVENTS.TOUR_END,
        action: ACTIONS.NEXT,
        index: 13,
        status: STATUS.FINISHED,
      });
    });

    expect(screen.getByTestId("leads-list-stub")).toBeInTheDocument();
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "Tutorial finalizado",
      expect.objectContaining({
        description:
          "Puedes volver a verlo cuando quieras desde el botón \"Ver tutorial\", junto al título de Leads.",
      }),
    );
    // Bug real reportado: sin esto, el modal de entrada (`useTutorialEntryModal.ts`)
    // reaparecía en el acto al volver a /leads, dentro de la MISMA sesión.
    expect(sessionStorage.getItem("crm.leads-navigation-tour.session-finished")).toBe("true");
  });

  it("al saltar el tutorial (STATUS.SKIPPED), también navega a /leads y muestra el mismo toast", () => {
    renderProvider();

    act(() => {
      latestJoyrideProps?.onEvent({
        type: EVENTS.TOUR_END,
        action: ACTIONS.CLOSE,
        index: 3,
        status: STATUS.SKIPPED,
      });
    });

    expect(screen.getByTestId("leads-list-stub")).toBeInTheDocument();
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "Tutorial finalizado",
      expect.objectContaining({
        description:
          "Puedes volver a verlo cuando quieras desde el botón \"Ver tutorial\", junto al título de Leads.",
      }),
    );
    expect(sessionStorage.getItem("crm.leads-navigation-tour.session-finished")).toBe("true");
  });
});
