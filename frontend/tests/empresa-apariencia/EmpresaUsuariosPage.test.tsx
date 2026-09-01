import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, getErrorMessage } from "@/api/httpClient";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { EmpresaAparienciaHoldingView } from "@/funcionalidades/empresa-apariencia/empresa-apariencia-holding.api";
import { PageHeaderProvider, usePageHeaderValue } from "@/layouts/PageHeaderContext";
import type { UsuariosResponse } from "@/funcionalidades/usuarios/usuarios.api";
import type { AdminUsuario } from "@/tipos/usuario";

vi.mock("@/funcionalidades/empresa-apariencia/empresa-apariencia-holding.api", () => ({
  fetchEmpresaHoldingApi: vi.fn(),
}));
vi.mock("@/funcionalidades/usuarios/usuarios.api", () => ({
  fetchUsuariosApi: vi.fn(),
  createEmpresaAdministradorApi: vi.fn(),
  createEmpresaSupervisorApi: vi.fn(),
  createEmpresaAsesorApi: vi.fn(),
  updateUsuarioApi: vi.fn(),
  resetPasswordApi: vi.fn(),
  deactivateUsuarioApi: vi.fn(),
  reactivateUsuarioApi: vi.fn(),
  getCargaActivaDeUsuario: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// `UsuariosFiltros` (reusado tal cual) llama a `useAuth()` para el toggle
// "solo holding-wide" -- se mockea con sessionScope "holding" a propósito
// (esta pantalla solo es alcanzable por una sesión holding-wide, gate de
// ruta en `router.tsx`) para probar que el toggle queda oculto IGUAL, pese a
// ese scope (`mostrarFiltroHoldingWide={false}`).
vi.mock("@/funcionalidades/autenticacion/auth-context", () => ({
  useAuth: vi.fn(),
}));

const empresaAparienciaHoldingApi = await import(
  "@/funcionalidades/empresa-apariencia/empresa-apariencia-holding.api"
);
const usuariosApi = await import("@/funcionalidades/usuarios/usuarios.api");
const { toast } = await import("sonner");
const { useAuth } = await import("@/funcionalidades/autenticacion/auth-context");
const { EmpresaUsuariosPage } = await import(
  "@/funcionalidades/empresa-apariencia/EmpresaUsuariosPage"
);

const fetchEmpresaHoldingApiMock = vi.mocked(empresaAparienciaHoldingApi.fetchEmpresaHoldingApi);
const fetchUsuariosApiMock = vi.mocked(usuariosApi.fetchUsuariosApi);
const createEmpresaAdministradorApiMock = vi.mocked(usuariosApi.createEmpresaAdministradorApi);
const createEmpresaSupervisorApiMock = vi.mocked(usuariosApi.createEmpresaSupervisorApi);
const createEmpresaAsesorApiMock = vi.mocked(usuariosApi.createEmpresaAsesorApi);
const getCargaActivaDeUsuarioMock = vi.mocked(usuariosApi.getCargaActivaDeUsuario);
const toastSuccessMock = vi.mocked(toast.success);
const toastErrorMock = vi.mocked(toast.error);
const useAuthMock = vi.mocked(useAuth);

function mockearAuth(sessionScope: "company" | "holding" = "holding") {
  useAuthMock.mockReturnValue({
    user: {
      id: "admin-1",
      nombre: "Admin",
      correo: "admin@crm.test",
      rol: "ADMINISTRADOR",
      sessionScope,
      empresaId: sessionScope === "company" ? "empresa-1" : null,
      empresaNombre: null,
      empresaColorPrimario: null,
      empresaColorSecundario: null,
      empresaLogoUrl: null,
    },
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    hasRole: () => true,
  });
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

function usuarioFake(overrides: Partial<AdminUsuario> = {}): AdminUsuario {
  return {
    id: "u1",
    nombre: "Marta Herrera",
    correo: "marta@crm.test",
    rol: "ASESOR",
    activo: true,
    creadoEn: new Date().toISOString(),
    actualizadoEn: new Date().toISOString(),
    ...overrides,
  };
}

function usuariosResponse(
  users: AdminUsuario[],
  overrides: Partial<Omit<UsuariosResponse, "users">> = {},
): UsuariosResponse {
  return { users, total: users.length, pagina: 1, limite: 10, ...overrides };
}

/** Expone el header publicado por la página en un `data-testid`, mismo criterio que `Header.test.tsx`. */
function EncabezadoDebug() {
  const header = usePageHeaderValue();
  return (
    <div data-testid="encabezado-debug">
      {header ? `${header.title}|${header.backTo?.label ?? ""}|${header.backTo?.href ?? ""}` : ""}
    </div>
  );
}

function renderPage(rutaInicial = "/empresas/e1/usuarios") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    mutationCache: new MutationCache({
      onError: (error) => toast.error(getErrorMessage(error)),
    }),
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[rutaInicial]}>
        <TooltipProvider>
          <PageHeaderProvider>
            <EncabezadoDebug />
            <Routes>
              <Route path="/empresas/:empresaId/usuarios" element={<EmpresaUsuariosPage />} />
            </Routes>
          </PageHeaderProvider>
        </TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchEmpresaHoldingApiMock.mockReset();
  fetchEmpresaHoldingApiMock.mockResolvedValue(empresaFake());
  fetchUsuariosApiMock.mockReset();
  createEmpresaAdministradorApiMock.mockReset();
  createEmpresaSupervisorApiMock.mockReset();
  createEmpresaAsesorApiMock.mockReset();
  getCargaActivaDeUsuarioMock.mockReset();
  getCargaActivaDeUsuarioMock.mockReturnValue(0);
  toastSuccessMock.mockReset();
  toastErrorMock.mockReset();
  useAuthMock.mockReset();
  mockearAuth("holding");
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** `etiquetaRol` es la etiqueta en español mostrada en el `<Select>` de rol (ver `catalogos.ts::ROL_ETIQUETAS`). */
async function completarFormularioAlta(
  user: ReturnType<typeof userEvent.setup>,
  etiquetaRol: "Administrador" | "Supervisor" | "Asesor" = "Asesor",
) {
  await user.click(screen.getByRole("button", { name: "Nuevo usuario" }));
  await user.type(screen.getByLabelText("Nombre"), "Marta Herrera");
  await user.type(screen.getByLabelText("Correo"), "marta@crm.test");
  await user.click(screen.getByRole("combobox", { name: "Rol" }));
  await user.click(await screen.findByRole("option", { name: etiquetaRol }));
}

describe("EmpresaUsuariosPage — empresa puntual (empresaId fijo por la ruta, NO useVistaEmpresa)", () => {
  it("muestra un estado de carga mientras se resuelve la empresa", () => {
    fetchEmpresaHoldingApiMock.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByRole("status", { name: "Cargando" })).toBeInTheDocument();
  });

  it("muestra un mensaje accionable con botón de reintentar si falla la carga de la empresa", async () => {
    fetchEmpresaHoldingApiMock.mockRejectedValue(
      new ApiError("empresa_no_encontrada", 404, "La empresa indicada no existe"),
    );
    renderPage();

    expect(await screen.findByText("La empresa indicada no existe")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });

  it("publica el título «Usuarios de {empresa}» con el breadcrumb de vuelta al detalle de esa empresa", async () => {
    fetchEmpresaHoldingApiMock.mockResolvedValue(empresaFake({ id: "e1", nombre: "Empresa A" }));
    fetchUsuariosApiMock.mockResolvedValue(usuariosResponse([]));
    renderPage();

    await waitFor(() =>
      expect(screen.getByTestId("encabezado-debug")).toHaveTextContent(
        "Usuarios de Empresa A|Empresa A|/empresas/e1",
      ),
    );
  });

  it("lista los usuarios de la empresa del path (fetchUsuariosApi recibe `empresaId: e1`), sin depender del query string", async () => {
    fetchUsuariosApiMock.mockResolvedValue(usuariosResponse([usuarioFake()]));
    renderPage();

    expect(await screen.findByText("Marta Herrera")).toBeInTheDocument();
    expect(fetchUsuariosApiMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ empresaId: "e1" }),
    );
  });

  it("muestra un estado vacío distinto (menciona la empresa) cuando no hay usuarios", async () => {
    fetchUsuariosApiMock.mockResolvedValue(usuariosResponse([]));
    renderPage();

    expect(
      await screen.findByText("Todavía no hay usuarios registrados en esta empresa"),
    ).toBeInTheDocument();
  });

  it("muestra un mensaje de error accionable si falla el listado de usuarios", async () => {
    fetchUsuariosApiMock.mockRejectedValue(new Error("boom"));
    renderPage();

    expect(
      await screen.findByText("Ocurrió un error inesperado. Intenta nuevamente en unos segundos."),
    ).toBeInTheDocument();
  });

  it("con una empresa distinta en la URL (e2), fetchUsuariosApi recibe `empresaId: e2`", async () => {
    fetchEmpresaHoldingApiMock.mockResolvedValue(empresaFake({ id: "e2", nombre: "Empresa B" }));
    fetchUsuariosApiMock.mockResolvedValue(usuariosResponse([]));
    renderPage("/empresas/e2/usuarios");

    await waitFor(() => {
      expect(fetchUsuariosApiMock.mock.calls.at(-1)?.[0]).toEqual(
        expect.objectContaining({ empresaId: "e2" }),
      );
    });
  });
});

describe("EmpresaUsuariosPage — toggle «solo holding-wide» nunca se muestra acá (Item 25 no aplica dentro del drill-down de una empresa)", () => {
  it("con sesión holding-wide (la única que puede llegar a esta ruta), el toggle no aparece en el popover de filtros", async () => {
    fetchUsuariosApiMock.mockResolvedValue(usuariosResponse([usuarioFake()]));
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Marta Herrera");

    await user.click(screen.getByRole("button", { name: "Filtros" }));

    expect(screen.queryByRole("checkbox", { name: /holding-wide/i })).not.toBeInTheDocument();
  });
});

describe("EmpresaUsuariosPage — cada rol va por su ruta dedicada de empresa, NUNCA por POST /usuarios genérico", () => {
  it("rol Administrador llama a createEmpresaAdministradorApi('e1', {...}), sin rol en el body", async () => {
    fetchUsuariosApiMock.mockResolvedValue(usuariosResponse([]));
    createEmpresaAdministradorApiMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Todavía no hay usuarios registrados en esta empresa");

    await completarFormularioAlta(user, "Administrador");
    await user.type(screen.getByLabelText("Contraseña inicial"), "una-contraseña-larga-1");
    await user.click(screen.getByRole("button", { name: "Crear usuario" }));

    await waitFor(() =>
      expect(createEmpresaAdministradorApiMock).toHaveBeenCalledWith("e1", {
        nombre: "Marta Herrera",
        correo: "marta@crm.test",
        password: "una-contraseña-larga-1",
      }),
    );
    expect(createEmpresaSupervisorApiMock).not.toHaveBeenCalled();
    expect(createEmpresaAsesorApiMock).not.toHaveBeenCalled();
    expect(toastSuccessMock).toHaveBeenCalledWith("Administrador creado correctamente.");
  });

  it("rol Supervisor llama a createEmpresaSupervisorApi('e1', {...}), sin rol en el body", async () => {
    fetchUsuariosApiMock.mockResolvedValue(usuariosResponse([]));
    createEmpresaSupervisorApiMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Todavía no hay usuarios registrados en esta empresa");

    await completarFormularioAlta(user, "Supervisor");
    await user.type(screen.getByLabelText("Contraseña inicial"), "una-contraseña-larga-1");
    await user.click(screen.getByRole("button", { name: "Crear usuario" }));

    await waitFor(() =>
      expect(createEmpresaSupervisorApiMock).toHaveBeenCalledWith("e1", {
        nombre: "Marta Herrera",
        correo: "marta@crm.test",
        password: "una-contraseña-larga-1",
      }),
    );
    expect(createEmpresaAdministradorApiMock).not.toHaveBeenCalled();
    expect(createEmpresaAsesorApiMock).not.toHaveBeenCalled();
    expect(toastSuccessMock).toHaveBeenCalledWith("Supervisor creado correctamente.");
  });

  it("rol Asesor llama a createEmpresaAsesorApi('e1', {...}), sin rol en el body", async () => {
    fetchUsuariosApiMock.mockResolvedValue(usuariosResponse([]));
    createEmpresaAsesorApiMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Todavía no hay usuarios registrados en esta empresa");

    await completarFormularioAlta(user, "Asesor");
    await user.type(screen.getByLabelText("Contraseña inicial"), "una-contraseña-larga-1");
    await user.click(screen.getByRole("button", { name: "Crear usuario" }));

    await waitFor(() =>
      expect(createEmpresaAsesorApiMock).toHaveBeenCalledWith("e1", {
        nombre: "Marta Herrera",
        correo: "marta@crm.test",
        password: "una-contraseña-larga-1",
      }),
    );
    expect(createEmpresaAdministradorApiMock).not.toHaveBeenCalled();
    expect(createEmpresaSupervisorApiMock).not.toHaveBeenCalled();
    expect(toastSuccessMock).toHaveBeenCalledWith("Asesor creado correctamente.");
  });

  it("si el correo ya está en uso, muestra el mensaje accionable del backend (409 correo_en_uso)", async () => {
    fetchUsuariosApiMock.mockResolvedValue(usuariosResponse([]));
    createEmpresaAsesorApiMock.mockRejectedValue(
      new ApiError("correo_en_uso", 409, "El correo ya está en uso"),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Todavía no hay usuarios registrados en esta empresa");

    await completarFormularioAlta(user, "Asesor");
    await user.type(screen.getByLabelText("Contraseña inicial"), "una-contraseña-larga-1");
    await user.click(screen.getByRole("button", { name: "Crear usuario" }));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith("El correo ya está en uso"));
  });
});
