import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useMemo, useState } from "react";
import { getErrorMessage } from "@/api/httpClient";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/componentes/states/EmptyState";
import { ErrorState } from "@/componentes/states/ErrorState";
import { LoadingState } from "@/componentes/states/LoadingState";
import { useAuth } from "@/funcionalidades/autenticacion/auth-context";
import { useVistaEmpresa } from "@/funcionalidades/empresa-apariencia/useVistaEmpresa";
import { usePageHeader } from "@/layouts/PageHeaderContext";
import { buildQueryParams, FILTROS_VACIOS, type FiltrosState } from "./oportunidades.utils";
import { OportunidadesFiltros } from "./OportunidadesFiltros";
import { OportunidadesTable } from "./OportunidadesTable";
import { ProductosAdminDialog } from "./ProductosAdminDialog";
import { useOportunidades } from "./useOportunidades";

/** Whitelist del backend: 10, 25, 50 o 100 (cualquier otro valor → 400). */
const LIMITE = 25;

/**
 * Listado de oportunidades (Bloque D, `docs/07` gap). Pantalla de trabajo:
 * misma estructura que `leads/LeadsPage.tsx` -- filtros + página en estado
 * local, `useMemo` de params, ramas de carga/error/vacío y pie de paginación
 * con 4 botones fantasma.
 */
export function OportunidadesPage() {
  usePageHeader({ title: "Oportunidades" });

  const { hasRole } = useAuth();
  const { empresaVistaId, esVistaSoloLectura } = useVistaEmpresa();
  const puedeGestionarProductos = hasRole(["ADMINISTRADOR"]) && !esVistaSoloLectura;

  const [filtros, setFiltros] = useState<FiltrosState>(FILTROS_VACIOS);
  const [pagina, setPagina] = useState(1);
  const [dialogProductosAbierto, setDialogProductosAbierto] = useState(false);

  const params = useMemo(
    () => buildQueryParams(filtros, pagina, LIMITE, empresaVistaId ?? undefined),
    [filtros, pagina, empresaVistaId],
  );

  const { data, isLoading, isError, error, refetch } = useOportunidades(params);

  function updateFiltros(nuevos: FiltrosState) {
    setFiltros(nuevos);
    setPagina(1);
  }

  const total = data?.total ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(total / LIMITE));
  const desde = total === 0 ? 0 : (pagina - 1) * LIMITE + 1;
  const hasta = Math.min(pagina * LIMITE, total);

  return (
    <div className="flex flex-col gap-4">
      <OportunidadesFiltros filtros={filtros} onChange={updateFiltros} />

      {puedeGestionarProductos ? (
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => setDialogProductosAbierto(true)}>
            Gestionar productos
          </Button>
        </div>
      ) : null}

      {isLoading ? (
        <LoadingState rows={10} rowHeight="h-10" />
      ) : isError ? (
        <ErrorState message={getErrorMessage(error)} onRetry={() => void refetch()} />
      ) : !data || data.oportunidades.length === 0 ? (
        <EmptyState
          title="No hay oportunidades que coincidan con estos filtros"
          description="Prueba ajustar o limpiar los filtros combinados."
        />
      ) : (
        <div className="flex flex-col">
          <OportunidadesTable oportunidades={data.oportunidades} />

          <div className="flex h-10 shrink-0 items-center justify-between rounded-b-lg border-t border-sidebar-border bg-sidebar px-3 text-sm text-sidebar-foreground">
            <span>
              Mostrando {desde}–{hasta} de {total} oportunidades
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-2xl text-sidebar-foreground hover:bg-transparent"
                disabled={pagina <= 1}
                onClick={() => setPagina(1)}
                aria-label="Primera página"
                title="Primera página"
              >
                <ChevronsLeft aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-2xl text-sidebar-foreground hover:bg-transparent"
                disabled={pagina <= 1}
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
                aria-label="Página anterior"
                title="Página anterior"
              >
                <ChevronLeft aria-hidden="true" />
              </Button>
              <span>
                Página {pagina} de {totalPaginas}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-2xl text-sidebar-foreground hover:bg-transparent"
                disabled={pagina >= totalPaginas}
                onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                aria-label="Página siguiente"
                title="Página siguiente"
              >
                <ChevronRight aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-2xl text-sidebar-foreground hover:bg-transparent"
                disabled={pagina >= totalPaginas}
                onClick={() => setPagina(totalPaginas)}
                aria-label="Última página"
                title="Última página"
              >
                <ChevronsRight aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {dialogProductosAbierto ? (
        <ProductosAdminDialog
          open
          onOpenChange={(abierto) => {
            if (!abierto) setDialogProductosAbierto(false);
          }}
          empresaVistaId={empresaVistaId ?? undefined}
          esVistaSoloLectura={esVistaSoloLectura}
        />
      ) : null}
    </div>
  );
}
