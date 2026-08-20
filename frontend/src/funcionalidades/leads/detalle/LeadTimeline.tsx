import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Lead } from "@/tipos/lead";
import { ETAPAS_LINEALES, ETAPAS_TERMINALES, ETAPA_TIMELINE_ETIQUETAS, getTransicionesValidas } from "../etapas";
import { CierreNoVentaForm } from "./CierreNoVentaForm";
import { CierreVentaForm } from "./CierreVentaForm";
import { isEtapaCalificable } from "./formulariosEtapa";
import { FormularioEtapaLead } from "./FormularioEtapaLead";

type EstadoNodo = "completado" | "actual" | "pendiente" | "final";

function formatFecha(iso: string): string {
  const fecha = new Date(iso);
  const dia = String(fecha.getDate()).padStart(2, "0");
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const horas = String(fecha.getHours()).padStart(2, "0");
  const minutos = String(fecha.getMinutes()).padStart(2, "0");
  return `${dia}/${mes}/${fecha.getFullYear()} ${horas}:${minutos}`;
}

const CLASES_PUNTO: Record<EstadoNodo, string> = {
  completado: "border-primary bg-primary",
  final: "border-primary bg-primary",
  actual: "border-primary bg-background ring-4 ring-primary/10",
  pendiente: "border-muted-foreground/30 bg-background",
};

const CLASES_ETIQUETA: Record<EstadoNodo, string> = {
  completado: "text-muted-foreground line-through decoration-1",
  final: "text-foreground font-semibold",
  actual: "text-foreground font-semibold",
  pendiente: "text-muted-foreground/70",
};

interface LeadTimelineProps {
  lead: Lead;
}

/**
 * Línea de tiempo del progreso del lead (F4, docs/02-reglas-negocio.md §6):
 * reemplaza al `<Select>` libre de 5 etapas -- ahora solo se puede avanzar
 * linealmente `NUEVO → CONTACTADO → CITA`, nunca retroceder, con salto
 * directo a cierre (VENTA/NO_VENTA) desde cualquier etapa no terminal vía la
 * barra de acción persistente de abajo. Terminal no se reabre. El destino del
 * formulario de la etapa actual lo calcula el propio timeline
 * (`getTransicionesValidas`), no lo elige el usuario.
 *
 * INTEGRACION-BACKEND: no hay historial de transición por etapa en el mock
 * (`leadDetalle.api.ts` no expone `lead_eventos`, docs/03 §`lead_eventos`) --
 * los nodos completados que no son "Nuevo" no muestran fecha porque no
 * existe ese dato todavía. Cuando `GET /api/v1/leads/:id` (M5) incluya el
 * historial de eventos, reemplazar por la fecha real de cada transición.
 */
export function LeadTimeline({ lead }: LeadTimelineProps) {
  const [cierreAbierto, setCierreAbierto] = useState<"VENTA" | "NO_VENTA" | null>(null);
  const esTerminal = ETAPAS_TERMINALES.includes(lead.etapa);
  const indiceActual = ETAPAS_LINEALES.indexOf(lead.etapa);

  const etapaObjetivo = !esTerminal
    ? (getTransicionesValidas(lead.etapa).find(isEtapaCalificable) ?? null)
    : null;

  function getEstadoNodo(indice: number): EstadoNodo {
    if (esTerminal || indice < indiceActual) return "completado";
    if (indice === indiceActual) return "actual";
    return "pendiente";
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-1 rounded-lg border border-border bg-background p-4">
        <h2 className="mb-2 text-sm font-semibold text-foreground">Progreso del lead</h2>

        <ol className="flex flex-col">
          {ETAPAS_LINEALES.map((etapa, indice) => {
            const estado = getEstadoNodo(indice);
            const esUltimoNodo = indice === ETAPAS_LINEALES.length - 1 && !esTerminal;

            return (
              <li key={etapa} className="relative flex gap-3 pb-6 last:pb-0">
                {!esUltimoNodo ? (
                  <span
                    className="absolute left-[5px] top-3 h-full w-px bg-border"
                    aria-hidden="true"
                  />
                ) : null}
                <span
                  className={`relative z-10 mt-1 size-3 shrink-0 rounded-full border-2 ${CLASES_PUNTO[estado]}`}
                  aria-hidden="true"
                />
                <div className="flex flex-1 flex-col gap-1">
                  <span className={`text-sm ${CLASES_ETIQUETA[estado]}`}>
                    {ETAPA_TIMELINE_ETIQUETAS[etapa]}
                  </span>

                  {estado === "completado" ? (
                    <span className="text-xs text-muted-foreground">
                      {etapa === "NUEVO" ? formatFecha(lead.ingresadoEn) : "Fecha no disponible"}
                    </span>
                  ) : null}

                  {estado === "actual" && etapaObjetivo && isEtapaCalificable(lead.etapa) ? (
                    <div className="mt-2">
                      <FormularioEtapaLead
                        leadId={lead.id}
                        etapaActual={lead.etapa}
                        etapaDestino={etapaObjetivo}
                      />
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}

          {esTerminal ? (
            <li className="relative flex gap-3">
              <span
                className="relative z-10 mt-1 size-3 shrink-0 rounded-full border-2 border-primary bg-primary"
                aria-hidden="true"
              />
              <div className="flex flex-1 flex-col gap-1">
                <span className="text-sm font-semibold text-foreground">
                  {ETAPA_TIMELINE_ETIQUETAS[lead.etapa]}
                </span>
                <span className="text-xs text-muted-foreground">
                  {lead.cerradoEn ? formatFecha(lead.cerradoEn) : "—"}
                </span>
              </div>
            </li>
          ) : null}
        </ol>
      </section>

      {!esTerminal ? (
        <section className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background p-4">
          <span className="mr-1 text-sm font-medium text-foreground">Cerrar lead</span>
          <Button
            size="sm"
            variant={cierreAbierto === "VENTA" ? "secondary" : "success"}
            onClick={() => setCierreAbierto((actual) => (actual === "VENTA" ? null : "VENTA"))}
          >
            Cerrar como venta
          </Button>
          <Button
            size="sm"
            variant={cierreAbierto === "NO_VENTA" ? "secondary" : "destructive"}
            onClick={() => setCierreAbierto((actual) => (actual === "NO_VENTA" ? null : "NO_VENTA"))}
          >
            Cerrar como no venta
          </Button>
        </section>
      ) : null}

      {cierreAbierto === "VENTA" ? <CierreVentaForm leadId={lead.id} /> : null}
      {cierreAbierto === "NO_VENTA" ? <CierreNoVentaForm leadId={lead.id} /> : null}
    </div>
  );
}
