import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from "react";

export interface PageHeaderConfig {
  title: string;
  backTo?: { label: string; href: string };
}

interface PageHeaderContextValue {
  header: PageHeaderConfig | null;
  setHeader: (config: PageHeaderConfig | null) => void;
}

const PageHeaderContext = createContext<PageHeaderContextValue | null>(null);

/**
 * Publica/lee el título de la pantalla actual y, para las páginas de
 * detalle, el link "breadcrumb-lite" de vuelta al listado -- ver
 * `Header.tsx` (lector) y cada página de F3/F4/F5/F7/F8/perfil (publicador,
 * vía `usePageHeader`).
 *
 * Vive fuera de `AuthContext` porque no es estado de sesión, y a diferencia
 * de `useAuth()` sus hooks lectores NO lanzan sin Provider: varias páginas
 * ya tienen tests que las renderizan aisladas (sin `AppLayout`), y ese es un
 * caso de uso válido, no un error de composición.
 */
export function PageHeaderProvider({ children }: { children: ReactNode }) {
  const [header, setHeader] = useState<PageHeaderConfig | null>(null);
  return (
    <PageHeaderContext.Provider value={{ header, setHeader }}>{children}</PageHeaderContext.Provider>
  );
}

/** Leído por `Header.tsx`. Fuera de un `<PageHeaderProvider>`, no hay título que mostrar. */
export function usePageHeaderValue(): PageHeaderConfig | null {
  const context = useContext(PageHeaderContext);
  return context?.header ?? null;
}

/**
 * Llamado por cada página, incondicionalmente, antes de cualquier `return`
 * anticipado (regla de hooks). Pasar `null` (p. ej. mientras la página
 * todavía está cargando sus propios datos) despublica el título en vez de
 * dejar uno parcial/desactualizado.
 *
 * `useLayoutEffect` (no `useEffect`): corre antes del pintado del navegador,
 * evita un frame con el título de la ruta anterior visible mientras `main`
 * ya renderizó la página nueva.
 */
export function usePageHeader(config: PageHeaderConfig | null): void {
  const context = useContext(PageHeaderContext);
  const setHeader = context?.setHeader;

  useLayoutEffect(() => {
    if (!setHeader) return;
    setHeader(config);
    return () => setHeader(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setHeader, config?.title, config?.backTo?.label, config?.backTo?.href]);
}
