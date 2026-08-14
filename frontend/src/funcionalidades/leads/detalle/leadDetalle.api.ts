import type { Cita, EstadoCita, ModalidadCita } from "@/tipos/cita";
import type { FormaPago, Lead } from "@/tipos/lead";
import type { EtapaCalificable, FormularioEtapa, RespuestasFormulario } from "@/tipos/formulario";
import { getCatalogoResponsablesConRol, getCatalogoVendedores, LEADS_MOCK } from "../leads.api";
import { getFormularioEtapa } from "./formulariosEtapa";
import { calculatePuntuacion, calculateSemaforo } from "./puntuacion";

/**
 * Capa de datos del detalle de lead -- **mock hasta que exista el backend
 * real** (M6/M7, `docs/06-modulos-backend.md`: no hay endpoint de detalle de
 * lead, formularios de calificación, citas ni cierre; tampoco modelos
 * Prisma de `Cita` o de puntuación/semáforo). Misma forma de función que
 * tendrá la integración real, siguiendo el patrón ya autorizado para F3 en
 * `leads.api.ts`. Todo punto de integración pendiente está marcado con el
 * token `INTEGRACION-BACKEND`.
 *
 * Comparte el mismo fixture mutable `LEADS_MOCK` que `leads.api.ts`, para
 * que el listado (F3) y el detalle (F4) queden consistentes dentro de una
 * misma sesión de la app.
 */

function delay(ms = 150): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findLeadOrThrow(leadId: string): Lead {
  const lead = LEADS_MOCK.find((l) => l.id === leadId);
  if (!lead) throw new Error(`No se encontró el lead ${leadId}`);
  return lead;
}

/**
 * INTEGRACION-BACKEND: reemplazar por `httpClient.get<Lead>("/leads/:id")`
 * cuando exista `GET /api/v1/leads/:id` (M6/M7 -- no documentado todavía
 * como esqueleto).
 */
export async function fetchLeadDetalleApi(leadId: string): Promise<Lead> {
  await delay();
  return findLeadOrThrow(leadId);
}

/**
 * INTEGRACION-BACKEND: reemplazar por `httpClient.get<FormularioEtapa>(...)`
 * cuando exista un endpoint de definición de formularios (M7). Hoy la
 * definición es estática (`formulariosEtapa.ts`), así que esto solo envuelve
 * esa función en la forma async que tendrá la integración real.
 */
export async function fetchFormularioEtapaApi(etapa: EtapaCalificable): Promise<FormularioEtapa> {
  await delay(50);
  return getFormularioEtapa(etapa);
}

/**
 * Envía el formulario de la etapa destino y con eso cambia la etapa del lead
 * ("sin formulario no hay transición", docs/02-reglas-negocio.md). Calcula
 * puntuación y semáforo en el mock con la misma fórmula que usaría el
 * backend real -- ver `puntuacion.ts`.
 *
 * INTEGRACION-BACKEND: reemplazar por
 * `httpClient.post<Lead>("/leads/:id/formulario", { etapa, respuestas })`
 * (M7) cuando exista. El cálculo de puntuación/semáforo pasa a ser
 * responsabilidad exclusiva del backend en ese momento -- el frontend solo
 * previsualiza (ver `puntuacion.ts`).
 */
export async function submitFormularioEtapaApi(
  leadId: string,
  etapa: EtapaCalificable,
  respuestas: RespuestasFormulario,
): Promise<Lead> {
  await delay();
  const lead = findLeadOrThrow(leadId);
  const formulario = getFormularioEtapa(etapa);
  const puntuacion = calculatePuntuacion(formulario, respuestas);
  const semaforo = calculateSemaforo(puntuacion);

  lead.etapa = etapa;
  lead.puntuacion = puntuacion;
  lead.semaforo = semaforo;
  return lead;
}

