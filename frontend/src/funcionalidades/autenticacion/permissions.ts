import { NAVIGATION_ITEMS } from "@/layouts/navigation";
import type { RolUsuario, SessionScope } from "@/tipos/usuario";

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
