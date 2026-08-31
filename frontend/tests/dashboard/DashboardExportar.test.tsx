import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardExportContext, DashboardExportData } from "@/funcionalidades/dashboard/exportarDashboard";
import type { MetricasFiltros } from "@/tipos/metricas";

/**
 * `DashboardExportar` -- decisión 1 de
 * docs/propuesta-consolidacion-exportacion-reportes.md §6: copy que
 * distinga "vista rápida" (Dashboard) de "reporte formal" (Reportes), con
 * link directo. `exportarDashboard` mockeado (su propia lógica de armado
 * del workbook va en `exportarDashboard.test.ts`) -- acá solo se testea la
 * composición del componente: copy, link, y que sigue disparando la
 * exportación correcta según el ítem elegido (comportamiento preexistente,
 * sin cambios de decisión 1).
 */
vi.mock("@/funcionalidades/dashboard/exportarDashboard", () => ({
  descargarExcel: vi.fn(),
  descargarPdf: vi.fn(),
  obtenerLeadsParaExportacion: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { custom: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}));

const exportarDashboard = await import("@/funcionalidades/dashboard/exportarDashboard");
const { toast } = await import("sonner");
const { DashboardExportar } = await import("@/funcionalidades/dashboard/DashboardExportar");

const descargarExcelMock = vi.mocked(exportarDashboard.descargarExcel);
const descargarPdfMock = vi.mocked(exportarDashboard.descargarPdf);
const obtenerLeadsParaExportacionMock = vi.mocked(exportarDashboard.obtenerLeadsParaExportacion);

const DATA: DashboardExportData = {};
const CONTEXTO: DashboardExportContext = {
  rango: "01/08/2026 - 07/08/2026",
  filtros: [],
  empresa: { nombre: "Empresa Demo", usuario: "Usuaria de prueba", correo: "u1@crm.test" },
};
const FILTROS: MetricasFiltros = { rango: "7d" };

function renderComponente() {
  return render(
    <MemoryRouter>
      <DashboardExportar data={DATA} contexto={CONTEXTO} filtros={FILTROS} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  obtenerLeadsParaExportacionMock.mockReset().mockResolvedValue([]);
  descargarExcelMock.mockReset();
  descargarPdfMock.mockReset();
  vi.mocked(toast.custom).mockReset();
  vi.mocked(toast.error).mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("DashboardExportar — copy de vista rápida vs. reporte formal", () => {
  it("el botón comunica 'vista actual', no 'documento formal'", () => {
    renderComponente();
    expect(screen.getByRole("button", { name: "Exportar vista actual" })).toBeInTheDocument();
  });

  it("el dropdown explica la diferencia con Reportes y linkea a /reportes", async () => {
    const user = userEvent.setup();
    renderComponente();

    await user.click(screen.getByRole("button", { name: "Exportar vista actual" }));

    expect(
      await screen.findByText(/Descarga instantánea de lo que ves en pantalla ahora/i),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Reportes" });
    expect(link).toHaveAttribute("href", "/reportes");
  });

  it("el ítem del dropdown dice honestamente 'Descargar Excel' (ya no es un CSV mal etiquetado)", async () => {
    const user = userEvent.setup();
    renderComponente();

    await user.click(screen.getByRole("button", { name: "Exportar vista actual" }));

    expect(await screen.findByText("Descargar Excel")).toBeInTheDocument();
  });
});

describe("DashboardExportar — dispara la exportación correcta (comportamiento preexistente)", () => {
  it("Descargar Excel llama a descargarExcel con los datos completos", async () => {
    const user = userEvent.setup();
    renderComponente();

    await user.click(screen.getByRole("button", { name: "Exportar vista actual" }));
    await user.click(await screen.findByText("Descargar Excel"));

    await waitFor(() => expect(descargarExcelMock).toHaveBeenCalledWith({ ...DATA, leads: [] }, CONTEXTO));
    expect(descargarPdfMock).not.toHaveBeenCalled();
  });

  it("Descargar PDF llama a descargarPdf", async () => {
    vi.spyOn(window, "open").mockReturnValue({ opener: null } as unknown as Window);
    const user = userEvent.setup();
    renderComponente();

    await user.click(screen.getByRole("button", { name: "Exportar vista actual" }));
    await user.click(await screen.findByText("Descargar PDF"));

    await waitFor(() => expect(descargarPdfMock).toHaveBeenCalled());
    expect(descargarExcelMock).not.toHaveBeenCalled();
  });

  it("un error al preparar la exportación muestra un toast accionable en español", async () => {
    obtenerLeadsParaExportacionMock.mockRejectedValue(new Error("falló"));
    const user = userEvent.setup();
    renderComponente();

    await user.click(screen.getByRole("button", { name: "Exportar vista actual" }));
    await user.click(await screen.findByText("Descargar Excel"));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "No se pudo preparar la exportación. Intentá nuevamente.",
        expect.anything(),
      ),
    );
  });
});
