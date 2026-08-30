import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { MetricasPorProducto } from "@/tipos/metricas";
import { GraficoPorProducto } from "@/funcionalidades/dashboard/GraficoPorProducto";

/**
 * `GraficoPorProducto` -- ranking global por producto (docs/23 item 13,
 * `GET /metricas/por-producto`), mismo patrón `ResponsableCombobox` +
 * `useVentanaGrafico` + `PaginadorGrafico` que `GraficoPorCampania.tsx`.
 *
 * Recharts no renderiza contenido dentro de `ResponsiveContainer` en jsdom
 * (0 width/height) -- las aserciones acá van contra el buscador y el
 * paginador, que SÍ viven fuera del `BarChart`, igual criterio que el resto
 * de `tests/dashboard/` (no se pelea contra el SVG de recharts).
 */
function producto(indice: number): MetricasPorProducto {
  return {
    productoId: `prod-${indice}`,
    nombreProducto: `Producto ${indice}`,
    total: 10 - indice,
    ventas: 3,
    noVentas: 1,
    tasaConversionPct: 75,
  };
}

describe("GraficoPorProducto", () => {
  it("renderiza el buscador de productos con su aria-label propio", () => {
    render(<GraficoPorProducto datos={[producto(1), producto(2)]} />);

    expect(screen.getByRole("combobox", { name: "Buscar producto" })).toBeInTheDocument();
  });

  it("sin superar el tamaño de ventana, no muestra paginador", () => {
    const datos = Array.from({ length: 5 }, (_, i) => producto(i + 1));
    render(<GraficoPorProducto datos={datos} />);

    expect(screen.queryByText(/Página \d+ de \d+/)).not.toBeInTheDocument();
  });

  it("con más filas que el tamaño de ventana, muestra el paginador con el total de páginas correcto", () => {
    const datos = Array.from({ length: 12 }, (_, i) => producto(i + 1));
    render(<GraficoPorProducto datos={datos} />);

    expect(screen.getByText("Página 1 de 2")).toBeInTheDocument();
  });

  it("el buscador permite ubicar un producto por nombre entre las opciones", async () => {
    const datos = Array.from({ length: 12 }, (_, i) => producto(i + 1));
    const user = userEvent.setup();
    render(<GraficoPorProducto datos={datos} />);

    await user.click(screen.getByRole("combobox", { name: "Buscar producto" }));
    await user.type(screen.getByPlaceholderText("Nombre del producto…"), "11");
    expect(await screen.findByRole("option", { name: /Producto 11/ })).toBeInTheDocument();
  });
});
