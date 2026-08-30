import { useEffect, useRef, type CSSProperties } from "react";
import { Outlet } from "react-router";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useAuth } from "@/funcionalidades/autenticacion/authContext";
import { useConfiguracionEmpresa } from "@/funcionalidades/configuracion-empresa/useConfiguracionEmpresa";
import { LeadsNavigationTutorialProvider } from "@/funcionalidades/leads/tutorial/LeadsNavigationTutorial";
import { useSplashGate } from "@/hooks/useSplashGate";
import { resolveEstilosMarca, resolveLogoMarca, resolveMarcaCompleta } from "@/lib/color-marca";
import { updateFavicon, updateThemeColor, resolveFaviconHref } from "@/lib/favicon-marca";
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
  // Fix real (splash duplicado con el color índigo por defecto en vez del
  // color de marca real): `resolveMarcaCompleta` (`lib/color-marca.ts`) es
  // la misma fuente única que ahora usa `LoginPage.tsx`, con las variables
  // que `WelcomeSplashLoader`/`tema-empresarial.css` realmente leen
  // (`--marca-color-1`/`--marca-color-2`) -- `estilosMarca` de arriba son
  // tokens shadcn del shell (`--primary`/`--sidebar*`) que el splash nunca
  // consume, por eso antes caía al índigo default de `.tema-empresarial`.
  const marcaSplash = resolveMarcaCompleta(user, configuracionHolding);
  // Pestaña dinámica (theme-color + favicon, ver efecto de abajo): mismo
  // isotipo de 2 niveles que ya usa `app-sidebar.tsx` (logo propio de la
  // empresa, o el del holding EN VIVO, o `null` si ninguno llegó todavía).
  const logoMarca = resolveLogoMarca(user, configuracionHolding);
  // Gap real corregido -- ver `useSplashGate.ts`: en una recarga en frío de
  // una ruta ya autenticada (F5 con sesión vigente) no hay ninguna precarga
  // de `useConfiguracionEmpresa()` como sí tiene `LoginPage.tsx`, así que el
  // shell pintaba con la paleta de fábrica y recién después saltaba al color
  // real de marca. Mientras el gate esté activo, se muestra el mismo
  // `WelcomeSplashLoader` del boot en vez de un shell a medio pintar.
  const showSplash = useSplashGate(isLoadingHolding, SPLASH_MIN_MS);

  // Fix real (Bug 3 -- color de marca no llega a componentes Radix:
  // tooltip/dropdown/dialog/sheet/select/popover/alert-dialog): antes
  // `estilosMarca` solo se aplicaba como `style` inline en
  // `SidebarProvider` (abajo). Los componentes Radix de este proyecto
  // renderizan vía Portal directo a `document.body`, FUERA del subárbol de
  // `SidebarProvider` -- nunca heredaban esas variables CSS y caían al
  // `:root` fijo (azul por defecto, `--ring: 37 99 235`). Este efecto
  // espeja las mismas propiedades en `document.documentElement` (nivel
  // `<html>`), que SÍ es ancestro de cualquier portal montado en `<body>`
  // sin importar dónde cuelgue -- las custom properties CSS heredan por el
  // DOM sin importar `position: fixed`. El `style` inline de
  // `SidebarProvider` se mantiene (no se quita): sigue siendo necesario
  // para el render inicial sin flash, antes de que este efecto corra.
  //
  // `estilosMarca` es `undefined` mientras no hay `usuario` (sesión sin
  // resolver, o logout) -- el cleanup de abajo se encarga de retirar las
  // propiedades del `documentElement` en ese caso, para no dejar residuo
  // de una sesión anterior.
  useEffect(() => {
    if (!estilosMarca) {
      return undefined;
    }
    const root = document.documentElement;
    const keys = Object.keys(estilosMarca);
    for (const key of keys) {
      root.style.setProperty(key, estilosMarca[key]);
    }
    return () => {
      for (const key of keys) {
        root.style.removeProperty(key);
      }
    };
  }, [estilosMarca]);

  // Pestaña dinámica (color de marca, decisión aprobada con artefacto
  // visual de ejemplo): mismo trigger que el efecto de arriba
  // (`estilosMarca`, que cambia exactamente cuando cambia la marca
  // resuelta de `user`/`configuracionHolding`) para no duplicar la
  // condición de "sesión sin resolver todavía". Lógica pura en
  // `lib/favicon-marca.ts` (testeada ahí sin canvas real, ver
  // `tests/lib/favicon-marca.test.ts`) -- este efecto es solo el punto de
  // conexión con los valores de marca ya resueltos.
  //
  // `theme-color`: tiñe la barra de pestaña/dirección en Chrome y Safari
  // mobile con `colorPrimario` (mismo tono que `--sidebar`, ver
  // `resolveMarcaCompleta`/`resolveEstilosMarca`).
  //
  // Favicon: el logo real de la empresa si existe (`logoMarca`), o si no,
  // un círculo con `colorPrimario` de fondo + la inicial del nombre en el
  // color de mayor contraste -- MISMO concepto que el fallback ya
  // existente en `app-sidebar.tsx` (letra sobre color de marca), pero
  // como imagen aparte: el favicon no puede leer clases/variables CSS del
  // DOM.
  useEffect(() => {
    if (!estilosMarca) {
      return;
    }
    updateThemeColor(marcaSplash["--marca-color-1"]);
    updateFavicon(resolveFaviconHref(logoMarca, marcaSplash.nombre, marcaSplash["--marca-color-1"]));
  }, [estilosMarca]);

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
    // Las fuentes (Fraunces/Source Sans 3) se cargan una sola vez a nivel
    // raíz en `index.html` (fix "FOUT entre los dos splashes de
    // bienvenida"), así que ya están en curso de descarga desde el primer
    // byte de HTML -- este layout ya no depende de que el boot pre-login
    // haya montado antes para tener margen de tiempo.
    return (
      <div className="tema-empresarial">
        <WelcomeSplashLoader
          contexto={marcaSplash.nombre}
          mensaje="Cargando tu panel…"
          visible
          style={
            {
              "--marca-color-1": marcaSplash["--marca-color-1"],
              "--marca-color-2": marcaSplash["--marca-color-2"],
            } as CSSProperties
          }
        />
      </div>
    );
  }

  return (
    <PageHeaderProvider>
      <LeadsNavigationTutorialProvider colorAcento={marcaSplash["--marca-color-2"]}>
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
