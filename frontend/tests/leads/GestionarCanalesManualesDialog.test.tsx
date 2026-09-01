import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/httpClient";
import type { CanalManual } from "@/funcionalidades/leads/canal-manual.api";

vi.mock("@/funcionalidades/leads/canal-manual.api", () => ({
  fetchCanalesManualesApi: vi.fn(),
  createCanalManualApi: vi.fn(),
  updateCanalManualApi: vi.fn(),
  createLeadManualApi: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const canalManualApi = await import("@/funcionalidades/leads/canal-manual.api");
const { GestionarCanalesManualesDialog } = await import(
  "@/funcionalidades/leads/GestionarCanalesManualesDialog"
);

const fetchCanalesManualesApiMock = vi.mocked(canalManualApi.fetchCanalesManualesApi);
const createCanalManualApiMock = vi.mocked(canalManualApi.createCanalManualApi);
const updateCanalManualApiMock = vi.mocked(canalManualApi.updateCanalManualApi);

function canalFake(overrides: Partial<CanalManual> = {}): CanalManual {
  return {
    id: "canal-1",
    empresaId: "empresa-1",
    nombre: "Referido",
    activo: true,
    creadoEn: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function renderDialog() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <GestionarCanalesManualesDialog open onOpenChange={onOpenChange} empresaId="empresa-1" />
    </QueryClientProvider>,
  );
  return { onOpenChange };
}

beforeEach(() => {
  fetchCanalesManualesApiMock.mockReset();
  createCanalManualApiMock.mockReset();
  updateCanalManualApiMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GestionarCanalesManualesDialog — estados de carga, vacío y error", () => {
  it("muestra un esqueleto de carga mientras llega el catálogo", async () => {
    let resolver: (value: CanalManual[]) => void = () => {};
    fetchCanalesManualesApiMock.mockReturnValue(
      new Promise((resolve) => {
        resolver = resolve;
      }),
    );

    renderDialog();

    expect(screen.getByRole("status", { name: "Cargando" })).toBeInTheDocument();

    resolver([canalFake()]);
    await waitFor(() =>
      expect(screen.queryByRole("status", { name: "Cargando" })).not.toBeInTheDocument(),
    );
  });

  it("muestra un estado vacío cuando el catálogo no tiene canales", async () => {
    fetchCanalesManualesApiMock.mockResolvedValue([]);

    renderDialog();

    expect(
      await screen.findByText("Todavía no hay canales configurados"),
    ).toBeInTheDocument();
  });

  it("muestra un mensaje de error accionable (nunca un código HTTP) con botón de reintentar", async () => {
    fetchCanalesManualesApiMock.mockRejectedValue(new Error("boom"));

    renderDialog();

    expect(
      await screen.findByText("Ocurrió un error inesperado. Intenta nuevamente en unos segundos."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });
});

describe("GestionarCanalesManualesDialog — listado", () => {
  it("lista los canales con su nombre y estado activo/inactivo", async () => {
    fetchCanalesManualesApiMock.mockResolvedValue([
      canalFake({ id: "canal-1", nombre: "Referido", activo: true }),
      canalFake({ id: "canal-2", nombre: "Feria/evento", activo: false }),
    ]);

    renderDialog();

    expect(await screen.findByText("Referido")).toBeInTheDocument();
    expect(screen.getByText("Feria/evento")).toBeInTheDocument();
    expect(screen.getAllByText("Activo")).toHaveLength(1);
    expect(screen.getAllByText("Inactivo")).toHaveLength(1);
  });
});

describe("GestionarCanalesManualesDialog — alta de canal", () => {
  it("agrega un canal nuevo con el nombre ingresado", async () => {
    fetchCanalesManualesApiMock.mockResolvedValue([canalFake()]);
    createCanalManualApiMock.mockResolvedValue(
      canalFake({ id: "canal-9", nombre: "WhatsApp directo" }),
    );
    const user = userEvent.setup();

    renderDialog();
    await screen.findByText("Referido");

    await user.type(screen.getByLabelText("Nuevo canal"), "WhatsApp directo");
    await user.click(screen.getByRole("button", { name: "Agregar" }));

    await waitFor(() =>
      expect(createCanalManualApiMock).toHaveBeenCalledWith("empresa-1", {
        nombre: "WhatsApp directo",
      }),
    );
  });

  it("mientras se agrega, el botón muestra «Agregando…» y queda deshabilitado", async () => {
    fetchCanalesManualesApiMock.mockResolvedValue([canalFake()]);
    let resolverCrear: (value: CanalManual) => void = () => {};
    createCanalManualApiMock.mockReturnValue(
      new Promise((resolve) => {
        resolverCrear = resolve;
      }),
    );
    const user = userEvent.setup();

    renderDialog();
    await screen.findByText("Referido");

    await user.type(screen.getByLabelText("Nuevo canal"), "WhatsApp directo");
    await user.click(screen.getByRole("button", { name: "Agregar" }));

    expect(await screen.findByRole("button", { name: "Agregando…" })).toBeDisabled();

    resolverCrear(canalFake({ id: "canal-9", nombre: "WhatsApp directo" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Agregar" })).not.toBeDisabled(),
    );
  });

  it("rechaza un nombre vacío sin llamar a la API", async () => {
    fetchCanalesManualesApiMock.mockResolvedValue([canalFake()]);
    const user = userEvent.setup();

    renderDialog();
    await screen.findByText("Referido");

    await user.click(screen.getByRole("button", { name: "Agregar" }));

    expect(await screen.findByText("Ingresa el nombre del canal.")).toBeInTheDocument();
    expect(createCanalManualApiMock).not.toHaveBeenCalled();
  });

  it("ante un nombre duplicado (409), muestra el mensaje accionable de la API", async () => {
    fetchCanalesManualesApiMock.mockResolvedValue([canalFake()]);
    createCanalManualApiMock.mockRejectedValue(
      new ApiError("canal_manual_duplicado", 409, "Ya existe un canal con ese nombre en esta empresa."),
    );
    const user = userEvent.setup();

    renderDialog();
    await screen.findByText("Referido");

    await user.type(screen.getByLabelText("Nuevo canal"), "Referido");
    await user.click(screen.getByRole("button", { name: "Agregar" }));

    await waitFor(() => expect(createCanalManualApiMock).toHaveBeenCalledTimes(1));
    // `crear.isError` se renderiza inline (mismo criterio que el error de
    // `fetchCanalesManualesApi` vía `getErrorMessage`/`ErrorState`) -- el
    // 409 por nombre duplicado ya no falla en silencio. El campo conserva lo
    // escrito porque no hay `reset()` en el `onError` (`reset()` solo corre
    // en `onSuccess`), lo cual es correcto: el usuario puede corregir el
    // nombre sin volver a tipearlo entero.
    expect(
      await screen.findByText("Ya existe un canal con ese nombre en esta empresa."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Nuevo canal")).toHaveValue("Referido");
  });
});

describe("GestionarCanalesManualesDialog — renombrar", () => {
  it("entra en modo edición, cambia el nombre y guarda", async () => {
    fetchCanalesManualesApiMock.mockResolvedValue([canalFake({ nombre: "Referido" })]);
    updateCanalManualApiMock.mockResolvedValue(canalFake({ nombre: "Referido VIP" }));
    const user = userEvent.setup();

    renderDialog();
    await screen.findByText("Referido");

    await user.click(screen.getByRole("button", { name: "Editar" }));

    const input = screen.getByLabelText("Nuevo nombre para Referido");
    await user.clear(input);
    await user.type(input, "Referido VIP");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(updateCanalManualApiMock).toHaveBeenCalledWith("empresa-1", "canal-1", {
        nombre: "Referido VIP",
      }),
    );
  });

  it("mientras guarda el renombre, el botón muestra «Guardando…» y los controles quedan deshabilitados", async () => {
    fetchCanalesManualesApiMock.mockResolvedValue([canalFake({ nombre: "Referido" })]);
    let resolverActualizar: (value: CanalManual) => void = () => {};
    updateCanalManualApiMock.mockReturnValue(
      new Promise((resolve) => {
        resolverActualizar = resolve;
      }),
    );
    const user = userEvent.setup();

    renderDialog();
    await screen.findByText("Referido");

    await user.click(screen.getByRole("button", { name: "Editar" }));
    const input = screen.getByLabelText("Nuevo nombre para Referido");
    await user.clear(input);
    await user.type(input, "Referido VIP");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByRole("button", { name: "Guardando…" })).toBeDisabled();
    expect(screen.getByLabelText("Nuevo nombre para Referido")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();

    resolverActualizar(canalFake({ nombre: "Referido VIP" }));
    // La invalidación de `useActualizarCanalManual` dispara un refetch --
    // como `fetchCanalesManualesApiMock` sigue devolviendo el mismo mock
    // ("Referido"), no se afirma acá sobre el nombre final mostrado (eso lo
    // cubre el hook dedicado, `useCanalesManuales.test.tsx`); se verifica
    // que la fila vuelve a modo lectura (sale de edición) al terminar.
    await waitFor(() =>
      expect(screen.queryByLabelText("Nuevo nombre para Referido")).not.toBeInTheDocument(),
    );
  });

  it("«Cancelar» en modo edición vuelve a la fila normal sin llamar a la API", async () => {
    fetchCanalesManualesApiMock.mockResolvedValue([canalFake({ nombre: "Referido" })]);
    const user = userEvent.setup();

    renderDialog();
    await screen.findByText("Referido");

    await user.click(screen.getByRole("button", { name: "Editar" }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByLabelText("Nuevo nombre para Referido")).not.toBeInTheDocument();
    expect(updateCanalManualApiMock).not.toHaveBeenCalled();
  });
});

describe("GestionarCanalesManualesDialog — activar/desactivar", () => {
  it("desactiva un canal activo", async () => {
    fetchCanalesManualesApiMock.mockResolvedValue([canalFake({ activo: true })]);
    updateCanalManualApiMock.mockResolvedValue(canalFake({ activo: false }));
    const user = userEvent.setup();

    renderDialog();
    await screen.findByText("Referido");

    await user.click(screen.getByRole("button", { name: "Desactivar" }));

    await waitFor(() =>
      expect(updateCanalManualApiMock).toHaveBeenCalledWith("empresa-1", "canal-1", { activo: false }),
    );
  });

  it("activa un canal inactivo", async () => {
    fetchCanalesManualesApiMock.mockResolvedValue([canalFake({ activo: false })]);
    updateCanalManualApiMock.mockResolvedValue(canalFake({ activo: true }));
    const user = userEvent.setup();

    renderDialog();
    await screen.findByText("Referido");

    await user.click(screen.getByRole("button", { name: "Activar" }));

    await waitFor(() =>
      expect(updateCanalManualApiMock).toHaveBeenCalledWith("empresa-1", "canal-1", { activo: true }),
    );
  });
});
