import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FILTROS_LEADS_VACIOS, type LeadsFiltrosState } from "@/funcionalidades/leads/leads.utils";

vi.mock("@/funcionalidades/bridges/bridges.api", () => ({
  fetchRedesSocialesActivasApi: vi.fn(),
}));

const { fetchRedesSocialesActivasApi } = await import("@/funcionalidades/bridges/bridges.api");
const { LeadsFiltros } = await import("@/funcionalidades/leads/LeadsFiltros");

const fetchRedesSocialesActivasApiMock = vi.mocked(fetchRedesSocialesActivasApi);

function renderFiltros(filtros: LeadsFiltrosState = FILTROS_LEADS_VACIOS, onChange = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <LeadsFiltros
        filtros={filtros}
        onChange={onChange}
        campanias={[]}
        mostrarFiltroResponsable={false}
        responsables={[]}
      />
    </QueryClientProvider>,
  );
  return { onChange };
}

beforeEach(() => {
  fetchRedesSocialesActivasApiMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LeadsFiltros — red social sourced from active bridges (Requirement: Red-Social Filter Sourced from Active Bridges)", () => {
  it("mientras carga, el selector queda deshabilitado con solo la opción «Todos»", () => {
    let resolver: (value: string[]) => void = () => {};
    fetchRedesSocialesActivasApiMock.mockReturnValue(
      new Promise((resolve) => {
        resolver = resolve;
      }),
    );

    renderFiltros();

    expect(screen.getByRole("combobox", { name: "Red social" })).toBeDisabled();
    resolver(["FACEBOOK"]);
  });

  it("una vez cargado, solo ofrece las redes activas devueltas por el backend, no las 5 del enum completo", async () => {
    fetchRedesSocialesActivasApiMock.mockResolvedValue(["FACEBOOK", "INSTAGRAM"]);
    const user = userEvent.setup();
    renderFiltros();

    await waitFor(() => expect(screen.getByRole("combobox", { name: "Red social" })).toBeEnabled());
    await user.click(screen.getByRole("combobox", { name: "Red social" }));

    expect(await screen.findByRole("option", { name: "Facebook" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Instagram" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "LinkedIn" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Google Forms" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "X" })).not.toBeInTheDocument();
  });

  it("un redSocial ya seleccionado que dejó de estar activo se mantiene como opción, no desaparece", async () => {
    fetchRedesSocialesActivasApiMock.mockResolvedValue(["FACEBOOK"]);
    const user = userEvent.setup();
    renderFiltros({ ...FILTROS_LEADS_VACIOS, redSocial: "GOOGLE_FORMS" });

    await waitFor(() => expect(screen.getByRole("combobox", { name: "Red social" })).toBeEnabled());
    await user.click(screen.getByRole("combobox", { name: "Red social" }));

    expect(await screen.findByRole("option", { name: "Google Forms" })).toBeInTheDocument();
  });

  it("elegir una red social dispara onChange con el valor elegido", async () => {
    fetchRedesSocialesActivasApiMock.mockResolvedValue(["FACEBOOK", "INSTAGRAM"]);
    const user = userEvent.setup();
    const { onChange } = renderFiltros();

    await waitFor(() => expect(screen.getByRole("combobox", { name: "Red social" })).toBeEnabled());
    await user.click(screen.getByRole("combobox", { name: "Red social" }));
    await user.click(await screen.findByRole("option", { name: "Instagram" }));

    expect(onChange).toHaveBeenCalledWith({ ...FILTROS_LEADS_VACIOS, redSocial: "INSTAGRAM" });
  });
});
