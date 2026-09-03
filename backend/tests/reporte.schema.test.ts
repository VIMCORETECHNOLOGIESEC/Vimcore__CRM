import { describe, expect, it } from "vitest";
import { crearReporteJobBodySchema, reporteParametrosSchema } from "../src/schemas/reportes/reporte.schema.js";

/**
 * pdf-ejecutivo: cobertura del campo nuevo `plantilla` en
 * `reporteParametrosSchema` -- aditivo, `reporteParametrosSchema` no tenía
 * test dedicado antes de este cambio (ver `reporte-parametros.test.ts` para
 * `serializarParametros`/`aMetricasQuery`, que son funciones distintas en
 * otro archivo).
 */
describe("schemas/reportes/reporte.schema — reporteParametrosSchema.plantilla", () => {
  it("usa 'detallado' por defecto cuando plantilla no se especifica", () => {
    const resultado = reporteParametrosSchema.parse({});

    expect(resultado.plantilla).toBe("detallado");
  });

  it("acepta explícitamente plantilla: 'ejecutivo'", () => {
    const resultado = reporteParametrosSchema.parse({ plantilla: "ejecutivo" });

    expect(resultado.plantilla).toBe("ejecutivo");
  });

  it("rechaza un valor de plantilla fuera del enum", () => {
    const resultado = reporteParametrosSchema.safeParse({ plantilla: "premium" });

    expect(resultado.success).toBe(false);
  });

  it("acepta plantilla: 'ejecutivo' aun cuando tipo === 'xlsx' (se ignora sin error)", () => {
    const resultado = crearReporteJobBodySchema.safeParse({
      tipo: "xlsx",
      parametros: { plantilla: "ejecutivo" },
    });

    expect(resultado.success).toBe(true);
  });
});
