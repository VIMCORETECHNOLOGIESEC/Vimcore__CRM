import { Check } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Lead } from "@/tipos/lead";
import {
  ETAPAS_LINEALES,
  ETAPAS_TERMINALES,
  ETAPA_TIMELINE_ETIQUETAS,
  getTransicionesValidas,
} from "../etapas";
import { CierreNoVentaForm } from "./CierreNoVentaForm";
import { CierreVentaForm } from "./CierreVentaForm";
import { isEtapaCalificable } from "./formulariosEtapa";
import { FormularioEtapaLead } from "./FormularioEtapaLead";

type EstadoNodo = "completado" | "actual" | "pendiente" | "final";

function formatFecha(iso: string): string {
  const fecha = new Date(iso);
  const dia = String(fecha.getDate()).padStart(2, "0");
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}/${fecha.getFullYear()}`;
}

const CLASES_PUNTO: Record<EstadoNodo, string> = {
  completado: "border-primary bg-primary text-primary-foreground",
  final: "border-primary bg-primary text-primary-foreground",
  actual: "border-gray-600 bg-background text-foreground",
  pendiente: "border-muted-foreground/30 bg-background text-muted-foreground",
};

const CLASES_ETIQUETA: Record<EstadoNodo, string> = {
  completado: "text-muted-foreground",
  final: "text-foreground font-semibold",
  actual: "text-foreground font-semibold",
  pendiente: "text-muted-foreground/70",
};

interface LeadTimelineProps {
  lead: Lead;
  mostrarCierre?: boolean;
  puntuacionActual?: number | null;
  onPuntuacionChange?: (puntuacion: number) => void;
}

/**
 * Línea de tiempo horizontal del progreso del lead (F4, docs/02-reglas-negocio.md §6):
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
export function LeadTimeline({
  lead,
  mostrarCierre = true,
  puntuacionActual,
  onPuntuacionChange,
}: LeadTimelineProps) {
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
    <div className="relative flex flex-col gap-4">
      <section className="flex flex-col gap-1 bg-transparent p-0">
        <div className="relative pb-1">
          <svg
            className="pointer-events-none absolute inset-x-0 top-0 h-10 w-full"
            viewBox="0 0 300 40"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <line
              x1="50"
              y1="20"
              x2="150"
              y2="20"
              className={indiceActual > 0 || esTerminal ? "text-primary" : "text-border"}
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <line
              x1="150"
              y1="20"
              x2="250"
              y2="20"
              className={indiceActual > 1 || esTerminal ? "text-primary" : "text-border"}
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </svg>
          <ol className="relative grid grid-cols-3">
            {ETAPAS_LINEALES.map((etapa, indice) => {
              const estado = getEstadoNodo(indice);

              return (
                <li
                  key={etapa}
                  className="flex min-w-0 flex-col items-center gap-2 px-1 text-center"
                >
                  <span
                    className={`relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full border-2 bg-background text-sm font-semibold ${CLASES_PUNTO[estado]}`}
                  >
                    {estado === "completado" ? <Check className="size-5" aria-label="Completado" /> : indice + 1}
                  </span>
                  {estado !== "completado" ? (
                    <div className="flex flex-col items-center gap-1">
                      {estado === "actual" && (etapa === "NUEVO" || etapa === "CONTACTADO") ? (
                        <span className="text-xs font-semibold tabular-nums text-idec">
                          Puntuación {puntuacionActual ?? lead.puntuacion ?? "—"}
                        </span>
                      ) : null}
                      <span className={`max-w-full break-words text-sm ${CLASES_ETIQUETA[estado]}`}>
                        {ETAPA_TIMELINE_ETIQUETAS[etapa]}
                      </span>
                    </div>
                  ) : null}
                  {estado === "completado" ? (
                    <div className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
                      {etapa === "NUEVO" ? (
                        <span className="font-medium text-foreground">
                          Puntuación: {lead.puntuacion ?? "Sin calificar"}
                        </span>
                      ) : null}
                      <span>{etapa === "NUEVO" ? formatFecha(lead.ingresadoEn) : "Fecha no disponible"}</span>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>

        {esTerminal ? (
          <div className="mt-5 flex items-center gap-3 border-t border-border pt-4">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-primary bg-primary text-sm font-semibold text-primary-foreground">
              ✓
            </span>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-foreground">
                {ETAPA_TIMELINE_ETIQUETAS[lead.etapa]}
              </span>
              <span className="text-xs text-muted-foreground">
                {lead.cerradoEn ? formatFecha(lead.cerradoEn) : "—"}
              </span>
            </div>
          </div>
        ) : null}

        {etapaObjetivo && isEtapaCalificable(lead.etapa) ? (
          <div className="mt-5 pt-0">
            <FormularioEtapaLead
              leadId={lead.id}
              etapaActual={lead.etapa}
              etapaDestino={etapaObjetivo}
              onPuntuacionChange={onPuntuacionChange}
            />
          </div>
        ) : null}
      </section>

      {!esTerminal && mostrarCierre ? (
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
            onClick={() =>
              setCierreAbierto((actual) => (actual === "NO_VENTA" ? null : "NO_VENTA"))
            }
          >
            Cerrar como no venta
          </Button>
        </section>
      ) : null}

      {mostrarCierre && cierreAbierto === "VENTA" ? <CierreVentaForm leadId={lead.id} /> : null}
      {mostrarCierre && cierreAbierto === "NO_VENTA" ? (
        <CierreNoVentaForm leadId={lead.id} />
      ) : null}
    </div>
  );
}
