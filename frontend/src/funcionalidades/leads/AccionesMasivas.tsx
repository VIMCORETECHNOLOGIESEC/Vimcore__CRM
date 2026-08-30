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
    // Es una superficie independiente de la tabla: `LeadsPage` la monta por
    // encima del panel desplazable para que nunca invada filas ni paginación.
    <div className="bulk-actions-bar shrink-0 px-4">
      <div className="bulk-actions-content mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-3 rounded-2xl border border-border bg-white px-4 py-3 shadow-xl">
        <span className="text-sm font-semibold text-foreground" aria-live="polite">
          {cantidadSeleccionada} lead{cantidadSeleccionada === 1 ? "" : "s"} seleccionado
          {cantidadSeleccionada === 1 ? "" : "s"}
        </span>
        <Select value={responsableId} onValueChange={setResponsableId}>
          <SelectTrigger className="h-10 w-56 rounded-2xl" aria-label="Nuevo responsable">
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
          className="h-10 rounded-2xl px-6"
          disabled={!responsableId || assigning}
          onClick={() => onAssign(responsableId)}
        >
          {assigning ? "Asignando…" : "Asignar"}
        </Button>
      </div>
    </div>
  );
}
