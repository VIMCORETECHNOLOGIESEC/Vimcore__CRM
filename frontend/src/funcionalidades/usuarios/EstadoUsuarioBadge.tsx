import { Circle } from "lucide-react";

interface EstadoUsuarioBadgeProps {
  activo: boolean;
  className?: string;
}

/**
 * Estado del usuario (activo/inactivo): color **y** etiqueta de texto
 * siempre juntos, mismo criterio de accesibilidad que `SemaforoBadge.tsx`
 * (docs/07, "el semáforo nunca se comunica solo por color" -- se extiende
 * acá a cualquier indicador de estado, no solo al de leads). Componente de
 * presentación puro, sin lógica -- no requiere test unitario per AGENTS.md §5.
 */
export function EstadoUsuarioBadge({ activo, className }: EstadoUsuarioBadgeProps) {
  const clases = activo
    ? { badge: "border-green-200 bg-green-50 text-green-800", dot: "text-green-600" }
    : { badge: "border-slate-200 bg-slate-50 text-slate-600", dot: "text-slate-400" };

  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${clases.badge} ${className ?? ""}`}
    >
      <Circle className={`size-2 fill-current ${clases.dot}`} aria-hidden="true" />
      {activo ? "Activo" : "Inactivo"}
    </span>
  );
}
