import { describe, expect, it } from "vitest";
import {
  aMetricasQuery,
  comoJson,
  serializarParametros,
} from "../src/services/reportes/reporte-parametros.js";
import type { ReporteParametros } from "../src/schemas/reportes/reporte.schema.js";

/**
 * reportes (Bloque E, docs/blocks/e-dashboards.md "Exportación PDF/XLSX"):
 * `serializarParametros`/`aMetricasQuery` son funciones puras (sin BD) --
 * cubren la forma JSON persistida en `ReporteJob.parametros`, base del
 * bloqueo de generación duplicada (`reporte-job.repository.ts::
 * findActivoDuplicado`, comparación de igualdad exacta).
 */
function parametrosBase(overrides: Partial<ReporteParametros> = {}): ReporteParametros {
  return {
    rango: "30d",
    desde: undefined,
    hasta: undefined,
    redSocial: undefined,
    campania: undefined,
    responsableId: undefined,
    empresaId: undefined,
    ...overrides,
  };
}

describe("services/reportes/reporte-parametros — serializarParametros (pura, sin BD)", () => {
  it("omite del todo las claves opcionales ausentes en vez de persistirlas como undefined", () => {
    const resultado = serializarParametros(parametrosBase(), null);

    expect(resultado).toEqual({ rango: "30d" });
    expect(Object.keys(resultado)).not.toContain("empresaId");
    expect(Object.keys(resultado)).not.toContain("desde");
  });

  it("serializa desde/hasta a ISO 8601 (Prisma.InputJsonValue no admite Date)", () => {
    const desde = new Date("2026-08-01T00:00:00.000Z");
    const hasta = new Date("2026-08-31T23:59:59.999Z");

    const resultado = serializarParametros(parametrosBase({ rango: "personalizado", desde, hasta }), null);

    expect(resultado.desde).toBe(desde.toISOString());
    expect(resultado.hasta).toBe(hasta.toISOString());
  });

  it("usa SIEMPRE el empresaId RESUELTO server-side, nunca el crudo de parametros.empresaId del cliente", () => {
    const clienteEnvioOtraEmpresa = parametrosBase({ empresaId: "empresa-que-el-cliente-mando" });

    const resultado = serializarParametros(clienteEnvioOtraEmpresa, "empresa-validada-por-membresia");

    expect(resultado.empresaId).toBe("empresa-validada-por-membresia");
  });

  it("omite empresaId cuando el scope resuelto es holding-wide (null)", () => {
    const resultado = serializarParametros(parametrosBase({ empresaId: "cualquier-cosa" }), null);

    expect(resultado.empresaId).toBeUndefined();
  });

  it("dos llamadas con los mismos parámetros producen el mismo JSON exacto (dedup por igualdad)", () => {
    const desde = new Date("2026-08-01T00:00:00.000Z");
    const hasta = new Date("2026-08-31T23:59:59.999Z");
    const parametros = parametrosBase({ rango: "personalizado", desde, hasta, campania: "verano" });

    const primero = comoJson(serializarParametros(parametros, "empresa-1"));
    const segundo = comoJson(serializarParametros(parametros, "empresa-1"));

    expect(primero).toEqual(segundo);
  });
});

describe("services/reportes/reporte-parametros — aMetricasQuery (pura, sin BD)", () => {
  it("reconstruye un MetricasQuery válido a partir de lo persistido, sin proyectar empresaId", () => {
    const persistido = serializarParametros(
      parametrosBase({ rango: "7d", campania: "black-friday", responsableId: "asesor-1" }),
      "empresa-1",
    );

    const query = aMetricasQuery(persistido);

    expect(query).toEqual({
      rango: "7d",
      desde: undefined,
      hasta: undefined,
      redSocial: undefined,
      campania: "black-friday",
      responsableId: "asesor-1",
    });
    expect(query).not.toHaveProperty("empresaId");
  });

  it("reconstruye desde/hasta como instancias de Date a partir del ISO persistido", () => {
    const desde = new Date("2026-08-01T00:00:00.000Z");
    const hasta = new Date("2026-08-31T23:59:59.999Z");
    const persistido = serializarParametros(parametrosBase({ rango: "personalizado", desde, hasta }), null);

    const query = aMetricasQuery(persistido);

    expect(query.desde).toEqual(desde);
    expect(query.hasta).toEqual(hasta);
  });
});
