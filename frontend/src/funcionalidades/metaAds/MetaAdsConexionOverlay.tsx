import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";

export type MetaAdsConexionOverlayStatus =
  | "idle"
  | "waiting"
  | "verifying"
  | "connected"
  | "notConnected";

interface MetaAdsConexionOverlayProps {
  status: MetaAdsConexionOverlayStatus;
  /** Solo se llama mientras `status === "waiting"` (botón "Cancelar" visible). */
  onCancel: () => void;
  /** Solo alcanzable en un estado final (`"connected"`/`"notConnected"`). */
  onClose: () => void;
}

const APP_ROOT_ID = "root";

/**
 * Overlay bloqueante del flujo de conexión de Meta Ads por ventana emergente
 * (`useOAuthPopup`, orquestado desde `ConectarMetaAdsCard.tsx`). Mismo shape
 * de estados que `whatsapp/WhatsAppConexionOverlay.tsx` -- este overlay solo
 * cubre el tramo de espera/verificación alrededor del popup, no la elección
 * de la cuenta de anuncios: esa (Paso 3) vive en `MetaAdsCallbackPage.tsx`,
 * mismo criterio que la elección de número de WhatsApp en
 * `WhatsAppCallbackPage.tsx` (nunca se asume éxito o cancelación solo porque
 * el popup se cerró, siempre se muestra el resultado verdadero devuelto por
 * el backend).
 *
 * Accesibilidad (docs/07, criterio transversal): `role="alertdialog"` +
 * `aria-modal="true"`, foco movido al overlay al abrirse, y el resto del
 * árbol de la app (`#root`) queda `inert` mientras el overlay está visible
 * -- por eso este componente se porta vía `createPortal` a `document.body`.
 * Sin dismiss por Escape ni por click en el backdrop mientras
 * `"waiting"`/`"verifying"` -- recién se puede cerrar una vez que hay un
 * resultado final.
 */
export function MetaAdsConexionOverlay({
  status,
  onCancel,
  onClose,
}: MetaAdsConexionOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const visible = status !== "idle";
  const blocked = status === "waiting" || status === "verifying";

  useEffect(() => {
    if (!visible) {
      return;
    }

    const appRoot = document.getElementById(APP_ROOT_ID);
    appRoot?.setAttribute("inert", "");
    overlayRef.current?.focus();

    return () => {
      appRoot?.removeAttribute("inert");
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      if (!blocked) {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [visible, blocked, onClose]);

  if (!visible) {
    return null;
  }

  let title: string;
  let description: string;
  let actions: ReactNode | null;

  switch (status) {
    case "waiting":
      title = "Conectando Meta Ads";
      description = "Esperando a que completes la autorización en la otra ventana…";
      actions = (
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
      );
      break;
    case "verifying":
      title = "Verificando conexión";
      description = "Comprobando el estado real de la conexión…";
      actions = null;
      break;
    case "connected":
      title = "Meta Ads conectado";
      description = "La conexión se completó correctamente.";
      actions = (
        <Button type="button" onClick={onClose}>
          Entendido
        </Button>
      );
      break;
    case "notConnected":
      title = "Conexión no completada";
      description = "No se detectó una conexión activa todavía. Puedes intentarlo de nuevo.";
      actions = (
        <Button type="button" onClick={onClose}>
          Reintentar
        </Button>
      );
      break;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => {
        if (!blocked) onClose();
      }}
    >
      <div
        ref={overlayRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="meta-ads-conexion-overlay-titulo"
        aria-describedby="meta-ads-conexion-overlay-descripcion"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-lg border bg-background p-6 shadow-lg outline-none"
      >
        <h2 id="meta-ads-conexion-overlay-titulo" className="text-base font-semibold">
          {title}
        </h2>
        <p
          id="meta-ads-conexion-overlay-descripcion"
          className="mt-2 text-sm text-muted-foreground"
        >
          {description}
        </p>
        {actions ? <div className="mt-4 flex justify-end">{actions}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
