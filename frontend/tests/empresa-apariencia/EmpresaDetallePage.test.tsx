import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmpresaAparienciaHoldingView } from "@/funcionalidades/empresa-apariencia/empresa-apariencia-holding.api";

vi.mock("@/funcionalidades/empresa-apariencia/empresa-apariencia-holding.api", () => ({
  fetchEmpresasHoldingApi: vi.fn(),
}));
vi.mock("@/funcionalidades/empresa-apariencia/useVistaEmpresa", () => ({
  useVistaEmpresa: vi.fn(),
}));

const empresaAparienciaHoldingApi = await import(
  "@/funcionalidades/empresa-apariencia/empresa-apariencia-holding.api"
);
const { useVistaEmpresa } = await import("@/funcionalidades/empresa-apariencia/useVistaEmpresa");
const { EmpresaDetallePage } = await import(
  "@/funcionalidades/empresa-apariencia/EmpresaDetallePage"
);

const fetchEmpresasHoldingApiMock = vi.mocked(empresaAparienciaHoldingApi.fetchEmpresasHoldingApi);
const useVistaEmpresaMock = vi.mocked(useVistaEmpresa);

const entrarAEmpresaMock = vi.fn();
const salirDeEmpresaMock = vi.fn();

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

beforeEach(() => {
  fetchEmpresasHoldingApiMock.mockReset();
  // Default sano para tests que no dependen del listado (ej. empresaId
  // ausente, donde el componente nunca debería llegar a leer el resultado)
  // -- evita el warning de TanStack Query por una query sin resolver.
  fetchEmpresasHoldingApiMock.mockResolvedValue({ items: [], total: 0 });
  entrarAEmpresaMock.mockReset();
  salirDeEmpresaMock.mockReset();
  useVistaEmpresaMock.mockReturnValue({
    empresaVistaId: null,
    entrarAEmpresa: entrarAEmpresaMock,
    salirDeEmpresa: salirDeEmpresaMock,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * `EmpresaDetallePage` se monta hoy en `/empresas/:empresaId` -- por defecto
 * renderiza con ese param presente y resuelto (`e1`). El caso de param
 * ausente tiene su propio helper (`renderSinEmpresaId`) porque necesita una
 * ruta distinta, sin `:empresaId` en el path.
 */
function renderPage(rutaInicial = "/empresas/e1") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[rutaInicial]}>
        <Routes>
          <Route path="/empresas/:empresaId" element={<EmpresaDetallePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderSinEmpresaId() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/empresas"]}>
        <Routes>
          <Route path="/empresas" element={<EmpresaDetallePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("EmpresaDetallePage — flujo principal", () => {
  it("muestra un estado de carga mientras se resuelve el listado", () => {
    fetchEmpresasHoldingApiMock.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByRole("status", { name: "Cargando" })).toBeInTheDocument();
  });

  it("muestra un mensaje accionable y permite reintentar cuando falla la carga", async () => {
    fetchEmpresasHoldingApiMock.mockRejectedValue(new Error("network error"));
    renderPage();

    expect(await screen.findByText("No se pudo completar la operación")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });

  it("renderiza el nombre, el isotipo y los dos links de acceso de la empresa encontrada", async () => {
    fetchEmpresasHoldingApiMock.mockResolvedValue({
      items: [empresaFake({ id: "e1", nombre: "Empresa A", logoUrl: "https://cdn.test/e1.png" })],
      total: 1,
    });
    const { container } = renderPage();

    expect(await screen.findByRole("heading", { name: "Empresa A" })).toBeInTheDocument();
    // El isotipo es decorativo (`alt=""`), sin role="img" accesible -- se
    // busca por tag directo en vez de por rol.
    expect(container.querySelector("img")).toHaveAttribute("src", "https://cdn.test/e1.png");

    const usuarios = screen.getByRole("link", { name: /usuarios/i });
    expect(usuarios).toHaveAttribute("href", "/usuarios?empresaId=e1");

    const bridges = screen.getByRole("link", { name: /bridges/i });
    expect(bridges).toHaveAttribute("href", "/bridges?empresaId=e1");
  });
});

describe("EmpresaDetallePage — punto frágil: empresa no encontrada en el listado", () => {
  it("si el empresaId de la URL no está en los resultados, muestra 'No se encontró' sin quedar en loading infinito", async () => {
    fetchEmpresasHoldingApiMock.mockResolvedValue({
      items: [empresaFake({ id: "otra-empresa", nombre: "Otra Empresa" })],
      total: 1,
    });
    renderPage("/empresas/e1");

    expect(await screen.findByText("No se encontró la empresa solicitada.")).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Cargando" })).not.toBeInTheDocument();
  });
});

describe("EmpresaDetallePage — punto frágil: empresaId ausente en la URL", () => {
  it("muestra el error de identificador faltante y no llama a entrarAEmpresa", () => {
    renderSinEmpresaId();

    expect(screen.getByText("Falta el identificador de la empresa en la URL.")).toBeInTheDocument();
    expect(entrarAEmpresaMock).not.toHaveBeenCalled();
  });
});

describe("EmpresaDetallePage — punto frágil: efecto de entrar/salir de la vista de empresa", () => {
  it("al montar con un empresaId válido llama a entrarAEmpresa una sola vez, incluso tras re-renders por la carga de datos", async () => {
    fetchEmpresasHoldingApiMock.mockResolvedValue({
      items: [empresaFake({ id: "e1", nombre: "Empresa A" })],
      total: 1,
    });
    renderPage("/empresas/e1");

    // Espera a que la carga termine (loading -> success ya disparó sus re-renders).
    await screen.findByRole("heading", { name: "Empresa A" });

    expect(entrarAEmpresaMock).toHaveBeenCalledTimes(1);
    expect(entrarAEmpresaMock).toHaveBeenCalledWith("e1");
    expect(salirDeEmpresaMock).not.toHaveBeenCalled();
  });

  it("al desmontar, llama a salirDeEmpresa", async () => {
    fetchEmpresasHoldingApiMock.mockResolvedValue({
      items: [empresaFake({ id: "e1", nombre: "Empresa A" })],
      total: 1,
    });
    const { unmount } = renderPage("/empresas/e1");
    await screen.findByRole("heading", { name: "Empresa A" });

    unmount();

    await waitFor(() => expect(salirDeEmpresaMock).toHaveBeenCalledTimes(1));
  });
});
