import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  fetchConfiguracionEmpresaApi,
  updateConfiguracionEmpresaApi,
  type UpdateConfiguracionEmpresaInput,
} from "./configuracion-empresa.api";

export const CONFIGURACION_EMPRESA_QUERY_KEY = "configuracion-empresa";

/** Configuración de marca vigente (nombre + colores). Backend real. */
export function useConfiguracionEmpresa() {
  return useQuery({
    queryKey: [CONFIGURACION_EMPRESA_QUERY_KEY],
    queryFn: fetchConfiguracionEmpresaApi,
  });
}

/**
 * Edición de la configuración de marca (solo `ADMINISTRADOR`, ruta
 * protegida en `router.tsx`). El backend devuelve el objeto completo
 * actualizado -- se escribe directo en la caché de la query en vez de
 * invalidar y volver a pedir, mismo dato en un único round-trip.
 */
export function useUpdateConfiguracionEmpresa() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateConfiguracionEmpresaInput) => updateConfiguracionEmpresaApi(input),
    onSuccess: (data) => {
      queryClient.setQueryData([CONFIGURACION_EMPRESA_QUERY_KEY], data);
      toast.success("Configuración de la empresa actualizada correctamente.");
    },
  });
}
