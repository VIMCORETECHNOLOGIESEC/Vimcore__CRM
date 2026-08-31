import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReporteJob, ReporteParametros } from "@/tipos/reporte";

/**
 * `reportes.api.ts` -- docs/23 item 15. Mismo patrón que
 * `conversaciones.api.test.ts`: `httpClient` mockeado para los 4 endpoints
 * JSON (incluida la descarga, que desde `getReporteJobDescarga`
 * (`reportes.controller.ts:59-72`, 2026-08-30) devuelve `{ url }` -- una SAS
 * de Azure Blob Storage -- en vez de streamear el archivo).
 */
vi.mock("@/api/httpClient", async () => {
  const actual = await vi.importActual<typeof import("@/api/httpClient")>("@/api/httpClient");
  return {
    ApiError: actual.ApiError,
    httpClient: {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    },
  };
});

const { httpClient, ApiError } = await import("@/api/httpClient");
const {
  crearReporteJobApi,
  fetchReporteJobActivoApi,
  fetchReporteJobApi,
  descargarReporteApi,
} = await import("@/funcionalidades/reportes/reportes.api");

const getMock = vi.mocked(httpClient.get);
const postMock = vi.mocked(httpClient.post);

function jobFake(overrides: Partial<ReporteJob> = {}): ReporteJob {
  return {
    id: "job-1",
    usuarioId: "u1",
    tipo: "pdf",
    parametros: { rango: "7d" },
    estado: "PENDIENTE",
    archivoUrl: null,
    error: null,
    creadoEn: "2026-08-30T10:00:00.000Z",
    finalizadoEn: null,
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

describe("crearReporteJobApi — POST /reportes/jobs", () => {
  it("manda { tipo, parametros } y desenvuelve { job }", async () => {
    const job = jobFake();
    postMock.mockResolvedValue({ job });
    const parametros: ReporteParametros = { rango: "7d" };

    const resultado = await crearReporteJobApi("pdf", parametros);

    expect(postMock).toHaveBeenCalledWith("/reportes/jobs", { tipo: "pdf", parametros });
    expect(resultado).toEqual(job);
  });

  it("desenvuelve { job } igual para una respuesta 200 (job ya activo)", async () => {
    const job = jobFake({ estado: "PROCESANDO" });
    postMock.mockResolvedValue({ job });

    const resultado = await crearReporteJobApi("xlsx", { rango: "hoy" });

    expect(resultado).toEqual(job);
  });
});

describe("fetchReporteJobActivoApi — GET /reportes/jobs/activo", () => {
  it("devuelve el job activo cuando existe", async () => {
    const job = jobFake({ estado: "PROCESANDO" });
    getMock.mockResolvedValue({ job });

    const resultado = await fetchReporteJobActivoApi();

    expect(getMock).toHaveBeenCalledWith("/reportes/jobs/activo");
    expect(resultado).toEqual(job);
  });

  it("devuelve null cuando no hay job activo (200, no 404)", async () => {
    getMock.mockResolvedValue({ job: null });

    const resultado = await fetchReporteJobActivoApi();

    expect(resultado).toBeNull();
  });
});

describe("fetchReporteJobApi — GET /reportes/jobs/:id", () => {
  it("interpola el id y desenvuelve { job }", async () => {
    const job = jobFake({ estado: "LISTO", archivoUrl: "/reportes/jobs/job-1/descargar" });
    getMock.mockResolvedValue({ job });

    const resultado = await fetchReporteJobApi("job-1");

    expect(getMock).toHaveBeenCalledWith("/reportes/jobs/job-1");
    expect(resultado).toEqual(job);
  });

  it("propaga tal cual el ApiError del backend (404/403)", async () => {
    getMock.mockRejectedValue(new ApiError("reporte_no_encontrado", 404, "No se encontró el reporte solicitado."));

    await expect(fetchReporteJobApi("job-x")).rejects.toThrow("No se encontró el reporte solicitado.");
  });
});

describe("descargarReporteApi — GET /reportes/jobs/:id/descargar", () => {
  // jsdom no permite redefinir `Location.prototype.assign` con `vi.spyOn`
  // (propiedad no configurable en esta versión) -- se reemplaza el objeto
  // `window.location` completo, mismo criterio que
  // `whatsapp.utils.test.ts::redirectTo`.
  let assignMock: ReturnType<typeof vi.fn>;
  let originalLocation: Location;

  beforeEach(() => {
    originalLocation = window.location;
    assignMock = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...originalLocation, assign: assignMock },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      value: originalLocation,
      configurable: true,
      writable: true,
    });
  });

  it("pide la ruta JSON correcta y navega a la URL SAS devuelta", async () => {
    getMock.mockResolvedValue({ url: "https://storage.blob.core.windows.net/reportes/job-1.pdf?sig=abc" });

    await descargarReporteApi("job-1", "pdf");

    expect(getMock).toHaveBeenCalledWith("/reportes/jobs/job-1/descargar");
    expect(assignMock).toHaveBeenCalledWith(
      "https://storage.blob.core.windows.net/reportes/job-1.pdf?sig=abc",
    );
  });

  it("con 409 reporte_no_disponible, propaga el ApiError con el mensaje del backend sin navegar", async () => {
    getMock.mockRejectedValue(
      new ApiError("reporte_no_disponible", 409, "El reporte todavía no está listo para descargar."),
    );

    await expect(descargarReporteApi("job-1", "pdf")).rejects.toThrow(
      "El reporte todavía no está listo para descargar.",
    );
    expect(assignMock).not.toHaveBeenCalled();
  });

  it("con 404 archivo_no_encontrado, propaga el ApiError del backend sin navegar", async () => {
    getMock.mockRejectedValue(
      new ApiError("archivo_no_encontrado", 404, "El archivo del reporte ya no está disponible"),
    );

    await expect(descargarReporteApi("job-1", "pdf")).rejects.toThrow(
      "El archivo del reporte ya no está disponible",
    );
    expect(assignMock).not.toHaveBeenCalled();
  });

  it("ante una falla de red, propaga el ApiError accionable de conexión de httpClient sin navegar", async () => {
    getMock.mockRejectedValue(
      new ApiError("error_red", 0, "No se pudo conectar con el servidor. Verificá tu conexión e intentá nuevamente."),
    );

    await expect(descargarReporteApi("job-1", "pdf")).rejects.toThrow(
      "No se pudo conectar con el servidor. Verificá tu conexión e intentá nuevamente.",
    );
    expect(assignMock).not.toHaveBeenCalled();
  });
});
