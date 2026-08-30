import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useSearchParams } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmpresasHoldingResponse } from "@/funcionalidades/empresa-apariencia/empresa-apariencia-holding.api";

/**
 * `SelectorEmpresaDashboard` (docs/23 item 14, "Dashboard con filtro por
 * empresa (holding)"): combina `useEmpresasHolding` (listado real,
 * `empresa-apariencia-holding.api` mockeado acá) con `useVistaEmpresa`
 * (`?empresaId=` en la URL, real -- mismo mecanismo que
 * `EmpresaDetallePage.tsx`/`ReportesPage.tsx`) sobre el combobox genérico
 * `ResponsableCombobox`.
 */
vi.mock("@/funcionalidades/empresa-apariencia/empresa-apariencia-holding.api", () => ({
  fetchEmpresasHoldingApi: vi.fn(),
}));

const api = await import("@/funcionalidades/empresa-apariencia/empresa-apariencia-holding.api");
const { SelectorEmpresaDashboard } = await import("@/funcionalidades/dashboard/SelectorEmpresaDashboard");

const fetchEmpresasHoldingApiMock = vi.mocked(api.fetchEmpresasHoldingApi);

const EMPRESAS: EmpresasHoldingResponse = {
  items: [
    { id: "empresa-1", nombre: "Empresa A", colorPrimario: null, colorSecundario: null, logoUrl: null },
    { id: "empresa-2", nombre: "Empresa B", colorPrimario: null, colorSecundario: null, logoUrl: null },
  ],
  total: 2,
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
