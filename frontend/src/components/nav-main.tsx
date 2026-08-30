import { NavLink } from "react-router";
import { type LucideIcon } from "lucide-react";

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
