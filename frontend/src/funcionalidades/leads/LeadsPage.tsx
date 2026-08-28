import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/componentes/states/EmptyState";
import { ErrorState } from "@/componentes/states/ErrorState";
import { LoadingState } from "@/componentes/states/LoadingState";
import { getErrorMessage } from "@/api/httpClient";
import { useAuth } from "@/funcionalidades/autenticacion/authContext";
import { usePageHeader } from "@/layouts/PageHeaderContext";
import { AccionesMasivas } from "./AccionesMasivas";
import { getCatalogoCampanias, getCatalogoResponsables } from "./leads.api";
import { FILTROS_LEADS_VACIOS, buildLeadsQueryParams, type LeadsFiltrosState } from "./leads.utils";
import { LeadsFiltros } from "./LeadsFiltros";
import { LeadsTable } from "./LeadsTable";
import { useAssignLeadsMasivo, useLeads } from "./useLeads";

/**
 * Sin selector de tamaño de página todavía (pendiente de aprobación del
 * usuario: `<Select>` "Leads por página" 10/25/50/100 junto a
 * Anterior/Siguiente). Ver nota INTEGRACION-BACKEND en
 * `leads.api.ts::LeadsQueryParams.porPagina`.
 */
const LEADS_POR_PAGINA = 10;

/**
 * Listado de leads (F3, docs/07). Pantalla de trabajo diario -- ver
 * `leads.api.ts` para el detalle de qué es mock hoy y el punto de
 * integración exacto con el backend real (M5/M6).
 */
export function LeadsPage() {
  usePageHeader({ title: "Leads" });

  const { hasRole } = useAuth();
  const esGestorDeCartera = hasRole(["ADMINISTRADOR", "SUPERVISOR"]);

  const [filtros, setFiltros] = useState<LeadsFiltrosState>(FILTROS_LEADS_VACIOS);
  const [pagina, setPagina] = useState(1);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());

  const params = useMemo(
    () => buildLeadsQueryParams(filtros, pagina, LEADS_POR_PAGINA),
    [filtros, pagina],
  );

  const { data, isLoading, isError, error, refetch } = useLeads(params);
  const assignMasivo = useAssignLeadsMasivo();

  const campanias = useMemo(() => getCatalogoCampanias(), []);
  // `getCatalogoResponsables` es backend real (D-A2): a diferencia de
  // `getCatalogoCampanias` (mock local, sin backend), necesita `useQuery`.
  const { data: responsables = [] } = useQuery({
    queryKey: ["catalogo-responsables", "TODOS"],
    queryFn: () => getCatalogoResponsables("TODOS"),
    enabled: esGestorDeCartera,
  });

  function updateFiltros(nuevos: LeadsFiltrosState) {
    setFiltros(nuevos);
    setPagina(1);
    setSeleccionados(new Set());
  }

  function toggleSeleccion(leadId: string) {
    setSeleccionados((actual) => {
      const copia = new Set(actual);
      if (copia.has(leadId)) {
        copia.delete(leadId);
      } else {
        copia.add(leadId);
      }
      return copia;
    });
  }

  function toggleSeleccionTodos(marcar: boolean) {
    setSeleccionados(marcar ? new Set(data?.datos.map((l) => l.id) ?? []) : new Set());
  }

  function assign(responsableId: string) {
    assignMasivo.mutate(
      { leadIds: [...seleccionados], responsableId },
      { onSuccess: () => setSeleccionados(new Set()) },
    );
  }

  const total = data?.total ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(total / LEADS_POR_PAGINA));
  const desde = total === 0 ? 0 : (pagina - 1) * LEADS_POR_PAGINA + 1;
  const hasta = Math.min(pagina * LEADS_POR_PAGINA, total);

  return (
    <div className="flex flex-col gap-4">
      {/*
        INTEGRACION-BACKEND: acá se conecta el canal SSE de "lead nuevo"
        (F6/M8, todavía no existen ni el endpoint de eventos ni el motor de
        notificaciones en el backend). Cuando exista, un lead entrante debe
        invalidar la query ["leads", ...] de TanStack Query (ver
        `useLeads.ts`) o insertarse de forma optimista -- nunca por
        polling: docs/07 F3 pide explícitamente evitar consultar al
        servidor en un intervalo corto para simular tiempo real.
      */}

      <LeadsFiltros
        filtros={filtros}
        onChange={updateFiltros}
        campanias={campanias}
        mostrarFiltroResponsable={esGestorDeCartera}
        responsables={responsables}
      />

      {esGestorDeCartera ? (
        <AccionesMasivas
          cantidadSeleccionada={seleccionados.size}
          responsables={responsables}
          onAssign={assign}
          assigning={assignMasivo.isPending}
        />
      ) : null}

      {isLoading ? (
        <LoadingState rows={LEADS_POR_PAGINA} rowHeight="h-12" />
      ) : isError ? (
        <ErrorState message={getErrorMessage(error)} onRetry={() => void refetch()} />
      ) : !data || data.datos.length === 0 ? (
        <EmptyState
          title="No hay leads que coincidan con estos filtros"
          description="Probá ajustar o limpiar los filtros combinados."
        />
      ) : (
        <>
          <LeadsTable
            leads={data.datos}
            mostrarColumnaResponsable={esGestorDeCartera}
            permitirSeleccion={esGestorDeCartera}
            seleccionados={seleccionados}
            onToggleSeleccion={toggleSeleccion}
            onToggleSeleccionTodos={toggleSeleccionTodos}
          />

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Mostrando {desde}–{hasta} de {total} leads
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pagina <= 1}
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
              >
                Anterior
              </Button>
              <span>
                Página {pagina} de {totalPaginas}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={pagina >= totalPaginas}
                onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
              >
                Siguiente
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