/**
 * Traspaso a vendedor (docs/02 §5). Cuando el asesor traspasa sin elegir
 * vendedor (`vendedorId` ausente), se simula el "algoritmo de menor carga"
 * documentado asignando simplemente el primer vendedor del catálogo -- **es
 * una simplificación del mock**, el algoritmo real de balanceo de carga es
 * responsabilidad de M6/M7 en el backend. Cuando admin/supervisor eligen
 * vendedor manualmente, `vendedorId` viene informado. Reinicia
 * `slaInicioEn` (docs/02 §5, el reloj de SLA arranca de nuevo con cada
 * responsable nuevo).
 *
 * INTEGRACION-BACKEND: reemplazar por
 * `httpClient.post<Lead>("/leads/:id/traspasar", { vendedorId? })` cuando
 * exista (M6/M7).
 */
export async function handoffToVendedorApi(leadId: string, vendedorId?: string): Promise<Lead> {
  await delay();
  const lead = findLeadOrThrow(leadId);
  const vendedores = getCatalogoResponsablesConRol().filter((r) => r.rol === "VENDEDOR");
  const elegido = vendedorId
    ? vendedores.find((v) => v.id === vendedorId)
    : vendedores[0]; // simplificación de "menor carga", ver comentario arriba

  if (!elegido) throw new Error("No hay un vendedor disponible para el traspaso");

  lead.vendedor = elegido;
  lead.slaInicioEn = new Date().toISOString();
  return lead;
}

/**
 * Reasignación (distinta del traspaso, docs/02 §5): cambia el responsable
 * operativo vigente (asesor o vendedor, según el rol de `responsableId` en
 * el catálogo) sin pasar por un formulario de etapa. Reinicia
 * `slaInicioEn`. La validación de **quién puede reasignar** vive en
 * `leadDetalle.guards.ts` -- es un guard de UX, la autorización real es
 * responsabilidad del backend.
 *
 * INTEGRACION-BACKEND: reemplazar por
 * `httpClient.post<Lead>("/leads/:id/reasignar", { responsableId })` cuando
 * exista (M6/M7).
 */
export async function reassignApi(leadId: string, responsableId: string): Promise<Lead> {
  await delay();
  const lead = findLeadOrThrow(leadId);
  const nuevoResponsable = getCatalogoResponsablesConRol().find((r) => r.id === responsableId);
  if (!nuevoResponsable) throw new Error("Responsable no encontrado");

  if (nuevoResponsable.rol === "ASESOR") {
    lead.asesor = nuevoResponsable;
  } else {
    lead.vendedor = nuevoResponsable;
  }
  lead.slaInicioEn = new Date().toISOString();
  return lead;
}

// ---------------------------------------------------------------------------
// Panel de citas
// ---------------------------------------------------------------------------

/** Fixture en memoria de citas, 0-2 ejemplos por lead (F4). */
const CITAS_MOCK: Cita[] = [
  {
    id: "cita-01",
    leadId: "lead-02",
    usuarioId: "asesor-2",
    programadaPara: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    modalidad: "VIRTUAL",
    estado: "AGENDADA",
    notas: "Confirmar disponibilidad de crédito antes de la reunión.",
  },
  {
    id: "cita-02",
    leadId: "lead-09",
    usuarioId: "vendedor-2",
    programadaPara: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    modalidad: "PRESENCIAL",
    estado: "CUMPLIDA",
  },
];

let secuenciaCitas = CITAS_MOCK.length;

/**
 * INTEGRACION-BACKEND: reemplazar por
 * `httpClient.get<Cita[]>("/leads/:id/citas")` cuando exista (M7).
 */
export async function fetchCitasLeadApi(leadId: string): Promise<Cita[]> {
  await delay(100);
  return CITAS_MOCK.filter((c) => c.leadId === leadId);
}

interface ScheduleCitaInput {
  leadId: string;
  usuarioId: string;
  programadaPara: string;
  modalidad: ModalidadCita;
  notas?: string;
}

/**
 * INTEGRACION-BACKEND: reemplazar por
 * `httpClient.post<Cita>("/leads/:id/citas", { ... })` cuando exista (M7).
 * La validación de "no permite fecha pasada" vive en `cita.schemas.ts`
 * (Zod, capa de UI) -- acá se repite como defensa mínima del mock, no como
 * fuente de verdad.
 */
