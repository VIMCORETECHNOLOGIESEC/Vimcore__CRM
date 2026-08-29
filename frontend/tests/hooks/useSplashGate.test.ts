import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSplashGate } from "@/hooks/useSplashGate";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useSplashGate", () => {
  it("se mantiene activo mientras `cargando` es true, sin importar el tiempo transcurrido", () => {
    const { result } = renderHook(() => useSplashGate(true, 1500));
    expect(result.current).toBe(true);

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current).toBe(true);
  });

  it("no se apaga antes del piso minimo aunque `cargando` ya sea false", () => {
    const { result } = renderHook(() => useSplashGate(false, 1500));
    expect(result.current).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1499);
    });
    expect(result.current).toBe(true);
  });

  it("se apaga justo al cumplirse el piso minimo si `cargando` ya es false", () => {
    const { result } = renderHook(() => useSplashGate(false, 1500));

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(result.current).toBe(false);
  });

  it("se extiende mas alla del piso si `cargando` sigue true cuando el piso se cumple", () => {
    const { result, rerender } = renderHook(({ cargando }) => useSplashGate(cargando, 1500), {
      initialProps: { cargando: true },
    });

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current).toBe(true);

    rerender({ cargando: false });
    expect(result.current).toBe(false);
  });
});
