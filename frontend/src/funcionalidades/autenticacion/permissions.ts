import { NAVIGATION_ITEMS } from "@/layouts/navigation";
import type { RolUsuario } from "@/tipos/usuario";

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
