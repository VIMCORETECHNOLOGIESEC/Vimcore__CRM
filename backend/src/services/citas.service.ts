import type { Cita, EtapaLead, Lead, Prisma, RolUsuario } from "@prisma/client";
import { AppError } from "../lib/app-error.js";
import { CITAS_TRANSACTION_BOUNDS, runInTransaction } from "../lib/prisma.js";
import * as citaRepository from "../repositories/cita.repository.js";
import * as leadEventoRepository from "../repositories/lead-evento.repository.js";
import * as leadRepository from "../repositories/lead.repository.js";
import * as usuarioRepository from "../repositories/usuario.repository.js";
import type { CrearCitaBody } from "../schemas/citas.schema.js";
import { canEdit, canRead, type UsuarioAcceso } from "./leads.access.js";

const ROLES_ACCESO_TOTAL: readonly RolUsuario[] = ["ADMINISTRADOR", "SUPERVISOR"];

/**
 * Re-tipada localmente al tipo amplio `EtapaLead`, mismo motivo que
 * `asignacion.service.ts::ETAPAS_CERRADAS` — la fuente de verdad sigue siendo
 * `leadRepository.ETAPAS_CERRADAS` (tupla `as const`), esto solo ensancha el
 * tipo para que `.includes(lead.etapa)` acepte cualquier valor del enum.
 */
const ETAPAS_CERRADAS: readonly EtapaLead[] = leadRepository.ETAPAS_CERRADAS;

async function findLeadOrThrow(leadId: string, tx?: Prisma.TransactionClient): Promise<Lead> {
  const lead = await leadRepository.findById(leadId, tx);
  if (!lead) throw new AppError("lead_no_encontrado", 404, "El lead no existe");
  return lead;
}

async function findCitaOrThrow(citaId: string, tx?: Prisma.TransactionClient): Promise<Cita> {
  const cita = await citaRepository.findById(citaId, tx);
  if (!cita) throw new AppError("cita_no_encontrada", 404, "La cita no existe");
  return cita;
}

/**
 * DD-M7 (diseño): mismo criterio DD12 de `asignacion.service.ts` — un lead ya
 * cerrado (VENTA/NO_VENTA) no admite nuevos compromisos. Se aplica solo al
 * ALTA de una cita, nunca a operaciones sobre una cita ya existente
 * (cancelar/reprogramar/marcar resultado) — esas son limpieza administrativa
 * de un registro que ya existe, no la apertura de un compromiso nuevo.
 */
function assertLeadAbierto(lead: Lead): void {
  if (ETAPAS_CERRADAS.includes(lead.etapa)) {
    throw new AppError(
      "lead_cerrado",
      409,
      "El lead ya está en una etapa terminal, no se pueden agendar citas",
    );
  }
}

/**
 * "No se agenda una cita en el pasado" (checklist M7) — validado aquí, nunca
 * solo en Zod: el reloj de referencia es el del servidor al momento de la
 * escritura. `ahora` es un parámetro explícito (mismo seam de testabilidad
 * que `detectLeadsAtrasados`, M6) para que las pruebas no dependan del reloj
 * real.
 */
function assertProgramadaEnFuturo(programadaPara: Date, ahora: Date): void {
  if (programadaPara.getTime() <= ahora.getTime()) {
    throw new AppError("cita_en_pasado", 422, "No se puede agendar una cita en el pasado");
  }
}

/**
 * D-M7a (diseño): sin algoritmo de selección automática de responsable para
 * citas — fuera del alcance del checklist M7 (distinto de
 * `asignacion.service.ts::selectResponsable`, M6). Por defecto, quien agenda
 * es su propio responsable. Admin/Supervisor pueden asignarla a otro usuario
 * explícito (mismo patrón DD10 de M6: solo esos roles pueden indicar un
 * destinatario distinto de sí mismos).
 */
async function resolveResponsable(
  usuario: UsuarioAcceso,
  usuarioIdBody: string | undefined,
): Promise<string> {
  if (usuarioIdBody === undefined || usuarioIdBody === usuario.id) return usuario.id;

  if (!ROLES_ACCESO_TOTAL.includes(usuario.rol)) {
    throw new AppError(
      "permiso_denegado",
      403,
      "Solo Administrador o Supervisor pueden agendar una cita a nombre de otro usuario",
    );
  }

  const responsable = await usuarioRepository.findById(usuarioIdBody);
  if (!responsable) {
    throw new AppError("usuario_no_encontrado", 404, "El usuario responsable indicado no existe");
  }
  return responsable.id;
}

