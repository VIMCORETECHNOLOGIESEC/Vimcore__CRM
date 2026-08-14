import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getRefreshToken, setOnSessionExpired, setTokens } from "@/api/httpClient";
import type { AuthenticatedUser, RolUsuario } from "@/tipos/usuario";
import { loginApi, logoutApi } from "./autenticacion.api";
import { hasRoleAccess } from "./permissions";

interface AuthContextValue {
  user: AuthenticatedUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (correo: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasRole: (allowedRoles?: readonly RolUsuario[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Estado de sesión en memoria (ver nota de alcance en `api/httpClient.ts`):
 * F1 no rehidrata sesión entre recargas de página, eso es F2
 * ("Persistencia de sesión y cierre automático al expirar el refresh").
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setOnSessionExpired(() => setUser(null));
    return () => setOnSessionExpired(null);
  }, []);

  const login = useCallback(async (correo: string, password: string) => {
    setIsLoading(true);
    try {
      const response = await loginApi(correo, password);
      setTokens({ accessToken: response.accessToken, refreshToken: response.refreshToken });
      setUser(response.user);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = getRefreshToken();
    setTokens(null);
    setUser(null);
    if (refreshToken) {
      try {
        await logoutApi(refreshToken);
      } catch {
        // Logout es idempotente y de un solo intento (D-E en
        // auth.service.ts): si falla, la sesión local ya quedó cerrada, no
        // hay nada accionable que mostrarle al usuario.
      }
    }
  }, []);

  const hasRole = useCallback(
    (allowedRoles?: readonly RolUsuario[]) => hasRoleAccess(user?.rol, allowedRoles),
    [user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isLoading,
      login,
      logout,
      hasRole,
    }),
    [user, isLoading, login, logout, hasRole],
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
