import { Bell, Image as ImageIcon } from "lucide-react";
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
 * Shell de la app a viewport completo (sidebar + header índigo sólido,
 * `.chrome-solido`), última etapa de `FlujoIntegracionDemo.tsx`. Pasó por
 * un gradiente de marca completo (2026-08-28) y se revirtió el mismo día
 * tras feedback + research (ver `.chrome-gradiente`/`.chrome-solido` en
 * `tema-empresarial.css`): el gradiente queda reservado a momentos "hero"
 * (login, splash), el chrome funcional que se escanea todo el tiempo vuelve
 * a ser sólido y estable. Mismo lenguaje visual que `SidebarIndigoPreview.tsx`
 * (reusa `NAVIGATION_ITEMS`, mismo patrón de pill activo/inactivo, mismo
 * header con campana + avatar) pero SIN la card acotada de 380px del
 * catálogo -- este componente es nuevo, exclusivo de la demo.
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
    <div className="flex h-screen w-full overflow-hidden">
      <aside className="chrome-solido chrome-sombra-derecha flex w-60 shrink-0 flex-col gap-1 p-3">
        {/*
          Isotipo del holding + nombre de la herramienta, mismo criterio que
          el panel de marca del login (`LoginScreenDemo.tsx`): el isotipo es
          lo que cambia por empresa, el nombre de la herramienta es fijo.
          Acá en miniatura (28px) porque el sidebar es angosto -- mismo
          patrón visual, escala distinta. Color de texto vía `style` inline
          a propósito, NUNCA una clase Tailwind (`text-[#F5F3EE]`): `.headline`
          define `color: var(--indigo)` con más especificidad que cualquier
          utilidad de una sola clase, así que el texto quedaba renderizando
          en índigo sobre fondo índigo -- invisible. `style` inline gana
          siempre, sin importar especificidad de clases.
        */}
        <div className="mb-3 flex items-center gap-2 px-2 pt-1">
          <span
            className="flex size-7 shrink-0 items-center justify-center rounded-md border border-dashed border-[#F5F3EE]/35"
            aria-hidden="true"
          >
            <ImageIcon className="size-3.5 text-[#F5F3EE]/60" />
          </span>
          <p className="headline text-sm font-semibold !text-[var(--papel)]">
            CRM Embudo de Leads
          </p>
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
        <div className="chrome-solido chrome-sombra-abajo flex h-14 shrink-0 items-center justify-between px-6">
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

        {/*
          `.patron-papel` (tema-empresarial.css): mismo patrón de retícula
          fina que el panel derecho del login, detrás del form -- antes acá
          era un `--papel` liso (feedback: "se ve plano y monótono" apenas
          se entra a la app real, en contraste con el login premium). Las
          cards de este canvas (`.leads-table-card` de abajo) quedan
          SOBREPUESTAS sobre este patrón, con su propia sombra ya aprobada
          -- no se toca esa card, solo el fondo detrás de ella.
        */}
        <div className="patron-papel scrollbar-themed flex-1 overflow-y-auto p-6">
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
              <div className="leads-table-footer flex items-center justify-between px-4 py-3 text-sm">
                <span>Mostrando 1–{LEADS_MOCK_STYLEGUIDE.length} de {LEADS_MOCK_STYLEGUIDE.length} leads</span>
                <span>Página 1 de 1</span>
              </div>
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
