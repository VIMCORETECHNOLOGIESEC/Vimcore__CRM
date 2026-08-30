import type { EstadoSlaCalculado } from "./sla";
import { useSlaCountdown } from "./useSlaCountdown";
import { Clock3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const ESTADO_CLASES: Record<EstadoSlaCalculado, string> = {
  A_TIEMPO: "border-success/30 bg-success/15 text-success",
  EN_RIESGO: "border-warning/30 bg-warning/15 text-warning",
  ATRASADO: "border-destructive/30 bg-destructive/15 font-semibold text-destructive",
  CERRADO: "border-border bg-muted text-muted-foreground",
};

const ESTADO_ETIQUETAS: Record<EstadoSlaCalculado, string> = {
  A_TIEMPO: "A tiempo",
  EN_RIESGO: "En riesgo",
  ATRASADO: "Atrasado",
  CERRADO: "Cerrado",
};

interface SlaCountdownCellProps {
  slaInicioEn: string | null;
  cerradoEn: string | null;
  className?: string;
}

/**
 * Celda con el contador de SLA en vivo (docs/07 F3). La lógica de cálculo y
 * el intervalo local viven en `useSlaCountdown`/`sla.ts` (con tests); este
 * componente solo formatea la presentación.
 */
export function SlaCountdownCell({ slaInicioEn, cerradoEn, className }: SlaCountdownCellProps) {
  const { estado, etiqueta } = useSlaCountdown(slaInicioEn, cerradoEn);
  const tiempo = estado === "CERRADO" ? "—" : etiqueta.match(/\(([^)]+)\)/)?.[1] ?? etiqueta;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className={`gap-1 rounded-full text-xs tabular-nums ${ESTADO_CLASES[estado]} ${className ?? ""}`}
          aria-label={ESTADO_ETIQUETAS[estado]}
        >
          <Clock3 className="size-3 shrink-0" aria-hidden="true" />
          {tiempo}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="border bg-popover text-popover-foreground shadow-md">
        {ESTADO_ETIQUETAS[estado]}
      </TooltipContent>
    </Tooltip>
  );
}
