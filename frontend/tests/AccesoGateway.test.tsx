import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAuthRedirectGuard } from "@/api/httpClient";
import { AuthProvider } from "@/funcionalidades/autenticacion/AuthContext";
import {
  IniciarSesionRedirect,
  LandingRedirect,
} from "@/funcionalidades/autenticacion/EstadosAccesoPage";
import { ProtectedRoute } from "@/funcionalidades/autenticacion/ProtectedRoute";

/**
 * Bootstrap de punta a punta contra el gateway: `AuthProvider` + `httpClient`
 * reales, con `fetch` como único mock (la respuesta que daría `GET
 * /crm/auth/perfil`).
 */

const AUTH_LOGIN = "http://localhost:5174/auth/login";

const perfilHolding = {
  id: "u1",
  nombre: "Hana Holding",
  correo: "hana@holding.test",
  sessionScope: "holding",
  empresaId: null,
  empresaNombre: null,
  empresaColorPrimario: null,
  empresaColorSecundario: null,
};

function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function renderApp(initialEntry = "/") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      { path: "/iniciar-sesion", element: <IniciarSesionRedirect /> },
      {
        element: <ProtectedRoute />,
        children: [
          { index: true, element: <LandingRedirect /> },
          { path: "/panel", element: <div>Panel de la empresa</div> },
          { path: "/empresas", element: <div>Administración del holding</div> },
        ],
      },
    ],
    { initialEntries: [initialEntry] },
  );
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return router;
}

let assignMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetAuthRedirectGuard();
  assignMock = vi.fn();
  vi.stubGlobal("location", { assign: assignMock, href: "http://crm.test/" });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("arranque desde la sesión del gateway", () => {
  it("ADMINISTRADOR_HOLDING de holding aterriza directo en /empresas", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(200, { ...perfilHolding, rol: "ADMINISTRADOR_HOLDING" }));
    vi.stubGlobal("fetch", fetchMock);

    const router = renderApp("/");

    expect(await screen.findByText("Administración del holding")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/empresas");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:3001/crm/auth/perfil");
    expect(init.credentials).toBe("include");
    expect(assignMock).not.toHaveBeenCalled();
  });

  it("ADMINISTRADOR de empresa aterriza en el landing de su rol (/panel)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        json(200, {
          ...perfilHolding,
          rol: "ADMINISTRADOR",
          sessionScope: "company",
          empresaId: "empresa-a",
          empresaNombre: "Empresa A",
        }),
      ),
    );

    const router = renderApp("/");

    expect(await screen.findByText("Panel de la empresa")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/panel");
  });

  it("401 AUTH_REQUIRED: redirige al frontend de auth una sola vez", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        json(401, { success: false, error: { code: "AUTH_REQUIRED", message: "Missing bearer token" } }),
      ),
    );

    renderApp("/empresas");

    expect(await screen.findByText("Redirigiendo al inicio de sesión…")).toBeInTheDocument();
    expect(assignMock).toHaveBeenCalledTimes(1);
    expect(assignMock).toHaveBeenCalledWith(AUTH_LOGIN);
  });

  it("403 CRM_IDENTITY_NOT_LINKED: pantalla de no vinculada, sin login y sin bucle de redirección", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        json(403, {
          success: false,
          error: { code: "CRM_IDENTITY_NOT_LINKED", message: "This account is not linked to a CRM company yet" },
        }),
      ),
    );

    renderApp("/");

    expect(await screen.findByText("Tu cuenta aún no está vinculada al CRM")).toBeInTheDocument();
    expect(document.querySelector("form")).toBeNull();
    expect(assignMock).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Volver al inicio de sesión" })).toHaveAttribute(
      "href",
      AUTH_LOGIN,
    );
  });

  it("502 UPSTREAM_ERROR: error genérico con reintento, sin redirigir a auth", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        json(502, { success: false, error: { code: "UPSTREAM_ERROR", message: "CRM unavailable" } }),
      ),
    );

    renderApp("/");

    expect(await screen.findByText("No pudimos cargar tu sesión")).toBeInTheDocument();
    expect(assignMock).not.toHaveBeenCalled();
  });

  it("la ruta vieja /iniciar-sesion redirige al frontend de auth (sin 404 ni formulario)", async () => {
    renderApp("/iniciar-sesion");

    expect(await screen.findByText("Redirigiendo al inicio de sesión…")).toBeInTheDocument();
    expect(assignMock).toHaveBeenCalledTimes(1);
    expect(assignMock).toHaveBeenCalledWith(AUTH_LOGIN);
    expect(document.querySelector("form")).toBeNull();
  });
});
