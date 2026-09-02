import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import type { AuthenticatedUser } from "@/tipos/usuario";

vi.mock("@/funcionalidades/autenticacion/auth-context", () => ({
  useAuth: vi.fn(),
}));
vi.mock("@/funcionalidades/configuracion-empresa/useConfiguracionEmpresa", () => ({
  useConfiguracionEmpresa: vi.fn(),
}));
vi.mock("@/funcionalidades/empresa-apariencia/useVistaEmpresa", () => ({
  useVistaEmpresa: vi.fn(),
}));
vi.mock("@/funcionalidades/empresa-apariencia/useEmpresaAparienciaHolding", () => ({
  useEmpresaHolding: vi.fn(),
}));
// Evita que `useConversacionesNoLeidasCount` (badge del ítem "Conversaciones")
// dispare una petición real en estos tests -- mismo criterio que el resto de
// la suite (mockear la capa `.api`, no `httpClient`/`fetch`).
vi.mock("@/funcionalidades/whatsapp/conversaciones.api", () => ({
  LIMITES_CONVERSACIONES: [10, 25, 50, 100],
  LONGITUD_MAXIMA_MENSAJE: 4096,
  listarConversacionesApi: vi.fn(),
  listarMensajesApi: vi.fn(),
  enviarMensajeApi: vi.fn(),
  marcarConversacionLeidaApi: vi.fn(),
}));

const { useAuth } = await import("@/funcionalidades/autenticacion/auth-context");
const { useConfiguracionEmpresa } = await import(
  "@/funcionalidades/configuracion-empresa/useConfiguracionEmpresa"
);
const { useVistaEmpresa } = await import("@/funcionalidades/empresa-apariencia/useVistaEmpresa");
const { useEmpresaHolding } = await import(
  "@/funcionalidades/empresa-apariencia/useEmpresaAparienciaHolding"
);
const conversacionesApi = await import("@/funcionalidades/whatsapp/conversaciones.api");
const { AppSidebar } = await import("@/components/app-sidebar");

const useAuthMock = vi.mocked(useAuth);
const useConfiguracionEmpresaMock = vi.mocked(useConfiguracionEmpresa);
const useVistaEmpresaMock = vi.mocked(useVistaEmpresa);
const useEmpresaHoldingMock = vi.mocked(useEmpresaHolding);
const listarConversacionesApiMock = vi.mocked(conversacionesApi.listarConversacionesApi);

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
  useVistaEmpresaMock.mockReturnValue({
    empresaVistaId: null,
    entrarAEmpresa: vi.fn(),
    salirDeEmpresa: vi.fn(),
  });
  useEmpresaHoldingMock.mockReturnValue({
    data: undefined,
  } as ReturnType<typeof useEmpresaHolding>);
  listarConversacionesApiMock.mockReset();
  listarConversacionesApiMock.mockResolvedValue({ conversaciones: [], total: 0 });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AppSidebar -- badge de conversaciones sin leer", () => {
  function conversacionFake(overrides: Record<string, unknown> = {}) {
    return {
      id: "conv-1",
      clienteId: "cli-1",
      clienteNombre: "Ana Gómez",
      clienteTelefono: null,
      asesorId: null,
      asesorNombre: null,
      ultimoMensajeEn: null,
      creadaEn: "2026-08-30T09:00:00.000Z",
      noLeido: true,
      ...overrides,
    };
  }

  it("muestra el conteo de conversaciones no leídas junto al ítem 'Conversaciones'", async () => {
    listarConversacionesApiMock.mockResolvedValue({
      conversaciones: [
        conversacionFake({ id: "c1", noLeido: true }),
        conversacionFake({ id: "c2", noLeido: false }),
        conversacionFake({ id: "c3", noLeido: true }),
      ],
      total: 3,
    });
    useAuthMock.mockReturnValue({
      user: usuarioFake({ sessionScope: "company", empresaId: "e1", empresaNombre: "Empresa A" }),
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: vi.fn(),
    });

    renderSidebar();

    const link = await screen.findByRole("link", { name: "Conversaciones" });
    expect(await within(link).findByText("2")).toBeInTheDocument();
  });

  it("sin conversaciones no leídas, no muestra badge", async () => {
    listarConversacionesApiMock.mockResolvedValue({
      conversaciones: [conversacionFake({ noLeido: false })],
      total: 1,
    });
    useAuthMock.mockReturnValue({
      user: usuarioFake({ sessionScope: "company", empresaId: "e1", empresaNombre: "Empresa A" }),
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: vi.fn(),
    });

    renderSidebar();

    const link = await screen.findByRole("link", { name: "Conversaciones" });
    await waitFor(() => expect(listarConversacionesApiMock).toHaveBeenCalled());
    expect(within(link).queryByText("0")).not.toBeInTheDocument();
  });
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

