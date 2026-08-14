import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";
import type { RolUsuario } from "@/tipos/usuario";

vi.mock("@/funcionalidades/autenticacion/AuthContext", () => ({
  useAuth: vi.fn(),
}));

const { useAuth } = await import("@/funcionalidades/autenticacion/AuthContext");
const { ProtectedRoute } = await import("@/funcionalidades/autenticacion/ProtectedRoute");

const useAuthMock = vi.mocked(useAuth);

function renderWithRoute(opciones: {
  allowedRoles?: readonly RolUsuario[];
  initialEntry?: string;
} = {}) {
  const router = createMemoryRouter(
    [
      { path: "/iniciar-sesion", element: <div>Pantalla de inicio de sesión</div> },
      { path: "/panel", element: <div>Panel</div> },
      {
        element: <ProtectedRoute allowedRoles={opciones.allowedRoles} />,
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
