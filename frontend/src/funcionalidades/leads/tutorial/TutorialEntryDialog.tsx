import { useRef, useState } from "react";
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

interface TutorialEntryDialogProps {
  open: boolean;
  /** Arranca el tour (con el lead de ejemplo -- ver `tutorialMockLead.ts`). */
  onIniciar: () => void;
  /**
   * Cierra el modal. `noMostrarDeNuevo` solo es `true` cuando el usuario hizo
   * click explícito en "Iniciar recorrido" o "Ahora no" con el checkbox
   * tildado -- Escape/click afuera del `Dialog` siempre llaman con `false`
   * (ver `onOpenChange` abajo), para que el modal vuelva a aparecer en la
   * próxima visita a /leads.
   */
  onCerrar: (noMostrarDeNuevo: boolean) => void;
}

/**
 * Modal de entrada del tutorial guiado de Leads (F3): reemplaza el
 * auto-inicio silencioso legado (`LeadsPage.tsx`/`useLeadsNavigationTutorial`)
 * -- aparece en cada visita a /leads hasta que el usuario tilda "No volver a
 * mostrar este aviso" (persistencia en `useTutorialEntryModal.ts`).
 */
export function TutorialEntryDialog({ open, onIniciar, onCerrar }: TutorialEntryDialogProps) {
  const [noMostrar, setNoMostrar] = useState(false);
  const iniciarButtonRef = useRef<HTMLButtonElement>(null);

  function iniciar() {
    onIniciar();
    onCerrar(noMostrar);
  }

  function cerrarSinIniciar() {
    onCerrar(noMostrar);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(abierto) => {
        if (!abierto) onCerrar(false);
      }}
    >
      <DialogContent
        onOpenAutoFocus={(event) => {
          // El primer elemento enfocable en el DOM es el checkbox (ver el
          // orden de children abajo) -- el foco por defecto de Radix caería
          // ahí. Se fuerza al botón primario "Iniciar recorrido" en su lugar.
          event.preventDefault();
          iniciarButtonRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>¿Quieres un recorrido rápido por Leads?</DialogTitle>
          <DialogDescription>
            Te mostramos cómo revisar un lead, avanzarlo de etapa y cerrar una venta, con un lead
            de ejemplo — no vas a tocar datos reales.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Checkbox
            id="tutorial-entry-no-mostrar"
            checked={noMostrar}
            onCheckedChange={(marcado) => setNoMostrar(marcado === true)}
          />
          <Label htmlFor="tutorial-entry-no-mostrar">No volver a mostrar este aviso</Label>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={cerrarSinIniciar}>
            Ahora no
          </Button>
          <Button type="button" ref={iniciarButtonRef} onClick={iniciar}>
            Iniciar recorrido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
