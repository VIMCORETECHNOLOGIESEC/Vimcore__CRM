import { httpClient } from "@/api/httpClient";
import type { Cita, EstadoCita, ModalidadCita } from "@/tipos/cita";
import type { FormaPago, Lead } from "@/tipos/lead";
import type { EtapaCalificable, FormularioEtapa, RespuestasFormulario } from "@/tipos/formulario";
import { getCatalogoVendedores, mapLeadFromApi, type BackendLeadDetalleConSla } from "../leads.api";
import { getFormularioEtapa } from "./formulariosEtapa";

/**
 * Capa de datos del detalle de lead -- backend real (M6/M7, integración
 * F3/F4). Ver `sdd/integracion-leads-f3-f4/design` (D-A2/D-B1/D-B2) y
 * `docs/06-modulos-backend.md`.
 */

interface BackendLeadEnvelope {
  lead: BackendLeadDetalleConSla;
}

/** `GET /leads/:id` (backend real). 404 si no existe, 403 sin acceso -- `httpClient` los traduce a `ApiError`. */
export async function fetchLeadDetalleApi(leadId: string): Promise<Lead> {
  const { lead } = await httpClient.get<BackendLeadEnvelope>(`/leads/${leadId}`);
  return mapLeadFromApi(lead);
}

// ---------------------------------------------------------------------------
// Formulario de etapa
// ---------------------------------------------------------------------------

interface BackendOpcionRespuesta {
  /** Clave estable de la opción (equivalente a `valor` del tipo del frontend). */
  clave: string;
  etiqueta: string;
  /** 0-10 (equivalente a `puntaje` del tipo del frontend). */
  valor: number;
}

interface BackendPreguntaFormulario {
  clave: string;
  etiqueta: string;
  peso: number;
  opciones: BackendOpcionRespuesta[];
}

interface BackendFormularioEtapa {
  etapa: EtapaCalificable;
  preguntas: BackendPreguntaFormulario[];
}

/**
 * `GET /formularios/:etapa` (backend real, existe desde antes de esta
 * integración -- ver `sdd/integracion-leads-f3-f4/explore`). Los nombres de
 * campo de `OpcionRespuesta` están invertidos entre backend y frontend:
 * `clave` (backend) = `valor` (frontend, la clave estable de la opción);
 * `valor` (backend, 0-10) = `puntaje` (frontend) -- se remapean acá, una
 * sola vez, para no arrastrar la inconsistencia a cada consumidor.
 */
export async function fetchFormularioEtapaApi(etapa: EtapaCalificable): Promise<FormularioEtapa> {
  const { formulario } = await httpClient.get<{ formulario: BackendFormularioEtapa }>(
    `/formularios/${etapa}`,
  );
  return {
    etapa: formulario.etapa,
    preguntas: formulario.preguntas.map((pregunta) => ({
      clave: pregunta.clave,
      etiqueta: pregunta.etiqueta,
      peso: pregunta.peso,
      opciones: pregunta.opciones.map((opcion) => ({
        valor: opcion.clave,
        etiqueta: opcion.etiqueta,
        puntaje: opcion.valor,
      })),
    })),
  };
}

// ---------------------------------------------------------------------------
// Transición de etapa (design D-B2): un único endpoint real, `PATCH
// /leads/:id/etapa`, con body discriminado por `etapa` -- colapsa las 3
// funciones que existían por separado en el mock
// (`submitFormularioEtapaApi`/`submitCierreVentaApi`/`submitCierreNoVentaApi`).
// Los 3 hooks de `useLeadDetalle.ts` sobreviven como wrappers finos sobre
// esta única función (design: "un `useTransicionEtapa` único fue
// rechazado" -- conservan sus toasts distintos).
// ---------------------------------------------------------------------------

export type TransicionEtapaInput =
  | { etapa: "VENTA"; montoVenta: number; productoServicio: string; formaPago: FormaPago }
  | { etapa: "NO_VENTA"; observacionCierre: string }
  | { etapa: "NUEVO" | "CONTACTADO" | "CITA"; respuestas: RespuestasFormulario };

/**
 * `PATCH /leads/:id/etapa` (backend real). El servidor fija `cerradoEn`
 * (D13) -- el cliente nunca lo manda. No se usa el `Lead` de la respuesta:
 * es una forma plana (`Lead` de Prisma sin relaciones, ver
 * `leads.service.ts::transitionEtapa`), distinta de la forma enriquecida
 * que consume la UI (`GET /leads/:id`) -- los 3 hooks invalidan la query de
 * detalle en su `onSuccess`, que vuelve a traer el lead completo.
 */
