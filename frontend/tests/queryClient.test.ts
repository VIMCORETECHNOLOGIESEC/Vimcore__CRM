import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

const { toast } = await import("sonner");
const { queryClient } = await import("@/api/queryClient");
const { ApiError } = await import("@/api/httpClient");

const toastErrorMock = vi.mocked(toast.error);

afterEach(() => {
  toastErrorMock.mockClear();
});

describe("queryClient — manejo global de errores", () => {
  it("QueryCache.onError muestra el mensaje accionable de un ApiError vía sonner", () => {
    const onError = queryClient.getQueryCache().config.onError;
    expect(onError).toBeTypeOf("function");

    const error = new ApiError("no_encontrado", 404, "El lead solicitado no existe");
    // @ts-expect-error -- los demás argumentos de la firma no importan para esta prueba.
    onError?.(error);

    expect(toastErrorMock).toHaveBeenCalledWith("El lead solicitado no existe");
  });

  it("QueryCache.onError cae al mensaje genérico ante un error que no es ApiError", () => {
    const onError = queryClient.getQueryCache().config.onError;

    // @ts-expect-error -- los demás argumentos de la firma no importan para esta prueba.
    onError?.(new Error("fallo interno sin forma conocida"));

    expect(toastErrorMock).toHaveBeenCalledWith(
      "Ocurrió un error inesperado. Intenta nuevamente en unos segundos.",
    );
  });

  it("MutationCache.onError también muestra el mensaje accionable vía sonner", () => {
    const onError = queryClient.getMutationCache().config.onError;
    expect(onError).toBeTypeOf("function");

    const error = new ApiError("conflicto", 409, "El lead ya fue asignado a otro asesor");
    // @ts-expect-error -- los demás argumentos de la firma no importan para esta prueba.
    onError?.(error);

    expect(toastErrorMock).toHaveBeenCalledWith("El lead ya fue asignado a otro asesor");
  });

  it("las queries reintentan una sola vez (retry: 1), evitando reintentos silenciosos indefinidos", () => {
    expect(queryClient.getDefaultOptions().queries?.retry).toBe(1);
  });

  it("las mutaciones no reintentan automáticamente (retry: 0)", () => {
    expect(queryClient.getDefaultOptions().mutations?.retry).toBe(0);
  });
});
