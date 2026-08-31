import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MetricasCascadaLeadOportunidad } from "@/tipos/metricas";
import { CascadaLeadOportunidad } from "@/funcionalidades/dashboard/CascadaLeadOportunidad";

/**
 * `CascadaLeadOportunidad` -- vista compacta de estadísticas (NO un
 * gráfico), 3 conteos de cohorte + 2 tasas (docs/23 item 13,
 * `GET /metricas/cascada-lead-oportunidad`). Al ser texto plano (sin
 * recharts) las aserciones son directas, sin la limitación de
 * `ResponsiveContainer` en jsdom que sí afecta a los demás componentes de
 * este bloque.
 */
describe("CascadaLeadOportunidad", () => {
  it("muestra los 3 conteos de la cohorte", () => {
    const datos: MetricasCascadaLeadOportunidad = {
      leads: 20,
      conOportunidad: 8,
      ventaOportunidad: 3,
      tasaAperturaPct: 40,
      tasaCierrePct: 37.5,
    };
    render(<CascadaLeadOportunidad datos={datos} />);

    expect(screen.getByText("20")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("muestra las tasas de apertura y cierre cuando vienen con dato", () => {
    const datos: MetricasCascadaLeadOportunidad = {
      leads: 20,
      conOportunidad: 8,
      ventaOportunidad: 3,
      tasaAperturaPct: 40,
      tasaCierrePct: 37.5,
    };
    render(<CascadaLeadOportunidad datos={datos} />);

    expect(screen.getByText(/40 %/)).toBeInTheDocument();
    expect(screen.getByText(/37.5 %/)).toBeInTheDocument();
  });

  it("muestra «Sin datos» en vez de un porcentaje engañoso cuando la tasa viene null (denominador 0)", () => {
    const datos: MetricasCascadaLeadOportunidad = {
      leads: 0,
      conOportunidad: 0,
      ventaOportunidad: 0,
      tasaAperturaPct: null,
      tasaCierrePct: null,
    };
    render(<CascadaLeadOportunidad datos={datos} />);

    const sinDatos = screen.getAllByText(/sin datos/i);
    expect(sinDatos.length).toBeGreaterThanOrEqual(2);
  });
});
