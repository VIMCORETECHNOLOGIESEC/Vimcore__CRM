import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { Notificacion } from "@/tipos/notificacion";

interface NotificacionToastProps {
  notificacion: Notificacion;
  onNavigate: () => void;
}

export function NotificacionToast({ notificacion, onNavigate }: NotificacionToastProps) {
  return (
    <div className="flex min-w-72 flex-col gap-2 rounded-md border bg-background p-4 text-foreground shadow-lg">
      <p className="font-semibold">{notificacion.titulo}</p>
      <p className="text-sm text-muted-foreground">{notificacion.mensaje}</p>
      {notificacion.leadId ? (
        <Button type="button" variant="outline" size="sm" onClick={onNavigate}>
          Ver lead
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
  toast.custom(
    (toastId) => (
      <NotificacionToast
        notificacion={notificacion}
        onNavigate={() => {
          if (notificacion.leadId) navigate(`/leads/${notificacion.leadId}`);
          toast.dismiss(toastId);
        }}
      />
    ),
    { id: `notificacion-${notificacion.id}`, duration: 5000 },
  );
}
