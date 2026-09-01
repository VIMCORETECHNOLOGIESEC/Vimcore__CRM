import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";

export type WhatsAppConexionOverlayStatus =
  | "idle"
  | "waiting"
  | "verifying"
  | "connected"
  | "notConnected";

interface WhatsAppConexionOverlayProps {
  status: WhatsAppConexionOverlayStatus;
  /** Solo se llama mientras `status === "waiting"` (botón "Cancelar" visible). */
  onCancel: () => void;
  /** Solo alcanzable en un estado final (`"connected"`/`"notConnected"`). */
  onClose: () => void;
}

const APP_ROOT_ID = "root";

/**
 * Overlay bloqueante del flujo de conexión de WhatsApp por ventana emergente
 * (`useOAuthPopup`, orquestado desde `ConectarWhatsAppCard.tsx`). Cubre las
 * 5 fases del flujo: `"idle"` (no se muestra nada), `"waiting"` (popup
 * abierto, polling activo), `"verifying"` (popup ya cerrado, consultando
 * el estado REAL contra `GET /whatsapp/conexion`) y los dos resultados
 * finales `"connected"`/`"notConnected"` -- nunca se asume éxito o
 * cancelación solo porque el popup se cerró, siempre se muestra el
 * resultado verdadero devuelto por el backend.
 *
 * Accesibilidad (docs/07, criterio transversal): `role="alertdialog"` +
 * `aria-modal="true"`, foco movido al overlay al abrirse, y el resto del
 * árbol de la app (`#root`) queda `inert` mientras el overlay está visible
 * -- por eso este componente se porta vía `createPortal` a `document.body`,
 * como hermano de `#root` y no como descendiente: así el propio overlay
 * queda afuera del `inert` que le aplica a `#root` ("el resto del árbol
 * MENOS el propio overlay"). Sin dismiss por Escape ni por click en el
 * backdrop mientras `"waiting"`/`"verifying"` -- recién se puede cerrar
 * una vez que hay un resultado final, para que el usuario no pierda de
 * vista un proceso en curso por error.
 */
export function WhatsAppConexionOverlay({
  status,
  onCancel,
  onClose,
}: WhatsAppConexionOverlayProps) {
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
      title = "Conectando WhatsApp";
      description = "Esperando a que completes la conexión en la otra ventana…";
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
      title = "WhatsApp conectado";
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
        aria-labelledby="whatsapp-conexion-overlay-titulo"
        aria-describedby="whatsapp-conexion-overlay-descripcion"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-lg border bg-background p-6 shadow-lg outline-none"
      >
        <h2 id="whatsapp-conexion-overlay-titulo" className="text-base font-semibold">
          {title}
        </h2>
        <p
          id="whatsapp-conexion-overlay-descripcion"
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
