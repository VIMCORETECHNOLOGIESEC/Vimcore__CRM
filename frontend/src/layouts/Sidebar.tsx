import { NavLink } from "react-router";
import arcanoIsotipo from "@/assets/arcano-isotipo.png";
import { cn } from "@/lib/utils";
import { useAuth } from "@/funcionalidades/autenticacion/AuthContext";
import { hasRoleAccess } from "@/funcionalidades/autenticacion/permissions";
import { NAVIGATION_ITEMS } from "./navigation";

interface SidebarProps {
  /** Cierra el `Sheet` móvil al navegar; no aplica en escritorio. */
  onNavigate?: () => void;
}

/**
 * Contenido de navegación compartido entre la barra lateral fija de
 * escritorio y el panel deslizable (`Sheet`) de móvil/tableta. El fondo
 * comparte el color del canvas (`bg-background`); el acento dorado
 * (`--arcano-gold`) marca solo el ítem activo, nunca un bloque sólido grande
 * (docs/09 §3, docs/branding/arcano-linea-grafica.md).
 */
export function Sidebar({ onNavigate }: SidebarProps) {
  const { user } = useAuth();

  const visibleItems = NAVIGATION_ITEMS.filter((item) =>
    hasRoleAccess(user?.rol, item.allowedRoles),
  );

  return (
    <nav className="flex h-full flex-col gap-1 p-3" aria-label="Navegación principal">
      <div className="mb-4 flex items-center gap-2 px-2 pt-1">
        <img src={arcanoIsotipo} alt="" aria-hidden="true" className="h-6 w-auto" />
        <p className="text-sm font-semibold text-foreground">ARCANO CRM</p>
      </div>
      {visibleItems.map((item) => (
        <NavLink
          key={item.route}
          to={item.route}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-md border-l-2 border-transparent px-3 py-2 text-sm transition-colors",
              isActive
                ? "bg-accent font-medium text-foreground [border-left-color:var(--arcano-gold)]"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )
          }
        >
          <item.icon className="size-4 shrink-0" aria-hidden="true" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
