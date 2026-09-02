import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Phone, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Link } from "react-router";
import { z } from "zod";
import { getErrorMessage } from "@/api/httpClient";
import { EmptyState } from "@/componentes/states/EmptyState";
import { ErrorState } from "@/componentes/states/ErrorState";
import { LoadingState } from "@/componentes/states/LoadingState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/funcionalidades/autenticacion/auth-context";
import { useVistaEmpresa } from "@/funcionalidades/empresa-apariencia/useVistaEmpresa";
import { getCatalogoResponsables } from "@/funcionalidades/leads/leads.api";
import { ResponsableCombobox } from "@/funcionalidades/leads/ResponsableCombobox";
import { useLeads } from "@/funcionalidades/leads/useLeads";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { usePageHeader } from "@/layouts/PageHeaderContext";
import { cn } from "@/lib/utils";
import type { ModalidadCita } from "@/tipos/cita";
import type { Lead } from "@/tipos/lead";
import type { RolUsuario } from "@/tipos/usuario";
import type { CitaCalendario } from "./citas.api";
import {
  CITAS_VISTA_ETIQUETAS,
  ESTADO_CITA_ETIQUETAS,
  MODALIDAD_ETIQUETAS,
  avanzarFecha,
  buildMonthDays,
  buildVisibleRange,
  endOfWeek,
  formatFechaHora,
  formatRangoHora,
  hasDuracionMinima,
  isSameLocalDay,
  isSameLocalMonth,
  ordenarCitasPorInicio,
  startOfWeek,
  toDatetimeLocalValue,
  type VistaCalendarioCitas,
} from "./citas.utils";
import {
  useCancelCitaCalendario,
  useCitas,
  useMarkCitaResultCalendario,
  useRescheduleCitaCalendario,
  useScheduleCitaCalendario,
} from "./useCitas";

const ASESOR_TODOS = "TODOS";
const ASESOR_SIN_SELECCION = "SIN_SELECCION";
const VISTAS_CALENDARIO: VistaCalendarioCitas[] = ["mes", "semana", "dia"];
const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const citaFormSchema = z
  .object({
    leadId: z.string().min(1, "Selecciona un lead existente"),
    programadaPara: z
      .string()
      .min(1, "La fecha y hora son obligatorias")
      .refine((valor) => new Date(valor).getTime() > Date.now(), {
        message: "No se puede agendar una cita en una fecha ya pasada",
      }),
    finalizaEn: z.string().min(1, "La hora de finalización es obligatoria"),
    modalidad: z.enum(["PRESENCIAL", "VIRTUAL", "TELEFONICA"]),
    notas: z.string().trim().optional(),
    usuarioId: z.string().optional(),
  })
  .superRefine((valor, contexto) => {
    if (!hasDuracionMinima(valor.programadaPara, valor.finalizaEn)) {
      contexto.addIssue({
        code: "custom",
        path: ["finalizaEn"],
        message: "La duración mínima de una cita es de 1 hora",
      });
    }
  });

type CitaFormValues = z.infer<typeof citaFormSchema>;

function defaultStart(): string {
  const fecha = new Date();
  fecha.setMinutes(0, 0, 0);
  fecha.setHours(fecha.getHours() + 1);
  return toDatetimeLocalValue(fecha.toISOString());
}

function defaultEnd(programadaPara: string): string {
  return toDatetimeLocalValue(new Date(new Date(programadaPara).getTime() + 60 * 60 * 1000).toISOString());
}

