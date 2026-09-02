import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useState } from "react";
import { CalendarDays, CalendarIcon, Clock3 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { LoadingState } from "@/componentes/states/LoadingState";
import type { Cita } from "@/tipos/cita";
import {
  ESTADO_CITA_ETIQUETAS,
  MODALIDAD_ETIQUETAS,
  ensureFinalizaEn,
  formatFechaHora,
  formatRangoHora,
} from "@/funcionalidades/citas/citas.utils";
import { TUTORIAL_MOCK_LEAD_ID } from "../tutorial/tutorialMockLead";
import {
  citaRescheduleSchema,
  citaScheduleSchema,
  type CitaRescheduleFormValues,
  type CitaScheduleFormValues,
} from "./cita.schemas";
import { useCancelCita, useCitasLead, useMarkCitaResult, useRescheduleCita, useScheduleCita } from "./useLeadDetalle";

function CitaDateTimeField({
  value,
  onChange,
  error,
  label = "Fecha y hora",
  idPrefix = "cita",
  timeAriaLabel = "Hora de la cita",
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  label?: string;
  idPrefix?: string;
  timeAriaLabel?: string;
}) {
  const [datePart, timePart] = value.split("T");
  const selectedDate = datePart ? new Date(`${datePart}T12:00:00`) : undefined;

  function setDate(date: Date | undefined) {
    if (!date) return;
    onChange(`${format(date, "yyyy-MM-dd")}T${timePart || "09:00"}`);
  }

  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="text-sm font-medium text-foreground">{label}</legend>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_7.5rem] gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              id={`${idPrefix}-fecha`}
              className="h-10 min-w-0 justify-start gap-2 border-input bg-background px-3 text-left font-normal hover:bg-accent hover:text-accent-foreground"
            >
              <CalendarIcon className="size-4 shrink-0 text-marca-texto" aria-hidden="true" />
              <span className="truncate text-sm">
                {selectedDate ? format(selectedDate, "PPP", { locale: es }) : "Elige una fecha"}
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setDate}
              disabled={{ before: new Date() }}
            />
          </PopoverContent>
        </Popover>
        <Input
          id={`${idPrefix}-hora`}
          aria-label={timeAriaLabel}
          type="time"
          value={timePart ?? ""}
          onChange={(event) =>
            onChange(`${datePart || format(new Date(), "yyyy-MM-dd")}T${event.target.value}`)
          }
          className="h-10 min-w-0"
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </fieldset>
  );
}

interface CitaItemProps {
  cita: Cita;
  onReschedule: (input: {
    citaId: string;
    programadaPara: string;
    finalizaEn?: string;
    modalidad: Cita["modalidad"];
    notas?: string;
    usuarioId: string;
  }) => void;
  reschedulingId: string | null;
}

function CitaItem({ cita, onReschedule, reschedulingId }: CitaItemProps) {
  const [reprogramando, setReprogramando] = useState(false);
  const markResult = useMarkCitaResult(cita.leadId);
  const cancelCita = useCancelCita(cita.leadId);

  const {
    handleSubmit: handleRescheduleSubmit,
    control: rescheduleControl,
    formState: { errors: rescheduleErrors },
  } = useForm<CitaRescheduleFormValues>({
    resolver: zodResolver(citaRescheduleSchema),
    defaultValues: { programadaPara: "", finalizaEn: "" },
  });

  const puedeAccionar = cita.estado === "AGENDADA" || cita.estado === "REPROGRAMADA";

  const confirmReschedule = handleRescheduleSubmit((valores) => {
    onReschedule({
      citaId: cita.id,
      programadaPara: new Date(valores.programadaPara).toISOString(),
      finalizaEn: ensureFinalizaEn(valores.programadaPara, valores.finalizaEn),
      modalidad: cita.modalidad,
      notas: cita.notas,
      usuarioId: cita.usuarioId,
    });
    setReprogramando(false);
  });

  return (
    <li className="flex flex-col gap-2 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">
          {formatFechaHora(cita.programadaPara)} · {formatRangoHora(cita)}
        </span>
        <span className="rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
          {MODALIDAD_ETIQUETAS[cita.modalidad]} · {ESTADO_CITA_ETIQUETAS[cita.estado]}
        </span>
      </div>
      {cita.notas ? <p className="text-xs text-muted-foreground">{cita.notas}</p> : null}

      {puedeAccionar ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setReprogramando((a) => !a)}>
            Reprogramar
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={markResult.isPending}
            onClick={() => markResult.mutate({ citaId: cita.id, estado: "CUMPLIDA" })}
          >
            Marcar cumplida
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={markResult.isPending}
            onClick={() => markResult.mutate({ citaId: cita.id, estado: "NO_ASISTIO" })}
          >
            No asistió
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={cancelCita.isPending}
            onClick={() => cancelCita.mutate(cita.id)}
          >
            Cancelar
          </Button>
        </div>
      ) : null}

      {reprogramando ? (
        <form onSubmit={confirmReschedule} noValidate className="flex flex-wrap items-end gap-2">
          <div className="min-w-0">
            <Controller
              control={rescheduleControl}
              name="programadaPara"
              render={({ field }) => (
                <CitaDateTimeField
                  value={field.value}
                  onChange={field.onChange}
                  error={rescheduleErrors.programadaPara?.message}
                  idPrefix={`reprogramar-${cita.id}-inicio`}
                />
              )}
            />
          </div>
          <div className="min-w-0">
            <Controller
              control={rescheduleControl}
              name="finalizaEn"
              render={({ field }) => (
                <CitaDateTimeField
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  error={rescheduleErrors.finalizaEn?.message}
                  label="Finaliza"
                  idPrefix={`reprogramar-${cita.id}-fin`}
                  timeAriaLabel="Hora de finalización"
                />
              )}
            />
          </div>
          <Button size="sm" type="submit" disabled={reschedulingId === cita.id}>
            {reschedulingId === cita.id ? "Guardando…" : "Confirmar"}
          </Button>
        </form>
      ) : null}
    </li>
  );
}

