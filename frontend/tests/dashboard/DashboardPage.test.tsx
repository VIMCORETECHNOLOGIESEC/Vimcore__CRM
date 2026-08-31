import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useSearchParams } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RolUsuario, SessionScope } from "@/tipos/usuario";

/**
 * `DashboardPage` -- docs/23 item 14, "Dashboard con filtro por empresa
 * (holding)". `metricas.api`/`leads.api` (catálogos)/`auth-context` van
 * mockeados, mismo criterio que `tests/reportes/ReportesPage.test.tsx`. El
 * listado de empresas del selector (`empresa-apariencia-holding.api`) también
 * va mockeado -- `SelectorEmpresaDashboard` ya tiene su propio test unitario
 * (`SelectorEmpresaDashboard.test.tsx`), acá solo se verifica el gate de
 * rol/scope y que `empresaId` llega a las llamadas de métricas.
 *
 * Regresión (bug de producción): el selector de este Dashboard usaba antes
 * `useVistaEmpresa` (el mecanismo global de "entrar a mirar en vivo" una
 * empresa, que cambia sidebar + tema de toda la app vía `?empresaId=` en la
 * URL) -- acá se prueba explícitamente que `entrarAEmpresa`/`salirDeEmpresa`
 * NUNCA se llaman desde este flujo y que la URL nunca cambia: el filtro de
 * empresa del Dashboard es estado local, no navegación.
 */
const entrarAEmpresaMock = vi.fn();
const salirDeEmpresaMock = vi.fn();
vi.mock("@/funcionalidades/empresa-apariencia/useVistaEmpresa", () => ({
  useVistaEmpresa: () => ({
    empresaVistaId: null,
    entrarAEmpresa: entrarAEmpresaMock,
    salirDeEmpresa: salirDeEmpresaMock,
    esVistaSoloLectura: false,
  }),
}));
const RESUMEN_VACIO = {
  rango: { desde: "2026-08-24", hasta: "2026-08-30" },
  totalIngresados: { actual: 0, anterior: 0, variacionPorcentual: null },
  enGestion: { actual: 0, anterior: 0, variacionPorcentual: null },
  cerrados: {
    total: { actual: 0, anterior: 0, variacionPorcentual: null },
    venta: { actual: 0, anterior: 0, variacionPorcentual: null },
    noVenta: { actual: 0, anterior: 0, variacionPorcentual: null },
  },
  tasaConversion: {
    actual: { porcentaje: null, venta: 0, total: 0 },
    anterior: { porcentaje: null, venta: 0, total: 0 },
    variacionPorcentual: null,
  },
  tiempoPrimeraRespuesta: {
    horasPromedio: null,
    sinPrimeraRespuesta: 0,
    anteriorHorasPromedio: null,
    variacionPorcentual: null,
  },
  tiempoPromedioCierre: { diasPromedio: null, anteriorDiasPromedio: null, variacionPorcentual: null },
  cumplimientoSla: { porcentaje: null, anteriorPorcentaje: null, variacionPorcentual: null },
  distribucionSemaforo: { rojo: 0, amarillo: 0, verde: 0, sinCalificar: 0 },
};
const EMBUDO_VACIO = {
  pasos: [
    { etapa: "NUEVO", total: 0, caidaPct: null },
    { etapa: "CONTACTADO", total: 0, caidaPct: null },
    { etapa: "CITA", total: 0, caidaPct: null },
    { etapa: "VENTA", total: 0, caidaPct: null },
  ],
  noVenta: 0,
};
const CASCADA_VACIA = { leads: 0, conOportunidad: 0, ventaOportunidad: 0, tasaAperturaPct: null, tasaCierrePct: null };

