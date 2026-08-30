import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import type { AuthenticatedUser } from "@/tipos/usuario";

vi.mock("@/funcionalidades/autenticacion/authContext", () => ({
  useAuth: vi.fn(),
}));
vi.mock("@/funcionalidades/configuracion-empresa/useConfiguracionEmpresa", () => ({
  useConfiguracionEmpresa: vi.fn(),
}));

const { useAuth } = await import("@/funcionalidades/autenticacion/authContext");
const { useConfiguracionEmpresa } = await import(
  "@/funcionalidades/configuracion-empresa/useConfiguracionEmpresa"
);
const { AppSidebar } = await import("@/components/app-sidebar");

const useAuthMock = vi.mocked(useAuth);
const useConfiguracionEmpresaMock = vi.mocked(useConfiguracionEmpresa);

function usuarioFake(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: "u1",
    nombre: "Ana Admin",
    correo: "ana@crm.test",
    rol: "ADMINISTRADOR",
    sessionScope: "holding",
    empresaId: null,
    empresaNombre: null,
    empresaColorPrimario: null,
    empresaColorSecundario: null,
    empresaLogoUrl: null,
    ...overrides,
  };
}

function renderSidebar() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SidebarProvider>
          <AppSidebar />
        </SidebarProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useConfiguracionEmpresaMock.mockReturnValue({
    data: { nombre: "Holding X", colorPrimario: "#111111", colorSecundario: "#222222", logoUrl: null },
    isLoading: false,
  } as ReturnType<typeof useConfiguracionEmpresa>);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AppSidebar -- ruta de Apariencia resuelta por scope de sesión", () => {
  it("sesión holding ADMINISTRADOR: el único link 'Apariencia' apunta a /configuracion-empresa", () => {
    useAuthMock.mockReturnValue({
      user: usuarioFake({ sessionScope: "holding" }),
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: vi.fn(),
    });

    renderSidebar();

    const links = screen.getAllByRole("link", { name: "Apariencia" });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/configuracion-empresa");
  });

  it("sesión company ADMINISTRADOR: el único link 'Apariencia' apunta a /apariencia-empresa", () => {
    useAuthMock.mockReturnValue({
      user: usuarioFake({ sessionScope: "company", empresaId: "e1", empresaNombre: "Empresa A" }),
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: vi.fn(),
    });

    renderSidebar();

    const links = screen.getAllByRole("link", { name: "Apariencia" });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/apariencia-empresa");
  });
});
