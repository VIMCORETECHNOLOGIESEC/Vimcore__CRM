import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RolUsuario } from "@/tipos/usuario";
import { FILTRO_TODOS, FILTROS_LEADS_VACIOS, type LeadsFiltrosState } from "@/funcionalidades/leads/leads.utils";

// `LeadsFiltros` consume `GET /leads/catalogo/redes-sociales` (backend real,
// visible para cualquier rol autenticado) -- se mockea igual que
// `LeadsPage.test.tsx` para no depender de datos reales.
vi.mock("@/funcionalidades/leads/leads.api", () => ({
  fetchRedesSocialesCatalogoApi: vi.fn(),
}));

// `LeadsPage` (no `LeadsFiltros` en sí, ya no gatea nada por rol) sigue
// dependiendo de `<AuthProvider>` real en la app -- se mockea igual que en
// `LeadsPage.test.tsx` por si algún test futuro de este archivo lo necesita.
vi.mock("@/funcionalidades/autenticacion/auth-context", () => ({
  useAuth: vi.fn(),
}));

const { fetchRedesSocialesCatalogoApi } = await import("@/funcionalidades/leads/leads.api");
const { useAuth } = await import("@/funcionalidades/autenticacion/auth-context");
const { LeadsFiltros } = await import("@/funcionalidades/leads/LeadsFiltros");

const fetchRedesSocialesCatalogoApiMock = vi.mocked(fetchRedesSocialesCatalogoApi);
const useAuthMock = vi.mocked(useAuth);

function mockearAuth(rol: RolUsuario) {
  useAuthMock.mockReturnValue({
    user: { id: "u1", nombre: "Usuaria de prueba", correo: "u1@crm.test", rol },
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    hasRole: (allowedRoles) => !allowedRoles || allowedRoles.length === 0 || allowedRoles.includes(rol),
  });
}

const RESPONSABLES = [
  { id: "asesor-1", nombre: "Marta Herrera" },
  { id: "asesor-2", nombre: "Julián Peña" },
  { id: "asesor-3", nombre: "Carla Ríos" },
  { id: "asesor-4", nombre: "Mario Salas" },
  { id: "asesor-5", nombre: "Marina Torres" },
  { id: "asesor-6", nombre: "Martín Vega" },
  { id: "asesor-7", nombre: "Marcelo Bravo" },
  { id: "asesor-8", nombre: "Marisol Campos" },
];

const CAMPANIAS = [{ id: "camp-1", nombre: "Campaña Verano" }];

function renderFiltros(
  overrides: Partial<{
    filtros: LeadsFiltrosState;
    onChange: (filtros: LeadsFiltrosState) => void;
    campanias: { id: string; nombre: string }[];
    mostrarFiltroResponsable: boolean;
    responsables: { id: string; nombre: string }[];
  }> = {},
) {
  const onChange = overrides.onChange ?? vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { rerender } = render(
    <QueryClientProvider client={client}>
      <LeadsFiltros
        filtros={overrides.filtros ?? FILTROS_LEADS_VACIOS}
        onChange={onChange}
        campanias={overrides.campanias ?? CAMPANIAS}
        mostrarFiltroResponsable={overrides.mostrarFiltroResponsable ?? false}
        responsables={overrides.responsables ?? RESPONSABLES}
      />
    </QueryClientProvider>,
  );
  // Reutiliza el mismo `client` para que el `rerender` con filtros nuevos
  // dispare el refetch en cascada dentro del mismo árbol de React Query
  // (`LeadsFiltros — catálogo de red social en cascada`), en vez de perder
  // el caché al montar un `QueryClientProvider` nuevo.
  function rerenderConFiltros(filtros: LeadsFiltrosState) {
    rerender(
      <QueryClientProvider client={client}>
        <LeadsFiltros
          filtros={filtros}
          onChange={onChange}
          campanias={overrides.campanias ?? CAMPANIAS}
          mostrarFiltroResponsable={overrides.mostrarFiltroResponsable ?? false}
          responsables={overrides.responsables ?? RESPONSABLES}
        />
      </QueryClientProvider>,
    );
  }
  return { onChange, rerenderConFiltros };
}

async function abrirFiltros(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Filtros/ }));
}

