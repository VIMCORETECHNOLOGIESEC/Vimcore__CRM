import * as React from "react"

import { NavMain } from "@/components/nav-main"
import { useAuth } from "@/funcionalidades/autenticacion/authContext"
import { hasRoleAccess } from "@/funcionalidades/autenticacion/permissions"
import { NAVIGATION_ITEMS } from "@/layouts/navigation"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar"

function iniciales(nombre: string): string {
  return nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase() ?? "")
    .join("")
}

const ETIQUETA_ROL: Record<string, string> = {
  ADMINISTRADOR: "Administrador",
  SUPERVISOR: "Supervisor",
  ASESOR: "Asesor",
  VENDEDOR: "Vendedor",
}

/**
 * Sidebar principal de la app, a partir del bloque `sidebar-07` de shadcn
 * (`collapsible="icon"`): colapsa a iconos con tooltips, en móvil se abre
 * como `Sheet`, y el "chrome" usa los tokens `--sidebar` mapeados a la
 * familia `vimcore` (indigo sólido + pill azul, ver `index.css`).
 */
export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user } = useAuth()

  const items = NAVIGATION_ITEMS.filter((item) =>
    hasRoleAccess(user?.rol, item.allowedRoles),
  )

  return (
    <Sidebar
      collapsible="icon"
      {...props}
    >
      <SidebarHeader>
        <div className="flex min-w-0 items-center gap-2 px-2 py-1.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:px-0">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-md border border-dashed border-sidebar-foreground/35 bg-transparent text-sm font-bold text-sidebar-foreground/60"
            aria-hidden="true"
          >
            I
          </span>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-sm font-semibold text-sidebar-foreground">
              IDEC CRM
            </p>
            <p className="truncate text-[10px] uppercase tracking-[0.16em] text-sidebar-foreground/60">
              Embudo de leads
            </p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={items} />
      </SidebarContent>
      <SidebarFooter>
        <div className="flex min-w-0 items-center gap-2 px-2 py-1.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:px-0">
          <Avatar className="size-8">
            <AvatarFallback className="bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground">
              {user ? iniciales(user.nombre) : "—"}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-sm font-medium text-sidebar-foreground">
              {user?.nombre ?? "Usuario"}
            </p>
            <p className="truncate text-xs text-sidebar-foreground/60">
              {user ? ETIQUETA_ROL[user.rol] ?? user.rol : ""}
            </p>
          </div>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
