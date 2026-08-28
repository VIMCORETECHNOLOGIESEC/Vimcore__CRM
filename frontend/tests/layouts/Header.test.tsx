import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";

vi.mock("@/funcionalidades/autenticacion/authContext", () => ({
  useAuth: vi.fn(),
}));
vi.mock("@/funcionalidades/notificaciones/CampanaNotificaciones", () => ({
  CampanaNotificaciones: () => null,
}));

const { useAuth } = await import("@/funcionalidades/autenticacion/authContext");
const { Header } = await import("@/layouts/Header");
const { PageHeaderProvider, usePageHeader } = await import("@/layouts/PageHeaderContext");

const useAuthMock = vi.mocked(useAuth);

useAuthMock.mockReturnValue({
  user: { id: "u1", nombre: "Usuaria de prueba", correo: "u1@crm.test", rol: "ASESOR" },
  isAuthenticated: true,
  isLoading: false,
  login: vi.fn(),
  logout: vi.fn(),
  hasRole: () => true,
});

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