beforeEach(() => {
  fetchRedesSocialesCatalogoApiMock.mockReset();
  fetchRedesSocialesCatalogoApiMock.mockResolvedValue([]);
  mockearAuth("ADMINISTRADOR");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LeadsFiltros — catálogo de red social en cascada (GET /leads/catalogo/redes-sociales)", () => {
  it("mientras carga, el selector queda deshabilitado con solo la opción «Todos»", async () => {
    let resolver: (value: string[]) => void = () => {};
    fetchRedesSocialesCatalogoApiMock.mockReturnValue(
      new Promise((resolve) => {
        resolver = resolve;
      }),
    );

    const user = userEvent.setup();
    renderFiltros();
    await abrirFiltros(user);

    expect(screen.getByRole("combobox", { name: "Red social" })).toBeDisabled();
    resolver(["FACEBOOK"]);
  });

  it("una vez cargado, solo ofrece las redes devueltas por el backend, no las 5 del enum completo", async () => {
    fetchRedesSocialesCatalogoApiMock.mockResolvedValue(["FACEBOOK", "INSTAGRAM"]);
    const user = userEvent.setup();
    renderFiltros();
    await abrirFiltros(user);

    await waitFor(() => expect(screen.getByRole("combobox", { name: "Red social" })).toBeEnabled());
    await user.click(screen.getByRole("combobox", { name: "Red social" }));

    expect(await screen.findByRole("option", { name: "Facebook" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Instagram" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "LinkedIn" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Google Forms" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "X" })).not.toBeInTheDocument();
  });

  it("un redSocial ya seleccionado que dejó de tener leads en el resto de los filtros se mantiene como opción, no desaparece", async () => {
    fetchRedesSocialesCatalogoApiMock.mockResolvedValue(["FACEBOOK"]);
    const user = userEvent.setup();
    renderFiltros({ filtros: { ...FILTROS_LEADS_VACIOS, redSocial: "GOOGLE_FORMS" } });
    await abrirFiltros(user);

    await waitFor(() => expect(screen.getByRole("combobox", { name: "Red social" })).toBeEnabled());
    await user.click(screen.getByRole("combobox", { name: "Red social" }));

    expect(await screen.findByRole("option", { name: "Google Forms" })).toBeInTheDocument();
  });

  it("elegir una red social dispara onChange con el valor elegido", async () => {
    fetchRedesSocialesCatalogoApiMock.mockResolvedValue(["FACEBOOK", "INSTAGRAM"]);
    const user = userEvent.setup();
    const { onChange } = renderFiltros();
    await abrirFiltros(user);

    await waitFor(() => expect(screen.getByRole("combobox", { name: "Red social" })).toBeEnabled());
    await user.click(screen.getByRole("combobox", { name: "Red social" }));
    await user.click(await screen.findByRole("option", { name: "Instagram" }));

    expect(onChange).toHaveBeenCalledWith({ ...FILTROS_LEADS_VACIOS, redSocial: "INSTAGRAM" });
  });

  it.each<RolUsuario>(["ADMINISTRADOR", "SUPERVISOR", "ASESOR", "VENDEDOR"])(
    "el filtro está visible y dispara la petición para el rol %s (el scoping por rol lo hace el propio endpoint, sin gate en frontend)",
    async (rol) => {
      mockearAuth(rol);
      const user = userEvent.setup();
      renderFiltros();
      await abrirFiltros(user);

      expect(screen.getByRole("combobox", { name: "Red social" })).toBeInTheDocument();
      await waitFor(() => expect(fetchRedesSocialesCatalogoApiMock).toHaveBeenCalled());
    },
  );

  it("recalcula el catálogo en cascada cuando cambia otro filtro activo (etapa)", async () => {
    fetchRedesSocialesCatalogoApiMock.mockResolvedValue(["FACEBOOK"]);
    const { rerenderConFiltros } = renderFiltros();

    await waitFor(() =>
      expect(fetchRedesSocialesCatalogoApiMock).toHaveBeenCalledWith(
        expect.not.objectContaining({ etapa: expect.anything() }),
      ),
    );

    rerenderConFiltros({ ...FILTROS_LEADS_VACIOS, etapa: "VENTA" });

    await waitFor(() =>
      expect(fetchRedesSocialesCatalogoApiMock).toHaveBeenCalledWith(
        expect.objectContaining({ etapa: "VENTA" }),
      ),
    );
    // Nunca se manda `redSocial` -- es justamente el campo que este catálogo alimenta.
    for (const llamada of fetchRedesSocialesCatalogoApiMock.mock.calls) {
      expect(llamada[0]).not.toHaveProperty("redSocial");
    }
  });
});

