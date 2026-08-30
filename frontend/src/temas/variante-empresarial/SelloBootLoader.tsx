import { cn } from "@/lib/utils";

interface SelloBootLoaderProps {
  /** Contexto que se está por mostrar: el holding o una empresa puntual del holding. */
  contexto: string;
  /** Mensaje de carga (ej. "Cargando Arcano Motos…") -- nunca hardcodeado acá. */
  mensaje: string;
  /** Controla si el loader interno anima (loop mecánico) o descansa quieto en su estado base. */
  reproduciendo: boolean;
  /** Qué contenido interno mostrar dentro del `.seal` -- ver el comentario de más abajo. */
  variante: "circular" | "puntos";
  className?: string;
}

/**
 * Sello/credencial cuadrada -- identidad fija de Propuesta B
 * (`.interface-design/system.md`, marco circular sin cambios) -- con
 * contenido interno intercambiable. El diamante mecánico indexado que
 * ocupaba este lugar antes se rechazó DOS veces ("descuadrado", después
 * "tosco") y ya no existe: en su lugar se muestran dos alternativas nuevas
 * lado a lado en el catálogo (`StyleguidePage.tsx`, sección Boot) para que
 * el usuario elija en vivo, sin comprometerse de nuevo a una sola dirección.
 *
 * - `variante="circular"`: arco (no círculo completo) vía SVG +
 *   `stroke-dasharray`, `stroke-linecap: round`, rotación CONTINUA y suave
 *   (a propósito no indexada -- esa textura fue lo que se leyó como "tosco"
 *   en el diamante). Anillo de fondo tenue (`color-mix()`) detrás del arco
 *   para dar sensación de capas.
 * - `variante="puntos"`: 3 puntos en cascada (stagger ~50ms), escala +
 *   opacidad + un leve `translateY` sincronizado.
 *
 * Ambas: 100% CSS (`@keyframes` en `tema-empresarial.css`), cero JS de
 * animación, color `--cat-2` (`#2563EB`, ya establecido -- ningún color
 * nuevo), respetan `prefers-reduced-motion`. `contexto`/`mensaje` son props
 * explícitas -- nunca texto fijo dentro del componente.
 */
export function SelloBootLoader({
  contexto,
  mensaje,
  reproduciendo,
  variante,
  className,
}: SelloBootLoaderProps) {
  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <div className="seal" aria-hidden="true">
        {variante === "circular" ? (
          <span className={cn("boot-circular", reproduciendo && "is-playing")}>
            <svg viewBox="0 0 32 32" width="30" height="30">
              <circle className="boot-circular-track" cx="16" cy="16" r="13" />
              <circle className="boot-circular-arc" cx="16" cy="16" r="13" />
            </svg>
          </span>
        ) : (
          <span className={cn("boot-dots", reproduciendo && "is-playing")}>
            <span className="boot-dot" />
            <span className="boot-dot" />
            <span className="boot-dot" />
          </span>
        )}
      </div>
      <div className="text-center" role="status" aria-live="polite">
        <p className="headline text-sm font-semibold" style={{ color: "var(--indigo)" }}>
          {contexto}
        </p>
        <p className="text-xs opacity-70">{mensaje}</p>
      </div>
    </div>
  );
}
