import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useMemo, useState } from "react";
import { getErrorMessage } from "@/api/httpClient";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/componentes/ConfirmDialog";
import { EmptyState } from "@/componentes/states/EmptyState";
import { ErrorState } from "@/componentes/states/ErrorState";
import { LoadingState } from "@/componentes/states/LoadingState";
import { useVistaEmpresa } from "@/funcionalidades/empresa-apariencia/useVistaEmpresa";
import { ConectarWhatsAppCard } from "@/funcionalidades/whatsapp/ConectarWhatsAppCard";
import { usePageHeader } from "@/layouts/PageHeaderContext";
import type { Bridge } from "@/tipos/bridge";
import { BridgesFiltros } from "./BridgesFiltros";
import {
  FILTRO_TODOS,
  FILTROS_BRIDGES_VACIOS,
  buildBridgesQueryParams,
  canEliminarseFisicamente,
  type BridgesFiltrosState,
} from "./bridges.utils";
import { BridgesTable } from "./BridgesTable";
import { ClaveBridgeModal } from "./ClaveBridgeModal";
import { NuevoBridgeDialog } from "./NuevoBridgeDialog";
import { ApiExternaSetupDialog } from "./ApiExternaSetupDialog";
import { useBridges, useCreateBridge, useDeleteBridge, useReactivateBridge } from "./useBridges";

/**
 * Sin selector de tamaño de página todavía, mismo criterio que
 * `leads/LeadsPage.tsx::LEADS_POR_PAGINA`/`usuarios/UsuariosPage.tsx::USUARIOS_POR_PAGINA`.
 */
const BRIDGES_POR_PAGINA = 10;

interface ClaveModalState {
  bridgeNombre: string;
  claveApi: string;
}

/**
 * Administración de bridges (F8/bridges-lifecycle-management, docs/07 --
 * solo administrador, ruta protegida en `router.tsx`). Backend real -- ver
 * `bridges.api.ts` para el detalle de los endpoints consumidos. Filtro
 * (búsqueda, red social, estado) y paginación reales desde el backend
 * (`GET /bridges`, breaking change de contrato -- ver `bridges.api.ts`),
 * mismo patrón manual server-side que `leads/LeadsPage.tsx`/
 * `usuarios/UsuariosPage.tsx` (sin librería de paginación).
 *
 * El aviso destacado por bridge (token expirado/próximo a vencer, sin
 * actividad) ya NO se apila arriba de la tabla (una alerta completa por
 * bridge no escalaba con varios bridges problemáticos a la vez) -- ahora es
 * un ícono por fila con popover, ver `BridgesTable.tsx`/
 * `AvisoBridgeIndicador.tsx`.
 *
 * `ConectarWhatsAppCard` (flujo de conexión de WhatsApp Business,
 * `docs/contrato-frontend-whatsapp-api_mat_04.md` secciones 1-3) se monta
 * ADITIVAMENTE al final, fuera de la tabla de bridges -- WhatsApp NO es un
 * `Bridge` en el modelo de datos (un mensaje no es un lead), pero
 * conceptualmente es otro canal de comunicación de la empresa, de ahí
 * compartir esta pantalla en vez de agregar una entrada nueva al sidebar. Ya
 * reusa `empresaVistaId` de arriba (`useVistaEmpresa`) internamente, sin
 * necesitar props.
 */
