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
const {
  fetchOportunidadDetalleApi,
  cambiarEtapaOportunidadApi,
  cerrarOportunidadApi,
  reasignarOportunidadApi,
} = await import("@/funcionalidades/oportunidades/detalle/oportunidadDetalle.api");

const getMock = vi.mocked(httpClient.get);
const postMock = vi.mocked(httpClient.post);
const patchMock = vi.mocked(httpClient.patch);

function oportunidadBackendFake(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "opp-1",
    leadId: "lead-1",
    empresaId: "emp-1",
    productoId: "prod-1",
    etapa: "CITA",
    semaforo: "VERDE",
    puntuacion: 80,
    asesorId: "asesor-1",
    vendedorId: null,
    montoVenta: "4500.00",
    observacionCierre: null,
    formaPago: null,
    slaInicioEn: "2026-08-01T12:00:00.000Z",
    cerradaEn: null,
    creadaEn: "2026-08-01T11:00:00.000Z",
    version: 1,
    lead: {
      id: "lead-1",
      etapa: "CITA",
      origen: "NUEVO",
      redSocial: null,
      cliente: {
        id: "cli-1",
        nombre: "Roberto Salazar",
        telefonoOriginal: "0991234567",
        telefonoNormalizado: "+593991234567",
        telefonoValido: true,
      },
    },
    producto: { id: "prod-1", empresaId: "emp-1", nombre: "Plan Premium", activo: true, creadoEn: "2026-08-01T10:00:00.000Z" },
    asesor: { id: "asesor-1", nombre: "Marta Herrera", rol: "ASESOR" },
    vendedor: null,
    ...overrides,
  };
}

beforeEach(() => {
  getMock.mockReset();
  postMock.mockReset();
  patchMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchOportunidadDetalleApi (GET /oportunidades/:id)", () => {
  it("desenvuelve `{ oportunidad }` y mapea a la forma enriquecida del frontend", async () => {
    getMock.mockResolvedValue({ oportunidad: oportunidadBackendFake() });

    const opp = await fetchOportunidadDetalleApi("opp-1");

    expect(getMock).toHaveBeenCalledWith("/oportunidades/opp-1");
    expect(opp.id).toBe("opp-1");
    expect(opp.montoVenta).toBe(4500);
    expect(opp.lead.cliente.nombre).toBe("Roberto Salazar");
    expect(opp.producto).toEqual({
      id: "prod-1",
      empresaId: "emp-1",
      nombre: "Plan Premium",
      activo: true,
      creadoEn: "2026-08-01T10:00:00.000Z",
    });
    expect(opp.asesor).toEqual({ id: "asesor-1", nombre: "Marta Herrera", rol: "ASESOR" });
    expect(opp.vendedor).toBeNull();
  });
});

describe("cambiarEtapaOportunidadApi (PATCH /oportunidades/:id/etapa)", () => {
  it("manda `{ etapa }` con el paso intermedio y no devuelve nada", async () => {
    patchMock.mockResolvedValue(undefined);

    const resultado = await cambiarEtapaOportunidadApi("opp-1", "CONTACTADO");

    expect(patchMock).toHaveBeenCalledWith("/oportunidades/opp-1/etapa", { etapa: "CONTACTADO" });
    expect(resultado).toBeUndefined();
  });
});

describe("cerrarOportunidadApi (POST /oportunidades/:id/cerrar)", () => {
  it("VENTA: manda `{ etapa, montoVenta, formaPago }` exactamente", async () => {
    postMock.mockResolvedValue(undefined);

    await cerrarOportunidadApi("opp-1", { etapa: "VENTA", montoVenta: 4500, formaPago: "CREDITO" });

    expect(postMock).toHaveBeenCalledWith("/oportunidades/opp-1/cerrar", {
      etapa: "VENTA",
      montoVenta: 4500,
      formaPago: "CREDITO",
    });
  });

  it("NO_VENTA: manda `{ etapa, observacionCierre }` exactamente", async () => {
    postMock.mockResolvedValue(undefined);

    await cerrarOportunidadApi("opp-1", {
      etapa: "NO_VENTA",
      observacionCierre: "El cliente ya contrató con la competencia el mes pasado.",
    });

    expect(postMock).toHaveBeenCalledWith("/oportunidades/opp-1/cerrar", {
      etapa: "NO_VENTA",
      observacionCierre: "El cliente ya contrató con la competencia el mes pasado.",
    });
  });
});

describe("reasignarOportunidadApi (POST /oportunidades/:id/reasignar)", () => {
  it("manda `{ asesorId }`", async () => {
    postMock.mockResolvedValue(undefined);

    await reasignarOportunidadApi("opp-1", "asesor-2");

    expect(postMock).toHaveBeenCalledWith("/oportunidades/opp-1/reasignar", { asesorId: "asesor-2" });
  });
});
