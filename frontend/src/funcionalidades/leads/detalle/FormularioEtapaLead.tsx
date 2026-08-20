import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/componentes/states/LoadingState";
import type { EtapaCalificable, FormularioEtapa } from "@/tipos/formulario";
import { ETAPA_ETIQUETAS } from "../catalogos";
import { SemaforoBadge } from "../SemaforoBadge";
import { calculatePuntuacion, calculateSemaforo, GUIA_ACCION_SEMAFORO } from "./puntuacion";
import { useFormularioEtapa, useSubmitFormularioEtapa } from "./useLeadDetalle";

/**
 * Esquema Zod dinámico: las preguntas vienen del backend (`formulario.preguntas`,
 * variables por etapa), no son fijas en compile-time. Cada campo es requerido
 * (mismo criterio que antes exigía `todasRespondidas` para habilitar el botón).
 */
function buildEsquemaFormulario(formulario: FormularioEtapa) {
  const forma: Record<string, z.ZodString> = {};
  for (const pregunta of formulario.preguntas) {
    forma[pregunta.clave] = z.string().min(1, "Elegí una opción");
  }
  return z.object(forma);
}

type ValoresFormulario = Record<string, string>;

interface FormularioEtapaLeadProps {
  leadId: string;
  /**
   * Etapa VIGENTE del lead: determina qué formulario se pide y con qué
   * rúbrica lo puntúa el backend (`formularios.service.ts::applyFormulario`
   * usa `lead.etapa`, la etapa actual guardada, no la etapa destino).
   */
  etapaActual: EtapaCalificable;
  /**
   * Etapa a la que se transiciona al enviar el formulario (calculada por
   * `LeadTimeline.tsx` vía `getTransicionesValidas`) -- distinta de
   * `etapaActual`: se manda en el PATCH pero NO decide qué preguntas se
   * muestran ni contra qué rúbrica se puntúan.
   */
  etapaDestino: EtapaCalificable;
}

/**
 * Formulario dinámico de la etapa vigente (F4): renderiza las preguntas y
 * opciones de `FormularioEtapa` de `etapaActual`, muestra la puntuación
 * previsualizada en cliente antes de enviar (ver `puntuacion.ts` -- el valor
 * real que persiste lo calcula el backend) y la guía de acción según el
 * color resultante. "Cambiar de etapa" en F4 ES enviar este formulario
 * (docs/02 §6, "sin formulario no hay transición") -- no hay un botón de
 * "guardar etapa" separado.
 */
export function FormularioEtapaLead({ leadId, etapaActual, etapaDestino }: FormularioEtapaLeadProps) {
  const { data: formulario, isLoading, isError } = useFormularioEtapa(etapaActual);
  const submitFormulario = useSubmitFormularioEtapa(leadId);

  // El esquema es dinámico (depende de las preguntas de `formulario`, que
  // llegan del backend). Mientras `formulario` no cargó todavía, se usa un
  // esquema vacío -- el `useForm` no puede depender de un hook condicional.
  const esquema = useMemo(
    () => buildEsquemaFormulario(formulario ?? { etapa: etapaActual, preguntas: [] }),
    [formulario, etapaActual],
  );

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { isValid },
  } = useForm<ValoresFormulario>({
    resolver: zodResolver(esquema),
    mode: "onChange",
    defaultValues: {},
  });

  useEffect(() => {
    reset({});
  }, [etapaActual, reset]);

  if (isLoading) return <LoadingState rows={3} rowHeight="h-10" />;
  if (isError || !formulario) {
    return <p className="text-sm text-destructive">No se pudo cargar el formulario de esta etapa.</p>;
  }

  const respuestas = watch();
  const puntuacionPreview = calculatePuntuacion(formulario, respuestas);
  const semaforoPreview = calculateSemaforo(puntuacionPreview);

  function onSubmit(valores: ValoresFormulario) {
    submitFormulario.mutate({ etapa: etapaDestino, respuestas: valores });
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-background p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">
          Formulario — {ETAPA_ETIQUETAS[etapaActual]}
        </h2>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            Previsualización: <span className="font-medium text-foreground">{puntuacionPreview}</span>
          </span>
          <SemaforoBadge semaforo={semaforoPreview} />
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
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
                      value={opcion.valor}
                      {...register(pregunta.clave)}
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

        <Button type="submit" disabled={!isValid || submitFormulario.isPending} className="w-fit">
          {submitFormulario.isPending ? "Guardando…" : `Guardar y pasar a ${ETAPA_ETIQUETAS[etapaDestino]}`}
        </Button>
      </form>
    </section>
  );
}
