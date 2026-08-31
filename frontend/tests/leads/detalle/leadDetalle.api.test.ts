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
  fetchLeadDetalleApi,
  fetchFormularioEtapaApi,
  transicionEtapaApi,
  handoffToVendedorApi,
  reassignApi,
  fetchCitasLeadApi,
  scheduleCitaApi,
  rescheduleCitaApi,
  markCitaResultApi,
  cancelCitaApi,
} = await import("@/funcionalidades/leads/detalle/leadDetalle.api");

const getMock = vi.mocked(httpClient.get);
const postMock = vi.mocked(httpClient.post);
const patchMock = vi.mocked(httpClient.patch);

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
    origen: "NUEVO",
    redSocial: "INSTAGRAM",
    etapa: "NUEVO",
    semaforo: "AMARILLO",
    puntuacion: 40,
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
  patchMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchLeadDetalleApi (GET /leads/:id real)", () => {
  it("devuelve el lead mapeado a la forma del frontend", async () => {
    getMock.mockResolvedValue({ lead: leadBackendFake() });

    const lead = await fetchLeadDetalleApi("lead-01");

    expect(getMock).toHaveBeenCalledWith("/leads/lead-01");
    expect(lead.id).toBe("lead-01");
    expect(lead.cliente.nombre).toBe("Roberto Salazar");
  });

  it("propaga el error del backend (404/403) sin envolverlo", async () => {
    getMock.mockRejectedValue(new Error("lead_no_encontrado"));

    await expect(fetchLeadDetalleApi("lead-no-existe")).rejects.toThrow();
  });
});

describe("fetchFormularioEtapaApi (GET /formularios/:etapa real) — remapeo clave/valor", () => {
  it("remapea `clave`(backend)→`valor`(frontend) y `valor`(backend, 0-10)→`puntaje`(frontend)", async () => {
    getMock.mockResolvedValue({
      formulario: {
        etapa: "CONTACTADO",
        preguntas: [
          {
            clave: "contacto_logrado",
            etiqueta: "¿Se logró contactar al lead?",
            peso: 3,
            opciones: [{ clave: "si_respondio", etiqueta: "Sí, respondió", valor: 10 }],
          },
        ],
      },
    });

    const formulario = await fetchFormularioEtapaApi("CONTACTADO");

    expect(getMock).toHaveBeenCalledWith("/formularios/CONTACTADO");
    expect(formulario.preguntas[0]?.clave).toBe("contacto_logrado");
    expect(formulario.preguntas[0]?.opciones[0]).toEqual({
      valor: "si_respondio",
      etiqueta: "Sí, respondió",
      puntaje: 10,
    });
  });
});

describe("transicionEtapaApi (D-B2: PATCH /leads/:id/etapa, unión discriminada)", () => {
  it("VENTA: manda etapa/montoVenta/productoServicio/formaPago", async () => {
    patchMock.mockResolvedValue({ lead: leadBackendFake({ etapa: "VENTA" }) });

    await transicionEtapaApi("lead-01", {
      etapa: "VENTA",
      montoVenta: 1200,
      productoServicio: "Plan Estándar",
      formaPago: "CONTADO",
    });

    expect(patchMock).toHaveBeenCalledWith("/leads/lead-01/etapa", {
      etapa: "VENTA",
      montoVenta: 1200,
      productoServicio: "Plan Estándar",
      formaPago: "CONTADO",
    });
  });

  it("NO_VENTA: manda etapa/observacionCierre", async () => {
    patchMock.mockResolvedValue({ lead: leadBackendFake({ etapa: "NO_VENTA" }) });

    await transicionEtapaApi("lead-01", {
      etapa: "NO_VENTA",
      observacionCierre: "El cliente decidió posponer la compra indefinidamente.",
    });

    expect(patchMock).toHaveBeenCalledWith("/leads/lead-01/etapa", {
      etapa: "NO_VENTA",
      observacionCierre: "El cliente decidió posponer la compra indefinidamente.",
    });
  });

  it("NUEVO/CONTACTADO/CITA: manda etapa/respuestas", async () => {
    patchMock.mockResolvedValue({ lead: leadBackendFake({ etapa: "CONTACTADO" }) });

    await transicionEtapaApi("lead-01", { etapa: "CONTACTADO", respuestas: { contacto_logrado: "si_respondio" } });

    expect(patchMock).toHaveBeenCalledWith("/leads/lead-01/etapa", {
      etapa: "CONTACTADO",
      respuestas: { contacto_logrado: "si_respondio" },
    });
  });
});

