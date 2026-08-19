import { describe, expect, it } from "vitest";
import { formatFechaLocal } from "@/funcionalidades/dashboard/rangoFechas";

/**
 * `calculateRangoPreset`/`calculatePeriodoAnterior` se eliminaron con la
 * integración F5/M9: el backend real (`resolveRangoFechas`,
 * `backend/src/lib/rango-fechas.ts`) calcula la ventana de fechas y el
 * período de comparación a partir del preset -- el frontend solo formatea
 * fechas locales para el par de `<input type="date">` de "Personalizado".
 */
describe("formatFechaLocal", () => {
  it("formatea con padding de dos dígitos en mes y día", () => {
    expect(formatFechaLocal(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("usa la fecha en hora local, no UTC", () => {
    expect(formatFechaLocal(new Date(2026, 7, 14, 23, 59))).toBe("2026-08-14");
  });
});
