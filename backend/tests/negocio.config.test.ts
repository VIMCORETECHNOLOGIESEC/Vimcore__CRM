import { describe, expect, it } from "vitest";
import {
  BRIDGE_MUDO_HORAS,
  SLA_HORAS,
  UMBRAL_AMARILLO,
  UMBRAL_VERDE,
  VENTANA_REINGRESO_DIAS,
} from "../src/config/negocio.js";

describe("config/negocio — umbrales M5 (docs/04 §2, D9)", () => {
  it("UMBRAL_VERDE es 70 y UMBRAL_AMARILLO es 40 (docs/04 §2)", () => {
    expect(UMBRAL_VERDE).toBe(70);
    expect(UMBRAL_AMARILLO).toBe(40);
  });

  it("UMBRAL_VERDE > UMBRAL_AMARILLO > 0 (rangos del semáforo no se superponen)", () => {
    expect(UMBRAL_VERDE).toBeGreaterThan(UMBRAL_AMARILLO);
    expect(UMBRAL_AMARILLO).toBeGreaterThan(0);
  });

  it("SLA_HORAS es 24 (docs/02 §7)", () => {
    expect(SLA_HORAS).toBe(24);
  });

  it("no rompe VENTANA_REINGRESO_DIAS existente de M3 (90)", () => {
    expect(VENTANA_REINGRESO_DIAS).toBe(90);
  });

  it("BRIDGE_MUDO_HORAS es 72 (docs/05-bridges.md §8)", () => {
    expect(BRIDGE_MUDO_HORAS).toBe(72);
  });
});
