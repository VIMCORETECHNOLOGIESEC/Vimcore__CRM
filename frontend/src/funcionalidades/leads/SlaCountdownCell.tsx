import type { EstadoSlaCalculado } from "./sla";
import { useSlaCountdown } from "./useSlaCountdown";

const ESTADO_CLASES: Record<EstadoSlaCalculado, string> = {
  A_TIEMPO: "text-green-700",
  EN_RIESGO: "text-amber-700",
  ATRASADO: "text-red-700 font-semibold",
  CERRADO: "text-muted-foreground",
};

interface SlaCountdownCellProps {
  slaInicioEn: string | null;
  cerradoEn: string | null;
}

/**
 * Celda con el contador de SLA en vivo (docs/07 F3). La lógica de cálculo y
 * el intervalo local viven en `useSlaCountdown`/`sla.ts` (con tests); este
 * componente solo formatea la presentación.
 */
export function SlaCountdownCell({ slaInicioEn, cerradoEn }: SlaCountdownCellProps) {
  const { estado, etiqueta } = useSlaCountdown(slaInicioEn, cerradoEn);
  return <span className={`text-xs tabular-nums ${ESTADO_CLASES[estado]}`}>{etiqueta}</span>;
}
