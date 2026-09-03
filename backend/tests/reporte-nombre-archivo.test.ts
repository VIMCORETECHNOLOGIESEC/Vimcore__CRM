import { describe, expect, it } from "vitest";
import { construirNombreArchivoReporte } from "../src/jobs/reportes/reporte-nombre-archivo.js";

/**
 * jobs/reportes/reporte-nombre-archivo.ts (descarga con nombre legible,
 * 2026-09-03): función pura, sin mocks -- cubre sanitización de marca
 * (tildes/ñ, espacios, minúsculas, símbolos raros, vacío) y el formato
 * `ddmmaaaa_hhmm` en UTC con padding de ceros.
 */
describe("jobs/reportes/reporte-nombre-archivo — construirNombreArchivoReporte", () => {
  it("mayúsculas + espacios reemplazados por guion bajo", () => {
    const resultado = construirNombreArchivoReporte(
      "Arcano Crm",
      new Date("2026-09-03T15:30:00.000Z"),
      "pdf",
    );

    expect(resultado).toBe("ARCANO_CRM_03092026_1530.pdf");
  });

  it("quita tildes y ñ (normalize NFD + strip diacríticos)", () => {
    const resultado = construirNombreArchivoReporte(
      "Compañía Ñañez S.A.",
      new Date("2026-01-05T09:05:00.000Z"),
      "xlsx",
    );

    expect(resultado).toBe("COMPANIA_NANEZ_S_A_05012026_0905.xlsx");
  });

  it("colapsa secuencias de símbolos raros en un solo guion bajo y recorta los de los extremos", () => {
    const resultado = construirNombreArchivoReporte(
      "  ***Holding & Cía!!!  ",
      new Date("2026-12-31T23:59:00.000Z"),
      "pdf",
    );

    expect(resultado).toBe("HOLDING_CIA_31122026_2359.pdf");
  });

  it("nombre vacío o compuesto solo por símbolos cae al fallback REPORTE", () => {
    const vacio = construirNombreArchivoReporte("", new Date("2026-09-03T00:00:00.000Z"), "pdf");
    const soloSimbolos = construirNombreArchivoReporte(
      "!!! 😀 ...",
      new Date("2026-09-03T00:00:00.000Z"),
      "pdf",
    );

    expect(vacio).toBe("REPORTE_03092026_0000.pdf");
    expect(soloSimbolos).toBe("REPORTE_03092026_0000.pdf");
  });

  it("formatea día/mes/hora/minuto de un solo dígito con cero a la izquierda", () => {
    const resultado = construirNombreArchivoReporte(
      "X",
      new Date("2026-01-02T03:04:00.000Z"),
      "pdf",
    );

    expect(resultado).toBe("X_02012026_0304.pdf");
  });

  it("usa UTC, no la hora local del proceso -- fecha cercana a medianoche no se corre de día", () => {
    // 2026-06-30T23:45:00.000Z: si el formateo usara hora local con offset
    // negativo (ej. Ecuador UTC-5) se leería como 30/06 18:45, no 30/06 23:45.
    const resultado = construirNombreArchivoReporte(
      "Empresa",
      new Date("2026-06-30T23:45:00.000Z"),
      "xlsx",
    );

    expect(resultado).toBe("EMPRESA_30062026_2345.xlsx");
  });

  it("respeta la extensión pdf vs xlsx", () => {
    const fecha = new Date("2026-09-03T12:00:00.000Z");

    expect(construirNombreArchivoReporte("Marca", fecha, "pdf")).toMatch(/\.pdf$/);
    expect(construirNombreArchivoReporte("Marca", fecha, "xlsx")).toMatch(/\.xlsx$/);
  });
});
