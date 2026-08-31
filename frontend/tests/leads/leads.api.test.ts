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
const { fetchLeadsApi, assignLeadsMasivoApi, getCatalogoResponsables, getCatalogoResponsablesConRol } =
  await import("@/funcionalidades/leads/leads.api");

const getMock = vi.mocked(httpClient.get);
const postMock = vi.mocked(httpClient.post);

function leadBackendFake(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "lead-01",
    clienteId: "cliente-01",
    cliente: {
      id: "cliente-01",
      nombre: "Roberto Salazar",
      telefonoOriginal: "0991234567",
      telefonoNormalizado: "+593991234567",
      telefonoValido: true,
    },
    origen: "REINGRESO",
    redSocial: "INSTAGRAM",
    etapa: "CONTACTADO",
    semaforo: "ROJO",
    puntuacion: 32,
    asesorId: "asesor-1",
    asesor: { id: "asesor-1", nombre: "Marta Herrera", rol: "ASESOR" },
    vendedorId: null,
    vendedor: null,
    slaInicioEn: new Date().toISOString(),
    ingresadoEn: new Date().toISOString(),
    cerradoEn: null,
    montoVenta: null,
    productoServicio: null,
    formaPago: null,
    observacionCierre: null,
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

describe("fetchLeadsApi — contrato de respuesta (GET /leads real, D-A1)", () => {
  it("manda pagina/limite/etc. y adapta `leads`→`datos`, `limite`→`porPagina`", async () => {
    getMock.mockResolvedValue({
      leads: [leadBackendFake()],
      total: 1,
      pagina: 1,
      limite: 50,
    });

    const respuesta = await fetchLeadsApi({ pagina: 1, porPagina: 50 });

    expect(getMock).toHaveBeenCalledWith(
      "/leads",
      expect.objectContaining({ params: expect.objectContaining({ pagina: 1, limite: 50 }) }),
    );
    expect(respuesta.datos).toHaveLength(1);
    expect(respuesta.total).toBe(1);
    expect(respuesta.pagina).toBe(1);
    expect(respuesta.porPagina).toBe(50);
  });

  it("mapea cliente/asesor/vendedor anidados al `Lead` del frontend", async () => {
    getMock.mockResolvedValue({
      leads: [leadBackendFake({ vendedorId: "vendedor-1", vendedor: { id: "vendedor-1", nombre: "Sofía", rol: "VENDEDOR" } })],
      total: 1,
      pagina: 1,
      limite: 10,
    });

    const respuesta = await fetchLeadsApi({ pagina: 1, porPagina: 10 });
    const [lead] = respuesta.datos;

    expect(lead.cliente.nombre).toBe("Roberto Salazar");
    expect(lead.asesor).toEqual({ id: "asesor-1", nombre: "Marta Herrera", rol: "ASESOR" });
    expect(lead.vendedor).toEqual({ id: "vendedor-1", nombre: "Sofía", rol: "VENDEDOR" });
    // Campaña/cuenta publicitaria: sin entidad real con id en el backend (gap documentado).
    expect(lead.campania).toBeNull();
  });

  it("un lead NUEVO sin calificar (semaforo/puntuacion null en el backend, D14) se mapea sin forzar un valor falso", async () => {
    getMock.mockResolvedValue({
      leads: [leadBackendFake({ etapa: "NUEVO", semaforo: null, puntuacion: null })],
      total: 1,
      pagina: 1,
      limite: 10,
    });

    const respuesta = await fetchLeadsApi({ pagina: 1, porPagina: 10 });
    const [lead] = respuesta.datos;

    expect(lead.semaforo).toBeNull();
    expect(lead.puntuacion).toBeNull();
    expect(lead.cuentaPublicitaria).toBeNull();
  });

  it("manda busqueda/etapa/semaforo/redSocial/responsableId/desde/hasta tal cual", async () => {
    getMock.mockResolvedValue({ leads: [], total: 0, pagina: 2, limite: 10 });

    await fetchLeadsApi({
      pagina: 2,
      porPagina: 10,
      busqueda: "roberto",
      etapa: "CONTACTADO",
      semaforo: "ROJO",
      redSocial: "INSTAGRAM",
      responsableId: "asesor-1",
      fechaDesde: "2026-01-01",
      fechaHasta: "2026-01-31",
    });

    expect(getMock).toHaveBeenCalledWith("/leads", {
      params: {
        pagina: 2,
        limite: 10,
        busqueda: "roberto",
        etapa: "CONTACTADO",
        semaforo: "ROJO",
        redSocial: "INSTAGRAM",
        responsableId: "asesor-1",
        desde: "2026-01-01",
        hasta: "2026-01-31",
        estadoSla: undefined,
        empresaId: undefined,
      },
    });
  });

  it("manda empresaId tal cual cuando viene (drill-down de un holding-wide vía useVistaEmpresa)", async () => {
    getMock.mockResolvedValue({ leads: [], total: 0, pagina: 1, limite: 10 });

    await fetchLeadsApi({ pagina: 1, porPagina: 10, empresaId: "emp-9" });

    expect(getMock).toHaveBeenCalledWith(
      "/leads",
      expect.objectContaining({ params: expect.objectContaining({ empresaId: "emp-9" }) }),
    );
  });

  it("estadoSla CERRADO no tiene equivalente en el backend real -- se omite en vez de mandar un valor inventado", async () => {
    getMock.mockResolvedValue({ leads: [], total: 0, pagina: 1, limite: 10 });

    await fetchLeadsApi({ pagina: 1, porPagina: 10, estadoSla: "CERRADO" });

    const params = getMock.mock.calls[0]?.[1]?.params as Record<string, unknown>;
    expect(params.estadoSla).toBeUndefined();
  });

  it("estadoSla A_TIEMPO/EN_RIESGO/ATRASADO se mapean a minúsculas (contrato real del backend)", async () => {
    getMock.mockResolvedValue({ leads: [], total: 0, pagina: 1, limite: 10 });

    await fetchLeadsApi({ pagina: 1, porPagina: 10, estadoSla: "ATRASADO" });

    const params = getMock.mock.calls[0]?.[1]?.params as Record<string, unknown>;
    expect(params.estadoSla).toBe("atrasado");
  });
});

describe("assignLeadsMasivoApi (D-A1: POST /leads/asignar-lote, reporte por lead)", () => {
  it("manda leadIds + asesorId y devuelve el reporte completo (exitosos/fallidos/resumen)", async () => {
    const respuesta = {
      exitosos: [{ leadId: "lead-01", asesorId: "asesor-2" }],
      fallidos: [{ leadId: "lead-99", codigo: "lead_no_encontrado", mensaje: "El lead no existe" }],
      resumen: { solicitados: 2, exitosos: 1, fallidos: 1 },
    };
    postMock.mockResolvedValue(respuesta);

    const resultado = await assignLeadsMasivoApi(["lead-01", "lead-99"], "asesor-2");

    expect(postMock).toHaveBeenCalledWith("/leads/asignar-lote", {
      leadIds: ["lead-01", "lead-99"],
      asesorId: "asesor-2",
    });
    expect(resultado).toEqual(respuesta);
  });
});

describe("getCatalogoResponsables / getCatalogoResponsablesConRol (D-A2: GET /usuarios/responsables?rol=)", () => {
  it('"ASESORES" llama una sola vez con rol=ASESOR', async () => {
    getMock.mockResolvedValue({ responsables: [{ id: "asesor-1", nombre: "Marta Herrera", rol: "ASESOR" }] });

    const resultado = await getCatalogoResponsables("ASESORES");

    expect(getMock).toHaveBeenCalledTimes(1);
    expect(getMock).toHaveBeenCalledWith("/usuarios/responsables", { params: { rol: "ASESOR" } });
    expect(resultado).toEqual([{ id: "asesor-1", nombre: "Marta Herrera" }]);
  });

  it('"TODOS" combina dos llamadas (rol=ASESOR + rol=VENDEDOR), el backend no admite "todos" en un único request', async () => {
    getMock
      .mockResolvedValueOnce({ responsables: [{ id: "asesor-1", nombre: "Marta Herrera", rol: "ASESOR" }] })
      .mockResolvedValueOnce({ responsables: [{ id: "vendedor-1", nombre: "Sofía Vintimilla", rol: "VENDEDOR" }] });

    const resultado = await getCatalogoResponsables("TODOS");

    expect(getMock).toHaveBeenCalledTimes(2);
    expect(resultado.map((r) => r.id)).toEqual(["asesor-1", "vendedor-1"]);
  });

  it("getCatalogoResponsablesConRol conserva `rol` en cada resultado", async () => {
    getMock
      .mockResolvedValueOnce({ responsables: [{ id: "asesor-1", nombre: "Marta Herrera", rol: "ASESOR" }] })
      .mockResolvedValueOnce({ responsables: [{ id: "vendedor-1", nombre: "Sofía Vintimilla", rol: "VENDEDOR" }] });

    const resultado = await getCatalogoResponsablesConRol();

    expect(resultado).toEqual([
      { id: "asesor-1", nombre: "Marta Herrera", rol: "ASESOR" },
      { id: "vendedor-1", nombre: "Sofía Vintimilla", rol: "VENDEDOR" },
    ]);
  });
});
