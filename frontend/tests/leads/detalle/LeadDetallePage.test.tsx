import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Lead } from "@/tipos/lead";

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

const { useAuth } = await import("@/funcionalidades/autenticacion/authContext");
const { useLeadDetalle } = await import("@/funcionalidades/leads/detalle/useLeadDetalle");
const { LeadDetallePage } = await import("@/funcionalidades/leads/detalle/LeadDetallePage");

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

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <MemoryRouter initialEntries={["/leads/lead-01"]}>
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

describe("LeadDetallePage tutorial anchors", () => {
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
});
