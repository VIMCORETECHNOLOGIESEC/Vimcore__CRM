import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/componentes/states/LoadingState";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { EtapaCalificable, FormularioEtapa } from "@/tipos/formulario";
import { ETAPA_ETIQUETAS } from "../catalogos";
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
    forma[pregunta.clave] = z.string().min(1, "Elige una opción");
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
  onPuntuacionChange?: (puntuacion: number) => void;
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
export function FormularioEtapaLead({
  leadId,
  etapaActual,
  etapaDestino,
  onPuntuacionChange,
}: FormularioEtapaLeadProps) {
  const { data: formulario, isLoading, isError } = useFormularioEtapa(etapaActual);
  const submitFormulario = useSubmitFormularioEtapa(leadId);
  const [infoAbierta, setInfoAbierta] = useState(false);

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

  const respuestas = watch();
  const puntuacion = calculatePuntuacion(
    formulario ?? { etapa: etapaActual, preguntas: [] },
    respuestas,
  );
  const semaforo = calculateSemaforo(puntuacion);

  useEffect(() => {
    onPuntuacionChange?.(puntuacion);
  }, [onPuntuacionChange, puntuacion]);

  if (isLoading) return <LoadingState rows={3} rowHeight="h-10" />;
  if (isError || !formulario) {
    return (
      <p className="text-sm text-destructive">No se pudo cargar el formulario de esta etapa.</p>
    );
  }

  const formularioCompleto = formulario.preguntas.every((pregunta) => Boolean(respuestas[pregunta.clave]));

  function onSubmit(valores: ValoresFormulario) {
    submitFormulario.mutate({ etapa: etapaDestino, respuestas: valores });
  }

  return (
    <section className="flex flex-col gap-4 bg-transparent p-0">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <Popover open={infoAbierta} onOpenChange={setInfoAbierta}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Ver guía de acción"
              className="absolute -right-2 -top-2 flex size-8 cursor-pointer items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Info className="size-4" aria-hidden="true" />
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" align="end" className="w-80 text-sm leading-relaxed">
            {GUIA_ACCION_SEMAFORO[semaforo]}
          </PopoverContent>
        </Popover>

        <div className="flex flex-col gap-4">
          {formulario.preguntas.map((pregunta) => (
            <fieldset key={pregunta.clave} className="flex flex-col gap-1.5">
              <legend className="text-sm text-foreground">{pregunta.etiqueta}</legend>
              <div className="flex flex-wrap gap-3">
                {pregunta.opciones.map((opcion) => (
                  <label
                    key={opcion.valor}
                    className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground transition-colors has-[:checked]:text-foreground"
                  >
                    <input
                      type="radio"
                      value={opcion.valor}
                      {...register(pregunta.clave)}
                      className="size-4 shrink-0 cursor-pointer appearance-none rounded-full border-2 border-muted-foreground/50 bg-background transition-[border-color,border-width] checked:border-[5px] checked:border-primary focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    {opcion.etiqueta}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>

        <Button type="submit" disabled={!isValid || !formularioCompleto || submitFormulario.isPending} className="w-fit">
          {submitFormulario.isPending
            ? "Guardando…"
            : `Guardar y pasar a ${ETAPA_ETIQUETAS[etapaDestino]}`}
        </Button>
      </form>
    </section>
  );
}
