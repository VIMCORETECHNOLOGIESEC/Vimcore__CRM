import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mensaje } from "@/tipos/conversacion";

/**
 * `conversaciones.api.ts` -- secciones 4-6 del contrato real
 * (`docs/contrato-frontend-whatsapp-api_mat_04.md`). Mismo patrón que
 * `whatsapp.api.test.ts`: `httpClient` mockeado, se verifica ruta/verbo/
 * params/body exactos y la forma que devuelve cada función.
 */
vi.mock("@/api/httpClient", () => ({
  httpClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const { httpClient } = await import("@/api/httpClient");
const { listarConversacionesApi, listarMensajesApi, enviarMensajeApi } = await import(
  "@/funcionalidades/whatsapp/conversaciones.api"
);

const getMock = vi.mocked(httpClient.get);
const postMock = vi.mocked(httpClient.post);

beforeEach(() => {
  getMock.mockReset();
  postMock.mockReset();
});

describe("listarConversacionesApi — GET /conversaciones", () => {
  it("manda pagina/limite y devuelve { conversaciones, total } sin envoltura", async () => {
    getMock.mockResolvedValue({ conversaciones: [], total: 0 });

    const resultado = await listarConversacionesApi({ pagina: 2, limite: 25 });

    expect(getMock).toHaveBeenCalledWith("/conversaciones", {
      params: { pagina: 2, limite: 25 },
    });
    expect(resultado).toEqual({ conversaciones: [], total: 0 });
  });

  it("manda clienteId cuando se lo pasa, aditivo a pagina/limite", async () => {
    getMock.mockResolvedValue({ conversaciones: [], total: 0 });

    await listarConversacionesApi({ pagina: 1, limite: 1, clienteId: "cliente-01" });

    expect(getMock).toHaveBeenCalledWith("/conversaciones", {
      params: { pagina: 1, limite: 1, clienteId: "cliente-01" },
    });
  });
});

describe("listarMensajesApi — GET /conversaciones/:id/mensajes", () => {
  it("interpola el id en la ruta y pagina la consulta", async () => {
    getMock.mockResolvedValue({ mensajes: [], total: 0 });

    await listarMensajesApi("conv-1", { pagina: 3, limite: 50 });

    expect(getMock).toHaveBeenCalledWith("/conversaciones/conv-1/mensajes", {
      params: { pagina: 3, limite: 50 },
    });
  });

  it("propaga tal cual el ApiError del backend (404, etc.)", async () => {
    getMock.mockRejectedValue(new Error("conversacion_no_encontrada"));

    await expect(listarMensajesApi("conv-x", { pagina: 1, limite: 25 })).rejects.toThrow(
      "conversacion_no_encontrada",
    );
  });
});

describe("enviarMensajeApi — POST /conversaciones/:id/mensajes", () => {
  it("postea { texto } y desenvuelve la respuesta { mensaje }", async () => {
    const mensaje: Mensaje = {
      id: "m1",
      conversacionId: "conv-1",
      direccion: "SALIENTE",
      texto: "Hola, ¿en qué te puedo ayudar?",
      usuarioId: "u1",
      enviadoEn: "2026-08-30T10:00:00.000Z",
    };
    postMock.mockResolvedValue({ mensaje });

    const resultado = await enviarMensajeApi("conv-1", "Hola, ¿en qué te puedo ayudar?");

    expect(postMock).toHaveBeenCalledWith("/conversaciones/conv-1/mensajes", {
      texto: "Hola, ¿en qué te puedo ayudar?",
    });
    expect(resultado).toEqual(mensaje);
  });
});
