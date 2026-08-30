import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  EmpresaAparienciaHoldingView,
  EmpresasHoldingResponse,
} from "@/funcionalidades/empresa-apariencia/empresa-apariencia-holding.api";

vi.mock("@/funcionalidades/empresa-apariencia/empresa-apariencia-holding.api", () => ({
  fetchEmpresasHoldingApi: vi.fn(),
  updateEmpresaAparienciaHoldingApi: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const empresaAparienciaHoldingApi = await import(
  "@/funcionalidades/empresa-apariencia/empresa-apariencia-holding.api"
);
const { GestorEmpresasPage } = await import(
  "@/funcionalidades/empresa-apariencia/GestorEmpresasPage"
);

const fetchEmpresasHoldingApiMock = vi.mocked(empresaAparienciaHoldingApi.fetchEmpresasHoldingApi);
const updateEmpresaAparienciaHoldingApiMock = vi.mocked(
  empresaAparienciaHoldingApi.updateEmpresaAparienciaHoldingApi,
);

function empresaFake(overrides: Partial<EmpresaAparienciaHoldingView> = {}): EmpresaAparienciaHoldingView {
  return {
    id: "e1",
    nombre: "Empresa A",
    colorPrimario: "#7c2d12",
    colorSecundario: "#f97316",
    logoUrl: null,
    ...overrides,
  };
}

/** Envoltura de la respuesta paginada real (`GET /empresas`) -- por defecto asume que `items` es la página completa. */
function empresasResponse(
  items: EmpresaAparienciaHoldingView[],
  overrides: Partial<Omit<EmpresasHoldingResponse, "items">> = {},
): EmpresasHoldingResponse {
  return { items, total: items.length, ...overrides };
}

beforeEach(() => {
  fetchEmpresasHoldingApiMock.mockReset();
  updateEmpresaAparienciaHoldingApiMock.mockReset();
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
      {/* MemoryRouter: cada card enlaza "Ver detalles" a /usuarios?empresaId= (F8-D0). */}
      <MemoryRouter>
        <GestorEmpresasPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("GestorEmpresasPage", () => {
  it("muestra un estado de carga mientras se resuelve el listado", () => {
    fetchEmpresasHoldingApiMock.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByRole("status", { name: "Cargando" })).toBeInTheDocument();
  });

  it("muestra un estado vacío cuando no hay empresas", async () => {
    fetchEmpresasHoldingApiMock.mockResolvedValue(empresasResponse([]));
    renderPage();
    expect(await screen.findByText(/todavía no hay empresas/i)).toBeInTheDocument();
  });

  it("muestra un mensaje accionable cuando falla la carga", async () => {
    fetchEmpresasHoldingApiMock.mockRejectedValue(new Error("network error"));
    renderPage();
    expect(await screen.findByText("No se pudo completar la operación")).toBeInTheDocument();
  });

  it("cada empresa se muestra como card con isotipo, nombre y acciones -- no como fila de tabla", async () => {
    fetchEmpresasHoldingApiMock.mockResolvedValue(
      empresasResponse([empresaFake({ id: "e1", nombre: "Empresa A", logoUrl: "https://cdn.test/e1.png" })]),
    );
    renderPage();

    await screen.findByText("Empresa A");

    // Ya no hay estructura de tabla.
    expect(screen.queryByRole("table")).not.toBeInTheDocument();

    // Isotipo con logo real.
    const isotipo = screen.getByAltText("Isotipo de Empresa A");
    expect(isotipo.tagName).toBe("IMG");
    expect(isotipo).toHaveAttribute("src", "https://cdn.test/e1.png");

    // Acción primaria: navega a la vista de detalle (hoy /usuarios?empresaId=,
    // ver comentario en GestorEmpresasPage.tsx sobre el context pendiente).
    const verDetalles = screen.getByRole("link", { name: "Ver detalles de Empresa A" });
    expect(verDetalles).toHaveAttribute("href", "/usuarios?empresaId=e1");

    // Acción secundaria: Editar, subordinada visualmente pero con el mismo
    // nombre accesible que antes (no rompe el flujo de edición existente).
    expect(screen.getByRole("button", { name: "Editar Empresa A" })).toBeInTheDocument();
  });

  it("sin isotipo, la card usa el mismo patrón visual de fallback que app-sidebar (borde punteado + inicial)", async () => {
    fetchEmpresasHoldingApiMock.mockResolvedValue(
      empresasResponse([empresaFake({ id: "e2", nombre: "Beta Corp", logoUrl: null })]),
    );
    renderPage();

    await screen.findByText("Beta Corp");

    expect(screen.queryByAltText("Isotipo de Beta Corp")).not.toBeInTheDocument();
    const inicial = screen.getByText("B");
    expect(inicial).toHaveClass("border-dashed");
  });

  it("el pie de la tabla también usa la superficie de marca (--sidebar), igual que Usuarios/Bridges/Leads", async () => {
    fetchEmpresasHoldingApiMock.mockResolvedValue(empresasResponse([empresaFake()], { total: 30 }));
    renderPage();

    await screen.findByText("Empresa A");

    const pie = screen.getByText(/Mostrando/).closest("div.leads-table-footer");
    expect(pie).toHaveClass("bg-sidebar");
    expect(pie).toHaveClass("text-sidebar-foreground");
  });

  it("lista las empresas devueltas por el backend", async () => {
    fetchEmpresasHoldingApiMock.mockResolvedValue(
      empresasResponse([
        empresaFake({ id: "e1", nombre: "Empresa A" }),
        empresaFake({ id: "e2", nombre: "Empresa B", colorPrimario: null, colorSecundario: null }),
      ]),
    );
    renderPage();

    expect(await screen.findByText("Empresa A")).toBeInTheDocument();
    expect(screen.getByText("Empresa B")).toBeInTheDocument();
  });

  it("abre el editor de una empresa y envía la edición al backend", async () => {
    fetchEmpresasHoldingApiMock.mockResolvedValue(empresasResponse([empresaFake()]));
    updateEmpresaAparienciaHoldingApiMock.mockResolvedValue(
      empresaFake({ nombre: "Empresa A renombrada" }),
    );
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Empresa A");
    await user.click(screen.getByRole("button", { name: "Editar Empresa A" }));

    const campoNombre = await screen.findByLabelText("Nombre de la empresa");
    await user.clear(campoNombre);
    await user.type(campoNombre, "Empresa A renombrada");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() =>
      expect(updateEmpresaAparienciaHoldingApiMock).toHaveBeenCalledWith("e1", {
        nombre: "Empresa A renombrada",
        colorPrimario: "#7c2d12",
        colorSecundario: "#f97316",
        logoUrl: null,
      }),
    );
  });
});

describe("GestorEmpresasPage — paginación server-side (page/pageSize/search)", () => {
  it("pide la primera página con el tamaño de página por defecto (25) sin `search`", async () => {
    fetchEmpresasHoldingApiMock.mockResolvedValue(empresasResponse([empresaFake()]));
    renderPage();
    await screen.findByText("Empresa A");

    expect(fetchEmpresasHoldingApiMock).toHaveBeenCalledWith({ page: 1, pageSize: 25 });
  });

  it("muestra «Mostrando X–Y de Z empresas» según el total real devuelto por el backend", async () => {
    fetchEmpresasHoldingApiMock.mockResolvedValue(empresasResponse([empresaFake()], { total: 478 }));
    renderPage();
    await screen.findByText("Empresa A");

    expect(screen.getByText("Mostrando 1–25 de 478 empresas")).toBeInTheDocument();
  });

  it("«Página anterior» está deshabilitado en la página 1", async () => {
    fetchEmpresasHoldingApiMock.mockResolvedValue(empresasResponse([empresaFake()], { total: 478 }));
    renderPage();
    await screen.findByText("Empresa A");

    expect(screen.getByRole("button", { name: "Página anterior" })).toBeDisabled();
  });

  it("«Página siguiente» avanza de página y manda `page: 2` a fetchEmpresasHoldingApi", async () => {
    fetchEmpresasHoldingApiMock.mockResolvedValue(empresasResponse([empresaFake()], { total: 478 }));
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Empresa A");

    await user.click(screen.getByRole("button", { name: "Página siguiente" }));

    await waitFor(() => {
      expect(fetchEmpresasHoldingApiMock.mock.calls.at(-1)?.[0]).toEqual({ page: 2, pageSize: 25 });
    });
  });

  it("«Página siguiente» está deshabilitado en la última página", async () => {
    fetchEmpresasHoldingApiMock.mockResolvedValue(empresasResponse([empresaFake()], { total: 5 }));
    renderPage();
    await screen.findByText("Empresa A");

    expect(screen.getByRole("button", { name: "Página siguiente" })).toBeDisabled();
  });
});

describe("GestorEmpresasPage — búsqueda por nombre (con debounce)", () => {
  it("escribir en el buscador manda `search` a fetchEmpresasHoldingApi (sin un request por cada tecla) y reinicia a la página 1", async () => {
    fetchEmpresasHoldingApiMock.mockResolvedValue(empresasResponse([empresaFake()], { total: 478 }));
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Empresa A");

    await user.click(screen.getByRole("button", { name: "Página siguiente" }));
    await waitFor(() => {
      expect(fetchEmpresasHoldingApiMock.mock.calls.at(-1)?.[0]).toEqual({ page: 2, pageSize: 25 });
    });

    const llamadasAntesDeEscribir = fetchEmpresasHoldingApiMock.mock.calls.length;
    await user.type(screen.getByLabelText("Buscar empresas"), "acme");

    await waitFor(() => {
      expect(fetchEmpresasHoldingApiMock.mock.calls.at(-1)?.[0]).toEqual({
        page: 1,
        pageSize: 25,
        search: "acme",
      });
    });
    // El debounce colapsa las 4 teclas escritas en un único request nuevo (no cuatro).
    expect(fetchEmpresasHoldingApiMock.mock.calls.length).toBeLessThan(llamadasAntesDeEscribir + 4);
  });

  it("sin resultados con búsqueda activa, muestra un estado vacío distinto al de 'sin empresas registradas'", async () => {
    fetchEmpresasHoldingApiMock.mockResolvedValue(empresasResponse([empresaFake()]));
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Empresa A");

    fetchEmpresasHoldingApiMock.mockResolvedValue(empresasResponse([]));
    await user.type(screen.getByLabelText("Buscar empresas"), "nadie-coincide");

    expect(
      await screen.findByText("No hay empresas que coincidan con esta búsqueda"),
    ).toBeInTheDocument();
  });
});
