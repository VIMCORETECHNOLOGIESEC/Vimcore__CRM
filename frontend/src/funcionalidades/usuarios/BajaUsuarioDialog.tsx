import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { AdminUsuario } from "@/tipos/usuario";

interface BajaUsuarioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  usuario: AdminUsuario;
  onConfirm: () => void;
  confirmando: boolean;
}

/**
 * Baja lógica (F7, checklist). Acción irreversible -- confirmación explícita
 * siempre (docs/07, criterio transversal). La reasignación de la cartera
 * activa ya no es responsabilidad del frontend: el backend real (M2,
 * `backend/src/services/usuarios.service.ts::deactivateUsuario`) la resuelve
 * de forma atómica dentro de la misma transacción de baja -- si el usuario
 * dado de baja es ASESOR/VENDEDOR con cartera abierta, reasigna cada lead al
 * compañero del mismo rol con menor carga activa (mismo criterio de la
 * asignación automática M6, desempate FIFO por `ultimaAsignacionEn`). Si no
 * hay ningún candidato disponible, el backend rechaza la baja con
 * `409 baja_sin_candidato_reasignacion` y no persiste nada.
 */
export function BajaUsuarioDialog({
  open,
  onOpenChange,
  usuario,
  onConfirm,
  confirmando,
}: BajaUsuarioDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dar de baja a {usuario.nombre}</DialogTitle>
          <DialogDescription>
            El usuario no podrá volver a iniciar sesión. Esta acción es irreversible. Si tiene
            cartera activa, el sistema la reasigna automáticamente al compañero del mismo rol con
            menor carga activa (mismo criterio que la asignación automática de leads nuevos).
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={confirmando}>
            Cancelar
          </Button>
          <Button variant="destructive" disabled={confirmando} onClick={onConfirm}>
            {confirmando ? "Procesando…" : "Confirmar baja"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