describe("handoffToVendedorApi (POST /leads/:id/traspasar real)", () => {
  it("manda vendedorId cuando se elige manualmente", async () => {
    postMock.mockResolvedValue({ lead: leadBackendFake() });

    await handoffToVendedorApi("lead-01", "vendedor-2");

    expect(postMock).toHaveBeenCalledWith("/leads/lead-01/traspasar", { vendedorId: "vendedor-2" });
  });

  it("manda vendedorId undefined cuando no se elige (backend aplica menor carga)", async () => {
    postMock.mockResolvedValue({ lead: leadBackendFake() });

    await handoffToVendedorApi("lead-01");

    expect(postMock).toHaveBeenCalledWith("/leads/lead-01/traspasar", { vendedorId: undefined });
  });
});

describe("reassignApi (POST /leads/:id/reasignar real, pool ASESOR)", () => {
  it("manda el responsableId como asesorId", async () => {
    postMock.mockResolvedValue({ lead: leadBackendFake() });

    await reassignApi("lead-01", "asesor-2");

    expect(postMock).toHaveBeenCalledWith("/leads/lead-01/reasignar", { asesorId: "asesor-2" });
  });

  it("propaga el error del backend cuando el responsable no existe", async () => {
    postMock.mockRejectedValue(new Error("usuario_no_encontrado"));

    await expect(reassignApi("lead-01", "no-existe")).rejects.toThrow();
  });
});

describe("citas: agendar, reprogramar y marcar resultado (backend real, M7)", () => {
  it("scheduleCitaApi llama a POST /leads/:id/citas y mapea la respuesta", async () => {
    postMock.mockResolvedValue({
      cita: {
        id: "cita-01",
        leadId: "lead-01",
        usuarioId: "asesor-1",
        programadaPara: "2026-03-01T10:00:00.000Z",
        modalidad: "VIRTUAL",
        estado: "AGENDADA",
        notas: null,
      },
    });

    const cita = await scheduleCitaApi({
      leadId: "lead-01",
      usuarioId: "asesor-1",
      programadaPara: "2026-03-01T10:00:00.000Z",
      modalidad: "VIRTUAL",
    });

    expect(postMock).toHaveBeenCalledWith("/leads/lead-01/citas", {
      usuarioId: "asesor-1",
      programadaPara: "2026-03-01T10:00:00.000Z",
      modalidad: "VIRTUAL",
      notas: undefined,
    });
    expect(cita.notas).toBeUndefined();
  });

  it("scheduleCitaApi propaga el rechazo del backend ante una fecha ya pasada (422)", async () => {
    postMock.mockRejectedValue(new Error("cita_en_pasado"));

    await expect(
      scheduleCitaApi({
        leadId: "lead-01",
        usuarioId: "asesor-1",
        programadaPara: "2020-01-01T00:00:00.000Z",
        modalidad: "TELEFONICA",
      }),
    ).rejects.toThrow();
  });

  it("rescheduleCitaApi llama a POST /citas/:citaId/reprogramar (verbo POST, no PATCH)", async () => {
    postMock.mockResolvedValue({
      cita: {
        id: "cita-01",
        leadId: "lead-01",
        usuarioId: "asesor-1",
        programadaPara: "2026-03-02T10:00:00.000Z",
        modalidad: "VIRTUAL",
        estado: "AGENDADA",
        notas: null,
      },
    });

    const cita = await rescheduleCitaApi("cita-01", "2026-03-02T10:00:00.000Z");

    expect(postMock).toHaveBeenCalledWith("/citas/cita-01/reprogramar", {
      programadaPara: "2026-03-02T10:00:00.000Z",
    });
    expect(cita.programadaPara).toBe("2026-03-02T10:00:00.000Z");
  });

  it("fetchCitasLeadApi llama a GET /leads/:id/citas y mapea la lista", async () => {
    getMock.mockResolvedValue({
      citas: [
        {
          id: "cita-01",
          leadId: "lead-01",
          usuarioId: "asesor-1",
          programadaPara: "2026-03-01T10:00:00.000Z",
          modalidad: "VIRTUAL",
          estado: "AGENDADA",
          notas: "Confirmar disponibilidad.",
        },
      ],
    });

    const citas = await fetchCitasLeadApi("lead-01");

    expect(getMock).toHaveBeenCalledWith("/leads/lead-01/citas");
    expect(citas).toHaveLength(1);
    expect(citas[0]?.notas).toBe("Confirmar disponibilidad.");
  });

  it("markCitaResultApi llama a POST /citas/:citaId/resultado (verbo POST, no PATCH)", async () => {
    postMock.mockResolvedValue({
      cita: {
        id: "cita-01",
        leadId: "lead-01",
        usuarioId: "asesor-1",
        programadaPara: "2026-03-01T10:00:00.000Z",
        modalidad: "VIRTUAL",
        estado: "CUMPLIDA",
        notas: null,
      },
    });

    const cita = await markCitaResultApi("cita-01", "CUMPLIDA");

    expect(postMock).toHaveBeenCalledWith("/citas/cita-01/resultado", { estado: "CUMPLIDA" });
    expect(cita.estado).toBe("CUMPLIDA");
  });

});

