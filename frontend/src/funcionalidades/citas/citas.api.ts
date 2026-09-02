import { httpClient, type QueryParamValue } from "@/api/httpClient";
import type { Cita, EstadoCita, ModalidadCita } from "@/tipos/cita";
import { normalizeCitaSchedulingError } from "./citas.errors";

export interface CitaCalendario extends Cita {
  lead: {
    id: string;
    cliente: {
      nombre: string;
      telefonoNormalizado: string | null;
    };
  };
  usuario: {
    id: string;
    nombre: string;
  };
}

interface BackendCitaCalendario {
  id: string;
  leadId: string;
  usuarioId: string;
  programadaPara: string;
  finalizaEn?: string | null;
  modalidad: ModalidadCita;
  estado: EstadoCita;
  notas: string | null;
  lead?: {
    id: string;
    cliente: {
      nombre: string | null;
      telefonoNormalizado: string | null;
    };
  };
  usuario?: {
    id: string;
    nombre: string;
  };
}

interface CitasCalendarioEnvelope {
  citas: BackendCitaCalendario[];
}

export interface CitasQueryParams {
  desde: string;
  hasta: string;
  asesorId?: string;
}

export interface SaveCitaInput {
  leadId: string;
  programadaPara: string;
  finalizaEn: string;
  modalidad: ModalidadCita;
  notas?: string;
  usuarioId?: string;
}

export type RescheduleCitaInput = Omit<SaveCitaInput, "leadId">;

function mapCitaCalendarioFromApi(raw: BackendCitaCalendario): CitaCalendario {
  return {
    id: raw.id,
    leadId: raw.leadId,
    usuarioId: raw.usuarioId,
    programadaPara: raw.programadaPara,
    finalizaEn: raw.finalizaEn ?? undefined,
    modalidad: raw.modalidad,
    estado: raw.estado,
    notas: raw.notas ?? undefined,
    lead: {
      id: raw.lead?.id ?? raw.leadId,
      cliente: {
        nombre: raw.lead?.cliente.nombre ?? "Lead sin nombre",
        telefonoNormalizado: raw.lead?.cliente.telefonoNormalizado ?? null,
      },
    },
    usuario: {
      id: raw.usuario?.id ?? raw.usuarioId,
      nombre: raw.usuario?.nombre ?? "Sin asesor",
    },
  };
}

function normalizeCitasResponse(response: CitasCalendarioEnvelope | BackendCitaCalendario[]): BackendCitaCalendario[] {
  return Array.isArray(response) ? response : response.citas;
}

function mapCitaMutationError(error: unknown): never {
  normalizeCitaSchedulingError(error);
}

export async function fetchCitasApi(params: CitasQueryParams): Promise<CitaCalendario[]> {
  const response = await httpClient.get<CitasCalendarioEnvelope | BackendCitaCalendario[]>("/citas", {
    params: params as unknown as Record<string, QueryParamValue>,
  });
  return normalizeCitasResponse(response).map(mapCitaCalendarioFromApi);
}

export async function scheduleCitaCalendarioApi(input: SaveCitaInput): Promise<CitaCalendario> {
  try {
    const { cita } = await httpClient.post<{ cita: BackendCitaCalendario }>(`/leads/${input.leadId}/citas`, {
      programadaPara: input.programadaPara,
      finalizaEn: input.finalizaEn,
      modalidad: input.modalidad,
      notas: input.notas,
      usuarioId: input.usuarioId,
    });
    return mapCitaCalendarioFromApi(cita);
  } catch (error) {
    mapCitaMutationError(error);
  }
}

export async function rescheduleCitaCalendarioApi(
  citaId: string,
  input: RescheduleCitaInput,
): Promise<CitaCalendario> {
  try {
    const { cita } = await httpClient.post<{ cita: BackendCitaCalendario }>(`/citas/${citaId}/reprogramar`, input);
    return mapCitaCalendarioFromApi(cita);
  } catch (error) {
    mapCitaMutationError(error);
  }
}

export async function markCitaResultCalendarioApi(
  citaId: string,
  estado: Extract<EstadoCita, "CUMPLIDA" | "NO_ASISTIO">,
): Promise<CitaCalendario> {
  const { cita } = await httpClient.post<{ cita: BackendCitaCalendario }>(`/citas/${citaId}/resultado`, { estado });
  return mapCitaCalendarioFromApi(cita);
}

export async function cancelCitaCalendarioApi(citaId: string): Promise<CitaCalendario> {
  const { cita } = await httpClient.post<{ cita: BackendCitaCalendario }>(`/citas/${citaId}/cancelar`);
  return mapCitaCalendarioFromApi(cita);
}
