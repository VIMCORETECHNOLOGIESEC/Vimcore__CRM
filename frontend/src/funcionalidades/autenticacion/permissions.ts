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
 * Regla pura de autorización por "vista de empresa" (Bloque D/E, gate
 * holding-wide sin empresa) -- espejo de `hasRoleAccess`/`hasScopeAccess`:
 * un holding-wide (sesión `holding`) sin haber "entrado" a una empresa
 * concreta (`useVistaEmpresa()::empresaVistaId`, query param `?empresaId=`)
 * no gestiona leads/oportunidades/bridges de ninguna empresa en particular,
 * así que un ítem marcado con `requiereVistaEmpresaSiHolding` (Oportunidades,
 * Bridges) queda oculto/bloqueado hasta que entre a una. Sesión `company`
 * nunca se ve afectada por este flag -- una empresa siempre gestiona lo
 * suyo, sin necesitar "entrar" a nada.
 *
 * Sin `requiereVistaEmpresaSiHolding` (o `false`), el acceso es libre --
 * mismo criterio "sin restricción por defecto" que el resto de estas
 * funciones.
 */
export function hasVistaEmpresaAccess(
  scope: SessionScope | null | undefined,
  empresaVistaId: string | null | undefined,
  requiereVistaEmpresaSiHolding?: boolean,
): boolean {
  if (!requiereVistaEmpresaSiHolding) {
    return true;
  }
  if (scope !== "holding") {
    return true;
  }
  return Boolean(empresaVistaId);
}

/**
 * Fix (2026-09-02, bug real reportado por Mateo): inverso de
 * `hasVistaEmpresaAccess` -- para ítems que dejan de tener sentido MIENTRAS
 * un holding-wide está "adentro" de la vista de una empresa puntual
 * (Apariencia edita el branding GLOBAL del holding, no el de esa empresa;
 * Empresas es la gestión cross-empresa del holding). Antes seguían visibles
 * en el sidebar durante la vista -- confuso, invita a editar el recurso
 * equivocado pensando que se edita el de la empresa que se está mirando.
 *
 * Mismo criterio "sin restricción por defecto" que el resto de estas
 * funciones: sin `ocultarSiVistaEmpresa` (o `false`), o para sesión
 * `company`, o para holding-wide SIN vista activa, el ítem sigue visible
 * igual que siempre.
 */
export function hasVistaEmpresaAusente(
  scope: SessionScope | null | undefined,
  empresaVistaId: string | null | undefined,
  ocultarSiVistaEmpresa?: boolean,
): boolean {
  if (!ocultarSiVistaEmpresa) {
    return true;
  }
  if (scope !== "holding") {
    return true;
  }
  return !empresaVistaId;
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
