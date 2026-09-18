import { createContext, useContext } from "react";
import type { AuthenticatedUser, RolUsuario } from "@/tipos/usuario";

export interface AuthContextValue {
  user: AuthenticatedUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** 403 `CRM_IDENTITY_NOT_LINKED` en el arranque: autenticado en auth, sin vínculo en el CRM. */
  identityNotLinked: boolean;
  /** Error de arranque distinto de 401/403-no-vinculado (p. ej. 502 `UPSTREAM_ERROR`, red). */
  bootstrapError: unknown;
  logout: () => Promise<void>;
  hasRole: (allowedRoles?: readonly RolUsuario[]) => boolean;
}

/**
 * Exportado a propósito (además de `useAuth`): permite componer un
 * `<AuthContext.Provider value={...}>` stub con un usuario mock fijo, sin
 * pasar por la lógica real de `AuthProvider` (hidratación de sesión,
 * `useQuery` de perfil). Único consumidor hoy:
 * `frontend/src/temas/variante-empresarial/StyleguidePage.tsx`, para
 * previsualizar `Sidebar`/`Header` de forma aislada sin wiring de red. No
 * cambia el comportamiento de `AuthProvider`/`useAuth` para el resto de la
 * app.
 *
 * Vive en su propio módulo (sin `AuthProvider`) a propósito: React Fast
 * Refresh re-ejecuta `AuthContext.tsx` al editarlo y volvería a crear este
 * `createContext`, desvinculando a los consumidores ya montados (`ProtectedRoute`,
 * `Header`, etc.) del `Provider` y disparando el error "useAuth debe usarse
 * dentro de <AuthProvider>". Mantener el contexto aquí lo hace estable
 * entre recargas en caliente.
 */
export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  }
  return context;
}
