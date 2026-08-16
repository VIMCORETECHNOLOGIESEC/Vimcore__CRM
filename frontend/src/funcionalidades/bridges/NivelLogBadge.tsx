import { Circle } from "lucide-react";
import type { NivelBridgeLog } from "@/tipos/bridge";
import { NIVEL_LOG_ETIQUETAS } from "./catalogos";

/**
 * Nivel de una entrada de la bitácora: color **y** etiqueta de texto
 * siempre juntos (docs/07, criterio transversal de accesibilidad).
 * Componente de presentación puro, sin lógica -- no requiere test unitario
 * per AGENTS.md §5.
 */
const NIVEL_CLASES: Record<NivelBridgeLog, { badge: string; dot: string }> = {
  INFO: { badge: "border-blue-200 bg-blue-50 text-blue-800", dot: "text-blue-600" },
  ADVERTENCIA: { badge: "border-amber-200 bg-amber-50 text-amber-800", dot: "text-amber-600" },
  ERROR: { badge: "border-red-200 bg-red-50 text-red-800", dot: "text-red-600" },
};

interface NivelLogBadgeProps {
  nivel: NivelBridgeLog;
  className?: string;
}

export function NivelLogBadge({ nivel, className }: NivelLogBadgeProps) {
  const clases = NIVEL_CLASES[nivel];
  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${clases.badge} ${className ?? ""}`}
    >
      <Circle className={`size-2 fill-current ${clases.dot}`} aria-hidden="true" />
      {NIVEL_LOG_ETIQUETAS[nivel]}
    </span>
  );
}
