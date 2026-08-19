import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
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
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const bridgesApi = await import("@/funcionalidades/bridges/bridges.api");
const { toast } = await import("sonner");
const { BridgeDetallePage } = await import("@/funcionalidades/bridges/detalle/BridgeDetallePage");

const fetchBridgeDetalleApiMock = vi.mocked(bridgesApi.fetchBridgeDetalleApi);
const toggleCuentaActivaApiMock = vi.mocked(bridgesApi.toggleCuentaActivaApi);
const fetchBridgeLogsApiMock = vi.mocked(bridgesApi.fetchBridgeLogsApi);
const toastSuccessMock = vi.mocked(toast.success);
const toastErrorMock = vi.mocked(toast.error);

/**
 * `redSocial: "LINKEDIN"` a propósito: el token/prueba de conexión POR
 * CUENTA (gap de contrato confirmado, ver `bridges.api.ts`) ya no vive en
 * `BridgeDetallePage` -- se movió a `CuentasPublicitariasList` y se prueba
 * en `tests/bridges/detalle/CuentasPublicitariasList.test.tsx`, con un
 * bridge FACEBOOK (único estilo con adaptador real conectado hoy).
 */
function bridgeFake(overrides: Partial<Bridge> = {}): Bridge {
  return {
    id: "bridge-1",
    redSocial: "LINKEDIN",
    nombre: "LinkedIn Lead Sync",
    estado: "ACTIVO",
    tokenExpiraEn: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    ultimoLeadEn: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    cuentasPublicitarias: [
      {
        id: "c1",
        bridgeId: "bridge-1",
        idExterno: "li-org-1",
        nombre: "LinkedIn Ads Empresa",
        instagramAccountId: null,
        activa: true,
        estadoToken: "VALIDO",
        tokenExpiraEn: null,
      },
    ],
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
  toastSuccessMock.mockReset();
  toastErrorMock.mockReset();
  fetchBridgeLogsApiMock.mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("BridgeDetallePage — encabezado", () => {
  it("muestra nombre, red social, estado, último lead recibido y expiración de token", async () => {
    fetchBridgeDetalleApiMock.mockResolvedValue(bridgeFake());
    renderBridgeDetallePage();

    expect(await screen.findByText("LinkedIn")).toBeInTheDocument();
    expect(screen.getByText("Activo")).toBeInTheDocument();
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
            idExterno: "li-org-1",
            nombre: "LinkedIn Ads Empresa",
            instagramAccountId: null,
            activa: true,
            estadoToken: "TOKEN_EXPIRADO",
            tokenExpiraEn: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          },
        ],
      }),
    );
    renderBridgeDetallePage();

    expect(await screen.findByText("LinkedIn Lead Sync necesita atención")).toBeInTheDocument();
  });

  it("no muestra ningún aviso para un bridge activo con actividad reciente", async () => {
    fetchBridgeDetalleApiMock.mockResolvedValue(bridgeFake());
    renderBridgeDetallePage();

    await screen.findByText("LinkedIn");
    expect(screen.queryByText(/necesita atención/)).not.toBeInTheDocument();
  });
});

describe("BridgeDetallePage — credenciales (a nivel de bridge)", () => {
  it("para un estilo TOKEN_PROVEEDOR, ya no muestra un formulario de token acá -- señala la sección de cuentas publicitarias", async () => {
    fetchBridgeDetalleApiMock.mockResolvedValue(bridgeFake());
    renderBridgeDetallePage();

    await screen.findByText("LinkedIn");
    expect(screen.queryByLabelText("Token")).not.toBeInTheDocument();
    expect(screen.getByText(/buscá la sección/i)).toBeInTheDocument();
  });
});

describe("BridgeDetallePage — cuentas publicitarias asociadas", () => {
  it("muestra las cuentas con su estado activo/inactivo y permite alternarlo", async () => {
    fetchBridgeDetalleApiMock.mockResolvedValue(bridgeFake());
    toggleCuentaActivaApiMock.mockResolvedValue({
      id: "c1",
      bridgeId: "bridge-1",
      idExterno: "li-org-1",
      nombre: "LinkedIn Ads Empresa",
      instagramAccountId: null,
      activa: false,
    });
    const user = userEvent.setup();
    renderBridgeDetallePage();

    expect(await screen.findByText("LinkedIn Ads Empresa")).toBeInTheDocument();
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
    await screen.findByText("LinkedIn");

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
