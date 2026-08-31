import { describe, expect, it } from "vitest";
import {
  ETAPAS_TERMINALES,
  TRANSICIONES_INTERMEDIAS,
  esTerminal,
  getTransicionesIntermediasValidas,
} from "@/funcionalidades/oportunidades/etapas";

describe("getTransicionesIntermediasValidas (reglas estrictas de Oportunidad, docs/blocks/d-routing-oportunidad.md)", () => {
  it("NUEVO: solo avanza a CONTACTADO (nunca salta a cierre — eso va por POST /cerrar)", () => {
    expect(getTransicionesIntermediasValidas("NUEVO")).toEqual(["CONTACTADO"]);
  });

  it("CONTACTADO: solo avanza a CITA", () => {
    expect(getTransicionesIntermediasValidas("CONTACTADO")).toEqual(["CITA"]);
  });

  it("CITA: sin transición intermedia (el único paso restante es cerrar)", () => {
    expect(getTransicionesIntermediasValidas("CITA")).toEqual([]);
  });

  it("VENTA: terminal, sin transiciones", () => {
    expect(getTransicionesIntermediasValidas("VENTA")).toEqual([]);
  });

  it("NO_VENTA: terminal, sin transiciones", () => {
    expect(getTransicionesIntermediasValidas("NO_VENTA")).toEqual([]);
  });

  it("ninguna etapa ofrece VENTA ni NO_VENTA como transición intermedia", () => {
    for (const etapa of ["NUEVO", "CONTACTADO", "CITA", "VENTA", "NO_VENTA"] as const) {
      expect(getTransicionesIntermediasValidas(etapa)).not.toContain("VENTA");
      expect(getTransicionesIntermediasValidas(etapa)).not.toContain("NO_VENTA");
    }
  });

  it("ninguna etapa retrocede a una etapa anterior", () => {
    const ORDEN: Record<string, number> = { NUEVO: 0, CONTACTADO: 1, CITA: 2 };
    for (const etapa of ["NUEVO", "CONTACTADO", "CITA"] as const) {
      for (const destino of getTransicionesIntermediasValidas(etapa)) {
        expect(ORDEN[destino]).toBeGreaterThan(ORDEN[etapa]);
      }
    }
  });
});

describe("TRANSICIONES_INTERMEDIAS", () => {
  it("expone exactamente las cinco etapas del embudo", () => {
    expect(Object.keys(TRANSICIONES_INTERMEDIAS).sort()).toEqual(
      ["CITA", "CONTACTADO", "NO_VENTA", "NUEVO", "VENTA"].sort(),
    );
  });
});

describe("ETAPAS_TERMINALES", () => {
  it("contiene exactamente VENTA y NO_VENTA", () => {
    expect(ETAPAS_TERMINALES).toEqual(["VENTA", "NO_VENTA"]);
  });
});

describe("esTerminal", () => {
  it("es true para VENTA y NO_VENTA", () => {
    expect(esTerminal("VENTA")).toBe(true);
    expect(esTerminal("NO_VENTA")).toBe(true);
  });

  it("es false para las etapas intermedias", () => {
    expect(esTerminal("NUEVO")).toBe(false);
    expect(esTerminal("CONTACTADO")).toBe(false);
    expect(esTerminal("CITA")).toBe(false);
  });
});
