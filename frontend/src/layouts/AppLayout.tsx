import { useEffect, useRef } from "react";
import { Outlet } from "react-router";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Header } from "./Header";
import { PageHeaderProvider } from "./PageHeaderContext";

/**
 * Layout principal (docs/07 F1): barra lateral + encabezado + contenido.
 * El sidebar usa el bloque `sidebar-07` de shadcn (`SidebarProvider` +
 * `AppSidebar` colapsable a iconos; en móvil se abre como `Sheet`).
 *
 * `main` (renderizado por `SidebarInset`) es solo el recorte posicionado
 * (landmark semántico); el scroll real vive en el `div` interno, que además
 * marca `is-scrolling` mientras hay movimiento para que la scrollbar se
 * oscurezca (ver .scrollbar-themed en index.css).
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
    <PageHeaderProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <Header />
          <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
            <div
              ref={scrollRef}
               className="patron-papel scrollbar-themed absolute inset-0 right-1.5 overflow-y-auto overflow-x-hidden overscroll-contain p-4 md:p-6"
            >
              <Outlet />
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </PageHeaderProvider>
  );
}
