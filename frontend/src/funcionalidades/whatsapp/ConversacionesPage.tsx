import { MessageSquare } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router";
import { useVistaEmpresa } from "@/funcionalidades/empresa-apariencia/useVistaEmpresa";
import { ConversacionAbierta } from "./ConversacionAbierta";
import { ListaConversaciones } from "./ListaConversaciones";
import { LIMITE_CONVERSACIONES_DEFECTO, useConversaciones } from "./useConversaciones";

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
  // Fix (2026-09-02, bug real de producción): esta página nunca leía la
  // vista de empresa de un holding-wide -- `GET /conversaciones` salía
  // siempre sin `empresaId`, así que un holding-wide "entrando" a la vista
  // de una empresa seguía viendo TODAS las conversaciones del holding
  // mezcladas (el backend ya soportaba el filtro desde hace días, nadie lo
  // mandaba). Mismo patrón que `LeadsPage.tsx`/`UsuariosPage.tsx`/
  // `ReportesPage.tsx`.
  const { empresaVistaId } = useVistaEmpresa();

  // El tiempo real (evento SSE `whatsapp.mensaje-nuevo`) lo maneja el consumidor
  // central `useNotificacionesRealtime`, montado en el layout: invalida las
  // queries de `conversaciones` sin que esta página abra su propia conexión.
  const listaQuery = useConversaciones({ pagina, limite, empresaId: empresaVistaId ?? undefined });
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
        Selecciona una conversación para ver los mensajes
      </p>
      <p className="text-sm text-muted-foreground">
        Elige una conversación del panel de la izquierda.
      </p>
    </div>
  );
}
