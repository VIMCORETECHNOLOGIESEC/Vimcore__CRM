import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Bridge } from "@/tipos/bridge";

vi.mock("@/funcionalidades/bridges/bridges.api", () => ({
  fetchBridgesApi: vi.fn(),
}));

const { fetchBridgesApi } = await import("@/funcionalidades/bridges/bridges.api");
const { BridgesPage } = await import("@/funcionalidades/bridges/BridgesPage");

const fetchBridgesApiMock = vi.mocked(fetchBridgesApi);

function bridgeFake(overrides: Partial<Bridge> = {}): Bridge {
  return {
    id: "bridge-1",
    redSocial: "FACEBOOK",
    nombre: "Meta Ads — Facebook",
    estado: "ACTIVO",
    tokenExpiraEn: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString(),
    ultimoLeadEn: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    cuentasPublicitarias: [{ id: "c1", idExterno: "act_1", nombre: "Cuenta", activa: true }],
    ...overrides,
  };
}

function renderBridgesPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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

  it("muestra «Nunca» y «No expira» cuando no hay último lead ni expiración", async () => {
    fetchBridgesApiMock.mockResolvedValue([
      bridgeFake({ ultimoLeadEn: null, tokenExpiraEn: null }),
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

  it("muestra un aviso destacado (con nombre del bridge) cuando el token expiró", async () => {
    fetchBridgesApiMock.mockResolvedValue([
      bridgeFake({ id: "bridge-li", nombre: "LinkedIn Lead Sync", estado: "TOKEN_EXPIRADO" }),
    ]);
    renderBridgesPage();

    expect(await screen.findByText("LinkedIn Lead Sync necesita atención")).toBeInTheDocument();
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
