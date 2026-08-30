import { describe, expect, it } from "vitest";
import { metricasQuerySchema } from "../src/schemas/metricas.schema.js";

describe("schemas/metricas.schema — normalización de `hasta` a fin de día (docs/08 §4)", () => {
  it("hasta='2026-08-18' (fecha cruda de <input type=date>) se normaliza a fin de día UTC", () => {
    const result = metricasQuerySchema.parse({
      rango: "personalizado",
      desde: "2026-08-01",
      hasta: "2026-08-18",
    });
    expect(result.hasta?.toISOString()).toBe("2026-08-18T23:59:59.999Z");
  });

  it("caso límite: desde y hasta el mismo día no lanza (desde medianoche <= hasta fin de día)", () => {
    expect(() =>
      metricasQuerySchema.parse({
        rango: "personalizado",
        desde: "2026-08-18",
        hasta: "2026-08-18",
      }),
    ).not.toThrow();
  });

  it("regresión: desde posterior a hasta sigue lanzando aun con hasta normalizado a fin de día", () => {
    expect(() =>
      metricasQuerySchema.parse({
        rango: "personalizado",
        desde: "2026-08-19",
        hasta: "2026-08-18",
      }),
    ).toThrow();
  });

  it("un rango distinto de 'personalizado' sin hasta no crashea y hasta queda undefined", () => {
    const result = metricasQuerySchema.parse({ rango: "30d" });
    expect(result.hasta).toBeUndefined();
  });
});

describe("schemas/metricas.schema — empresaId opcional (fix: drill-down holding-wide)", () => {
  it("acepta empresaId como uuid opcional", () => {
    const result = metricasQuerySchema.parse({
      rango: "30d",
      empresaId: "11111111-1111-4111-8111-111111111111",
    });
    expect(result.empresaId).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("triangulación: sin empresaId en el query, queda undefined (no rompe el uso previo sin este filtro)", () => {
    const result = metricasQuerySchema.parse({ rango: "30d" });
    expect(result.empresaId).toBeUndefined();
  });

  it("empresaId no-uuid es rechazado", () => {
    expect(() => metricasQuerySchema.parse({ rango: "30d", empresaId: "no-es-un-uuid" })).toThrow();
  });
});
