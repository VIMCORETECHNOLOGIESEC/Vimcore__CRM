import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useState } from "react";
import { CalendarDays, CalendarIcon, Clock3 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
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
import type { Cita, ModalidadCita } from "@/tipos/cita";
import {
  citaRescheduleSchema,
  citaScheduleSchema,
  type CitaRescheduleFormValues,
  type CitaScheduleFormValues,
} from "./cita.schemas";
import { useCancelCita, useCitasLead, useMarkCitaResult, useRescheduleCita, useScheduleCita } from "./useLeadDetalle";

const MODALIDAD_ETIQUETAS: Record<ModalidadCita, string> = {
  PRESENCIAL: "Presencial",
  VIRTUAL: "Virtual",
  TELEFONICA: "Telefónica",
};

const ESTADO_CITA_ETIQUETAS: Record<Cita["estado"], string> = {
  AGENDADA: "Agendada",
  CUMPLIDA: "Cumplida",
  NO_ASISTIO: "No asistió",
  REPROGRAMADA: "Reprogramada",
  CANCELADA: "Cancelada",
};

function formatFechaHora(iso: string): string {
  const fecha = new Date(iso);
  const dia = String(fecha.getDate()).padStart(2, "0");
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const horas = String(fecha.getHours()).padStart(2, "0");
  const minutos = String(fecha.getMinutes()).padStart(2, "0");
  return `${dia}/${mes}/${fecha.getFullYear()} ${horas}:${minutos}`;
}

function CitaDateTimeField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const [datePart, timePart] = value.split("T");
  const selectedDate = datePart ? new Date(`${datePart}T12:00:00`) : undefined;

  function setDate(date: Date | undefined) {
    if (!date) return;
    onChange(`${format(date, "yyyy-MM-dd")}T${timePart || "09:00"}`);
  }

  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="text-sm font-medium text-foreground">Fecha y hora</legend>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_7.5rem] gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              id="fecha-cita"
              className="h-10 min-w-0 justify-start gap-2 border-input bg-background px-3 text-left font-normal hover:bg-accent hover:text-accent-foreground"
            >
              <CalendarIcon className="size-4 shrink-0 text-marca-texto" aria-hidden="true" />
              <span className="truncate text-sm">
                {selectedDate ? format(selectedDate, "PPP", { locale: es }) : "Elegí una fecha"}
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
          id="hora-cita"
          aria-label="Hora de la cita"
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
  onReschedule: (citaId: string, programadaPara: string) => void;
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
    defaultValues: { programadaPara: "" },
  });

  const puedeAccionar = cita.estado === "AGENDADA" || cita.estado === "REPROGRAMADA";

  const confirmReschedule = handleRescheduleSubmit((valores) => {
    onReschedule(cita.id, new Date(valores.programadaPara).toISOString());
    setReprogramando(false);
  });

  return (
    <li className="flex flex-col gap-2 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">{formatFechaHora(cita.programadaPara)}</span>
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

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<CitaScheduleFormValues>({
    resolver: zodResolver(citaScheduleSchema),
    defaultValues: { programadaPara: "", modalidad: "VIRTUAL" },
  });

  const onSubmit = handleSubmit((valores) => {
    scheduleCita.mutate(
      {
        usuarioId,
        programadaPara: new Date(valores.programadaPara).toISOString(),
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
            <p className="text-xs text-muted-foreground">Coordiná el próximo contacto con este lead</p>
          </div>
        </div>
        <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
          <Clock3 className="size-3.5" aria-hidden="true" />
          Próxima actividad
        </span>
      </div>

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
            <p className="text-sm text-muted-foreground">Elegí una fecha para registrar el primer encuentro.</p>
          </div>
        </div>
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Citas registradas">
          {citas.map((cita) => (
            <CitaItem
              key={cita.id}
              cita={cita}
              reschedulingId={rescheduleCita.isPending ? rescheduleCita.variables?.citaId ?? null : null}
              onReschedule={(citaId, programadaPara) => rescheduleCita.mutate({ citaId, programadaPara })}
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

        <Button type="submit" disabled={scheduleCita.isPending} className="h-10 w-full">
          {scheduleCita.isPending ? "Agendando…" : "Agendar"}
        </Button>
      </form>
    </section>
  );
}
