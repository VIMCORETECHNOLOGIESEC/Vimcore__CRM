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
 *
 * Sesión holding-wide: el filtro de empresa usa `SelectorEmpresaDashboard`
 * (mismo componente que `DashboardPage.tsx`, con su propio test unitario en
 * `SelectorEmpresaDashboard.test.tsx`) -- acá solo se mockea
 * `empresa-apariencia-holding.api` (mismo mock que ya usa
 * `DashboardPage.test.tsx`) para poder abrir el combobox y elegir una
 * empresa, sin volver a probar el combobox en sí.
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
vi.mock("@/funcionalidades/empresa-apariencia/empresa-apariencia-holding.api", () => ({
  fetchEmpresasHoldingApi: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const api = await import("@/funcionalidades/reportes/reportes.api");
const { useAuth } = await import("@/funcionalidades/autenticacion/auth-context");
const empresasApi = await import("@/funcionalidades/empresa-apariencia/empresa-apariencia-holding.api");
const { toast } = await import("sonner");
const { ReportesPage } = await import("@/funcionalidades/reportes/ReportesPage");

const crearReporteJobApiMock = vi.mocked(api.crearReporteJobApi);
const fetchReporteJobActivoApiMock = vi.mocked(api.fetchReporteJobActivoApi);
const fetchReporteJobApiMock = vi.mocked(api.fetchReporteJobApi);
const descargarReporteApiMock = vi.mocked(api.descargarReporteApi);
const useAuthMock = vi.mocked(useAuth);
const fetchEmpresasHoldingApiMock = vi.mocked(empresasApi.fetchEmpresasHoldingApi);
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
  fetchEmpresasHoldingApiMock.mockReset().mockResolvedValue({
    items: [
      { id: "empresa-1", nombre: "Empresa A", colorPrimario: null, colorSecundario: null, logoUrl: null },
      { id: "empresa-2", nombre: "Empresa B", colorPrimario: null, colorSecundario: null, logoUrl: null },
    ],
    total: 2,
  } as never);
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

  it("explica la diferencia con la exportación rápida del Dashboard", async () => {
    renderPage();
    expect(
      await screen.findByText(
        "Reportes formales, con más alcance y trazabilidad que la exportación rápida del Dashboard.",
      ),
    ).toBeInTheDocument();
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
  it("por defecto (PDF, rango 7d) manda { tipo: 'pdf', parametros: { rango: '7d', plantilla: 'detallado' } }", async () => {
    const user = userEvent.setup();
    const jobCreado = jobFake({ id: "job-nuevo", estado: "PENDIENTE" });
    crearReporteJobApiMock.mockResolvedValue(jobCreado);
    fetchReporteJobApiMock.mockResolvedValue(jobCreado);
    renderPage();
    await screen.findByText("Todavía no generaste ningún reporte");

    await user.click(screen.getByRole("button", { name: "Generar reporte" }));

    await waitFor(() =>
      expect(crearReporteJobApiMock).toHaveBeenCalledWith("pdf", {
        rango: "7d",
        plantilla: "detallado",
      }),
    );
    expect(await screen.findByText("Pendiente")).toBeInTheDocument();
  });

  it("cambiar el formato a Excel manda tipo: 'xlsx' sin plantilla", async () => {
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

  it("el toggle de plantilla solo aparece con formato PDF", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Todavía no generaste ningún reporte");

    expect(screen.getByRole("group", { name: "Plantilla del reporte" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Excel" }));
    expect(screen.queryByRole("group", { name: "Plantilla del reporte" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "PDF" }));
    expect(screen.getByRole("group", { name: "Plantilla del reporte" })).toBeInTheDocument();
  });

  it("elegir la plantilla Ejecutivo manda plantilla: 'ejecutivo' en los parámetros", async () => {
    const user = userEvent.setup();
    const jobCreado = jobFake({ id: "job-nuevo", estado: "PENDIENTE" });
    crearReporteJobApiMock.mockResolvedValue(jobCreado);
    fetchReporteJobApiMock.mockResolvedValue(jobCreado);
    renderPage();
    await screen.findByText("Todavía no generaste ningún reporte");

    await user.click(screen.getByRole("button", { name: "Ejecutivo" }));
    await user.click(screen.getByRole("button", { name: "Generar reporte" }));

    await waitFor(() =>
      expect(crearReporteJobApiMock).toHaveBeenCalledWith("pdf", {
        rango: "7d",
        plantilla: "ejecutivo",
      }),
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
  it("muestra el selector de empresa (SelectorEmpresaDashboard)", async () => {
    mockearAuth("ADMINISTRADOR", "holding");
    renderPage();
    expect(await screen.findByRole("combobox", { name: "Empresa" })).toBeInTheDocument();
  });

  it("sin seleccionar empresa, el reporte sale holding-wide (sin empresaId)", async () => {
    mockearAuth("ADMINISTRADOR", "holding");
    const user = userEvent.setup();
    crearReporteJobApiMock.mockResolvedValue(jobFake());
    fetchReporteJobApiMock.mockResolvedValue(jobFake());
    renderPage();
    await screen.findByRole("combobox", { name: "Empresa" });

    await user.click(screen.getByRole("button", { name: "Generar reporte" }));

    await waitFor(() =>
      expect(crearReporteJobApiMock).toHaveBeenCalledWith("pdf", {
        rango: "7d",
        plantilla: "detallado",
      }),
    );
  });

  it("eligiendo una empresa en el selector, manda ese empresaId en los parámetros", async () => {
    mockearAuth("ADMINISTRADOR", "holding");
    const user = userEvent.setup();
    crearReporteJobApiMock.mockResolvedValue(jobFake());
    fetchReporteJobApiMock.mockResolvedValue(jobFake());
    renderPage();
    const boton = await screen.findByRole("combobox", { name: "Empresa" });
    await user.click(boton);
    await user.click(await screen.findByText("Empresa A"));

    await user.click(screen.getByRole("button", { name: "Generar reporte" }));

    await waitFor(() =>
      expect(crearReporteJobApiMock).toHaveBeenCalledWith("pdf", {
        rango: "7d",
        plantilla: "detallado",
        empresaId: "empresa-1",
      }),
    );
  });

  it("una sesión company nunca ve el selector de empresa", async () => {
    mockearAuth("ADMINISTRADOR", "company");
    renderPage();
    await screen.findByText("Todavía no generaste ningún reporte");
    expect(screen.queryByRole("combobox", { name: "Empresa" })).not.toBeInTheDocument();
  });
});
