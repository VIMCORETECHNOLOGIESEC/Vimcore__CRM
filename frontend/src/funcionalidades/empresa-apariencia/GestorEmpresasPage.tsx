import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Pencil, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { getErrorMessage } from "@/api/httpClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

/**
 * Card de una empresa del holding (F8-D0). El isotipo es el elemento
 * protagonista -- es la forma en que un administrador de holding reconoce
 * "de un vistazo" cada empresa en un directorio de cientos, igual que un
 * selector de workspace -- por eso domina el tope de la card en vez de
 * competir en tamaño con el nombre o las acciones.
 *
 * Toda la card es clickeable hacia "Ver detalles" (mismo patrón de hit-area
 * estirada que ya usa la columna Cliente de `LeadsTable.tsx`: un único <a>
 * semántico con `after:absolute after:inset-0`, en vez de un `<div onClick>`
 * hecho a mano que perdería foco/teclado/semántica -- ver skill
 * `interface-design`, "Use What Exists"). "Editar" es una acción secundaria
 * en la esquina, elevada por encima de ese overlay con `relative z-10` para
 * seguir siendo clickeable de forma independiente.
 *
 * TODO(bloque holding/empresa, otra sesión en curso): el destino real es
 * `entrarAEmpresa(empresa.id)` de un context de "empresa en vista" que
 * todavía no existe. Mientras tanto navega a `/usuarios?empresaId=` (ruta ya
 * existente) para que el botón sea funcional hoy -- cambio de una línea
 * cuando ese context exista.
 */
function CardEmpresa({
  empresa,
  onEditar,
}: {
  empresa: EmpresaAparienciaHoldingView;
  onEditar: () => void;
}) {
  const inicial = empresa.nombre.trim()[0]?.toUpperCase() ?? "?";

  return (
    <Card className="group relative flex flex-col items-center gap-3 border-border/70 p-5 text-center transition-all hover:border-primary/30 hover:bg-primary/5 hover:shadow-md">
      {empresa.logoUrl ? (
        <img
          src={empresa.logoUrl}
          alt={`Isotipo de ${empresa.nombre}`}
          className="size-16 shrink-0 rounded-md border border-border/70 bg-background object-contain p-1"
        />
      ) : (
        // Mismo patrón visual que el fallback de isotipo de `app-sidebar.tsx`
        // (borde punteado + inicial) -- escalado para ser protagonista acá,
        // adaptado a los tokens de la superficie `bg-card` en vez de `--sidebar`.
        <span
          aria-hidden="true"
          className="flex size-16 shrink-0 items-center justify-center rounded-md border-2 border-dashed border-muted-foreground/35 text-xl font-bold text-muted-foreground/60"
        >
          {inicial}
        </span>
      )}

      <span className="line-clamp-2 min-h-10 text-sm font-semibold leading-tight text-card-foreground">
        {empresa.nombre}
      </span>

      <Button asChild variant="secondary" size="sm" className="w-full">
        <Link
          to={`/usuarios?empresaId=${empresa.id}`}
          aria-label={`Ver detalles de ${empresa.nombre}`}
          className="after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-offset-1"
        >
          Ver detalles
        </Link>
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Editar ${empresa.nombre}`}
        title="Editar"
        className="absolute right-2 top-2 z-10 size-7 text-muted-foreground hover:bg-background hover:text-foreground"
        onClick={onEditar}
      >
        <Pencil className="size-3.5" aria-hidden="true" />
      </Button>
    </Card>
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
          {/*
           * Grid de directorio, no tabla densa -- el volumen real (hasta
           * cientos de empresas) ya está resuelto por la paginación
           * server-side de 25, así que el grid no necesita ser denso, puede
           * priorizar reconocimiento visual del isotipo. 2 columnas en
           * mobile (las cards son cuadradas, un listado a 1 columna
           * desperdiciaría ancho); 5 en xl da 5x5 exacto para una página
           * completa de 25 sin fila incompleta.
           */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
            {empresas.map((empresa) => (
              <CardEmpresa
                key={empresa.id}
                empresa={empresa}
                onEditar={() => setEmpresaEnEdicion(empresa)}
              />
            ))}
          </div>

          <div className="leads-table-footer mt-4 flex h-10 shrink-0 items-center justify-between rounded-lg border border-sidebar-border bg-sidebar px-3 text-sm text-sidebar-foreground">
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
