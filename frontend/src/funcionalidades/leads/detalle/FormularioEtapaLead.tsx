import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/componentes/states/LoadingState";
import type { EtapaCalificable, RespuestasFormulario } from "@/tipos/formulario";
import { ETAPA_ETIQUETAS } from "../catalogos";
import { SemaforoBadge } from "../SemaforoBadge";
import { calculatePuntuacion, calculateSemaforo, GUIA_ACCION_SEMAFORO } from "./puntuacion";
import { useFormularioEtapa, useSubmitFormularioEtapa } from "./useLeadDetalle";

interface FormularioEtapaLeadProps {
  leadId: string;
  etapa: EtapaCalificable;
}

/**
 * Formulario dinámico de la etapa vigente/destino (F4): renderiza las
 * preguntas y opciones de `FormularioEtapa`, muestra la puntuación
 * previsualizada en cliente antes de enviar (ver `puntuacion.ts` -- el valor
 * real que persiste lo calcularía el backend cuando exista M7) y la guía de
 * acción según el color resultante. "Cambiar de etapa" en F4 ES enviar este
 * formulario (docs/02 §6, "sin formulario no hay transición") -- no hay un
 * botón de "guardar etapa" separado.
 */
export function FormularioEtapaLead({ leadId, etapa }: FormularioEtapaLeadProps) {
  const { data: formulario, isLoading, isError } = useFormularioEtapa(etapa);
  const [respuestas, setRespuestas] = useState<RespuestasFormulario>({});
  const submitFormulario = useSubmitFormularioEtapa(leadId);

  useEffect(() => {
    setRespuestas({});
  }, [etapa]);

  if (isLoading) return <LoadingState rows={3} rowHeight="h-10" />;
  if (isError || !formulario) {
    return <p className="text-sm text-destructive">No se pudo cargar el formulario de esta etapa.</p>;
  }

  const puntuacionPreview = calculatePuntuacion(formulario, respuestas);
  const semaforoPreview = calculateSemaforo(puntuacionPreview);
  const todasRespondidas = formulario.preguntas.every((p) => respuestas[p.clave]);

  function selectOption(clave: string, valor: string) {
    setRespuestas((actual) => ({ ...actual, [clave]: valor }));
  }

  function submit() {
    submitFormulario.mutate({ etapa, respuestas });
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-background p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">
          Formulario — {ETAPA_ETIQUETAS[etapa]}
        </h2>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            Previsualización: <span className="font-medium text-foreground">{puntuacionPreview}</span>
          </span>
          <SemaforoBadge semaforo={semaforoPreview} />
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {formulario.preguntas.map((pregunta) => (
          <fieldset key={pregunta.clave} className="flex flex-col gap-1.5">
            <legend className="text-sm text-foreground">{pregunta.etiqueta}</legend>
            <div className="flex flex-wrap gap-3">
              {pregunta.opciones.map((opcion) => (
                <label
                  key={opcion.valor}
                  className="flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground"
                >
                  <input
                    type="radio"
                    name={`${etapa}-${pregunta.clave}`}
                    value={opcion.valor}
                    checked={respuestas[pregunta.clave] === opcion.valor}
                    onChange={() => selectOption(pregunta.clave, opcion.valor)}
                    className="size-3.5"
                  />
                  {opcion.etiqueta}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>

      <div className="rounded-md bg-secondary px-3 py-2 text-xs text-secondary-foreground">
        {GUIA_ACCION_SEMAFORO[semaforoPreview]}
      </div>

      <Button
        onClick={submit}
        disabled={!todasRespondidas || submitFormulario.isPending}
        className="w-fit"
      >
        {submitFormulario.isPending ? "Guardando…" : `Guardar y pasar a ${ETAPA_ETIQUETAS[etapa]}`}
      </Button>
    </section>
  );
}
