import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, getErrorMessage } from "@/api/httpClient";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { UsuariosResponse } from "@/funcionalidades/usuarios/usuarios.api";
import type { AdminUsuario } from "@/tipos/usuario";

vi.mock("@/funcionalidades/usuarios/usuarios.api", () => ({
  fetchUsuariosApi: vi.fn(),
  createUsuarioApi: vi.fn(),
  updateUsuarioApi: vi.fn(),
  resetPasswordApi: vi.fn(),
  deactivateUsuarioApi: vi.fn(),
  reactivateUsuarioApi: vi.fn(),
  getCargaActivaDeUsuario: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// `UsuariosFiltros` ahora llama a `useAuth()` para gatear el toggle "solo
// holding-wide" (Item 25) -- se mockea acá también, default company-scoped
// (mismo criterio que `tests/oportunidades/OportunidadesFiltros.test.tsx`),
// para no romper ninguno de los tests existentes que no le importa el scope.
vi.mock("@/funcionalidades/autenticacion/auth-context", () => ({
  useAuth: vi.fn(),
}));

const usuariosApi = await import("@/funcionalidades/usuarios/usuarios.api");
const { toast } = await import("sonner");
const { useAuth } = await import("@/funcionalidades/autenticacion/auth-context");
const { UsuariosPage } = await import("@/funcionalidades/usuarios/UsuariosPage");

const fetchUsuariosApiMock = vi.mocked(usuariosApi.fetchUsuariosApi);
const createUsuarioApiMock = vi.mocked(usuariosApi.createUsuarioApi);
const updateUsuarioApiMock = vi.mocked(usuariosApi.updateUsuarioApi);
const resetPasswordApiMock = vi.mocked(usuariosApi.resetPasswordApi);
const deactivateUsuarioApiMock = vi.mocked(usuariosApi.deactivateUsuarioApi);
const reactivateUsuarioApiMock = vi.mocked(usuariosApi.reactivateUsuarioApi);
const getCargaActivaDeUsuarioMock = vi.mocked(usuariosApi.getCargaActivaDeUsuario);
const toastSuccessMock = vi.mocked(toast.success);
const toastErrorMock = vi.mocked(toast.error);
const useAuthMock = vi.mocked(useAuth);

function mockearAuth(sessionScope: "company" | "holding" = "company") {
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

/** Envoltura de la respuesta paginada real (F7) -- por defecto asume que `users` es la página completa. */
function usuariosResponse(
  users: AdminUsuario[],
  overrides: Partial<Omit<UsuariosResponse, "users">> = {},
): UsuariosResponse {
  return { users, total: users.length, pagina: 1, limite: 10, ...overrides };
}

/**
 * Mismo `mutationCache` que `api/queryClient.ts` -- así las pruebas de error
 * de mutaciones son fieles al comportamiento real. `initialEntries` permite
 * simular la "vista de empresa" de un holding-wide (`useVistaEmpresa`,
 * llegada real vía `EmpresaDetallePage.tsx` -> tarjeta "Usuarios" ->
 * `/usuarios?empresaId=`).
 */
function renderUsuariosPage(initialEntries: string[] = ["/usuarios"]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    mutationCache: new MutationCache({
      onError: (error) => toast.error(getErrorMessage(error)),
    }),
  });
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <UsuariosPage />
        </TooltipProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  fetchUsuariosApiMock.mockReset();
  createUsuarioApiMock.mockReset();
  updateUsuarioApiMock.mockReset();
  resetPasswordApiMock.mockReset();
  deactivateUsuarioApiMock.mockReset();
  reactivateUsuarioApiMock.mockReset();
  getCargaActivaDeUsuarioMock.mockReset();
  toastSuccessMock.mockReset();
  toastErrorMock.mockReset();
  getCargaActivaDeUsuarioMock.mockReturnValue(0);
  useAuthMock.mockReset();
  mockearAuth("company");
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Abre el menú de acciones (icono `MoreHorizontal`) de la fila de `nombre`
 * -- reemplaza los botones sueltos que tenía la tabla antes (ver
 * `UsuariosTable.tsx`).
 */
async function abrirMenuAcciones(user: ReturnType<typeof userEvent.setup>, nombre: string) {
  await user.click(screen.getByRole("button", { name: `Acciones de ${nombre}` }));
}

async function abrirFiltros(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Filtros" }));
}

/** Completa nombre/correo/rol del formulario de alta (queda pendiente la contraseña, distinta por test). */
async function completarFormularioAlta(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Nuevo usuario" }));
  await user.type(screen.getByLabelText("Nombre"), "Marta Herrera");
  await user.type(screen.getByLabelText("Correo"), "marta@crm.test");
  await user.click(screen.getByRole("combobox", { name: "Rol" }));
  await user.click(await screen.findByRole("option", { name: "Asesor" }));
}

describe("UsuariosPage — estados de carga, vacío y error", () => {
  it("muestra un esqueleto de carga mientras llega la respuesta", async () => {
    let resolver: (value: UsuariosResponse) => void = () => {};
    fetchUsuariosApiMock.mockReturnValue(
      new Promise((resolve) => {
        resolver = resolve;
      }),
    );

    renderUsuariosPage();

    expect(screen.getByRole("status", { name: "Cargando" })).toBeInTheDocument();

    resolver(usuariosResponse([usuarioFake()]));
    await waitFor(() =>
      expect(screen.queryByRole("status", { name: "Cargando" })).not.toBeInTheDocument(),
    );
  });

  it("muestra un estado vacío honesto cuando no hay usuarios registrados", async () => {
    fetchUsuariosApiMock.mockResolvedValue(usuariosResponse([]));

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
    fetchUsuariosApiMock.mockResolvedValue(usuariosResponse([usuarioFake()]));
    getCargaActivaDeUsuarioMock.mockReturnValue(3);

    renderUsuariosPage();

    expect(await screen.findByText("Marta Herrera")).toBeInTheDocument();
    expect(screen.getByText("marta@crm.test")).toBeInTheDocument();
    expect(screen.getByText("Asesor")).toBeInTheDocument();
    expect(screen.getByText("Activo")).toBeInTheDocument();
    // Backend real vía `useCargaActivaDeUsuario` (integración F3/F4): la
    // celda arranca en "…" (isLoading) y resuelve async -- `findByText`.
    expect(await screen.findByText("3")).toBeInTheDocument();
  });

  it("muestra «No aplica» en carga activa para administrador/supervisor, sin consultar el mock de leads", async () => {
    fetchUsuariosApiMock.mockResolvedValue(
      usuariosResponse([usuarioFake({ id: "u2", nombre: "Root Admin", rol: "ADMINISTRADOR" })]),
    );

    renderUsuariosPage();

    expect(await screen.findByText("Root Admin")).toBeInTheDocument();
    expect(screen.getByText("No aplica")).toBeInTheDocument();
    expect(getCargaActivaDeUsuarioMock).not.toHaveBeenCalled();
  });

  it("un usuario inactivo se muestra con la etiqueta «Inactivo» y el menú de acciones ofrece «Reactivar» en vez de «Dar de baja»", async () => {
    fetchUsuariosApiMock.mockResolvedValue(usuariosResponse([usuarioFake({ activo: false })]));
    const user = userEvent.setup();

    renderUsuariosPage();

    expect(await screen.findByText("Inactivo")).toBeInTheDocument();

    await abrirMenuAcciones(user, "Marta Herrera");
    expect(await screen.findByRole("menuitem", { name: "Reactivar" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Dar de baja" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Restablecer contraseña" })).not.toBeInTheDocument();
  });
});

describe("UsuariosPage — filtro (búsqueda, rol, estado, F7)", () => {
  it("escribir en el buscador manda `busqueda` a fetchUsuariosApi y reinicia la página a 1", async () => {
    fetchUsuariosApiMock.mockResolvedValue(usuariosResponse([usuarioFake()]));
    const user = userEvent.setup();
    renderUsuariosPage();
    await screen.findByText("Marta Herrera");

    await user.type(screen.getByLabelText("Buscar usuarios"), "marta");

    await waitFor(() => {
      const ultimaLlamada = fetchUsuariosApiMock.mock.calls.at(-1)?.[0];
      expect(ultimaLlamada?.busqueda).toBe("marta");
      expect(ultimaLlamada?.pagina).toBe(1);
    });
  });

  it("elegir un rol manda `rol` a fetchUsuariosApi", async () => {
    fetchUsuariosApiMock.mockResolvedValue(usuariosResponse([usuarioFake()]));
    const user = userEvent.setup();
    renderUsuariosPage();
    await screen.findByText("Marta Herrera");

    await abrirFiltros(user);
    await user.click(screen.getByRole("combobox", { name: "Rol" }));
    await user.click(await screen.findByRole("option", { name: "Supervisor" }));

    await waitFor(() => {
      const ultimaLlamada = fetchUsuariosApiMock.mock.calls.at(-1)?.[0];
      expect(ultimaLlamada?.rol).toBe("SUPERVISOR");
    });
  });

  it("elegir 'Activos' manda `activo: true`, y 'Inactivos' manda `activo: false`", async () => {
    fetchUsuariosApiMock.mockResolvedValue(usuariosResponse([usuarioFake()]));
    const user = userEvent.setup();
    renderUsuariosPage();
    await screen.findByText("Marta Herrera");

    await abrirFiltros(user);
    await user.click(screen.getByRole("combobox", { name: "Estado" }));
    await user.click(await screen.findByRole("option", { name: "Activos" }));
    await waitFor(() => {
      expect(fetchUsuariosApiMock.mock.calls.at(-1)?.[0]?.activo).toBe(true);
    });

    await user.click(screen.getByRole("combobox", { name: "Estado" }));
    await user.click(await screen.findByRole("option", { name: "Inactivos" }));
    await waitFor(() => {
      expect(fetchUsuariosApiMock.mock.calls.at(-1)?.[0]?.activo).toBe(false);
    });
  });

  it("sin resultados con filtros activos, muestra un estado vacío distinto al de 'sin usuarios registrados'", async () => {
    fetchUsuariosApiMock.mockResolvedValue(usuariosResponse([usuarioFake()]));
    const user = userEvent.setup();
    renderUsuariosPage();
    await screen.findByText("Marta Herrera");

    fetchUsuariosApiMock.mockResolvedValue(usuariosResponse([]));
    await user.type(screen.getByLabelText("Buscar usuarios"), "nadie-coincide");

    expect(
      await screen.findByText("No hay usuarios que coincidan con estos filtros"),
    ).toBeInTheDocument();
  });
});

describe("UsuariosPage — paginación (F7)", () => {
  it("muestra «Mostrando X–Y de Z usuarios» según el total real devuelto por el backend", async () => {
    fetchUsuariosApiMock.mockResolvedValue(usuariosResponse([usuarioFake()], { total: 25, pagina: 1 }));

    renderUsuariosPage();
    await screen.findByText("Marta Herrera");

    expect(screen.getByText("Mostrando 1–10 de 25 usuarios")).toBeInTheDocument();
  });

  it("«Anterior» está deshabilitado en la página 1", async () => {
    fetchUsuariosApiMock.mockResolvedValue(usuariosResponse([usuarioFake()], { total: 25, pagina: 1 }));

    renderUsuariosPage();
    await screen.findByText("Marta Herrera");

    expect(screen.getByRole("button", { name: "Página anterior" })).toBeDisabled();
  });

  it("«Siguiente» avanza de página y manda `pagina: 2` a fetchUsuariosApi", async () => {
    fetchUsuariosApiMock.mockResolvedValue(usuariosResponse([usuarioFake()], { total: 25, pagina: 1 }));
    const user = userEvent.setup();
    renderUsuariosPage();
    await screen.findByText("Marta Herrera");

    await user.click(screen.getByRole("button", { name: "Página siguiente" }));

    await waitFor(() => {
      expect(fetchUsuariosApiMock.mock.calls.at(-1)?.[0]?.pagina).toBe(2);
    });
  });

  it("«Siguiente» está deshabilitado en la última página", async () => {
    fetchUsuariosApiMock.mockResolvedValue(usuariosResponse([usuarioFake()], { total: 5, pagina: 1 }));

    renderUsuariosPage();
    await screen.findByText("Marta Herrera");

    expect(screen.getByRole("button", { name: "Página siguiente" })).toBeDisabled();
  });

  it("cambiar el rol filtrado reinicia la paginación a la página 1", async () => {
    fetchUsuariosApiMock.mockResolvedValue(usuariosResponse([usuarioFake()], { total: 25, pagina: 1 }));
    const user = userEvent.setup();
    renderUsuariosPage();
    await screen.findByText("Marta Herrera");

    await user.click(screen.getByRole("button", { name: "Página siguiente" }));
    await waitFor(() => expect(fetchUsuariosApiMock.mock.calls.at(-1)?.[0]?.pagina).toBe(2));

    await abrirFiltros(user);
    await user.click(screen.getByRole("combobox", { name: "Rol" }));
    await user.click(await screen.findByRole("option", { name: "Vendedor" }));

    await waitFor(() => {
      const ultimaLlamada = fetchUsuariosApiMock.mock.calls.at(-1)?.[0];
      expect(ultimaLlamada?.rol).toBe("VENDEDOR");
      expect(ultimaLlamada?.pagina).toBe(1);
    });
  });
});

describe("UsuariosPage — alta de usuario", () => {
  it("rechaza una contraseña inicial de menos de 12 caracteres antes de llamar al backend", async () => {
    fetchUsuariosApiMock.mockResolvedValue(usuariosResponse([]));
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
    fetchUsuariosApiMock.mockResolvedValue(usuariosResponse([]));
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
    fetchUsuariosApiMock.mockResolvedValue(usuariosResponse([]));
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

describe("UsuariosPage — alta de usuario dentro de una empresa puntual (vista de holding, useVistaEmpresa)", () => {
  it("con `?empresaId=` en la URL (vista de empresa), manda `empresaId` en el body de POST /usuarios", async () => {
    fetchUsuariosApiMock.mockResolvedValue(usuariosResponse([]));
    createUsuarioApiMock.mockResolvedValue(usuarioFake());
    const user = userEvent.setup();
    renderUsuariosPage(["/usuarios?empresaId=empresa-77"]);
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
        empresaId: "empresa-77",
      }),
    );
  });

  it("sin `?empresaId=` en la URL, NO manda empresaId en el body de POST /usuarios", async () => {
    fetchUsuariosApiMock.mockResolvedValue(usuariosResponse([]));
    createUsuarioApiMock.mockResolvedValue(usuarioFake());
    const user = userEvent.setup();
    renderUsuariosPage(["/usuarios"]);
    await screen.findByText("Todavía no hay usuarios registrados");

    await completarFormularioAlta(user);
    await user.type(screen.getByLabelText("Contraseña inicial"), "una-contraseña-larga-1");
    await user.click(screen.getByRole("button", { name: "Crear usuario" }));

    await waitFor(() => expect(createUsuarioApiMock).toHaveBeenCalled());
    const body = createUsuarioApiMock.mock.calls.at(-1)?.[0];
    expect(body).not.toHaveProperty("empresaId");
  });
});

describe("UsuariosPage — edición de usuario", () => {
  it("precarga los datos actuales y llama a updateUsuarioApi con los cambios (sin contraseña)", async () => {
    fetchUsuariosApiMock.mockResolvedValue(usuariosResponse([usuarioFake()]));
    updateUsuarioApiMock.mockResolvedValue(usuarioFake({ nombre: "Marta H. Editada" }));
    const user = userEvent.setup();
    renderUsuariosPage();
    await screen.findByText("Marta Herrera");

    await abrirMenuAcciones(user, "Marta Herrera");
    await user.click(await screen.findByRole("menuitem", { name: "Editar perfil" }));
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
    fetchUsuariosApiMock.mockResolvedValue(usuariosResponse([usuarioFake()]));
    resetPasswordApiMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderUsuariosPage();
    await screen.findByText("Marta Herrera");

    await abrirMenuAcciones(user, "Marta Herrera");
    await user.click(await screen.findByRole("menuitem", { name: "Restablecer contraseña" }));
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
    fetchUsuariosApiMock.mockResolvedValue(usuariosResponse([usuarioFake()]));
    const user = userEvent.setup();
    renderUsuariosPage();
    await screen.findByText("Marta Herrera");

    await abrirMenuAcciones(user, "Marta Herrera");
    await user.click(await screen.findByRole("menuitem", { name: "Restablecer contraseña" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Nueva contraseña"), "contraseña-larga-1");
    await user.type(within(dialog).getByLabelText("Confirmar nueva contraseña"), "otra-diferente-1");
    await user.click(within(dialog).getByRole("button", { name: "Restablecer contraseña" }));

    expect(await within(dialog).findByText("Las contraseñas no coinciden.")).toBeInTheDocument();
    expect(resetPasswordApiMock).not.toHaveBeenCalled();
  });
});

describe("UsuariosPage — baja lógica con reasignación automática de la cartera activa por el backend (F7, M2)", () => {
  it("al confirmar la baja, llama a deactivateUsuarioApi con el id, muestra éxito y cierra el diálogo", async () => {
    fetchUsuariosApiMock.mockResolvedValue(usuariosResponse([usuarioFake()]));
    deactivateUsuarioApiMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderUsuariosPage();
    await screen.findByText("Marta Herrera");

    await abrirMenuAcciones(user, "Marta Herrera");
    await user.click(await screen.findByRole("menuitem", { name: "Dar de baja" }));
    expect(
      await screen.findByText(
        "El usuario no podrá volver a iniciar sesión. Esta acción es irreversible. Si tiene cartera activa, el sistema la reasigna automáticamente al compañero del mismo rol con menor carga activa (mismo criterio que la asignación automática de leads nuevos).",
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirmar baja" }));

    await waitFor(() => expect(deactivateUsuarioApiMock).toHaveBeenCalledWith("u1"));
    expect(toastSuccessMock).toHaveBeenCalledWith("Usuario dado de baja correctamente.");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("si el backend rechaza la baja por falta de candidato de reasignación (409), muestra el mensaje accionable y no cierra el diálogo", async () => {
    fetchUsuariosApiMock.mockResolvedValue(usuariosResponse([usuarioFake()]));
    deactivateUsuarioApiMock.mockRejectedValue(
      new ApiError(
        "baja_sin_candidato_reasignacion",
        409,
        "No hay otro usuario activo del mismo rol para reasignar la cartera de este usuario",
      ),
    );
    const user = userEvent.setup();
    renderUsuariosPage();
    await screen.findByText("Marta Herrera");

    await abrirMenuAcciones(user, "Marta Herrera");
    await user.click(await screen.findByRole("menuitem", { name: "Dar de baja" }));
    await user.click(screen.getByRole("button", { name: "Confirmar baja" }));

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith(
        "No hay otro usuario activo del mismo rol para reasignar la cartera de este usuario",
      ),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("UsuariosPage — reactivación de usuario (F7, sin diálogo de confirmación)", () => {
  it("elegir «Reactivar» en el menú llama a reactivateUsuarioApi con el id y avisa éxito, sin pedir confirmación", async () => {
    fetchUsuariosApiMock.mockResolvedValue(usuariosResponse([usuarioFake({ activo: false })]));
    reactivateUsuarioApiMock.mockResolvedValue(usuarioFake({ activo: true }));
    const user = userEvent.setup();
    renderUsuariosPage();
    await screen.findByText("Marta Herrera");

    await abrirMenuAcciones(user, "Marta Herrera");
    await user.click(await screen.findByRole("menuitem", { name: "Reactivar" }));

    await waitFor(() => expect(reactivateUsuarioApiMock).toHaveBeenCalledWith("u1"));
    expect(toastSuccessMock).toHaveBeenCalledWith("Usuario reactivado correctamente.");
    // Sin diálogo: a diferencia de la baja, la reactivación no abre nada que confirmar.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("UsuariosPage — filtro de estado por defecto (F7)", () => {
  it("arranca con el filtro de estado en «Activos», mandando `activo: true` desde la primera consulta", async () => {
    fetchUsuariosApiMock.mockResolvedValue(usuariosResponse([usuarioFake()]));
    const user = userEvent.setup();
    renderUsuariosPage();
    await screen.findByText("Marta Herrera");

    expect(fetchUsuariosApiMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ activo: true }),
    );
    await abrirFiltros(user);
    expect(screen.getByRole("combobox", { name: "Estado" })).toHaveTextContent("Activos");
  });

  it("al cambiar a «Todos los estados», la fila de un usuario inactivo se muestra atenuada", async () => {
    fetchUsuariosApiMock.mockResolvedValue(usuariosResponse([usuarioFake({ activo: false })]));
    const user = userEvent.setup();
    renderUsuariosPage();
    await screen.findByText("Marta Herrera");

    await abrirFiltros(user);
    await user.click(screen.getByRole("combobox", { name: "Estado" }));
    await user.click(await screen.findByRole("option", { name: "Todos" }));

    const fila = (await screen.findByText("Marta Herrera")).closest("tr");
    expect(fila).toHaveClass("opacity-60");
  });

  it("mientras el filtro sigue en «Activos», la fila de un usuario inactivo NO se atenúa", async () => {
    fetchUsuariosApiMock.mockResolvedValue(usuariosResponse([usuarioFake({ activo: false })]));
    renderUsuariosPage();

    const fila = (await screen.findByText("Marta Herrera")).closest("tr");
    expect(fila).not.toHaveClass("opacity-60");
  });
});

describe("UsuariosPage — filtro «solo holding-wide» (Item 25, integración con useVistaEmpresa, default invertido)", () => {
  it("con sesión holding-wide, la primera consulta ya manda `soloHoldingWide: true` (default nuevo, sin tocar nada)", async () => {
    mockearAuth("holding");
    fetchUsuariosApiMock.mockResolvedValue(usuariosResponse([usuarioFake()]));
    renderUsuariosPage();
    await screen.findByText("Marta Herrera");

    expect(fetchUsuariosApiMock.mock.calls[0]?.[0]?.soloHoldingWide).toBe(true);
  });

  it("con sesión holding-wide, tildar «Ver usuarios de todas las empresas» quita `soloHoldingWide` de la consulta a fetchUsuariosApi", async () => {
    mockearAuth("holding");
    fetchUsuariosApiMock.mockResolvedValue(usuariosResponse([usuarioFake()]));
    const user = userEvent.setup();
    renderUsuariosPage();
    await screen.findByText("Marta Herrera");

    await abrirFiltros(user);
    await user.click(screen.getByRole("checkbox", { name: /todas las empresas/i }));

    await waitFor(() => {
      expect(fetchUsuariosApiMock.mock.calls.at(-1)?.[0]?.soloHoldingWide).toBeUndefined();
    });
  });

  it("con sesión company-scoped, el toggle no se muestra", async () => {
    mockearAuth("company");
    fetchUsuariosApiMock.mockResolvedValue(usuariosResponse([usuarioFake()]));
    const user = userEvent.setup();
    renderUsuariosPage();
    await screen.findByText("Marta Herrera");

    await abrirFiltros(user);

    expect(screen.queryByRole("checkbox", { name: /todas las empresas/i })).not.toBeInTheDocument();
  });

  it("`hayFiltrosActivos` (criterio invertido): con el default `soloHoldingWide: true` sin resultados, el estado vacío es el de 'sin usuarios registrados' (no cuenta como filtro activo)", async () => {
    mockearAuth("holding");
    fetchUsuariosApiMock.mockResolvedValue(usuariosResponse([]));
    renderUsuariosPage();

    expect(await screen.findByText("Todavía no hay usuarios registrados")).toBeInTheDocument();
  });

  it("`hayFiltrosActivos` (criterio invertido): tildar «Ver usuarios de todas las empresas» sin resultados sí cuenta como filtro activo -- estado vacío de 'no coinciden con estos filtros'", async () => {
    mockearAuth("holding");
    fetchUsuariosApiMock.mockResolvedValue(usuariosResponse([usuarioFake()]));
    const user = userEvent.setup();
    renderUsuariosPage();
    await screen.findByText("Marta Herrera");

    fetchUsuariosApiMock.mockResolvedValue(usuariosResponse([]));
    await abrirFiltros(user);
    await user.click(screen.getByRole("checkbox", { name: /todas las empresas/i }));

    expect(
      await screen.findByText("No hay usuarios que coincidan con estos filtros"),
    ).toBeInTheDocument();
  });
});