export async function scheduleCitaApi(input: ScheduleCitaInput): Promise<Cita> {
  await delay();
  if (new Date(input.programadaPara).getTime() <= Date.now()) {
    throw new Error("No se puede agendar una cita en una fecha ya pasada");
  }
  secuenciaCitas += 1;
  const cita: Cita = {
    id: `cita-${String(secuenciaCitas).padStart(2, "0")}`,
    leadId: input.leadId,
    usuarioId: input.usuarioId,
    programadaPara: input.programadaPara,
    modalidad: input.modalidad,
    estado: "AGENDADA",
    notas: input.notas,
  };
  CITAS_MOCK.push(cita);
  return cita;
}

/**
 * INTEGRACION-BACKEND: reemplazar por
 * `httpClient.patch<Cita>("/citas/:id/reprogramar", { programadaPara })`
 * cuando exista (M7).
 */
export async function rescheduleCitaApi(citaId: string, programadaPara: string): Promise<Cita> {
  await delay();
  const cita = CITAS_MOCK.find((c) => c.id === citaId);
  if (!cita) throw new Error(`No se encontró la cita ${citaId}`);
  if (new Date(programadaPara).getTime() <= Date.now()) {
    throw new Error("No se puede reprogramar a una fecha ya pasada");
  }
  cita.programadaPara = programadaPara;
  cita.estado = "REPROGRAMADA";
  return cita;
}

/**
 * INTEGRACION-BACKEND: reemplazar por
 * `httpClient.patch<Cita>("/citas/:id/resultado", { estado })` cuando
 * exista (M7).
 */
export async function markCitaResultApi(
  citaId: string,
  estado: Extract<EstadoCita, "CUMPLIDA" | "NO_ASISTIO" | "CANCELADA">,
): Promise<Cita> {
  await delay();
  const cita = CITAS_MOCK.find((c) => c.id === citaId);
  if (!cita) throw new Error(`No se encontró la cita ${citaId}`);
  cita.estado = estado;
  return cita;
}

// ---------------------------------------------------------------------------
// Cierre (Venta / No Venta)
// ---------------------------------------------------------------------------

interface CierreVentaInput {
  fechaCierre: string;
  montoVenta: number;
  productoVendido: string;
  formaPago: FormaPago;
  observaciones?: string;
}

/**
 * Cierre en Venta: semáforo fijo verde, sin recalcular puntuación (docs/02,
 * "VENTA/NO_VENTA no tienen puntuación"). El monto/producto/forma de pago
 * quedan persistidos en el lead para su consulta posterior.
 *
 * INTEGRACION-BACKEND: reemplazar por
 * `httpClient.post<Lead>("/leads/:id/cierre-venta", { ... })` cuando exista
 * (M7).
 */
export async function submitCierreVentaApi(leadId: string, input: CierreVentaInput): Promise<Lead> {
  await delay();
  const lead = findLeadOrThrow(leadId);
  lead.etapa = "VENTA";
  lead.semaforo = "VERDE";
  lead.cerradoEn = new Date(input.fechaCierre).toISOString();
  lead.montoVenta = input.montoVenta;
  lead.productoVendido = input.productoVendido;
  lead.formaPago = input.formaPago;
  lead.observacionCierre = input.observaciones ?? null;
  return lead;
}

interface CierreNoVentaInput {
  fechaCierre: string;
  observacionMotivo: string;
}

/**
 * Cierre en No Venta: semáforo fijo rojo, sin puntuación. La observación del
 * motivo es texto libre obligatorio (mín. 20 caracteres, validado en
 * `cierre.schemas.ts`), sin catálogo -- decisión ya tomada, no una duda
 * abierta de este cambio.
 *
 * INTEGRACION-BACKEND: reemplazar por
 * `httpClient.post<Lead>("/leads/:id/cierre-no-venta", { ... })` cuando
 * exista (M7).
 */
export async function submitCierreNoVentaApi(
  leadId: string,
  input: CierreNoVentaInput,
): Promise<Lead> {
  await delay();
  const lead = findLeadOrThrow(leadId);
  lead.etapa = "NO_VENTA";
  lead.semaforo = "ROJO";
  lead.cerradoEn = new Date(input.fechaCierre).toISOString();
  lead.observacionCierre = input.observacionMotivo;
  return lead;
}

export { getCatalogoVendedores };
