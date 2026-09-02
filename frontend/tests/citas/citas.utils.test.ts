import { describe, expect, it } from "vitest";
import {
  buildMonthDays,
  buildVisibleRange,
  formatRangoHora,
  hasDuracionMinima,
  toDatetimeLocalValue,
} from "@/funcionalidades/citas/citas.utils";

describe("citas.utils", () => {
  it("construye el rango mensual con semanas completas de lunes a domingo", () => {
    const rango = buildVisibleRange(new Date("2026-03-15T12:00:00"), "mes");

    expect(rango.desde.getDay()).toBe(1);
    expect(rango.hasta.getDay()).toBe(0);
    expect(buildMonthDays(new Date("2026-03-15T12:00:00"))).toHaveLength(42);
  });

  it("valida que la cita dure al menos una hora", () => {
    expect(hasDuracionMinima("2026-03-01T10:00", "2026-03-01T10:59")).toBe(false);
    expect(hasDuracionMinima("2026-03-01T10:00", "2026-03-01T11:00")).toBe(true);
  });

  it("formatea el rango horario usando finalizaEn cuando está disponible", () => {
    expect(
      formatRangoHora({
        programadaPara: "2026-03-01T10:00:00.000Z",
        finalizaEn: "2026-03-01T11:30:00.000Z",
      }),
    ).toMatch(/^\d{2}:\d{2}–\d{2}:\d{2}$/);
  });

  it("convierte ISO a datetime-local sin perder minutos", () => {
    expect(toDatetimeLocalValue("2026-03-01T10:45:00.000Z")).toContain("T");
    expect(toDatetimeLocalValue("2026-03-01T10:45:00.000Z").endsWith(":45")).toBe(true);
  });
});
