import { useEffect, useState } from "react";
import { MousePointerClick } from "lucide-react";

const APP_SCROLL_CONTAINER_SELECTOR = '[data-tour="app-scroll-container"]';

interface TourClickHintProps {
  targetSelector: string;
}

interface HintPosition {
  top: number;
  left: number;
}

function computePosition(targetSelector: string): HintPosition | null {
  const target = document.querySelector<HTMLElement>(targetSelector);
  if (!target) return null;

  const rect = target.getBoundingClientRect();
  return {
    top: rect.top + rect.height * 0.6,
    left: rect.left + rect.width * 0.6,
  };
}

/**
 * Pista puramente decorativa del tutorial guiado de Leads: un cursor que
 * "tapea" cerca del control real ahora bloqueado por
 * `options.blockTargetInteraction` de Joyride (ver `LeadsNavigationTutorial.tsx`),
 * para indicar "acá harías clic en el uso real" sin ejecutar ningún clic de
 * verdad -- el avance del tour sigue siendo 100% por el botón "Siguiente".
 *
 * Se posiciona en el cuadrante inferior-derecho del target (no el centro) para
 * no taparlo ni tapar el tooltip de Joyride. `pointer-events-none` +
 * `aria-hidden` para que nunca intercepte clics ni se anuncie a lectores de
 * pantalla -- es un refuerzo visual, no información nueva (el tooltip del
 * paso ya la explica en texto).
 */
export function TourClickHint({ targetSelector }: TourClickHintProps) {
  const [position, setPosition] = useState<HintPosition | null>(null);

  useEffect(() => {
    function recalcular() {
      setPosition(computePosition(targetSelector));
    }

    recalcular();

    const scrollContainer = document.querySelector(APP_SCROLL_CONTAINER_SELECTOR);
    window.addEventListener("resize", recalcular);
    scrollContainer?.addEventListener("scroll", recalcular);

    return () => {
      window.removeEventListener("resize", recalcular);
      scrollContainer?.removeEventListener("scroll", recalcular);
    };
  }, [targetSelector]);

  if (!position) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed z-[70]"
      style={{ top: position.top, left: position.left }}
    >
      <span className="tour-click-hint relative flex items-center justify-center">
        <span className="tour-click-hint-ripple absolute inline-flex size-8 rounded-full bg-marca-texto/50" />
        <MousePointerClick className="tour-click-hint-cursor relative size-6 text-marca-texto drop-shadow" />
      </span>
    </div>
  );
}
