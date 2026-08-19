import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { getErrorMessage } from "@/api/httpClient";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/componentes/ConfirmDialog";
import { EmptyState } from "@/componentes/states/EmptyState";
import { ErrorState } from "@/componentes/states/ErrorState";
import { LoadingState } from "@/componentes/states/LoadingState";
import { usePageHeader } from "@/layouts/PageHeaderContext";
import type { Bridge } from "@/tipos/bridge";
import { AvisoBridge } from "./AvisoBridge";
import { evaluateAvisoBridge, canEliminarseFisicamente, hasAvisoDestacado } from "./bridges.utils";
import { BridgesTable } from "./BridgesTable";
import { ClaveBridgeModal } from "./ClaveBridgeModal";
import { NuevoBridgeDialog } from "./NuevoBridgeDialog";
import { useBridges, useCreateBridge, useDeleteBridge, useReactivateBridge } from "./useBridges";

const BRIDGES_POR_ESQUELETO = 5;

interface ClaveModalState {
  bridgeNombre: string;
  claveApi: string;
}

/**
 * Administración de bridges (F8/bridges-lifecycle-management, docs/07 --
 * solo administrador, ruta protegida en `router.tsx`). Backend real -- ver
 * `bridges.api.ts` para el detalle de los endpoints consumidos.
 */
export function BridgesPage() {
  usePageHeader({ title: "Bridges" });

  const { data, isLoading, isError, error, refetch } = useBridges();
  const crear = useCreateBridge();
  const eliminar = useDeleteBridge();
  const reactivar = useReactivateBridge();

  const [dialogAltaAbierto, setDialogAltaAbierto] = useState(false);
  const [claveModal, setClaveModal] = useState<ClaveModalState | null>(null);
  const [bridgeParaBaja, setBridgeParaBaja] = useState<Bridge | null>(null);

  const bridgesConAviso = useMemo(
    () =>
      (data ?? [])
        .map((bridge) => ({ bridge, aviso: evaluateAvisoBridge(bridge) }))
        .filter(({ aviso }) => hasAvisoDestacado(aviso)),
    [data],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={() => setDialogAltaAbierto(true)}>
          <Plus className="size-4" aria-hidden="true" />
          Nuevo bridge
        </Button>
      </div>

      {bridgesConAviso.length > 0 ? (
        <div className="flex flex-col gap-2">
          {bridgesConAviso.map(({ bridge, aviso }) => (
            <AvisoBridge key={bridge.id} nombre={bridge.nombre} aviso={aviso} />
          ))}
        </div>
      ) : null}

      {isLoading ? (
        <LoadingState rows={BRIDGES_POR_ESQUELETO} rowHeight="h-12" />
      ) : isError ? (
        <ErrorState message={getErrorMessage(error)} onRetry={() => void refetch()} />
      ) : !data || data.length === 0 ? (
        <EmptyState
          title="Todavía no hay bridges configurados"
          description="Creá el primero con el botón «Nuevo bridge»."
        />
      ) : (
        <BridgesTable
          bridges={data}
          onDarDeBaja={setBridgeParaBaja}
          onReactivar={(bridgeId) => reactivar.mutate(bridgeId)}
          reactivando={reactivar.isPending}
        />
      )}

      {dialogAltaAbierto ? (
        <NuevoBridgeDialog
          open
          onOpenChange={(abierto) => {
            if (!abierto) setDialogAltaAbierto(false);
          }}
          enviando={crear.isPending}
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
