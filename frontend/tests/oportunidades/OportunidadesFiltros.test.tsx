import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RolUsuario } from "@/tipos/usuario";
import {
  FILTROS_VACIOS,
  FILTRO_TODOS,
  type FiltrosState,
} from "@/funcionalidades/oportunidades/oportunidades.utils";

vi.mock("@/funcionalidades/autenticacion/authContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/funcionalidades/leads/leads.api", () => ({
  getCatalogoResponsables: vi.fn(() =>
    Promise.resolve([
      { id: "asesor-1", nombre: "Marta Herrera" },
      { id: "asesor-2", nombre: "Luis Andrade" },
    ]),
  ),
}));

const { useAuth } = await import("@/funcionalidades/autenticacion/authContext");
const { OportunidadesFiltros } = await import(
  "@/funcionalidades/oportunidades/OportunidadesFiltros"
);
const useAuthMock = vi.mocked(useAuth);

function mockearAuth(rol: RolUsuario) {
  useAuthMock.mockReturnValue({
    user: { id: "u1", nombre: "Usuaria de prueba", correo: "u1@crm.test", rol },
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    hasRole: (allowedRoles) =>
      !allowedRoles || allowedRoles.length === 0 || allowedRoles.includes(rol),
  });
}

function renderFiltros(filtros: FiltrosState, onChange = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <OportunidadesFiltros filtros={filtros} onChange={onChange} />
    </QueryClientProvider>,
  );
  return { onChange };
}

beforeEach(() => {
  useAuthMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("OportunidadesFiltros", () => {
  it("elegir una etapa propaga el filtro al onChange", async () => {
    mockearAuth("ASESOR");
    const user = userEvent.setup();
    const { onChange } = renderFiltros(FILTROS_VACIOS);

    await user.click(screen.getByRole("button", { name: /Filtros/ }));
    await user.click(screen.getByRole("combobox", { name: "Etapa" }));
    await user.click(await screen.findByRole("option", { name: "Cita" }));

    expect(onChange).toHaveBeenCalledWith({ ...FILTROS_VACIOS, etapa: "CITA" });
  });

  it("el selector de asesor solo se muestra para ADMINISTRADOR/SUPERVISOR", async () => {
    mockearAuth("ASESOR");
    const user = userEvent.setup();
    renderFiltros(FILTROS_VACIOS);

    await user.click(screen.getByRole("button", { name: /Filtros/ }));
    expect(screen.queryByRole("combobox", { name: "Asesor" })).not.toBeInTheDocument();
  });

  it("el selector de asesor se muestra para SUPERVISOR", async () => {
    mockearAuth("SUPERVISOR");
    const user = userEvent.setup();
    renderFiltros(FILTROS_VACIOS);

    await user.click(screen.getByRole("button", { name: /Filtros/ }));
    expect(
      await screen.findByRole("combobox", { name: "Asesor" }),
    ).toBeInTheDocument();
  });

  it("renderiza un chip por filtro activo", () => {
    mockearAuth("ASESOR");
    renderFiltros({ etapa: "VENTA", asesorId: FILTRO_TODOS });
    expect(screen.getByText("Etapa: Venta")).toBeInTheDocument();
  });

  it("«Limpiar todos los filtros» restablece a FILTROS_VACIOS", async () => {
    mockearAuth("ASESOR");
    const user = userEvent.setup();
    const { onChange } = renderFiltros({ etapa: "VENTA", asesorId: FILTRO_TODOS });

    await user.click(screen.getByRole("button", { name: "Limpiar todos los filtros" }));
    expect(onChange).toHaveBeenCalledWith(FILTROS_VACIOS);
  });
});
