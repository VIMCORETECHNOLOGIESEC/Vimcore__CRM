import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface ClaveBridgeModalProps {
  open: boolean;
  bridgeNombre: string;
  claveApi: string;
  onClose: () => void;
}

/**
 * Modal de clave de un solo uso (bridge-lifecycle-management, Requirement:
 * Reinforced Key Confirmation). Se muestra al crear un bridge o al
 * regenerar su clave -- ambos casos comparten esta única exposición en
 * texto plano de `claveApi` (`tipos/bridge.ts::RespuestaClaveBridge`).
 *
 * A diferencia de `ConfirmDialog.tsx` (confirmación explícita genérica),
 * acá el cierre está BLOQUEADO hasta que el admin tilda la casilla de
 * confirmación -- una advertencia pasiva no alcanza (spec): overlay,
 * `Escape` y el botón «X» del `DialogContent` disparan el mismo
 * `onOpenChange` controlado, así que basta con ignorar el intento de cierre
 * en un solo lugar mientras `confirmado` sea `false`.
 */
export function ClaveBridgeModal({ open, bridgeNombre, claveApi, onClose }: ClaveBridgeModalProps) {
  const [confirmado, setConfirmado] = useState(false);
  const [copiado, setCopiado] = useState(false);

  function intentarCerrar(siguienteAbierto: boolean) {
    if (siguienteAbierto) return;
    if (!confirmado) return;
    onClose();
  }

  async function copiarClave() {
    await navigator.clipboard.writeText(claveApi);
    setCopiado(true);
  }

  return (
    <Dialog open={open} onOpenChange={intentarCerrar}>
      <DialogContent
        onInteractOutside={(evento) => {
          if (!confirmado) evento.preventDefault();
        }}
        onEscapeKeyDown={(evento) => {
          if (!confirmado) evento.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Clave de API de {bridgeNombre}</DialogTitle>
          <DialogDescription>
            Esta es la única vez que se muestra la clave completa. Copiala y guardala en un lugar
            seguro: el sistema solo guarda su hash irreversible y no puede volver a mostrarla.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 rounded-md border border-border bg-muted p-2">
          <code className="flex-1 overflow-x-auto text-sm">{claveApi}</code>
          <Button type="button" variant="outline" size="sm" onClick={() => void copiarClave()}>
            {copiado ? (
              <Check className="size-4" aria-hidden="true" />
            ) : (
              <Copy className="size-4" aria-hidden="true" />
            )}
            {copiado ? "Copiada" : "Copiar"}
          </Button>
        </div>

        <div className="flex items-start gap-2">
          <Checkbox
            id="clave-bridge-confirmacion"
            checked={confirmado}
            onCheckedChange={(valor) => setConfirmado(valor === true)}
          />
          <Label htmlFor="clave-bridge-confirmacion" className="text-sm font-normal">
            Ya copié la clave y la guardé en un lugar seguro
          </Label>
        </div>

        <DialogFooter>
          <Button type="button" disabled={!confirmado} onClick={onClose}>
            Entendido, cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
