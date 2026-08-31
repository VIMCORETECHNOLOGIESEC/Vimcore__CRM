import { ErrorState } from "@/componentes/states/ErrorState";
import { LoadingState } from "@/componentes/states/LoadingState";
import type { Mensaje } from "@/tipos/conversacion";
import { formatearHora } from "./conversaciones.utils";

interface HiloMensajesProps {
  mensajes: Mensaje[];
  hayMas: boolean;
  isLoading: boolean;
  isFetchingAnteriores: boolean;
  isError: boolean;
  onCargarAnteriores: () => void;
  onReintentar: () => void;
}

/**
 * Panel de mensajes de una conversación. Orden de chat: el más viejo arriba,
 * el más nuevo abajo (el hook ya entrega la lista ordenada así). Botón
 * "Cargar mensajes anteriores" en el tope cuando quedan páginas por traer.
 * Sin lógica de datos.
 */
export function HiloMensajes({
  mensajes,
  hayMas,
  isLoading,
  isFetchingAnteriores,
  isError,
  onCargarAnteriores,
  onReintentar,
}: HiloMensajesProps) {
  if (isLoading) {
    return (
      <div className="flex-1 overflow-y-auto bg-muted p-4">
        <LoadingState rows={5} rowHeight="h-14" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex-1 overflow-y-auto bg-muted p-4">
        <ErrorState
          message="No se pudo cargar el historial de esta conversación. Intentá nuevamente."
          onRetry={onReintentar}
        />
      </div>
    );
  }

  if (mensajes.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center bg-muted p-4">
        <p className="text-sm text-muted-foreground">
          Todavía no hay mensajes en esta conversación.
        </p>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-muted p-4"
      role="log"
      aria-label="Mensajes de la conversación"
    >
      {hayMas ? (
        <button
          type="button"
          onClick={onCargarAnteriores}
          disabled={isFetchingAnteriores}
          className="mx-auto rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isFetchingAnteriores ? "Cargando…" : "Cargar mensajes anteriores"}
        </button>
      ) : null}

      {mensajes.map((mensaje) => {
        const saliente = mensaje.direccion === "SALIENTE";
        return (
          <div
            key={mensaje.id}
            data-testid="mensaje"
            className={`flex ${saliente ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                saliente
                  ? "rounded-br-sm bg-primary/10 text-foreground"
                  : "rounded-bl-sm bg-card text-foreground"
              }`}
            >
              <span className="sr-only">
                {saliente ? "Mensaje enviado:" : "Mensaje recibido:"}
              </span>
              <p className="whitespace-pre-wrap break-words">
                {mensaje.texto ?? "(mensaje sin texto)"}
              </p>
              <span className="mt-1 block text-right text-[10px] text-muted-foreground">
                {formatearHora(mensaje.enviadoEn)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
