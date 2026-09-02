import type { Cita, EtapaLead, Lead, Prisma, RolUsuario } from "@prisma/client";
import { AppError } from "../lib/app-error.js";
import { CITAS_TRANSACTION_BOUNDS, runInTransaction } from "../lib/prisma.js";
import * as citaRepository from "../repositories/cita.repository.js";
import {
  CONSTRAINT_NO_SOLAPAMIENTO,
  type CitaConDetalle,
  SQLSTATE_EXCLUSION_VIOLATION,
} from "../repositories/cita.repository.js";
import * as leadEventoRepository from "../repositories/lead-evento.repository.js";
import * as leadRepository from "../repositories/lead.repository.js";
import * as usuarioRepository from "../repositories/usuario.repository.js";
import type {
  CrearCitaBody,
  ListCitasQuery,
  MarcarResultadoCitaBody,
  ReprogramarCitaBody,
} from "../schemas/citas.schema.js";
import { aplicarFiltroEmpresa, canEdit, canRead, type UsuarioAcceso } from "./leads.access.js";

// Bloque F (aditivo): mismo alcance máximo que ADMINISTRADOR/SUPERVISOR,
// holding-wide sin atarse a una empresa (ver `metricas.access.ts`/
// `oportunidad.access.ts`, mismo patrón).
const ROLES_ACCESO_TOTAL: readonly RolUsuario[] = [
  "ADMINISTRADOR",
  "SUPERVISOR",
  "SUPERVISOR_HOLDING",
  "SUPER_ADMIN",
];

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
 * Vista de calendario (feature aditiva post-M7): traduce la violación del
 * `EXCLUDE USING gist` de solapamiento (`citas_no_solapamiento_por_asesor`,
 * `migration.sql`) a un `AppError` 409 de dominio — mismo split
 * responsabilidad/HTTP que `VersionConflictError`/`asignacion.service.ts`
 * (el repositorio deja pasar el error crudo de Postgres, el service lo
 * traduce). Ver `cita.repository.ts` para la DEVIATION documentada de por
 * qué esto detecta por texto de `.message` y no por `.code` estructurado.
 *
 * Solo traduce ESTE constraint puntual — cualquier otro error (incluida una
 * violación del `CHECK citas_duracion_minima`, que Zod ya debería haber
 * rechazado antes de llegar acá) se relanza sin tocar, para no enmascarar un
 * fallo real detrás de un 409 engañoso.
 */
