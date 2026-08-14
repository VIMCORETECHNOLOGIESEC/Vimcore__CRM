import { useQuery, useQueryClient } from "@tanstack/react-query";
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

interface AuthContextValue {
  user: AuthenticatedUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (correo: string, password: string) => Promise<AuthenticatedUser>;
  logout: () => Promise<void>;
  hasRole: (allowedRoles?: readonly RolUsuario[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Query key del perfil de sesión. Representa `GET /auth/perfil` (ver
 * `autenticacion.api.ts#getPerfilApi` y `backend/src/controllers/auth.controller.ts`).
 * Si el backend cambia la forma de esa respuesta, hay que mantener
 * sincronizado el tipo `AuthenticatedUser` en `@/tipos/usuario`.
 */
const PERFIL_QUERY_KEY = ["auth", "perfil"] as const;

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
    setOnSessionExpired(() => queryClient.setQueryData(PERFIL_QUERY_KEY, null));
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
    queryClient.setQueryData(PERFIL_QUERY_KEY, null);
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
