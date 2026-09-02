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

/**
 * `GET /leads` (mismo endpoint real que ya usa `leads.api.ts::fetchLeadsApi`
 * -- NO existe ningun `/cliente`/`/clientes` propio, `Cliente` no tiene ruta
 * publica en toda la API, ver `BackendLeadDetalleConSla` en `leads.api.ts`).
 * Fix (bug real, 2026-09-02): esta pantalla apuntaba a `/cliente`, un
 * endpoint que nunca existio -- 404 siempre al buscar un lead para agendar.
 */
interface BackendLeadParaCita {
  id: string;
  cliente: {
    id: string;
    nombre: string | null;
    telefonoOriginal: string | null;
    telefonoNormalizado: string | null;
  };
}

interface LeadsParaCitaEnvelope {
  leads: BackendLeadParaCita[];
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

function mapClienteParaCitaFromApi(raw: BackendLeadParaCita): ClienteParaCita {
  return {
    leadId: raw.id,
    cliente: {
      id: raw.cliente.id,
      nombre: raw.cliente.nombre ?? "Cliente sin nombre",
      telefonoNormalizado: raw.cliente.telefonoNormalizado,
      telefonoOriginal: raw.cliente.telefonoOriginal,
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
  // `limite: 100` -- tope real del backend (`listLeadsQuerySchema`, solo
  // acepta 10/25/50/100), el filtrado fino por texto lo hace `Command`/cmdk
  // del lado del cliente sobre esta lista (mismo patron que el resto de los
  // combobox del proyecto).
  const queryParams: Record<string, QueryParamValue> = { empresaId: params.empresaId, limite: 100 };
  if (params.asesorId) queryParams.responsableId = params.asesorId;

  const response = await httpClient.get<LeadsParaCitaEnvelope>("/leads", { params: queryParams });
  return (response.leads ?? []).map(mapClienteParaCitaFromApi);
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
