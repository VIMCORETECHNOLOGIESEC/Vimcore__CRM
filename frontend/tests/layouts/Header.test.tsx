import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";

vi.mock("@/funcionalidades/autenticacion/auth-context", () => ({
  useAuth: vi.fn(),
}));
vi.mock("@/funcionalidades/notificaciones/CampanaNotificaciones", () => ({
  CampanaNotificaciones: () => null,
}));

const { useAuth } = await import("@/funcionalidades/autenticacion/auth-context");
const { Header } = await import("@/layouts/Header");
const { PageHeaderProvider, usePageHeader } = await import("@/layouts/PageHeaderContext");

const useAuthMock = vi.mocked(useAuth);

/**
 * Bloque D0 (docs/blocks/d0-visualizacion-multitenant.md): forma holding-wide
 * por defecto -- los tests de título de pantalla de abajo no ejercitan el
 * indicador de scope, así que no necesitan una empresa concreta.
 */
const usuarioHoldingDefault = {
  id: "u1",
  nombre: "Usuaria de prueba",
  correo: "u1@crm.test",
  rol: "ASESOR" as const,
  sessionScope: "holding" as const,
  empresaId: null,
  empresaNombre: null,
  empresaColorPrimario: null,
  empresaColorSecundario: null,
};

const defaultAuthValue = {
  user: usuarioHoldingDefault,
  isAuthenticated: true,
  isLoading: false,
  login: vi.fn(),
  logout: vi.fn(),
  hasRole: () => true,
};

useAuthMock.mockReturnValue(defaultAuthValue);

function Publicador({ config }: { config: Parameters<typeof usePageHeader>[0] }) {
  usePageHeader(config);
  return null;
}

function renderHeader(config: Parameters<typeof usePageHeader>[0]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SidebarProvider>
          <PageHeaderProvider>
            <Publicador config={config} />
            <Header />
          </PageHeaderProvider>
        </SidebarProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Header — título de pantalla", () => {
  it("sin título publicado, el slot está vacío sin romper", () => {
    renderHeader(null);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("");
    expect(screen.queryByRole("link", { name: "Leads" })).not.toBeInTheDocument();
  });

  it("con un título plano, muestra un h1 sin link ni chevron", () => {
    renderHeader({ title: "Leads" });

    expect(screen.getByRole("heading", { name: "Leads" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Leads" })).not.toBeInTheDocument();
  });

  it("con backTo, muestra el h1, el link de vuelta y el separador", () => {
    renderHeader({ title: "Roberto Salazar", backTo: { label: "Leads", href: "/leads" } });

    expect(screen.getByRole("heading", { name: "Roberto Salazar" })).toBeInTheDocument();
    const enlace = screen.getByRole("link", { name: "Leads" });
    expect(enlace).toHaveAttribute("href", "/leads");
  });
});

/**
 * Bloque D0 (docs/blocks/d0-visualizacion-multitenant.md, "Contrato
 * frontend"): indicador persistente del alcance de la sesión en el menú de
 * usuario. No confundir con `configuracion-empresa` (marca global de la
 * instancia, sin relación con `Empresa`/tenant -- ver "Riesgo de colisión
 * conceptual" en el doc D0): ese módulo no vive en este `DropdownMenuLabel`.
 */
describe("Header — indicador de scope de sesión (Bloque D0)", () => {
  afterEach(() => {
    useAuthMock.mockReturnValue(defaultAuthValue);
  });

  it("sesión company, muestra 'Empresa: <empresaNombre>' en el menú de usuario", async () => {
    useAuthMock.mockReturnValue({
      ...defaultAuthValue,
      user: {
        id: "u2",
        nombre: "Usuaria Empresa A",
        correo: "a@crm.test",
        rol: "ASESOR",
        sessionScope: "company",
        empresaId: "empresa-a",
        empresaNombre: "Empresa A",
        empresaColorPrimario: null,
        empresaColorSecundario: null,
        membresiaId: "membresia-a",
      },
    });

    const user = userEvent.setup();
    renderHeader(null);
    await user.click(screen.getByRole("button", { name: /Usuaria Empresa A/ }));

    expect(await screen.findByText("Empresa: Empresa A")).toBeInTheDocument();
    expect(screen.queryByText("Alcance: Holding")).not.toBeInTheDocument();
  });

  it("sesión holding, muestra 'Alcance: Holding' sin atribuir ninguna empresa", async () => {
    useAuthMock.mockReturnValue({
      ...defaultAuthValue,
      user: {
        id: "u3",
        nombre: "Usuaria Holding",
        correo: "h@crm.test",
        rol: "ADMINISTRADOR",
        sessionScope: "holding",
        empresaId: null,
        empresaNombre: null,
        empresaColorPrimario: null,
        empresaColorSecundario: null,
      },
    });

    const user = userEvent.setup();
    renderHeader(null);
    await user.click(screen.getByRole("button", { name: /Usuaria Holding/ }));

    expect(await screen.findByText("Alcance: Holding")).toBeInTheDocument();
    expect(screen.queryByText(/^Empresa:/)).not.toBeInTheDocument();
  });
});
