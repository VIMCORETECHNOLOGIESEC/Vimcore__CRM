import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  assignLeadsMasivoApi,
  fetchLeadsApi,
  fetchRedesSocialesCatalogoApi,
  type LeadsQueryParams,
  type RedesSocialesCatalogoParams,
} from "./leads.api";

const LEADS_QUERY_KEY = "leads";
const REDES_SOCIALES_CATALOGO_QUERY_KEY = "leads-redes-sociales-catalogo";

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
 * Catálogo de `redSocial` en cascada con los demás filtros activos de F3
 * (backend real, `GET /leads/catalogo/redes-sociales`) -- reemplaza a
 * `useRedesSocialesActivas` (`GET /bridges/redes-activas`, admin-only,
 * `funcionalidades/bridges/useBridges.ts`) como fuente del filtro "Red
 * social" de `LeadsFiltros.tsx`. Sin `enabled` gateado por rol: el propio
 * endpoint ya scopea por rol (`buildWhere`, sin `requireRole`), visible para
 * cualquier usuario autenticado. La query key incluye `params` (sin
 * `redSocial`, ya excluido del tipo) para que TanStack Query refetchee el
 * catálogo cada vez que cambia cualquier OTRO filtro.
 */
export function useRedesSocialesCatalogo(params: RedesSocialesCatalogoParams) {
  return useQuery({
    queryKey: [REDES_SOCIALES_CATALOGO_QUERY_KEY, params],
    queryFn: () => fetchRedesSocialesCatalogoApi(params),
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
