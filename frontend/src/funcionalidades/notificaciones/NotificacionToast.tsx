import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { Notificacion } from "@/tipos/notificacion";
import { resolveDestinoNotificacion } from "./notificaciones.utils";

interface NotificacionToastProps {
  notificacion: Notificacion;
  onNavigate: () => void;
}

export function NotificacionToast({ notificacion, onNavigate }: NotificacionToastProps) {
  const destino = resolveDestinoNotificacion(notificacion);
  return (
    <div className="flex min-w-72 flex-col gap-2 rounded-md border bg-background p-4 text-foreground shadow-lg">
      <p className="font-semibold">{notificacion.titulo}</p>
      <p className="text-sm text-muted-foreground">{notificacion.mensaje}</p>
      {destino ? (
        <Button type="button" variant="outline" size="sm" onClick={onNavigate}>
          {notificacion.leadId ? "Ver lead" : "Ver conversación"}
        </Button>
      ) : null}
    </div>
  );
}

/** Sonner mantiene el anuncio polite y el id evita duplicados por replay SSE. */
export function showNotificacionToast(
  notificacion: Notificacion,
  navigate: (path: string) => void,
): void {
  const destino = resolveDestinoNotificacion(notificacion);
  toast.custom(
    (toastId) => (
      <NotificacionToast
        notificacion={notificacion}
        onNavigate={() => {
          if (destino) navigate(destino);
          toast.dismiss(toastId);
        }}
      />
    ),
    { id: `notificacion-${notificacion.id}`, duration: 5000 },
  );
}
