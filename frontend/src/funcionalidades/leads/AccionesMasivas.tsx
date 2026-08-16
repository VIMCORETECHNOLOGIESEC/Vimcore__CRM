import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AccionesMasivasProps {
  cantidadSeleccionada: number;
  responsables: { id: string; nombre: string }[];
  onAssign: (responsableId: string) => void;
  assigning: boolean;
}

/**
 * Barra de acción masiva de asignación (docs/07 F3), visible solo para
 * supervisor/administrador -- `LeadsPage` decide cuándo montarla vía
 * `useAuth().hasRole`. La mutación real es mock hasta M6
 * (`leads.api.ts::assignLeadsMasivoApi`); acá solo se arma la intención del
 * usuario (a quién reasignar) y se dispara.
 */
export function AccionesMasivas({
  cantidadSeleccionada,
  responsables,
  onAssign,
  assigning,
}: AccionesMasivasProps) {
  const [responsableId, setResponsableId] = useState<string>("");

  if (cantidadSeleccionada === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/20 bg-accent px-3 py-2">
      <span className="text-sm font-medium text-foreground">
        {cantidadSeleccionada} lead{cantidadSeleccionada === 1 ? "" : "s"} seleccionado
        {cantidadSeleccionada === 1 ? "" : "s"}
      </span>
      <Select value={responsableId} onValueChange={setResponsableId}>
        <SelectTrigger className="w-56" aria-label="Nuevo responsable">
          <SelectValue placeholder="Elegir responsable…" />
        </SelectTrigger>
        <SelectContent>
          {responsables.map((responsable) => (
            <SelectItem key={responsable.id} value={responsable.id}>
              {responsable.nombre}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        disabled={!responsableId || assigning}
        onClick={() => onAssign(responsableId)}
      >
        {assigning ? "Asignando…" : "Asignar"}
      </Button>
    </div>
  );
}
