import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/httpClient";

vi.mock("@/funcionalidades/autenticacion/auth-context", () => ({
  useAuth: vi.fn(),
}));
vi.mock("@/funcionalidades/autenticacion/autenticacion.api", () => ({
  changePasswordApi: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const { useAuth } = await import("@/funcionalidades/autenticacion/auth-context");
const authApi = await import("@/funcionalidades/autenticacion/autenticacion.api");
const { toast } = await import("sonner");
const { PerfilPage } = await import("@/funcionalidades/autenticacion/PerfilPage");

const useAuthMock = vi.mocked(useAuth);
const changePasswordApiMock = vi.mocked(authApi.changePasswordApi);
const toastSuccessMock = vi.mocked(toast.success);
const toastErrorMock = vi.mocked(toast.error);

const usuarioFake = {
  id: "u1",
  nombre: "Ana Gómez",
  correo: "ana@crm.test",
  rol: "ASESOR" as const,
};

beforeEach(() => {
  changePasswordApiMock.mockReset();
  toastSuccessMock.mockReset();
  toastErrorMock.mockReset();
  useAuthMock.mockReturnValue({
    user: usuarioFake,
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    hasRole: vi.fn(),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PerfilPage — datos del usuario", () => {
  it("muestra nombre, correo y la etiqueta en español del rol", () => {
    render(<PerfilPage />);

    expect(screen.getByText("Ana Gómez")).toBeInTheDocument();
    expect(screen.getByText("ana@crm.test")).toBeInTheDocument();
    expect(screen.getByText("Asesor")).toBeInTheDocument();
  });
});

describe("PerfilPage — validación de cambio de contraseña", () => {
  it("rechaza una contraseña de menos de 12 caracteres", async () => {
    const user = userEvent.setup();
    render(<PerfilPage />);

    await user.type(screen.getByLabelText("Nueva contraseña"), "corta123");
    await user.type(screen.getByLabelText("Confirmar nueva contraseña"), "corta123");
    await user.click(screen.getByRole("button", { name: "Actualizar contraseña" }));

    expect(
      await screen.findByText("La contraseña debe tener al menos 12 caracteres."),
    ).toBeInTheDocument();
    expect(changePasswordApiMock).not.toHaveBeenCalled();
  });

  it("rechaza cuando la confirmación no coincide", async () => {
    const user = userEvent.setup();
    render(<PerfilPage />);

    await user.type(screen.getByLabelText("Nueva contraseña"), "contraseña-larga-1");
    await user.type(screen.getByLabelText("Confirmar nueva contraseña"), "otra-contraseña-1");
    await user.click(screen.getByRole("button", { name: "Actualizar contraseña" }));

    expect(await screen.findByText("Las contraseñas no coinciden.")).toBeInTheDocument();
    expect(changePasswordApiMock).not.toHaveBeenCalled();
  });
});

describe("PerfilPage — envío del cambio de contraseña", () => {
  it("con contraseñas válidas y coincidentes, llama a changePasswordApi y avisa éxito", async () => {
    changePasswordApiMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<PerfilPage />);

    await user.type(screen.getByLabelText("Nueva contraseña"), "contraseña-larga-1");
    await user.type(screen.getByLabelText("Confirmar nueva contraseña"), "contraseña-larga-1");
    await user.click(screen.getByRole("button", { name: "Actualizar contraseña" }));

    await screen.findByRole("button", { name: "Actualizar contraseña" });
    expect(changePasswordApiMock).toHaveBeenCalledWith("u1", "contraseña-larga-1");
    expect(toastSuccessMock).toHaveBeenCalledWith("Contraseña actualizada correctamente.");
  });

  it("si el backend rechaza el cambio, avisa el mensaje accionable en vez de un código HTTP", async () => {
    changePasswordApiMock.mockRejectedValue(
      new ApiError("prohibido", 403, "No tenés permiso para realizar esta acción"),
    );
    const user = userEvent.setup();
    render(<PerfilPage />);

    await user.type(screen.getByLabelText("Nueva contraseña"), "contraseña-larga-1");
    await user.type(screen.getByLabelText("Confirmar nueva contraseña"), "contraseña-larga-1");
    await user.click(screen.getByRole("button", { name: "Actualizar contraseña" }));

    await screen.findByRole("button", { name: "Actualizar contraseña" });
    expect(toastErrorMock).toHaveBeenCalledWith("No tenés permiso para realizar esta acción");
  });
});
