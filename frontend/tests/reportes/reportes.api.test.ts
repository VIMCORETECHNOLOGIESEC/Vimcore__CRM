import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReporteJob, ReporteParametros } from "@/tipos/reporte";

/**
 * `reportes.api.ts` -- docs/23 item 15. Mismo patrón que
 * `conversaciones.api.test.ts`: `httpClient` mockeado para los 3 endpoints
 * JSON, `authenticatedFetch` mockeado aparte para la descarga binaria (no
 * puede usar `httpClient`, que siempre llama `.json()`).
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
    authenticatedFetch: vi.fn(),
  };
});

const { httpClient, authenticatedFetch, ApiError } = await import("@/api/httpClient");
const {
  crearReporteJobApi,
  fetchReporteJobActivoApi,
  fetchReporteJobApi,
  descargarReporteApi,
} = await import("@/funcionalidades/reportes/reportes.api");

const getMock = vi.mocked(httpClient.get);
const postMock = vi.mocked(httpClient.post);
const authenticatedFetchMock = vi.mocked(authenticatedFetch);

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
  authenticatedFetchMock.mockReset();
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
  function respuestaFake(overrides: Partial<Response> = {}): Response {
    return {
      ok: true,
      status: 200,
      headers: new Headers({ "Content-Disposition": 'attachment; filename="reporte-job-1.pdf"' }),
      blob: () => Promise.resolve(new Blob(["contenido"], { type: "application/pdf" })),
      json: () => Promise.resolve({}),
      ...overrides,
    } as Response;
  }

  it("pide la ruta autenticada correcta", async () => {
    authenticatedFetchMock.mockResolvedValue(respuestaFake());
    const createObjectURLSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    await descargarReporteApi("job-1", "pdf");

    expect(authenticatedFetchMock).toHaveBeenCalledWith("/reportes/jobs/job-1/descargar");
    expect(createObjectURLSpy).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
  });

  it("usa el filename de Content-Disposition cuando está presente", async () => {
    authenticatedFetchMock.mockResolvedValue(respuestaFake());
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    let nombreDescargado = "";
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === "a") {
        Object.defineProperty(el, "click", {
          value: () => {
            nombreDescargado = (el as HTMLAnchorElement).download;
          },
        });
      }
      return el;
    });

    await descargarReporteApi("job-1", "pdf");

    expect(nombreDescargado).toBe("reporte-job-1.pdf");
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
  });

  it("cae al nombre por defecto reporte-<id>.<tipo> sin Content-Disposition", async () => {
    authenticatedFetchMock.mockResolvedValue(
      respuestaFake({ headers: new Headers() }),
    );
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    let nombreDescargado = "";
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === "a") {
        Object.defineProperty(el, "click", {
          value: () => {
            nombreDescargado = (el as HTMLAnchorElement).download;
          },
        });
      }
      return el;
    });

    await descargarReporteApi("job-9", "xlsx");

    expect(nombreDescargado).toBe("reporte-job-9.xlsx");
  });

  it("con 409 reporte_no_disponible, lanza un ApiError con el mensaje del backend", async () => {
    authenticatedFetchMock.mockResolvedValue(
      respuestaFake({
        ok: false,
        status: 409,
        json: () =>
          Promise.resolve({
            code: "reporte_no_disponible",
            message: "El reporte todavía no está listo para descargar.",
          }),
      }),
    );

    await expect(descargarReporteApi("job-1", "pdf")).rejects.toThrow(
      "El reporte todavía no está listo para descargar.",
    );
  });

  it("con un cuerpo de error no JSON, lanza un mensaje genérico accionable", async () => {
    authenticatedFetchMock.mockResolvedValue(
      respuestaFake({
        ok: false,
        status: 404,
        json: () => Promise.reject(new Error("no body")),
      }),
    );

    await expect(descargarReporteApi("job-1", "pdf")).rejects.toThrow(
      "Ocurrió un error inesperado. Intentá nuevamente en unos segundos.",
    );
  });

  it("ante una falla de red (fetch rechaza), lanza un mensaje accionable de conexión", async () => {
    authenticatedFetchMock.mockRejectedValue(new TypeError("failed to fetch"));

    await expect(descargarReporteApi("job-1", "pdf")).rejects.toThrow(
      "No se pudo conectar con el servidor. Verificá tu conexión e intentá nuevamente.",
    );
  });
});
