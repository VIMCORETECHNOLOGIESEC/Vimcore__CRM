import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * jobs/reportes/reporte-marca.ts (pdfmake-migracion): resolución de branding
 * aislada de la generación del PDF -- mockea `empresa.repository.ts` y
 * `configuracion-empresa.service.ts`, nunca toca Prisma real. Jerarquía de
 * colores COMO PAR (replica `frontend/src/lib/color-marca.ts::resolveEstilosMarca`):
 * si la empresa tiene AMBOS colores propios, se usan los dos; si falta
 * cualquiera, se usan los DOS del holding -- nunca se mezcla un primario de
 * uno con el secundario del otro.
 */
const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  getConfiguracion: vi.fn(),
}));

vi.mock("../src/repositories/empresa.repository.js", () => ({
  findById: mocks.findById,
}));

vi.mock("../src/services/configuracion-empresa.service.js", () => ({
  getConfiguracion: mocks.getConfiguracion,
}));

import { resolverMarcaReporte } from "../src/jobs/reportes/reporte-marca.js";

const HOLDING = { nombre: "Holding Demo", colorPrimario: "#111111", colorSecundario: "#222222", logoUrl: "https://holding/logo.png" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getConfiguracion.mockResolvedValue(HOLDING);
});

describe("jobs/reportes/reporte-marca — resolverMarcaReporte", () => {
  it("empresaId null (holding-wide) devuelve la vista del holding tal cual, sin consultar empresaRepository", async () => {
    const resultado = await resolverMarcaReporte(null);

    expect(resultado).toEqual(HOLDING);
    expect(mocks.findById).not.toHaveBeenCalled();
  });

  it("empresa con AMBOS colores propios usa nombre/colores/logo de la empresa", async () => {
    mocks.findById.mockResolvedValue({
      id: "empresa-1",
      nombre: "Empresa Uno",
      colorPrimario: "#7c2d12",
      colorSecundario: "#f97316",
      logoUrl: "https://empresa-1/logo.png",
    });

    const resultado = await resolverMarcaReporte("empresa-1");

    expect(resultado).toEqual({
      nombre: "Empresa Uno",
      colorPrimario: "#7c2d12",
      colorSecundario: "#f97316",
      logoUrl: "https://empresa-1/logo.png",
    });
  });

  it("empresa con un solo color seteado cae a AMBOS colores del holding (par, no campo por campo); nombre/logo siguen siendo de la empresa", async () => {
    mocks.findById.mockResolvedValue({
      id: "empresa-1",
      nombre: "Empresa Uno",
      colorPrimario: "#7c2d12",
      colorSecundario: null,
      logoUrl: "https://empresa-1/logo.png",
    });

    const resultado = await resolverMarcaReporte("empresa-1");

    expect(resultado).toEqual({
      nombre: "Empresa Uno",
      colorPrimario: HOLDING.colorPrimario,
      colorSecundario: HOLDING.colorSecundario,
      logoUrl: "https://empresa-1/logo.png",
    });
  });

  it("empresa sin ningún color propio cae a AMBOS del holding; logoUrl null cae al logo del holding", async () => {
    mocks.findById.mockResolvedValue({
      id: "empresa-1",
      nombre: "Empresa Uno",
      colorPrimario: null,
      colorSecundario: null,
      logoUrl: null,
    });

    const resultado = await resolverMarcaReporte("empresa-1");

    expect(resultado).toEqual({
      nombre: "Empresa Uno",
      colorPrimario: HOLDING.colorPrimario,
      colorSecundario: HOLDING.colorSecundario,
      logoUrl: HOLDING.logoUrl,
    });
  });

  it("empresa no encontrada (findById null, caso defensivo) cae a la vista completa del holding", async () => {
    mocks.findById.mockResolvedValue(null);

    const resultado = await resolverMarcaReporte("empresa-borrada");

    expect(resultado).toEqual(HOLDING);
  });
});
