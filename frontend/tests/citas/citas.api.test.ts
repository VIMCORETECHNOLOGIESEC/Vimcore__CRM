import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/httpClient", () => {
  class ApiError extends Error {
    public readonly code: string;
    public readonly status: number;

    constructor(code: string, status: number, message: string) {
      super(message);
      this.code = code;
      this.status = status;
    }
  }

  return {
    ApiError,
    httpClient: {
      get: vi.fn(),
      post: vi.fn(),
    },
  };
});

const { ApiError, httpClient } = await import("@/api/httpClient");
const {
  fetchCitasApi,
  markCitaResultCalendarioApi,
  rescheduleCitaCalendarioApi,
  scheduleCitaCalendarioApi,
} = await import("@/funcionalidades/citas/citas.api");

const getMock = vi.mocked(httpClient.get);
const postMock = vi.mocked(httpClient.post);

function citaBackendFake(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "cita-01",
    leadId: "lead-01",
    usuarioId: "asesor-1",
    programadaPara: "2026-03-01T10:00:00.000Z",
    finalizaEn: "2026-03-01T11:00:00.000Z",
    modalidad: "VIRTUAL",
    estado: "AGENDADA",
    notas: null,
    lead: { id: "lead-01", cliente: { nombre: "Roberto Salazar", telefonoNormalizado: "+593991234567" } },
    usuario: { id: "asesor-1", nombre: "Marta Herrera" },
    ...overrides,
  };
}

beforeEach(() => {
  getMock.mockReset();
  postMock.mockReset();
});

describe("citas.api", () => {
  it("GET /citas manda rango y asesorId opcional, y mapea relaciones", async () => {
    getMock.mockResolvedValue({ citas: [citaBackendFake()] });

    const resultado = await fetchCitasApi({
      desde: "2026-03-01T00:00:00.000Z",
      hasta: "2026-03-31T23:59:59.999Z",
      asesorId: "asesor-1",
    });

    expect(getMock).toHaveBeenCalledWith("/citas", {
      params: {
        desde: "2026-03-01T00:00:00.000Z",
        hasta: "2026-03-31T23:59:59.999Z",
        asesorId: "asesor-1",
      },
    });
    expect(resultado[0]).toMatchObject({
      id: "cita-01",
      finalizaEn: "2026-03-01T11:00:00.000Z",
      lead: { cliente: { nombre: "Roberto Salazar" } },
      usuario: { nombre: "Marta Herrera" },
    });
  });

  it("agenda contra POST /leads/:leadId/citas con finalizaEn", async () => {
    postMock.mockResolvedValue({ cita: citaBackendFake() });

    await scheduleCitaCalendarioApi({
      leadId: "lead-01",
      usuarioId: "asesor-1",
      programadaPara: "2026-03-01T10:00:00.000Z",
      finalizaEn: "2026-03-01T11:00:00.000Z",
      modalidad: "VIRTUAL",
      notas: "Confirmar documentos",
    });

    expect(postMock).toHaveBeenCalledWith("/leads/lead-01/citas", {
      usuarioId: "asesor-1",
      programadaPara: "2026-03-01T10:00:00.000Z",
      finalizaEn: "2026-03-01T11:00:00.000Z",
      modalidad: "VIRTUAL",
      notas: "Confirmar documentos",
    });
  });

  it("reprograma con el body completo del contrato actual", async () => {
    postMock.mockResolvedValue({ cita: citaBackendFake({ estado: "REPROGRAMADA" }) });

    await rescheduleCitaCalendarioApi("cita-01", {
      usuarioId: "asesor-2",
      programadaPara: "2026-03-02T10:00:00.000Z",
      finalizaEn: "2026-03-02T11:00:00.000Z",
      modalidad: "PRESENCIAL",
      notas: "Nueva sede",
    });

    expect(postMock).toHaveBeenCalledWith("/citas/cita-01/reprogramar", {
      usuarioId: "asesor-2",
      programadaPara: "2026-03-02T10:00:00.000Z",
      finalizaEn: "2026-03-02T11:00:00.000Z",
      modalidad: "PRESENCIAL",
      notas: "Nueva sede",
    });
  });

  it("resultado usa el body existente { estado }", async () => {
    postMock.mockResolvedValue({ cita: citaBackendFake({ estado: "CUMPLIDA" }) });

    await markCitaResultCalendarioApi("cita-01", "CUMPLIDA");

    expect(postMock).toHaveBeenCalledWith("/citas/cita-01/resultado", { estado: "CUMPLIDA" });
  });

  it("convierte un 409 por solapamiento en un mensaje accionable", async () => {
    postMock.mockRejectedValue(new ApiError("cita_solapada", 409, "conflict"));

    await expect(
      scheduleCitaCalendarioApi({
        leadId: "lead-01",
        programadaPara: "2026-03-01T10:00:00.000Z",
        finalizaEn: "2026-03-01T11:00:00.000Z",
        modalidad: "VIRTUAL",
      }),
    ).rejects.toThrow("Ese horario ya está ocupado para este asesor. Elige otro horario.");
  });

  it("convierte un 409 por duración mínima en un mensaje accionable", async () => {
    postMock.mockRejectedValue(new ApiError("cita_duracion_minima", 409, "citas_duracion_minima"));

    await expect(
      scheduleCitaCalendarioApi({
        leadId: "lead-01",
        programadaPara: "2026-03-01T10:00:00.000Z",
        finalizaEn: "2026-03-01T10:30:00.000Z",
        modalidad: "VIRTUAL",
      }),
    ).rejects.toThrow("La cita debe durar al menos 1 hora. Ajusta la hora de finalización.");
  });

  it("preserva otros 409 específicos del backend", async () => {
    postMock.mockRejectedValue(new ApiError("cita_no_reprogramable", 409, "La cita no puede reprogramarse"));

    await expect(
      rescheduleCitaCalendarioApi("cita-01", {
        programadaPara: "2026-03-02T10:00:00.000Z",
        finalizaEn: "2026-03-02T11:00:00.000Z",
        modalidad: "VIRTUAL",
      }),
    ).rejects.toThrow("La cita no puede reprogramarse");
  });
});
