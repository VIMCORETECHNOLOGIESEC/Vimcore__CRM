import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/httpClient";

vi.mock("@/funcionalidades/autenticacion/auth-context", () => ({
  useAuth: vi.fn(),
}));
vi.mock("@/funcionalidades/configuracion-empresa/configuracion-empresa.api", () => ({
  fetchConfiguracionEmpresaApi: vi.fn(),
  CONFIGURACION_EMPRESA_DEFAULT: {
    nombre: "CRM Embudo de Leads",
    colorPrimario: "#1e2a5e",
    colorSecundario: "#2563eb",
    logoUrl: null,
  },
}));
// PASO 5/6 (tema-empresarial-integracion): el panel izquierdo (isotipo)
// ahora resuelve `GET /marca-publica` (sin sesión) al montar -- mockeado acá
// para no depender de red real y para poder controlar el `logoUrl` devuelto.
vi.mock("@/funcionalidades/configuracion-empresa/marca-publica.api", () => ({
  obtenerMarcaPublicaConFallback: vi.fn(),
}));

const { useAuth } = await import("@/funcionalidades/autenticacion/auth-context");
const { fetchConfiguracionEmpresaApi, CONFIGURACION_EMPRESA_DEFAULT } = await import(
  "@/funcionalidades/configuracion-empresa/configuracion-empresa.api"
);
const { obtenerMarcaPublicaConFallback } = await import(
  "@/funcionalidades/configuracion-empresa/marca-publica.api"
);
const { LoginPage } = await import("@/funcionalidades/autenticacion/LoginPage");

const useAuthMock = vi.mocked(useAuth);
const fetchConfiguracionEmpresaApiMock = vi.mocked(fetchConfiguracionEmpresaApi);
const obtenerMarcaPublicaConFallbackMock = vi.mocked(obtenerMarcaPublicaConFallback);
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
  // `LoginPage` ahora lee/escribe la caché de `configuracion-empresa` vía
  // `queryClient.fetchQuery` (en vez de llamar a `fetchConfiguracionEmpresaApi`
  // crudo) -- necesita un `QueryClientProvider` real en el árbol, mismo
  // patrón que `AuthContext.test.tsx` (`retry: false`, sin reintentos en tests).
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
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
  fetchConfiguracionEmpresaApiMock.mockReset();
  fetchConfiguracionEmpresaApiMock.mockResolvedValue(CONFIGURACION_EMPRESA_DEFAULT);
  obtenerMarcaPublicaConFallbackMock.mockReset();
  obtenerMarcaPublicaConFallbackMock.mockResolvedValue(CONFIGURACION_EMPRESA_DEFAULT);
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

    // La redirección ahora ocurre recién después de la cortina de
    // bienvenida (`WelcomeSplashLoader`, tema empresarial) -- el timeout por
    // defecto de `findBy*` (1000ms) no alcanza a cubrir
    // `SPLASH_FADE_MS + SPLASH_SOSTENIDO_MS` (1400ms en `LoginPage.tsx`).
    expect(await screen.findByText("Panel", {}, { timeout: 2000 })).toBeInTheDocument();
    expect(loginMock).toHaveBeenCalledWith("ana@crm.test", "clave-segura");
  });

  it("respeta la ruta 'desde' guardada por ProtectedRoute en vez de la landing por rol", async () => {
    loginMock.mockResolvedValue(usuarioFake);
    const user = userEvent.setup();
    renderLoginPage({ state: { desde: "/leads" } });

    await user.type(screen.getByLabelText("Correo electrónico"), "ana@crm.test");
    await user.type(screen.getByLabelText("Contraseña"), "clave-segura");
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    expect(await screen.findByText("Leads", {}, { timeout: 2000 })).toBeInTheDocument();
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

describe("LoginPage — cortina de bienvenida", () => {
  it("no se muestra antes de enviar el formulario", () => {
    renderLoginPage();

    expect(screen.queryByText("Preparando tu panel…")).not.toBeInTheDocument();
  });

  it("con credenciales válidas, cubre la pantalla con el splash antes de redirigir", async () => {
    loginMock.mockResolvedValue(usuarioFake);
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText("Correo electrónico"), "ana@crm.test");
    await user.type(screen.getByLabelText("Contraseña"), "clave-segura");
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    // Aparece cubriendo la pantalla (role="status", `aria-live="polite"`,
    // texto no color-only) apenas resuelve `login`, antes de que la
    // navegación reemplace la pantalla.
    expect(await screen.findByText("Preparando tu panel…")).toBeInTheDocument();

    // Y la redirección real sigue ocurriendo después.
    expect(await screen.findByText("Panel", {}, { timeout: 2000 })).toBeInTheDocument();
  });

  it("con credenciales inválidas, no muestra el splash (el usuario se queda en el formulario)", async () => {
    loginMock.mockRejectedValue(
      new ApiError("credenciales_invalidas", 401, "Correo o contraseña incorrectos"),
    );
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText("Correo electrónico"), "ana@crm.test");
    await user.type(screen.getByLabelText("Contraseña"), "clave-mala");
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    expect(await screen.findByText("Correo o contraseña incorrectos")).toBeInTheDocument();
    expect(screen.queryByText("Preparando tu panel…")).not.toBeInTheDocument();
  });
});

