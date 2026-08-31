import { ChevronLeft, ChevronRight, MessageSquare } from "lucide-react";
import { Link } from "react-router";
import { EmptyState } from "@/componentes/states/EmptyState";
import { ErrorState } from "@/componentes/states/ErrorState";
import { LoadingState } from "@/componentes/states/LoadingState";
import type { ConversacionListItem } from "@/tipos/conversacion";
import { formatearFechaHora, nombreConversacion } from "./conversaciones.utils";

interface ListaConversacionesProps {
  conversaciones: ConversacionListItem[];
  total: number;
  pagina: number;
  limite: number;
  idActivo?: string;
  isLoading: boolean;
  isError: boolean;
  onReintentar: () => void;
  onCambiarPagina: (pagina: number) => void;
}

/**
 * Panel izquierdo de la bandeja: listado paginado de conversaciones. Sin
 * lógica de datos -- la recibe de `ConversacionesPage`. Cada fila navega a
 * `/conversaciones/:id`; la activa queda marcada con `aria-current`.
 */
export function ListaConversaciones({
  conversaciones,
  total,
  pagina,
  limite,
  idActivo,
  isLoading,
  isError,
  onReintentar,
  onCambiarPagina,
}: ListaConversacionesProps) {
  const totalPaginas = Math.max(1, Math.ceil(total / limite));
  const hayAnterior = pagina > 1;
  const haySiguiente = pagina < totalPaginas;

  return (
    <div className="flex w-full max-w-sm shrink-0 flex-col border-r border-border bg-background">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Conversaciones</h2>
        <p className="text-xs text-muted-foreground">
          {total === 0 ? "Sin conversaciones" : `${total} en total`}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <LoadingState rows={6} rowHeight="h-16" />
        ) : isError ? (
          <ErrorState
            message="No se pudieron cargar las conversaciones. Intentá nuevamente."
            onRetry={onReintentar}
          />
        ) : conversaciones.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="No hay conversaciones"
            description="Cuando un cliente escriba por WhatsApp, la conversación va a aparecer acá."
          />
        ) : (
          <ul className="flex flex-col gap-1">
            {conversaciones.map((conversacion) => {
              const activa = conversacion.id === idActivo;
              const nombre = nombreConversacion(conversacion);
              return (
                <li key={conversacion.id}>
                  <Link
                    to={`/conversaciones/${conversacion.id}`}
                    aria-current={activa ? "page" : undefined}
                    className={`flex flex-col gap-0.5 rounded-md px-3 py-2 text-left transition-colors ${
                      activa
                        ? "bg-primary/10 text-foreground"
                        : "text-foreground hover:bg-secondary"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{nombre}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {formatearFechaHora(conversacion.ultimoMensajeEn)}
                      </span>
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {conversacion.asesorNombre
                        ? `Asesor: ${conversacion.asesorNombre}`
                        : "Sin asesor asignado"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {!isLoading && !isError && conversaciones.length > 0 ? (
        <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs text-muted-foreground">
          <button
            type="button"
            onClick={() => onCambiarPagina(pagina - 1)}
            disabled={!hayAnterior}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="size-3.5" aria-hidden="true" />
            Anterior
          </button>
          <span aria-live="polite">
            Página {pagina} de {totalPaginas}
          </span>
          <button
            type="button"
            onClick={() => onCambiarPagina(pagina + 1)}
            disabled={!haySiguiente}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
          >
            Siguiente
            <ChevronRight className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
