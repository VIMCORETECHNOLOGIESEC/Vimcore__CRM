import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generarPdfReporte } from "../src/jobs/reportes/pdf-reporte.js";
import type { DatosReporte } from "../src/jobs/reportes/tipos.js";

/**
 * jobs/reportes/pdf-reporte.ts (pdfmake-migracion): `pdf-reporte.ts` hoy
 * tiene cero cobertura -- este archivo cubre el renderer puro (fixtures
 * simples, sin mockear repositorios, ver `reporte-marca.test.ts` para la
 * resolución de marca) y la degradación del logo (`resolverLogoDataUrl`,
 * nunca debe lanzar). Mismo estilo de mocks de `global.fetch` que
 * `azure-blob-storage.test.ts`.
 */
function datosBase(overrides: Partial<DatosReporte> = {}): DatosReporte {
  return {
    empresaId: null,
    resumen: {
      rango: { desde: new Date("2026-01-01"), hasta: new Date("2026-01-31") },
      totalIngresados: { actual: 100, anterior: 80, variacionPorcentual: 25 },
      enGestion: { actual: 40, anterior: 30, variacionPorcentual: 33.33 },
      cerrados: {
        total: { actual: 60, anterior: 50, variacionPorcentual: 20 },
        venta: { actual: 25, anterior: 20, variacionPorcentual: 25 },
        noVenta: { actual: 35, anterior: 30, variacionPorcentual: 16.67 },
      },
      tasaConversion: {
        actual: { porcentaje: 41.67, venta: 25, total: 60 },
        anterior: { porcentaje: 40, venta: 20, total: 50 },
        variacionPorcentual: 4.18,
      },
      tiempoPrimeraRespuesta: { horasPromedio: 2.5, sinPrimeraRespuesta: 3, anteriorHorasPromedio: 3, variacionPorcentual: -16.67 },
      tiempoPromedioCierre: { diasPromedio: 5.2, anteriorDiasPromedio: 6, variacionPorcentual: -13.33 },
      cumplimientoSla: { porcentaje: 88, anteriorPorcentaje: 85, variacionPorcentual: 3.53 },
      distribucionSemaforo: { rojo: 5, amarillo: 10, verde: 20, sinCalificar: 5 },
    },
    embudo: {
      pasos: [
        { etapa: "NUEVO", total: 100, caidaPct: null },
        { etapa: "CONTACTADO", total: 80, caidaPct: 20 },
      ],
      noVenta: 35,
    },
    porCampania: [],
    rendimientoCampanias: [
      {
        campaniaId: "camp-1",
        idExterno: "ext-1",
        nombreCampania: "Campaña Verano",
        redSocial: "META",
        moneda: "USD",
        gasto: 150.5,
        impresiones: 10000,
        clics: 200,
        alcance: 8000,
        leads: 40,
        ventas: 10,
        cpc: 0.75,
        cpl: 3.76,
        cac: 15.05,
      },
    ],
    porAsesor: [
      { responsableId: "u-1", nombre: "Ana Vendedora", total: 20, ventas: 8, noVentas: 12, tasaConversionPct: 40, cumplimientoSlaPct: 90 },
    ],
    marca: { nombre: "Holding Demo", colorPrimario: "#7c2d12", colorSecundario: "#f97316", logoUrl: null },
    ...overrides,
  };
}

/**
 * pdfkit (motor interno de pdfmake) DECODIFICA el PNG de verdad al medirlo
 * para el layout (no solo lo trata como bytes opacos) -- un buffer corto
 * arbitrario revienta con "Incomplete or corrupt PNG file". Este es un PNG
 * mínimo real: 1x1 px, RGBA, transparente.
 */
const PNG_1X1_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function pngResponse(): Response {
  return new Response(Uint8Array.from(Buffer.from(PNG_1X1_BASE64, "base64")), {
    status: 200,
    headers: { "content-type": "image/png" },
  });
}

describe("jobs/reportes/pdf-reporte — generarPdfReporte", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("genera un PDF válido para un reporte holding-wide sin logo", async () => {
    const buffer = await generarPdfReporte(datosBase());

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("genera un PDF válido para un reporte de empresa con logo embebible", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(pngResponse());

    const datos = datosBase({
      empresaId: "empresa-1",
      marca: { nombre: "Empresa Uno", colorPrimario: "#123456", colorSecundario: "#abcdef", logoUrl: "https://storage.local/logo.png" },
    });

    const buffer = await generarPdfReporte(datos);

    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(fetch).toHaveBeenCalledWith("https://storage.local/logo.png", expect.anything());
  });

  it("porAsesor null (D6, rol sin acceso) igual produce un PDF válido", async () => {
    const buffer = await generarPdfReporte(datosBase({ porAsesor: null }));

    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("fetch de logo rechazado degrada a PDF sin logo, sin lanzar", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("network down"));

    const datos = datosBase({
      empresaId: "empresa-1",
      marca: { nombre: "Empresa Uno", colorPrimario: "#123456", colorSecundario: "#abcdef", logoUrl: "https://storage.local/logo.png" },
    });

    const buffer = await generarPdfReporte(datos);

    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("fetch de logo con status no-2xx degrada a PDF sin logo, sin lanzar", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 404 }));

    const datos = datosBase({
      empresaId: "empresa-1",
      marca: { nombre: "Empresa Uno", colorPrimario: "#123456", colorSecundario: "#abcdef", logoUrl: "https://storage.local/logo.png" },
    });

    const buffer = await generarPdfReporte(datos);

    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("fetch de logo con content-type no soportado (webp) degrada a PDF sin logo, sin lanzar", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "image/webp" } }),
    );

    const datos = datosBase({
      empresaId: "empresa-1",
      marca: { nombre: "Empresa Uno", colorPrimario: "#123456", colorSecundario: "#abcdef", logoUrl: "https://storage.local/logo.png" },
    });

    const buffer = await generarPdfReporte(datos);

    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});
