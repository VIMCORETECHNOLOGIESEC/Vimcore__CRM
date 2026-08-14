import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/httpClient";

vi.mock("@/funcionalidades/autenticacion/AuthContext", () => ({
  useAuth: vi.fn(),
}));

const { useAuth } = await import("@/funcionalidades/autenticacion/AuthContext");
const { LoginPage } = await import("@/funcionalidades/autenticacion/LoginPage");

const useAuthMock = vi.mocked(useAuth);
const loginMock = vi.fn();

const usuarioFake = {
  id: "u1",
  nombre: "Ana Gómez",
  correo: "ana@crm.test",
  rol: "ASESOR" as const,
};

function renderLoginPage(
  opciones: { initialEntry?: string; state?: unknown } = {},
) {
  const router = createMemoryRouter(
    [
      { path: "/iniciar-sesion", element: <LoginPage /> },
      { path: "/panel", element: <div>Panel</div> },
      { path: "/leads", element: <div>Leads</div> },
    ],
    {
      initialEntries: [
        { pathname: opciones.initialEntry ?? "/iniciar-sesion", state: opciones.state },
      ],
    },
  );
  return render(<RouterProvider router={router} />);
}

beforeEach(() => {
  loginMock.mockReset();
  useAuthMock.mockReturnValue({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    login: loginMock,
    logout: vi.fn(),
    hasRole: vi.fn(),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LoginPage — validación", () => {
  it("muestra errores accionables en español cuando se envía el formulario vacío", async () => {
    const user = userEvent.setup();
    renderLoginPage();

    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    expect(await screen.findByText("Ingresá un correo electrónico válido.")).toBeInTheDocument();
    expect(screen.getByText("Ingresá tu contraseña.")).toBeInTheDocument();
    expect(loginMock).not.toHaveBeenCalled();
  });
});

describe("LoginPage — envío", () => {
  it("con credenciales válidas, llama a login y redirige a la landing del rol del usuario", async () => {
    loginMock.mockResolvedValue(usuarioFake);
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText("Correo electrónico"), "ana@crm.test");
    await user.type(screen.getByLabelText("Contraseña"), "clave-segura");
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    expect(await screen.findByText("Panel")).toBeInTheDocument();
    expect(loginMock).toHaveBeenCalledWith("ana@crm.test", "clave-segura");
  });

  it("respeta la ruta 'desde' guardada por ProtectedRoute en vez de la landing por rol", async () => {
    loginMock.mockResolvedValue(usuarioFake);
    const user = userEvent.setup();
    renderLoginPage({ state: { desde: "/leads" } });

    await user.type(screen.getByLabelText("Correo electrónico"), "ana@crm.test");
    await user.type(screen.getByLabelText("Contraseña"), "clave-segura");
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    expect(await screen.findByText("Leads")).toBeInTheDocument();
  });

  it("con credenciales inválidas, muestra el mensaje accionable del backend y no redirige", async () => {
    loginMock.mockRejectedValue(
      new ApiError("credenciales_invalidas", 401, "Correo o contraseña incorrectos"),
    );
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText("Correo electrónico"), "ana@crm.test");
    await user.type(screen.getByLabelText("Contraseña"), "clave-mala");
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    expect(await screen.findByText("Correo o contraseña incorrectos")).toBeInTheDocument();
    expect(screen.queryByText("Panel")).not.toBeInTheDocument();
  });
});
