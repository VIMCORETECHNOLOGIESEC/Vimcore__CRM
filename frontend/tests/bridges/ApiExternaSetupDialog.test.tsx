import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getErrorMessage } from "@/api/httpClient";

/**
 * `ApiExternaSetupDialog` -- asistente de 3 pasos que configura y prueba un
 * bridge `API_EXTERNA` ya creado (`bridgeId` real, `docs/contrato-frontend-bridge-api_mat_01.md`).
 * Mismo patrón que `BridgesPage.test.tsx`: la capa `.api.ts` mockeada
 * directamente (no `httpClient`), cada paso avanza solo cuando la mutación
 * resuelve 200.
 */
vi.mock("@/funcionalidades/bridges/bridge-api-externa.api", () => ({
  saveConexionApiExternaApi: vi.fn(),
  saveMapeoApiExternaApi: vi.fn(),
  testConexionApiExternaApi: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const bridgeApiExternaApi = await import("@/funcionalidades/bridges/bridge-api-externa.api");
const { ApiExternaSetupDialog } = await import("@/funcionalidades/bridges/ApiExternaSetupDialog");

const saveConexionMock = vi.mocked(bridgeApiExternaApi.saveConexionApiExternaApi);
const saveMapeoMock = vi.mocked(bridgeApiExternaApi.saveMapeoApiExternaApi);
const testConexionMock = vi.mocked(bridgeApiExternaApi.testConexionApiExternaApi);

function bridgeApiConfigFake(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "bridge-1",
    redSocial: "API_EXTERNA",
    configuracionJson: {
      url: "https://api.ejemplo.com/leads",
      nombreHeaderApiKey: "X-Api-Key",
      mapeoCampos: { id: "idExternoLead" },
    },
    ...overrides,
  };
}

function renderDialog(onClose = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    mutationCache: new MutationCache({ onError: () => {} }),
  });
  render(
    <QueryClientProvider client={client}>
      <ApiExternaSetupDialog open bridgeId="bridge-1" nombre="Sistema de reservas" onClose={onClose} />
    </QueryClientProvider>,
  );
  return { onClose };
}

async function completarPasoConexion(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Dirección de tus leads"), "https://api.ejemplo.com/leads");
  await user.type(screen.getByLabelText("Llave de acceso"), "clave-secreta");
  await user.click(screen.getByRole("button", { name: "Continuar" }));
  await waitFor(() => expect(saveConexionMock).toHaveBeenCalled());
}

beforeEach(() => {
  saveConexionMock.mockReset();
  saveMapeoMock.mockReset();
  testConexionMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ApiExternaSetupDialog — paso 1, conexión (PATCH /bridges/:id/api-externa/conexion)", () => {
  it("rechaza el envío sin URL ni llave, sin llamar a saveConexionApiExternaApi", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(await screen.findByText("Ingresa una dirección web válida.")).toBeInTheDocument();
    expect(saveConexionMock).not.toHaveBeenCalled();
  });

  it("con datos válidos, manda bridgeId + url + credencialExterna + nombreHeaderApiKey (default X-Api-Key) y avanza al paso 2", async () => {
    saveConexionMock.mockResolvedValue(bridgeApiConfigFake());
    const user = userEvent.setup();
    renderDialog();

    await completarPasoConexion(user);

    expect(saveConexionMock).toHaveBeenCalledWith("bridge-1", {
      url: "https://api.ejemplo.com/leads",
      credencialExterna: "clave-secreta",
      nombreHeaderApiKey: "X-Api-Key",
    });
    expect(await screen.findByText("Cuéntanos qué significa cada dato")).toBeInTheDocument();
  });

  it("si el backend rechaza la conexión, muestra el mensaje de error y NO avanza de paso", async () => {
    saveConexionMock.mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText("Dirección de tus leads"), "https://api.ejemplo.com/leads");
    await user.type(screen.getByLabelText("Llave de acceso"), "clave-secreta");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(
      await screen.findByText("Ocurrió un error inesperado. Intenta nuevamente en unos segundos."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Dirección de tus leads")).toBeInTheDocument();
    expect(screen.queryByText("Cuéntanos qué significa cada dato")).not.toBeInTheDocument();
  });
});

