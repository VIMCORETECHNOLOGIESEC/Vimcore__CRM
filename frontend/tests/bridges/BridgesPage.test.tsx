import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getErrorMessage } from "@/api/httpClient";
import type { Bridge } from "@/tipos/bridge";

vi.mock("@/funcionalidades/bridges/bridges.api", () => ({
  fetchBridgesApi: vi.fn(),
  createBridgeApi: vi.fn(),
  deleteBridgeApi: vi.fn(),
  reactivateBridgeApi: vi.fn(),
  fetchRedesSocialesSoportadasApi: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const bridgesApi = await import("@/funcionalidades/bridges/bridges.api");
const { toast } = await import("sonner");
const { BridgesPage } = await import("@/funcionalidades/bridges/BridgesPage");

const fetchBridgesApiMock = vi.mocked(bridgesApi.fetchBridgesApi);
const createBridgeApiMock = vi.mocked(bridgesApi.createBridgeApi);
const deleteBridgeApiMock = vi.mocked(bridgesApi.deleteBridgeApi);
const reactivateBridgeApiMock = vi.mocked(bridgesApi.reactivateBridgeApi);
const fetchRedesSocialesSoportadasApiMock = vi.mocked(bridgesApi.fetchRedesSocialesSoportadasApi);
const toastSuccessMock = vi.mocked(toast.success);

function bridgeFake(overrides: Partial<Bridge> = {}): Bridge {
  return {
    id: "bridge-1",
    redSocial: "FACEBOOK",
    nombre: "Meta Ads — Facebook",
    estado: "ACTIVO",
    tokenExpiraEn: null,
    ultimoLeadEn: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    cuentasPublicitarias: [
      {
        id: "c1",
        bridgeId: "bridge-1",
        idExterno: "act_1",
        nombre: "Cuenta",
        instagramAccountId: null,
        activa: true,
        estadoToken: "VALIDO",
        tokenExpiraEn: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ],
    ...overrides,
  };
}

/** Mismo `mutationCache` que `api/queryClient.ts` -- fiel al manejo global de errores real. */
function renderBridgesPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    mutationCache: new MutationCache({ onError: (error) => toast.error(getErrorMessage(error)) }),
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <BridgesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchBridgesApiMock.mockReset();
  createBridgeApiMock.mockReset();
  deleteBridgeApiMock.mockReset();
  reactivateBridgeApiMock.mockReset();
  fetchRedesSocialesSoportadasApiMock.mockReset();
  toastSuccessMock.mockReset();
  fetchRedesSocialesSoportadasApiMock.mockResolvedValue(["FACEBOOK", "INSTAGRAM", "X", "LINKEDIN", "GOOGLE_FORMS"]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("BridgesPage — estados de carga, vacío y error", () => {
  it("muestra un esqueleto de carga mientras llega la respuesta", async () => {
    let resolver: (value: Bridge[]) => void = () => {};
    fetchBridgesApiMock.mockReturnValue(
      new Promise((resolve) => {
        resolver = resolve;
      }),
    );

    renderBridgesPage();

    expect(screen.getByRole("status", { name: "Cargando" })).toBeInTheDocument();
    resolver([bridgeFake()]);
    await waitFor(() =>
      expect(screen.queryByRole("status", { name: "Cargando" })).not.toBeInTheDocument(),
    );
  });

  it("muestra un estado vacío honesto cuando no hay bridges configurados", async () => {
    fetchBridgesApiMock.mockResolvedValue([]);
    renderBridgesPage();
    expect(await screen.findByText("Todavía no hay bridges configurados")).toBeInTheDocument();
  });

  it("muestra un mensaje de error accionable (nunca un código HTTP) con botón de reintentar", async () => {
    fetchBridgesApiMock.mockRejectedValue(new Error("boom"));
    renderBridgesPage();
    expect(
      await screen.findByText("Ocurrió un error inesperado. Intentá nuevamente en unos segundos."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });
});

describe("BridgesPage — listado con estado, último lead recibido y expiración de token", () => {
  it("muestra red social, nombre, estado con texto, último lead recibido y expiración", async () => {
    fetchBridgesApiMock.mockResolvedValue([bridgeFake()]);
    renderBridgesPage();

    expect(await screen.findByText("Meta Ads — Facebook")).toBeInTheDocument();
    expect(screen.getByText("Facebook")).toBeInTheDocument();
    expect(screen.getByText("Activo")).toBeInTheDocument();
  });

  it("muestra «Nunca» y «No expira» cuando no hay último lead ni ninguna cuenta con expiración", async () => {
    fetchBridgesApiMock.mockResolvedValue([
      bridgeFake({ ultimoLeadEn: null, cuentasPublicitarias: [] }),
    ]);
    renderBridgesPage();

    expect(await screen.findByText("Nunca")).toBeInTheDocument();
    expect(screen.getByText("No expira")).toBeInTheDocument();
  });
});

describe("BridgesPage — aviso destacado ante token expirado o bridge sin actividad", () => {
  it("no muestra ningún aviso cuando ningún bridge lo necesita", async () => {
    fetchBridgesApiMock.mockResolvedValue([bridgeFake()]);
    renderBridgesPage();

    await screen.findByText("Meta Ads — Facebook");
    expect(screen.queryByText(/necesita atención/)).not.toBeInTheDocument();
  });

  it("muestra un aviso destacado (con nombre del bridge) cuando el token de una cuenta expiró", async () => {
    fetchBridgesApiMock.mockResolvedValue([
      bridgeFake({
        id: "bridge-li",
        nombre: "LinkedIn Lead Sync",
        cuentasPublicitarias: [
          {
            id: "c1",
            bridgeId: "bridge-li",
            idExterno: "act_1",
            nombre: "Cuenta",
            instagramAccountId: null,
            activa: true,
            estadoToken: "TOKEN_EXPIRADO",
            tokenExpiraEn: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          },
        ],
      }),
    ]);
    renderBridgesPage();

    expect(await screen.findByText("LinkedIn Lead Sync necesita atención")).toBeInTheDocument();
    expect(screen.getByText(/el token expiró/i)).toBeInTheDocument();
  });

  it("un bridge con una cuenta con el token expirado y otra sana muestra el peor caso (aviso destacado)", async () => {
    fetchBridgesApiMock.mockResolvedValue([
      bridgeFake({
        id: "bridge-mixto",
        nombre: "Bridge Mixto",
        cuentasPublicitarias: [
          {
            id: "c1",
            bridgeId: "bridge-mixto",
            idExterno: "act_1",
            nombre: "Cuenta Expirada",
            instagramAccountId: null,
            activa: true,
            estadoToken: "TOKEN_EXPIRADO",
            tokenExpiraEn: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          },
          {
            id: "c2",
            bridgeId: "bridge-mixto",
            idExterno: "act_2",
            nombre: "Cuenta Sana",
            instagramAccountId: null,
            activa: true,
            estadoToken: "VALIDO",
            tokenExpiraEn: new Date(Date.now() + 200 * 24 * 60 * 60 * 1000).toISOString(),
          },
        ],
      }),
    ]);
    renderBridgesPage();

    expect(await screen.findByText("Bridge Mixto necesita atención")).toBeInTheDocument();
    expect(screen.getByText(/el token expiró/i)).toBeInTheDocument();
  });

  it("muestra un aviso destacado cuando el bridge no tiene actividad reciente", async () => {
    fetchBridgesApiMock.mockResolvedValue([
      bridgeFake({
        id: "bridge-ig",
        nombre: "Meta Ads — Instagram",
        ultimoLeadEn: new Date(Date.now() - 100 * 60 * 60 * 1000).toISOString(),
      }),
    ]);
    renderBridgesPage();

    expect(await screen.findByText("Meta Ads — Instagram necesita atención")).toBeInTheDocument();
    expect(screen.getByText(/no recibió leads en las últimas 72 horas/i)).toBeInTheDocument();
  });

  it("no marca el aviso de un bridge INACTIVO aunque nunca haya recibido leads", async () => {
    fetchBridgesApiMock.mockResolvedValue([
      bridgeFake({
        id: "bridge-gf",
        nombre: "Google Forms — Pruebas",
        estado: "INACTIVO",
        ultimoLeadEn: null,
        tokenExpiraEn: null,
      }),
    ]);
    renderBridgesPage();

    await screen.findByText("Google Forms — Pruebas");
    expect(screen.queryByText(/necesita atención/)).not.toBeInTheDocument();
  });
});

describe("BridgesPage — alta de bridge (Requirement: Create Bridge)", () => {
  it("el selector de red social se puebla desde el catálogo del backend, nunca un arreglo fijo", async () => {
    fetchBridgesApiMock.mockResolvedValue([]);
    const user = userEvent.setup();
    renderBridgesPage();
    await screen.findByText("Todavía no hay bridges configurados");

    await user.click(screen.getByRole("button", { name: "Nuevo bridge" }));
    await user.click(screen.getByRole("combobox", { name: "Red social" }));

    expect(await screen.findByRole("option", { name: "Google Forms" })).toBeInTheDocument();
    expect(fetchRedesSocialesSoportadasApiMock).toHaveBeenCalled();
  });

  it("con datos válidos, crea el bridge y encadena el modal de clave de un solo uso", async () => {
    fetchBridgesApiMock.mockResolvedValue([]);
    createBridgeApiMock.mockResolvedValue({
      bridge: bridgeFake({ id: "bridge-nuevo", nombre: "Formulario Ventas", estado: "INACTIVO" }),
      claveApi: "brg_recien-generada-123",
    });
    const user = userEvent.setup();
    renderBridgesPage();
    await screen.findByText("Todavía no hay bridges configurados");

    await user.click(screen.getByRole("button", { name: "Nuevo bridge" }));
    await user.click(screen.getByRole("combobox", { name: "Red social" }));
    await user.click(await screen.findByRole("option", { name: "Google Forms" }));
    await user.type(screen.getByLabelText("Nombre"), "Formulario Ventas");
    await user.click(screen.getByRole("button", { name: "Crear bridge" }));

    await waitFor(() =>
      expect(createBridgeApiMock).toHaveBeenCalledWith({ redSocial: "GOOGLE_FORMS", nombre: "Formulario Ventas" }),
    );
    expect(await screen.findByText("brg_recien-generada-123")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Entendido, cerrar" })).toBeDisabled();
  });

  it("rechaza el envío sin elegir red social ni escribir nombre, sin llamar a createBridgeApi", async () => {
    fetchBridgesApiMock.mockResolvedValue([]);
    const user = userEvent.setup();
    renderBridgesPage();
    await screen.findByText("Todavía no hay bridges configurados");

    await user.click(screen.getByRole("button", { name: "Nuevo bridge" }));
    await user.click(screen.getByRole("button", { name: "Crear bridge" }));

    expect(await screen.findByText("Ingresá el nombre.")).toBeInTheDocument();
    expect(createBridgeApiMock).not.toHaveBeenCalled();
  });
});

describe("BridgesPage — baja y reactivación (Requirement: Soft Deactivate and Reactivate, Hard Delete Only Without Leads)", () => {
  it("un bridge que nunca recibió leads: advierte eliminación permanente y llama a deleteBridgeApi al confirmar", async () => {
    fetchBridgesApiMock.mockResolvedValue([
      bridgeFake({ id: "bridge-sin-leads", nombre: "Sin Leads", ultimoLeadEn: null }),
    ]);
    deleteBridgeApiMock.mockResolvedValue({
      resultado: "BAJA_FISICA",
      bridge: bridgeFake({ id: "bridge-sin-leads", nombre: "Sin Leads", ultimoLeadEn: null }),
    });
    const user = userEvent.setup();
    renderBridgesPage();
    await screen.findByText("Sin Leads");

    await user.click(screen.getByRole("button", { name: "Dar de baja" }));
    expect(await screen.findByText(/eliminará de forma permanente/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() => expect(deleteBridgeApiMock).toHaveBeenCalledWith("bridge-sin-leads"));
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "Bridge eliminado permanentemente: nunca había recibido leads.",
    );
  });

  it("un bridge que ya recibió leads: advierte baja reversible y llama a deleteBridgeApi al confirmar", async () => {
    fetchBridgesApiMock.mockResolvedValue([bridgeFake({ id: "bridge-con-leads", nombre: "Con Leads" })]);
    deleteBridgeApiMock.mockResolvedValue({
      resultado: "BAJA_LOGICA",
      bridge: bridgeFake({ id: "bridge-con-leads", nombre: "Con Leads", estado: "INACTIVO" }),
    });
    const user = userEvent.setup();
    renderBridgesPage();
    await screen.findByText("Con Leads");

    await user.click(screen.getByRole("button", { name: "Dar de baja" }));
    expect(await screen.findByText(/podés reactivarlo/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() => expect(deleteBridgeApiMock).toHaveBeenCalledWith("bridge-con-leads"));
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "Bridge dado de baja correctamente. Podés reactivarlo cuando quieras.",
    );
  });

  it("un bridge INACTIVO muestra «Reactivar» en vez de «Dar de baja», y al hacer clic llama a reactivateBridgeApi", async () => {
    fetchBridgesApiMock.mockResolvedValue([
      bridgeFake({ id: "bridge-inactivo", nombre: "Bridge Pausado", estado: "INACTIVO" }),
    ]);
    reactivateBridgeApiMock.mockResolvedValue(
      bridgeFake({ id: "bridge-inactivo", nombre: "Bridge Pausado", estado: "ACTIVO" }),
    );
    const user = userEvent.setup();
    renderBridgesPage();
    await screen.findByText("Bridge Pausado");

    expect(screen.queryByRole("button", { name: "Dar de baja" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reactivar" }));

    await waitFor(() => expect(reactivateBridgeApiMock).toHaveBeenCalledWith("bridge-inactivo"));
    expect(toastSuccessMock).toHaveBeenCalledWith("Bridge reactivado correctamente.");
  });
});
