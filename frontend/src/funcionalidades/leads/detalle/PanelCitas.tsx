import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/componentes/states/EmptyState";
import { LoadingState } from "@/componentes/states/LoadingState";
import type { Cita, ModalidadCita } from "@/tipos/cita";
import { citaRescheduleSchema, citaScheduleSchema, type CitaScheduleFormValues } from "./cita.schemas";
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

interface CitaItemProps {
  cita: Cita;
  onReschedule: (citaId: string, programadaPara: string) => void;
  reschedulingId: string | null;
}

function CitaItem({ cita, onReschedule, reschedulingId }: CitaItemProps) {
  const [reprogramando, setReprogramando] = useState(false);
  const [nuevaFecha, setNuevaFecha] = useState("");
  const [errorFecha, setErrorFecha] = useState<string | null>(null);
  const markResult = useMarkCitaResult(cita.leadId);
  const cancelCita = useCancelCita(cita.leadId);

  const puedeAccionar = cita.estado === "AGENDADA" || cita.estado === "REPROGRAMADA";

  function confirmReschedule() {
    const resultado = citaRescheduleSchema.safeParse({ programadaPara: nuevaFecha });
    if (!resultado.success) {
      setErrorFecha(resultado.error.issues[0]?.message ?? "Fecha inválida");
      return;
    }
    onReschedule(cita.id, new Date(nuevaFecha).toISOString());
    setReprogramando(false);
    setErrorFecha(null);
  }

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
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor={`reprogramar-${cita.id}`}>Nueva fecha y hora</Label>
            <Input
              id={`reprogramar-${cita.id}`}
              type="datetime-local"
              value={nuevaFecha}
              onChange={(e) => setNuevaFecha(e.target.value)}
            />
          </div>
          <Button size="sm" disabled={reschedulingId === cita.id} onClick={confirmReschedule}>
            {reschedulingId === cita.id ? "Guardando…" : "Confirmar"}
          </Button>
          {errorFecha ? <p className="text-sm text-destructive">{errorFecha}</p> : null}
        </div>
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
    defaultValues: { modalidad: "VIRTUAL" },
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
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-background p-4">
      <h2 className="text-sm font-semibold text-foreground">Citas</h2>

      {isLoading ? (
        <LoadingState rows={2} rowHeight="h-16" />
      ) : isError ? (
        <p className="text-sm text-destructive">No se pudieron cargar las citas.</p>
      ) : !citas || citas.length === 0 ? (
        <EmptyState title="Sin citas registradas" description="Agendá la primera cita para este lead." />
      ) : (
        <ul className="flex flex-col gap-2">
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

      <form onSubmit={onSubmit} noValidate className="flex flex-wrap items-end gap-3 border-t border-border pt-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="programadaPara">Agendar cita</Label>
          <Input id="programadaPara" type="datetime-local" {...register("programadaPara")} />
          {errors.programadaPara ? (
            <p className="text-sm text-destructive">{errors.programadaPara.message}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="modalidad">Modalidad</Label>
          <Controller
            control={control}
            name="modalidad"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="modalidad" className="w-40" aria-label="Modalidad">
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

        <div className="flex flex-1 flex-col gap-1">
          <Label htmlFor="notas">Notas (opcional)</Label>
          <Textarea id="notas" rows={1} {...register("notas")} />
        </div>

        <Button type="submit" disabled={scheduleCita.isPending}>
          {scheduleCita.isPending ? "Agendando…" : "Agendar"}
        </Button>
      </form>
    </section>
  );
}
