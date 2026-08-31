import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MetricasEmbudoOportunidad } from "@/tipos/metricas";
import { GraficoEmbudoOportunidad } from "@/funcionalidades/dashboard/GraficoEmbudoOportunidad";

/**
 * `GraficoEmbudoOportunidad` -- embudo de negociación sobre `Oportunidad`
 * (docs/23 item 13), estructuralmente igual a `GraficoEmbudo` pero con
 * `aria-label`/texto propios para no colisionar con el embudo de Lead que ya
 * vive en la misma página (`DashboardPage.tsx`, sección "Operación").
 *
 * Recharts no renderiza contenido dentro de `ResponsiveContainer` en jsdom
 * (0 width/height, sin layout real) -- por eso las aserciones acá van contra
 * la lista `<ol>` de pasos debajo del gráfico, igual criterio que el resto
 * de `tests/dashboard/` para componentes con recharts.
 */
const DATOS: MetricasEmbudoOportunidad = {
  pasos: [
    { etapa: "NUEVO", total: 4, caidaPct: null },
    { etapa: "CONTACTADO", total: 3, caidaPct: 25 },
    { etapa: "CITA", total: 2, caidaPct: 33.33 },
    { etapa: "VENTA", total: 1, caidaPct: 50 },
  ],
  noVenta: 2,
};

describe("GraficoEmbudoOportunidad", () => {
  it("muestra las 4 etapas con su total, en orden", () => {
    render(<GraficoEmbudoOportunidad datos={DATOS} />);

    const lista = screen.getByRole("list", { name: /embudo de oportunidad/i });
    expect(lista).toBeInTheDocument();
    expect(screen.getByText("Nuevo")).toBeInTheDocument();
    expect(screen.getByText("Contactado")).toBeInTheDocument();
    expect(screen.getByText("Cita")).toBeInTheDocument();
    expect(screen.getByText("Venta")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("muestra el % de caída respecto del paso anterior", () => {
    render(<GraficoEmbudoOportunidad datos={DATOS} />);

    expect(screen.getByText(/Caída: 25 %/)).toBeInTheDocument();
  });

  it("muestra No Venta aparte del embudo, con lenguaje propio de Oportunidad", () => {
    render(<GraficoEmbudoOportunidad datos={DATOS} />);

    expect(screen.getByText(/No Venta/)).toBeInTheDocument();
    expect(screen.getByText(/2 oportunidades/)).toBeInTheDocument();
  });

  it("no usa el mismo aria-label que el embudo de Lead (evita colisión de accesibilidad en la misma página)", () => {
    render(<GraficoEmbudoOportunidad datos={DATOS} />);

    expect(screen.queryByRole("list", { name: "Detalle de caídas del embudo" })).not.toBeInTheDocument();
  });
});
