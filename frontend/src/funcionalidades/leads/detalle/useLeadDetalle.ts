import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { EstadoCita, ModalidadCita } from "@/tipos/cita";
import type { FormaPago } from "@/tipos/lead";
import type { EtapaCalificable, RespuestasFormulario } from "@/tipos/formulario";
import {
  fetchCitasLeadApi,
  fetchFormularioEtapaApi,
  fetchLeadDetalleApi,
  handoffToVendedorApi,
  markCitaResultApi,
  reassignApi,
  rescheduleCitaApi,
  scheduleCitaApi,
  submitCierreNoVentaApi,
  submitCierreVentaApi,
  submitFormularioEtapaApi,
} from "./leadDetalle.api";

const LEAD_DETALLE_QUERY_KEY = "lead-detalle";
const LEADS_LISTA_QUERY_KEY = "leads";
const CITAS_LEAD_QUERY_KEY = "citas-lead";

/**
 * Hooks TanStack Query del detalle de lead (F4). Misma forma que tendrán
 * contra el backend real -- ver `leadDetalle.api.ts` para los puntos de
 * integración pendientes (M6/M7).
 */
export function useLeadDetalle(leadId: string) {
  return useQuery({
    queryKey: [LEAD_DETALLE_QUERY_KEY, leadId],
    queryFn: () => fetchLeadDetalleApi(leadId),
  });
}

export function useFormularioEtapa(etapa: EtapaCalificable | null) {
  return useQuery({
    queryKey: ["formulario-etapa", etapa],
    queryFn: () => fetchFormularioEtapaApi(etapa as EtapaCalificable),
    enabled: etapa !== null,
  });
}

export function useCitasLead(leadId: string) {
  return useQuery({
    queryKey: [CITAS_LEAD_QUERY_KEY, leadId],
    queryFn: () => fetchCitasLeadApi(leadId),
  });
}

/**
 * Cambiar de etapa ES enviar el formulario de la etapa destino ("sin
 * formulario no hay transición", docs/02 §6) -- no existe una mutación
 * separada de "cambiar etapa" sin formulario.
 */
export function useSubmitFormularioEtapa(leadId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ etapa, respuestas }: { etapa: EtapaCalificable; respuestas: RespuestasFormulario }) =>
      submitFormularioEtapaApi(leadId, etapa, respuestas),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [LEAD_DETALLE_QUERY_KEY, leadId] });
      void queryClient.invalidateQueries({ queryKey: [LEADS_LISTA_QUERY_KEY] });
      toast.success("Etapa actualizada correctamente.");
    },
  });
}

export function useHandoffToVendedor(leadId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vendedorId?: string) => handoffToVendedorApi(leadId, vendedorId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [LEAD_DETALLE_QUERY_KEY, leadId] });
      void queryClient.invalidateQueries({ queryKey: [LEADS_LISTA_QUERY_KEY] });
      toast.success("Lead traspasado a vendedor correctamente.");
    },
  });
}

export function useReassignLead(leadId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (responsableId: string) => reassignApi(leadId, responsableId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [LEAD_DETALLE_QUERY_KEY, leadId] });
      void queryClient.invalidateQueries({ queryKey: [LEADS_LISTA_QUERY_KEY] });
      toast.success("Lead reasignado correctamente.");
    },
  });
}

export function useScheduleCita(leadId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { usuarioId: string; programadaPara: string; modalidad: ModalidadCita; notas?: string }) =>
      scheduleCitaApi({ leadId, ...input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [CITAS_LEAD_QUERY_KEY, leadId] });
      toast.success("Cita agendada correctamente.");
    },
  });
}

export function useRescheduleCita(leadId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ citaId, programadaPara }: { citaId: string; programadaPara: string }) =>
      rescheduleCitaApi(citaId, programadaPara),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [CITAS_LEAD_QUERY_KEY, leadId] });
      toast.success("Cita reprogramada correctamente.");
    },
  });
}

export function useMarkCitaResult(leadId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      citaId,
      estado,
    }: {
      citaId: string;
      estado: Extract<EstadoCita, "CUMPLIDA" | "NO_ASISTIO" | "CANCELADA">;
    }) => markCitaResultApi(citaId, estado),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [CITAS_LEAD_QUERY_KEY, leadId] });
      toast.success("Resultado de la cita registrado.");
    },
  });
}

export function useSubmitCierreVenta(leadId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      fechaCierre: string;
      montoVenta: number;
      productoVendido: string;
      formaPago: FormaPago;
      observaciones?: string;
    }) => submitCierreVentaApi(leadId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [LEAD_DETALLE_QUERY_KEY, leadId] });
      void queryClient.invalidateQueries({ queryKey: [LEADS_LISTA_QUERY_KEY] });
      toast.success("Lead cerrado como Venta.");
    },
  });
}

export function useSubmitCierreNoVenta(leadId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { fechaCierre: string; observacionMotivo: string }) =>
      submitCierreNoVentaApi(leadId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [LEAD_DETALLE_QUERY_KEY, leadId] });
      void queryClient.invalidateQueries({ queryKey: [LEADS_LISTA_QUERY_KEY] });
      toast.success("Lead cerrado como No Venta.");
    },
  });
}
