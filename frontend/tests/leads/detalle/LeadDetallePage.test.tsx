import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Lead } from "@/tipos/lead";

vi.mock("@/funcionalidades/autenticacion/auth-context", () => ({
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

vi.mock("@/funcionalidades/leads/detalle/OportunidadesLeadTab", () => ({
  OportunidadesLeadTab: () => <div>Oportunidades lead tab mock</div>,
}));

vi.mock("@/funcionalidades/whatsapp/useConversaciones", () => ({
  useConversaciones: vi.fn(),
}));

vi.mock("@/funcionalidades/whatsapp/useWhatsApp", () => ({
  useWhatsAppEstadoActual: vi.fn(),
}));

vi.mock("@/funcionalidades/whatsapp/ConversacionAbierta", () => ({
  ConversacionAbierta: ({ conversacionId }: { conversacionId: string }) => (
    <div>ConversacionAbierta mock — {conversacionId}</div>
  ),
}));

vi.mock("@/funcionalidades/whatsapp/WhatsAppSinConexion", () => ({
  WhatsAppSinConexion: ({ puedeIrABridges }: { puedeIrABridges: boolean }) => (
    <div>WhatsAppSinConexion mock — puedeIrABridges:{String(puedeIrABridges)}</div>
  ),
}));

const { useAuth } = await import("@/funcionalidades/autenticacion/auth-context");
const { useLeadDetalle } = await import("@/funcionalidades/leads/detalle/useLeadDetalle");
const { useConversaciones } = await import("@/funcionalidades/whatsapp/useConversaciones");
const { useWhatsAppEstadoActual } = await import("@/funcionalidades/whatsapp/useWhatsApp");
const { LeadDetallePage } = await import("@/funcionalidades/leads/detalle/LeadDetallePage");

const useAuthMock = vi.mocked(useAuth);
const useLeadDetalleMock = vi.mocked(useLeadDetalle);
const useConversacionesMock = vi.mocked(useConversaciones);
const useWhatsAppEstadoActualMock = vi.mocked(useWhatsAppEstadoActual);

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

function renderPage(rutaInicial = "/leads/lead-01") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <MemoryRouter initialEntries={[rutaInicial]}>
          <Routes>
            <Route path="/leads/:id" element={<LeadDetallePage />} />
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useAuthMock.mockReturnValue({
    user: {
      id: "u1",
      nombre: "Usuaria",
      correo: "u1@crm.test",
      rol: "ADMINISTRADOR",
      sessionScope: "company",
    },
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

  useConversacionesMock.mockReturnValue({
    data: { conversaciones: [], total: 0 },
    isLoading: false,
  } as unknown as ReturnType<typeof useConversaciones>);

  useWhatsAppEstadoActualMock.mockReturnValue({
    data: {
      id: "conexion-1",
      empresaId: "empresa-1",
      numeroTelefonoId: "numero-1",
      numeroDisplay: "+593 99 000 0000",
      wabaId: "waba-1",
      estado: "ACTIVA",
      creadoEn: "2026-01-01T00:00:00.000Z",
    },
    isLoading: false,
  } as unknown as ReturnType<typeof useWhatsAppEstadoActual>);
});

describe("LeadDetallePage — useVistaEmpresa().esVistaSoloLectura", () => {
  it("con sesión company, muestra AccionesResponsable con normalidad", async () => {
    renderPage();
    expect(await screen.findByText("Acciones responsable")).toBeInTheDocument();
  });

  it("holding-wide en «Ver en vivo» (?empresaId= con sessionScope holding): oculta AccionesResponsable", async () => {
    useAuthMock.mockReturnValue({
      user: {
        id: "u1",
        nombre: "Usuaria",
        correo: "u1@crm.test",
        rol: "ADMINISTRADOR",
        sessionScope: "holding",
      },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: () => true,
    });

    renderPage("/leads/lead-01?empresaId=empresa-9");

    await screen.findByText("Roberto Salazar");
    expect(screen.queryByText("Acciones responsable")).not.toBeInTheDocument();
  });
});

describe("LeadDetallePage tutorial anchors", () => {
  beforeEach(() => {
    useLeadDetalleMock.mockReturnValue({
      data: buildLead({ redSocial: "WHATSAPP" }),
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it("renderiza anclas reales para encabezado, tarjetas de detalle y panel de WhatsApp", async () => {
    renderPage();

    expect(document.querySelector('[data-tour="lead-header"]')).not.toBeNull();
    expect(document.querySelector('[data-tour="lead-contact-origin-cards"]')).not.toBeNull();
    expect(document.querySelector('[data-tour="lead-contact-card"]')).not.toBeNull();
    expect(document.querySelector('[data-tour="lead-origin-card"]')).not.toBeNull();

    window.dispatchEvent(new CustomEvent("leads-navigation-tour", { detail: { action: "open-workspace" } }));

    await waitFor(() => {
      expect(screen.getByLabelText("Chat de WhatsApp")).toBeInTheDocument();
      expect(document.querySelector('[data-tour="lead-whatsapp-chat"]')).not.toBeNull();
    });
  });

  it("cierra el panel de WhatsApp al recibir el evento close-workspace del tutorial", async () => {
    renderPage();

    window.dispatchEvent(new CustomEvent("leads-navigation-tour", { detail: { action: "open-workspace" } }));

    await waitFor(() => {
      expect(screen.getByLabelText("Chat de WhatsApp")).toBeInTheDocument();
    });

    window.dispatchEvent(new CustomEvent("leads-navigation-tour", { detail: { action: "close-workspace" } }));

    await waitFor(() => {
      expect(screen.queryByLabelText("Chat de WhatsApp")).not.toBeInTheDocument();
      expect(document.querySelector('[data-tour="lead-whatsapp"]')).not.toBeNull();
    });
  });
});

describe("LeadDetallePage — chat de WhatsApp", () => {
  it("lead WHATSAPP con conversación existente: resuelve por clienteId y muestra ConversacionAbierta", async () => {
    useLeadDetalleMock.mockReturnValue({
      data: buildLead({ redSocial: "WHATSAPP" }),
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    useConversacionesMock.mockReturnValue({
      data: {
        conversaciones: [
          {
            id: "conv-9",
            clienteId: "cliente-01",
            clienteNombre: "Roberto Salazar",
            clienteTelefono: "+593991234567",
            asesorId: "u1",
            asesorNombre: "Marta Herrera",
            ultimoMensajeEn: "2026-08-30T10:00:00.000Z",
            creadaEn: "2026-08-29T09:00:00.000Z",
          },
        ],
        total: 1,
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useConversaciones>);

    renderPage();

    window.dispatchEvent(new CustomEvent("leads-navigation-tour", { detail: { action: "open-workspace" } }));

    expect(await screen.findByText("ConversacionAbierta mock — conv-9")).toBeInTheDocument();
    expect(useConversacionesMock).toHaveBeenCalledWith({
      clienteId: "cliente-01",
      pagina: 1,
      limite: 10,
    });
  });

  it("lead WHATSAPP sin conversación todavía: muestra estado vacío", async () => {
    useLeadDetalleMock.mockReturnValue({
      data: buildLead({ redSocial: "WHATSAPP" }),
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    useConversacionesMock.mockReturnValue({
      data: { conversaciones: [], total: 0 },
      isLoading: false,
    } as unknown as ReturnType<typeof useConversaciones>);

    renderPage();

    window.dispatchEvent(new CustomEvent("leads-navigation-tour", { detail: { action: "open-workspace" } }));

    expect(await screen.findByText("Todavía no hay conversación")).toBeInTheDocument();
    expect(
      screen.getByText("Este cliente todavía no escribió por WhatsApp."),
    ).toBeInTheDocument();
  });

  it("lead de otro origen (FACEBOOK): igual muestra el botón flotante y el panel de chat (no depende del origen del lead)", async () => {
    useLeadDetalleMock.mockReturnValue({
      data: buildLead({ redSocial: "FACEBOOK" }),
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    renderPage();
    await screen.findByText("Roberto Salazar");

    expect(screen.getByLabelText("Abrir chat de WhatsApp")).toBeInTheDocument();

    window.dispatchEvent(new CustomEvent("leads-navigation-tour", { detail: { action: "open-workspace" } }));

    expect(await screen.findByLabelText("Chat de WhatsApp")).toBeInTheDocument();
    expect(useConversacionesMock).toHaveBeenCalledWith({
      clienteId: "cliente-01",
      pagina: 1,
      limite: 10,
    });
  });

  it("empresa sin WhatsApp conectado (estado !== ACTIVA): muestra WhatsAppSinConexion en vez del chat/estado vacío", async () => {
    useWhatsAppEstadoActualMock.mockReturnValue({
      data: null,
      isLoading: false,
    } as unknown as ReturnType<typeof useWhatsAppEstadoActual>);

    renderPage();

    window.dispatchEvent(new CustomEvent("leads-navigation-tour", { detail: { action: "open-workspace" } }));

    expect(await screen.findByText("WhatsAppSinConexion mock — puedeIrABridges:true")).toBeInTheDocument();
    expect(screen.queryByText("Todavía no hay conversación")).not.toBeInTheDocument();
    expect(screen.queryByText(/ConversacionAbierta mock/)).not.toBeInTheDocument();
  });

  it("empresa sin WhatsApp conectado y rol sin acceso a Bridges: pasa puedeIrABridges=false", async () => {
    useAuthMock.mockReturnValue({
      user: {
        id: "u1",
        nombre: "Usuaria",
        correo: "u1@crm.test",
        rol: "ASESOR",
        sessionScope: "company",
      },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: () => false,
    });
    useWhatsAppEstadoActualMock.mockReturnValue({
      data: null,
      isLoading: false,
    } as unknown as ReturnType<typeof useWhatsAppEstadoActual>);

    renderPage();

    window.dispatchEvent(new CustomEvent("leads-navigation-tour", { detail: { action: "open-workspace" } }));

    expect(await screen.findByText("WhatsAppSinConexion mock — puedeIrABridges:false")).toBeInTheDocument();
  });

  it("mientras carga el estado de WhatsApp, mantiene el estado de carga en vez de mostrar el chat", async () => {
    useWhatsAppEstadoActualMock.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as unknown as ReturnType<typeof useWhatsAppEstadoActual>);

    renderPage();

    window.dispatchEvent(new CustomEvent("leads-navigation-tour", { detail: { action: "open-workspace" } }));

    await waitFor(() => {
      expect(document.querySelector('[data-tour="lead-whatsapp-chat"]')).not.toBeNull();
    });
    expect(screen.queryByText(/WhatsAppSinConexion mock/)).not.toBeInTheDocument();
    expect(screen.queryByText("Todavía no hay conversación")).not.toBeInTheDocument();
  });
});

describe("LeadDetallePage — tab Oportunidad del workspace", () => {
  it("muestra el tab Oportunidad y su contenido al recibir select-tab del tutorial", async () => {
    renderPage();

    window.dispatchEvent(
      new CustomEvent("leads-navigation-tour", { detail: { action: "select-tab", tab: "oportunidad" } }),
    );

    await waitFor(() => {
      expect(document.querySelector('[data-tour="lead-workspace-oportunidad"]')).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(screen.getByText("Oportunidades lead tab mock")).toBeInTheDocument();
    });
  });
});
