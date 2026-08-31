import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getErrorMessage } from "@/api/httpClient";
import type { ReporteJob } from "@/tipos/reporte";
import type { RolUsuario, SessionScope } from "@/tipos/usuario";

/**
 * `ReportesPage` -- docs/23 item 15. `reportes.api` mockeado; el
 * `MutationCache` del cliente de test replica el toast global de error real
 * (mismo criterio que `tests/whatsapp/ConversacionesPage.test.tsx`). El
 * catálogo de campañas/responsables (`leads.api`) y `useAuth` también van
 * mockeados -- misma composición que `DashboardPage.tsx`.
 */
vi.mock("@/funcionalidades/reportes/reportes.api", () => ({
  crearReporteJobApi: vi.fn(),
  fetchReporteJobActivoApi: vi.fn(),
  fetchReporteJobApi: vi.fn(),
  descargarReporteApi: vi.fn(),
}));
vi.mock("@/funcionalidades/leads/leads.api", () => ({
  getCatalogoCampanias: vi.fn(() => []),
  getCatalogoResponsables: vi.fn(() => Promise.resolve([])),
}));
vi.mock("@/funcionalidades/autenticacion/auth-context", () => ({ useAuth: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const api = await import("@/funcionalidades/reportes/reportes.api");
const { useAuth } = await import("@/funcionalidades/autenticacion/auth-context");
const { toast } = await import("sonner");
const { ReportesPage } = await import("@/funcionalidades/reportes/ReportesPage");

const crearReporteJobApiMock = vi.mocked(api.crearReporteJobApi);
const fetchReporteJobActivoApiMock = vi.mocked(api.fetchReporteJobActivoApi);
const fetchReporteJobApiMock = vi.mocked(api.fetchReporteJobApi);
const descargarReporteApiMock = vi.mocked(api.descargarReporteApi);
const useAuthMock = vi.mocked(useAuth);
const toastErrorMock = vi.mocked(toast.error);

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

function mockearAuth(rol: RolUsuario, sessionScope: SessionScope = "company") {
  useAuthMock.mockReturnValue({
    user: { id: "u1", nombre: "Usuaria de prueba", correo: "u1@crm.test", rol, sessionScope },
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    hasRole: (allowedRoles) => !allowedRoles || allowedRoles.length === 0 || allowedRoles.includes(rol),
  } as never);
}

function renderPage(initialPath = "/reportes") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    mutationCache: new MutationCache({ onError: (error) => toast.error(getErrorMessage(error)) }),
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/reportes" element={<ReportesPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  crearReporteJobApiMock.mockReset();
  fetchReporteJobActivoApiMock.mockReset();
  fetchReporteJobApiMock.mockReset();
  descargarReporteApiMock.mockReset();
  toastErrorMock.mockReset();
  fetchReporteJobActivoApiMock.mockResolvedValue(null);
  mockearAuth("ADMINISTRADOR");
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("ReportesPage — estado inicial", () => {
  it("sin job activo, muestra un estado vacío honesto", async () => {
    renderPage();
    expect(await screen.findByText("Todavía no generaste ningún reporte")).toBeInTheDocument();
  });

  it("resync al montar: si /activo trae un job en curso, lo muestra sin necesidad de generar uno nuevo", async () => {
    fetchReporteJobActivoApiMock.mockResolvedValue(jobFake({ id: "job-9", estado: "PROCESANDO" }));
    fetchReporteJobApiMock.mockResolvedValue(jobFake({ id: "job-9", estado: "PROCESANDO" }));
    renderPage();

    expect(await screen.findByText("Generando…")).toBeInTheDocument();
    expect(fetchReporteJobApiMock).toHaveBeenCalledWith("job-9");
  });
});

describe("ReportesPage — generar reporte", () => {
  it("por defecto (PDF, rango 7d) manda { tipo: 'pdf', parametros: { rango: '7d' } }", async () => {
    const user = userEvent.setup();
    const jobCreado = jobFake({ id: "job-nuevo", estado: "PENDIENTE" });
    crearReporteJobApiMock.mockResolvedValue(jobCreado);
    fetchReporteJobApiMock.mockResolvedValue(jobCreado);
    renderPage();
    await screen.findByText("Todavía no generaste ningún reporte");

    await user.click(screen.getByRole("button", { name: "Generar reporte" }));

    await waitFor(() =>
      expect(crearReporteJobApiMock).toHaveBeenCalledWith("pdf", { rango: "7d" }),
    );
    expect(await screen.findByText("Pendiente")).toBeInTheDocument();
  });

  it("cambiar el formato a Excel manda tipo: 'xlsx'", async () => {
    const user = userEvent.setup();
    crearReporteJobApiMock.mockResolvedValue(jobFake({ tipo: "xlsx" }));
    fetchReporteJobApiMock.mockResolvedValue(jobFake({ tipo: "xlsx" }));
    renderPage();
    await screen.findByText("Todavía no generaste ningún reporte");

    await user.click(screen.getByRole("button", { name: "Excel" }));
    await user.click(screen.getByRole("button", { name: "Generar reporte" }));

    await waitFor(() =>
      expect(crearReporteJobApiMock).toHaveBeenCalledWith("xlsx", { rango: "7d" }),
    );
  });

  it("mientras la solicitud está en curso, el botón queda deshabilitado", async () => {
    let resolver: (value: ReporteJob) => void = () => {};
    crearReporteJobApiMock.mockReturnValue(
      new Promise((resolve) => {
        resolver = resolve;
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Todavía no generaste ningún reporte");

    await user.click(screen.getByRole("button", { name: "Generar reporte" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Generando…" })).toBeDisabled(),
    );
    resolver(jobFake());
  });

  it("un error del backend al crear el job se muestra vía el toast global, con mensaje accionable", async () => {
    const { ApiError } = await import("@/api/httpClient");
    crearReporteJobApiMock.mockRejectedValue(
      new ApiError("validacion_invalida", 400, "El rango de fechas es inválido."),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Todavía no generaste ningún reporte");

    await user.click(screen.getByRole("button", { name: "Generar reporte" }));

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith("El rango de fechas es inválido."),
    );
  });
});

describe("ReportesPage — descarga del archivo", () => {
  it("con estado LISTO, muestra el botón de descarga y dispara descargarReporteApi al hacer click", async () => {
    fetchReporteJobActivoApiMock.mockResolvedValue(jobFake({ id: "job-listo", estado: "LISTO" }));
    fetchReporteJobApiMock.mockResolvedValue(jobFake({ id: "job-listo", estado: "LISTO", tipo: "pdf" }));
    descargarReporteApiMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    const boton = await screen.findByRole("button", { name: "Descargar reporte" });
    await user.click(boton);

    await waitFor(() =>
      expect(descargarReporteApiMock).toHaveBeenCalledWith("job-listo", "pdf"),
    );
  });

  it("con estado distinto de LISTO, no muestra el botón de descarga", async () => {
    fetchReporteJobActivoApiMock.mockResolvedValue(jobFake({ id: "job-proc", estado: "PROCESANDO" }));
    fetchReporteJobApiMock.mockResolvedValue(jobFake({ id: "job-proc", estado: "PROCESANDO" }));
    renderPage();

    await screen.findByText("Generando…");
    expect(screen.queryByRole("button", { name: "Descargar reporte" })).not.toBeInTheDocument();
  });

  it("con estado ERROR, muestra el mensaje de error del job", async () => {
    fetchReporteJobActivoApiMock.mockResolvedValue(
      jobFake({ id: "job-error", estado: "ERROR", error: "No se pudo generar el archivo." }),
    );
    fetchReporteJobApiMock.mockResolvedValue(
      jobFake({ id: "job-error", estado: "ERROR", error: "No se pudo generar el archivo." }),
    );
    renderPage();

    expect(await screen.findByText("No se pudo generar el archivo.")).toBeInTheDocument();
  });
});

describe("ReportesPage — sesión holding-wide", () => {
  it("sin ?empresaId en la URL, avisa que el reporte cubre todo el holding y no manda empresaId", async () => {
    mockearAuth("ADMINISTRADOR", "holding");
    const user = userEvent.setup();
    crearReporteJobApiMock.mockResolvedValue(jobFake());
    fetchReporteJobApiMock.mockResolvedValue(jobFake());
    renderPage("/reportes");
    await screen.findByText(/todo el holding/i);

    await user.click(screen.getByRole("button", { name: "Generar reporte" }));

    await waitFor(() =>
      expect(crearReporteJobApiMock).toHaveBeenCalledWith("pdf", { rango: "7d" }),
    );
  });

  it("con ?empresaId= en la URL, manda ese empresaId en los parámetros", async () => {
    mockearAuth("ADMINISTRADOR", "holding");
    const user = userEvent.setup();
    crearReporteJobApiMock.mockResolvedValue(jobFake());
    fetchReporteJobApiMock.mockResolvedValue(jobFake());
    renderPage("/reportes?empresaId=empresa-9");
    await screen.findByText(/empresa seleccionada/i);

    await user.click(screen.getByRole("button", { name: "Generar reporte" }));

    await waitFor(() =>
      expect(crearReporteJobApiMock).toHaveBeenCalledWith("pdf", {
        rango: "7d",
        empresaId: "empresa-9",
      }),
    );
  });

  it("una sesión company nunca muestra el aviso de holding", async () => {
    mockearAuth("ADMINISTRADOR", "company");
    renderPage();
    await screen.findByText("Todavía no generaste ningún reporte");
    expect(screen.queryByText(/todo el holding/i)).not.toBeInTheDocument();
  });
});
