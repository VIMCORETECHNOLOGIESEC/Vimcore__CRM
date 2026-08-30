import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

interface WelcomeSplashLoaderProps {
  /** Nombre del holding/empresa que se está por mostrar (ej. "Arcano Motos"). */
  contexto: string;
  /** Mensaje de carga -- nunca hardcodeado dentro del componente. */
  mensaje: string;
  /** Controla si la animación de entrada está activa (visible) o en reposo (oculto, opacidad 0). */
  visible: boolean;
  /**
   * Clases de posicionamiento -- por defecto `fixed inset-0 z-50` (cubre el
   * viewport completo), como se montaría en la app real, ANTES del layout
   * (`App.tsx`). El catálogo (`StyleguidePage.tsx`) la sobreescribe a
   * `absolute inset-0` para contenerla dentro de un frame acotado en vez de
   * taparlo todo -- `cn`/`tailwind-merge` resuelve el conflicto
   * `fixed`/`absolute` sin dejar ambas clases activas a la vez.
   */
  className?: string;
  /**
   * Overrides puntuales de las custom properties de marca
   * (`--marca-color-1`/`--marca-color-2`, ver `tema-empresarial.css`) --
   * pensado para la configuración real de la empresa (`configuracion-empresa`,
   * `LoginPage.tsx`), que llega recién en runtime vía `GET
   * /configuracion-empresa` y no puede resolverse en CSS estático. Sin esta
   * prop, el componente sigue pintando con los defaults de la variante
   * (`--indigo`/`--cat-2`) heredados de `.tema-empresarial`.
   */
  style?: CSSProperties;
}

/**
 * Overlay full-screen de bienvenida -- se muestra al entrar a la app, ANTES
 * de montar el layout, y desaparece una vez resuelta la sesión/contexto
 * inicial. Distinto del `SelloBootLoader` (`./SelloBootLoader.tsx`,
 * credencial circular fija del sidebar/topbar) -- no lo reemplaza ni lo
 * reimplementa, conviven: este es el splash de arranque de toda la app, el
 * otro es un elemento del chrome.
 *
 * Reutiliza los tokens ya definidos en `tema-empresarial.css` -- ningún
 * color nuevo:
 * - Fondo: gradiente diagonal `--marca-color-1` → `--marca-color-2` (mismas
 *   variables "personalizables por holding" del panel de marca del login,
 *   `LoginScreenDemo.tsx`) + el mismo patrón de retícula fina + una viñeta
 *   sutil para foco central (2026-08-27, segunda pasada de diseño -- antes
 *   era `--indigo` sólido liso).
 * - Indicador de progreso: `.welcome-dots`/`.welcome-dot`, propio de este
 *   componente (2026-08-27) -- YA NO comparte clases con el sello de boot
 *   descartado (`.boot-dots`/`.boot-dot`, sigue existiendo en
 *   `SelloBootLoader.tsx`/CSS sin tocar, reservado para el selector de
 *   empresa). Se separó a propósito para poder modernizar la animación de
 *   este loader sin arrastrar cambios a ese componente reservado para otra
 *   pantalla futura.
 *
 * `contexto`/`mensaje` son props explícitas, nunca texto fijo. 100% CSS
 * (transiciones en `tema-empresarial.css`, clase `.welcome-splash`),
 * respeta `prefers-reduced-motion`.
 */
export function WelcomeSplashLoader({
  contexto,
  mensaje,
  visible,
  className,
  style,
}: WelcomeSplashLoaderProps) {
  return (
    <div
      className={cn("welcome-splash fixed inset-0 z-50", visible && "is-visible", className)}
      style={style}
      role="status"
      aria-live="polite"
    >
      <div className="welcome-splash-marca">
        <p className="headline text-3xl font-semibold tracking-wide" style={{ color: "var(--papel)" }}>
          {contexto}
        </p>
        <span className={cn("welcome-dots", visible && "is-playing")} aria-hidden="true">
          <span className="welcome-dot" />
          <span className="welcome-dot" />
          <span className="welcome-dot" />
        </span>
        <p className="text-sm opacity-70" style={{ color: "var(--papel)" }}>
          {mensaje}
        </p>
      </div>
    </div>
  );
}
