import { Navigate, Outlet, useLocation } from "react-router";
import type { RolUsuario, SessionScope } from "@/tipos/usuario";
import { useAuth } from "./authContext";
import { hasRoleAccess, hasScopeAccess } from "./permissions";

interface ProtectedRouteProps {
  /** Sin especificar, cualquier usuario autenticado puede acceder. */
  allowedRoles?: readonly RolUsuario[];
  /**
   * Filtro por scope de sesión (`docs/blocks/d0-visualizacion-multitenant.md`,
   * PASO 8) -- mismo patrón que `allowedRoles`, para pantallas exclusivas de
   * sesión `holding` (ej. "gestor de empresas") o `company` (ej. apariencia
   * self-service). Sin especificar, cualquier scope puede acceder.
   */
  allowedScopes?: readonly SessionScope[];
}

/**
 * Guarda de rutas por sesión y, opcionalmente, por rol y/o scope. Recordatorio
 * de AGENTS.md §6: esto es control de acceso cosmético en el cliente, el
 * backend es quien autoriza de verdad en cada endpoint.
 */
export function ProtectedRoute({ allowedRoles, allowedScopes }: ProtectedRouteProps) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  // `isLoading` cubre la rehidratación de sesión al arrancar la app (F2):
  // sin esto, un refresh token persistido válido igual mostraría un
  // parpadeo de "sesión expirada" -> login mientras se restaura.
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="text-sm text-muted-foreground">Cargando sesión…</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/iniciar-sesion" replace state={{ desde: location.pathname }} />;
  }

  if (!hasRoleAccess(user?.rol, allowedRoles) || !hasScopeAccess(user?.sessionScope, allowedScopes)) {
    return <Navigate to="/panel" replace />;
  }

  return <Outlet />;
}
