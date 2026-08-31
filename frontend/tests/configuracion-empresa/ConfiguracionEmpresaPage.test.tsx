import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, getErrorMessage } from "@/api/httpClient";
import type { ConfiguracionEmpresa } from "@/funcionalidades/configuracion-empresa/configuracion-empresa.api";

vi.mock("@/funcionalidades/configuracion-empresa/configuracion-empresa.api", () => ({
  fetchConfiguracionEmpresaApi: vi.fn(),
  updateConfiguracionEmpresaApi: vi.fn(),
  uploadLogoHoldingApi: vi.fn(),
  CONFIGURACION_EMPRESA_DEFAULT: {
    nombre: "CRM Embudo de Leads",
    colorPrimario: "#1e2a5e",
    colorSecundario: "#2563eb",
    logoUrl: null,
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const configuracionEmpresaApi = await import(
  "@/funcionalidades/configuracion-empresa/configuracion-empresa.api"
);
const { toast } = await import("sonner");
const { ConfiguracionEmpresaPage } = await import(
  "@/funcionalidades/configuracion-empresa/ConfiguracionEmpresaPage"
);

const fetchConfiguracionEmpresaApiMock = vi.mocked(configuracionEmpresaApi.fetchConfiguracionEmpresaApi);
const updateConfiguracionEmpresaApiMock = vi.mocked(configuracionEmpresaApi.updateConfiguracionEmpresaApi);
const uploadLogoHoldingApiMock = vi.mocked(configuracionEmpresaApi.uploadLogoHoldingApi);
const toastSuccessMock = vi.mocked(toast.success);
const toastErrorMock = vi.mocked(toast.error);

function configuracionFake(overrides: Partial<ConfiguracionEmpresa> = {}): ConfiguracionEmpresa {
  return {
    nombre: "Arcano Motos",
    colorPrimario: "#1e2a5e",
    colorSecundario: "#2563eb",
    logoUrl: null,
    ...overrides,
  };
}

/** Mismo `mutationCache` que `api/queryClient.ts` -- fiel al manejo global de errores real. */
function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    mutationCache: new MutationCache({
      onError: (error) => toast.error(getErrorMessage(error)),
    }),
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ConfiguracionEmpresaPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchConfiguracionEmpresaApiMock.mockReset();
  updateConfiguracionEmpresaApiMock.mockReset();
  uploadLogoHoldingApiMock.mockReset();
  toastSuccessMock.mockReset();
  toastErrorMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ConfiguracionEmpresaPage — estados de carga y error", () => {
  it("muestra un esqueleto de carga mientras llega la configuración", async () => {
    let resolver: (value: ConfiguracionEmpresa) => void = () => {};
    fetchConfiguracionEmpresaApiMock.mockReturnValue(
      new Promise((resolve) => {
        resolver = resolve;
      }),
    );

    renderPage();

    expect(screen.getByRole("status", { name: "Cargando" })).toBeInTheDocument();

    resolver(configuracionFake());
    await waitFor(() =>
      expect(screen.queryByRole("status", { name: "Cargando" })).not.toBeInTheDocument(),
    );
  });

  it("muestra un mensaje accionable en español y un botón de reintento si falla la carga", async () => {
    fetchConfiguracionEmpresaApiMock.mockRejectedValue(
      new ApiError("error_red", 0, "No se pudo conectar con el servidor. Verificá tu conexión e intentá nuevamente."),
    );

    renderPage();

    expect(
      await screen.findByText(
        "No se pudo conectar con el servidor. Verificá tu conexión e intentá nuevamente.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });
});

describe("ConfiguracionEmpresaPage — formulario", () => {
  it("precarga el formulario con la configuración vigente", async () => {
    fetchConfiguracionEmpresaApiMock.mockResolvedValue(configuracionFake());

    renderPage();

    expect(await screen.findByLabelText("Nombre de la empresa")).toHaveValue("Arcano Motos");
    expect(screen.getByLabelText("Color primario")).toHaveValue("#1e2a5e");
    expect(screen.getByLabelText("Color secundario")).toHaveValue("#2563eb");
  });

  it("valida el formato hexadecimal antes de enviar y no llama a la mutación", async () => {
    fetchConfiguracionEmpresaApiMock.mockResolvedValue(configuracionFake());
    const user = userEvent.setup();
    renderPage();

    const campoColorPrimario = await screen.findByLabelText("Color primario");
    await user.clear(campoColorPrimario);
    await user.type(campoColorPrimario, "no-es-un-color");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(
      await screen.findByText("Ingresá un color hexadecimal válido (ej. #1e2a5e)."),
    ).toBeInTheDocument();
    expect(updateConfiguracionEmpresaApiMock).not.toHaveBeenCalled();
  });

  it("envía los cambios editados y muestra confirmación", async () => {
    fetchConfiguracionEmpresaApiMock.mockResolvedValue(configuracionFake());
    updateConfiguracionEmpresaApiMock.mockResolvedValue(
      configuracionFake({ nombre: "Arcano Motos SA" }),
    );
    const user = userEvent.setup();
    renderPage();

    const campoNombre = await screen.findByLabelText("Nombre de la empresa");
    await user.clear(campoNombre);
    await user.type(campoNombre, "Arcano Motos SA");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() =>
      expect(updateConfiguracionEmpresaApiMock).toHaveBeenCalledWith({
        nombre: "Arcano Motos SA",
        colorPrimario: "#1e2a5e",
        colorSecundario: "#2563eb",
        logoUrl: null,
      }),
    );
    expect(toastSuccessMock).toHaveBeenCalledWith("Configuración de la empresa actualizada correctamente.");
  });

  it("sube un archivo de isotipo válido y envía la URL resultante al guardar", async () => {
    fetchConfiguracionEmpresaApiMock.mockResolvedValue(configuracionFake());
    uploadLogoHoldingApiMock.mockResolvedValue("https://cdn.miempresa.com/logo.png");
    updateConfiguracionEmpresaApiMock.mockResolvedValue(
      configuracionFake({ logoUrl: "https://cdn.miempresa.com/logo.png" }),
    );
    const user = userEvent.setup();
    renderPage();

    const campoLogo = await screen.findByLabelText("Isotipo (opcional)");
    await user.upload(
      campoLogo,
      new File([new Uint8Array(10)], "logo.png", { type: "image/png" }),
    );

    await waitFor(() => expect(uploadLogoHoldingApiMock).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() =>
      expect(updateConfiguracionEmpresaApiMock).toHaveBeenCalledWith({
        nombre: "Arcano Motos",
        colorPrimario: "#1e2a5e",
        colorSecundario: "#2563eb",
        logoUrl: "https://cdn.miempresa.com/logo.png",
      }),
    );
  });

  it("rechaza un archivo de isotipo con un tipo no soportado sin subirlo", async () => {
    fetchConfiguracionEmpresaApiMock.mockResolvedValue(configuracionFake());
    // `applyAccept: false` -- fuerza la selección para probar la validación
    // propia, igual que en `EmpresaAparienciaForm.test.tsx` (el atributo
    // `accept` ya filtra esto en un navegador real).
    const user = userEvent.setup({ applyAccept: false });
    renderPage();

    const campoLogo = await screen.findByLabelText("Isotipo (opcional)");
    await user.upload(campoLogo, new File([new Uint8Array(10)], "logo.txt", { type: "text/plain" }));

    expect(
      await screen.findByText("El archivo debe ser una imagen PNG, JPG, WEBP o SVG"),
    ).toBeInTheDocument();
    expect(uploadLogoHoldingApiMock).not.toHaveBeenCalled();
    expect(updateConfiguracionEmpresaApiMock).not.toHaveBeenCalled();
  });

  it("muestra el mensaje accionable del backend si falla el guardado", async () => {
    fetchConfiguracionEmpresaApiMock.mockResolvedValue(configuracionFake());
    updateConfiguracionEmpresaApiMock.mockRejectedValue(
      new ApiError("prohibido", 403, "No tenés permiso para hacer esto."),
    );
    const user = userEvent.setup();
    renderPage();

    await screen.findByLabelText("Nombre de la empresa");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith("No tenés permiso para hacer esto."));
  });

  it("actualiza la vista previa del gradiente en vivo al cambiar un color", async () => {
    fetchConfiguracionEmpresaApiMock.mockResolvedValue(configuracionFake());
    const user = userEvent.setup();
    renderPage();

    const campoColorPrimario = await screen.findByLabelText("Color primario");
    await user.clear(campoColorPrimario);
    await user.type(campoColorPrimario, "#abcdef");

    const preview = screen.getByText("Así se ve la pantalla de bienvenida al iniciar sesión");
    // jsdom normaliza el hex tecleado a `rgb(...)` al parsear el
    // `linear-gradient` -- se compara contra el equivalente rgb de
    // `#abcdef`, no contra el string hex original.
    expect(preview.style.background).toContain("rgb(171, 205, 239)");
  });
});

describe("ConfiguracionEmpresaPage — restaurar valores predeterminados", () => {
  it("no llama a la mutación hasta confirmar en el diálogo", async () => {
    fetchConfiguracionEmpresaApiMock.mockResolvedValue(
      configuracionFake({ nombre: "Arcano Motos", colorPrimario: "#7c2d12", colorSecundario: "#f97316" }),
    );
    const user = userEvent.setup();
    renderPage();

    await screen.findByLabelText("Nombre de la empresa");
    await user.click(screen.getByRole("button", { name: "Restaurar valores predeterminados" }));

    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    expect(updateConfiguracionEmpresaApiMock).not.toHaveBeenCalled();
  });

  it("cancelar el diálogo no envía ningún cambio", async () => {
    fetchConfiguracionEmpresaApiMock.mockResolvedValue(
      configuracionFake({ nombre: "Arcano Motos", colorPrimario: "#7c2d12", colorSecundario: "#f97316" }),
    );
    const user = userEvent.setup();
    renderPage();

    await screen.findByLabelText("Nombre de la empresa");
    await user.click(screen.getByRole("button", { name: "Restaurar valores predeterminados" }));
    await screen.findByRole("alertdialog");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(updateConfiguracionEmpresaApiMock).not.toHaveBeenCalled();
  });

  it("confirmar el diálogo envía el default de fábrica completo, sin importar lo editado", async () => {
    fetchConfiguracionEmpresaApiMock.mockResolvedValue(
      configuracionFake({ nombre: "Arcano Motos", colorPrimario: "#7c2d12", colorSecundario: "#f97316" }),
    );
    updateConfiguracionEmpresaApiMock.mockResolvedValue(configuracionEmpresaApi.CONFIGURACION_EMPRESA_DEFAULT);
    const user = userEvent.setup();
    renderPage();

    await screen.findByLabelText("Nombre de la empresa");
    await user.click(screen.getByRole("button", { name: "Restaurar valores predeterminados" }));
    await screen.findByRole("alertdialog");
    await user.click(screen.getByRole("button", { name: "Restaurar" }));

    await waitFor(() =>
      expect(updateConfiguracionEmpresaApiMock).toHaveBeenCalledWith(
        configuracionEmpresaApi.CONFIGURACION_EMPRESA_DEFAULT,
      ),
    );
    expect(toastSuccessMock).toHaveBeenCalledWith("Configuración de la empresa actualizada correctamente.");
  });

  it("el texto del diálogo advierte la pérdida de cambios y la necesidad de recargar", async () => {
    fetchConfiguracionEmpresaApiMock.mockResolvedValue(configuracionFake());
    const user = userEvent.setup();
    renderPage();

    await screen.findByLabelText("Nombre de la empresa");
    await user.click(screen.getByRole("button", { name: "Restaurar valores predeterminados" }));

    const dialogo = await screen.findByRole("alertdialog");
    expect(dialogo).toHaveTextContent(/perder/i);
    expect(dialogo).toHaveTextContent(/recarg/i);
  });
});
