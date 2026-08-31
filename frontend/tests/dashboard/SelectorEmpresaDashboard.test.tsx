import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useSearchParams } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  EmpresaAparienciaHoldingView,
  EmpresasHoldingResponse,
} from "@/funcionalidades/empresa-apariencia/empresa-apariencia-holding.api";

/**
 * `SelectorEmpresaDashboard` (docs/23 item 14, "Dashboard con filtro por
 * empresa (holding)"): combina `useEmpresasHolding`/`useEmpresaHolding`
 * (`empresa-apariencia-holding.api` mockeado acá) con `useVistaEmpresa`
 * (`?empresaId=` en la URL, real -- mismo mecanismo que
 * `EmpresaDetallePage.tsx`/`ReportesPage.tsx`).
 *
 * A diferencia de la primera versión (bug: `pageSize: 500` fijo, rechazado
 * por el backend con 400 porque el tope real es 100), este combobox busca
 * server-side con debounce -- mismo criterio que `GestorEmpresasPage.tsx`
 * (478 empresas reales, no entran en una sola página).
 */
vi.mock("@/funcionalidades/empresa-apariencia/empresa-apariencia-holding.api", () => ({
  fetchEmpresasHoldingApi: vi.fn(),
  fetchEmpresaHoldingApi: vi.fn(),
}));
// `useVistaEmpresa` (consumido por `SelectorEmpresaDashboard`) ahora también
// llama `useAuth()` para derivar `esVistaSoloLectura` -- mockeado acá con una
// sesión `holding` estable (quien ve este selector es siempre un
// holding-wide, ver `DashboardPage.tsx`), mismo patrón que
// `tests/bridges/BridgesPage.test.tsx`. Ningún test de este archivo depende
// de `esVistaSoloLectura` en sí, así que un valor fijo alcanza.
vi.mock("@/funcionalidades/autenticacion/auth-context", () => ({
  useAuth: () => ({ user: { sessionScope: "holding" } }),
}));

const api = await import("@/funcionalidades/empresa-apariencia/empresa-apariencia-holding.api");
const { SelectorEmpresaDashboard } = await import("@/funcionalidades/dashboard/SelectorEmpresaDashboard");

const fetchEmpresasHoldingApiMock = vi.mocked(api.fetchEmpresasHoldingApi);
const fetchEmpresaHoldingApiMock = vi.mocked(api.fetchEmpresaHoldingApi);

function empresa(overrides: Partial<EmpresaAparienciaHoldingView>): EmpresaAparienciaHoldingView {
  return { id: "e", nombre: "Empresa", colorPrimario: null, colorSecundario: null, logoUrl: null, ...overrides };
}

const EMPRESAS: EmpresasHoldingResponse = {
  items: [
    empresa({ id: "empresa-1", nombre: "Empresa A" }),
    empresa({ id: "empresa-2", nombre: "Empresa B" }),
  ],
  total: 478,
};

