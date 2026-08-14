import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, getErrorMessage } from "@/api/httpClient";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { AdminUsuario } from "@/tipos/usuario";

vi.mock("@/funcionalidades/usuarios/usuarios.api", () => ({
  fetchUsuariosApi: vi.fn(),
  createUsuarioApi: vi.fn(),
  updateUsuarioApi: vi.fn(),
  resetPasswordApi: vi.fn(),
  deactivateUsuarioApi: vi.fn(),
  getCargaActivaDeUsuario: vi.fn(),
  getCandidatosReasignacion: vi.fn(),
  reassignCarteraActiva: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const usuariosApi = await import("@/funcionalidades/usuarios/usuarios.api");
const { toast } = await import("sonner");
const { UsuariosPage } = await import("@/funcionalidades/usuarios/UsuariosPage");

const fetchUsuariosApiMock = vi.mocked(usuariosApi.fetchUsuariosApi);
const createUsuarioApiMock = vi.mocked(usuariosApi.createUsuarioApi);
const updateUsuarioApiMock = vi.mocked(usuariosApi.updateUsuarioApi);
const resetPasswordApiMock = vi.mocked(usuariosApi.resetPasswordApi);
const deactivateUsuarioApiMock = vi.mocked(usuariosApi.deactivateUsuarioApi);
const getCargaActivaDeUsuarioMock = vi.mocked(usuariosApi.getCargaActivaDeUsuario);
const getCandidatosReasignacionMock = vi.mocked(usuariosApi.getCandidatosReasignacion);
const reassignCarteraActivaMock = vi.mocked(usuariosApi.reassignCarteraActiva);
const toastSuccessMock = vi.mocked(toast.success);
const toastErrorMock = vi.mocked(toast.error);

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

/** Mismo `mutationCache` que `api/queryClient.ts` -- así las pruebas de error de mutaciones son fieles al comportamiento real. */
function renderUsuariosPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    mutationCache: new MutationCache({
      onError: (error) => toast.error(getErrorMessage(error)),
    }),
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <UsuariosPage />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchUsuariosApiMock.mockReset();
  createUsuarioApiMock.mockReset();
  updateUsuarioApiMock.mockReset();
  resetPasswordApiMock.mockReset();
  deactivateUsuarioApiMock.mockReset();
  getCargaActivaDeUsuarioMock.mockReset();
  getCandidatosReasignacionMock.mockReset();
  reassignCarteraActivaMock.mockReset();
  toastSuccessMock.mockReset();
  toastErrorMock.mockReset();
  getCargaActivaDeUsuarioMock.mockReturnValue(0);
  getCandidatosReasignacionMock.mockReturnValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("UsuariosPage — estados de carga, vacío y error", () => {
  it("muestra un esqueleto de carga mientras llega la respuesta", async () => {
    let resolver: (value: AdminUsuario[]) => void = () => {};
    fetchUsuariosApiMock.mockReturnValue(
      new Promise((resolve) => {
        resolver = resolve;
      }),
    );

    renderUsuariosPage();

    expect(screen.getByRole("status", { name: "Cargando" })).toBeInTheDocument();

    resolver([usuarioFake()]);
    await waitFor(() =>
      expect(screen.queryByRole("status", { name: "Cargando" })).not.toBeInTheDocument(),
    );
  });

  it("muestra un estado vacío honesto cuando no hay usuarios registrados", async () => {
    fetchUsuariosApiMock.mockResolvedValue([]);

    renderUsuariosPage();

    expect(await screen.findByText("Todavía no hay usuarios registrados")).toBeInTheDocument();
  });

  it("muestra un mensaje de error accionable (nunca un código HTTP) con botón de reintentar", async () => {
    fetchUsuariosApiMock.mockRejectedValue(new Error("boom"));

    renderUsuariosPage();

    expect(
      await screen.findByText("Ocurrió un error inesperado. Intentá nuevamente en unos segundos."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });
});

describe("UsuariosPage — listado con rol, estado y carga activa de leads", () => {
  it("muestra nombre, correo, la etiqueta en español del rol, el estado con texto y la carga activa", async () => {
    fetchUsuariosApiMock.mockResolvedValue([usuarioFake()]);
    getCargaActivaDeUsuarioMock.mockReturnValue(3);

    renderUsuariosPage();

    expect(await screen.findByText("Marta Herrera")).toBeInTheDocument();
    expect(screen.getByText("marta@crm.test")).toBeInTheDocument();
    expect(screen.getByText("Asesor")).toBeInTheDocument();
    expect(screen.getByText("Activo")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("muestra «No aplica» en carga activa para administrador/supervisor, sin consultar el mock de leads", async () => {
    fetchUsuariosApiMock.mockResolvedValue([
      usuarioFake({ id: "u2", nombre: "Root Admin", rol: "ADMINISTRADOR" }),
    ]);

    renderUsuariosPage();

    expect(await screen.findByText("Root Admin")).toBeInTheDocument();
    expect(screen.getByText("No aplica")).toBeInTheDocument();
    expect(getCargaActivaDeUsuarioMock).not.toHaveBeenCalled();
  });

  it("un usuario inactivo se muestra con la etiqueta «Inactivo» y «Dar de baja» deshabilitado", async () => {
    fetchUsuariosApiMock.mockResolvedValue([usuarioFake({ activo: false })]);

    renderUsuariosPage();

    expect(await screen.findByText("Inactivo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dar de baja" })).toBeDisabled();
  });
});

describe("UsuariosPage — alta de usuario", () => {
  async function completarFormularioAlta(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "Nuevo usuario" }));
    await user.type(screen.getByLabelText("Nombre"), "Marta Herrera");
    await user.type(screen.getByLabelText("Correo"), "marta@crm.test");
    await user.click(screen.getByRole("combobox", { name: "Rol" }));
    await user.click(await screen.findByRole("option", { name: "Asesor" }));
  }

  it("rechaza una contraseña inicial de menos de 12 caracteres antes de llamar al backend", async () => {
    fetchUsuariosApiMock.mockResolvedValue([]);
    const user = userEvent.setup();
    renderUsuariosPage();
    await screen.findByText("Todavía no hay usuarios registrados");

    await completarFormularioAlta(user);
    await user.type(screen.getByLabelText("Contraseña inicial"), "corta123");
    await user.click(screen.getByRole("button", { name: "Crear usuario" }));

    expect(
      await screen.findByText("La contraseña debe tener al menos 12 caracteres."),
    ).toBeInTheDocument();
    expect(createUsuarioApiMock).not.toHaveBeenCalled();
  });

  it("con datos válidos, llama a createUsuarioApi, avisa éxito y cierra el diálogo", async () => {
    fetchUsuariosApiMock.mockResolvedValue([]);
    createUsuarioApiMock.mockResolvedValue(usuarioFake());
    const user = userEvent.setup();
    renderUsuariosPage();
    await screen.findByText("Todavía no hay usuarios registrados");

    await completarFormularioAlta(user);
    await user.type(screen.getByLabelText("Contraseña inicial"), "una-contraseña-larga-1");
    await user.click(screen.getByRole("button", { name: "Crear usuario" }));

    await waitFor(() =>
      expect(createUsuarioApiMock).toHaveBeenCalledWith({
        nombre: "Marta Herrera",
        correo: "marta@crm.test",
        rol: "ASESOR",
        password: "una-contraseña-larga-1",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(toastSuccessMock).toHaveBeenCalledWith("Usuario creado correctamente.");
  });

  it("si el correo ya está en uso, muestra el mensaje accionable del backend (409 correo_en_uso)", async () => {
    fetchUsuariosApiMock.mockResolvedValue([]);
    createUsuarioApiMock.mockRejectedValue(
      new ApiError("correo_en_uso", 409, "El correo ya está en uso"),
    );
    const user = userEvent.setup();
    renderUsuariosPage();
    await screen.findByText("Todavía no hay usuarios registrados");

    await completarFormularioAlta(user);
    await user.type(screen.getByLabelText("Contraseña inicial"), "una-contraseña-larga-1");
    await user.click(screen.getByRole("button", { name: "Crear usuario" }));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith("El correo ya está en uso"));
  });
});

describe("UsuariosPage — edición de usuario", () => {
  it("precarga los datos actuales y llama a updateUsuarioApi con los cambios (sin contraseña)", async () => {
    fetchUsuariosApiMock.mockResolvedValue([usuarioFake()]);
    updateUsuarioApiMock.mockResolvedValue(usuarioFake({ nombre: "Marta H. Editada" }));
    const user = userEvent.setup();
    renderUsuariosPage();
    await screen.findByText("Marta Herrera");

    await user.click(screen.getByRole("button", { name: "Editar" }));
    const inputNombre = await screen.findByLabelText("Nombre");
    expect(inputNombre).toHaveValue("Marta Herrera");
    expect(screen.getByLabelText("Correo")).toHaveValue("marta@crm.test");
    expect(screen.queryByLabelText(/contraseña/i)).not.toBeInTheDocument();

    await user.clear(inputNombre);
    await user.type(inputNombre, "Marta H. Editada");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() =>
      expect(updateUsuarioApiMock).toHaveBeenCalledWith("u1", {
        nombre: "Marta H. Editada",
        correo: "marta@crm.test",
        rol: "ASESOR",
      }),
    );
    expect(toastSuccessMock).toHaveBeenCalledWith("Usuario actualizado correctamente.");
  });
});

describe("UsuariosPage — restablecimiento de contraseña (F7, sin brecha de backend)", () => {
  it("con contraseñas válidas y coincidentes, llama a resetPasswordApi sin pedir la contraseña actual", async () => {
    fetchUsuariosApiMock.mockResolvedValue([usuarioFake()]);
    resetPasswordApiMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderUsuariosPage();
    await screen.findByText("Marta Herrera");

    await user.click(screen.getByRole("button", { name: "Restablecer contraseña" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByLabelText(/contraseña actual/i)).not.toBeInTheDocument();

    await user.type(within(dialog).getByLabelText("Nueva contraseña"), "otra-contraseña-larga-1");
    await user.type(
      within(dialog).getByLabelText("Confirmar nueva contraseña"),
      "otra-contraseña-larga-1",
    );
    await user.click(within(dialog).getByRole("button", { name: "Restablecer contraseña" }));

    await waitFor(() =>
      expect(resetPasswordApiMock).toHaveBeenCalledWith("u1", "otra-contraseña-larga-1"),
    );
    expect(toastSuccessMock).toHaveBeenCalledWith("Contraseña restablecida correctamente.");
  });

  it("rechaza cuando la confirmación no coincide", async () => {
    fetchUsuariosApiMock.mockResolvedValue([usuarioFake()]);
    const user = userEvent.setup();
    renderUsuariosPage();
    await screen.findByText("Marta Herrera");

    await user.click(screen.getByRole("button", { name: "Restablecer contraseña" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Nueva contraseña"), "contraseña-larga-1");
    await user.type(within(dialog).getByLabelText("Confirmar nueva contraseña"), "otra-diferente-1");
    await user.click(within(dialog).getByRole("button", { name: "Restablecer contraseña" }));

    expect(await within(dialog).findByText("Las contraseñas no coinciden.")).toBeInTheDocument();
    expect(resetPasswordApiMock).not.toHaveBeenCalled();
  });
});

describe("UsuariosPage — baja lógica con reasignación obligatoria de la cartera activa (F7)", () => {
  it("sin cartera activa: la baja se confirma directo, sin reasignar nada", async () => {
    fetchUsuariosApiMock.mockResolvedValue([usuarioFake()]);
    getCargaActivaDeUsuarioMock.mockReturnValue(0);
    deactivateUsuarioApiMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderUsuariosPage();
    await screen.findByText("Marta Herrera");

    await user.click(screen.getByRole("button", { name: "Dar de baja" }));
    expect(
      await screen.findByText(
        "El usuario no podrá volver a iniciar sesión. Esta acción es irreversible.",
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirmar baja" }));

    await waitFor(() => expect(deactivateUsuarioApiMock).toHaveBeenCalledWith("u1"));
    expect(reassignCarteraActivaMock).not.toHaveBeenCalled();
    expect(toastSuccessMock).toHaveBeenCalledWith("Usuario dado de baja correctamente.");
  });

  it("con cartera activa: no deja confirmar sin elegir antes un nuevo responsable", async () => {
    fetchUsuariosApiMock.mockResolvedValue([usuarioFake()]);
    getCargaActivaDeUsuarioMock.mockReturnValue(2);
    getCandidatosReasignacionMock.mockReturnValue([{ id: "asesor-2", nombre: "Julián Peña" }]);
    const user = userEvent.setup();
    renderUsuariosPage();
    await screen.findByText("Marta Herrera");

    await user.click(screen.getByRole("button", { name: "Dar de baja" }));

    expect(await screen.findByText(/tiene 2 leads activos/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar baja" })).toBeDisabled();
    expect(deactivateUsuarioApiMock).not.toHaveBeenCalled();
  });

  it("con cartera activa: al elegir el nuevo responsable, reasigna primero y solo después da de baja", async () => {
    fetchUsuariosApiMock.mockResolvedValue([usuarioFake()]);
    getCargaActivaDeUsuarioMock.mockReturnValue(2);
    getCandidatosReasignacionMock.mockReturnValue([{ id: "asesor-2", nombre: "Julián Peña" }]);
    reassignCarteraActivaMock.mockResolvedValue(undefined);
    deactivateUsuarioApiMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderUsuariosPage();
    await screen.findByText("Marta Herrera");

    await user.click(screen.getByRole("button", { name: "Dar de baja" }));
    await user.click(screen.getByRole("combobox", { name: "Reasignar cartera a" }));
    await user.click(await screen.findByRole("option", { name: "Julián Peña" }));
    await user.click(screen.getByRole("button", { name: "Confirmar baja" }));

    await waitFor(() => expect(reassignCarteraActivaMock).toHaveBeenCalledWith("u1", "asesor-2"));
    await waitFor(() => expect(deactivateUsuarioApiMock).toHaveBeenCalledWith("u1"));
    const ordenReasignacion = reassignCarteraActivaMock.mock.invocationCallOrder[0];
    const ordenBaja = deactivateUsuarioApiMock.mock.invocationCallOrder[0];
    expect(ordenReasignacion).toBeLessThan(ordenBaja);
  });

  it("si la reasignación falla, nunca se llega a llamar a deactivateUsuarioApi (no atómico, brecha documentada)", async () => {
    fetchUsuariosApiMock.mockResolvedValue([usuarioFake()]);
    getCargaActivaDeUsuarioMock.mockReturnValue(2);
    getCandidatosReasignacionMock.mockReturnValue([{ id: "asesor-2", nombre: "Julián Peña" }]);
    reassignCarteraActivaMock.mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    renderUsuariosPage();
    await screen.findByText("Marta Herrera");

    await user.click(screen.getByRole("button", { name: "Dar de baja" }));
    await user.click(screen.getByRole("combobox", { name: "Reasignar cartera a" }));
    await user.click(await screen.findByRole("option", { name: "Julián Peña" }));
    await user.click(screen.getByRole("button", { name: "Confirmar baja" }));

    await waitFor(() => expect(reassignCarteraActivaMock).toHaveBeenCalled());
    expect(deactivateUsuarioApiMock).not.toHaveBeenCalled();
  });
});
