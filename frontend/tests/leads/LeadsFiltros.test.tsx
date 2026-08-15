import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FILTRO_TODOS, FILTROS_LEADS_VACIOS, type LeadsFiltrosState } from "@/funcionalidades/leads/leads.utils";

vi.mock("@/funcionalidades/bridges/bridges.api", () => ({
  fetchRedesSocialesActivasApi: vi.fn(),
}));

const { fetchRedesSocialesActivasApi } = await import("@/funcionalidades/bridges/bridges.api");
const { LeadsFiltros } = await import("@/funcionalidades/leads/LeadsFiltros");

const fetchRedesSocialesActivasApiMock = vi.mocked(fetchRedesSocialesActivasApi);

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
  render(
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
  return { onChange };
}

async function abrirFiltros(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Filtros/ }));
}

beforeEach(() => {
  fetchRedesSocialesActivasApiMock.mockReset();
  fetchRedesSocialesActivasApiMock.mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LeadsFiltros — red social sourced from active bridges (Requirement: Red-Social Filter Sourced from Active Bridges)", () => {
  it("mientras carga, el selector queda deshabilitado con solo la opción «Todos»", async () => {
    let resolver: (value: string[]) => void = () => {};
    fetchRedesSocialesActivasApiMock.mockReturnValue(
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

  it("una vez cargado, solo ofrece las redes activas devueltas por el backend, no las 5 del enum completo", async () => {
    fetchRedesSocialesActivasApiMock.mockResolvedValue(["FACEBOOK", "INSTAGRAM"]);
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

  it("un redSocial ya seleccionado que dejó de estar activo se mantiene como opción, no desaparece", async () => {
    fetchRedesSocialesActivasApiMock.mockResolvedValue(["FACEBOOK"]);
    const user = userEvent.setup();
    renderFiltros({ filtros: { ...FILTROS_LEADS_VACIOS, redSocial: "GOOGLE_FORMS" } });
    await abrirFiltros(user);

    await waitFor(() => expect(screen.getByRole("combobox", { name: "Red social" })).toBeEnabled());
    await user.click(screen.getByRole("combobox", { name: "Red social" }));

    expect(await screen.findByRole("option", { name: "Google Forms" })).toBeInTheDocument();
  });

  it("elegir una red social dispara onChange con el valor elegido", async () => {
    fetchRedesSocialesActivasApiMock.mockResolvedValue(["FACEBOOK", "INSTAGRAM"]);
    const user = userEvent.setup();
    const { onChange } = renderFiltros();
    await abrirFiltros(user);

    await waitFor(() => expect(screen.getByRole("combobox", { name: "Red social" })).toBeEnabled());
    await user.click(screen.getByRole("combobox", { name: "Red social" }));
    await user.click(await screen.findByRole("option", { name: "Instagram" }));

    expect(onChange).toHaveBeenCalledWith({ ...FILTROS_LEADS_VACIOS, redSocial: "INSTAGRAM" });
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