function renderSelector(initialPath = "/panel") {
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
                  <SelectorEmpresaDashboard />
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

// Pequeño wrapper para poder leer `?empresaId=` actual desde el test sin
// depender de `window.location` (jsdom + MemoryRouter no lo sincroniza).
function CapturaUrl({ children, onCapturar }: { children: React.ReactNode; onCapturar: (s: string) => void }) {
  const [searchParams] = useSearchParams();
  onCapturar(searchParams.toString());
  return children;
}

beforeEach(() => {
  fetchEmpresasHoldingApiMock.mockReset();
  fetchEmpresasHoldingApiMock.mockResolvedValue(EMPRESAS);
  fetchEmpresaHoldingApiMock.mockReset();
  fetchEmpresaHoldingApiMock.mockImplementation(async (empresaId: string) =>
    EMPRESAS.items.find((e) => e.id === empresaId) ?? empresa({ id: empresaId, nombre: empresaId }),
  );
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("SelectorEmpresaDashboard", () => {
  it("sin ?empresaId en la URL, muestra 'Todo el holding' seleccionado", async () => {
    renderSelector("/panel");
    expect(await screen.findByRole("combobox", { name: "Empresa" })).toHaveTextContent("Todo el holding");
  });

  it("lista las empresas del holding en el combobox", async () => {
    const user = userEvent.setup();
    renderSelector("/panel");
    const boton = await screen.findByRole("combobox", { name: "Empresa" });
    await user.click(boton);

    expect(await screen.findByText("Empresa A")).toBeInTheDocument();
    expect(screen.getByText("Empresa B")).toBeInTheDocument();
  });

  it("elegir una empresa entra a esa vista (?empresaId= en la URL)", async () => {
    const user = userEvent.setup();
    const { getUrl } = renderSelector("/panel");
    const boton = await screen.findByRole("combobox", { name: "Empresa" });
    await user.click(boton);
    await user.click(await screen.findByText("Empresa A"));

    await waitFor(() => expect(getUrl()).toBe("empresaId=empresa-1"));
  });

  it("con ?empresaId= ya en la URL, elegir 'Todo el holding' lo saca de la vista de esa empresa", async () => {
    const user = userEvent.setup();
    const { getUrl } = renderSelector("/panel?empresaId=empresa-1");
    const boton = await screen.findByRole("combobox", { name: "Empresa" });
    await user.click(boton);
    await user.click(await screen.findByText("Todo el holding"));

    await waitFor(() => expect(getUrl()).toBe(""));
  });
});

describe("SelectorEmpresaDashboard — bug pageSize 500 rechazado por el backend (tope real 100)", () => {
  it("pide la primera página con un pageSize acotado (no 500) mientras no hay búsqueda", async () => {
    renderSelector("/panel");
    await screen.findByRole("combobox", { name: "Empresa" });

    await waitFor(() => expect(fetchEmpresasHoldingApiMock).toHaveBeenCalled());
    const [params] = fetchEmpresasHoldingApiMock.mock.calls[0];
    expect(params?.pageSize).toBeLessThanOrEqual(100);
    expect(params).not.toHaveProperty("search");
  });
});

describe("SelectorEmpresaDashboard — búsqueda server-side (con debounce)", () => {
  it("escribir en el buscador manda `search` a fetchEmpresasHoldingApi (sin un request por cada tecla)", async () => {
    const user = userEvent.setup();
    renderSelector("/panel");
    const boton = await screen.findByRole("combobox", { name: "Empresa" });
    await user.click(boton);
    await screen.findByText("Empresa A");

    const llamadasAntesDeEscribir = fetchEmpresasHoldingApiMock.mock.calls.length;
    fetchEmpresasHoldingApiMock.mockResolvedValue({
      items: [empresa({ id: "empresa-9", nombre: "Acme Holding" })],
      total: 1,
    });
    await user.type(screen.getByPlaceholderText("Buscar empresa…"), "acme");

    await waitFor(() => {
      const ultimaLlamada = fetchEmpresasHoldingApiMock.mock.calls.at(-1)?.[0];
      expect(ultimaLlamada?.search).toBe("acme");
    });
    // El debounce colapsa las 4 teclas escritas en un único request nuevo (no cuatro).
    expect(fetchEmpresasHoldingApiMock.mock.calls.length).toBeLessThan(llamadasAntesDeEscribir + 4);
    expect(await screen.findByText("Acme Holding")).toBeInTheDocument();
  });

  it("sin coincidencias con búsqueda activa, muestra 'Sin coincidencias.'", async () => {
    const user = userEvent.setup();
    renderSelector("/panel");
    const boton = await screen.findByRole("combobox", { name: "Empresa" });
    await user.click(boton);
    await screen.findByText("Empresa A");

    fetchEmpresasHoldingApiMock.mockResolvedValue({ items: [], total: 0 });
    await user.type(screen.getByPlaceholderText("Buscar empresa…"), "zzz-inexistente");

    expect(await screen.findByText("Sin coincidencias.")).toBeInTheDocument();
    // La opción fija sigue disponible aunque la búsqueda no encuentre nada.
    expect(screen.getByRole("option", { name: "Todo el holding" })).toBeInTheDocument();
  });
});

describe("SelectorEmpresaDashboard — empresa seleccionada fuera de la página inicial de resultados", () => {
  it("con ?empresaId= de una empresa que no está en la primera página, el botón muestra su nombre real (no el id)", async () => {
    fetchEmpresaHoldingApiMock.mockResolvedValue(
      empresa({ id: "empresa-999", nombre: "Empresa Lejana S.A." }),
    );
    renderSelector("/panel?empresaId=empresa-999");

    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Empresa" })).toHaveTextContent("Empresa Lejana S.A."),
    );
  });
});
