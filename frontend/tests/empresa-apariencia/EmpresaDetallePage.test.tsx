import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/httpClient";
import type { EmpresaAparienciaHoldingView } from "@/funcionalidades/empresa-apariencia/empresa-apariencia-holding.api";
import type { RolUsuario } from "@/tipos/usuario";

vi.mock("@/funcionalidades/empresa-apariencia/empresa-apariencia-holding.api", () => ({
  fetchEmpresaHoldingApi: vi.fn(),
}));
// "Ver en vivo": solo se mockea `useNavigate` -- `MemoryRouter`/`Routes`/
// `Route`/`Link` (usados por el resto de este archivo) siguen siendo los
// reales, mismo criterio que `CargaMasivaLeadsDialog.test.tsx` para mockear
// parcialmente un módulo.
const navigateMock = vi.fn();
vi.mock("react-router", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-router")>();
  return { ...original, useNavigate: () => navigateMock };
});
vi.mock("@/funcionalidades/empresa-apariencia/useVistaEmpresa", () => ({
  useVistaEmpresa: vi.fn(),
}));
vi.mock("@/funcionalidades/autenticacion/auth-context", () => ({ useAuth: vi.fn() }));
vi.mock("@/funcionalidades/usuarios/usuarios.api", () => ({
  createEmpresaAdministradorApi: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const empresaAparienciaHoldingApi = await import(
  "@/funcionalidades/empresa-apariencia/empresa-apariencia-holding.api"
);
const { useVistaEmpresa } = await import("@/funcionalidades/empresa-apariencia/useVistaEmpresa");
const { useAuth } = await import("@/funcionalidades/autenticacion/auth-context");
const usuariosApi = await import("@/funcionalidades/usuarios/usuarios.api");
const { toast } = await import("sonner");
const { EmpresaDetallePage } = await import(
  "@/funcionalidades/empresa-apariencia/EmpresaDetallePage"
);

const fetchEmpresaHoldingApiMock = vi.mocked(empresaAparienciaHoldingApi.fetchEmpresaHoldingApi);
const useVistaEmpresaMock = vi.mocked(useVistaEmpresa);
const useAuthMock = vi.mocked(useAuth);
const createEmpresaAdministradorApiMock = vi.mocked(usuariosApi.createEmpresaAdministradorApi);

const entrarAEmpresaMock = vi.fn();
const salirDeEmpresaMock = vi.fn();

/**
 * Helper de rol -- mismo criterio que `ProductosAdminDialog.test.tsx`: un
 * `hasRole` mínimo que solo verifica pertenencia al array de roles permitidos.
 */
function mockUseAuth(rol: RolUsuario) {
  useAuthMock.mockReturnValue({
    user: null,
    isLoading: false,
    isLoginPending: false,
    login: vi.fn(),
    logout: vi.fn(),
    hasRole: (allowedRoles?: readonly RolUsuario[]) =>
      !allowedRoles || allowedRoles.length === 0 || allowedRoles.includes(rol),
  } as unknown as ReturnType<typeof useAuth>);
}

function empresaFake(overrides: Partial<EmpresaAparienciaHoldingView> = {}): EmpresaAparienciaHoldingView {
  return {
    id: "e1",
    nombre: "Empresa A",
    colorPrimario: "#7c2d12",
    colorSecundario: "#f97316",
    logoUrl: null,
    ...overrides,
  };
}

beforeEach(() => {
  fetchEmpresaHoldingApiMock.mockReset();
  // Default sano para tests que no dependen del fetch puntual (ej. empresaId
  // ausente, donde el componente nunca debería llegar a leer el resultado)
  // -- evita el warning de TanStack Query por una query sin resolver.
  fetchEmpresaHoldingApiMock.mockResolvedValue(empresaFake());
  entrarAEmpresaMock.mockReset();
  salirDeEmpresaMock.mockReset();
  useVistaEmpresaMock.mockReturnValue({
    empresaVistaId: null,
    entrarAEmpresa: entrarAEmpresaMock,
    salirDeEmpresa: salirDeEmpresaMock,
  });
  createEmpresaAdministradorApiMock.mockReset();
  navigateMock.mockReset();
  mockUseAuth("ADMINISTRADOR");
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * `EmpresaDetallePage` se monta hoy en `/empresas/:empresaId` -- por defecto
 * renderiza con ese param presente y resuelto (`e1`). El caso de param
 * ausente tiene su propio helper (`renderSinEmpresaId`) porque necesita una
 * ruta distinta, sin `:empresaId` en el path.
 */
function renderPage(rutaInicial = "/empresas/e1") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[rutaInicial]}>
        <Routes>
          <Route path="/empresas/:empresaId" element={<EmpresaDetallePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderSinEmpresaId() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/empresas"]}>
        <Routes>
          <Route path="/empresas" element={<EmpresaDetallePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("EmpresaDetallePage — flujo principal", () => {
  it("muestra un estado de carga mientras se resuelve la empresa", () => {
    fetchEmpresaHoldingApiMock.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByRole("status", { name: "Cargando" })).toBeInTheDocument();
  });

  it("muestra un mensaje accionable y permite reintentar cuando falla la carga", async () => {
    fetchEmpresaHoldingApiMock.mockRejectedValue(new Error("network error"));
    renderPage();

    expect(await screen.findByText("No se pudo completar la operación")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });

  it("renderiza el nombre, el isotipo y los dos links de acceso de la empresa encontrada", async () => {
    fetchEmpresaHoldingApiMock.mockResolvedValue(
      empresaFake({ id: "e1", nombre: "Empresa A", logoUrl: "https://cdn.test/e1.png" }),
    );
    const { container } = renderPage();

    expect(await screen.findByRole("heading", { name: "Empresa A" })).toBeInTheDocument();
    // El isotipo es decorativo (`alt=""`), sin role="img" accesible -- se
    // busca por tag directo en vez de por rol.
    expect(container.querySelector("img")).toHaveAttribute("src", "https://cdn.test/e1.png");

    const usuarios = screen.getByRole("link", { name: /usuarios/i });
    expect(usuarios).toHaveAttribute("href", "/empresas/e1/usuarios");

    const bridges = screen.getByRole("link", { name: /bridges/i });
    expect(bridges).toHaveAttribute("href", "/empresas/e1/bridges");
  });
});

describe("EmpresaDetallePage — punto frágil: empresa inexistente (404 del backend)", () => {
  it("si el backend responde empresa_no_encontrada, muestra el mensaje accionable sin quedar en loading infinito", async () => {
    fetchEmpresaHoldingApiMock.mockRejectedValue(
      new ApiError("empresa_no_encontrada", 404, "La empresa indicada no existe"),
    );
    renderPage("/empresas/e1");

    expect(await screen.findByText("La empresa indicada no existe")).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Cargando" })).not.toBeInTheDocument();
  });
});

describe("EmpresaDetallePage — alta de administrador de empresa (Item 23)", () => {
  it("muestra el disparador «Nuevo administrador» para ADMINISTRADOR y abre el diálogo al hacer clic", async () => {
    const user = userEvent.setup();
    fetchEmpresaHoldingApiMock.mockResolvedValue(empresaFake({ id: "e1", nombre: "Empresa A" }));
    renderPage("/empresas/e1");

    await screen.findByRole("heading", { name: "Empresa A" });
    const disparador = screen.getByRole("button", { name: /nuevo administrador/i });
    expect(disparador).toBeInTheDocument();

    await user.click(disparador);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crear administrador" })).toBeInTheDocument();
  });

  it("no muestra el disparador para un rol sin permiso (no ADMINISTRADOR)", async () => {
    mockUseAuth("SUPERVISOR");
    fetchEmpresaHoldingApiMock.mockResolvedValue(empresaFake({ id: "e1", nombre: "Empresa A" }));
    renderPage("/empresas/e1");

    await screen.findByRole("heading", { name: "Empresa A" });
    expect(screen.queryByRole("button", { name: /nuevo administrador/i })).not.toBeInTheDocument();
  });

  it("al enviar el formulario, llama a la mutación con el `empresaId` de la página y avisa con un toast", async () => {
    const user = userEvent.setup();
    fetchEmpresaHoldingApiMock.mockResolvedValue(empresaFake({ id: "e1", nombre: "Empresa A" }));
    createEmpresaAdministradorApiMock.mockResolvedValue({
      id: "u1",
      nombre: "Ana Gómez",
      correo: "ana@crm.test",
      rol: "ADMINISTRADOR",
      activo: true,
      creadoEn: "2026-08-30T00:00:00.000Z",
      actualizadoEn: "2026-08-30T00:00:00.000Z",
    });
    renderPage("/empresas/e1");

    await screen.findByRole("heading", { name: "Empresa A" });
    await user.click(screen.getByRole("button", { name: /nuevo administrador/i }));

    await user.type(screen.getByLabelText("Nombre"), "Ana Gómez");
    await user.type(screen.getByLabelText("Correo"), "ana@crm.test");
    await user.type(screen.getByLabelText("Contraseña inicial"), "una-contraseña-larga-1");
    await user.click(screen.getByRole("button", { name: "Crear administrador" }));

    await waitFor(() =>
      expect(createEmpresaAdministradorApiMock).toHaveBeenCalledWith("e1", {
        nombre: "Ana Gómez",
        correo: "ana@crm.test",
        password: "una-contraseña-larga-1",
      }),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Administrador creado correctamente."));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Crear administrador" })).not.toBeInTheDocument(),
    );
  });
});

describe("EmpresaDetallePage — punto frágil: empresaId ausente en la URL", () => {
  it("muestra el error de identificador faltante y no llama a entrarAEmpresa", () => {
    renderSinEmpresaId();

    expect(screen.getByText("Falta el identificador de la empresa en la URL.")).toBeInTheDocument();
    expect(entrarAEmpresaMock).not.toHaveBeenCalled();
  });
});

describe("EmpresaDetallePage — 'Ver en vivo'", () => {
  beforeEach(() => {
    // `shouldAdvanceTime` deja que `findBy*` (que internamente poll-ea con
    // `setTimeout` real) siga funcionando bajo fake timers -- mismo criterio
    // que `ConectarWhatsAppCard.test.tsx` para combinar ambos.
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("muestra el disparador «Ver en vivo» junto a los demás accesos", async () => {
    fetchEmpresaHoldingApiMock.mockResolvedValue(empresaFake({ id: "e1", nombre: "Empresa A" }));
    renderPage("/empresas/e1");

    await screen.findByRole("heading", { name: "Empresa A" });
    expect(screen.getByRole("button", { name: /ver en vivo/i })).toBeInTheDocument();
  });

  it("al hacer clic, muestra la cortina de transición con la marca de la empresa y NO navega todavía", async () => {
    fetchEmpresaHoldingApiMock.mockResolvedValue(
      empresaFake({
        id: "e1",
        nombre: "Empresa A",
        colorPrimario: "#7c2d12",
        colorSecundario: "#f97316",
      }),
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPage("/empresas/e1");

    await screen.findByRole("heading", { name: "Empresa A" });
    await user.click(screen.getByRole("button", { name: /ver en vivo/i }));

    const splash = screen.getByRole("status");
    expect(splash).toHaveTextContent("Empresa A");
    expect(splash.style.getPropertyValue("--marca-color-1")).toBe("#7c2d12");
    expect(splash.style.getPropertyValue("--marca-color-2")).toBe("#f97316");
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("navega a /panel?empresaId= recién después de la misma duración que AppBoot.tsx (~1500ms), nunca antes", async () => {
    fetchEmpresaHoldingApiMock.mockResolvedValue(empresaFake({ id: "e1", nombre: "Empresa A" }));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPage("/empresas/e1");

    await screen.findByRole("heading", { name: "Empresa A" });
    await user.click(screen.getByRole("button", { name: /ver en vivo/i }));

    // No navega de inmediato al hacer clic -- la cortina se sostiene primero.
    expect(navigateMock).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(navigateMock).toHaveBeenCalledWith("/panel?empresaId=e1");
  });

  it("el ícono de «Ver en vivo» tiene tratamiento visual distinguido (círculo rojo tipo hero)", async () => {
    fetchEmpresaHoldingApiMock.mockResolvedValue(empresaFake({ id: "e1", nombre: "Empresa A" }));
    renderPage("/empresas/e1");

    await screen.findByRole("heading", { name: "Empresa A" });
    const disparador = screen.getByRole("button", { name: /ver en vivo/i });
    const circulo = disparador.querySelector("svg")?.parentElement;

    expect(circulo).toHaveClass("bg-destructive", "rounded-full");
  });

  it("empresa sin marca propia (colores null) cae al default de fábrica, nunca a un color inválido en la cortina", async () => {
    fetchEmpresaHoldingApiMock.mockResolvedValue(
      empresaFake({ id: "e1", nombre: "Empresa A", colorPrimario: null, colorSecundario: null }),
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPage("/empresas/e1");

    await screen.findByRole("heading", { name: "Empresa A" });
    await user.click(screen.getByRole("button", { name: /ver en vivo/i }));

    const splash = screen.getByRole("status");
    expect(splash.style.getPropertyValue("--marca-color-1")).not.toBe("");
    expect(splash.style.getPropertyValue("--marca-color-2")).not.toBe("");
  });
});

describe("EmpresaDetallePage — punto frágil: efecto de entrar/salir de la vista de empresa", () => {
  it("al montar con un empresaId válido llama a entrarAEmpresa una sola vez, incluso tras re-renders por la carga de datos", async () => {
    fetchEmpresaHoldingApiMock.mockResolvedValue(empresaFake({ id: "e1", nombre: "Empresa A" }));
    renderPage("/empresas/e1");

    // Espera a que la carga termine (loading -> success ya disparó sus re-renders).
    await screen.findByRole("heading", { name: "Empresa A" });

    expect(entrarAEmpresaMock).toHaveBeenCalledTimes(1);
    expect(entrarAEmpresaMock).toHaveBeenCalledWith("e1");
    expect(salirDeEmpresaMock).not.toHaveBeenCalled();
  });

  it("al desmontar, llama a salirDeEmpresa", async () => {
    fetchEmpresaHoldingApiMock.mockResolvedValue(empresaFake({ id: "e1", nombre: "Empresa A" }));
    const { unmount } = renderPage("/empresas/e1");
    await screen.findByRole("heading", { name: "Empresa A" });

    unmount();

    await waitFor(() => expect(salirDeEmpresaMock).toHaveBeenCalledTimes(1));
  });
});
