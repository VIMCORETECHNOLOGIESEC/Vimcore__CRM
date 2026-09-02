import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/funcionalidades/autenticacion/auth-context", () => ({
  useAuth: vi.fn(),
}));
vi.mock("@/funcionalidades/empresa-apariencia/useVistaEmpresa", () => ({
  useVistaEmpresa: vi.fn(),
}));
vi.mock("@/funcionalidades/leads/leads.api", () => ({
  getCatalogoResponsables: vi.fn(() => Promise.resolve([])),
}));
vi.mock("@/funcionalidades/citas/useCitas", () => ({
  useCitas: vi.fn(),
  useClientesParaCita: vi.fn(),
  useScheduleCitaCalendario: vi.fn(),
  useRescheduleCitaCalendario: vi.fn(),
  useMarkCitaResultCalendario: vi.fn(),
  useCancelCitaCalendario: vi.fn(),
}));

const { useAuth } = await import("@/funcionalidades/autenticacion/auth-context");
const { useVistaEmpresa } = await import("@/funcionalidades/empresa-apariencia/useVistaEmpresa");
const citasHooks = await import("@/funcionalidades/citas/useCitas");
const { CalendarCitasPage } = await import("@/funcionalidades/citas/CalendarCitasPage");

const useAuthMock = vi.mocked(useAuth);
const useVistaEmpresaMock = vi.mocked(useVistaEmpresa);
const useCitasMock = vi.mocked(citasHooks.useCitas);
const useClientesParaCitaMock = vi.mocked(citasHooks.useClientesParaCita);
const useScheduleCitaCalendarioMock = vi.mocked(citasHooks.useScheduleCitaCalendario);

function usuarioFake(overrides: Record<string, unknown> = {}) {
  return {
    id: "u1",
    nombre: "Usuaria de prueba",
    correo: "u1@crm.test",
    rol: "ADMINISTRADOR",
    sessionScope: "company",
    empresaId: "empresa-1",
    empresaNombre: "Empresa Uno",
    empresaColorPrimario: null,
    empresaColorSecundario: null,
    empresaLogoUrl: null,
    ...overrides,
  };
}

function mutationStub() {
  return {
    mutate: vi.fn(),
    isPending: false,
    error: null,
  };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CalendarCitasPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function abrirDialogoCrearCita(user: ReturnType<typeof userEvent.setup>) {
  const botonAgendar = screen.getAllByRole("button", { name: "Agendar cita" })[0];
  if (!botonAgendar) throw new Error("No se encontró el botón para agendar cita.");
  await user.click(botonAgendar);
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthMock.mockReturnValue({
    user: usuarioFake(),
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    hasRole: vi.fn(),
  } as never);
  useVistaEmpresaMock.mockReturnValue({ empresaVistaId: null } as never);
  useCitasMock.mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as never);
  useClientesParaCitaMock.mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
    error: null,
  } as never);
  useScheduleCitaCalendarioMock.mockReturnValue(mutationStub() as never);
  vi.mocked(citasHooks.useRescheduleCitaCalendario).mockReturnValue(mutationStub() as never);
  vi.mocked(citasHooks.useMarkCitaResultCalendario).mockReturnValue(mutationStub() as never);
  vi.mocked(citasHooks.useCancelCitaCalendario).mockReturnValue(mutationStub() as never);
});

describe("CalendarCitasPage", () => {
  it("muestra el calendario vacío cuando GET /citas responde sin citas", () => {
    renderPage();

    expect(screen.getByText("No hay citas en este rango.")).toBeInTheDocument();
    expect(screen.getByText("Lun")).toBeInTheDocument();
    expect(screen.queryByText("No se pudo completar la operación")).not.toBeInTheDocument();
    expect(screen.queryByText("Ocurrió un error inesperado. Intenta nuevamente en unos segundos.")).not.toBeInTheDocument();
  });

  it.each(["ADMINISTRADOR", "SUPERVISOR"] as const)(
    "%s busca clientes con id_empresa sin id_asesor",
    async (rol) => {
      const user = userEvent.setup();
      useAuthMock.mockReturnValue({
        user: usuarioFake({ rol }),
        isAuthenticated: true,
        isLoading: false,
        login: vi.fn(),
        logout: vi.fn(),
        hasRole: vi.fn(),
      } as never);

      renderPage();
      await abrirDialogoCrearCita(user);

      const params = useClientesParaCitaMock.mock.calls.find(([value]) => value !== null)?.[0];
      expect(params).toEqual({ empresaId: "empresa-1" });
    },
  );

  it("ASESOR busca clientes con id_empresa e id_asesor", async () => {
    const user = userEvent.setup();
    useAuthMock.mockReturnValue({
      user: usuarioFake({ id: "asesor-1", rol: "ASESOR" }),
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: vi.fn(),
    } as never);

    renderPage();
    await abrirDialogoCrearCita(user);

    const params = useClientesParaCitaMock.mock.calls.find(([value]) => value !== null)?.[0];
    expect(params).toEqual({ empresaId: "empresa-1", asesorId: "asesor-1" });
  });

  it("usa empresaVistaId como id_empresa en vista holding", async () => {
    const user = userEvent.setup();
    useAuthMock.mockReturnValue({
      user: usuarioFake({ sessionScope: "holding", empresaId: null }),
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: vi.fn(),
    } as never);
    useVistaEmpresaMock.mockReturnValue({ empresaVistaId: "empresa-vista-1" } as never);

    renderPage();
    await abrirDialogoCrearCita(user);

    const params = useClientesParaCitaMock.mock.calls.find(([value]) => value !== null)?.[0];
    expect(params).toEqual({ empresaId: "empresa-vista-1" });
  });

  it("muestra estado vacío en la búsqueda de clientes sin error genérico", async () => {
    const user = userEvent.setup();

    renderPage();
    await abrirDialogoCrearCita(user);
    await user.click(screen.getByRole("combobox", { name: "Seleccionar cliente existente" }));

    expect(screen.getByText("No hay clientes que coincidan.")).toBeInTheDocument();
    expect(screen.queryByText("Ocurrió un error inesperado. Intenta nuevamente en unos segundos.")).not.toBeInTheDocument();
  });

  it("agenda usando solo el leadId confirmado por la búsqueda de clientes", async () => {
    const user = userEvent.setup();
    const mutate = vi.fn();
    useClientesParaCitaMock.mockReturnValue({
      data: [
        {
          leadId: "lead-confirmado",
          cliente: {
            id: "cliente-1",
            nombre: "Cliente Confirmado",
            telefonoNormalizado: "+593991234567",
            telefonoOriginal: null,
          },
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    useScheduleCitaCalendarioMock.mockReturnValue({ mutate, isPending: false, error: null } as never);

    renderPage();
    await abrirDialogoCrearCita(user);
    await user.click(screen.getByRole("combobox", { name: "Seleccionar cliente existente" }));
    await user.click(screen.getByText("Cliente Confirmado"));
    await user.clear(screen.getByLabelText("Inicio"));
    await user.type(screen.getByLabelText("Inicio"), "2027-03-01T10:00");
    await user.clear(screen.getByLabelText("Finaliza"));
    await user.type(screen.getByLabelText("Finaliza"), "2027-03-01T11:00");
    await user.click(screen.getByRole("button", { name: "Agendar" }));

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: "lead-confirmado",
      }),
      expect.any(Object),
    );
    expect(mutate.mock.calls[0]?.[0].leadId).not.toBe("cliente-1");
  });
});
