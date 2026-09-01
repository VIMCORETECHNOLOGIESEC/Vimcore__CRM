import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getErrorMessage } from "@/api/httpClient";
import type { LinkedInConexion, LinkedInFuente } from "@/tipos/linkedin";

/**
 * `LinkedInIntegracionSection` -- pieza central de la integración real de
 * LinkedIn Lead Sync dentro de `BridgeDetallePage` (ver ese componente para
 * el smoke test del branch por `redSocial`). Mismo patrón de mocks que
 * `tests/whatsapp/ConectarWhatsAppCard.test.tsx`: capa de datos y de
 * utilidades (redirect/sessionStorage) mockeadas, componente real.
 */
vi.mock("@/funcionalidades/linkedin/linkedin.api", () => ({
  iniciarOAuthLinkedInApi: vi.fn(),
  fetchLinkedInConexionApi: vi.fn(),
  probarConexionLinkedInApi: vi.fn(),
  fetchLinkedInFuentesApi: vi.fn(),
  descubrirFuentesLinkedInApi: vi.fn(),
  toggleFuenteLinkedInApi: vi.fn(),
}));
vi.mock("@/funcionalidades/linkedin/linkedin.utils", () => ({
  redirigirA: vi.fn(),
  guardarBridgeIdFlujo: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const linkedinApi = await import("@/funcionalidades/linkedin/linkedin.api");
const linkedinUtils = await import("@/funcionalidades/linkedin/linkedin.utils");
const { toast } = await import("sonner");
const { LinkedInIntegracionSection } = await import(
  "@/funcionalidades/linkedin/LinkedInIntegracionSection"
);

const iniciarOAuthLinkedInApiMock = vi.mocked(linkedinApi.iniciarOAuthLinkedInApi);
const fetchLinkedInConexionApiMock = vi.mocked(linkedinApi.fetchLinkedInConexionApi);
const probarConexionLinkedInApiMock = vi.mocked(linkedinApi.probarConexionLinkedInApi);
const fetchLinkedInFuentesApiMock = vi.mocked(linkedinApi.fetchLinkedInFuentesApi);
const descubrirFuentesLinkedInApiMock = vi.mocked(linkedinApi.descubrirFuentesLinkedInApi);
const toggleFuenteLinkedInApiMock = vi.mocked(linkedinApi.toggleFuenteLinkedInApi);
const redirigirAMock = vi.mocked(linkedinUtils.redirigirA);
const guardarBridgeIdFlujoMock = vi.mocked(linkedinUtils.guardarBridgeIdFlujo);

function conexionFake(overrides: Partial<LinkedInConexion> = {}): LinkedInConexion {
  return {
    id: "conexion-1",
    bridgeId: "bridge-1",
    estado: "ACTIVA",
    accessTokenExpiraEn: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    refreshTokenExpiraEn: null,
    scopes: ["r_ads", "r_ads_reporting"],
    tieneRefreshToken: true,
    fuentes: [],
    ...overrides,
  };
}

function fuenteFake(overrides: Partial<LinkedInFuente> = {}): LinkedInFuente {
  return {
    id: "fuente-1",
    tipo: "SPONSORED_ACCOUNT",
    ownerUrn: "urn:li:sponsoredAccount:123",
    nombre: "Cuenta patrocinada Empresa",
    tipoLead: "SPONSORED",
    activa: false,
    estadoSuscripcion: "PENDIENTE",
    ultimaSincronizacionEn: null,
    ...overrides,
  };
}

/** Mismo `mutationCache` que `api/queryClient.ts` -- fiel al manejo global de errores real. */
function renderSeccion(bridgeId = "bridge-1") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    mutationCache: new MutationCache({ onError: (error) => toast.error(getErrorMessage(error)) }),
  });
  return render(
    <QueryClientProvider client={client}>
      <LinkedInIntegracionSection bridgeId={bridgeId} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  iniciarOAuthLinkedInApiMock.mockReset();
  fetchLinkedInConexionApiMock.mockReset();
  probarConexionLinkedInApiMock.mockReset();
  fetchLinkedInFuentesApiMock.mockReset();
  descubrirFuentesLinkedInApiMock.mockReset();
  toggleFuenteLinkedInApiMock.mockReset();
  redirigirAMock.mockReset();
  guardarBridgeIdFlujoMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LinkedInIntegracionSection — sin conexión (Paso 1)", () => {
  it("sin ninguna conexión, muestra el mensaje inicial y el botón «Conectar LinkedIn»", async () => {
    fetchLinkedInConexionApiMock.mockResolvedValue(null);
    renderSeccion();

    expect(
      await screen.findByText(/todavía no tiene ninguna conexión de linkedin establecida/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Conectar LinkedIn" })).toBeInTheDocument();
    // Sin conexión ACTIVA, "Probar conexión" no tiene sentido -- no debe aparecer.
    expect(screen.queryByRole("button", { name: "Probar conexión" })).not.toBeInTheDocument();
  });

  it("al hacer click, inicia el Paso 1, persiste el bridgeId y redirige a la authorizationUrl", async () => {
    fetchLinkedInConexionApiMock.mockResolvedValue(null);
    iniciarOAuthLinkedInApiMock.mockResolvedValue({
      authorizationUrl: "https://linkedin.example/oauth",
      expiraEn: "2026-08-30T10:00:00.000Z",
    });
    const user = userEvent.setup();
    renderSeccion("bridge-9");

    await user.click(await screen.findByRole("button", { name: "Conectar LinkedIn" }));

    expect(iniciarOAuthLinkedInApiMock).toHaveBeenCalledWith("bridge-9");
    await waitFor(() => expect(redirigirAMock).toHaveBeenCalledWith("https://linkedin.example/oauth"));
    expect(guardarBridgeIdFlujoMock).toHaveBeenCalledWith("bridge-9");
  });
});

describe("LinkedInIntegracionSection — conexión activa", () => {
  it("muestra el estado «Conectado», los scopes, y el botón «Probar conexión» (nunca «Conectar LinkedIn»)", async () => {
    fetchLinkedInConexionApiMock.mockResolvedValue(conexionFake());
    fetchLinkedInFuentesApiMock.mockResolvedValue([]);
    renderSeccion();

    expect(await screen.findByText("Conectado")).toBeInTheDocument();
    expect(screen.getByText(/r_ads, r_ads_reporting/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Probar conexión" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Conectar LinkedIn" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reconectar LinkedIn" })).not.toBeInTheDocument();
  });

  it("al hacer click en «Probar conexión», muestra el resultado devuelto por el backend", async () => {
    fetchLinkedInConexionApiMock.mockResolvedValue(conexionFake());
    fetchLinkedInFuentesApiMock.mockResolvedValue([]);
    probarConexionLinkedInApiMock.mockResolvedValue({
      conectado: true,
      verificadoEn: "2026-08-30T10:00:00.000Z",
    });
    const user = userEvent.setup();
    renderSeccion();

    await user.click(await screen.findByRole("button", { name: "Probar conexión" }));

    expect(probarConexionLinkedInApiMock).toHaveBeenCalledWith("bridge-1");
    expect(await screen.findByText("Conexión verificada correctamente")).toBeInTheDocument();
  });
});

describe("LinkedInIntegracionSection — conexión que requiere reconexión", () => {
  it.each([["TOKEN_EXPIRADO"], ["REVOCADA"], ["ERROR"]] as const)(
    "con estado %s, muestra «Reconectar LinkedIn» y oculta «Probar conexión»",
    async (estado) => {
      fetchLinkedInConexionApiMock.mockResolvedValue(conexionFake({ estado }));
      renderSeccion();

      expect(await screen.findByRole("button", { name: "Reconectar LinkedIn" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Probar conexión" })).not.toBeInTheDocument();
      // Sin conexión ACTIVA, la sección de fuentes tampoco se consulta.
      expect(fetchLinkedInFuentesApiMock).not.toHaveBeenCalled();
    },
  );
});

describe("LinkedInIntegracionSection — fuentes (conexión activa)", () => {
  it("sin fuentes descubiertas, muestra el estado vacío", async () => {
    fetchLinkedInConexionApiMock.mockResolvedValue(conexionFake());
    fetchLinkedInFuentesApiMock.mockResolvedValue([]);
    renderSeccion();

    expect(await screen.findByText("Sin fuentes descubiertas todavía")).toBeInTheDocument();
  });

  it("al hacer click en «Descubrir fuentes», llama al endpoint y muestra las fuentes devueltas", async () => {
    fetchLinkedInConexionApiMock.mockResolvedValue(conexionFake());
    fetchLinkedInFuentesApiMock.mockResolvedValue([]);
    descubrirFuentesLinkedInApiMock.mockResolvedValue([fuenteFake()]);
    const user = userEvent.setup();
    renderSeccion();

    await screen.findByText("Sin fuentes descubiertas todavía");
    await user.click(screen.getByRole("button", { name: "Descubrir fuentes" }));

    expect(descubrirFuentesLinkedInApiMock).toHaveBeenCalledWith("bridge-1");
    expect(await screen.findByText("Cuenta patrocinada Empresa")).toBeInTheDocument();
  });

  it("el toggle de una fuente NO es optimista: mientras la mutación está pendiente muestra «Procesando…» sin cambiar el estado, y solo lo actualiza cuando el servidor responde", async () => {
    fetchLinkedInConexionApiMock.mockResolvedValue(conexionFake());
    fetchLinkedInFuentesApiMock.mockResolvedValue([fuenteFake({ activa: false, estadoSuscripcion: "PENDIENTE" })]);

    let resolverToggle: (fuente: LinkedInFuente) => void = () => {};
    toggleFuenteLinkedInApiMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolverToggle = resolve;
        }),
    );

    const user = userEvent.setup();
    renderSeccion();

    const botonActivar = await screen.findByRole("button", { name: "Activar" });
    await user.click(botonActivar);

    // Pendiente: "Procesando…", pero el estado sigue diciendo "Deshabilitada" --
    // NO cambia por adelantado a "Habilitada" antes de la confirmación real.
    expect(await screen.findByRole("button", { name: "Procesando…" })).toBeInTheDocument();
    expect(screen.getByText("Deshabilitada")).toBeInTheDocument();
    expect(screen.getByText("Pendiente")).toBeInTheDocument();

    resolverToggle(fuenteFake({ activa: true, estadoSuscripcion: "ACTIVA" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Desactivar" })).toBeInTheDocument());
    expect(screen.getByText("Habilitada")).toBeInTheDocument();
    expect(screen.getByText("Activa")).toBeInTheDocument();
  });

  it("si activar una fuente falla del lado de LinkedIn, muestra un mensaje accionable (nunca un código HTTP)", async () => {
    fetchLinkedInConexionApiMock.mockResolvedValue(conexionFake());
    fetchLinkedInFuentesApiMock.mockResolvedValue([fuenteFake()]);
    toggleFuenteLinkedInApiMock.mockRejectedValue(
      new Error("No se pudo activar la fuente en LinkedIn. Intenta nuevamente."),
    );
    const user = userEvent.setup();
    renderSeccion();

    await user.click(await screen.findByRole("button", { name: "Activar" }));

    expect(toast.error).toHaveBeenCalledWith(
      "Ocurrió un error inesperado. Intenta nuevamente en unos segundos.",
    );
  });
});

describe("LinkedInIntegracionSection — errores del Paso 1", () => {
  it("token expirado/reconexión requerida: muestra un mensaje específico de reconexión, no el genérico", async () => {
    const { ApiError } = await import("@/api/httpClient");
    fetchLinkedInConexionApiMock.mockResolvedValue(conexionFake({ estado: "TOKEN_EXPIRADO" }));
    iniciarOAuthLinkedInApiMock.mockRejectedValue(
      new ApiError("linkedin_token_expirado", 409, "El access token venció."),
    );
    const user = userEvent.setup();
    renderSeccion();

    await user.click(await screen.findByRole("button", { name: "Reconectar LinkedIn" }));

    expect(
      await screen.findByText("La conexión con LinkedIn venció y necesita reconectarse."),
    ).toBeInTheDocument();
  });
});
