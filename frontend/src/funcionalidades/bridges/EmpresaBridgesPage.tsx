import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useMemo, useState } from "react";
import { useParams } from "react-router";
import { getErrorMessage } from "@/api/httpClient";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/componentes/ConfirmDialog";
import { EmptyState } from "@/componentes/states/EmptyState";
import { ErrorState } from "@/componentes/states/ErrorState";
import { LoadingState } from "@/componentes/states/LoadingState";
import { useEmpresaHolding } from "@/funcionalidades/empresa-apariencia/useEmpresaAparienciaHolding";
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

/** Mismo criterio de paginación que `bridges/BridgesPage.tsx::BRIDGES_POR_PAGINA`. */
const BRIDGES_POR_PAGINA = 10;

interface ClaveModalState {
  bridgeNombre: string;
  claveApi: string;
  apiExternaBridgeId?: string;
}

interface ApiExternaBridgeState {
  bridgeId: string;
  nombre: string;
}

/**
 * Bridges de UNA empresa puntual, vista dedicada de un holding-wide
 * (`empresas/:empresaId/bridges`, ruta propia -- reemplaza el redirect
 * anterior a `/bridges?empresaId=`, la MISMA pantalla que un holding-wide
 * usa para sus propios bridges holding-wide). Espejo exacto de
 * `bridges/BridgesPage.tsx`, con las mismas diferencias que su análogo
 * `empresa-apariencia/EmpresaUsuariosPage.tsx`:
 *
 * - `empresaId` sale de `useParams` (fijo por la ruta), NUNCA de
 *   `useVistaEmpresa`.
 * - El alta SIEMPRE manda `empresaId` en el body de `POST /bridges` (acá
 *   siempre hay una empresa fija, a diferencia de `BridgesPage.tsx`, donde es
 *   condicional a `useVistaEmpresa().empresaVistaId`).
 * - Usa `useEmpresaHolding(empresaId)` solo para el nombre de la empresa en
 *   el título/breadcrumb, mismo patrón que `EmpresaUsuariosPage.tsx`.
 *
 * DECISIÓN DE DISEÑO: a diferencia de `BridgesPage.tsx`, esta pantalla NO
 * monta `ConectarWhatsAppCard` -- esa tarjeta resuelve su empresa activa
 * exclusivamente vía `useVistaEmpresa()` (`?empresaId=` en la URL), que esta
 * ruta dedicada nunca setea (usa el param de ruta `:empresaId` en su lugar).
 * Incluirla tal cual mostraría "Elige primero una empresa desde «Empresas»"
 * de forma incorrecta, incluso parado sobre la empresa correcta. Conectar
 * WhatsApp para una empresa puntual desde acá queda fuera de alcance de este
 * cambio -- requeriría una variante de `ConectarWhatsAppCard` que acepte un
 * `empresaId` explícito en vez de depender solo de `useVistaEmpresa`.
 *
 * Mismo motivo aplica a `ConectarMetaAdsCard` (Meta Ads, misma dependencia
 * de `useVistaEmpresa()`) -- tampoco se monta acá por la misma razón exacta,
 * no se agregó a propósito.
 */
