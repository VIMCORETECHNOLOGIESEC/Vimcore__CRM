import { Prisma } from "@prisma/client";
import * as leadEventoRepository from "../repositories/lead-evento.repository.js";
import * as leadRepository from "../repositories/lead.repository.js";
import type { DetalleEventoAsignacion } from "./asignacion.service.js";
import { ASIGNACION_TRANSACTION_BOUNDS, runInTransaction } from "../lib/prisma.js";
import * as notificationRepository from "../repositories/notificacion.repository.js";
import { notificationEvents, publishCommittedEvents } from "./committed-events.service.js";
import { slaFilterBoundaries } from "./sla.calculator.js";

export interface ResultadoDeteccion {
  candidatos: number;
  eventosCreados: number;
}

/**
 * D2(i) (diseño M6) — handler PURO de efectos: recibe `ahora`, nunca
 * consulta el reloj real ni conoce `setInterval` (eso vive en
 * `jobs/sla-atrasado.job.ts`, que solo hace el wiring del intervalo y la
 * guarda de re-entrada, §4 de AGENTS.md: "la lógica de negocio vive en
 * services"). Todas las pruebas invocan esta función directo; ninguna
 * espera 15 minutos reales.
 *
 * La consulta inicial obtiene candidatos con la forma de `idx_leads_sla`.
 * Cada candidato se procesa en una transacción independiente: se bloquea y
 * relee el lead, se comprueba `SLA_INCUMPLIDO` en su ventana vigente y se
 * persisten evento y notificaciones de forma atómica. El bloqueo serializa
 * corridas concurrentes; mover `slaInicioEn` abre una nueva ventana sin una
 * columna de reseteo. Los eventos SSE se publican solo después del commit.
 */
export async function detectLeadsAtrasados(
  ahora: Date = new Date(),
): Promise<ResultadoDeteccion> {
  const { fronteraAtrasado } = slaFilterBoundaries(ahora);

  const candidatos = await leadRepository.findAtrasadosAbiertos(fronteraAtrasado);
  if (candidatos.length === 0) return { candidatos: 0, eventosCreados: 0 };

  let eventosCreados = 0;
  for (const candidato of candidatos) {
    const result = await runInTransaction(undefined, async (tx) => {
      const lead = await leadRepository.findByIdForUpdate(candidato.id, tx);
      if (!lead.slaInicioEn || lead.slaInicioEn > fronteraAtrasado || lead.cerradoEn) {
        return { eventoCreado: false, committed: [] };
      }
      const previous = await leadEventoRepository.findSlaIncumplidoVigente(
        lead.id,
        lead.slaInicioEn,
        tx,
      );
      if (previous) return { eventoCreado: false, committed: [] };
      const responsableId = lead.vendedorId ?? lead.asesorId;
      const detalle: DetalleEventoAsignacion = { version: 1, requiereNotificacion: true, motivo: "sla_vencido", responsableId, responsableAnteriorId: null, ejecutadoPorId: null };
      await leadEventoRepository.createEvento({ leadId: lead.id, tipo: "SLA_INCUMPLIDO", usuarioId: null, detalle: detalle as unknown as Prisma.InputJsonValue }, tx);
      const supervisorIds = await notificationRepository.findActiveRecipientIds(["SUPERVISOR"], tx);
      const owner = responsableId
        ? await notificationRepository.findActiveRecipientById(responsableId, tx)
        : null;
      const recipientIds = [...new Set([...supervisorIds, ...(owner ? [owner.id] : [])])];
      const notifications = [];
      for (const usuarioId of recipientIds) notifications.push(await notificationRepository.createNotificacion({ usuarioId, tipo: "LEAD_SIN_ATENDER", titulo: "Lead sin atender", mensaje: "El SLA de atención del lead ha vencido", leadId: lead.id }, tx));
      return { eventoCreado: true, committed: notifications.flatMap(notificationEvents) };
    }, ASIGNACION_TRANSACTION_BOUNDS);
    if (result.eventoCreado) eventosCreados += 1;
    publishCommittedEvents(result.committed);
  }

  return { candidatos: candidatos.length, eventosCreados };
}