describe("LeadsFiltros — botón «Filtros» con Popover y badge de conteo", () => {
  it("sin filtros activos, el botón no muestra badge", () => {
    renderFiltros();

    const boton = screen.getByRole("button", { name: /Filtros/ });
    expect(boton).toHaveTextContent(/^Filtros$/);
  });

  it("el badge cuenta los filtros avanzados activos, sin contar la búsqueda", () => {
    renderFiltros({
      filtros: {
        ...FILTROS_LEADS_VACIOS,
        busqueda: "roberto",
        etapa: "CONTACTADO",
        semaforo: "ROJO",
      },
    });

    expect(screen.getByRole("button", { name: /Filtros/ })).toHaveTextContent("2");
  });

  it("abre el Popover con los campos de filtro en grilla al hacer clic en «Filtros»", async () => {
    const user = userEvent.setup();
    renderFiltros();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await abrirFiltros(user);

    const popover = await screen.findByRole("dialog");
    expect(within(popover).getByText("Filtros")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Etapa" })).toBeInTheDocument();
    expect(screen.getByLabelText("Ingreso desde")).toBeInTheDocument();
    expect(screen.getByLabelText("Ingreso hasta")).toBeInTheDocument();
  });
});

describe("LeadsFiltros — chips de filtros activos", () => {
  it("sin filtros activos, no se renderiza fila de chips ni botón de limpiar", () => {
    renderFiltros();

    expect(screen.queryByLabelText("Limpiar todos los filtros")).not.toBeInTheDocument();
  });

  it("cada campo activo aparece como un único chip, incluida la búsqueda", () => {
    renderFiltros({
      filtros: {
        ...FILTROS_LEADS_VACIOS,
        busqueda: "roberto",
        etapa: "CONTACTADO",
        campaniaId: "camp-1",
      },
    });

    expect(screen.getByText("Búsqueda: roberto")).toBeInTheDocument();
    expect(screen.getByText("Etapa: Contactado")).toBeInTheDocument();
    expect(screen.getByText("Campaña: Campaña Verano")).toBeInTheDocument();
    expect(screen.getByLabelText("Limpiar todos los filtros")).toBeInTheDocument();
  });

  it("quitar un chip individual resetea solo ese campo", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFiltros({
      filtros: { ...FILTROS_LEADS_VACIOS, busqueda: "roberto", etapa: "CONTACTADO" },
    });

    await user.click(screen.getByRole("button", { name: "Quitar filtro Etapa" }));

    expect(onChange).toHaveBeenCalledWith({ ...FILTROS_LEADS_VACIOS, busqueda: "roberto" });
  });

  it("el ícono general de limpiar resetea todos los filtros, incluida la búsqueda", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFiltros({
      filtros: { ...FILTROS_LEADS_VACIOS, busqueda: "roberto", etapa: "CONTACTADO" },
    });

    await user.click(screen.getByLabelText("Limpiar todos los filtros"));

    expect(onChange).toHaveBeenCalledWith(FILTROS_LEADS_VACIOS);
  });
});

describe("LeadsFiltros — combobox buscable de Responsable", () => {
  it("muestra «Todos» cuando no hay responsable seleccionado", async () => {
    const user = userEvent.setup();
    renderFiltros({ mostrarFiltroResponsable: true });
    await abrirFiltros(user);

    expect(screen.getByRole("combobox", { name: "Responsable" })).toHaveTextContent("Todos");
  });

  it("filtra por nombre y limita a un máximo de 5 coincidencias", async () => {
    const user = userEvent.setup();
    renderFiltros({ mostrarFiltroResponsable: true });
    await abrirFiltros(user);

    await user.click(screen.getByRole("combobox", { name: "Responsable" }));
    await user.type(screen.getByPlaceholderText("Buscar asesor…"), "mar");

    const opciones = await screen.findAllByRole("option");
    // Hay 6 responsables cuyo nombre contiene "mar" (Marta, Mario, Marina,
    // Martín, Marcelo, Marisol); el combobox debe topear a 5 + "Todos".
    expect(opciones.length).toBe(6);
    expect(screen.getByRole("option", { name: "Todos los responsables" })).toBeInTheDocument();
  });

  it("sin coincidencias, muestra el mensaje «Sin coincidencias.»", async () => {
    const user = userEvent.setup();
    renderFiltros({ mostrarFiltroResponsable: true });
    await abrirFiltros(user);

    await user.click(screen.getByRole("combobox", { name: "Responsable" }));
    await user.type(screen.getByPlaceholderText("Buscar asesor…"), "zzz-inexistente");

    expect(await screen.findByText("Sin coincidencias.")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Todos los responsables" })).toBeInTheDocument();
  });

  it("seleccionar un responsable dispara onChange y cierra el popover", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFiltros({ mostrarFiltroResponsable: true });
    await abrirFiltros(user);

    await user.click(screen.getByRole("combobox", { name: "Responsable" }));
    await user.type(screen.getByPlaceholderText("Buscar asesor…"), "Julián");
    await user.click(await screen.findByRole("option", { name: "Julián Peña" }));

    expect(onChange).toHaveBeenCalledWith({ ...FILTROS_LEADS_VACIOS, responsableId: "asesor-2" });
    await waitFor(() => expect(screen.queryByPlaceholderText("Buscar asesor…")).not.toBeInTheDocument());
  });

  it("elegir «Todos los responsables» limpia el filtro de responsable", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFiltros({
      mostrarFiltroResponsable: true,
      filtros: { ...FILTROS_LEADS_VACIOS, responsableId: "asesor-2" },
    });
    await abrirFiltros(user);

    await user.click(screen.getByRole("combobox", { name: "Responsable" }));
    await user.click(await screen.findByRole("option", { name: "Todos los responsables" }));

    expect(onChange).toHaveBeenCalledWith({ ...FILTROS_LEADS_VACIOS, responsableId: FILTRO_TODOS });
  });
});
