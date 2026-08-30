import type { ReactNode } from "react";
import { EmptyState } from "@/componentes/states/EmptyState";
import { ErrorState } from "@/componentes/states/ErrorState";
import { LoadingState } from "@/componentes/states/LoadingState";
import { getErrorMessage } from "@/api/httpClient";
import { cn } from "@/lib/utils";

interface GraficoCardProps {
  titulo: string;
  descripcion?: string;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
  vacio: boolean;
  mensajeVacio?: string;
  destacado?: boolean;
  compacto?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * Envoltorio común de las 6 gráficas del dashboard (F5): título, jerarquía
 * visual y los tres estados obligatorios por vista (docs/07, criterios
 * transversales) -- carga (esqueleto), error (mensaje accionable + reintentar)
 * y vacío. Componente de presentación puro, sin lógica de negocio propia.
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
  destacado = false,
  compacto = false,
  className,
  children,
}: GraficoCardProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card",
        destacado ? "rounded-xl p-5 shadow-sm" : compacto ? "p-3" : "p-4",
        className,
      )}
    >
      <div>
        <h3 className="text-sm font-semibold text-foreground text-balance">{titulo}</h3>
        {descripcion ? <p className="text-xs text-muted-foreground text-pretty">{descripcion}</p> : null}
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
