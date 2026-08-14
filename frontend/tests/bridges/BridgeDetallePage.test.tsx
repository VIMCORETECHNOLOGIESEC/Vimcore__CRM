import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, getErrorMessage } from "@/api/httpClient";
import type { Bridge, BridgeLog } from "@/tipos/bridge";

vi.mock("@/funcionalidades/bridges/bridges.api", () => ({
  fetchBridgeDetalleApi: vi.fn(),
  saveTokenApi: vi.fn(),
  testConnectionApi: vi.fn(),
  toggleCuentaActivaApi: vi.fn(),
  fetchBridgeLogsApi: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const bridgesApi = await import("@/funcionalidades/bridges/bridges.api");
const { toast } = await import("sonner");
const { BridgeDetallePage } = await import("@/funcionalidades/bridges/detalle/BridgeDetallePage");

const fetchBridgeDetalleApiMock = vi.mocked(bridgesApi.fetchBridgeDetalleApi);
const saveTokenApiMock = vi.mocked(bridgesApi.saveTokenApi);
const testConnectionApiMock = vi.mocked(bridgesApi.testConnectionApi);
const toggleCuentaActivaApiMock = vi.mocked(bridgesApi.toggleCuentaActivaApi);
const fetchBridgeLogsApiMock = vi.mocked(bridgesApi.fetchBridgeLogsApi);
const toastSuccessMock = vi.mocked(toast.success);
const toastErrorMock = vi.mocked(toast.error);

function bridgeFake(overrides: Partial<Bridge> = {}): Bridge {
  return {
    id: "bridge-1",
    redSocial: "LINKEDIN",
    nombre: "LinkedIn Lead Sync",
    estado: "ACTIVO",
    tokenExpiraEn: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    ultimoLeadEn: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    cuentasPublicitarias: [
      { id: "c1", idExterno: "li-org-1", nombre: "LinkedIn Ads Empresa", activa: true },
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
  saveTokenApiMock.mockReset();
  testConnectionApiMock.mockReset();
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

    expect(await screen.findByRole("heading", { name: "LinkedIn Lead Sync" })).toBeInTheDocument();
    expect(screen.getByText("LinkedIn")).toBeInTheDocument();
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
  it("muestra el aviso cuando el token expiró", async () => {
    fetchBridgeDetalleApiMock.mockResolvedValue(bridgeFake({ estado: "TOKEN_EXPIRADO" }));
    renderBridgeDetallePage();

    expect(await screen.findByText("LinkedIn Lead Sync necesita atención")).toBeInTheDocument();
  });

  it("no muestra ningún aviso para un bridge activo con actividad reciente", async () => {
    fetchBridgeDetalleApiMock.mockResolvedValue(bridgeFake());
    renderBridgeDetallePage();

    await screen.findByRole("heading", { name: "LinkedIn Lead Sync" });
    expect(screen.queryByText(/necesita atención/)).not.toBeInTheDocument();
  });
});

describe("BridgeDetallePage — token siempre vacío, verificación inmediata", () => {
  it("el campo de token arranca vacío, nunca precargado", async () => {
    fetchBridgeDetalleApiMock.mockResolvedValue(bridgeFake());
    renderBridgeDetallePage();

    await screen.findByRole("heading", { name: "LinkedIn Lead Sync" });
    expect(screen.getByLabelText("Token")).toHaveValue("");
  });

  it("con un token válido, llama a saveTokenApi con el bridgeId y el token, y vacía el campo al terminar", async () => {
    fetchBridgeDetalleApiMock.mockResolvedValue(bridgeFake());
    saveTokenApiMock.mockResolvedValue(bridgeFake({ estado: "ACTIVO" }));
    const user = userEvent.setup();
    renderBridgeDetallePage();
    await screen.findByRole("heading", { name: "LinkedIn Lead Sync" });

    await user.type(screen.getByLabelText("Token"), "un-token-bastante-largo-1234");
    await user.click(screen.getByRole("button", { name: "Guardar y verificar" }));

    await waitFor(() =>
      expect(saveTokenApiMock).toHaveBeenCalledWith("bridge-1", "un-token-bastante-largo-1234"),
    );
    expect(toastSuccessMock).toHaveBeenCalledWith("Token guardado y verificado correctamente.");
    await waitFor(() => expect(screen.getByLabelText("Token")).toHaveValue(""));
  });

  it("si la verificación inmediata rechaza el token, muestra el mensaje accionable del mock (no un código HTTP)", async () => {
    fetchBridgeDetalleApiMock.mockResolvedValue(bridgeFake());
    saveTokenApiMock.mockRejectedValue(
      new ApiError("token_invalido", 422, "El token no es válido. Verificá que lo copiaste completo desde la plataforma e intentá nuevamente."),
    );
    const user = userEvent.setup();
    renderBridgeDetallePage();
    await screen.findByRole("heading", { name: "LinkedIn Lead Sync" });

    await user.type(screen.getByLabelText("Token"), "corto");
    await user.click(screen.getByRole("button", { name: "Guardar y verificar" }));

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith(
        "El token no es válido. Verificá que lo copiaste completo desde la plataforma e intentá nuevamente.",
      ),
    );
  });

  it("rechaza el envío sin escribir ningún token, sin llamar a saveTokenApi", async () => {
    fetchBridgeDetalleApiMock.mockResolvedValue(bridgeFake());
    const user = userEvent.setup();
    renderBridgeDetallePage();
    await screen.findByRole("heading", { name: "LinkedIn Lead Sync" });

    await user.click(screen.getByRole("button", { name: "Guardar y verificar" }));

    expect(await screen.findByText("Ingresá el token.")).toBeInTheDocument();
    expect(saveTokenApiMock).not.toHaveBeenCalled();
  });
});

describe("BridgeDetallePage — prueba de conexión", () => {
  it("al hacer clic, llama a testConnectionApi y muestra el resultado en pantalla", async () => {
    fetchBridgeDetalleApiMock.mockResolvedValue(bridgeFake());
    testConnectionApiMock.mockResolvedValue({ ok: true, mensaje: "Conexión verificada correctamente." });
    const user = userEvent.setup();
    renderBridgeDetallePage();
    await screen.findByRole("heading", { name: "LinkedIn Lead Sync" });

    await user.click(screen.getByRole("button", { name: "Probar conexión" }));

    await waitFor(() => expect(testConnectionApiMock).toHaveBeenCalledWith("bridge-1"));
    expect(await screen.findByText("Conexión verificada correctamente.")).toBeInTheDocument();
  });

  it("muestra el mensaje de fallo cuando la prueba de conexión no es exitosa", async () => {
    fetchBridgeDetalleApiMock.mockResolvedValue(bridgeFake({ estado: "TOKEN_EXPIRADO" }));
    testConnectionApiMock.mockResolvedValue({
      ok: false,
      mensaje: "El token expiró. Cargá uno nuevo antes de volver a probar la conexión.",
    });
    const user = userEvent.setup();
    renderBridgeDetallePage();
    await screen.findByRole("heading", { name: "LinkedIn Lead Sync" });

    await user.click(screen.getByRole("button", { name: "Probar conexión" }));

    expect(
      await screen.findByText("El token expiró. Cargá uno nuevo antes de volver a probar la conexión."),
    ).toBeInTheDocument();
  });
});

describe("BridgeDetallePage — cuentas publicitarias asociadas", () => {
  it("muestra las cuentas con su estado activo/inactivo y permite alternarlo", async () => {
    fetchBridgeDetalleApiMock.mockResolvedValue(bridgeFake());
    toggleCuentaActivaApiMock.mockResolvedValue(
      bridgeFake({
        cuentasPublicitarias: [
          { id: "c1", idExterno: "li-org-1", nombre: "LinkedIn Ads Empresa", activa: false },
        ],
      }),
    );
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
    await screen.findByRole("heading", { name: "LinkedIn Lead Sync" });

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