export function BridgesPage() {
  usePageHeader({ title: "Bridges" });

  const [filtros, setFiltros] = useState<BridgesFiltrosState>(FILTROS_BRIDGES_VACIOS);
  const [pagina, setPagina] = useState(1);
  const { empresaVistaId } = useVistaEmpresa();

  const params = useMemo(
    () => buildBridgesQueryParams(filtros, pagina, BRIDGES_POR_PAGINA, empresaVistaId ?? undefined),
    [filtros, pagina, empresaVistaId],
  );

  const { data, isLoading, isError, error, refetch } = useBridges(params);
  const crear = useCreateBridge();
  const eliminar = useDeleteBridge();
  const reactivar = useReactivateBridge();

  const [dialogAltaAbierto, setDialogAltaAbierto] = useState(false);
  const [claveModal, setClaveModal] = useState<ClaveModalState | null>(null);
  const [bridgeParaBaja, setBridgeParaBaja] = useState<Bridge | null>(null);
  const [apiExternaNombre, setApiExternaNombre] = useState<string | null>(null);

  function updateFiltros(nuevos: BridgesFiltrosState) {
    setFiltros(nuevos);
    setPagina(1);
  }

  const hayFiltrosActivos =
    filtros.busqueda !== "" || filtros.redSocial !== FILTRO_TODOS || filtros.estado !== FILTRO_TODOS;

  const bridges = data?.bridges ?? [];
  const total = data?.total ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(total / BRIDGES_POR_PAGINA));
  const desde = total === 0 ? 0 : (pagina - 1) * BRIDGES_POR_PAGINA + 1;
  const hasta = Math.min(pagina * BRIDGES_POR_PAGINA, total);

  return (
    <div className="flex flex-col gap-4">
      <BridgesFiltros
        filtros={filtros}
        onChange={updateFiltros}
        onNuevo={() => setDialogAltaAbierto(true)}
      />

      {isLoading ? (
        <LoadingState rows={BRIDGES_POR_PAGINA} rowHeight="h-12" />
      ) : isError ? (
        <ErrorState message={getErrorMessage(error)} onRetry={() => void refetch()} />
      ) : bridges.length === 0 ? (
        <EmptyState
          title={
            hayFiltrosActivos
              ? "No hay bridges que coincidan con estos filtros"
              : "Todavía no hay bridges configurados"
          }
          description={
            hayFiltrosActivos
              ? "Probá ajustar o limpiar los filtros aplicados."
              : "Creá el primero con el botón «Nuevo bridge»."
          }
        />
      ) : (
        <div className="flex flex-col">
          <BridgesTable
            bridges={bridges}
            onDarDeBaja={setBridgeParaBaja}
            onReactivar={(bridgeId) => reactivar.mutate(bridgeId)}
            reactivando={reactivar.isPending}
          />

          <div className="leads-table-footer flex h-10 shrink-0 items-center justify-between rounded-b-lg border-t border-sidebar-border bg-sidebar px-3 text-sm text-sidebar-foreground">
            <span>
              Mostrando {desde}–{hasta} de {total} bridges
            </span>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-10 w-10 rounded-2xl text-sidebar-foreground hover:bg-no" disabled={pagina <= 1} onClick={() => setPagina(1)} aria-label="Primera página" title="Primera página">
                <ChevronsLeft aria-hidden="true" />
              </Button>
              <Button variant="ghost" size="icon" className="h-10 w-10 rounded-2xl text-sidebar-foreground hover:bg-no" disabled={pagina <= 1} onClick={() => setPagina((p) => Math.max(1, p - 1))} aria-label="Página anterior" title="Página anterior">
                <ChevronLeft aria-hidden="true" />
              </Button>
              <span>
                Página {pagina} de {totalPaginas}
              </span>
              <Button variant="ghost" size="icon" className="h-10 w-10 rounded-2xl text-sidebar-foreground hover:bg-no" disabled={pagina >= totalPaginas} onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))} aria-label="Página siguiente" title="Página siguiente">
                <ChevronRight aria-hidden="true" />
              </Button>
              <Button variant="ghost" size="icon" className="h-10 w-10 rounded-2xl text-sidebar-foreground hover:bg-no" disabled={pagina >= totalPaginas} onClick={() => setPagina(totalPaginas)} aria-label="Última página" title="Última página">
                <ChevronsRight aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConectarWhatsAppCard />

      {dialogAltaAbierto ? (
        <NuevoBridgeDialog
          open
          onOpenChange={(abierto) => {
            if (!abierto) setDialogAltaAbierto(false);
          }}
          enviando={crear.isPending}
          onApiExterna={(nombre) => {
            setDialogAltaAbierto(false);
            setApiExternaNombre(nombre);
          }}
          onSubmit={(valores) =>
            crear.mutate(valores, {
              onSuccess: (respuesta) => {
                setDialogAltaAbierto(false);
                setClaveModal({ bridgeNombre: respuesta.bridge.nombre, claveApi: respuesta.claveApi });
              },
            })
          }
        />
      ) : null}

      {apiExternaNombre ? (
        <ApiExternaSetupDialog open nombre={apiExternaNombre} onClose={() => setApiExternaNombre(null)} />
      ) : null}

      {claveModal ? (
        <ClaveBridgeModal
          open
          bridgeNombre={claveModal.bridgeNombre}
          claveApi={claveModal.claveApi}
          onClose={() => setClaveModal(null)}
        />
      ) : null}

      {bridgeParaBaja ? (
        <ConfirmDialog
          open
          onOpenChange={(abierto) => {
            if (!abierto) setBridgeParaBaja(null);
          }}
          title={`Dar de baja a ${bridgeParaBaja.nombre}`}
          description={
            canEliminarseFisicamente(bridgeParaBaja)
              ? "Este bridge nunca recibió leads: se eliminará de forma permanente e irreversible."
              : "El bridge pasará a estado Inactivo. Podés reactivarlo cuando quieras, sin perder su clave ni su historial."
          }
          confirmLabel="Confirmar"
          confirming={eliminar.isPending}
          onConfirm={() =>
            eliminar.mutate(bridgeParaBaja.id, { onSuccess: () => setBridgeParaBaja(null) })
          }
        />
      ) : null}
    </div>
  );
}
