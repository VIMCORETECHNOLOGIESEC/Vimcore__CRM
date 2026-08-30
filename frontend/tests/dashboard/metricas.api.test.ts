import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MetricasFiltros } from "@/tipos/metricas";

/**
 * `metricas.api.ts` -- backend real (integración F5/M9). Mismo patrón que
 * `bridges/bridges.api.test.ts`/`leads/leads.api.test.ts`: `httpClient`
 * mockeado, se verifica la ruta/query params exactos que manda cada función
 * y cómo desenvuelve la respuesta -- nunca contra un fixture en memoria (esa
 * capa, `metricas.utils.ts`, se eliminó con esta integración).
 */
vi.mock("@/api/httpClient", () => ({
  httpClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    code: string;
    status: number;
    constructor(code: string, status: number, message: string) {
      super(message);
      this.name = "ApiError";
      this.code = code;
      this.status = status;
    }
  },
}));

const { httpClient, ApiError } = await import("@/api/httpClient");
const {
  fetchMetricasCascadaLeadOportunidadApi,
  fetchMetricasEmbudoApi,
  fetchMetricasEmbudoOportunidadApi,
  fetchMetricasPorAsesorApi,
  fetchMetricasPorCampaniaApi,
  fetchMetricasPorEtapaApi,
  fetchMetricasPorProductoApi,
  fetchMetricasPorRedSocialApi,
  fetchMetricasRankingProductosPorEmpresaApi,
  fetchRedSocialPorSemaforoApi,
  fetchResumenMetricasApi,
} = await import("@/funcionalidades/dashboard/metricas.api");

const getMock = vi.mocked(httpClient.get);

const FILTROS_30D: MetricasFiltros = { rango: "30d" };
const FILTROS_PERSONALIZADO: MetricasFiltros = {
  rango: "personalizado",
  desde: "2026-08-01",
  hasta: "2026-08-14",
};

beforeEach(() => {
  getMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchResumenMetricasApi — GET /metricas/resumen", () => {
  it("manda rango/desde/hasta/redSocial/campania/responsableId como query params y devuelve el objeto tal cual", async () => {
    const resumen = {
      rango: { desde: "2026-08-01", hasta: "2026-08-14" },
      totalIngresados: { actual: 10, anterior: 8, variacionPorcentual: 25 },
      enGestion: { actual: 4, anterior: 3, variacionPorcentual: null },
      cerrados: {
        total: { actual: 6, anterior: 5, variacionPorcentual: null },
        venta: { actual: 4, anterior: 3, variacionPorcentual: null },
        noVenta: { actual: 2, anterior: 2, variacionPorcentual: null },
      },
      tasaConversion: {
        actual: { porcentaje: 66.67, venta: 4, total: 6 },
        anterior: { porcentaje: 60, venta: 3, total: 5 },
        variacionPorcentual: null,
      },
      tiempoPrimeraRespuesta: {
        horasPromedio: 2.5,
        sinPrimeraRespuesta: 1,
        anteriorHorasPromedio: 3,
        variacionPorcentual: null,
      },
      tiempoPromedioCierre: { diasPromedio: 4, anteriorDiasPromedio: 5, variacionPorcentual: null },
      cumplimientoSla: { porcentaje: 80, anteriorPorcentaje: 75, variacionPorcentual: null },
      distribucionSemaforo: { rojo: 1, amarillo: 1, verde: 2, sinCalificar: 0 },
    };
    getMock.mockResolvedValue(resumen);

    const resultado = await fetchResumenMetricasApi({
      rango: "30d",
      redSocial: "INSTAGRAM",
      campania: "Verano 2026",
      responsableId: "asesor-1",
    });

    expect(getMock).toHaveBeenCalledWith("/metricas/resumen", {
      params: {
        rango: "30d",
        desde: undefined,
        hasta: undefined,
        redSocial: "INSTAGRAM",
        campania: "Verano 2026",
        responsableId: "asesor-1",
      },
    });
    expect(resultado).toEqual(resumen);
  });

  it("con rango personalizado, manda desde/hasta", async () => {
    getMock.mockResolvedValue({});

    await fetchResumenMetricasApi(FILTROS_PERSONALIZADO);

    expect(getMock).toHaveBeenCalledWith("/metricas/resumen", {
      params: {
        rango: "personalizado",
        desde: "2026-08-01",
        hasta: "2026-08-14",
        redSocial: undefined,
        campania: undefined,
        responsableId: undefined,
      },
    });
  });
});

