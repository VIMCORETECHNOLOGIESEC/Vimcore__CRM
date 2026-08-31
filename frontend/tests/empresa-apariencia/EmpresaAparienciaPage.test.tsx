import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "@/tipos/usuario";

vi.mock("@/funcionalidades/autenticacion/auth-context", () => ({
  useAuth: vi.fn(),
}));
vi.mock("@/funcionalidades/empresa-apariencia/empresa-apariencia.api", () => ({
  updateEmpresaAparienciaApi: vi.fn(),
  uploadLogoEmpresaApi: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { useAuth } = await import("@/funcionalidades/autenticacion/auth-context");
const empresaAparienciaApi = await import(
  "@/funcionalidades/empresa-apariencia/empresa-apariencia.api"
);
const { EmpresaAparienciaPage } = await import(
  "@/funcionalidades/empresa-apariencia/EmpresaAparienciaPage"
);

const useAuthMock = vi.mocked(useAuth);
const updateEmpresaAparienciaApiMock = vi.mocked(empresaAparienciaApi.updateEmpresaAparienciaApi);
const uploadLogoEmpresaApiMock = vi.mocked(empresaAparienciaApi.uploadLogoEmpresaApi);

function usuarioFake(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: "u1",
    nombre: "Ana",
    correo: "empresa-a@crm.local",
    rol: "ADMINISTRADOR",
    sessionScope: "company",
    empresaId: "e1",
    empresaNombre: "Empresa A",
    empresaColorPrimario: "#7c2d12",
    empresaColorSecundario: "#f97316",
    empresaLogoUrl: null,
    membresiaId: "m1",
    ...overrides,
  };
}

beforeEach(() => {
  updateEmpresaAparienciaApiMock.mockReset();
  uploadLogoEmpresaApiMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <EmpresaAparienciaPage />
    </QueryClientProvider>,
  );
}

describe("EmpresaAparienciaPage", () => {
  it("precarga el formulario con los colores de la propia empresa (sin campo de nombre)", () => {
    useAuthMock.mockReturnValue({
      user: usuarioFake(),
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: vi.fn(),
    });

    renderPage();

    expect(screen.getByLabelText("Color primario")).toHaveValue("#7c2d12");
    expect(screen.getByLabelText("Color secundario")).toHaveValue("#f97316");
    expect(screen.queryByLabelText("Nombre de la empresa")).not.toBeInTheDocument();
  });

  it("envía únicamente colorPrimario/colorSecundario/logoUrl al guardar, nunca nombre", async () => {
    useAuthMock.mockReturnValue({
      user: usuarioFake(),
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: vi.fn(),
    });
    updateEmpresaAparienciaApiMock.mockResolvedValue({
      colorPrimario: "#111111",
      colorSecundario: "#f97316",
      logoUrl: null,
    });
    const user = userEvent.setup();
    renderPage();

    const campoColorPrimario = screen.getByLabelText("Color primario");
    await user.clear(campoColorPrimario);
    await user.type(campoColorPrimario, "#111111");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() =>
      expect(updateEmpresaAparienciaApiMock).toHaveBeenCalledWith({
        colorPrimario: "#111111",
        colorSecundario: "#f97316",
        logoUrl: null,
      }),
    );
  });

  it("sube el isotipo con uploadLogoEmpresaApi y lo incluye al guardar", async () => {
    useAuthMock.mockReturnValue({
      user: usuarioFake(),
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: vi.fn(),
    });
    uploadLogoEmpresaApiMock.mockResolvedValue("https://cdn.miempresa.com/logo-nuevo.png");
    updateEmpresaAparienciaApiMock.mockResolvedValue({
      colorPrimario: "#7c2d12",
      colorSecundario: "#f97316",
      logoUrl: "https://cdn.miempresa.com/logo-nuevo.png",
    });
    const user = userEvent.setup();
    renderPage();

    const campoLogo = screen.getByLabelText("Isotipo (opcional)");
    await user.upload(campoLogo, new File([new Uint8Array(10)], "logo.png", { type: "image/png" }));

    await waitFor(() => expect(uploadLogoEmpresaApiMock).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() =>
      expect(updateEmpresaAparienciaApiMock).toHaveBeenCalledWith({
        colorPrimario: "#7c2d12",
        colorSecundario: "#f97316",
        logoUrl: "https://cdn.miempresa.com/logo-nuevo.png",
      }),
    );
  });
});
