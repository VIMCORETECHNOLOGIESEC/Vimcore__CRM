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
const { AuthProvider } = await import("@/funcionalidades/autenticacion/AuthContext");
const { useAuth } = await import("@/funcionalidades/autenticacion/authContext");

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
  // Bloque D0: forma holding-wide por defecto para los tests preexistentes
  // (login/logout/hasRole) que no ejercitan el contrato de scope tenant --
  // ver describes dedicados "estados de perfil (Bloque D0)" más abajo.
  sessionScope: "holding" as const,
  empresaId: null,
  empresaNombre: null,
};

const usuarioCompanyFake = {
  id: "u2",
  nombre: "Beto Empresa",
  correo: "beto@crm.test",
  rol: "ASESOR" as const,
  sessionScope: "company" as const,
  empresaId: "empresa-a",
  empresaNombre: "Empresa A",
  membresiaId: "membresia-a",
};

/**
 * Expuesto para que los tests puedan inspeccionar/poblar la caché de
 * TanStack Query directamente (Fix de fuga de datos entre sesiones: ver
 * describe "AuthContext — logout limpia toda la caché de TanStack Query"
 * más abajo). `wrapper` solo se ejecuta una vez por test -- RTL no vuelve a
 * invocar la función componente en cada `act()` interno del hook bajo
 * prueba --, así que esta referencia es estable durante todo el test.
 */
let queryClientDeTest: QueryClient | null = null;

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClientDeTest = queryClient;
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

/**
 * Bloque D0 (docs/blocks/d0-visualizacion-multitenant.md, "Contrato
 * frontend", tabla de estados de `AuthContext`): cubre los 6 estados
 * observables exigidos por el doc. "Perfil company listo"/"holding listo"
 * también quedan cubiertos por los tests de rehidratación de arriba (usan
 * `usuarioFake`, forma holding), pero acá quedan nombrados 1:1 con la fila
 * de la tabla que verifican, incluida la fila nueva de este bloque ("Perfil
 * incompleto o inconsistente").
 */
describe("AuthContext — estados de perfil (Bloque D0)", () => {
  it("hidratando: mientras GET /auth/perfil está pendiente, isLoading es true y no expone usuario", async () => {
    getRefreshTokenMock.mockReturnValue("refresh-persistido");
    restoreSessionMock.mockResolvedValue(true);
    let resolverPerfil: ((value: typeof usuarioFake) => void) | undefined;
    getPerfilApiMock.mockReturnValue(
      new Promise((resolve) => {
        resolverPerfil = resolve;
      }),
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(true));
    expect(result.current.user).toBeNull();

    await act(async () => {
      resolverPerfil?.(usuarioFake);
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toEqual(usuarioFake);
  });

  it("perfil company listo: hidrata sessionScope company con empresaId/empresaNombre/membresiaId", async () => {
    getRefreshTokenMock.mockReturnValue("refresh-persistido");
    restoreSessionMock.mockResolvedValue(true);
    getPerfilApiMock.mockResolvedValue(usuarioCompanyFake);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.user).toEqual(usuarioCompanyFake);
    expect(result.current.isAuthenticated).toBe(true);
  });

  it("perfil holding listo: hidrata sessionScope holding con empresaId/empresaNombre null", async () => {
    getRefreshTokenMock.mockReturnValue("refresh-persistido");
    restoreSessionMock.mockResolvedValue(true);
    getPerfilApiMock.mockResolvedValue(usuarioFake);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.user).toEqual(usuarioFake);
    expect(result.current.user?.sessionScope).toBe("holding");
    expect(result.current.isAuthenticated).toBe(true);
  });

  it("401 de perfil: purga la sesión hidratada (la purga de tokens en sí ya está cubierta en httpClient.test.ts)", async () => {
    getRefreshTokenMock.mockReturnValue("refresh-persistido");
    restoreSessionMock.mockResolvedValue(true);
    getPerfilApiMock.mockResolvedValue(usuarioCompanyFake);

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.user).toEqual(usuarioCompanyFake));

    // `httpClient` real invoca `expireSession()` (purga tokens) ANTES de
    // notificar acá -- ese contrato lo prueba `httpClient.test.ts` (describe
    // "reintento automático ante 401"). Lo que corresponde a `AuthContext`
    // es reaccionar a esa notificación purgando TODO el scope hidratado
    // (empresaId/empresaNombre/sessionScope/membresiaId viajan dentro del
    // mismo objeto `user`, así que un único `setQueryData(null)` los purga
    // a los cuatro juntos).
    const handlerRegistrado = setOnSessionExpiredMock.mock.calls[0]?.[0] as () => void;
    act(() => {
      handlerRegistrado();
    });

    await waitFor(() => expect(result.current.user).toBeNull());
    expect(result.current.isAuthenticated).toBe(false);
  });

  it("fallo transitorio de perfil: no reutiliza scope anterior ni purga tokens, permite reintentar", async () => {
    getRefreshTokenMock.mockReturnValue("refresh-persistido");
    restoreSessionMock.mockResolvedValue(true);
    getPerfilApiMock.mockRejectedValue(new Error("error_red"));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    // A diferencia de un 401 (que purga vía `expireSession()` dentro de
    // `httpClient`), un fallo transitorio nunca debe tocar los tokens -- la
    // autenticación en sí sigue siendo válida, solo falló esta lectura
    // puntual del perfil.
    expect(setTokensMock).not.toHaveBeenCalled();
  });

  it("perfil incompleto/inconsistente: sessionScope company sin empresaNombre resuelto falla cerrado", async () => {
    getRefreshTokenMock.mockReturnValue("refresh-persistido");
    restoreSessionMock.mockResolvedValue(true);
    getPerfilApiMock.mockResolvedValue({ ...usuarioCompanyFake, empresaNombre: null });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it("perfil incompleto/inconsistente: sessionScope holding con empresaId atribuido falla cerrado", async () => {
    getRefreshTokenMock.mockReturnValue("refresh-persistido");
    restoreSessionMock.mockResolvedValue(true);
    getPerfilApiMock.mockResolvedValue({ ...usuarioFake, empresaId: "empresa-fantasma" });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.user).toBeNull();
  });
});

