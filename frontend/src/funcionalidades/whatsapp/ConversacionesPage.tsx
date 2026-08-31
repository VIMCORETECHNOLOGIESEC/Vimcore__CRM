import { MessageSquare } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router";
import type { ConversacionListItem } from "@/tipos/conversacion";
import { CajaRespuesta } from "./CajaRespuesta";
import { nombreConversacion } from "./conversaciones.utils";
import { HiloMensajes } from "./HiloMensajes";
import { ListaConversaciones } from "./ListaConversaciones";
import {
  LIMITE_CONVERSACIONES_DEFECTO,
  useConversaciones,
  useEnviarMensaje,
  useMensajesConversacion,
} from "./useConversaciones";

/**
 * Bandeja de conversaciones de WhatsApp: panel de listado a la izquierda,
 * hilo + caja de respuesta a la derecha. Sirve para `/conversaciones` (sin
 * hilo abierto) y `/conversaciones/:id` (hilo abierto). El wiring de ruta y
 * de navegación lo hace la sesión padre; esta página es autónoma.
 *
 * No hay endpoint de detalle por conversación: la cabecera del hilo se
 * arma con la fila del listado ya cargado. Si se entra por deep-link a un
 * id que no está en la página actual del listado, se muestra una cabecera
 * mínima en vez de fallar.
 */
export function ConversacionesPage() {
  const { id } = useParams<{ id: string }>();
  const [pagina, setPagina] = useState(1);
  const limite = LIMITE_CONVERSACIONES_DEFECTO;

  // El tiempo real (evento SSE `whatsapp.mensaje-nuevo`) lo maneja el consumidor
  // central `useNotificacionesRealtime`, montado en el layout: invalida las
  // queries de `conversaciones` sin que esta página abra su propia conexión.
  const listaQuery = useConversaciones({ pagina, limite });
  const conversaciones = listaQuery.data?.conversaciones ?? [];
  const encabezado = conversaciones.find((conversacion) => conversacion.id === id);

  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-[32rem] w-full overflow-hidden">
      <h1 className="sr-only">Conversaciones de WhatsApp</h1>

      <ListaConversaciones
        conversaciones={conversaciones}
        total={listaQuery.data?.total ?? 0}
        pagina={pagina}
        limite={limite}
        idActivo={id}
        isLoading={listaQuery.isLoading}
        isError={listaQuery.isError}
        onReintentar={() => void listaQuery.refetch()}
        onCambiarPagina={setPagina}
      />

      <section className="flex min-w-0 flex-1 flex-col bg-background">
        {id ? (
          <ConversacionAbierta key={id} conversacionId={id} encabezado={encabezado} />
        ) : (
          <PlaceholderSinSeleccion />
        )}
      </section>
    </div>
  );
}

function PlaceholderSinSeleccion() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-muted p-8 text-center">
      <MessageSquare className="size-10 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-medium text-foreground">
        Seleccioná una conversación para ver los mensajes
      </p>
      <p className="text-sm text-muted-foreground">
        Elegí una conversación del panel de la izquierda.
      </p>
    </div>
  );
}

interface ConversacionAbiertaProps {
  conversacionId: string;
  encabezado?: ConversacionListItem;
}

function ConversacionAbierta({ conversacionId, encabezado }: ConversacionAbiertaProps) {
  const historial = useMensajesConversacion(conversacionId);
  const enviarMensaje = useEnviarMensaje(conversacionId);

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