/**
 * `POST /api/v1/leads/:id/citas` (diseño M7). Autorización por recurso —
 * `canEdit` de `leads.access.ts`, reutilizada sin duplicar la regla (D4/M5):
 * el responsable operativo actual del lead (asesor antes del traspaso,
 * vendedor después) o Admin/Supervisor. Transacción única: crear la fila
 * `citas` + escribir `lead_eventos` tipo `CITA_AGENDADA` (AGENTS.md §4).
 */
export async function scheduleCita(
  usuario: UsuarioAcceso,
  leadId: string,
  body: CrearCitaBody,
  ahora: Date = new Date(),
): Promise<Cita> {
  return runInTransaction(
    undefined,
    async (tx) => {
      const lead = await findLeadOrThrow(leadId, tx);
      if (!canEdit(usuario, lead)) {
        throw new AppError("permiso_denegado", 403, "No tienes permiso para agendar citas en este lead");
      }
      assertLeadAbierto(lead);
      assertProgramadaEnFuturo(body.programadaPara, ahora);

      const usuarioId = await resolveResponsable(usuario, body.usuarioId);

      const cita = await citaRepository.createCita(
        {
          leadId,
          usuarioId,
          programadaPara: body.programadaPara,
          modalidad: body.modalidad,
          notas: body.notas,
        },
        tx,
      );

      await leadEventoRepository.createEvento(
        {
          leadId,
          tipo: "CITA_AGENDADA",
          usuarioId: usuario.id,
          detalle: {
            citaId: cita.id,
            programadaPara: cita.programadaPara.toISOString(),
            modalidad: cita.modalidad,
            usuarioResponsableId: usuarioId,
          } satisfies Prisma.InputJsonValue,
        },
        tx,
      );

      return cita;
    },
    CITAS_TRANSACTION_BOUNDS,
  );
}

/** `GET /api/v1/leads/:id/citas` — mismo control de lectura que `findLeadById` (D4, M5). */
export async function listCitasByLead(usuario: UsuarioAcceso, leadId: string): Promise<Cita[]> {
  const lead = await findLeadOrThrow(leadId);
  if (!canRead(usuario, lead)) {
    throw new AppError("permiso_denegado", 403, "No tienes acceso a las citas de este lead");
  }
  return citaRepository.findByLead(leadId);
}

/** `GET /api/v1/citas/:citaId` — resuelve el lead dueño de la cita para aplicar `canRead`. */
export async function getCitaById(usuario: UsuarioAcceso, citaId: string): Promise<Cita> {
  const cita = await findCitaOrThrow(citaId);
  const lead = await findLeadOrThrow(cita.leadId);
  if (!canRead(usuario, lead)) {
    throw new AppError("permiso_denegado", 403, "No tienes acceso a esta cita");
  }
  return cita;
}

/**
 * `POST /api/v1/citas/:citaId/cancelar` (diseño M7). Guarda de máquina de
 * estados: solo una cita `AGENDADA` puede cancelarse — una cita ya cerrada
 * (`CUMPLIDA`/`NO_ASISTIO`/`CANCELADA`) es un estado terminal, cancelarla de
 * nuevo no tiene efecto de negocio y se rechaza explícito en vez de ser un
 * no-op silencioso.
 */
export async function cancelCita(usuario: UsuarioAcceso, citaId: string): Promise<Cita> {
  const cita = await findCitaOrThrow(citaId);
  const lead = await findLeadOrThrow(cita.leadId);
  if (!canEdit(usuario, lead)) {
    throw new AppError("permiso_denegado", 403, "No tienes permiso para modificar esta cita");
  }
  if (cita.estado !== "AGENDADA") {
    throw new AppError(
      "cita_no_cancelable",
      409,
      `La cita ya está en estado ${cita.estado} y no puede cancelarse`,
    );
  }
  return citaRepository.updateCita(citaId, { estado: "CANCELADA" });
}
