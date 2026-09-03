import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReporteJob } from "@prisma/client";

/**
 * services/reportes/reportes.service.ts — `obtenerNombreArchivoReporte`
 * (nombre de descarga legible, 2026-09-03): unit test puro, mockea
 * `jobs/reportes/reporte-marca.ts::resolverMarcaReporte` (ya cubierto
 * aisladamente en `reporte-marca.test.ts`) y usa la implementación real de
 * `construirNombreArchivoReporte` (ya cubierta en
 * `reporte-nombre-archivo.test.ts`) para verificar el cableado entre ambos.
 */
const mocks = vi.hoisted(() => ({
  resolverMarcaReporte: vi.fn(),
}));

vi.mock("../src/jobs/reportes/reporte-marca.js", () => ({
  resolverMarcaReporte: mocks.resolverMarcaReporte,
}));

import { obtenerNombreArchivoReporte } from "../src/services/reportes/reportes.service.js";

function jobFixture(overrides: Partial<ReporteJob> = {}): ReporteJob {
  return {
    id: "job-1",
    usuarioId: "usuario-1",
    tipo: "pdf",
    parametros: { rango: "30d" },
    estado: "LISTO",
    archivoUrl: "un-blob-uuid.pdf",
    error: null,
    creadoEn: new Date("2026-09-01T10:00:00.000Z"),
    finalizadoEn: null,
    ...overrides,
  } as ReporteJob;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolverMarcaReporte.mockResolvedValue({
    nombre: "Arcano CRM",
    colorPrimario: "#111111",
    colorSecundario: "#222222",
    logoUrl: null,
  });
});

describe("services/reportes/reportes.service — obtenerNombreArchivoReporte", () => {
  it("resuelve la marca vía parametros.empresaId y arma el nombre con extensión pdf", async () => {
    const job = jobFixture({
      parametros: { rango: "30d", empresaId: "empresa-1" },
      finalizadoEn: new Date("2026-09-03T15:30:00.000Z"),
    });

    const nombre = await obtenerNombreArchivoReporte(job);

    expect(mocks.resolverMarcaReporte).toHaveBeenCalledWith("empresa-1");
    expect(nombre).toBe("ARCANO_CRM_03092026_1530.pdf");
  });

  it("sin empresaId en parametros (reporte holding-wide) resuelve la marca con null", async () => {
    const job = jobFixture({
      parametros: { rango: "30d" },
      finalizadoEn: new Date("2026-09-03T15:30:00.000Z"),
    });

    await obtenerNombreArchivoReporte(job);

    expect(mocks.resolverMarcaReporte).toHaveBeenCalledWith(null);
  });

  it("usa finalizadoEn cuando está seteado, no creadoEn", async () => {
    const job = jobFixture({
      creadoEn: new Date("2026-01-01T00:00:00.000Z"),
      finalizadoEn: new Date("2026-09-03T15:30:00.000Z"),
    });

    const nombre = await obtenerNombreArchivoReporte(job);

    expect(nombre).toContain("_03092026_1530.");
  });

  it("cae a creadoEn cuando finalizadoEn es null", async () => {
    const job = jobFixture({
      creadoEn: new Date("2026-05-10T08:15:00.000Z"),
      finalizadoEn: null,
    });

    const nombre = await obtenerNombreArchivoReporte(job);

    expect(nombre).toContain("_10052026_0815.");
  });

  it("tipo xlsx produce extensión .xlsx", async () => {
    const job = jobFixture({
      tipo: "xlsx",
      finalizadoEn: new Date("2026-09-03T15:30:00.000Z"),
    });

    const nombre = await obtenerNombreArchivoReporte(job);

    expect(nombre.endsWith(".xlsx")).toBe(true);
  });

  it("un valor de tipo inesperado (defensivo, tipo es String plano en el schema) cae a .pdf", async () => {
    const job = jobFixture({
      tipo: "algo-raro" as ReporteJob["tipo"],
      finalizadoEn: new Date("2026-09-03T15:30:00.000Z"),
    });

    const nombre = await obtenerNombreArchivoReporte(job);

    expect(nombre.endsWith(".pdf")).toBe(true);
  });
});
