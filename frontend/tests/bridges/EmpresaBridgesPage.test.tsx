import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, getErrorMessage } from "@/api/httpClient";
import type { EmpresaAparienciaHoldingView } from "@/funcionalidades/empresa-apariencia/empresa-apariencia-holding.api";
import { PageHeaderProvider, usePageHeaderValue } from "@/layouts/PageHeaderContext";
import type { BridgesResponse } from "@/funcionalidades/bridges/bridges.api";
import type { Bridge } from "@/tipos/bridge";

vi.mock("@/funcionalidades/empresa-apariencia/empresa-apariencia-holding.api", () => ({
  fetchEmpresaHoldingApi: vi.fn(),
}));
vi.mock("@/funcionalidades/bridges/bridges.api", () => ({
  fetchBridgesApi: vi.fn(),
  createBridgeApi: vi.fn(),
  deleteBridgeApi: vi.fn(),
  reactivateBridgeApi: vi.fn(),
  fetchRedesSocialesSoportadasApi: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const empresaAparienciaHoldingApi = await import(
  "@/funcionalidades/empresa-apariencia/empresa-apariencia-holding.api"
);
const bridgesApi = await import("@/funcionalidades/bridges/bridges.api");
const { toast } = await import("sonner");
const { EmpresaBridgesPage } = await import("@/funcionalidades/bridges/EmpresaBridgesPage");

const fetchEmpresaHoldingApiMock = vi.mocked(empresaAparienciaHoldingApi.fetchEmpresaHoldingApi);
const fetchBridgesApiMock = vi.mocked(bridgesApi.fetchBridgesApi);
const createBridgeApiMock = vi.mocked(bridgesApi.createBridgeApi);
const fetchRedesSocialesSoportadasApiMock = vi.mocked(bridgesApi.fetchRedesSocialesSoportadasApi);
const toastSuccessMock = vi.mocked(toast.success);

function empresaFake(overrides: Partial<EmpresaAparienciaHoldingView> = {}): EmpresaAparienciaHoldingView {
  return {
    id: "e1",
    nombre: "Empresa A",
    colorPrimario: "#7c2d12",
    colorSecundario: "#f97316",
    logoUrl: null,
    ...overrides,
  };
}

function bridgeFake(overrides: Partial<Bridge> = {}): Bridge {
  return {
    id: "bridge-1",
    redSocial: "FACEBOOK",
    nombre: "Meta Ads — Facebook",
    estado: "ACTIVO",
    tokenExpiraEn: null,
    ultimoLeadEn: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    cuentasPublicitarias: [],
    ...overrides,
  };
}

function bridgesResponse(
  bridges: Bridge[],
  overrides: Partial<Omit<BridgesResponse, "bridges">> = {},
): BridgesResponse {
  return { bridges, total: bridges.length, pagina: 1, limite: 10, ...overrides };
}

/** Expone el header publicado por la página en un `data-testid`, mismo criterio que `Header.test.tsx`. */
function EncabezadoDebug() {
  const header = usePageHeaderValue();
  return (
    <div data-testid="encabezado-debug">
      {header ? `${header.title}|${header.backTo?.label ?? ""}|${header.backTo?.href ?? ""}` : ""}
    </div>
  );
}

function renderPage(rutaInicial = "/empresas/e1/bridges") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    mutationCache: new MutationCache({ onError: (error) => toast.error(getErrorMessage(error)) }),
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[rutaInicial]}>
        <PageHeaderProvider>
          <EncabezadoDebug />
          <Routes>
            <Route path="/empresas/:empresaId/bridges" element={<EmpresaBridgesPage />} />
          </Routes>
        </PageHeaderProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchEmpresaHoldingApiMock.mockReset();
  fetchEmpresaHoldingApiMock.mockResolvedValue(empresaFake());
  fetchBridgesApiMock.mockReset();
  createBridgeApiMock.mockReset();
  fetchRedesSocialesSoportadasApiMock.mockReset();
  fetchRedesSocialesSoportadasApiMock.mockResolvedValue(["FACEBOOK", "INSTAGRAM", "X", "LINKEDIN", "GOOGLE_FORMS"]);
  toastSuccessMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("EmpresaBridgesPage — empresa puntual (empresaId fijo por la ruta, NO useVistaEmpresa)", () => {
  it("muestra un estado de carga mientras se resuelve la empresa", () => {
    fetchEmpresaHoldingApiMock.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByRole("status", { name: "Cargando" })).toBeInTheDocument();
  });

  it("muestra un mensaje accionable con botón de reintentar si falla la carga de la empresa", async () => {
    fetchEmpresaHoldingApiMock.mockRejectedValue(
      new ApiError("empresa_no_encontrada", 404, "La empresa indicada no existe"),
    );
    renderPage();

    expect(await screen.findByText("La empresa indicada no existe")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });

  it("publica el título «Bridges de {empresa}» con el breadcrumb de vuelta al detalle de esa empresa", async () => {
    fetchEmpresaHoldingApiMock.mockResolvedValue(empresaFake({ id: "e1", nombre: "Empresa A" }));
    fetchBridgesApiMock.mockResolvedValue(bridgesResponse([]));
    renderPage();

    await waitFor(() =>
      expect(screen.getByTestId("encabezado-debug")).toHaveTextContent(
        "Bridges de Empresa A|Empresa A|/empresas/e1",
      ),
    );
  });

  it("lista los bridges de la empresa del path (fetchBridgesApi recibe `empresaId: e1`), sin depender del query string", async () => {
    fetchBridgesApiMock.mockResolvedValue(bridgesResponse([bridgeFake()]));
    renderPage();

    expect(await screen.findByText("Meta Ads — Facebook")).toBeInTheDocument();
    expect(fetchBridgesApiMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ empresaId: "e1" }),
    );
  });

  it("muestra un estado vacío distinto (menciona la empresa) cuando no hay bridges", async () => {
    fetchBridgesApiMock.mockResolvedValue(bridgesResponse([]));
    renderPage();

    expect(
      await screen.findByText("Todavía no hay bridges configurados en esta empresa"),
    ).toBeInTheDocument();
  });

  it("muestra un mensaje de error accionable si falla el listado de bridges", async () => {
    fetchBridgesApiMock.mockRejectedValue(new Error("boom"));
    renderPage();

    expect(
      await screen.findByText("Ocurrió un error inesperado. Intentá nuevamente en unos segundos."),
    ).toBeInTheDocument();
  });

  it("no monta `ConectarWhatsAppCard` (decisión de diseño: esa tarjeta depende de `useVistaEmpresa`, no del `empresaId` de esta ruta)", async () => {
    fetchBridgesApiMock.mockResolvedValue(bridgesResponse([]));
    renderPage();

    await screen.findByText("Todavía no hay bridges configurados en esta empresa");
    expect(screen.queryByText("WhatsApp Business")).not.toBeInTheDocument();
  });

  it("con una empresa distinta en la URL (e2), fetchBridgesApi recibe `empresaId: e2`", async () => {
    fetchEmpresaHoldingApiMock.mockResolvedValue(empresaFake({ id: "e2", nombre: "Empresa B" }));
    fetchBridgesApiMock.mockResolvedValue(bridgesResponse([]));
    renderPage("/empresas/e2/bridges");

    await waitFor(() => {
      expect(fetchBridgesApiMock.mock.calls.at(-1)?.[0]).toEqual(
        expect.objectContaining({ empresaId: "e2" }),
      );
    });
  });
});

