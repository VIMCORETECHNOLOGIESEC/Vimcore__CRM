import { Building2, FileText, Handshake, LayoutDashboard, MessageSquare, Palette, Plug, UserCog, Users } from "lucide-react";
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
  /**
   * Fix (2026-09-01, bug real: "entrar" a Usuarios desde el sidebar
   * mientras se está en vista de empresa perdía esa vista por completo, sin
   * aviso, y no volvía al navegar de nuevo a Leads/Bridges). Antes,
   * `requiereVistaEmpresaSiHolding` controlaba DOS cosas a la vez acá abajo
   * en `resolveNavigationHref` -- (a) ocultar el ítem para un holding-wide
   * sin vista activa (`hasVistaEmpresaAccess`, permissions.ts) y (b)
   * propagar `?empresaId=` en el link. Usuarios necesita (b) pero NUNCA (a)
   * -- tiene su propio tab holding-wide (`soloHoldingWide`, Item 25) y debe
   * seguir siempre visible sin depender de ninguna empresa (ese es
   * justamente el motivo por el que se le sacó `requiereVistaEmpresaSiHolding`
   * en la corrección de la regresión de `e0cb7f8`) -- pero de paso perdió
   * también (b), que sí necesitaba. Este flag nuevo es (b) sola, sin (a):
   * nunca oculta el ítem, solo preserva `?empresaId=` cuando ya había una
   * vista activa al hacer clic.
   */
  preservaVistaEmpresaSiHolding?: boolean;
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
 * propaga `?empresaId=` cuando el ítem lo requiere (Oportunidades, Bridges,
 * Leads, Conversaciones) O cuando solo lo preserva sin exigirlo (Usuarios,
 * `preservaVistaEmpresaSiHolding` -- ver el docblock de ese flag arriba):
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
  const propagaEmpresaId = item.requiereVistaEmpresaSiHolding || item.preservaVistaEmpresaSiHolding;
  if (propagaEmpresaId && scope === "holding" && empresaVistaId) {
    return `${route}?empresaId=${encodeURIComponent(empresaVistaId)}`;
  }
  return route;
}

/** Ítems de la barra lateral principal (docs/07 F1). */
export const NAVIGATION_ITEMS: readonly NavigationItem[] = [
  { label: "Dashboard", route: "/panel", icon: LayoutDashboard },
  {
    label: "Leads",
    route: "/leads",
    icon: Users,
    requiereVistaEmpresaSiHolding: true,
  },
  {
    // WhatsApp Parte 2 (mensajería real): mismo criterio que Leads/
    // Oportunidades/Bridges -- un holding-wide no gestiona conversaciones de
    // ninguna empresa en particular hasta "entrar" a la vista de una
    // concreta.
    label: "Conversaciones",
    route: "/conversaciones",
    icon: MessageSquare,
    requiereVistaEmpresaSiHolding: true,
  },
  {
    label: "Oportunidades",
    route: "/oportunidades",
    icon: Handshake,
    requiereVistaEmpresaSiHolding: true,
  },
  {
    // Fix (regresión de e0cb7f8): SIN `requiereVistaEmpresaSiHolding` a
    // diferencia de Bridges -- `/usuarios` tiene su propio tab holding-wide
    // (`soloHoldingWide`, Item 25) para que el admin de holding gestione su
    // propio staff sin depender de ninguna empresa. Ver el comentario
    // equivalente en `router.tsx`.
    //
    // Fix (2026-09-01): SÍ lleva `preservaVistaEmpresaSiHolding` -- ver su
    // docblock en la interfaz de arriba. Sin este flag, entrar a Usuarios
    // desde el sidebar mientras había una vista de empresa activa la
    // perdía por completo (aterrizaba en `/usuarios` sin `?empresaId=`), y
    // no volvía al navegar de nuevo a Leads/Bridges -- el sidebar recalcula
    // esos links a partir de la URL actual, que ya no tenía el id.
    label: "Usuarios",
    route: "/usuarios",
    icon: UserCog,
    allowedRoles: ["ADMINISTRADOR"],
    preservaVistaEmpresaSiHolding: true,
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
