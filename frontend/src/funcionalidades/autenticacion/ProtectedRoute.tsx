import { Navigate, Outlet, useLocation } from "react-router";
import type { RolUsuario } from "@/tipos/usuario";
import { useAuth } from "./AuthContext";
import { hasRoleAccess } from "./permissions";

interface ProtectedRouteProps {
  /** Sin especificar, cualquier usuario autenticado puede acceder. */
  allowedRoles?: readonly RolUsuario[];
}

/**
 * Guarda de rutas por sesión y, opcionalmente, por rol. Recordatorio de
 * AGENTS.md §6: esto es control de acceso cosmético en el cliente, el
 * backend es quien autoriza de verdad en cada endpoint.
 */
export function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/iniciar-sesion" replace state={{ desde: location.pathname }} />;
  }

  if (!hasRoleAccess(user?.rol, allowedRoles)) {
    return <Navigate to="/panel" replace />;
  }

  return <Outlet />;
}