describe("fetchMetricasPorRedSocialApi — GET /metricas/por-red-social", () => {
  it("desenvuelve `{ items }`", async () => {
    const items = [{ redSocial: "INSTAGRAM", total: 5, ventas: 2, noVentas: 1, tasaConversionPct: 66.67 }];
    getMock.mockResolvedValue({ items });

    const resultado = await fetchMetricasPorRedSocialApi(FILTROS_30D);

    expect(getMock).toHaveBeenCalledWith("/metricas/por-red-social", { params: expect.objectContaining({ rango: "30d" }) });
    expect(resultado).toEqual(items);
  });
});

describe("fetchMetricasPorAsesorApi — GET /metricas/por-asesor", () => {
  it("desenvuelve `{ items }`", async () => {
    const items = [
      { responsableId: "asesor-1", nombre: "Marta Herrera", total: 3, ventas: 1, noVentas: 0, tasaConversionPct: 100, cumplimientoSlaPct: 80 },
    ];
    getMock.mockResolvedValue({ items });

    const resultado = await fetchMetricasPorAsesorApi(FILTROS_30D);

    expect(resultado).toEqual(items);
  });

  it("propaga el 403 del backend tal cual (asesor/vendedor pidiendo la gráfica) -- no lo intercepta ni lo reinterpreta", async () => {
    getMock.mockRejectedValue(
      new ApiError("permiso_denegado", 403, "Solo administrador o supervisor pueden consultar esta gráfica"),
    );

    await expect(fetchMetricasPorAsesorApi(FILTROS_30D)).rejects.toMatchObject({
      code: "permiso_denegado",
      status: 403,
    });
  });
});

describe("fetchMetricasPorEtapaApi — GET /metricas/por-etapa (conteo plano, distinto de /embudo)", () => {
  it("desenvuelve `{ items }` con las 5 etapas, incluyendo NO_VENTA", async () => {
    const items = [
      { etapa: "NUEVO", total: 3 },
      { etapa: "CONTACTADO", total: 2 },
      { etapa: "CITA", total: 1 },
      { etapa: "VENTA", total: 1 },
      { etapa: "NO_VENTA", total: 1 },
    ];
    getMock.mockResolvedValue({ items });

    const resultado = await fetchMetricasPorEtapaApi(FILTROS_30D);

    expect(getMock).toHaveBeenCalledWith("/metricas/por-etapa", { params: expect.objectContaining({ rango: "30d" }) });
    expect(resultado.map((r) => r.etapa)).toContain("NO_VENTA");
  });
});

describe("fetchMetricasEmbudoApi — GET /metricas/embudo (endpoint distinto de /por-etapa)", () => {
  it("devuelve el objeto de embudo tal cual, sin envolver, con 4 pasos y NO_VENTA aparte", async () => {
    const embudo = {
      pasos: [
        { etapa: "NUEVO", total: 5, caidaPct: null },
        { etapa: "CONTACTADO", total: 3, caidaPct: 40 },
        { etapa: "CITA", total: 2, caidaPct: 33.33 },
        { etapa: "VENTA", total: 1, caidaPct: 50 },
      ],
      noVenta: 1,
    };
    getMock.mockResolvedValue(embudo);

    const resultado = await fetchMetricasEmbudoApi(FILTROS_30D);

    expect(getMock).toHaveBeenCalledWith("/metricas/embudo", { params: expect.objectContaining({ rango: "30d" }) });
    expect(resultado).toEqual(embudo);
    expect(resultado.pasos.every((p) => p.etapa !== "NO_VENTA")).toBe(true);
  });
});

describe("fetchMetricasPorCampaniaApi — GET /metricas/por-campania", () => {
  it("desenvuelve `{ items }`, top 10 ya resuelto por el backend", async () => {
    const items = [{ nombreCampania: "Verano 2026", redSocial: "INSTAGRAM", total: 5 }];
    getMock.mockResolvedValue({ items });

    const resultado = await fetchMetricasPorCampaniaApi(FILTROS_30D);

    expect(resultado).toEqual(items);
  });
});

describe("fetchRedSocialPorSemaforoApi — GET /metricas/red-social-x-semaforo", () => {
  it("desenvuelve `{ items }`, con sinCalificar incluido", async () => {
    const items = [
      { redSocial: "INSTAGRAM", total: 5, rojo: 1, amarillo: 1, verde: 2, sinCalificar: 1, pctVerde: 40 },
    ];
    getMock.mockResolvedValue({ items });

    const resultado = await fetchRedSocialPorSemaforoApi(FILTROS_30D);

    expect(resultado.every((r) => r.rojo + r.amarillo + r.verde + r.sinCalificar === r.total)).toBe(true);
  });
});

