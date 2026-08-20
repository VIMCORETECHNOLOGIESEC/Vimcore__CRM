import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useVentanaGrafico, type FilaVentana } from "@/funcionalidades/dashboard/useVentanaGrafico";

interface FilaTest extends FilaVentana {
  total: number;
}

function filas(cantidad: number): FilaTest[] {
  return Array.from({ length: cantidad }, (_, i) => ({
    id: `id-${i}`,
    nombre: `Fila ${i}`,
    total: cantidad - i,
  }));
}

describe("useVentanaGrafico", () => {
  it("con menos filas que el tamaño de ventana, muestra todas en una sola página", () => {
    const { result } = renderHook(() => useVentanaGrafico(filas(5), 8));
    expect(result.current.visibles).toHaveLength(5);
    expect(result.current.totalPaginas).toBe(1);
    expect(result.current.pagina).toBe(0);
  });

  it("recorta a `tamanoVentana` filas por página sin reordenar ni perder datos", () => {
    const { result } = renderHook(() => useVentanaGrafico(filas(20), 8));
    expect(result.current.visibles).toHaveLength(8);
    expect(result.current.visibles.map((f) => f.id)).toEqual(["id-0", "id-1", "id-2", "id-3", "id-4", "id-5", "id-6", "id-7"]);
    expect(result.current.totalPaginas).toBe(3);
  });

  it("irAPagina cambia la ventana visible a la página pedida", () => {
    const { result } = renderHook(() => useVentanaGrafico(filas(20), 8));
    act(() => result.current.irAPagina(2));
    expect(result.current.pagina).toBe(2);
    expect(result.current.visibles.map((f) => f.id)).toEqual(["id-16", "id-17", "id-18", "id-19"]);
  });

  it("seleccionar salta a la página que contiene el id y lo marca como resaltado", () => {
    const { result } = renderHook(() => useVentanaGrafico(filas(20), 8));
    act(() => result.current.seleccionar("id-17"));
    expect(result.current.pagina).toBe(2);
    expect(result.current.resaltadoId).toBe("id-17");
    expect(result.current.visibles.map((f) => f.id)).toContain("id-17");
  });

  it("seleccionar con un id inexistente no cambia la página ni el resalte", () => {
    const { result } = renderHook(() => useVentanaGrafico(filas(20), 8));
    act(() => result.current.seleccionar("no-existe"));
    expect(result.current.pagina).toBe(0);
    expect(result.current.resaltadoId).toBeNull();
  });

  it("si `filas` se reduce y la página actual queda fuera de rango, se acota a la última página válida", () => {
    const { result, rerender } = renderHook(
      ({ datos }: { datos: FilaTest[] }) => useVentanaGrafico(datos, 8),
      { initialProps: { datos: filas(20) } },
    );
    act(() => result.current.irAPagina(2));
    expect(result.current.pagina).toBe(2);

    rerender({ datos: filas(5) });
    expect(result.current.totalPaginas).toBe(1);
    expect(result.current.pagina).toBe(0);
    expect(result.current.visibles).toHaveLength(5);
  });
});
