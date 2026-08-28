import { Bell } from "lucide-react";
import { useState } from "react";
import { NAVIGATION_ITEMS } from "@/layouts/navigation";
import { cn } from "@/lib/utils";

/**
 * Propuesta de fondo sólido índigo para sidebar/header (revisión de
 * identidad de Propuesta B -- ver `.interface-design/system.md`, "Fijo").
 *
 * Distinto, a propósito, de la card "Sidebar + Topbar (componentes reales)"
 * de más arriba: ese es `layouts/Sidebar.tsx`/`layouts/Header.tsx` tal cual
 * están HOY (tema neutro F1, ítem activo por `NavLink`/URL real). Este es un
 * mockup nuevo de la dirección Propuesta B -- el componente real no soporta
 * hoy ni el nuevo tratamiento visual (fondo sólido, pill de acento en vez de
 * borde izquierdo) ni una selección puramente local sin navegación, y
 * tocarlo cambiaría el sidebar de producción. Reutiliza únicamente los
 * DATOS reales de navegación (`NAVIGATION_ITEMS` -- mismas etiquetas, rutas
 * e íconos que usa el sidebar real), no su implementación visual.
 *
 * Interactividad: clickear un ítem alterna localmente cuál se ve "activo"
 * (estado de React puro) -- nunca dispara una navegación real, coherente
 * con el resto de esta página de catálogo.
 */
export function SidebarIndigoPreview() {
  const [rutaActiva, setRutaActiva] = useState(NAVIGATION_ITEMS[0]?.route ?? "");

  return (
    <div
      className="flex h-[380px] overflow-hidden rounded-sm"
      style={{ background: "var(--indigo)" }}
    >
      <aside className="flex w-56 shrink-0 flex-col gap-1 p-3">
        <div className="mb-3 px-2 pt-1">
          <p className="headline text-sm font-semibold text-[#F5F3EE]">CRM Embudo de Leads</p>
        </div>
        {NAVIGATION_ITEMS.map((item) => {
          const activo = item.route === rutaActiva;
          return (
            <button
              key={item.route}
              type="button"
              onClick={() => setRutaActiva(item.route)}
              aria-pressed={activo}
              className={cn(
                "flex items-center gap-3 rounded-full px-3 py-2 text-left text-sm transition-colors",
                activo
                  ? "bg-[var(--cat-2)] text-white ring-1 ring-white/10"
                  : "text-[#F5F3EE]/65 hover:text-[#F5F3EE]/90",
              )}
            >
              <item.icon className="size-4 shrink-0" aria-hidden="true" />
              {item.label}
            </button>
          );
        })}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 shrink-0 items-center justify-between px-4">
          <p className="text-sm font-medium text-[#F5F3EE]">
            {NAVIGATION_ITEMS.find((item) => item.route === rutaActiva)?.label ?? ""}
          </p>
          <div className="flex items-center gap-3">
            <Bell className="size-4 text-[#F5F3EE]/90" aria-hidden="true" />
            <span className="flex size-7 items-center justify-center rounded-full bg-[var(--cat-2)] text-xs font-semibold text-white">
              MP
            </span>
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center bg-[var(--papel)] p-4 text-sm text-[var(--indigo-2)] opacity-60">
          (Canvas de contenido -- papel cálido, fuera del alcance de esta card)
        </div>
      </div>
    </div>
  );
}