describe("fetchMetricasEmbudoOportunidadApi — GET /metricas/embudo-oportunidad (docs/23 item 13)", () => {
  it("devuelve el objeto de embudo tal cual, sin envolver, estructuralmente idéntico a /embudo", async () => {
    const embudoOportunidad = {
      pasos: [
        { etapa: "NUEVO", total: 4, caidaPct: null },
        { etapa: "CONTACTADO", total: 3, caidaPct: 25 },
        { etapa: "CITA", total: 2, caidaPct: 33.33 },
        { etapa: "VENTA", total: 1, caidaPct: 50 },
      ],
      noVenta: 1,
    };
    getMock.mockResolvedValue(embudoOportunidad);

    const resultado = await fetchMetricasEmbudoOportunidadApi(FILTROS_30D);

    expect(getMock).toHaveBeenCalledWith("/metricas/embudo-oportunidad", {
      params: expect.objectContaining({ rango: "30d" }),
    });
    expect(resultado).toEqual(embudoOportunidad);
  });
});

describe("fetchMetricasPorProductoApi — GET /metricas/por-producto (docs/23 item 13)", () => {
  it("desenvuelve `{ items }`, ranking global plano sin empresaId/nombreEmpresa", async () => {
    const items = [
      { productoId: "prod-1", nombreProducto: "Seguro Auto", total: 8, ventas: 5, noVentas: 2, tasaConversionPct: 71.43 },
    ];
    getMock.mockResolvedValue({ items });

    const resultado = await fetchMetricasPorProductoApi(FILTROS_30D);

    expect(getMock).toHaveBeenCalledWith("/metricas/por-producto", {
      params: expect.objectContaining({ rango: "30d" }),
    });
    expect(resultado).toEqual(items);
    expect(resultado[0]).not.toHaveProperty("empresaId");
  });
});

describe("fetchMetricasCascadaLeadOportunidadApi — GET /metricas/cascada-lead-oportunidad (docs/23 item 13)", () => {
  it("devuelve el objeto crudo de cohorte tal cual, sin envolver (NO es una lista)", async () => {
    const cascada = {
      leads: 20,
      conOportunidad: 8,
      ventaOportunidad: 3,
      tasaAperturaPct: 40,
      tasaCierrePct: 37.5,
    };
    getMock.mockResolvedValue(cascada);

    const resultado = await fetchMetricasCascadaLeadOportunidadApi(FILTROS_30D);

    expect(getMock).toHaveBeenCalledWith("/metricas/cascada-lead-oportunidad", {
      params: expect.objectContaining({ rango: "30d" }),
    });
    expect(resultado).toEqual(cascada);
  });

  it("con leads=0, tasaAperturaPct/tasaCierrePct llegan null tal cual (no se recalculan en cliente)", async () => {
    const cascada = { leads: 0, conOportunidad: 0, ventaOportunidad: 0, tasaAperturaPct: null, tasaCierrePct: null };
    getMock.mockResolvedValue(cascada);

    const resultado = await fetchMetricasCascadaLeadOportunidadApi(FILTROS_30D);

    expect(resultado.tasaAperturaPct).toBeNull();
    expect(resultado.tasaCierrePct).toBeNull();
  });
});

describe("fetchMetricasRankingProductosPorEmpresaApi — GET /metricas/ranking-productos-por-empresa (docs/23 item 13)", () => {
  it("desenvuelve `{ items }`, una fila por par (empresa, producto)", async () => {
    const items = [
      {
        empresaId: "empresa-1",
        nombreEmpresa: "Empresa A",
        productoId: "prod-1",
        nombreProducto: "Seguro Auto",
        total: 5,
        ventas: 3,
        noVentas: 1,
        tasaConversionPct: 75,
      },
      {
        empresaId: "empresa-2",
        nombreEmpresa: "Empresa B",
        productoId: "prod-1",
        nombreProducto: "Seguro Auto",
        total: 2,
        ventas: 0,
        noVentas: 0,
        tasaConversionPct: null,
      },
    ];
    getMock.mockResolvedValue({ items });

    const resultado = await fetchMetricasRankingProductosPorEmpresaApi(FILTROS_30D);

    expect(getMock).toHaveBeenCalledWith("/metricas/ranking-productos-por-empresa", {
      params: expect.objectContaining({ rango: "30d" }),
    });
    expect(resultado).toEqual(items);
    expect(resultado.map((r) => r.empresaId)).toEqual(["empresa-1", "empresa-2"]);
  });
});
