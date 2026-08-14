import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/funcionalidades/autenticacion/autenticacion.api", () => ({
  loginApi: vi.fn(),
  logoutApi: vi.fn(),
}));
vi.mock("@/api/httpClient", () => ({
  getRefreshToken: vi.fn(),
  setOnSessionExpired: vi.fn(),
  setTokens: vi.fn(),
}));

const authApi = await import("@/funcionalidades/autenticacion/autenticacion.api");
const httpClientModule = await import("@/api/httpClient");
const { AuthProvider, useAuth } = await import("@/funcionalidades/autenticacion/AuthContext");

const loginApiMock = vi.mocked(authApi.loginApi);
const logoutApiMock = vi.mocked(authApi.logoutApi);
const getRefreshTokenMock = vi.mocked(httpClientModule.getRefreshToken);
const setOnSessionExpiredMock = vi.mocked(httpClientModule.setOnSessionExpired);
const setTokensMock = vi.mocked(httpClientModule.setTokens);

const usuarioFake = {
  id: "u1",
  nombre: "Ana Gómez",
  correo: "ana@crm.test",
  rol: "ASESOR" as const,
};

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

beforeEach(() => {
  loginApiMock.mockReset();
  logoutApiMock.mockReset();
  getRefreshTokenMock.mockReset();
  setOnSessionExpiredMock.mockReset();
  setTokensMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AuthContext — estado inicial", () => {
  it("arranca sin usuario, no autenticado y sin cargar (F1 no rehidrata sesión, ver F2)", () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it("registra un handler de sesión expirada al montar y lo limpia al desmontar", () => {
    const { unmount } = renderHook(() => useAuth(), { wrapper });
    expect(setOnSessionExpiredMock).toHaveBeenCalledWith(expect.any(Function));

    unmount();
    expect(setOnSessionExpiredMock).toHaveBeenLastCalledWith(null);
  });
});

describe("AuthContext — login", () => {
  it("en login exitoso, guarda los tokens y el usuario, y termina con isLoading en false", async () => {
    loginApiMock.mockResolvedValue({
      accessToken: "access-1",
      refreshToken: "refresh-1",
      user: usuarioFake,
    });
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.login("ana@crm.test", "clave-segura");
    });

    expect(loginApiMock).toHaveBeenCalledWith("ana@crm.test", "clave-segura");
    expect(setTokensMock).toHaveBeenCalledWith({
      accessToken: "access-1",
      refreshToken: "refresh-1",
    });
    expect(result.current.user).toEqual(usuarioFake);
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.isLoading).toBe(false);
  });

  it("en login fallido, propaga el error y no queda autenticado", async () => {
    loginApiMock.mockRejectedValue(new Error("credenciales inválidas"));
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await expect(result.current.login("ana@crm.test", "mala-clave")).rejects.toThrow(
        "credenciales inválidas",
      );
    });

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });
});

describe("AuthContext — logout", () => {
  it("limpia el usuario y los tokens, y llama a logoutApi con el refresh token guardado", async () => {
    getRefreshTokenMock.mockReturnValue("refresh-1");
    logoutApiMock.mockResolvedValue(undefined);
    loginApiMock.mockResolvedValue({
      accessToken: "access-1",
      refreshToken: "refresh-1",
      user: usuarioFake,
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {
      await result.current.login("ana@crm.test", "clave-segura");
    });

    await act(async () => {
      await result.current.logout();
    });

    expect(logoutApiMock).toHaveBeenCalledWith("refresh-1");
    expect(setTokensMock).toHaveBeenCalledWith(null);
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it("si logoutApi falla, igual limpia la sesión local sin relanzar el error (D-E, idempotente)", async () => {
    getRefreshTokenMock.mockReturnValue("refresh-1");
    logoutApiMock.mockRejectedValue(new Error("500"));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await expect(result.current.logout()).resolves.toBeUndefined();
    });

    expect(result.current.user).toBeNull();
    expect(setTokensMock).toHaveBeenCalledWith(null);
  });

  it("si no hay refresh token guardado, no llama a logoutApi", async () => {
    getRefreshTokenMock.mockReturnValue(null);
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.logout();
    });

    expect(logoutApiMock).not.toHaveBeenCalled();
  });
});

describe("AuthContext — hasRole", () => {
  it("sin usuario autenticado, hasRole con roles restringidos devuelve false", () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.hasRole(["ADMINISTRADOR"])).toBe(false);
  });

  it("sin especificar roles permitidos, hasRole es true incluso sin usuario", () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.hasRole()).toBe(true);
  });

  it("con usuario autenticado, hasRole refleja si su rol está en la lista permitida", async () => {
    loginApiMock.mockResolvedValue({
      accessToken: "access-1",
      refreshToken: "refresh-1",
      user: usuarioFake, // rol: ASESOR
    });
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.login("ana@crm.test", "clave-segura");
    });

    expect(result.current.hasRole(["ASESOR", "VENDEDOR"])).toBe(true);
    expect(result.current.hasRole(["ADMINISTRADOR"])).toBe(false);
  });
});

describe("AuthContext — sesión expirada notificada por httpClient", () => {
  it("cuando se invoca el handler registrado en setOnSessionExpired, limpia el usuario", async () => {
    loginApiMock.mockResolvedValue({
      accessToken: "access-1",
      refreshToken: "refresh-1",
      user: usuarioFake,
    });
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.login("ana@crm.test", "clave-segura");
    });
    expect(result.current.isAuthenticated).toBe(true);

    // Simula lo que hace `httpClient` internamente cuando un refresco falla:
    // invoca el handler que `AuthProvider` registró vía `setOnSessionExpired`.
    const handlerRegistrado = setOnSessionExpiredMock.mock.calls[0]?.[0] as () => void;
    expect(handlerRegistrado).toBeTypeOf("function");

    act(() => {
      handlerRegistrado();
    });

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });
});
