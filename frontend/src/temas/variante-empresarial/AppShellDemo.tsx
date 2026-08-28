import { Bell } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { LeadsTable } from "@/funcionalidades/leads/LeadsTable";
import { NAVIGATION_ITEMS } from "@/layouts/navigation";
import { cn } from "@/lib/utils";
import { LEADS_MOCK_STYLEGUIDE } from "./StyleguidePage";

interface AppShellDemoProps {
  /** Disparado por "Reiniciar demo" en el header -- vuelve la máquina de estados a `boot`. */
  onReiniciar: () => void;
}

/** Usuario mock del header -- sin sesión/auth real, solo para las iniciales del avatar. */
const USUARIO_DEMO = { nombre: "Sofía Ramírez", rol: "Asesora comercial" };

function iniciales(nombre: string): string {
  return nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Shell de la app a viewport completo (sidebar + header índigo), última
 * etapa de `FlujoIntegracionDemo.tsx`. Mismo lenguaje visual que
 * `SidebarIndigoPreview.tsx` (reusa `NAVIGATION_ITEMS`, mismo patrón de pill
 * activo/inactivo, mismo header con campana + avatar) pero SIN la card
 * acotada de 380px del catálogo -- este componente es nuevo, exclusivo de la
 * demo, `SidebarIndigoPreview.tsx` no se toca.
 *
 * Única sección con contenido real: "Leads", con la tabla real
 * (`LeadsTable.tsx`) montada dentro de `.leads-table-card` (clase ya
 * aprobada, `tema-empresarial.css`) usando la misma cartera mock del
 * catálogo (`LEADS_MOCK_STYLEGUIDE`, reexportada desde `StyleguidePage.tsx`).
 * El resto de las secciones (Dashboard/Usuarios/Bridges) quedan fuera de
 * alcance de este demo -- solo un placeholder, mismo criterio que el canvas
 * vacío de `SidebarIndigoPreview`.
 */
export function AppShellDemo({ onReiniciar }: AppShellDemoProps) {
  const [rutaActiva, setRutaActiva] = useState(NAVIGATION_ITEMS[1]?.route ?? NAVIGATION_ITEMS[0]?.route ?? "");
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());

  const onToggleSeleccion = (leadId: string) => {
    setSeleccionados((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(leadId)) {
        siguiente.delete(leadId);
      } else {
        siguiente.add(leadId);
      }
      return siguiente;
    });
  };

  const onToggleSeleccionTodos = (marcar: boolean) => {
    setSeleccionados(marcar ? new Set(LEADS_MOCK_STYLEGUIDE.map((lead) => lead.id)) : new Set());
  };

  const itemActivo = NAVIGATION_ITEMS.find((item) => item.route === rutaActiva);

  return (
    <div className="flex h-screen w-full overflow-hidden" style={{ background: "var(--indigo)" }}>
      <aside className="flex w-60 shrink-0 flex-col gap-1 p-3">
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
        <div className="flex h-14 shrink-0 items-center justify-between px-6">
          <p className="text-sm font-medium text-[#F5F3EE]">{itemActivo?.label ?? ""}</p>
          <div className="flex items-center gap-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onReiniciar}
              className="text-[#F5F3EE]/80 hover:bg-transparent hover:text-[#F5F3EE]"
            >
              Reiniciar demo
            </Button>
            <Bell className="size-4 text-[#F5F3EE]/90" aria-hidden="true" />
            <span className="flex size-7 items-center justify-center rounded-full bg-[var(--cat-2)] text-xs font-semibold text-white">
              {iniciales(USUARIO_DEMO.nombre)}
            </span>
          </div>
        </div>

        <div
          className="scrollbar-themed flex-1 overflow-y-auto p-6"
          style={{ background: "var(--papel)" }}
        >
          {rutaActiva === "/leads" ? (
            <div className="leads-table-card w-full">
              <LeadsTable
                leads={LEADS_MOCK_STYLEGUIDE}
                mostrarColumnaResponsable
                permitirSeleccion
                seleccionados={seleccionados}
                onToggleSeleccion={onToggleSeleccion}
                onToggleSeleccionTodos={onToggleSeleccionTodos}
              />
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-[var(--indigo-2)] opacity-60">
              (Fuera de alcance de este demo)
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
