import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/httpClient", () => ({
  httpClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const { httpClient } = await import("@/api/httpClient");
const { fetchProductosApi, crearProductoApi, fetchOportunidadesApi, crearOportunidadApi } = await import(
  "@/funcionalidades/oportunidades/oportunidades.api"
);

const getMock = vi.mocked(httpClient.get);
const postMock = vi.mocked(httpClient.post);

function productoBackendFake(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "prod-1",
    empresaId: "emp-1",
    nombre: "Plan Premium",
    activo: true,
    creadoEn: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

function oportunidadBackendFake(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "opp-1",
    leadId: "lead-1",
    empresaId: "emp-1",
    productoId: "prod-1",
    etapa: "CONTACTADO",
    semaforo: "AMARILLO",
    puntuacion: 55,
    asesorId: "asesor-1",
    vendedorId: null,
    montoVenta: null,
    observacionCierre: null,
    formaPago: null,
    slaInicioEn: "2026-08-01T12:00:00.000Z",
    cerradaEn: null,
    creadaEn: "2026-08-01T11:00:00.000Z",
    version: 0,
    lead: {
      id: "lead-1",
      etapa: "CONTACTADO",
      origen: "NUEVO",
      redSocial: "INSTAGRAM",
      cliente: {
        id: "cli-1",
        nombre: "Roberto Salazar",
        telefonoOriginal: "0991234567",
        telefonoNormalizado: "+593991234567",
        telefonoValido: true,
      },
    },
    producto: productoBackendFake(),
    asesor: { id: "asesor-1", nombre: "Marta Herrera", rol: "ASESOR" },
    vendedor: null,
    ...overrides,
  };
}

beforeEach(() => {
  getMock.mockReset();
  postMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchProductosApi (GET /productos, catálogo D14)", () => {
  it("desenvuelve `{ productos }` y mapea cada fila a ProductoOportunidad", async () => {
    getMock.mockResolvedValue({ productos: [productoBackendFake()] });

    const productos = await fetchProductosApi({});

    expect(getMock).toHaveBeenCalledWith("/productos", { params: { empresaId: undefined, activo: undefined } });
    expect(productos).toEqual([
      { id: "prod-1", empresaId: "emp-1", nombre: "Plan Premium", activo: true, creadoEn: "2026-08-01T10:00:00.000Z" },
    ]);
  });

  it("serializa `activo` como \"true\"/\"false\" y reenvía `empresaId`", async () => {
    getMock.mockResolvedValue({ productos: [] });

    await fetchProductosApi({ empresaId: "emp-9", activo: true });
    expect(getMock).toHaveBeenLastCalledWith("/productos", { params: { empresaId: "emp-9", activo: "true" } });

    await fetchProductosApi({ empresaId: "emp-9", activo: false });
    expect(getMock).toHaveBeenLastCalledWith("/productos", { params: { empresaId: "emp-9", activo: "false" } });
  });

  it("omite `activo` (undefined) cuando no se pasa el filtro", async () => {
    getMock.mockResolvedValue({ productos: [] });

    await fetchProductosApi({ empresaId: "emp-9" });

    const params = getMock.mock.calls[0]?.[1]?.params as Record<string, unknown>;
    expect(params.activo).toBeUndefined();
    expect(params.empresaId).toBe("emp-9");
  });
});

describe("crearProductoApi (POST /productos, ADMIN)", () => {
  it("manda `{ nombre, empresaId }` y devuelve el producto mapeado desde `{ producto }`", async () => {
    postMock.mockResolvedValue({ producto: productoBackendFake({ id: "prod-2", nombre: "Plan Básico" }) });

    const producto = await crearProductoApi({ nombre: "Plan Básico", empresaId: "emp-1" });

    expect(postMock).toHaveBeenCalledWith("/productos", { nombre: "Plan Básico", empresaId: "emp-1" });
    expect(producto).toEqual({
      id: "prod-2",
      empresaId: "emp-1",
      nombre: "Plan Básico",
      activo: true,
      creadoEn: "2026-08-01T10:00:00.000Z",
    });
  });

  it("acepta `empresaId` ausente (sesión company-scoped, el server lo resuelve)", async () => {
    postMock.mockResolvedValue({ producto: productoBackendFake() });

    await crearProductoApi({ nombre: "Plan Premium" });

    expect(postMock).toHaveBeenCalledWith("/productos", { nombre: "Plan Premium", empresaId: undefined });
  });
});