vi.mock("@/funcionalidades/dashboard/metricas.api", () => ({
  fetchResumenMetricasApi: vi.fn(),
  fetchMetricasPorRedSocialApi: vi.fn(),
  fetchMetricasPorAsesorApi: vi.fn(),
  fetchMetricasPorEtapaApi: vi.fn(),
  fetchMetricasEmbudoApi: vi.fn(),
  fetchMetricasPorCampaniaApi: vi.fn(),
  fetchRedSocialPorSemaforoApi: vi.fn(),
  fetchMetricasEmbudoOportunidadApi: vi.fn(),
  fetchMetricasPorProductoApi: vi.fn(),
  fetchMetricasCascadaLeadOportunidadApi: vi.fn(),
  fetchMetricasRankingProductosPorEmpresaApi: vi.fn(),
}));
vi.mock("@/funcionalidades/leads/leads.api", () => ({
  getCatalogoCampanias: vi.fn(() => []),
  getCatalogoResponsables: vi.fn(() => Promise.resolve([])),
}));
vi.mock("@/funcionalidades/autenticacion/auth-context", () => ({ useAuth: vi.fn() }));
vi.mock("@/funcionalidades/empresa-apariencia/empresa-apariencia-holding.api", () => ({
  fetchEmpresasHoldingApi: vi.fn(),
}));

const metricasApi = await import("@/funcionalidades/dashboard/metricas.api");
const empresasApi = await import("@/funcionalidades/empresa-apariencia/empresa-apariencia-holding.api");
const { useAuth } = await import("@/funcionalidades/autenticacion/auth-context");
const { DashboardPage } = await import("@/funcionalidades/dashboard/DashboardPage");

const useAuthMock = vi.mocked(useAuth);
const fetchResumenMetricasApiMock = vi.mocked(metricasApi.fetchResumenMetricasApi);
const fetchEmpresasHoldingApiMock = vi.mocked(empresasApi.fetchEmpresasHoldingApi);

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

// Igual que `SelectorEmpresaDashboard.test.tsx`: lee `?empresaId=` real desde
// el test sin depender de `window.location` (jsdom + MemoryRouter no lo
// sincroniza).
function CapturaUrl({ children, onCapturar }: { children: React.ReactNode; onCapturar: (s: string) => void }) {
  const [searchParams] = useSearchParams();
  onCapturar(searchParams.toString());
  return children;
}

function renderPage(initialPath = "/panel") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let searchParamsCapturados = "";
  return {
    ...render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route
              path="/panel"
              element={
                <CapturaUrl onCapturar={(s) => (searchParamsCapturados = s)}>
                  <DashboardPage />
                </CapturaUrl>
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    ),
    getUrl: () => searchParamsCapturados,
  };
}

