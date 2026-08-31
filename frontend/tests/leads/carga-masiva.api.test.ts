import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `carga-masiva.api.ts` -- backend real (ver el docblock del archivo).
 * Mismo patrón de mockeo de `httpClient` que `canal-manual.api.test.ts` /
 * `frontend/tests/usuarios/usuarios.api.test.ts`.
 */

vi.mock("@/api/httpClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/httpClient")>();
  return {
    ...actual,
    httpClient: {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    },
  };
});

const { httpClient } = await import("@/api/httpClient");
const { crearLeadsMasivoApi } = await import("@/funcionalidades/leads/carga-masiva.api");

const postMock = vi.mocked(httpClient.post);

beforeEach(() => {
  postMock.mockReset();
});

describe("crearLeadsMasivoApi", () => {
  it("llama a POST /leads/carga-masiva con el body completo (empresaId, canalManualId de lote, leads)", async () => {
    postMock.mockResolvedValue({
      resumen: { solicitados: 1, creados: 1, duplicados: 0, fallidos: 0 },
      resultados: [{ fila: 1, estado: "creado", leadId: "lead-9" }],
    });

    const respuesta = await crearLeadsMasivoApi({
      empresaId: "empresa-1",
      canalManualId: "canal-lote",
      leads: [{ nombre: "María Cabrera", telefono: "0991234567" }],
    });

    expect(postMock).toHaveBeenCalledWith("/leads/carga-masiva", {
      empresaId: "empresa-1",
      canalManualId: "canal-lote",
      leads: [{ nombre: "María Cabrera", telefono: "0991234567" }],
    });
    expect(respuesta.resumen.creados).toBe(1);
    expect(respuesta.resultados[0]).toMatchObject({ fila: 1, estado: "creado", leadId: "lead-9" });
  });

  it("manda el canalManualId de fila junto al de lote cuando la fila trae el suyo propio", async () => {
    postMock.mockResolvedValue({
      resumen: { solicitados: 1, creados: 1, duplicados: 0, fallidos: 0 },
      resultados: [{ fila: 1, estado: "creado", leadId: "lead-9" }],
    });

    await crearLeadsMasivoApi({
      canalManualId: "canal-lote",
      leads: [{ nombre: "Fila con canal propio", telefono: "1", canalManualId: "canal-fila" }],
    });

    expect(postMock).toHaveBeenCalledWith("/leads/carga-masiva", {
      canalManualId: "canal-lote",
      leads: [{ nombre: "Fila con canal propio", telefono: "1", canalManualId: "canal-fila" }],
    });
  });

  it("propaga la respuesta con filas «duplicado» y «error» tal cual vienen del backend", async () => {
    postMock.mockResolvedValue({
      resumen: { solicitados: 3, creados: 1, duplicados: 1, fallidos: 1 },
      resultados: [
        { fila: 1, estado: "creado", leadId: "lead-1" },
        { fila: 2, estado: "duplicado", leadId: "lead-existente" },
        { fila: 3, estado: "error", motivo: "telefono y correo ausentes" },
      ],
    });

    const respuesta = await crearLeadsMasivoApi({
      leads: [
        { nombre: "A", telefono: "1" },
        { nombre: "B", correo: "b@test.com" },
        { nombre: "C" },
      ],
    });

    expect(respuesta.resumen).toEqual({ solicitados: 3, creados: 1, duplicados: 1, fallidos: 1 });
    expect(respuesta.resultados[2]).toMatchObject({ estado: "error", motivo: "telefono y correo ausentes" });
  });

  it("propaga el error de red/HTTP sin transformarlo", async () => {
    const { ApiError } = await import("@/api/httpClient");
    postMock.mockRejectedValue(new ApiError("error_desconocido", 500, "Ocurrió un error inesperado."));

    await expect(crearLeadsMasivoApi({ leads: [{ nombre: "A", telefono: "1" }] })).rejects.toMatchObject({
      status: 500,
    });
  });
});
