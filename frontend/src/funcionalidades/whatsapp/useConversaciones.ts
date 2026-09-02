import { useCallback, useEffect, useMemo, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import type { Mensaje } from "@/tipos/conversacion";
import {
  enviarMensajeApi,
  listarConversacionesApi,
  listarMensajesApi,
  marcarConversacionLeidaApi,
  type ConversacionesQueryParams,
  type LimiteConversaciones,
  type ListarConversacionesResponse,
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
export function useConversaciones(params: ConversacionesQueryParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [CONVERSACIONES_QUERY_KEY, params],
    queryFn: () => listarConversacionesApi(params),
    placeholderData: keepPreviousData,
    enabled: options?.enabled ?? true,
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

/**
 * Escribe `noLeido` para una conversación puntual en toda página cacheada
 * del listado (`useConversaciones`), sin tocar el hilo de mensajes (clave de
 * distinto largo: `[CONVERSACIONES_QUERY_KEY, id, "mensajes", ...]` vs.
 * `[CONVERSACIONES_QUERY_KEY, { pagina, limite, ... }]`). Compartido por
 * `useMarcarConversacionLeida` (mutación local, al abrir una conversación) y
 * `useNotificacionesRealtime.ts` (evento SSE `whatsapp.conversacion-leida`,
 * sincroniza el mismo flip entre las propias pestañas/dispositivos del
 * usuario).
 */
export function marcarNoLeidoEnCache(
  queryClient: QueryClient,
  conversacionId: string,
  noLeido: boolean,
): void {
  queryClient.setQueriesData<ListarConversacionesResponse>(
    {
      predicate: (query) =>
        query.queryKey[0] === CONVERSACIONES_QUERY_KEY && query.queryKey.length === 2,
    },
    (current) => {
      if (!current) return current;
      return {
        ...current,
        conversaciones: current.conversaciones.map((conversacion) =>
          conversacion.id === conversacionId ? { ...conversacion, noLeido } : conversacion,
        ),
      };
    },
  );
}

/**
 * `POST /conversaciones/:id/leido` (D-mensajería, leído/no leído). Flip
 * optimista de `noLeido` sobre el listado en caché en `onMutate` -- sin
 * esperar el refetch, mismo criterio de "sin UI congelada" que el resto del
 * módulo. Sin rollback en error: como mucho el badge tarda un refetch en
 * corregirse, y el toast global de error ya avisa del fallo.
 */
export function useMarcarConversacionLeida() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (conversacionId: string) => marcarConversacionLeidaApi(conversacionId),
    onMutate: (conversacionId: string) => {
      marcarNoLeidoEnCache(queryClient, conversacionId, false);
    },
  });
}

/** Tope máximo admitido por el backend para `limite` (`LIMITES_CONVERSACIONES`). */
const LIMITE_CONTEO_NO_LEIDAS: LimiteConversaciones = 100;

/**
 * Contador global de conversaciones no leídas para el badge del sidebar
 * (`AppSidebar.tsx`, fuera de `ConversacionesPage`). Simplificación
 * deliberada sin endpoint de conteo dedicado: reutiliza el listado paginado
 * con el límite máximo admitido y cuenta `noLeido` en esa única página --
 * correcto para el volumen esperado del MVP. Si en algún momento hay más de
 * `LIMITE_CONTEO_NO_LEIDAS` conversaciones no leídas a la vez, el badge se
 * queda corto (haría falta un endpoint de conteo dedicado en el backend para
 * eliminar ese techo). Se mantiene al día solo por los eventos SSE que ya
 * invalidan/actualizan la clave `[CONVERSACIONES_QUERY_KEY, ...]` en
 * `useNotificacionesRealtime.ts` -- no abre su propia conexión.
 */
export function useConversacionesNoLeidasCount(): number {
  const query = useQuery({
    queryKey: [CONVERSACIONES_QUERY_KEY, { pagina: 1, limite: LIMITE_CONTEO_NO_LEIDAS }],
    queryFn: () => listarConversacionesApi({ pagina: 1, limite: LIMITE_CONTEO_NO_LEIDAS }),
  });
  const conversaciones = query.data?.conversaciones ?? [];
  return conversaciones.filter((conversacion) => conversacion.noLeido).length;
}
