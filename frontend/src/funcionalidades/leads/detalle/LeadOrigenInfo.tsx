import type { Lead } from "@/tipos/lead";
import { RED_SOCIAL_ETIQUETAS } from "../catalogos";

function formatFecha(iso: string): string {
  const fecha = new Date(iso);
  const dia = String(fecha.getDate()).padStart(2, "0");
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const horas = String(fecha.getHours()).padStart(2, "0");
  const minutos = String(fecha.getMinutes()).padStart(2, "0");
  return `${dia}/${mes}/${fecha.getFullYear()} ${horas}:${minutos}`;
}

interface LeadOrigenInfoProps {
  lead: Lead;
}

/**
 * Origen del lead (F4): red social, campaña, cuenta publicitaria, fecha de
 * ingreso, y los campos dinámicos del formulario de la campaña (JSON crudo
 * sin schema fijo, docs/07 F4 -- se renderiza como lista de pares
 * etiqueta/valor, sin tipado fuerte por diseño).
 */
export function LeadOrigenInfo({ lead }: LeadOrigenInfoProps) {
  const camposDinamicos = Object.entries(lead.camposDinamicos ?? {});

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-border bg-background p-4">
      <h2 className="text-sm font-semibold text-foreground">Origen</h2>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Red social</dt>
        <dd className="text-foreground">{RED_SOCIAL_ETIQUETAS[lead.redSocial]}</dd>

        <dt className="text-muted-foreground">Campaña</dt>
        <dd className="text-foreground">{lead.campania?.nombre ?? "—"}</dd>

        <dt className="text-muted-foreground">Cuenta publicitaria</dt>
        <dd className="text-foreground">{lead.cuentaPublicitaria?.nombre ?? "—"}</dd>

        <dt className="text-muted-foreground">Fecha de ingreso</dt>
        <dd className="text-foreground">{formatFecha(lead.ingresadoEn)}</dd>
      </dl>

      {camposDinamicos.length > 0 ? (
        <div className="mt-2 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">
            Campos adicionales de la campaña
          </span>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {camposDinamicos.map(([etiqueta, valor]) => (
              <div key={etiqueta} className="contents">
                <dt className="text-muted-foreground">{etiqueta}</dt>
                <dd className="text-foreground">{valor}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </section>
  );
}
