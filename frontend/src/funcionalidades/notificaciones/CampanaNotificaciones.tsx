import { Bell, Check, Inbox } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EmptyState } from "@/componentes/states/EmptyState";
import { ErrorState } from "@/componentes/states/ErrorState";
import { LoadingState } from "@/componentes/states/LoadingState";
import { getErrorMessage } from "@/api/httpClient";
import { cn } from "@/lib/utils";
import type { Notificacion } from "@/tipos/notificacion";
import { TIPO_NOTIFICACION_ETIQUETAS } from "./catalogos";
import { countNoLeidas, formatFechaRelativa } from "./notificaciones.utils";
import {
  useMarkAllNotificacionesLeidas,
  useMarkNotificacionLeida,
  useNotificaciones,
} from "./useNotificaciones";

interface FilaNotificacionProps {
  notificacion: Notificacion;
  onOpen: (notificacion: Notificacion) => void;
  onMarkLeida: (notificacionId: string) => void;
}

function FilaNotificacion({ notificacion, onOpen, onMarkLeida }: FilaNotificacionProps) {
  const noLeida = !notificacion.leidaEn;

  const contenido = (
    <>
      <span
        aria-hidden="true"
        className={cn("mt-1.5 size-2 shrink-0 rounded-full", noLeida ? "bg-primary" : "bg-transparent")}
      />
      <span className="flex flex-1 flex-col gap-0.5 text-left">
        <span className="text-xs font-medium text-muted-foreground">
          {TIPO_NOTIFICACION_ETIQUETAS[notificacion.tipo]}
        </span>
        <span className={cn("text-sm text-foreground", noLeida && "font-semibold")}>
          {notificacion.titulo}
        </span>
        <span className="text-xs text-muted-foreground">{notificacion.mensaje}</span>
        <span className="text-xs text-muted-foreground">
          {formatFechaRelativa(notificacion.creadaEn)}
        </span>
      </span>
    </>
  );

  return (
    <div className="flex items-start gap-2 rounded-md p-2 hover:bg-accent/50">
      {notificacion.leadId ? (
        <Link
          to={`/leads/${notificacion.leadId}`}
          className="flex flex-1 items-start gap-2"
          onClick={() => onOpen(notificacion)}
        >
          {contenido}
        </Link>
      ) : (
        <button
          type="button"
          className="flex flex-1 items-start gap-2"
          onClick={() => onOpen(notificacion)}
        >
          {contenido}
        </button>
      )}

      {noLeida ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              aria-label={`Marcar "${notificacion.titulo}" como leída`}
              onClick={() => onMarkLeida(notificacion.id)}
            >
              <Check className="size-4" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Marcar como leída</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}

/**
 * Campana de notificaciones (F6, docs/07-modulos-frontend.md): contador de no
 * leídas, panel desplegable con listado y navegación al lead relacionado, y
 * marcado de leída individual/masivo. Reemplaza el disparador deshabilitado
 * que dejó F1 en `Header.tsx`.
 *
 * Fuera de alcance de este componente (ver nota de progreso en docs/07 F6):
 * el aviso emergente al llegar una notificación por SSE y el indicador de
 * reconexión del canal -- ambos dependen del canal SSE real (M8), que
 * todavía no existe.
 */
export function CampanaNotificaciones() {
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError, error, refetch } = useNotificaciones();
  const markLeida = useMarkNotificacionLeida();
  const markTodas = useMarkAllNotificacionesLeidas();

  const notificaciones = data ?? [];
  const noLeidas = countNoLeidas(notificaciones);

  function handleOpen(notificacion: Notificacion) {
    if (!notificacion.leidaEn) {
      markLeida.mutate(notificacion.id);
    }
    setOpen(false);
  }

  function handleMarkLeida(notificacionId: string) {
    markLeida.mutate(notificacionId);
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      {/*
        Sin Tooltip envolviendo el disparador a propósito: anidar
        `TooltipTrigger asChild` sobre `DropdownMenuTrigger asChild` encadena
        dos clonados de Radix Slot sobre el mismo `Button`, frágil en jsdom y
        sin ganancia real -- el `aria-label` ya describe el estado completo
        (incluido el conteo) en texto, cumpliendo el mismo criterio de
        accesibilidad que el semáforo (nunca solo color/ícono).
      */}
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={
            noLeidas > 0
              ? `Notificaciones, ${noLeidas} sin leer`
              : "Notificaciones, sin pendientes"
          }
        >
          <Bell className="size-5" aria-hidden="true" />
          {noLeidas > 0 ? (
            <Badge
              variant="destructive"
              className="absolute -right-1 -top-1 h-4 min-w-4 justify-center rounded-full px-1 text-[10px] leading-none"
              aria-hidden="true"
            >
              {noLeidas > 9 ? "9+" : noLeidas}
            </Badge>
          ) : null}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <span className="text-sm font-semibold text-foreground">Notificaciones</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={noLeidas === 0 || markTodas.isPending}
            onClick={() => markTodas.mutate()}
          >
            Marcar todas como leídas
          </Button>
        </div>
        <DropdownMenuSeparator className="mt-0" />

        <div className="p-2">
          {isLoading ? (
            <LoadingState rows={3} rowHeight="h-16" />
          ) : isError ? (
            <ErrorState message={getErrorMessage(error)} onRetry={() => void refetch()} />
          ) : notificaciones.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No tienes notificaciones"
              description="Cuando tengas novedades, aparecerán acá."
            />
          ) : (
            <div className="flex max-h-96 flex-col gap-1 overflow-y-auto pr-1">
              {notificaciones.map((notificacion) => (
                <FilaNotificacion
                  key={notificacion.id}
                  notificacion={notificacion}
                  onOpen={handleOpen}
                  onMarkLeida={handleMarkLeida}
                />
              ))}
            </div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
