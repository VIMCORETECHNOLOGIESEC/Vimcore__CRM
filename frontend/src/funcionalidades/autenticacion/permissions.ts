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
