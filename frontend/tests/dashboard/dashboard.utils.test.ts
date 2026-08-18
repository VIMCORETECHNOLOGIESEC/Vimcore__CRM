import { describe, expect, it } from "vitest";
import {
  buildMetricasFiltros,
  FILTROS_DASHBOARD_VACIOS,
  type DashboardFiltrosState,
} from "@/funcionalidades/dashboard/dashboard.utils";

const RANGO = { fechaDesde: "2026-08-01", fechaHasta: "2026-08-14" };

describe("buildMetricasFiltros", () => {
  it("con filtros vacíos, solo manda el rango de fechas", () => {
    expect(buildMetricasFiltros(FILTROS_DASHBOARD_VACIOS, RANGO)).toEqual(RANGO);
  });

  it("traduce cada filtro seleccionado a su campo del contrato de MetricasFiltros", () => {
    const filtros: DashboardFiltrosState = {
      redSocial: "INSTAGRAM",
      campaniaId: "camp-1",
      responsableId: "asesor-1",
    };

    expect(buildMetricasFiltros(filtros, RANGO)).toEqual({
      ...RANGO,
      redSocial: "INSTAGRAM",
      campaniaId: "camp-1",
      responsableId: "asesor-1",
    });
  });
});
