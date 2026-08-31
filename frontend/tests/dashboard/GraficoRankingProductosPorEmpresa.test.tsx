import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MetricasRankingProductoPorEmpresa } from "@/tipos/metricas";

/**
 * `GraficoRankingProductosPorEmpresa` -- ranking por (empresa, producto)
 * (docs/23 item 13, `GET /metricas/ranking-productos-por-empresa`). Mismo
 * patrón de ranking que `GraficoPorProducto.tsx`, más un aviso visible
 * exclusivo de sesión `holding` por el gap conocido E5
 * (`docs/blocks/e-dashboards.md`) -- una sesión `company` nunca lo ve, ya que
 * el gap es específico de holding-wide.
 *
 * Detección del scope de sesión: `user?.sessionScope` de `useAuth()`, mismo
 * patrón que `ConectarWhatsAppCard.tsx` (`esHoldingWide = user?.sessionScope
 * === "holding"`) -- no se inventa un mecanismo nuevo.
 */
vi.mock("@/funcionalidades/autenticacion/auth-context", () => ({ useAuth: vi.fn() }));

const { useAuth } = await import("@/funcionalidades/autenticacion/auth-context");
const { GraficoRankingProductosPorEmpresa } = await import(
  "@/funcionalidades/dashboard/GraficoRankingProductosPorEmpresa"
);

const DATOS: MetricasRankingProductoPorEmpresa[] = [
  {
    empresaId: "empresa-1",
    nombreEmpresa: "Empresa A",
    productoId: "prod-1",
    nombreProducto: "Seguro Auto",
    total: 5,
    ventas: 3,
    noVentas: 1,
    tasaConversionPct: 75,
  },
];

function mockScope(scope: "company" | "holding") {
  vi.mocked(useAuth).mockReturnValue({ user: { sessionScope: scope, rol: "ADMINISTRADOR" } } as never);
}

describe("GraficoRankingProductosPorEmpresa — sesión company", () => {
  it("no muestra el aviso del gap E5 (limitación específica de holding-wide)", () => {
    mockScope("company");
    render(<GraficoRankingProductosPorEmpresa datos={DATOS} />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("GraficoRankingProductosPorEmpresa — sesión holding", () => {
  it("muestra un aviso visible de datos posiblemente incompletos (gap E5)", () => {
    mockScope("holding");
    render(<GraficoRankingProductosPorEmpresa datos={DATOS} />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getAllByText(/incompletos/i).length).toBeGreaterThan(0);
  });

  it("renderiza el buscador con aria-label propio", () => {
    mockScope("holding");
    render(<GraficoRankingProductosPorEmpresa datos={DATOS} />);

    expect(screen.getByRole("combobox", { name: "Buscar empresa o producto" })).toBeInTheDocument();
  });
});
