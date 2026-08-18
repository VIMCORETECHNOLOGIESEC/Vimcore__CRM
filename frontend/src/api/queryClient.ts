import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getErrorMessage } from "./httpClient";

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
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  }),
});
