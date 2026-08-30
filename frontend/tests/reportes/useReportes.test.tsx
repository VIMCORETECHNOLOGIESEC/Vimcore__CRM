import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReporteJob } from "@/tipos/reporte";

/**
 * Hooks de la bandeja de reportes (docs/23 item 15). `reportes.api`
 * mockeado; se verifica la composición exacta de las query keys (contrato
 * fijado con `useNotificacionesRealtime.ts`: la invalidación SSE usa
 * `["reportes", jobId]`, que debe *prefix-matchear* la clave real de
 * `useReporteJob`) y el seed de caché tras crear un job. Mismo criterio de
 * aislamiento que `useConversaciones.test.tsx`.
 */
vi.mock("@/funcionalidades/reportes/reportes.api", () => ({
  crearReporteJobApi: vi.fn(),
  fetchReporteJobActivoApi: vi.fn(),
  fetchReporteJobApi: vi.fn(),
  descargarReporteApi: vi.fn(),
}));

let userId: string | null = "u1";
vi.mock("@/funcionalidades/autenticacion/authContext", () => ({
  useAuth: () => ({ user: userId ? { id: userId } : null }),
}));

const api = await import("@/funcionalidades/reportes/reportes.api");
const {
  REPORTES_QUERY_KEY,
  useReporteJobActivo,
  useReporteJob,
  useCrearReporteJob,
  useDescargarReporte,
} = await import("@/funcionalidades/reportes/useReportes");

const crearReporteJobApiMock = vi.mocked(api.crearReporteJobApi);
const fetchReporteJobActivoApiMock = vi.mocked(api.fetchReporteJobActivoApi);
const fetchReporteJobApiMock = vi.mocked(api.fetchReporteJobApi);
const descargarReporteApiMock = vi.mocked(api.descargarReporteApi);

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

function crearEntorno() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return { client, wrapper };
}

beforeEach(() => {
  userId = "u1";
  crearReporteJobApiMock.mockReset();
  fetchReporteJobActivoApiMock.mockReset();
  fetchReporteJobApiMock.mockReset();
  descargarReporteApiMock.mockReset();
});

describe("REPORTES_QUERY_KEY", () => {
  it("es 'reportes'", () => {
    expect(REPORTES_QUERY_KEY).toBe("reportes");
  });
});

describe("useReporteJobActivo", () => {
  it("consulta con la clave ['reportes','activo',userId] y expone el job", async () => {
    const job = jobFake({ estado: "PROCESANDO" });
    fetchReporteJobActivoApiMock.mockResolvedValue(job);
    const { client, wrapper } = crearEntorno();

    const { result } = renderHook(() => useReporteJobActivo(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(job);
    expect(client.getQueryData(["reportes", "activo", "u1"])).toEqual(job);
  });

  it("expone null cuando no hay job activo", async () => {
    fetchReporteJobActivoApiMock.mockResolvedValue(null);
    const { wrapper } = crearEntorno();

    const { result } = renderHook(() => useReporteJobActivo(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});

describe("useReporteJob", () => {
  it("consulta con la clave ['reportes', jobId, userId] cuando jobId no es null", async () => {
    const job = jobFake({ id: "job-7", estado: "LISTO" });
    fetchReporteJobApiMock.mockResolvedValue(job);
    const { client, wrapper } = crearEntorno();

    const { result } = renderHook(() => useReporteJob("job-7"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchReporteJobApiMock).toHaveBeenCalledWith("job-7");
    expect(client.getQueryData(["reportes", "job-7", "u1"])).toEqual(job);
  });

  it("no consulta cuando jobId es null (enabled: false)", () => {
    const { wrapper } = crearEntorno();

    const { result } = renderHook(() => useReporteJob(null), { wrapper });

    expect(result.current.fetchStatus).toBe("idle");
    expect(fetchReporteJobApiMock).not.toHaveBeenCalled();
  });

  it("una invalidación por prefijo ['reportes', jobId] (SSE) refresca esta query", async () => {
    const job = jobFake({ id: "job-7", estado: "PROCESANDO" });
    fetchReporteJobApiMock.mockResolvedValue(job);
    const { client, wrapper } = crearEntorno();

    const { result } = renderHook(() => useReporteJob("job-7"), { wrapper });
    // Leer `.data` acá (no solo `.isSuccess`) es necesario para que TanStack
    // Query "trackee" ese campo -- en modo `trackedProps` (default de v5),
    // un cambio en un campo nunca leído no dispara un nuevo render.
    await waitFor(() => expect(result.current.data).toEqual(job));

    const jobActualizado = { ...job, estado: "LISTO" as const, archivoUrl: "/x" };
    fetchReporteJobApiMock.mockResolvedValue(jobActualizado);
    await client.invalidateQueries({ queryKey: ["reportes", "job-7"] });

    await waitFor(() => expect(result.current.data).toEqual(jobActualizado));
  });
});

describe("useCrearReporteJob", () => {
  it("llama a crearReporteJobApi con (tipo, parametros) y siembra la caché del job creado", async () => {
    const job = jobFake({ id: "job-nuevo", estado: "PENDIENTE" });
    crearReporteJobApiMock.mockResolvedValue(job);
    const { client, wrapper } = crearEntorno();

    const { result } = renderHook(() => useCrearReporteJob(), { wrapper });
    result.current.mutate({ tipo: "pdf", parametros: { rango: "7d" } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(crearReporteJobApiMock).toHaveBeenCalledWith("pdf", { rango: "7d" });
    expect(client.getQueryData(["reportes", "job-nuevo", "u1"])).toEqual(job);
  });
});

describe("useDescargarReporte", () => {
  it("llama a descargarReporteApi con (jobId, tipo)", async () => {
    descargarReporteApiMock.mockResolvedValue(undefined);
    const { wrapper } = crearEntorno();

    const { result } = renderHook(() => useDescargarReporte(), { wrapper });
    result.current.mutate({ jobId: "job-1", tipo: "pdf" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(descargarReporteApiMock).toHaveBeenCalledWith("job-1", "pdf");
  });
});