function formatDateKey(fecha: Date): string {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

function formatTituloRango(fechaBase: Date, vista: VistaCalendarioCitas): string {
  const formatoMes = new Intl.DateTimeFormat("es-EC", { month: "long", year: "numeric" });
  const formatoDia = new Intl.DateTimeFormat("es-EC", { day: "2-digit", month: "short", year: "numeric" });

  if (vista === "mes") return formatoMes.format(fechaBase);
  if (vista === "dia") return formatoDia.format(fechaBase);
  const desde = startOfWeek(fechaBase);
  const hasta = endOfWeek(fechaBase);
  return `${formatoDia.format(desde)} – ${formatoDia.format(hasta)}`;
}

function puedeGestionarCitas(rol: RolUsuario | undefined): boolean {
  return rol === "ADMINISTRADOR" || rol === "SUPERVISOR" || rol === "SUPERVISOR_HOLDING" || rol === "SUPER_ADMIN";
}

function CitaStatusBadge({ estado }: { estado: CitaCalendario["estado"] }) {
  const variant = estado === "CUMPLIDA" ? "success" : estado === "CANCELADA" || estado === "NO_ASISTIO" ? "neutral" : "secondary";
  return <Badge variant={variant}>{ESTADO_CITA_ETIQUETAS[estado]}</Badge>;
}

function CitaEventButton({
  cita,
  mostrarAsesor,
  compact = false,
  onOpen,
}: {
  cita: CitaCalendario;
  mostrarAsesor: boolean;
  compact?: boolean;
  onOpen: (cita: CitaCalendario) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(cita)}
      className={cn(
        "flex w-full min-w-0 flex-col gap-1 rounded-md border border-border bg-card px-2 py-2 text-left shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        compact ? "text-xs" : "text-sm",
      )}
      aria-label={`${cita.lead.cliente.nombre}, ${formatRangoHora(cita)}`}
    >
      <span className="flex min-w-0 items-center justify-between gap-2">
        <span className="truncate font-medium text-foreground">{cita.lead.cliente.nombre}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground">{formatRangoHora(cita)}</span>
      </span>
      {mostrarAsesor ? <span className="truncate text-muted-foreground">{cita.usuario.nombre}</span> : null}
    </button>
  );
}

