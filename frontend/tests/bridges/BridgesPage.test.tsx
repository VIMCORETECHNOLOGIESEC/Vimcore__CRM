import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getErrorMessage } from "@/api/httpClient";
import type { BridgesResponse } from "@/funcionalidades/bridges/bridges.api";
import type { Bridge } from "@/tipos/bridge";

vi.mock("@/funcionalidades/bridges/bridges.api", () => ({
  fetchBridgesApi: vi.fn(),
  createBridgeApi: vi.fn(),
  deleteBridgeApi: vi.fn(),
  reactivateBridgeApi: vi.fn(),
  fetchRedesSocialesSoportadasApi: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// `BridgesPage` monta `ConectarWhatsAppCard` de forma aditiva (flujo de
// conexión de WhatsApp Business, ver `funcionalidades/whatsapp/`), que
// necesita `useAuth()` -- mockeado acá con una sesión `company` estable
// (mismo patrón que `tests/layouts/SalirVistaEmpresaButton.test.tsx`) para
// no exigir un `<AuthProvider>` real en estos tests, que nunca interactúan
// con esa tarjeta. `whatsapp.api`/`whatsapp.utils` quedan sin mockear a
// propósito: ningún test de este archivo hace click en "Conectar WhatsApp",
// así que su `useMutation` nunca dispara una llamada real.
vi.mock("@/funcionalidades/autenticacion/authContext", () => ({
  useAuth: () => ({ user: { sessionScope: "company", rol: "ADMINISTRADOR" } }),
}));

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

/** Envoltura de la respuesta paginada real (F8, breaking change) -- por defecto asume que `bridges` es la página completa. */
function bridgesResponse(
  bridges: Bridge[],
  overrides: Partial<Omit<BridgesResponse, "bridges">> = {},
): BridgesResponse {
  return { bridges, total: bridges.length, pagina: 1, limite: 10, ...overrides };
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

async function abrirFiltros(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Filtros" }));
}

async function abrirMenuAcciones(user: ReturnType<typeof userEvent.setup>, nombre: string) {
  await user.click(screen.getByRole("button", { name: `Acciones de ${nombre}` }));
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
    let resolver: (value: BridgesResponse) => void = () => {};
    fetchBridgesApiMock.mockReturnValue(
      new Promise((resolve) => {
        resolver = resolve;
      }),
    );

    renderBridgesPage();

    expect(screen.getByRole("status", { name: "Cargando" })).toBeInTheDocument();
    resolver(bridgesResponse([bridgeFake()]));
    await waitFor(() =>
      expect(screen.queryByRole("status", { name: "Cargando" })).not.toBeInTheDocument(),
    );
  });

  it("muestra un estado vacío honesto cuando no hay bridges configurados", async () => {
    fetchBridgesApiMock.mockResolvedValue(bridgesResponse([]));
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
    fetchBridgesApiMock.mockResolvedValue(bridgesResponse([bridgeFake()]));
    renderBridgesPage();

    expect(await screen.findByText("Meta Ads — Facebook")).toBeInTheDocument();
    expect(screen.getByText("Facebook")).toBeInTheDocument();
    expect(screen.getByText("Activo")).toBeInTheDocument();
  });

  it("muestra «Nunca» y «No expira» cuando no hay último lead ni ninguna cuenta con expiración", async () => {
    fetchBridgesApiMock.mockResolvedValue(
      bridgesResponse([bridgeFake({ ultimoLeadEn: null, cuentasPublicitarias: [] })]),
    );
    renderBridgesPage();

    expect(await screen.findByText("Nunca")).toBeInTheDocument();
    expect(screen.getByText("No expira")).toBeInTheDocument();
  });
});

describe("BridgesPage — ícono de aviso por fila (F8, reemplaza la pila de <AvisoBridge> sobre la tabla)", () => {
  it("no muestra el ícono de aviso cuando ningún bridge lo necesita", async () => {
    fetchBridgesApiMock.mockResolvedValue(bridgesResponse([bridgeFake()]));
    renderBridgesPage();

    await screen.findByText("Meta Ads — Facebook");
    expect(screen.queryByRole("button", { name: /^Avisos de/ })).not.toBeInTheDocument();
  });

  it("muestra el ícono de aviso y, al hacer clic, el popover con el texto del token expirado", async () => {
    fetchBridgesApiMock.mockResolvedValue(
      bridgesResponse([
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
      ]),
    );
    const user = userEvent.setup();
    renderBridgesPage();
    await screen.findByText("LinkedIn Lead Sync");

    await user.click(screen.getByRole("button", { name: "Avisos de LinkedIn Lead Sync" }));

    expect(await screen.findByText(/el token expiró/i)).toBeInTheDocument();
  });

  it("un bridge con una cuenta con el token expirado y otra sana muestra el peor caso (ícono de aviso)", async () => {
    fetchBridgesApiMock.mockResolvedValue(
      bridgesResponse([
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
      ]),
    );
    const user = userEvent.setup();
    renderBridgesPage();
    await screen.findByText("Bridge Mixto");

    await user.click(screen.getByRole("button", { name: "Avisos de Bridge Mixto" }));

    expect(await screen.findByText(/el token expiró/i)).toBeInTheDocument();
  });

  it("muestra el ícono de aviso cuando el bridge no tiene actividad reciente", async () => {
    fetchBridgesApiMock.mockResolvedValue(
      bridgesResponse([
        bridgeFake({
          id: "bridge-ig",
          nombre: "Meta Ads — Instagram",
          ultimoLeadEn: new Date(Date.now() - 100 * 60 * 60 * 1000).toISOString(),
        }),
      ]),
    );
    const user = userEvent.setup();
    renderBridgesPage();
    await screen.findByText("Meta Ads — Instagram");

    await user.click(screen.getByRole("button", { name: "Avisos de Meta Ads — Instagram" }));

    expect(await screen.findByText(/no recibió leads en las últimas 72 horas/i)).toBeInTheDocument();
  });

  it("no marca el aviso de un bridge INACTIVO aunque nunca haya recibido leads", async () => {
    fetchBridgesApiMock.mockResolvedValue(
      bridgesResponse([
        bridgeFake({
          id: "bridge-gf",
          nombre: "Google Forms — Pruebas",
          estado: "INACTIVO",
          ultimoLeadEn: null,
          tokenExpiraEn: null,
        }),
      ]),
    );
    renderBridgesPage();

    await screen.findByText("Google Forms — Pruebas");
    expect(screen.queryByRole("button", { name: /^Avisos de/ })).not.toBeInTheDocument();
  });
});

describe("BridgesPage — filtro (búsqueda, red social, estado, F8)", () => {
  it("escribir en el buscador manda `busqueda` a fetchBridgesApi y reinicia la página a 1", async () => {
    fetchBridgesApiMock.mockResolvedValue(bridgesResponse([bridgeFake()]));
    const user = userEvent.setup();
    renderBridgesPage();
    await screen.findByText("Meta Ads — Facebook");

    await user.type(screen.getByLabelText("Buscar bridges"), "meta");

    await waitFor(() => {
      const ultimaLlamada = fetchBridgesApiMock.mock.calls.at(-1)?.[0];
      expect(ultimaLlamada?.busqueda).toBe("meta");
      expect(ultimaLlamada?.pagina).toBe(1);
    });
  });

  it("elegir un estado manda `estado` a fetchBridgesApi", async () => {
    fetchBridgesApiMock.mockResolvedValue(bridgesResponse([bridgeFake()]));
    const user = userEvent.setup();
    renderBridgesPage();
    await screen.findByText("Meta Ads — Facebook");

    await abrirFiltros(user);
    await user.click(screen.getByRole("combobox", { name: "Estado" }));
    await user.click(await screen.findByRole("option", { name: "Inactivo" }));

    await waitFor(() => {
      expect(fetchBridgesApiMock.mock.calls.at(-1)?.[0]?.estado).toBe("INACTIVO");
    });
  });

  it("elegir una red social manda `redSocial` a fetchBridgesApi", async () => {
    fetchBridgesApiMock.mockResolvedValue(bridgesResponse([bridgeFake()]));
    const user = userEvent.setup();
    renderBridgesPage();
    await screen.findByText("Meta Ads — Facebook");

    await abrirFiltros(user);
    await user.click(screen.getByRole("combobox", { name: "Red social" }));
    await user.click(await screen.findByRole("option", { name: "Google Forms" }));

    await waitFor(() => {
      expect(fetchBridgesApiMock.mock.calls.at(-1)?.[0]?.redSocial).toBe("GOOGLE_FORMS");
    });
  });

  it("sin resultados con filtros activos, muestra un estado vacío distinto al de 'sin bridges configurados'", async () => {
    fetchBridgesApiMock.mockResolvedValue(bridgesResponse([bridgeFake()]));
    const user = userEvent.setup();
    renderBridgesPage();
    await screen.findByText("Meta Ads — Facebook");

    fetchBridgesApiMock.mockResolvedValue(bridgesResponse([]));
    await user.type(screen.getByLabelText("Buscar bridges"), "nadie-coincide");

    expect(
      await screen.findByText("No hay bridges que coincidan con estos filtros"),
    ).toBeInTheDocument();
  });
});

describe("BridgesPage — paginación (F8)", () => {
  it("muestra «Mostrando X–Y de Z bridges» según el total real devuelto por el backend", async () => {
    fetchBridgesApiMock.mockResolvedValue(bridgesResponse([bridgeFake()], { total: 25, pagina: 1 }));

    renderBridgesPage();
    await screen.findByText("Meta Ads — Facebook");

    expect(screen.getByText("Mostrando 1–10 de 25 bridges")).toBeInTheDocument();
  });

  it("«Anterior» está deshabilitado en la página 1", async () => {
    fetchBridgesApiMock.mockResolvedValue(bridgesResponse([bridgeFake()], { total: 25, pagina: 1 }));

    renderBridgesPage();
    await screen.findByText("Meta Ads — Facebook");

    expect(screen.getByRole("button", { name: "Página anterior" })).toBeDisabled();
  });

  it("«Siguiente» avanza de página y manda `pagina: 2` a fetchBridgesApi", async () => {
    fetchBridgesApiMock.mockResolvedValue(bridgesResponse([bridgeFake()], { total: 25, pagina: 1 }));
    const user = userEvent.setup();
    renderBridgesPage();
    await screen.findByText("Meta Ads — Facebook");

    await user.click(screen.getByRole("button", { name: "Página siguiente" }));

    await waitFor(() => {
      expect(fetchBridgesApiMock.mock.calls.at(-1)?.[0]?.pagina).toBe(2);
    });
  });

  it("«Siguiente» está deshabilitado en la última página", async () => {
    fetchBridgesApiMock.mockResolvedValue(bridgesResponse([bridgeFake()], { total: 5, pagina: 1 }));

    renderBridgesPage();
    await screen.findByText("Meta Ads — Facebook");

    expect(screen.getByRole("button", { name: "Página siguiente" })).toBeDisabled();
  });

  it("cambiar el estado filtrado reinicia la paginación a la página 1", async () => {
    fetchBridgesApiMock.mockResolvedValue(bridgesResponse([bridgeFake()], { total: 25, pagina: 1 }));
    const user = userEvent.setup();
    renderBridgesPage();
    await screen.findByText("Meta Ads — Facebook");

    await user.click(screen.getByRole("button", { name: "Página siguiente" }));
    await waitFor(() => expect(fetchBridgesApiMock.mock.calls.at(-1)?.[0]?.pagina).toBe(2));

    await abrirFiltros(user);
    await user.click(screen.getByRole("combobox", { name: "Estado" }));
    await user.click(await screen.findByRole("option", { name: "Activo" }));

    await waitFor(() => {
      const ultimaLlamada = fetchBridgesApiMock.mock.calls.at(-1)?.[0];
      expect(ultimaLlamada?.estado).toBe("ACTIVO");
      expect(ultimaLlamada?.pagina).toBe(1);
    });
  });
});

describe("BridgesPage — alta de bridge (Requirement: Create Bridge)", () => {
  it("el selector de red social se puebla desde el catálogo del backend, nunca un arreglo fijo", async () => {
    fetchBridgesApiMock.mockResolvedValue(bridgesResponse([]));
    const user = userEvent.setup();
    renderBridgesPage();
    await screen.findByText("Todavía no hay bridges configurados");

    await user.click(screen.getByRole("button", { name: "Nuevo bridge" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("combobox", { name: "Red social" }));

    expect(await screen.findByRole("option", { name: "Google Forms" })).toBeInTheDocument();
    expect(fetchRedesSocialesSoportadasApiMock).toHaveBeenCalled();
  });

  it("con datos válidos, crea el bridge y encadena el modal de clave de un solo uso", async () => {
    fetchBridgesApiMock.mockResolvedValue(bridgesResponse([]));
    createBridgeApiMock.mockResolvedValue({
      bridge: bridgeFake({ id: "bridge-nuevo", nombre: "Formulario Ventas", estado: "INACTIVO" }),
      claveApi: "brg_recien-generada-123",
    });
    const user = userEvent.setup();
    renderBridgesPage();
    await screen.findByText("Todavía no hay bridges configurados");

    await user.click(screen.getByRole("button", { name: "Nuevo bridge" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("combobox", { name: "Red social" }));
    await user.click(await screen.findByRole("option", { name: "Google Forms" }));
    await user.type(within(dialog).getByLabelText("Nombre"), "Formulario Ventas");
    await user.click(within(dialog).getByRole("button", { name: "Crear bridge" }));

    await waitFor(() =>
      expect(createBridgeApiMock).toHaveBeenCalledWith({ redSocial: "GOOGLE_FORMS", nombre: "Formulario Ventas" }),
    );
    expect(await screen.findByText("brg_recien-generada-123")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Entendido, cerrar" })).toBeDisabled();
  });

  it("rechaza el envío sin elegir red social ni escribir nombre, sin llamar a createBridgeApi", async () => {
    fetchBridgesApiMock.mockResolvedValue(bridgesResponse([]));
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
    fetchBridgesApiMock.mockResolvedValue(
      bridgesResponse([bridgeFake({ id: "bridge-sin-leads", nombre: "Sin Leads", ultimoLeadEn: null })]),
    );
    deleteBridgeApiMock.mockResolvedValue({
      resultado: "BAJA_FISICA",
      bridge: bridgeFake({ id: "bridge-sin-leads", nombre: "Sin Leads", ultimoLeadEn: null }),
    });
    const user = userEvent.setup();
    renderBridgesPage();
    await screen.findByText("Sin Leads");

    await abrirMenuAcciones(user, "Sin Leads");
    await user.click(await screen.findByRole("menuitem", { name: "Dar de baja" }));
    expect(await screen.findByText(/eliminará de forma permanente/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() => expect(deleteBridgeApiMock).toHaveBeenCalledWith("bridge-sin-leads"));
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "Bridge eliminado permanentemente: nunca había recibido leads.",
    );
  });

  it("un bridge que ya recibió leads: advierte baja reversible y llama a deleteBridgeApi al confirmar", async () => {
    fetchBridgesApiMock.mockResolvedValue(
      bridgesResponse([bridgeFake({ id: "bridge-con-leads", nombre: "Con Leads" })]),
    );
    deleteBridgeApiMock.mockResolvedValue({
      resultado: "BAJA_LOGICA",
      bridge: bridgeFake({ id: "bridge-con-leads", nombre: "Con Leads", estado: "INACTIVO" }),
    });
    const user = userEvent.setup();
    renderBridgesPage();
    await screen.findByText("Con Leads");

    await abrirMenuAcciones(user, "Con Leads");
    await user.click(await screen.findByRole("menuitem", { name: "Dar de baja" }));
    expect(await screen.findByText(/podés reactivarlo/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() => expect(deleteBridgeApiMock).toHaveBeenCalledWith("bridge-con-leads"));
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "Bridge dado de baja correctamente. Podés reactivarlo cuando quieras.",
    );
  });

  it("un bridge INACTIVO muestra «Reactivar» en vez de «Dar de baja», y al hacer clic llama a reactivateBridgeApi", async () => {
    fetchBridgesApiMock.mockResolvedValue(
      bridgesResponse([bridgeFake({ id: "bridge-inactivo", nombre: "Bridge Pausado", estado: "INACTIVO" })]),
    );
    reactivateBridgeApiMock.mockResolvedValue(
      bridgeFake({ id: "bridge-inactivo", nombre: "Bridge Pausado", estado: "ACTIVO" }),
    );
    const user = userEvent.setup();
    renderBridgesPage();
    await screen.findByText("Bridge Pausado");

    await abrirMenuAcciones(user, "Bridge Pausado");
    expect(screen.queryByRole("menuitem", { name: "Dar de baja" })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("menuitem", { name: "Reactivar" }));

    await waitFor(() => expect(reactivateBridgeApiMock).toHaveBeenCalledWith("bridge-inactivo"));
    expect(toastSuccessMock).toHaveBeenCalledWith("Bridge reactivado correctamente.");
  });
});