describe("ApiExternaSetupDialog — paso 2, mapeo de campos (PATCH /bridges/:id/api-externa/mapeo)", () => {
  it("el renglón inicial ya mapea a idExternoLead: continuar manda ese mapeo y avanza al paso 3", async () => {
    saveConexionMock.mockResolvedValue(bridgeApiConfigFake());
    saveMapeoMock.mockResolvedValue(bridgeApiConfigFake());
    const user = userEvent.setup();
    renderDialog();
    await completarPasoConexion(user);
    await screen.findByText("Cuéntanos qué significa cada dato");

    await user.click(screen.getByRole("button", { name: "Guardar y continuar" }));

    await waitFor(() =>
      expect(saveMapeoMock).toHaveBeenCalledWith("bridge-1", {
        mapeoCampos: { id: "idExternoLead" },
        parametroFecha: undefined,
      }),
    );
    expect(await screen.findByText("Probemos que todo funcione")).toBeInTheDocument();
  });

  it("si ningún renglón mapea a idExternoLead, bloquea el avance sin llamar al backend", async () => {
    saveConexionMock.mockResolvedValue(bridgeApiConfigFake());
    const user = userEvent.setup();
    renderDialog();
    await completarPasoConexion(user);
    await screen.findByText("Cuéntanos qué significa cada dato");

    await user.click(screen.getByRole("combobox", { name: "Campo interno 1" }));
    await user.click(await screen.findByRole("option", { name: "nombre" }));
    await user.click(screen.getByRole("button", { name: "Guardar y continuar" }));

    expect(
      await screen.findByText(/Marca al menos un campo como idExternoLead/),
    ).toBeInTheDocument();
    expect(saveMapeoMock).not.toHaveBeenCalled();
  });

  it("manda el parámetro de fecha opcional cuando se completa", async () => {
    saveConexionMock.mockResolvedValue(bridgeApiConfigFake());
    saveMapeoMock.mockResolvedValue(bridgeApiConfigFake());
    const user = userEvent.setup();
    renderDialog();
    await completarPasoConexion(user);
    await screen.findByText("Cuéntanos qué significa cada dato");

    await user.type(screen.getByLabelText(/Parámetro de fecha/), "updated_since");
    await user.click(screen.getByRole("button", { name: "Guardar y continuar" }));

    await waitFor(() =>
      expect(saveMapeoMock).toHaveBeenCalledWith("bridge-1", {
        mapeoCampos: { id: "idExternoLead" },
        parametroFecha: "updated_since",
      }),
    );
  });

  it("si el backend rechaza el mapeo, muestra el mensaje de error y NO avanza de paso", async () => {
    saveConexionMock.mockResolvedValue(bridgeApiConfigFake());
    saveMapeoMock.mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    renderDialog();
    await completarPasoConexion(user);
    await screen.findByText("Cuéntanos qué significa cada dato");

    await user.click(screen.getByRole("button", { name: "Guardar y continuar" }));

    expect(
      await screen.findByText("Ocurrió un error inesperado. Intenta nuevamente en unos segundos."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Probemos que todo funcione")).not.toBeInTheDocument();
  });
});

describe("ApiExternaSetupDialog — paso 3, probar conexión (POST /bridges/:id/api-externa/probar-conexion)", () => {
  async function llegarAlPasoDePrueba(user: ReturnType<typeof userEvent.setup>) {
    saveConexionMock.mockResolvedValue(bridgeApiConfigFake());
    saveMapeoMock.mockResolvedValue(bridgeApiConfigFake());
    renderDialog();
    await completarPasoConexion(user);
    await screen.findByText("Cuéntanos qué significa cada dato");
    await user.click(screen.getByRole("button", { name: "Guardar y continuar" }));
    await screen.findByText("Probemos que todo funcione");
  }

  it("muestra el mensaje real y la cantidad de leads cuando `ok: true`, y habilita Finalizar", async () => {
    const user = userEvent.setup();
    await llegarAlPasoDePrueba(user);
    testConexionMock.mockResolvedValue({ ok: true, mensaje: "Conexión verificada correctamente.", cantidadLeads: 12 });

    await user.click(screen.getByRole("button", { name: "Probar conexión" }));

    expect(testConexionMock).toHaveBeenCalledWith("bridge-1");
    expect(await screen.findByText("Conexión verificada correctamente.")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Finalizar" })).toBeEnabled();
  });

  it("muestra el motivo real cuando `ok: false`, sin bloquear un reintento, y Finalizar sigue deshabilitado", async () => {
    const user = userEvent.setup();
    await llegarAlPasoDePrueba(user);
    testConexionMock.mockResolvedValue({ ok: false, mensaje: "No se pudo conectar con la URL configurada." });

    await user.click(screen.getByRole("button", { name: "Probar conexión" }));

    expect(await screen.findByText("No se pudo conectar con la URL configurada.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Finalizar" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Probar conexión" })).toBeEnabled();
  });

  it("Finalizar está deshabilitado antes de probar la conexión", async () => {
    const user = userEvent.setup();
    await llegarAlPasoDePrueba(user);

    expect(screen.getByRole("button", { name: "Finalizar" })).toBeDisabled();
  });
});

describe("ApiExternaSetupDialog — llama a getErrorMessage para nunca mostrar un código HTTP crudo", () => {
  it("el mensaje mostrado coincide con getErrorMessage(error)", async () => {
    const error = new Error("boom");
    saveConexionMock.mockRejectedValue(error);
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText("Dirección de tus leads"), "https://api.ejemplo.com/leads");
    await user.type(screen.getByLabelText("Llave de acceso"), "clave-secreta");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(await screen.findByText(getErrorMessage(error))).toBeInTheDocument();
  });
});
