import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionScope } from "@/tipos/usuario";
import { FILTROS_USUARIOS_VACIOS, type UsuariosFiltrosState } from "@/funcionalidades/usuarios/usuarios.utils";

vi.mock("@/funcionalidades/autenticacion/authContext", () => ({
  useAuth: vi.fn(),
}));

const { useAuth } = await import("@/funcionalidades/autenticacion/authContext");
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

describe("UsuariosFiltros — toggle «solo holding-wide» (Item 25)", () => {
  it("no se muestra para una sesión company-scoped", async () => {
    mockearAuth("company");
    const user = userEvent.setup();
    renderFiltros();

    await user.click(screen.getByRole("button", { name: "Filtros" }));

    expect(screen.queryByRole("checkbox", { name: /holding-wide/i })).not.toBeInTheDocument();
  });

  it("se muestra para una sesión holding-wide, y activarlo propaga `soloHoldingWide: true`", async () => {
    mockearAuth("holding");
    const user = userEvent.setup();
    const { onChange } = renderFiltros();

    await user.click(screen.getByRole("button", { name: "Filtros" }));
    await user.click(screen.getByRole("checkbox", { name: /holding-wide/i }));

    expect(onChange).toHaveBeenCalledWith({ ...FILTROS_USUARIOS_VACIOS, soloHoldingWide: true });
  });

  it("cuando está activado, aparece como chip de filtro activo, con botón para quitarlo", async () => {
    mockearAuth("holding");
    const user = userEvent.setup();
    const { onChange } = renderFiltros({ ...FILTROS_USUARIOS_VACIOS, soloHoldingWide: true });

    expect(screen.getByText(/holding-wide/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /quitar filtro/i }));

    expect(onChange).toHaveBeenCalledWith({ ...FILTROS_USUARIOS_VACIOS, soloHoldingWide: false });
  });
});
