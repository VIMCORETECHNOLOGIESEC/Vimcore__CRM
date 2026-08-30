import { AlertTriangle } from "lucide-react";
import type { ClienteLead } from "@/tipos/lead";

interface LeadDatosContactoProps {
  cliente: ClienteLead;
}

/**
 * Datos de contacto (F4): teléfono, correos asociados, marca de dato
 * inválido. `telefonoValido` es opcional (F3 no lo declaraba) -- se trata
 * como válido cuando no viene informado, nunca como inválido por default.
 */
export function LeadDatosContacto({ cliente }: LeadDatosContactoProps) {
  const telefonoInvalido = cliente.telefonoValido === false;
  const correos = [cliente.correoPrincipal, ...(cliente.correosSecundarios ?? [])].filter(
    (correo): correo is string => Boolean(correo),
  );

  return (
    <section data-tour="lead-contact-card" className="flex flex-col gap-2 rounded-lg border border-border bg-background p-4">
      <h2 className="text-sm font-semibold text-foreground">Datos de contacto</h2>

      <div data-tour="lead-contact-phone" className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Teléfono:</span>
        <span className="tabular-nums text-foreground">{cliente.telefonoOriginal}</span>
        {telefonoInvalido ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
            <AlertTriangle className="size-2.5" aria-hidden="true" />
            Teléfono inválido
          </span>
        ) : null}
      </div>

      <div data-tour="lead-contact-email-state" className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">Correos:</span>
        {correos.length === 0 ? (
          <span className="text-foreground">Sin correo registrado</span>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {correos.map((correo) => (
              <li key={correo} className="text-foreground">
                {correo}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
