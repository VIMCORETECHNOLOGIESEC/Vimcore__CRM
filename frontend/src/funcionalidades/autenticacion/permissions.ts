import { NAVIGATION_ITEMS } from "@/layouts/navigation";
import type { RolUsuario, SessionScope } from "@/tipos/usuario";

/**
 * Espejo exacto de `ROLES_HOLDING_BYPASS` en
 * `backend/src/middlewares/require-role.middleware.ts` (Bloque F, aditivo):
 * el backend ya bypasea CUALQUIER `requireRole(...)` para estos dos roles
 * antes de validar la lista fija -- sin este mismo bypass acá, `hasRoleAccess`
 * ocultaba del sidebar/rutas protegidas todo lo gateado con
 * `allowedRoles: ["ADMINISTRADOR"]` (Usuarios, Bridges, Apariencia, Empresas)
 * para una sesión `SUPER_ADMIN`/`SUPERVISOR_HOLDING`, aunque el backend ya le
 * daba acceso total -- bug real detectado en verificación E2E contra
 * producción (2026-08-30).
 */
const ROLES_HOLDING_BYPASS: readonly RolUsuario[] = ["SUPERVISOR_HOLDING", "SUPER_ADMIN"];

/**
 * Regla pura de autorización por rol para el enrutado del frontend.
 *
 * IMPORTANTE: esto es cosmético (AGENTS.md §6 -- "el filtrado por rol en el
 * frontend es cosmético y no cuenta como control de acceso"). El backend
 * revalida el rol en cada endpoint; esta función solo evita mostrar rutas
 * que el usuario no debería ver.
 *
 * Sin `allowedRoles` (o vacío), la ruta es pública para cualquier rol
 * autenticado.
 */
export function hasRoleAccess(
  rol: RolUsuario | null | undefined,
  allowedRoles?: readonly RolUsuario[],
): boolean {
  if (!allowedRoles || allowedRoles.length === 0) {
    return true;
  }
  if (!rol) {
    return false;
  }
  if (ROLES_HOLDING_BYPASS.includes(rol)) {
    return true;
  }
  return allowedRoles.includes(rol);
}

/**
 * Regla pura de autorización por scope de sesión (`docs/blocks/
 * d0-visualizacion-multitenant.md`, PASO 8) -- mismo criterio "cosmético"
 * que `hasRoleAccess`: el backend revalida `sessionScope` en cada endpoint
 * (ver guards de `empresa-apariencia.controller.ts`), esta función solo evita
 * mostrar rutas/ítems de navegación que la sesión actual no puede usar.
 *
 * Sin `allowedScopes` (o vacío), la ruta es pública para cualquier sesión
 * autenticada, sin distinguir `company`/`holding`.
 */
export function hasScopeAccess(
  scope: SessionScope | null | undefined,
  allowedScopes?: readonly SessionScope[],
): boolean {
  if (!allowedScopes || allowedScopes.length === 0) {
    return true;
  }
  if (!scope) {
    return false;
  }
  return allowedScopes.includes(scope);
}

/**
 * Ruta de aterrizaje tras iniciar sesión, según rol (F2, "Redirección
 * post-login según rol"). Primer ítem de `NAVIGATION_ITEMS` accesible para el
 * rol -- única fuente de verdad, ya usada por la barra lateral.
 *
 * Hoy F3+ (leads, dashboard) todavía no distingue vistas por rol, así que
 * el resultado es "/panel" para los 4 roles; cuando existan landings
 * distintas por rol, esta función ya las resuelve sin tocar quien la llama
 * (`LoginPage`).
 */
export function getLandingRoute(rol: RolUsuario): string {
  const primerItemAccesible = NAVIGATION_ITEMS.find((item) =>
    hasRoleAccess(rol, item.allowedRoles),
  );
  return primerItemAccesible?.route ?? "/panel";
}
