import { describe, expect, it } from "vitest";
import { ETAPAS_TERMINALES, getTransicionesValidas } from "@/funcionalidades/leads/etapas";

describe("getTransicionesValidas (docs/02-reglas-negocio.md §6, progreso lineal hacia adelante)", () => {
  it("NUEVO: permite avanzar a CONTACTADO o saltar directo a cierre", () => {
    expect(getTransicionesValidas("NUEVO")).toEqual(["CONTACTADO", "VENTA", "NO_VENTA"]);
  });

  it("CONTACTADO: permite avanzar a CITA o saltar directo a cierre", () => {
    expect(getTransicionesValidas("CONTACTADO")).toEqual(["CITA", "VENTA", "NO_VENTA"]);
  });

  it("CITA: solo permite cierre (último paso lineal antes de terminal)", () => {
    expect(getTransicionesValidas("CITA")).toEqual(["VENTA", "NO_VENTA"]);
  });

  it("VENTA: terminal, sin transiciones (no se reabre)", () => {
    expect(getTransicionesValidas("VENTA")).toEqual([]);
  });

  it("NO_VENTA: terminal, sin transiciones (no se reabre)", () => {
    expect(getTransicionesValidas("NO_VENTA")).toEqual([]);
  });

  it("ninguna etapa no terminal ofrece una etapa anterior como destino válido", () => {
    const ORDEN: Record<string, number> = { NUEVO: 0, CONTACTADO: 1, CITA: 2 };
    for (const etapa of ["NUEVO", "CONTACTADO", "CITA"] as const) {
      const destinosLineales = getTransicionesValidas(etapa).filter(
        (destino) => destino in ORDEN,
      );
      for (const destino of destinosLineales) {
        expect(ORDEN[destino]).toBeGreaterThan(ORDEN[etapa]);
      }
    }
  });
});

describe("ETAPAS_TERMINALES (docs/02-reglas-negocio.md §6)", () => {
  it("contiene exactamente VENTA y NO_VENTA", () => {
    expect(ETAPAS_TERMINALES).toEqual(["VENTA", "NO_VENTA"]);
  });
});
