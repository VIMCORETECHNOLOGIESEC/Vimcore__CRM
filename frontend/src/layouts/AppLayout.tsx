import { Outlet } from "react-router";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";

/**
 * Layout principal (docs/07 F1): barra lateral + encabezado + contenido.
 * Puntos de corte (Tailwind por defecto, docs/09 §2 principio 7 --
 * responsive real móvil/tableta/escritorio):
 * - `< md` (móvil/tableta angosta): sin barra lateral fija, se abre como
 *   panel deslizable (`Sheet`) desde el encabezado.
 * - `>= md` (tableta ancha/escritorio): barra lateral fija de 240px.
 */
export function AppLayout() {
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-60 shrink-0 border-r border-border md:block">
        <Sidebar />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
