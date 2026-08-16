import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/funcionalidades/autenticacion/AuthContext";
import { assignLeadsMasivoApi, fetchLeadsApi, type LeadsQueryParams } from "./leads.api";

const LEADS_QUERY_KEY = "leads";

/**
 * Trae el listado de leads paginado y filtrado (F3). Misma forma de retorno
 * que tendría contra el backend real -- ver `leads.api.ts` para el punto de
 * integración exacto. `keepPreviousData` evita el parpadeo a "cargando" al
 * cambiar de página o filtro, mostrando la página anterior hasta que llega
 * la nueva (docs/07, "ninguna operación deja la pantalla congelada").
 */
export function useLeads(params: LeadsQueryParams) {
  const { user } = useAuth();

  return useQuery({
    queryKey: [LEADS_QUERY_KEY, params, user?.id, user?.rol],
    queryFn: () =>
      fetchLeadsApi(
        params,
        user ? { rol: user.rol, usuarioId: user.id } : undefined,
      ),
    placeholderData: keepPreviousData,
  });
}

/**
 * Asignación masiva de leads (supervisor/administrador, docs/07 F3). Invalida
 * la lista de leads al terminar para que la tabla refleje el nuevo
 * responsable -- ver `leads.api.ts::assignLeadsMasivoApi` para el punto de
 * integración pendiente con M6.
 */
export function useAssignLeadsMasivo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ leadIds, responsableId }: { leadIds: string[]; responsableId: string }) =>
      assignLeadsMasivoApi(leadIds, responsableId),
    onSuccess: (_datos, variables) => {
      void queryClient.invalidateQueries({ queryKey: [LEADS_QUERY_KEY] });
      toast.success(
        `${variables.leadIds.length} lead(s) reasignado(s) correctamente.`,
      );
    },
  });
}
