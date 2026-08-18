import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/funcionalidades/autenticacion/autenticacion.api", () => ({
  loginApi: vi.fn(),
  logoutApi: vi.fn(),
  getPerfilApi: vi.fn(),
}));
vi.mock("@/api/httpClient", () => ({
  getRefreshToken: vi.fn(),
  restoreSession: vi.fn(),
  setOnSessionExpired: vi.fn(),
  setTokens: vi.fn(),
}));

const authApi = await import("@/funcionalidades/autenticacion/autenticacion.api");
const httpClientModule = await import("@/api/httpClient");
const { AuthProvider, useAuth } = await import("@/funcionalidades/autenticacion/AuthContext");

const loginApiMock = vi.mocked(authApi.loginApi);
const logoutApiMock = vi.mocked(authApi.logoutApi);
const getPerfilApiMock = vi.mocked(authApi.getPerfilApi);
const getRefreshTokenMock = vi.mocked(httpClientModule.getRefreshToken);
const restoreSessionMock = vi.mocked(httpClientModule.restoreSession);
const setOnSessionExpiredMock = vi.mocked(httpClientModule.setOnSessionExpired);
const setTokensMock = vi.mocked(httpClientModule.setTokens);

const usuarioFake = {
  id: "u1",
  nombre: "Ana Gómez",
  correo: "ana@crm.test",
  rol: "ASESOR" as const,
};

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  loginApiMock.mockReset();
  logoutApiMock.mockReset();
  getPerfilApiMock.mockReset();
  getRefreshTokenMock.mockReset();
  restoreSessionMock.mockReset();
  setOnSessionExpiredMock.mockReset();
  setTokensMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AuthContext — estado inicial", () => {
  it("sin refresh token persistido, arranca sin usuario, no autenticado y sin cargar", () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.isLoading).toBe(false);
    // Sin refresh token persistido no hay nada que rehidratar.
    expect(restoreSessionMock).not.toHaveBeenCalled();
  });

  it("registra un handler de sesión expirada al montar y lo limpia al desmontar", () => {
    const { unmount } = renderHook(() => useAuth(), { wrapper });
    expect(setOnSessionExpiredMock).toHaveBeenCalledWith(expect.any(Function));

    unmount();
    expect(setOnSessionExpiredMock).toHaveBeenLastCalledWith(null);
  });
});

describe("AuthContext — rehidratación de sesión al arrancar (F2)", () => {
  it("con un refresh token persistido válido, restaura la sesión y carga el perfil", async () => {
    getRefreshTokenMock.mockReturnValue("refresh-persistido");
    restoreSessionMock.mockResolvedValue(true);
    getPerfilApiMock.mockResolvedValue(usuarioFake);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(restoreSessionMock).toHaveBeenCalledTimes(1);
    expect(getPerfilApiMock).toHaveBeenCalledTimes(1);
    expect(result.current.user).toEqual(usuarioFake);
    expect(result.current.isAuthenticated).toBe(true);
  });

  it("con un refresh token persistido inválido, no restaura sesión y termina sin usuario", async () => {
    getRefreshTokenMock.mockReturnValue("refresh-persistido");
    restoreSessionMock.mockResolvedValue(false);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(getPerfilApiMock).not.toHaveBeenCalled();
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it("si restoreSession resuelve true pero falla la carga del perfil, termina sin usuario y sin relanzar", async () => {
    getRefreshTokenMock.mockReturnValue("refresh-persistido");
    restoreSessionMock.mockResolvedValue(true);
    getPerfilApiMock.mockRejectedValue(new Error("500"));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
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

    let usuarioDevuelto: typeof usuarioFake | undefined;
    await act(async () => {
      usuarioDevuelto = await result.current.login("ana@crm.test", "clave-segura");
    });

    // `login` resuelve el usuario autenticado (no solo `void`) para que
    // `LoginPage` pueda redirigir según su rol sin depender del timing de
    // `setState` (F2, "Redirección post-login según rol").
    expect(usuarioDevuelto).toEqual(usuarioFake);
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

    // `queryClient.setQueryData` notifica a los observadores en un
    // microtask (notifyManager de TanStack Query): `waitFor` reintenta la
    // aserción hasta que esa notificación se refleje, en vez de asumir que
    // un solo tick de `act(async () => {...})` alcanza (es una carrera, no
    // una garantía).
    act(() => {
      handlerRegistrado();
    });

    await waitFor(() => expect(result.current.user).toBeNull());
    expect(result.current.isAuthenticated).toBe(false);
  });
});
