import { useCallback, useEffect, useMemo, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { Mensaje } from "@/tipos/conversacion";
import {
  enviarMensajeApi,
  listarConversacionesApi,
  listarMensajesApi,
  type ConversacionesQueryParams,
  type LimiteConversaciones,
} from "./conversaciones.api";
import { combinarHistorial } from "./conversaciones.utils";

/**
 * Hooks de TanStack Query de la bandeja de conversaciones de WhatsApp. Mismo
 * criterio que `bridges/useBridges.ts`: clave de query a nivel de módulo,
 * `keepPreviousData` para paginar sin parpadeo, mutación NO optimista que
 * invalida en `onSuccess`. El toast global de error
 * (`api/queryClient.ts::MutationCache.onError`) ya muestra
 * `getErrorMessage(error)` -- estos hooks no agregan su propio toast.
 */

export const CONVERSACIONES_QUERY_KEY = "conversaciones";
export const LIMITE_CONVERSACIONES_DEFECTO: LimiteConversaciones = 25;

/** Listado paginado (`GET /conversaciones`), ordenado `ultimoMensajeEn` desc. */
export function useConversaciones(params: ConversacionesQueryParams) {
  return useQuery({
    queryKey: [CONVERSACIONES_QUERY_KEY, params],
    queryFn: () => listarConversacionesApi(params),
    placeholderData: keepPreviousData,
  });
}

export interface HistorialConversacion {
  /** Cronológico ascendente: el más viejo primero, el más nuevo al final. */
  mensajes: Mensaje[];
  total: number;
  /** Quedan mensajes más viejos por traer (`Cargar mensajes anteriores`). */
  hayMas: boolean;
  cargarAnteriores: () => void;
  /** Primera página en vuelo (todavía no hay nada que mostrar). */
  isLoading: boolean;
  /** Trayendo una página adicional de historial, con contenido ya visible. */
  isFetchingAnteriores: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
}

/**
 * Historial de una conversación con paginación "cargar anteriores". Cada
 * página del backend llega `enviadoEn` desc; este hook las acumula y las
 * invierte a orden de chat (viejo arriba). La clave de query incluye
 * `{ pagina, limite }` para que TanStack cachee cada página por separado;
 * el acumulado vive en estado local y se recompone al llegar datos nuevos
 * (incluida una recarga por invalidación SSE de la página actual).
 *
 * El llamador debe montar este hook con `key={conversacionId}` para que el
 * estado se reinicie limpio al cambiar de conversación; el filtro por
 * `conversacionId` en el merge es una defensa extra ante datos residuales.
 */
export function useMensajesConversacion(
  conversacionId: string,
  limite: LimiteConversaciones = LIMITE_CONVERSACIONES_DEFECTO,
): HistorialConversacion {
  const [pagina, setPagina] = useState(1);
  const [paginasCargadas, setPaginasCargadas] = useState<Mensaje[][]>([]);

  const query = useQuery({
    queryKey: [CONVERSACIONES_QUERY_KEY, conversacionId, "mensajes", { pagina, limite }],
    queryFn: () => listarMensajesApi(conversacionId, { pagina, limite }),
    enabled: conversacionId !== "",
    placeholderData: keepPreviousData,
  });

  const { data } = query;

  useEffect(() => {
    if (!data) return;
    const paginaLimpia = data.mensajes.filter(
      (mensaje) => mensaje.conversacionId === conversacionId,
    );
    setPaginasCargadas((previas) => {
      const siguientes = previas.slice();
      siguientes[pagina - 1] = paginaLimpia;
      return siguientes;
    });
  }, [data, conversacionId, pagina]);

  const mensajes = useMemo(() => combinarHistorial(paginasCargadas), [paginasCargadas]);
  const total = data?.total ?? 0;
  const hayMas = mensajes.length < total;

  const cargarAnteriores = useCallback(() => {
    if (query.isFetching) return;
    setPagina((actual) => actual + 1);
  }, [query.isFetching]);

  return {
    mensajes,
    total,
    hayMas,
    cargarAnteriores,
    isLoading: query.isLoading,
    isFetchingAnteriores: query.isFetching && !query.isLoading && pagina > 1,
    isError: query.isError,
    error: query.error,
    refetch: () => void query.refetch(),
  };
}

/**
 * Respuesta del asesor (`POST /conversaciones/:id/mensajes`). NO optimista:
 * al confirmar, invalida el hilo afectado y el listado (para que la
 * conversación se reordene por `ultimoMensajeEn`). El toast de error es
 * global; no se dispara un toast de éxito por mensaje enviado (sería ruido
 * en un chat -- la burbuja que aparece es la confirmación).
 */
export function useEnviarMensaje(conversacionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (texto: string) => enviarMensajeApi(conversacionId, texto),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [CONVERSACIONES_QUERY_KEY, conversacionId, "mensajes"],
      });
      void queryClient.invalidateQueries({ queryKey: [CONVERSACIONES_QUERY_KEY] });
    },
  });
}
