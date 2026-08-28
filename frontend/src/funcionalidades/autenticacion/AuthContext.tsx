import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getRefreshToken, restoreSession, setOnSessionExpired, setTokens } from "@/api/httpClient";
import type { AuthenticatedUser, RolUsuario } from "@/tipos/usuario";
import { getPerfilApi, loginApi, logoutApi } from "./autenticacion.api";
import { hasRoleAccess } from "./permissions";

export interface AuthContextValue {
  user: AuthenticatedUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (correo: string, password: string) => Promise<AuthenticatedUser>;
  logout: () => Promise<void>;
  hasRole: (allowedRoles?: readonly RolUsuario[]) => boolean;
}

/**
 * Exportado a propósito (además de `AuthProvider`/`useAuth`): permite
 * componer un `<AuthContext.Provider value={...}>` stub con un usuario mock
 * fijo, sin pasar por la lógica real de `AuthProvider` (restauración de
 * sesión, `useQuery` de perfil). Único consumidor hoy:
 * `frontend/src/temas/variante-empresarial/StyleguidePage.tsx`, para previsualizar
 * `Sidebar`/`Header` de forma aislada sin wiring de red. No cambia el
 * comportamiento de `AuthProvider`/`useAuth` para el resto de la app.
 */
export const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Query key del perfil de sesión. Representa `GET /auth/perfil` (ver
 * `autenticacion.api.ts#getPerfilApi` y `backend/src/controllers/auth.controller.ts`).
 * Si el backend cambia la forma de esa respuesta, hay que mantener
 * sincronizado el tipo `AuthenticatedUser` en `@/tipos/usuario`.
 */
const PERFIL_QUERY_KEY = ["auth", "perfil"] as const;

/**
 * Termina el estado de sesión reactivo y purga cualquier otro dato
 * cacheado de la sesión saliente -- se invoca tanto en `logout()` explícito
 * como cuando `httpClient` reporta sesión expirada (un refresco fallido
 * también termina la sesión sin pasar por el botón de logout).
 *
 * Riesgo que evita: sin esto, cualquier query cacheada por otro módulo que
 * no incluya `user.id` en su key (p. ej. `useLeads` -- el backend ya filtra
 * por el usuario del JWT, así que no lo necesita) sigue en caché después de
 * cerrar sesión. `useNotificaciones` sí incluye `user.id` en su key pese a
 * lo anterior: `useNotificacionesRealtime.ts` escribe/invalida sobre esa
 * misma clave al recibir eventos del canal SSE (M8), y `removeQueries` de
 * abajo la limpia igual (matchea por `queryKey[0]`, no por la clave
 * completa) -- así que el cierre de sesión sigue purgándola sin depender de
 * que la key sea corta. Con
 * `staleTime: 30_000` (`api/queryClient.ts`) y login/logout como navegación
 * SPA sin recarga de página, un segundo usuario que inicia sesión en la
 * misma pestaña dentro de esos 30 s (p. ej. cambio de turno en una estación
 * compartida) recibiría datos cacheados del usuario anterior sin ningún
 * request de red.
 *
 * Por qué no `queryClient.clear()` a secas: `clear()`/`removeQueries()`
 * destruyen el objeto `Query` interno de TanStack Query sin notificar a los
 * observers ya montados (no disparan `dispatch`), así que el observer de
 * `perfilQuery` -- todavía montado en este mismo `AuthProvider` -- queda
 * apuntando a un objeto "huérfano" con los datos viejos hasta el próximo
 * render, y nada dispara ese render. `setQueryData` sí notifica de
 * inmediato porque reutiliza el mismo objeto `Query` vivo. Por eso: primero
 * `setQueryData` (perfil pasa a `null` ya mismo, dispara la redirección de
 * `ProtectedRoute`), después `removeQueries` excluyendo esa query -- si se
 * la volviera a eliminar, el próximo `login()`/`setQueryData` construiría
 * un `Query` nuevo desconectado del observer ya montado, rompiendo el
 * flujo de login siguiente en la misma pestaña.
 */
