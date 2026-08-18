import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { assignLeadsMasivoApi, fetchLeadsApi, type LeadsQueryParams } from "./leads.api";

const LEADS_QUERY_KEY = "leads";

/**
 * Trae el listado de leads paginado y filtrado (F3), backend real -- ver
 * `leads.api.ts`. `keepPreviousData` evita el parpadeo a "cargando" al
 * cambiar de página o filtro, mostrando la página anterior hasta que llega
 * la nueva (docs/07, "ninguna operación deja la pantalla congelada").
 *
 * `LeadsContextoRol` desapareció (integración F3/F4): el filtrado por rol lo
 * hace el backend a partir del JWT, no un parámetro que mande el cliente.
 */
export function useLeads(params: LeadsQueryParams) {
  return useQuery({
    queryKey: [LEADS_QUERY_KEY, params],
    queryFn: () => fetchLeadsApi(params),
    placeholderData: keepPreviousData,
  });
}

/**
 * Asignación masiva de leads (supervisor/administrador, docs/07 F3), backend
 * real -- `POST /leads/asignar-lote` (D-A1) devuelve un reporte por lead, no
 * es all-or-nothing: si hubo fallos parciales, el toast lo refleja en vez de
 * anunciar éxito total.
 */
export function useAssignLeadsMasivo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ leadIds, responsableId }: { leadIds: string[]; responsableId: string }) =>
      assignLeadsMasivoApi(leadIds, responsableId),
    onSuccess: (resultado) => {
      void queryClient.invalidateQueries({ queryKey: [LEADS_QUERY_KEY] });
      if (resultado.fallidos.length === 0) {
        toast.success(`${resultado.resumen.exitosos} lead(s) reasignado(s) correctamente.`);
        return;
      }
      if (resultado.exitosos.length === 0) {
        toast.error(`No se pudo reasignar ningún lead (${resultado.resumen.fallidos} fallo(s)).`);
        return;
      }
      toast.warning(
        `${resultado.resumen.exitosos} lead(s) reasignado(s), ${resultado.resumen.fallidos} fallaron.`,
      );
    },
  });
}
