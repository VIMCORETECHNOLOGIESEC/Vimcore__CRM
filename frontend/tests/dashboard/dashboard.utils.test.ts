import { describe, expect, it } from "vitest";
import {
  buildMetricasFiltros,
  FILTROS_DASHBOARD_VACIOS,
  type DashboardFiltrosState,
  type RangoSeleccionado,
} from "@/funcionalidades/dashboard/dashboard.utils";

const RANGO_30D: RangoSeleccionado = { preset: "30d", desde: "", hasta: "" };
const RANGO_PERSONALIZADO: RangoSeleccionado = {
  preset: "personalizado",
  desde: "2026-08-01",
  hasta: "2026-08-14",
};

describe("buildMetricasFiltros", () => {
  it("con filtros vacíos y un preset automático, solo manda `rango` (sin desde/hasta)", () => {
    expect(buildMetricasFiltros(FILTROS_DASHBOARD_VACIOS, RANGO_30D)).toEqual({ rango: "30d" });
  });

  it("con rango personalizado, agrega desde/hasta al contrato", () => {
    expect(buildMetricasFiltros(FILTROS_DASHBOARD_VACIOS, RANGO_PERSONALIZADO)).toEqual({
      rango: "personalizado",
      desde: "2026-08-01",
      hasta: "2026-08-14",
    });
  });

  it("traduce cada filtro seleccionado a su campo del contrato de MetricasFiltros", () => {
    const filtros: DashboardFiltrosState = {
      redSocial: "INSTAGRAM",
      campania: "Verano 2026",
      responsableId: "asesor-1",
    };

    expect(buildMetricasFiltros(filtros, RANGO_30D)).toEqual({
      rango: "30d",
      redSocial: "INSTAGRAM",
      campania: "Verano 2026",
      responsableId: "asesor-1",
    });
  });
});
