import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversacionListItem, Mensaje } from "@/tipos/conversacion";

/**
 * Hooks de la bandeja de conversaciones. `conversaciones.api` mockeado; se
 * verifica la composición de query keys, el ordenado/acumulado del historial
 * y la invalidación tras enviar. Mismo criterio de aislamiento que los tests
 * de `bridges`/`whatsapp`.
 */
vi.mock("@/funcionalidades/whatsapp/conversaciones.api", () => ({
  LIMITES_CONVERSACIONES: [10, 25, 50, 100],
  LONGITUD_MAXIMA_MENSAJE: 4096,
  listarConversacionesApi: vi.fn(),
  listarMensajesApi: vi.fn(),
  enviarMensajeApi: vi.fn(),
}));

const api = await import("@/funcionalidades/whatsapp/conversaciones.api");
const {
  CONVERSACIONES_QUERY_KEY,
  useConversaciones,
  useMensajesConversacion,
  useEnviarMensaje,
} = await import("@/funcionalidades/whatsapp/useConversaciones");

const listarConversacionesApiMock = vi.mocked(api.listarConversacionesApi);
const listarMensajesApiMock = vi.mocked(api.listarMensajesApi);
const enviarMensajeApiMock = vi.mocked(api.enviarMensajeApi);

function crearEntorno() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return { client, wrapper };
}

function conversacionFake(overrides: Partial<ConversacionListItem> = {}): ConversacionListItem {
  return {
    id: "conv-1",
    clienteId: "cli-1",
    clienteNombre: "Ana Gómez",
    clienteTelefono: "+54 9 11 5555-1234",
    asesorId: "u1",
    asesorNombre: "Carlos Ruiz",
    ultimoMensajeEn: "2026-08-30T10:05:00.000Z",
    creadaEn: "2026-08-29T09:00:00.000Z",
    ...overrides,
  };
}

function mensajeFake(id: string, enviadoEn: string, overrides: Partial<Mensaje> = {}): Mensaje {
  return {
    id,
    conversacionId: "conv-1",
    direccion: "ENTRANTE",
    texto: `texto ${id}`,
    usuarioId: null,
    enviadoEn,
    ...overrides,
  };
}

beforeEach(() => {
  listarConversacionesApiMock.mockReset();
  listarMensajesApiMock.mockReset();
  enviarMensajeApiMock.mockReset();
});

describe("useConversaciones", () => {
  it("consulta /conversaciones con { pagina, limite } y expone la respuesta", async () => {
    listarConversacionesApiMock.mockResolvedValue({
      conversaciones: [conversacionFake()],
      total: 1,
    });
    const { wrapper } = crearEntorno();

    const { result } = renderHook(() => useConversaciones({ pagina: 1, limite: 25 }), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(listarConversacionesApiMock).toHaveBeenCalledWith({ pagina: 1, limite: 25 });
    expect(result.current.data?.total).toBe(1);
  });
});

describe("useMensajesConversacion", () => {
  it("invierte una página 'enviadoEn desc' a orden cronológico ascendente", async () => {
    listarMensajesApiMock.mockResolvedValue({
      mensajes: [
        mensajeFake("m3", "2026-08-30T10:03:00.000Z"),
        mensajeFake("m2", "2026-08-30T10:02:00.000Z"),
        mensajeFake("m1", "2026-08-30T10:01:00.000Z"),
      ],
      total: 3,
    });
    const { wrapper } = crearEntorno();

    const { result } = renderHook(() => useMensajesConversacion("conv-1"), { wrapper });

    await waitFor(() => expect(result.current.mensajes).toHaveLength(3));
    expect(result.current.mensajes.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
    expect(result.current.hayMas).toBe(false);
  });

  it("acumula páginas más viejas al pedir 'cargar anteriores'", async () => {
    listarMensajesApiMock.mockImplementation((_id, params) => {
      if (params.pagina === 1) {
        return Promise.resolve({
          mensajes: [
            mensajeFake("m4", "2026-08-30T10:04:00.000Z"),
            mensajeFake("m3", "2026-08-30T10:03:00.000Z"),
          ],
          total: 4,
        });
      }
      return Promise.resolve({
        mensajes: [
          mensajeFake("m2", "2026-08-30T10:02:00.000Z"),
          mensajeFake("m1", "2026-08-30T10:01:00.000Z"),
        ],
        total: 4,
      });
    });
    const { wrapper } = crearEntorno();

    const { result } = renderHook(() => useMensajesConversacion("conv-1"), { wrapper });

    await waitFor(() => expect(result.current.mensajes).toHaveLength(2));
    expect(result.current.hayMas).toBe(true);

    result.current.cargarAnteriores();

    await waitFor(() => expect(result.current.mensajes).toHaveLength(4));
    expect(result.current.mensajes.map((m) => m.id)).toEqual(["m1", "m2", "m3", "m4"]);
    expect(result.current.hayMas).toBe(false);
    expect(listarMensajesApiMock).toHaveBeenLastCalledWith("conv-1", { pagina: 2, limite: 25 });
  });

  it("descarta mensajes de otra conversación (defensa ante datos residuales)", async () => {
    listarMensajesApiMock.mockResolvedValue({
      mensajes: [mensajeFake("m1", "2026-08-30T10:01:00.000Z", { conversacionId: "otra" })],
      total: 1,
    });
    const { wrapper } = crearEntorno();

    const { result } = renderHook(() => useMensajesConversacion("conv-1"), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.mensajes).toHaveLength(0);
  });
});

describe("useEnviarMensaje", () => {
  it("al confirmar, invalida el hilo afectado y el listado", async () => {
    enviarMensajeApiMock.mockResolvedValue(
      mensajeFake("m9", "2026-08-30T10:09:00.000Z", { direccion: "SALIENTE", texto: "hola" }),
    );
    const { client, wrapper } = crearEntorno();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries").mockResolvedValue();

    const { result } = renderHook(() => useEnviarMensaje("conv-1"), { wrapper });
    result.current.mutate("hola");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(enviarMensajeApiMock).toHaveBeenCalledWith("conv-1", "hola");
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: [CONVERSACIONES_QUERY_KEY, "conv-1", "mensajes"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [CONVERSACIONES_QUERY_KEY] });
  });
});