describe("cancelCitaApi (POST /citas/:citaId/cancelar real, design D-B1 -- unidad B2)", () => {
  it("llama a POST /citas/:citaId/cancelar sin body y mapea la respuesta", async () => {
    postMock.mockResolvedValue({
      cita: {
        id: "cita-01",
        leadId: "lead-01",
        usuarioId: "asesor-1",
        programadaPara: "2026-03-01T10:00:00.000Z",
        modalidad: "VIRTUAL",
        estado: "CANCELADA",
        notas: null,
      },
    });

    const cita = await cancelCitaApi("cita-01");

    expect(postMock).toHaveBeenCalledWith("/citas/cita-01/cancelar");
    expect(postMock).not.toHaveBeenCalledWith("/citas/cita-01/resultado", expect.anything());
    expect(cita.estado).toBe("CANCELADA");
  });

  it("propaga el error del backend si la cita no existe", async () => {
    postMock.mockRejectedValue(new Error("cita_no_encontrada"));

    await expect(cancelCitaApi("cita-no-existe")).rejects.toThrow();
  });
});

/**
 * Escenario negativo del spec (`sdd/integracion-leads-f3-f4/spec`, Requirement
 * "Cancelación de cita separada del resultado"): ningún path de la API de
 * citas puede enviar `estado: "CANCELADA"` a `/resultado`. `markCitaResultApi`
 * ya no acepta `"CANCELADA"` en su tipo (design D-B1, unidad B2) -- este test
 * lo prueba también en runtime, esquivando el chequeo de tipos con `as never`
 * a propósito: si alguien reabre el tipo (o llama la función desde JS puro),
 * el backend real seguiría rechazando con 400 y `markCitaResultApi` nunca
 * hace de cuenta que tuvo éxito.
 */
describe('escenario negativo -- "CANCELADA" nunca llega a /citas/:id/resultado', () => {
  it("si se fuerza el envío de CANCELADA vía cast de tipo, la llamada real sigue apuntando a /resultado (no /cancelar) y el backend la rechaza", async () => {
    postMock.mockRejectedValue(new Error("validacion_invalida"));

    await expect(markCitaResultApi("cita-01", "CANCELADA" as never)).rejects.toThrow();
    expect(postMock).toHaveBeenCalledWith("/citas/cita-01/resultado", { estado: "CANCELADA" });
  });

  it("la cancelación real de cita usa un endpoint separado (/cancelar), nunca /resultado con CANCELADA", async () => {
    postMock.mockResolvedValue({
      cita: {
        id: "cita-01",
        leadId: "lead-01",
        usuarioId: "asesor-1",
        programadaPara: "2026-03-01T10:00:00.000Z",
        modalidad: "VIRTUAL",
        estado: "CANCELADA",
        notas: null,
      },
    });

    await cancelCitaApi("cita-01");

    expect(postMock).toHaveBeenCalledWith("/citas/cita-01/cancelar");
    expect(postMock).not.toHaveBeenCalledWith("/citas/cita-01/resultado", { estado: "CANCELADA" });
  });
});
