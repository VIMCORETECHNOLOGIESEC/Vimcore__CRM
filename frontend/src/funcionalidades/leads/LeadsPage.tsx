import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/componentes/states/EmptyState";
import { ErrorState } from "@/componentes/states/ErrorState";
import { LoadingState } from "@/componentes/states/LoadingState";
import { getErrorMessage } from "@/api/httpClient";
import { useAuth } from "@/funcionalidades/autenticacion/auth-context";
import { useVistaEmpresa } from "@/funcionalidades/empresa-apariencia/useVistaEmpresa";
import { usePageHeader } from "@/layouts/PageHeaderContext";
import { useLeadsNavigationTutorial } from "./tutorial/LeadsNavigationTutorial";
import { AccionesMasivas } from "./AccionesMasivas";
import { CargarLeadManualDialog } from "./CargarLeadManualDialog";
import { CargaMasivaLeadsDialog } from "./CargaMasivaLeadsDialog";
import { GestionarCanalesManualesDialog } from "./GestionarCanalesManualesDialog";
import { getCatalogoCampanias, getCatalogoResponsables } from "./leads.api";
import { FILTROS_LEADS_VACIOS, buildLeadsQueryParams, type LeadsFiltrosState } from "./leads.utils";
import { LeadsFiltros } from "./LeadsFiltros";
import { LeadsTable } from "./LeadsTable";
import { useAssignLeadsMasivo, useLeads } from "./useLeads";
import { useCanalesManuales, useCrearLeadManual } from "./useCanalesManuales";

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
  usePageHeader({ title: "Gestión de Leads" });

  const { user, hasRole } = useAuth();
  const { empresaVistaId, esVistaSoloLectura } = useVistaEmpresa();
  const { startTour, startTourIfNeeded } = useLeadsNavigationTutorial();
  const esGestorDeCartera = hasRole(["ADMINISTRADOR", "SUPERVISOR"]);
  /**
   * Reasignación masiva es una acción de escritura: un holding-wide en "Ver
   * en vivo" de una empresa (`useVistaEmpresa().esVistaSoloLectura`) puede
   * navegar el listado pero no reasignar leads (no soportado en esta
   * versión de despliegue). `esGestorDeCartera` en sí mismo sigue
   * controlando piezas de solo lectura (columna/filtro de responsable), que
   * no se ocultan acá.
   */
  const puedeAsignarMasivo = esGestorDeCartera && !esVistaSoloLectura;

  /**
   * Canal de ingreso manual (diferido, docs/blocks/d-routing-oportunidad.md:
   * 272-353) -- exclusivo de sesión `company` (cada empresa carga sus
   * propios leads, no es una funcionalidad holding-wide). `puedeCargarLeadManual`
   * cubre Administrador/Supervisor/Asesor; `puedeGestionarCanales` acota a
   * Administrador. `empresaId` viene de la sesión, nunca de una vista de
   * empresa holding-wide (`useVistaEmpresa`) -- ese caso queda deliberadamente
   * fuera de alcance (ver el prompt de esta tarea).
   *
   * "Carga masiva (Excel)" (`CargaMasivaLeadsDialog.tsx`) reusa exactamente
   * `puedeCargarLeadManual` -- es la misma capacidad de cargar un lead
   * manual, solo que en lote vía Excel en vez de una fila a la vez.
   */
  const esSesionEmpresa = user?.sessionScope === "company";
  const empresaId = esSesionEmpresa ? (user?.empresaId ?? null) : null;
  const puedeCargarLeadManual = esSesionEmpresa && hasRole(["ADMINISTRADOR", "SUPERVISOR", "ASESOR"]);
  const puedeGestionarCanales = esSesionEmpresa && hasRole(["ADMINISTRADOR"]);

  const [filtros, setFiltros] = useState<LeadsFiltrosState>(FILTROS_LEADS_VACIOS);
  const [pagina, setPagina] = useState(1);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());

  const [dialogLeadManualAbierto, setDialogLeadManualAbierto] = useState(false);
  const [dialogCargaMasivaAbierto, setDialogCargaMasivaAbierto] = useState(false);
  const [dialogCanalesAbierto, setDialogCanalesAbierto] = useState(false);
  const { data: canalesManuales = [] } = useCanalesManuales(
    puedeCargarLeadManual ? empresaId : null,
  );
  const crearLeadManual = useCrearLeadManual();

  const params = useMemo(
    () => buildLeadsQueryParams(filtros, pagina, LEADS_POR_PAGINA, empresaVistaId ?? undefined),
    [filtros, pagina, empresaVistaId],
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

  const primerLeadId = data?.datos[0]?.id;
  const iniciarTutorialPendiente = useEffectEvent((leadId: string) => startTourIfNeeded(leadId));
  useEffect(() => {
    if (primerLeadId) iniciarTutorialPendiente(primerLeadId);
  }, [primerLeadId]);

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

      {puedeCargarLeadManual || puedeGestionarCanales ? (
        <div className="flex justify-end gap-2">
          {puedeGestionarCanales ? (
            <Button variant="outline" onClick={() => setDialogCanalesAbierto(true)}>
              Gestionar canales
            </Button>
          ) : null}
          {puedeCargarLeadManual ? (
            <Button onClick={() => setDialogLeadManualAbierto(true)}>Cargar lead manual</Button>
          ) : null}
          {puedeCargarLeadManual ? (
            <Button variant="outline" onClick={() => setDialogCargaMasivaAbierto(true)}>
              Carga masiva (Excel)
            </Button>
          ) : null}
        </div>
      ) : null}

      <LeadsFiltros
        filtros={filtros}
        onChange={updateFiltros}
        campanias={campanias}
        mostrarFiltroResponsable={esGestorDeCartera}
        responsables={responsables}
        onStartTutorial={() => {
          if (primerLeadId) startTour(primerLeadId);
        }}
      />

      {puedeAsignarMasivo ? (
        <AccionesMasivas
          cantidadSeleccionada={seleccionados.size}
          responsables={responsables}
          onAssign={assign}
          assigning={assignMasivo.isPending}
        />
      ) : null}

      {isLoading ? (
        <LoadingState rows={LEADS_POR_PAGINA} rowHeight="h-10" />
      ) : isError ? (
        <ErrorState message={getErrorMessage(error)} onRetry={() => void refetch()} />
      ) : !data || data.datos.length === 0 ? (
        <EmptyState
          title="No hay leads que coincidan con estos filtros"
          description="Probá ajustar o limpiar los filtros combinados."
        />
      ) : (
        <div className="flex flex-col">
          <LeadsTable
            leads={data.datos}
            mostrarColumnaResponsable={esGestorDeCartera}
            permitirSeleccion={puedeAsignarMasivo}
            seleccionados={seleccionados}
            onToggleSeleccion={toggleSeleccion}
            onToggleSeleccionTodos={toggleSeleccionTodos}
          />

          <div className="leads-table-footer flex h-10 shrink-0 items-center justify-between rounded-b-lg border-t border-sidebar-border bg-sidebar px-3 text-sm text-sidebar-foreground">
            <span>
              Mostrando {desde}–{hasta} de {total} leads
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

      {dialogLeadManualAbierto && empresaId ? (
        <CargarLeadManualDialog
          open
          onOpenChange={(abierto) => {
            if (!abierto) setDialogLeadManualAbierto(false);
          }}
          canales={canalesManuales}
          enviando={crearLeadManual.isPending}
          onSubmit={(valores) =>
            crearLeadManual.mutate(
              { ...valores, empresaId },
              { onSuccess: () => setDialogLeadManualAbierto(false) },
            )
          }
          esAdministrador={puedeGestionarCanales}
          onRedirigirAGestionCanales={() => {
            setDialogLeadManualAbierto(false);
            setDialogCanalesAbierto(true);
          }}
        />
      ) : null}

      {dialogCargaMasivaAbierto && empresaId ? (
        <CargaMasivaLeadsDialog
          open
          onOpenChange={(abierto) => {
            if (!abierto) setDialogCargaMasivaAbierto(false);
          }}
          canales={canalesManuales}
        />
      ) : null}

      {dialogCanalesAbierto && empresaId ? (
        <GestionarCanalesManualesDialog
          open
          onOpenChange={(abierto) => {
            if (!abierto) setDialogCanalesAbierto(false);
          }}
          empresaId={empresaId}
        />
      ) : null}
    </div>
  );
}