beforeEach(() => {
  vi.mocked(metricasApi.fetchResumenMetricasApi).mockReset().mockResolvedValue(RESUMEN_VACIO as never);
  vi.mocked(metricasApi.fetchMetricasPorRedSocialApi).mockReset().mockResolvedValue([]);
  vi.mocked(metricasApi.fetchMetricasPorAsesorApi).mockReset().mockResolvedValue([]);
  vi.mocked(metricasApi.fetchMetricasPorEtapaApi).mockReset().mockResolvedValue([]);
  vi.mocked(metricasApi.fetchMetricasEmbudoApi).mockReset().mockResolvedValue(EMBUDO_VACIO as never);
  vi.mocked(metricasApi.fetchMetricasPorCampaniaApi).mockReset().mockResolvedValue([]);
  vi.mocked(metricasApi.fetchRedSocialPorSemaforoApi).mockReset().mockResolvedValue([]);
  vi.mocked(metricasApi.fetchMetricasEmbudoOportunidadApi).mockReset().mockResolvedValue(EMBUDO_VACIO as never);
  vi.mocked(metricasApi.fetchMetricasPorProductoApi).mockReset().mockResolvedValue([]);
  vi.mocked(metricasApi.fetchMetricasCascadaLeadOportunidadApi).mockReset().mockResolvedValue(CASCADA_VACIA as never);
  vi.mocked(metricasApi.fetchMetricasRankingProductosPorEmpresaApi).mockReset().mockResolvedValue([]);
  fetchEmpresasHoldingApiMock.mockReset().mockResolvedValue({
    items: [
      { id: "empresa-1", nombre: "Empresa A", colorPrimario: null, colorSecundario: null, logoUrl: null },
      { id: "empresa-2", nombre: "Empresa B", colorPrimario: null, colorSecundario: null, logoUrl: null },
    ],
    total: 2,
  });
  entrarAEmpresaMock.mockReset();
  salirDeEmpresaMock.mockReset();
  mockearAuth("ADMINISTRADOR", "company");
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("DashboardPage — gate del selector de empresa (docs/23 item 14)", () => {
  it("ADMINISTRADOR + sesión holding: muestra el selector de empresa", async () => {
    mockearAuth("ADMINISTRADOR", "holding");
    renderPage();
    expect(await screen.findByRole("combobox", { name: "Empresa" })).toBeInTheDocument();
  });

  it("ADMINISTRADOR + sesión company: oculta el selector", async () => {
    mockearAuth("ADMINISTRADOR", "company");
    renderPage();
    await screen.findByText("Resumen ejecutivo");
    expect(screen.queryByRole("combobox", { name: "Empresa" })).not.toBeInTheDocument();
  });

  it("SUPERVISOR + sesión holding: oculta el selector (GET /empresas es exclusivo ADMINISTRADOR)", async () => {
    mockearAuth("SUPERVISOR", "holding");
    renderPage();
    await screen.findByText("Resumen ejecutivo");
    expect(screen.queryByRole("combobox", { name: "Empresa" })).not.toBeInTheDocument();
  });
});

describe("DashboardPage — empresaId fluye a las consultas de métricas", () => {
  it("sin ?empresaId en la URL, no manda empresaId (agregado de todo el holding)", async () => {
    mockearAuth("ADMINISTRADOR", "holding");
    renderPage("/panel");
    await screen.findByRole("combobox", { name: "Empresa" });

    await waitFor(() =>
      expect(fetchResumenMetricasApiMock).toHaveBeenCalledWith(expect.objectContaining({ empresaId: undefined })),
    );
  });

  it("eligiendo una empresa en el selector, las métricas se vuelven a pedir con ese empresaId", async () => {
    mockearAuth("ADMINISTRADOR", "holding");
    const user = userEvent.setup();
    renderPage("/panel");
    const boton = await screen.findByRole("combobox", { name: "Empresa" });
    await user.click(boton);
    await user.click(await screen.findByText("Empresa A"));

    await waitFor(() =>
      expect(fetchResumenMetricasApiMock).toHaveBeenCalledWith(
        expect.objectContaining({ empresaId: "empresa-1" }),
      ),
    );
  });

  it("eligiendo una empresa y luego 'Todo el holding', las métricas se vuelven a pedir sin empresaId", async () => {
    mockearAuth("ADMINISTRADOR", "holding");
    const user = userEvent.setup();
    renderPage("/panel");
    const boton = await screen.findByRole("combobox", { name: "Empresa" });
    await user.click(boton);
    await user.click(await screen.findByText("Empresa A"));
    await waitFor(() =>
      expect(fetchResumenMetricasApiMock).toHaveBeenCalledWith(
        expect.objectContaining({ empresaId: "empresa-1" }),
      ),
    );

    await user.click(boton);
    await user.click(await screen.findByText("Todo el holding"));

    await waitFor(() =>
      expect(fetchResumenMetricasApiMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ empresaId: undefined }),
      ),
    );
  });
});

describe("DashboardPage — regresión: el filtro de empresa NO es el mecanismo global de vista-empresa", () => {
  it("elegir una empresa en el Dashboard no cambia ?empresaId= en la URL", async () => {
    mockearAuth("ADMINISTRADOR", "holding");
    const user = userEvent.setup();
    const { getUrl } = renderPage("/panel");
    const boton = await screen.findByRole("combobox", { name: "Empresa" });
    await user.click(boton);
    await user.click(await screen.findByText("Empresa A"));

    await waitFor(() =>
      expect(fetchResumenMetricasApiMock).toHaveBeenCalledWith(
        expect.objectContaining({ empresaId: "empresa-1" }),
      ),
    );
    expect(getUrl()).toBe("");
  });

  it("elegir una empresa en el Dashboard nunca llama a entrarAEmpresa/salirDeEmpresa (`useVistaEmpresa`)", async () => {
    mockearAuth("ADMINISTRADOR", "holding");
    const user = userEvent.setup();
    renderPage("/panel");
    const boton = await screen.findByRole("combobox", { name: "Empresa" });
    await user.click(boton);
    await user.click(await screen.findByText("Empresa A"));

    await waitFor(() =>
      expect(fetchResumenMetricasApiMock).toHaveBeenCalledWith(
        expect.objectContaining({ empresaId: "empresa-1" }),
      ),
    );
    expect(entrarAEmpresaMock).not.toHaveBeenCalled();
    expect(salirDeEmpresaMock).not.toHaveBeenCalled();
  });
});
