import { useEffect, useRef, type CSSProperties } from "react";
import { Outlet } from "react-router";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useAuth } from "@/funcionalidades/autenticacion/authContext";
import { useConfiguracionEmpresa } from "@/funcionalidades/configuracion-empresa/useConfiguracionEmpresa";
import { LeadsNavigationTutorialProvider } from "@/funcionalidades/leads/tutorial/LeadsNavigationTutorial";
import { useSplashGate } from "@/hooks/useSplashGate";
import { resolveEstilosMarca, resolveNombreMarca } from "@/lib/color-marca";
import { WelcomeSplashLoader } from "@/temas/variante-empresarial/WelcomeSplashLoader";
import { Header } from "./Header";
import { PageHeaderProvider } from "./PageHeaderContext";

/**
 * Piso mínimo del splash de arranque del shell (ver `useSplashGate`) -- mismo
 * valor que `AppBoot.tsx` (1500ms), por consistencia de sensación entre el
 * boot pre-login y esta pantalla, aunque son gates independientes.
 */
const SPLASH_MIN_MS = 1500;

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
  const { user } = useAuth();
  // Jerarquía de 3 niveles (tema-empresarial-integracion, cierre de gap
  // nivel intermedio): color propio de la empresa -> color EN VIVO del
  // holding (`useConfiguracionEmpresa()`, misma query que
  // `ConfiguracionEmpresaPage.tsx`) -> default de fábrica. `data` es
  // `undefined` mientras carga o si la query falla -- `color-marca.ts` cae
  // al default de fábrica en ese caso, nunca bloquea ni rompe el shell.
  const { data: configuracionHolding, isLoading: isLoadingHolding } = useConfiguracionEmpresa();
  // tema-empresarial-integracion (Parte 3): acentos por empresa
  // (`--primary`/`--ring`/`--sidebar-primary`/`--sidebar-accent`) en el
  // root de `SidebarProvider`, para que cubran sidebar Y contenido. Ver
  // `lib/color-marca.ts` para el alcance exacto y por qué `--sidebar`
  // (fondo sólido) queda afuera.
  const estilosMarca = resolveEstilosMarca(user, configuracionHolding);
  const nombreMarca = resolveNombreMarca(user, configuracionHolding);
  // Gap real corregido -- ver `useSplashGate.ts`: en una recarga en frío de
  // una ruta ya autenticada (F5 con sesión vigente) no hay ninguna precarga
  // de `useConfiguracionEmpresa()` como sí tiene `LoginPage.tsx`, así que el
  // shell pintaba con la paleta de fábrica y recién después saltaba al color
  // real de marca. Mientras el gate esté activo, se muestra el mismo
  // `WelcomeSplashLoader` del boot en vez de un shell a medio pintar.
  const showSplash = useSplashGate(isLoadingHolding, SPLASH_MIN_MS);

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

  if (showSplash) {
    // `.tema-empresarial` es requerido -- `tema-empresarial.css` scopea
    // `.welcome-splash` bajo ese ancestro (mismo patrón que `AppBoot.tsx`).
    // La hoja de estilos y las fuentes ya se cargaron con el boot pre-login,
    // que siempre monta antes que este layout autenticado.
    return (
      <div className="tema-empresarial">
        <WelcomeSplashLoader
          contexto={nombreMarca}
          mensaje="Cargando tu panel…"
          visible
          style={estilosMarca as CSSProperties}
        />
      </div>
    );
  }

  return (
    <PageHeaderProvider>
      <LeadsNavigationTutorialProvider>
        <SidebarProvider style={estilosMarca as CSSProperties}>
          <AppSidebar />
          <SidebarInset>
            <Header />
            <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
              <div
                ref={scrollRef}
                data-tour="app-scroll-container"
                className="patron-papel scrollbar-themed absolute inset-0 right-1.5 overflow-y-auto overflow-x-hidden overscroll-contain p-4 md:p-6"
              >
                <Outlet />
              </div>
            </div>
          </SidebarInset>
        </SidebarProvider>
      </LeadsNavigationTutorialProvider>
    </PageHeaderProvider>
  );
}
