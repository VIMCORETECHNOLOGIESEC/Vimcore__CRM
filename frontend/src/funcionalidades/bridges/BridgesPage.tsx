import { useMemo } from "react";
import { getErrorMessage } from "@/api/httpClient";
import { EmptyState } from "@/componentes/states/EmptyState";
import { ErrorState } from "@/componentes/states/ErrorState";
import { LoadingState } from "@/componentes/states/LoadingState";
import { AvisoBridge } from "./AvisoBridge";
import { evaluarAvisoBridge, tieneAvisoDestacado } from "./bridges.utils";
import { BridgesTable } from "./BridgesTable";
import { useBridges } from "./useBridges";

const BRIDGES_POR_ESQUELETO = 5;

/**
 * Administración de bridges (F8, docs/07 -- solo administrador, ruta
 * protegida en `router.tsx`). Mock en memoria -- ver `bridges.api.ts` para
 * el detalle de qué se simula y el punto de integración con el futuro
 * backend real de bridges (M8, no existe todavía).
 */
export function BridgesPage() {
  const { data, isLoading, isError, error, refetch } = useBridges();

  const bridgesConAviso = useMemo(
    () =>
      (data ?? [])
        .map((bridge) => ({ bridge, aviso: evaluarAvisoBridge(bridge) }))
        .filter(({ aviso }) => tieneAvisoDestacado(aviso)),
    [data],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">Bridges</h1>
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
          description="Los bridges de captación se dan de alta desde el backend."
        />
      ) : (
        <BridgesTable bridges={data} />
      )}
    </div>
  );
}
