import { useEffect, useRef } from "react";
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
 *
 * `main` es solo el recorte posicionado (landmark semántico); el scroll
 * real vive en el `div` interno, que además marca `is-scrolling` mientras
 * hay movimiento para que la scrollbar se oscurezca (ver .scrollbar-themed
 * en index.css).
 */
export function AppLayout() {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let timeoutId: ReturnType<typeof setTimeout>;
    const handleScroll = () => {
      el.classList.add("is-scrolling");
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => el.classList.remove("is-scrolling"), 150);
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", handleScroll);
      clearTimeout(timeoutId);
    };
  }, []);

  return (
    <div className="flex h-full overflow-hidden bg-background">
      <aside className="hidden w-60 shrink-0 border-r border-border md:block">
        <Sidebar />
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Header />
        <main className="relative min-h-0 flex-1 overflow-hidden">
          <div
            ref={scrollRef}
            className="scrollbar-themed absolute inset-0 right-1.5 overflow-y-auto overflow-x-hidden overscroll-contain p-4 md:p-6"
          >
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
