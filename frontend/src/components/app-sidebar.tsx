import * as React from "react"

import { NavMain } from "@/components/nav-main"
import { useAuth } from "@/funcionalidades/autenticacion/auth-context"
import { hasRoleAccess, hasScopeAccess, hasVistaEmpresaAccess, hasVistaEmpresaAusente } from "@/funcionalidades/autenticacion/permissions"
import { useConfiguracionEmpresa } from "@/funcionalidades/configuracion-empresa/useConfiguracionEmpresa"
import { useEmpresaHolding } from "@/funcionalidades/empresa-apariencia/useEmpresaAparienciaHolding"
import { useVistaEmpresa } from "@/funcionalidades/empresa-apariencia/useVistaEmpresa"
import { resolveLogoMarca, resolveNombreMarca } from "@/lib/color-marca"
import { NAVIGATION_ITEMS, resolveNavigationHref } from "@/layouts/navigation"
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
  // PASO 7: nombre configurable -- misma jerarquía de 3 niveles que ya usa
  // `AppLayout.tsx` para los acentos de color (`resolveEstilosMarca`).
  // PASO 6: isotipo, mismo criterio, ver `color-marca.ts`.
  const { data: configuracionHolding } = useConfiguracionEmpresa()
  // Bloque D/E: un holding-wide sin "entrar" a una empresa concreta no
  // gestiona oportunidades/bridges de ninguna en particular -- ver
  // `hasVistaEmpresaAccess`/`resolveNavigationHref` (navigation.ts).
  const { empresaVistaId } = useVistaEmpresa()
  // Fix (2026-09-01, bug real): un holding-wide en vista de una empresa
  // puntual seguía viendo el logo/nombre del HOLDING en el sidebar, nunca
  // el de la empresa que estaba mirando -- `resolveNombreMarca`/
  // `resolveLogoMarca` solo conocen dos niveles (empresa propia de una
  // sesión `company`, o el holding). Se suma acá, ANTES de esos dos, un
  // tercer nivel exclusivo de sesión `holding` con vista activa: la
  // `Empresa` puntual que se está mirando (`GET /empresas/:empresaId`,
  // mismo `useEmpresaHolding` que ya usa `EmpresaDetallePage.tsx`).
  // `enVistaDeEmpresa` filtra explícitamente por `sessionScope === "holding"`
  // -- una sesión `company` nunca debe verse afectada por un `?empresaId=`
  // residual en la URL (mismo criterio que `resolveNavigationHref`) -- Y por
  // `rol === "ADMINISTRADOR"`: `GET /empresas/:empresaId`
  // (`empresa-apariencia.routes.ts`) exige ese rol exacto, y es el único que
  // puede llegar a "Empresas" -> "Ver detalles" para entrar a una vista en
  // primer lugar -- sin este chequeo, un SUPERVISOR_HOLDING/SUPER_ADMIN con
  // un `?empresaId=` a mano en la URL dispararía una consulta que el
  // backend siempre rechaza con 403.
  const enVistaDeEmpresa =
    user?.sessionScope === "holding" && user.rol === "ADMINISTRADOR" && Boolean(empresaVistaId)
  const { data: empresaEnVista } = useEmpresaHolding(enVistaDeEmpresa ? (empresaVistaId ?? undefined) : undefined)
  const nombreMarca = empresaEnVista?.nombre ?? resolveNombreMarca(user, configuracionHolding)
  const logoMarca = empresaEnVista?.logoUrl ?? resolveLogoMarca(user, configuracionHolding)

  const items = NAVIGATION_ITEMS.filter(
    (item) =>
      hasRoleAccess(user?.rol, item.allowedRoles) &&
      hasScopeAccess(user?.sessionScope, item.allowedScopes) &&
      hasVistaEmpresaAccess(user?.sessionScope, empresaVistaId, item.requiereVistaEmpresaSiHolding) &&
      hasVistaEmpresaAusente(user?.sessionScope, empresaVistaId, item.ocultarSiVistaEmpresa),
  ).map((item) => ({
    ...item,
    route: resolveNavigationHref(item, user?.sessionScope, empresaVistaId),
  }))

  return (
    <Sidebar
      collapsible="icon"
      {...props}
    >
      <SidebarHeader>
        <div className="flex min-w-0 items-center gap-2 px-2 py-1.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:px-0">
          {logoMarca ? (
            <img
              src={logoMarca}
              alt=""
              aria-hidden="true"
              className="size-8 shrink-0 rounded-md object-contain"
            />
          ) : (
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-md border border-dashed border-sidebar-foreground/35 bg-transparent text-sm font-bold text-sidebar-foreground/60"
              aria-hidden="true"
            >
              {nombreMarca[0]?.toUpperCase() ?? "I"}
            </span>
          )}
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-sm font-semibold text-sidebar-foreground">
              {nombreMarca}
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
