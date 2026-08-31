import { Navigate, Outlet, useLocation } from "react-router";
import type { RolUsuario, SessionScope } from "@/tipos/usuario";
import { useVistaEmpresa } from "@/funcionalidades/empresa-apariencia/useVistaEmpresa";
import { useAuth } from "./auth-context";
import { hasRoleAccess, hasScopeAccess, hasVistaEmpresaAccess } from "./permissions";

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
  /**
   * Gate real (no solo cosmético del sidebar) de "vista de empresa" (Bloque
   * D/E) -- un holding-wide (sesión `holding`) que entra por URL directa sin
   * `?empresaId=` activo (`useVistaEmpresa()`) es redirigido, mismo destino
   * que el resto de los rechazos de esta guarda. Sesión `company` nunca se ve
   * afectada. Ver `hasVistaEmpresaAccess` (permissions.ts).
   */
  requiereVistaEmpresaSiHolding?: boolean;
}

/**
 * Guarda de rutas por sesión y, opcionalmente, por rol y/o scope. Recordatorio
 * de AGENTS.md §6: esto es control de acceso cosmético en el cliente, el
 * backend es quien autoriza de verdad en cada endpoint.
 */
export function ProtectedRoute({
  allowedRoles,
  allowedScopes,
  requiereVistaEmpresaSiHolding,
}: ProtectedRouteProps) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  const { empresaVistaId } = useVistaEmpresa();

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

  if (
    !hasRoleAccess(user?.rol, allowedRoles) ||
    !hasScopeAccess(user?.sessionScope, allowedScopes) ||
    !hasVistaEmpresaAccess(user?.sessionScope, empresaVistaId, requiereVistaEmpresaSiHolding)
  ) {
    return <Navigate to="/panel" replace />;
  }

  return <Outlet />;
}
