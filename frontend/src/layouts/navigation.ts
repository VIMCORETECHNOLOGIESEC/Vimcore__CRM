import { Building2, LayoutDashboard, Palette, Plug, UserCog, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { RolUsuario, SessionScope } from "@/tipos/usuario";

export interface NavigationItem {
  label: string;
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
}

/** Ítems de la barra lateral principal (docs/07 F1). */
export const NAVIGATION_ITEMS: readonly NavigationItem[] = [
  { label: "Dashboard", route: "/panel", icon: LayoutDashboard },
  { label: "Leads", route: "/leads", icon: Users },
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
  },
  {
    label: "Apariencia",
    route: "/configuracion-empresa",
    icon: Palette,
    allowedRoles: ["ADMINISTRADOR"],
  },
  {
    label: "Apariencia de mi empresa",
    route: "/apariencia-empresa",
    icon: Palette,
    allowedRoles: ["ADMINISTRADOR"],
    allowedScopes: ["company"],
  },
  {
    label: "Empresas",
    route: "/empresas",
    icon: Building2,
    allowedRoles: ["ADMINISTRADOR"],
    allowedScopes: ["holding"],
  },
];