describe("fetchOportunidadesApi (GET /oportunidades)", () => {
  it("reenvía los params tal cual y adapta `{ oportunidades, total, pagina, limite }`", async () => {
    getMock.mockResolvedValue({
      oportunidades: [oportunidadBackendFake()],
      total: 1,
      pagina: 2,
      limite: 25,
    });

    const respuesta = await fetchOportunidadesApi({
      leadId: "lead-1",
      etapa: "CONTACTADO",
      asesorId: "asesor-1",
      empresaId: "emp-1",
      pagina: 2,
      limite: 25,
    });

    expect(getMock).toHaveBeenCalledWith("/oportunidades", {
      params: {
        leadId: "lead-1",
        empresaId: "emp-1",
        asesorId: "asesor-1",
        etapa: "CONTACTADO",
        pagina: 2,
        limite: 25,
      },
    });
    expect(respuesta.total).toBe(1);
    expect(respuesta.pagina).toBe(2);
    expect(respuesta.limite).toBe(25);
    expect(respuesta.oportunidades).toHaveLength(1);
  });

  it("mapea la fila enriquecida (cliente anidado, monto Decimal-string → number, relaciones nulas)", async () => {
    getMock.mockResolvedValue({
      oportunidades: [
        oportunidadBackendFake({
          montoVenta: "4500.00",
          etapa: "VENTA",
          formaPago: "CREDITO",
          cerradaEn: "2026-08-02T09:00:00.000Z",
          producto: null,
          asesor: null,
          vendedor: { id: "vend-1", nombre: "Sofía", rol: "VENDEDOR" },
        }),
      ],
      total: 1,
      pagina: 1,
      limite: 25,
    });

    const { oportunidades } = await fetchOportunidadesApi({ pagina: 1, limite: 25 });
    const [opp] = oportunidades;

    expect(opp.montoVenta).toBe(4500);
    expect(opp.formaPago).toBe("CREDITO");
    expect(opp.lead.cliente.nombre).toBe("Roberto Salazar");
    expect(opp.lead.cliente.telefonoNormalizado).toBe("+593991234567");
    expect(opp.producto).toBeNull();
    expect(opp.asesor).toBeNull();
    expect(opp.vendedor).toEqual({ id: "vend-1", nombre: "Sofía", rol: "VENDEDOR" });
  });

  it("`montoVenta` null se preserva como null", async () => {
    getMock.mockResolvedValue({
      oportunidades: [oportunidadBackendFake({ montoVenta: null })],
      total: 1,
      pagina: 1,
      limite: 25,
    });

    const { oportunidades } = await fetchOportunidadesApi({ pagina: 1, limite: 25 });
    expect(oportunidades[0].montoVenta).toBeNull();
  });
});

describe("crearOportunidadApi (POST /oportunidades, respuesta PLANA sin relaciones)", () => {
  it("manda `{ leadId, productoId }` y mapea el subconjunto plano de la respuesta", async () => {
    postMock.mockResolvedValue({
      oportunidad: {
        id: "opp-9",
        leadId: "lead-1",
        empresaId: "emp-1",
        productoId: "prod-1",
        etapa: "NUEVO",
        semaforo: null,
        puntuacion: null,
        asesorId: null,
        vendedorId: null,
        montoVenta: null,
        observacionCierre: null,
        formaPago: null,
        slaInicioEn: null,
        cerradaEn: null,
        creadaEn: "2026-08-03T08:00:00.000Z",
        version: 0,
      },
    });

    const opp = await crearOportunidadApi({ leadId: "lead-1", productoId: "prod-1" });

    expect(postMock).toHaveBeenCalledWith("/oportunidades", { leadId: "lead-1", productoId: "prod-1" });
    expect(opp.id).toBe("opp-9");
    expect(opp.etapa).toBe("NUEVO");
    expect(opp.asesorId).toBeNull();
    expect(opp.montoVenta).toBeNull();
  });

  it("acepta `productoId` ausente", async () => {
    postMock.mockResolvedValue({
      oportunidad: {
        id: "opp-10",
        leadId: "lead-2",
        empresaId: "emp-1",
        productoId: null,
        etapa: "NUEVO",
        semaforo: null,
        puntuacion: null,
        asesorId: null,
        vendedorId: null,
        montoVenta: null,
        observacionCierre: null,
        formaPago: null,
        slaInicioEn: null,
        cerradaEn: null,
        creadaEn: "2026-08-03T08:00:00.000Z",
        version: 0,
      },
    });

    await crearOportunidadApi({ leadId: "lead-2" });

    expect(postMock).toHaveBeenCalledWith("/oportunidades", { leadId: "lead-2", productoId: undefined });
  });
});
