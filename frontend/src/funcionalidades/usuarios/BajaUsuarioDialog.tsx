import { useState } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AdminUsuario } from "@/tipos/usuario";
import { useCandidatosReasignacion, useCargaActivaDeUsuario } from "./useUsuarios";

interface BajaUsuarioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  usuario: AdminUsuario;
  onConfirm: (nuevoResponsableId?: string) => void;
  confirmando: boolean;
}

/**
 * Baja lógica con reasignación obligatoria de la cartera activa (F7,
 * checklist). Acción irreversible -- confirmación explícita siempre (docs/07,
 * criterio transversal), y si el usuario tiene leads activos en su cartera
 * no deja confirmar sin elegir antes a quién se le reasignan.
 *
 * La cartera activa y sus candidatos de reasignación son backend real --
 * ver `usuarios.api.ts::getCargaActivaDeUsuario`/`getCandidatosReasignacion`.
 */
export function BajaUsuarioDialog({
  open,
  onOpenChange,
  usuario,
  onConfirm,
  confirmando,
}: BajaUsuarioDialogProps) {
  const { data: cargaActiva = 0 } = useCargaActivaDeUsuario(usuario.id);
  const { data: candidatos = [] } = useCandidatosReasignacion(usuario.rol, usuario.id);
  const [nuevoResponsableId, setNuevoResponsableId] = useState("");

  const requiereReasignacion = cargaActiva > 0;
  const puedeConfirmar = !requiereReasignacion || Boolean(nuevoResponsableId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dar de baja a {usuario.nombre}</DialogTitle>
          <DialogDescription>
            {requiereReasignacion
              ? `Este usuario tiene ${cargaActiva} lead${cargaActiva === 1 ? "" : "s"} activo${cargaActiva === 1 ? "" : "s"} en su cartera. Elegí quién los va a recibir antes de continuar: no se puede dar de baja a un usuario con cartera activa sin reasignarla.`
              : "El usuario no podrá volver a iniciar sesión. Esta acción es irreversible."}
          </DialogDescription>
        </DialogHeader>

        {requiereReasignacion ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="baja-nuevo-responsable">Reasignar cartera a</Label>
            <Select value={nuevoResponsableId} onValueChange={setNuevoResponsableId}>
              <SelectTrigger id="baja-nuevo-responsable" aria-label="Reasignar cartera a">
                <SelectValue placeholder="Elegir usuario…" />
              </SelectTrigger>
              <SelectContent>
                {candidatos.map((candidato) => (
                  <SelectItem key={candidato.id} value={candidato.id}>
                    {candidato.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {candidatos.length === 0 ? (
              <p className="text-sm text-destructive">
                No hay otro usuario del mismo rol disponible para recibir la cartera.
              </p>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={confirmando}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={!puedeConfirmar || confirmando}
            onClick={() => onConfirm(requiereReasignacion ? nuevoResponsableId : undefined)}
          >
            {confirmando ? "Procesando…" : "Confirmar baja"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
