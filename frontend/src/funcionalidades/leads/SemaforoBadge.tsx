import { Circle } from "lucide-react";
import type { SemaforoLead } from "@/tipos/lead";
import { SEMAFORO_ETIQUETAS } from "./catalogos";

/**
 * Indicador de semáforo: color **y** etiqueta de texto siempre juntos
 * (docs/07 F3, criterio transversal de accesibilidad -- nunca solo color).
 *
 * DECISIÓN (discrepancia detectada, no resuelta en silencio): el color se
 * asigna literalmente por el nombre del enum (`VERDE` -> verde, `AMARILLO`
 * -> ámbar, `ROJO` -> rojo, igual que el 🟢🟡🔴 de docs/04 §2), usando la
 * paleta Tailwind estándar en vez de los tokens `semaforo-frio/tibio/caliente`
 * ya definidos en `tailwind.config.js`/`index.css`. Esos tokens fueron
 * fijados en F1 usando la metáfora de temperatura visual del color (rojo =
 * "caliente", verde = "frío"), pero docs/04 §2 usa "caliente/tibio/frío"
 * como lectura *comercial* con la polaridad inversa (🟢 Verde = "lead
 * caliente, prioridad"; 🔴 Rojo = "lead frío, bajo esfuerzo"). Reutilizar
 * `semaforo-caliente` (rojo) para `ROJO` renderizaría el color correcto pero
 * con una clase cuyo nombre de negocio dice lo contrario del lead que
 * describe. Se prefirió no tocar los tokens de F1 y usar clases Tailwind
 * directas aquí; vale la pena que un humano decida si renombrar esos tokens
 * a `semaforo-rojo/amarillo/verde` para eliminar la ambigüedad.
 */
const SEMAFORO_CLASES: Record<SemaforoLead, { badge: string; dot: string }> = {
  VERDE: { badge: "border-green-200 bg-green-50 text-green-800", dot: "text-green-600" },
  AMARILLO: { badge: "border-amber-200 bg-amber-50 text-amber-800", dot: "text-amber-600" },
  ROJO: { badge: "border-red-200 bg-red-50 text-red-800", dot: "text-red-600" },
};

interface SemaforoBadgeProps {
  /** `null` para un lead que todavía no fue calificado (D14). */
  semaforo: SemaforoLead | null;
  className?: string;
}

export function SemaforoBadge({ semaforo, className }: SemaforoBadgeProps) {
  const clases = semaforo
    ? SEMAFORO_CLASES[semaforo]
    : { badge: "border-border bg-secondary text-muted-foreground", dot: "text-muted-foreground" };
  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${clases.badge} ${className ?? ""}`}
    >
      <Circle className={`size-2 fill-current ${clases.dot}`} aria-hidden="true" />
      {semaforo ? SEMAFORO_ETIQUETAS[semaforo] : "Sin calificar"}
    </span>
  );
}
