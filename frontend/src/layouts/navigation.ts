import { Building2, FileText, Handshake, LayoutDashboard, Palette, Plug, UserCog, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { RolUsuario, SessionScope } from "@/tipos/usuario";

export interface NavigationItem {
  label: string;
  /** Route de fallback cuando `routeByScope` no tiene entrada para el scope actual. */
  route: string;
  icon: LucideIcon;
  /** Sin especificar, visible para cualquier rol autenticado. */
  allowedRoles?: readonly RolUsuario[];
  /**
   * Filtro por scope de sesión (`docs/blocks/d0-visualizacion-multitenant.md`,
   * PASO 8) -- mismo patrón que `allowedRoles`. Sin especificar, visible para
   * cualquier scope.
   */
  allowedScopes?: readonly SessionScope[];
  /**
   * (personalizacion-identidad-visual) Ruta por scope de sesión para un
   * ítem que apunta a un destino distinto según sea sesión `holding` o
   * `company`, sin necesitar dos entradas separadas en `NAVIGATION_ITEMS`
   * (ver `resolveNavigationRoute`). Sin entrada para el scope actual, se usa
   * `route`.
   */
  routeByScope?: Partial<Record<SessionScope, string>>;
  /**
   * (Bloque D/E, gate holding-wide sin empresa) Un holding-wide
   * (`SUPER_ADMIN`/`SUPERVISOR_HOLDING`/`ADMINISTRADOR` de sesión `holding`)
   * no gestiona leads/oportunidades/bridges de ninguna empresa en particular
   * -- solo tiene sentido para ítems que dependen de una empresa concreta
   * (Oportunidades, Bridges) una vez que "entró" a la vista de esa empresa
   * (`useVistaEmpresa()`, query param `?empresaId=`). Con sesión `company`
   * este flag no aplica nunca (una empresa siempre gestiona lo suyo). Ver
   * `hasVistaEmpresaAccess` (permissions.ts) y `resolveNavigationHref` abajo.
   */
  requiereVistaEmpresaSiHolding?: boolean;
}

/**
 * Resuelve el `route` efectivo de un ítem de navegación para el scope de la
 * sesión actual -- `AppSidebar.tsx` la aplica antes de pasar los ítems a
 * `NavMain`, así `NavMainItem.route` sigue siendo un `string` plano y no se
 * propaga la noción de scope más allá de este único call site.
 */
export function resolveNavigationRoute(
  item: NavigationItem,
  scope: SessionScope | null | undefined,
): string {
  if (scope && item.routeByScope?.[scope]) {
    return item.routeByScope[scope];
  }
  return item.route;
}

/**
 * Resuelve el `href` efectivo (ruta + query string) de un ítem para
 * `NavMain`/`NavLink` -- envoltorio de `resolveNavigationRoute` que además
 * propaga `?empresaId=` cuando el ítem lo requiere (Oportunidades, Bridges):
 * sin esto, un holding-wide que hizo clic en el sidebar mientras estaba en
 * vista de empresa perdería el filtro al navegar (esas páginas leen
 * `empresaVistaId` de la URL vía `useVistaEmpresa()`, no de un estado
 * separado). Sesión `company` nunca agrega el param, aunque exista un
 * `empresaVistaId` residual en la URL actual -- no aplica para esa sesión.
 */
export function resolveNavigationHref(
  item: NavigationItem,
  scope: SessionScope | null | undefined,
  empresaVistaId?: string | null,
): string {
  const route = resolveNavigationRoute(item, scope);
  if (item.requiereVistaEmpresaSiHolding && scope === "holding" && empresaVistaId) {
    return `${route}?empresaId=${encodeURIComponent(empresaVistaId)}`;
  }
  return route;
}

/** Ítems de la barra lateral principal (docs/07 F1). */
export const NAVIGATION_ITEMS: readonly NavigationItem[] = [
  { label: "Dashboard", route: "/panel", icon: LayoutDashboard },
  { label: "Leads", route: "/leads", icon: Users },
  {
    label: "Oportunidades",
    route: "/oportunidades",
    icon: Handshake,
    requiereVistaEmpresaSiHolding: true,
  },
  {
    label: "Usuarios",
    route: "/usuarios",
    icon: UserCog,
    allowedRoles: ["ADMINISTRADOR"],
  },
  {
    label: "Bridges",
    route: "/bridges",
    icon: Plug,
    allowedRoles: ["ADMINISTRADOR"],
    requiereVistaEmpresaSiHolding: true,
  },
  {
    label: "Reportes",
    route: "/reportes",
    icon: FileText,
    allowedRoles: ["ADMINISTRADOR", "SUPERVISOR"],
  },
  {
    label: "Apariencia",
    route: "/configuracion-empresa",
    icon: Palette,
    allowedRoles: ["ADMINISTRADOR"],
    routeByScope: { holding: "/configuracion-empresa", company: "/apariencia-empresa" },
  },
  {
    label: "Empresas",
    route: "/empresas",
    icon: Building2,
    allowedRoles: ["ADMINISTRADOR"],
    allowedScopes: ["holding"],
  },
];
