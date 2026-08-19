import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getErrorMessage } from "@/api/httpClient";
import type { Bridge } from "@/tipos/bridge";

vi.mock("@/funcionalidades/bridges/bridges.api", () => ({
  regenerateClaveApi: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const bridgesApi = await import("@/funcionalidades/bridges/bridges.api");
const { toast } = await import("sonner");
const { CredencialBridgeForm } = await import("@/funcionalidades/bridges/detalle/CredencialBridgeForm");

const regenerateClaveApiMock = vi.mocked(bridgesApi.regenerateClaveApi);

function bridgeFake(overrides: Partial<Bridge> = {}): Bridge {
  return {
    id: "bridge-1",
    redSocial: "LINKEDIN",
    nombre: "LinkedIn Lead Sync",
    estado: "ACTIVO",
    tokenExpiraEn: null,
    ultimoLeadEn: null,
    cuentasPublicitarias: [],
    ...overrides,
  };
}

function renderForm(bridge: Bridge) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    mutationCache: new MutationCache({ onError: (error) => toast.error(getErrorMessage(error)) }),
  });
  return render(
    <QueryClientProvider client={client}>
      <CredencialBridgeForm bridge={bridge} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  regenerateClaveApiMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CredencialBridgeForm — bifurca por estilo de autenticación (Requirement: Credential Form Branches by Authentication Style)", () => {
  it("estilo CLAVE_API (Google Forms/X): muestra «Regenerar clave», sin campo para pegar un token", () => {
    renderForm(bridgeFake({ redSocial: "GOOGLE_FORMS" }));

    expect(screen.getByRole("button", { name: "Regenerar clave" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Token")).not.toBeInTheDocument();
  });

  it("estilo CLAVE_API: al regenerar, abre el modal de clave con la nueva clave en texto plano", async () => {
    regenerateClaveApiMock.mockResolvedValue({
      bridge: bridgeFake({ redSocial: "X" }),
      claveApi: "brg_nueva-clave-regenerada",
    });
    const user = userEvent.setup();
    renderForm(bridgeFake({ id: "bridge-x", redSocial: "X" }));

    await user.click(screen.getByRole("button", { name: "Regenerar clave" }));

    await waitFor(() => expect(regenerateClaveApiMock).toHaveBeenCalledWith("bridge-x"));
    expect(await screen.findByText("brg_nueva-clave-regenerada")).toBeInTheDocument();
  });

  it("estilo TOKEN_PROVEEDOR (Facebook/Instagram/LinkedIn): ya NO muestra un formulario de token a nivel de bridge -- el backend real lo administra por cuenta publicitaria", () => {
    renderForm(bridgeFake({ redSocial: "LINKEDIN" }));

    expect(screen.queryByLabelText("Token")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar y verificar" })).not.toBeInTheDocument();
    expect(screen.getByText(/cuentas publicitarias asociadas/i)).toBeInTheDocument();
  });

  it("estilo TOKEN_PROVEEDOR: el mismo texto explicativo aparece sin importar la red (Facebook/Instagram/LinkedIn)", () => {
    renderForm(bridgeFake({ redSocial: "FACEBOOK" }));

    expect(screen.queryByLabelText("Token")).not.toBeInTheDocument();
    expect(
      screen.getByText(/el campo siempre se muestra vacío/i),
    ).toBeInTheDocument();
  });
});