function LeadCombobox({
  value,
  selectedLead,
  onChange,
  empresaVistaId,
}: {
  value: string;
  selectedLead: Lead | null;
  onChange: (lead: Lead) => void;
  empresaVistaId?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const busquedaDebounced = useDebouncedValue(busqueda, 250);
  const { data, isLoading } = useLeads({
    pagina: 1,
    porPagina: 5,
    busqueda: busquedaDebounced || undefined,
    empresaId: empresaVistaId,
  });
  const leads = data?.datos ?? [];
  const textoBoton = selectedLead?.cliente.nombre ?? (value ? value : "Seleccionar lead");

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={abierto}
          aria-label="Seleccionar lead existente"
          className="w-full justify-start font-normal"
        >
          <span className="truncate">{textoBoton}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar por nombre o teléfono…"
            value={busqueda}
            onValueChange={setBusqueda}
          />
          <CommandList>
            {isLoading ? <p className="py-6 text-center text-sm text-muted-foreground">Buscando leads…</p> : null}
            {!isLoading && leads.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No hay leads que coincidan.</p>
            ) : null}
            <CommandGroup>
              {leads.map((lead) => (
                <CommandItem
                  key={lead.id}
                  value={lead.id}
                  onSelect={() => {
                    onChange(lead);
                    setAbierto(false);
                    setBusqueda("");
                  }}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{lead.cliente.nombre}</span>
                    <span className="truncate text-xs text-muted-foreground">{lead.cliente.telefonoNormalizado}</span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function CitaFormDialog({
  open,
  mode,
  cita,
  asesores,
  mostrarAsesor,
  empresaVistaId,
  onOpenChange,
  onSubmit,
  isPending,
  error,
}: {
  open: boolean;
  mode: "crear" | "editar";
  cita?: CitaCalendario;
  asesores: { id: string; nombre: string }[];
  mostrarAsesor: boolean;
  empresaVistaId?: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: CitaFormValues) => void;
  isPending: boolean;
  error: unknown;
}) {
  const inicio = cita ? toDatetimeLocalValue(cita.programadaPara) : defaultStart();
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CitaFormValues>({
    resolver: zodResolver(citaFormSchema),
    values: {
      leadId: cita?.leadId ?? "",
      programadaPara: inicio,
      finalizaEn: cita?.finalizaEn ? toDatetimeLocalValue(cita.finalizaEn) : defaultEnd(inicio),
      modalidad: cita?.modalidad ?? "VIRTUAL",
      notas: cita?.notas ?? "",
      usuarioId: cita?.usuarioId ?? ASESOR_SIN_SELECCION,
    },
  });
  const leadId = watch("leadId");

  const title = mode === "crear" ? "Agendar cita" : "Reprogramar cita";
  const description = mode === "crear"
    ? "Elige un lead existente y reserva un horario de al menos una hora."
    : "Ajusta el horario y los datos de esta cita.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(760px,calc(100vh-2rem))] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>Lead</Label>
            {mode === "crear" ? (
              <LeadCombobox
                value={leadId}
                selectedLead={selectedLead}
                empresaVistaId={empresaVistaId}
                onChange={(lead) => {
                  setSelectedLead(lead);
                  setValue("leadId", lead.id, { shouldValidate: true });
                }}
              />
            ) : (
              <Button asChild variant="outline" className="justify-start font-normal">
                <Link to={`/leads/${cita?.leadId ?? ""}`}>{cita?.lead.cliente.nombre}</Link>
              </Button>
            )}
            {errors.leadId ? <p className="text-sm text-destructive">{errors.leadId.message}</p> : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="cita-programada-para">Inicio</Label>
              <Input id="cita-programada-para" type="datetime-local" aria-invalid={!!errors.programadaPara} {...register("programadaPara")} />
              {errors.programadaPara ? <p className="text-sm text-destructive">{errors.programadaPara.message}</p> : null}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="cita-finaliza-en">Finaliza</Label>
              <Input id="cita-finaliza-en" type="datetime-local" aria-invalid={!!errors.finalizaEn} {...register("finalizaEn")} />
              {errors.finalizaEn ? <p className="text-sm text-destructive">{errors.finalizaEn.message}</p> : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="cita-modalidad">Modalidad</Label>
              <Controller
                control={control}
                name="modalidad"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="cita-modalidad" aria-label="Modalidad">
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
            {mostrarAsesor ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="cita-asesor">Asesor</Label>
                <Controller
                  control={control}
                  name="usuarioId"
                  render={({ field }) => (
                    <Select value={field.value || ASESOR_SIN_SELECCION} onValueChange={field.onChange}>
                      <SelectTrigger id="cita-asesor" aria-label="Asesor">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ASESOR_SIN_SELECCION}>Sin asesor específico</SelectItem>
                        {asesores.map((asesor) => (
                          <SelectItem key={asesor.id} value={asesor.id}>
                            {asesor.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="cita-notas">Notas (opcional)</Label>
            <Textarea id="cita-notas" rows={3} placeholder="Ej: confirmar documentación antes de la cita" {...register("notas")} />
          </div>

          {error ? <p className="text-sm text-destructive">{getErrorMessage(error)}</p> : null}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Guardando…" : mode === "crear" ? "Agendar" : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CitaDetalleDialog({
  cita,
  open,
  mostrarAsesor,
  onOpenChange,
  onEdit,
}: {
  cita: CitaCalendario | null;
  open: boolean;
  mostrarAsesor: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
}) {
  const markResult = useMarkCitaResultCalendario();
  const cancelCita = useCancelCitaCalendario();
  if (!cita) return null;
  const puedeAccionar = cita.estado === "AGENDADA" || cita.estado === "REPROGRAMADA";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{cita.lead.cliente.nombre}</DialogTitle>
          <DialogDescription>{formatFechaHora(cita.programadaPara)} · {formatRangoHora(cita)}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <CitaStatusBadge estado={cita.estado} />
            <Badge variant="outline">{MODALIDAD_ETIQUETAS[cita.modalidad]}</Badge>
            {mostrarAsesor ? <Badge variant="neutral">{cita.usuario.nombre}</Badge> : null}
          </div>
          <div className="grid gap-3 rounded-lg border border-border bg-card p-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Phone aria-hidden="true" />
              <span>{cita.lead.cliente.telefonoNormalizado ?? "Sin teléfono registrado"}</span>
            </div>
            {cita.notas ? <p className="text-muted-foreground">{cita.notas}</p> : null}
            <Button asChild variant="outline" className="w-fit">
              <Link to={`/leads/${cita.leadId}`}>Ver lead</Link>
            </Button>
          </div>
          {puedeAccionar ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={onEdit}>Reprogramar</Button>
              <Button
                type="button"
                variant="outline"
                disabled={markResult.isPending}
                onClick={() => markResult.mutate({ citaId: cita.id, estado: "CUMPLIDA" })}
              >
                Marcar cumplida
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={markResult.isPending}
                onClick={() => markResult.mutate({ citaId: cita.id, estado: "NO_ASISTIO" })}
              >
                No asistió
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={cancelCita.isPending}
                onClick={() => cancelCita.mutate(cita.id)}
              >
                Cancelar
              </Button>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CalendarMonthView({
  fechaBase,
  citas,
  mostrarAsesor,
  onOpenCita,
}: {
  fechaBase: Date;
  citas: CitaCalendario[];
  mostrarAsesor: boolean;
  onOpenCita: (cita: CitaCalendario) => void;
}) {
  const dias = buildMonthDays(fechaBase);
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[760px] grid-cols-7 gap-px rounded-xl border border-border bg-border">
        {DIAS_SEMANA.map((dia) => (
          <div key={dia} className="bg-muted px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {dia}
          </div>
        ))}
        {dias.map((dia) => {
          const citasDelDia = ordenarCitasPorInicio(citas.filter((cita) => isSameLocalDay(new Date(cita.programadaPara), dia)));
          return (
            <div key={formatDateKey(dia)} className={cn("min-h-32 bg-card p-2", !isSameLocalMonth(dia, fechaBase) && "bg-card/60 text-muted-foreground")}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className={cn("flex size-7 items-center justify-center rounded-full text-sm font-medium", isSameLocalDay(dia, new Date()) && "bg-primary text-primary-foreground")}>
                  {dia.getDate()}
                </span>
                {citasDelDia.length > 0 ? <span className="text-xs text-muted-foreground">{citasDelDia.length}</span> : null}
              </div>
              <div className="flex flex-col gap-1.5">
                {citasDelDia.slice(0, 3).map((cita) => (
                  <CitaEventButton key={cita.id} cita={cita} mostrarAsesor={mostrarAsesor} compact onOpen={onOpenCita} />
                ))}
                {citasDelDia.length > 3 ? <span className="text-xs text-muted-foreground">+{citasDelDia.length - 3} citas más</span> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CalendarAgendaView({
  fechaBase,
  vista,
  citas,
  mostrarAsesor,
  onOpenCita,
}: {
  fechaBase: Date;
  vista: Exclude<VistaCalendarioCitas, "mes">;
  citas: CitaCalendario[];
  mostrarAsesor: boolean;
  onOpenCita: (cita: CitaCalendario) => void;
}) {
  const dias = vista === "dia" ? [fechaBase] : Array.from({ length: 7 }, (_, index) => new Date(startOfWeek(fechaBase).getTime() + index * 24 * 60 * 60 * 1000));
  const formatoDia = new Intl.DateTimeFormat("es-EC", { weekday: "long", day: "2-digit", month: "short" });
  return (
    <div className="grid gap-3">
      {dias.map((dia) => {
        const citasDelDia = ordenarCitasPorInicio(citas.filter((cita) => isSameLocalDay(new Date(cita.programadaPara), dia)));
        return (
          <section key={formatDateKey(dia)} aria-labelledby={`dia-${formatDateKey(dia)}`} className="rounded-xl border border-border bg-card p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 id={`dia-${formatDateKey(dia)}`} className="text-sm font-semibold capitalize text-foreground">
                {formatoDia.format(dia)}
              </h3>
              <span className="text-xs text-muted-foreground">{citasDelDia.length} cita(s)</span>
            </div>
            {citasDelDia.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin citas agendadas.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {citasDelDia.map((cita) => (
                  <CitaEventButton key={cita.id} cita={cita} mostrarAsesor={mostrarAsesor} onOpen={onOpenCita} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

export function CalendarCitasPage() {
  usePageHeader({ title: "Citas" });
  const { user } = useAuth();
  const { empresaVistaId } = useVistaEmpresa();
  const esGestor = puedeGestionarCitas(user?.rol);
  const mostrarAsesor = esGestor;
  const [vista, setVista] = useState<VistaCalendarioCitas>("mes");
  const [fechaBase, setFechaBase] = useState(() => new Date());
  const [asesorId, setAsesorId] = useState(ASESOR_TODOS);
  const [crearOpen, setCrearOpen] = useState(false);
  const [detalleOpen, setDetalleOpen] = useState(false);
  const [editarOpen, setEditarOpen] = useState(false);
  const [citaSeleccionada, setCitaSeleccionada] = useState<CitaCalendario | null>(null);

  const rango = useMemo(() => buildVisibleRange(fechaBase, vista), [fechaBase, vista]);
  const citasQuery = useCitas({
    desde: rango.desde.toISOString(),
    hasta: rango.hasta.toISOString(),
    asesorId: asesorId === ASESOR_TODOS ? undefined : asesorId,
  });
  const { data: asesores = [] } = useQuery({
    queryKey: ["catalogo-responsables", "ASESORES"],
    queryFn: () => getCatalogoResponsables("ASESORES"),
    enabled: esGestor,
  });
  const crearCita = useScheduleCitaCalendario();
  const reprogramarCita = useRescheduleCitaCalendario();
  const citas = citasQuery.data ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm md:flex-row md:items-end md:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <CalendarDays aria-hidden="true" />
            Calendario comercial
          </div>
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Agenda de citas</h1>
            <p className="text-sm text-muted-foreground">Visualiza, agenda y da seguimiento a los encuentros con leads existentes.</p>
          </div>
        </div>
        <Button onClick={() => setCrearOpen(true)}>
          <Plus data-icon="inline-start" aria-hidden="true" />
          Agendar cita
        </Button>
      </div>

      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-1">
              <CardTitle className="text-xl capitalize">{formatTituloRango(fechaBase, vista)}</CardTitle>
              <CardDescription>
                La vista actual consulta las citas desde {formatFechaHora(rango.desde.toISOString())} hasta {formatFechaHora(rango.hasta.toISOString())}.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="icon" aria-label="Periodo anterior" onClick={() => setFechaBase((fecha) => avanzarFecha(fecha, vista, -1))}>
                <ChevronLeft aria-hidden="true" />
              </Button>
              <Button type="button" variant="outline" onClick={() => setFechaBase(new Date())}>Hoy</Button>
              <Button type="button" variant="outline" size="icon" aria-label="Periodo siguiente" onClick={() => setFechaBase((fecha) => avanzarFecha(fecha, vista, 1))}>
                <ChevronRight aria-hidden="true" />
              </Button>
              <div className="flex rounded-lg border border-border bg-background p-1" role="group" aria-label="Vista del calendario">
                {VISTAS_CALENDARIO.map((opcion) => (
                  <Button
                    key={opcion}
                    type="button"
                    size="sm"
                    variant={vista === opcion ? "default" : "ghost"}
                    aria-pressed={vista === opcion}
                    onClick={() => setVista(opcion)}
                  >
                    {CITAS_VISTA_ETIQUETAS[opcion]}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          {esGestor ? (
            <div className="max-w-sm">
              <ResponsableCombobox
                valor={asesorId}
                onChange={setAsesorId}
                responsables={asesores}
                etiqueta="Asesor"
                ariaLabel="Filtrar citas por asesor"
                mostrarOpcionTodos
                valorOpcionTodos={ASESOR_TODOS}
                etiquetaOpcionTodos="Todos los asesores"
                etiquetaBotonOpcionTodos="Todos los asesores"
                placeholderBusqueda="Buscar asesor…"
                className="w-full"
              />
            </div>
          ) : null}
        </CardHeader>
        <CardContent>
          {citasQuery.isLoading ? (
            <LoadingState rows={6} rowHeight="h-20" />
          ) : citasQuery.isError ? (
            <ErrorState message={getErrorMessage(citasQuery.error)} onRetry={() => void citasQuery.refetch()} />
          ) : citas.length === 0 ? (
            <EmptyState
              icon={Clock3}
              title="No hay citas en este periodo"
              description="Agenda una cita o cambia el rango para revisar otra fecha."
              action={<Button onClick={() => setCrearOpen(true)}>Agendar cita</Button>}
            />
          ) : vista === "mes" ? (
            <CalendarMonthView fechaBase={fechaBase} citas={citas} mostrarAsesor={mostrarAsesor} onOpenCita={(cita) => { setCitaSeleccionada(cita); setDetalleOpen(true); }} />
          ) : (
            <CalendarAgendaView fechaBase={fechaBase} vista={vista} citas={citas} mostrarAsesor={mostrarAsesor} onOpenCita={(cita) => { setCitaSeleccionada(cita); setDetalleOpen(true); }} />
          )}
        </CardContent>
      </Card>

      <CitaFormDialog
        open={crearOpen}
        mode="crear"
        asesores={asesores}
        mostrarAsesor={mostrarAsesor}
        empresaVistaId={empresaVistaId ?? undefined}
        onOpenChange={setCrearOpen}
        isPending={crearCita.isPending}
        error={crearCita.error}
        onSubmit={(values) => {
          crearCita.mutate(
            {
              leadId: values.leadId,
              programadaPara: new Date(values.programadaPara).toISOString(),
              finalizaEn: new Date(values.finalizaEn).toISOString(),
              modalidad: values.modalidad as ModalidadCita,
              notas: values.notas,
              usuarioId: values.usuarioId === ASESOR_SIN_SELECCION ? undefined : values.usuarioId,
            },
            { onSuccess: () => setCrearOpen(false) },
          );
        }}
      />

      <CitaDetalleDialog
        cita={citaSeleccionada}
        open={detalleOpen}
        mostrarAsesor={mostrarAsesor}
        onOpenChange={setDetalleOpen}
        onEdit={() => {
          setDetalleOpen(false);
          setEditarOpen(true);
        }}
      />

      {citaSeleccionada ? (
        <CitaFormDialog
          open={editarOpen}
          mode="editar"
          cita={citaSeleccionada}
          asesores={asesores}
          mostrarAsesor={mostrarAsesor}
          empresaVistaId={empresaVistaId ?? undefined}
          onOpenChange={setEditarOpen}
          isPending={reprogramarCita.isPending}
          error={reprogramarCita.error}
          onSubmit={(values) => {
            reprogramarCita.mutate(
              {
                citaId: citaSeleccionada.id,
                input: {
                  programadaPara: new Date(values.programadaPara).toISOString(),
                  finalizaEn: new Date(values.finalizaEn).toISOString(),
                  modalidad: values.modalidad,
                  notas: values.notas,
                  usuarioId: values.usuarioId === ASESOR_SIN_SELECCION ? undefined : values.usuarioId,
                },
              },
              { onSuccess: () => setEditarOpen(false) },
            );
          }}
        />
      ) : null}
    </div>
  );
}