function traducirConflictoDeHorario(error: unknown): never {
  if (
    error instanceof Error &&
    error.message.includes(SQLSTATE_EXCLUSION_VIOLATION) &&
    error.message.includes(CONSTRAINT_NO_SOLAPAMIENTO)
  ) {
    throw new AppError(
      "cita_horario_ocupado",
      409,
      "Ese horario ya está ocupado para este asesor",
    );
  }
  throw error;
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

      const cita = await citaRepository
        .createCita(
          {
            leadId,
            empresaId: lead.empresaId,
            usuarioId,
            programadaPara: body.programadaPara,
            finalizaEn: body.finalizaEn,
            modalidad: body.modalidad,
            notas: body.notas,
          },
          tx,
        )
        .catch(traducirConflictoDeHorario);

      await leadEventoRepository.createEvento(
        {
          leadId,
          empresaId: lead.empresaId,
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

/**
 * `GET /api/v1/citas` (vista de calendario, feature aditiva post-M7):
 * autorización por listado (mismo criterio D4/D5 que
 * `conversaciones.service.ts::listConversaciones`) — ASESOR/VENDEDOR quedan
 * SIEMPRE acotados a sí mismos (`filtros.asesorId` de query se IGNORA para
 * ellos, nunca pueden escalar a ver el calendario de otro responsable);
 * Admin/Supervisor/holding-wide ven todo el alcance de empresa resuelto por
 * `aplicarFiltroEmpresa`, con `filtros.asesorId` como acotamiento opcional.
 *
 * DEVIATION documentada (decisión propia, no dada literal en la tarea): el
 * criterio de "es un ASESOR" acá es "no tiene el bypass de acceso total"
 * (`ROLES_ACCESO_TOTAL`, ya definida arriba en este archivo — YA incluye
 * `SUPERVISOR_HOLDING`/`SUPER_ADMIN`, a diferencia de `leads.access.ts` donde
 * esos dos viven en una constante `ROLES_HOLDING_TOTAL` aparte) en vez de
 * comparar literal `usuario.rol === "ASESOR"` — así un VENDEDOR (que agenda
 * sus propias citas de cierre, ver `scheduleCita`) también queda acotado a
 * sí mismo, en vez de caer sin querer en la rama "ve todo el calendario de
 * la empresa" por no ser textualmente "ASESOR".
 */
export async function listCitas(
  usuario: UsuarioAcceso,
  filtros: ListCitasQuery,
): Promise<CitaConDetalle[]> {
  const tieneAccesoTotal = ROLES_ACCESO_TOTAL.includes(usuario.rol);

  const where: Prisma.CitaWhereInput = aplicarFiltroEmpresa({}, usuario, filtros);
  // Solapamiento de intervalos: `[programadaPara, finalizaEn]` de la cita
  // contra `[desde, hasta]` del calendario — así un evento que ya empezó
  // antes de `desde` y todavía no terminó no desaparece del calendario.
  where.programadaPara = { lt: filtros.hasta };
  where.finalizaEn = { gt: filtros.desde };

  if (!tieneAccesoTotal) {
    where.usuarioId = usuario.id;
  } else if (filtros.asesorId) {
    where.usuarioId = filtros.asesorId;
  }

  return citaRepository.findManyConDetalle(where);
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

/**
 * `POST /api/v1/citas/:citaId/reprogramar` (diseño M7, checklist
 * "Reprogramación con registro de evento"). Decisión de diseño explícita
 * (dejada abierta por el diseño del cambio): `estado` vuelve a `AGENDADA`
 * con la nueva `programadaPara` — NUNCA queda en `REPROGRAMADA` — porque el
 * trabajo de recordatorio (`citas-recordatorio.service.ts`) filtra
 * estrictamente `estado = AGENDADA`; dejar la fila en `REPROGRAMADA` la
 * excluiría para siempre del recordatorio de 1h antes de la NUEVA fecha, un
 * defecto funcional. El historial de que hubo una reprogramación (y cuántas)
 * vive en `lead_eventos` (`CITA_REPROGRAMADA`, uno por cada reprogramación),
 * no en el valor persistido de `estado` — mismo patrón que `CAMBIO_SEMAFORO`/
 * `CAMBIO_ETAPA` en `leads.service.ts` (M5): la fila mutable + la bitácora
 * inmutable en la misma transacción. `recordatorioEnviado` se resetea a
 * `false`: la nueva fecha es una ventana de recordatorio distinta.
 */
export async function rescheduleCita(
  usuario: UsuarioAcceso,
  citaId: string,
  body: ReprogramarCitaBody,
  ahora: Date = new Date(),
): Promise<Cita> {
  return runInTransaction(
    undefined,
    async (tx) => {
      const cita = await findCitaOrThrow(citaId, tx);
      const lead = await findLeadOrThrow(cita.leadId, tx);
      if (!canEdit(usuario, lead)) {
        throw new AppError("permiso_denegado", 403, "No tienes permiso para reprogramar esta cita");
      }
      if (cita.estado !== "AGENDADA") {
        throw new AppError(
          "cita_no_reprogramable",
          409,
          `La cita está en estado ${cita.estado} y no puede reprogramarse`,
        );
      }
      assertProgramadaEnFuturo(body.programadaPara, ahora);

      const citaActualizada = await citaRepository
        .updateCita(
          citaId,
          {
            programadaPara: body.programadaPara,
            finalizaEn: body.finalizaEn,
            estado: "AGENDADA",
            recordatorioEnviado: false,
          },
          tx,
        )
        .catch(traducirConflictoDeHorario);

      await leadEventoRepository.createEvento(
        {
          leadId: cita.leadId,
          empresaId: lead.empresaId,
          tipo: "CITA_REPROGRAMADA",
          usuarioId: usuario.id,
          detalle: {
            citaId,
            programadaParaAnterior: cita.programadaPara.toISOString(),
            programadaParaNueva: body.programadaPara.toISOString(),
          } satisfies Prisma.InputJsonValue,
        },
        tx,
      );

      return citaActualizada;
    },
    CITAS_TRANSACTION_BOUNDS,
  );
}

/**
 * `POST /api/v1/citas/:citaId/resultado` (diseño M7, checklist "Estados de
 * cita y su efecto en el formulario de la etapa Cita"). Límite explícito de
 * diseño: esta operación es un registro ASOCIADO — marca el resultado de la
 * REUNIÓN en `citas.estado` (`CUMPLIDA`/`NO_ASISTIO`), pero NUNCA mueve
 * `leads.etapa` ni escribe `respuestas_formulario` por sí sola. El formulario
 * de la etapa CITA (docs/04-formularios-semaforo.md §5, "¿Asistió a la
 * cita?") lo sigue completando el vendedor por su propio flujo ya existente
 * de M5 (`PATCH /leads/:id/etapa` o `POST /leads/:id/formulario`,
 * `formularios.service.ts::applyFormulario`) — este endpoint no lo invoca ni
 * lo duplica, evita una segunda fuente de verdad para la misma pregunta.
 * Tampoco escribe `lead_eventos`: no existe un tipo `TipoEventoLead` propio
 * para el resultado de una cita (solo `CITA_AGENDADA`/`CITA_REPROGRAMADA`
 * están reservados en el enum) — la bitácora de leads no necesita esta
 * granularidad, `citas.estado` ya es su propio registro auditable.
 */
export async function marcarResultadoCita(
  usuario: UsuarioAcceso,
  citaId: string,
  body: MarcarResultadoCitaBody,
): Promise<Cita> {
  const cita = await findCitaOrThrow(citaId);
  const lead = await findLeadOrThrow(cita.leadId);
  if (!canEdit(usuario, lead)) {
    throw new AppError("permiso_denegado", 403, "No tienes permiso para marcar el resultado de esta cita");
  }
  if (cita.estado !== "AGENDADA") {
    throw new AppError(
      "cita_no_editable",
      409,
      `La cita está en estado ${cita.estado} y no admite marcar un resultado`,
    );
  }
  return citaRepository.updateCita(citaId, { estado: body.estado });
}