describe("AuthContext — login", () => {
  it("en login exitoso, guarda los tokens y el usuario, y termina con isLoading en false", async () => {
    loginApiMock.mockResolvedValue({
      accessToken: "access-1",
      refreshToken: "refresh-1",
      user: usuarioFake,
    });
    // Bloque D0: `login()` ahora hidrata SOLO desde `GET /auth/perfil`
    // (`POST /auth/login` no trae sessionScope/empresaId/empresaNombre) --
    // ver "Secuencia obligatoria" en el doc D0 y `AuthContext.tsx::login`.
    getPerfilApiMock.mockResolvedValue(usuarioFake);
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
    // Bloque D0: `login()` ahora hidrata SOLO desde `GET /auth/perfil`
    // (`POST /auth/login` no trae sessionScope/empresaId/empresaNombre) --
    // ver "Secuencia obligatoria" en el doc D0 y `AuthContext.tsx::login`.
    getPerfilApiMock.mockResolvedValue(usuarioFake);

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

describe("AuthContext — logout limpia toda la caché de TanStack Query", () => {
  // Regresión: al integrar contra el backend real, `logout()` solo borraba
  // la query del perfil (`["auth", "perfil"]`), no el resto de la caché. Con
  // `staleTime: 30_000` (`api/queryClient.ts`) y login/logout como
  // navegación SPA sin recarga de página, eso deja servir a un segundo
  // usuario que inicia sesión en la misma pestaña dentro de esos 30 s los
  // datos cacheados del usuario anterior (notificaciones, leads, etc.) sin
  // ningún request de red -- una fuga de datos entre sesiones en estaciones
  // compartidas. `logout()` debe usar `queryClient.clear()`, no
  // `setQueryData` puntual, para cubrir cualquier query cacheada por
  // cualquier módulo, tenga o no `user.id` en su key.
  it("borra datos cacheados por otros módulos (no solo la query del perfil) al cerrar sesión", async () => {
    getRefreshTokenMock.mockReturnValue("refresh-1");
    logoutApiMock.mockResolvedValue(undefined);
    loginApiMock.mockResolvedValue({
      accessToken: "access-1",
      refreshToken: "refresh-1",
      user: usuarioFake,
    });
    // Bloque D0: `login()` ahora hidrata SOLO desde `GET /auth/perfil`
    // (`POST /auth/login` no trae sessionScope/empresaId/empresaNombre) --
    // ver "Secuencia obligatoria" en el doc D0 y `AuthContext.tsx::login`.
    getPerfilApiMock.mockResolvedValue(usuarioFake);

    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {
      await result.current.login("ana@crm.test", "clave-segura");
    });

    // Simula datos que un módulo ajeno (p. ej. notificaciones, leads) dejó
    // en caché durante la sesión de este usuario.
    queryClientDeTest?.setQueryData(["notificaciones"], [{ id: "notif-del-usuario-anterior" }]);
    expect(queryClientDeTest?.getQueryData(["notificaciones"])).toBeDefined();

    await act(async () => {
      await result.current.logout();
    });

    expect(queryClientDeTest?.getQueryData(["notificaciones"])).toBeUndefined();
  });

  // El otro camino por el que una sesión puede terminar sin pasar por
  // `logout()` explícito: un refresco de token fallido invoca el mismo
  // handler que registra `setOnSessionExpired` (ver httpClient.ts). Si un
  // segundo usuario inicia sesión justo después de eso -- sin que nadie haya
  // tocado el botón de cerrar sesión --, la misma fuga aplica si ese camino
  // no limpia también la caché completa.
  it("el handler de sesión expirada también borra datos cacheados por otros módulos", async () => {
    loginApiMock.mockResolvedValue({
      accessToken: "access-1",
      refreshToken: "refresh-1",
      user: usuarioFake,
    });
    // Bloque D0: `login()` ahora hidrata SOLO desde `GET /auth/perfil`
    // (`POST /auth/login` no trae sessionScope/empresaId/empresaNombre) --
    // ver "Secuencia obligatoria" en el doc D0 y `AuthContext.tsx::login`.
    getPerfilApiMock.mockResolvedValue(usuarioFake);
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.login("ana@crm.test", "clave-segura");
    });

    queryClientDeTest?.setQueryData(["notificaciones"], [{ id: "notif-del-usuario-anterior" }]);

    const handlerRegistrado = setOnSessionExpiredMock.mock.calls[0]?.[0] as () => void;
    act(() => {
      handlerRegistrado();
    });

    await waitFor(() => expect(result.current.user).toBeNull());
    expect(queryClientDeTest?.getQueryData(["notificaciones"])).toBeUndefined();
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
    getPerfilApiMock.mockResolvedValue(usuarioFake);
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
    // Bloque D0: `login()` ahora hidrata SOLO desde `GET /auth/perfil`
    // (`POST /auth/login` no trae sessionScope/empresaId/empresaNombre) --
    // ver "Secuencia obligatoria" en el doc D0 y `AuthContext.tsx::login`.
    getPerfilApiMock.mockResolvedValue(usuarioFake);
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
