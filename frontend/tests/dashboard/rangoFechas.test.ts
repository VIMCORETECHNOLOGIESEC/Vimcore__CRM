import { describe, expect, it } from "vitest";
import { calculatePeriodoAnterior, calculateRangoPreset } from "@/funcionalidades/dashboard/rangoFechas";

const AHORA = new Date(2026, 7, 14, 10, 30); // 14/08/2026, hora local

describe("calculateRangoPreset", () => {
  it("HOY: desde y hasta son la fecha de hoy", () => {
    expect(calculateRangoPreset("HOY", AHORA)).toEqual({
      fechaDesde: "2026-08-14",
      fechaHasta: "2026-08-14",
    });
  });

  it("SIETE_DIAS: incluye hoy y los 6 días anteriores (7 días en total)", () => {
    expect(calculateRangoPreset("SIETE_DIAS", AHORA)).toEqual({
      fechaDesde: "2026-08-08",
      fechaHasta: "2026-08-14",
    });
  });

  it("TREINTA_DIAS: incluye hoy y los 29 días anteriores (30 días en total)", () => {
    expect(calculateRangoPreset("TREINTA_DIAS", AHORA)).toEqual({
      fechaDesde: "2026-07-16",
      fechaHasta: "2026-08-14",
    });
  });

  it("MES_ACTUAL: desde el día 1 del mes en curso hasta hoy", () => {
    expect(calculateRangoPreset("MES_ACTUAL", AHORA)).toEqual({
      fechaDesde: "2026-08-01",
      fechaHasta: "2026-08-14",
    });
  });

  it("MES_ANTERIOR: mes calendario completo anterior", () => {
    expect(calculateRangoPreset("MES_ANTERIOR", AHORA)).toEqual({
      fechaDesde: "2026-07-01",
      fechaHasta: "2026-07-31",
    });
  });
});

describe("calculatePeriodoAnterior", () => {
  it("un rango de 7 días compara contra los 7 días inmediatamente anteriores", () => {
    expect(
      calculatePeriodoAnterior({ fechaDesde: "2026-08-08", fechaHasta: "2026-08-14" }),
    ).toEqual({ fechaDesde: "2026-08-01", fechaHasta: "2026-08-07" });
  });

  it("un rango de un solo día (Hoy) compara contra el día anterior", () => {
    expect(
      calculatePeriodoAnterior({ fechaDesde: "2026-08-14", fechaHasta: "2026-08-14" }),
    ).toEqual({ fechaDesde: "2026-08-13", fechaHasta: "2026-08-13" });
  });

  it("un rango que cruza fin de mes calcula bien la duración", () => {
    expect(
      calculatePeriodoAnterior({ fechaDesde: "2026-08-01", fechaHasta: "2026-08-10" }),
    ).toEqual({ fechaDesde: "2026-07-22", fechaHasta: "2026-07-31" });
  });
});