describe("AppSidebar -- Oportunidades/Bridges condicionados a vista de empresa (holding-wide)", () => {
  it("sesión holding SIN vista de empresa activa: Oportunidades y Bridges no aparecen en el sidebar", () => {
    useAuthMock.mockReturnValue({
      user: usuarioFake({ sessionScope: "holding", rol: "SUPER_ADMIN" }),
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: vi.fn(),
    });
    useVistaEmpresaMock.mockReturnValue({
      empresaVistaId: null,
      entrarAEmpresa: vi.fn(),
      salirDeEmpresa: vi.fn(),
    });

    renderSidebar();

    expect(screen.queryByRole("link", { name: "Oportunidades" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Bridges" })).not.toBeInTheDocument();
  });

  it("sesión holding CON vista de empresa activa: Oportunidades y Bridges aparecen y propagan ?empresaId=", () => {
    useAuthMock.mockReturnValue({
      user: usuarioFake({ sessionScope: "holding", rol: "SUPER_ADMIN" }),
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: vi.fn(),
    });
    useVistaEmpresaMock.mockReturnValue({
      empresaVistaId: "empresa-1",
      entrarAEmpresa: vi.fn(),
      salirDeEmpresa: vi.fn(),
    });

    renderSidebar();

    expect(screen.getByRole("link", { name: "Oportunidades" })).toHaveAttribute(
      "href",
      "/oportunidades?empresaId=empresa-1",
    );
    expect(screen.getByRole("link", { name: "Bridges" })).toHaveAttribute(
      "href",
      "/bridges?empresaId=empresa-1",
    );
  });

  it("sesión company: Oportunidades y Bridges siempre visibles, sin ?empresaId= (no aplica)", () => {
    useAuthMock.mockReturnValue({
      user: usuarioFake({
        sessionScope: "company",
        rol: "ADMINISTRADOR",
        empresaId: "e1",
        empresaNombre: "Empresa A",
      }),
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: vi.fn(),
    });
    useVistaEmpresaMock.mockReturnValue({
      empresaVistaId: null,
      entrarAEmpresa: vi.fn(),
      salirDeEmpresa: vi.fn(),
    });

    renderSidebar();

    expect(screen.getByRole("link", { name: "Oportunidades" })).toHaveAttribute(
      "href",
      "/oportunidades",
    );
    expect(screen.getByRole("link", { name: "Bridges" })).toHaveAttribute("href", "/bridges");
  });
});

describe("AppSidebar -- logo/nombre de la empresa en vista (holding-wide con acceso total)", () => {
  // Fix (2026-09-02, bug real): `enVistaDeEmpresa` (app-sidebar.tsx) usaba un
  // literal `rol === "ADMINISTRADOR"` en vez de `hasRoleAccess`, así que
  // SUPERVISOR_HOLDING/SUPER_ADMIN (mismo alcance máximo holding-wide,
  // Bloque F) podían LLEGAR a la vista de una empresa (ProtectedRoute/
  // EmpresaDetallePage ya usan `hasRoleAccess`, que sí bypasea) pero el
  // sidebar seguía mostrando el logo/nombre del HOLDING en vez del de la
  // empresa que estaban mirando. Los 3 roles de este describe cubren el
  // mismo camino que ya funcionaba para ADMINISTRADOR.
  it.each(["ADMINISTRADOR", "SUPERVISOR_HOLDING", "SUPER_ADMIN"] as const)(
    "rol %s + sesión holding + vista de empresa activa: el sidebar muestra el logo/nombre de la empresa en vista, no el del holding",
    (rol) => {
      useAuthMock.mockReturnValue({
        user: usuarioFake({ sessionScope: "holding", rol }),
        isAuthenticated: true,
        isLoading: false,
        login: vi.fn(),
        logout: vi.fn(),
        hasRole: vi.fn(),
      });
      useVistaEmpresaMock.mockReturnValue({
        empresaVistaId: "empresa-1",
        entrarAEmpresa: vi.fn(),
        salirDeEmpresa: vi.fn(),
      });
      useEmpresaHoldingMock.mockReturnValue({
        data: {
          id: "empresa-1",
          nombre: "Empresa Vista SA",
          colorPrimario: null,
          colorSecundario: null,
          logoUrl: null,
        },
      } as ReturnType<typeof useEmpresaHolding>);

      renderSidebar();

      expect(screen.getByText("Empresa Vista SA")).toBeInTheDocument();
      expect(screen.queryByText("Holding X")).not.toBeInTheDocument();
      expect(useEmpresaHoldingMock).toHaveBeenCalledWith("empresa-1");
    },
  );

  it("rol SUPERVISOR (no holding-wide) + sesión holding + ?empresaId= residual: nunca activa la vista de empresa", () => {
    useAuthMock.mockReturnValue({
      user: usuarioFake({ sessionScope: "holding", rol: "SUPERVISOR" }),
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: vi.fn(),
    });
    useVistaEmpresaMock.mockReturnValue({
      empresaVistaId: "empresa-1",
      entrarAEmpresa: vi.fn(),
      salirDeEmpresa: vi.fn(),
    });

    renderSidebar();

    expect(screen.getByText("Holding X")).toBeInTheDocument();
    expect(useEmpresaHoldingMock).toHaveBeenCalledWith(undefined);
  });

  it("sesión company con rol ADMINISTRADOR + ?empresaId= residual: nunca activa la vista de empresa", () => {
    useAuthMock.mockReturnValue({
      user: usuarioFake({
        sessionScope: "company",
        rol: "ADMINISTRADOR",
        empresaId: "e1",
        empresaNombre: "Empresa A",
      }),
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: vi.fn(),
    });
    useVistaEmpresaMock.mockReturnValue({
      empresaVistaId: "empresa-1",
      entrarAEmpresa: vi.fn(),
      salirDeEmpresa: vi.fn(),
    });

    renderSidebar();

    expect(screen.queryByText("Empresa Vista SA")).not.toBeInTheDocument();
    expect(useEmpresaHoldingMock).toHaveBeenCalledWith(undefined);
  });
});
