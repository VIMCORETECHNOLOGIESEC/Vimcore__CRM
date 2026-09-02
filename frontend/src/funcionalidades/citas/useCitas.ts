import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { EstadoCita } from "@/tipos/cita";
import {
  cancelCitaCalendarioApi,
  fetchClientesParaCitaApi,
  fetchCitasApi,
  markCitaResultCalendarioApi,
  rescheduleCitaCalendarioApi,
  scheduleCitaCalendarioApi,
  type ClientesParaCitaQueryParams,
  type CitasQueryParams,
  type RescheduleCitaInput,
  type SaveCitaInput,
} from "./citas.api";

export const CITAS_QUERY_KEY = "citas";
const CLIENTES_PARA_CITA_QUERY_KEY = "clientes-para-cita";

export function useCitas(params: CitasQueryParams) {
  return useQuery({
    queryKey: [CITAS_QUERY_KEY, params],
    queryFn: () => fetchCitasApi(params),
    placeholderData: keepPreviousData,
  });
}

export function useClientesParaCita(params: ClientesParaCitaQueryParams | null) {
  return useQuery({
    queryKey: [CLIENTES_PARA_CITA_QUERY_KEY, params],
    queryFn: () => fetchClientesParaCitaApi(params as ClientesParaCitaQueryParams),
    enabled: params !== null,
  });
}

export function useScheduleCitaCalendario() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveCitaInput) => scheduleCitaCalendarioApi(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [CITAS_QUERY_KEY] });
      toast.success("Cita agendada correctamente.");
    },
  });
}

export function useRescheduleCitaCalendario() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ citaId, input }: { citaId: string; input: RescheduleCitaInput }) =>
      rescheduleCitaCalendarioApi(citaId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [CITAS_QUERY_KEY] });
      toast.success("Cita reprogramada correctamente.");
    },
  });
}

export function useMarkCitaResultCalendario() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ citaId, estado }: { citaId: string; estado: Extract<EstadoCita, "CUMPLIDA" | "NO_ASISTIO"> }) =>
      markCitaResultCalendarioApi(citaId, estado),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [CITAS_QUERY_KEY] });
      toast.success("Resultado de la cita registrado.");
    },
  });
}

export function useCancelCitaCalendario() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (citaId: string) => cancelCitaCalendarioApi(citaId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [CITAS_QUERY_KEY] });
      toast.success("Cita cancelada correctamente.");
    },
  });
}
