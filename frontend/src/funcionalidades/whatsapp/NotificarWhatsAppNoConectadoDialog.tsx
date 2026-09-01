import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useNotificarWhatsAppNoConectado } from "@/funcionalidades/notificaciones/useNotificaciones";

/**
 * Mismo límite que el backend
 * (`backend/src/schemas/notificaciones.schema.ts::createWhatsAppNoConectadoBodySchema`,
 * worktree `dev-back`, integrado en paralelo con esta tarea) -- 1 a 500
 * caracteres, `.trim()` para que un mensaje de solo espacios no pase la
 * validación de "requerido".
 */
const notificarWhatsAppNoConectadoSchema = z.object({
  mensaje: z
    .string()
    .trim()
    .min(1, "Escribe un mensaje para el administrador.")
    .max(500, "El mensaje no puede superar los 500 caracteres."),
});

type NotificarWhatsAppNoConectadoValues = z.infer<typeof notificarWhatsAppNoConectadoSchema>;

interface NotificarWhatsAppNoConectadoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Aviso manual de un Supervisor/Asesor sin acceso a Bridges hacia el
 * administrador de su empresa (`WhatsAppSinConexion.tsx`), cuando el panel
 * de WhatsApp del detalle de un lead detecta que la empresa no tiene una
 * conexión activa. Mismo patrón que `RestablecerPasswordDialog.tsx`
 * (`react-hook-form` + `zod`, `Dialog` controlado desde el padre).
 */
export function NotificarWhatsAppNoConectadoDialog({
  open,
  onOpenChange,
}: NotificarWhatsAppNoConectadoDialogProps) {
  const notificar = useNotificarWhatsAppNoConectado();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<NotificarWhatsAppNoConectadoValues>({
    resolver: zodResolver(notificarWhatsAppNoConectadoSchema),
  });

  const enviar = handleSubmit((valores) => {
    notificar.mutate(valores.mensaje, {
      onSuccess: () => {
        reset();
        onOpenChange(false);
      },
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Notificar a administrador</DialogTitle>
          <DialogDescription>
            Cuéntale al administrador por qué necesitas que conecte el WhatsApp Business de la
            empresa.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notificar-whatsapp-mensaje">Mensaje para el administrador</Label>
            <Textarea
              id="notificar-whatsapp-mensaje"
              rows={4}
              disabled={notificar.isPending}
              aria-invalid={errors.mensaje ? "true" : undefined}
              {...register("mensaje")}
            />
            {errors.mensaje ? <p className="text-sm text-destructive">{errors.mensaje.message}</p> : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={notificar.isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={notificar.isPending}>
              {notificar.isPending ? "Enviando…" : "Enviar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