export function EmpresaBridgesPage() {
  const { empresaId } = useParams<{ empresaId: string }>();
  const {
    data: empresa,
    isLoading: isLoadingEmpresa,
    isError: isErrorEmpresa,
    error: errorEmpresa,
    refetch: refetchEmpresa,
  } = useEmpresaHolding(empresaId);

  const [filtros, setFiltros] = useState<BridgesFiltrosState>(FILTROS_BRIDGES_VACIOS);
  const [pagina, setPagina] = useState(1);

  const params = useMemo(
    () => buildBridgesQueryParams(filtros, pagina, BRIDGES_POR_PAGINA, empresaId),
    [filtros, pagina, empresaId],
  );

  const { data, isLoading, isError, error, refetch } = useBridges(params);
  const crear = useCreateBridge();
  const eliminar = useDeleteBridge();
  const reactivar = useReactivateBridge();

  const [dialogAltaAbierto, setDialogAltaAbierto] = useState(false);
  const [claveModal, setClaveModal] = useState<ClaveModalState | null>(null);
  const [bridgeParaBaja, setBridgeParaBaja] = useState<Bridge | null>(null);
  const [apiExternaBridge, setApiExternaBridge] = useState<ApiExternaBridgeState | null>(null);

  usePageHeader(
    empresa
      ? {
          title: `Bridges de ${empresa.nombre}`,
          backTo: { label: empresa.nombre, href: `/empresas/${empresaId}` },
        }
      : null,
  );

  function updateFiltros(nuevos: BridgesFiltrosState) {
    setFiltros(nuevos);
    setPagina(1);
  }

  const hayFiltrosActivos =
    filtros.busqueda !== "" || filtros.redSocial !== FILTRO_TODOS || filtros.estado !== FILTRO_TODOS;

  if (!empresaId) {
    return <ErrorState message="Falta el identificador de la empresa en la URL." />;
  }

  if (isLoadingEmpresa) {
    return <LoadingState rows={4} rowHeight="h-16" />;
  }

  if (isErrorEmpresa) {
    return <ErrorState message={getErrorMessage(errorEmpresa)} onRetry={() => void refetchEmpresa()} />;
  }

  if (!empresa) {
    // Defensivo, mismo criterio que `EmpresaDetallePage.tsx`: un 404 real ya
    // cae en la rama `isErrorEmpresa` de arriba.
    return <ErrorState message="No se encontró la empresa solicitada." />;
  }

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
              : "Todavía no hay bridges configurados en esta empresa"
          }
          description={
            hayFiltrosActivos
              ? "Prueba ajustar o limpiar los filtros aplicados."
              : "Crea el primero con el botón «Nuevo bridge»."
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
              <Button variant="ghost" size="icon" className="h-10 w-10 rounded-2xl text-sidebar-foreground hover:bg-transparent" disabled={pagina <= 1} onClick={() => setPagina(1)} aria-label="Primera página" title="Primera página">
                <ChevronsLeft aria-hidden="true" />
              </Button>
              <Button variant="ghost" size="icon" className="h-10 w-10 rounded-2xl text-sidebar-foreground hover:bg-transparent" disabled={pagina <= 1} onClick={() => setPagina((p) => Math.max(1, p - 1))} aria-label="Página anterior" title="Página anterior">
                <ChevronLeft aria-hidden="true" />
              </Button>
              <span>
                Página {pagina} de {totalPaginas}
              </span>
              <Button variant="ghost" size="icon" className="h-10 w-10 rounded-2xl text-sidebar-foreground hover:bg-transparent" disabled={pagina >= totalPaginas} onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))} aria-label="Página siguiente" title="Página siguiente">
                <ChevronRight aria-hidden="true" />
              </Button>
              <Button variant="ghost" size="icon" className="h-10 w-10 rounded-2xl text-sidebar-foreground hover:bg-transparent" disabled={pagina >= totalPaginas} onClick={() => setPagina(totalPaginas)} aria-label="Última página" title="Última página">
                <ChevronsRight aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {dialogAltaAbierto ? (
        <NuevoBridgeDialog
          open
          onOpenChange={(abierto) => {
            if (!abierto) setDialogAltaAbierto(false);
          }}
          enviando={crear.isPending}
          onApiExterna={(nombre) => {
            crear.mutate(
              { redSocial: "API_EXTERNA", nombre, empresaId },
              {
                onSuccess: (respuesta) => {
                  setDialogAltaAbierto(false);
                  setClaveModal({
                    bridgeNombre: respuesta.bridge.nombre,
                    claveApi: respuesta.claveApi,
                    apiExternaBridgeId: respuesta.bridge.id,
                  });
                },
              },
            );
          }}
          onSubmit={(valores) =>
            crear.mutate(
              { ...valores, empresaId },
              {
                onSuccess: (respuesta) => {
                  setDialogAltaAbierto(false);
                  setClaveModal({ bridgeNombre: respuesta.bridge.nombre, claveApi: respuesta.claveApi });
                },
              },
            )
          }
        />
      ) : null}

      {apiExternaBridge ? (
        <ApiExternaSetupDialog
          open
          bridgeId={apiExternaBridge.bridgeId}
          nombre={apiExternaBridge.nombre}
          onClose={() => setApiExternaBridge(null)}
        />
      ) : null}

      {claveModal ? (
        <ClaveBridgeModal
          open
          bridgeNombre={claveModal.bridgeNombre}
          claveApi={claveModal.claveApi}
          onClose={() => {
            if (claveModal.apiExternaBridgeId) {
              setApiExternaBridge({ bridgeId: claveModal.apiExternaBridgeId, nombre: claveModal.bridgeNombre });
            }
            setClaveModal(null);
          }}
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
              : "El bridge pasará a estado Inactivo. Puedes reactivarlo cuando quieras, sin perder su clave ni su historial."
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
