import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, getErrorMessage } from "@/api/httpClient";
import type { CuentaPublicitariaBridge } from "@/tipos/bridge";

/**
 * Gap de contrato confirmado (ver `bridges.api.ts`): el backend real
 * administra token/prueba de conexión POR CUENTA PUBLICITARIA
 * (`POST /bridges/:id/cuentas/:cuentaId/token` y `.../probar-conexion`), no
 * por bridge -- por eso estos controles ahora se prueban acá, montados por
 * cada fila de `CuentasPublicitariasList`, y ya no en
 * `BridgeDetallePage.test.tsx` (que solo conocía `bridgeId`).
 */
vi.mock("@/funcionalidades/bridges/bridges.api", () => ({
  saveTokenApi: vi.fn(),
  testConnectionApi: vi.fn(),
  toggleCuentaActivaApi: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const bridgesApi = await import("@/funcionalidades/bridges/bridges.api");
const { toast } = await import("sonner");
const { CuentasPublicitariasList } = await import(
  "@/funcionalidades/bridges/detalle/CuentasPublicitariasList"
);

const saveTokenApiMock = vi.mocked(bridgesApi.saveTokenApi);
const testConnectionApiMock = vi.mocked(bridgesApi.testConnectionApi);
const toggleCuentaActivaApiMock = vi.mocked(bridgesApi.toggleCuentaActivaApi);
const toastSuccessMock = vi.mocked(toast.success);
const toastErrorMock = vi.mocked(toast.error);

function cuentaFake(overrides: Partial<CuentaPublicitariaBridge> = {}): CuentaPublicitariaBridge {
  return {
    id: "cuenta-1",
    bridgeId: "bridge-1",
    idExterno: "page-1",
    nombre: "Página Principal",
    instagramAccountId: null,
    activa: true,
    estadoToken: "VALIDO",
    tokenExpiraEn: null,
    ...overrides,
  };
}

type Props = ComponentProps<typeof CuentasPublicitariasList>;

function renderList(overrides: Partial<Props> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    mutationCache: new MutationCache({ onError: (error) => toast.error(getErrorMessage(error)) }),
  });
  return render(
    <QueryClientProvider client={client}>
      <CuentasPublicitariasList
        bridgeId="bridge-1"
        redSocial="FACEBOOK"
        cuentas={[cuentaFake()]}
        {...overrides}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  saveTokenApiMock.mockReset();
  testConnectionApiMock.mockReset();
  toggleCuentaActivaApiMock.mockReset();
  toastSuccessMock.mockReset();
  toastErrorMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CuentasPublicitariasList — estado vacío", () => {
  it("muestra un estado vacío cuando no hay cuentas asociadas (sin ningún control de token)", () => {
    renderList({ cuentas: [] });

    expect(screen.getByText("Sin cuentas publicitarias asociadas")).toBeInTheDocument();
    expect(screen.queryByLabelText("Token")).not.toBeInTheDocument();
  });
});

describe("CuentasPublicitariasList — alta/baja de cuentas (docs/05 §7)", () => {
  it("alterna activa/inactiva y llama a toggleCuentaActivaApi con bridgeId + cuentaId", async () => {
    toggleCuentaActivaApiMock.mockResolvedValue(cuentaFake({ activa: false }));
    const user = userEvent.setup();
    renderList();

    expect(screen.getByText("Activa")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Desactivar" }));

    await waitFor(() =>
      expect(toggleCuentaActivaApiMock).toHaveBeenCalledWith("bridge-1", "cuenta-1", false),
    );
  });

  it("activar/desactivar una cuenta no deshabilita el botón de otra cuenta del mismo bridge (mutación no compartida entre filas)", async () => {
    let resolverToggle: (cuenta: CuentaPublicitariaBridge) => void = () => {};
    toggleCuentaActivaApiMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolverToggle = resolve;
        }),
    );
    const user = userEvent.setup();
    renderList({
      cuentas: [
        cuentaFake({ id: "cuenta-1", nombre: "Página Principal", activa: true }),
        cuentaFake({ id: "cuenta-2", nombre: "Página Secundaria", activa: true }),
      ],
    });

    const botones = screen.getAllByRole("button", { name: "Desactivar" });
    expect(botones).toHaveLength(2);
    const [botonCuenta1, botonCuenta2] = botones;

    await user.click(botonCuenta1);

    await waitFor(() => expect(botonCuenta1).toBeDisabled());
    expect(botonCuenta2).not.toBeDisabled();

    resolverToggle(cuentaFake({ id: "cuenta-1", activa: false }));
    await waitFor(() => expect(botonCuenta1).not.toBeDisabled());
  });
});

