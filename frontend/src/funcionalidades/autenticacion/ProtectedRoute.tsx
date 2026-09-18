import { Navigate, Outlet } from "react-router";
import type { RolUsuario, SessionScope } from "@/tipos/usuario";
import { useVistaEmpresa } from "@/funcionalidades/empresa-apariencia/useVistaEmpresa";
import { useAuth } from "./auth-context";
import { ErrorArranquePage, IdentidadNoVinculadaPage, SinSesionPage } from "./EstadosAccesoPage";
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
  const { user, isAuthenticated, isLoading, identityNotLinked, bootstrapError } = useAuth();
  const { empresaVistaId } = useVistaEmpresa();

  // `isLoading` cubre la hidratación de sesión al arrancar la app
  // (`GET /auth/perfil` vía gateway): sin esto se vería un parpadeo de
  // "sin sesión" mientras resuelve.
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="text-sm text-muted-foreground">Cargando sesión…</span>
      </div>
    );
  }

  // Autenticado en auth pero sin vínculo en el CRM (T5 decide el flujo real):
  // pantalla temporal, sin login ni redirección para no crear un bucle.
  if (identityNotLinked) {
    return <IdentidadNoVinculadaPage />;
  }

  if (bootstrapError) {
    return <ErrorArranquePage />;
  }

  // Sin sesión de plataforma: al frontend de auth (no hay login propio).
  if (!isAuthenticated) {
    return <SinSesionPage />;
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