describe("LoginPage — isotipo del holding (PASO 5/6, panel izquierdo pre-login)", () => {
  it("muestra el placeholder de diseño mientras no hay ningún logoUrl configurado", async () => {
    obtenerMarcaPublicaConFallbackMock.mockResolvedValue(CONFIGURACION_EMPRESA_DEFAULT);
    renderLoginPage();

    expect(await screen.findByText("Isotipo del holding")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("muestra el isotipo real en vez del placeholder cuando GET /marca-publica trae un logoUrl", async () => {
    obtenerMarcaPublicaConFallbackMock.mockResolvedValue({
      ...CONFIGURACION_EMPRESA_DEFAULT,
      logoUrl: "https://cdn.miempresa.com/logo.svg",
    });
    renderLoginPage();

    const imagen = await screen.findByRole("img");
    expect(imagen).toHaveAttribute("src", "https://cdn.miempresa.com/logo.svg");
    expect(screen.queryByText("Isotipo del holding")).not.toBeInTheDocument();
  });
});

describe("LoginPage — configuración de marca real en la cortina de bienvenida", () => {
  it("usa el nombre y los colores reales de la empresa cuando el fetch resuelve a tiempo", async () => {
    loginMock.mockResolvedValue(usuarioFake);
    fetchConfiguracionEmpresaApiMock.mockResolvedValue({
      nombre: "Arcano Motos",
      colorPrimario: "#111111",
      colorSecundario: "#222222",
      logoUrl: null,
    });
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText("Correo electrónico"), "ana@crm.test");
    await user.type(screen.getByLabelText("Contraseña"), "clave-segura");
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    expect(await screen.findByText("Arcano Motos")).toBeInTheDocument();
    const splash = screen.getByRole("status");
    expect(splash.style.getPropertyValue("--marca-color-1")).toBe("#111111");
    expect(splash.style.getPropertyValue("--marca-color-2")).toBe("#222222");

    // Y la redirección real sigue ocurriendo -- el fetch de marca no la bloquea.
    expect(await screen.findByText("Panel", {}, { timeout: 2000 })).toBeInTheDocument();
  });

  it("usa el nombre por defecto como fallback y no bloquea el login si el fetch falla", async () => {
    loginMock.mockResolvedValue(usuarioFake);
    fetchConfiguracionEmpresaApiMock.mockRejectedValue(new Error("network error"));
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText("Correo electrónico"), "ana@crm.test");
    await user.type(screen.getByLabelText("Contraseña"), "clave-segura");
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    // Scopeado al `role="status"` de la cortina -- "CRM Embudo de Leads"
    // también aparece siempre en el panel de marca estático de la izquierda,
    // que no depende de este fetch.
    const splash = await screen.findByRole("status");
    expect(within(splash).getByText("CRM Embudo de Leads")).toBeInTheDocument();
    expect(await screen.findByText("Panel", {}, { timeout: 2000 })).toBeInTheDocument();
  });
});

/**
 * tema-empresarial-integracion (Parte 2, decisión explícita del usuario):
 * cada empresa tiene su propio color REAL -- prioridad simple sin una
 * tercera fuente de verdad (`LoginPage.tsx::resolveColorMarca`): color de
 * `Empresa` (sesión `company` con AMBOS colores seteados) antes que la
 * paleta global de la instancia; si no hay color propio, o la sesión es
 * `holding`, se usa la paleta global sin cambios.
 */
describe("LoginPage — prioridad de color de marca por empresa (tema-empresarial-integracion, Parte 2)", () => {
  const usuarioCompanyConColorFake = {
    id: "u2",
    nombre: "Empresa A Demo",
    correo: "empresa-a@crm.test",
    rol: "ASESOR" as const,
    sessionScope: "company" as const,
    empresaId: "empresa-a",
    empresaNombre: "Empresa A",
    empresaColorPrimario: "#7c2d12",
    empresaColorSecundario: "#f97316",
    membresiaId: "membresia-a",
  };

  it("usa el color propio de la Empresa en vez de la paleta global cuando la sesión company lo tiene seteado", async () => {
    loginMock.mockResolvedValue(usuarioCompanyConColorFake);
    fetchConfiguracionEmpresaApiMock.mockResolvedValue(CONFIGURACION_EMPRESA_DEFAULT);
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText("Correo electrónico"), "empresa-a@crm.test");
    await user.type(screen.getByLabelText("Contraseña"), "clave-segura");
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    const splash = await screen.findByRole("status");
    expect(splash.style.getPropertyValue("--marca-color-1")).toBe("#7c2d12");
    expect(splash.style.getPropertyValue("--marca-color-2")).toBe("#f97316");
    expect(await screen.findByText("Panel", {}, { timeout: 2000 })).toBeInTheDocument();
  });

  it("usa la paleta global cuando la Empresa (sesión company) no tiene color propio seteado", async () => {
    loginMock.mockResolvedValue({
      ...usuarioCompanyConColorFake,
      empresaColorPrimario: null,
      empresaColorSecundario: null,
    });
    fetchConfiguracionEmpresaApiMock.mockResolvedValue(CONFIGURACION_EMPRESA_DEFAULT);
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText("Correo electrónico"), "empresa-a@crm.test");
    await user.type(screen.getByLabelText("Contraseña"), "clave-segura");
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    const splash = await screen.findByRole("status");
    expect(splash.style.getPropertyValue("--marca-color-1")).toBe(
      CONFIGURACION_EMPRESA_DEFAULT.colorPrimario,
    );
    expect(splash.style.getPropertyValue("--marca-color-2")).toBe(
      CONFIGURACION_EMPRESA_DEFAULT.colorSecundario,
    );
  });

  it("usa la paleta global para una sesión holding, aunque venga con campos de empresa", async () => {
    loginMock.mockResolvedValue(usuarioFake);
    fetchConfiguracionEmpresaApiMock.mockResolvedValue(CONFIGURACION_EMPRESA_DEFAULT);
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText("Correo electrónico"), "ana@crm.test");
    await user.type(screen.getByLabelText("Contraseña"), "clave-segura");
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    const splash = await screen.findByRole("status");
    expect(splash.style.getPropertyValue("--marca-color-1")).toBe(
      CONFIGURACION_EMPRESA_DEFAULT.colorPrimario,
    );
    expect(splash.style.getPropertyValue("--marca-color-2")).toBe(
      CONFIGURACION_EMPRESA_DEFAULT.colorSecundario,
    );
  });

  it("usa el NOMBRE propio de la Empresa en el splash, no el del holding (bug real: antes 'nombre' nunca salía de resolveColorMarca)", async () => {
    loginMock.mockResolvedValue(usuarioCompanyConColorFake);
    fetchConfiguracionEmpresaApiMock.mockResolvedValue({
      nombre: "Holding Global",
      colorPrimario: "#000000",
      colorSecundario: "#000000",
      logoUrl: null,
    });
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText("Correo electrónico"), "empresa-a@crm.test");
    await user.type(screen.getByLabelText("Contraseña"), "clave-segura");
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    const splash = await screen.findByRole("status");
    expect(within(splash).getByText("Empresa A")).toBeInTheDocument();
    expect(within(splash).queryByText("Holding Global")).not.toBeInTheDocument();
  });
});