describe("CuentasPublicitariasList — token por cuenta (Facebook/Instagram: adaptador Meta real conectado)", () => {
  it("el campo de token arranca vacío, nunca precargado", () => {
    renderList();
    expect(screen.getByLabelText("Token")).toHaveValue("");
  });

  it("con un token válido, llama a saveTokenApi con bridgeId + cuentaId + token, y vacía el campo al terminar", async () => {
    saveTokenApiMock.mockResolvedValue(cuentaFake());
    const user = userEvent.setup();
    renderList();

    await user.type(screen.getByLabelText("Token"), "un-token-bastante-largo-1234");
    await user.click(screen.getByRole("button", { name: "Guardar y verificar" }));

    await waitFor(() =>
      expect(saveTokenApiMock).toHaveBeenCalledWith(
        "bridge-1",
        "cuenta-1",
        "un-token-bastante-largo-1234",
      ),
    );
    expect(toastSuccessMock).toHaveBeenCalledWith("Token guardado y verificado correctamente.");
    await waitFor(() => expect(screen.getByLabelText("Token")).toHaveValue(""));
  });

  it("si Graph API rechaza el token, muestra el mensaje accionable del backend (no un código HTTP)", async () => {
    saveTokenApiMock.mockRejectedValue(
      new ApiError(
        "meta_token_invalido",
        422,
        "El token no pudo verificarse contra Graph API: el token no es válido.",
      ),
    );
    const user = userEvent.setup();
    renderList();

    await user.type(screen.getByLabelText("Token"), "un-token-que-graph-api-rechaza");
    await user.click(screen.getByRole("button", { name: "Guardar y verificar" }));

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith(
        "El token no pudo verificarse contra Graph API: el token no es válido.",
      ),
    );
  });

  it("rechaza el envío sin escribir ningún token, sin llamar a saveTokenApi", async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByRole("button", { name: "Guardar y verificar" }));

    expect(await screen.findByText("Ingresa el token.")).toBeInTheDocument();
    expect(saveTokenApiMock).not.toHaveBeenCalled();
  });

  it("al probar la conexión, llama a testConnectionApi con bridgeId + cuentaId y muestra el resultado en pantalla", async () => {
    testConnectionApiMock.mockResolvedValue({ ok: true, mensaje: "Conexión verificada correctamente." });
    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByRole("button", { name: "Probar conexión" }));

    await waitFor(() => expect(testConnectionApiMock).toHaveBeenCalledWith("bridge-1", "cuenta-1"));
    expect(await screen.findByText("Conexión verificada correctamente.")).toBeInTheDocument();
  });

  it("muestra el mensaje de fallo cuando la prueba de conexión no es exitosa", async () => {
    testConnectionApiMock.mockResolvedValue({
      ok: false,
      mensaje: "El token expiró o fue revocado. Cargá uno nuevo.",
    });
    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByRole("button", { name: "Probar conexión" }));

    expect(await screen.findByText("El token expiró o fue revocado. Cargá uno nuevo.")).toBeInTheDocument();
  });

  it("una cuenta con Instagram vinculado muestra ese id además del id externo de la Página", () => {
    renderList({ cuentas: [cuentaFake({ instagramAccountId: "ig-12345" })] });
    expect(screen.getByText(/Instagram vinculado: ig-12345/)).toBeInTheDocument();
  });
});

describe("CuentasPublicitariasList — estado de token por cuenta (sin agregación, gap de contrato resuelto)", () => {
  it("una cuenta con estadoToken TOKEN_EXPIRADO muestra el aviso «Token expirado» en su fila", () => {
    renderList({ cuentas: [cuentaFake({ estadoToken: "TOKEN_EXPIRADO" })] });
    expect(screen.getByText(/Token expirado/)).toBeInTheDocument();
  });

  it("una cuenta VALIDO con tokenExpiraEn dentro de los 7 días muestra «Token próximo a vencer»", () => {
    const tokenExpiraEn = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    renderList({ cuentas: [cuentaFake({ estadoToken: "VALIDO", tokenExpiraEn })] });
    expect(screen.getByText(/Token próximo a vencer/)).toBeInTheDocument();
  });

  it("una cuenta VALIDO con tokenExpiraEn lejano muestra «Token vigente» con la fecha", () => {
    const tokenExpiraEn = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
    renderList({ cuentas: [cuentaFake({ estadoToken: "VALIDO", tokenExpiraEn })] });
    expect(screen.getByText(/Token vigente/)).toBeInTheDocument();
  });

  it("una cuenta con estadoToken ERROR muestra «Error de verificación»", () => {
    renderList({ cuentas: [cuentaFake({ estadoToken: "ERROR" })] });
    expect(screen.getByText(/Error de verificación/)).toBeInTheDocument();
  });
});

describe("CuentasPublicitariasList — LinkedIn: adaptador OAuth todavía no conectado (gap de backend confirmado)", () => {
  it("no ofrece un formulario de token funcional -- solo el aviso Fase 2, sin llamar a Graph API por error", () => {
    renderList({ redSocial: "LINKEDIN" });

    expect(screen.queryByLabelText("Token")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Probar conexión" })).not.toBeInTheDocument();
    expect(screen.getByText(/Fase 2/i)).toBeInTheDocument();
  });
});

describe("CuentasPublicitariasList — X/Google Forms (CLAVE_API): sin controles de token por cuenta", () => {
  it("no muestra ningún control de credencial en la fila (la clave se administra a nivel de bridge)", () => {
    renderList({ redSocial: "X" });

    expect(screen.queryByLabelText("Token")).not.toBeInTheDocument();
    expect(screen.queryByText(/Fase 2/i)).not.toBeInTheDocument();
  });
});
