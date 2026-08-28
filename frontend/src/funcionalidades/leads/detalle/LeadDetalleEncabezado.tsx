import type { Lead } from "@/tipos/lead";
import { UserRound } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ETAPA_ETIQUETAS } from "../catalogos";
import { getResponsable } from "../leads.utils";
import { SemaforoBadge } from "../SemaforoBadge";
import { SlaCountdownCell } from "../SlaCountdownCell";

interface LeadDetalleEncabezadoProps {
  lead: Lead;
  sinBorde?: boolean;
  mostrarEtapa?: boolean;
}

function getInitials(nombre: string): string {
  return nombre.trim().charAt(0).toUpperCase();
}

/**
 * Encabezado del detalle (F4): nombre, semáforo, etapa, responsable,
 * contador de SLA. Reutiliza `SemaforoBadge`/`SlaCountdownCell` de F3 en vez
 * de duplicar el formato.
 *
 * `sinBorde` se usa dentro de la tarjeta flotante de la navbar del chat
 * (LeadDetallePage): en ese modo el componente no pinta fondo propio ni
 * borde, para que se vea el `bg-card` del contenedor elevado.
 */
export function LeadDetalleEncabezado({
  lead,
  sinBorde = false,
  mostrarEtapa = true,
}: LeadDetalleEncabezadoProps) {
  const responsable = getResponsable(lead);

  return (
    <div
      className={`flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5 ${
        sinBorde ? "" : "rounded-lg border border-border bg-background"
      }`}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
        <Avatar className="size-8" aria-hidden="true">
          <AvatarFallback className="bg-idec text-xs font-semibold text-idec-foreground">
            {getInitials(lead.cliente.nombre)}
          </AvatarFallback>
        </Avatar>
        <span className="min-w-0 truncate text-sm font-semibold text-foreground sm:text-base">
          {lead.cliente.nombre}
        </span>
        {mostrarEtapa ? (
          <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
            {ETAPA_ETIQUETAS[lead.etapa]}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm sm:justify-end">
        <SemaforoBadge semaforo={lead.semaforo} />
        <SlaCountdownCell
          slaInicioEn={lead.slaInicioEn}
          cerradoEn={lead.cerradoEn}
          className="rounded-full bg-secondary px-2.5 py-1 font-medium"
        />
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-full bg-secondary text-muted-foreground" aria-hidden="true">
            <UserRound className="size-3.5" />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Responsable</span>
            <span className="font-semibold text-foreground">{responsable?.nombre ?? "Sin asignar"}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
