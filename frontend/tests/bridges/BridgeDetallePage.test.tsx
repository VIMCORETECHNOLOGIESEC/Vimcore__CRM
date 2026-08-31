import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getErrorMessage } from "@/api/httpClient";
import type { Bridge, BridgeLog } from "@/tipos/bridge";

vi.mock("@/funcionalidades/bridges/bridges.api", () => ({
  fetchBridgeDetalleApi: vi.fn(),
  toggleCuentaActivaApi: vi.fn(),
  fetchBridgeLogsApi: vi.fn(),
}));
// `BridgeDetallePage.tsx` importa `LinkedInIntegracionSection` de forma
// incondicional (el branch por `redSocial` es en render, no en el import) --
// se mockea acá para que las suites FACEBOOK de abajo no disparen ningún
// fetch real por accidente; el describe "LinkedIn Lead Sync" más abajo
// sobreescribe estos valores por test.
vi.mock("@/funcionalidades/linkedin/linkedin.api", () => ({
  fetchLinkedInConexionApi: vi.fn(),
  fetchLinkedInFuentesApi: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const bridgesApi = await import("@/funcionalidades/bridges/bridges.api");
const linkedinApi = await import("@/funcionalidades/linkedin/linkedin.api");
const { toast } = await import("sonner");
const { BridgeDetallePage } = await import("@/funcionalidades/bridges/detalle/BridgeDetallePage");

const fetchBridgeDetalleApiMock = vi.mocked(bridgesApi.fetchBridgeDetalleApi);
const toggleCuentaActivaApiMock = vi.mocked(bridgesApi.toggleCuentaActivaApi);
const fetchBridgeLogsApiMock = vi.mocked(bridgesApi.fetchBridgeLogsApi);
const fetchLinkedInConexionApiMock = vi.mocked(linkedinApi.fetchLinkedInConexionApi);
const fetchLinkedInFuentesApiMock = vi.mocked(linkedinApi.fetchLinkedInFuentesApi);
const toastSuccessMock = vi.mocked(toast.success);
const toastErrorMock = vi.mocked(toast.error);

/**
 * `redSocial: "FACEBOOK"` a propósito (cambiado desde "LINKEDIN" -- ver
 * `funcionalidades/linkedin/LinkedInIntegracionSection.tsx`, que ahora
 * reemplaza por completo estas dos secciones para un bridge LinkedIn real):
 * el token/prueba de conexión POR CUENTA (gap de contrato confirmado, ver
 * `bridges.api.ts`) ya no vive en `BridgeDetallePage` -- se movió a
 * `CuentasPublicitariasList` y se prueba en
 * `tests/bridges/detalle/CuentasPublicitariasList.test.tsx`, con Facebook
 * como único estilo con adaptador real de ESTE modelo (cuenta publicitaria)
 * conectado hoy. El describe "LinkedIn Lead Sync" más abajo cubre el branch
 * real de LinkedIn con su propio fixture.
 */
function bridgeFake(overrides: Partial<Bridge> = {}): Bridge {
  return {
    id: "bridge-1",
    redSocial: "FACEBOOK",
    nombre: "Facebook Ads Sync",
    estado: "ACTIVO",
    tokenExpiraEn: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    ultimoLeadEn: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    cuentasPublicitarias: [
      {
        id: "c1",
        bridgeId: "bridge-1",
        idExterno: "fb-page-1",
        nombre: "Facebook Ads Empresa",
        instagramAccountId: null,
        activa: true,
        estadoToken: "VALIDO",
        tokenExpiraEn: null,
      },
    ],
    ...overrides,
  };
}

/** Fixture de un bridge LinkedIn real (branch `LinkedInIntegracionSection`, sin cuentas publicitarias). */
function bridgeLinkedInFake(overrides: Partial<Bridge> = {}): Bridge {
  return {
    id: "bridge-2",
    redSocial: "LINKEDIN",
    nombre: "LinkedIn Lead Sync",
    estado: "ACTIVO",
    tokenExpiraEn: null,
    ultimoLeadEn: null,
    cuentasPublicitarias: [],
    ...overrides,
  };
}

function logFake(overrides: Partial<BridgeLog> = {}): BridgeLog {
  return {
    id: "log-1",
    bridgeId: "bridge-1",
    nivel: "ERROR",
    mensaje: "El token de acceso expiró.",
    ocurridoEn: new Date().toISOString(),
    ...overrides,
  };
}

/** Mismo `mutationCache` que `api/queryClient.ts` -- fiel al manejo global de errores real. */
function renderBridgeDetallePage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    mutationCache: new MutationCache({ onError: (error) => toast.error(getErrorMessage(error)) }),
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/bridges/bridge-1"]}>
        <Routes>
          <Route path="/bridges" element={<div>Listado de bridges</div>} />
          <Route path="/bridges/:id" element={<BridgeDetallePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchBridgeDetalleApiMock.mockReset();
  toggleCuentaActivaApiMock.mockReset();
  fetchBridgeLogsApiMock.mockReset();
  fetchLinkedInConexionApiMock.mockReset();
  fetchLinkedInFuentesApiMock.mockReset();
  toastSuccessMock.mockReset();
  toastErrorMock.mockReset();
  fetchBridgeLogsApiMock.mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("BridgeDetallePage — encabezado", () => {
  it("muestra un resumen operativo con red social, estado y metadatos de sincronización", async () => {
    fetchBridgeDetalleApiMock.mockResolvedValue(bridgeFake());
    renderBridgeDetallePage();

    expect(await screen.findByRole("heading", { name: "Sincronización de Facebook" })).toBeInTheDocument();
    expect(screen.getByText("Activo")).toBeInTheDocument();
    expect(screen.getByText("Último lead recibido")).toBeInTheDocument();
    expect(screen.getByText("Expiración de token más próxima")).toBeInTheDocument();
  });

  it("muestra un mensaje de error accionable si el bridge no existe", async () => {
    fetchBridgeDetalleApiMock.mockRejectedValue(new Error("boom"));
    renderBridgeDetallePage();

    expect(
      await screen.findByText("Ocurrió un error inesperado. Intentá nuevamente en unos segundos."),
    ).toBeInTheDocument();
  });
});

describe("BridgeDetallePage — aviso destacado ante token expirado o sin actividad", () => {
  it("muestra el aviso cuando el token de una cuenta publicitaria expiró", async () => {
    fetchBridgeDetalleApiMock.mockResolvedValue(
      bridgeFake({
        cuentasPublicitarias: [
          {
            id: "c1",
            bridgeId: "bridge-1",
            idExterno: "fb-page-1",
            nombre: "Facebook Ads Empresa",
            instagramAccountId: null,
            activa: true,
            estadoToken: "TOKEN_EXPIRADO",
            tokenExpiraEn: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          },
        ],
      }),
    );
    renderBridgeDetallePage();

    expect(await screen.findByText("Facebook Ads Sync necesita atención")).toBeInTheDocument();
  });

  it("no muestra ningún aviso para un bridge activo con actividad reciente", async () => {
    fetchBridgeDetalleApiMock.mockResolvedValue(bridgeFake());
    renderBridgeDetallePage();

    await screen.findByRole("heading", { name: "Sincronización de Facebook" });
    expect(screen.queryByText(/necesita atención/)).not.toBeInTheDocument();
  });
});

describe("BridgeDetallePage — credenciales (a nivel de bridge)", () => {
  it("para un estilo TOKEN_PROVEEDOR, ya no muestra un formulario de token acá -- señala la sección de cuentas publicitarias", async () => {
    fetchBridgeDetalleApiMock.mockResolvedValue(bridgeFake());
    renderBridgeDetallePage();

    const seccionCredenciales = (
      await screen.findByRole("heading", { name: "Credenciales" })
    ).closest("section")!;
    // Facebook SÍ tiene un `TokenForm` real, pero a nivel de CUENTA
    // publicitaria (`CuentasPublicitariasList`, sección aparte) -- este test
    // solo verifica que la sección "Credenciales" A NIVEL DE BRIDGE no
    // renderiza uno propio, mismo criterio que antes del cambio de fixture.
    expect(within(seccionCredenciales).queryByLabelText("Token")).not.toBeInTheDocument();
    expect(within(seccionCredenciales).getByText(/buscá la sección/i)).toBeInTheDocument();
  });
});

describe("BridgeDetallePage — cuentas publicitarias asociadas", () => {
  it("muestra las cuentas con su estado activo/inactivo y permite alternarlo", async () => {
    fetchBridgeDetalleApiMock.mockResolvedValue(bridgeFake());
    toggleCuentaActivaApiMock.mockResolvedValue({
      id: "c1",
      bridgeId: "bridge-1",
      idExterno: "fb-page-1",
      nombre: "Facebook Ads Empresa",
      instagramAccountId: null,
      activa: false,
    });
    const user = userEvent.setup();
    renderBridgeDetallePage();

    expect(await screen.findByText("Facebook Ads Empresa")).toBeInTheDocument();
    expect(screen.getByText("Activa")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Desactivar" }));

    await waitFor(() =>
      expect(toggleCuentaActivaApiMock).toHaveBeenCalledWith("bridge-1", "c1", false),
    );
  });

  it("muestra un estado vacío cuando el bridge no tiene cuentas asociadas", async () => {
    fetchBridgeDetalleApiMock.mockResolvedValue(bridgeFake({ cuentasPublicitarias: [] }));
    renderBridgeDetallePage();

    expect(
      await screen.findByText("Sin cuentas publicitarias asociadas"),
    ).toBeInTheDocument();
  });
});

describe("BridgeDetallePage — bitácora de errores con filtro por nivel y fecha", () => {
  it("muestra las entradas de la bitácora con nivel y mensaje", async () => {
    fetchBridgeDetalleApiMock.mockResolvedValue(bridgeFake());
    fetchBridgeLogsApiMock.mockResolvedValue([logFake()]);
    renderBridgeDetallePage();

    expect(await screen.findByText("El token de acceso expiró.")).toBeInTheDocument();
  });

  it("al elegir un nivel, vuelve a consultar la bitácora con ese filtro", async () => {
    fetchBridgeDetalleApiMock.mockResolvedValue(bridgeFake());
    fetchBridgeLogsApiMock.mockResolvedValue([]);
    const user = userEvent.setup();
    renderBridgeDetallePage();
    await screen.findByRole("heading", { name: "Sincronización de Facebook" });

    await waitFor(() => expect(fetchBridgeLogsApiMock).toHaveBeenCalledWith("bridge-1", {}));

    await user.click(screen.getByRole("combobox", { name: "Nivel" }));
    await user.click(await screen.findByRole("option", { name: "Advertencia" }));

    await waitFor(() =>
      expect(fetchBridgeLogsApiMock).toHaveBeenCalledWith("bridge-1", { nivel: "ADVERTENCIA" }),
    );
  });

  it("muestra un estado vacío cuando no hay entradas para los filtros elegidos", async () => {
    fetchBridgeDetalleApiMock.mockResolvedValue(bridgeFake());
    fetchBridgeLogsApiMock.mockResolvedValue([]);
    renderBridgeDetallePage();

    expect(await screen.findByText("Sin entradas en la bitácora")).toBeInTheDocument();
  });
});

/**
 * Smoke-level a propósito: el comportamiento real de conexión/fuentes de
 * LinkedIn se prueba a fondo en
 * `tests/linkedin/LinkedInIntegracionSection.test.tsx` -- acá solo se
 * confirma que `BridgeDetallePage` elige el branch correcto según
 * `bridge.redSocial` (LinkedIn reemplaza Credenciales/Cuentas
 * publicitarias, nunca las muestra a la vez).
 */
describe("BridgeDetallePage — LinkedIn Lead Sync (branch por redSocial)", () => {
  it("para un bridge LINKEDIN, muestra la sección de LinkedIn Lead Sync en vez de Credenciales/Cuentas publicitarias", async () => {
    fetchBridgeDetalleApiMock.mockResolvedValue(bridgeLinkedInFake());
    fetchLinkedInConexionApiMock.mockResolvedValue(null);
    renderBridgeDetallePage();

    expect(await screen.findByRole("heading", { name: "LinkedIn Lead Sync" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Credenciales" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Cuentas publicitarias asociadas" }),
    ).not.toBeInTheDocument();
  });

  it("para un bridge no-LinkedIn (FACEBOOK), nunca muestra la sección de LinkedIn Lead Sync", async () => {
    fetchBridgeDetalleApiMock.mockResolvedValue(bridgeFake());
    renderBridgeDetallePage();

    await screen.findByRole("heading", { name: "Sincronización de Facebook" });
    expect(screen.queryByRole("heading", { name: "LinkedIn Lead Sync" })).not.toBeInTheDocument();
    expect(fetchLinkedInConexionApiMock).not.toHaveBeenCalled();
  });
});
