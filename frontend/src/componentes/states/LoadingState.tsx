import { Skeleton } from "@/components/ui/skeleton";

interface LoadingStateProps {
  /** Cantidad de filas/bloques de esqueleto a repetir. */
  rows?: number;
  /** Alto de cada fila, en clases Tailwind (ej. "h-10", "h-16"). */
  rowHeight?: string;
  className?: string;
}

/**
 * Esqueleto de carga reutilizable para listas y tablas (docs/07, criterios
 * transversales: "ninguna operación deja la pantalla congelada sin
 * indicador de progreso"). Componente de presentación sin lógica de negocio
 * -- no requiere test unitario per AGENTS.md §5.
 */
export function LoadingState({ rows = 4, rowHeight = "h-12", className }: LoadingStateProps) {
  return (
    <div className={`flex flex-col gap-2 ${className ?? ""}`} role="status" aria-label="Cargando">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className={`w-full ${rowHeight}`} />
      ))}
    </div>
  );
}
