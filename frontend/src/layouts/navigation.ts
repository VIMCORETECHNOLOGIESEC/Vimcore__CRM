import { LayoutDashboard, Plug, UserCog, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { RolUsuario } from "@/tipos/usuario";

export interface NavigationItem {
  label: string;
  route: string;
  icon: LucideIcon;
  /** Sin especificar, visible para cualquier rol autenticado. */
  allowedRoles?: readonly RolUsuario[];
}

/** Ítems de la barra lateral principal (docs/07 F1). */
export const NAVIGATION_ITEMS: readonly NavigationItem[] = [
  { label: "Panel", route: "/panel", icon: LayoutDashboard },
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
];
