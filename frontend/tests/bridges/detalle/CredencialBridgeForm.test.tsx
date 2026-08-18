import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getErrorMessage } from "@/api/httpClient";
import type { Bridge } from "@/tipos/bridge";

vi.mock("@/funcionalidades/bridges/bridges.api", () => ({
  saveTokenApi: vi.fn(),
  regenerateClaveApi: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const bridgesApi = await import("@/funcionalidades/bridges/bridges.api");
const { toast } = await import("sonner");
const { CredencialBridgeForm } = await import("@/funcionalidades/bridges/detalle/CredencialBridgeForm");

const saveTokenApiMock = vi.mocked(bridgesApi.saveTokenApi);
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
  saveTokenApiMock.mockReset();
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

  it("estilo TOKEN_PROVEEDOR (Facebook/Instagram/LinkedIn): muestra el formulario de token existente, marcado como Fase 2", () => {
    renderForm(bridgeFake({ redSocial: "LINKEDIN" }));

    expect(screen.getByLabelText("Token")).toBeInTheDocument();
    expect(screen.getByText(/Fase 2/i)).toBeInTheDocument();
  });

  it("estilo TOKEN_PROVEEDOR: el formulario de token sigue siendo funcional (no se deshabilita)", async () => {
    saveTokenApiMock.mockResolvedValue(bridgeFake({ redSocial: "FACEBOOK", estado: "ACTIVO" }));
    const user = userEvent.setup();
    renderForm(bridgeFake({ id: "bridge-fb", redSocial: "FACEBOOK" }));

    await user.type(screen.getByLabelText("Token"), "un-token-bastante-largo-1234");
    await user.click(screen.getByRole("button", { name: "Guardar y verificar" }));

    await waitFor(() =>
      expect(saveTokenApiMock).toHaveBeenCalledWith("bridge-fb", "un-token-bastante-largo-1234"),
    );
  });
});
