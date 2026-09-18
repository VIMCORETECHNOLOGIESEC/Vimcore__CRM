import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/funcionalidades/autenticacion/autenticacion.api", () => ({
  logoutApi: vi.fn(),
  getPerfilApi: vi.fn(),
}));
vi.mock("@/api/httpClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/httpClient")>()),
  setOnSessionExpired: vi.fn(),
  getAuthLoginUrl: () => "http://auth.test/auth/login",
}));

const authApi = await import("@/funcionalidades/autenticacion/autenticacion.api");
const httpClientModule = await import("@/api/httpClient");
const { AuthProvider } = await import("@/funcionalidades/autenticacion/AuthContext");
const { useAuth } = await import("@/funcionalidades/autenticacion/auth-context");
// Cache de marca en `localStorage`, no mockeada a propósito: estos tests
// verifican la integración real contra `localStorage`.
const { MARCA_CONOCIDA_STORAGE_KEY, getMarcaConocida } = await import("@/lib/marca-cache");

const logoutApiMock = vi.mocked(authApi.logoutApi);
const getPerfilApiMock = vi.mocked(authApi.getPerfilApi);
const setOnSessionExpiredMock = vi.mocked(httpClientModule.setOnSessionExpired);
const { ApiError } = httpClientModule;

const usuarioFake = {
  id: "u1",
  nombre: "Ana Gómez",
  correo: "ana@crm.test",
  rol: "ASESOR" as const,
  sessionScope: "holding" as const,
  empresaId: null,
  empresaNombre: null,
  empresaColorPrimario: null,
  empresaColorSecundario: null,
};

const usuarioCompanyFake = {
  id: "u2",
  nombre: "Beto Empresa",
  correo: "beto@crm.test",
  rol: "ASESOR" as const,
  sessionScope: "company" as const,
  empresaId: "empresa-a",
  empresaNombre: "Empresa A",
  empresaColorPrimario: null,
  empresaColorSecundario: null,
  membresiaId: "membresia-a",
};

