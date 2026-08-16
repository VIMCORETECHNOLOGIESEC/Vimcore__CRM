import type { ReactNode } from "react";
import { EmptyState } from "@/componentes/states/EmptyState";
import { ErrorState } from "@/componentes/states/ErrorState";
import { LoadingState } from "@/componentes/states/LoadingState";
import { getErrorMessage } from "@/api/httpClient";

interface GraficoCardProps {
  titulo: string;
  descripcion?: string;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
  vacio: boolean;
  mensajeVacio?: string;
  children: ReactNode;
}

/**
 * Envoltorio común de las 6 gráficas del dashboard (F5): título, y los tres
 * estados obligatorios por vista (docs/07, criterios transversales) --
 * carga (esqueleto), error (mensaje accionable + reintentar) y vacío.
 * Componente de presentación puro, sin lógica de negocio propia.
 */
export function GraficoCard({
  titulo,
  descripcion,
  isLoading,
  isError,
  error,
  onRetry,
  vacio,
  mensajeVacio = "Sin datos para el rango y los filtros seleccionados.",
  children,
}: GraficoCardProps) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{titulo}</h2>
        {descripcion ? <p className="text-xs text-muted-foreground">{descripcion}</p> : null}
      </div>

      {isLoading ? (
        <LoadingState rows={4} rowHeight="h-8" />
      ) : isError ? (
        <ErrorState message={getErrorMessage(error)} onRetry={onRetry} />
      ) : vacio ? (
        <EmptyState title={mensajeVacio} />
      ) : (
        children
      )}
    </div>
  );
}