function clearSessionCache(queryClient: QueryClient): void {
  queryClient.setQueryData(PERFIL_QUERY_KEY, null);
  queryClient.removeQueries({
    predicate: (query) => query.queryKey[0] !== PERFIL_QUERY_KEY[0],
  });
}

/**
 * Estado de sesión (F2, "Persistencia de sesión y cierre automático al
 * expirar el refresh" -- ver `api/httpClient.ts`). `user` es estado de
 * servidor (`GET /auth/perfil`) y vive en TanStack Query bajo la key
 * `["auth", "perfil"]` (AGENTS.md §4).
 *
 * La `queryFn` reproduce la rehidratación de sesión al arrancar la app:
 * intenta `restoreSession()` a partir del refresh token persistido en
 * `localStorage`; si no hay sesión que restaurar, o si `restoreSession()`/
 * `getPerfilApi()` fallan (refresh token expirado o revocado), resuelve a
 * `null` en silencio -- el usuario simplemente ve la pantalla de login, sin
 * error visible (el interceptor 401 de `httpClient.ts` ya limpió el store
 * de tokens en ese caso).
 *
 * La query solo se dispara si había un refresh token persistido *al
 * montar* (capturado una única vez en `hadPersistedRefreshToken`, no leído
 * de nuevo en cada render) -- así se evita el parpadeo de "cargando" en el
 * caso normal de "nunca inició sesión".
 *
 * `retry: false`, `refetchOnWindowFocus: false`, `refetchOnMount: false` y
 * `staleTime: Infinity`: esta query es una comprobación de arranque de una
 * sola vez, no un dato que deba revalidarse en segundo plano. La validez de
 * la sesión durante el uso de la app la sigue gobernando el interceptor 401
 * de `httpClient.ts` (que invoca `onSessionExpired` para limpiar la cache),
 * no el ciclo de vida normal de TanStack Query.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [hadPersistedRefreshToken] = useState(() => Boolean(getRefreshToken()));
  const [isLoginPending, setIsLoginPending] = useState(false);

  const perfilQuery = useQuery({
    queryKey: PERFIL_QUERY_KEY,
    queryFn: async (): Promise<AuthenticatedUser | null> => {
      try {
        const restaurada = await restoreSession();
        if (!restaurada) {
          return null;
        }
        return await getPerfilApi();
      } catch {
        return null;
      }
    },
    enabled: hadPersistedRefreshToken,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    staleTime: Infinity,
  });

  const user = perfilQuery.data ?? null;

  useEffect(() => {
    setOnSessionExpired(() => clearSessionCache(queryClient));
    return () => setOnSessionExpired(null);
  }, [queryClient]);

  const login = useCallback(
    async (correo: string, password: string) => {
      setIsLoginPending(true);
      try {
        const response = await loginApi(correo, password);
        setTokens({ accessToken: response.accessToken, refreshToken: response.refreshToken });
        queryClient.setQueryData(PERFIL_QUERY_KEY, response.user);
        return response.user;
      } finally {
        setIsLoginPending(false);
      }
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    const refreshToken = getRefreshToken();
    setTokens(null);
    clearSessionCache(queryClient);
    if (refreshToken) {
      try {
        await logoutApi(refreshToken);
      } catch {
        // Logout es idempotente y de un solo intento (D-E en
        // auth.service.ts): si falla, la sesión local ya quedó cerrada, no
        // hay nada accionable que mostrarle al usuario.
      }
    }
  }, [queryClient]);

  const hasRole = useCallback(
    (allowedRoles?: readonly RolUsuario[]) => hasRoleAccess(user?.rol, allowedRoles),
    [user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isLoading: perfilQuery.isLoading || isLoginPending,
      login,
      logout,
      hasRole,
    }),
    [user, perfilQuery.isLoading, isLoginPending, login, logout, hasRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  }
  return context;
}
