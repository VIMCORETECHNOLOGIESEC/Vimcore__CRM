import { Circle } from "lucide-react";
import type { EstadoBridge } from "@/tipos/bridge";
import { ESTADO_BRIDGE_ETIQUETAS } from "./catalogos";

/**
 * Estado del bridge: color **y** etiqueta de texto siempre juntos (docs/07,
 * criterio transversal de accesibilidad -- mismo patrón que
 * `SemaforoBadge.tsx`/`EstadoUsuarioBadge.tsx`). Componente de presentación
 * puro, sin lógica -- no requiere test unitario per AGENTS.md §5.
 */
const ESTADO_CLASES: Record<EstadoBridge, { badge: string; dot: string }> = {
  ACTIVO: { badge: "border-green-200 bg-green-50 text-green-800", dot: "text-green-600" },
  TOKEN_EXPIRADO: { badge: "border-red-200 bg-red-50 text-red-800", dot: "text-red-600" },
  ERROR: { badge: "border-red-200 bg-red-50 text-red-800", dot: "text-red-600" },
  INACTIVO: { badge: "border-slate-200 bg-slate-50 text-slate-600", dot: "text-slate-400" },
};

interface EstadoBridgeBadgeProps {
  estado: EstadoBridge;
  className?: string;
}

export function EstadoBridgeBadge({ estado, className }: EstadoBridgeBadgeProps) {
  const clases = ESTADO_CLASES[estado];
  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${clases.badge} ${className ?? ""}`}
    >
      <Circle className={`size-2 fill-current ${clases.dot}`} aria-hidden="true" />
      {ESTADO_BRIDGE_ETIQUETAS[estado]}
    </span>
  );
}
