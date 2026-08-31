import { useCallback, useEffect, useRef, useState } from "react";

const POPUP_POLL_INTERVAL_MS = 500;
const POPUP_NAME = "oauth-popup";
const POPUP_WIDTH = 560;
const POPUP_HEIGHT = 680;

export type OAuthPopupStatus = "closed" | "open";

export interface UseOAuthPopupResult {
  /** `"open"` mientras la ventana emergente sigue abierta, `"closed"` en cualquier otro momento. */
  status: OAuthPopupStatus;
  /**
   * Abre `url` en una ventana emergente centrada. Devuelve `false` si el
   * navegador la bloqueó (bloqueador de popups, `window.open` fuera de un
   * gesto de usuario, etc.) -- quien llama es responsable de hacer un
   * fallback (ej. redirect de página completa) en ese caso, este hook no lo
   * decide por sí mismo.
   */
  open: (url: string) => boolean;
  /** Cierra la ventana emergente programáticamente, si sigue abierta. */
  cancel: () => void;
}

/**
 * Infra genérica y reusable para flujos OAuth por ventana emergente (hoy
 * solo lo consume WhatsApp vía `ConectarWhatsAppCard.tsx`, pero está pensado
 * para LinkedIn/Meta Ads a futuro -- por eso no tiene nada específico de
 * ningún proveedor acá).
 *
 * Deliberadamente NO usa `postMessage` como mecanismo de comunicación con la
 * ventana emergente: para que el proveedor OAuth pueda mandar un mensaje
 * hacia la ventana padre, su página de callback tiene que cargar realmente
 * dentro del popup, y eso depende de que el `redirect_uri` configurado del
 * lado del proveedor apunte al frontend -- una precondición que hoy no se
 * cumple para WhatsApp (ver `ConectarWhatsAppCard.tsx`). En cambio, este
 * hook solo detecta que la ventana se cerró (por el motivo que sea: el
 * usuario la cerró a mano, hizo "Cancelar", o -- el día que el `redirect_uri`
 * se arregle -- se cerró sola tras completar el flujo real) haciendo polling
 * de `popup.closed`; quien consume este hook es responsable de, en ese
 * momento, consultar el estado real contra su propio backend en vez de asumir
 * éxito o cancelación.
 */
export function useOAuthPopup(): UseOAuthPopupResult {
  const [status, setStatus] = useState<OAuthPopupStatus>("closed");
  const popupRef = useRef<Window | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearPolling = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const checkClosed = useCallback(() => {
    if (popupRef.current?.closed) {
      clearPolling();
      popupRef.current = null;
      setStatus("closed");
    }
  }, [clearPolling]);

  // Limpieza al desmontar -- si el consumidor se desmonta con el popup
  // todavía abierto (navegación interna, por ejemplo), no debe quedar un
  // interval corriendo contra un componente ya desmontado.
  useEffect(() => {
    return () => {
      clearPolling();
    };
  }, [clearPolling]);

  const open = useCallback(
    (url: string): boolean => {
      const left = window.screenX + Math.max(0, (window.outerWidth - POPUP_WIDTH) / 2);
      const top = window.screenY + Math.max(0, (window.outerHeight - POPUP_HEIGHT) / 2);

      // Sin `noopener`: a propósito, para no cerrar la puerta a comunicarnos
      // con el popup el día que su callback sea alcanzable (ver docblock).
      const popup = window.open(
        url,
        POPUP_NAME,
        `width=${POPUP_WIDTH},height=${POPUP_HEIGHT},left=${left},top=${top}`,
      );

      if (!popup) {
        return false;
      }

      popupRef.current = popup;
      setStatus("open");

      clearPolling();
      intervalRef.current = setInterval(checkClosed, POPUP_POLL_INTERVAL_MS);

      return true;
    },
    [clearPolling, checkClosed],
  );

  const cancel = useCallback(() => {
    popupRef.current?.close();
    // No espera al próximo tick del polling para reaccionar -- mismo chequeo
    // (`checkClosed`), solo disparado antes, sin duplicar la lógica de
    // detección de cierre.
    checkClosed();
  }, [checkClosed]);

  return { status, open, cancel };
}
