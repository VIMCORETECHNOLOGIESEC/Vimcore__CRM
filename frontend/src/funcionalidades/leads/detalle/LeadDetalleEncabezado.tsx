import type { Lead } from "@/tipos/lead";
import { ETAPA_ETIQUETAS } from "../catalogos";
import { getResponsable } from "../leads.utils";
import { SemaforoBadge } from "../SemaforoBadge";
import { SlaCountdownCell } from "../SlaCountdownCell";

interface LeadDetalleEncabezadoProps {
  lead: Lead;
}

/**
 * Encabezado del detalle (F4): nombre, semáforo, etapa, responsable,
 * contador de SLA. Reutiliza `SemaforoBadge`/`SlaCountdownCell` de F3 en vez
 * de duplicar el formato.
 */
export function LeadDetalleEncabezado({ lead }: LeadDetalleEncabezadoProps) {
  const responsable = getResponsable(lead);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold text-foreground">{lead.cliente.nombre}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <SemaforoBadge semaforo={lead.semaforo} />
          <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
            {ETAPA_ETIQUETAS[lead.etapa]}
          </span>
          <span className="text-xs text-muted-foreground">
            Puntuación: <span className="font-medium text-foreground">{lead.puntuacion}</span>
          </span>
        </div>
      </div>
      <div className="flex flex-col items-start gap-1 text-sm sm:items-end">
        <span className="text-muted-foreground">
          Responsable:{" "}
          <span className="font-medium text-foreground">{responsable?.nombre ?? "Sin asignar"}</span>
        </span>
        <SlaCountdownCell slaInicioEn={lead.slaInicioEn} cerradoEn={lead.cerradoEn} />
      </div>
    </div>
  );
}