interface PanelCitasProps {
  leadId: string;
  usuarioId: string;
}

/**
 * Panel de citas (F4): agendar, reprogramar, marcar resultado, cancelar --
 * backend real (M7), ver `leadDetalle.api.ts`.
 */
export function PanelCitas({ leadId, usuarioId }: PanelCitasProps) {
  const { data: citas, isLoading, isError } = useCitasLead(leadId);
  const scheduleCita = useScheduleCita(leadId);
  const rescheduleCita = useRescheduleCita(leadId);
  const esLeadDemo = leadId === TUTORIAL_MOCK_LEAD_ID;

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<CitaScheduleFormValues>({
    resolver: zodResolver(citaScheduleSchema),
    defaultValues: { programadaPara: "", finalizaEn: "", modalidad: "VIRTUAL" },
  });

  const onSubmit = handleSubmit((valores) => {
    scheduleCita.mutate(
      {
        usuarioId,
        programadaPara: new Date(valores.programadaPara).toISOString(),
        finalizaEn: ensureFinalizaEn(valores.programadaPara, valores.finalizaEn),
        modalidad: valores.modalidad,
        notas: valores.notas,
      },
      { onSuccess: () => reset() },
    );
  });

  return (
    <section className="flex min-w-0 flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-marca-texto/10 text-marca-texto">
            <CalendarDays className="size-5" aria-hidden="true" />
          </span>
          <div className="flex flex-col gap-0.5">
            <h2 className="text-base font-semibold leading-tight text-foreground">Agendar cita</h2>
            <p className="text-xs text-muted-foreground">Coordina el próximo contacto con este lead</p>
          </div>
        </div>
        <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
          <Clock3 className="size-3.5" aria-hidden="true" />
          Próxima actividad
        </span>
      </div>

      {esLeadDemo ? (
        <Alert>
          <AlertDescription>Estás en el tutorial: los cambios no se guardan.</AlertDescription>
        </Alert>
      ) : null}

      {isLoading ? (
        <LoadingState rows={2} rowHeight="h-16" />
      ) : isError ? (
        <p className="text-sm text-destructive">No se pudieron cargar las citas.</p>
      ) : !citas || citas.length === 0 ? (
        <div className="flex items-center gap-3 border-y border-dashed border-border py-4" role="status">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <CalendarDays className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Todavía no hay citas</p>
            <p className="text-sm text-muted-foreground">Elige una fecha para registrar el primer encuentro.</p>
          </div>
        </div>
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Citas registradas">
          {citas.map((cita) => (
            <CitaItem
              key={cita.id}
              cita={cita}
              reschedulingId={rescheduleCita.isPending ? rescheduleCita.variables?.citaId ?? null : null}
              onReschedule={(input) => rescheduleCita.mutate(input)}
            />
          ))}
        </ul>
      )}

      <form onSubmit={onSubmit} noValidate className="grid gap-4 border-t border-border pt-5">
        <div className="min-w-0">
          <Controller
            control={control}
            name="programadaPara"
            render={({ field }) => (
              <CitaDateTimeField
                value={field.value}
                onChange={field.onChange}
                error={errors.programadaPara?.message}
                idPrefix="agendar-cita-inicio"
              />
            )}
          />
        </div>
        <div className="min-w-0">
          <Controller
            control={control}
            name="finalizaEn"
            render={({ field }) => (
              <CitaDateTimeField
                value={field.value ?? ""}
                onChange={field.onChange}
                error={errors.finalizaEn?.message}
                label="Finaliza"
                idPrefix="agendar-cita-fin"
                timeAriaLabel="Hora de finalización"
              />
            )}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="modalidad" className="text-sm font-medium">Modalidad</Label>
          <Controller
            control={control}
            name="modalidad"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="modalidad" className="h-10 w-full" aria-label="Modalidad">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(MODALIDAD_ETIQUETAS).map(([valor, etiqueta]) => (
                    <SelectItem key={valor} value={valor}>
                      {etiqueta}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="notas" className="text-sm font-medium">Notas (opcional)</Label>
          <Textarea
            id="notas"
            rows={2}
            className="min-h-20 resize-none"
            placeholder="Ej: confirmar documentación"
            {...register("notas")}
          />
        </div>

        <Button type="submit" disabled={scheduleCita.isPending || esLeadDemo} className="h-10 w-full">
          {scheduleCita.isPending ? "Agendando…" : "Agendar"}
        </Button>
      </form>
    </section>
  );
}