/**
 * Expuesto para inspeccionar/poblar la caché de TanStack Query directamente
 * (purga de caché entre sesiones). `wrapper` solo se ejecuta una vez por test.
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

let assignMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  logoutApiMock.mockReset();
  getPerfilApiMock.mockReset();
  setOnSessionExpiredMock.mockReset();
  localStorage.removeItem(MARCA_CONOCIDA_STORAGE_KEY);
  assignMock = vi.fn();
  vi.stubGlobal("location", { assign: assignMock, href: "http://crm.test/" });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.removeItem(MARCA_CONOCIDA_STORAGE_KEY);
});

describe("AuthContext — arranque desde la sesión del gateway", () => {
  it("siempre consulta GET /auth/perfil al montar (ya no depende de un refresh token persistido)", async () => {
    getPerfilApiMock.mockResolvedValue(usuarioFake);

    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(getPerfilApiMock).toHaveBeenCalledTimes(1);
    expect(result.current.user).toEqual(usuarioFake);
  });

  it("registra un handler de sesión expirada al montar y lo limpia al desmontar", async () => {
    getPerfilApiMock.mockResolvedValue(usuarioFake);
    const { result, unmount } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(setOnSessionExpiredMock).toHaveBeenCalledWith(expect.any(Function));

    unmount();
    expect(setOnSessionExpiredMock).toHaveBeenLastCalledWith(null);
  });
});

describe("AuthContext — estados de perfil", () => {
  it("hidratando: mientras GET /auth/perfil está pendiente, isLoading es true y no expone usuario", async () => {
    let resolver: (u: typeof usuarioFake) => void = () => {};
    getPerfilApiMock.mockReturnValue(new Promise((resolve) => (resolver = resolve)));

    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.user).toBeNull();

    await act(async () => {
      resolver(usuarioFake);
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it("perfil company listo: hidrata sessionScope company con empresaId/empresaNombre/membresiaId", async () => {
    getPerfilApiMock.mockResolvedValue(usuarioCompanyFake);

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    expect(result.current.user).toMatchObject({
      sessionScope: "company",
      empresaId: "empresa-a",
      empresaNombre: "Empresa A",
    });
  });

  it("perfil ADMINISTRADOR_HOLDING (holding): hidrata con empresaId/empresaNombre null", async () => {
    getPerfilApiMock.mockResolvedValue({ ...usuarioFake, rol: "ADMINISTRADOR_HOLDING" });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    expect(result.current.user).toMatchObject({
      rol: "ADMINISTRADOR_HOLDING",
      sessionScope: "holding",
      empresaId: null,
    });
  });

  it("401 de perfil (sin sesión de plataforma): termina sin usuario, sin error y sin marcar no vinculado", async () => {
    getPerfilApiMock.mockRejectedValue(new ApiError("sesion_expirada", 401, "Tu sesión expiró."));

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.identityNotLinked).toBe(false);
    expect(result.current.bootstrapError).toBeNull();
  });

  it("403 CRM_IDENTITY_NOT_LINKED: expone identityNotLinked, sin usuario y sin redirigir", async () => {
    getPerfilApiMock.mockRejectedValue(
      new ApiError("CRM_IDENTITY_NOT_LINKED", 403, "This account is not linked to a CRM company yet"),
    );

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.identityNotLinked).toBe(true));

    expect(result.current.user).toBeNull();
    expect(result.current.bootstrapError).toBeNull();
    expect(assignMock).not.toHaveBeenCalled();
  });

  it("502 UPSTREAM_ERROR: expone bootstrapError (no es 401 ni no-vinculado) y no redirige", async () => {
    getPerfilApiMock.mockRejectedValue(new ApiError("UPSTREAM_ERROR", 502, "CRM unavailable"));

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.bootstrapError).not.toBeNull());

    expect(result.current.user).toBeNull();
    expect(result.current.identityNotLinked).toBe(false);
    expect(assignMock).not.toHaveBeenCalled();
  });

  it("perfil incompleto/inconsistente: sessionScope company sin empresaNombre resuelto falla cerrado", async () => {
    getPerfilApiMock.mockResolvedValue({ ...usuarioCompanyFake, empresaNombre: null });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it("perfil incompleto/inconsistente: sessionScope holding con empresaId atribuido falla cerrado", async () => {
    getPerfilApiMock.mockResolvedValue({ ...usuarioFake, empresaId: "empresa-x", empresaNombre: "X" });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.user).toBeNull();
  });
});

describe("AuthContext — logout", () => {
  it("limpia el usuario, cierra la sesión en el gateway y redirige al login del frontend de auth", async () => {
    getPerfilApiMock.mockResolvedValue(usuarioFake);
    logoutApiMock.mockResolvedValue(undefined);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    await act(async () => {
      await result.current.logout();
    });

    await waitFor(() => expect(result.current.user).toBeNull());
    expect(logoutApiMock).toHaveBeenCalledTimes(1);
    expect(assignMock).toHaveBeenCalledWith("http://auth.test/auth/login");
  });

  it("si logoutApi falla, igual limpia la sesión local y redirige sin relanzar el error", async () => {
    getPerfilApiMock.mockResolvedValue(usuarioFake);
    logoutApiMock.mockRejectedValue(new Error("red caída"));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    await act(async () => {
      await expect(result.current.logout()).resolves.toBeUndefined();
    });

    await waitFor(() => expect(result.current.user).toBeNull());
    expect(assignMock).toHaveBeenCalledWith("http://auth.test/auth/login");
  });
});

describe("AuthContext — purga de caché de TanStack Query", () => {
  // Con `staleTime: 30_000` (`api/queryClient.ts`), un segundo usuario en la
  // misma pestaña dentro de esos 30 s recibiría datos cacheados del anterior
  // sin ningún request de red: `logout()` y el handler de sesión expirada
  // deben purgar TODA la caché, no solo el perfil.
  it("logout borra datos cacheados por otros módulos (no solo la query del perfil)", async () => {
    getPerfilApiMock.mockResolvedValue(usuarioFake);
    logoutApiMock.mockResolvedValue(undefined);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    queryClientDeTest?.setQueryData(["notificaciones"], [{ id: "notif-del-usuario-anterior" }]);
    expect(queryClientDeTest?.getQueryData(["notificaciones"])).toBeDefined();

    await act(async () => {
      await result.current.logout();
    });

    expect(queryClientDeTest?.getQueryData(["notificaciones"])).toBeUndefined();
  });

  it("el handler de sesión expirada limpia el usuario y borra datos cacheados por otros módulos", async () => {
    getPerfilApiMock.mockResolvedValue(usuarioFake);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    queryClientDeTest?.setQueryData(["notificaciones"], [{ id: "notif-del-usuario-anterior" }]);

    const handlerRegistrado = setOnSessionExpiredMock.mock.calls[0]?.[0] as () => void;
    expect(handlerRegistrado).toBeTypeOf("function");
    act(() => {
      handlerRegistrado();
    });

    await waitFor(() => expect(result.current.user).toBeNull());
    expect(result.current.isAuthenticated).toBe(false);
    expect(queryClientDeTest?.getQueryData(["notificaciones"])).toBeUndefined();
  });
});

describe("AuthContext — hasRole", () => {
  it("sin usuario autenticado, hasRole con roles restringidos devuelve false", async () => {
    getPerfilApiMock.mockRejectedValue(new ApiError("sesion_expirada", 401, "x"));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.hasRole(["ADMINISTRADOR"])).toBe(false);
  });

  it("sin especificar roles permitidos, hasRole es true incluso sin usuario", async () => {
    getPerfilApiMock.mockRejectedValue(new ApiError("sesion_expirada", 401, "x"));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.hasRole()).toBe(true);
  });

  it("con usuario autenticado, hasRole refleja si su rol está en la lista permitida", async () => {
    getPerfilApiMock.mockResolvedValue(usuarioFake);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    expect(result.current.hasRole(["ASESOR", "VENDEDOR"])).toBe(true);
    expect(result.current.hasRole(["ADMINISTRADOR"])).toBe(false);
  });

  it("ADMINISTRADOR_HOLDING pasa las listas que incluyen ADMINISTRADOR", async () => {
    getPerfilApiMock.mockResolvedValue({ ...usuarioFake, rol: "ADMINISTRADOR_HOLDING" });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    expect(result.current.hasRole(["ADMINISTRADOR"])).toBe(true);
  });
});

/**
 * Fix "boot desincronizado": cada vez que `GET /auth/perfil` resuelve con
 * éxito, `AuthContext` deja en `localStorage` la última marca conocida
 * (`@/lib/marca-cache`) para que `AppBoot.tsx` pinte el próximo arranque con
 * ese branding.
 */
describe("AuthContext — cache de marca conocida (fix boot desincronizado)", () => {
  it("al hidratar el perfil con éxito, persiste empresaId/nombre/colores en localStorage", async () => {
    getPerfilApiMock.mockResolvedValue(usuarioCompanyFake);

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(getMarcaConocida()).toEqual({
      empresaId: "empresa-a",
      nombre: "Empresa A",
      colorPrimario: "#241F1B",
      colorSecundario: "#B98A4E",
    });
  });

  it("si el perfil es inconsistente (falla cerrado), no persiste ninguna marca", async () => {
    getPerfilApiMock.mockResolvedValue({ ...usuarioCompanyFake, empresaNombre: null });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(getMarcaConocida()).toBeNull();
  });
});
