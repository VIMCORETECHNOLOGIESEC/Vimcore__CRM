import { useEffect } from "react";
import type { ConversacionListItem } from "@/tipos/conversacion";
import { CajaRespuesta } from "./CajaRespuesta";
import { nombreConversacion } from "./conversaciones.utils";
import { HiloMensajes } from "./HiloMensajes";
import {
  useEnviarMensaje,
  useMarcarConversacionLeida,
  useMensajesConversacion,
} from "./useConversaciones";

/**
 * Hilo abierto de una conversación (cabecera + mensajes + caja de
 * respuesta). Extraído de `ConversacionesPage.tsx` para reutilizarlo tal
 * cual desde otros anfitriones (p.ej. el chat de WhatsApp del detalle de un
 * lead) sin duplicar el wiring de los hooks de mensajería.
 */
interface ConversacionAbiertaProps {
  conversacionId: string;
  encabezado?: ConversacionListItem;
}

export function ConversacionAbierta({ conversacionId, encabezado }: ConversacionAbiertaProps) {
  const historial = useMensajesConversacion(conversacionId);
  const enviarMensaje = useEnviarMensaje(conversacionId);
  const marcarLeida = useMarcarConversacionLeida();

  // D-mensajería (leído/no leído): al abrir una conversación no leída, se
  // marca como leída HASTA AHORA. `encabezado` puede llegar `undefined` en el
  // primer render (deep-link a un id fuera de la página actual del listado)
  // y completarse después -- el efecto reacciona a ese cambio de `noLeido`,
  // no solo al montaje.
  useEffect(() => {
    if (encabezado?.noLeido) {
      marcarLeida.mutate(conversacionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversacionId, encabezado?.noLeido]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header
        data-testid="encabezado-conversacion"
        className="flex h-14 shrink-0 flex-col justify-center border-b border-border px-4"
      >
        <p className="truncate text-sm font-semibold text-foreground">
          {encabezado ? nombreConversacion(encabezado) : "Conversación"}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {encabezado?.clienteTelefono
            ? encabezado.clienteTelefono
            : "Sin teléfono registrado"}
          {encabezado?.asesorNombre ? ` · Asesor: ${encabezado.asesorNombre}` : ""}
        </p>
      </header>

      <HiloMensajes
        mensajes={historial.mensajes}
        hayMas={historial.hayMas}
        isLoading={historial.isLoading}
        isFetchingAnteriores={historial.isFetchingAnteriores}
        isError={historial.isError}
        onCargarAnteriores={historial.cargarAnteriores}
        onReintentar={historial.refetch}
      />

      <CajaRespuesta
        onEnviar={(texto) => enviarMensaje.mutateAsync(texto)}
        enviando={enviarMensaje.isPending}
      />
    </div>
  );
}
