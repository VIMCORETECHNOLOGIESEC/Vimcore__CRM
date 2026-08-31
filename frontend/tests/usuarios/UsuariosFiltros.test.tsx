import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionScope } from "@/tipos/usuario";
import { FILTROS_USUARIOS_VACIOS, type UsuariosFiltrosState } from "@/funcionalidades/usuarios/usuarios.utils";

vi.mock("@/funcionalidades/autenticacion/auth-context", () => ({
  useAuth: vi.fn(),
}));

const { useAuth } = await import("@/funcionalidades/autenticacion/auth-context");
const { UsuariosFiltros } = await import("@/funcionalidades/usuarios/UsuariosFiltros");

const useAuthMock = vi.mocked(useAuth);

/** Mismo patrón que `tests/oportunidades/OportunidadesFiltros.test.tsx::mockearAuth`. */
function mockearAuth(sessionScope: SessionScope) {
  useAuthMock.mockReturnValue({
    user: {
      id: "u1",
      nombre: "Usuaria de prueba",
      correo: "u1@crm.test",
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

function renderFiltros(filtros: UsuariosFiltrosState = FILTROS_USUARIOS_VACIOS, onChange = vi.fn()) {
  render(<UsuariosFiltros filtros={filtros} onChange={onChange} onNuevo={vi.fn()} />);
  return { onChange };
}

beforeEach(() => {
  useAuthMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("UsuariosFiltros — toggle «ver usuarios de todas las empresas» (Item 25, semántica invertida)", () => {
  it("no se muestra para una sesión company-scoped", async () => {
    mockearAuth("company");
    const user = userEvent.setup();
    renderFiltros();

    await user.click(screen.getByRole("button", { name: "Filtros" }));

    expect(screen.queryByRole("checkbox", { name: /todas las empresas/i })).not.toBeInTheDocument();
  });

  it("se muestra para una sesión holding-wide, arranca sin tildar (default `soloHoldingWide: true`) y tildarlo propaga `soloHoldingWide: false`", async () => {
    mockearAuth("holding");
    const user = userEvent.setup();
    const { onChange } = renderFiltros();

    await user.click(screen.getByRole("button", { name: "Filtros" }));
    const checkbox = screen.getByRole("checkbox", { name: /todas las empresas/i });
    expect(checkbox).not.toBeChecked();

    await user.click(checkbox);

    expect(onChange).toHaveBeenCalledWith({ ...FILTROS_USUARIOS_VACIOS, soloHoldingWide: false });
  });

  it("cuando `soloHoldingWide: false` (checkbox tildado), aparece como chip de filtro activo, con botón para quitarlo que restaura el default `soloHoldingWide: true`", async () => {
    mockearAuth("holding");
    const user = userEvent.setup();
    const { onChange } = renderFiltros({ ...FILTROS_USUARIOS_VACIOS, soloHoldingWide: false });

    expect(screen.getByText(/todas las empresas/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /quitar filtro/i }));

    expect(onChange).toHaveBeenCalledWith({ ...FILTROS_USUARIOS_VACIOS, soloHoldingWide: true });
  });

  it("con el default `soloHoldingWide: true`, no aparece chip de filtro activo (es el estado normal, no un filtro aplicado)", async () => {
    mockearAuth("holding");
    renderFiltros();

    expect(screen.queryByText(/todas las empresas/i)).not.toBeInTheDocument();
  });
});

describe("UsuariosFiltros — onNuevo opcional (vista de holding en solo lectura, mismo criterio que BridgesFiltros)", () => {
  it("con onNuevo omitido, no muestra el botón «Nuevo usuario»", () => {
    mockearAuth("company");
    render(<UsuariosFiltros filtros={FILTROS_USUARIOS_VACIOS} onChange={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "Nuevo usuario" })).not.toBeInTheDocument();
  });
});
