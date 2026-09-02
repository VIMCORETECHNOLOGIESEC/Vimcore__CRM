import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { EstadoCita, ModalidadCita } from "@/tipos/cita";
import type { FormaPago } from "@/tipos/lead";
import type { EtapaCalificable, RespuestasFormulario } from "@/tipos/formulario";
import { TUTORIAL_MOCK_LEAD, TUTORIAL_MOCK_LEAD_ID } from "../tutorial/tutorialMockLead";
import {
  cancelCitaApi,
  fetchCitasLeadApi,
  fetchFormularioEtapaApi,
  fetchLeadDetalleApi,
  handoffToVendedorApi,
  markCitaResultApi,
  reassignApi,
  rescheduleCitaApi,
  scheduleCitaApi,
  transicionEtapaApi,
} from "./leadDetalle.api";

const LEAD_DETALLE_QUERY_KEY = "lead-detalle";
const LEADS_LISTA_QUERY_KEY = "leads";
const CITAS_LEAD_QUERY_KEY = "citas-lead";

/**
 * Hooks TanStack Query del detalle de lead (F4). Misma forma que tendrán
 * contra el backend real -- ver `leadDetalle.api.ts` para los puntos de
 * integración pendientes (M6/M7).
 *
 * `empresaId` (drill-down de holding, `useVistaEmpresa()`, `LeadDetallePage.tsx`)
 * se reenvía en la query key y a `fetchLeadDetalleApi` -- mismo criterio que
 * `useLeads`/`useBridges`/`useOportunidades`, para que la caché de
 * TanStack Query no mezcle el lead de una empresa con el de otra al cambiar
 * de vista. Esto NO corrige por sí solo el 403 real de
 * `leads.access.ts::canRead` (todavía no resuelve `empresaId`) -- es
 * preparación de frontend, ver el prompt de esta tarea.
 */
export function useLeadDetalle(leadId: string, empresaId?: string) {
  return useQuery({
    queryKey: [LEAD_DETALLE_QUERY_KEY, leadId, empresaId],
    // Lead demo del tutorial (`tutorialMockLead.ts`): se sirve local, sin red
    // -- el tour nunca debe pegarle al backend real con este id inventado.
    queryFn: () =>
      leadId === TUTORIAL_MOCK_LEAD_ID
        ? Promise.resolve(TUTORIAL_MOCK_LEAD)
        : fetchLeadDetalleApi(leadId, empresaId),
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
    // Mismo criterio que `useLeadDetalle`: el lead demo del tutorial nunca
    // tiene citas reales que consultar.
    queryFn: () => (leadId === TUTORIAL_MOCK_LEAD_ID ? Promise.resolve([]) : fetchCitasLeadApi(leadId)),
  });
}

/**
 * Cambiar de etapa ES enviar el formulario de la etapa destino ("sin
 * formulario no hay transición", docs/02 §6) -- no existe una mutación
 * separada de "cambiar etapa" sin formulario. Wrapper fino sobre
 * `transicionEtapaApi` (design D-B2) para las etapas NUEVO/CONTACTADO/CITA.
 */
export function useSubmitFormularioEtapa(leadId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ etapa, respuestas }: { etapa: EtapaCalificable; respuestas: RespuestasFormulario }) =>
      transicionEtapaApi(leadId, { etapa, respuestas }),
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
      estado: Extract<EstadoCita, "CUMPLIDA" | "NO_ASISTIO">;
    }) => markCitaResultApi(citaId, estado),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [CITAS_LEAD_QUERY_KEY, leadId] });
      toast.success("Resultado de la cita registrado.");
    },
  });
}

/**
 * Cancelar cita (design D-B1, unidad B2) -- hook dedicado, separado de
 * `useMarkCitaResult`, contra `POST /citas/:citaId/cancelar` sin body. Antes
 * `PanelCitas.tsx` reusaba `useMarkCitaResult` con `estado: "CANCELADA"`
 * contra `/resultado`, que el backend real rechaza con 400.
 */
export function useCancelCita(leadId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (citaId: string) => cancelCitaApi(citaId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [CITAS_LEAD_QUERY_KEY, leadId] });
      toast.success("Cita cancelada correctamente.");
    },
  });
}

/**
 * Wrapper fino sobre `transicionEtapaApi` (design D-B2) para el cierre en
 * Venta. `fechaCierre` y `observaciones` se reciben del formulario (sin
 * tocarlo, fuera del alcance de este cambio) pero NO se envían al backend
 * real: el servidor fija `cerradoEn` (D13) y `patchEtapaBodySchema` no
 * declara un campo `observaciones` para VENTA -- Zod los descartaría de
 * todos modos (`z.object` ignora claves desconocidas), así que se omiten
 * acá explícitamente en vez de mandarlos sin efecto. `productoVendido`
 * (frontend) se renombra a `productoServicio` (backend real).
 */
export function useSubmitCierreVenta(leadId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      fechaCierre: string;
      montoVenta: number;
      productoVendido: string;
      formaPago: FormaPago;
      observaciones?: string;
    }) =>
      transicionEtapaApi(leadId, {
        etapa: "VENTA",
        montoVenta: input.montoVenta,
        productoServicio: input.productoVendido,
        formaPago: input.formaPago,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [LEAD_DETALLE_QUERY_KEY, leadId] });
      void queryClient.invalidateQueries({ queryKey: [LEADS_LISTA_QUERY_KEY] });
      toast.success("Lead cerrado como Venta.");
    },
  });
}

/**
 * Wrapper fino sobre `transicionEtapaApi` (design D-B2) para el cierre en No
 * Venta. `fechaCierre` se recibe del formulario pero no se envía (mismo
 * motivo que `useSubmitCierreVenta`: el servidor fija `cerradoEn`).
 * `observacionMotivo` (frontend) se renombra a `observacionCierre`
 * (backend real, mín. 20 caracteres validado también en el servidor).
 */
export function useSubmitCierreNoVenta(leadId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { fechaCierre: string; observacionMotivo: string }) =>
      transicionEtapaApi(leadId, { etapa: "NO_VENTA", observacionCierre: input.observacionMotivo }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [LEAD_DETALLE_QUERY_KEY, leadId] });
      void queryClient.invalidateQueries({ queryKey: [LEADS_LISTA_QUERY_KEY] });
      toast.success("Lead cerrado como No Venta.");
    },
  });
}
