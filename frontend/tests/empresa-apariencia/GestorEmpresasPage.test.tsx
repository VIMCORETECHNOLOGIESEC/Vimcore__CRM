import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmpresaAparienciaHoldingView } from "@/funcionalidades/empresa-apariencia/empresa-apariencia-holding.api";

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
      <GestorEmpresasPage />
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
    fetchEmpresasHoldingApiMock.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/todavía no hay empresas/i)).toBeInTheDocument();
  });

  it("muestra un mensaje accionable cuando falla la carga", async () => {
    fetchEmpresasHoldingApiMock.mockRejectedValue(new Error("network error"));
    renderPage();
    expect(await screen.findByText("No se pudo completar la operación")).toBeInTheDocument();
  });

  it("lista las empresas devueltas por el backend", async () => {
    fetchEmpresasHoldingApiMock.mockResolvedValue([
      empresaFake({ id: "e1", nombre: "Empresa A" }),
      empresaFake({ id: "e2", nombre: "Empresa B", colorPrimario: null, colorSecundario: null }),
    ]);
    renderPage();

    expect(await screen.findByText("Empresa A")).toBeInTheDocument();
    expect(screen.getByText("Empresa B")).toBeInTheDocument();
  });

  it("abre el editor de una empresa y envía la edición al backend", async () => {
    fetchEmpresasHoldingApiMock.mockResolvedValue([empresaFake()]);
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
