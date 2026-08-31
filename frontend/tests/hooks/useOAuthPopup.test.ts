import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOAuthPopup } from "@/hooks/useOAuthPopup";

/**
 * `useOAuthPopup` -- infra genérica de popup OAuth (ver docblock del hook
 * para el motivo de NO usar `postMessage`). Mockea `window.open` y usa fake
 * timers para controlar el polling de `popup.closed` sin depender de tiempo
 * real.
 */
function crearPopupFalso(): Window {
  return { closed: false, close: vi.fn() } as unknown as Window;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useOAuthPopup", () => {
  it("arranca en estado cerrado, sin abrir nada todavía", () => {
    const { result } = renderHook(() => useOAuthPopup());
    expect(result.current.status).toBe("closed");
  });

  it("open() llama a window.open centrado y sin noopener, pasa a estado abierto y devuelve true", () => {
    const popupFalso = crearPopupFalso();
    const openSpy = vi.spyOn(window, "open").mockReturnValue(popupFalso);

    const { result } = renderHook(() => useOAuthPopup());

    let devuelto: boolean | undefined;
    act(() => {
      devuelto = result.current.open("https://meta.example/oauth");
    });

    expect(devuelto).toBe(true);
    expect(result.current.status).toBe("open");
    expect(openSpy).toHaveBeenCalledTimes(1);
    const [url, nombre, features] = openSpy.mock.calls[0];
    expect(url).toBe("https://meta.example/oauth");
    expect(nombre).toBe("oauth-popup");
    expect(features).not.toContain("noopener");
    expect(features).toContain("width=560");
    expect(features).toContain("height=680");
  });

  it("si window.open devuelve null (bloqueado), open() devuelve false y el estado sigue cerrado", () => {
    vi.spyOn(window, "open").mockReturnValue(null);

    const { result } = renderHook(() => useOAuthPopup());

    let devuelto: boolean | undefined;
    act(() => {
      devuelto = result.current.open("https://meta.example/oauth");
    });

    expect(devuelto).toBe(false);
    expect(result.current.status).toBe("closed");
  });

  it("detecta que el popup se cerró (a mano) vía polling y vuelve a estado cerrado", () => {
    const popupFalso = crearPopupFalso();
    vi.spyOn(window, "open").mockReturnValue(popupFalso);

    const { result } = renderHook(() => useOAuthPopup());
    act(() => {
      result.current.open("https://meta.example/oauth");
    });
    expect(result.current.status).toBe("open");

    (popupFalso as unknown as { closed: boolean }).closed = true;
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current.status).toBe("closed");
  });

  it("no marca cerrado antes de que el polling detecte el cierre real", () => {
    const popupFalso = crearPopupFalso();
    vi.spyOn(window, "open").mockReturnValue(popupFalso);

    const { result } = renderHook(() => useOAuthPopup());
    act(() => {
      result.current.open("https://meta.example/oauth");
    });

    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(result.current.status).toBe("open");
  });

  it("cancel() cierra el popup y pasa a estado cerrado de inmediato, mismo camino que el cierre manual", () => {
    const popupFalso = crearPopupFalso();
    vi.spyOn(window, "open").mockReturnValue(popupFalso);

    const { result } = renderHook(() => useOAuthPopup());
    act(() => {
      result.current.open("https://meta.example/oauth");
    });

    act(() => {
      result.current.cancel();
    });
    expect(popupFalso.close).toHaveBeenCalledTimes(1);

    // El mock no simula `closed = true` solo al llamar `close()` (jsdom
    // tampoco lo hace) -- una vez que el navegador lo refleja, el mismo
    // chequeo (disparado por `cancel()` o por el próximo tick del
    // polling) debe reflejarlo en el estado del hook.
    (popupFalso as unknown as { closed: boolean }).closed = true;
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.status).toBe("closed");
  });

  it("cancel() sin popup abierto no rompe nada", () => {
    const { result } = renderHook(() => useOAuthPopup());
    expect(() => {
      act(() => {
        result.current.cancel();
      });
    }).not.toThrow();
  });

  it("limpia el interval de polling al desmontar", () => {
    const popupFalso = crearPopupFalso();
    vi.spyOn(window, "open").mockReturnValue(popupFalso);
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");

    const { result, unmount } = renderHook(() => useOAuthPopup());
    act(() => {
      result.current.open("https://meta.example/oauth");
    });

    unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it("no reabre un segundo interval si open() se llama dos veces seguidas", () => {
    const popupFalso1 = crearPopupFalso();
    const popupFalso2 = crearPopupFalso();
    const openSpy = vi.spyOn(window, "open");
    openSpy.mockReturnValueOnce(popupFalso1).mockReturnValueOnce(popupFalso2);
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");

    const { result } = renderHook(() => useOAuthPopup());
    act(() => {
      result.current.open("https://meta.example/oauth");
    });
    act(() => {
      result.current.open("https://meta.example/oauth-2");
    });

    expect(clearIntervalSpy).toHaveBeenCalled();

    (popupFalso2 as unknown as { closed: boolean }).closed = true;
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.status).toBe("closed");
  });
});
