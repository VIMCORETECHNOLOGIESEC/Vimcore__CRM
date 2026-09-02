import { NavLink } from "react-router";
import { type LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

export interface NavMainItem {
  label: string;
  route: string;
  icon: LucideIcon;
  /**
   * Contador opcional junto al label (ej. conversaciones sin leer). Mismo
   * estilo visual que el badge de la campana de notificaciones
   * (`CampanaNotificaciones.tsx`, `Badge variant="destructive"`, "9+" si
   * supera 9) -- sin badge cuando es `0`/`undefined`.
   */
  badge?: number;
}

/**
 * Navegación principal del CRM dentro del sidebar. Los ítems ya llegan
 * filtrados por rol (`AppSidebar`); el estado activo viene de la URL real
 * vía `NavLink`, no de estado local. En móvil, navegar cierra el `Sheet`.
 */
export function NavMain({ items }: { items: NavMainItem[] }) {
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Gestión comercial</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => (
          <SidebarMenuItem key={item.route}>
            <NavLink to={item.route}>
              {({ isActive }) => (
                <SidebarMenuButton
                  asChild
                  isActive={isActive}
                  tooltip={item.label}
                  className="h-10 rounded-full pl-3 hover:bg-transparent hover:text-sidebar-foreground/90"
                >
                  <span
                    onClick={() => {
                      if (isMobile) setOpenMobile(false);
                    }}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                    {item.badge ? (
                      <Badge
                        variant="destructive"
                        className="ml-auto h-4 min-w-4 justify-center rounded-full px-1 text-[10px] leading-none group-data-[collapsible=icon]:hidden"
                      >
                        {item.badge > 9 ? "9+" : item.badge}
                      </Badge>
                    ) : null}
                  </span>
                </SidebarMenuButton>
              )}
            </NavLink>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
