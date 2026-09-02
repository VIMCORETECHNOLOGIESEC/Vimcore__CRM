import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getErrorMessage } from "./httpClient";

/**
 * Registro de tipos de TanStack Query (patrón oficial documentado en
 * https://tanstack.com/query/latest/docs/framework/react/typescript#registering-a-default-meta-type)
 * para poder tipar `query.meta?.silent` sin recurrir a `any`/`unknown` cast.
 *
 * `silent: true` es la única bandera soportada hoy: silencia el toast
 * GLOBAL de error de una query puntual cuando la UI ya tiene su propio
 * manejo "calmo" del estado de error (ver `useWhatsAppEstadoActual` con
 * `silent: true` desde `LeadDetallePage.tsx` -- ese chat ya muestra
 * `WhatsAppSinConexion` como estado esperado, no hace falta redundar con un
 * toast rojo encima). No aplica a `MutationCache` -- ninguna mutación de
 * este proyecto necesita este comportamiento hoy.
 */
declare module "@tanstack/react-query" {
  interface Register {
    queryMeta: {
      silent?: boolean;
    };
  }
}

/**
 * Cliente de TanStack Query con manejo global de errores (docs/07 F1).
 * Toda petición fallida (query o mutation) muestra un mensaje accionable en
 * español vía `sonner`, nunca un código HTTP crudo (docs/07, "Criterios
 * transversales de calidad").
 *
 * `retry: 1` evita reintentos silenciosos indefinidos que dejarían la
 * pantalla "colgada" sin feedback (misma sección de criterios).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (query.meta?.silent) return;
      toast.error(getErrorMessage(error));
    },
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  }),
});
