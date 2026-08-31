import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/httpClient";

/**
 * `LinkedInCallbackPage` -- Paso 2 (`GET /integraciones/linkedin/oauth/callback`,
 * público) del flujo OAuth de LinkedIn Lead Sync (contrato, paso 2). A
 * diferencia de `WhatsAppCallbackPage`, LinkedIn completa la conexión de
 * punta a punta en este único paso (sin Paso 3 encadenado): el callback ya
 * devuelve `conexion` activa. Mismo patrón de mocks que
 * `tests/whatsapp/WhatsAppCallbackPage.test.tsx`.
 */
vi.mock("@/funcionalidades/linkedin/linkedin.api", () => ({
  fetchLinkedInCallbackApi: vi.fn(),
}));
vi.mock("@/funcionalidades/linkedin/linkedin.utils", () => ({
  leerYLimpiarBridgeIdFlujo: vi.fn(),
}));

const { fetchLinkedInCallbackApi } = await import("@/funcionalidades/linkedin/linkedin.api");
const { leerYLimpiarBridgeIdFlujo } = await import("@/funcionalidades/linkedin/linkedin.utils");
const { LinkedInCallbackPage } = await import("@/funcionalidades/linkedin/LinkedInCallbackPage");

const fetchLinkedInCallbackApiMock = vi.mocked(fetchLinkedInCallbackApi);
const leerYLimpiarBridgeIdFlujoMock = vi.mocked(leerYLimpiarBridgeIdFlujo);

function conexionFake(overrides: Partial<Awaited<ReturnType<typeof fetchLinkedInCallbackApi>>> = {}) {
  return {
    id: "conexion-1",
    bridgeId: "bridge-7",
    estado: "ACTIVA" as const,
    accessTokenExpiraEn: "2026-09-30T10:00:00.000Z",
    refreshTokenExpiraEn: null,
    scopes: ["r_ads", "r_ads_reporting"],
    tieneRefreshToken: true,
    fuentes: [],
    ...overrides,
  };
}

function MarcadorBridge() {
  const location = useLocation();
  return <span>Marcador: volvimos al bridge {location.pathname}</span>;
}

function renderConRuta(queryString: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/linkedin/callback${queryString}`]}>
        <Routes>
          <Route path="/linkedin/callback" element={<LinkedInCallbackPage />} />
          <Route path="/bridges/:id" element={<MarcadorBridge />} />
          <Route path="/bridges" element={<span>Marcador: volvimos al listado de bridges</span>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchLinkedInCallbackApiMock.mockReset();
  leerYLimpiarBridgeIdFlujoMock.mockReset();
  leerYLimpiarBridgeIdFlujoMock.mockReturnValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LinkedInCallbackPage — carga y reenvío de parámetros", () => {
  it("muestra un esqueleto de carga mientras llega la respuesta del callback", async () => {
    let resolver: (value: unknown) => void = () => {};
    fetchLinkedInCallbackApiMock.mockReturnValue(new Promise((resolve) => (resolver = resolve)));

    renderConRuta("?code=abc&state=xyz");

    expect(screen.getByRole("status", { name: "Cargando" })).toBeInTheDocument();
    resolver(conexionFake());
    await waitFor(() =>
      expect(screen.queryByRole("status", { name: "Cargando" })).not.toBeInTheDocument(),
    );
  });

  it("reenvía code/state tal cual desde la URL al backend", async () => {
    fetchLinkedInCallbackApiMock.mockResolvedValue(conexionFake());
    renderConRuta("?code=abc123&state=xyz789");

    await waitFor(() =>
      expect(fetchLinkedInCallbackApiMock).toHaveBeenCalledWith({
        code: "abc123",
        state: "xyz789",
        error: undefined,
        errorDescription: undefined,
      }),
    );
  });

  it("reenvía error/error_description en caso de cancelación en LinkedIn", async () => {
    fetchLinkedInCallbackApiMock.mockResolvedValue(conexionFake());
    renderConRuta("?error=user_cancelled_authorize&error_description=El+admin+canceló&state=xyz");

    await waitFor(() =>
      expect(fetchLinkedInCallbackApiMock).toHaveBeenCalledWith({
        code: undefined,
        state: "xyz",
        error: "user_cancelled_authorize",
        errorDescription: "El admin canceló",
      }),
    );
  });
});

describe("LinkedInCallbackPage — éxito", () => {
  it("muestra la confirmación con los scopes y un botón para volver al bridge de origen", async () => {
    fetchLinkedInCallbackApiMock.mockResolvedValue(conexionFake({ bridgeId: "bridge-7" }));
    const user = userEvent.setup();
    renderConRuta("?code=abc&state=xyz");

    expect(await screen.findByText(/linkedin conectado/i)).toBeInTheDocument();
    expect(screen.getByText(/r_ads, r_ads_reporting/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Volver al bridge" }));

    expect(await screen.findByText(/volvimos al bridge \/bridges\/bridge-7/)).toBeInTheDocument();
  });
});

describe("LinkedInCallbackPage — error", () => {
  it("un error del backend (ej. state inválido/vencido) muestra un mensaje accionable", async () => {
    fetchLinkedInCallbackApiMock.mockRejectedValue(
      new ApiError("linkedin_oauth_state_invalido", 401, "El enlace de conexión venció. Volvé a intentarlo."),
    );
    renderConRuta("?code=abc&state=xyz");

    expect(
      await screen.findByText("El enlace de conexión venció. Volvé a intentarlo."),
    ).toBeInTheDocument();
  });

  it("en error, el botón vuelve al bridge de origen usando el bridgeId persistido del Paso 1 (la respuesta de error no trae conexion.bridgeId)", async () => {
    fetchLinkedInCallbackApiMock.mockRejectedValue(
      new ApiError("linkedin_oauth_cancelado", 400, "Cancelaste la conexión con LinkedIn."),
    );
    leerYLimpiarBridgeIdFlujoMock.mockReturnValue("bridge-3");
    const user = userEvent.setup();
    renderConRuta("?error=user_cancelled_authorize&state=xyz");

    await screen.findByText("Cancelaste la conexión con LinkedIn.");
    await user.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByText(/volvimos al bridge \/bridges\/bridge-3/)).toBeInTheDocument();
  });

  it("sin ningún bridgeId persistido (ej. sessionStorage no disponible), vuelve al listado general de bridges", async () => {
    fetchLinkedInCallbackApiMock.mockRejectedValue(
      new ApiError("linkedin_oauth_callback_invalido", 400, "Faltan datos en la respuesta de LinkedIn."),
    );
    leerYLimpiarBridgeIdFlujoMock.mockReturnValue(undefined);
    const user = userEvent.setup();
    renderConRuta("?code=abc&state=xyz");

    await screen.findByText("Faltan datos en la respuesta de LinkedIn.");
    await user.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByText("Marcador: volvimos al listado de bridges")).toBeInTheDocument();
  });
});
