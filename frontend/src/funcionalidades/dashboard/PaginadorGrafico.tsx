import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PaginadorGraficoProps {
  pagina: number;
  totalPaginas: number;
  onCambiarPagina: (pagina: number) => void;
}

/** Controles ◀ Página X de N ▶ compartidos por `GraficoPorAsesor`/`GraficoPorCampania` (F5, ventana fija). Oculto si todo cabe en una sola página. */
export function PaginadorGrafico({ pagina, totalPaginas, onCambiarPagina }: PaginadorGraficoProps) {
  if (totalPaginas <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-7"
        disabled={pagina === 0}
        onClick={() => onCambiarPagina(pagina - 1)}
        aria-label="Página anterior"
      >
        <ChevronLeft className="size-3.5" aria-hidden="true" />
      </Button>
      <span>
        Página {pagina + 1} de {totalPaginas}
      </span>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-7"
        disabled={pagina === totalPaginas - 1}
        onClick={() => onCambiarPagina(pagina + 1)}
        aria-label="Página siguiente"
      >
        <ChevronRight className="size-3.5" aria-hidden="true" />
      </Button>
    </div>
  );
}
