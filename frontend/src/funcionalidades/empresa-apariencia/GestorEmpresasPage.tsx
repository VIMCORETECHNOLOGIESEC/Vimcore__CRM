import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getErrorMessage } from "@/api/httpClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/componentes/states/EmptyState";
import { ErrorState } from "@/componentes/states/ErrorState";
import { LoadingState } from "@/componentes/states/LoadingState";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { usePageHeader } from "@/layouts/PageHeaderContext";
import { EditarEmpresaHoldingDialog } from "./EditarEmpresaHoldingDialog";
import type { EmpresaAparienciaHoldingView, EmpresasHoldingQueryParams } from "./empresa-apariencia-holding.api";
import { useEmpresasHolding, useUpdateEmpresaAparienciaHolding } from "./useEmpresaAparienciaHolding";

/** Tamaño de página, igual al default server-side (`GET /empresas?pageSize=`). */
const EMPRESAS_POR_PAGINA = 25;

/** Debounce del buscador -- evita un `GET /empresas` por cada tecla (478 empresas reales en este entorno). */
const BUSQUEDA_DEBOUNCE_MS = 300;

/** Muestra el swatch de color junto al hex -- nunca solo el color (accesibilidad, docs/07 criterios transversales). */
function CeldaColor({ hex }: { hex: string | null }) {
  if (!hex) {
    return <span className="text-sm text-muted-foreground">Sin definir</span>;
  }
  return (
    <span className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className="size-4 shrink-0 rounded border border-border"
        style={{ backgroundColor: hex }}
      />
      <span className="font-mono text-sm">{hex}</span>
    </span>
  );
}

/**
 * Gestor de empresas de holding (`docs/blocks/d0-visualizacion-multitenant.md`,
 * PASO 8) -- ruta protegida exclusiva sessionScope `holding` + rol
 * `ADMINISTRADOR` (`router.tsx`). Lista las `Empresa` de la instancia
 * paginadas server-side (`GET /empresas?page=&pageSize=&search=` ->
 * `{ items, total }`) y permite abrir `EditarEmpresaHoldingDialog` por fila
 * para editar nombre/colores/isotipo de cualquiera de ellas vía
 * `PATCH /empresas/:empresaId/apariencia`.
 *
 * Paginación real (no un slice hecho en el frontend) porque esta instancia
 * puede tener cientos de empresas -- mismo criterio que
 * `usuarios/UsuariosPage.tsx` y `leads/LeadsPage.tsx`: página, buscador con
 * debounce y footer "Mostrando X–Y de Z" con la misma superficie de marca
 * (`bg-sidebar`/`text-sidebar-foreground`).
 *
 * Distinta de `EmpresaAparienciaPage` (self-service, solo la propia empresa
 * de una sesión `company`) y de `ConfiguracionEmpresaPage` (branding global
 * de toda la instancia, no de una `Empresa` puntual) -- ver la nota de
 * colisión conceptual en el bloque D0.
 */
export function GestorEmpresasPage() {
  usePageHeader({ title: "Empresas" });

  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(1);
  const busquedaDebounced = useDebouncedValue(busqueda, BUSQUEDA_DEBOUNCE_MS);

  // Reinicia a la página 1 cuando el término de búsqueda efectivo (ya
  // debounced) cambia -- evita quedar en una página que ya no existe para
  // el nuevo filtro.
  useEffect(() => {
    setPagina(1);
  }, [busquedaDebounced]);

  const params = useMemo<EmpresasHoldingQueryParams>(() => {
    const busquedaLimpia = busquedaDebounced.trim();
    return {
      page: pagina,
      pageSize: EMPRESAS_POR_PAGINA,
      ...(busquedaLimpia ? { search: busquedaLimpia } : {}),
    };
  }, [pagina, busquedaDebounced]);

  const { data, isLoading, isError, error, refetch } = useEmpresasHolding(params);
  const actualizar = useUpdateEmpresaAparienciaHolding();

  const [empresaEnEdicion, setEmpresaEnEdicion] = useState<EmpresaAparienciaHoldingView | null>(
    null,
  );

  const empresas = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(total / EMPRESAS_POR_PAGINA));
  const desde = total === 0 ? 0 : (pagina - 1) * EMPRESAS_POR_PAGINA + 1;
  const hasta = Math.min(pagina * EMPRESAS_POR_PAGINA, total);
  const hayBusquedaActiva = busqueda.trim() !== "";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="text-sm text-muted-foreground sm:max-w-2xl">
          Todas las empresas de esta instancia. Editá el nombre y los colores de marca de
          cualquiera de ellas -- sus equipos ven el cambio reflejado en su propia pantalla de
          bienvenida.
        </p>
        <div className="relative w-full shrink-0 sm:w-72">
          <Search
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={busqueda}
            onChange={(event) => setBusqueda(event.target.value)}
            placeholder="Buscar por nombre…"
            aria-label="Buscar empresas"
            className="pl-9"
          />
        </div>
      </div>

      {isLoading ? (
        <LoadingState rows={4} rowHeight="h-12" />
      ) : isError ? (
        <ErrorState message={getErrorMessage(error)} onRetry={() => void refetch()} />
      ) : empresas.length === 0 ? (
        <EmptyState
          title={
            hayBusquedaActiva
              ? "No hay empresas que coincidan con esta búsqueda"
              : "Todavía no hay empresas registradas"
          }
          description={
            hayBusquedaActiva
              ? "Probá ajustar o limpiar el término buscado."
              : "Las empresas se crean desde la configuración inicial de la instancia."
          }
        />
      ) : (
        <div className="flex flex-col">
          <Table>
            <TableHeader className="sticky top-0 z-20 bg-sidebar">
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-sidebar-foreground/80">Nombre</TableHead>
                <TableHead className="text-sidebar-foreground/80">Color primario</TableHead>
                <TableHead className="text-sidebar-foreground/80">Color secundario</TableHead>
                <TableHead className="text-sidebar-foreground/80">Isotipo</TableHead>
                <TableHead className="w-24 text-right text-sidebar-foreground/80">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {empresas.map((empresa) => (
                <TableRow key={empresa.id}>
                  <TableCell className="font-medium">{empresa.nombre}</TableCell>
                  <TableCell>
                    <CeldaColor hex={empresa.colorPrimario} />
                  </TableCell>
                  <TableCell>
                    <CeldaColor hex={empresa.colorSecundario} />
                  </TableCell>
                  <TableCell>
                    {empresa.logoUrl ? (
                      <img
                        src={empresa.logoUrl}
                        alt={`Isotipo de ${empresa.nombre}`}
                        className="size-8 rounded object-contain"
                      />
                    ) : (
                      <span className="text-sm text-muted-foreground">Sin isotipo</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={`Editar ${empresa.nombre}`}
                      onClick={() => setEmpresaEnEdicion(empresa)}
                    >
                      Editar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="leads-table-footer flex h-10 shrink-0 items-center justify-between rounded-b-lg border-t border-sidebar-border bg-sidebar px-3 text-sm text-sidebar-foreground">
            <span>
              Mostrando {desde}–{hasta} de {total} empresas
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

      {empresaEnEdicion ? (
        <EditarEmpresaHoldingDialog
          open
          onOpenChange={(abierto) => {
            if (!abierto) setEmpresaEnEdicion(null);
          }}
          empresa={empresaEnEdicion}
          enviando={actualizar.isPending}
          onSubmit={(valores) =>
            actualizar.mutate(
              { empresaId: empresaEnEdicion.id, input: valores },
              { onSuccess: () => setEmpresaEnEdicion(null) },
            )
          }
        />
      ) : null}
    </div>
  );
}
