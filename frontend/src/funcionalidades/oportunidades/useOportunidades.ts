import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  crearOportunidadApi,
  crearProductoApi,
  fetchOportunidadesApi,
  fetchProductosApi,
  type OportunidadesQueryParams,
} from "./oportunidades.api";

/** Query key raíz del listado de oportunidades (Bloque D). Las mutaciones la invalidan. */
export const OPORTUNIDADES_QUERY_KEY = "oportunidades";

/** Query key del catálogo de productos (D14). `useCrearProducto` la invalida. */
export const PRODUCTOS_QUERY_KEY = "productos-oportunidad";

/**
 * Listado paginado y filtrado de oportunidades (`GET /oportunidades`) -- mismo
 * criterio que `funcionalidades/leads/useLeads.ts`: `keepPreviousData` evita el
 * parpadeo a "cargando" al cambiar de página o filtro (docs/07: ninguna
 * operación deja la pantalla congelada). El scoping por rol lo hace el backend
 * a partir del JWT; `empresaId`/`asesorId` solo se honran para
 * ADMINISTRADOR/SUPERVISOR.
 */
export function useOportunidades(params: OportunidadesQueryParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [OPORTUNIDADES_QUERY_KEY, params],
    queryFn: () => fetchOportunidadesApi(params),
    placeholderData: keepPreviousData,
    enabled: options?.enabled ?? true,
  });
}

/** `GET /productos` (D14, catálogo por empresa). Cualquier sesión autenticada puede listarlo. */
export function useProductos(params: { empresaId?: string; activo?: boolean }) {
  return useQuery({
    queryKey: [PRODUCTOS_QUERY_KEY, params],
    queryFn: () => fetchProductosApi(params),
  });
}

/** `POST /productos` (requireRole ADMINISTRADOR). Invalida el catálogo entero al crear. */
export function useCrearProducto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: crearProductoApi,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [PRODUCTOS_QUERY_KEY] });
      toast.success("Producto creado");
    },
  });
}

/**
 * `POST /oportunidades` (D13/D14/D3/D4). Sin toast propio: el llamador
 * (`NuevaOportunidadButton`) navega al detalle recién creado y toastea con su
 * propio mensaje de éxito -- duplicar el aviso acá sería ruido.
 */
export function useCrearOportunidad() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: crearOportunidadApi,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [OPORTUNIDADES_QUERY_KEY] });
    },
  });
}
