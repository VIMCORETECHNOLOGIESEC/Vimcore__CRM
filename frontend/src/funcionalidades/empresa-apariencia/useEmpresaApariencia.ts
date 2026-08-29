import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PERFIL_QUERY_KEY } from "@/funcionalidades/autenticacion/AuthContext";
import { updateEmpresaAparienciaApi, type UpdateEmpresaAparienciaInput } from "./empresa-apariencia.api";

/**
 * Mutación self-service del color propio de la empresa (Tarea 3). Invalida
 * `["auth", "perfil"]` -- misma query key que `AuthContext.tsx` -- en vez de
 * escribir la respuesta directo en su caché: la respuesta de este endpoint
 * es solo `{colorPrimario, colorSecundario}`, no el perfil completo
 * (`AuthenticatedUser`), así que un `setQueryData` parcial rompería la forma
 * que `AuthProvider` espera. Invalidar dispara un refetch de
 * `GET /auth/perfil` con el color ya actualizado, sin esperar un login
 * nuevo.
 */
export function useUpdateEmpresaApariencia() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateEmpresaAparienciaInput) => updateEmpresaAparienciaApi(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PERFIL_QUERY_KEY });
      toast.success("Apariencia de la empresa actualizada correctamente.");
    },
  });
}
