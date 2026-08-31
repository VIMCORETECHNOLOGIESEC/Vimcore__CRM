import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";
import type { RolUsuario, SessionScope } from "@/tipos/usuario";

vi.mock("@/funcionalidades/autenticacion/auth-context", () => ({
  useAuth: vi.fn(),
}));

const { useAuth } = await import("@/funcionalidades/autenticacion/auth-context");
const { ProtectedRoute } = await import("@/funcionalidades/autenticacion/ProtectedRoute");

const useAuthMock = vi.mocked(useAuth);

function renderWithRoute(opciones: {
  allowedRoles?: readonly RolUsuario[];
  allowedScopes?: readonly SessionScope[];
  requiereVistaEmpresaSiHolding?: boolean;
  initialEntry?: string;
} = {}) {
  const router = createMemoryRouter(
    [
      { path: "/iniciar-sesion", element: <div>Pantalla de inicio de sesión</div> },
      { path: "/panel", element: <div>Panel</div> },
      {
        element: (
          <ProtectedRoute
            allowedRoles={opciones.allowedRoles}
            allowedScopes={opciones.allowedScopes}
            requiereVistaEmpresaSiHolding={opciones.requiereVistaEmpresaSiHolding}
          />
        ),
        children: [{ path: "/privado", element: <div>Contenido privado</div> }],
      },
    ],
    { initialEntries: [opciones.initialEntry ?? "/privado"] },
  );
  return render(<RouterProvider router={router} />);
}

describe("ProtectedRoute", () => {
  it("redirige a /iniciar-sesion cuando no hay sesión", async () => {
    useAuthMock.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: vi.fn(),
    });

    renderWithRoute();

    expect(await screen.findByText("Pantalla de inicio de sesión")).toBeInTheDocument();
    expect(screen.queryByText("Contenido privado")).not.toBeInTheDocument();
  });

  it("redirige a /panel cuando hay sesión pero el rol del usuario no tiene acceso", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "u1", nombre: "Ana", correo: "ana@crm.test", rol: "ASESOR" },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: vi.fn(),
    });

    renderWithRoute({ allowedRoles: ["ADMINISTRADOR"] });

    expect(await screen.findByText("Panel")).toBeInTheDocument();
    expect(screen.queryByText("Contenido privado")).not.toBeInTheDocument();
  });

  it("renderiza el contenido protegido cuando hay sesión y el rol tiene acceso", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "u1", nombre: "Ana", correo: "ana@crm.test", rol: "ADMINISTRADOR" },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: vi.fn(),
    });

    renderWithRoute({ allowedRoles: ["ADMINISTRADOR"] });

    expect(await screen.findByText("Contenido privado")).toBeInTheDocument();
  });

  it("sin allowedRoles, cualquier usuario autenticado accede al contenido protegido", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "u1", nombre: "Ana", correo: "ana@crm.test", rol: "VENDEDOR" },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: vi.fn(),
    });

    renderWithRoute();

    expect(await screen.findByText("Contenido privado")).toBeInTheDocument();
  });

  it("redirige a /panel cuando hay sesión pero el scope no tiene acceso (PASO 8)", async () => {
    useAuthMock.mockReturnValue({
      user: {
        id: "u1",
        nombre: "Ana",
        correo: "ana@crm.test",
        rol: "ADMINISTRADOR",
        sessionScope: "company",
        empresaId: "e1",
        empresaNombre: "Empresa A",
        empresaColorPrimario: null,
        empresaColorSecundario: null,
        empresaLogoUrl: null,
      },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: vi.fn(),
    });

    renderWithRoute({ allowedScopes: ["holding"] });

    expect(await screen.findByText("Panel")).toBeInTheDocument();
    expect(screen.queryByText("Contenido privado")).not.toBeInTheDocument();
  });

  it("renderiza el contenido protegido cuando el scope de la sesión tiene acceso", async () => {
    useAuthMock.mockReturnValue({
      user: {
        id: "u1",
        nombre: "Ana",
        correo: "ana@crm.test",
        rol: "ADMINISTRADOR",
        sessionScope: "holding",
        empresaId: null,
        empresaNombre: null,
        empresaColorPrimario: null,
        empresaColorSecundario: null,
        empresaLogoUrl: null,
      },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: vi.fn(),
    });

    renderWithRoute({ allowedScopes: ["holding"] });

    expect(await screen.findByText("Contenido privado")).toBeInTheDocument();
  });

  it("mientras isLoading es true (rehidratando sesión, F2), muestra un estado de carga sin redirigir", () => {
    useAuthMock.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: true,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: vi.fn(),
    });

    renderWithRoute();

    expect(screen.getByText("Cargando sesión…")).toBeInTheDocument();
    expect(screen.queryByText("Pantalla de inicio de sesión")).not.toBeInTheDocument();
    expect(screen.queryByText("Contenido privado")).not.toBeInTheDocument();
  });
});

describe("ProtectedRoute -- requiereVistaEmpresaSiHolding (gate real de Oportunidades/Bridges)", () => {
  function usuarioHolding() {
    return {
      id: "u1",
      nombre: "Ana",
      correo: "ana@crm.test",
      rol: "SUPER_ADMIN" as RolUsuario,
      sessionScope: "holding" as SessionScope,
      empresaId: null,
      empresaNombre: null,
      empresaColorPrimario: null,
      empresaColorSecundario: null,
      empresaLogoUrl: null,
    };
  }

  function usuarioCompany() {
    return {
      id: "u1",
      nombre: "Ana",
      correo: "ana@crm.test",
      rol: "ADMINISTRADOR" as RolUsuario,
      sessionScope: "company" as SessionScope,
      empresaId: "e1",
      empresaNombre: "Empresa A",
      empresaColorPrimario: null,
      empresaColorSecundario: null,
      empresaLogoUrl: null,
    };
  }

  it("redirige a /panel: sesión holding SIN ?empresaId= en la URL", async () => {
    useAuthMock.mockReturnValue({
      user: usuarioHolding(),
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: vi.fn(),
    });

    renderWithRoute({ requiereVistaEmpresaSiHolding: true, initialEntry: "/privado" });

    expect(await screen.findByText("Panel")).toBeInTheDocument();
    expect(screen.queryByText("Contenido privado")).not.toBeInTheDocument();
  });

  it("renderiza el contenido: sesión holding CON ?empresaId= en la URL", async () => {
    useAuthMock.mockReturnValue({
      user: usuarioHolding(),
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: vi.fn(),
    });

    renderWithRoute({
      requiereVistaEmpresaSiHolding: true,
      initialEntry: "/privado?empresaId=empresa-1",
    });

    expect(await screen.findByText("Contenido privado")).toBeInTheDocument();
  });

  it("renderiza el contenido: sesión company, sin importar el flag ni ?empresaId=", async () => {
    useAuthMock.mockReturnValue({
      user: usuarioCompany(),
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: vi.fn(),
    });

    renderWithRoute({ requiereVistaEmpresaSiHolding: true, initialEntry: "/privado" });

    expect(await screen.findByText("Contenido privado")).toBeInTheDocument();
  });

  it("sin el flag, una sesión holding sin ?empresaId= accede con normalidad (comportamiento previo intacto)", async () => {
    useAuthMock.mockReturnValue({
      user: usuarioHolding(),
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: vi.fn(),
    });

    renderWithRoute({ initialEntry: "/privado" });

    expect(await screen.findByText("Contenido privado")).toBeInTheDocument();
  });
});