export async function transicionEtapaApi(leadId: string, input: TransicionEtapaInput): Promise<void> {
  await httpClient.patch(`/leads/${leadId}/etapa`, input);
}

/**
 * Traspaso a vendedor (docs/02 §5). `POST /leads/:id/traspasar` (backend
 * real) -- igual que `transicionEtapaApi`, la respuesta es un `Lead` plano
 * sin relaciones; el caller invalida la query de detalle en su `onSuccess`.
 */
export async function handoffToVendedorApi(leadId: string, vendedorId?: string): Promise<void> {
  await httpClient.post(`/leads/${leadId}/traspasar`, { vendedorId });
}

/**
 * Reasignación (docs/02 §5). `POST /leads/:id/reasignar` (backend real,
 * pool ASESOR únicamente -- `AccionesResponsable.tsx` ya restringe su
 * buscador a `getCatalogoResponsables("ASESORES")`, así que `responsableId`
 * siempre corresponde a un asesor en la práctica).
 */
export async function reassignApi(leadId: string, responsableId: string): Promise<void> {
  await httpClient.post(`/leads/${leadId}/reasignar`, { asesorId: responsableId });
}

// ---------------------------------------------------------------------------
// Panel de citas (backend real, M7)
// ---------------------------------------------------------------------------

interface BackendCita {
  id: string;
  leadId: string;
  usuarioId: string;
  programadaPara: string;
  modalidad: ModalidadCita;
  estado: EstadoCita;
  notas: string | null;
}

function mapCitaFromApi(raw: BackendCita): Cita {
  return {
    id: raw.id,
    leadId: raw.leadId,
    usuarioId: raw.usuarioId,
    programadaPara: raw.programadaPara,
    modalidad: raw.modalidad,
    estado: raw.estado,
    notas: raw.notas ?? undefined,
  };
}

/** `GET /leads/:id/citas` (backend real). */
export async function fetchCitasLeadApi(leadId: string): Promise<Cita[]> {
  const { citas } = await httpClient.get<{ citas: BackendCita[] }>(`/leads/${leadId}/citas`);
  return citas.map(mapCitaFromApi);
}

interface ScheduleCitaInput {
  leadId: string;
  usuarioId: string;
  programadaPara: string;
  modalidad: ModalidadCita;
  notas?: string;
}

/**
 * `POST /leads/:id/citas` (backend real). "No se agenda una cita en el
 * pasado" lo valida el servidor (`citas.service.ts::assertProgramadaEnFuturo`)
 * -- `httpClient` traduce el 422 a `ApiError`, no se duplica la validación acá.
 */
export async function scheduleCitaApi(input: ScheduleCitaInput): Promise<Cita> {
  const { cita } = await httpClient.post<{ cita: BackendCita }>(`/leads/${input.leadId}/citas`, {
    usuarioId: input.usuarioId,
    programadaPara: input.programadaPara,
    modalidad: input.modalidad,
    notas: input.notas,
  });
  return mapCitaFromApi(cita);
}

/** `POST /citas/:citaId/reprogramar` (backend real -- verbo POST, no PATCH). */
export async function rescheduleCitaApi(citaId: string, programadaPara: string): Promise<Cita> {
  const { cita } = await httpClient.post<{ cita: BackendCita }>(`/citas/${citaId}/reprogramar`, {
    programadaPara,
  });
  return mapCitaFromApi(cita);
}

/**
 * `POST /citas/:citaId/resultado` (backend real -- verbo POST, no PATCH).
 * El tipo de `estado` sigue aceptando `"CANCELADA"` a propósito: el backend
 * real SOLO acepta `CUMPLIDA|NO_ASISTIO` en este endpoint (`marcarResultadoCitaBodySchema`)
 * y rechazaría `CANCELADA` con 400 -- el fix de ese bug (separar cancelar en
 * su propio hook contra `POST /citas/:citaId/cancelar`, D-B1 del diseño) es
 * responsabilidad de la unidad B2, deliberadamente fuera de este cambio.
 */
export async function markCitaResultApi(
  citaId: string,
  estado: Extract<EstadoCita, "CUMPLIDA" | "NO_ASISTIO" | "CANCELADA">,
): Promise<Cita> {
  const { cita } = await httpClient.post<{ cita: BackendCita }>(`/citas/${citaId}/resultado`, { estado });
  return mapCitaFromApi(cita);
}

export { getCatalogoVendedores };
