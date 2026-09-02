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

export interface ClienteParaCita {
  leadId: string;
  cliente: {
    id: string;
    nombre: string;
    telefonoNormalizado: string | null;
    telefonoOriginal: string | null;
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
  citas?: BackendCitaCalendario[] | null;
  data?: BackendCitaCalendario[] | null;
  datos?: BackendCitaCalendario[] | null;
  items?: BackendCitaCalendario[] | null;
}

interface BackendClienteParaCita {
  id?: string | null;
  clienteId?: string | null;
  leadId?: string | null;
  lead_id?: string | null;
  nombre?: string | null;
  telefonoNormalizado?: string | null;
  telefono_normalizado?: string | null;
  telefonoOriginal?: string | null;
  telefono_original?: string | null;
  lead?: { id?: string | null } | null;
  cliente?: {
    id?: string | null;
    nombre?: string | null;
    telefonoNormalizado?: string | null;
    telefonoOriginal?: string | null;
  } | null;
}

interface ClientesParaCitaEnvelope {
  clientes?: BackendClienteParaCita[] | null;
  cliente?: BackendClienteParaCita[] | null;
  data?: BackendClienteParaCita[] | null;
  datos?: BackendClienteParaCita[] | null;
  items?: BackendClienteParaCita[] | null;
}

export interface CitasQueryParams {
  desde: string;
  hasta: string;
  asesorId?: string;
  empresaId?: string;
}

export interface SaveCitaInput {
  leadId: string;
  programadaPara: string;
  finalizaEn: string;
  modalidad: ModalidadCita;
  notas?: string;
  usuarioId?: string;
}

export interface ClientesParaCitaQueryParams {
  empresaId: string;
  asesorId?: string;
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

function normalizeCitasResponse(response: CitasCalendarioEnvelope | BackendCitaCalendario[] | null | undefined): BackendCitaCalendario[] {
  if (response == null) return [];
  if (Array.isArray(response)) return response;

  for (const key of ["citas", "data", "datos", "items"] as const) {
    if (key in response) {
      const value = response[key];
      if (value == null) return [];
      if (Array.isArray(value)) return value;
    }
  }

  throw new Error("La respuesta de citas no tiene un formato válido.");
}

function normalizeClientesParaCitaResponse(
  response: ClientesParaCitaEnvelope | BackendClienteParaCita[] | null | undefined,
): BackendClienteParaCita[] {
  if (response == null) return [];
  if (Array.isArray(response)) return response;

  for (const key of ["clientes", "cliente", "data", "datos", "items"] as const) {
    if (key in response) {
      const value = response[key];
      if (value == null) return [];
      if (Array.isArray(value)) return value;
    }
  }

  throw new Error("La respuesta de clientes no tiene un formato válido.");
}

function mapClienteParaCitaFromApi(raw: BackendClienteParaCita): ClienteParaCita {
  const leadId = raw.leadId ?? raw.lead_id ?? raw.lead?.id ?? null;

  if (!leadId) {
    throw new Error("La búsqueda de clientes no devolvió el lead asociado necesario para agendar la cita.");
  }

  return {
    leadId,
    cliente: {
      id: raw.cliente?.id ?? raw.clienteId ?? raw.id ?? leadId,
      nombre: raw.cliente?.nombre ?? raw.nombre ?? "Cliente sin nombre",
      telefonoNormalizado: raw.cliente?.telefonoNormalizado ?? raw.telefonoNormalizado ?? raw.telefono_normalizado ?? null,
      telefonoOriginal: raw.cliente?.telefonoOriginal ?? raw.telefonoOriginal ?? raw.telefono_original ?? null,
    },
  };
}

function mapCitaMutationError(error: unknown): never {
  normalizeCitaSchedulingError(error);
}

export async function fetchCitasApi(params: CitasQueryParams): Promise<CitaCalendario[]> {
  const response = await httpClient.get<CitasCalendarioEnvelope | BackendCitaCalendario[] | null | undefined>("/citas", {
    params: params as unknown as Record<string, QueryParamValue>,
  });
  return normalizeCitasResponse(response).map(mapCitaCalendarioFromApi);
}

export async function fetchClientesParaCitaApi(params: ClientesParaCitaQueryParams): Promise<ClienteParaCita[]> {
  const queryParams: Record<string, QueryParamValue> = { id_empresa: params.empresaId };
  if (params.asesorId) queryParams.id_asesor = params.asesorId;

  const response = await httpClient.get<ClientesParaCitaEnvelope | BackendClienteParaCita[] | null | undefined>(
    "/cliente",
    { params: queryParams },
  );
  return normalizeClientesParaCitaResponse(response).map(mapClienteParaCitaFromApi);
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