describe("EmpresaBridgesPage — alta de bridge siempre manda el empresaId fijo de la ruta", () => {
  it("con datos válidos, llama a createBridgeApi con `empresaId: e1` sin condicionarlo a ningún query param", async () => {
    fetchBridgesApiMock.mockResolvedValue(bridgesResponse([]));
    createBridgeApiMock.mockResolvedValue({
      bridge: bridgeFake({ id: "bridge-nuevo", nombre: "Formulario Ventas", estado: "INACTIVO" }),
      claveApi: "brg_recien-generada-123",
    });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Todavía no hay bridges configurados en esta empresa");

    await user.click(screen.getByRole("button", { name: "Nuevo bridge" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("combobox", { name: "Red social" }));
    await user.click(await screen.findByRole("option", { name: "Google Forms" }));
    await user.type(within(dialog).getByLabelText("Nombre"), "Formulario Ventas");
    await user.click(within(dialog).getByRole("button", { name: "Crear bridge" }));

    await waitFor(() =>
      expect(createBridgeApiMock).toHaveBeenCalledWith({
        redSocial: "GOOGLE_FORMS",
        nombre: "Formulario Ventas",
        empresaId: "e1",
      }),
    );
    expect(toastSuccessMock).not.toHaveBeenCalled(); // el toast de éxito lo dispara el cierre de `ClaveBridgeModal`, no la sola creación (mismo criterio que `BridgesPage.tsx`).
  });

  it("el alta de API_EXTERNA también manda `empresaId: e1`", async () => {
    fetchBridgesApiMock.mockResolvedValue(bridgesResponse([]));
    createBridgeApiMock.mockResolvedValue({
      bridge: bridgeFake({
        id: "bridge-api-externa-1",
        redSocial: "API_EXTERNA",
        nombre: "Sistema de reservas",
        estado: "INACTIVO",
        cuentasPublicitarias: [],
      }),
      claveApi: "brg_clave-api-externa-1",
    });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Todavía no hay bridges configurados en esta empresa");

    await user.click(screen.getByRole("button", { name: "Nuevo bridge" }));
    const dialogAlta = await screen.findByRole("dialog");
    await user.click(within(dialogAlta).getByRole("combobox", { name: "Red social" }));
    await user.click(await screen.findByRole("option", { name: "API externa" }));
    await user.type(within(dialogAlta).getByLabelText("Nombre"), "Sistema de reservas");
    await user.click(within(dialogAlta).getByRole("button", { name: "Configurar API" }));

    await waitFor(() =>
      expect(createBridgeApiMock).toHaveBeenCalledWith({
        redSocial: "API_EXTERNA",
        nombre: "Sistema de reservas",
        empresaId: "e1",
      }),
    );
  });
});
